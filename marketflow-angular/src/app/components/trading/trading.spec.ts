import { TestBed } from '@angular/core/testing';
import { Trading } from './trading';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

describe('Trading', () => {
  it('creates', () => {
    TestBed.configureTestingModule({
      imports: [Trading],
      providers: [
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        {
          provide: SupabaseService,
          useValue: {
            unsubscribeAll: () => void 0,
            getOrCreateMarket: async () => null,
            getOrCreateTrader: async () => null,
            getOrCreatePosition: async () => null,
            subscribeToOrders: () => void 0,
            subscribeToTrades: () => void 0,
            subscribeToTrader: () => void 0,
            getTraderOrders: async () => []
          }
        }
      ]
    });

    const fixture = TestBed.createComponent(Trading);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
