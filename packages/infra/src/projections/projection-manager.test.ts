// packages/infra/src/projections/projection-manager.test.ts
/**
 * Projection Tests
 *
 * Unit tests for pure functions (computeStreak, computeNLevel).
 * Integration tests for ProjectionProcessor are in projection-processor.test.ts.
 */

import { describe, it, expect } from 'bun:test';
import { computeStreak, computeNLevel } from './projection-manager';
import type { StreakState } from './streak-projection';

// =============================================================================
// Pure Function Tests: computeStreak
// =============================================================================

describe('computeStreak', () => {
  it('should start a new streak when no previous activity', () => {
    const initial: StreakState = {
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: null,
    };

    const result = computeStreak(initial, '2026-02-28');

    expect(result).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: '2026-02-28',
    });
  });

  it('should increment streak when within 48h window', () => {
    const current: StreakState = {
      currentStreak: 3,
      bestStreak: 5,
      lastActiveDate: '2026-02-27',
    };

    const result = computeStreak(current, '2026-02-28');

    expect(result).toEqual({
      currentStreak: 4,
      bestStreak: 5, // Best remains 5
      lastActiveDate: '2026-02-28',
    });
  });

  it('should update best streak when exceeding previous best', () => {
    const current: StreakState = {
      currentStreak: 5,
      bestStreak: 5,
      lastActiveDate: '2026-02-27',
    };

    const result = computeStreak(current, '2026-02-28');

    expect(result).toEqual({
      currentStreak: 6,
      bestStreak: 6, // Best updated to 6
      lastActiveDate: '2026-02-28',
    });
  });

  it('should reset streak after 48h gap', () => {
    const current: StreakState = {
      currentStreak: 10,
      bestStreak: 10,
      lastActiveDate: '2026-02-20', // More than 48h ago
    };

    const result = computeStreak(current, '2026-02-28');

    expect(result).toEqual({
      currentStreak: 1, // Reset to 1
      bestStreak: 10, // Best preserved
      lastActiveDate: '2026-02-28',
    });
  });

  it('should not change streak on same day', () => {
    const current: StreakState = {
      currentStreak: 5,
      bestStreak: 7,
      lastActiveDate: '2026-02-28',
    };

    const result = computeStreak(current, '2026-02-28');

    expect(result).toEqual(current); // Same reference
  });

  it('should handle exactly 48h window (boundary test)', () => {
    const current: StreakState = {
      currentStreak: 3,
      bestStreak: 5,
      lastActiveDate: '2026-02-26',
    };

    const result = computeStreak(current, '2026-02-28');

    // Exactly 48h should still be consecutive (hoursBetween returns 48)
    expect(result.currentStreak).toBe(4);
  });

  it('should reset just after 48h window (boundary test)', () => {
    const current: StreakState = {
      currentStreak: 3,
      bestStreak: 5,
      lastActiveDate: '2026-02-25', // More than 48h from 2026-02-28
    };

    const result = computeStreak(current, '2026-02-28');

    expect(result.currentStreak).toBe(1); // Reset
    expect(result.bestStreak).toBe(5); // Best preserved
  });
});

// =============================================================================
// Pure Function Tests: computeNLevel
// =============================================================================

describe('computeNLevel', () => {
  it('should increment strike count when accuracy < 50%', () => {
    const current = {
      strikes_below_50: 0,
      strikes_above_80: 0,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 45, 3);

    expect(result).toEqual({
      strikes_below_50: 1,
      strikes_above_80: 0,
      recommended_level: 3, // Not yet at 3 strikes
    });
  });

  it('should decrease level after 3 strikes below 50%', () => {
    const current = {
      strikes_below_50: 2, // Already have 2 strikes
      strikes_above_80: 0,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 40, 3);

    expect(result).toEqual({
      strikes_below_50: 3,
      strikes_above_80: 0,
      recommended_level: 2, // Decreased from 3 to 2
    });
  });

  it('should not decrease level below 1', () => {
    const current = {
      strikes_below_50: 2,
      strikes_above_80: 0,
      recommended_level: 1,
    };

    const result = computeNLevel(current, 30, 1);

    expect(result).toEqual({
      strikes_below_50: 3,
      strikes_above_80: 0,
      recommended_level: 1, // Stays at 1 (minimum)
    });
  });

  it('should increment strike count when accuracy > 80%', () => {
    const current = {
      strikes_below_50: 0,
      strikes_above_80: 0,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 85, 3);

    expect(result).toEqual({
      strikes_below_50: 0,
      strikes_above_80: 1,
      recommended_level: 3, // Not yet at 3 strikes
    });
  });

  it('should increase level after 3 strikes above 80%', () => {
    const current = {
      strikes_below_50: 0,
      strikes_above_80: 2, // Already have 2 strikes
      recommended_level: 3,
    };

    const result = computeNLevel(current, 90, 3);

    expect(result).toEqual({
      strikes_below_50: 0,
      strikes_above_80: 3,
      recommended_level: 4, // Increased from 3 to 4
    });
  });

  it('should reset both streaks when accuracy is between 50-80%', () => {
    const current = {
      strikes_below_50: 2,
      strikes_above_80: 1,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 65, 3);

    expect(result).toEqual({
      strikes_below_50: 0, // Reset
      strikes_above_80: 0, // Reset
      recommended_level: 3, // Unchanged
    });
  });

  it('should reset below-50 streak when accuracy is > 50%', () => {
    const current = {
      strikes_below_50: 2,
      strikes_above_80: 0,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 85, 3);

    expect(result).toEqual({
      strikes_below_50: 0, // Reset
      strikes_above_80: 1,
      recommended_level: 3,
    });
  });

  it('should reset above-80 streak when accuracy is < 80%', () => {
    const current = {
      strikes_below_50: 0,
      strikes_above_80: 2,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 45, 3);

    expect(result).toEqual({
      strikes_below_50: 1,
      strikes_above_80: 0, // Reset
      recommended_level: 3,
    });
  });

  it('should handle boundary: exactly 50% (resets streaks)', () => {
    const current = {
      strikes_below_50: 2,
      strikes_above_80: 2,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 50, 3);

    expect(result).toEqual({
      strikes_below_50: 0, // Reset
      strikes_above_80: 0, // Reset
      recommended_level: 3,
    });
  });

  it('should handle boundary: exactly 80% (resets streaks)', () => {
    const current = {
      strikes_below_50: 2,
      strikes_above_80: 2,
      recommended_level: 3,
    };

    const result = computeNLevel(current, 80, 3);

    expect(result).toEqual({
      strikes_below_50: 0, // Reset
      strikes_above_80: 0, // Reset
      recommended_level: 3,
    });
  });
});
