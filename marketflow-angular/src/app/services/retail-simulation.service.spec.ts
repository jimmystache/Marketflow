import { TestBed } from '@angular/core/testing';
import { RetailSimulationService } from './retail-simulation.service';
import { SupabaseService } from './supabase.service';
import { OrderExecutionService } from './order-execution.service';

describe('RetailSimulationService', () => {
  let service: RetailSimulationService;
  let supabaseSpy: jasmine.SpyObj<SupabaseService>;
  let orderExecSpy: jasmine.SpyObj<OrderExecutionService>;

  beforeEach(() => {
    supabaseSpy = jasmine.createSpyObj('SupabaseService', [
      'getEnvironment',
      'getOrCreateTrader',
      'getOrCreateParticipant',
      'getOrCreateEnvironmentPosition',
      'getEnvironmentOpenOrders',
    ]);

    orderExecSpy = jasmine.createSpyObj('OrderExecutionService', [
      'placeAndExecuteOrder',
    ]);

    supabaseSpy.getEnvironment.and.returnValue(Promise.resolve({
      starting_cash: 10000,
      starting_shares: 100,
    } as any));
    supabaseSpy.getOrCreateTrader.and.callFake((name: string) =>
      Promise.resolve({ id: `t_${name}`, username: name } as any)
    );
    supabaseSpy.getOrCreateParticipant.and.callFake((_env: string, tid: string) =>
      Promise.resolve({ id: `p_${tid}` } as any)
    );
    supabaseSpy.getOrCreateEnvironmentPosition.and.returnValue(Promise.resolve({} as any));
    supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));

    orderExecSpy.placeAndExecuteOrder.and.returnValue(Promise.resolve({
      success: true,
      order: { id: 'mock_order' },
      message: 'ok',
      tradesExecuted: 0,
    } as any));

    TestBed.configureTestingModule({
      providers: [
        RetailSimulationService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrderExecutionService, useValue: orderExecSpy },
      ],
    });
    service = TestBed.inject(RetailSimulationService);
  });

  afterEach(() => {
    service.stopAll();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('start()', () => {
    it('returns success and marks simulation active', async () => {
      const result = await service.start('env1', 's1', 10, 2);
      expect(result.success).toBeTrue();
      expect(service.isActive('s1')).toBeTrue();
    });

    it('rejects duplicate simulation for same stock', async () => {
      await service.start('env1', 's1', 10, 2);
      const result = await service.start('env1', 's1', 10, 2);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('already running');
    });

    it('accepts custom tickSpeedMs', async () => {
      const result = await service.start('env1', 's1', 10, 2, 400);
      expect(result.success).toBeTrue();
    });

    it('accepts asymmetry level', async () => {
      const result = await service.start('env1', 's1', 10, 2, 800, 'high');
      expect(result.success).toBeTrue();
      expect(service.isActive('s1')).toBeTrue();
    });

    it('defaults to medium asymmetry when not specified', async () => {
      const result = await service.start('env1', 's1', 10, 2);
      expect(result.success).toBeTrue();
    });
  });

  describe('stop()', () => {
    it('removes simulation from active set', async () => {
      await service.start('env1', 's1', 10, 2);
      service.stop('s1');
      expect(service.isActive('s1')).toBeFalse();
    });

    it('is a no-op for non-running stock', () => {
      expect(() => service.stop('nonexistent')).not.toThrow();
    });
  });

  describe('stopAll()', () => {
    it('clears all simulations', async () => {
      await service.start('env1', 's1', 10, 2);
      await service.start('env1', 's2', 10, 2);
      service.stopAll();
      expect(service.isActive()).toBeFalse();
      expect(service.getActiveStockIds()).toEqual([]);
    });
  });

  describe('isActive()', () => {
    it('returns false when nothing is running', () => {
      expect(service.isActive()).toBeFalse();
    });

    it('returns true for specific running stock', async () => {
      await service.start('env1', 's1', 10, 2);
      expect(service.isActive('s1')).toBeTrue();
      expect(service.isActive('s2')).toBeFalse();
    });

    it('returns true (any) when at least one is running', async () => {
      await service.start('env1', 's1', 10, 2);
      expect(service.isActive()).toBeTrue();
    });
  });

  describe('getActiveStockIds()', () => {
    it('returns list of running stock IDs', async () => {
      await service.start('env1', 's1', 10, 2);
      await service.start('env1', 's2', 10, 2);
      const ids = service.getActiveStockIds();
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
      expect(ids.length).toBe(2);
    });
  });

  describe('setTargetPrice()', () => {
    it('sets target on a running simulation', async () => {
      await service.start('env1', 's1', 10, 2);
      service.setTargetPrice('s1', 120);
      expect(service.isActive('s1')).toBeTrue();
    });

    it('is a no-op for non-running stock', () => {
      expect(() => service.setTargetPrice('nonexistent', 120)).not.toThrow();
    });
  });

  describe('setTargetPriceAll()', () => {
    it('sets target on all running simulations', async () => {
      await service.start('env1', 's1', 10, 2);
      await service.start('env1', 's2', 10, 2);
      service.setTargetPriceAll(150, 'env1');
      // No error = success; both still active
      expect(service.isActive('s1')).toBeTrue();
      expect(service.isActive('s2')).toBeTrue();
    });

    it('clears target when null', async () => {
      await service.start('env1', 's1', 10, 2);
      service.setTargetPriceAll(150, 'env1');
      service.setTargetPriceAll(null);
      expect(service.isActive('s1')).toBeTrue();
    });
  });

  describe('sweepMispricedOrders (via setTargetPriceAll)', () => {
    it('sweeps sells below target by placing buy orders', async () => {
      await service.start('env1', 's1', 10, 2);

      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([
        { id: 'sell1', type: 'sell', price: 80, units: 10, filled_units: 0, status: 'open', participant_id: 'p_other' },
        { id: 'sell2', type: 'sell', price: 90, units: 5, filled_units: 0, status: 'open', participant_id: 'p_other' },
        { id: 'sell3', type: 'sell', price: 130, units: 5, filled_units: 0, status: 'open', participant_id: 'p_other' },
      ] as any));

      service.setTargetPriceAll(120, 'env1');

      // Wait for async sweep to complete
      await new Promise(r => setTimeout(r, 50));

      // Should have placed buy orders to sweep sells at 80 and 90 (total 15 units)
      // Distributed across 2 bots = ceil(15/2) = 8 units per bot
      const buyCalls = orderExecSpy.placeAndExecuteOrder.calls.allArgs()
        .filter(args => args[3] === 'buy');
      expect(buyCalls.length).toBe(2); // one per bot
      expect(buyCalls[0][4]).toBe(120.01); // sweep price = target + 0.01
      expect(buyCalls[0][5]).toBe(8); // ceil(15/2)

      // sell3 at 130 is NOT mispriced (above target), so no sell sweep
      const sellCalls = orderExecSpy.placeAndExecuteOrder.calls.allArgs()
        .filter(args => args[3] === 'sell');
      expect(sellCalls.length).toBe(0);
    });

    it('sweeps buys above target by placing sell orders', async () => {
      await service.start('env1', 's1', 10, 2);

      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([
        { id: 'buy1', type: 'buy', price: 150, units: 6, filled_units: 0, status: 'open', participant_id: 'p_other' },
        { id: 'buy2', type: 'buy', price: 50, units: 10, filled_units: 0, status: 'open', participant_id: 'p_other' },
      ] as any));

      service.setTargetPriceAll(100, 'env1');

      await new Promise(r => setTimeout(r, 50));

      // buy1 at 150 is above target → mispriced, total 6 units, ceil(6/2) = 3 per bot
      const sellCalls = orderExecSpy.placeAndExecuteOrder.calls.allArgs()
        .filter(args => args[3] === 'sell');
      expect(sellCalls.length).toBe(2);
      expect(sellCalls[0][4]).toBe(99.99); // target - 0.01
      expect(sellCalls[0][5]).toBe(3);
    });

    it('does nothing when no mispriced orders exist', async () => {
      await service.start('env1', 's1', 10, 2);

      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([
        { id: 'sell1', type: 'sell', price: 130, units: 5, filled_units: 0, status: 'open', participant_id: 'p_other' },
        { id: 'buy1', type: 'buy', price: 90, units: 5, filled_units: 0, status: 'open', participant_id: 'p_other' },
      ] as any));

      service.setTargetPriceAll(110, 'env1');

      await new Promise(r => setTimeout(r, 50));

      // sell at 130 > target 110 → not mispriced; buy at 90 < target 110 → not mispriced
      expect(orderExecSpy.placeAndExecuteOrder).not.toHaveBeenCalled();
    });

    it('does not sweep when target is null', async () => {
      await service.start('env1', 's1', 10, 2);
      service.setTargetPriceAll(null);

      await new Promise(r => setTimeout(r, 50));

      expect(orderExecSpy.placeAndExecuteOrder).not.toHaveBeenCalled();
    });
  });
});
