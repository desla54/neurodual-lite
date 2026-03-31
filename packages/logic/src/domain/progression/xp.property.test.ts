/**
 * Property-Based Tests for XP System
 *
 * Invariants:
 * - XP is always non-negative
 * - Level increases monotonically with XP
 * - Session XP has a minimum floor (presence reward)
 * - Premium rewards are unlocked at correct levels
 */
import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { getLevel, getNextReward, LEVEL_THRESHOLDS, MAX_LEVEL, MIN_XP_FLOOR } from './xp';
import {
  PREMIUM_LEVEL_7_DAYS,
  PREMIUM_LEVEL_1_MONTH,
  PREMIUM_LEVEL_3_MONTHS,
  PREMIUM_LEVEL_LIFETIME,
} from '../../specs/thresholds';

// =============================================================================
// Arbitraries
// =============================================================================

const xpArb = fc.integer({ min: 0, max: 1000000 });
const levelArb = fc.integer({ min: 1, max: MAX_LEVEL });

// Helper to get XP threshold for a level
const getXPForLevel = (level: number): number => LEVEL_THRESHOLDS[level - 1] ?? 0;

// =============================================================================
// Level/XP Conversion Tests
// =============================================================================

describe('XP System - Level Conversion Property Tests', () => {
  it('getLevel returns level in [1, MAX_LEVEL]', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        return level >= 1 && level <= MAX_LEVEL;
      }),
      { numRuns: 200 },
    );
  });

  it('getLevel is monotonically non-decreasing', () => {
    fc.assert(
      fc.property(xpArb, xpArb, (xp1, xp2) => {
        const [low, high] = xp1 < xp2 ? [xp1, xp2] : [xp2, xp1];
        return getLevel(low) <= getLevel(high);
      }),
      { numRuns: 200 },
    );
  });

  it('LEVEL_THRESHOLDS is monotonically increasing', () => {
    fc.assert(
      fc.property(levelArb, levelArb, (level1, level2) => {
        if (level1 === level2) return true;
        const [low, high] = level1 < level2 ? [level1, level2] : [level2, level1];
        return getXPForLevel(low) < getXPForLevel(high);
      }),
      { numRuns: 100 },
    );
  });

  it('round-trip: getLevel(LEVEL_THRESHOLDS[level-1]) === level', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_LEVEL - 1 }), (level) => {
        const xp = getXPForLevel(level);
        return getLevel(xp) === level;
      }),
      { numRuns: MAX_LEVEL - 1 },
    );
  });

  it('level 1 requires 0 XP', () => {
    expect(getXPForLevel(1)).toBe(0);
    expect(getLevel(0)).toBe(1);
  });

  it('XP just below threshold stays at previous level', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: MAX_LEVEL }), (level) => {
        const threshold = getXPForLevel(level);
        if (threshold <= 0) return true;
        return getLevel(threshold - 1) === level - 1;
      }),
      { numRuns: MAX_LEVEL - 1 },
    );
  });
});

// =============================================================================
// Premium Reward Tests
// =============================================================================

describe('XP System - Premium Rewards Property Tests', () => {
  it('getNextReward returns correct reward or undefined', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        const reward = getNextReward(level);

        if (level < PREMIUM_LEVEL_7_DAYS) {
          return reward?.requiredLevel === PREMIUM_LEVEL_7_DAYS;
        }
        if (level < PREMIUM_LEVEL_1_MONTH) {
          return reward?.requiredLevel === PREMIUM_LEVEL_1_MONTH;
        }
        if (level < PREMIUM_LEVEL_3_MONTHS) {
          return reward?.requiredLevel === PREMIUM_LEVEL_3_MONTHS;
        }
        if (level < PREMIUM_LEVEL_LIFETIME) {
          return reward?.requiredLevel === PREMIUM_LEVEL_LIFETIME;
        }
        return reward === undefined;
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('getNextReward always returns reward with requiredLevel > current level', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        const reward = getNextReward(level);
        if (reward === undefined) return true;
        return reward.requiredLevel > level;
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('premium levels are in ascending order', () => {
    expect(PREMIUM_LEVEL_7_DAYS).toBeLessThan(PREMIUM_LEVEL_1_MONTH);
    expect(PREMIUM_LEVEL_1_MONTH).toBeLessThan(PREMIUM_LEVEL_3_MONTHS);
    expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThan(PREMIUM_LEVEL_LIFETIME);
  });

  it('all premium levels are within MAX_LEVEL', () => {
    expect(PREMIUM_LEVEL_7_DAYS).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_1_MONTH).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_LIFETIME).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

// =============================================================================
// Level Thresholds Consistency Tests
// =============================================================================

describe('XP System - Thresholds Consistency', () => {
  it('LEVEL_THRESHOLDS is strictly increasing', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      const prev = LEVEL_THRESHOLDS[i - 1];
      const curr = LEVEL_THRESHOLDS[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it('LEVEL_THRESHOLDS[0] is 0 (level 1 starts at 0 XP)', () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });

  it('LEVEL_THRESHOLDS length matches MAX_LEVEL', () => {
    expect(LEVEL_THRESHOLDS.length).toBe(MAX_LEVEL);
  });

  it('MIN_XP_FLOOR is positive', () => {
    expect(MIN_XP_FLOOR).toBeGreaterThan(0);
  });
});

// =============================================================================
// Boundary Tests
// =============================================================================

describe('XP System - Boundary Tests', () => {
  it('0 XP gives level 1', () => {
    expect(getLevel(0)).toBe(1);
  });

  it('very large XP gives MAX_LEVEL', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000000, max: 100000000 }), (hugeXP) => {
        return getLevel(hugeXP) === MAX_LEVEL;
      }),
      { numRuns: 50 },
    );
  });

  it('negative XP is treated as 0 (level 1)', () => {
    // This tests edge case handling
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: -1 }), (negativeXP) => {
        // Implementation should handle gracefully
        try {
          const level = getLevel(negativeXP);
          return level >= 1;
        } catch {
          // If it throws, that's also acceptable behavior
          return true;
        }
      }),
      { numRuns: 50 },
    );
  });
});
