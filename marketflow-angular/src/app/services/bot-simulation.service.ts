import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

interface BotState {
  traderId: string;
  participantId: string;
  username: string;
  personality: {
    name: string;
    aggression: number;
    cancel: number;
    avgUnits: number;
    bigChance: number;
  };
  nextActionAt: number;
  burstUntil: number;
  pauseUntil: number;
  recentOrderIds: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BotSimulationService {
  private isRunning = false;
  private intervalHandle: any = null;
  private bots: BotState[] = [];
  private currentMid = 100; // Starting mid price
  private volatility = 0.25;
  private spread = 0.25;

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Start a bot simulation
   */
  async startSimulation(
    environmentId: string,
    stockId: string,
    volatility: 'normal' | 'high' | 'extreme',
    durationSeconds: number,
    numberOfBots: number = 5
  ): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: false, message: 'Simulation already running' };
    }

    // Set volatility level
    this.volatility = volatility === 'extreme' ? 3.00 : volatility === 'high' ? 0.65 : 0.25;
    this.spread = 0.50;

    try {
      // Initialize bots
      await this.initializeBots(environmentId, stockId, numberOfBots);

      // Start simulation loop
      this.isRunning = true;
      const startTime = Date.now();
      const endTime = startTime + (durationSeconds * 1000);

      this.runSimulationLoop(environmentId, stockId, endTime);

      return { 
        success: true, 
        message: `Simulation started with ${numberOfBots} bots, ${volatility} volatility for ${durationSeconds}s`
      };
    } catch (error: any) {
      return { 
        success: false, 
        message: `Failed to start simulation: ${error.message}`
      };
    }
  }

  /**
   * Stop the current simulation
   */
  stopSimulation(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.bots = [];
  }

  /**
   * Check if simulation is running
   */
  isSimulationRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Initialize bot traders and participants
   */
  private async initializeBots(environmentId: string, stockId: string, count: number): Promise<void> {
    const personalities = [
      { name: 'scalper', aggression: 0.8, cancel: 0.18, avgUnits: 4, bigChance: 0.01 },
      { name: 'maker', aggression: 0.35, cancel: 0.08, avgUnits: 6, bigChance: 0.02 },
      { name: 'swing', aggression: 0.2, cancel: 0.05, avgUnits: 10, bigChance: 0.05 }
    ];

    const environment = await this.supabaseService.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found');

    this.bots = [];

    for (let i = 0; i < count; i++) {
      const username = `BOT_${String(i + 1).padStart(2, '0')}`;
      
      // Get or create trader
      const trader = await this.supabaseService.getOrCreateTrader(username);
      if (!trader) throw new Error(`Failed to create trader ${username}`);

      // Get or create participant
      const participant = await this.supabaseService.getOrCreateParticipant(
        environmentId,
        trader.id,
        environment.starting_cash || 10000
      );
      if (!participant) throw new Error(`Failed to create participant for ${username}`);

      // Ensure position exists
      await this.supabaseService.getOrCreateEnvironmentPosition(
        environmentId,
        participant.id,
        stockId,
        environment.starting_shares || 100
      );

      this.bots.push({
        traderId: trader.id,
        participantId: participant.id,
        username,
        personality: personalities[i % personalities.length],
        nextActionAt: Date.now() + this.randomInt(500, 2000),
        burstUntil: 0,
        pauseUntil: 0,
        recentOrderIds: []
      });
    }

    console.log(`✓ Initialized ${count} bots`);
  }

  /**
   * Main simulation loop
   */
  private runSimulationLoop(environmentId: string, stockId: string, endTime: number): void {
    this.intervalHandle = setInterval(async () => {
      const now = Date.now();

      // Check if simulation should end
      if (now >= endTime) {
        this.stopSimulation();
        console.log('🤖 Bot simulation completed');
        return;
      }

      // Update market regime (volatility, drift)
      this.updateMarketRegime();

      // Process each bot
      for (const bot of this.bots) {
        if (now < bot.nextActionAt || now < bot.pauseUntil) continue;

        // Burst/pause logic
        if (bot.burstUntil === 0 && Math.random() < 0.06) {
          bot.burstUntil = now + this.randomInt(6000, 18000);
        }
        if (bot.pauseUntil === 0 && Math.random() < 0.03) {
          bot.pauseUntil = now + this.randomInt(4000, 14000);
          bot.burstUntil = 0;
          continue;
        }
        if (bot.burstUntil > 0 && now > bot.burstUntil) bot.burstUntil = 0;
        if (bot.pauseUntil > 0 && now > bot.pauseUntil) bot.pauseUntil = 0;

        const actionDelay = bot.burstUntil > 0 
          ? this.randomInt(180, 700) 
          : this.randomInt(500, 1800);
        bot.nextActionAt = now + actionDelay;

        // Occasionally cancel old orders
        if (Math.random() < 0.1 * bot.personality.cancel) {
          await this.tryCancelRandomOrder(bot);
          continue;
        }

        // Place new order
        await this.placeRandomOrder(environmentId, stockId, bot);
      }
    }, 350); // Run every 350ms
  }

  /**
   * Update market price with volatility
   */
  private updateMarketRegime(): void {
    // Drift
    const drift = (Math.random() - 0.5) * 0.02;
    this.currentMid += drift;

    // Volatility shock
    if (Math.random() < this.volatility * 0.01) {
      const shock = (Math.random() - 0.5) * this.volatility * 2;
      this.currentMid += shock;
    }

    // Keep price reasonable
    this.currentMid = Math.max(0.1, Math.min(10000, this.currentMid));
  }

  /**
   * Place a random order for a bot
   */
  private async placeRandomOrder(environmentId: string, stockId: string, bot: BotState): Promise<void> {
    try {
      const side = Math.random() < 0.5 ? 'buy' : 'sell';
      const personality = bot.personality;

      // Size: mostly small, occasionally large
      const big = Math.random() < personality.bigChance;
      const units = big 
        ? this.randomInt(25, 90) 
        : this.clamp(Math.round(this.randomBetween(1, personality.avgUnits * 2.5)), 1, 50);

      // Price: near mid with some spread
      const skew = (Math.random() - 0.5) * this.spread;
      const away = Math.abs(skew) + this.randomBetween(0.05, this.spread * 1.3);
      let price = side === 'buy' 
        ? this.currentMid - away * (personality.aggression > 0.6 ? 0.6 : 1.0)
        : this.currentMid + away * (personality.aggression > 0.6 ? 0.6 : 1.0);

      price = Number(this.clamp(price, 0.01, 100000).toFixed(2));

      // Place order
      const order = await this.supabaseService.placeEnvironmentOrder({
        market_id: environmentId,
        stock_id: stockId,
        participant_id: bot.participantId,
        type: side,
        price,
        units,
        filled_units: 0,
        status: 'open'
      });

      if (order) {
        bot.recentOrderIds.unshift(order.id);
        bot.recentOrderIds = bot.recentOrderIds.slice(0, 30);
      }

      // Try to match orders immediately
      if (Math.random() < 0.3) {
        await this.tryMatchOrders(environmentId, stockId);
      }
    } catch (error) {
      // Silently handle errors to keep simulation running
      console.error('Bot order error:', error);
    }
  }

  /**
   * Try to match crossing orders
   */
  private async tryMatchOrders(environmentId: string, stockId: string): Promise<void> {
    try {
      const orders = await this.supabaseService.getEnvironmentOpenOrders(environmentId, stockId);
      const buyOrders = orders.filter(o => o.type === 'buy').sort((a, b) => b.price - a.price);
      const sellOrders = orders.filter(o => o.type === 'sell').sort((a, b) => a.price - b.price);

      if (buyOrders.length === 0 || sellOrders.length === 0) return;

      const bestBid = buyOrders[0];
      const bestAsk = sellOrders[0];

      // Check if orders cross
      if (bestBid.price >= bestAsk.price) {
        const matchPrice = Number(((bestBid.price + bestAsk.price) / 2).toFixed(2));
        const matchUnits = Math.min(
          bestBid.units - bestBid.filled_units,
          bestAsk.units - bestAsk.filled_units
        );

        // Record trade
        const trade = await this.supabaseService.recordEnvironmentTrade({
          market_id: environmentId,
          stock_id: stockId,
          buy_order_id: bestBid.id,
          sell_order_id: bestAsk.id,
          buyer_participant_id: bestBid.participant_id,
          seller_participant_id: bestAsk.participant_id,
          price: matchPrice,
          units: matchUnits
        });
        
        // if (trade) {
        //   console.log('🤖 Bot trade recorded:', {
        //     price: matchPrice,
        //     units: matchUnits,
        //     market_id: environmentId,
        //     trade_id: trade.id
        //   });
        // }

        // Update orders
        const buyNewFilled = bestBid.filled_units + matchUnits;
        const sellNewFilled = bestAsk.filled_units + matchUnits;

        await this.supabaseService.updateEnvironmentOrder(bestBid.id, {
          filled_units: buyNewFilled,
          status: buyNewFilled >= bestBid.units ? 'filled' : 'partial'
        });

        await this.supabaseService.updateEnvironmentOrder(bestAsk.id, {
          filled_units: sellNewFilled,
          status: sellNewFilled >= bestAsk.units ? 'filled' : 'partial'
        });

        // Update mid price
        this.currentMid = matchPrice;
      }
    } catch (error) {
      console.error('Match orders error:', error);
    }
  }

  /**
   * Try to cancel a random order for a bot
   */
  private async tryCancelRandomOrder(bot: BotState): Promise<void> {
    if (bot.recentOrderIds.length === 0) return;

    try {
      const orderId = bot.recentOrderIds[this.randomInt(0, bot.recentOrderIds.length - 1)];
      await this.supabaseService.cancelEnvironmentOrder(orderId);
    } catch (error) {
      // Ignore errors (order may already be filled/cancelled)
    }
  }

  // Utility functions
  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.randomBetween(min, max + 1));
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }
}
