import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

// Database types
export interface DbTrader {
  id: string;
  username: string;
  cash: number;
  settled_cash: number;
  available_cash: number;
  created_at: string;
  updated_at: string;
}

export interface DbMarket {
  id: string;
  symbol: string;
  name: string;
  status: 'open' | 'closed' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface DbOrder {
  id: string;
  market_id: string;
  trader_id: string;
  type: 'buy' | 'sell';
  price: number;
  units: number;
  filled_units: number;
  status: 'open' | 'filled' | 'partial' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface DbTrade {
  id: string;
  market_id: string;
  buy_order_id: string;
  sell_order_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  units: number;
  created_at: string;
}

export interface DbPosition {
  id: string;
  trader_id: string;
  market_id: string;
  units: number;
  avg_price: number;
  created_at: string;
  updated_at: string;
}

// ==================== ENVIRONMENT TYPES ====================

export interface DbTradingEnvironment {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  creator_id: string;
  is_private: boolean;
  password_hash: string | null;
  starting_cash: number;
  starting_shares: number;
  min_price_change: number;
  allow_shorting: boolean;
  max_short_units: number;
  status: 'open' | 'closed' | 'paused';
  is_paused: boolean;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  creator?: DbTrader;
  participant_count?: number;
}

// Simplified environment info for search results (doesn't expose sensitive settings)
export interface DbEnvironmentSearchResult {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  is_private: boolean;
  status: 'open' | 'closed' | 'paused';
  is_paused: boolean;
  creator_id: string;
  created_at: string;
  creator?: { id: string; username: string };
}

export interface DbEnvironmentStock {
  id: string;
  market_id: string;
  symbol: string;
  name: string | null;
  description: string | null;
  starting_price: number;
  min_price_change: number;
  allow_shorting: boolean | null;
  max_short_units: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbEnvironmentParticipant {
  id: string;
  market_id: string;
  trader_id: string;
  cash: number;
  settled_cash: number;
  available_cash: number;
  is_admin: boolean;
  joined_at: string;
  updated_at: string;
  // Joined data
  trader?: DbTrader;
}

export interface DbEnvironmentPosition {
  id: string;
  market_id: string;
  participant_id: string;
  stock_id: string;
  units: number;
  avg_price: number;
  created_at: string;
  updated_at: string;
  // Joined data
  stock?: DbEnvironmentStock;
}

export interface DbEnvironmentOrder {
  id: string;
  market_id: string;
  stock_id: string;
  participant_id: string;
  type: 'buy' | 'sell';
  price: number;
  units: number;
  filled_units: number;
  status: 'open' | 'filled' | 'partial' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Joined data
  stock?: DbEnvironmentStock;
  participant?: DbEnvironmentParticipant;
}

export interface DbEnvironmentTrade {
  id: string;
  market_id: string;
  stock_id: string;
  buy_order_id: string;
  sell_order_id: string;
  buyer_participant_id: string;
  seller_participant_id: string;
  price: number;
  units: number;
  created_at: string;
  // Joined data
  stock?: DbEnvironmentStock;
}

// Create environment input
export interface CreateEnvironmentInput {
  name: string;
  description?: string;
  is_private: boolean;
  password?: string;
  starting_cash: number;
  starting_shares: number;
  min_price_change: number;
  allow_shorting: boolean;
  max_short_units: number;
}

// Stock input for environment creation
export interface CreateStockInput {
  symbol: string;
  name?: string;
  description?: string;
  starting_price: number;
  min_price_change?: number;
  allow_shorting?: boolean;
  max_short_units?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private ordersChannel: RealtimeChannel | null = null;
  private tradesChannel: RealtimeChannel | null = null;
  private tradersChannel: RealtimeChannel | null = null;
  private environmentChannel: RealtimeChannel | null = null;
  private envOrdersChannel: RealtimeChannel | null = null;
  private envTradesChannel: RealtimeChannel | null = null;

  // Real-time subjects
  private ordersSubject = new BehaviorSubject<DbOrder[]>([]);
  private tradesSubject = new BehaviorSubject<DbTrade[]>([]);
  private tradersSubject = new BehaviorSubject<DbTrader[]>([]);
  private environmentSubject = new BehaviorSubject<DbTradingEnvironment | null>(null);
  private envOrdersSubject = new BehaviorSubject<DbEnvironmentOrder[]>([]);
  private envTradesSubject = new BehaviorSubject<DbEnvironmentTrade[]>([]);

  public orders$ = this.ordersSubject.asObservable();
  public trades$ = this.tradesSubject.asObservable();
  public traders$ = this.tradersSubject.asObservable();
  public environment$ = this.environmentSubject.asObservable();
  public envOrders$ = this.envOrdersSubject.asObservable();
  public envTrades$ = this.envTradesSubject.asObservable();

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          // Disable lock to prevent NavigatorLockAcquireTimeoutError
          lock: undefined,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );
  }

  /**
   * Get the Supabase client for direct access if needed
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  // ==================== TRADER OPERATIONS ====================

  /**
   * Create or get a trader by username
   */
  async getOrCreateTrader(username: string): Promise<DbTrader | null> {
    // First try to get existing trader
    const { data: existing, error: fetchError } = await this.supabase
      .from('traders')
      .select('*')
      .eq('username', username)
      .single();

    if (existing) {
      return existing;
    }

    // Create new trader
    const { data: newTrader, error: createError } = await this.supabase
      .from('traders')
      .insert({
        username,
        cash: 10000,
        settled_cash: 10000,
        available_cash: 10000
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating trader:', createError);
      return null;
    }

    return newTrader;
  }

  /**
   * Get trader by ID
   */
  async getTrader(traderId: string): Promise<DbTrader | null> {
    const { data, error } = await this.supabase
      .from('traders')
      .select('*')
      .eq('id', traderId)
      .single();

    if (error) {
      console.error('Error fetching trader:', error);
      return null;
    }

    return data;
  }

  /**
   * Update trader's cash
   */
  async updateTraderCash(traderId: string, cash: number, settledCash: number, availableCash: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('traders')
      .update({
        cash,
        settled_cash: settledCash,
        available_cash: availableCash,
        updated_at: new Date().toISOString()
      })
      .eq('id', traderId);

    if (error) {
      console.error('Error updating trader cash:', error);
      return false;
    }

    return true;
  }

  // ==================== MARKET OPERATIONS ====================

  /**
   * Get or create a market
   */
  async getOrCreateMarket(symbol: string, name: string): Promise<DbMarket | null> {
    // First try to get existing market
    const { data: existing } = await this.supabase
      .from('markets')
      .select('*')
      .eq('symbol', symbol)
      .single();

    if (existing) {
      return existing;
    }

    // Create new market
    const { data: newMarket, error } = await this.supabase
      .from('markets')
      .insert({
        symbol,
        name,
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating market:', error);
      return null;
    }

    return newMarket;
  }

  /**
   * Update market status
   */
  async updateMarketStatus(marketId: string, status: 'open' | 'closed' | 'paused'): Promise<boolean> {
    const { error } = await this.supabase
      .from('markets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', marketId);

    return !error;
  }

  // ==================== ORDER OPERATIONS ====================

  /**
   * Place a new order
   */
  async placeOrder(order: Omit<DbOrder, 'id' | 'created_at' | 'updated_at'>): Promise<DbOrder | null> {
    const { data, error } = await this.supabase
      .from('orders')
      .insert(order)
      .select()
      .single();

    if (error) {
      console.error('Error placing order:', error);
      return null;
    }

    return data;
  }

  /**
   * Get all open orders for a market
   */
  async getOpenOrders(marketId: string): Promise<DbOrder[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('market_id', marketId)
      .in('status', ['open', 'partial'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get orders for a specific trader
   */
  async getTraderOrders(traderId: string, marketId: string): Promise<DbOrder[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('trader_id', traderId)
      .eq('market_id', marketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching trader orders:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Update order (for fills and cancellations)
   */
  async updateOrder(orderId: string, updates: Partial<DbOrder>): Promise<boolean> {
    const { error } = await this.supabase
      .from('orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order:', error);
      return false;
    }

    return true;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    return this.updateOrder(orderId, { status: 'cancelled' });
  }

  /**
   * Cancel all open/partial orders for a market (admin/demo reset)
   * Returns the number of orders updated.
   */
  async cancelOpenOrdersForMarket(marketId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('market_id', marketId)
      .in('status', ['open', 'partial'])
      .select('id');

    if (error) {
      console.error('Error cancelling open orders for market:', error);
      return 0;
    }

    return data?.length ?? 0;
  }

  // ==================== TRADE OPERATIONS ====================

  /**
   * Record a trade
   */
  async recordTrade(trade: Omit<DbTrade, 'id' | 'created_at'>): Promise<DbTrade | null> {
    const { data, error } = await this.supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) {
      console.error('Error recording trade:', error);
      return null;
    }

    return data;
  }

  /**
   * Get trades for a market
   */
  async getTrades(marketId: string, limit: number = 50): Promise<DbTrade[]> {
    const { data, error } = await this.supabase
      .from('trades')
      .select('*')
      .eq('market_id', marketId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching trades:', error);
      return [];
    }

    return data || [];
  }

  // ==================== POSITION OPERATIONS ====================

  /**
   * Get or create position
   */
  async getOrCreatePosition(traderId: string, marketId: string): Promise<DbPosition | null> {
    // Try to get existing position
    const { data: existing } = await this.supabase
      .from('positions')
      .select('*')
      .eq('trader_id', traderId)
      .eq('market_id', marketId)
      .single();

    if (existing) {
      return existing;
    }

    // Create new position with 100 starting units
    const { data: newPosition, error } = await this.supabase
      .from('positions')
      .insert({
        trader_id: traderId,
        market_id: marketId,
        units: 100,
        avg_price: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating position:', error);
      return null;
    }

    return newPosition;
  }

  /**
   * Update position
   */
  async updatePosition(positionId: string, units: number, avgPrice: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('positions')
      .update({
        units,
        avg_price: avgPrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', positionId);

    return !error;
  }

  // ==================== REAL-TIME SUBSCRIPTIONS ====================

  /**
   * Subscribe to real-time order updates for a market
   */
  subscribeToOrders(marketId: string, callback: (orders: DbOrder[]) => void): void {
    // Unsubscribe from previous channel if exists
    if (this.ordersChannel) {
      this.supabase.removeChannel(this.ordersChannel);
    }

    // Initial load
    this.getOpenOrders(marketId).then(orders => {
      this.ordersSubject.next(orders);
      callback(orders);
    });

    // Subscribe to changes
    this.ordersChannel = this.supabase
      .channel(`orders:${marketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `market_id=eq.${marketId}`
        },
        async (payload) => {
          console.log('Order change:', payload);
          // Reload all orders on any change
          const orders = await this.getOpenOrders(marketId);
          this.ordersSubject.next(orders);
          callback(orders);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to real-time trade updates for a market
   */
  subscribeToTrades(marketId: string, callback: (trades: DbTrade[]) => void): void {
    // Unsubscribe from previous channel if exists
    if (this.tradesChannel) {
      this.supabase.removeChannel(this.tradesChannel);
    }

    // Initial load
    this.getTrades(marketId).then(trades => {
      this.tradesSubject.next(trades);
      callback(trades);
    });

    // Subscribe to new trades
    this.tradesChannel = this.supabase
      .channel(`trades:${marketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `market_id=eq.${marketId}`
        },
        async (payload) => {
          console.log('New trade:', payload);
          const trades = await this.getTrades(marketId);
          this.tradesSubject.next(trades);
          callback(trades);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to trader updates
   */
  subscribeToTrader(traderId: string, callback: (trader: DbTrader | null) => void): void {
    // Unsubscribe from previous channel if exists
    if (this.tradersChannel) {
      this.supabase.removeChannel(this.tradersChannel);
    }

    // Initial load
    this.getTrader(traderId).then(trader => {
      callback(trader);
    });

    // Subscribe to changes
    this.tradersChannel = this.supabase
      .channel(`trader:${traderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'traders',
          filter: `id=eq.${traderId}`
        },
        async (payload) => {
          console.log('Trader update:', payload);
          const trader = await this.getTrader(traderId);
          callback(trader);
        }
      )
      .subscribe();
  }

  /**
   * Unsubscribe from all real-time channels
   */
  unsubscribeAll(): void {
    if (this.ordersChannel) {
      this.supabase.removeChannel(this.ordersChannel);
      this.ordersChannel = null;
    }
    if (this.tradesChannel) {
      this.supabase.removeChannel(this.tradesChannel);
      this.tradesChannel = null;
    }
    if (this.tradersChannel) {
      this.supabase.removeChannel(this.tradersChannel);
      this.tradersChannel = null;
    }
    if (this.environmentChannel) {
      this.supabase.removeChannel(this.environmentChannel);
      this.environmentChannel = null;
    }
    if (this.envOrdersChannel) {
      this.supabase.removeChannel(this.envOrdersChannel);
      this.envOrdersChannel = null;
    }
    if (this.envTradesChannel) {
      this.supabase.removeChannel(this.envTradesChannel);
      this.envTradesChannel = null;
    }
  }

  // ==================== TRADING ENVIRONMENT OPERATIONS ====================

  /**
   * Create a new trading environment
   */
  async createEnvironment(creatorId: string, input: CreateEnvironmentInput, stocks: CreateStockInput[]): Promise<DbTradingEnvironment | null> {
    // Only hash password if it's a private environment AND password is provided
    let passwordHash: string | null = null;
    if (input.is_private && input.password && input.password.trim() !== '') {
      passwordHash = btoa(input.password.trim());
      console.log('Creating private environment with password hash');
    }

    // Validate: private environments must have a password
    if (input.is_private && !passwordHash) {
      console.error('Private environments require a password');
      return null;
    }

    // Create unique symbol for the market using timestamp to avoid duplicates
    const timestamp = Date.now().toString(36).toUpperCase();
    const primarySymbol = stocks.length > 0 ? `${stocks[0].symbol.toUpperCase()}-${timestamp}` : `MKT-${timestamp}`;

    console.log('Creating environment:', {
      name: input.name,
      is_private: input.is_private,
      has_password: !!passwordHash
    });

    const { data: env, error } = await this.supabase
      .from('markets')
      .insert({
        name: input.name,
        symbol: primarySymbol,
        description: input.description || null,
        creator_id: creatorId,
        is_private: input.is_private,
        password_hash: passwordHash,
        starting_cash: input.starting_cash,
        starting_shares: input.starting_shares,
        min_price_change: input.min_price_change,
        allow_shorting: input.allow_shorting,
        max_short_units: input.max_short_units,
        status: 'open',
        is_paused: false
      })
      .select()
      .single();

    if (error || !env) {
      console.error('Error creating environment:', error);
      return null;
    }

    console.log('Environment created successfully:', env.id);

    // Create stocks for the environment
    if (stocks.length > 0) {
      const stockInserts = stocks.map(s => ({
        market_id: env.id,
        symbol: s.symbol.toUpperCase(),
        name: s.name || s.symbol.toUpperCase(),
        description: s.description || null,
        starting_price: s.starting_price,
        min_price_change: s.min_price_change ?? input.min_price_change,
        allow_shorting: s.allow_shorting ?? null,
        max_short_units: s.max_short_units ?? null
      }));

      const { error: stockError } = await this.supabase
        .from('environment_stocks')
        .insert(stockInserts);

      if (stockError) {
        console.error('Error creating stocks:', stockError);
      }
    }

    // Add creator as participant and admin (skip password check for creator)
    await this.addCreatorAsParticipant(env.id, creatorId, env.starting_cash, env.starting_shares);

    return env;
  }

  /**
   * Add the creator as a participant (bypasses password check)
   */
  private async addCreatorAsParticipant(environmentId: string, creatorId: string, startingCash: number, startingShares: number): Promise<DbEnvironmentParticipant | null> {
    // Create participant directly (no password check needed for creator)
    const { data, error } = await this.supabase
      .from('environment_participants')
      .insert({
        market_id: environmentId,
        trader_id: creatorId,
        cash: startingCash,
        settled_cash: startingCash,
        available_cash: startingCash,
        is_admin: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding creator as participant:', error);
      return null;
    }

    // Create positions for all stocks in the environment
    const stocks = await this.getEnvironmentStocks(environmentId);
    for (const stock of stocks) {
      await this.supabase
        .from('environment_positions')
        .insert({
          market_id: environmentId,
          participant_id: data.id,
          stock_id: stock.id,
          units: startingShares,
          avg_price: 0
        });
    }

    console.log('Creator added as participant:', data.id);
    return data;
  }

  /**
   * Get all public environments (for browsing)
   */
  async getPublicEnvironments(): Promise<DbTradingEnvironment[]> {
    const { data, error } = await this.supabase
      .from('markets')
      .select(`
        *,
        creator:traders!creator_id(id, username)
      `)
      .eq('is_private', false)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching environments:', error);
      return [];
    }

    // Get participant counts
    const envIds = data?.map(e => e.id) || [];
    if (envIds.length > 0) {
      const { data: counts } = await this.supabase
        .from('environment_participants')
        .select('market_id')
        .in('market_id', envIds);

      const countMap = new Map<string, number>();
      counts?.forEach(c => {
        countMap.set(c.market_id, (countMap.get(c.market_id) || 0) + 1);
      });

      return (data || []).map(e => ({
        ...e,
        participant_count: countMap.get(e.id) || 0
      }));
    }

    return data || [];
  }

  /**
   * Search environments by name (includes private environments)
   * Returns limited info for private environments until password is verified
   */
  async searchEnvironments(searchTerm: string): Promise<DbEnvironmentSearchResult[]> {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('markets')
      .select(`
        id,
        name,
        symbol,
        description,
        is_private,
        status,
        is_paused,
        creator_id,
        created_at,
        creator:traders!creator_id(id, username)
      `)
      .ilike('name', `%${searchTerm}%`)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error searching environments:', error);
      return [];
    }

    // Map the data to flatten creator from array to single object
    return (data || []).map(env => ({
      ...env,
      creator: Array.isArray(env.creator) && env.creator.length > 0 ? env.creator[0] : undefined
    }));
  }

  /**
   * Get environment by ID (for joining private environments)
   */
  async getEnvironmentByIdPublic(environmentId: string): Promise<DbEnvironmentSearchResult | null> {
    const { data, error } = await this.supabase
      .from('markets')
      .select(`
        id,
        name,
        symbol,
        description,
        is_private,
        status,
        is_paused,
        creator_id,
        created_at,
        creator:traders!creator_id(id, username)
      `)
      .eq('id', environmentId)
      .single();

    if (error) {
      console.error('Error fetching environment by ID:', error);
      return null;
    }

    // Flatten creator from array to single object
    return {
      ...data,
      creator: Array.isArray(data.creator) && data.creator.length > 0 ? data.creator[0] : undefined
    };
  }

  /**
   * Get environments a trader has joined
   */
  async getTraderEnvironments(traderId: string): Promise<DbTradingEnvironment[]> {
    const { data: participations, error: pError } = await this.supabase
      .from('environment_participants')
      .select('market_id')
      .eq('trader_id', traderId);

    if (pError || !participations?.length) {
      return [];
    }

    const envIds = participations.map(p => p.market_id);

    const { data, error } = await this.supabase
      .from('markets')
      .select(`
        *,
        creator:traders!creator_id(id, username)
      `)
      .in('id', envIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching trader environments:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a single environment by ID
   */
  async getEnvironment(environmentId: string): Promise<DbTradingEnvironment | null> {
    const { data, error } = await this.supabase
      .from('markets')
      .select(`
        *,
        creator:traders!creator_id(id, username)
      `)
      .eq('id', environmentId)
      .single();

    if (error) {
      console.error('Error fetching environment:', error);
      return null;
    }

    return data;
  }

  /**
   * Alias for getEnvironment
   */
  async getTradingEnvironment(environmentId: string): Promise<DbTradingEnvironment | null> {
    return this.getEnvironment(environmentId);
  }

  /**
   * Join an environment - returns participant data or throws error with specific message
   */
  async joinEnvironment(environmentId: string, traderId: string, isAdmin: boolean = false, password?: string): Promise<DbEnvironmentParticipant> {
    // Get environment to check settings
    const env = await this.getEnvironment(environmentId);
    if (!env) {
      throw new Error('Environment not found');
    }

    // Check if already joined (participants can rejoin without password)
    const { data: existing } = await this.supabase
      .from('environment_participants')
      .select('*')
      .eq('market_id', environmentId)
      .eq('trader_id', traderId)
      .single();

    if (existing) {
      console.log('User already a participant, returning existing record');
      return existing;
    }

    // Check password if private (only for new joiners who are not admins)
    if (env.is_private && env.password_hash && !isAdmin) {
      console.log('Private environment - validating password');
      
      if (!password || password.trim() === '') {
        throw new Error('PASSWORD_REQUIRED');
      }
      
      const providedHash = btoa(password.trim());
      console.log('Password validation:', { 
        provided: providedHash.substring(0, 5) + '...', 
        expected: env.password_hash.substring(0, 5) + '...',
        match: providedHash === env.password_hash
      });
      
      if (providedHash !== env.password_hash) {
        throw new Error('INVALID_PASSWORD');
      }
      
      console.log('Password validated successfully');
    }

    // Create participant
    const { data, error } = await this.supabase
      .from('environment_participants')
      .insert({
        market_id: environmentId,
        trader_id: traderId,
        cash: env.starting_cash,
        settled_cash: env.starting_cash,
        available_cash: env.starting_cash,
        is_admin: isAdmin
      })
      .select()
      .single();

    if (error) {
      console.error('Error joining environment:', error);
      throw new Error('Failed to join environment: ' + error.message);
    }

    // Create positions for all stocks in the environment
    const stocks = await this.getEnvironmentStocks(environmentId);
    for (const stock of stocks) {
      await this.supabase
        .from('environment_positions')
        .insert({
          market_id: environmentId,
          participant_id: data.id,
          stock_id: stock.id,
          units: env.starting_shares,
          avg_price: 0
        });
    }

    return data;
  }

  /**
   * Get participant info by environment and trader
   */
  async getParticipant(environmentId: string, traderId: string): Promise<DbEnvironmentParticipant | null> {
    const { data, error } = await this.supabase
      .from('environment_participants')
      .select(`
        *,
        trader:traders!trader_id(id, username)
      `)
      .eq('market_id', environmentId)
      .eq('trader_id', traderId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Get participant by ID directly
   */
  async getParticipantById(participantId: string): Promise<DbEnvironmentParticipant | null> {
    const { data, error } = await this.supabase
      .from('environment_participants')
      .select(`
        *,
        trader:traders!trader_id(id, username)
      `)
      .eq('id', participantId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Update participant cash
   */
  async updateParticipantCash(participantId: string, cash: number, settledCash: number, availableCash: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('environment_participants')
      .update({
        cash,
        settled_cash: settledCash,
        available_cash: availableCash
      })
      .eq('id', participantId);

    return !error;
  }

  /**
   * Get or create participant (for bot simulations)
   */
  async getOrCreateParticipant(environmentId: string, traderId: string, startingCash: number): Promise<DbEnvironmentParticipant | null> {
    const { data: existing } = await this.supabase
      .from('environment_participants')
      .select('*')
      .eq('market_id', environmentId)
      .eq('trader_id', traderId)
      .single();

    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('environment_participants')
      .insert({
        market_id: environmentId,
        trader_id: traderId,
        cash: startingCash,
        settled_cash: startingCash,
        available_cash: startingCash,
        is_admin: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating participant:', error);
      return null;
    }

    return data;
  }

  /**
   * Get or create environment position (for bot simulations)
   */
  async getOrCreateEnvironmentPosition(environmentId: string, participantId: string, stockId: string, startingUnits: number): Promise<DbEnvironmentPosition | null> {
    const { data: existing } = await this.supabase
      .from('environment_positions')
      .select('*')
      .eq('participant_id', participantId)
      .eq('stock_id', stockId)
      .single();

    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('environment_positions')
      .insert({
        market_id: environmentId,
        participant_id: participantId,
        stock_id: stockId,
        units: startingUnits,
        avg_price: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating position:', error);
      return null;
    }

    return data;
  }

  /**
   * Get stocks in an environment
   */
  async getEnvironmentStocks(environmentId: string): Promise<DbEnvironmentStock[]> {
    const { data, error } = await this.supabase
      .from('environment_stocks')
      .select('*')
      .eq('market_id', environmentId)
      .order('symbol', { ascending: true });

    if (error) {
      console.error('Error fetching stocks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a single environment stock by ID
   */
  async getEnvironmentStock(stockId: string): Promise<DbEnvironmentStock | null> {
    const { data, error } = await this.supabase
      .from('environment_stocks')
      .select('*')
      .eq('id', stockId)
      .single();

    if (error) {
      console.error('Error fetching stock:', error);
      return null;
    }

    return data;
  }

  /**
   * Get participant positions
   */
  async getParticipantPositions(environmentId: string, participantId: string): Promise<DbEnvironmentPosition[]> {
    const { data, error } = await this.supabase
      .from('environment_positions')
      .select(`
        *,
        stock:environment_stocks!stock_id(*)
      `)
      .eq('market_id', environmentId)
      .eq('participant_id', participantId);

    if (error) {
      console.error('Error fetching positions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Update environment position
   */
  async updateEnvironmentPosition(positionId: string, units: number, avgPrice: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('environment_positions')
      .update({
        units,
        avg_price: avgPrice
      })
      .eq('id', positionId);

    return !error;
  }

  /**
   * Place an order in an environment
   */
  async placeEnvironmentOrder(order: Omit<DbEnvironmentOrder, 'id' | 'created_at' | 'updated_at'>): Promise<DbEnvironmentOrder | null> {
    const { data, error } = await this.supabase
      .from('environment_orders')
      .insert(order)
      .select()
      .single();

    if (error) {
      console.error('Error placing environment order:', error);
      return null;
    }

    return data;
  }

  /**
   * Get open orders for a stock in an environment
   */
  async getEnvironmentOpenOrders(environmentId: string, stockId: string): Promise<DbEnvironmentOrder[]> {
    const { data, error } = await this.supabase
      .from('environment_orders')
      .select('*')
      .eq('market_id', environmentId)
      .eq('stock_id', stockId)
      .in('status', ['open', 'partial'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching environment orders:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all orders for a stock in an environment
   */
  async getEnvironmentOrders(environmentId: string, stockId: string): Promise<DbEnvironmentOrder[]> {
    const { data, error } = await this.supabase
      .from('environment_orders')
      .select('*')
      .eq('market_id', environmentId)
      .eq('stock_id', stockId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching environment orders:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a single order by ID (used for reloading fresh state during trade matching)
   */
  async getEnvironmentOrderById(orderId: string): Promise<DbEnvironmentOrder | null> {
    const { data, error } = await this.supabase
      .from('environment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('Error fetching order by ID:', error);
      return null;
    }

    return data;
  }

  /**
   * Get participant orders
   */
  async getParticipantOrders(participantId: string, stockId: string): Promise<DbEnvironmentOrder[]> {
    const { data, error } = await this.supabase
      .from('environment_orders')
      .select('*')
      .eq('participant_id', participantId)
      .eq('stock_id', stockId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching participant orders:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Update environment order
   */
  async updateEnvironmentOrder(orderId: string, updates: Partial<DbEnvironmentOrder>): Promise<boolean> {
    const { error } = await this.supabase
      .from('environment_orders')
      .update(updates)
      .eq('id', orderId);

    return !error;
  }

  /**
   * Cancel environment order
   */
  async cancelEnvironmentOrder(orderId: string): Promise<boolean> {
    return this.updateEnvironmentOrder(orderId, { status: 'cancelled' });
  }

  /**
   * Record an environment trade
   */
  async recordEnvironmentTrade(trade: Omit<DbEnvironmentTrade, 'id' | 'created_at'>): Promise<DbEnvironmentTrade | null> {
    const { data, error } = await this.supabase
      .from('environment_trades')
      .insert(trade)
      .select()
      .single();

    if (error) {
      console.error('Error recording environment trade:', error);
      return null;
    }

    return data;
  }

  /**
   * Get trades for a stock in an environment
   */
  async getEnvironmentTrades(environmentId: string, stockId: string, limit: number = 50): Promise<DbEnvironmentTrade[]> {
    const { data, error } = await this.supabase
      .from('environment_trades')
      .select('*')
      .eq('market_id', environmentId)
      .eq('stock_id', stockId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching environment trades:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all trades for a participant in an environment
   */
  async getParticipantTrades(environmentId: string, participantId: string): Promise<DbEnvironmentTrade[]> {
    const { data, error } = await this.supabase
      .from('environment_trades')
      .select('*')
      .eq('market_id', environmentId)
      .or(`buyer_participant_id.eq.${participantId},seller_participant_id.eq.${participantId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching participant trades:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Pause/unpause an environment (admin only)
   */
  async toggleEnvironmentPause(environmentId: string, isPaused: boolean, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('markets')
      .update({
        is_paused: isPaused,
        pause_reason: reason || null,
        status: isPaused ? 'paused' : 'open'
      })
      .eq('id', environmentId);

    return !error;
  }

  // ==================== ENVIRONMENT REAL-TIME SUBSCRIPTIONS ====================

  /**
   * Subscribe to environment updates
   */
  subscribeToEnvironment(environmentId: string, callback: (env: DbTradingEnvironment | null) => void): void {
    if (this.environmentChannel) {
      this.supabase.removeChannel(this.environmentChannel);
    }

    // Initial load
    this.getEnvironment(environmentId).then(env => {
      this.environmentSubject.next(env);
      callback(env);
    });

    // Subscribe to changes
    this.environmentChannel = this.supabase
      .channel(`environment:${environmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'markets',
          filter: `id=eq.${environmentId}`
        },
        async () => {
          const env = await this.getEnvironment(environmentId);
          this.environmentSubject.next(env);
          callback(env);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to environment orders
   */
  subscribeToEnvironmentOrders(environmentId: string, stockId: string, callback: (orders: DbEnvironmentOrder[]) => void): void {
    if (this.envOrdersChannel) {
      this.supabase.removeChannel(this.envOrdersChannel);
    }

    // Initial load
    this.getEnvironmentOpenOrders(environmentId, stockId).then(orders => {
      this.envOrdersSubject.next(orders);
      callback(orders);
    });

    // Subscribe to changes
    this.envOrdersChannel = this.supabase
      .channel(`env_orders:${environmentId}:${stockId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'environment_orders',
          filter: `market_id=eq.${environmentId}`
        },
        async () => {
          const orders = await this.getEnvironmentOpenOrders(environmentId, stockId);
          this.envOrdersSubject.next(orders);
          callback(orders);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to environment trades
   */
  subscribeToEnvironmentTrades(environmentId: string, stockId: string, callback: (trades: DbEnvironmentTrade[]) => void): void {
    if (this.envTradesChannel) {
      this.supabase.removeChannel(this.envTradesChannel);
    }

    // Initial load
    this.getEnvironmentTrades(environmentId, stockId).then(trades => {
      this.envTradesSubject.next(trades);
      callback(trades);
    });

    // Subscribe to new trades
    this.envTradesChannel = this.supabase
      .channel(`env_trades:${environmentId}:${stockId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'environment_trades',
          filter: `market_id=eq.${environmentId}`
        },
        async () => {
          const trades = await this.getEnvironmentTrades(environmentId, stockId);
          this.envTradesSubject.next(trades);
          callback(trades);
        }
      )
      .subscribe();
  }
}
