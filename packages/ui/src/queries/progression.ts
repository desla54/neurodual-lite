/**
 * Progression Queries
 *
 * Uses Drizzle-compiled PowerSync watched queries.
 * Aggregates are computed in SQL to avoid heavy main-thread transforms.
 */

import { useMemo } from 'react';
import {
  createEmptyProgression,
  type ProgressionPort,
  type ProgressionRecord,
  type UnlockedBadge,
} from '@neurodual/logic';
import { useCurrentUser } from './auth';
import { useSubscribable } from '../reactive/use-subscribable';
import { getReadModelsAdapter } from './read-models';
import { parseSqlDate } from './history-row-model';

// =============================================================================
// Adapter Reference (injected via Provider) - for mutations and badges
// =============================================================================

let progressionAdapter: ProgressionPort | null = null;

export function setProgressionAdapter(adapter: ProgressionPort): void {
  progressionAdapter = adapter;
}

export function getProgressionAdapter(): ProgressionPort {
  if (!progressionAdapter) {
    throw new Error('Progression adapter not initialized. Call setProgressionAdapter first.');
  }
  return progressionAdapter;
}

// =============================================================================
// Drizzle schema + compilation helpers
// =============================================================================

interface ProgressionSummaryRowDb {
  completed_sessions: number;
  abandoned_sessions: number;
  total_trials: number;
  first_session_at: string | null;
  total_xp: number;
  early_morning_sessions: number;
  late_night_sessions: number;
}

interface ProgressionStreakRowDb {
  uninterrupted_streak: number;
}

interface BadgeRowDb {
  id: string;
  badge_id: string | null;
  session_id: string;
  timestamp: number;
}

// =============================================================================
// Query Hooks (PowerSync Reactive)
// =============================================================================

/**
 * Hook to get user progression data (XP, session counts).
 */
export function useProgressionQuery(): {
  data: ProgressionRecord;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();
  const summarySnap = useSubscribable(readModels.progressionSummary(user?.id ?? null));
  const streakSnap = useSubscribable(readModels.progressionUninterruptedStreak(user?.id ?? null));

  const summaryRows = summarySnap.data as ProgressionSummaryRowDb[];
  const streakRows = streakSnap.data as ProgressionStreakRowDb[];

  const progression = useMemo<ProgressionRecord>(() => {
    const summary = summaryRows?.[0];
    if (!summary) return createEmptyProgression();
    const completedSessions = Number(summary.completed_sessions ?? 0);
    const abandonedSessions = Number(summary.abandoned_sessions ?? 0);
    const totalTrials = Number(summary.total_trials ?? 0);
    const totalXP = Number(summary.total_xp ?? 0);
    const firstSessionAt = parseSqlDate(summary.first_session_at);
    const earlyMorningSessions = Number(summary.early_morning_sessions ?? 0);
    const lateNightSessions = Number(summary.late_night_sessions ?? 0);
    const uninterruptedSessionsStreak = Number(streakRows?.[0]?.uninterrupted_streak ?? 0);

    return {
      totalXP,
      completedSessions,
      abandonedSessions,
      totalTrials,
      firstSessionAt,
      earlyMorningSessions,
      lateNightSessions,
      comebackCount: 0,
      persistentDays: completedSessions > 0 ? 1 : 0,
      plateausBroken: 0,
      uninterruptedSessionsStreak,
    };
  }, [summaryRows, summaryRows?.length, streakRows, streakRows?.length]);

  return {
    data: progression,
    isPending: summarySnap.isPending || streakSnap.isPending,
    error:
      (summarySnap.error ?? streakSnap.error)
        ? new Error(summarySnap.error ?? streakSnap.error ?? '')
        : null,
  };
}

/**
 * Hook to fetch user badges.
 * Badges are event-sourced (BADGE_UNLOCKED events), not session-derived.
 */
export function useBadgesQuery() {
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();
  const snap = useSubscribable(readModels.badgesUnlocked(user?.id ?? null));
  const rows = snap.data as BadgeRowDb[];

  const badges = useMemo<UnlockedBadge[]>(() => {
    if (!rows) return [];
    const badges: UnlockedBadge[] = [];
    for (const row of rows) {
      if (row.badge_id == null || row.badge_id === '') continue;
      const unlockedAt = parseSqlDate(row.timestamp);
      if (!unlockedAt) continue;
      badges.push({
        badgeId: row.badge_id,
        sessionId: row.session_id,
        unlockedAt,
      });
    }
    return badges;
  }, [rows, rows?.length]);

  return {
    data: badges,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}
