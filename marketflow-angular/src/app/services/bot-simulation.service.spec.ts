import { TestBed } from '@angular/core/testing';
import { BotSimulationService } from './bot-simulation.service';
import { SupabaseService } from './supabase.service';
import { OrderExecutionService } from './order-execution.service';

describe('BotSimulationService', () => {
  let service: BotSimulationService;
  let supabaseSpy: jasmine.SpyObj<SupabaseService>;
  let orderExecSpy: jasmine.SpyObj<OrderExecutionService>;

  beforeEach(() => {
    supabaseSpy = jasmine.createSpyObj('SupabaseService', [
      'getEnvironment',
      'getEnvironmentTrades',
      'getEnvironmentStock',
      'getOrCreateTrader',
      'getOrCreateParticipant',
      'getOrCreateEnvironmentPosition',
      'cancelEnvironmentOrder',
      'getEnvironmentOpenOrders',
    ]);

    orderExecSpy = jasmine.createSpyObj('OrderExecutionService', [
      'placeAndExecuteOrder',
    ]);

    // Default stubs
    supabaseSpy.getEnvironment.and.returnValue(Promise.resolve({
      starting_cash: 10000,
      starting_shares: 100,
    } as any));
    supabaseSpy.getEnvironmentTrades.and.returnValue(Promise.resolve([]));
    supabaseSpy.getEnvironmentStock.and.returnValue(Promise.resolve({ starting_price: 100 } as any));
    supabaseSpy.getOrCreateTrader.and.callFake((name: string) =>
      Promise.resolve({ id: `t_${name}`, username: name } as any)
    );
    supabaseSpy.getOrCreateParticipant.and.callFake((_env: string, tid: string) =>
      Promise.resolve({ id: `p_${tid}` } as any)
    );
    supabaseSpy.getOrCreateEnvironmentPosition.and.returnValue(Promise.resolve({} as any));
    supabaseSpy.cancelEnvironmentOrder.and.returnValue(Promise.resolve(true));
    supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([]));

    orderExecSpy.placeAndExecuteOrder.and.returnValue(Promise.resolve({
      success: true,
      order: { id: 'mock_order' },
      message: 'ok',
      tradesExecuted: 0,
    } as any));

    TestBed.configureTestingModule({
      providers: [
        BotSimulationService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrderExecutionService, useValue: orderExecSpy },
      ],
    });
    service = TestBed.inject(BotSimulationService);
  });

  afterEach(() => {
    service.stopAll();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('startSimulation()', () => {
    it('returns success and marks simulation running', async () => {
      const result = await service.startSimulation('env1', 's1', 'normal', 10, 2);
      expect(result.success).toBeTrue();
      expect(service.isSimulationRunning('s1')).toBeTrue();
    });

    it('rejects duplicate simulation for same stock', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      const result = await service.startSimulation('env1', 's1', 'normal', 10, 2);
      expect(result.success).toBeFalse();
      expect(result.message).toContain('already running');
    });

    it('accepts custom tickSpeedMs', async () => {
      const result = await service.startSimulation('env1', 's1', 'normal', 10, 2, 400);
      expect(result.success).toBeTrue();
    });

    it('uses trade price as mid when trades exist', async () => {
      supabaseSpy.getEnvironmentTrades.and.returnValue(Promise.resolve([{ price: 55 }] as any));
      const result = await service.startSimulation('env1', 's1', 'normal', 10, 2);
      expect(result.success).toBeTrue();
    });
  });

  describe('stopSimulation()', () => {
    it('removes simulation from active set', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      service.stopSimulation('s1');
      expect(service.isSimulationRunning('s1')).toBeFalse();
    });

    it('is a no-op for non-running stock', () => {
      expect(() => service.stopSimulation('nonexistent')).not.toThrow();
    });
  });

  describe('stopAll()', () => {
    it('clears all simulations', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      await service.startSimulation('env1', 's2', 'normal', 10, 2);
      service.stopAll();
      expect(service.isSimulationRunning()).toBeFalse();
      expect(service.getActiveStockIds()).toEqual([]);
    });
  });

  describe('isSimulationRunning()', () => {
    it('returns false when nothing is running', () => {
      expect(service.isSimulationRunning()).toBeFalse();
    });

    it('returns true for a specific running stock', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      expect(service.isSimulationRunning('s1')).toBeTrue();
      expect(service.isSimulationRunning('s2')).toBeFalse();
    });
  });

  describe('getActiveStockIds()', () => {
    it('returns list of running stock IDs', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      await service.startSimulation('env1', 's2', 'normal', 10, 2);
      const ids = service.getActiveStockIds();
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
    });
  });

  describe('setTargetPrice()', () => {
    it('sets target on a running simulation', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      service.setTargetPrice('s1', 120);
      // No error thrown = success
      expect(service.isSimulationRunning('s1')).toBeTrue();
    });

    it('is a no-op for non-running stock', () => {
      expect(() => service.setTargetPrice('nonexistent', 120)).not.toThrow();
    });
  });

  describe('setTargetPriceAll()', () => {
    it('sets target on all running simulations', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      await service.startSimulation('env1', 's2', 'normal', 10, 2);
      service.setTargetPriceAll(150, 'env1');
      // Should have called cancelStaleOrders for both (via getEnvironmentOpenOrders)
      expect(supabaseSpy.getEnvironmentOpenOrders).toHaveBeenCalled();
    });

    it('clears target when null', async () => {
      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      service.setTargetPriceAll(150, 'env1');
      service.setTargetPriceAll(null);
      // Should not throw
      expect(service.isSimulationRunning('s1')).toBeTrue();
    });
  });

  describe('cancelStaleOrders (via setTargetPriceAll)', () => {
    it('cancels sells below target when moving up', async () => {
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([
        { id: 'sell1', type: 'sell', price: 80, status: 'open', participant_id: 'p1' },
        { id: 'sell2', type: 'sell', price: 130, status: 'open', participant_id: 'p1' },
        { id: 'buy1', type: 'buy', price: 70, status: 'open', participant_id: 'p1' },
      ] as any));
      supabaseSpy.getEnvironmentTrades.and.returnValue(Promise.resolve([{ price: 90 }] as any));

      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      service.setTargetPriceAll(120, 'env1');

      // Wait for async cancel to complete
      await new Promise(r => setTimeout(r, 50));

      // sell1 at 80 < target 120 should be cancelled; sell2 at 130 >= target should NOT
      const cancelledIds = supabaseSpy.cancelEnvironmentOrder.calls.allArgs().map(a => a[0]);
      expect(cancelledIds).toContain('sell1');
      expect(cancelledIds).not.toContain('sell2');
      expect(cancelledIds).not.toContain('buy1');
    });

    it('cancels buys above target when moving down', async () => {
      supabaseSpy.getEnvironmentOpenOrders.and.returnValue(Promise.resolve([
        { id: 'buy1', type: 'buy', price: 110, status: 'open', participant_id: 'p1' },
        { id: 'buy2', type: 'buy', price: 50, status: 'open', participant_id: 'p1' },
        { id: 'sell1', type: 'sell', price: 120, status: 'open', participant_id: 'p1' },
      ] as any));
      supabaseSpy.getEnvironmentTrades.and.returnValue(Promise.resolve([{ price: 100 }] as any));

      await service.startSimulation('env1', 's1', 'normal', 10, 2);
      service.setTargetPriceAll(60, 'env1');

      await new Promise(r => setTimeout(r, 50));

      const cancelledIds = supabaseSpy.cancelEnvironmentOrder.calls.allArgs().map(a => a[0]);
      expect(cancelledIds).toContain('buy1');
      expect(cancelledIds).not.toContain('buy2');
      expect(cancelledIds).not.toContain('sell1');
    });
  });
});
