import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Card } from '../card/card'
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  imports: [Card, CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  constructor(private router: Router, public authService: AuthService) {}
  
  goTo(page: string) {
    this.router.navigate([page]);
  }
}