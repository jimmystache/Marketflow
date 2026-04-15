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
  mode = signal<'signin' | 'signup'>('signin');
  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  switchMode(mode: 'signin' | 'signup'): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loginForm.reset();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email, password } = this.loginForm.value;

    try {
      if (this.mode() === 'signin') {
        await this.authService.login(email, password);
        this.router.navigate(['/']);
      } else {
        const { confirmationRequired } = await this.authService.signUp(email, password);
        if (confirmationRequired) {
          this.successMessage.set('Account created! Check your email to confirm before signing in.');
          this.loginForm.reset();
        } else {
          this.router.navigate(['/']);
        }
      }
    } catch (error: any) {
      this.errorMessage.set(error?.message || 'Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach((key) => {
      this.loginForm.get(key)?.markAsTouched();
    });
  }

  getFieldError(fieldName: string): string | null {
    const control = this.loginForm.get(fieldName);
    if (control && control.touched && control.errors) {
      if (control.errors['required']) {
        return `${fieldName === 'email' ? 'Email' : 'Password'} is required`;
      }
      if (control.errors['email']) {
        return 'Please enter a valid email address';
      }
      if (control.errors['minlength']) {
        return 'Password must be at least 6 characters';
      }
    }
    return null;
  }

  hasFieldError(fieldName: string): boolean {
    return !!this.getFieldError(fieldName);
  }
}
