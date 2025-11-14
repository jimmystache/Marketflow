import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Card } from './components/card/card'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Card],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(private router: Router) {}

  goTo(page: string) {
    this.router.navigate([page]);
  }
}
