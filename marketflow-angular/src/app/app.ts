import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

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
