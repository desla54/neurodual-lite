/**
 * useUserProfile Hook
 *
 * Hook pour accéder au profil utilisateur (cognitive profile).
 *
 * Uses PowerSync watched queries for INSTANT reactive updates.
 * No manual refresh needed - data updates automatically when SQLite changes.
 */

import type { PlayerProfile } from '@neurodual/logic';
import { useProfileQuery } from '../queries';

// =============================================================================
// Default Empty Profile
// =============================================================================

const EMPTY_PROFILE: PlayerProfile = {
  odalisqueId: 'local',
  version: 1,
  computedAt: 0,
  currentNLevel: 1,
  highestNLevel: 1,
  totalSessions: 0,
  totalTrials: 0,
  totalDurationMs: 0,
  avgDPrime: 0,
  bestDPrime: 0,
  modalities: new Map(),
  strengths: [],
  weaknesses: [],
  preferredISI: 2500,
  avgReactionTime: null,
  avgFocusLostPerSession: 0,
  totalFocusLostMs: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSessionDate: null,
  maxNByModality: new Map(),
  masteryCountByModality: new Map(),
  progression: [],
  lastEventId: null,
  lastEventTimestamp: null,
};

// =============================================================================
// Hook
// =============================================================================

export interface UseUserProfileReturn {
  /** Current player profile */
  profile: PlayerProfile;
  /** Loading state */
  loading: boolean;
  /** Error if load failed */
  error: Error | null;
}

export function useUserProfile(): UseUserProfileReturn {
  const { data: profile, isPending: loading, error: queryError } = useProfileQuery();

  return {
    profile: profile ?? EMPTY_PROFILE,
    loading,
    error: queryError ?? null,
  };
}
