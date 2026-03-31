/**
 * useProgression Hook
 *
 * Fetches and manages user progression state (XP, level, badges).
 *
 * Uses PowerSync watched queries for INSTANT reactive updates.
 * No manual refresh needed - data updates automatically when SQLite changes.
 *
 * OPTIMIZATION: Uses useMemo to avoid creating new UserProgression on every render.
 */

import { UserProgression } from '@neurodual/logic';
import { useMemo } from 'react';
import { useProgressionQuery, useBadgesQuery } from '../queries';

let warnedInvalidProgressionData = false;

export interface UseProgressionReturn {
  /** User progression (null while loading) */
  progression: UserProgression | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
}

export function useProgression(): UseProgressionReturn {
  const {
    data: progressionData,
    isPending: progressionLoading,
    error: progressionError,
  } = useProgressionQuery();
  const { data: badges = [], isPending: badgesLoading, error: badgesError } = useBadgesQuery();

  const isLoading = progressionLoading || badgesLoading;
  const error = progressionError ?? badgesError ?? null;

  // Build UserProgression from query data - MEMOIZED to prevent re-creation on every render
  const progression = useMemo(() => {
    if (isLoading || error) return null;

    // Defensive check: ensure progressionData has required fields
    // This guards against race conditions or partial data
    if (!progressionData || typeof progressionData.totalXP !== 'number') {
      if (
        progressionData &&
        typeof progressionData.totalXP !== 'number' &&
        !warnedInvalidProgressionData
      ) {
        console.warn('[useProgression] Invalid progressionData - totalXP is not a number:', {
          totalXP: progressionData.totalXP,
          type: typeof progressionData.totalXP,
          progressionData,
        });
        warnedInvalidProgressionData = true;
      }
      return UserProgression.empty();
    }

    return UserProgression.fromRecord(
      {
        totalXP: progressionData.totalXP,
        completedSessions: progressionData.completedSessions,
        abandonedSessions: progressionData.abandonedSessions,
        totalTrials: progressionData.totalTrials,
        firstSessionAt: progressionData.firstSessionAt,
        earlyMorningSessions: progressionData.earlyMorningSessions,
        lateNightSessions: progressionData.lateNightSessions,
        comebackCount: progressionData.comebackCount,
        persistentDays: progressionData.persistentDays,
        plateausBroken: progressionData.plateausBroken,
        uninterruptedSessionsStreak: progressionData.uninterruptedSessionsStreak ?? 0,
      },
      badges,
    );
  }, [progressionData, badges, isLoading, error]);

  return {
    progression,
    isLoading,
    error,
  };
}
