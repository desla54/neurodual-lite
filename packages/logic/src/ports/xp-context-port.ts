/**
 * XP Context Port
 *
 * Port for providing XP calculation context to the game session machine.
 * Allows the machine to calculate XP without depending on infra/database.
 *
 * The port provides "session-external" data that the machine cannot know:
 * - Streak information (requires historical data)
 * - Daily session count (requires today's sessions)
 * - First session of day flag
 *
 * The machine provides "session-internal" data:
 * - Session summary (from SessionProjector)
 * - New badges (if badge checking is integrated)
 * - Confidence score (from summary or judge)
 * - Flow state (from CognitiveProfiler or heuristic)
 */

import type { BadgeDefinition } from '../domain/progression/badges';
import type { AnySessionSummary } from '../domain/progression/xp';

// =============================================================================
// XP Context Port
// =============================================================================

/**
 * External context needed for XP calculation.
 * This data comes from the database/history, not the current session.
 */
export interface XPExternalContext {
  /** Current streak in days (0 if no streak) */
  readonly streakDays: number;
  /** Is this the first session of the day? */
  readonly isFirstOfDay: boolean;
  /** Number of sessions already completed today (before this one) */
  readonly sessionsToday: number;
  /** New badges unlocked by this session (calculated externally) */
  readonly newBadges: readonly BadgeDefinition[];
}

/**
 * Port for providing XP context to the game session machine.
 *
 * Implementation is in @neurodual/infra and reads from the database.
 */
export interface XPContextPort {
  /**
   * Get the external context needed for XP calculation.
   * Called when session ends to compute XP breakdown.
   *
   * @param userId - Current user ID
   * @param session - The completed session summary
   * @returns External context for XP calculation
   */
  getXPContext(userId: string, session: AnySessionSummary): Promise<XPExternalContext>;
}

// =============================================================================
// Null Implementation (for tests/standalone)
// =============================================================================

/**
 * Null implementation that returns default values.
 * Use for tests or when XP calculation is not needed.
 */
export const nullXPContextPort: XPContextPort = {
  async getXPContext() {
    return {
      streakDays: 0,
      isFirstOfDay: false,
      sessionsToday: 0,
      newBadges: [],
    };
  },
};
