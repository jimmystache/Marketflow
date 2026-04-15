import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface WalkthroughStep {
  /** CSS selector or element id (prefixed with #) for the element to spotlight */
  targetId: string;
  title: string;
  body: string;
  /** Where to anchor the tooltip relative to the element */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** When true, this step is only shown to environment admins */
  adminOnly?: boolean;
}

@Injectable({ providedIn: 'root' })
export class WalkthroughService {
  private readonly allSteps: WalkthroughStep[] = [
    {
      targetId: 'wt-account',
      title: 'Your Cash Balance',
      body: '<b>Settled Cash</b> is money that has cleared from completed trades. '
          + '<b>Available Cash</b> is what you can spend right now \u2013 it drops as soon as you '
          + 'place a buy order, even before it fills.',
      placement: 'bottom',
    },
    {
      targetId: 'wt-order-entry',
      title: 'Placing a Trade',
      body: 'Choose <b>BUY</b> or <b>SELL</b>, set the <b>Units</b> (how many shares) and '
          + 'the <b>Price</b> (limit price you\'re willing to trade at). '
          + 'Tip: click any row in the order book to auto-fill the price, then hit <b>Place Order</b>.',
      placement: 'right',
    },
    {
      targetId: 'wt-stock-selector',
      title: 'Switching Stocks',
      body: 'Use the <b>\u2039 \u203a</b> arrows or the dropdown in the header to switch between the '
          + 'stocks in this environment. Each stock has its own order book, trade history, and price chart.',
      placement: 'bottom',
    },
    {
      targetId: 'wt-market-stats',
      title: 'Market Stats Panel',
      body: 'See live <b>Best Bid / Ask</b>, <b>Spread</b>, last traded price, and your open '
          + 'position P&L at a glance. Want to understand these terms? Visit the '
          + '<b>Key Terms</b> tutorial from the home screen.',
      placement: 'left',
    },
    {
      targetId: 'wt-bot-controls',
      title: 'Bot Simulation (Admin)',
      body: 'As an admin you can run <b>Market Maker</b> and <b>Retail</b> bot simulations to '
          + 'generate realistic trading activity. Adjust <b>Tick Speed</b> to control how fast '
          + 'bots trade, and use <b>Target Price</b> to steer the stock price to a specific value.',
      placement: 'right',
      adminOnly: true,
    },
    {
      targetId: 'wt-chat',
      title: 'Your AI Trading Assistant',
      body: 'Click the bubble in the bottom-right to open the chat. '
          + 'Ask it to <b>buy or sell</b> for you, explain market data, predict price moves, '
          + 'or run a bot simulation. Type <b>help</b> inside the chat to see all commands.',
      placement: 'left',
    },
  ];

  /** Filtered steps for the current session */
  private _steps: WalkthroughStep[] = this.allSteps.filter(s => !s.adminOnly);

  private _active = new BehaviorSubject<boolean>(false);
  private _stepIndex = new BehaviorSubject<number>(0);

  readonly active$ = this._active.asObservable();
  readonly stepIndex$ = this._stepIndex.asObservable();

  get steps(): WalkthroughStep[] { return this._steps; }
  get isActive(): boolean { return this._active.value; }
  get currentIndex(): number { return this._stepIndex.value; }
  get currentStep(): WalkthroughStep | null {
    return this._active.value ? (this._steps[this._stepIndex.value] ?? null) : null;
  }
  get totalSteps(): number { return this._steps.length; }

  /** Call before start() to include or exclude admin-only steps. */
  configure(isAdmin: boolean): void {
    this._steps = isAdmin
      ? this.allSteps
      : this.allSteps.filter(s => !s.adminOnly);
  }

  start(): void {
    this._active.next(true);
    this._stepIndex.next(0);
  }

  next(): void {
    const next = this._stepIndex.value + 1;
    if (next >= this._steps.length) {
      this.finish();
    } else {
      this._stepIndex.next(next);
    }
  }

  goTo(index: number): void {
    if (index >= 0 && index < this._steps.length) {
      this._stepIndex.next(index);
    }
  }

  close(): void {
    this._active.next(false);
    this._stepIndex.next(0);
  }

  finish(): void {
    this.close();
  }
}
