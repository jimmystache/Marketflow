import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Token storage key in localStorage
 */
const TOKEN_KEY = 'marketflow_session_token';
const ACCOUNT_KEY = 'marketflow_account_name';

/**
 * Login request interface matching the Ad Hoc Markets API format
 */
export interface LoginRequest {
  username: string; // Format: "account|email"
  password: string;
}

/**
 * User role interface
 */
export interface UserRole {
  authority: string;
}

/**
 * Account owner/person interface
 */
export interface Person {
  id: number;
  createdDate: string;
  lastModifiedDate: string;
  accountId: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roles: string[];
}

/**
 * Account interface
 */
export interface Account {
  id: number;
  createdDate: string;
  lastModifiedDate: string;
  name: string;
  description: string | null;
  owner: Person;
  approval: boolean;
  approvalDescription: string;
}

/**
 * Login response interface matching the Ad Hoc Markets API response structure
 */
export interface LoginResponse {
  requestUrl: string;
  token: string;
  account: Account;
  person: Person;
}

/**
 * Authentication service for handling user login and session management
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly loginUrl = environment.loginApiUrl || 'https://fm-data.herokuapp.com/api/tokens';

  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Accept': 'application/json, application/hal+json',
      'Content-Type': 'application/json'
    })
  };

  constructor(private http: HttpClient) {}

  /**
   * Authenticates user with account, email and password
   * Combines account and email into username format: "account|email"
   * @param account User account identifier
   * @param email User email address
   * @param password User password
   * @returns Observable that emits the login response
   */
  login(account: string, email: string, password: string): Observable<LoginResponse> {
    // Combine account and email into username format: "account|email"
    const username = `${account}|${email}`;
    const loginRequest: LoginRequest = { username, password };

    return this.http.post<LoginResponse>(this.loginUrl, loginRequest, this.httpOptions).pipe(
      map((response) => {
        // Store the token and account name from the response
        if (response.token) {
          this.setToken(response.token);
        }
        if (account) {
          this.setAccount(account);
        }
        return response;
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError(() => this.handleError(error));
      })
    );
  }

  /**
   * Stores the authentication token in localStorage
   * @param token The session token or ID to store
   */
  private setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Stores the account name in localStorage
   * @param account The account name to store
   */
  private setAccount(account: string): void {
    localStorage.setItem(ACCOUNT_KEY, account);
  }

  /**
   * Retrieves the stored authentication token from localStorage
   * @returns The stored token or null if not found
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Retrieves the stored account name from localStorage
   * @returns The stored account name or null if not found
   */
  getAccount(): string | null {
    return localStorage.getItem(ACCOUNT_KEY);
  }

  /**
   * Checks if the user is currently logged in
   * @returns true if a token exists in localStorage, false otherwise
   */
  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /**
   * Logs out the user by removing the stored token and account
   */
  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
  }

  /**
   * Handles HTTP errors and returns a user-friendly error message
   * @param error The HTTP error response
   * @returns Error object with message
   */
  private handleError(error: HttpErrorResponse): { message: string; status?: number } {
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      return { message: 'An error occurred. Please try again.' };
    } else {
      // Server-side error
      const status = error.status;
      switch (status) {
        case 401:
          return { message: 'Invalid account, email or password.', status };
        case 403:
          return { message: 'Access forbidden. Please contact support.', status };
        case 404:
          return { message: 'Login endpoint not found.', status };
        case 500:
          return { message: 'Server error. Please try again later.', status };
        default:
          return {
            message: error.error?.message || 'An unexpected error occurred. Please try again.',
            status
          };
      }
    }
  }
}

