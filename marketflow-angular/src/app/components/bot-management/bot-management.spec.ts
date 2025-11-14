import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BotManagement } from './bot-management';

describe('BotManagement', () => {
  let component: BotManagement;
  let fixture: ComponentFixture<BotManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BotManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BotManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
