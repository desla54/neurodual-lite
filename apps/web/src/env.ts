/**
 * Environment Variables Validation
 *
 * Centralized Zod validation for all VITE_* environment variables.
 * Fail-fast at startup if required variables are missing.
 *
 * Best practice 2026: Validate env vars at app startup with Zod.
 * @see https://www.creatures.sh/blog/env-type-safety-and-validation/
 */

import { z } from 'zod';

// =============================================================================
// Schema Definition
// =============================================================================

/**
 * Helper for boolean-like env vars ('1', 'true', 'enabled')
 */
const booleanString = z
  .string()
  .optional()
  .transform((val) => val === '1' || val === 'true' || val === 'enabled');

/**
 * Helper for number-like env vars (e.g. "0.1")
 */
const numberString = z
  .string()
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  });

/**
 * Environment variables schema.
 *
 * Required in production:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 * - VITE_POWERSYNC_URL (for cloud sync)
 *
 * Optional (with defaults):
 * - Feature flags
 * - Analytics/monitoring
 * - Payment integrations
 */
const envSchema = z.object({
  // ==========================================================================
  // Supabase (required in production)
  // ==========================================================================
  VITE_SUPABASE_URL: z.string().url().optional().describe('Supabase project URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional().describe('Supabase anonymous API key'),

  // ==========================================================================
  // PowerSync (required in production for cloud sync)
  // ==========================================================================
  VITE_POWERSYNC_URL: z.string().url().optional().describe('PowerSync instance URL'),
  VITE_POWERSYNC_ALLOW_INSECURE_HTTP: booleanString.describe('Allow HTTP for PowerSync (dev only)'),
  VITE_POWERSYNC_FORCE_ENABLE: booleanString.describe('Force enable PowerSync even without auth'),

  // ==========================================================================
  // Sentry (optional - error monitoring)
  // ==========================================================================
  VITE_SENTRY_DSN: z.string().optional().describe('Sentry DSN for error tracking'),
  VITE_SENTRY_REPLAY: booleanString.describe('Enable Sentry session replay'),
  VITE_SENTRY_TRACES_SAMPLE_RATE: numberString
    .refine((n) => n === undefined || (n >= 0 && n <= 1), 'Must be between 0 and 1')
    .describe('Override Sentry tracesSampleRate (0..1)'),
  VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: numberString
    .refine((n) => n === undefined || (n >= 0 && n <= 1), 'Must be between 0 and 1')
    .describe('Override Sentry replaysSessionSampleRate (0..1)'),
  VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: numberString
    .refine((n) => n === undefined || (n >= 0 && n <= 1), 'Must be between 0 and 1')
    .describe('Override Sentry replaysOnErrorSampleRate (0..1)'),

  // ==========================================================================
  // PostHog (optional - product analytics + session replay)
  // ==========================================================================
  VITE_PUBLIC_POSTHOG_KEY: z.string().optional().describe('PostHog project API key'),
  VITE_PUBLIC_POSTHOG_HOST: z.string().url().optional().describe('PostHog API host (ingest)'),
  VITE_POSTHOG_DISABLED: booleanString.describe('Disable PostHog even if key is set'),

  // ==========================================================================
  // RevenueCat (optional - mobile payments)
  // ==========================================================================
  VITE_REVENUECAT_ANDROID_KEY: z.string().optional().describe('RevenueCat Android API key'),
  VITE_REVENUECAT_IOS_KEY: z.string().optional().describe('RevenueCat iOS API key'),

  // ==========================================================================
  // Social Auth (optional - native Google sign-in)
  // ==========================================================================
  VITE_GOOGLE_WEB_CLIENT_ID: z
    .string()
    .optional()
    .describe('Google OAuth web client ID for native Google sign-in'),

  // ==========================================================================
  // Lemon Squeezy (optional - web payments)
  // ==========================================================================
  VITE_LEMON_SQUEEZY_STORE_ID: z.string().optional().describe('Lemon Squeezy store ID'),
  VITE_LEMON_SQUEEZY_API_KEY: z.string().optional().describe('Lemon Squeezy API key'),

  // ==========================================================================
  // Feature Flags
  // ==========================================================================
  VITE_PREMIUM_MODE: booleanString.describe('Enable premium/subscription mode'),
  VITE_NATIVE_MODE: booleanString.describe('Enable native mobile features'),
  VITE_XP_REWARDS: booleanString.describe('Enable XP rewards system'),

  // ==========================================================================
  // External Links
  // ==========================================================================
  VITE_KOFI_URL: z
    .string()
    .url()
    .optional()
    .default('https://ko-fi.com/desla54')
    .describe('Ko-fi donation page URL'),
});

// =============================================================================
// Validation
// =============================================================================

/**
 * Validated environment variables.
 *
 * Access via `env.VITE_SUPABASE_URL` etc.
 * Type-safe and validated at import time.
 */
export const env = envSchema.parse(import.meta.env);

/**
 * Type of validated environment variables.
 */
export type Env = z.infer<typeof envSchema>;

// =============================================================================
// Production Validation (stricter)
// =============================================================================

/**
 * Validate production requirements.
 * Call this in app initialization to fail-fast if critical vars are missing.
 */
export function validateProductionEnv(): void {
  if (import.meta.env.PROD) {
    const errors: string[] = [];

    if (!env.VITE_SUPABASE_URL) {
      errors.push('VITE_SUPABASE_URL is required in production');
    }
    if (!env.VITE_SUPABASE_ANON_KEY) {
      errors.push('VITE_SUPABASE_ANON_KEY is required in production');
    }

    // PowerSync is optional (app works offline-only without it)
    // but warn if premium mode is enabled
    if (env.VITE_PREMIUM_MODE && !env.VITE_POWERSYNC_URL) {
      console.warn(
        '[env] VITE_POWERSYNC_URL not set but VITE_PREMIUM_MODE is enabled. Cloud sync will be disabled.',
      );
    }

    if (env.VITE_NATIVE_MODE && !env.VITE_GOOGLE_WEB_CLIENT_ID) {
      console.warn(
        '[env] VITE_GOOGLE_WEB_CLIENT_ID not set in native mode. Native Google sign-in will be disabled.',
      );
    }

    if (errors.length > 0) {
      throw new Error(`Missing required environment variables:\n${errors.join('\n')}`);
    }
  }
}

// =============================================================================
// Development Helpers
// =============================================================================

/**
 * Check if running in development mode.
 */
export const isDev = import.meta.env.DEV;

/**
 * Check if running in production mode.
 */
export const isProd = import.meta.env.PROD;

/**
 * Check if Supabase is configured.
 */
export const hasSupabase = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

/**
 * Check if PowerSync is configured.
 */
export const hasPowerSync = Boolean(env.VITE_POWERSYNC_URL);

/**
 * Check if Sentry is configured.
 */
export const hasSentry = Boolean(env.VITE_SENTRY_DSN);

/**
 * Check if PostHog is configured.
 */
export const hasPostHog = Boolean(
  env.VITE_PUBLIC_POSTHOG_KEY && env.VITE_POSTHOG_DISABLED !== true,
);
