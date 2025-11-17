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
  csv: string | null = null;
  csvRows: string[][] = [];

  constructor() {
    // Access navigation state for orders
    const nav = window.history.state;
    if (nav && nav.orders) {
      this.orders = nav.orders;
    }
    if (nav && nav.csv) {
      this.csv = nav.csv;
      try {
        if (this.csv) {
          const lines = this.csv.split(/\r?\n/).filter(l => l.trim().length > 0);
          this.csvRows = lines.map(l => l.split(','));
        }
      } catch (e) {
        this.csvRows = [];
      }
    }
  }
}
