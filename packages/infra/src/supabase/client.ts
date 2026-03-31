/**
 * Supabase Client
 *
 * Singleton client for Supabase interactions.
 * Configuration via environment variables.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import type { Database } from './types';

// =============================================================================
// Configuration
// =============================================================================

// Canonical website URL (used as a safe fallback on native when VITE_APP_URL is missing).
// This should be a publicly reachable domain that hosts the SPA and `.well-known/assetlinks.json`.
const DEFAULT_APP_URL = 'https://neurodual.com';

// Vite env types
declare const import_meta_env:
  | {
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
      VITE_APP_URL?: string;
    }
  | undefined;

/** Get Supabase URL from environment (returns null if not configured) */
function getSupabaseUrl(): string | null {
  // Try Vite env first, then process.env
  const url =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string> }).env?.['VITE_SUPABASE_URL']) ||
    (typeof process !== 'undefined' && process.env?.['VITE_SUPABASE_URL']);
  return url || null;
}

/** Get Supabase anon key from environment (returns null if not configured) */
function getSupabaseAnonKey(): string | null {
  const key =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string> }).env?.['VITE_SUPABASE_ANON_KEY']) ||
    (typeof process !== 'undefined' && process.env?.['VITE_SUPABASE_ANON_KEY']);
  return key || null;
}

/**
 * Check if Supabase is configured (env vars present).
 * Use this to decide whether to use real or no-op adapters.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/**
 * Get the app URL for email redirects (reset password, magic link, etc.).
 * Uses VITE_APP_URL in production, falls back to window.location.origin in dev.
 */
export function getAppUrl(): string {
  const envUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string> }).env?.['VITE_APP_URL']) ||
    (typeof process !== 'undefined' && process.env?.['VITE_APP_URL']);

  if (envUrl) {
    return envUrl;
  }

  // On native (Capacitor), window.location.origin is typically https://localhost.
  // That origin is NOT a valid public redirect target for email links / OAuth redirects.
  // Prefer a stable production URL when VITE_APP_URL is missing.
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_APP_URL;
  }

  // Fallback to current origin (web dev / previews)
  if (typeof window !== 'undefined') return window.location.origin;

  // Default for SSR/testing
  return DEFAULT_APP_URL;
}

// =============================================================================
// Client
// =============================================================================

// Type alias for cleaner code
type AppSupabaseClient = SupabaseClient<Database>;

let supabaseClient: AppSupabaseClient | null = null;

/**
 * Get the Supabase client singleton.
 * Lazily initialized on first call.
 * Throws if Supabase is not configured - use isSupabaseConfigured() to check first.
 */
export function getSupabase(): AppSupabaseClient {
  if (!supabaseClient) {
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    if (!url || !key) {
      throw new Error(
        'Supabase not configured. Use isSupabaseConfigured() to check before calling getSupabase().',
      );
    }
    supabaseClient = createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // Use PKCE flow for better security in SPA (recommended by Supabase)
        flowType: 'pkce',
        // Storage key for localStorage (exception to "no localStorage" rule - auth needs persistent session)
        storageKey: 'neurodual-auth',
        // WORKAROUND: Disable navigator.locks entirely to prevent deadlocks (gotrue-js#762)
        // The default lock mechanism can hang indefinitely in certain scenarios.
        // This is safe for single-tab usage; multi-tab token refresh may have race conditions.
        // @ts-expect-error - LockFunc generic type mismatch with Supabase 2.87
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => {
          return await fn();
        },
      },
    }) as unknown as AppSupabaseClient;
  }
  return supabaseClient;
}

/**
 * Initialize Supabase client.
 * Call this early in app startup to catch config errors.
 * On native platforms (Capacitor), sets up auth auto-refresh lifecycle management.
 */
export function initSupabase(): AppSupabaseClient {
  const client = getSupabase();

  // On native platforms, the browser `visibilitychange` event is unreliable.
  // We must manually toggle auto-refresh on app resume/pause to prevent stale sessions.
  // See: https://supabase.com/docs/reference/javascript/auth-startautorefresh
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            // Guard: don't refresh when offline — startAutoRefresh() clears the session on failure
            // See: https://github.com/orgs/supabase/discussions/36906
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              client.auth.startAutoRefresh();
            }
          } else {
            client.auth.stopAutoRefresh();
          }
        });
      })
      .catch(() => {
        // @capacitor/app not available (e.g., web-only build)
      });
  }

  return client;
}

/**
 * Get the Supabase Edge Functions URL.
 * Returns null if not configured.
 */
export function getSupabaseFunctionsUrl(): string | null {
  const url =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string> }).env?.['VITE_SUPABASE_URL']) ||
    (typeof process !== 'undefined' && process.env?.['VITE_SUPABASE_URL']);
  if (!url) return null;
  return `${url}/functions/v1`;
}
