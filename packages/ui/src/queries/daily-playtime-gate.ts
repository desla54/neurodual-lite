/**
 * Daily Playtime Gate
 *
 * Time-based freemium: free users get a daily playtime allowance.
 * - First N days (grace period): generous limit
 * - After grace period: standard limit
 * - Free trial (5 days unlimited): offered once at first wall hit
 * - Premium users: unlimited
 *
 * Uses trainingDailyTotals (reactive) for today's accumulated duration,
 * and progressionSummary for first_session_at (account age).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  DAILY_PLAYTIME_GRACE_DAYS,
  DAILY_PLAYTIME_GRACE_LIMIT_MS,
  DAILY_PLAYTIME_STANDARD_LIMIT_MS,
  FREE_TRIAL_DURATION_DAYS,
} from '@neurodual/logic';
import { useCurrentUser } from './auth';
import { useSubscribable } from '../reactive/use-subscribable';
import { getReadModelsAdapter } from './read-models';
import { useHasPremiumAccess } from './subscription';

// =============================================================================
// Types
// =============================================================================

export interface DailyPlaytimeGate {
  /** Is the daily limit reached? (always false for premium/trial users) */
  readonly isLimitReached: boolean;
  /** Time played today in ms */
  readonly playedTodayMs: number;
  /** Daily limit in ms for this user (based on account age) */
  readonly dailyLimitMs: number;
  /** Remaining time in ms (0 if limit reached) */
  readonly remainingMs: number;
  /** Is the user in the grace period (first N days)? */
  readonly isGracePeriod: boolean;
  /** Is the free trial available (never activated, wall hit)? */
  readonly isTrialAvailable: boolean;
  /** Is the user currently in the free trial? */
  readonly isInFreeTrial: boolean;
  /** Days remaining in free trial (null if not in trial) */
  readonly trialDaysRemaining: number | null;
  /** Activate the free trial */
  readonly activateTrial: () => void;
  /** Is loading (data not yet available)? */
  readonly isPending: boolean;
}

// =============================================================================
// Free trial helpers (localStorage-based)
// =============================================================================

const FREE_TRIAL_KEY = 'neurodual_free_trial_started_at';

function getTrialStartedAt(): number | null {
  try {
    const raw = localStorage.getItem(FREE_TRIAL_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function setTrialStartedAt(ts: number): void {
  try {
    localStorage.setItem(FREE_TRIAL_KEY, String(ts));
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

function getTrialState(): {
  isInTrial: boolean;
  daysRemaining: number | null;
  hasUsedTrial: boolean;
} {
  const startedAt = getTrialStartedAt();
  if (startedAt === null) {
    return { isInTrial: false, daysRemaining: null, hasUsedTrial: false };
  }

  const elapsedDays = (Date.now() - startedAt) / (1000 * 60 * 60 * 24);
  const remaining = FREE_TRIAL_DURATION_DAYS - elapsedDays;

  if (remaining > 0) {
    return { isInTrial: true, daysRemaining: Math.ceil(remaining), hasUsedTrial: true };
  }

  return { isInTrial: false, daysRemaining: 0, hasUsedTrial: true };
}

// =============================================================================
// Helpers
// =============================================================================

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysSinceFirstSession(firstSessionAt: string | null): number | null {
  if (!firstSessionAt) return null;
  const normalized = firstSessionAt.endsWith('Z') ? firstSessionAt : `${firstSessionAt}Z`;
  const first = new Date(normalized);
  if (Number.isNaN(first.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - first.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Reactive hook that checks if the free daily playtime limit is reached.
 *
 * Premium users always get `isLimitReached: false`.
 * Free trial users get `isLimitReached: false` for the trial duration.
 * Data comes from existing reactive read models (no new SQL queries needed).
 */
export function useDailyPlaytimeGate(): DailyPlaytimeGate {
  const hasPremium = useHasPremiumAccess();
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();

  // Reactive: today's duration from trainingDailyTotals
  const dailyTotalsSnap = useSubscribable(readModels.trainingDailyTotals(user?.id ?? null));
  // Reactive: first_session_at from progressionSummary
  const progressionSnap = useSubscribable(readModels.progressionSummary(user?.id ?? null));

  const today = todayLocalDate();

  // Counter to force re-render when trial is activated (localStorage is not reactive)
  const [trialGeneration, setTrialGeneration] = useState(0);

  const activateTrial = useCallback(() => {
    setTrialStartedAt(Date.now());
    setTrialGeneration((g) => g + 1);
  }, []);

  return useMemo<DailyPlaytimeGate>(() => {
    const trialState = getTrialState();

    if (hasPremium) {
      return {
        isLimitReached: false,
        playedTodayMs: 0,
        dailyLimitMs: Number.POSITIVE_INFINITY,
        remainingMs: Number.POSITIVE_INFINITY,
        isGracePeriod: false,
        isTrialAvailable: false,
        isInFreeTrial: false,
        trialDaysRemaining: null,
        activateTrial,
        isPending: false,
      };
    }

    // Free trial active → unlimited
    if (trialState.isInTrial) {
      return {
        isLimitReached: false,
        playedTodayMs: 0,
        dailyLimitMs: Number.POSITIVE_INFINITY,
        remainingMs: Number.POSITIVE_INFINITY,
        isGracePeriod: false,
        isTrialAvailable: false,
        isInFreeTrial: true,
        trialDaysRemaining: trialState.daysRemaining,
        activateTrial,
        isPending: false,
      };
    }

    const isPending = dailyTotalsSnap.isPending || progressionSnap.isPending;

    // Extract today's playtime from daily totals
    const dailyRows = dailyTotalsSnap.data as readonly {
      day: string;
      total_duration_ms: number;
    }[];
    const todayRow = dailyRows?.find((r) => r.day === today);
    const playedTodayMs = todayRow ? Number(todayRow.total_duration_ms ?? 0) : 0;

    // Extract first_session_at for account age
    const progressionRows = progressionSnap.data as readonly {
      first_session_at?: string | null;
    }[];
    const firstSessionAt = (progressionRows?.[0]?.first_session_at as string | null) ?? null;
    const accountAgeDays = daysSinceFirstSession(firstSessionAt);

    // Determine grace period: null accountAge (no sessions yet) = grace
    const isGracePeriod = accountAgeDays === null || accountAgeDays < DAILY_PLAYTIME_GRACE_DAYS;
    const dailyLimitMs = isGracePeriod
      ? DAILY_PLAYTIME_GRACE_LIMIT_MS
      : DAILY_PLAYTIME_STANDARD_LIMIT_MS;

    const remainingMs = Math.max(0, dailyLimitMs - playedTodayMs);
    const isLimitReached = playedTodayMs >= dailyLimitMs;

    // Trial available = limit reached + never used trial before
    const isTrialAvailable = isLimitReached && !trialState.hasUsedTrial;

    return {
      isLimitReached,
      playedTodayMs,
      dailyLimitMs,
      remainingMs,
      isGracePeriod,
      isTrialAvailable,
      isInFreeTrial: false,
      trialDaysRemaining: null,
      activateTrial,
      isPending,
    };
  }, [
    hasPremium,
    dailyTotalsSnap.data,
    dailyTotalsSnap.isPending,
    progressionSnap.data,
    progressionSnap.isPending,
    today,
    activateTrial,
    trialGeneration,
  ]);
}
