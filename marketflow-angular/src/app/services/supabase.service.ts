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

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private ordersChannel: RealtimeChannel | null = null;
  private tradesChannel: RealtimeChannel | null = null;
  private tradersChannel: RealtimeChannel | null = null;

  // Real-time subjects
  private ordersSubject = new BehaviorSubject<DbOrder[]>([]);
  private tradesSubject = new BehaviorSubject<DbTrade[]>([]);
  private tradersSubject = new BehaviorSubject<DbTrader[]>([]);

  public orders$ = this.ordersSubject.asObservable();
  public trades$ = this.tradesSubject.asObservable();
  public traders$ = this.tradersSubject.asObservable();

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
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
  }
}
