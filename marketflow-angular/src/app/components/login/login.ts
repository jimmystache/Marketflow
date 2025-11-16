import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      account: ['opulent-most', [Validators.required]],
      email: ['u1319222@utah.edu', [Validators.required, Validators.email]],
      password: ['!adhoc1', [Validators.required]]
    });
  }

  /**
   * Handles form submission
   */
  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { account, email, password } = this.loginForm.value;

    this.authService.login(account, email, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        // Redirect to homepage on successful login
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.errorMessage.set(error.message || 'Login failed. Please try again.');
      }
    });
  }

  /**
   * Marks all form fields as touched to show validation errors
   */
  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach((key) => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Gets the error message for a form field
   * @param fieldName The name of the form field
   * @returns Error message string or null
   */
  getFieldError(fieldName: string): string | null {
    const control = this.loginForm.get(fieldName);
    if (control && control.touched && control.errors) {
      if (control.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
      if (control.errors['email']) {
        return 'Please enter a valid email address';
      }
    }
    return null;
  }

  /**
   * Checks if a form field has an error
   * @param fieldName The name of the form field
   * @returns true if the field has an error and is touched
   */
  hasFieldError(fieldName: string): boolean {
    return !!this.getFieldError(fieldName);
  }

  /**
   * Gets the display label for a form field
   * @param fieldName The name of the form field
   * @returns Display label
   */
  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      account: 'Account',
      email: 'Email',
      password: 'Password'
    };
    return labels[fieldName] || fieldName;
  }
}

