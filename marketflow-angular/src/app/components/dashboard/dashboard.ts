import { Component } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Register Chart.js plugins and scales
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TradeData {
  symbol: string;
  price: number;
  elapsedSeconds: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../analysis/analysis.css'],
  imports: [CommonModule, BaseChartDirective, JsonPipe, FormsModule],
})
export class Dashboard {
  orders: any = null;
  csv: string | null = null;
  csvRows: string[][] = [];
  message: string | null = null;
  trades: any[] = [];
  chartConfig: ChartConfiguration<'line'> | null = null;
  showChart = false;
  symbols: Set<string> = new Set();
  marketplace: string | null = null;
  sessionID: string | null = null;
  sessions: any[] = [];
  selectedSession: string = '';
  isLoadingSessions = false;
  sessionsError: string | null = null;
  private apiBaseUrl = 'https://fm-data.herokuapp.com/api';
  private colorPalette = [
    '#16a34a', // green-600
    '#0284c7', // blue-600
    '#dc2626', // red-600
    '#f59e0b', // amber-600
    '#8b5cf6', // violet-600
    '#ec4899', // pink-600
    '#06b6d4', // cyan-600
    '#6366f1', // indigo-600
  ];

  constructor(private http: HttpClient, private router: Router, private authService: AuthService) {
    // Access navigation state for orders, csv, or message (no trades)
    const nav = window.history.state;
    console.log('Dashboard navigation state:', nav);
    if (nav && nav.marketplace) {
      this.marketplace = nav.marketplace;
      console.log('Marketplace set to:', this.marketplace);
    }
    if (nav && nav.sessionID) {
      this.sessionID = nav.sessionID;
      this.selectedSession = nav.sessionID;
      console.log('Session ID set to:', this.sessionID);
    }
    if (nav && nav.marketplaceId && !this.marketplace) {
      // If marketplace name wasn't provided but ID was, fetch it
      this.fetchMarketplaceName(nav.marketplaceId);
    }
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
          const lines = this.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
          this.csvRows = lines.map((l) => l.split(','));
        }
      } catch (e) {
        this.csvRows = [];
      }
    }
    if (this.csv && this.csvRows.length > 0) {
      this.buildChart();
    }
    // Fetch available sessions for the marketplace
    if (this.marketplace && this.sessionID) {
      // Get marketplace ID from nav state
      const nav = window.history.state;
      console.log('Nav state:', nav);
      console.log('Marketplace ID available:', nav?.marketplaceId);
      if (nav?.marketplaceId) {
        console.log('Calling fetchSessionsForMarketplace with ID:', nav.marketplaceId);
        this.fetchSessionsForMarketplace(nav.marketplaceId);
      } else {
        console.error('Marketplace ID not found in navigation state');
      }
    }
  }

  goBack() {
    this.router.navigate(['/analysis']);
    
  }

  private buildChart() {
    // Parse CSV data
    const tradeDataMap = new Map<string, TradeData[]>();
    const headerRow = this.csvRows[0];
    // Find column indices
    const symbolIdx = headerRow.findIndex((h) => h.trim() === 'symbol');
    const priceIdx = headerRow.findIndex((h) => h.trim() === 'price');
    const elapsedSecondsIdx = headerRow.findIndex((h) => h.trim() === 'elapsedSeconds');
    if (symbolIdx === -1 || priceIdx === -1 || elapsedSecondsIdx === -1) return;
    for (let i = 1; i < this.csvRows.length; i++) {
      const row = this.csvRows[i];
      const symbol = row[symbolIdx]?.trim();
      const price = parseFloat(row[priceIdx]);
      const elapsedSeconds = parseFloat(row[elapsedSecondsIdx]);
      if (!symbol || isNaN(price) || isNaN(elapsedSeconds)) continue;
      if (!tradeDataMap.has(symbol)) {
        tradeDataMap.set(symbol, []);
        this.symbols.add(symbol);
      }
      tradeDataMap.get(symbol)!.push({ symbol, price, elapsedSeconds });
    }
    // Sort each symbol's data by elapsed seconds
    tradeDataMap.forEach((data) => {
      data.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    });
    // Get unique elapsed seconds for x-axis
    const allElapsedSeconds = new Set<number>();
    tradeDataMap.forEach((data) => {
      data.forEach((d) => allElapsedSeconds.add(d.elapsedSeconds));
    });
    const xAxisLabelValues = Array.from(allElapsedSeconds).sort((a, b) => a - b);
    const xAxisLabels = xAxisLabelValues.map((s) => `${s}s`);
    // Build datasets for each symbol - align data to x-axis
    const datasets = Array.from(tradeDataMap.entries()).map((entry, idx) => {
      const [symbol, data] = entry;
      const color = this.colorPalette[idx % this.colorPalette.length];
      const priceMap = new Map<number, number>();
      data.forEach((d) => {
        priceMap.set(d.elapsedSeconds, d.price);
      });
      const alignedPrices = xAxisLabelValues.map((elapsed) => priceMap.get(elapsed) ?? null);
      return {
        label: symbol,
        data: alignedPrices,
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      };
    });
    this.chartConfig = {
      type: 'line',
      data: {
        labels: xAxisLabels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 15,
              font: { size: 12, weight: 'bold' },
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#1f2937',
            padding: 12,
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 11 },
            displayColors: true,
          },
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Elapsed Time (seconds)',
              font: { size: 12, weight: 'bold' },
            },
            ticks: {
              font: { size: 11 },
            },
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Price',
              font: { size: 12, weight: 'bold' },
            },
            ticks: {
              font: { size: 11 },
            },
          },
        },
      },
    };
    this.showChart = true;
  }

  /**
   * Fetch sessions for the current marketplace to populate the dropdown
   */
  private fetchSessionsForMarketplace(marketplaceId: string) {
    console.log('fetchSessionsForMarketplace called with ID:', marketplaceId);
    this.isLoadingSessions = true;
    this.sessionsError = null;

    const token = this.authService.getToken();
    console.log('Token available:', !!token);
    if (!token) {
      this.sessionsError = 'No authentication token found.';
      this.isLoadingSessions = false;
      return;
    }

    const url = `${this.apiBaseUrl}/marketplaces/${marketplaceId}/sessions?format=application/json`;
    console.log('Fetching sessions from:', url);
    const headers = new HttpHeaders({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });

    this.http.get<any>(url, { headers }).subscribe(
      (data: any) => {
        console.log('Sessions API response:', data);
        // Handle both array and HAL-wrapped response
        if (Array.isArray(data)) {
          this.sessions = data;
        } else if (
          data &&
          typeof data === 'object' &&
          data._embedded &&
          Array.isArray(data._embedded.sessions)
        ) {
          this.sessions = data._embedded.sessions;
        } else {
          this.sessions = [];
        }
        console.log('Fetched sessions:', this.sessions);
        console.log('Sessions count:', this.sessions.length);
        this.isLoadingSessions = false;
      },
      (error: any) => {
        console.error('Error fetching sessions:', error);
        this.sessionsError = 'Failed to load sessions.';
        this.isLoadingSessions = false;
      }
    );
  }

  /**
   * Fetch marketplace name by ID from the API
   */
  private fetchMarketplaceName(marketplaceId: string) {
    const token = this.authService.getToken();
    if (!token) return;

    const url = `${this.apiBaseUrl}/marketplaces/${marketplaceId}?format=application/json`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });

    this.http.get<any>(url, { headers }).subscribe(
      (data: any) => {
        this.marketplace = data.name || data.id || marketplaceId;
        console.log('Fetched marketplace name:', this.marketplace);
      },
      (error: any) => {
        console.error('Error fetching marketplace by ID:', error);
        this.marketplace = marketplaceId;
      }
    );
  }

  /**
   * Navigate to a different session in the same marketplace
   */
  onSessionChange() {
    if (this.selectedSession && this.selectedSession !== this.sessionID) {
      const nav = window.history.state;
      this.router.navigate(['/dashboard'], {
        state: {
          ...nav,
          sessionID: this.selectedSession,
          marketplaceId: nav?.marketplaceId,
        },
      });
    }
  }
}
