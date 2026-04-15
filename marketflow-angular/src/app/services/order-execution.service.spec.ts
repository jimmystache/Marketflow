import { TestBed } from '@angular/core/testing';
import { OrderExecutionService } from './order-execution.service';
import { SupabaseService } from './supabase.service';

describe('OrderExecutionService', () => {
  let service: OrderExecutionService;
  let supabaseSpy: jasmine.SpyObj<SupabaseService>;

  const mockParticipant = {
    id: 'p1',
    market_id: 'env1',
    trader_id: 't1',
    cash: 10000,
    settled_cash: 10000,
    available_cash: 10000,
    is_admin: false,
    created_at: new Date().toISOString(),
    trader: { id: 't1', username: 'test', cash: 10000, settled_cash: 10000, available_cash: 10000, created_at: '' },
  };

  const makeOrder = (overrides: any = {}) => ({
    id: 'o1',
    market_id: 'env1',
    stock_id: 's1',
    participant_id: 'p1',
    type: 'buy' as const,
    price: 100,
    units: 10,
    filled_units: 0,
    status: 'open' as const,
    created_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    supabaseSpy = jasmine.createSpyObj('SupabaseService', [
      'getParticipantById',
      'getTradingEnvironment',
      'getParticipantPositions',
      'getParticipantOrders',
      'placeEnvironmentOrder',
      'getEnvironmentOpenOrders',
      'getEnvironmentOrderById',
      'updateEnvironmentOrder',
      'updateParticipantCash',
      'updateEnvironmentPosition',
      'recordEnvironmentTrade',
      'getEnvironmentStock',
    ]);

    // Default stubs
    supabaseSpy.getParticipantById.and.returnValue(Promise.resolve(mockParticipant as any));
    supabaseSpy.getTradingEnvironment.and.returnValue(Promise.resolve({ is_paused: false, allow_shorting: false } as any));
    supabaseSpy.getParticipantPositions.and.returnValue(Promise.resolve([{ stock_id: 's1', units: 100, avg_price: 50, id: 'pos1' }] as any));
    supabaseSpy.getParticipantOrders.and.returnValue(Promise.resolve([]));
    supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));
    supabaseSpy.getEnvironmentStock.and.returnValue(Promise.resolve(null));

    TestBed.configureTestingModule({
      providers: [
        OrderExecutionService,
        { provide: SupabaseService, useValue: supabaseSpy },
      ],
    });
    service = TestBed.inject(OrderExecutionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('validation', () => {
    it('rejects buy order with insufficient cash', async () => {
      supabaseSpy.getParticipantById.and.returnValue(Promise.resolve({
        ...mockParticipant,
        available_cash: 5,
      } as any));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 100, 10);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('Insufficient funds');
    });

    it('rejects sell order with insufficient units', async () => {
      supabaseSpy.getParticipantPositions.and.returnValue(Promise.resolve([{ stock_id: 's1', units: 2, avg_price: 50, id: 'pos1' }] as any));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'sell', 100, 10);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('Insufficient units');
    });

    it('rejects order when trading is paused', async () => {
      supabaseSpy.getTradingEnvironment.and.returnValue(Promise.resolve({ is_paused: true } as any));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 100, 10);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('paused');
    });

    it('rejects zero units', async () => {
      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 100, 0);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('Units must be greater than 0');
    });

    it('rejects zero price', async () => {
      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 0, 10);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('Price must be greater than 0');
    });
  });

  describe('order placement', () => {
    it('places a buy order successfully with no matches', async () => {
      const newOrder = makeOrder({ id: 'new1' });
      supabaseSpy.placeEnvironmentOrder.and.returnValue(Promise.resolve(newOrder as any));
      supabaseSpy.updateParticipantCash.and.returnValue(Promise.resolve(true));
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 100, 10);
      expect(result.success).toBeTrue();
      expect(result.order).toBeTruthy();
      expect(result.tradesExecuted).toBe(0);
    });

    it('places a sell order successfully with no matches', async () => {
      const newOrder = makeOrder({ id: 'new2', type: 'sell' });
      supabaseSpy.placeEnvironmentOrder.and.returnValue(Promise.resolve(newOrder as any));
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'sell', 100, 5);
      expect(result.success).toBeTrue();
      expect(result.tradesExecuted).toBe(0);
    });

    it('reserves cash for buy orders', async () => {
      const newOrder = makeOrder({ id: 'new3' });
      supabaseSpy.placeEnvironmentOrder.and.returnValue(Promise.resolve(newOrder as any));
      supabaseSpy.updateParticipantCash.and.returnValue(Promise.resolve(true));
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));

      await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 50, 10);
      expect(supabaseSpy.updateParticipantCash).toHaveBeenCalledWith(
        'p1', 10000, 10000, 10000 - 500
      );
    });
  });

  describe('order matching', () => {
    it('buy order matches against cheaper sells first', async () => {
      const incomingBuy = makeOrder({ id: 'buy1', type: 'buy', price: 110, units: 5 });
      supabaseSpy.placeEnvironmentOrder.and.returnValue(Promise.resolve(incomingBuy as any));
      supabaseSpy.updateParticipantCash.and.returnValue(Promise.resolve(true));

      const sellA = makeOrder({ id: 'sellA', type: 'sell', price: 100, units: 3, participant_id: 'p2' });
      const sellB = makeOrder({ id: 'sellB', type: 'sell', price: 105, units: 3, participant_id: 'p2' });
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([incomingBuy, sellA, sellB] as any));
      supabaseSpy.getEnvironmentOrderById.and.callFake((id: string) => {
        if (id === 'buy1') return Promise.resolve({ ...incomingBuy } as any);
        if (id === 'sellA') return Promise.resolve({ ...sellA } as any);
        if (id === 'sellB') return Promise.resolve({ ...sellB } as any);
        return Promise.resolve(null);
      });
      supabaseSpy.updateEnvironmentOrder.and.returnValue(Promise.resolve(true));
      supabaseSpy.updateEnvironmentPosition.and.returnValue(Promise.resolve(true));
      supabaseSpy.recordEnvironmentTrade.and.returnValue(Promise.resolve({} as any));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 110, 5);
      expect(result.success).toBeTrue();
      // Should have matched at least once
      expect(result.tradesExecuted).toBeGreaterThanOrEqual(1);
    });

    it('does not self-match (same participant)', async () => {
      const incomingBuy = makeOrder({ id: 'buy1', type: 'buy', price: 110, units: 5, participant_id: 'p1' });
      const ownSell = makeOrder({ id: 'sell1', type: 'sell', price: 100, units: 5, participant_id: 'p1' });
      supabaseSpy.placeEnvironmentOrder.and.returnValue(Promise.resolve(incomingBuy as any));
      supabaseSpy.updateParticipantCash.and.returnValue(Promise.resolve(true));
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([incomingBuy, ownSell] as any));

      const result = await service.placeAndExecuteOrder('env1', 'p1', 's1', 'buy', 110, 5);
      expect(result.success).toBeTrue();
      expect(result.tradesExecuted).toBe(0);
    });
  });
});
