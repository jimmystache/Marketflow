import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface Order {
  id: string;
  type: 'buy' | 'sell';
  price: number;
  units: number;
  timestamp: Date;
  status: 'open' | 'filled' | 'partial' | 'cancelled';
  filledUnits: number;
  traderId: string;
}

interface Trade {
  id: string;
  price: number;
  units: number;
  timestamp: Date;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
}

interface OrderBookEntry {
  price: number;
  units: number;
  isMine: boolean;
  orderCount: number;
}

interface Position {
  symbol: string;
  units: number;
  avgPrice: number;
}

@Component({
  selector: 'app-trading',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trading.html',
  styleUrls: ['./trading.css']
})
export class Trading implements OnInit, OnDestroy {
  // Market state
  symbol: string = 'MKT';
  marketId: string = '1001';
  isRunning: boolean = false;
  isPaused: boolean = false;
  
  // User state
  traderId: string = 'TRADER_001';
  cash: number = 10000.00;
  settledCash: number = 10000.00;
  availableCash: number = 10000.00;
  
  // Position
  position: Position = {
    symbol: 'MKT',
    units: 0,
    avgPrice: 0
  };
  
  // Order form
  orderType: 'buy' | 'sell' = 'buy';
  orderUnits: number = 1;
  orderPrice: number = 0;
  maxUnits: number = 100;
  maxPrice: number = 1000;
  
  // Order book
  bids: OrderBookEntry[] = [];
  asks: OrderBookEntry[] = [];
  
  // Trade history
  trades: Trade[] = [];
  
  // My orders
  myOrders: Order[] = [];
  
  // All orders (for matching engine)
  allOrders: Order[] = [];
  
  // Spread info
  bestBid: number | null = null;
  bestAsk: number | null = null;
  spread: number | null = null;
  lastPrice: number | null = null;
  
  // UI state
  activeTab: 'orderbook' | 'history' | 'myorders' = 'orderbook';
  
  private orderIdCounter = 1;
  private tradeIdCounter = 1;
  
  constructor(private router: Router) {}
  
  ngOnInit(): void {
    // Initialize with some sample orders to demonstrate the order book
    this.initializeSampleMarket();
  }
  
  ngOnDestroy(): void {
    // Cleanup if needed
  }
  
  /**
   * Initialize sample market with some orders
   */
  private initializeSampleMarket(): void {
    // Add some sample asks (sell orders) from other traders
    const sampleAsks = [
      { price: 105.00, units: 5 },
      { price: 104.50, units: 3 },
      { price: 104.00, units: 8 },
      { price: 103.50, units: 2 },
      { price: 103.00, units: 10 },
    ];
    
    // Add some sample bids (buy orders) from other traders
    const sampleBids = [
      { price: 99.00, units: 7 },
      { price: 99.50, units: 4 },
      { price: 100.00, units: 6 },
      { price: 100.50, units: 3 },
      { price: 101.00, units: 5 },
    ];
    
    sampleAsks.forEach(ask => {
      this.addOrder({
        id: `BOT_${this.orderIdCounter++}`,
        type: 'sell',
        price: ask.price,
        units: ask.units,
        timestamp: new Date(),
        status: 'open',
        filledUnits: 0,
        traderId: 'BOT_SELLER'
      });
    });
    
    sampleBids.forEach(bid => {
      this.addOrder({
        id: `BOT_${this.orderIdCounter++}`,
        type: 'buy',
        price: bid.price,
        units: bid.units,
        timestamp: new Date(),
        status: 'open',
        filledUnits: 0,
        traderId: 'BOT_BUYER'
      });
    });
    
    this.updateOrderBook();
    this.lastPrice = 102.00;
  }
  
  /**
   * Set order type (buy/sell)
   */
  setOrderType(type: 'buy' | 'sell'): void {
    this.orderType = type;
  }
  
  /**
   * Increment units
   */
  incrementUnits(): void {
    if (this.orderUnits < this.maxUnits) {
      this.orderUnits++;
    }
  }
  
  /**
   * Decrement units
   */
  decrementUnits(): void {
    if (this.orderUnits > 1) {
      this.orderUnits--;
    }
  }
  
  /**
   * Increment price
   */
  incrementPrice(): void {
    this.orderPrice = Math.min(this.maxPrice, +(this.orderPrice + 0.50).toFixed(2));
  }
  
  /**
   * Decrement price
   */
  decrementPrice(): void {
    this.orderPrice = Math.max(0, +(this.orderPrice - 0.50).toFixed(2));
  }
  
  /**
   * Place an order
   */
  placeOrder(): void {
    if (this.orderUnits <= 0 || this.orderPrice <= 0) {
      return;
    }
    
    // Validate order
    if (this.orderType === 'buy') {
      const totalCost = this.orderPrice * this.orderUnits;
      if (totalCost > this.availableCash) {
        alert('Insufficient funds for this order');
        return;
      }
      // Reserve cash for buy order
      this.availableCash -= totalCost;
    } else {
      // For sell orders, check if we have enough units
      const openSellUnits = this.myOrders
        .filter(o => o.type === 'sell' && o.status === 'open')
        .reduce((sum, o) => sum + (o.units - o.filledUnits), 0);
      
      if (this.orderUnits > (this.position.units - openSellUnits)) {
        alert('Insufficient units to sell');
        return;
      }
    }
    
    const newOrder: Order = {
      id: `ORD_${this.orderIdCounter++}`,
      type: this.orderType,
      price: this.orderPrice,
      units: this.orderUnits,
      timestamp: new Date(),
      status: 'open',
      filledUnits: 0,
      traderId: this.traderId
    };
    
    this.addOrder(newOrder);
    this.myOrders.push(newOrder);
    this.matchOrders(newOrder);
    this.updateOrderBook();
    
    // Reset form
    this.orderUnits = 1;
    this.orderPrice = 0;
  }
  
  /**
   * Add order to all orders
   */
  private addOrder(order: Order): void {
    this.allOrders.push(order);
  }
  
  /**
   * Match orders (simple price-time priority matching)
   */
  private matchOrders(incomingOrder: Order): void {
    if (incomingOrder.type === 'buy') {
      // Match with sell orders at or below the buy price
      const matchingAsks = this.allOrders
        .filter(o => o.type === 'sell' && o.status === 'open' && o.price <= incomingOrder.price && o.traderId !== incomingOrder.traderId)
        .sort((a, b) => a.price - b.price || a.timestamp.getTime() - b.timestamp.getTime());
      
      for (const ask of matchingAsks) {
        if (incomingOrder.status === 'filled') break;
        this.executeTrade(incomingOrder, ask);
      }
    } else {
      // Match with buy orders at or above the sell price
      const matchingBids = this.allOrders
        .filter(o => o.type === 'buy' && o.status === 'open' && o.price >= incomingOrder.price && o.traderId !== incomingOrder.traderId)
        .sort((a, b) => b.price - a.price || a.timestamp.getTime() - b.timestamp.getTime());
      
      for (const bid of matchingBids) {
        if (incomingOrder.status === 'filled') break;
        this.executeTrade(bid, incomingOrder);
      }
    }
  }
  
  /**
   * Execute a trade between a buy and sell order
   */
  private executeTrade(buyOrder: Order, sellOrder: Order): void {
    const buyRemaining = buyOrder.units - buyOrder.filledUnits;
    const sellRemaining = sellOrder.units - sellOrder.filledUnits;
    const tradeUnits = Math.min(buyRemaining, sellRemaining);
    const tradePrice = sellOrder.price; // Price is typically the passive order's price
    
    if (tradeUnits <= 0) return;
    
    // Create trade record
    const trade: Trade = {
      id: `TRD_${this.tradeIdCounter++}`,
      price: tradePrice,
      units: tradeUnits,
      timestamp: new Date(),
      buyOrderId: buyOrder.id,
      sellOrderId: sellOrder.id,
      buyerId: buyOrder.traderId,
      sellerId: sellOrder.traderId
    };
    
    this.trades.unshift(trade);
    this.lastPrice = tradePrice;
    
    // Update orders
    buyOrder.filledUnits += tradeUnits;
    sellOrder.filledUnits += tradeUnits;
    
    if (buyOrder.filledUnits >= buyOrder.units) {
      buyOrder.status = 'filled';
    } else {
      buyOrder.status = 'partial';
    }
    
    if (sellOrder.filledUnits >= sellOrder.units) {
      sellOrder.status = 'filled';
    } else {
      sellOrder.status = 'partial';
    }
    
    // Update user's position and cash if involved
    if (buyOrder.traderId === this.traderId) {
      // I bought
      const cost = tradePrice * tradeUnits;
      this.settledCash -= cost;
      this.position.units += tradeUnits;
      if (this.position.units > 0) {
        this.position.avgPrice = ((this.position.avgPrice * (this.position.units - tradeUnits)) + cost) / this.position.units;
      }
      // Refund any excess reserved cash
      const reservedForOrder = buyOrder.price * buyOrder.units;
      const actualCost = buyOrder.price * buyOrder.filledUnits;
      if (buyOrder.status === 'filled') {
        const refund = reservedForOrder - actualCost + (buyOrder.price - tradePrice) * tradeUnits;
        this.availableCash += refund;
      }
    }
    
    if (sellOrder.traderId === this.traderId) {
      // I sold
      const revenue = tradePrice * tradeUnits;
      this.settledCash += revenue;
      this.availableCash += revenue;
      this.position.units -= tradeUnits;
    }
  }
  
  /**
   * Update the order book display
   */
  private updateOrderBook(): void {
    // Aggregate bids
    const bidMap = new Map<number, { units: number; isMine: boolean; count: number }>();
    this.allOrders
      .filter(o => o.type === 'buy' && o.status === 'open')
      .forEach(o => {
        const remaining = o.units - o.filledUnits;
        if (remaining > 0) {
          const existing = bidMap.get(o.price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.traderId === this.traderId) existing.isMine = true;
          bidMap.set(o.price, existing);
        }
      });
    
    this.bids = Array.from(bidMap.entries())
      .map(([price, data]) => ({
        price,
        units: data.units,
        isMine: data.isMine,
        orderCount: data.count
      }))
      .sort((a, b) => b.price - a.price);
    
    // Aggregate asks
    const askMap = new Map<number, { units: number; isMine: boolean; count: number }>();
    this.allOrders
      .filter(o => o.type === 'sell' && o.status === 'open')
      .forEach(o => {
        const remaining = o.units - o.filledUnits;
        if (remaining > 0) {
          const existing = askMap.get(o.price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.traderId === this.traderId) existing.isMine = true;
          askMap.set(o.price, existing);
        }
      });
    
    this.asks = Array.from(askMap.entries())
      .map(([price, data]) => ({
        price,
        units: data.units,
        isMine: data.isMine,
        orderCount: data.count
      }))
      .sort((a, b) => a.price - b.price);
    
    // Update spread info
    this.bestBid = this.bids.length > 0 ? this.bids[0].price : null;
    this.bestAsk = this.asks.length > 0 ? this.asks[0].price : null;
    
    if (this.bestBid !== null && this.bestAsk !== null) {
      this.spread = +(this.bestAsk - this.bestBid).toFixed(2);
    } else {
      this.spread = null;
    }
  }
  
  /**
   * Cancel an order
   */
  cancelOrder(order: Order): void {
    order.status = 'cancelled';
    
    // Refund reserved cash for buy orders
    if (order.type === 'buy') {
      const unfilledUnits = order.units - order.filledUnits;
      this.availableCash += order.price * unfilledUnits;
    }
    
    this.updateOrderBook();
  }
  
  /**
   * Start the market
   */
  startMarket(): void {
    this.isRunning = true;
    this.isPaused = false;
  }
  
  /**
   * Pause the market
   */
  pauseMarket(): void {
    this.isPaused = true;
  }
  
  /**
   * Stop the market
   */
  stopMarket(): void {
    this.isRunning = false;
    this.isPaused = false;
  }
  
  /**
   * Navigate back
   */
  goBack(): void {
    this.router.navigate(['/']);
  }
  
  /**
   * Set active tab
   */
  setActiveTab(tab: 'orderbook' | 'history' | 'myorders'): void {
    this.activeTab = tab;
  }
  
  /**
   * Format currency
   */
  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }
  
  /**
   * Get open orders count
   */
  getOpenOrdersCount(): number {
    return this.myOrders.filter(o => o.status === 'open' || o.status === 'partial').length;
  }
  
  /**
   * Click on order book price to set order price
   */
  setOrderPriceFromBook(price: number): void {
    this.orderPrice = price;
  }
}
