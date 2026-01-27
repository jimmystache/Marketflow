import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService, DbOrder, DbTrade, DbTrader, DbMarket, DbPosition } from '../../services/supabase.service';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

interface OrderBookEntry {
  price: number;
  units: number;
  isMine: boolean;
  orderCount: number;
}

interface LocalOrder {
  id: string;
  type: 'buy' | 'sell';
  price: number;
  units: number;
  filled_units: number;
  status: 'open' | 'filled' | 'partial' | 'cancelled';
  created_at: string;
  trader_id: string;
}

@Component({
  selector: 'app-trading',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trading.html',
  styleUrls: ['./trading.css']
})
export class Trading implements OnInit, OnDestroy {
  // Connection state
  isConnected: boolean = false;
  isLoading: boolean = true;
  connectionError: string | null = null;

  // Market state
  symbol: string = 'MKT';
  marketId: string = '';
  market: DbMarket | null = null;
  isRunning: boolean = true;
  isPaused: boolean = false;

  // User state
  traderId: string = '';
  traderUsername: string = '';
  trader: DbTrader | null = null;
  cash: number = 10000.00;
  settledCash: number = 10000.00;
  availableCash: number = 10000.00;

  // Position
  position: DbPosition | null = null;
  positionUnits: number = 0;
  positionAvgPrice: number = 0;

  // Order form
  orderType: 'buy' | 'sell' = 'buy';
  orderUnits: number = 1;
  orderPrice: number = 0;
  maxUnits: number = 100;
  maxPrice: number = 1000;
  isPlacingOrder: boolean = false;

  // Order book
  bids: OrderBookEntry[] = [];
  asks: OrderBookEntry[] = [];

  // Trade history
  trades: DbTrade[] = [];

  // My orders
  myOrders: LocalOrder[] = [];

  // All orders (from database)
  allOrders: DbOrder[] = [];

  // Spread info
  bestBid: number | null = null;
  bestAsk: number | null = null;
  spread: number | null = null;
  lastPrice: number | null = null;

  // UI state
  activeTab: 'orderbook' | 'history' | 'myorders' | 'graph' = 'orderbook';

  // Chart
  priceChart: Chart | null = null;

  // Username input for login
  usernameInput: string = '';
  isLoggingIn: boolean = false;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    // Check if we have a stored username
    const storedUsername = localStorage.getItem('trading_username');
    if (storedUsername) {
      await this.loginAsTrader(storedUsername);
    } else {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.supabaseService.unsubscribeAll();
  }

  /**
   * Login as a trader
   */
  async loginAsTrader(username: string): Promise<void> {
    if (!username.trim()) {
      this.connectionError = 'Please enter a username';
      return;
    }

    this.isLoggingIn = true;
    this.connectionError = null;

    try {
      // Get or create the market
      this.market = await this.supabaseService.getOrCreateMarket('MKT', 'Demo Market');
      if (!this.market) {
        throw new Error('Failed to connect to market');
      }
      this.marketId = this.market.id;
      this.symbol = this.market.symbol;

      // Get or create the trader
      this.trader = await this.supabaseService.getOrCreateTrader(username.trim());
      if (!this.trader) {
        throw new Error('Failed to create trader account');
      }

      this.traderId = this.trader.id;
      this.traderUsername = this.trader.username;
      this.cash = Number(this.trader.cash);
      this.settledCash = Number(this.trader.settled_cash);
      this.availableCash = Number(this.trader.available_cash);

      // Store username for next time
      localStorage.setItem('trading_username', username.trim());

      // Get or create position
      this.position = await this.supabaseService.getOrCreatePosition(this.traderId, this.marketId);
      if (this.position) {
        this.positionUnits = this.position.units;
        this.positionAvgPrice = Number(this.position.avg_price);
      }

      // Subscribe to real-time updates
      this.subscribeToUpdates();

      this.isConnected = true;
      this.isLoading = false;
      this.isLoggingIn = false;

    } catch (error: any) {
      console.error('Login error:', error);
      this.connectionError = error.message || 'Failed to connect to trading server';
      this.isLoggingIn = false;
      this.isLoading = false;
    }
  }

  /**
   * Logout
   */
  logout(): void {
    localStorage.removeItem('trading_username');
    this.supabaseService.unsubscribeAll();
    this.isConnected = false;
    this.trader = null;
    this.traderId = '';
    this.traderUsername = '';
    this.usernameInput = '';
  }

  /**
   * Subscribe to real-time updates
   */
  private subscribeToUpdates(): void {
    // Subscribe to orders
    this.supabaseService.subscribeToOrders(this.marketId, (orders) => {
      this.allOrders = orders;
      this.updateOrderBook();
      this.updateMyOrders();
    });

    // Subscribe to trades
    this.supabaseService.subscribeToTrades(this.marketId, (trades) => {
      this.trades = trades;
      if (trades.length > 0) {
        this.lastPrice = Number(trades[0].price);
      }
      if (this.activeTab === 'graph') {
        this.makePriceChart();
      }
    });

    // Subscribe to trader updates
    this.supabaseService.subscribeToTrader(this.traderId, (trader) => {
      if (trader) {
        this.trader = trader;
        this.cash = Number(trader.cash);
        this.settledCash = Number(trader.settled_cash);
        this.availableCash = Number(trader.available_cash);
      }
    });
  }

  /**
   * Update my orders from all orders
   */
  private updateMyOrders(): void {
    this.supabaseService.getTraderOrders(this.traderId, this.marketId).then(orders => {
      this.myOrders = orders.map(o => ({
        id: o.id,
        type: o.type,
        price: Number(o.price),
        units: o.units,
        filled_units: o.filled_units,
        status: o.status,
        created_at: o.created_at,
        trader_id: o.trader_id
      }));
    });
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
  async placeOrder(): Promise<void> {
    if (this.orderUnits <= 0 || this.orderPrice <= 0) {
      return;
    }

    if (this.isPlacingOrder) {
      return;
    }

    // Validate order
    if (this.orderType === 'buy') {
      const totalCost = this.orderPrice * this.orderUnits;
      if (totalCost > this.availableCash) {
        alert('Insufficient funds for this order');
        return;
      }
    } else {
      // For sell orders, check if we have enough units
      const openSellUnits = this.myOrders
        .filter(o => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .reduce((sum, o) => sum + (o.units - o.filled_units), 0);

      if (this.orderUnits > (this.positionUnits - openSellUnits)) {
        alert('Insufficient units to sell');
        return;
      }
    }

    this.isPlacingOrder = true;

    try {
      // Place the order in the database
      const newOrder = await this.supabaseService.placeOrder({
        market_id: this.marketId,
        trader_id: this.traderId,
        type: this.orderType,
        price: this.orderPrice,
        units: this.orderUnits,
        filled_units: 0,
        status: 'open'
      });

      if (!newOrder) {
        throw new Error('Failed to place order');
      }

      // Reserve cash for buy orders
      if (this.orderType === 'buy') {
        const totalCost = this.orderPrice * this.orderUnits;
        this.availableCash -= totalCost;
        await this.supabaseService.updateTraderCash(
          this.traderId,
          this.cash,
          this.settledCash,
          this.availableCash
        );
      }

      // Try to match the order
      await this.matchOrder(newOrder);

      // Reset form
      this.orderUnits = 1;
      this.orderPrice = 0;

    } catch (error: any) {
      console.error('Error placing order:', error);
      alert('Failed to place order: ' + error.message);
    } finally {
      this.isPlacingOrder = false;
    }
  }

  /**
   * Match an order against the order book
   */
  private async matchOrder(incomingOrder: DbOrder): Promise<void> {
    // Reload orders to get the latest state
    const openOrders = await this.supabaseService.getOpenOrders(this.marketId);

    if (incomingOrder.type === 'buy') {
      // Match with sell orders at or below the buy price
      const matchingAsks = openOrders
        .filter(o => 
          o.type === 'sell' && 
          (o.status === 'open' || o.status === 'partial') && 
          Number(o.price) <= Number(incomingOrder.price) && 
          o.trader_id !== incomingOrder.trader_id &&
          o.id !== incomingOrder.id
        )
        .sort((a, b) => Number(a.price) - Number(b.price) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (const ask of matchingAsks) {
        const incomingRemaining = incomingOrder.units - incomingOrder.filled_units;
        if (incomingRemaining <= 0) break;
        await this.executeTrade(incomingOrder, ask);
      }
    } else {
      // Match with buy orders at or above the sell price
      const matchingBids = openOrders
        .filter(o => 
          o.type === 'buy' && 
          (o.status === 'open' || o.status === 'partial') && 
          Number(o.price) >= Number(incomingOrder.price) && 
          o.trader_id !== incomingOrder.trader_id &&
          o.id !== incomingOrder.id
        )
        .sort((a, b) => Number(b.price) - Number(a.price) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (const bid of matchingBids) {
        const incomingRemaining = incomingOrder.units - incomingOrder.filled_units;
        if (incomingRemaining <= 0) break;
        await this.executeTrade(bid, incomingOrder);
      }
    }
  }

  /**
   * Execute a trade between a buy and sell order
   */
  private async executeTrade(buyOrder: DbOrder, sellOrder: DbOrder): Promise<void> {
    const buyRemaining = buyOrder.units - buyOrder.filled_units;
    const sellRemaining = sellOrder.units - sellOrder.filled_units;
    const tradeUnits = Math.min(buyRemaining, sellRemaining);
    const tradePrice = Number(sellOrder.price); // Price is typically the passive order's price

    if (tradeUnits <= 0) return;

    // Record the trade
    await this.supabaseService.recordTrade({
      market_id: this.marketId,
      buy_order_id: buyOrder.id,
      sell_order_id: sellOrder.id,
      buyer_id: buyOrder.trader_id,
      seller_id: sellOrder.trader_id,
      price: tradePrice,
      units: tradeUnits
    });

    // Update buy order
    const newBuyFilled = buyOrder.filled_units + tradeUnits;
    const buyStatus = newBuyFilled >= buyOrder.units ? 'filled' : 'partial';
    await this.supabaseService.updateOrder(buyOrder.id, {
      filled_units: newBuyFilled,
      status: buyStatus
    });
    buyOrder.filled_units = newBuyFilled;
    buyOrder.status = buyStatus;

    // Update sell order
    const newSellFilled = sellOrder.filled_units + tradeUnits;
    const sellStatus = newSellFilled >= sellOrder.units ? 'filled' : 'partial';
    await this.supabaseService.updateOrder(sellOrder.id, {
      filled_units: newSellFilled,
      status: sellStatus
    });
    sellOrder.filled_units = newSellFilled;
    sellOrder.status = sellStatus;

    // Update buyer's position and cash
    if (buyOrder.trader_id === this.traderId) {
      const cost = tradePrice * tradeUnits;
      this.settledCash -= cost;
      
      // Update position
      const prevUnits = this.positionUnits;
      this.positionUnits += tradeUnits;
      if (this.positionUnits > 0) {
        this.positionAvgPrice = ((this.positionAvgPrice * prevUnits) + cost) / this.positionUnits;
      }
      
      // Refund excess reserved cash (difference between limit price and execution price)
      const priceDifference = (Number(buyOrder.price) - tradePrice) * tradeUnits;
      if (buyStatus === 'filled') {
        // Full order filled, release any remaining reserved cash
        this.availableCash += priceDifference;
      }
      
      await this.updateTraderAndPosition();
    }

    // Update seller's position and cash
    if (sellOrder.trader_id === this.traderId) {
      const revenue = tradePrice * tradeUnits;
      this.settledCash += revenue;
      this.availableCash += revenue;
      this.positionUnits -= tradeUnits;
      
      await this.updateTraderAndPosition();
    }

    this.lastPrice = tradePrice;
  }

  /**
   * Update trader cash and position in database
   */
  private async updateTraderAndPosition(): Promise<void> {
    await this.supabaseService.updateTraderCash(
      this.traderId,
      this.cash,
      this.settledCash,
      this.availableCash
    );

    if (this.position) {
      await this.supabaseService.updatePosition(
        this.position.id,
        this.positionUnits,
        this.positionAvgPrice
      );
    }
  }

  /**
   * Update the order book display
   */
  private updateOrderBook(): void {
    // Aggregate bids
    const bidMap = new Map<number, { units: number; isMine: boolean; count: number }>();
    this.allOrders
      .filter(o => o.type === 'buy' && (o.status === 'open' || o.status === 'partial'))
      .forEach(o => {
        const remaining = o.units - o.filled_units;
        if (remaining > 0) {
          const price = Number(o.price);
          const existing = bidMap.get(price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.trader_id === this.traderId) existing.isMine = true;
          bidMap.set(price, existing);
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
      .filter(o => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
      .forEach(o => {
        const remaining = o.units - o.filled_units;
        if (remaining > 0) {
          const price = Number(o.price);
          const existing = askMap.get(price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.trader_id === this.traderId) existing.isMine = true;
          askMap.set(price, existing);
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
  async cancelOrder(order: LocalOrder): Promise<void> {
    try {
      await this.supabaseService.cancelOrder(order.id);

      // Refund reserved cash for buy orders
      if (order.type === 'buy') {
        const unfilledUnits = order.units - order.filled_units;
        this.availableCash += order.price * unfilledUnits;
        await this.supabaseService.updateTraderCash(
          this.traderId,
          this.cash,
          this.settledCash,
          this.availableCash
        );
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    }
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
    if (this.activeTab === 'graph' && this.priceChart) {
    this.priceChart.destroy();
    this.priceChart = null;
    }
    this.router.navigate(['/']);
  }

  /**
   * Set active tab
   */
  setActiveTab(tab: 'orderbook' | 'history' | 'myorders' | 'graph'): void {
    this.activeTab = tab;

    if (tab === 'graph') {
      setTimeout(() => this.makePriceChart(), 0);
    }
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

  /**
   * Format time
   */
  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  private makePriceChart(): void {
    const canvas = document.getElementById('priceChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Sort trades by time (oldest → newest)
    const sortedTrades = [...this.trades].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const labels = sortedTrades.map(t =>
      new Date(t.created_at).toLocaleTimeString()
    );

    const prices = sortedTrades.map(t => Number(t.price));

    // Destroy existing chart if it exists
    if (this.priceChart) {
      this.priceChart.destroy();
    }

    this.priceChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: this.symbol,
            data: prices,
            borderColor: 'red',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            tension: 0.25,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Time' }
          },
          y: {
            title: { display: true, text: 'Price' }
          }
        }
      }
    });
  }
}
