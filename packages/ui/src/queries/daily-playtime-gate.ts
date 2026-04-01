/**
 * Daily Playtime Gate
 *
 * Tracks total gameplay time and gates access after 30 min free.
 * Backed by the PremiumPort.
 */

import { useMemo } from 'react';
import { FREE_PLAYTIME_MS } from '@neurodual/logic';
import { usePremiumState, useIsPremium } from './premium';

// =============================================================================
// Types
// =============================================================================

export interface DailyPlaytimeGate {
  /** Is the free time exhausted? */
  readonly isLimitReached: boolean;
  /** Total time played in ms */
  readonly playedTodayMs: number;
  /** Free time limit in ms */
  readonly dailyLimitMs: number;
  /** Remaining free time in ms */
  readonly remainingMs: number;
  /** Is the user in the grace period? Always false. */
  readonly isGracePeriod: boolean;
  /** Is the free trial available? Always false. */
  readonly isTrialAvailable: boolean;
  /** Is the user currently in the free trial? Always false. */
  readonly isInFreeTrial: boolean;
  /** Days remaining in free trial (always null) */
  readonly trialDaysRemaining: number | null;
  /** Activate the free trial (noop) */
  readonly activateTrial: () => void;
  /** Is loading? */
  readonly isPending: boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useDailyPlaytimeGate(): DailyPlaytimeGate {
  const isPremium = useIsPremium();
  const { data, isPending } = usePremiumState();

  return useMemo<DailyPlaytimeGate>(() => {
    if (isPremium) {
      return {
        isLimitReached: false,
        playedTodayMs: data?.totalPlaytimeMs ?? 0,
        dailyLimitMs: Number.POSITIVE_INFINITY,
        remainingMs: Number.POSITIVE_INFINITY,
        isGracePeriod: false,
        isTrialAvailable: false,
        isInFreeTrial: false,
        trialDaysRemaining: null,
        activateTrial: () => {},
        isPending,
      };
    }

    const totalMs = data?.totalPlaytimeMs ?? 0;
    const remaining = Math.max(0, FREE_PLAYTIME_MS - totalMs);

    return {
      isLimitReached: totalMs >= FREE_PLAYTIME_MS,
      playedTodayMs: totalMs,
      dailyLimitMs: FREE_PLAYTIME_MS,
      remainingMs: remaining,
      isGracePeriod: false,
      isTrialAvailable: false,
      isInFreeTrial: false,
      trialDaysRemaining: null,
      activateTrial: () => {},
      isPending,
    };
  }, [isPremium, data, isPending]);
}
