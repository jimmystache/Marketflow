import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SupabaseService,
  DbOrder,
  DbTrade,
  DbTrader,
  DbMarket,
  DbPosition,
  DbTradingEnvironment,
  DbEnvironmentSearchResult,
  DbEnvironmentStock,
  DbEnvironmentParticipant,
  DbEnvironmentPosition,
  DbEnvironmentOrder,
  DbEnvironmentTrade,
  CreateEnvironmentInput,
  CreateStockInput,
} from '../../services/supabase.service';
import { Chart, registerables } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart as ChartJS,
  ChartConfiguration,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
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

// Stock input for environment creation form
interface StockFormInput {
  symbol: string;
  name: string;
  description: string;
  startingPrice: number;
  minPriceChange: number;
  allowShorting: boolean | null;
  maxShortUnits: number | null;
}

// UI View state
type ViewState =
  | 'login'
  | 'environment-select'
  | 'create-environment'
  | 'join-environment'
  | 'trading';

@Component({
  selector: 'app-trading',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './trading.html',
  styleUrls: ['./trading.css'],
})
export class Trading implements OnInit, OnDestroy {
  // View state
  currentView: ViewState = 'login';

  // Connection state
  isConnected: boolean = false;
  isLoading: boolean = true;
  connectionError: string | null = null;

  // Market state (legacy - kept for compatibility)
  symbol: string = 'MKT';
  marketId: string = '';
  market: DbMarket | null = null;
  isRunning: boolean = true;
  isPaused: boolean = false;

  // ==================== ENVIRONMENT STATE ====================

  // Current environment
  currentEnvironment: DbTradingEnvironment | null = null;
  environmentId: string = '';

  // Environment stocks
  environmentStocks: DbEnvironmentStock[] = [];
  selectedStock: DbEnvironmentStock | null = null;
  selectedStockId: string = '';

  // Participant state
  participant: DbEnvironmentParticipant | null = null;
  participantId: string = '';
  isAdmin: boolean = false;

  // Positions in current environment
  environmentPositions: DbEnvironmentPosition[] = [];

  // Environment orders and trades
  environmentOrders: DbEnvironmentOrder[] = [];
  environmentTrades: DbEnvironmentTrade[] = [];
  myEnvironmentOrders: DbEnvironmentOrder[] = [];

  // Environment lists for selection
  publicEnvironments: DbTradingEnvironment[] = [];
  myEnvironments: DbTradingEnvironment[] = [];

  // Join environment form
  joinEnvironmentId: string = '';
  joinPassword: string = '';
  selectedEnvironmentToJoin: DbEnvironmentSearchResult | null = null;

  // Environment search
  environmentSearchTerm: string = '';
  searchResults: DbEnvironmentSearchResult[] = [];
  isSearching: boolean = false;

  // Create environment form
  newEnvironment: CreateEnvironmentInput = {
    name: '',
    description: '',
    is_private: false,
    password: '',
    starting_cash: 10000,
    starting_shares: 100,
    min_price_change: 0.01,
    allow_shorting: false,
    max_short_units: 0,
  };

  // Stock creation form
  newStocks: StockFormInput[] = [
    {
      symbol: '',
      name: '',
      description: '',
      startingPrice: 100,
      minPriceChange: 0.01,
      allowShorting: null,
      maxShortUnits: null,
    },
  ];

  // Import settings
  importFromEnvironmentId: string = '';
  availableImportEnvironments: DbTradingEnvironment[] = [];

  // User state
  traderId: string = '';
  traderUsername: string = '';
  trader: DbTrader | null = null;
  cash: number = 10000.0;
  settledCash: number = 10000.0;
  availableCash: number = 10000.0;

  // Position (for current selected stock)
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

  isResettingOrderBook: boolean = false;

  // Order book
  bids: OrderBookEntry[] = [];
  asks: OrderBookEntry[] = [];

  // Trade history
  trades: DbTrade[] = [];

  // Price line chart (built from trades)
  priceChartData: ChartConfiguration<'line'>['data'] = {
    datasets: [
      {
        label: 'Price',
        data: [],
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.15)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
      },
    ],
  };

  priceChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        intersect: false,
        mode: 'index',
        callbacks: {
          title: (items) => {
            const first = items?.[0];
            const idx = Number((first as any)?.parsed?.x);
            const ts = this.tradePointTimes[idx];
            if (!Number.isFinite(idx)) return 'Trade';
            if (Number.isFinite(ts)) return `Trade #${idx + 1} • ${new Date(ts).toLocaleString()}`;
            return `Trade #${idx + 1}`;
          },
        },
      },
    },
    scales: {
      x: {
        // Use sequential x-axis so multi-day gaps don't compress labels.
        type: 'linear',
        ticks: {
          autoSkip: true,
          maxTicksLimit: 6,
          autoSkipPadding: 16,
          maxRotation: 0,
          minRotation: 0,
          padding: 6,
          callback: (value) => {
            const n = typeof value === 'string' ? Number(value) : (value as number);
            if (!Number.isFinite(n)) return '';
            return `#${Math.round(n) + 1}`;
          },
        },
      },
      y: {
        ticks: { maxTicksLimit: 6 },
      },
    },
  };

  private tradePointTimes: number[] = [];

  @ViewChild(BaseChartDirective)
  private priceChartDirective?: BaseChartDirective;

  private priceSeriesRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPriceSeriesRebuildAt = 0;
  private readonly priceSeriesRebuildMinIntervalMs = 120;

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
  
  // Chart time range filter
  chartTimeRange: string = 'all';
  chartTimeRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: '5m', label: 'Last 5 Minutes' },
    { value: '15m', label: 'Last 15 Minutes' },
    { value: '30m', label: 'Last 30 Minutes' },
    { value: '1h', label: 'Last 1 Hour' },
    { value: '4h', label: 'Last 4 Hours' },
    { value: '1d', label: 'Last 24 Hours' },
    { value: 'custom', label: 'Custom Range' }
  ];
  
  // Custom date range
  customStartDate: string = '';
  customEndDate: string = '';
  showCustomDatePicker: boolean = false;

  copiedHint: string = '';
  private copiedHintTimer: ReturnType<typeof setTimeout> | null = null;

  // Username input for login
  usernameInput: string = '';
  isLoggingIn: boolean = false;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
  ) {}

  async ngOnInit(): Promise<void> {
    // Check if we have a stored username
    const storedUsername = localStorage.getItem('trading_username');
    if (storedUsername) {
      await this.loginAsTrader(storedUsername);
    } else {
      this.isLoading = false;
      this.currentView = 'login';
    }
  }

  ngOnDestroy(): void {
    this.supabaseService.unsubscribeAll();

    if (this.priceSeriesRebuildTimer) {
      clearTimeout(this.priceSeriesRebuildTimer);
      this.priceSeriesRebuildTimer = null;
    }

    if (this.copiedHintTimer) {
      clearTimeout(this.copiedHintTimer);
      this.copiedHintTimer = null;
    }
  }

  /**
   * Login as a trader - now goes to environment selection
   */
  async loginAsTrader(username: string): Promise<void> {
    if (!username.trim()) {
      this.connectionError = 'Please enter a username';
      return;
    }

    this.isLoggingIn = true;
    this.connectionError = null;

    try {
      // Get or create the trader
      this.trader = await this.supabaseService.getOrCreateTrader(username.trim());
      if (!this.trader) {
        throw new Error('Failed to create trader account');
      } 

      this.traderId = this.trader.id;
      this.traderUsername = this.trader.username;

      // Store username for next time
      localStorage.setItem('trading_username', username.trim());

      // Load environments
      await this.loadEnvironments();

      // Move to environment selection
      this.currentView = 'environment-select';
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
   * Load available environments
   */
  async loadEnvironments(): Promise<void> {
    this.publicEnvironments = await this.supabaseService.getPublicEnvironments();
    this.myEnvironments = await this.supabaseService.getTraderEnvironments(this.traderId);
    this.availableImportEnvironments = [...this.myEnvironments];
  }

  /**
   * Show create environment form
   */
  showCreateEnvironment(): void {
    this.currentView = 'create-environment';
    this.resetCreateForm();
  }

  /**
   * Show join environment form
   */
  showJoinEnvironment(env?: DbEnvironmentSearchResult): void {
    this.currentView = 'join-environment';
    this.searchResults = [];
    this.environmentSearchTerm = '';
    this.joinPassword = '';
    this.joinEnvironmentId = '';
    this.connectionError = null;

    if (env) {
      this.selectedEnvironmentToJoin = env;
      this.joinEnvironmentId = env.id;
    } else {
      this.selectedEnvironmentToJoin = null;
    }
  }

  /**
   * Search environments by name
   */
  async searchEnvironments(): Promise<void> {
    if (!this.environmentSearchTerm || this.environmentSearchTerm.length < 2) {
      this.searchResults = [];
      return;
    }

    this.isSearching = true;
    try {
      this.searchResults = await this.supabaseService.searchEnvironments(
        this.environmentSearchTerm,
      );
    } catch (error) {
      console.error('Error searching environments:', error);
      this.searchResults = [];
    }
    this.isSearching = false;
  }

  /**
   * Lookup environment by ID
   */
  async lookupEnvironmentById(): Promise<void> {
    if (!this.joinEnvironmentId || this.joinEnvironmentId.length < 10) {
      this.connectionError = 'Please enter a valid environment ID';
      return;
    }

    this.isSearching = true;
    this.connectionError = null;

    try {
      const env = await this.supabaseService.getEnvironmentByIdPublic(this.joinEnvironmentId);
      if (env) {
        this.selectedEnvironmentToJoin = env;
      } else {
        this.connectionError = 'Environment not found';
        this.selectedEnvironmentToJoin = null;
      }
    } catch (error) {
      console.error('Error looking up environment:', error);
      this.connectionError = 'Failed to find environment';
      this.selectedEnvironmentToJoin = null;
    }

    this.isSearching = false;
  }

  /**
   * Select an environment from search results
   */
  selectEnvironmentFromSearch(env: DbEnvironmentSearchResult): void {
    this.selectedEnvironmentToJoin = env;
    this.joinEnvironmentId = env.id;
    this.joinPassword = '';
    this.connectionError = null;
  }

  /**
   * Go back to environment selection
   */
  backToEnvironmentSelect(): void {
    this.currentView = 'environment-select';
    this.connectionError = null;
    this.selectedEnvironmentToJoin = null;
    this.searchResults = [];
    this.environmentSearchTerm = '';
  }

  /**
   * Reset create environment form
   */
  resetCreateForm(): void {
    this.newEnvironment = {
      name: '',
      description: '',
      is_private: false,
      password: '',
      starting_cash: 10000,
      starting_shares: 100,
      min_price_change: 0.01,
      allow_shorting: false,
      max_short_units: 0,
    };
    this.newStocks = [
      {
        symbol: '',
        name: '',
        description: '',
        startingPrice: 100,
        minPriceChange: 0.01,
        allowShorting: null,
        maxShortUnits: null,
      },
    ];
    this.importFromEnvironmentId = '';
  }

  /**
   * Add a new stock to the creation form
   */
  addStock(): void {
    this.newStocks.push({
      symbol: '',
      name: '',
      description: '',
      startingPrice: 100,
      minPriceChange: this.newEnvironment.min_price_change,
      allowShorting: null,
      maxShortUnits: null,
    });
  }

  /**
   * Remove a stock from the creation form
   */
  removeStock(index: number): void {
    if (this.newStocks.length > 1) {
      this.newStocks.splice(index, 1);
    }
  }

  /**
   * Import settings from another environment
   */
  async importSettings(): Promise<void> {
    if (!this.importFromEnvironmentId) return;

    const env = await this.supabaseService.getEnvironment(this.importFromEnvironmentId);
    if (env) {
      this.newEnvironment.starting_cash = Number(env.starting_cash);
      this.newEnvironment.starting_shares = env.starting_shares;
      this.newEnvironment.min_price_change = Number(env.min_price_change);
      this.newEnvironment.allow_shorting = env.allow_shorting;
      this.newEnvironment.max_short_units = env.max_short_units;

      // Import stocks
      const stocks = await this.supabaseService.getEnvironmentStocks(env.id);
      if (stocks.length > 0) {
        this.newStocks = stocks.map((s) => ({
          symbol: s.symbol,
          name: s.name || '',
          description: s.description || '',
          startingPrice: Number(s.starting_price),
          minPriceChange: Number(s.min_price_change),
          allowShorting: s.allow_shorting,
          maxShortUnits: s.max_short_units,
        }));
      }
    }
  }

  /**
   * Create a new environment
   */
  async createEnvironment(): Promise<void> {
    if (!this.newEnvironment.name.trim()) {
      this.connectionError = 'Please enter an environment name';
      return;
    }

    // Validate password for private environments
    if (this.newEnvironment.is_private) {
      if (!this.newEnvironment.password || this.newEnvironment.password.trim() === '') {
        this.connectionError = 'Please enter a password for the private environment';
        return;
      }
      if (this.newEnvironment.password.trim().length < 4) {
        this.connectionError = 'Password must be at least 4 characters';
        return;
      }
    }

    // Validate stocks
    const validStocks = this.newStocks.filter((s) => s.symbol.trim());
    if (validStocks.length === 0) {
      this.connectionError = 'Please add at least one stock';
      return;
    }

    this.isLoading = true;
    this.connectionError = null;

    try {
      const stocks: CreateStockInput[] = validStocks.map((s) => ({
        symbol: s.symbol.trim().toUpperCase(),
        name: s.name.trim() || s.symbol.trim().toUpperCase(),
        description: s.description.trim() || undefined,
        starting_price: s.startingPrice,
        min_price_change: s.minPriceChange,
        allow_shorting: s.allowShorting ?? undefined,
        max_short_units: s.maxShortUnits ?? undefined,
      }));

      console.log('Creating environment:', {
        name: this.newEnvironment.name,
        is_private: this.newEnvironment.is_private,
        has_password: !!this.newEnvironment.password,
      });

      const env = await this.supabaseService.createEnvironment(
        this.traderId,
        this.newEnvironment,
        stocks,
      );

      if (!env) {
        throw new Error('Failed to create environment. Check that the database tables exist.');
      }

      console.log('Environment created, joining:', env.id);

      // Join the created environment (creator auto-joins as admin)
      await this.joinEnvironmentById(env.id);
    } catch (error: any) {
      console.error('Error creating environment:', error);
      this.connectionError = error.message || 'Failed to create environment';
      this.isLoading = false;
    }
  }

  /**
   * Join an environment by ID
   */
  async joinEnvironmentById(environmentId: string, password?: string): Promise<void> {
    this.isLoading = true;
    this.connectionError = null;

    try {
      // Get participant (or join) - now throws errors with specific codes
      this.participant = await this.supabaseService.joinEnvironment(
        environmentId,
        this.traderId,
        false,
        password,
      );

      this.participantId = this.participant.id;
      this.isAdmin = this.participant.is_admin;

      // Get environment
      this.currentEnvironment = await this.supabaseService.getEnvironment(environmentId);
      if (!this.currentEnvironment) {
        throw new Error('Environment not found');
      }

      this.environmentId = this.currentEnvironment.id;
      this.isPaused = this.currentEnvironment.is_paused;

      // Check if user is creator (admin)
      if (this.currentEnvironment.creator_id === this.traderId) {
        this.isAdmin = true;
      }

      // Load environment data
      await this.loadEnvironmentData();

      // Subscribe to real-time updates
      this.subscribeToEnvironmentUpdates();

      this.isConnected = true;
      this.currentView = 'trading';
      this.isLoading = false;
    } catch (error: any) {
      console.error('Error joining environment:', error);

      // Handle specific error codes
      if (error.message === 'PASSWORD_REQUIRED') {
        this.connectionError = 'Password is required for this private environment';
      } else if (error.message === 'INVALID_PASSWORD') {
        this.connectionError = 'Incorrect password. Please check with the environment creator.';
      } else {
        this.connectionError = error.message || 'Failed to join environment';
      }

      this.isLoading = false;
    }
  }

  /**
   * Join selected environment (from join form)
   */
  async joinSelectedEnvironment(): Promise<void> {
    if (!this.selectedEnvironmentToJoin) {
      this.connectionError = 'Please select an environment';
      return;
    }

    await this.joinEnvironmentById(
      this.selectedEnvironmentToJoin.id,
      this.selectedEnvironmentToJoin.is_private ? this.joinPassword : undefined,
    );
  }

  /**
   * Load environment data (stocks, positions, etc.)
   */
  async loadEnvironmentData(): Promise<void> {
    if (!this.environmentId || !this.participantId) return;

    // Load stocks
    this.environmentStocks = await this.supabaseService.getEnvironmentStocks(this.environmentId);

    // Select first stock by default
    if (this.environmentStocks.length > 0 && !this.selectedStock) {
      await this.selectStock(this.environmentStocks[0]);
    }

    // Load positions
    this.environmentPositions = await this.supabaseService.getParticipantPositions(
      this.participantId,
    );

    // Load cash from participant
    if (this.participant) {
      this.cash = Number(this.participant.cash);
      this.settledCash = Number(this.participant.settled_cash);
      this.availableCash = Number(this.participant.available_cash);
    }

    // Update position for selected stock
    this.updateCurrentPosition();
  }

  /**
   * Select a stock to trade
   */
  async selectStock(stock: DbEnvironmentStock): Promise<void> {
    this.selectedStock = stock;
    this.selectedStockId = stock.id;
    this.symbol = stock.symbol;

    // Update position
    this.updateCurrentPosition();

    // Load orders and trades for this stock
    await this.loadStockData();

    // Re-bind realtime channels to the newly selected stock.
    this.subscribeToEnvironmentUpdates();

    if (this.activeTab === 'graph') {
      setTimeout(() => this.makePriceChart(), 0);
    }
  }

  /**
   * Load orders and trades for current stock
   */
  async loadStockData(): Promise<void> {
    if (!this.environmentId || !this.selectedStockId) return;

    // Load orders
    const orders = await this.supabaseService.getEnvironmentOpenOrders(
      this.environmentId,
      this.selectedStockId,
    );
    this.environmentOrders = orders;
    this.updateEnvironmentOrderBook();

    // Load my orders
    this.myEnvironmentOrders = await this.supabaseService.getParticipantOrders(
      this.participantId,
      this.selectedStockId,
    );
    this.updateMyOrdersFromEnvironment();

    // Load trades
    this.environmentTrades = await this.supabaseService.getEnvironmentTrades(
      this.environmentId,
      this.selectedStockId,
    );
    this.updateTradesFromEnvironment();
  }

  /**
   * Update current position based on selected stock
   */
  updateCurrentPosition(): void {
    if (!this.selectedStockId || !this.environmentPositions.length) {
      this.positionUnits = 0;
      this.positionAvgPrice = 0;
      return;
    }

    const pos = this.environmentPositions.find((p) => p.stock_id === this.selectedStockId);
    if (pos) {
      this.positionUnits = pos.units;
      this.positionAvgPrice = Number(pos.avg_price);
    } else {
      this.positionUnits = 0;
      this.positionAvgPrice = 0;
    }
  }

  /**
   * Subscribe to real-time updates for the environment
   */
  subscribeToEnvironmentUpdates(): void {
    if (!this.environmentId || !this.selectedStockId) return;

    // Subscribe to environment changes (pause state, etc.)
    this.supabaseService.subscribeToEnvironment(this.environmentId, (env) => {
      if (env) {
        this.currentEnvironment = env;
        this.isPaused = env.is_paused;
      }
    });

    // Subscribe to orders
    this.supabaseService.subscribeToEnvironmentOrders(
      this.environmentId,
      this.selectedStockId,
      (orders) => {
        this.environmentOrders = orders;
        this.updateEnvironmentOrderBook();
        this.loadMyOrders();
      },
    );

    // Subscribe to trades
    this.supabaseService.subscribeToEnvironmentTrades(
      this.environmentId,
      this.selectedStockId,
      (trades) => {
        this.environmentTrades = trades;
        this.updateTradesFromEnvironment();
        if (this.activeTab === 'graph') {
          this.makePriceChart();
        }
      },
    );
  }

  /**
   * Load my orders for current stock
   */
  async loadMyOrders(): Promise<void> {
    if (!this.participantId || !this.selectedStockId) return;
    this.myEnvironmentOrders = await this.supabaseService.getParticipantOrders(
      this.participantId,
      this.selectedStockId,
    );
    this.updateMyOrdersFromEnvironment();
  }

  /**
   * Update order book from environment orders
   */
  updateEnvironmentOrderBook(): void {
    // Aggregate bids
    const bidMap = new Map<number, { units: number; isMine: boolean; count: number }>();
    this.environmentOrders
      .filter((o) => o.type === 'buy' && (o.status === 'open' || o.status === 'partial'))
      .forEach((o) => {
        const remaining = o.units - o.filled_units;
        if (remaining > 0) {
          const price = Number(o.price);
          const existing = bidMap.get(price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.participant_id === this.participantId) existing.isMine = true;
          bidMap.set(price, existing);
        }
      });

    this.bids = Array.from(bidMap.entries())
      .map(([price, data]) => ({
        price,
        units: data.units,
        isMine: data.isMine,
        orderCount: data.count,
      }))
      .sort((a, b) => b.price - a.price);

    // Aggregate asks
    const askMap = new Map<number, { units: number; isMine: boolean; count: number }>();
    this.environmentOrders
      .filter((o) => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
      .forEach((o) => {
        const remaining = o.units - o.filled_units;
        if (remaining > 0) {
          const price = Number(o.price);
          const existing = askMap.get(price) || { units: 0, isMine: false, count: 0 };
          existing.units += remaining;
          existing.count++;
          if (o.participant_id === this.participantId) existing.isMine = true;
          askMap.set(price, existing);
        }
      });

    this.asks = Array.from(askMap.entries())
      .map(([price, data]) => ({
        price,
        units: data.units,
        isMine: data.isMine,
        orderCount: data.count,
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
   * Update my orders from environment orders
   */
  updateMyOrdersFromEnvironment(): void {
    this.myOrders = this.myEnvironmentOrders.map((o) => ({
      id: o.id,
      type: o.type,
      price: Number(o.price),
      units: o.units,
      filled_units: o.filled_units,
      status: o.status,
      created_at: o.created_at,
      trader_id: o.participant_id,
    }));
  }

  /**
   * Update trades from environment trades
   */
  updateTradesFromEnvironment(): void {
    this.trades = this.environmentTrades.map((t) => ({
      id: t.id,
      market_id: t.market_id,
      buy_order_id: t.buy_order_id,
      sell_order_id: t.sell_order_id,
      buyer_id: t.buyer_participant_id,
      seller_id: t.seller_participant_id,
      price: t.price,
      units: t.units,
      created_at: t.created_at,
    }));

    if (this.trades.length > 0) {
      this.lastPrice = Number(this.trades[0].price);
    }

    // Keep the live order book chart in sync in environment mode.
    this.rebuildPriceSeriesFromTrades();
  }

  /**
   * Toggle pause state (admin only)
   */
  async togglePause(): Promise<void> {
    if (!this.isAdmin || !this.environmentId) return;

    const newPauseState = !this.isPaused;
    const reason = newPauseState ? 'Trading paused by administrator' : undefined;

    const success = await this.supabaseService.toggleEnvironmentPause(
      this.environmentId,
      newPauseState,
      reason,
    );

    if (success) {
      this.isPaused = newPauseState;
    }
  }

  /**
   * Leave current environment and go back to selection
   */
  leaveEnvironment(): void {
    this.supabaseService.unsubscribeAll();
    this.isConnected = false;
    this.currentEnvironment = null;
    this.environmentId = '';
    this.participant = null;
    this.participantId = '';
    this.selectedStock = null;
    this.selectedStockId = '';
    this.environmentStocks = [];
    this.environmentPositions = [];
    this.environmentOrders = [];
    this.environmentTrades = [];
    this.myEnvironmentOrders = [];
    this.bids = [];
    this.asks = [];
    this.trades = [];
    this.myOrders = [];
    this.loadEnvironments();
    this.currentView = 'environment-select';
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
    this.currentEnvironment = null;
    this.environmentId = '';
    this.participant = null;
    this.participantId = '';
    this.currentView = 'login';
  }

  /**
   * Subscribe to real-time updates (legacy - for non-environment trading)
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

      this.rebuildPriceSeriesFromTrades();
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

  private rebuildPriceSeriesFromTrades(): void {
    // Coalesce rapid-fire inserts (demo bots) to avoid rebuilding on every tick.
    if (this.priceSeriesRebuildTimer) return;

    const now = Date.now();
    const elapsed = now - this.lastPriceSeriesRebuildAt;
    const delay = elapsed >= this.priceSeriesRebuildMinIntervalMs
      ? 0
      : this.priceSeriesRebuildMinIntervalMs - elapsed;

    this.priceSeriesRebuildTimer = setTimeout(() => {
      this.priceSeriesRebuildTimer = null;
      this.lastPriceSeriesRebuildAt = Date.now();
      this.rebuildPriceSeriesFromTradesNow();
    }, delay);
  }

  private rebuildPriceSeriesFromTradesNow(): void {
    const datasetTemplate = (this.priceChartData.datasets?.[0] as any) ?? {};
    const maxPoints = 400;

    const trades = this.trades ?? [];
    if (trades.length === 0) {
      this.tradePointTimes = [];
      this.priceChartData = {
        datasets: [
          {
            ...datasetTemplate,
            data: [],
          },
        ],
      };
      queueMicrotask(() => this.priceChartDirective?.update());
      return;
    }

    // Most service calls already return newest-first; avoid O(n log n) sort when possible.
    const maybeDesc =
      trades.length < 2 ||
      new Date(trades[0].created_at).getTime() >= new Date(trades[1].created_at).getTime();

    const clippedOldestToNewest: DbTrade[] = (() => {
      if (maybeDesc) {
        const latest = trades.length > maxPoints ? trades.slice(0, maxPoints) : trades.slice();
        return latest.slice().reverse();
      }

      const sorted = trades
        .slice()
        .sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      return sorted.length > maxPoints ? sorted.slice(-maxPoints) : sorted;
    })();

    const points: Array<{ x: number; y: number }> = [];
    const times: number[] = [];

    for (const t of clippedOldestToNewest) {
      const ts = new Date(t.created_at).getTime();
      const price = Number(t.price);
      if (!Number.isFinite(price)) continue;
      times.push(Number.isFinite(ts) ? ts : NaN);
      points.push({ x: points.length, y: price });
    }

    this.tradePointTimes = times;

    // Replace dataset reference to keep Angular + ng2-charts change detection happy.
    this.priceChartData = {
      datasets: [
        {
          ...datasetTemplate,
          data: points,
        },
      ],
    };

    // Ensure the directive redraws even if the canvas stays mounted.
    queueMicrotask(() => this.priceChartDirective?.update());
  }

  /**
   * Update my orders from all orders (legacy)
   */
  private updateMyOrders(): void {
    // Now handled by updateMyOrdersFromEnvironment
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
    this.orderPrice = Math.min(this.maxPrice, +(this.orderPrice + 0.5).toFixed(2));
  }

  /**
   * Decrement price
   */
  decrementPrice(): void {
    this.orderPrice = Math.max(0, +(this.orderPrice - 0.5).toFixed(2));
  }

  /**
   * Place an order (environment-based)
   */
  async placeOrder(): Promise<void> {
    if (this.orderUnits <= 0 || this.orderPrice <= 0) {
      return;
    }

    if (this.isPlacingOrder) {
      return;
    }

    // Check if market is paused
    if (this.isPaused) {
      alert('Trading is currently paused');
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
        .filter((o) => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .reduce((sum, o) => sum + (o.units - o.filled_units), 0);

      const availableToSell = this.positionUnits - openSellUnits;

      // Check shorting rules
      if (this.orderUnits > availableToSell) {
        const shortAmount = this.orderUnits - availableToSell;

        // Check if shorting is allowed
        const stockAllowsShorting =
          this.selectedStock?.allow_shorting ?? this.currentEnvironment?.allow_shorting;
        if (!stockAllowsShorting) {
          alert('Insufficient units to sell. Shorting is not allowed in this environment.');
          return;
        }

        // Check max short limit
        const maxShort =
          this.selectedStock?.max_short_units ?? this.currentEnvironment?.max_short_units ?? 0;
        const currentShort = Math.abs(Math.min(0, availableToSell));
        if (currentShort + shortAmount > maxShort) {
          alert(`Cannot short more than ${maxShort} units. Current short: ${currentShort}`);
          return;
        }
      }
    }

    this.isPlacingOrder = true;

    try {
      // Place the order in the environment
      const newOrder = await this.supabaseService.placeEnvironmentOrder({
        market_id: this.environmentId,
        stock_id: this.selectedStockId,
        participant_id: this.participantId,
        type: this.orderType,
        price: this.orderPrice,
        units: this.orderUnits,
        filled_units: 0,
        status: 'open',
      });

      if (!newOrder) {
        throw new Error('Failed to place order');
      }

      // Reserve cash for buy orders
      if (this.orderType === 'buy') {
        const totalCost = this.orderPrice * this.orderUnits;
        this.availableCash -= totalCost;
        await this.supabaseService.updateParticipantCash(
          this.participantId,
          this.cash,
          this.settledCash,
          this.availableCash,
        );
      }

      // Try to match the order
      await this.matchEnvironmentOrder(newOrder);

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
   * Match an order against the order book (environment-based)
   */
  private async matchEnvironmentOrder(incomingOrder: DbEnvironmentOrder): Promise<void> {
    // Reload orders to get the latest state
    const openOrders = await this.supabaseService.getEnvironmentOpenOrders(
      this.environmentId,
      this.selectedStockId,
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
            o.id !== incomingOrder.id,
        )
        .sort(
          (a, b) =>
            Number(a.price) - Number(b.price) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

      for (const ask of matchingAsks) {
        const incomingRemaining = incomingOrder.units - incomingOrder.filled_units;
        if (incomingRemaining <= 0) break;
        await this.executeEnvironmentTrade(incomingOrder, ask);
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
            o.id !== incomingOrder.id,
        )
        .sort(
          (a, b) =>
            Number(b.price) - Number(a.price) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

      for (const bid of matchingBids) {
        const incomingRemaining = incomingOrder.units - incomingOrder.filled_units;
        if (incomingRemaining <= 0) break;
        await this.executeEnvironmentTrade(bid, incomingOrder);
      }
    }
  }

  /**
   * Execute a trade between a buy and sell order (environment-based)
   */
  private async executeEnvironmentTrade(
    buyOrder: DbEnvironmentOrder,
    sellOrder: DbEnvironmentOrder,
  ): Promise<void> {
    const buyRemaining = buyOrder.units - buyOrder.filled_units;
    const sellRemaining = sellOrder.units - sellOrder.filled_units;
    const tradeUnits = Math.min(buyRemaining, sellRemaining);
    const tradePrice = Number(sellOrder.price);

    if (tradeUnits <= 0) return;

    // Record the trade
    await this.supabaseService.recordEnvironmentTrade({
      market_id: this.environmentId,
      stock_id: this.selectedStockId,
      buy_order_id: buyOrder.id,
      sell_order_id: sellOrder.id,
      buyer_participant_id: buyOrder.participant_id,
      seller_participant_id: sellOrder.participant_id,
      price: tradePrice,
      units: tradeUnits,
    });

    // Update buy order
    const newBuyFilled = buyOrder.filled_units + tradeUnits;
    const buyStatus = newBuyFilled >= buyOrder.units ? 'filled' : 'partial';
    await this.supabaseService.updateEnvironmentOrder(buyOrder.id, {
      filled_units: newBuyFilled,
      status: buyStatus,
    });
    buyOrder.filled_units = newBuyFilled;
    buyOrder.status = buyStatus;

    // Update sell order
    const newSellFilled = sellOrder.filled_units + tradeUnits;
    const sellStatus = newSellFilled >= sellOrder.units ? 'filled' : 'partial';
    await this.supabaseService.updateEnvironmentOrder(sellOrder.id, {
      filled_units: newSellFilled,
      status: sellStatus,
    });
    sellOrder.filled_units = newSellFilled;
    sellOrder.status = sellStatus;

    // Update participant positions and cash
    if (buyOrder.participant_id === this.participantId) {
      const cost = tradePrice * tradeUnits;
      this.settledCash -= cost;

      // Update position
      const prevUnits = this.positionUnits;
      this.positionUnits += tradeUnits;
      if (this.positionUnits > 0) {
        this.positionAvgPrice = (this.positionAvgPrice * prevUnits + cost) / this.positionUnits;
      }

      // Refund excess reserved cash
      const priceDifference = (Number(buyOrder.price) - tradePrice) * tradeUnits;
      if (buyStatus === 'filled') {
        this.availableCash += priceDifference;
      }

      await this.updateParticipantAndPosition();
    }

    if (sellOrder.participant_id === this.participantId) {
      const revenue = tradePrice * tradeUnits;
      this.settledCash += revenue;
      this.availableCash += revenue;
      this.positionUnits -= tradeUnits;

      await this.updateParticipantAndPosition();
    }

    this.lastPrice = tradePrice;
  }

  /**
   * Update participant cash and position in database
   */
  private async updateParticipantAndPosition(): Promise<void> {
    await this.supabaseService.updateParticipantCash(
      this.participantId,
      this.cash,
      this.settledCash,
      this.availableCash,
    );

    // Find and update the position for current stock
    const pos = this.environmentPositions.find((p) => p.stock_id === this.selectedStockId);
    if (pos) {
      await this.supabaseService.updateEnvironmentPosition(
        pos.id,
        this.positionUnits,
        this.positionAvgPrice,
      );
    }
  }

  /**
   * Update the order book display (legacy - now handled by updateEnvironmentOrderBook)
   */
  private updateOrderBook(): void {
    // Now handled by updateEnvironmentOrderBook
    this.updateEnvironmentOrderBook();
  }

  /**
   * Cancel an order (environment-based)
   */
  async cancelOrder(order: LocalOrder): Promise<void> {
    try {
      await this.supabaseService.cancelEnvironmentOrder(order.id);

      // Refund reserved cash for buy orders
      if (order.type === 'buy') {
        const unfilledUnits = order.units - order.filled_units;
        this.availableCash += order.price * unfilledUnits;
        await this.supabaseService.updateParticipantCash(
          this.participantId,
          this.cash,
          this.settledCash,
          this.availableCash,
        );
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    }
  }

  /**
   * Demo/admin convenience: cancel all open/partial orders in the current market.
   * Also refunds this trader's reserved cash for any cancelled BUY orders.
   */
  async resetOrderBook(): Promise<void> {
    if (!this.isConnected || !this.marketId) return;
    if (this.isResettingOrderBook) return;

    const ok = confirm(
      'Reset order book? This cancels ALL open orders (buys + sells) for everyone in this market.',
    );
    if (!ok) return;

    this.isResettingOrderBook = true;
    try {
      const refund = this.allOrders
        .filter(
          (o) =>
            o.market_id === this.marketId &&
            o.trader_id === this.traderId &&
            o.type === 'buy' &&
            (o.status === 'open' || o.status === 'partial'),
        )
        .reduce((sum, o) => sum + Number(o.price) * Math.max(0, o.units - o.filled_units), 0);

      const cancelledCount = await this.supabaseService.cancelOpenOrdersForMarket(this.marketId);

      // Optimistically update local state immediately (realtime will also reconcile).
      this.allOrders = this.allOrders.map((o) => {
        if (o.market_id !== this.marketId) return o;
        if (o.status !== 'open' && o.status !== 'partial') return o;
        return { ...o, status: 'cancelled', updated_at: new Date().toISOString() };
      });

      this.myOrders = this.myOrders.map((o) => {
        if (o.status !== 'open' && o.status !== 'partial') return o;
        return { ...o, status: 'cancelled' };
      });

      if (refund > 0) {
        this.availableCash += refund;
        await this.supabaseService.updateTraderCash(
          this.traderId,
          this.cash,
          this.settledCash,
          this.availableCash,
        );
      }

      this.updateOrderBook();

      if (cancelledCount > 0) {
        // Keep it simple + visible for demos.
        alert(`Order book reset: cancelled ${cancelledCount} open orders.`);
      } else {
        alert('Order book reset: no open orders to cancel.');
      }
    } catch (error) {
      console.error('Error resetting order book:', error);
      alert('Failed to reset order book');
    } finally {
      this.isResettingOrderBook = false;
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
   * Select previous stock
   */
  selectPrevStock(): void {
    if (this.environmentStocks.length <= 1) return;
    const currentIndex = this.environmentStocks.findIndex((s) => s.id === this.selectedStockId);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : this.environmentStocks.length - 1;
    this.selectStock(this.environmentStocks[prevIndex]);
  }

  /**
   * Select next stock
   */
  selectNextStock(): void {
    if (this.environmentStocks.length <= 1) return;
    const currentIndex = this.environmentStocks.findIndex((s) => s.id === this.selectedStockId);
    const nextIndex = currentIndex < this.environmentStocks.length - 1 ? currentIndex + 1 : 0;
    this.selectStock(this.environmentStocks[nextIndex]);
  }

  /**
   * Handle stock selection change from dropdown
   */
  onStockSelectChange(): void {
    const stock = this.environmentStocks.find((s) => s.id === this.selectedStockId);
    if (stock) {
      this.selectStock(stock);
    }
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
    return this.myOrders.filter((o) => o.status === 'open' || o.status === 'partial').length;
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

  /**
   * Handle time range change
   */
  onTimeRangeChange(): void {
    this.showCustomDatePicker = this.chartTimeRange === 'custom';
    if (this.chartTimeRange !== 'custom') {
      this.makePriceChart();
    }
  }

  /**
   * Apply custom date range
   */
  applyCustomDateRange(): void {
    if (this.customStartDate && this.customEndDate) {
      this.makePriceChart();
    }
  }

  /**
   * Get the start time based on selected range
   */
  private getTimeRangeStart(): Date | null {
    const now = new Date();
    
    switch (this.chartTimeRange) {
      case '5m':
        return new Date(now.getTime() - 5 * 60 * 1000);
      case '15m':
        return new Date(now.getTime() - 15 * 60 * 1000);
      case '30m':
        return new Date(now.getTime() - 30 * 60 * 1000);
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '4h':
        return new Date(now.getTime() - 4 * 60 * 60 * 1000);
      case '1d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'custom':
        return this.customStartDate ? new Date(this.customStartDate) : null;
      case 'all':
      default:
        return null;
    }
  }

  /**
   * Get the end time for custom range
   */
  private getTimeRangeEnd(): Date | null {
    if (this.chartTimeRange === 'custom' && this.customEndDate) {
      return new Date(this.customEndDate);
    }
    return null;
  }

  private makePriceChart(): void {
    const canvas = document.getElementById('priceChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Sort trades by time (oldest → newest)
    let sortedTrades = [...this.trades].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Apply time range filter
    const startTime = this.getTimeRangeStart();
    const endTime = this.getTimeRangeEnd();
    
    if (startTime) {
      sortedTrades = sortedTrades.filter(t => new Date(t.created_at) >= startTime);
    }
    if (endTime) {
      sortedTrades = sortedTrades.filter(t => new Date(t.created_at) <= endTime);
    }

    const labels = sortedTrades.map(t => {
      const date = new Date(t.created_at);
      // Show date + time for longer ranges
      if (this.chartTimeRange === '1d' || this.chartTimeRange === 'custom' || this.chartTimeRange === 'all') {
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleTimeString();
    });

    const prices = sortedTrades.map((t) => Number(t.price));

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
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Time' },
          },
          y: {
            title: { display: true, text: 'Price' },
          },
        },
      },
    });
  }

  shortId(id: string): string {
    const v = String(id || '');
    if (!v) return '';
    if (v.length <= 12) return v;
    return `${v.slice(0, 6)}…${v.slice(-4)}`;
  }

  async copyEnvironmentId(): Promise<void> {
    if (!this.environmentId) return;
    await this.copyToClipboard(this.environmentId);
  }

  async copyStockId(): Promise<void> {
    if (!this.selectedStockId) return;
    await this.copyToClipboard(this.selectedStockId);
  }

  private async copyToClipboard(text: string): Promise<void> {
    const value = String(text || '').trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to legacy copy if Clipboard API is blocked.
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (error) {
      console.warn('Copy to clipboard failed:', error);
    }
  }
}
