import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { OrderExecutionService } from './order-execution.service';

/**
 * Simulates retail investor activity by periodically placing aggressive
 * market-crossing orders that execute immediately against the existing
 * order book.  This drives price movement in a realistic way:
 *
 *  - Each "retail investor" is a bot that places a single marketable order
 *    (a buy above the best ask, or a sell below the best bid) and then
 *    goes away.
 *  - The direction is biased by a slowly drifting sentiment variable so
 *    price trends naturally emerge and reverse.
 *  - Order sizes are small and random (1–8 units) to look retail-like.
 *
 * Supports multiple simultaneous simulations — one per stock — via an
 * internal Map keyed by stockId.
 */

type RetailPersonality = 'momentum' | 'contrarian' | 'fomo' | 'passive';

interface RetailBot {
  participantId: string;
  traderId: string;
  username: string;
  /** Behavioural archetype — determines direction bias and aggression */
  personality: RetailPersonality;
  /** 0.3–1.0 — scales order size (low = small orders, high = large) */
  riskTolerance: number;
  /** 0.2–0.8 — base probability of trading on any given tick */
  activityRate: number;
  /** Ticks remaining before this bot will consider trading again */
  cooldownTicks: number;
  /** Tracks what this bot did last (for momentum/contrarian logic) */
  lastDirection: 'buy' | 'sell' | null;
}

export type AsymmetryLevel = 'low' | 'medium' | 'high';

interface AsymmetryConfig {
  sentimentStep: number;
  meanReversion: number;
  maxOrderSize: number;
  /** Min aggression as fraction of price (e.g. 0.01 = 1%) */
  aggressionMin: number;
  /** Max aggression as fraction of price (e.g. 0.02 = 2%) */
  aggressionMax: number;
  buyProbMin: number;
  buyProbMax: number;
  targetBias: number;
}

const ASYMMETRY_CONFIGS: Record<AsymmetryLevel, AsymmetryConfig> = {
  low:    { sentimentStep: 0.1,  meanReversion: 0.98, maxOrderSize: 4,  aggressionMin: 0.01, aggressionMax: 0.02, buyProbMin: 0.35, buyProbMax: 0.65, targetBias: 0.95 },
  medium: { sentimentStep: 0.3,  meanReversion: 0.95, maxOrderSize: 8,  aggressionMin: 0.03, aggressionMax: 0.04, buyProbMin: 0.15, buyProbMax: 0.85, targetBias: 0.90 },
  high:   { sentimentStep: 0.8,  meanReversion: 0.85, maxOrderSize: 20, aggressionMin: 0.05, aggressionMax: 0.06, buyProbMin: 0.05, buyProbMax: 0.95, targetBias: 0.70 },
};

/** Per-stock simulation state */
interface StockSimState {
  environmentId: string;
  bots: RetailBot[];
  timeoutHandle: any;
  /** Sentiment bias: positive = bullish, negative = bearish */
  sentiment: number;
  endTime: number;
  /** Target tick interval in ms (jitter ±40% applied on top) */
  tickSpeedMs: number;
  /** Optional target price — when set, retail bots bias toward this price */
  targetMid: number | null;
  asymmetry: AsymmetryLevel;
  /** Recent price change as a fraction (e.g. 0.03 = 3% up) for momentum detection */
  recentPriceChange: number;
  /** Last known mid-price for tracking direction */
  lastMidPrice: number | null;
  /** Market regime: 'bull' trends up, 'bear' trends down */
  regime: 'bull' | 'bear';
  /** Ticks remaining in the current regime before a switch can happen */
  regimeTicksLeft: number;
}

@Injectable({
  providedIn: 'root',
})
export class RetailSimulationService {
  private stockSimulations = new Map<string, StockSimState>();

  constructor(
    private supabaseService: SupabaseService,
    private orderExecutionService: OrderExecutionService,
  ) {}

  // ─────────────── public API ───────────────

  async start(
    environmentId: string,
    stockId: string,
    durationSeconds: number,
    numberOfBots: number = 4,
    tickSpeedMs: number = 800,
    asymmetry: AsymmetryLevel = 'medium',
  ): Promise<{ success: boolean; message: string }> {
    if (this.stockSimulations.has(stockId)) {
      return { success: false, message: 'Retail simulation already running for this stock' };
    }

    try {
      const bots = await this.initBots(environmentId, stockId, numberOfBots);
      const state: StockSimState = {
        environmentId,
        bots,
        timeoutHandle: null,
        sentiment: 0,
        endTime: Date.now() + durationSeconds * 1000,
        tickSpeedMs,
        targetMid: null,
        asymmetry,
        recentPriceChange: 0,
        lastMidPrice: null,
        regime: Math.random() < 0.6 ? 'bull' : 'bear',
        regimeTicksLeft: 150 + Math.floor(Math.random() * 200),
      };
      this.stockSimulations.set(stockId, state);
      this.scheduleNext(environmentId, stockId);
      return {
        success: true,
        message: `Retail simulation started: ${numberOfBots} investors for ${durationSeconds}s`,
      };
    } catch (error: any) {
      this.stockSimulations.delete(stockId);
      return { success: false, message: error.message };
    }
  }

  stop(stockId: string): void {
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
      this.stop(stockId);
    }
  }

  isActive(stockId?: string): boolean {
    if (stockId) return this.stockSimulations.has(stockId);
    return this.stockSimulations.size > 0;
  }

  getActiveStockIds(): string[] {
    return Array.from(this.stockSimulations.keys());
  }

  setTargetPrice(stockId: string, price: number | null): void {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;
    state.targetMid = price;
    if (price !== null) {
      this.sweepMispricedOrders(state.environmentId, stockId, state);
    }
  }

  setTargetPriceAll(price: number | null, environmentId?: string): void {
    for (const [stockId, state] of this.stockSimulations.entries()) {
      state.targetMid = price;
      if (price !== null) {
        const envId = environmentId ?? state.environmentId;
        this.sweepMispricedOrders(envId, stockId, state);
      }
    }
  }

  // ─────────────── init ───────────────

  private static readonly PERSONALITIES: RetailPersonality[] = [
    'momentum', 'contrarian', 'fomo', 'passive',
  ];

  /** Personality-specific defaults for risk and activity */
  private static readonly PERSONALITY_TRAITS: Record<RetailPersonality, { riskRange: [number, number]; activityRange: [number, number] }> = {
    momentum:   { riskRange: [0.5, 0.9], activityRange: [0.4, 0.7] },
    contrarian: { riskRange: [0.4, 0.7], activityRange: [0.3, 0.5] },
    fomo:       { riskRange: [0.6, 1.0], activityRange: [0.3, 0.6] },
    passive:    { riskRange: [0.3, 0.5], activityRange: [0.15, 0.35] },
  };

  private async initBots(
    environmentId: string,
    stockId: string,
    count: number,
  ): Promise<RetailBot[]> {
    const environment = await this.supabaseService.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found');

    const bots: RetailBot[] = [];

    for (let i = 0; i < count; i++) {
      const username = `RETAIL_${String(i + 1).padStart(2, '0')}`;

      const trader = await this.supabaseService.getOrCreateTrader(username);
      if (!trader) throw new Error(`Failed to create trader ${username}`);

      const participant = await this.supabaseService.getOrCreateParticipant(
        environmentId,
        trader.id,
        environment.starting_cash || 10000,
      );
      if (!participant) throw new Error(`Failed to create participant ${username}`);

      await this.supabaseService.getOrCreateEnvironmentPosition(
        environmentId,
        participant.id,
        stockId,
        environment.starting_shares || 100,
      );

      const personality = RetailSimulationService.PERSONALITIES[i % RetailSimulationService.PERSONALITIES.length];
      const traits = RetailSimulationService.PERSONALITY_TRAITS[personality];
      const riskTolerance = traits.riskRange[0] + Math.random() * (traits.riskRange[1] - traits.riskRange[0]);
      const activityRate = traits.activityRange[0] + Math.random() * (traits.activityRange[1] - traits.activityRange[0]);

      bots.push({
        participantId: participant.id,
        traderId: trader.id,
        username,
        personality,
        riskTolerance,
        activityRate,
        cooldownTicks: 0,
        lastDirection: null,
      });
    }

    console.log(`✓ Initialised ${count} retail investor bots for stock ${stockId}: ${bots.map(b => b.personality).join(', ')}`);
    return bots;
  }

  // ─────────────── tick loop ───────────────

  private scheduleNext(environmentId: string, stockId: string): void {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;
    const delay = state.tickSpeedMs + Math.floor(Math.random() * state.tickSpeedMs * 0.4);
    state.timeoutHandle = setTimeout(
      () => this.tick(environmentId, stockId),
      delay,
    );
  }

  private async tick(
    environmentId: string,
    stockId: string,
  ): Promise<void> {
    const state = this.stockSimulations.get(stockId);
    if (!state) return;

    if (Date.now() >= state.endTime) {
      this.stop(stockId);
      console.log(`Retail simulation completed for stock ${stockId}`);
      return;
    }

    // Regime-switching sentiment model:
    // Long bull/bear phases with occasional regime flips.
    // Sentiment drifts in the regime direction with noise, NOT mean-reverting to zero.
    const cfg = ASYMMETRY_CONFIGS[state.asymmetry];

    state.regimeTicksLeft--;
    if (state.regimeTicksLeft <= 0) {
      // Flip regime. Bear phases are shorter than bull phases (realistic).
      state.regime = state.regime === 'bull' ? 'bear' : 'bull';
      state.regimeTicksLeft = state.regime === 'bull'
        ? 200 + Math.floor(Math.random() * 300)   // bull: 200–500 ticks
        : 80 + Math.floor(Math.random() * 120);   // bear: 80–200 ticks
    }

    // Drift sentiment toward regime direction with noise
    const regimeBias = state.regime === 'bull' ? 0.12 : -0.18; // bears are steeper
    state.sentiment += regimeBias * cfg.sentimentStep + (Math.random() - 0.5) * cfg.sentimentStep * 0.4;
    // Soft clamp to prevent runaway
    state.sentiment = Math.max(-3, Math.min(3, state.sentiment));

    // Compute recent price momentum from last few trades
    await this.updateMomentum(environmentId, stockId, state);

    // Early-exit if stopped mid-tick
    if (!this.stockSimulations.has(stockId)) return;

    // When a target is active, sweep any mispriced orders first
    if (state.targetMid !== null) {
      await this.sweepMispricedOrders(environmentId, stockId, state);
    }

    // Early-exit if stopped mid-tick
    if (!this.stockSimulations.has(stockId)) return;

    // Fetch order book once for all bots this tick
    let openOrders: any[];
    try {
      openOrders = await this.supabaseService.getEnvironmentOpenOrders(environmentId, stockId);
    } catch {
      if (this.stockSimulations.has(stockId)) this.scheduleNext(environmentId, stockId);
      return;
    }

    // ALL bots fire every tick — in parallel
    await Promise.all(
      state.bots.map(bot => this.placeRetailOrder(environmentId, stockId, bot, state, openOrders))
    );

    // Only schedule next if still running
    if (this.stockSimulations.has(stockId)) {
      this.scheduleNext(environmentId, stockId);
    }
  }

  // ─────────────── momentum tracking ───────────────

  /**
   * Compute recent price change from the last 5 trades.
   * Updates state.recentPriceChange (fractional, e.g. 0.03 = +3%)
   * and state.lastMidPrice.
   */
  private async updateMomentum(
    environmentId: string,
    stockId: string,
    state: StockSimState,
  ): Promise<void> {
    try {
      const trades = await this.supabaseService.getEnvironmentTrades(environmentId, stockId, 5);
      if (trades.length >= 2) {
        const newest = Number(trades[0].price);
        const oldest = Number(trades[trades.length - 1].price);
        state.recentPriceChange = oldest > 0 ? (newest - oldest) / oldest : 0;
        state.lastMidPrice = newest;
      }
    } catch {
      // Best-effort — keep previous values
    }
  }

  // ─────────────── sweep mispriced orders ───────────────

  /**
   * Sweep ALL mispriced orders on the book.
   * "Mispriced" = sells below target (profit for buyers)
   *             + buys above target (profit for sellers).
   * Distributes sweep volume across all retail bots.
   */
  private async sweepMispricedOrders(
    environmentId: string,
    stockId: string,
    state: StockSimState,
  ): Promise<void> {
    const target = state.targetMid;
    if (target === null) return;

    try {
      const openOrders = await this.supabaseService.getEnvironmentOpenOrders(
        environmentId,
        stockId,
      );

      // Mispriced sells: priced below target → retail bots should BUY these
      const mispricedSellVolume = openOrders
        .filter(o => o.type === 'sell'
          && (o.status === 'open' || o.status === 'partial')
          && Number(o.price) < target)
        .reduce((sum, o) => sum + (o.units - o.filled_units), 0);

      // Mispriced buys: priced above target → retail bots should SELL into these
      const mispricedBuyVolume = openOrders
        .filter(o => o.type === 'buy'
          && (o.status === 'open' || o.status === 'partial')
          && Number(o.price) > target)
        .reduce((sum, o) => sum + (o.units - o.filled_units), 0);

      const bots = state.bots;
      const botCount = bots.length;

      // Sweep mispriced sells by placing buy orders
      if (mispricedSellVolume > 0) {
        const perBot = Math.ceil(mispricedSellVolume / botCount);
        const sweepPrice = +(target + 0.01).toFixed(2);

        for (const bot of bots) {
          try {
            await this.orderExecutionService.placeAndExecuteOrder(
              environmentId, bot.participantId, stockId, 'buy', sweepPrice, perBot,
            );
          } catch { /* insufficient cash — skip this bot */ }
        }
      }

      // Sweep mispriced buys by placing sell orders
      if (mispricedBuyVolume > 0) {
        const perBot = Math.ceil(mispricedBuyVolume / botCount);
        const sweepPrice = Math.max(0.01, +(target - 0.01).toFixed(2));

        for (const bot of bots) {
          try {
            await this.orderExecutionService.placeAndExecuteOrder(
              environmentId, bot.participantId, stockId, 'sell', sweepPrice, perBot,
            );
          } catch { /* insufficient shares — skip this bot */ }
        }
      }
    } catch {
      // Best-effort: if the sweep fails, normal tick behavior continues
    }
  }

  // ─────────────── order placement ───────────────

  /**
   * Personality-driven order placement.
   * Each bot type makes decisions differently:
   *   momentum  — chases trends (buy when rising, sell when falling)
   *   contrarian — fades moves (buy dips, sell rips); occasionally places limit orders
   *   fomo      — herds with recent majority direction
   *   passive   — slight buy bias, small orders, infrequent
   */
  private async placeRetailOrder(
    environmentId: string,
    stockId: string,
    bot: RetailBot,
    state: StockSimState,
    openOrders: any[],
  ): Promise<void> {
    try {
      const bestAskOrder = openOrders
        .filter((o: any) => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];

      const bestBidOrder = openOrders
        .filter((o: any) => o.type === 'buy' && (o.status === 'open' || o.status === 'partial'))
        .sort((a: any, b: any) => Number(b.price) - Number(a.price))[0];

      if (!bestAskOrder && !bestBidOrder) return;

      const acfg = ASYMMETRY_CONFIGS[state.asymmetry];
      const priceChange = state.recentPriceChange;
      const priceRising = priceChange > 0.005;
      const priceFalling = priceChange < -0.005;

      // ── Direction decision — personality-driven ──
      let wantsBuy: boolean;

      if (state.targetMid !== null) {
        // Target mode: override personality to converge on target
        const bestAsk = bestAskOrder ? Number(bestAskOrder.price) : null;
        const bestBid = bestBidOrder ? Number(bestBidOrder.price) : null;
        const currentPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2
          : bestAsk ?? bestBid ?? state.targetMid;

        if (currentPrice < state.targetMid) {
          wantsBuy = Math.random() < acfg.targetBias;
        } else if (currentPrice > state.targetMid) {
          wantsBuy = Math.random() < (1 - acfg.targetBias);
        } else {
          wantsBuy = this.personalityDirection(bot, priceRising, priceFalling, state.sentiment);
        }
      } else {
        wantsBuy = this.personalityDirection(bot, priceRising, priceFalling, state.sentiment);
      }

      // ── Order size — log-normal distribution ──
      const rawSize = Math.exp(this.gaussianRandom() * 0.6 + 0.7);
      const units = Math.max(1, Math.min(acfg.maxOrderSize, Math.round(rawSize * bot.riskTolerance)));

      // ── Aggression — personality-dependent ──
      const aggressionRange = this.getAggressionRange(bot.personality, acfg);

      // ── Contrarian limit order (30% of the time) ──
      if (bot.personality === 'contrarian' && Math.random() < 0.3 && bestBidOrder && bestAskOrder) {
        await this.placeContrarianLimit(environmentId, stockId, bot, bestBidOrder, bestAskOrder, priceRising, units);
        bot.lastDirection = wantsBuy ? 'buy' : 'sell';
        return;
      }

      // ── Market-crossing order ──
      if (wantsBuy && bestAskOrder) {
        const askPrice = Number(bestAskOrder.price);
        const pctOffset = aggressionRange[0] + Math.random() * (aggressionRange[1] - aggressionRange[0]);
        const price = +(askPrice * (1 + pctOffset)).toFixed(2);

        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'buy', price, units,
        );
        bot.lastDirection = 'buy';
      } else if (!wantsBuy && bestBidOrder) {
        const bidPrice = Number(bestBidOrder.price);
        const pctOffset = aggressionRange[0] + Math.random() * (aggressionRange[1] - aggressionRange[0]);
        const price = Math.max(0.01, +(bidPrice * (1 - pctOffset)).toFixed(2));

        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'sell', price, units,
        );
        bot.lastDirection = 'sell';
      }
    } catch {
      // Validation failures (insufficient cash/shares) are expected — ignore
    }
  }

  // ─────────────── personality helpers ───────────────

  /**
   * Decide buy/sell direction based on bot personality and market conditions.
   */
  private personalityDirection(
    bot: RetailBot,
    priceRising: boolean,
    priceFalling: boolean,
    sentiment: number,
  ): boolean {
    switch (bot.personality) {
      case 'momentum':
        if (priceRising)  return Math.random() < 0.75;
        if (priceFalling) return Math.random() < 0.25;
        return Math.random() < 0.5 + sentiment * 0.15;

      case 'contrarian':
        if (priceRising)  return Math.random() < 0.30;
        if (priceFalling) return Math.random() < 0.70;
        return Math.random() < 0.5 + sentiment * 0.10;

      case 'fomo':
        // Herd with recent direction — follows what just happened
        if (priceRising)  return Math.random() < 0.80;
        if (priceFalling) return Math.random() < 0.20;
        return Math.random() < 0.5 + sentiment * 0.20;

      case 'passive':
        // Slight buy bias regardless of conditions (dollar-cost averaging)
        return Math.random() < 0.55;

      default:
        return Math.random() < 0.5;
    }
  }

  /**
   * Return [min, max] aggression as fraction of price, based on personality.
   */
  private getAggressionRange(
    personality: RetailPersonality,
    acfg: AsymmetryConfig,
  ): [number, number] {
    switch (personality) {
      case 'momentum':
      case 'fomo':
        // More aggressive — cross the spread further
        return [acfg.aggressionMin * 1.2, acfg.aggressionMax * 1.5];
      case 'contrarian':
        // Less aggressive — tighter crosses
        return [acfg.aggressionMin * 0.5, acfg.aggressionMax * 0.7];
      case 'passive':
        return [acfg.aggressionMin, acfg.aggressionMax];
      default:
        return [acfg.aggressionMin, acfg.aggressionMax];
    }
  }

  /**
   * Contrarian bots occasionally place resting limit orders instead of
   * market-crossing orders — waiting for the price to come to them.
   */
  private async placeContrarianLimit(
    environmentId: string,
    stockId: string,
    bot: RetailBot,
    bestBidOrder: any,
    bestAskOrder: any,
    priceRising: boolean,
    units: number,
  ): Promise<void> {
    try {
      if (priceRising) {
        // Price going up → place a resting buy below current bid (wait for pullback)
        const bidPrice = Number(bestBidOrder.price);
        const offset = 0.005 + Math.random() * 0.01;
        const price = Math.max(0.01, +(bidPrice * (1 - offset)).toFixed(2));
        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'buy', price, units,
        );
        bot.lastDirection = 'buy';
      } else {
        // Price going down or flat → place a resting sell above current ask (wait for bounce)
        const askPrice = Number(bestAskOrder.price);
        const offset = 0.005 + Math.random() * 0.01;
        const price = +(askPrice * (1 + offset)).toFixed(2);
        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'sell', price, units,
        );
        bot.lastDirection = 'sell';
      }
    } catch {
      // Insufficient funds — skip
    }
  }

  // ─────────────── math helpers ───────────────

  /** Box-Muller transform → standard normal sample */
  private gaussianRandom(): number {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
