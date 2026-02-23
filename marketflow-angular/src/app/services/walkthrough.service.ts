import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface WalkthroughStep {
  /** CSS selector or element id (prefixed with #) for the element to spotlight */
  targetId: string;
  title: string;
  body: string;
  /** Where to anchor the tooltip relative to the element */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

@Injectable({ providedIn: 'root' })
export class WalkthroughService {
  readonly steps: WalkthroughStep[] = [
    {
      targetId: 'wt-account',
      title: 'Your Cash Balance',
      body: '💵 <b>Settled Cash</b> is money that has cleared from completed trades. '
          + '<b>Available Cash</b> is what you can spend right now – it drops as soon as you '
          + 'place a buy order, even before it fills.',
      placement: 'bottom',
    },
    {
      targetId: 'wt-order-entry',
      title: 'Placing a Trade',
      body: '📋 Choose <b>BUY</b> or <b>SELL</b>, set the <b>Units</b> (how many shares) and '
          + 'the <b>Price</b> (limit price you\'re willing to trade at). '
          + 'Tip: click any row in the order book to auto-fill the price, then hit <b>Place Order</b>.',
      placement: 'right',
    },
    {
      targetId: 'wt-stock-selector',
      title: 'Switching Stocks',
      body: '🔀 Use the <b>‹ ›</b> arrows or the dropdown in the header to switch between the '
          + 'stocks in this environment. Each stock has its own order book, trade history, and price chart.',
      placement: 'bottom',
    },
    {
      targetId: 'wt-market-stats',
      title: 'Market Stats Panel',
      body: '📊 See live <b>Best Bid / Ask</b>, <b>Spread</b>, last traded price, and your open '
          + 'position P&L at a glance. Want to understand these terms? Visit the '
          + '<b>Key Terms</b> tutorial from the home screen.',
      placement: 'left',
    },
    {
      targetId: 'wt-chat',
      title: 'Your AI Trading Assistant',
      body: '🤖 Click the bubble in the bottom-right to open the chat. '
          + 'Ask it to <b>buy or sell</b> for you, explain market data, predict price moves, '
          + 'or run a bot simulation. Type <b>help</b> inside the chat to see all commands.',
      placement: 'left',
    },
  ];

  private _active = new BehaviorSubject<boolean>(false);
  private _stepIndex = new BehaviorSubject<number>(0);

  readonly active$ = this._active.asObservable();
  readonly stepIndex$ = this._stepIndex.asObservable();

  get isActive(): boolean { return this._active.value; }
  get currentIndex(): number { return this._stepIndex.value; }
  get currentStep(): WalkthroughStep | null {
    return this._active.value ? (this.steps[this._stepIndex.value] ?? null) : null;
  }
  get totalSteps(): number { return this.steps.length; }

  start(): void {
    this._active.next(true);    
    this._stepIndex.next(0);
  }

  next(): void {
    const next = this._stepIndex.value + 1;
    if (next >= this.steps.length) {
      this.finish();
    } else {
      this._stepIndex.next(next);
    }
  }

  goTo(index: number): void {
    if (index >= 0 && index < this.steps.length) {
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
