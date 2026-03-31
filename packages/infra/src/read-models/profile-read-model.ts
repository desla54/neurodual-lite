/**
 * Profile Read Model
 *
 * Combines 6 PowerSync watched queries into a single reactive `Subscribable<PlayerProfile>`.
 * All row→domain transformation is done via `projectPlayerProfileFromRows` (logic layer).
 *
 * Replaces the heavy `useMemo` in `packages/ui/src/queries/profile.ts`.
 */

import {
  combineSubscribables,
  projectPlayerProfileFromRows,
  type PlayerProfile,
  type ReadModelPort,
  type ReadModelSnapshot,
  type Subscribable,
} from '@neurodual/logic';

// =============================================================================
// Public interface
// =============================================================================

export interface ProfileReadModel {
  /** Reactive profile for the given user. Combines 6 watched queries internally. */
  getProfile(userId: string | null): Subscribable<ReadModelSnapshot<PlayerProfile>>;
}

// =============================================================================
// Implementation
// =============================================================================

const profileCache = new Map<string, Subscribable<ReadModelSnapshot<PlayerProfile>>>();

export function createProfileReadModel(readModels: ReadModelPort): ProfileReadModel {
  return {
    getProfile(userId: string | null): Subscribable<ReadModelSnapshot<PlayerProfile>> {
      const cacheKey = `profile:${userId ?? 'local'}`;
      const existing = profileCache.get(cacheKey);
      if (existing) return existing;

      const summary = readModels.profileSummary(userId);
      const latest = readModels.profileLatestSession(userId);
      const sessionDays = readModels.profileSessionDays(userId);
      const progression = readModels.profileProgression(userId);
      const modality = readModels.profileModalitySource(userId);
      const streak = readModels.profileStreak(userId);

      const preferredUserId = userId ?? 'local';

      const combined = combineSubscribables(
        [summary, latest, sessionDays, progression, modality, streak] as const,
        ([summaryData, latestData, sessionDaysData, progressionData, modalityData, streakData]) =>
          projectPlayerProfileFromRows(
            preferredUserId,
            summaryData,
            latestData,
            sessionDaysData,
            progressionData,
            modalityData,
            streakData,
          ),
      );

      // Cache with auto-eviction on last unsubscribe.
      const cached: Subscribable<ReadModelSnapshot<PlayerProfile>> = {
        subscribe(listener) {
          const unsub = combined.subscribe(listener);
          return () => {
            unsub();
            // Evict after unsubscribe cascade settles.
            queueMicrotask(() => {
              profileCache.delete(cacheKey);
            });
          };
        },
        getSnapshot: () => combined.getSnapshot(),
      };

      profileCache.set(cacheKey, cached);
      return cached;
    },
  };
}
