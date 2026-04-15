import { Injectable } from '@angular/core';
import { 
  SupabaseService, 
  DbEnvironmentOrder,
  DbEnvironmentParticipant 
} from './supabase.service';

export interface OrderExecutionResult {
  success: boolean;
  order?: DbEnvironmentOrder;
  message: string;
  tradesExecuted?: number;
}

@Injectable({
  providedIn: 'root'
})
export class OrderExecutionService {

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Place and execute an order with full validation and matching
   */
  async placeAndExecuteOrder(
    environmentId: string,
    participantId: string,
    stockId: string,
    type: 'buy' | 'sell',
    price: number,
    units: number
  ): Promise<OrderExecutionResult> {
    try {
      // Get participant data
      const participant = await this.supabaseService.getParticipantById(participantId);
      if (!participant) {
        return { success: false, message: 'Participant not found' };
      }

      // Validate order
      const validation = await this.validateOrder(
        participant,
        stockId,
        type,
        price,
        units
      );

      if (!validation.valid) {
        return { success: false, message: validation.message || 'Invalid order' };
      }

      // Place the order
      const newOrder = await this.supabaseService.placeEnvironmentOrder({
        market_id: environmentId,
        stock_id: stockId,
        participant_id: participantId,
        type: type,
        price: price,
        units: units,
        filled_units: 0,
        status: 'open',
      });

      if (!newOrder) {
        return { success: false, message: 'Failed to create order in database' };
      }

      // Reserve cash for buy orders
      if (type === 'buy') {
        const totalCost = price * units;
        const newAvailableCash = participant.available_cash - totalCost;
        await this.supabaseService.updateParticipantCash(
          participantId,
          participant.cash,
          participant.settled_cash,
          newAvailableCash
        );
      }

      // Match the order
      const tradesExecuted = await this.matchOrder(newOrder);

      return {
        success: true,
        order: newOrder,
        message: `Order placed successfully. ${tradesExecuted} trade(s) executed.`,
        tradesExecuted
      };

    } catch (error: any) {
      console.error('Error in placeAndExecuteOrder:', error);
      return {
        success: false,
        message: error.message || 'An error occurred while placing the order'
      };
    }
  }

  /**
   * Validate an order before placement
   */
  private async validateOrder(
    participant: DbEnvironmentParticipant,
    stockId: string,
    type: 'buy' | 'sell',
    price: number,
    units: number
  ): Promise<{ valid: boolean; message?: string }> {
    // Basic validation
    if (units <= 0) {
      return { valid: false, message: 'Units must be greater than 0' };
    }

    if (price <= 0) {
      return { valid: false, message: 'Price must be greater than 0' };
    }

    // Get environment to check if paused
    const environment = await this.supabaseService.getTradingEnvironment(participant.market_id);
    if (!environment) {
      return { valid: false, message: 'Environment not found' };
    }

    if (environment.is_paused) {
      return { valid: false, message: 'Trading is currently paused' };
    }

    if (type === 'buy') {
      // Check if participant has enough cash
      const totalCost = price * units;
      if (totalCost > participant.available_cash) {
        return { 
          valid: false, 
          message: `Insufficient funds. Need $${totalCost.toFixed(2)}, have $${participant.available_cash.toFixed(2)}` 
        };
      }
    } else {
      // For sell orders, check position
      const positions = await this.supabaseService.getParticipantPositions(
        participant.market_id,
        participant.id
      );

      const position = positions.find(p => p.stock_id === stockId);
      const currentUnits = position?.units || 0;

      // Get open sell orders to calculate available units
      const openOrders = await this.supabaseService.getParticipantOrders(participant.id, stockId);
      const openSellUnits = openOrders
        .filter(o => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .reduce((sum, o) => sum + (o.units - o.filled_units), 0);

      const availableToSell = currentUnits - openSellUnits;

      if (units > availableToSell) {
        const shortAmount = units - availableToSell;

        // Check if shorting is allowed
        const stock = await this.supabaseService.getEnvironmentStock(stockId);
        const stockAllowsShorting = stock?.allow_shorting ?? environment.allow_shorting;
        
        if (!stockAllowsShorting) {
          return { 
            valid: false, 
            message: `Insufficient units to sell. Have ${currentUnits}, trying to sell ${units}. Shorting not allowed.` 
          };
        }

        // Check max short limit
        const maxShort = stock?.max_short_units ?? environment.max_short_units ?? 0;
        const currentShort = Math.abs(Math.min(0, availableToSell));
        
        if (currentShort + shortAmount > maxShort) {
          return { 
            valid: false, 
            message: `Cannot short more than ${maxShort} units. Current short: ${currentShort}` 
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Match an order against the order book
   */
  private async matchOrder(incomingOrder: DbEnvironmentOrder): Promise<number> {
    let tradesExecuted = 0;

    // Reload orders to get the latest state
    const openOrders = await this.supabaseService.getEnvironmentOpenOrders(
      incomingOrder.market_id,
      incomingOrder.stock_id
    );

    if (incomingOrder.type === 'buy') {
      // Match with sell orders at or below the buy price
      const matchingAsks = openOrders
        .filter(
          (o) =>
            o.type === 'sell' &&
            (o.status === 'open' || o.status === 'partial') &&
            Number(o.price) <= Number(incomingOrder.price) &&
            o.participant_id !== incomingOrder.participant_id &&
            o.id !== incomingOrder.id
        )
        .sort(
          (a, b) =>
            Number(a.price) - Number(b.price) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      for (const ask of matchingAsks) {
        // Reload incoming order to get fresh filled_units
        const freshIncoming = await this.supabaseService.getEnvironmentOrderById(incomingOrder.id);
        if (!freshIncoming) break;
        
        const incomingRemaining = freshIncoming.units - freshIncoming.filled_units;
        if (incomingRemaining <= 0) break;
        
        const executed = await this.executeTrade(freshIncoming, ask);
        if (executed) tradesExecuted++;
      }
    } else {
      // Match with buy orders at or above the sell price
      const matchingBids = openOrders
        .filter(
          (o) =>
            o.type === 'buy' &&
            (o.status === 'open' || o.status === 'partial') &&
            Number(o.price) >= Number(incomingOrder.price) &&
            o.participant_id !== incomingOrder.participant_id &&
            o.id !== incomingOrder.id
        )
        .sort(
          (a, b) =>
            Number(b.price) - Number(a.price) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      for (const bid of matchingBids) {
        // Reload incoming order to get fresh filled_units
        const freshIncoming = await this.supabaseService.getEnvironmentOrderById(incomingOrder.id);
        if (!freshIncoming) break;
        
        const incomingRemaining = freshIncoming.units - freshIncoming.filled_units;
        if (incomingRemaining <= 0) break;
        
        const executed = await this.executeTrade(bid, freshIncoming);
        if (executed) tradesExecuted++;
      }
    }

    return tradesExecuted;
  }

  /**
   * Execute a trade between a buy and sell order
   */
  private async executeTrade(
    buyOrder: DbEnvironmentOrder,
    sellOrder: DbEnvironmentOrder
  ): Promise<boolean> {
    // CRITICAL: Reload orders from DB to get fresh filled_units state
    // This prevents duplicate trades when matching multiple orders
    const freshBuyOrder = await this.supabaseService.getEnvironmentOrderById(buyOrder.id);
    const freshSellOrder = await this.supabaseService.getEnvironmentOrderById(sellOrder.id);
    
    if (!freshBuyOrder || !freshSellOrder) {
      console.error('Could not reload orders for trade execution');
      return false;
    }
    
    // Check if either order is already filled
    if (freshBuyOrder.status === 'filled' || freshSellOrder.status === 'filled') {
      return false;
    }
    
    const buyRemaining = freshBuyOrder.units - freshBuyOrder.filled_units;
    const sellRemaining = freshSellOrder.units - freshSellOrder.filled_units;

    // Safety check: ensure seller still has available units (prevents over-selling loops)
    const sellerPositions = await this.supabaseService.getParticipantPositions(
      freshSellOrder.market_id,
      freshSellOrder.participant_id
    );
    const sellerPosition = sellerPositions.find(p => p.stock_id === freshSellOrder.stock_id);
    const sellerUnits = sellerPosition?.units || 0;
    const sellerOpenOrders = await this.supabaseService.getParticipantOrders(
      freshSellOrder.participant_id,
      freshSellOrder.stock_id
    );
    const otherOpenSellUnits = sellerOpenOrders
      .filter(o => o.id !== freshSellOrder.id && o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
      .reduce((sum, o) => sum + (o.units - o.filled_units), 0);
    const sellerAvailableForThisOrder = Math.max(0, sellerUnits - otherOpenSellUnits);

    // Cap trade units by what the seller can actually deliver
    const tradeUnits = Math.min(buyRemaining, sellRemaining, sellerAvailableForThisOrder);
    const tradePrice = Number(freshSellOrder.price);

    if (tradeUnits <= 0) return false;

    try {
      // Record the trade
      await this.supabaseService.recordEnvironmentTrade({
        market_id: freshBuyOrder.market_id,
        stock_id: freshBuyOrder.stock_id,
        buy_order_id: freshBuyOrder.id,
        sell_order_id: freshSellOrder.id,
        buyer_participant_id: freshBuyOrder.participant_id,
        seller_participant_id: freshSellOrder.participant_id,
        price: tradePrice,
        units: tradeUnits,
      });

      // Update buy order
      const newBuyFilled = freshBuyOrder.filled_units + tradeUnits;
      const buyStatus = newBuyFilled >= freshBuyOrder.units ? 'filled' : 'partial';
      await this.supabaseService.updateEnvironmentOrder(freshBuyOrder.id, {
        filled_units: newBuyFilled,
        status: buyStatus,
      });

      // Update sell order
      const newSellFilled = freshSellOrder.filled_units + tradeUnits;
      const sellStatus = newSellFilled >= freshSellOrder.units ? 'filled' : 'partial';
      await this.supabaseService.updateEnvironmentOrder(freshSellOrder.id, {
        filled_units: newSellFilled,
        status: sellStatus,
      });

      // Update buyer position and cash
      await this.updateParticipantAfterTrade(
        freshBuyOrder.participant_id,
        freshBuyOrder.stock_id,
        freshBuyOrder.market_id,
        'buy',
        tradePrice,
        tradeUnits,
        Number(freshBuyOrder.price),
        buyStatus
      );

      // Update seller position and cash
      await this.updateParticipantAfterTrade(
        freshSellOrder.participant_id,
        freshSellOrder.stock_id,
        freshSellOrder.market_id,
        'sell',
        tradePrice,
        tradeUnits,
        Number(freshSellOrder.price),
        sellStatus
      );

      return true;
    } catch (error) {
      console.error('Error executing trade:', error);
      return false;
    }
  }

  /**
   * Update participant cash and position after a trade
   */
  private async updateParticipantAfterTrade(
    participantId: string,
    stockId: string,
    environmentId: string,
    side: 'buy' | 'sell',
    tradePrice: number,
    tradeUnits: number,
    orderPrice: number,
    orderStatus: string
  ): Promise<void> {
    const participant = await this.supabaseService.getParticipantById(participantId);
    if (!participant) return;

    const positions = await this.supabaseService.getParticipantPositions(environmentId, participantId);
    const position = positions.find(p => p.stock_id === stockId);

    if (side === 'buy') {
      // Buyer: deduct cost, add to position
      const cost = tradePrice * tradeUnits;
      const newSettledCash = participant.settled_cash - cost;
      
      // Refund excess reserved cash
      const priceDifference = (orderPrice - tradePrice) * tradeUnits;
      let newAvailableCash = participant.available_cash;
      if (orderStatus === 'filled') {
        newAvailableCash += priceDifference;
      }

      await this.supabaseService.updateParticipantCash(
        participantId,
        participant.cash,
        newSettledCash,
        newAvailableCash
      );

      // Update position
      if (position) {
        const prevUnits = position.units;
        const newUnits = prevUnits + tradeUnits;
        let newAvgPrice = Number(position.avg_price);
        
        if (newUnits > 0) {
          newAvgPrice = (newAvgPrice * prevUnits + cost) / newUnits;
        }

        await this.supabaseService.updateEnvironmentPosition(
          position.id,
          newUnits,
          newAvgPrice
        );
      }
    } else {
      // Seller: add revenue, deduct from position
      const revenue = tradePrice * tradeUnits;
      const newSettledCash = participant.settled_cash + revenue;
      const newAvailableCash = participant.available_cash + revenue;

      await this.supabaseService.updateParticipantCash(
        participantId,
        participant.cash,
        newSettledCash,
        newAvailableCash
      );

      // Update position
      if (position) {
        const newUnits = position.units - tradeUnits;
        await this.supabaseService.updateEnvironmentPosition(
          position.id,
          newUnits,
          Number(position.avg_price)
        );
      }
    }
  }
}
