/**
 * SubscriptionPort
 *
 * Interface for subscription/premium status.
 * Implemented by infra (Supabase), consumed by ui via Context.
 */

import {
  PREMIUM_N_THRESHOLD as _PREMIUM_N_THRESHOLD,
  DAILY_PLAYTIME_GRACE_DAYS as _DAILY_PLAYTIME_GRACE_DAYS,
  DAILY_PLAYTIME_GRACE_LIMIT_MS as _DAILY_PLAYTIME_GRACE_LIMIT_MS,
  DAILY_PLAYTIME_STANDARD_LIMIT_MS as _DAILY_PLAYTIME_STANDARD_LIMIT_MS,
  FREE_TRIAL_DURATION_DAYS as _FREE_TRIAL_DURATION_DAYS,
} from '../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

export type PlanType = 'free' | 'premium';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export type PaymentProvider = 'stripe' | 'apple' | 'google' | 'lemon_squeezy';

export interface Subscription {
  /** Subscription ID */
  readonly id: string;
  /** User ID */
  readonly userId: string;
  /** Plan type */
  readonly planType: PlanType;
  /** Status */
  readonly status: SubscriptionStatus;
  /** Start date */
  readonly startedAt: Date;
  /** Expiry date (null for lifetime/free) */
  readonly expiresAt: Date | null;
  /** Cancelled date */
  readonly cancelledAt: Date | null;
  /** Payment provider */
  readonly paymentProvider: PaymentProvider | null;
}

export interface SubscriptionState {
  /** Current subscription */
  readonly subscription: Subscription | null;
  /** Has premium access (N4+ and cloud sync) */
  readonly hasPremiumAccess: boolean;
  /** Has cloud sync (same as premium) */
  readonly hasCloudSync: boolean;
  /** Is in trial period */
  readonly isTrialing: boolean;
  /** Days remaining in trial/subscription */
  readonly daysRemaining: number | null;
}

// =============================================================================
// Constants (re-export from SSOT)
// =============================================================================

/** N-level threshold for premium features (N >= 4 = premium) */
export const PREMIUM_N_THRESHOLD = _PREMIUM_N_THRESHOLD;

/** Daily playtime gate constants (time-based freemium) */
export const DAILY_PLAYTIME_GRACE_DAYS = _DAILY_PLAYTIME_GRACE_DAYS;
export const DAILY_PLAYTIME_GRACE_LIMIT_MS = _DAILY_PLAYTIME_GRACE_LIMIT_MS;
export const DAILY_PLAYTIME_STANDARD_LIMIT_MS = _DAILY_PLAYTIME_STANDARD_LIMIT_MS;
export const FREE_TRIAL_DURATION_DAYS = _FREE_TRIAL_DURATION_DAYS;

// =============================================================================
// Port
// =============================================================================

export type SubscriptionListener = (state: SubscriptionState) => void;

export interface SubscriptionPort {
  /** Get current subscription state */
  getState(): SubscriptionState;

  /** Subscribe to subscription changes. Returns unsubscribe function. */
  subscribe(listener: SubscriptionListener): () => void;

  /** Refresh subscription from server */
  refresh(): Promise<void>;

  /** Check if user can access a specific N-level */
  canAccessNLevel(nLevel: number): boolean;

  /** Check if user can sync to cloud */
  canSyncToCloud(): boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/** Check if a plan grants premium access */
export function planHasPremiumAccess(planType: PlanType, status: SubscriptionStatus): boolean {
  if (planType === 'free') return false;
  return status === 'active' || status === 'trial';
}

/** Check if a plan grants cloud sync (same as premium) */
export function planHasCloudSync(planType: PlanType, status: SubscriptionStatus): boolean {
  return planHasPremiumAccess(planType, status);
}

/** Calculate days remaining */
export function calculateDaysRemaining(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
