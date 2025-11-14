import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Card } from '../card/card'

@Component({
  selector: 'app-home',
  imports: [Card],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  constructor(private router: Router) {}
  
  goTo(page: string) {
    this.router.navigate([page]);
  }
}