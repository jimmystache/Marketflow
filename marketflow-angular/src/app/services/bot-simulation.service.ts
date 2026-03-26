import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { OrderExecutionService } from './order-execution.service';

/**
 * Each bot maintains a two-sided quote (bid + ask) around the current
 * market mid-price, behaving as a market maker.  The spread width and
 * random price perturbation are governed by the volatility setting so
 * the resulting price series has realistic dynamics.
 *
 * Supports multiple simultaneous simulations — one per stock — via an
 * internal Map keyed by stockId.
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
export interface VolatilityProfile {
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

/** Per-stock simulation state */
interface MarketMakerSimState {
  bots: BotState[];
  timeoutHandle: any;
  /** Current mid-price the bots quote around */
  mid: number;
  profile: VolatilityProfile;
  endTime: number;
  /** Target tick interval in ms (jitter ±40% applied on top) */
  tickSpeedMs: number;
  /** When set, mid-price mean-reverts toward this target each tick */
  targetMid: number | null;
  /** Tracks the last target value we ran cancelStaleOrders for */
  lastSyncedTarget: number | null;
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
  private stockSimulations = new Map<string, MarketMakerSimState>();

  constructor(
    private supabaseService: SupabaseService,
    private orderExecutionService: OrderExecutionService,
  ) {}

  // ────────────────────── public API ──────────────────────

  async startSimulation(
    environmentId: string,
    stockId: string,
    volatility: 'normal' | 'high' | 'extreme' | 'custom',
    durationSeconds: number,
    numberOfBots: number = 5,
    tickSpeedMs: number = 800,
    initialPrice?: number,
    customProfile?: VolatilityProfile,
  ): Promise<{ success: boolean; message: string }> {
    if (this.stockSimulations.has(stockId)) {
      return { success: false, message: 'Simulation already running for this stock' };
    }

    const profile = volatility === 'custom' && customProfile
      ? customProfile
      : (VOLATILITY_PROFILES[volatility] ?? VOLATILITY_PROFILES['normal']);

    try {
      const { bots, mid } = await this.initializeBots(environmentId, stockId, numberOfBots, initialPrice);
      const state: MarketMakerSimState = {
        bots,
        timeoutHandle: null,
        mid,
        profile,
        endTime: Date.now() + durationSeconds * 1000,
        tickSpeedMs,
        targetMid: null,
        lastSyncedTarget: null,
      };
      this.stockSimulations.set(stockId, state);
      this.scheduleNextTick(environmentId, stockId);
      return {
        success: true,
        message: `Market-maker simulation started: ${numberOfBots} bots, ${volatility} volatility, ${durationSeconds}s`,
      };
    } catch (error: any) {
      this.stockSimulations.delete(stockId);
      return { success: false, message: `Failed to start simulation: ${error.message}` };
    }
  }

  stopSimulation(stockId: string): void {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;
    if (state.timeoutHandle) {
      clearTimeout(state.timeoutHandle);
      state.timeoutHandle = null;
    }
    this.stockSimulations.delete(stockId);
  }

  stopAll(): void {
    for (const stockId of Array.from(this.stockSimulations.keys())) {
      this.stopSimulation(stockId);
    }
  }

  isSimulationRunning(stockId?: string): boolean {
    if (stockId) return this.stockSimulations.has(stockId);
    return this.stockSimulations.size > 0;
  }

  getActiveStockIds(): string[] {
    return Array.from(this.stockSimulations.keys());
  }

  /**
   * Set or clear a target mid-price for a running simulation.
   * When set, `evolveMidPrice()` mean-reverts toward this target each tick.
   * Pass `null` to resume normal random-walk behaviour.
   */
  setTargetPrice(stockId: string, price: number | null): void {
    const state = this.stockSimulations.get(stockId);
    if (state) {
      state.targetMid = price;
    }
  }

  /** Update the target price for all running simulations at once. */
  setTargetPriceAll(price: number | null, environmentId?: string): void {
    for (const [stockId, state] of this.stockSimulations.entries()) {
      state.targetMid = price;
      // Immediately cancel stale orders when a new target is set
      if (price !== null && environmentId) {
        this.cancelStaleOrders(environmentId, stockId, price);
      }
    }
  }

  // ────────────────────── initialisation ──────────────────────

  private async initializeBots(
    environmentId: string,
    stockId: string,
    count: number,
    initialPrice?: number,
  ): Promise<{ bots: BotState[]; mid: number }> {
    const environment = await this.supabaseService.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found');

    // Seed mid from the most recent trade, or the user-supplied initial price,
    // or the stock's starting price, or a default of 100.
    let mid = 100;
    const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId);
    if (trades.length > 0) {
      mid = Number(trades[0].price);
    } else if (initialPrice && initialPrice > 0) {
      mid = initialPrice;
    } else {
      const stock = await this.supabaseService.getEnvironmentStock(stockId);
      mid = stock ? Number(stock.starting_price) : 100;
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

    const bots: BotState[] = [];

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

      bots.push({
        traderId: trader.id,
        participantId: participant.id,
        username,
        spreadMultiplier: preset.spreadMultiplier,
        quoteSize: preset.quoteSize,
        quote: { bidOrderId: null, askOrderId: null },
        inventory: 0,
      });
    }

    console.log(`✓ Initialised ${count} market-maker bots for stock ${stockId}, mid = ${mid.toFixed(2)}`);
    return { bots, mid };
  }

  // ────────────────────── tick loop ──────────────────────

  private scheduleNextTick(environmentId: string, stockId: string): void {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;
    const delay = state.tickSpeedMs + Math.floor(Math.random() * state.tickSpeedMs * 0.4);
    state.timeoutHandle = setTimeout(
      () => this.runTick(environmentId, stockId),
      delay,
    );
  }

  private async runTick(
    environmentId: string,
    stockId: string,
  ): Promise<void> {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;

    if (Date.now() >= state.endTime) {
      this.stopSimulation(stockId);
      console.log(`Market-maker simulation completed for stock ${stockId}`);
      return;
    }

    // 1. Evolve the mid-price (anchored to last trade price)
    await this.evolveMidPrice(state, environmentId, stockId);

    // Early-exit if stopped mid-tick
    if (!this.stockSimulations.has(stockId)) return;

    // 2. When a target price is active, cancel ALL bot quotes up-front
    //    and fetch the REAL last trade price from the DB so we can
    //    measure the actual gap (state.mid is snapped to target and
    //    can't be used for this).
    let lastTradePrice: number | null = null;
    if (state.targetMid !== null) {
      // On first tick with a new target, nuke all wrong-side orders
      if (state.targetMid !== state.lastSyncedTarget) {
        await this.cancelStaleOrders(environmentId, stockId, state.targetMid);
        state.lastSyncedTarget = state.targetMid;
      }
      await Promise.all(state.bots.map(bot => this.cancelQuote(bot)));
      try {
        const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId, 1);
        if (trades.length > 0) {
          lastTradePrice = Number(trades[0].price);
        }
      } catch { /* proceed with null — will fall back to state.mid */ }
    }

    // Early-exit if stopped mid-tick
    if (!this.stockSimulations.has(stockId)) return;

    // 3. All bots place fresh quotes in parallel
    await Promise.all(
      state.bots.map(bot => this.requoteBot(environmentId, stockId, bot, state, lastTradePrice))
    );

    // Only schedule next if still running
    if (this.stockSimulations.has(stockId)) {
      this.scheduleNextTick(environmentId, stockId);
    }
  }

  // ────────────────────── mid-price dynamics ──────────────────────

  /**
   * Evolve mid-price by anchoring to the last actual trade price.
   * This ensures MM quotes follow market direction driven by retail
   * sentiment instead of oscillating around an independent random walk.
   */
  private async evolveMidPrice(
    state: MarketMakerSimState,
    environmentId: string,
    stockId: string,
  ): Promise<void> {
    const p = state.profile;

    if (state.targetMid !== null) {
      // Target mode: snap to target with tiny noise
      const z = this.gaussianRandom();
      state.mid = state.targetMid + z * p.tickSigma * 0.15;
      return;
    }

    // Anchor mid to last trade price so MM follows the market
    try {
      const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId, 1);
      if (trades.length > 0) {
        const lastTradePrice = Number(trades[0].price);
        // Blend: 80% follow market, 20% random walk from current mid
        state.mid = lastTradePrice * 0.8
          + (state.mid + this.gaussianRandom() * p.tickSigma) * 0.2;
      } else {
        state.mid += this.gaussianRandom() * p.tickSigma;
      }
    } catch {
      state.mid += this.gaussianRandom() * p.tickSigma;
    }

    // Occasional shock
    if (Math.random() < p.shockProb) {
      state.mid += this.gaussianRandom() * p.shockSigma;
    }

    state.mid = Math.max(0.01, state.mid);
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
    state: MarketMakerSimState,
    lastTradePrice: number | null = null,
  ): Promise<void> {
    // When target is active, bulk cancel already happened in runTick.
    // In normal mode, skip cancel to reduce DB overhead — old orders
    // sit alongside new ones and get filled or expire naturally.

    const p = state.profile;

    if (state.targetMid !== null) {
      // ── TARGET MODE ──
      // Use the actual last trade price (from the DB) to measure the real
      // distance to target.  state.mid is snapped to target by evolveMidPrice()
      // so it can NOT be used here — that was the original bug.
      //
      // Strategy:
      //   FAR from target → sweep + opposite-side stabilise.
      //     The sweep consumes stale orders at the old price.
      //     The stabilise creates resting orders at the target price so that
      //     the NEXT bot's sweep crosses them, recording a trade at the target.
      //   NEAR target → tight two-sided quotes to maintain the new level.
      const target = state.targetMid;
      const marketPrice = lastTradePrice ?? state.mid;
      const gap = target - marketPrice;
      const nearTarget = Math.abs(gap) < target * 0.03; // within 3%

      if (nearTarget) {
        // ── STABILISATION: tight two-sided quotes at target ──
        const bidPrice = +(target - 0.02).toFixed(2);
        const askPrice = +(target + 0.02).toFixed(2);
        const units = Math.max(1, bot.quoteSize);

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'buy', bidPrice, units,
          );
          if (r.success && r.order) {
            bot.quote.bidOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory += units;
          }
        } catch { /* skip */ }

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'sell', askPrice, units,
          );
          if (r.success && r.order) {
            bot.quote.askOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory -= units;
          }
        } catch { /* skip */ }

      } else if (gap > 0) {
        // ── TARGET IS ABOVE: sweep buy + stabilise sell ──
        // The sweep buy consumes stale sell orders below the target.
        // The stabilise sell creates a resting order at the target so that
        // the next bot's sweep buy crosses it → trade records at the target.
        const sweepPrice = +(target + 0.05).toFixed(2);
        const stabilisePrice = +(target + 0.02).toFixed(2);

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'buy', sweepPrice, 20,
          );
          if (r.success && r.order) {
            bot.quote.bidOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory += 20;
          }
        } catch { /* insufficient cash — skip */ }

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'sell', stabilisePrice, 5,
          );
          if (r.success && r.order) {
            bot.quote.askOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory -= 5;
          }
        } catch { /* insufficient shares — skip */ }

      } else {
        // ── TARGET IS BELOW: sweep sell + stabilise buy ──
        const sweepPrice = Math.max(0.01, +(target - 0.05).toFixed(2));
        const stabilisePrice = +(target - 0.02).toFixed(2);

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'sell', sweepPrice, 20,
          );
          if (r.success && r.order) {
            bot.quote.askOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory -= 20;
          }
        } catch { /* insufficient shares — skip */ }

        try {
          const r = await this.orderExecutionService.placeAndExecuteOrder(
            environmentId, bot.participantId, stockId, 'buy', stabilisePrice, 5,
          );
          if (r.success && r.order) {
            bot.quote.bidOrderId = r.order.id;
            if (r.tradesExecuted && r.tradesExecuted > 0) bot.inventory += 5;
          }
        } catch { /* insufficient cash — skip */ }
      }

      return;
    }

    // ── NORMAL MODE ──
    const halfSpread = p.baseHalfSpread * bot.spreadMultiplier;
    const skew = bot.inventory * p.inventorySkewPerUnit;
    const bidJitter = Math.random() * p.jitter;
    const askJitter = Math.random() * p.jitter;

    const rawBid = state.mid - halfSpread - bidJitter - skew;
    const rawAsk = state.mid + halfSpread + askJitter - skew;

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
        }
      }
    } catch { /* validation failure — skip */ }
  }

  /**
   * Cancel ALL open orders on the wrong side of the target price.
   * This instantly clears the stale order book so the price converges
   * within 1-2 ticks instead of slowly sweeping through orders.
   */
  private async cancelStaleOrders(
    environmentId: string,
    stockId: string,
    target: number,
  ): Promise<void> {
    try {
      const orders = await this.supabaseService.getEnvironmentOpenOrders(environmentId, stockId);
      const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId, 1);
      const currentPrice = trades.length > 0 ? Number(trades[0].price) : target;

      const cancels: Promise<boolean>[] = [];
      for (const order of orders) {
        const price = Number(order.price);
        const shouldCancel =
          (target > currentPrice && order.type === 'sell' && price < target) ||
          (target < currentPrice && order.type === 'buy' && price > target);
        if (shouldCancel) {
          cancels.push(this.supabaseService.cancelEnvironmentOrder(order.id));
        }
      }
      await Promise.all(cancels);
    } catch {
      /* best-effort — stale orders will be swept on next tick */
    }
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
