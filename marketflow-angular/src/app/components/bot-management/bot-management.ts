import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Card } from '../card/card'

@Component({
  selector: 'app-bot-management',
  imports: [Card],
  templateUrl: './bot-management.html',
  styleUrl: './bot-management.css',
})
export class BotManagement {
    constructor(private router: Router) {}
  
    goTo(page: string) {
      this.router.navigate([page]);
  }
}