/**
 * AuthPort
 *
 * Interface for authentication operations.
 * Implemented by infra (Supabase), consumed by ui via Context.
 */

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  /** Supabase auth user ID */
  readonly id: string;
  /** User email */
  readonly email: string;
  /** Email verified */
  readonly emailVerified: boolean;
  /** Auth provider */
  readonly provider: 'email' | 'google' | 'apple';
  /** Creation date */
  readonly createdAt: Date;
}

export interface UserProfile {
  /** Public profile ID */
  readonly id: string;
  /** Auth user ID */
  readonly authUserId: string;
  /** Display name */
  readonly username: string;
  /** Avatar ID */
  readonly avatarId: string;
}

export interface AuthSession {
  /** Current user */
  readonly user: AuthUser;
  /** Access token */
  readonly accessToken: string;
  /** Refresh token */
  readonly refreshToken: string;
  /** Expiry timestamp */
  readonly expiresAt: number;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; session: AuthSession; profile: UserProfile }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: string };

export interface SignUpCredentials {
  email: string;
  password: string;
  /** Display name for the user profile */
  username: string;
  /** CAPTCHA token from Turnstile/hCaptcha (optional, required if CAPTCHA is enabled) */
  captchaToken?: string;
  /** User's current locale (e.g. "fr", "en") for transactional emails */
  locale?: string;
}

export interface SignInCredentials {
  email: string;
  password: string;
  /** CAPTCHA token from Turnstile/hCaptcha (optional, required if CAPTCHA is enabled) */
  captchaToken?: string;
}

export type AuthError =
  | { code: 'invalid_credentials'; message: string }
  | { code: 'email_taken'; message: string }
  | { code: 'weak_password'; message: string }
  | { code: 'leaked_password'; message: string }
  | { code: 'invalid_email'; message: string }
  | { code: 'email_not_confirmed'; message: string }
  | { code: 'network_error'; message: string }
  | { code: 'oauth_redirect'; message: string } // OAuth redirect in progress (not a real error)
  | { code: 'cancelled'; message: string } // User cancelled the auth flow
  | { code: 'unknown'; message: string };

export type AuthResult<T> = { success: true; data: T } | { success: false; error: AuthError };

// =============================================================================
// Port
// =============================================================================

export type AuthStateListener = (state: AuthState) => void;

export interface AuthPort {
  /** Get current auth state */
  getState(): AuthState;

  /** Subscribe to auth state changes. Returns unsubscribe function. */
  subscribe(listener: AuthStateListener): () => void;

  /** Sign up with email/password */
  signUp(credentials: SignUpCredentials): Promise<AuthResult<AuthSession>>;

  /** Sign in with email/password */
  signIn(credentials: SignInCredentials): Promise<AuthResult<AuthSession>>;

  /** Sign in with Google OAuth */
  signInWithGoogle(): Promise<AuthResult<AuthSession>>;

  /** Sign in with Apple OAuth */
  signInWithApple(): Promise<AuthResult<AuthSession>>;

  /** Sign out */
  signOut(): Promise<void>;

  /** Update user profile (username, avatar) */
  updateProfile(
    updates: Partial<Pick<UserProfile, 'username' | 'avatarId'>>,
  ): Promise<AuthResult<UserProfile>>;

  /** Send password reset email */
  resetPassword(email: string, captchaToken?: string): Promise<AuthResult<void>>;

  /** Update password (used after reset password email link) */
  updatePassword(newPassword: string): Promise<AuthResult<void>>;

  /** Refresh session */
  refreshSession(): Promise<AuthResult<AuthSession>>;

  /**
   * Validate session by checking with the server.
   * Uses getUser() which is the only reliable way to verify a session is valid.
   * Call this for sensitive operations.
   */
  validateSession(): Promise<boolean>;

  /**
   * Get the cached access token.
   * Returns null if not authenticated.
   */
  getAccessToken(): string | null;

  /**
   * Delete the user's account permanently.
   * This is irreversible - all user data will be deleted.
   * Requires RGPD compliance.
   */
  deleteAccount(): Promise<AuthResult<void>>;
}
