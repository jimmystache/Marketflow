import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private _isLoggedIn = signal(false);
  private _userEmail = signal<string | null>(null);
  private _accessToken = signal<string | null>(null);

  constructor(private supabaseService: SupabaseService) {
    // Seed initial state from any existing session
    this.supabaseService.getSession().then(({ data }) => {
      this._isLoggedIn.set(!!data.session);
      this._userEmail.set(data.session?.user?.email ?? null);
      this._accessToken.set(data.session?.access_token ?? null);
    });

    // Keep state in sync when auth changes (login, logout, token refresh)
    this.supabaseService.onAuthStateChange((_event, session) => {
      this._isLoggedIn.set(!!session);
      this._userEmail.set(session?.user?.email ?? null);
      this._accessToken.set(session?.access_token ?? null);
    });
  }

  /**
   * Signs in with email and password via Supabase Auth.
   * Throws an error object with a `message` property on failure.
   */
  async login(email: string, password: string): Promise<void> {
    const { error } = await this.supabaseService.signInWithPassword(email, password);
    if (error) {
      throw { message: error.message };
    }
  }

  /**
   * Creates a new user account via Supabase Auth.
   * Returns true if email confirmation is required, false if logged in immediately.
   * Throws an error object with a `message` property on failure.
   */
  async signUp(email: string, password: string): Promise<{ confirmationRequired: boolean }> {
    const { data, error } = await this.supabaseService.signUp(email, password);
    if (error) {
      throw { message: error.message };
    }
    // If session is null after sign-up, Supabase requires email confirmation
    const confirmationRequired = !data.session;
    return { confirmationRequired };
  }

  /**
   * Returns true if the user has an active Supabase session.
   * Synchronous — reads a signal updated via onAuthStateChange.
   */
  isLoggedIn(): boolean {
    return this._isLoggedIn();
  }

  /**
   * Returns the current user's email address.
   * Used by home.html to display a welcome message.
   */
  getAccount(): string | null {
    return this._userEmail();
  }

  /**
   * Returns the Supabase access token for the current session.
   * Note: components that pass this to fm-data API endpoints will receive
   * 401 errors — those calls need to be migrated to Supabase separately.
   */
  getToken(): string | null {
    return this._accessToken();
  }

  /**
   * Signs out the current user via Supabase Auth.
   */
  async logout(): Promise<void> {
    await this.supabaseService.signOut();
  }
}
