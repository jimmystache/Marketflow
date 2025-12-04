import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-bot-management',
  templateUrl: './bot-management.html',
  styleUrl: './bot-management.css',
})
export class BotManagement {
    constructor(private router: Router) {}
  
    goTo(page: string) {
      this.router.navigate([page]);
  }

}