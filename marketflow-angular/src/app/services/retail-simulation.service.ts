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

interface RetailBot {
  participantId: string;
  traderId: string;
  username: string;
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
  /** Sentiment bias: 0 = neutral, positive = bullish, negative = bearish */
  sentiment: number;
  endTime: number;
  /** Target tick interval in ms (jitter ±40% applied on top) */
  tickSpeedMs: number;
  /** Optional target price — when set, retail bots bias toward this price */
  targetMid: number | null;
  asymmetry: AsymmetryLevel;
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

      bots.push({
        participantId: participant.id,
        traderId: trader.id,
        username,
      });
    }

    console.log(`✓ Initialised ${count} retail investor bots for stock ${stockId}`);
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

    // Drift sentiment (parameters scaled by information asymmetry level)
    const cfg = ASYMMETRY_CONFIGS[state.asymmetry];
    state.sentiment += (Math.random() - 0.5) * cfg.sentimentStep;
    state.sentiment *= cfg.meanReversion;

    // When a target is active, sweep any mispriced orders first
    if (state.targetMid !== null) {
      await this.sweepMispricedOrders(environmentId, stockId, state);
    }

    // Then continue with normal single-bot order (90/10 biased when target is active)
    const bot = state.bots[Math.floor(Math.random() * state.bots.length)];

    await this.placeRetailOrder(environmentId, stockId, bot, state.sentiment, state.targetMid, state.asymmetry);

    this.scheduleNext(environmentId, stockId);
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
   * Place a single aggressive (marketable) order.
   * - Looks at the current best bid / best ask
   * - Chooses buy or sell based on sentiment + randomness
   * - Prices the order to cross the spread so it executes immediately
   */
  private async placeRetailOrder(
    environmentId: string,
    stockId: string,
    bot: RetailBot,
    sentiment: number,
    targetMid: number | null,
    asymmetry: AsymmetryLevel,
  ): Promise<void> {
    try {
      // Get current order book state
      const openOrders = await this.supabaseService.getEnvironmentOpenOrders(
        environmentId,
        stockId,
      );

      const bestAskOrder = openOrders
        .filter(o => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .sort((a, b) => Number(a.price) - Number(b.price))[0];

      const bestBidOrder = openOrders
        .filter(o => o.type === 'buy' && (o.status === 'open' || o.status === 'partial'))
        .sort((a, b) => Number(b.price) - Number(a.price))[0];

      if (!bestAskOrder && !bestBidOrder) return; // empty book, nothing to hit

      const acfg = ASYMMETRY_CONFIGS[asymmetry];
      let wantsBuy: boolean;

      if (targetMid !== null) {
        // Target-aware mode: determine current price from best bid/ask midpoint
        const bestAsk = bestAskOrder ? Number(bestAskOrder.price) : null;
        const bestBid = bestBidOrder ? Number(bestBidOrder.price) : null;
        const currentPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2
          : bestAsk ?? bestBid ?? targetMid;

        if (currentPrice < targetMid) {
          wantsBuy = Math.random() < acfg.targetBias;
        } else if (currentPrice > targetMid) {
          wantsBuy = Math.random() < (1 - acfg.targetBias);
        } else {
          const buyProb = 0.5 + sentiment * 0.15;
          wantsBuy = Math.random() < Math.max(acfg.buyProbMin, Math.min(acfg.buyProbMax, buyProb));
        }
      } else {
        const buyProb = 0.5 + sentiment * 0.15;
        wantsBuy = Math.random() < Math.max(acfg.buyProbMin, Math.min(acfg.buyProbMax, buyProb));
      }

      const units = 1 + Math.floor(Math.random() * acfg.maxOrderSize);

      if (wantsBuy && bestAskOrder) {
        const askPrice = Number(bestAskOrder.price);
        const pctOffset = acfg.aggressionMin + Math.random() * (acfg.aggressionMax - acfg.aggressionMin);
        const price = +(askPrice * (1 + pctOffset)).toFixed(2);

        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'buy', price, units,
        );
      } else if (!wantsBuy && bestBidOrder) {
        const bidPrice = Number(bestBidOrder.price);
        const pctOffset = acfg.aggressionMin + Math.random() * (acfg.aggressionMax - acfg.aggressionMin);
        const price = Math.max(0.01, +(bidPrice * (1 - pctOffset)).toFixed(2));

        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'sell', price, units,
        );
      }
      // If the desired side has no counterparty, skip this tick
    } catch {
      // Validation failures (insufficient cash/shares) are expected — ignore
    }
  }
}
