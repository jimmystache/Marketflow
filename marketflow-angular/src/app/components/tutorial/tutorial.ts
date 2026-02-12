import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tutorial',
  imports: [FormsModule],
  templateUrl: './tutorial.html',
  styleUrl: './tutorial.css',
})
export class EnvironmentSetup {
    environmentName: string = '';
    description: string = '';
    apiKey: string = '';
    endpointUrl: string = '';

    constructor(private router: Router) {}
  
    goTo(page: string) {
      this.router.navigate([page]);
    }

    onSubmit() {
      const environmentData = {
        name: this.environmentName,
        description: this.description,
        apiKey: this.apiKey,
        endpointUrl: this.endpointUrl
      };
      console.log('Environment created:', environmentData);
      //  API call or service logic will go here broskis
    }
}