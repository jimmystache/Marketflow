import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface TradingContext {
  environmentId: string | null;
  participantId: string | null;
  stockId: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class TradingContextService {
  private contextSubject = new BehaviorSubject<TradingContext>({
    environmentId: null,
    participantId: null,
    stockId: null
  });

  public context$ = this.contextSubject.asObservable();

  constructor() {}

  /**
   * Set the current trading context
   */
  setContext(context: Partial<TradingContext>): void {
    const current = this.contextSubject.value;
    this.contextSubject.next({
      ...current,
      ...context
    });
  }

  /**
   * Get the current context snapshot
   */
  getContext(): TradingContext {
    return this.contextSubject.value;
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.contextSubject.next({
      environmentId: null,
      participantId: null,
      stockId: null
    });
  }
}
