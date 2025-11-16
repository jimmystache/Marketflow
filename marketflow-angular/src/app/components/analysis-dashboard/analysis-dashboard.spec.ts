import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalysisDashboard } from './analysis-dashboard';

describe('AnalysisDashboard', () => {
  let component: AnalysisDashboard;
  let fixture: ComponentFixture<AnalysisDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalysisDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
