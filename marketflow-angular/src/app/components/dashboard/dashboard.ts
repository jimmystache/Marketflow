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
  message: string | null = null;
  trades: any[] = [];

  constructor() {
    // Access navigation state for orders, csv, or message (no trades)
    const nav = window.history.state;
    if (nav && nav.orders) {
      this.orders = nav.orders;
    }
    if (nav && nav.message) {
      this.message = nav.message;
      this.trades = nav.trades || [];
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
