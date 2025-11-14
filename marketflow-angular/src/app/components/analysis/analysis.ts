import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Card } from '../card/card'

@Component({
  selector: 'app-analysis',
  imports: [Card],
  templateUrl: './analysis.html',
  styleUrl: './analysis.css',
})
export class Analysis {
    constructor(private router: Router) {}
  
    goTo(page: string) {
      this.router.navigate([page]);
  }
}