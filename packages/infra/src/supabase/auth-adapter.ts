/**
 * Supabase Auth Adapter
 *
 * Implements AuthPort using Supabase Auth.
 */

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import {
  safeParseWithLog,
  UserRowSchema,
  type AuthError,
  type AuthPort,
  type AuthResult,
  type AuthSession,
  type AuthState,
  type AuthStateListener,
  type AuthUser,
  type AuthUserProfile,
  type SignInCredentials,
  type SignUpCredentials,
} from '@neurodual/logic';
import { authLog } from '../logger';
import { clearAllRecoveryData } from '../lifecycle/session-recovery';
import { ExternalBrowser } from '../native/external-browser';
import {
  isNativeSocialLoginProviderAvailable,
  nativeAppleLogin,
  nativeGoogleLogin,
} from '../social-login/native-social-login';
import { getAppUrl, getSupabase } from './client';
import type { Tables } from './types';

// =============================================================================
// Dependency Injection for SignOut Cleanup
// =============================================================================

async function openExternalAuthUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(url);
    return;
  }

  try {
    await ExternalBrowser.open({ url });
  } catch (error) {
    authLog.warn('External browser plugin failed, falling back to in-webview navigation:', error);
    window.location.assign(url);
  }
}

async function signInWithOAuthExternal(
  provider: 'google' | 'apple',
  redirectTo: string,
): Promise<AuthResult<AuthSession>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Prevent in-webview redirects (Google blocks embedded WebViews).
      // We'll open the provider URL in the external browser.
      skipBrowserRedirect: true,
    },
  });

  if (error) return { success: false, error: mapSupabaseError(error) };

  if (!data?.url) {
    return {
      success: false,
      error: { code: 'unknown', message: 'auth.errors.oauthRedirectMissingUrl' },
    };
  }

  await openExternalAuthUrl(data.url);
  return {
    success: false,
    error: { code: 'oauth_redirect', message: 'auth.errors.oauthRedirect' },
  };
}

/**
 * Callback invoked during signOut to clear sync-related data.
 * Set via setAuthSignOutCallback() from apps/web after sync service is initialized.
 * This decouples auth-adapter from PowerSync sync adapter.
 */
let onSignOutCallback: (() => Promise<void>) | null = null;

/**
 * Set the callback to be invoked during signOut for sync cleanup.
 * Call this from apps/web after PowerSync is initialized.
 *
 * @example
 * ```typescript
 * // In apps/web SystemProvider
 * setAuthSignOutCallback(async () => {
 *   await powerSyncSyncAdapter.resetForLogout();
 * });
 * ```
 */
export function setAuthSignOutCallback(callback: () => Promise<void>): void {
  onSignOutCallback = callback;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Race a promise against a timeout, ensuring the timeout is always cleared.
 * Prevents unhandled rejection when the main promise wins.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function tryNativeGoogleSignIn(
  supabase: ReturnType<typeof getSupabase>,
): Promise<AuthResult<AuthSession>> {
  authLog.info('[signInWithGoogle][native] Starting native Google Sign-In');
  const nativeResult = await withTimeout(
    nativeGoogleLogin(),
    15000,
    'Native Google login timeout (no response from plugin)',
  );

  if (!nativeResult.success) {
    authLog.warn('[signInWithGoogle][native] Native login failed:', nativeResult.error);
    if (nativeResult.cancelled) {
      return { success: false, error: { code: 'cancelled', message: 'auth.errors.cancelled' } };
    }
    return { success: false, error: { code: 'unknown', message: nativeResult.error } };
  }

  authLog.info('[signInWithGoogle][native] Exchanging ID token with Supabase...');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: nativeResult.idToken,
  });

  if (error) {
    authLog.error('[signInWithGoogle][native] Supabase signInWithIdToken failed:', error.message);
    return { success: false, error: mapSupabaseError(error) };
  }

  if (!data.session) {
    return {
      success: false,
      error: { code: 'unknown', message: 'auth.errors.sessionNotCreated' },
    };
  }

  authLog.info('[signInWithGoogle][native] Native sign-in complete');
  return { success: true, data: mapSupabaseSession(data.session) };
}

function mapSupabaseUser(user: User): AuthUser {
  const provider = user.app_metadata?.provider || 'email';
  return {
    id: user.id,
    email: user.email || '',
    emailVerified: !!user.email_confirmed_at,
    provider: provider === 'google' ? 'google' : provider === 'apple' ? 'apple' : 'email',
    createdAt: new Date(user.created_at),
  };
}

function mapSupabaseSession(session: Session): AuthSession {
  return {
    user: mapSupabaseUser(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000,
  };
}

function mapUserRow(row: Tables<'users'>): AuthUserProfile {
  return {
    id: row.id,
    authUserId: row.auth_user_id ?? '',
    username: row.username ?? '',
    avatarId: row.avatar_id ?? '',
  };
}

function mapSupabaseError(error: { message: string; code?: string }): AuthError {
  const msg = error.message.toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return { code: 'invalid_credentials', message: 'auth.errors.invalidCredentials' };
  }
  if (msg.includes('user already registered') || msg.includes('email_taken')) {
    return { code: 'email_taken', message: 'auth.errors.emailTaken' };
  }
  if (
    msg.includes('password') &&
    (msg.includes('leaked') || msg.includes('pwned') || msg.includes('breach'))
  ) {
    return {
      code: 'leaked_password',
      message: 'auth.errors.leakedPassword',
    };
  }
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('short'))) {
    return {
      code: 'weak_password',
      message: 'auth.errors.weakPassword',
    };
  }
  if (msg.includes('invalid email') || msg.includes('invalid_email')) {
    return { code: 'invalid_email', message: 'auth.errors.invalidEmail' };
  }
  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
    return { code: 'email_not_confirmed', message: 'auth.errors.emailNotConfirmed' };
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return { code: 'network_error', message: 'auth.errors.networkError' };
  }

  return { code: 'unknown', message: error.message };
}

// =============================================================================
// Constants
// =============================================================================

const PROFILE_FETCH_MAX_RETRIES = 3;
const PROFILE_FETCH_BASE_DELAY_MS =
  typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test' ? 1 : 500;
const AUTH_INIT_TIMEOUT_MS = 10000;
const NATIVE_APP_SCHEME = 'neurodual://';

// Track consecutive errors to eventually force signOut
const MAX_CONSECUTIVE_ERRORS = 2;

// =============================================================================
// Adapter State
// =============================================================================

let currentState: AuthState = { status: 'loading' };
const listeners = new Set<AuthStateListener>();
let initTimeoutId: ReturnType<typeof setTimeout> | null = null;
let consecutiveErrorCount = 0;

// Used to provide a meaningful error message after we force a signOut
// (eg. OAuth login succeeded at Supabase level but no app profile exists).
let pendingForcedSignOutError: string | null = null;

type LastSignInMethod = 'password' | 'signup' | 'oauth' | null;
let lastSignInMethod: LastSignInMethod = null;

function setState(newState: AuthState): void {
  currentState = newState;
  for (const listener of listeners) {
    listener(newState);
  }
}

function clearInitTimeout(): void {
  if (initTimeoutId) {
    clearTimeout(initTimeoutId);
    initTimeoutId = null;
  }
}

function buildAuthRedirectUrl(
  path: string,
  options?: { preferUniversalLinkOnNative?: boolean },
): string {
  // `redirectTo` here is the **post-Supabase** redirect (where Supabase sends the user
  // after it has handled the provider callback).
  //
  // Provider restrictions (eg. Google requiring HTTPS redirect URIs) apply to the provider
  // callback URL registered in the provider console (here: Supabase's callback), not to
  // this final redirect.
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // On native, we still prefer universal links (HTTPS) when possible.
  if (Capacitor.isNativePlatform() && !options?.preferUniversalLinkOnNative) {
    return `${NATIVE_APP_SCHEME}${normalizedPath.slice(1)}`;
  }

  const baseUrl = getAppUrl().replace(/\/+$/, '');
  const url = new URL(`${baseUrl}${normalizedPath}`);

  // Append browser locale so the send-email edge function can localize emails
  // even when user_metadata.locale is missing (OAuth users, old accounts).
  const lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.split('-')[0]
      : undefined;
  if (lang) url.searchParams.set('lang', lang);

  return url.toString();
}

function buildNativeOAuthBounceRedirectUrl(path: string): string {
  const redirectTo = buildAuthRedirectUrl(path, { preferUniversalLinkOnNative: true });
  const url = new URL(redirectTo);
  url.searchParams.set('nd_native', '1');
  return url.toString();
}

// =============================================================================
// Profile Fetching
// =============================================================================

// Result type to distinguish "not found" from "network error"
type ProfileFetchResult =
  | { status: 'found'; profile: AuthUserProfile }
  | { status: 'not_found' } // Profile doesn't exist in DB
  | { status: 'error'; message: string }; // Network/timeout error

async function fetchUserProfile(userId: string): Promise<ProfileFetchResult> {
  const supabase = getSupabase();
  authLog.debug('Fetching profile from DB for userId:', userId);

  try {
    authLog.debug('Starting Supabase query...');
    const queryStart = Date.now();

    // Add timeout to prevent infinite hang
    const QUERY_TIMEOUT_MS = 8000;
    const queryPromise = supabase.from('users').select('*').eq('auth_user_id', userId).single();

    // Convert PostgrestFilterBuilder to native Promise for proper type inference
    const { data, error } = await withTimeout(
      Promise.resolve(queryPromise),
      QUERY_TIMEOUT_MS,
      `Query timeout after ${QUERY_TIMEOUT_MS}ms`,
    );

    authLog.debug('Query completed in', Date.now() - queryStart, 'ms');

    authLog.debug('Profile fetch completed:', {
      hasData: !!data,
      error: error?.message,
      code: error?.code,
    });

    if (error) {
      // PGRST116 = "no rows returned" = profile doesn't exist
      if (error.code === 'PGRST116') {
        authLog.debug('Profile not found in database (PGRST116)');
        return { status: 'not_found' };
      }
      // Other errors = network/timeout/RLS issue
      authLog.error('Profile fetch error:', error.message);
      return { status: 'error', message: error.message };
    }

    if (!data) {
      return { status: 'not_found' };
    }

    // Validate user data at boundary
    const parseResult = safeParseWithLog(UserRowSchema, data, 'fetchUserProfile');
    if (!parseResult.success) {
      authLog.error('Invalid user profile data from cloud');
      return { status: 'error', message: 'Invalid profile data' };
    }

    return { status: 'found', profile: mapUserRow(parseResult.data as Tables<'users'>) };
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
    authLog.error('Profile fetch threw exception:', message);
    return { status: 'error', message };
  }
}

/**
 * Fetch user profile with exponential backoff retry.
 * This handles race conditions where the trigger hasn't finished creating the profile yet.
 * Returns the final result after all retries.
 */
async function fetchUserProfileWithRetry(
  userId: string,
  retries = PROFILE_FETCH_MAX_RETRIES,
): Promise<ProfileFetchResult> {
  let lastResult: ProfileFetchResult = { status: 'error', message: 'No attempts made' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await fetchUserProfile(userId);
    lastResult = result;

    // If found, return immediately
    if (result.status === 'found') {
      return result;
    }

    // If not_found (profile doesn't exist), no point retrying
    if (result.status === 'not_found') {
      authLog.debug('Profile confirmed not found, no retry needed');
      return result;
    }

    // If error, retry with backoff
    if (attempt < retries) {
      const delay = PROFILE_FETCH_BASE_DELAY_MS * attempt;
      authLog.debug(
        `Profile fetch attempt ${attempt}/${retries} failed (${result.message}), retrying in ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  authLog.error(`Profile fetch failed after ${retries} attempts`);
  return lastResult;
}

// =============================================================================
// Initialize Auth Listener
// =============================================================================

let initialized = false;
let generation = 0;
let authStateSubscription: { unsubscribe: () => void } | null = null;

/**
 * Handle authenticated session - fetch profile with retry.
 *
 * CRITICAL: Different handling based on fetch result:
 * - found → authenticated (normal case)
 * - not_found → signOut (orphan session, profile doesn't exist in DB)
 * - error → show error state, but force signOut after MAX_CONSECUTIVE_ERRORS
 */
async function handleAuthenticatedSession(session: Session): Promise<void> {
  const supabase = getSupabase();
  const gen = generation;

  // Micro-delay to ensure the Supabase client has fully internalized the token
  // This prevents RLS issues where auth.uid() returns NULL
  const TOKEN_PROPAGATION_DELAY_MS =
    typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test' ? 0 : 50;
  await new Promise((resolve) => setTimeout(resolve, TOKEN_PROPAGATION_DELAY_MS));
  if (gen !== generation) return;

  authLog.debug('Fetching profile for:', session.user.id);
  const result = await fetchUserProfileWithRetry(session.user.id);
  if (gen !== generation) return;

  switch (result.status) {
    case 'found':
      authLog.info('Profile loaded:', result.profile.username);
      consecutiveErrorCount = 0; // Reset error counter on success
      setState({
        status: 'authenticated',
        session: mapSupabaseSession(session),
        profile: result.profile,
      });
      break;

    case 'not_found':
      // Profile doesn't exist in DB.
      // This can happen for historical accounts created before the trigger existed,
      // or if the DB trigger was misconfigured. Do NOT force signOut here (it creates a login loop).
      authLog.error('Profile not found in DB - keeping session and showing repairable error');
      consecutiveErrorCount = 0;

      pendingForcedSignOutError =
        lastSignInMethod === 'oauth'
          ? 'auth.errors.oauthAccountNotLinked'
          : 'auth.errors.profileMissing';
      setState({ status: 'error', error: pendingForcedSignOutError });
      break;

    case 'error':
      consecutiveErrorCount++;
      authLog.error(
        `Profile fetch failed (${consecutiveErrorCount}/${MAX_CONSECUTIVE_ERRORS}):`,
        result.message,
      );

      // After too many consecutive errors, force signOut to break the loop
      // This prevents infinite loading when there's a persistent issue
      if (consecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
        authLog.error('Too many consecutive errors - forcing signOut to break loop');
        consecutiveErrorCount = 0;
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut errors
        }
        setState({
          status: 'error',
          error: 'auth.errors.profileLoadFailed',
        });
      } else {
        // First error - show error state so user can retry
        setState({
          status: 'error',
          error: 'auth.errors.profileLoadError',
        });
      }
      break;
  }
}

async function initAuthListener(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const gen = generation;

  const supabase = getSupabase();

  // Global timeout to prevent infinite loading state
  initTimeoutId = setTimeout(() => {
    if (currentState.status === 'loading') {
      authLog.error('Auth initialization timeout after', AUTH_INIT_TIMEOUT_MS, 'ms');
      setState({ status: 'error', error: 'auth.errors.connectionTimeout' });
    }
  }, AUTH_INIT_TIMEOUT_MS);

  // STEP 1: Restore session - try getSession() with fallback to manual restore
  authLog.debug('Step 1: Restoring session...');

  // Check localStorage directly first
  let storedSessionData: { access_token: string; refresh_token: string; user: unknown } | null =
    null;
  try {
    const storedSession = localStorage.getItem('neurodual-auth');
    authLog.debug('localStorage check:', {
      hasStoredSession: !!storedSession,
      size: storedSession?.length ?? 0,
    });
    if (storedSession) {
      storedSessionData = JSON.parse(storedSession);
    }
  } catch (e) {
    authLog.error('localStorage read error:', e);
  }

  try {
    // Add timeout to getSession() - it shouldn't take more than 3s
    const SESSION_RESTORE_TIMEOUT_MS = 3000;
    authLog.debug('Calling getSession()...');
    const startTime = Date.now();

    const sessionPromise = supabase.auth.getSession();

    const { data, error } = await withTimeout(
      sessionPromise,
      SESSION_RESTORE_TIMEOUT_MS,
      `getSession() timeout after ${SESSION_RESTORE_TIMEOUT_MS}ms`,
    );
    authLog.debug('getSession() completed in', Date.now() - startTime, 'ms');

    if (error) {
      authLog.error('Failed to restore session:', error);
      clearInitTimeout();
      if (gen === generation) {
        setState({ status: 'unauthenticated' });
      }
    } else if (data?.session) {
      authLog.info('Session restored:', data.session.user.id);
      clearInitTimeout();
      if (gen !== generation) return;
      await handleAuthenticatedSession(data.session);
    } else {
      authLog.debug('No session found');
      clearInitTimeout();
      if (gen === generation) {
        setState({ status: 'unauthenticated' });
      }
    }
  } catch (err) {
    // getSession() failed/timed out - try manual session restoration
    authLog.warn('getSession() failed, trying manual restore...', err);

    if (storedSessionData?.access_token && storedSessionData?.refresh_token) {
      authLog.debug('Found stored tokens, using setSession()...');
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: storedSessionData.access_token,
          refresh_token: storedSessionData.refresh_token,
        });

        if (error) {
          authLog.error('setSession() failed:', error);
          // Clear invalid session
          localStorage.removeItem('neurodual-auth');
          clearInitTimeout();
          if (gen === generation) {
            setState({ status: 'unauthenticated' });
          }
        } else if (data?.session) {
          authLog.info('Session manually restored:', data.session.user.id);
          clearInitTimeout();
          if (gen !== generation) return;
          await handleAuthenticatedSession(data.session);
        } else {
          authLog.debug('setSession() returned no session');
          clearInitTimeout();
          if (gen === generation) {
            setState({ status: 'unauthenticated' });
          }
        }
      } catch (setErr) {
        authLog.error('Manual session restore failed:', setErr);
        clearInitTimeout();
        if (gen === generation) {
          setState({ status: 'unauthenticated' });
        }
      }
    } else {
      authLog.debug('No stored session to restore');
      // Don't clear timeout - let onAuthStateChange handle it
      authLog.debug('Waiting for onAuthStateChange to handle session...');
    }
  }

  // STEP 2: Listen for FUTURE auth changes (login, logout, token refresh)
  authLog.debug('Step 2: Setting up auth listener...');

  // Fallback: If no auth event received within 3s, check localStorage directly
  const fallbackTimeoutId = setTimeout(async () => {
    if (currentState.status === 'loading') {
      authLog.warn('No auth event received after 3s, checking localStorage fallback...');
      try {
        // Try to get session one more time without timeout
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          authLog.debug('Fallback: Found session in storage, processing...');
          if (gen !== generation) return;
          await handleAuthenticatedSession(data.session);
        } else {
          authLog.debug('Fallback: No session found, setting unauthenticated');
          clearInitTimeout();
          if (gen === generation) {
            setState({ status: 'unauthenticated' });
          }
        }
      } catch (err) {
        authLog.error('Fallback failed:', err);
        clearInitTimeout();
        if (gen === generation) {
          setState({ status: 'unauthenticated' });
        }
      }
    }
  }, 3000);

  const { data } = supabase.auth.onAuthStateChange(
    (event: AuthChangeEvent, session: Session | null) => {
      authLog.debug('Auth event:', event, session?.user?.id);
      clearTimeout(fallbackTimeoutId);

      // Skip INITIAL_SESSION - already handled in Step 1
      if (event === 'INITIAL_SESSION') {
        authLog.debug('Skipping INITIAL_SESSION (already handled)');
        return;
      }

      // TOKEN_REFRESHED: Just a background refresh, no action needed if already authenticated
      if (event === 'TOKEN_REFRESHED' && currentState.status === 'authenticated') {
        authLog.debug('Token refreshed (already authenticated, skipping)');
        return;
      }

      clearInitTimeout();

      // CRITICAL: Defer async work with setTimeout to release the internal Supabase lock
      // Making Supabase calls directly in onAuthStateChange causes deadlocks (gotrue-js#762)
      setTimeout(async () => {
        try {
          if (session) {
            authLog.debug('Session detected, fetching profile...');
            if (gen !== generation) return;
            await handleAuthenticatedSession(session);
          } else {
            authLog.debug('No session, setting unauthenticated');
            if (gen === generation) {
              if (pendingForcedSignOutError) {
                const err = pendingForcedSignOutError;
                pendingForcedSignOutError = null;
                setState({ status: 'error', error: err });
              } else {
                setState({ status: 'unauthenticated' });
              }
            }
          }
        } catch (error) {
          authLog.error('Error in onAuthStateChange:', error);
          try {
            await supabase.auth.signOut();
          } catch {
            // Ignore signOut errors
          }
          if (gen === generation) {
            setState({ status: 'unauthenticated' });
          }
        }
      }, 0);
    },
  );
  authStateSubscription = data.subscription;
}

// =============================================================================
// Auth Adapter Implementation
// =============================================================================

export const supabaseAuthAdapter: AuthPort = {
  getState(): AuthState {
    initAuthListener();
    return currentState;
  },

  subscribe(listener: AuthStateListener): () => void {
    initAuthListener();
    listeners.add(listener);
    // Immediately call with current state
    listener(currentState);
    return () => listeners.delete(listener);
  },

  async signUp(credentials: SignUpCredentials): Promise<AuthResult<AuthSession>> {
    lastSignInMethod = 'signup';
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          username: credentials.username,
          locale: credentials.locale,
        },
        captchaToken: credentials.captchaToken,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    // Supabase returns user with empty identities for existing emails (security measure)
    // This prevents email enumeration but we can detect it
    if (data.user?.identities && data.user.identities.length === 0) {
      return {
        success: false,
        error: {
          code: 'email_taken',
          message:
            'Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.',
        },
      };
    }

    if (!data.session) {
      // Email confirmation required for new account
      if (!data.user) {
        return {
          success: false,
          error: { code: 'unknown', message: 'No user returned from signup' },
        };
      }
      return {
        success: true,
        data: {
          user: mapSupabaseUser(data.user),
          accessToken: '',
          refreshToken: '',
          expiresAt: 0,
        },
      };
    }

    return { success: true, data: mapSupabaseSession(data.session) };
  },

  async signIn(credentials: SignInCredentials): Promise<AuthResult<AuthSession>> {
    lastSignInMethod = 'password';
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
      options: {
        captchaToken: credentials.captchaToken,
      },
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    if (!data.session) {
      return {
        success: false,
        error: { code: 'unknown', message: 'auth.errors.sessionNotCreated' },
      };
    }

    return { success: true, data: mapSupabaseSession(data.session) };
  },

  async signInWithGoogle(): Promise<AuthResult<AuthSession>> {
    lastSignInMethod = 'oauth';
    const isNative = Capacitor.isNativePlatform();

    const nativeAvailable = isNativeSocialLoginProviderAvailable('google');
    authLog.info(`[signInWithGoogle] nativeAvailable=${nativeAvailable}`);

    // Use native Google Sign-In on mobile for in-app experience
    if (nativeAvailable) {
      authLog.info('[signInWithGoogle] Using NATIVE Google Sign-In');
      try {
        const nativeAuth = await tryNativeGoogleSignIn(getSupabase());
        if (nativeAuth.success) return nativeAuth;

        // Respect user cancellation.
        if (nativeAuth.error.code === 'cancelled') return nativeAuth;

        if (isNative && nativeAuth.error.message.includes('Account reauth failed')) {
          authLog.warn(
            '[signInWithGoogle] Native login hit account reauth failure, falling back to external OAuth',
          );
          return await signInWithOAuthExternal(
            'google',
            buildNativeOAuthBounceRedirectUrl('/auth/callback'),
          );
        }

        authLog.warn(
          '[signInWithGoogle] Native login failed, falling back to OAuth redirect (web)',
        );
      } catch (err) {
        authLog.warn('[signInWithGoogle] Native login threw, falling back to OAuth redirect:', err);
      }
    }

    // On native platforms, use external OAuth instead of in-webview navigation.
    if (isNative) {
      authLog.warn('[signInWithGoogle] Native social login not available; using external OAuth');
      return await signInWithOAuthExternal(
        'google',
        buildNativeOAuthBounceRedirectUrl('/auth/callback'),
      );
    }

    // Fallback to OAuth redirect for web (PWA / browser)
    authLog.warn('[signInWithGoogle] Falling back to OAuth REDIRECT (browser)');
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Prefer verified https App Links on native fallback (more reliable than custom schemes on OEM browsers).
        redirectTo: buildAuthRedirectUrl('/auth/callback', { preferUniversalLinkOnNative: true }),
      },
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    // OAuth redirects, so we won't get here normally
    // Return a placeholder - the actual session comes via onAuthStateChange
    return {
      success: false,
      error: { code: 'oauth_redirect', message: 'auth.errors.oauthRedirect' },
    };
  },

  async signInWithApple(): Promise<AuthResult<AuthSession>> {
    lastSignInMethod = 'oauth';
    const isNative = Capacitor.isNativePlatform();
    const isIos = Capacitor.getPlatform() === 'ios';

    // Use native Apple Sign-In on mobile for in-app experience
    if (isIos && isNativeSocialLoginProviderAvailable('apple')) {
      authLog.debug('Using native Apple Sign-In');
      const nativeResult = await nativeAppleLogin();

      if (!nativeResult.success) {
        if (nativeResult.cancelled) {
          return { success: false, error: { code: 'cancelled', message: 'auth.errors.cancelled' } };
        }
        return { success: false, error: { code: 'unknown', message: nativeResult.error } };
      }

      // Exchange ID token with Supabase
      const { data, error } = await getSupabase().auth.signInWithIdToken({
        provider: 'apple',
        token: nativeResult.idToken,
      });

      if (error) {
        return { success: false, error: mapSupabaseError(error) };
      }

      if (!data.session) {
        return {
          success: false,
          error: { code: 'unknown', message: 'auth.errors.sessionNotCreated' },
        };
      }

      return { success: true, data: mapSupabaseSession(data.session) };
    }

    // On native platforms, use external OAuth instead of in-webview navigation.
    if (isNative) {
      return await signInWithOAuthExternal(
        'apple',
        buildNativeOAuthBounceRedirectUrl('/auth/callback'),
      );
    }

    // Fallback to OAuth redirect for web
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'apple',
      options: {
        // Prefer verified https App Links on native fallback (more reliable than custom schemes on OEM browsers).
        redirectTo: buildAuthRedirectUrl('/auth/callback', { preferUniversalLinkOnNative: true }),
      },
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    return {
      success: false,
      error: { code: 'oauth_redirect', message: 'auth.errors.oauthRedirect' },
    };
  },

  async signOut(): Promise<void> {
    authLog.info('Signing out...');

    // 1. Clear local data BEFORE signing out to prevent cross-account leakage
    if (onSignOutCallback) {
      await onSignOutCallback(); // Clears SQLite events + sync state (injected)
    } else {
      authLog.warn('No signOut callback set - sync data may not be cleared');
    }
    clearAllRecoveryData(); // Clears localStorage recovery keys (session + pipeline)

    // 2. Sign out from Supabase
    const supabase = getSupabase();
    await supabase.auth.signOut();

    authLog.info('Signed out - all local data cleared');
  },

  async updateProfile(
    updates: Partial<Pick<AuthUserProfile, 'username' | 'avatarId'>>,
  ): Promise<AuthResult<AuthUserProfile>> {
    const supabase = getSupabase();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: { code: 'unknown', message: 'auth.errors.notConnected' } };
    }

    // Build update object
    const updateData: Record<string, string> = {};
    if (updates.username != null) updateData['username'] = updates.username;
    if (updates.avatarId != null) updateData['avatar_id'] = updates.avatarId;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('auth_user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      return {
        success: false,
        error: { code: 'unknown', message: error?.message || 'auth.errors.updateError' },
      };
    }

    const profile = mapUserRow(data);

    // Update local state
    if (currentState.status === 'authenticated') {
      setState({
        ...currentState,
        profile,
      });
    }

    return { success: true, data: profile };
  },

  async resetPassword(email: string, captchaToken?: string): Promise<AuthResult<void>> {
    const supabase = getSupabase();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Prefer verified https App Links (more reliable when opened from email clients / OEM browsers).
      redirectTo: buildAuthRedirectUrl('/auth/reset-password', {
        preferUniversalLinkOnNative: true,
      }),
      captchaToken,
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    return { success: true, data: undefined };
  },

  async updatePassword(newPassword: string): Promise<AuthResult<void>> {
    const supabase = getSupabase();

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error) };
    }

    return { success: true, data: undefined };
  },

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session) {
      return {
        success: false,
        error: mapSupabaseError(error || { message: 'Session refresh failed' }),
      };
    }

    return { success: true, data: mapSupabaseSession(data.session) };
  },

  async validateSession(): Promise<boolean> {
    const supabase = getSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return !error && !!user;
  },

  getAccessToken(): string | null {
    return currentState.status === 'authenticated' ? currentState.session.accessToken : null;
  },

  async deleteAccount(): Promise<AuthResult<void>> {
    const supabase = getSupabase();

    // Get current session for the Authorization header
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        success: false,
        error: { code: 'unknown', message: 'auth.errors.invalidSession' },
      };
    }

    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });

      if (error) {
        return {
          success: false,
          error: { code: 'unknown', message: error.message || 'auth.errors.deleteAccountFailed' },
        };
      }

      // Sign out locally after successful deletion
      await supabase.auth.signOut();
      setState({ status: 'unauthenticated' });

      return { success: true, data: undefined };
    } catch (error) {
      authLog.error('Delete account error:', error);
      return {
        success: false,
        error: { code: 'network_error', message: 'auth.errors.networkError' },
      };
    }
  },
};

/**
 * Reset auth adapter state for testing.
 * @internal
 */
export function __resetAuthAdapter(): void {
  generation++;
  initialized = false;
  authStateSubscription?.unsubscribe();
  authStateSubscription = null;
  currentState = { status: 'loading' };
  listeners.clear();
  consecutiveErrorCount = 0;
  clearInitTimeout();
  onSignOutCallback = null;
  pendingForcedSignOutError = null;
  lastSignInMethod = null;
}

const hot = (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose(() => {
    __resetAuthAdapter();
  });
}
