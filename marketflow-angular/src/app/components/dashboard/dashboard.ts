import { Component } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, JsonPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  orders: any = null;

  constructor() {
    // Access navigation state for orders
    const nav = window.history.state;
    if (nav && nav.orders) {
      this.orders = nav.orders;
    }
  }
}
