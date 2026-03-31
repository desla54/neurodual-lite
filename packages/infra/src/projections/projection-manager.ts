// packages/infra/src/projections/projection-manager.ts
/**
 * Projection Manager - Pure Functions
 *
 * Core computation functions for projections.
 * The UnifiedProjectionManager class has been replaced by ProjectionProcessor
 * (see projection-processor.ts).
 */

import type { StreakState } from './streak-projection';

// =============================================================================
// Helper Functions
// =============================================================================

function hoursBetween(date1: string | null, date2: string): number {
  if (!date1) return 0;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
}

const STREAK_RESET_HOURS = 48;

// =============================================================================
// Pure Functions (used by projection definitions)
// =============================================================================

/**
 * Core streak computation - pure function for testability
 */
export function computeStreak(current: StreakState, eventDate: string): StreakState {
  if (current.lastActiveDate === eventDate) {
    return current;
  }

  if (!current.lastActiveDate) {
    return {
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: eventDate,
    };
  }

  const hoursSince = hoursBetween(current.lastActiveDate, eventDate);

  if (hoursSince <= STREAK_RESET_HOURS) {
    const newStreak = current.currentStreak + 1;
    return {
      currentStreak: newStreak,
      bestStreak: Math.max(current.bestStreak, newStreak),
      lastActiveDate: eventDate,
    };
  }

  return {
    currentStreak: 1,
    bestStreak: current.bestStreak,
    lastActiveDate: eventDate,
  };
}

/**
 * Core N-level computation - pure function for testability
 *
 * Brain Workshop rules:
 * - 3 consecutive sessions < 50% accuracy → decrease level
 * - 3 consecutive sessions > 80% accuracy → increase level
 * - Between 50-80% → reset streaks
 */
export function computeNLevel(
  current: { strikes_below_50: number; strikes_above_80: number; recommended_level: number },
  accuracy: number,
  nLevel: number,
): { strikes_below_50: number; strikes_above_80: number; recommended_level: number } {
  if (accuracy < 50) {
    const newStrikesBelow50 = current.strikes_below_50 + 1;
    return {
      strikes_below_50: newStrikesBelow50,
      strikes_above_80: 0,
      recommended_level:
        newStrikesBelow50 >= 3 && nLevel > 1 ? nLevel - 1 : current.recommended_level,
    };
  }

  if (accuracy > 80) {
    const newStrikesAbove80 = current.strikes_above_80 + 1;
    return {
      strikes_below_50: 0,
      strikes_above_80: newStrikesAbove80,
      recommended_level: newStrikesAbove80 >= 3 ? nLevel + 1 : current.recommended_level,
    };
  }

  return {
    strikes_below_50: 0,
    strikes_above_80: 0,
    recommended_level: current.recommended_level,
  };
}
