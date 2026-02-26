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
 */

interface RetailBot {
  participantId: string;
  traderId: string;
  username: string;
}

@Injectable({
  providedIn: 'root',
})
export class RetailSimulationService {
  private isRunning = false;
  private timeoutHandle: any = null;
  private bots: RetailBot[] = [];

  /** Sentiment bias: 0 = neutral, positive = bullish, negative = bearish */
  private sentiment = 0;

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
  ): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: false, message: 'Retail simulation already running' };
    }

    try {
      await this.initBots(environmentId, stockId, numberOfBots);
      this.sentiment = 0;
      this.isRunning = true;
      const endTime = Date.now() + durationSeconds * 1000;
      this.scheduleNext(environmentId, stockId, endTime);
      return {
        success: true,
        message: `Retail simulation started: ${numberOfBots} investors for ${durationSeconds}s`,
      };
    } catch (error: any) {
      this.isRunning = false;
      return { success: false, message: error.message };
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.bots = [];
  }

  isActive(): boolean {
    return this.isRunning;
  }

  // ─────────────── init ───────────────

  private async initBots(
    environmentId: string,
    stockId: string,
    count: number,
  ): Promise<void> {
    const environment = await this.supabaseService.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found');

    this.bots = [];

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

      this.bots.push({
        participantId: participant.id,
        traderId: trader.id,
        username,
      });
    }

    console.log(`✓ Initialised ${count} retail investor bots`);
  }

  // ─────────────── tick loop ───────────────

  private scheduleNext(environmentId: string, stockId: string, endTime: number): void {
    // Retail orders arrive every 800–2500 ms (slower than market makers)
    const delay = 800 + Math.floor(Math.random() * 1700);
    this.timeoutHandle = setTimeout(
      () => this.tick(environmentId, stockId, endTime),
      delay,
    );
  }

  private async tick(
    environmentId: string,
    stockId: string,
    endTime: number,
  ): Promise<void> {
    if (!this.isRunning) return;
    if (Date.now() >= endTime) {
      this.stop();
      console.log('🛒 Retail simulation completed');
      return;
    }

    // Drift sentiment slowly (mean-reverting random walk)
    this.sentiment += (Math.random() - 0.5) * 0.3;
    this.sentiment *= 0.95; // mean-revert toward 0

    // Pick a random bot
    const bot = this.bots[Math.floor(Math.random() * this.bots.length)];

    await this.placeRetailOrder(environmentId, stockId, bot);

    this.scheduleNext(environmentId, stockId, endTime);
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

      // Decide direction: sentiment biases the coin flip
      // sentiment > 0 → more likely to buy, < 0 → more likely to sell
      const buyProb = 0.5 + this.sentiment * 0.15; // clamps roughly 0.2–0.8
      const wantsBuy = Math.random() < Math.max(0.15, Math.min(0.85, buyProb));

      const units = 1 + Math.floor(Math.random() * 8); // 1–8 units

      if (wantsBuy && bestAskOrder) {
        // Buy at or slightly above best ask to guarantee execution
        const askPrice = Number(bestAskOrder.price);
        const aggression = +(Math.random() * 0.05).toFixed(2); // 0–$0.05 above ask
        const price = +(askPrice + aggression).toFixed(2);

        await this.orderExecutionService.placeAndExecuteOrder(
          environmentId, bot.participantId, stockId, 'buy', price, units,
        );
      } else if (!wantsBuy && bestBidOrder) {
        // Sell at or slightly below best bid
        const bidPrice = Number(bestBidOrder.price);
        const aggression = +(Math.random() * 0.05).toFixed(2);
        const price = Math.max(0.01, +(bidPrice - aggression).toFixed(2));

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
