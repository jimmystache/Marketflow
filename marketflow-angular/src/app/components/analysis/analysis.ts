import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis.html',
  styleUrls: ['./analysis.css']
})
export class Analysis implements OnInit {
  activeTab: 'upload' | 'server' = 'upload';
  selectedFile: File | null = null;
  selectedMarketplace: string = '';
  selectedSession: string = '';
  currentSession: any = null;
  
  marketplaces: any[] = [];
  sessions = [
    { id: "TEST", name: "TEST", date: "TEST", traders: 0 },
  ];
  
  isLoadingMarketplaces = false;
  isLoadingSessions = false;
  marketplaceError: string | null = null;
  sessionsError: string | null = null;

  private apiBaseUrl = 'https://fm-data.herokuapp.com/api';

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.fetchMarketplaces();
  }

  /**
   * Fetch marketplaces from the API for the authenticated user
   */
  fetchMarketplaces() {
    this.isLoadingMarketplaces = true;
    this.marketplaceError = null;

    const token = this.authService.getToken();
    if (!token) {
      this.marketplaceError = 'No authentication token found. Please log in.';
      this.isLoadingMarketplaces = false;
      return;
    }

    const url = `${this.apiBaseUrl}/marketplaces?format=application/json`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    });

    this.http.get<any[]>(url, { headers }).subscribe(
      (data: any) => {
        // Handle both array and HAL-wrapped response
        if (Array.isArray(data)) {
          this.marketplaces = data;
        } else if (data && typeof data === 'object' && data._embedded && Array.isArray(data._embedded.marketplaces)) {
          this.marketplaces = data._embedded.marketplaces;
        } else {
          this.marketplaces = [];
        }
        this.isLoadingMarketplaces = false;
      },
      (error: any) => {
        console.error('Error fetching marketplaces:', error);
        this.marketplaceError = 'Failed to load marketplaces. Please try again.';
        this.isLoadingMarketplaces = false;
      }
    );
  }

  /**
   * Handle marketplace selection
   * Clears session selection when marketplace changes and fetches new sessions
   */
  onMarketplaceChange() {
    this.selectedSession = '';
    this.currentSession = null;
    this.sessions = [];
    this.sessionsError = null;
    
    if (this.selectedMarketplace) {
      this.fetchSessionsForMarketplace(this.selectedMarketplace);
    }
  }

  /**
   * Fetch sessions for the selected marketplace
   */
  fetchSessionsForMarketplace(marketplaceId: string) {
    this.isLoadingSessions = true;
    this.sessionsError = null;

    const token = this.authService.getToken();
    if (!token) {
      this.sessionsError = 'No authentication token found. Please log in.';
      this.isLoadingSessions = false;
      return;
    }

    const url = `${this.apiBaseUrl}/marketplaces/${marketplaceId}/sessions?format=application/json`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    });

    this.http.get<any>(url, { headers }).subscribe(
      (data: any) => {
        // Handle both array and HAL-wrapped response
        if (Array.isArray(data)) {
          this.sessions = data;
        } else if (data && typeof data === 'object' && data._embedded && Array.isArray(data._embedded.sessions)) {
          this.sessions = data._embedded.sessions;
        } else {
          this.sessions = [];
        }
        this.isLoadingSessions = false;
      },
      (error: any) => {
        console.error('Error fetching sessions:', error);
        this.sessionsError = 'Failed to load sessions. Please try again.';
        this.isLoadingSessions = false;
      }
    );
  }

  goBack() {
    this.router.navigate(['/']); 
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']); 
  }

  setTab(tab: 'upload' | 'server') {
    this.activeTab = tab;
  }

  handleFileChoose(event: any) {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.csv')) {
      this.selectedFile = file;
    } else {
      alert("Please choose a valid CSV file.");
      event.target.value = "";
    }
  }

  triggerFileUpload() {
    const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
    fileInput?.click();
  }

  updateSessionDetails() {
    this.currentSession =
      this.sessions.find(s => s.id === this.selectedSession) || null;
  }

  startAnalysis() {
    if (this.activeTab === 'upload' && !this.selectedFile) {
      alert("Please select a CSV file first.");
      return;
    }
    if (this.activeTab === 'server' && !this.selectedMarketplace) {
      alert("Please select a marketplace first.");
      return;
    }
    if (this.activeTab === 'server' && !this.selectedSession) {
      alert("Please select a server session.");
      return;
    }
    // Clear any remote API logic here — simply navigate to the dashboard.
    console.log("Starting analysis (no remote fetch)...");
    this.goToDashboard();
  }
}
