import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { OrderExecutionService } from './order-execution.service';

/**
 * Each bot maintains a two-sided quote (bid + ask) around the current
 * market mid-price, behaving as a market maker.  The spread width and
 * random price perturbation are governed by the volatility setting so
 * the resulting price series has realistic dynamics.
 */

interface BotQuote {
  bidOrderId: string | null;
  askOrderId: string | null;
}

interface BotState {
  traderId: string;
  participantId: string;
  username: string;
  /** How wide this bot quotes relative to the base half-spread */
  spreadMultiplier: number;
  /** Typical quote size in units */
  quoteSize: number;
  /** Current live orders */
  quote: BotQuote;
  /** Net inventory accumulated through fills (positive = long) */
  inventory: number;
}

/** Volatility profile that controls price dynamics and spread */
interface VolatilityProfile {
  /** Per-tick std-dev of mid-price random walk */
  tickSigma: number;
  /** Base half-spread (each bot multiplies by its own factor) */
  baseHalfSpread: number;
  /** Probability of a "news shock" per tick */
  shockProb: number;
  /** Std-dev of the shock jump */
  shockSigma: number;
  /** How aggressively bots skew quotes to shed inventory ($/unit) */
  inventorySkewPerUnit: number;
  /** Max random jitter added per side */
  jitter: number;
}

const VOLATILITY_PROFILES: Record<string, VolatilityProfile> = {
  normal: {
    tickSigma: 0.02,
    baseHalfSpread: 0.08,
    shockProb: 0.003,
    shockSigma: 0.40,
    inventorySkewPerUnit: 0.005,
    jitter: 0.03,
  },
  high: {
    tickSigma: 0.08,
    baseHalfSpread: 0.15,
    shockProb: 0.010,
    shockSigma: 1.20,
    inventorySkewPerUnit: 0.010,
    jitter: 0.06,
  },
  extreme: {
    tickSigma: 0.20,
    baseHalfSpread: 0.30,
    shockProb: 0.025,
    shockSigma: 3.00,
    inventorySkewPerUnit: 0.020,
    jitter: 0.12,
  },
};

@Injectable({
  providedIn: 'root',
})
export class BotSimulationService {
  private isRunning = false;
  private timeoutHandle: any = null;
  private bots: BotState[] = [];

  /** Current mid-price the bots quote around */
  private mid = 100;
  private profile: VolatilityProfile = VOLATILITY_PROFILES['normal'];

  constructor(
    private supabaseService: SupabaseService,
    private orderExecutionService: OrderExecutionService,
  ) {}

  // ────────────────────── public API ──────────────────────

  async startSimulation(
    environmentId: string,
    stockId: string,
    volatility: 'normal' | 'high' | 'extreme',
    durationSeconds: number,
    numberOfBots: number = 5,
  ): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: false, message: 'Simulation already running' };
    }

    this.profile = VOLATILITY_PROFILES[volatility] ?? VOLATILITY_PROFILES['normal'];

    try {
      await this.initializeBots(environmentId, stockId, numberOfBots);
      this.isRunning = true;
      const endTime = Date.now() + durationSeconds * 1000;
      this.scheduleNextTick(environmentId, stockId, endTime);
      return {
        success: true,
        message: `Market-maker simulation started: ${numberOfBots} bots, ${volatility} volatility, ${durationSeconds}s`,
      };
    } catch (error: any) {
      this.isRunning = false;
      return { success: false, message: `Failed to start simulation: ${error.message}` };
    }
  }

  stopSimulation(): void {
    this.isRunning = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.bots = [];
  }

  isSimulationRunning(): boolean {
    return this.isRunning;
  }

  // ────────────────────── initialisation ──────────────────────

  private async initializeBots(
    environmentId: string,
    stockId: string,
    count: number,
  ): Promise<void> {
    const environment = await this.supabaseService.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found');

    // Seed mid from the most recent trade, or the stock's starting price
    const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId);
    if (trades.length > 0) {
      this.mid = Number(trades[0].price);
    } else {
      const stock = await this.supabaseService.getEnvironmentStock(stockId);
      this.mid = stock ? Number(stock.starting_price) : 100;
    }

    // Each bot gets a different spread multiplier / quote size
    // so the book has depth at multiple price levels.
    const presets = [
      { spreadMultiplier: 0.8, quoteSize: 3 },
      { spreadMultiplier: 1.0, quoteSize: 5 },
      { spreadMultiplier: 1.2, quoteSize: 8 },
      { spreadMultiplier: 1.5, quoteSize: 4 },
      { spreadMultiplier: 2.0, quoteSize: 6 },
    ];

    this.bots = [];

    for (let i = 0; i < count; i++) {
      const username = `BOT_${String(i + 1).padStart(2, '0')}`;

      const trader = await this.supabaseService.getOrCreateTrader(username);
      if (!trader) throw new Error(`Failed to create trader ${username}`);

      const participant = await this.supabaseService.getOrCreateParticipant(
        environmentId,
        trader.id,
        environment.starting_cash || 10000,
      );
      if (!participant) throw new Error(`Failed to create participant for ${username}`);

      await this.supabaseService.getOrCreateEnvironmentPosition(
        environmentId,
        participant.id,
        stockId,
        environment.starting_shares || 100,
      );

      const preset = presets[i % presets.length];

      this.bots.push({
        traderId: trader.id,
        participantId: participant.id,
        username,
        spreadMultiplier: preset.spreadMultiplier,
        quoteSize: preset.quoteSize,
        quote: { bidOrderId: null, askOrderId: null },
        inventory: 0,
      });
    }

    console.log(`✓ Initialised ${count} market-maker bots, mid = ${this.mid.toFixed(2)}`);
  }

  // ────────────────────── tick loop ──────────────────────

  private scheduleNextTick(environmentId: string, stockId: string, endTime: number): void {
    const delay = 600 + Math.floor(Math.random() * 800);
    this.timeoutHandle = setTimeout(
      () => this.runTick(environmentId, stockId, endTime),
      delay,
    );
  }

  private async runTick(
    environmentId: string,
    stockId: string,
    endTime: number,
  ): Promise<void> {
    if (!this.isRunning) return;

    if (Date.now() >= endTime) {
      this.stopSimulation();
      console.log('🤖 Market-maker simulation completed');
      return;
    }

    // 1. Evolve the mid-price (random walk + shocks)
    this.evolveMidPrice();

    // 2. Each bot cancels stale quotes and places a fresh two-sided quote
    for (const bot of this.bots) {
      await this.requoteBot(environmentId, stockId, bot);
    }

    this.scheduleNextTick(environmentId, stockId, endTime);
  }

  // ────────────────────── mid-price dynamics ──────────────────────

  /**
   * Gaussian random walk with occasional news shocks.
   * Uses Box-Muller for approximately normal increments.
   */
  private evolveMidPrice(): void {
    const p = this.profile;

    // Normal tick noise
    const z = this.gaussianRandom();
    this.mid += z * p.tickSigma;

    // Occasional shock
    if (Math.random() < p.shockProb) {
      this.mid += this.gaussianRandom() * p.shockSigma;
    }

    this.mid = Math.max(0.01, this.mid);
  }

  /** Box-Muller transform → standard normal sample */
  private gaussianRandom(): number {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ────────────────────── quoting ──────────────────────

  /**
   * Cancel any previous quote and place a new bid + ask around the mid.
   *
   * Prices incorporate:
   * - base half-spread × bot's spread multiplier
   * - inventory skew  (long → lower prices to attract sells)
   * - random jitter   (so levels don't stack exactly)
   */
  private async requoteBot(
    environmentId: string,
    stockId: string,
    bot: BotState,
  ): Promise<void> {
    // Cancel previous quotes (fire-and-forget, may already be filled)
    await this.cancelQuote(bot);

    const p = this.profile;
    const halfSpread = p.baseHalfSpread * bot.spreadMultiplier;
    const skew = bot.inventory * p.inventorySkewPerUnit;
    const bidJitter = Math.random() * p.jitter;
    const askJitter = Math.random() * p.jitter;

    const rawBid = this.mid - halfSpread - bidJitter - skew;
    const rawAsk = this.mid + halfSpread + askJitter - skew;

    const bidPrice = Math.max(0.01, +rawBid.toFixed(2));
    const askPrice = Math.max(bidPrice + 0.01, +rawAsk.toFixed(2));

    const units = Math.max(1, bot.quoteSize + Math.floor((Math.random() - 0.5) * 4));

    // Place bid
    try {
      const bidResult = await this.orderExecutionService.placeAndExecuteOrder(
        environmentId, bot.participantId, stockId, 'buy', bidPrice, units,
      );
      if (bidResult.success && bidResult.order) {
        bot.quote.bidOrderId = bidResult.order.id;
        if (bidResult.tradesExecuted && bidResult.tradesExecuted > 0) {
          bot.inventory += units;
          this.mid = bidPrice; // price discovery
        }
      }
    } catch { /* validation failure — skip */ }

    // Place ask
    try {
      const askResult = await this.orderExecutionService.placeAndExecuteOrder(
        environmentId, bot.participantId, stockId, 'sell', askPrice, units,
      );
      if (askResult.success && askResult.order) {
        bot.quote.askOrderId = askResult.order.id;
        if (askResult.tradesExecuted && askResult.tradesExecuted > 0) {
          bot.inventory -= units;
          this.mid = askPrice; // price discovery
        }
      }
    } catch { /* validation failure — skip */ }
  }

  private async cancelQuote(bot: BotState): Promise<void> {
    const ids = [bot.quote.bidOrderId, bot.quote.askOrderId].filter(Boolean) as string[];
    for (const id of ids) {
      try {
        await this.supabaseService.cancelEnvironmentOrder(id);
      } catch { /* already filled or cancelled */ }
    }
    bot.quote.bidOrderId = null;
    bot.quote.askOrderId = null;
  }
}
