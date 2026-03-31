/**
 * Daily Playtime Gate (Lite - No Restrictions)
 *
 * In Lite mode, there are no playtime limits.
 * All users have unlimited access.
 */

import { useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface DailyPlaytimeGate {
  /** Is the daily limit reached? Always false in Lite. */
  readonly isLimitReached: boolean;
  /** Time played today in ms */
  readonly playedTodayMs: number;
  /** Daily limit in ms (Infinity in Lite) */
  readonly dailyLimitMs: number;
  /** Remaining time in ms (Infinity in Lite) */
  readonly remainingMs: number;
  /** Is the user in the grace period? Always false in Lite. */
  readonly isGracePeriod: boolean;
  /** Is the free trial available? Always false in Lite. */
  readonly isTrialAvailable: boolean;
  /** Is the user currently in the free trial? Always false in Lite. */
  readonly isInFreeTrial: boolean;
  /** Days remaining in free trial (always null in Lite) */
  readonly trialDaysRemaining: number | null;
  /** Activate the free trial (noop in Lite) */
  readonly activateTrial: () => void;
  /** Is loading? Always false in Lite. */
  readonly isPending: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * In Lite mode, there are no playtime restrictions.
 * Always returns unlimited access.
 */
export function useDailyPlaytimeGate(): DailyPlaytimeGate {
  return useMemo<DailyPlaytimeGate>(
    () => ({
      isLimitReached: false,
      playedTodayMs: 0,
      dailyLimitMs: Number.POSITIVE_INFINITY,
      remainingMs: Number.POSITIVE_INFINITY,
      isGracePeriod: false,
      isTrialAvailable: false,
      isInFreeTrial: false,
      trialDaysRemaining: null,
      activateTrial: () => {},
      isPending: false,
    }),
    [],
  );
}
