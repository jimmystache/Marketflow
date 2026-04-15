import { TestBed } from '@angular/core/testing';
import { WalkthroughService } from './walkthrough.service';

describe('WalkthroughService', () => {
  let service: WalkthroughService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WalkthroughService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('start()', () => {
    it('sets active to true and stepIndex to 0', () => {
      service.start();
      expect(service.isActive).toBeTrue();
      expect(service.currentIndex).toBe(0);
    });
  });

  describe('next()', () => {
    it('advances the step index', () => {
      service.start();
      service.next();
      expect(service.currentIndex).toBe(1);
    });

    it('calls finish on the last step', () => {
      service.start();
      for (let i = 0; i < service.totalSteps; i++) {
        service.next();
      }
      expect(service.isActive).toBeFalse();
    });
  });

  describe('close()', () => {
    it('resets active and stepIndex', () => {
      service.start();
      service.next();
      service.close();
      expect(service.isActive).toBeFalse();
      expect(service.currentIndex).toBe(0);
    });
  });

  describe('goTo()', () => {
    it('jumps to a valid step', () => {
      service.start();
      service.goTo(2);
      expect(service.currentIndex).toBe(2);
    });

    it('ignores an out-of-range index', () => {
      service.start();
      service.goTo(999);
      expect(service.currentIndex).toBe(0);
    });
  });

  describe('currentStep', () => {
    it('returns null when not active', () => {
      expect(service.currentStep).toBeNull();
    });

    it('returns the correct step when active', () => {
      service.start();
      expect(service.currentStep).toBeTruthy();
      expect(service.currentStep!.targetId).toBe('wt-account');
    });
  });

  describe('configure()', () => {
    it('includes admin-only steps when isAdmin=true', () => {
      service.configure(true);
      const adminStep = service.steps.find(s => s.adminOnly === true);
      expect(adminStep).toBeTruthy();
      expect(adminStep!.targetId).toBe('wt-bot-controls');
    });

    it('excludes admin-only steps when isAdmin=false', () => {
      service.configure(false);
      const adminStep = service.steps.find(s => s.adminOnly === true);
      expect(adminStep).toBeUndefined();
    });

    it('totalSteps reflects filtered count', () => {
      service.configure(true);
      const adminCount = service.totalSteps;
      service.configure(false);
      const nonAdminCount = service.totalSteps;
      expect(adminCount).toBeGreaterThan(nonAdminCount);
    });

    it('non-admin walkthrough completes without crashing', () => {
      service.configure(false);
      service.start();
      for (let i = 0; i < service.totalSteps; i++) {
        expect(service.currentStep).toBeTruthy();
        service.next();
      }
      expect(service.isActive).toBeFalse();
    });

    it('admin walkthrough includes bot step in the correct position', () => {
      service.configure(true);
      service.start();
      const botStepIdx = service.steps.findIndex(s => s.targetId === 'wt-bot-controls');
      expect(botStepIdx).toBeGreaterThan(-1);
      service.goTo(botStepIdx);
      expect(service.currentStep!.title).toBe('Bot Simulation (Admin)');
    });
  });
});
