import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  HostListener,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WalkthroughService, WalkthroughStep } from '../../services/walkthrough.service';

interface Rect { top: number; left: number; width: number; height: number; }

@Component({
  selector: 'app-walkthrough-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './walkthrough-overlay.html',
  styleUrls: ['./walkthrough-overlay.css'],
})
export class WalkthroughOverlayComponent implements OnInit, OnDestroy {
  isActive = false;
  step: WalkthroughStep | null = null;
  stepIndex = 0;

  /** Spotlight ring geometry (px) */
  ringStyle: Record<string, string> = {};
  /** Tooltip card geometry (px) */
  tooltipStyle: Record<string, string> = {};

  /** Drive the tooltip fade independently from the ring slide */
  tooltipVisible = false;

  private subs: Subscription[] = [];
  private PAD = 1;           // padding around highlighted element
  private TOOLTIP_W = 300;    // tooltip width in px

  constructor(
    public wt: WalkthroughService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  get totalSteps(): number { return this.wt.totalSteps; }

  ngOnInit(): void {
    this.subs.push(
      this.wt.active$.subscribe(active => {
        this.isActive = active;
        if (!active) {
          this.tooltipVisible = false;
          this.step = null;
        }
        this.cdr.detectChanges();
      }),
      this.wt.stepIndex$.subscribe(idx => {
        if (!this.wt.isActive) return;
        this.stepIndex = idx;
        this.step = this.wt.currentStep;
        // Fade out, move ring, fade in
        this.tooltipVisible = false;
        this.cdr.detectChanges();
        // Give the DOM a tick so the target element is rendered
        setTimeout(() => this.positionStep(), 80);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Re-measure on window resize */
  @HostListener('window:resize')
  onResize(): void {
    if (this.isActive && this.step) this.positionStep();
  }

  // ── Navigation ────────────────────────────────────────────────
  next(): void   { this.wt.next(); }
  close(): void  { this.wt.close(); }
  isLast(): boolean { return this.stepIndex === this.wt.totalSteps - 1; }

  // ── Positioning ──────────────────────────────────────────────
  private positionStep(): void {
    if (!this.step) return;

    const el = document.getElementById(this.step.targetId);
    if (!el) {
      // Element not found – show tooltip centered if element missing
      this.ringStyle = { display: 'none' };
      this.tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: this.TOOLTIP_W + 'px' };
      this.tooltipVisible = true;
      this.cdr.detectChanges();
      return;
    }

    const raw = el.getBoundingClientRect();
    const p   = this.PAD;

    // Spotlight ring
    this.ringStyle = {
      top:    (raw.top    - p) + 'px',
      left:   (raw.left   - p) + 'px',
      width:  (raw.width  + p * 2) + 'px',
      height: (raw.height + p * 2) + 'px',
      display: 'block',
    };

    // Tooltip placement
    this.tooltipStyle = this.calcTooltipStyle(raw, this.step.placement ?? 'bottom');

    setTimeout(() => {
      this.tooltipVisible = true;
      this.cdr.detectChanges();
      // After the tooltip is visible, measure its actual rendered height and
      // clamp so it never overflows the bottom of the viewport.
      setTimeout(() => this.clampTooltipBottom(), 0);
    }, 120);

    this.cdr.detectChanges();
  }

  /** Measures the rendered tooltip and nudges `top` up if it overflows the viewport. */
  private clampTooltipBottom(): void {
    const tip = document.querySelector('.wt-tooltip') as HTMLElement | null;
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    const overflow = rect.bottom - (window.innerHeight - 12);
    if (overflow > 0) {
      const currentTop = parseFloat(this.tooltipStyle['top'] ?? '0');
      this.tooltipStyle = { ...this.tooltipStyle, top: Math.max(10, currentTop - overflow) + 'px' };
      this.cdr.detectChanges();
    }
  }

  private calcTooltipStyle(r: DOMRect, placement: string): Record<string, string> {
    const gap = 18;
    const W   = this.TOOLTIP_W;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const p   = this.PAD;

    let top  = 0;
    let left = 0;

    switch (placement) {
      case 'right':
        left = r.right + p + gap;
        top  = r.top + r.height / 2 - 100;
        if (left + W > vw - 10) left = r.left - W - gap - p;
        break;
      case 'left':
        left = r.left - W - 15 - gap - p;
        // Align bottom of tooltip with bottom of element so it naturally sits toward the top
        top  = r.bottom - 240;
        if (left < 10) left = r.right + gap + p;
        break;
      case 'top':
        top  = r.top - 200 - gap - p;
        left = r.left + r.width / 2 - W / 2;
        if (top < 10) top = r.bottom + gap + p;
        break;
      case 'bottom':
      default:
        top  = r.bottom + gap + p;
        left = r.left + r.width / 2 - W / 2;
        if (top + 200 > vh - 10) top = r.top - 200 - gap - p;
        break;
    }

    // Clamp to viewport
    left = Math.max(10, Math.min(left, vw - W - 10));
    top  = Math.max(10, Math.min(top, vh  - 220));

    return { top: top + 'px', left: left + 'px', width: W + 'px' };
  }
}
