import { TestBed } from '@angular/core/testing';
import { Trading } from './trading';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { BotSimulationService } from '../../services/bot-simulation.service';
import { RetailSimulationService } from '../../services/retail-simulation.service';

describe('Trading', () => {
  let component: Trading;
  let botSimSpy: jasmine.SpyObj<BotSimulationService>;
  let retailSimSpy: jasmine.SpyObj<RetailSimulationService>;

  const supabaseStub: any = {
    unsubscribeAll: () => void 0,
    getOrCreateMarket: async () => null,
    getOrCreateTrader: async () => null,
    getOrCreatePosition: async () => null,
    subscribeToOrders: () => void 0,
    subscribeToTrades: () => void 0,
    subscribeToTrader: () => void 0,
    getTraderOrders: async () => [],
    getEnvironments: async () => [],
    searchEnvironmentByCode: async () => null,
  };

  beforeEach(() => {
    botSimSpy = jasmine.createSpyObj('BotSimulationService', [
      'startSimulation', 'stopSimulation', 'stopAll', 'isSimulationRunning',
      'setTargetPriceAll', 'getActiveStockIds',
    ]);
    retailSimSpy = jasmine.createSpyObj('RetailSimulationService', [
      'start', 'stop', 'stopAll', 'isActive', 'getActiveStockIds', 'setTargetPriceAll',
    ]);

    botSimSpy.startSimulation.and.returnValue(Promise.resolve({ success: true, message: 'ok' }));
    retailSimSpy.start.and.returnValue(Promise.resolve({ success: true, message: 'ok' }));

    TestBed.configureTestingModule({
      imports: [Trading],
      providers: [
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: SupabaseService, useValue: supabaseStub },
        { provide: BotSimulationService, useValue: botSimSpy },
        { provide: RetailSimulationService, useValue: retailSimSpy },
      ],
    });

    const fixture = TestBed.createComponent(Trading);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  describe('activeTab', () => {
    it('defaults to orderbook', () => {
      expect(component.activeTab).toBe('orderbook');
    });

    it('can be set to graph', () => {
      component.setActiveTab('graph');
      expect(component.activeTab).toBe('graph');
    });

    it('can be set to history', () => {
      component.setActiveTab('history');
      expect(component.activeTab).toBe('history');
    });

    it('can be set to myorders', () => {
      component.setActiveTab('myorders');
      expect(component.activeTab).toBe('myorders');
    });
  });

  describe('syncBotTargetPrice()', () => {
    it('sends null when target disabled', () => {
      component.botTargetEnabled = false;
      component.botTargetPrice = 120;
      component.syncBotTargetPrice();
      expect(botSimSpy.setTargetPriceAll).toHaveBeenCalledWith(null, undefined);
      expect(retailSimSpy.setTargetPriceAll).toHaveBeenCalledWith(null, undefined);
    });

    it('sends price when target enabled with valid price', () => {
      component.botTargetEnabled = true;
      component.botTargetPrice = 120;
      (component as any).environmentId = 'env1';
      component.syncBotTargetPrice();
      expect(botSimSpy.setTargetPriceAll).toHaveBeenCalledWith(120, 'env1');
      expect(retailSimSpy.setTargetPriceAll).toHaveBeenCalledWith(120, 'env1');
    });

    it('sends null when target enabled but price is 0', () => {
      component.botTargetEnabled = true;
      component.botTargetPrice = 0;
      component.syncBotTargetPrice();
      expect(botSimSpy.setTargetPriceAll).toHaveBeenCalledWith(null, undefined);
      expect(retailSimSpy.setTargetPriceAll).toHaveBeenCalledWith(null, undefined);
    });
  });

  describe('toggleBotTarget()', () => {
    it('toggles botTargetEnabled', () => {
      component.botTargetEnabled = false;
      component.toggleBotTarget();
      expect(component.botTargetEnabled).toBeTrue();
      component.toggleBotTarget();
      expect(component.botTargetEnabled).toBeFalse();
    });
  });

  describe('leaveEnvironment()', () => {
    it('stops all bot simulations', () => {
      component.leaveEnvironment();
      expect(botSimSpy.stopAll).toHaveBeenCalled();
      expect(retailSimSpy.stopAll).toHaveBeenCalled();
    });

    it('clears active sim sets', () => {
      component.activeMmSimStocks.add('s1');
      component.activeRetailSimStocks.add('s2');
      component.leaveEnvironment();
      expect(component.activeMmSimStocks.size).toBe(0);
      expect(component.activeRetailSimStocks.size).toBe(0);
    });

    it('resets connection state', () => {
      (component as any).isConnected = true;
      component.leaveEnvironment();
      expect((component as any).isConnected).toBeFalse();
    });
  });
});
