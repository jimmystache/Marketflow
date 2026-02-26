import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ChatAssistant } from './components/chat-assistant/chat-assistant';
import { WalkthroughOverlayComponent } from './components/walkthrough-overlay/walkthrough-overlay';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, ChatAssistant, WalkthroughOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  showHeader = true;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    // Hide header on trading page
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.showHeader = !event.url.includes('/trading');
    });
  }

  goTo(page: string) {
    this.router.navigate([page]);
  }

  /**
   * Checks if user is logged in
   */
  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  /**
   * Handles user logout
   */
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
