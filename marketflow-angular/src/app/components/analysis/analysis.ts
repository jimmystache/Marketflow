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
  selectedMarketplaceName: string = '';
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
  // Loading state while running the local proxy / fm-manager.jar
  isRunningAnalysis: boolean = false;
  analysisError: string | null = null;

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
   * Fetch a single marketplace by ID to get its name
   */
  private fetchMarketplaceNameById(marketplaceId: string) {
    const token = this.authService.getToken();
    if (!token) return;

    const url = `${this.apiBaseUrl}/marketplaces/${marketplaceId}?format=application/json`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    });

    this.http.get<any>(url, { headers }).subscribe(
      (data: any) => {
        this.selectedMarketplaceName = data.name || data.id || '';
        console.log('Fetched marketplace name:', this.selectedMarketplaceName);
      },
      (error: any) => {
        console.error('Error fetching marketplace by ID:', error);
        this.selectedMarketplaceName = this.selectedMarketplace;
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
    
    // Find and store the full marketplace name
    const marketplace = this.marketplaces.find(m => m.id === this.selectedMarketplace);
    this.selectedMarketplaceName = marketplace ? marketplace.name : '';
    
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
    
    // Ensure marketplace name is set
    if (this.activeTab === 'server') {
      const marketplace = this.marketplaces.find(m => m.id === this.selectedMarketplace);
      if (marketplace && marketplace.name) {
        this.selectedMarketplaceName = marketplace.name;
      } else if (!this.selectedMarketplaceName) {
        // Fallback to ID if name not available
        this.selectedMarketplaceName = this.selectedMarketplace;
      }
      console.log('Final marketplace name for navigation:', this.selectedMarketplaceName);
    }
    
    // For server tab: call local proxy to run fm-manager.jar and return CSV
    if (this.activeTab === 'server') {
      const proxyUrl = 'http://localhost:3000/run-trades';
      const payload = {
        marketplaceId: this.selectedMarketplace,
        sessionId: this.selectedSession,
        // Send token so the proxy can write credential file (assumption)
        token: this.authService.getToken()
      };

      this.isRunningAnalysis = true;
      this.analysisError = null;

      // First try to get response as text (CSV)
      this.http.post(proxyUrl, payload, { responseType: 'text' as 'json' }).subscribe(
        (response: any) => {
          this.isRunningAnalysis = false;
          try {
            // Try to parse as JSON (for "no trades" message or error)
            const jsonResponse = JSON.parse(response);
            if (jsonResponse.message) {
              // "No trades" response
              this.router.navigate(['/dashboard'], { state: { message: jsonResponse.message, trades: jsonResponse.trades || [], marketplace: this.selectedMarketplaceName, sessionID: this.selectedSession, marketplaceId: this.selectedMarketplace } });
            } else if (jsonResponse.error) {
              // Error response from proxy (shouldn't reach here normally, but handle it)
              this.analysisError = jsonResponse.error;
            } else {
              // Unexpected JSON, treat as CSV
              this.router.navigate(['/dashboard'], { state: { csv: response, marketplace: this.selectedMarketplaceName, sessionID: this.selectedSession, marketplaceId: this.selectedMarketplace } });
            }
          } catch (parseErr) {
            // Response is CSV text
            this.router.navigate(['/dashboard'], { state: { csv: response, marketplace: this.selectedMarketplaceName, sessionID: this.selectedSession, marketplaceId: this.selectedMarketplace } });
          }
        },
        (err: any) => {
          console.error('Proxy error:', err);
          this.isRunningAnalysis = false;
          console.log('Error details - err.error type:', typeof err.error, 'value:', err.error);
          console.log('Error details - err.status:', err.status);
          
          // Try to extract user-friendly error message from proxy response
          let errorMsg = 'Failed to retrieve trades data.';
          
          if (err?.error) {
            try {
              // The error response body is in err.error
              let errorObj = err.error;
              
              // If err.error is a string, try to parse it as JSON
              if (typeof err.error === 'string') {
                console.log('Parsing error string as JSON:', err.error);
                try {
                  errorObj = JSON.parse(err.error);
                  console.log('Parsed JSON:', errorObj);
                } catch (parseErr) {
                  // It's just a plain string error, use it directly
                  console.log('Failed to parse, using as plain string');
                  errorMsg = err.error;
                }
              }
              
              // If we have a parsed object, extract the friendly error message
              if (typeof errorObj === 'object' && errorObj?.error) {
                console.log('Extracted error message:', errorObj.error);
                errorMsg = errorObj.error;
              }
            } catch (e) {
              console.error('Exception while parsing error:', e);
              // Fallback: use the raw error if anything goes wrong
              errorMsg = typeof err.error === 'string' ? err.error : 'Failed to run fm-manager locally';
            }
          } else if (err?.message) {
            errorMsg = err.message;
          }
          
          console.log('Final error message to display:', errorMsg);
          this.analysisError = errorMsg;
        }
      );
      return;
    }
    // Default: upload tab
    this.goToDashboard();
  }
}
