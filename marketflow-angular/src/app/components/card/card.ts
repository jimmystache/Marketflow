import { Component, Input } from '@angular/core';

@Component({
  selector: 'card',
  standalone: true,
  template: `
    <div class="card">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <button>{{ buttonLabel }}</button>
    </div>
  `,
  styles: [`
    .card { padding: 1rem; border: 1px solid #ccc; border-radius: 0.5rem; }
  `]
})
export class Card {
  @Input() title!: string;
  @Input() description!: string;
  @Input() icon!: string;
  @Input() buttonLabel!: string;
}
