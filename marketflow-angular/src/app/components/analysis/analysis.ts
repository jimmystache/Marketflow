import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis.html',
  styleUrls: ['./analysis.css']
})
export class Analysis {
  activeTab: 'upload' | 'server' = 'upload';
  selectedFile: File | null = null;
  selectedSession: string = '';
  currentSession: any = null;

  sessions = [
    { id: "TEST", name: "TEST", date: "TEST", traders: 0 },
  ];

  constructor(private router: Router) {}

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
    if (this.activeTab === 'server' && !this.selectedSession) {
      alert("Please select a server session.");
      return;
    }
    console.log("Starting analysis...");
    this.goToDashboard();
  }
}
