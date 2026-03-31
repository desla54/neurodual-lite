/**
 * XP Context Adapter
 *
 * Implementation of XPContextPort that reads from SQLite database.
 * Provides external context needed for XP calculation:
 * - Streak days (from profile)
 * - Session count today (from daily activity)
 * - First session of day flag
 * - New badges (from badge checker)
 */

import type { AnySessionSummary, XPContextPort, XPExternalContext } from '@neurodual/logic';
import type { BadgeDefinition } from '@neurodual/logic';
import type { StatsHelpersPort } from '@neurodual/logic';

// =============================================================================
// XP Context Adapter Implementation
// =============================================================================

/**
 * Factory function to create an XPContextAdapter.
 */
export function createXPContextAdapter(persistence: StatsHelpersPort): XPContextPort {
  return {
    async getXPContext(userId: string, _session: AnySessionSummary): Promise<XPExternalContext> {
      // Get streak info (includes current streak days)
      const streakInfo = await persistence.getStreakInfo(userId);

      // Get today's session count from daily activity
      const dailyActivity = await persistence.getDailyActivity(userId, 1);
      const todayCount = dailyActivity[0]?.count ?? 0;

      // First of day = no sessions completed yet today
      // Note: When this is called, the current session is finishing but not yet counted
      // So isFirstOfDay is true if todayCount === 0 (this was the first)
      // But we're calculating XP for a session that just completed...
      // The session that just completed is already in the events, so todayCount includes it
      // isFirstOfDay means "was this the first session of the day when it started"
      // Since the session is ending now, if todayCount === 1, this was the first
      const isFirstOfDay = todayCount <= 1;

      // Sessions today before this one
      const sessionsToday = Math.max(0, todayCount - 1);

      // TODO: Badge checking would require more infrastructure
      // For now, return empty array - badges are calculated elsewhere
      const newBadges: readonly BadgeDefinition[] = [];

      return {
        streakDays: streakInfo.current,
        isFirstOfDay,
        sessionsToday,
        newBadges,
      };
    },
  };
}
