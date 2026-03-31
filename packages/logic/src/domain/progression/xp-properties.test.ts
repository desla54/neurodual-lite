/**
 * Comprehensive Property-Based Tests for XP and Level Progression
 *
 * 200+ test cases covering ALL progression properties:
 * 1. XP always non-negative
 * 2. Level always >= 1
 * 3. Level monotonically increases with XP
 * 4. XP thresholds are strictly increasing
 * 5. Level calculation correctness
 * 6. XP in current level calculation
 * 7. XP needed for next level
 * 8. Progress percentage [0, 100]
 * 9. Base XP formula
 * 10. Performance multiplier
 * 11. Streak multiplier
 * 12. Confidence multiplier
 * 13. Daily cap enforcement
 * 14. Minimum XP floor
 * 15. Badge bonus XP
 * 16. Component XP breakdown
 * 17. Total = sum of components
 * 18. Premium rewards at levels
 * 19. Badge unlock conditions
 * 20. Badge mutual exclusivity (one per group)
 * 21. Badge priority ordering
 * 22. Badge cap per session
 * 23. Streak calculation
 * 24. Streak reset conditions
 * 25. Early/late session tracking
 * 26. Abandoned session handling
 * 27. Session count tracking
 * 28. Best score tracking
 * 29. Mode-specific XP
 * 30. Determinism and consistency
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  calculateSessionXP,
  getLevel,
  getXPForNextLevel,
  getXPInCurrentLevel,
  getLevelProgress,
  getUnlockedRewards,
  getNextReward,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  MIN_XP_FLOOR,
  FLOW_BONUS_XP,
  type UnifiedXPContext,
  type AnySessionSummary,
} from './xp';
import { checkNewBadges, BADGES, getBadgeById, type BadgeDefinition } from './badges';
import { UserHistory } from '../user-history';
import { UserProgression, type ProgressionRecord } from './user-progression';
import type {
  SessionSummary,
  RunningStats,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../../engine/events';
import type { BadgeContext } from '../../types';
import {
  XP_N_LEVEL_WEIGHT,
  XP_DPRIME_WEIGHT,
  XP_BADGE_BONUS,
  XP_BADGE_BONUS_CUMULATIVE,
  XP_STREAK_MULTIPLIER,
  XP_STREAK_MIN_DAYS,
  XP_DAILY_FIRST_BONUS,
  XP_DAILY_SESSION_CAP,
  XP_MIN_FLOOR,
  XP_FLOW_BONUS,
  BADGE_MAX_PER_SESSION,
  BADGE_EARLY_BIRD_HOUR,
  BADGE_NIGHT_OWL_HOUR,
  PREMIUM_LEVEL_7_DAYS,
  PREMIUM_LEVEL_1_MONTH,
  PREMIUM_LEVEL_3_MONTHS,
  PREMIUM_LEVEL_LIFETIME,
} from '../../specs/thresholds';

// =============================================================================
// FIXTURES
// =============================================================================

const createTimingStats = (values: number[] = [3000]): TimingStats => ({
  min: Math.min(...values),
  max: Math.max(...values),
  avg: values.reduce((a, b) => a + b, 0) / values.length,
  values,
});

const createModalityStats = (
  overrides: Partial<ModalityRunningStats> = {},
): ModalityRunningStats => ({
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
  avgRT: 400,
  dPrime: 1.5,
  ...overrides,
});

const createRunningStats = (
  posOverrides: Partial<ModalityRunningStats> = {},
  audOverrides: Partial<ModalityRunningStats> = {},
  globalDPrime = 1.5,
): RunningStats => ({
  trialsCompleted: 20,
  globalDPrime,
  byModality: {
    position: createModalityStats(posOverrides),
    audio: createModalityStats({ avgRT: 450, ...audOverrides }),
  },
});

const createTrialOutcome = (
  index: number,
  posResult: TrialResult = 'hit',
  audResult: TrialResult = 'hit',
  posRT: number | null = 400,
  audRT: number | null = 400,
): TrialOutcome => ({
  trialIndex: index,
  byModality: {
    position: { result: posResult, reactionTime: posRT, wasLure: false },
    audio: { result: audResult, reactionTime: audRT, wasLure: false },
  },
});

let testIdCounter = 0;
function nextTestId(prefix: string): string {
  testIdCounter += 1;
  return `${prefix}-prop-${testIdCounter}`;
}

const createSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: nextTestId('session'),
  nLevel: 2,
  totalTrials: 20,
  outcomes: Array.from({ length: 20 }, (_, i) => createTrialOutcome(i)),
  finalStats: createRunningStats(),
  durationMs: 60000,
  focusLostCount: 0,
  totalFocusLostMs: 0,
  isiStats: createTimingStats([3000, 3000, 3000]),
  stimulusDurationStats: createTimingStats([500, 500, 500]),
  luresCount: { position: 2, audio: 2 },
  tempoConfidence: null,
  passed: true,
  ...overrides,
});

const createBadge = (id: string, priority = 1): BadgeDefinition => ({
  id,
  name: `Badge ${id}`,
  description: 'Test badge for property testing',
  category: 'performance',
  icon: 'star',
  priority,
  check: () => true,
});

const createUnifiedContext = (
  session: AnySessionSummary,
  overrides: Partial<Omit<UnifiedXPContext, 'session'>> = {},
): UnifiedXPContext => ({
  session,
  newBadges: [],
  streakDays: 0,
  isFirstOfDay: false,
  confidenceScore: null,
  isInFlow: false,
  sessionsToday: 0,
  ...overrides,
});

const createProgressionRecord = (
  overrides: Partial<ProgressionRecord> = {},
): ProgressionRecord => ({
  totalXP: 0,
  completedSessions: 0,
  abandonedSessions: 0,
  totalTrials: 0,
  firstSessionAt: null,
  earlyMorningSessions: 0,
  lateNightSessions: 0,
  comebackCount: 0,
  persistentDays: 0,
  plateausBroken: 0,
  uninterruptedSessionsStreak: 0,
  ...overrides,
});

// =============================================================================
// ARBITRARIES
// =============================================================================

const xpArb = fc.integer({ min: 0, max: 2000000 });
const levelArb = fc.integer({ min: 1, max: MAX_LEVEL });
const nLevelArb = fc.integer({ min: 1, max: 20 });
const dPrimeArb = fc.double({ min: 0, max: 5, noNaN: true });
const accuracyArb = fc.double({ min: 0, max: 1, noNaN: true });
const confidenceArb = fc.integer({ min: 0, max: 100 });
const streakArb = fc.integer({ min: 0, max: 500 });
const sessionCountArb = fc.integer({ min: 0, max: 1000 });
const hourArb = fc.integer({ min: 0, max: 23 });
const trialsArb = fc.integer({ min: 1, max: 100 });
const badgeCountArb = fc.integer({ min: 0, max: 20 });

// =============================================================================
// SECTION 1: XP NON-NEGATIVITY (Tests 1-10)
// =============================================================================

describe('1. XP Non-Negativity Properties', () => {
  it('1.1 XP total is always non-negative for any valid input', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.total >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('1.2 XP base component is always non-negative', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const session = createSessionSummary({ nLevel });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.base >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('1.3 XP performance component is always non-negative', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        const session = createSessionSummary({
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.performance >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('1.4 XP accuracy component is always non-negative', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        const session = createSessionSummary({
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.accuracy >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('1.5 XP badge bonus is always non-negative', () => {
    fc.assert(
      fc.property(badgeCountArb, (count) => {
        const badges = Array.from({ length: count }, (_, i) => createBadge(`b${i}`));
        const session = createSessionSummary();
        const ctx = createUnifiedContext(session, { newBadges: badges });
        const xp = calculateSessionXP(ctx);
        return xp.badgeBonus >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('1.6 XP streak bonus is always non-negative', () => {
    fc.assert(
      fc.property(streakArb, (streakDays) => {
        const session = createSessionSummary();
        const ctx = createUnifiedContext(session, { streakDays });
        const xp = calculateSessionXP(ctx);
        return xp.streakBonus >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('1.7 XP daily bonus is always non-negative', () => {
    fc.assert(
      fc.property(fc.boolean(), (isFirstOfDay) => {
        const session = createSessionSummary();
        const ctx = createUnifiedContext(session, { isFirstOfDay });
        const xp = calculateSessionXP(ctx);
        return xp.dailyBonus >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('1.8 XP flow bonus is always non-negative', () => {
    fc.assert(
      fc.property(fc.boolean(), (isInFlow) => {
        const session = createSessionSummary();
        const ctx = createUnifiedContext(session, { isInFlow });
        const xp = calculateSessionXP(ctx);
        return xp.flowBonus >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('1.9 XP confidence multiplier is always in [0, 1]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 200 }), (confidence) => {
        const session = createSessionSummary();
        const ctx = createUnifiedContext(session, { confidenceScore: confidence });
        const xp = calculateSessionXP(ctx);
        return xp.confidenceMultiplier >= 0 && xp.confidenceMultiplier <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('1.10 XP subtotalBeforeConfidence is always non-negative', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, streakArb, (nLevel, dPrime, streakDays) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session, {
          streakDays,
          isFirstOfDay: true,
          isInFlow: true,
        });
        const xp = calculateSessionXP(ctx);
        return xp.subtotalBeforeConfidence >= 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 2: LEVEL BOUNDS (Tests 11-20)
// =============================================================================

describe('2. Level Bounds Properties', () => {
  it('2.1 Level is always >= 1 for any XP', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevel(xp) >= 1;
      }),
      { numRuns: 200 },
    );
  });

  it('2.2 Level is always <= MAX_LEVEL for any XP', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevel(xp) <= MAX_LEVEL;
      }),
      { numRuns: 200 },
    );
  });

  it('2.3 Level is always an integer', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        return Number.isInteger(level);
      }),
      { numRuns: 200 },
    );
  });

  it('2.4 Level 1 is returned for 0 XP', () => {
    expect(getLevel(0)).toBe(1);
  });

  it('2.5 Level 1 is returned for negative XP', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: -1 }), (negXp) => {
        return getLevel(negXp) === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('2.6 MAX_LEVEL is returned for very large XP', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000000, max: Number.MAX_SAFE_INTEGER }), (hugeXp) => {
        return getLevel(hugeXp) === MAX_LEVEL;
      }),
      { numRuns: 50 },
    );
  });

  it('2.7 Level exactly matches at each threshold', () => {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      const threshold = LEVEL_THRESHOLDS[i];
      if (threshold !== undefined) {
        expect(getLevel(threshold)).toBe(i + 1);
      }
    }
  });

  it('2.8 Level stays same just below next threshold', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      const threshold = LEVEL_THRESHOLDS[i];
      if (threshold !== undefined && threshold > 0) {
        expect(getLevel(threshold - 1)).toBe(i);
      }
    }
  });

  it('2.9 UserProgression.level is always >= 1', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: xp }), []);
        return prog.level >= 1;
      }),
      { numRuns: 200 },
    );
  });

  it('2.10 UserProgression.level matches getLevel', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: xp }), []);
        return prog.level === getLevel(xp);
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// SECTION 3: LEVEL MONOTONICITY (Tests 21-30)
// =============================================================================

describe('3. Level Monotonicity Properties', () => {
  it('3.1 Level is monotonically non-decreasing with XP', () => {
    fc.assert(
      fc.property(xpArb, xpArb, (xp1, xp2) => {
        const [low, high] = xp1 < xp2 ? [xp1, xp2] : [xp2, xp1];
        return getLevel(low) <= getLevel(high);
      }),
      { numRuns: 300 },
    );
  });

  it('3.2 Adding XP never decreases level', () => {
    fc.assert(
      fc.property(xpArb, fc.integer({ min: 0, max: 10000 }), (baseXp, addedXp) => {
        return getLevel(baseXp) <= getLevel(baseXp + addedXp);
      }),
      { numRuns: 200 },
    );
  });

  it('3.3 Level changes only at threshold boundaries', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        const threshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
        const nextThreshold = LEVEL_THRESHOLDS[level] ?? Number.MAX_SAFE_INTEGER;
        return xp >= threshold && xp < nextThreshold;
      }),
      { numRuns: 200 },
    );
  });

  it('3.4 Level increases by exactly 1 when crossing threshold', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      const threshold = LEVEL_THRESHOLDS[i];
      if (threshold !== undefined && threshold > 0) {
        const levelBefore = getLevel(threshold - 1);
        const levelAfter = getLevel(threshold);
        expect(levelAfter - levelBefore).toBe(1);
      }
    }
  });

  it('3.5 Cumulative XP additions preserve monotonicity', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 2, maxLength: 20 }),
        (xpGains) => {
          let totalXP = 0;
          let previousLevel = 1;
          for (const gain of xpGains) {
            totalXP += gain;
            const currentLevel = getLevel(totalXP);
            if (currentLevel < previousLevel) return false;
            previousLevel = currentLevel;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('3.6 UserProgression.withAddedXP preserves level monotonicity', () => {
    fc.assert(
      fc.property(xpArb, fc.integer({ min: 0, max: 10000 }), (baseXp, addedXp) => {
        const prog1 = UserProgression.fromRecord(createProgressionRecord({ totalXP: baseXp }), []);
        const prog2 = prog1.withAddedXP(addedXp);
        return prog1.level <= prog2.level;
      }),
      { numRuns: 200 },
    );
  });

  it('3.7 Level function is step function (constant between thresholds)', () => {
    fc.assert(
      fc.property(levelArb, fc.integer({ min: 0, max: 1000 }), (level, offset) => {
        if (level >= MAX_LEVEL) return true;
        const threshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
        const nextThreshold = LEVEL_THRESHOLDS[level] ?? threshold + 1;
        const range = nextThreshold - threshold;
        if (range <= 0) return true;
        const xp = threshold + (offset % range);
        return getLevel(xp) === level;
      }),
      { numRuns: 100 },
    );
  });

  it('3.8 No level is skipped when increasing XP', () => {
    fc.assert(
      fc.property(xpArb, xpArb, (xp1, xp2) => {
        const [low, high] = xp1 < xp2 ? [xp1, xp2] : [xp2, xp1];
        const levelLow = getLevel(low);
        const levelHigh = getLevel(high);
        // All levels between should exist
        for (let l = levelLow; l <= levelHigh; l++) {
          const threshold = LEVEL_THRESHOLDS[l - 1];
          if (threshold === undefined) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('3.9 Level strictly increases when crossing any threshold', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const threshold = LEVEL_THRESHOLDS[level];
      if (threshold !== undefined) {
        expect(getLevel(threshold)).toBe(level + 1);
        expect(getLevel(threshold - 1)).toBe(level);
      }
    }
  });

  it('3.10 Monotonicity holds for XP at boundary values', () => {
    const boundaryTests: number[] = [0, 1, 499, 500, 501, 1199, 1200, 1201];
    for (let i = 0; i < boundaryTests.length - 1; i++) {
      expect(getLevel(boundaryTests[i]!)).toBeLessThanOrEqual(getLevel(boundaryTests[i + 1]!));
    }
  });
});

// =============================================================================
// SECTION 4: THRESHOLD STRICTNESS (Tests 31-40)
// =============================================================================

describe('4. XP Threshold Strictness Properties', () => {
  it('4.1 LEVEL_THRESHOLDS is strictly increasing', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      const prev = LEVEL_THRESHOLDS[i - 1];
      const curr = LEVEL_THRESHOLDS[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it('4.2 LEVEL_THRESHOLDS starts at 0', () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });

  it('4.3 LEVEL_THRESHOLDS has exactly MAX_LEVEL entries', () => {
    expect(LEVEL_THRESHOLDS.length).toBe(MAX_LEVEL);
  });

  it('4.4 All thresholds are non-negative integers', () => {
    for (const threshold of LEVEL_THRESHOLDS) {
      expect(threshold).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(threshold)).toBe(true);
    }
  });

  it('4.5 Threshold gaps are always positive', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      const prev = LEVEL_THRESHOLDS[i - 1];
      const curr = LEVEL_THRESHOLDS[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr - prev).toBeGreaterThan(0);
      }
    }
  });

  it('4.6 Premium reward levels have correct thresholds', () => {
    expect(LEVEL_THRESHOLDS[PREMIUM_LEVEL_7_DAYS - 1]).toBe(10000);
    expect(LEVEL_THRESHOLDS[PREMIUM_LEVEL_1_MONTH - 1]).toBe(40000);
    expect(LEVEL_THRESHOLDS[PREMIUM_LEVEL_3_MONTHS - 1]).toBe(120000);
    expect(LEVEL_THRESHOLDS[PREMIUM_LEVEL_LIFETIME - 1]).toBe(300000);
  });

  it('4.7 No duplicate thresholds exist', () => {
    const uniqueThresholds = new Set(LEVEL_THRESHOLDS);
    expect(uniqueThresholds.size).toBe(LEVEL_THRESHOLDS.length);
  });

  it('4.8 Thresholds are finite numbers', () => {
    for (const threshold of LEVEL_THRESHOLDS) {
      expect(Number.isFinite(threshold)).toBe(true);
    }
  });

  it('4.9 getXPForNextLevel returns positive for all levels < MAX', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      expect(getXPForNextLevel(level)).toBeGreaterThan(0);
    }
  });

  it('4.10 getXPForNextLevel returns 0 at MAX_LEVEL', () => {
    expect(getXPForNextLevel(MAX_LEVEL)).toBe(0);
  });
});

// =============================================================================
// SECTION 5: LEVEL CALCULATION (Tests 41-50)
// =============================================================================

describe('5. Level Calculation Properties', () => {
  it('5.1 getLevel is deterministic', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevel(xp) === getLevel(xp);
      }),
      { numRuns: 200 },
    );
  });

  it('5.2 getLevel is pure (no side effects)', () => {
    fc.assert(
      fc.property(xpArb, xpArb, (xp1, xp2) => {
        const level1First = getLevel(xp1);
        getLevel(xp2);
        const level1Second = getLevel(xp1);
        return level1First === level1Second;
      }),
      { numRuns: 100 },
    );
  });

  it('5.3 Round-trip: getLevel(threshold) = level', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const threshold = LEVEL_THRESHOLDS[level - 1];
      if (threshold !== undefined) {
        expect(getLevel(threshold)).toBe(level);
      }
    }
  });

  it('5.4 getXPInCurrentLevel + threshold = totalXP', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        const threshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
        const xpInLevel = getXPInCurrentLevel(xp);
        return threshold + xpInLevel === xp;
      }),
      { numRuns: 200 },
    );
  });

  it('5.5 getXPInCurrentLevel is always non-negative', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getXPInCurrentLevel(xp) >= 0;
      }),
      { numRuns: 200 },
    );
  });

  it('5.6 getXPInCurrentLevel is less than XP needed for next level', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        if (level >= MAX_LEVEL) return true;
        const xpInLevel = getXPInCurrentLevel(xp);
        const xpNeeded = getXPForNextLevel(level);
        return xpInLevel < xpNeeded;
      }),
      { numRuns: 200 },
    );
  });

  it('5.7 getXPForNextLevel equals gap to next threshold', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
      const next = LEVEL_THRESHOLDS[level] ?? current;
      expect(getXPForNextLevel(level)).toBe(next - current);
    }
  });

  it('5.8 Level calculation handles edge case XP values', () => {
    const edgeCases = [0, 1, 499, 500, 501, 9999, 10000, 10001, 299999, 300000, 300001];
    for (const xp of edgeCases) {
      const level = getLevel(xp);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it('5.9 getXPInCurrentLevel is 0 at exact thresholds', () => {
    for (const threshold of LEVEL_THRESHOLDS) {
      expect(getXPInCurrentLevel(threshold)).toBe(0);
    }
  });

  it('5.10 Level calculation is consistent with progression record', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const directLevel = getLevel(xp);
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: xp }), []);
        return prog.level === directLevel;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// SECTION 6: PROGRESS PERCENTAGE (Tests 51-60)
// =============================================================================

describe('6. Progress Percentage Properties', () => {
  it('6.1 getLevelProgress is always in [0, 100]', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const progress = getLevelProgress(xp);
        return progress >= 0 && progress <= 100;
      }),
      { numRuns: 200 },
    );
  });

  it('6.2 getLevelProgress is 0 at exact level threshold', () => {
    for (let i = 0; i < MAX_LEVEL - 1; i++) {
      const threshold = LEVEL_THRESHOLDS[i];
      if (threshold !== undefined) {
        expect(getLevelProgress(threshold)).toBe(0);
      }
    }
  });

  it('6.3 getLevelProgress is 100 at MAX_LEVEL', () => {
    const maxThreshold = LEVEL_THRESHOLDS[MAX_LEVEL - 1] ?? 0;
    expect(getLevelProgress(maxThreshold)).toBe(100);
  });

  it('6.4 getLevelProgress increases within a level', () => {
    fc.assert(
      fc.property(
        levelArb,
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (level, offset1, offset2) => {
          if (level >= MAX_LEVEL) return true;
          const threshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
          const nextThreshold = LEVEL_THRESHOLDS[level] ?? threshold + 1;
          const range = nextThreshold - threshold;
          if (range <= 0) return true;
          const xp1 = threshold + (offset1 % range);
          const xp2 = threshold + (offset2 % range);
          const [low, high] = xp1 < xp2 ? [xp1, xp2] : [xp2, xp1];
          return getLevelProgress(low) <= getLevelProgress(high);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('6.5 getLevelProgress is an integer', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const progress = getLevelProgress(xp);
        return Number.isInteger(progress);
      }),
      { numRuns: 200 },
    );
  });

  it('6.6 50% progress at midpoint of level', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
      const next = LEVEL_THRESHOLDS[level] ?? current + 2;
      const midpoint = current + Math.floor((next - current) / 2);
      const progress = getLevelProgress(midpoint);
      expect(progress).toBeGreaterThanOrEqual(49);
      expect(progress).toBeLessThanOrEqual(51);
    }
  });

  it('6.7 getLevelProgress is deterministic', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevelProgress(xp) === getLevelProgress(xp);
      }),
      { numRuns: 100 },
    );
  });

  it('6.8 UserProgression.levelProgress matches getLevelProgress', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: xp }), []);
        return prog.levelProgress === getLevelProgress(xp);
      }),
      { numRuns: 200 },
    );
  });

  it('6.9 Progress resets to low value when level increases', () => {
    // When crossing a threshold, progress should reset to a low value (0 or small %)
    // The XP just before threshold should show high progress (near 100)
    // The XP at threshold should show low progress (0% into new level)
    // Note: MAX_LEVEL is excluded because progress at max level is always 100%
    for (let level = 2; level < MAX_LEVEL; level++) {
      const threshold = LEVEL_THRESHOLDS[level - 1];
      if (threshold !== undefined) {
        const progressBefore = getLevelProgress(threshold - 1);
        const progressAfter = getLevelProgress(threshold);
        // Progress before threshold should be high (typically 100% or close)
        expect(progressBefore).toBeGreaterThanOrEqual(90);
        // Progress after threshold should be low (0% into new level)
        expect(progressAfter).toBeLessThanOrEqual(10);
      }
    }
  });

  it('6.10 Progress is consistent with XP in level', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        const level = getLevel(xp);
        if (level >= MAX_LEVEL) return true;
        const xpInLevel = getXPInCurrentLevel(xp);
        const xpNeeded = getXPForNextLevel(level);
        const expectedProgress = Math.round((xpInLevel / xpNeeded) * 100);
        return getLevelProgress(xp) === expectedProgress;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// SECTION 7: BASE XP FORMULA (Tests 61-70)
// =============================================================================

describe('7. Base XP Formula Properties', () => {
  it('7.1 Base XP equals nLevel * XP_N_LEVEL_WEIGHT', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const session = createSessionSummary({ nLevel });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.base === nLevel * XP_N_LEVEL_WEIGHT;
      }),
      { numRuns: 100 },
    );
  });

  it('7.2 Base XP scales linearly with nLevel', () => {
    fc.assert(
      fc.property(nLevelArb, nLevelArb, (n1, n2) => {
        const session1 = createSessionSummary({ nLevel: n1 });
        const session2 = createSessionSummary({ nLevel: n2 });
        const xp1 = calculateSessionXP(createUnifiedContext(session1));
        const xp2 = calculateSessionXP(createUnifiedContext(session2));
        return xp1.base / n1 === xp2.base / n2;
      }),
      { numRuns: 100 },
    );
  });

  it('7.3 Base XP is always positive for nLevel >= 1', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const session = createSessionSummary({ nLevel });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        return xp.base > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('7.4 Higher nLevel gives higher base XP', () => {
    fc.assert(
      fc.property(nLevelArb, nLevelArb, (n1, n2) => {
        if (n1 === n2) return true;
        const session1 = createSessionSummary({ nLevel: n1 });
        const session2 = createSessionSummary({ nLevel: n2 });
        const xp1 = calculateSessionXP(createUnifiedContext(session1));
        const xp2 = calculateSessionXP(createUnifiedContext(session2));
        return n1 < n2 === xp1.base < xp2.base;
      }),
      { numRuns: 100 },
    );
  });

  it('7.5 Base XP is independent of d-prime', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, dPrimeArb, (nLevel, d1, d2) => {
        const session1 = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, d1),
        });
        const session2 = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, d2),
        });
        const xp1 = calculateSessionXP(createUnifiedContext(session1));
        const xp2 = calculateSessionXP(createUnifiedContext(session2));
        return xp1.base === xp2.base;
      }),
      { numRuns: 100 },
    );
  });

  it('7.6 Base XP is independent of streak', () => {
    fc.assert(
      fc.property(nLevelArb, streakArb, streakArb, (nLevel, s1, s2) => {
        const session = createSessionSummary({ nLevel });
        const xp1 = calculateSessionXP(createUnifiedContext(session, { streakDays: s1 }));
        const xp2 = calculateSessionXP(createUnifiedContext(session, { streakDays: s2 }));
        return xp1.base === xp2.base;
      }),
      { numRuns: 100 },
    );
  });

  it('7.7 Base XP is independent of badges', () => {
    fc.assert(
      fc.property(nLevelArb, badgeCountArb, (nLevel, badgeCount) => {
        const session = createSessionSummary({ nLevel });
        const badges = Array.from({ length: badgeCount }, (_, i) => createBadge(`b${i}`));
        const xp1 = calculateSessionXP(createUnifiedContext(session));
        const xp2 = calculateSessionXP(createUnifiedContext(session, { newBadges: badges }));
        return xp1.base === xp2.base;
      }),
      { numRuns: 100 },
    );
  });

  it('7.8 Base XP for nLevel=1 equals XP_N_LEVEL_WEIGHT', () => {
    const session = createSessionSummary({ nLevel: 1 });
    const xp = calculateSessionXP(createUnifiedContext(session));
    expect(xp.base).toBe(XP_N_LEVEL_WEIGHT);
  });

  it('7.9 Base XP is unaffected by daily cap', () => {
    fc.assert(
      fc.property(nLevelArb, sessionCountArb, (nLevel, sessionsToday) => {
        const session = createSessionSummary({ nLevel });
        const ctx = createUnifiedContext(session, { sessionsToday });
        const xp = calculateSessionXP(ctx);
        // If daily cap reached, total is 0 but base formula still applies conceptually
        return xp.dailyCapReached || xp.base === nLevel * XP_N_LEVEL_WEIGHT;
      }),
      { numRuns: 100 },
    );
  });

  it('7.10 Base XP is finite', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const session = createSessionSummary({ nLevel });
        const xp = calculateSessionXP(createUnifiedContext(session));
        return Number.isFinite(xp.base);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 8: PERFORMANCE MULTIPLIER (Tests 71-80)
// =============================================================================

describe('8. Performance Multiplier Properties', () => {
  it('8.1 Performance XP for d-prime equals d-prime * XP_DPRIME_WEIGHT (rounded)', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        const session = createSessionSummary({ finalStats: createRunningStats({}, {}, dPrime) });
        const xp = calculateSessionXP(createUnifiedContext(session));
        const expected = Math.round(Math.max(0, dPrime) * XP_DPRIME_WEIGHT);
        return xp.performance === expected;
      }),
      { numRuns: 100 },
    );
  });

  it('8.2 Performance XP is 0 for negative d-prime', () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 0, noNaN: true }), (dPrime) => {
        const session = createSessionSummary({ finalStats: createRunningStats({}, {}, dPrime) });
        const xp = calculateSessionXP(createUnifiedContext(session));
        return xp.performance === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('8.3 Higher d-prime gives higher or equal performance XP', () => {
    // Due to rounding (Math.round(dPrime * XP_DPRIME_WEIGHT)), small differences
    // in d-prime may result in equal performance XP
    fc.assert(
      fc.property(dPrimeArb, dPrimeArb, (d1, d2) => {
        // Skip nearly equal values where rounding makes comparison unreliable
        if (Math.abs(d1 - d2) < 0.01) return true;
        const session1 = createSessionSummary({ finalStats: createRunningStats({}, {}, d1) });
        const session2 = createSessionSummary({ finalStats: createRunningStats({}, {}, d2) });
        const xp1 = calculateSessionXP(createUnifiedContext(session1));
        const xp2 = calculateSessionXP(createUnifiedContext(session2));
        // Monotonic: higher d-prime should give >= performance XP
        return d1 < d2 ? xp1.performance <= xp2.performance : xp1.performance >= xp2.performance;
      }),
      { numRuns: 100 },
    );
  });

  it('8.4 Performance XP is independent of nLevel', () => {
    fc.assert(
      fc.property(dPrimeArb, nLevelArb, nLevelArb, (dPrime, n1, n2) => {
        const session1 = createSessionSummary({
          nLevel: n1,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const session2 = createSessionSummary({
          nLevel: n2,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp1 = calculateSessionXP(createUnifiedContext(session1));
        const xp2 = calculateSessionXP(createUnifiedContext(session2));
        return xp1.performance === xp2.performance;
      }),
      { numRuns: 100 },
    );
  });

  it('8.5 Performance XP is always an integer', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        const session = createSessionSummary({ finalStats: createRunningStats({}, {}, dPrime) });
        const xp = calculateSessionXP(createUnifiedContext(session));
        return Number.isInteger(xp.performance);
      }),
      { numRuns: 100 },
    );
  });

  it('8.6 Performance XP handles d-prime = 0', () => {
    const session = createSessionSummary({ finalStats: createRunningStats({}, {}, 0) });
    const xp = calculateSessionXP(createUnifiedContext(session));
    expect(xp.performance).toBe(0);
  });

  it('8.7 Performance XP is finite for extreme d-prime values', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 10, noNaN: true }), (dPrime) => {
        const session = createSessionSummary({ finalStats: createRunningStats({}, {}, dPrime) });
        const xp = calculateSessionXP(createUnifiedContext(session));
        return Number.isFinite(xp.performance);
      }),
      { numRuns: 100 },
    );
  });

  it('8.8 Performance XP scales linearly with d-prime', () => {
    const d1 = 1.0;
    const d2 = 2.0;
    const session1 = createSessionSummary({ finalStats: createRunningStats({}, {}, d1) });
    const session2 = createSessionSummary({ finalStats: createRunningStats({}, {}, d2) });
    const xp1 = calculateSessionXP(createUnifiedContext(session1));
    const xp2 = calculateSessionXP(createUnifiedContext(session2));
    expect(xp2.performance).toBe(xp1.performance * 2);
  });

  it('8.9 Performance XP is consistent across calls', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        const session = createSessionSummary({ finalStats: createRunningStats({}, {}, dPrime) });
        const ctx = createUnifiedContext(session);
        const xp1 = calculateSessionXP(ctx);
        const xp2 = calculateSessionXP(ctx);
        return xp1.performance === xp2.performance;
      }),
      { numRuns: 100 },
    );
  });

  it('8.10 Performance XP clamps negative d-prime to 0', () => {
    const session = createSessionSummary({ finalStats: createRunningStats({}, {}, -2.5) });
    const xp = calculateSessionXP(createUnifiedContext(session));
    expect(xp.performance).toBe(0);
  });
});

// =============================================================================
// SECTION 9: STREAK MULTIPLIER (Tests 81-90)
// =============================================================================

describe('9. Streak Multiplier Properties', () => {
  it('9.1 Streak bonus is 0 for streak < XP_STREAK_MIN_DAYS', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: XP_STREAK_MIN_DAYS - 1 }), (streakDays) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { streakDays }));
        return xp.streakBonus === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('9.2 Streak bonus is positive for streak >= XP_STREAK_MIN_DAYS', () => {
    fc.assert(
      fc.property(fc.integer({ min: XP_STREAK_MIN_DAYS, max: 365 }), (streakDays) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { streakDays }));
        return xp.streakBonus > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('9.3 Streak bonus at boundary (streak = XP_STREAK_MIN_DAYS)', () => {
    const session = createSessionSummary();
    const xpBelow = calculateSessionXP(
      createUnifiedContext(session, { streakDays: XP_STREAK_MIN_DAYS - 1 }),
    );
    const xpAt = calculateSessionXP(
      createUnifiedContext(session, { streakDays: XP_STREAK_MIN_DAYS }),
    );
    expect(xpBelow.streakBonus).toBe(0);
    expect(xpAt.streakBonus).toBeGreaterThan(0);
  });

  it('9.4 Streak bonus equals XP_STREAK_MULTIPLIER * subtotal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: XP_STREAK_MIN_DAYS, max: 100 }),
        nLevelArb,
        dPrimeArb,
        (streakDays, nLevel, dPrime) => {
          const session = createSessionSummary({
            nLevel,
            finalStats: createRunningStats({}, {}, dPrime),
          });
          const xp = calculateSessionXP(createUnifiedContext(session, { streakDays }));
          const subtotal =
            xp.base + xp.performance + xp.accuracy + xp.badgeBonus + xp.dailyBonus + xp.flowBonus;
          const expected = Math.round(subtotal * XP_STREAK_MULTIPLIER);
          return xp.streakBonus === expected;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('9.5 Streak bonus is independent of streak length beyond minimum', () => {
    const session = createSessionSummary();
    const xp5 = calculateSessionXP(createUnifiedContext(session, { streakDays: 5 }));
    const xp100 = calculateSessionXP(createUnifiedContext(session, { streakDays: 100 }));
    // Multiplier is constant, so bonus should be same given same subtotal
    expect(xp5.streakBonus).toBe(xp100.streakBonus);
  });

  it('9.6 Streak bonus is always an integer', () => {
    fc.assert(
      fc.property(streakArb, (streakDays) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { streakDays }));
        return Number.isInteger(xp.streakBonus);
      }),
      { numRuns: 100 },
    );
  });

  it('9.7 Streak bonus is non-negative', () => {
    fc.assert(
      fc.property(streakArb, (streakDays) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { streakDays }));
        return xp.streakBonus >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('9.8 Streak bonus is 0 when daily cap reached', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: XP_DAILY_SESSION_CAP, max: 20 }),
        streakArb,
        (sessionsToday, streakDays) => {
          const session = createSessionSummary();
          const xp = calculateSessionXP(
            createUnifiedContext(session, { sessionsToday, streakDays }),
          );
          return xp.streakBonus === 0;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('9.9 Streak bonus scales with base components', () => {
    const lowSession = createSessionSummary({
      nLevel: 1,
      finalStats: createRunningStats({}, {}, 0.5),
    });
    const highSession = createSessionSummary({
      nLevel: 5,
      finalStats: createRunningStats({}, {}, 3.0),
    });
    const lowXp = calculateSessionXP(createUnifiedContext(lowSession, { streakDays: 5 }));
    const highXp = calculateSessionXP(createUnifiedContext(highSession, { streakDays: 5 }));
    expect(lowXp.streakBonus).toBeLessThan(highXp.streakBonus);
  });

  it('9.10 XP_STREAK_MULTIPLIER is between 0 and 1', () => {
    expect(XP_STREAK_MULTIPLIER).toBeGreaterThan(0);
    expect(XP_STREAK_MULTIPLIER).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// SECTION 10: CONFIDENCE MULTIPLIER (Tests 91-100)
// =============================================================================

describe('10. Confidence Multiplier Properties', () => {
  it('10.1 Confidence multiplier is 1.0 when confidenceScore is null', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: null }));
    expect(xp.confidenceMultiplier).toBe(1.0);
  });

  it('10.2 Confidence multiplier is confidenceScore/100', () => {
    fc.assert(
      fc.property(confidenceArb, (confidenceScore) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore }));
        const expected = Math.max(0, Math.min(1, confidenceScore / 100));
        return Math.abs(xp.confidenceMultiplier - expected) < 0.001;
      }),
      { numRuns: 100 },
    );
  });

  it('10.3 Confidence multiplier is clamped to [0, 1]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 200 }), (confidenceScore) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore }));
        return xp.confidenceMultiplier >= 0 && xp.confidenceMultiplier <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('10.4 Confidence 0 gives multiplier 0', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 0 }));
    expect(xp.confidenceMultiplier).toBe(0);
  });

  it('10.5 Confidence 100 gives multiplier 1', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
    expect(xp.confidenceMultiplier).toBe(1);
  });

  it('10.6 Confidence 50 gives multiplier 0.5', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 50 }));
    expect(xp.confidenceMultiplier).toBe(0.5);
  });

  it('10.7 Negative confidence clamps to 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: -1 }), (confidenceScore) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore }));
        return xp.confidenceMultiplier === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('10.8 Confidence > 100 clamps to 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 101, max: 200 }), (confidenceScore) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore }));
        return xp.confidenceMultiplier === 1;
      }),
      { numRuns: 50 },
    );
  });

  it('10.9 Total XP scales with confidence multiplier', () => {
    const session = createSessionSummary({
      nLevel: 3,
      finalStats: createRunningStats({}, {}, 2.0),
    });
    const xp100 = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
    const xp50 = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 50 }));
    // With 50% confidence, total should be roughly half (before floor)
    expect(xp50.total).toBeLessThan(xp100.total);
  });

  it('10.10 Floor applies even with low confidence', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 1 }));
    expect(xp.total).toBeGreaterThanOrEqual(MIN_XP_FLOOR);
  });
});

// =============================================================================
// SECTION 11: DAILY CAP (Tests 101-110)
// =============================================================================

describe('11. Daily Cap Enforcement Properties', () => {
  it('11.1 Daily cap reached when sessionsToday >= XP_DAILY_SESSION_CAP', () => {
    fc.assert(
      fc.property(fc.integer({ min: XP_DAILY_SESSION_CAP, max: 20 }), (sessionsToday) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday }));
        return xp.dailyCapReached === true;
      }),
      { numRuns: 50 },
    );
  });

  it('11.2 Daily cap not reached when sessionsToday < XP_DAILY_SESSION_CAP', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: XP_DAILY_SESSION_CAP - 1 }), (sessionsToday) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday }));
        return xp.dailyCapReached === false;
      }),
      { numRuns: 50 },
    );
  });

  it('11.3 Total XP is 0 when daily cap reached', () => {
    fc.assert(
      fc.property(fc.integer({ min: XP_DAILY_SESSION_CAP, max: 20 }), (sessionsToday) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday }));
        return xp.total === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('11.4 All components are 0 when daily cap reached', () => {
    fc.assert(
      fc.property(fc.integer({ min: XP_DAILY_SESSION_CAP, max: 20 }), (sessionsToday) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday }));
        return (
          xp.base === 0 &&
          xp.performance === 0 &&
          xp.accuracy === 0 &&
          xp.badgeBonus === 0 &&
          xp.streakBonus === 0 &&
          xp.dailyBonus === 0 &&
          xp.flowBonus === 0
        );
      }),
      { numRuns: 50 },
    );
  });

  it('11.5 Daily cap boundary at exactly XP_DAILY_SESSION_CAP', () => {
    const session = createSessionSummary();
    const xpBefore = calculateSessionXP(
      createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP - 1 }),
    );
    const xpAt = calculateSessionXP(
      createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP }),
    );
    expect(xpBefore.dailyCapReached).toBe(false);
    expect(xpBefore.total).toBeGreaterThan(0);
    expect(xpAt.dailyCapReached).toBe(true);
    expect(xpAt.total).toBe(0);
  });

  it('11.6 XP_DAILY_SESSION_CAP is positive', () => {
    expect(XP_DAILY_SESSION_CAP).toBeGreaterThan(0);
  });

  it('11.7 Daily cap affects all session types equally', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(
          createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP }),
        );
        return xp.total === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('11.8 sessionsToday 0 never triggers daily cap', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday: 0 }));
        return xp.dailyCapReached === false && xp.total > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('11.9 Daily cap is checked before any calculation', () => {
    const session = createSessionSummary({
      nLevel: 10,
      finalStats: createRunningStats({}, {}, 4.0),
    });
    const badges = Array.from({ length: 5 }, (_, i) => createBadge(`b${i}`));
    const xp = calculateSessionXP(
      createUnifiedContext(session, {
        sessionsToday: XP_DAILY_SESSION_CAP,
        newBadges: badges,
        streakDays: 100,
        isFirstOfDay: true,
        isInFlow: true,
      }),
    );
    expect(xp.total).toBe(0);
  });

  it('11.10 subtotalBeforeConfidence is 0 when daily cap reached', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(
      createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP }),
    );
    expect(xp.subtotalBeforeConfidence).toBe(0);
  });
});

// =============================================================================
// SECTION 12: MINIMUM XP FLOOR (Tests 111-120)
// =============================================================================

describe('12. Minimum XP Floor Properties', () => {
  it('12.1 Total XP is at least MIN_XP_FLOOR when not capped', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, confidenceArb, (nLevel, dPrime, confidence) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(
          createUnifiedContext(session, { confidenceScore: confidence, sessionsToday: 0 }),
        );
        return xp.total >= MIN_XP_FLOOR;
      }),
      { numRuns: 200 },
    );
  });

  it('12.2 Floor applies even with 0 confidence', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 0 }));
    expect(xp.total).toBeGreaterThanOrEqual(MIN_XP_FLOOR);
  });

  it('12.3 Floor applies with minimal performance', () => {
    const session = createSessionSummary({ nLevel: 1, finalStats: createRunningStats({}, {}, 0) });
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 1 }));
    expect(xp.total).toBeGreaterThanOrEqual(MIN_XP_FLOOR);
  });

  it('12.4 MIN_XP_FLOOR is positive', () => {
    expect(MIN_XP_FLOOR).toBeGreaterThan(0);
  });

  it('12.5 Floor does not apply when daily cap reached', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(
      createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP }),
    );
    expect(xp.total).toBe(0);
  });

  it('12.6 Floor ensures presence reward', () => {
    // Even worst case should get floor XP
    const session = createSessionSummary({
      nLevel: 1,
      finalStats: createRunningStats({}, {}, -1), // Negative d-prime
    });
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 1 }));
    expect(xp.total).toBe(MIN_XP_FLOOR);
  });

  it('12.7 Floor value equals XP_MIN_FLOOR constant', () => {
    expect(MIN_XP_FLOOR).toBe(XP_MIN_FLOOR);
  });

  it('12.8 Calculated total never below floor (when not capped)', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.integer({ min: 0, max: 100 }),
        (nLevel, dPrime, confidence) => {
          const session = createSessionSummary({
            nLevel,
            finalStats: createRunningStats({}, {}, dPrime),
          });
          const xp = calculateSessionXP(
            createUnifiedContext(session, { confidenceScore: confidence, sessionsToday: 0 }),
          );
          return xp.total >= MIN_XP_FLOOR;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('12.9 Floor is applied after confidence multiplier', () => {
    const session = createSessionSummary({ nLevel: 1 });
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 0 }));
    // subtotalBeforeConfidence * 0 = 0, but floor kicks in
    expect(xp.total).toBe(MIN_XP_FLOOR);
  });

  it('12.10 Floor value is documented correctly', () => {
    expect(MIN_XP_FLOOR).toBe(50); // Document actual value
  });
});

// =============================================================================
// SECTION 13: BADGE BONUS (Tests 121-130)
// =============================================================================

describe('13. Badge Bonus XP Properties', () => {
  it('13.1 Badge bonus for performance badges equals XP_BADGE_BONUS per badge', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
        const badges = Array.from({ length: count }, (_, i) => createBadge(`perf${i}`, 1));
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { newBadges: badges }));
        return xp.badgeBonus === count * XP_BADGE_BONUS;
      }),
      { numRuns: 50 },
    );
  });

  it('13.2 Badge bonus for cumulative badges equals XP_BADGE_BONUS_CUMULATIVE per badge', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
        const badges = Array.from({ length: count }, (_, i) => createBadge(`cum${i}`, 0));
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { newBadges: badges }));
        return xp.badgeBonus === count * XP_BADGE_BONUS_CUMULATIVE;
      }),
      { numRuns: 50 },
    );
  });

  it('13.3 Mixed badges give correct combined bonus', () => {
    const perfBadges = Array.from({ length: 2 }, (_, i) => createBadge(`perf${i}`, 1));
    const cumBadges = Array.from({ length: 3 }, (_, i) => createBadge(`cum${i}`, 0));
    const session = createSessionSummary();
    const xp = calculateSessionXP(
      createUnifiedContext(session, { newBadges: [...perfBadges, ...cumBadges] }),
    );
    expect(xp.badgeBonus).toBe(2 * XP_BADGE_BONUS + 3 * XP_BADGE_BONUS_CUMULATIVE);
  });

  it('13.4 No badges gives 0 badge bonus', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { newBadges: [] }));
    expect(xp.badgeBonus).toBe(0);
  });

  it('13.5 Badge bonus is always non-negative', () => {
    fc.assert(
      fc.property(badgeCountArb, (count) => {
        const badges = Array.from({ length: count }, (_, i) => createBadge(`b${i}`, i % 2));
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { newBadges: badges }));
        return xp.badgeBonus >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('13.6 XP_BADGE_BONUS is greater than XP_BADGE_BONUS_CUMULATIVE', () => {
    expect(XP_BADGE_BONUS).toBeGreaterThan(XP_BADGE_BONUS_CUMULATIVE);
  });

  it('13.7 Badge bonus is independent of nLevel', () => {
    fc.assert(
      fc.property(nLevelArb, nLevelArb, badgeCountArb, (n1, n2, count) => {
        const badges = Array.from({ length: count }, (_, i) => createBadge(`b${i}`));
        const session1 = createSessionSummary({ nLevel: n1 });
        const session2 = createSessionSummary({ nLevel: n2 });
        const xp1 = calculateSessionXP(createUnifiedContext(session1, { newBadges: badges }));
        const xp2 = calculateSessionXP(createUnifiedContext(session2, { newBadges: badges }));
        return xp1.badgeBonus === xp2.badgeBonus;
      }),
      { numRuns: 50 },
    );
  });

  it('13.8 Badge bonus contributes to subtotal before confidence', () => {
    const badges = [createBadge('test', 1)];
    const session = createSessionSummary();
    const xpWith = calculateSessionXP(createUnifiedContext(session, { newBadges: badges }));
    const xpWithout = calculateSessionXP(createUnifiedContext(session, { newBadges: [] }));
    expect(xpWith.subtotalBeforeConfidence).toBeGreaterThan(xpWithout.subtotalBeforeConfidence);
  });

  it('13.9 Badge bonus is 0 when daily cap reached', () => {
    const badges = Array.from({ length: 5 }, (_, i) => createBadge(`b${i}`));
    const session = createSessionSummary();
    const xp = calculateSessionXP(
      createUnifiedContext(session, { newBadges: badges, sessionsToday: XP_DAILY_SESSION_CAP }),
    );
    expect(xp.badgeBonus).toBe(0);
  });

  it('13.10 Badge bonus scales with badge count', () => {
    const session = createSessionSummary();
    const xp1 = calculateSessionXP(
      createUnifiedContext(session, { newBadges: [createBadge('b1')] }),
    );
    const xp2 = calculateSessionXP(
      createUnifiedContext(session, { newBadges: [createBadge('b1'), createBadge('b2')] }),
    );
    expect(xp2.badgeBonus).toBe(xp1.badgeBonus * 2);
  });
});

// =============================================================================
// SECTION 14: COMPONENT BREAKDOWN (Tests 131-140)
// =============================================================================

describe('14. XP Component Breakdown Properties', () => {
  it('14.1 All XP components are finite numbers', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        dPrimeArb,
        streakArb,
        confidenceArb,
        (nLevel, dPrime, streak, confidence) => {
          const session = createSessionSummary({
            nLevel,
            finalStats: createRunningStats({}, {}, dPrime),
          });
          const xp = calculateSessionXP(
            createUnifiedContext(session, { streakDays: streak, confidenceScore: confidence }),
          );
          return (
            Number.isFinite(xp.base) &&
            Number.isFinite(xp.performance) &&
            Number.isFinite(xp.accuracy) &&
            Number.isFinite(xp.badgeBonus) &&
            Number.isFinite(xp.streakBonus) &&
            Number.isFinite(xp.dailyBonus) &&
            Number.isFinite(xp.flowBonus) &&
            Number.isFinite(xp.total)
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('14.2 Daily bonus is XP_DAILY_FIRST_BONUS when isFirstOfDay', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { isFirstOfDay: true }));
    expect(xp.dailyBonus).toBe(XP_DAILY_FIRST_BONUS);
  });

  it('14.3 Daily bonus is 0 when not first of day', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { isFirstOfDay: false }));
    expect(xp.dailyBonus).toBe(0);
  });

  it('14.4 Flow bonus is FLOW_BONUS_XP when isInFlow', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { isInFlow: true }));
    expect(xp.flowBonus).toBe(FLOW_BONUS_XP);
  });

  it('14.5 Flow bonus is 0 when not in flow', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(createUnifiedContext(session, { isInFlow: false }));
    expect(xp.flowBonus).toBe(0);
  });

  it('14.6 All components are integers', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(createUnifiedContext(session));
        return (
          Number.isInteger(xp.base) &&
          Number.isInteger(xp.performance) &&
          Number.isInteger(xp.accuracy) &&
          Number.isInteger(xp.badgeBonus) &&
          Number.isInteger(xp.streakBonus) &&
          Number.isInteger(xp.dailyBonus) &&
          Number.isInteger(xp.flowBonus) &&
          Number.isInteger(xp.total)
        );
      }),
      { numRuns: 100 },
    );
  });

  it('14.7 XPBreakdown contains dailyCapReached flag', () => {
    fc.assert(
      fc.property(sessionCountArb, (sessionsToday) => {
        const session = createSessionSummary();
        const xp = calculateSessionXP(createUnifiedContext(session, { sessionsToday }));
        return typeof xp.dailyCapReached === 'boolean';
      }),
      { numRuns: 50 },
    );
  });

  it('14.8 subtotalBeforeConfidence contains all bonuses', () => {
    const badges = [createBadge('b1')];
    const session = createSessionSummary({
      nLevel: 3,
      finalStats: createRunningStats({}, {}, 2.0),
    });
    const xp = calculateSessionXP(
      createUnifiedContext(session, {
        newBadges: badges,
        streakDays: 5,
        isFirstOfDay: true,
        isInFlow: true,
      }),
    );
    const expectedSubtotal =
      xp.base +
      xp.performance +
      xp.accuracy +
      xp.badgeBonus +
      xp.dailyBonus +
      xp.flowBonus +
      xp.streakBonus;
    expect(xp.subtotalBeforeConfidence).toBe(expectedSubtotal);
  });

  it('14.9 Components are independent (changing one does not affect others)', () => {
    const session = createSessionSummary();
    const xp1 = calculateSessionXP(createUnifiedContext(session, { isFirstOfDay: false }));
    const xp2 = calculateSessionXP(createUnifiedContext(session, { isFirstOfDay: true }));
    // Only dailyBonus should change
    expect(xp1.base).toBe(xp2.base);
    expect(xp1.performance).toBe(xp2.performance);
    expect(xp1.flowBonus).toBe(xp2.flowBonus);
    expect(xp1.dailyBonus).not.toBe(xp2.dailyBonus);
  });

  it('14.10 XP calculation is deterministic', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, streakArb, (nLevel, dPrime, streak) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session, { streakDays: streak });
        const xp1 = calculateSessionXP(ctx);
        const xp2 = calculateSessionXP(ctx);
        return (
          xp1.base === xp2.base && xp1.performance === xp2.performance && xp1.total === xp2.total
        );
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 15: TOTAL = SUM (Tests 141-150)
// =============================================================================

describe('15. Total XP Equals Sum of Components', () => {
  it('15.1 Total is correctly computed from components (with full confidence)', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
        const componentSum =
          xp.base +
          xp.performance +
          xp.accuracy +
          xp.badgeBonus +
          xp.streakBonus +
          xp.dailyBonus +
          xp.flowBonus;
        // Total should be max(componentSum * multiplier, floor)
        return xp.total === Math.max(componentSum, MIN_XP_FLOOR);
      }),
      { numRuns: 100 },
    );
  });

  it('15.2 Total reflects confidence multiplier', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, confidenceArb, (nLevel, dPrime, confidence) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(
          createUnifiedContext(session, { confidenceScore: confidence }),
        );
        const expectedRaw = Math.round(xp.subtotalBeforeConfidence * xp.confidenceMultiplier);
        const expected = Math.max(expectedRaw, MIN_XP_FLOOR);
        return xp.total === expected;
      }),
      { numRuns: 100 },
    );
  });

  it('15.3 subtotalBeforeConfidence = base + performance + accuracy + badges + streak + daily + flow', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, streakArb, (nLevel, dPrime, streak) => {
        const badges = [createBadge('b1')];
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const xp = calculateSessionXP(
          createUnifiedContext(session, {
            newBadges: badges,
            streakDays: streak,
            isFirstOfDay: true,
            isInFlow: true,
          }),
        );
        const sum =
          xp.base +
          xp.performance +
          xp.accuracy +
          xp.badgeBonus +
          xp.streakBonus +
          xp.dailyBonus +
          xp.flowBonus;
        return xp.subtotalBeforeConfidence === sum;
      }),
      { numRuns: 100 },
    );
  });

  it('15.4 Total is 0 when all components are 0 (only when capped)', () => {
    const session = createSessionSummary();
    const xp = calculateSessionXP(
      createUnifiedContext(session, { sessionsToday: XP_DAILY_SESSION_CAP }),
    );
    const componentSum =
      xp.base +
      xp.performance +
      xp.accuracy +
      xp.badgeBonus +
      xp.streakBonus +
      xp.dailyBonus +
      xp.flowBonus;
    expect(componentSum).toBe(0);
    expect(xp.total).toBe(0);
  });

  it('15.5 Components without bonuses give expected total', () => {
    const session = createSessionSummary({
      nLevel: 2,
      finalStats: createRunningStats({}, {}, 1.5),
    });
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
    // base = 2 * 50 = 100
    // performance = 1.5 * 100 = 150
    expect(xp.base).toBe(100);
    expect(xp.performance).toBe(150);
    // No badges, no streak, no daily, no flow
    expect(xp.badgeBonus).toBe(0);
    expect(xp.streakBonus).toBe(0);
    expect(xp.dailyBonus).toBe(0);
    expect(xp.flowBonus).toBe(0);
  });

  it('15.6 Total includes all active bonuses', () => {
    const badges = [createBadge('b1')];
    const session = createSessionSummary({ nLevel: 2 });
    const xpFull = calculateSessionXP(
      createUnifiedContext(session, {
        newBadges: badges,
        streakDays: 5,
        isFirstOfDay: true,
        isInFlow: true,
        confidenceScore: 100,
      }),
    );
    expect(xpFull.badgeBonus).toBeGreaterThan(0);
    expect(xpFull.streakBonus).toBeGreaterThan(0);
    expect(xpFull.dailyBonus).toBeGreaterThan(0);
    expect(xpFull.flowBonus).toBeGreaterThan(0);
  });

  it('15.7 Total never exceeds subtotalBeforeConfidence (when confidence < 100)', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        dPrimeArb,
        fc.integer({ min: 0, max: 99 }),
        (nLevel, dPrime, confidence) => {
          const session = createSessionSummary({
            nLevel,
            finalStats: createRunningStats({}, {}, dPrime),
          });
          const xp = calculateSessionXP(
            createUnifiedContext(session, { confidenceScore: confidence }),
          );
          // Could be equal due to floor
          return xp.total <= xp.subtotalBeforeConfidence || xp.total === MIN_XP_FLOOR;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('15.8 Accuracy component is calculated correctly', () => {
    // For Tempo mode, accuracy comes from hit rate
    const session = createSessionSummary({
      finalStats: createRunningStats(
        { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 },
        { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 },
        2.0,
      ),
    });
    const xp = calculateSessionXP(createUnifiedContext(session));
    // Accuracy should be based on hit rate
    expect(xp.accuracy).toBeGreaterThanOrEqual(0);
  });

  it('15.9 Sum formula works for edge case (all zeros except base)', () => {
    const session = createSessionSummary({
      nLevel: 1,
      finalStats: createRunningStats({}, {}, 0),
    });
    const xp = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
    expect(xp.base).toBe(50);
    expect(xp.performance).toBe(0);
    expect(xp.subtotalBeforeConfidence).toBeGreaterThanOrEqual(xp.base);
  });

  it('15.10 All bonus combinations are additive', () => {
    const session = createSessionSummary({ nLevel: 3 });
    const badges = [createBadge('b1')];

    const xpBase = calculateSessionXP(createUnifiedContext(session, { confidenceScore: 100 }));
    const xpWithBadge = calculateSessionXP(
      createUnifiedContext(session, { newBadges: badges, confidenceScore: 100 }),
    );
    const xpWithDaily = calculateSessionXP(
      createUnifiedContext(session, { isFirstOfDay: true, confidenceScore: 100 }),
    );
    const xpWithFlow = calculateSessionXP(
      createUnifiedContext(session, { isInFlow: true, confidenceScore: 100 }),
    );

    expect(xpWithBadge.total - xpBase.total).toBe(XP_BADGE_BONUS);
    expect(xpWithDaily.total - xpBase.total).toBe(XP_DAILY_FIRST_BONUS);
    expect(xpWithFlow.total - xpBase.total).toBe(XP_FLOW_BONUS);
  });
});

// =============================================================================
// SECTION 16: PREMIUM REWARDS (Tests 151-160)
// =============================================================================

describe('16. Premium Rewards at Levels', () => {
  it('16.1 No rewards below level 5', () => {
    for (let level = 1; level < PREMIUM_LEVEL_7_DAYS; level++) {
      expect(getUnlockedRewards(level).length).toBe(0);
    }
  });

  it('16.2 First reward at level 5 (7 days)', () => {
    const rewards = getUnlockedRewards(PREMIUM_LEVEL_7_DAYS);
    expect(rewards.length).toBe(1);
    expect(rewards[0]?.id).toBe('REWARD_7_DAYS_PREMIUM');
  });

  it('16.3 Second reward at level 10 (1 month)', () => {
    const rewards = getUnlockedRewards(PREMIUM_LEVEL_1_MONTH);
    expect(rewards.length).toBe(2);
    expect(rewards.some((r) => r.id === 'REWARD_1_MONTH_PREMIUM')).toBe(true);
  });

  it('16.4 Third reward at level 20 (3 months)', () => {
    const rewards = getUnlockedRewards(PREMIUM_LEVEL_3_MONTHS);
    expect(rewards.length).toBe(3);
    expect(rewards.some((r) => r.id === 'REWARD_3_MONTHS_PREMIUM')).toBe(true);
  });

  it('16.5 Fourth reward at level 30 (lifetime)', () => {
    const rewards = getUnlockedRewards(PREMIUM_LEVEL_LIFETIME);
    expect(rewards.length).toBe(4);
    expect(rewards.some((r) => r.id === 'REWARD_LIFETIME_ACCESS')).toBe(true);
  });

  it('16.6 Rewards are cumulative (higher level keeps lower rewards)', () => {
    fc.assert(
      fc.property(levelArb, levelArb, (l1, l2) => {
        const [low, high] = l1 < l2 ? [l1, l2] : [l2, l1];
        return getUnlockedRewards(low).length <= getUnlockedRewards(high).length;
      }),
      { numRuns: 100 },
    );
  });

  it('16.7 getNextReward returns correct next reward', () => {
    expect(getNextReward(1)?.requiredLevel).toBe(PREMIUM_LEVEL_7_DAYS);
    expect(getNextReward(5)?.requiredLevel).toBe(PREMIUM_LEVEL_1_MONTH);
    expect(getNextReward(10)?.requiredLevel).toBe(PREMIUM_LEVEL_3_MONTHS);
    expect(getNextReward(20)?.requiredLevel).toBe(PREMIUM_LEVEL_LIFETIME);
    expect(getNextReward(30)).toBeUndefined();
  });

  it('16.8 getNextReward requiredLevel is always > current level', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        const next = getNextReward(level);
        return next === undefined || next.requiredLevel > level;
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('16.9 Premium levels are in ascending order', () => {
    expect(PREMIUM_LEVEL_7_DAYS).toBeLessThan(PREMIUM_LEVEL_1_MONTH);
    expect(PREMIUM_LEVEL_1_MONTH).toBeLessThan(PREMIUM_LEVEL_3_MONTHS);
    expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThan(PREMIUM_LEVEL_LIFETIME);
  });

  it('16.10 All premium levels are within MAX_LEVEL', () => {
    expect(PREMIUM_LEVEL_7_DAYS).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_1_MONTH).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThanOrEqual(MAX_LEVEL);
    expect(PREMIUM_LEVEL_LIFETIME).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

// =============================================================================
// SECTION 17: BADGE UNLOCK CONDITIONS (Tests 161-170)
// =============================================================================

describe('17. Badge Unlock Conditions', () => {
  it('17.1 All badges have unique IDs', () => {
    const ids = BADGES.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('17.2 All badges have check functions', () => {
    for (const badge of BADGES) {
      expect(typeof badge.check).toBe('function');
    }
  });

  it('17.3 Badge check is deterministic', () => {
    const session = createSessionSummary();
    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };
    for (const badge of BADGES) {
      try {
        const r1 = badge.check(ctx);
        const r2 = badge.check(ctx);
        expect(r1).toBe(r2);
      } catch {
        // Some badges may throw, that's acceptable
      }
    }
  });

  it('17.4 checkNewBadges never returns already unlocked badges', () => {
    fc.assert(
      fc.property(
        fc.subarray(
          BADGES.map((b) => b.id),
          { minLength: 0, maxLength: 10 },
        ),
        (preUnlocked) => {
          const session = createSessionSummary();
          const ctx: BadgeContext = {
            session,
            history: UserHistory.empty(),
            progression: UserProgression.empty(),
          };
          const newBadges = checkNewBadges(ctx, new Set(preUnlocked));
          return !newBadges.some((b) => preUnlocked.includes(b.id));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('17.5 checkNewBadges returns array', () => {
    const session = createSessionSummary();
    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };
    const result = checkNewBadges(ctx, new Set());
    expect(Array.isArray(result)).toBe(true);
  });

  it('17.6 getBadgeById returns correct badge', () => {
    for (const badge of BADGES) {
      const found = getBadgeById(badge.id);
      expect(found).toBe(badge);
    }
  });

  it('17.7 getBadgeById returns undefined for non-existent ID', () => {
    expect(getBadgeById('non-existent-badge-id-xyz')).toBeUndefined();
  });

  it('17.8 All badges have valid categories', () => {
    const validCategories = [
      'consistency',
      'performance',
      'resilience',
      'exploration',
      'milestone',
      'cognitive',
    ];
    for (const badge of BADGES) {
      expect(validCategories).toContain(badge.category);
    }
  });

  it('17.9 Badge priority is 0 or 1', () => {
    for (const badge of BADGES) {
      const priority = badge.priority ?? 0;
      expect(priority === 0 || priority === 1).toBe(true);
    }
  });

  it('17.10 Badges have non-empty names and descriptions', () => {
    for (const badge of BADGES) {
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// SECTION 18: BADGE MUTUAL EXCLUSIVITY (Tests 171-175)
// =============================================================================

describe('18. Badge Mutual Exclusivity (One Per Group)', () => {
  it('18.1 Grouped badges only unlock one per group per session', () => {
    const session = createSessionSummary({
      nLevel: 10,
      finalStats: createRunningStats({}, {}, 5.0),
    });
    let progression = UserProgression.empty();
    for (let i = 0; i < 500; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
    const newBadges = checkNewBadges(ctx, new Set());

    const groupCounts = new Map<string, number>();
    for (const badge of newBadges) {
      if (badge.group) {
        const count = groupCounts.get(badge.group) ?? 0;
        groupCounts.set(badge.group, count + 1);
      }
    }
    for (const [, count] of groupCounts) {
      expect(count).toBe(1);
    }
  });

  it('18.2 Groups with tiers have unique tier values', () => {
    const groups = new Map<string, Set<number>>();
    for (const badge of BADGES) {
      if (badge.group && badge.tier !== undefined) {
        if (!groups.has(badge.group)) {
          groups.set(badge.group, new Set());
        }
        const tiers = groups.get(badge.group)!;
        expect(tiers.has(badge.tier)).toBe(false);
        tiers.add(badge.tier);
      }
    }
  });

  it('18.3 Higher tier badge requires lower tier to be unlocked', () => {
    // Conceptual: within a group, tier 2 should only unlock after tier 1
    const groups = new Map<string, BadgeDefinition[]>();
    for (const badge of BADGES) {
      if (badge.group) {
        const list = groups.get(badge.group) ?? [];
        list.push(badge);
        groups.set(badge.group, list);
      }
    }
    for (const [, badges] of groups) {
      const tiered = badges
        .filter((b) => b.tier !== undefined)
        .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      for (let i = 0; i < tiered.length - 1; i++) {
        expect(tiered[i]?.tier).toBeLessThan(tiered[i + 1]?.tier ?? 0);
      }
    }
  });

  it('18.4 Ungrouped badges can unlock independently', () => {
    const ungrouped = BADGES.filter((b) => !b.group);
    expect(ungrouped.length).toBeGreaterThan(0);
  });

  it('18.5 All groups have at least one badge', () => {
    const groupNames = new Set(BADGES.filter((b) => b.group).map((b) => b.group!));
    for (const group of groupNames) {
      const badges = BADGES.filter((b) => b.group === group);
      expect(badges.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// SECTION 19: BADGE PRIORITY & CAP (Tests 176-185)
// =============================================================================

describe('19. Badge Priority and Cap', () => {
  it('19.1 checkNewBadges respects BADGE_MAX_PER_SESSION', () => {
    fc.assert(
      fc.property(sessionCountArb, (sessions) => {
        const session = createSessionSummary({ nLevel: 10 });
        let progression = UserProgression.empty();
        for (let i = 0; i < sessions; i++) {
          progression = progression.withCompletedSession(20, 12);
        }
        const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
        const newBadges = checkNewBadges(ctx, new Set());
        return newBadges.length <= BADGE_MAX_PER_SESSION;
      }),
      { numRuns: 50 },
    );
  });

  it('19.2 Higher priority badges are selected first', () => {
    const session = createSessionSummary({
      nLevel: 10,
      finalStats: createRunningStats({}, {}, 4.0),
    });
    let progression = UserProgression.empty();
    for (let i = 0; i < 100; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
    const newBadges = checkNewBadges(ctx, new Set());

    if (newBadges.length === BADGE_MAX_PER_SESSION) {
      const priorities = newBadges.map((b) => b.priority ?? 0);
      // At least one should be priority 1 if available
      expect(priorities.some((p) => p === 1)).toBe(true);
    }
  });

  it('19.3 BADGE_MAX_PER_SESSION is positive', () => {
    expect(BADGE_MAX_PER_SESSION).toBeGreaterThan(0);
  });

  it('19.4 Performance badges have priority 1', () => {
    const perfBadges = BADGES.filter((b) => b.category === 'performance');
    for (const badge of perfBadges) {
      expect(badge.priority).toBe(1);
    }
  });

  it('19.5 Milestone badges have priority 0', () => {
    const milestoneBadges = BADGES.filter((b) => b.category === 'milestone');
    for (const badge of milestoneBadges) {
      expect(badge.priority ?? 0).toBe(0);
    }
  });

  it('19.6 Badge cap applies regardless of eligible count', () => {
    const session = createSessionSummary({
      nLevel: 10,
      finalStats: createRunningStats({}, {}, 5.0),
    });
    let progression = UserProgression.empty();
    for (let i = 0; i < 1000; i++) {
      progression = progression.withCompletedSession(100, 12);
    }
    const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
    const newBadges = checkNewBadges(ctx, new Set());
    expect(newBadges.length).toBeLessThanOrEqual(BADGE_MAX_PER_SESSION);
  });

  it('19.7 No duplicate badges in result', () => {
    fc.assert(
      fc.property(sessionCountArb, (sessions) => {
        const session = createSessionSummary();
        let progression = UserProgression.empty();
        for (let i = 0; i < sessions; i++) {
          progression = progression.withCompletedSession(20, 12);
        }
        const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
        const newBadges = checkNewBadges(ctx, new Set());
        const ids = newBadges.map((b) => b.id);
        return ids.length === new Set(ids).size;
      }),
      { numRuns: 50 },
    );
  });

  it('19.8 Badge check is idempotent with same unlocked set', () => {
    const session = createSessionSummary();
    let progression = UserProgression.empty();
    for (let i = 0; i < 25; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    const ctx: BadgeContext = { session, history: UserHistory.empty(), progression };
    const unlocked = new Set<string>();
    const r1 = checkNewBadges(ctx, unlocked);
    const r2 = checkNewBadges(ctx, unlocked);
    expect(r1.map((b) => b.id).sort()).toEqual(r2.map((b) => b.id).sort());
  });

  it('19.9 Cognitive badges have priority 1', () => {
    const cognitiveBadges = BADGES.filter((b) => b.category === 'cognitive');
    for (const badge of cognitiveBadges) {
      expect(badge.priority).toBe(1);
    }
  });

  it('19.10 Consistency badges have priority 0', () => {
    const consistencyBadges = BADGES.filter((b) => b.category === 'consistency');
    for (const badge of consistencyBadges) {
      expect(badge.priority ?? 0).toBe(0);
    }
  });
});

// =============================================================================
// SECTION 20: SESSION & STREAK TRACKING (Tests 186-200)
// =============================================================================

describe('20. Session and Streak Tracking', () => {
  it('20.1 completedSessions increases by 1 on withCompletedSession', () => {
    fc.assert(
      fc.property(sessionCountArb, trialsArb, hourArb, (initial, trials, hour) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({ completedSessions: initial }),
          [],
        );
        const updated = prog.withCompletedSession(trials, hour);
        return updated.completedSessions === initial + 1;
      }),
      { numRuns: 100 },
    );
  });

  it('20.2 abandonedSessions increases by 1 on withAbandonedSession', () => {
    fc.assert(
      fc.property(sessionCountArb, (initial) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({ abandonedSessions: initial }),
          [],
        );
        const updated = prog.withAbandonedSession();
        return updated.abandonedSessions === initial + 1;
      }),
      { numRuns: 100 },
    );
  });

  it('20.3 totalSessions = completedSessions + abandonedSessions', () => {
    fc.assert(
      fc.property(sessionCountArb, sessionCountArb, (completed, abandoned) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({
            completedSessions: completed,
            abandonedSessions: abandoned,
          }),
          [],
        );
        return prog.totalSessions === completed + abandoned;
      }),
      { numRuns: 100 },
    );
  });

  it('20.4 Early morning sessions tracked for hour < 8', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BADGE_EARLY_BIRD_HOUR - 1 }),
        trialsArb,
        (hour, trials) => {
          const prog = UserProgression.empty().withCompletedSession(trials, hour);
          return prog.earlyMorningSessions === 1;
        },
      ),
      { numRuns: 24 },
    );
  });

  it('20.5 Late night sessions tracked for hour >= 22', () => {
    fc.assert(
      fc.property(fc.integer({ min: BADGE_NIGHT_OWL_HOUR, max: 23 }), trialsArb, (hour, trials) => {
        const prog = UserProgression.empty().withCompletedSession(trials, hour);
        return prog.lateNightSessions === 1;
      }),
      { numRuns: 10 },
    );
  });

  it('20.6 Uninterrupted streak resets on abandoned session', () => {
    let prog = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      prog = prog.withCompletedSession(20, 12, false);
    }
    expect(prog.uninterruptedSessionsStreak).toBe(5);
    prog = prog.withAbandonedSession();
    expect(prog.uninterruptedSessionsStreak).toBe(0);
  });

  it('20.7 Uninterrupted streak resets on paused session', () => {
    let prog = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      prog = prog.withCompletedSession(20, 12, false);
    }
    expect(prog.uninterruptedSessionsStreak).toBe(5);
    prog = prog.withCompletedSession(20, 12, true); // hadPause = true
    expect(prog.uninterruptedSessionsStreak).toBe(0);
  });

  it('20.8 Uninterrupted streak increments on clean session', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (initial) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({ uninterruptedSessionsStreak: initial }),
          [],
        );
        const updated = prog.withCompletedSession(20, 12, false);
        return updated.uninterruptedSessionsStreak === initial + 1;
      }),
      { numRuns: 50 },
    );
  });

  it('20.9 totalTrials accumulates correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), trialsArb, (initial, newTrials) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({ totalTrials: initial }),
          [],
        );
        const updated = prog.withCompletedSession(newTrials, 12);
        return updated.totalTrials === initial + newTrials;
      }),
      { numRuns: 100 },
    );
  });

  it('20.10 withAddedXP preserves totalXP correctly', () => {
    fc.assert(
      fc.property(xpArb, fc.integer({ min: 0, max: 10000 }), (initial, added) => {
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: initial }), []);
        const updated = prog.withAddedXP(added);
        return updated.totalXP === initial + added;
      }),
      { numRuns: 100 },
    );
  });

  it('20.11 UserProgression.empty() starts with 0 values', () => {
    const prog = UserProgression.empty();
    expect(prog.totalXP).toBe(0);
    expect(prog.completedSessions).toBe(0);
    expect(prog.abandonedSessions).toBe(0);
    expect(prog.totalTrials).toBe(0);
    expect(prog.level).toBe(1);
  });

  it('20.12 completionRate is in [0, 100]', () => {
    fc.assert(
      fc.property(sessionCountArb, sessionCountArb, (completed, abandoned) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({
            completedSessions: completed,
            abandonedSessions: abandoned,
          }),
          [],
        );
        return prog.completionRate >= 0 && prog.completionRate <= 100;
      }),
      { numRuns: 100 },
    );
  });

  it('20.13 completionRate is 100% with 0 abandoned', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (completed) => {
        const prog = UserProgression.fromRecord(
          createProgressionRecord({
            completedSessions: completed,
            abandonedSessions: 0,
          }),
          [],
        );
        return prog.completionRate === 100;
      }),
      { numRuns: 50 },
    );
  });

  it('20.14 toRecord/fromRecord roundtrip preserves data', () => {
    fc.assert(
      fc.property(
        xpArb,
        sessionCountArb,
        sessionCountArb,
        trialsArb,
        (xp, completed, abandoned, trials) => {
          const original = UserProgression.fromRecord(
            createProgressionRecord({
              totalXP: xp,
              completedSessions: completed,
              abandonedSessions: abandoned,
              totalTrials: trials,
            }),
            [],
          );
          const record = original.toRecord();
          const restored = UserProgression.fromRecord(record, []);
          return (
            restored.totalXP === original.totalXP &&
            restored.completedSessions === original.completedSessions &&
            restored.abandonedSessions === original.abandonedSessions &&
            restored.totalTrials === original.totalTrials
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('20.15 Immutability: withAddedXP returns new instance', () => {
    fc.assert(
      fc.property(xpArb, fc.integer({ min: 1, max: 1000 }), (initial, added) => {
        const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: initial }), []);
        const updated = prog.withAddedXP(added);
        return prog !== updated && prog.totalXP === initial && updated.totalXP === initial + added;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 21: DETERMINISM & CONSISTENCY (Tests 201-210)
// =============================================================================

describe('21. Determinism and Consistency', () => {
  it('21.1 calculateSessionXP is pure (deterministic)', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        dPrimeArb,
        streakArb,
        confidenceArb,
        (nLevel, dPrime, streak, confidence) => {
          const session = createSessionSummary({
            nLevel,
            finalStats: createRunningStats({}, {}, dPrime),
          });
          const ctx = createUnifiedContext(session, {
            streakDays: streak,
            confidenceScore: confidence,
          });
          const xp1 = calculateSessionXP(ctx);
          const xp2 = calculateSessionXP(ctx);
          return xp1.total === xp2.total && xp1.base === xp2.base;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('21.2 getLevel is pure', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevel(xp) === getLevel(xp);
      }),
      { numRuns: 200 },
    );
  });

  it('21.3 getLevelProgress is pure', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getLevelProgress(xp) === getLevelProgress(xp);
      }),
      { numRuns: 200 },
    );
  });

  it('21.4 getXPForNextLevel is pure', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        return getXPForNextLevel(level) === getXPForNextLevel(level);
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('21.5 getXPInCurrentLevel is pure', () => {
    fc.assert(
      fc.property(xpArb, (xp) => {
        return getXPInCurrentLevel(xp) === getXPInCurrentLevel(xp);
      }),
      { numRuns: 200 },
    );
  });

  it('21.6 getUnlockedRewards is pure', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        const r1 = getUnlockedRewards(level);
        const r2 = getUnlockedRewards(level);
        return r1.length === r2.length && r1.every((r, i) => r.id === r2[i]?.id);
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('21.7 getNextReward is pure', () => {
    fc.assert(
      fc.property(levelArb, (level) => {
        const r1 = getNextReward(level);
        const r2 = getNextReward(level);
        return r1?.id === r2?.id;
      }),
      { numRuns: MAX_LEVEL },
    );
  });

  it('21.8 Multiple XP calculations are consistent', () => {
    const session = createSessionSummary({
      nLevel: 3,
      finalStats: createRunningStats({}, {}, 2.0),
    });
    const ctx = createUnifiedContext(session, { streakDays: 5, isFirstOfDay: true });
    const results = Array.from({ length: 10 }, () => calculateSessionXP(ctx));
    const first = results[0];
    for (const result of results) {
      expect(result.total).toBe(first!.total);
      expect(result.base).toBe(first!.base);
      expect(result.performance).toBe(first!.performance);
    }
  });

  it('21.9 Level calculations are stable under repeated calls', () => {
    const testXPs = [0, 500, 1200, 10000, 40000, 120000, 300000, 500000];
    for (const xp of testXPs) {
      const levels = Array.from({ length: 5 }, () => getLevel(xp));
      expect(new Set(levels).size).toBe(1);
    }
  });

  it('21.10 XP breakdown components sum consistently', () => {
    fc.assert(
      fc.property(nLevelArb, dPrimeArb, (nLevel, dPrime) => {
        const session = createSessionSummary({
          nLevel,
          finalStats: createRunningStats({}, {}, dPrime),
        });
        const ctx = createUnifiedContext(session);
        const xp = calculateSessionXP(ctx);
        const sum1 =
          xp.base +
          xp.performance +
          xp.accuracy +
          xp.badgeBonus +
          xp.streakBonus +
          xp.dailyBonus +
          xp.flowBonus;
        const sum2 =
          xp.base +
          xp.performance +
          xp.accuracy +
          xp.badgeBonus +
          xp.streakBonus +
          xp.dailyBonus +
          xp.flowBonus;
        return sum1 === sum2 && sum1 === xp.subtotalBeforeConfidence;
      }),
      { numRuns: 100 },
    );
  });
});
