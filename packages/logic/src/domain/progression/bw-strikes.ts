/**
 * Brain Workshop Strikes Calculator
 *
 * Extracted from brainworkshop-progression.ts (OOP strategy dead code).
 * These are the only production-used pieces from that file.
 */

import { PROGRESSION_SCORE_STRIKE } from '../../specs/thresholds';

/**
 * Session data needed to calculate strikes.
 */
export interface BrainWorkshopSessionData {
  /** Session score (0-100) */
  score: number;
  /** N-level of the session */
  nLevel: number;
  /** Timestamp for sorting */
  timestamp: number;
}

/**
 * Calculate Brain Workshop strikes from session history.
 *
 * Strikes are sessions with score < 50% at the same level.
 * They reset ONLY when level changes (up or down).
 *
 * IMPORTANT: BW original does NOT reset strikes on success!
 * A score >= 50% just doesn't add a strike, but doesn't reset either.
 *
 * Example: Fail(40%) -> Success(60%) -> Fail(40%) = 2 strikes (not 1)
 *
 * @param sessions - Sessions for the Brain Workshop journey, most recent first
 * @returns Number of strikes (0-2, as 3 would trigger level down)
 */
export function calculateBrainWorkshopStrikes(
  sessions: readonly BrainWorkshopSessionData[],
): number {
  if (sessions.length === 0) return 0;

  // Sort by timestamp DESC (most recent first)
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);

  const STRIKES_TO_DOWN = 3;
  let strikes = 0;
  const currentLevel = sorted[0]?.nLevel;

  for (const session of sorted) {
    // Level change resets strikes (only reset condition!)
    if (session.nLevel !== currentLevel) break;

    // Score < 50%: add a strike
    if (session.score < PROGRESSION_SCORE_STRIKE) {
      strikes++;
    }
    // Score >= 50%: do NOT add strike, but also do NOT reset (BW original)

    // Max 2 strikes can be carried (3 would have caused level down)
    if (strikes >= STRIKES_TO_DOWN - 1) break;
  }

  return strikes;
}
