import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnvironmentSetup } from './environment-setup';

describe('EnvironmentSetup', () => {
  let component: EnvironmentSetup;
  let fixture: ComponentFixture<EnvironmentSetup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentSetup]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnvironmentSetup);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
