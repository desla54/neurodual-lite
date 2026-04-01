/**
 * Property-based tests for Unified Metrics and Session Stats
 *
 * Uses fast-check for exhaustive property testing.
 * These tests verify mathematical invariants and consistency guarantees.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  computeUnifiedMetrics,
  computeTempoAccuracy,
  computeMemoAccuracy,
  computePlaceAccuracy,
  computeSpecDrivenTempoAccuracy,
  createEmptyUnifiedMetrics,
} from './unified-metrics';
import { ModalityStatsVO, SessionStats } from './session-stats';
import type { RunningStats, ModalityRunningStats } from '../engine/events';
import {
  ZONE_PER_N_LEVEL,
  ZONE_MIN_ACCURACY_FOR_BONUS,
  ZONE_MAX_ACCURACY_BONUS,
  ZONE_MIN,
  ZONE_MAX,
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  STATS_MIN_TRIALS_FOR_VALID,
} from '../specs/thresholds';

// =============================================================================
// Arbitraries (reusable generators)
// =============================================================================

/** Accuracy as a ratio (0-1) */
const accuracyArb = fc.double({ min: 0, max: 1, noNaN: true });

/** N-level (1+) */
const nLevelArb = fc.integer({ min: 1, max: 20 });

/** Counts for signal detection metrics */
const countArb = fc.integer({ min: 0, max: 100 });

/** Positive counts (at least 1) */
const positiveCountArb = fc.integer({ min: 1, max: 100 });

/** d-prime values (-5 to 5 realistic range) */
const dPrimeArb = fc.double({ min: -5, max: 5, noNaN: true });

/** Duration in milliseconds */
const durationArb = fc.integer({ min: 1000, max: 600000 });

/** Total trials count */
const trialsArb = fc.integer({ min: 1, max: 100 });

/** Reaction time (ms) or null */
const reactionTimeArb = fc.option(fc.integer({ min: 100, max: 2000 }), { nil: null });

/** Game mode for spec-driven accuracy */
const gameModeArb = fc.constantFrom(
  'dualnback-classic',
  'dualnback-classic',
  'sim-brainworkshop',
  'custom',
);

// =============================================================================
// Helpers
// =============================================================================

/** Create RunningStats from modality data */
function createRunningStats(
  posStats: Partial<ModalityRunningStats>,
  audStats: Partial<ModalityRunningStats>,
  globalDPrime: number,
): RunningStats {
  const defaultModality: ModalityRunningStats = {
    hits: 5,
    misses: 1,
    falseAlarms: 1,
    correctRejections: 13,
    avgRT: 400,
    dPrime: 1.5,
  };
  return {
    trialsCompleted: 20,
    globalDPrime,
    byModality: {
      position: { ...defaultModality, ...posStats },
      audio: { ...defaultModality, ...audStats },
    },
  };
}

// =============================================================================
// PART 1: Unified Metrics Computation (20 tests)
// =============================================================================

describe('Unified Metrics - Property Tests', () => {
  describe('computeUnifiedMetrics', () => {
    // Test 1: Zone is always a finite integer
    it('zone is always a finite integer', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const metrics = computeUnifiedMetrics(accuracy, nLevel);
          return Number.isFinite(metrics.zone) && Number.isInteger(metrics.zone);
        }),
      );
    });

    // Test 2: Zone is bounded [ZONE_MIN, ZONE_MAX]
    it('zone is bounded [ZONE_MIN, ZONE_MAX]', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const metrics = computeUnifiedMetrics(accuracy, nLevel);
          return metrics.zone >= ZONE_MIN && metrics.zone <= ZONE_MAX;
        }),
      );
    });

    // Test 3: Zone progress is in [0, 100]
    it('zone progress is in [0, 100]', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const metrics = computeUnifiedMetrics(accuracy, nLevel);
          return metrics.zoneProgress >= 0 && metrics.zoneProgress <= 100;
        }),
      );
    });

    // Test 4: Zone progress is an integer
    it('zone progress is an integer', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const metrics = computeUnifiedMetrics(accuracy, nLevel);
          return Number.isInteger(metrics.zoneProgress);
        }),
      );
    });

    // Test 5: Accuracy is clamped to [0, 1]
    it('accuracy is clamped to [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -10, max: 10, noNaN: true }),
          nLevelArb,
          (accuracy, nLevel) => {
            const metrics = computeUnifiedMetrics(accuracy, nLevel);
            return metrics.accuracy >= 0 && metrics.accuracy <= 1;
          },
        ),
      );
    });

    // Test 6: N-level is clamped to minimum 1
    it('n-level is clamped to minimum 1', () => {
      fc.assert(
        fc.property(accuracyArb, fc.integer({ min: -10, max: 30 }), (accuracy, nLevel) => {
          const metrics = computeUnifiedMetrics(accuracy, nLevel);
          return metrics.nLevel >= 1;
        }),
      );
    });

    // Test 7: Zone is monotonically non-decreasing with accuracy (nLevel fixed)
    it('zone is monotonically non-decreasing with accuracy', () => {
      fc.assert(
        fc.property(accuracyArb, accuracyArb, nLevelArb, (acc1, acc2, nLevel) => {
          const [low, high] = acc1 < acc2 ? [acc1, acc2] : [acc2, acc1];
          const zLow = computeUnifiedMetrics(low, nLevel).zone;
          const zHigh = computeUnifiedMetrics(high, nLevel).zone;
          return zHigh >= zLow;
        }),
      );
    });

    // Test 8: Zone is monotonically non-decreasing with N-level (accuracy fixed)
    it('zone is monotonically non-decreasing with n-level', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, nLevelArb, (accuracy, n1, n2) => {
          const [low, high] = n1 < n2 ? [n1, n2] : [n2, n1];
          const zLow = computeUnifiedMetrics(accuracy, low).zone;
          const zHigh = computeUnifiedMetrics(accuracy, high).zone;
          return zHigh >= zLow;
        }),
      );
    });

    // Test 9: Same inputs produce same outputs (determinism)
    it('same inputs produce same outputs (determinism)', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const m1 = computeUnifiedMetrics(accuracy, nLevel);
          const m2 = computeUnifiedMetrics(accuracy, nLevel);
          return (
            m1.zone === m2.zone &&
            m1.zoneProgress === m2.zoneProgress &&
            m1.accuracy === m2.accuracy &&
            m1.nLevel === m2.nLevel
          );
        }),
      );
    });

    // Test 10: Zero accuracy gives minimum zone
    it('zero accuracy gives minimum zone', () => {
      fc.assert(
        fc.property(nLevelArb, (nLevel) => {
          const metrics = computeUnifiedMetrics(0, nLevel);
          // Base zone from nLevel, no accuracy bonus
          const expectedBase = Math.min(ZONE_MAX - 1, 1 + (nLevel - 1) * ZONE_PER_N_LEVEL);
          return metrics.zone === expectedBase;
        }),
      );
    });

    // Test 11: Below threshold accuracy gives no bonus
    it('accuracy below threshold gives no bonus', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: ZONE_MIN_ACCURACY_FOR_BONUS - 0.001, noNaN: true }),
          nLevelArb,
          (accuracy, nLevel) => {
            const metrics = computeUnifiedMetrics(accuracy, nLevel);
            const baseZone = Math.min(ZONE_MAX - 1, 1 + (nLevel - 1) * ZONE_PER_N_LEVEL);
            return metrics.zone === Math.max(ZONE_MIN, Math.min(ZONE_MAX, baseZone));
          },
        ),
      );
    });

    // Test 12: Perfect accuracy at N=1 gives zone 5 (1 + 4 bonus)
    it('perfect accuracy at n=1 gives expected zone', () => {
      const metrics = computeUnifiedMetrics(1.0, 1);
      // Base = 1, Bonus = floor(1.0 * 4) = 4 (MAX_ACCURACY_BONUS + 1 = 4)
      expect(metrics.zone).toBe(5);
    });

    // Test 13: Maximum zone is achievable
    it('maximum zone is achievable at high n-level with perfect accuracy', () => {
      const metrics = computeUnifiedMetrics(1.0, 10);
      expect(metrics.zone).toBe(ZONE_MAX);
    });

    // Test 14: Zone at max has progress 100
    it('zone at max has progress 100', () => {
      const metrics = computeUnifiedMetrics(1.0, 10);
      expect(metrics.zone).toBe(ZONE_MAX);
      expect(metrics.zoneProgress).toBe(100);
    });

    // Test 15: Accuracy bonus is capped at MAX_ACCURACY_BONUS
    it('accuracy bonus is capped at max', () => {
      fc.assert(
        fc.property(nLevelArb, (nLevel) => {
          const metricsLow = computeUnifiedMetrics(0.5, nLevel);
          const metricsHigh = computeUnifiedMetrics(1.0, nLevel);
          const bonus = metricsHigh.zone - metricsLow.zone;
          return bonus <= ZONE_MAX_ACCURACY_BONUS + 1; // +1 because floor includes the threshold edge
        }),
      );
    });

    // Test 16: createEmptyUnifiedMetrics returns valid defaults
    it('createEmptyUnifiedMetrics returns valid defaults', () => {
      const empty = createEmptyUnifiedMetrics();
      expect(empty.accuracy).toBe(0);
      expect(empty.zone).toBeGreaterThanOrEqual(ZONE_MIN);
      expect(empty.zone).toBeLessThanOrEqual(ZONE_MAX);
      expect(empty.zoneProgress).toBe(0);
      expect(empty.nLevel).toBeGreaterThanOrEqual(1);
    });

    // Test 17: All metrics values are finite numbers
    it('all metrics values are finite numbers', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const m = computeUnifiedMetrics(accuracy, nLevel);
          return (
            Number.isFinite(m.accuracy) &&
            Number.isFinite(m.nLevel) &&
            Number.isFinite(m.zone) &&
            Number.isFinite(m.zoneProgress)
          );
        }),
      );
    });

    // Test 18: Zone step follows ZONE_PER_N_LEVEL
    it('zone increases by ZONE_PER_N_LEVEL per n-level (at same accuracy)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (nLevel) => {
          // Use exactly threshold accuracy for no bonus
          const m1 = computeUnifiedMetrics(0.5, nLevel);
          const m2 = computeUnifiedMetrics(0.5, nLevel + 1);
          const diff = m2.zone - m1.zone;
          // Should be ZONE_PER_N_LEVEL unless clamped at max
          return diff === ZONE_PER_N_LEVEL || m2.zone === ZONE_MAX - 1;
        }),
      );
    });

    // Test 19: N-level is preserved in output
    it('n-level is preserved in output (when valid)', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const m = computeUnifiedMetrics(accuracy, nLevel);
          return m.nLevel === nLevel;
        }),
      );
    });

    // Test 20: Accuracy is preserved in output (when valid)
    it('accuracy is preserved in output (when valid)', () => {
      fc.assert(
        fc.property(accuracyArb, nLevelArb, (accuracy, nLevel) => {
          const m = computeUnifiedMetrics(accuracy, nLevel);
          return Math.abs(m.accuracy - accuracy) < 1e-10;
        }),
      );
    });
  });

  // ===========================================================================
  // PART 2: Accuracy Helpers (15 tests)
  // ===========================================================================

  describe('computeTempoAccuracy (Geometric Mean)', () => {
    // Test 21: Output is bounded [0, 1]
    it('output is bounded [0, 1]', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, fa, cr) => {
          const acc = computeTempoAccuracy(h, m, fa, cr);
          return acc >= 0 && acc <= 1;
        }),
      );
    });

    // Test 22: Output is a finite number
    it('output is a finite number', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, fa, cr) => {
          const acc = computeTempoAccuracy(h, m, fa, cr);
          return Number.isFinite(acc);
        }),
      );
    });

    // Test 23: Returns 0 when no trials
    it('returns 0 when no trials', () => {
      expect(computeTempoAccuracy(0, 0, 0, 0)).toBe(0);
    });

    // Test 24: Returns 0 when hits = 0 (never clicking targets)
    it('returns 0 when hits = 0', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, (m, fa, cr) => {
          return computeTempoAccuracy(0, m, fa, cr) === 0;
        }),
      );
    });

    // Test 25: Returns 0 when correctRejections = 0 (always clicking)
    it('returns 0 when correctRejections = 0 and there are noise trials', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, positiveCountArb, (h, m, fa) => {
          return computeTempoAccuracy(h, m, fa, 0) === 0;
        }),
      );
    });

    // Test 26: Perfect performance returns 1
    it('perfect performance returns 1', () => {
      fc.assert(
        fc.property(positiveCountArb, positiveCountArb, (hits, cr) => {
          const acc = computeTempoAccuracy(hits, 0, 0, cr);
          return Math.abs(acc - 1) < 1e-10;
        }),
      );
    });

    // Test 27: Symmetric behavior (hitRate and crRate are weighted equally)
    it('geometric mean is symmetric in hitRate and crRate', () => {
      fc.assert(
        fc.property(
          positiveCountArb,
          positiveCountArb,
          positiveCountArb,
          positiveCountArb,
          (h1, m1, fa1, cr1) => {
            // Geometric mean: sqrt(hitRate * crRate)
            const signalTrials = h1 + m1;
            const noiseTrials = fa1 + cr1;
            if (signalTrials === 0 || noiseTrials === 0) return true;

            const hitRate = h1 / signalTrials;
            const crRate = cr1 / noiseTrials;
            const expected = Math.sqrt(hitRate * crRate);
            const actual = computeTempoAccuracy(h1, m1, fa1, cr1);

            return Math.abs(expected - actual) < 1e-10;
          },
        ),
      );
    });
  });

  describe('computeMemoAccuracy', () => {
    // Test 28: Output is bounded [0, 1]
    it('output is bounded [0, 1]', () => {
      fc.assert(
        fc.property(countArb, countArb, (correct, total) => {
          const actualTotal = Math.max(total, correct);
          const acc = computeMemoAccuracy(correct, actualTotal);
          return acc >= 0 && acc <= 1;
        }),
      );
    });

    // Test 29: Returns 0 when totalPicks = 0
    it('returns 0 when totalPicks = 0', () => {
      expect(computeMemoAccuracy(0, 0)).toBe(0);
    });

    // Test 30: Perfect accuracy when all correct
    it('returns 1 when all picks are correct', () => {
      fc.assert(
        fc.property(positiveCountArb, (n) => {
          return computeMemoAccuracy(n, n) === 1;
        }),
      );
    });

    // Test 31: Accuracy equals ratio correct/total
    it('accuracy equals ratio correct/total', () => {
      fc.assert(
        fc.property(countArb, positiveCountArb, (correct, total) => {
          const actualCorrect = Math.min(correct, total);
          const expected = actualCorrect / total;
          const actual = computeMemoAccuracy(actualCorrect, total);
          return Math.abs(expected - actual) < 1e-10;
        }),
      );
    });
  });

  describe('computePlaceAccuracy', () => {
    // Test 32: Output is bounded [0, 1]
    it('output is bounded [0, 1]', () => {
      fc.assert(
        fc.property(countArb, countArb, (correct, total) => {
          const actualTotal = Math.max(total, correct);
          const acc = computePlaceAccuracy(correct, actualTotal);
          return acc >= 0 && acc <= 1;
        }),
      );
    });

    // Test 33: Returns 0 when totalDrops = 0
    it('returns 0 when totalDrops = 0', () => {
      expect(computePlaceAccuracy(0, 0)).toBe(0);
    });

    // Test 34: Perfect accuracy when all correct
    it('returns 1 when all drops are correct', () => {
      fc.assert(
        fc.property(positiveCountArb, (n) => {
          return computePlaceAccuracy(n, n) === 1;
        }),
      );
    });

    // Test 35: Accuracy equals ratio correct/total
    it('accuracy equals ratio correct/total', () => {
      fc.assert(
        fc.property(countArb, positiveCountArb, (correct, total) => {
          const actualCorrect = Math.min(correct, total);
          const expected = actualCorrect / total;
          const actual = computePlaceAccuracy(actualCorrect, total);
          return Math.abs(expected - actual) < 1e-10;
        }),
      );
    });
  });

  describe('computeSpecDrivenTempoAccuracy', () => {
    // Test 36: Output is bounded [0, 1] for all game modes
    it('output is bounded [0, 1] for all game modes', () => {
      fc.assert(
        fc.property(gameModeArb, countArb, countArb, countArb, countArb, (mode, h, m, fa, cr) => {
          const acc = computeSpecDrivenTempoAccuracy(mode, h, m, fa, cr);
          return acc >= 0 && acc <= 1;
        }),
      );
    });

    // Test 37: Output is a finite number for all modes
    it('output is a finite number for all modes', () => {
      fc.assert(
        fc.property(gameModeArb, countArb, countArb, countArb, countArb, (mode, h, m, fa, cr) => {
          const acc = computeSpecDrivenTempoAccuracy(mode, h, m, fa, cr);
          return Number.isFinite(acc);
        }),
      );
    });

    // Test 38: Same mode with same inputs produces same output
    it('same mode with same inputs produces same output', () => {
      fc.assert(
        fc.property(gameModeArb, countArb, countArb, countArb, countArb, (mode, h, m, fa, cr) => {
          const acc1 = computeSpecDrivenTempoAccuracy(mode, h, m, fa, cr);
          const acc2 = computeSpecDrivenTempoAccuracy(mode, h, m, fa, cr);
          return acc1 === acc2;
        }),
      );
    });

    // Test 39: Perfect performance gives 1 for all modes
    it('perfect performance gives 1 for all modes', () => {
      fc.assert(
        fc.property(gameModeArb, positiveCountArb, positiveCountArb, (mode, hits, cr) => {
          const acc = computeSpecDrivenTempoAccuracy(mode, hits, 0, 0, cr);
          return Math.abs(acc - 1) < 1e-10;
        }),
      );
    });

    // Test 40: Zero performance gives 0 for all modes
    it('zero performance gives 0 for all modes', () => {
      fc.assert(
        fc.property(gameModeArb, positiveCountArb, positiveCountArb, (mode, misses, fa) => {
          const acc = computeSpecDrivenTempoAccuracy(mode, 0, misses, fa, 0);
          return acc === 0;
        }),
      );
    });
  });
});

// =============================================================================
// PART 3: Session Stats Aggregation (15 tests)
// =============================================================================

describe('Session Stats - Property Tests', () => {
  describe('ModalityStatsVO', () => {
    // Test 41: Total trials equals sum of all outcomes
    it('totalTrials equals sum of all outcomes', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, reactionTimeArb, (h, m, fa, cr, rt) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, rt);
          return stats.totalTrials === h + m + fa + cr;
        }),
      );
    });

    // Test 42: Accuracy is in [0, 100] percentage
    it('accuracy is in [0, 100] percentage', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, reactionTimeArb, (h, m, fa, cr, rt) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, rt);
          return stats.accuracy >= 0 && stats.accuracy <= 100;
        }),
      );
    });

    // Test 43: Overall accuracy is in [0, 100] percentage
    it('overallAccuracy is in [0, 100] percentage', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, reactionTimeArb, (h, m, fa, cr, rt) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, rt);
          return stats.overallAccuracy >= 0 && stats.overallAccuracy <= 100;
        }),
      );
    });

    // Test 44: Hit rate is in [0, 1]
    it('hitRate is in [0, 1]', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, reactionTimeArb, (h, m, fa, cr, rt) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, rt);
          return stats.hitRate >= 0 && stats.hitRate <= 1;
        }),
      );
    });

    // Test 45: False alarm rate is in [0, 1]
    it('falseAlarmRate is in [0, 1]', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, reactionTimeArb, (h, m, fa, cr, rt) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, rt);
          return stats.falseAlarmRate >= 0 && stats.falseAlarmRate <= 1;
        }),
      );
    });

    // Test 46: Accuracy is 0 when no targets (hits + misses = 0)
    it('accuracy is 0 when no targets', () => {
      fc.assert(
        fc.property(countArb, countArb, reactionTimeArb, (fa, cr, rt) => {
          const stats = new ModalityStatsVO(0, 0, fa, cr, rt);
          return stats.accuracy === 0;
        }),
      );
    });

    // Test 47: HitRate is 0 when no targets
    it('hitRate is 0 when no targets', () => {
      fc.assert(
        fc.property(countArb, countArb, reactionTimeArb, (fa, cr, rt) => {
          const stats = new ModalityStatsVO(0, 0, fa, cr, rt);
          return stats.hitRate === 0;
        }),
      );
    });

    // Test 48: FalseAlarmRate is 0 when no non-targets
    it('falseAlarmRate is 0 when no non-targets', () => {
      fc.assert(
        fc.property(countArb, countArb, reactionTimeArb, (h, m, rt) => {
          const stats = new ModalityStatsVO(h, m, 0, 0, rt);
          return stats.falseAlarmRate === 0;
        }),
      );
    });

    // Test 49: formattedRT is null when avgReactionTime is null
    it('formattedRT is null when avgReactionTime is null', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, fa, cr) => {
          const stats = new ModalityStatsVO(h, m, fa, cr, null);
          return stats.formattedRT === null;
        }),
      );
    });

    // Test 50: formattedRT contains "ms" when avgReactionTime is not null
    it('formattedRT contains ms suffix when present', () => {
      fc.assert(
        fc.property(
          countArb,
          countArb,
          countArb,
          countArb,
          fc.integer({ min: 100, max: 2000 }),
          (h, m, fa, cr, rt) => {
            const stats = new ModalityStatsVO(h, m, fa, cr, rt);
            const formatted = stats.formattedRT;
            return formatted?.endsWith('ms');
          },
        ),
      );
    });
  });

  describe('SessionStats', () => {
    // Test 51: passed is true iff globalDPrime >= SDT_DPRIME_PASS
    it('passed matches globalDPrime threshold', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          return stats.passed === dPrime >= SDT_DPRIME_PASS;
        }),
      );
    });

    // Test 52: isShortSession is true iff totalTrials < STATS_MIN_TRIALS_FOR_VALID
    it('isShortSession matches trials threshold', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          return stats.isShortSession === trials < STATS_MIN_TRIALS_FOR_VALID;
        }),
      );
    });

    // Test 53: shouldLevelUp is true iff globalDPrime >= SDT_DPRIME_PASS
    it('shouldLevelUp matches dPrime threshold', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          return stats.shouldLevelUp() === dPrime >= SDT_DPRIME_PASS;
        }),
      );
    });

    // Test 54: shouldLevelDown requires dPrime < SDT_DPRIME_DOWN AND nLevel > 1
    it('shouldLevelDown requires both conditions', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          const expected = dPrime < SDT_DPRIME_DOWN && nLevel > 1;
          return stats.shouldLevelDown() === expected;
        }),
      );
    });

    // Test 55: getNextLevel returns valid level (>= 1)
    it('getNextLevel returns valid level >= 1', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          return stats.getNextLevel() >= 1;
        }),
      );
    });

    // Test 56: getNextLevel returns nLevel+1 when shouldLevelUp
    it('getNextLevel returns nLevel+1 when shouldLevelUp', () => {
      fc.assert(
        fc.property(
          fc.double({ min: SDT_DPRIME_PASS, max: 5, noNaN: true }),
          nLevelArb,
          trialsArb,
          durationArb,
          (dPrime, nLevel, trials, dur) => {
            const runningStats = createRunningStats({}, {}, dPrime);
            const stats = new SessionStats(
              's',
              nLevel,
              trials,
              dur,
              dPrime,
              new Date(),
              runningStats,
            );
            return stats.getNextLevel() === nLevel + 1;
          },
        ),
      );
    });

    // Test 57: getNextLevel returns nLevel-1 when shouldLevelDown (if nLevel > 1)
    it('getNextLevel returns nLevel-1 when shouldLevelDown', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -5, max: SDT_DPRIME_DOWN - 0.01, noNaN: true }),
          fc.integer({ min: 2, max: 20 }),
          trialsArb,
          durationArb,
          (dPrime, nLevel, trials, dur) => {
            const runningStats = createRunningStats({}, {}, dPrime);
            const stats = new SessionStats(
              's',
              nLevel,
              trials,
              dur,
              dPrime,
              new Date(),
              runningStats,
            );
            return stats.getNextLevel() === nLevel - 1;
          },
        ),
      );
    });

    // Test 58: getNextLevel never goes below 1 at nLevel=1
    it('getNextLevel never goes below 1 at nLevel=1', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -5, max: SDT_DPRIME_DOWN - 0.01, noNaN: true }),
          trialsArb,
          durationArb,
          (dPrime, trials, dur) => {
            const runningStats = createRunningStats({}, {}, dPrime);
            const stats = new SessionStats('s', 1, trials, dur, dPrime, new Date(), runningStats);
            return stats.getNextLevel() === 1;
          },
        ),
      );
    });

    // Test 59: formattedDuration is a valid string
    it('formattedDuration is a valid non-empty string', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          return typeof stats.formattedDuration === 'string' && stats.formattedDuration.length > 0;
        }),
      );
    });

    // Test 60: formattedDPrime has one decimal place
    it('formattedDPrime has one decimal place', () => {
      fc.assert(
        fc.property(dPrimeArb, nLevelArb, trialsArb, durationArb, (dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(
            's',
            nLevel,
            trials,
            dur,
            dPrime,
            new Date(),
            runningStats,
          );
          const formatted = stats.formattedDPrime;
          // Check it contains exactly one decimal point and one digit after
          return /^-?\d+\.\d$/.test(formatted);
        }),
      );
    });
  });
});

// =============================================================================
// PART 4: Metric Consistency (5 additional tests)
// =============================================================================

describe('Metric Consistency - Property Tests', () => {
  // Test 61: Higher accuracy always leads to >= zone
  it('higher accuracy leads to higher or equal zone', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        nLevelArb,
        (lowAcc, highAcc, nLevel) => {
          const mLow = computeUnifiedMetrics(lowAcc, nLevel);
          const mHigh = computeUnifiedMetrics(highAcc, nLevel);
          return mHigh.zone >= mLow.zone;
        },
      ),
    );
  });

  // Test 62: Empty stats have zero counts
  it('empty ModalityStatsVO has zero total trials', () => {
    const empty = new ModalityStatsVO(0, 0, 0, 0, null);
    expect(empty.totalTrials).toBe(0);
    expect(empty.accuracy).toBe(0);
    expect(empty.overallAccuracy).toBe(0);
    expect(empty.hitRate).toBe(0);
    expect(empty.falseAlarmRate).toBe(0);
  });

  // Test 63: Round-trip consistency (compute then verify bounds)
  it('computed metrics satisfy all bounds after any input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 2, noNaN: true }),
        fc.integer({ min: -5, max: 25 }),
        (accuracy, nLevel) => {
          const m = computeUnifiedMetrics(accuracy, nLevel);
          return (
            m.accuracy >= 0 &&
            m.accuracy <= 1 &&
            m.nLevel >= 1 &&
            m.zone >= ZONE_MIN &&
            m.zone <= ZONE_MAX &&
            m.zoneProgress >= 0 &&
            m.zoneProgress <= 100
          );
        },
      ),
    );
  });

  // Test 64: Geometric mean accuracy is always between min and max of rates
  it('geometric mean is between min and max of rates', () => {
    fc.assert(
      fc.property(positiveCountArb, countArb, countArb, positiveCountArb, (h, m, fa, cr) => {
        const hitRate = h / (h + m);
        const crRate = cr / (cr + fa);
        const geoMean = computeTempoAccuracy(h, m, fa, cr);
        const minRate = Math.min(hitRate, crRate);
        const maxRate = Math.max(hitRate, crRate);
        // Geometric mean of two positive numbers is always between min and max
        return geoMean >= minRate - 1e-10 && geoMean <= maxRate + 1e-10;
      }),
    );
  });

  // Test 65: SessionStats preserves sessionId
  it('SessionStats preserves sessionId', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        dPrimeArb,
        nLevelArb,
        trialsArb,
        durationArb,
        (id, dPrime, nLevel, trials, dur) => {
          const runningStats = createRunningStats({}, {}, dPrime);
          const stats = new SessionStats(id, nLevel, trials, dur, dPrime, new Date(), runningStats);
          return stats.sessionId === id;
        },
      ),
    );
  });
});
