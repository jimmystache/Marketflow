import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Card } from '../card/card'

@Component({
  selector: 'app-environment-setup',
  imports: [Card],
  templateUrl: './environment-setup.html',
  styleUrl: './environment-setup.css',
})
export class EnvironmentSetup {
    constructor(private router: Router) {}
  
    goTo(page: string) {
      this.router.navigate([page]);
  }
}