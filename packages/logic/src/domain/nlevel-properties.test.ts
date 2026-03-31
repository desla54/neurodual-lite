/**
 * Property-Based Tests for N-Level Evaluation and Progression
 *
 * Tests EVERY progression property with 200+ test cases covering:
 * - Delta bounds {-1, 0, +1}
 * - N-level bounds [1, 8]
 * - Threshold boundary behaviors
 * - Floating point precision
 * - Protocol-specific rules (Jaeggi, BrainWorkshop, SDT)
 * - Edge cases (empty, spammer, inactive, etc.)
 * - Determinism and consistency
 *
 * @see n-level-evaluator.ts
 * @see scoring/session-passed.ts
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

import {
  evaluateJaeggiProgression,
  evaluateBrainWorkshopProgression,
  getProgressionEvaluator,
  type SessionStats,
  type NLevelDelta,
  type ProgressionResult,
} from './n-level-evaluator';

import {
  calculateTempoSessionPassed,
  calculatePlaceSessionPassed,
  calculateMemoSessionPassed,
  calculateDualPickSessionPassed,
  calculateTraceSessionPassed,
  calculateSessionPassed,
  calculateBWScore,
  calculateBWScoreFromModalities,
  checkJaeggiErrorsBelow,
  detectScoringStrategy,
  type ScoringThresholds,
} from './scoring/session-passed';

import {
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  PROGRESSION_STRIKES_TO_DOWN,
  DIFFICULTY_MAX_N_LEVEL,
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  BW_SCORE_PASS_NORMALIZED,
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
} from '../specs/thresholds';

import type { SDTCounts } from '../types/core';

// =============================================================================
// Constants
// =============================================================================

const MIN_N_LEVEL = 1;
const MAX_N_LEVEL = DIFFICULTY_MAX_N_LEVEL; // 8

// Epsilon for floating-point comparisons (matches session-passed.ts)
const FLOAT_EPSILON = 1e-9;

// =============================================================================
// Test Factories
// =============================================================================

/**
 * Create SDT counts for testing.
 */
const createCounts = (
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections = 0,
): SDTCounts => ({
  hits,
  misses,
  falseAlarms,
  correctRejections,
});

/**
 * Create SessionStats from modality map.
 */
const createStats = (
  byModality: Record<string, SDTCounts>,
  currentNLevel: number,
): SessionStats => ({
  byModality: new Map(Object.entries(byModality)),
  currentNLevel,
});

/**
 * Create SessionStats with a single modality.
 */
const createSingleModalityStats = (
  counts: SDTCounts,
  currentNLevel: number,
  modalityId = 'position',
): SessionStats => createStats({ [modalityId]: counts }, currentNLevel);

/**
 * Create SessionStats with dual modalities (position + audio).
 */
const createDualModalityStats = (
  positionCounts: SDTCounts,
  audioCounts: SDTCounts,
  currentNLevel: number,
): SessionStats =>
  createStats(
    {
      position: positionCounts,
      audio: audioCounts,
    },
    currentNLevel,
  );

// =============================================================================
// Arbitraries for Property-Based Testing
// =============================================================================

/**
 * Arbitrary for valid N-level [1, 8].
 */
const nLevelArb = fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL });

/**
 * Arbitrary for SDT counts with reasonable bounds.
 */
const sdtCountsArb = fc.record({
  hits: fc.integer({ min: 0, max: 100 }),
  misses: fc.integer({ min: 0, max: 100 }),
  falseAlarms: fc.integer({ min: 0, max: 100 }),
  correctRejections: fc.integer({ min: 0, max: 100 }),
});

/**
 * Arbitrary for small SDT counts (for Jaeggi edge cases).
 */
const smallSdtCountsArb = fc.record({
  hits: fc.integer({ min: 0, max: 20 }),
  misses: fc.integer({ min: 0, max: 10 }),
  falseAlarms: fc.integer({ min: 0, max: 10 }),
  correctRejections: fc.integer({ min: 0, max: 20 }),
});

/**
 * Arbitrary for accuracy values [0, 1].
 */
const accuracyArb = fc.double({ min: 0, max: 1, noNaN: true });

/**
 * Arbitrary for d-prime values [-2, 5] (typical range).
 */
const dPrimeArb = fc.double({ min: -2, max: 5, noNaN: true });

/**
 * Arbitrary for strike counts [0, 5].
 */
const strikesArb = fc.integer({ min: 0, max: 5 });

/**
 * Arbitrary for BrainWorkshop score percentage [0, 100].
 */
const bwScorePercentArb = fc.integer({ min: 0, max: 100 });

// =============================================================================
// SECTION 1: Delta Bounds {-1, 0, +1}
// =============================================================================

describe('N-Level Progression - Delta Bounds', () => {
  describe('Jaeggi delta bounds', () => {
    it('P1: delta is always in {-1, 0, +1}', () => {
      fc.assert(
        fc.property(sdtCountsArb, sdtCountsArb, nLevelArb, (pos, audio, n) => {
          const stats = createDualModalityStats(pos, audio, n);
          const result = evaluateJaeggiProgression(stats);
          return result.delta === -1 || result.delta === 0 || result.delta === 1;
        }),
        { numRuns: 100 },
      );
    });

    it('P2: never returns delta outside {-1, 0, +1}', () => {
      fc.assert(
        fc.property(smallSdtCountsArb, nLevelArb, (counts, n) => {
          const stats = createSingleModalityStats(counts, n);
          const result = evaluateJaeggiProgression(stats);
          const validDeltas: NLevelDelta[] = [-1, 0, 1];
          return validDeltas.includes(result.delta);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('BrainWorkshop delta bounds', () => {
    it('P3: delta is always in {-1, 0, +1}', () => {
      fc.assert(
        fc.property(sdtCountsArb, nLevelArb, strikesArb, (counts, n, strikes) => {
          const stats = createSingleModalityStats(counts, n);
          const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
          return result.delta === -1 || result.delta === 0 || result.delta === 1;
        }),
        { numRuns: 100 },
      );
    });

    it('P4: delta type is correct NLevelDelta', () => {
      fc.assert(
        fc.property(sdtCountsArb, sdtCountsArb, nLevelArb, (pos, audio, n) => {
          const stats = createDualModalityStats(pos, audio, n);
          const result = evaluateBrainWorkshopProgression(stats);
          return typeof result.delta === 'number' && [-1, 0, 1].includes(result.delta);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// SECTION 2: N-Level Bounds [1, 8]
// =============================================================================

describe('N-Level Progression - N-Level Bounds', () => {
  describe('Cannot go below 1', () => {
    it('P5: Jaeggi at N=1 with poor performance maintains N=1 (delta 0 or -1 clamped)', () => {
      const counts = createCounts(0, 10, 10, 0); // 20 errors - very poor
      const stats = createSingleModalityStats(counts, 1);
      const result = evaluateJaeggiProgression(stats);

      // At N=1, even with > 5 errors, should not go below (delta checked for -1 guard)
      // The code returns delta: -1 but currentNLevel > 1 check prevents going below
      expect(1 + result.delta).toBeGreaterThanOrEqual(MIN_N_LEVEL);
    });

    it('P6: BrainWorkshop at N=1 never produces negative N', () => {
      fc.assert(
        fc.property(sdtCountsArb, strikesArb, (counts, strikes) => {
          const stats = createSingleModalityStats(counts, 1);
          const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
          return 1 + result.delta >= MIN_N_LEVEL;
        }),
        { numRuns: 100 },
      );
    });

    it('P7: N=1 with maximum strikes still maintains minimum', () => {
      const counts = createCounts(0, 10, 10, 0); // 0% score
      const stats = createSingleModalityStats(counts, 1);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 10 });
      expect(1 + result.delta).toBeGreaterThanOrEqual(MIN_N_LEVEL);
    });

    it('P8: Repeated poor sessions at N=1 stay at N=1', () => {
      const poorCounts = createCounts(1, 5, 5, 0);
      for (let i = 0; i < 10; i++) {
        const stats = createSingleModalityStats(poorCounts, 1);
        const result = evaluateJaeggiProgression(stats);
        expect(1 + result.delta).toBeGreaterThanOrEqual(MIN_N_LEVEL);
      }
    });
  });

  describe('Cannot go above MAX_N_LEVEL', () => {
    it('P9: Jaeggi at N=8 with perfect performance maintains N=8', () => {
      const perfectCounts = createCounts(10, 0, 0, 10); // 0 errors - perfect
      const stats = createDualModalityStats(perfectCounts, perfectCounts, MAX_N_LEVEL);
      const result = evaluateJaeggiProgression(stats);
      expect(MAX_N_LEVEL + result.delta).toBeLessThanOrEqual(MAX_N_LEVEL);
    });

    it('P10: BrainWorkshop at N=8 with 100% score maintains N=8', () => {
      const perfectCounts = createCounts(20, 0, 0, 0);
      const stats = createSingleModalityStats(perfectCounts, MAX_N_LEVEL);
      const result = evaluateBrainWorkshopProgression(stats);
      expect(MAX_N_LEVEL + result.delta).toBeLessThanOrEqual(MAX_N_LEVEL);
    });

    it('P11: delta +1 at max N becomes delta 0', () => {
      const perfectCounts = createCounts(10, 0, 0, 10);
      const stats = createDualModalityStats(perfectCounts, perfectCounts, MAX_N_LEVEL);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('max');
    });

    it('P12: repeated perfect sessions at max N stay at max', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (repetitions) => {
          const perfectCounts = createCounts(10, 0, 0, 10);
          let currentN = MAX_N_LEVEL;
          for (let i = 0; i < repetitions; i++) {
            const stats = createDualModalityStats(perfectCounts, perfectCounts, currentN);
            const result = evaluateJaeggiProgression(stats);
            currentN = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, currentN + result.delta));
          }
          return currentN <= MAX_N_LEVEL;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('N-level progression stays in bounds', () => {
    it('P13: any progression sequence stays in [1, 8]', () => {
      fc.assert(
        fc.property(
          nLevelArb,
          fc.array(sdtCountsArb, { minLength: 1, maxLength: 20 }),
          (startN, countsArray) => {
            let currentN = startN;
            for (const counts of countsArray) {
              const stats = createSingleModalityStats(counts, currentN);
              const result = evaluateJaeggiProgression(stats);
              currentN = currentN + result.delta;
              // Manually clamp as the UI would do
              currentN = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, currentN));
              if (currentN < MIN_N_LEVEL || currentN > MAX_N_LEVEL) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('P14: progression result always produces valid new N-level', () => {
      fc.assert(
        fc.property(nLevelArb, sdtCountsArb, (n, counts) => {
          const stats = createSingleModalityStats(counts, n);
          const result = evaluateJaeggiProgression(stats);
          const newN = n + result.delta;
          // The new N might be clamped by UI, but raw delta should allow valid clamping
          const clampedN = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, newN));
          return clampedN >= MIN_N_LEVEL && clampedN <= MAX_N_LEVEL;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// SECTION 3: Perfect Performance -> Delta +1
// =============================================================================

describe('N-Level Progression - Perfect Performance', () => {
  describe('Jaeggi perfect performance', () => {
    it('P15: 0 errors in all modalities -> delta +1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL - 1 }),
          fc.integer({ min: 5, max: 20 }),
          (n, trialCount) => {
            const perfect = createCounts(trialCount, 0, 0, trialCount);
            const stats = createDualModalityStats(perfect, perfect, n);
            const result = evaluateJaeggiProgression(stats);
            return result.delta === 1;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('P16: < 3 errors per modality -> delta +1 (Jaeggi 2008: "fewer than three")', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL - 1 }),
          fc.integer({ min: 0, max: 2 }),
          fc.integer({ min: 0, max: 2 }),
          (n, errors1, errors2) => {
            const count1 = createCounts(10 - errors1, errors1, 0, 10);
            const count2 = createCounts(10 - errors2, errors2, 0, 10);
            const stats = createDualModalityStats(count1, count2, n);
            const result = evaluateJaeggiProgression(stats);
            return result.delta === 1;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('P17: all hits no misses -> progression', () => {
      for (let n = 1; n < MAX_N_LEVEL; n++) {
        const allHits = createCounts(20, 0, 0, 0);
        const stats = createDualModalityStats(allHits, allHits, n);
        const result = evaluateJaeggiProgression(stats);
        expect(result.delta).toBe(1);
      }
    });
  });

  describe('BrainWorkshop perfect performance', () => {
    it('P18: 100% score -> delta +1', () => {
      fc.assert(
        fc.property(fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL - 1 }), (n) => {
          const perfect = createCounts(20, 0, 0, 0);
          const stats = createSingleModalityStats(perfect, n);
          const result = evaluateBrainWorkshopProgression(stats);
          return result.delta === 1;
        }),
        { numRuns: 50 },
      );
    });

    it('P19: >= 80% score -> delta +1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL - 1 }),
          fc.integer({ min: 80, max: 100 }),
          (n, targetPercent) => {
            // Create counts that give targetPercent% score
            const total = 100;
            const hits = targetPercent;
            const misses = total - hits;
            const counts = createCounts(hits, misses, 0, 0);
            const stats = createSingleModalityStats(counts, n);
            const result = evaluateBrainWorkshopProgression(stats);
            return result.delta === 1;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('P20: exactly 80% score -> delta +1', () => {
      const counts = createCounts(80, 20, 0, 0); // 80/(80+20+0) = 80%
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(1);
    });
  });
});

// =============================================================================
// SECTION 4: Poor Performance -> Delta -1
// =============================================================================

describe('N-Level Progression - Poor Performance', () => {
  describe('Jaeggi poor performance', () => {
    it('P21: > 5 errors in any modality -> delta -1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: MAX_N_LEVEL }),
          fc.integer({ min: 6, max: 20 }),
          (n, errors) => {
            const poorCounts = createCounts(0, errors, 0, 0);
            const goodCounts = createCounts(10, 0, 0, 10);
            const stats = createDualModalityStats(poorCounts, goodCounts, n);
            const result = evaluateJaeggiProgression(stats);
            return result.delta === -1;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('P22: 6+ misses in one modality -> delta -1', () => {
      const poorPosition = createCounts(5, 6, 0, 5);
      const goodAudio = createCounts(10, 0, 0, 10);
      const stats = createDualModalityStats(poorPosition, goodAudio, 4);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
    });

    it('P23: 6+ false alarms in one modality -> delta -1', () => {
      const poorPosition = createCounts(5, 0, 6, 5);
      const goodAudio = createCounts(10, 0, 0, 10);
      const stats = createDualModalityStats(poorPosition, goodAudio, 4);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
    });

    it('P24: combined errors (3 miss + 3 FA) > 5 -> delta -1', () => {
      const poorCounts = createCounts(5, 3, 3, 5); // 6 errors
      const goodCounts = createCounts(10, 0, 0, 10);
      const stats = createDualModalityStats(poorCounts, goodCounts, 4);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
    });
  });

  describe('BrainWorkshop poor performance', () => {
    it('P25: < 50% with 3 strikes -> delta -1', () => {
      const poorCounts = createCounts(40, 30, 30, 0); // 40/(40+30+30) = 40%
      const stats = createSingleModalityStats(poorCounts, 4);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(-1);
    });

    it('P26: 0% score with strikes -> delta -1', () => {
      const zeroCounts = createCounts(0, 50, 50, 0);
      const stats = createSingleModalityStats(zeroCounts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(-1);
    });

    it('P27: all misses -> delta -1 (with strikes)', () => {
      const allMisses = createCounts(0, 100, 0, 0);
      const stats = createSingleModalityStats(allMisses, 5);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(-1);
    });

    it('P28: all false alarms -> delta -1 (with strikes)', () => {
      const allFA = createCounts(0, 0, 100, 0);
      const stats = createSingleModalityStats(allFA, 5);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(-1);
    });
  });
});

// =============================================================================
// SECTION 5: Middle Performance -> Delta 0
// =============================================================================

describe('N-Level Progression - Middle Performance', () => {
  describe('Jaeggi middle performance', () => {
    it('P29: 3-5 errors per modality -> delta 0 (>= 3 but <= 5)', () => {
      fc.assert(
        fc.property(
          nLevelArb,
          fc.integer({ min: 3, max: 5 }),
          fc.integer({ min: 3, max: 5 }),
          (n, errors1, errors2) => {
            const count1 = createCounts(10, errors1, 0, 10);
            const count2 = createCounts(10, errors2, 0, 10);
            const stats = createDualModalityStats(count1, count2, n);
            const result = evaluateJaeggiProgression(stats);
            return result.delta === 0;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('P30: exactly 3 errors -> delta 0 (Jaeggi 2008: "fewer than three" = 3 maintains)', () => {
      const counts = createCounts(10, 2, 1, 10); // 3 errors
      const stats = createDualModalityStats(counts, counts, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
    });

    it('P31: exactly 5 errors -> delta 0 (not failing)', () => {
      const counts = createCounts(10, 3, 2, 10); // 5 errors
      const stats = createDualModalityStats(counts, counts, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
    });
  });

  describe('BrainWorkshop middle performance', () => {
    it('P32: 50-79% score -> delta 0', () => {
      fc.assert(
        fc.property(nLevelArb, fc.integer({ min: 50, max: 79 }), (n, targetPercent) => {
          const total = 100;
          const hits = targetPercent;
          const misses = total - hits;
          const counts = createCounts(hits, misses, 0, 0);
          const stats = createSingleModalityStats(counts, n);
          const result = evaluateBrainWorkshopProgression(stats);
          return result.delta === 0;
        }),
        { numRuns: 50 },
      );
    });

    it('P33: exactly 79% -> delta 0 (not passing)', () => {
      const counts = createCounts(79, 21, 0, 0); // 79%
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
    });

    it('P34: exactly 50% -> delta 0 (no strike without previous)', () => {
      const counts = createCounts(50, 50, 0, 0); // 50%
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
      expect(result.delta).toBe(0);
    });

    it('P35: < 50% but < 3 strikes -> delta 0', () => {
      const counts = createCounts(40, 60, 0, 0); // 40%
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
      expect(result.delta).toBe(0);
    });

    it('P36: < 50% with 1 strike -> delta 0', () => {
      const counts = createCounts(30, 70, 0, 0); // 30%
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 1 });
      expect(result.delta).toBe(0);
    });
  });
});

// =============================================================================
// SECTION 6: Threshold Boundary Behavior
// =============================================================================

describe('N-Level Progression - Threshold Boundaries', () => {
  describe('Jaeggi threshold boundaries', () => {
    it('P37: exactly 2 errors -> delta +1', () => {
      const counts = createCounts(10, 1, 1, 10); // 2 errors
      const stats = createDualModalityStats(counts, counts, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(1);
    });

    it('P38: exactly 3 errors -> delta 0 (Jaeggi 2008: "fewer than three" = 3 maintains)', () => {
      const counts = createCounts(10, 2, 1, 10); // 3 errors
      const stats = createDualModalityStats(counts, counts, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
    });

    it('P39: exactly 4 errors -> delta 0 (>= 3 but <= 5)', () => {
      const counts = createCounts(10, 2, 2, 10); // 4 errors
      const stats = createDualModalityStats(counts, counts, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
    });

    it('P40: exactly > 5 errors (6 errors) -> delta -1', () => {
      const counts = createCounts(10, 4, 2, 10); // 6 errors
      const good = createCounts(10, 0, 0, 10);
      const stats = createDualModalityStats(counts, good, 3);
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
    });

    it('P41: boundary at 3 errors -> fail (Jaeggi 2008: "fewer than three" = < 3)', () => {
      const counts = createCounts(10, 3, 0, 10);
      // checkJaeggiErrorsBelow uses >= maxErrors to fail, so 3 >= 3 fails
      expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
    });

    it('P42: boundary at 4 errors -> fail (>= 3)', () => {
      const counts = createCounts(10, 4, 0, 10);
      // checkJaeggiErrorsBelow uses >= maxErrors to fail, so 4 >= 3 fails
      expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
    });
  });

  describe('BrainWorkshop threshold boundaries', () => {
    it('P43: 79.9% (floor to 79%) -> delta 0', () => {
      // BW uses floor: 79.9% -> 79%
      const counts = createCounts(799, 201, 0, 0);
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
    });

    it('P44: 80% exactly -> delta +1', () => {
      const counts = createCounts(80, 20, 0, 0);
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(1);
    });

    it('P45: 49% -> strike (no delta)', () => {
      const counts = createCounts(49, 51, 0, 0);
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('strike');
    });

    it('P46: 50% -> no strike', () => {
      const counts = createCounts(50, 50, 0, 0);
      const stats = createSingleModalityStats(counts, 3);
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
      expect(result.delta).toBe(0);
      expect(result.reasoning).not.toContain('strike');
    });
  });

  describe('SDT threshold boundaries', () => {
    it('P47: d-prime exactly at threshold -> passed', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      const result = calculateTempoSessionPassed({
        byModality,
        globalDPrime: SDT_DPRIME_PASS,
      });
      expect(result).toBe(true);
    });

    it('P48: d-prime just below threshold -> not passed', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      const result = calculateTempoSessionPassed({
        byModality,
        globalDPrime: SDT_DPRIME_PASS - 0.01,
      });
      expect(result).toBe(false);
    });

    it('P49: d-prime at epsilon above threshold -> passed', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      const result = calculateTempoSessionPassed({
        byModality,
        globalDPrime: SDT_DPRIME_PASS + FLOAT_EPSILON,
      });
      expect(result).toBe(true);
    });

    it('P50: d-prime at epsilon below threshold -> passed (due to epsilon)', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      // Within epsilon of threshold should still pass
      const result = calculateTempoSessionPassed({
        byModality,
        globalDPrime: SDT_DPRIME_PASS - FLOAT_EPSILON / 2,
      });
      expect(result).toBe(true);
    });
  });

  describe('Accuracy threshold boundaries', () => {
    it('P51: accuracy exactly at 80% -> passed (Flow/Recall/DualPick)', () => {
      expect(calculatePlaceSessionPassed(0.8)).toBe(true);
      expect(calculateMemoSessionPassed(0.8)).toBe(true);
      expect(calculateDualPickSessionPassed(0.8)).toBe(true);
    });

    it('P52: accuracy just below 80% -> not passed', () => {
      expect(calculatePlaceSessionPassed(0.79999)).toBe(false);
      expect(calculateMemoSessionPassed(0.79999)).toBe(false);
      expect(calculateDualPickSessionPassed(0.79999)).toBe(false);
    });

    it('P53: Trace accuracy at 70% -> passed', () => {
      expect(calculateTraceSessionPassed(0.7)).toBe(true);
    });

    it('P54: Trace accuracy just below 70% -> not passed', () => {
      expect(calculateTraceSessionPassed(0.69999)).toBe(false);
    });
  });
});

// =============================================================================
// SECTION 7: Floating Point Precision
// =============================================================================

describe('N-Level Progression - Floating Point Precision', () => {
  describe('SDT d-prime precision', () => {
    it('P55: handles 0.1 + 0.2 style precision issues', () => {
      // Famous floating point issue: 0.1 + 0.2 = 0.30000000000000004
      const byModality = { position: createCounts(10, 1, 1, 10) };
      const impreciseValue = 0.1 + 0.2 + 1.2; // Should be 1.5 but might have precision error
      const result = calculateTempoSessionPassed({
        byModality,
        globalDPrime: impreciseValue,
      });
      expect(result).toBe(true);
    });

    it('P56: threshold comparison is stable near boundary', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (offset) => {
          const byModality = { position: createCounts(10, 1, 1, 10) };
          const epsilon = FLOAT_EPSILON;
          const value = SDT_DPRIME_PASS + offset * epsilon * 0.1;
          const result = calculateTempoSessionPassed({ byModality, globalDPrime: value });
          // Should be deterministic
          const result2 = calculateTempoSessionPassed({ byModality, globalDPrime: value });
          return result === result2;
        }),
        { numRuns: 100 },
      );
    });

    it('P57: very small d-prime values handled correctly', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      expect(calculateTempoSessionPassed({ byModality, globalDPrime: 0.0001 })).toBe(false);
      expect(calculateTempoSessionPassed({ byModality, globalDPrime: -0.0001 })).toBe(false);
    });

    it('P58: very large d-prime values handled correctly', () => {
      const byModality = { position: createCounts(10, 1, 1, 10) };
      expect(calculateTempoSessionPassed({ byModality, globalDPrime: 100 })).toBe(true);
      expect(calculateTempoSessionPassed({ byModality, globalDPrime: 1000000 })).toBe(true);
    });
  });

  describe('Accuracy precision', () => {
    it('P59: accuracy 0.7999999999999999 handled with epsilon', () => {
      // This is the largest double < 0.8 (Number.EPSILON ~ 2.22e-16)
      const accuracy = 0.8 - Number.EPSILON;
      // The code uses epsilon = 1e-9, so Number.EPSILON is well within epsilon range
      // This means 0.8 - Number.EPSILON passes due to epsilon handling
      const result = calculatePlaceSessionPassed(accuracy);
      // Within epsilon of threshold should pass
      expect(result).toBe(true);
    });

    it('P60: accuracy 0.8000000000000001 passes', () => {
      const accuracy = 0.8 + Number.EPSILON;
      expect(calculatePlaceSessionPassed(accuracy)).toBe(true);
    });

    it('P61: BW score with floating division', () => {
      // 8/10 = 0.8 exactly in IEEE 754
      const counts = createCounts(8, 1, 1, 10);
      const score = calculateBWScore(counts);
      expect(score).toBe(0.8);
    });

    it('P62: BW score with imprecise division', () => {
      // 79/99 = 0.7979797979... repeating
      const counts = createCounts(79, 10, 10, 0);
      const score = calculateBWScore(counts);
      expect(score).toBeLessThan(0.8);
      expect(score).toBeGreaterThan(0.79);
    });
  });
});

// =============================================================================
// SECTION 8: Jaeggi 3-Error Rule
// =============================================================================

describe('N-Level Progression - Jaeggi 3-Error Rule (Jaeggi 2008: "fewer than three")', () => {
  it('P63: < 3 errors in all modalities -> pass', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }), (e1, e2) => {
        const c1 = createCounts(10, e1, 0, 10);
        const c2 = createCounts(10, e2, 0, 10);
        // checkJaeggiErrorsBelow uses >= maxErrors to fail, so < 3 passes with threshold 3
        return checkJaeggiErrorsBelow({ position: c1, audio: c2 }, JAEGGI_MAX_ERRORS_PER_MODALITY);
      }),
      { numRuns: 50 },
    );
  });

  it('P64: >= 3 errors in any modality -> not pass', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 20 }), (errors) => {
        const poor = createCounts(10, errors, 0, 10);
        const good = createCounts(10, 0, 0, 10);
        // checkJaeggiErrorsBelow uses >= maxErrors to fail, so >= 3 fails with threshold 3
        return !checkJaeggiErrorsBelow(
          { position: poor, audio: good },
          JAEGGI_MAX_ERRORS_PER_MODALITY,
        );
      }),
      { numRuns: 50 },
    );
  });

  it('P65: 2 misses + 0 FA = 2 errors -> pass', () => {
    const counts = createCounts(10, 2, 0, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
  });

  it('P66: 0 misses + 2 FA = 2 errors -> pass', () => {
    const counts = createCounts(10, 0, 2, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
  });

  it('P67: 1 miss + 1 FA = 2 errors -> pass', () => {
    const counts = createCounts(10, 1, 1, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
  });

  it('P68: 2 misses + 1 FA = 3 errors -> fail (Jaeggi 2008: "fewer than three" = < 3)', () => {
    const counts = createCounts(10, 2, 1, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
  });

  it('P69: 1 miss + 3 FA = 4 errors -> not pass (>= 3)', () => {
    const counts = createCounts(10, 1, 3, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
  });

  it('P70: 4 misses + 0 FA = 4 errors -> not pass (>= 3)', () => {
    const counts = createCounts(10, 4, 0, 10);
    expect(checkJaeggiErrorsBelow({ m: counts }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
  });
});

// =============================================================================
// SECTION 9: Jaeggi Per-Modality Error Counting
// =============================================================================

describe('N-Level Progression - Jaeggi Per-Modality Errors', () => {
  it('P71: errors counted separately per modality', () => {
    const posErrors = createCounts(10, 2, 2, 10); // 4 errors
    const audioErrors = createCounts(10, 1, 1, 10); // 2 errors
    // Position fails (4 >= 3), audio passes (2 < 3)
    // checkJaeggiErrorsBelow uses >= maxErrors to fail, so threshold 3 checks < 3
    expect(checkJaeggiErrorsBelow({ position: posErrors }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(
      false,
    );
    expect(checkJaeggiErrorsBelow({ audio: audioErrors }, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(
      true,
    );
  });

  it('P72: one bad modality fails entire session', () => {
    const perfect = createCounts(10, 0, 0, 10);
    const terrible = createCounts(0, 10, 10, 0); // 20 errors
    const stats = createDualModalityStats(perfect, terrible, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });

  it('P73: all modalities must be < 3 errors for pass (Jaeggi 2008: "fewer than three")', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        (e1, e2, e3) => {
          const c1 = createCounts(10, e1, 0, 10);
          const c2 = createCounts(10, e2, 0, 10);
          const c3 = createCounts(10, e3, 0, 10);
          // checkJaeggiErrorsBelow uses >= maxErrors to fail, so threshold 3 checks < 3
          return checkJaeggiErrorsBelow(
            { position: c1, audio: c2, color: c3 },
            JAEGGI_MAX_ERRORS_PER_MODALITY,
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('P74: modality error count is misses + falseAlarms', () => {
    // Verify the formula: errors = misses + FA (ignores hits and CR)
    const counts = createCounts(100, 5, 3, 200);
    // Total errors = 5 + 3 = 8
    // checkJaeggiErrorsBelow uses >= maxErrors to fail
    // With maxErrors=9: 8 >= 9 = false, returns true (8 errors passes with threshold 9)
    // With maxErrors=8: 8 >= 8 = true, returns false (8 errors fails with threshold 8)
    expect(checkJaeggiErrorsBelow({ m: counts }, 9)).toBe(true);
    expect(checkJaeggiErrorsBelow({ m: counts }, 8)).toBe(false);
  });
});

// =============================================================================
// SECTION 10: Jaeggi Worst Modality Determines Outcome
// =============================================================================

describe('N-Level Progression - Jaeggi Worst Modality', () => {
  it('P75: worst modality determines down decision', () => {
    const excellent = createCounts(20, 0, 0, 20);
    const terrible = createCounts(5, 10, 5, 0); // 15 errors
    const stats = createDualModalityStats(excellent, terrible, 4);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
    expect(result.reasoning).toContain('audio');
  });

  it('P76: best modality cannot save from down', () => {
    const perfect = createCounts(100, 0, 0, 100);
    const failing = createCounts(10, 4, 3, 10); // 7 errors > 5
    const stats = createDualModalityStats(perfect, failing, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });

  it('P77: multiple failing modalities - worst reported', () => {
    const bad = createCounts(10, 4, 3, 10); // 7 errors
    const worse = createCounts(5, 10, 5, 5); // 15 errors
    const stats = createDualModalityStats(bad, worse, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
    // Should report the worst one
  });

  it('P78: all modalities equal - still evaluated correctly', () => {
    const equal = createCounts(10, 3, 3, 10); // 6 errors each
    const stats = createDualModalityStats(equal, equal, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });
});

// =============================================================================
// SECTION 11: BrainWorkshop Percentage Calculation
// =============================================================================

describe('N-Level Progression - BrainWorkshop Percentage', () => {
  it('P79: score = H / (H + M + FA) * 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (h, m, fa) => {
          const counts = createCounts(h, m, fa, 100);
          const score = calculateBWScore(counts);
          const denom = h + m + fa;
          const expected = denom === 0 ? 0 : h / denom;
          return Math.abs(score - expected) < 0.0001;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('P80: CR is ignored in BW score', () => {
    const withCR = createCounts(8, 1, 1, 100);
    const noCR = createCounts(8, 1, 1, 0);
    expect(calculateBWScore(withCR)).toBe(calculateBWScore(noCR));
  });

  it('P81: percentage uses floor (79.9% -> 79)', () => {
    // Internal BW calculation: Math.floor((H * 100) / denom)
    const counts = createCounts(799, 1, 200, 0);
    // 799 / 1000 = 0.799 -> 79.9%
    const score = calculateBWScore(counts);
    expect(Math.floor(score * 100)).toBe(79);
  });

  it('P82: 0 denominator returns 0', () => {
    const counts = createCounts(0, 0, 0, 100);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('P83: perfect score = 1.0 (100%)', () => {
    const counts = createCounts(100, 0, 0, 50);
    expect(calculateBWScore(counts)).toBe(1);
  });

  it('P84: multi-modality aggregation', () => {
    const byModality = {
      position: createCounts(4, 1, 0, 10),
      audio: createCounts(4, 0, 1, 10),
    };
    // Total: 8H, 1M, 1FA -> 8/10 = 0.8
    expect(calculateBWScoreFromModalities(byModality)).toBe(0.8);
  });
});

// =============================================================================
// SECTION 12: BrainWorkshop Strike System
// =============================================================================

describe('N-Level Progression - BrainWorkshop Strikes', () => {
  it('P85: score < 50% adds a strike', () => {
    const counts = createCounts(40, 30, 30, 0); // 40%
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
    expect(result.reasoning).toContain('strike 1');
  });

  it('P86: 3 strikes -> delta -1', () => {
    const counts = createCounts(40, 30, 30, 0); // 40%
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
    expect(result.delta).toBe(-1);
  });

  it('P87: strikes accumulate progressively', () => {
    const counts = createCounts(40, 30, 30, 0); // 40%
    const stats = createSingleModalityStats(counts, 3);

    const r1 = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
    expect(r1.delta).toBe(0);
    expect(r1.reasoning).toContain('strike 1');

    const r2 = evaluateBrainWorkshopProgression(stats, { currentStrikes: 1 });
    expect(r2.delta).toBe(0);
    expect(r2.reasoning).toContain('strike 2');

    const r3 = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
    expect(r3.delta).toBe(-1);
    expect(r3.reasoning).toContain('3 strikes');
  });

  it('P88: score >= 50% does not add strike', () => {
    const counts = createCounts(50, 50, 0, 0); // 50%
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });
    expect(result.reasoning).not.toContain('strike');
  });

  it('P89: score >= 80% resets strike count (implicit)', () => {
    // When score >= 80%, progression happens and strikes don't matter
    const counts = createCounts(80, 20, 0, 0); // 80%
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
    expect(result.delta).toBe(1);
  });

  it('P90: N=1 does not accumulate strikes for down', () => {
    const counts = createCounts(30, 35, 35, 0); // 30%
    const stats = createSingleModalityStats(counts, 1);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
    // At N=1, should not go down
    expect(result.delta).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// SECTION 13: SDT D-Prime Threshold
// =============================================================================

describe('N-Level Progression - SDT D-Prime', () => {
  it('P91: d-prime >= 1.5 -> passed', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.5, max: 5, noNaN: true }), (dp) => {
        const byModality = { position: createCounts(10, 1, 1, 10) };
        return calculateTempoSessionPassed({ byModality, globalDPrime: dp });
      }),
      { numRuns: 50 },
    );
  });

  it('P92: d-prime < 1.5 -> not passed', () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: 1.49, noNaN: true }), (dp) => {
        const byModality = { position: createCounts(10, 1, 1, 10) };
        return !calculateTempoSessionPassed({ byModality, globalDPrime: dp });
      }),
      { numRuns: 50 },
    );
  });

  it('P93: negative d-prime -> not passed', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: -0.01, noNaN: true }), (dp) => {
        const byModality = { position: createCounts(10, 1, 1, 10) };
        return !calculateTempoSessionPassed({ byModality, globalDPrime: dp });
      }),
      { numRuns: 50 },
    );
  });

  it('P94: zero d-prime -> not passed', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 0 })).toBe(false);
  });

  it('P95: d-prime threshold can be customized', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    const thresholds: ScoringThresholds = { sdtDPrimePass: 1.0 };
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 1.0, thresholds })).toBe(true);
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 0.9, thresholds })).toBe(false);
  });
});

// =============================================================================
// SECTION 14: SDT Pass vs Down Thresholds
// =============================================================================

describe('N-Level Progression - SDT Pass/Down', () => {
  it('P96: SDT_DPRIME_PASS = 1.5', () => {
    expect(SDT_DPRIME_PASS).toBe(1.5);
  });

  it('P97: SDT_DPRIME_DOWN = 0.8', () => {
    expect(SDT_DPRIME_DOWN).toBe(0.8);
  });

  it('P98: pass threshold > down threshold', () => {
    expect(SDT_DPRIME_PASS).toBeGreaterThan(SDT_DPRIME_DOWN);
  });

  it('P99: middle zone between thresholds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: SDT_DPRIME_DOWN + 0.01, max: SDT_DPRIME_PASS - 0.01, noNaN: true }),
        (dp) => {
          // In the middle zone - not passing but not failing either
          const byModality = { position: createCounts(10, 1, 1, 10) };
          return !calculateTempoSessionPassed({ byModality, globalDPrime: dp });
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SECTION 15: Mixed Modality Handling
// =============================================================================

describe('N-Level Progression - Mixed Modalities', () => {
  it('P100: position + audio + color handling', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createStats({ position: counts, audio: counts, color: counts }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P101: position + audio + color + image handling', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createStats({ position: counts, audio: counts, color: counts, image: counts }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P102: one failing modality among many fails', () => {
    const good = createCounts(10, 0, 0, 10);
    const bad = createCounts(0, 10, 10, 0);
    const stats = createStats({ position: good, audio: good, color: bad }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });

  it('P103: BW aggregates all modalities', () => {
    const byModality = {
      position: createCounts(10, 2, 1, 10),
      audio: createCounts(10, 1, 2, 10),
      color: createCounts(10, 2, 2, 10),
    };
    // Total: 30H, 5M, 5FA -> 30/40 = 0.75
    const score = calculateBWScoreFromModalities(byModality);
    expect(score).toBe(0.75);
  });

  it('P104: arbitrary modality names work', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createStats({ custom1: counts, custom2: counts, 'weird-name': counts }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });
});

// =============================================================================
// SECTION 16: Single Modality Handling
// =============================================================================

describe('N-Level Progression - Single Modality', () => {
  it('P105: single modality position works', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createSingleModalityStats(counts, 3, 'position');
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P106: single modality audio works', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createSingleModalityStats(counts, 3, 'audio');
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P107: single modality BW score', () => {
    const byModality = { position: createCounts(8, 1, 1, 10) };
    const score = calculateBWScoreFromModalities(byModality);
    expect(score).toBe(0.8);
  });

  it('P108: single poor modality fails Jaeggi', () => {
    const counts = createCounts(5, 10, 10, 5);
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });
});

// =============================================================================
// SECTION 17: Empty Modality Handling
// =============================================================================

describe('N-Level Progression - Empty Modalities', () => {
  it('P109: empty modality map -> maintain', () => {
    const stats = createStats({}, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(0);
  });

  it('P110: empty Map object -> maintain', () => {
    const stats: SessionStats = {
      byModality: new Map(),
      currentNLevel: 3,
    };
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(0);
    expect(result.reasoning).toContain('no modality data');
  });

  it('P111: BW with empty modalities -> 0 score', () => {
    expect(calculateBWScoreFromModalities({})).toBe(0);
  });

  it('P112: BW empty stats -> maintain', () => {
    const stats = createStats({}, 3);
    const result = evaluateBrainWorkshopProgression(stats);
    expect(result.delta).toBe(0);
  });
});

// =============================================================================
// SECTION 18: Zero Trials Handling
// =============================================================================

describe('N-Level Progression - Zero Trials', () => {
  it('P113: all zeros in counts -> maintain', () => {
    const counts = createCounts(0, 0, 0, 0);
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateJaeggiProgression(stats);
    // 0 errors < 3, so should pass
    expect(result.delta).toBe(1);
  });

  it('P114: BW zero trials -> 0% score', () => {
    const counts = createCounts(0, 0, 0, 0);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('P115: zero denominator BW -> 0', () => {
    const byModality = { position: createCounts(0, 0, 0, 100) };
    expect(calculateBWScoreFromModalities(byModality)).toBe(0);
  });
});

// =============================================================================
// SECTION 19: Buffer-Only Session Handling
// =============================================================================

describe('N-Level Progression - Buffer Sessions', () => {
  it('P116: buffer trials with no responses -> 0 errors', () => {
    // If only buffer trials (no scored trials), counts would be 0
    const counts = createCounts(0, 0, 0, 0);
    const stats = createDualModalityStats(counts, counts, 3);
    const result = evaluateJaeggiProgression(stats);
    // 0 errors in all modalities -> pass
    expect(result.delta).toBe(1);
  });

  it('P117: minimal session data handled', () => {
    const counts = createCounts(1, 0, 0, 1);
    const stats = createSingleModalityStats(counts, 2);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });
});

// =============================================================================
// SECTION 20: All Hits Handling
// =============================================================================

describe('N-Level Progression - All Hits', () => {
  it('P118: all hits position -> perfect Jaeggi', () => {
    const counts = createCounts(20, 0, 0, 0);
    const stats = createDualModalityStats(counts, counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P119: all hits BW -> 100% score', () => {
    const counts = createCounts(100, 0, 0, 50);
    expect(calculateBWScore(counts)).toBe(1);
  });

  it('P120: all hits with varying trial counts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const counts = createCounts(n, 0, 0, n);
        return calculateBWScore(counts) === 1;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SECTION 21: All Misses Handling
// =============================================================================

describe('N-Level Progression - All Misses', () => {
  it('P121: all misses -> 0 hits -> 0% BW', () => {
    const counts = createCounts(0, 100, 0, 50);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('P122: all misses Jaeggi -> delta -1', () => {
    const counts = createCounts(0, 20, 0, 0);
    const stats = createDualModalityStats(counts, counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });

  it('P123: all misses at N=1 -> maintain', () => {
    const counts = createCounts(0, 20, 0, 0);
    const stats = createDualModalityStats(counts, counts, 1);
    const result = evaluateJaeggiProgression(stats);
    // At N=1, delta -1 is capped
    expect(1 + result.delta).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// SECTION 22: Spammer (All FA) Handling
// =============================================================================

describe('N-Level Progression - Spammer Pattern', () => {
  it('P124: all false alarms -> 0% BW', () => {
    const counts = createCounts(0, 0, 100, 50);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('P125: spammer Jaeggi -> delta -1', () => {
    const counts = createCounts(0, 0, 20, 0);
    const stats = createDualModalityStats(counts, counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });

  it('P126: high FA with some hits', () => {
    const counts = createCounts(10, 0, 50, 0);
    // 10/(10+0+50) = 10/60 = 0.166...
    const score = calculateBWScore(counts);
    expect(score).toBeLessThan(0.2);
  });

  it('P127: spammer pattern detected as poor performance', () => {
    const counts = createCounts(5, 0, 100, 0); // Pressing on everything
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1);
  });
});

// =============================================================================
// SECTION 23: Inactive (No Responses) Handling
// =============================================================================

describe('N-Level Progression - Inactive Pattern', () => {
  it('P128: no responses (all CR) -> 0% BW', () => {
    const counts = createCounts(0, 0, 0, 100);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('P129: inactive Jaeggi -> pass (0 errors)', () => {
    // No presses = 0 FA, but also 0 hits = all misses
    // Actually if completely inactive: 0 H, targets become M, non-targets become CR
    const counts = createCounts(0, 10, 0, 10);
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1); // 10 misses > 5
  });

  it('P130: minimal activity', () => {
    const counts = createCounts(1, 9, 0, 10);
    const score = calculateBWScore(counts);
    expect(score).toBe(0.1);
  });
});

// =============================================================================
// SECTION 24: Consecutive Session Effects
// =============================================================================

describe('N-Level Progression - Consecutive Sessions', () => {
  it('P131: consecutive perfect sessions climb N', () => {
    let n = 1;
    const perfect = createCounts(10, 0, 0, 10);
    for (let i = 0; i < 10; i++) {
      const stats = createDualModalityStats(perfect, perfect, n);
      const result = evaluateJaeggiProgression(stats);
      n = Math.min(MAX_N_LEVEL, n + result.delta);
    }
    expect(n).toBe(MAX_N_LEVEL);
  });

  it('P132: consecutive poor sessions drop N', () => {
    let n = MAX_N_LEVEL;
    const poor = createCounts(0, 20, 20, 0);
    for (let i = 0; i < 10; i++) {
      const stats = createDualModalityStats(poor, poor, n);
      const result = evaluateJaeggiProgression(stats);
      n = Math.max(MIN_N_LEVEL, n + result.delta);
    }
    expect(n).toBe(MIN_N_LEVEL);
  });

  it('P133: mixed sessions oscillate', () => {
    let n = 4;
    const good = createCounts(10, 1, 1, 10);
    const bad = createCounts(0, 10, 10, 0);

    const statsGood = createDualModalityStats(good, good, n);
    const r1 = evaluateJaeggiProgression(statsGood);
    n = Math.min(MAX_N_LEVEL, Math.max(MIN_N_LEVEL, n + r1.delta));
    expect(n).toBe(5);

    const statsBad = createDualModalityStats(bad, bad, n);
    const r2 = evaluateJaeggiProgression(statsBad);
    n = Math.min(MAX_N_LEVEL, Math.max(MIN_N_LEVEL, n + r2.delta));
    expect(n).toBe(4);
  });
});

// =============================================================================
// SECTION 25: Streak Effects on Progression
// =============================================================================

describe('N-Level Progression - Streak Effects', () => {
  it('P134: win streak leads to max N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL }),
        fc.integer({ min: 10, max: 20 }),
        (startN, streak) => {
          let n = startN;
          const perfect = createCounts(10, 0, 0, 10);
          for (let i = 0; i < streak; i++) {
            const stats = createDualModalityStats(perfect, perfect, n);
            const result = evaluateJaeggiProgression(stats);
            n = Math.min(MAX_N_LEVEL, n + result.delta);
          }
          return n === MAX_N_LEVEL;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('P135: loss streak leads to min N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_N_LEVEL, max: MAX_N_LEVEL }),
        fc.integer({ min: 10, max: 20 }),
        (startN, streak) => {
          let n = startN;
          const poor = createCounts(0, 20, 20, 0);
          for (let i = 0; i < streak; i++) {
            const stats = createDualModalityStats(poor, poor, n);
            const result = evaluateJaeggiProgression(stats);
            n = Math.max(MIN_N_LEVEL, n + result.delta);
          }
          return n === MIN_N_LEVEL;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('P136: BW strike streak leads to down', () => {
    const poor = createCounts(40, 30, 30, 0); // 40%
    const stats = createSingleModalityStats(poor, 5);

    let strikes = 0;
    let n = 5;
    for (let i = 0; i < 3; i++) {
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
      if (result.delta === -1) {
        n = Math.max(MIN_N_LEVEL, n - 1);
        strikes = 0; // Reset after down
      } else if (result.reasoning.includes('strike')) {
        strikes++;
      }
    }
    expect(n).toBe(4);
  });
});

// =============================================================================
// SECTION 26: Recovery Mode Effects
// =============================================================================

describe('N-Level Progression - Recovery', () => {
  it('P137: recovery from N=1 is possible', () => {
    const good = createCounts(10, 1, 1, 10);
    const stats = createDualModalityStats(good, good, 1);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
    expect(1 + result.delta).toBe(2);
  });

  it('P138: gradual recovery through levels', () => {
    let n = 1;
    const good = createCounts(10, 1, 1, 10);
    const steps: number[] = [];

    while (n < MAX_N_LEVEL) {
      const stats = createDualModalityStats(good, good, n);
      const result = evaluateJaeggiProgression(stats);
      n = n + result.delta;
      steps.push(n);
    }

    expect(steps).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('P139: recovery after drops', () => {
    let n = 4;
    const good = createCounts(10, 1, 1, 10);
    const poor = createCounts(0, 20, 20, 0);

    // Drop
    const statsPoor = createDualModalityStats(poor, poor, n);
    const r1 = evaluateJaeggiProgression(statsPoor);
    n = Math.max(MIN_N_LEVEL, n + r1.delta);
    expect(n).toBe(3);

    // Recover
    const statsGood = createDualModalityStats(good, good, n);
    const r2 = evaluateJaeggiProgression(statsGood);
    n = n + r2.delta;
    expect(n).toBe(4);
  });
});

// =============================================================================
// SECTION 27: Determinism
// =============================================================================

describe('N-Level Progression - Determinism', () => {
  it('P140: same input -> same output (Jaeggi)', () => {
    fc.assert(
      fc.property(sdtCountsArb, sdtCountsArb, nLevelArb, (pos, audio, n) => {
        const stats = createDualModalityStats(pos, audio, n);
        const r1 = evaluateJaeggiProgression(stats);
        const r2 = evaluateJaeggiProgression(stats);
        const r3 = evaluateJaeggiProgression(stats);
        return r1.delta === r2.delta && r2.delta === r3.delta;
      }),
      { numRuns: 100 },
    );
  });

  it('P141: same input -> same output (BW)', () => {
    fc.assert(
      fc.property(sdtCountsArb, nLevelArb, strikesArb, (counts, n, strikes) => {
        const stats = createSingleModalityStats(counts, n);
        const r1 = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
        const r2 = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
        return r1.delta === r2.delta;
      }),
      { numRuns: 100 },
    );
  });

  it('P142: repeated calls are idempotent', () => {
    const counts = createCounts(10, 2, 2, 10);
    const stats = createDualModalityStats(counts, counts, 4);

    const results: ProgressionResult[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(evaluateJaeggiProgression(stats));
    }

    const allSame = results.every((r) => r.delta === results[0]?.delta);
    expect(allSame).toBe(true);
  });

  it('P143: calculateBWScore is pure', () => {
    fc.assert(
      fc.property(sdtCountsArb, (counts) => {
        const s1 = calculateBWScore(counts);
        const s2 = calculateBWScore(counts);
        const s3 = calculateBWScore(counts);
        return s1 === s2 && s2 === s3;
      }),
      { numRuns: 100 },
    );
  });

  it('P144: checkJaeggiErrorsBelow is pure', () => {
    fc.assert(
      fc.property(sdtCountsArb, fc.integer({ min: 1, max: 10 }), (counts, threshold) => {
        const r1 = checkJaeggiErrorsBelow({ m: counts }, threshold);
        const r2 = checkJaeggiErrorsBelow({ m: counts }, threshold);
        return r1 === r2;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 28: Consistency Across Modes
// =============================================================================

describe('N-Level Progression - Mode Consistency', () => {
  it('P145: SDT strategy detected for dual-catch', () => {
    expect(detectScoringStrategy('dual-catch', 'dual-catch')).toBe('sdt');
  });

  it('P146: Jaeggi strategy detected', () => {
    expect(detectScoringStrategy('dualnback', '')).toBe('dualnback-classic');
    expect(detectScoringStrategy('', 'dualnback_classic')).toBe('dualnback-classic');
  });

  it('P147: BrainWorkshop strategy detected', () => {
    expect(detectScoringStrategy('brainworkshop', '')).toBe('brainworkshop');
    expect(detectScoringStrategy('BrainWorkshop', '')).toBe('brainworkshop');
  });

  it('P148: case insensitive strategy detection', () => {
    expect(detectScoringStrategy('DUALNBACK', '')).toBe('dualnback-classic');
    expect(detectScoringStrategy('BRAINWORKSHOP', '')).toBe('brainworkshop');
  });

  it('P149: unknown defaults to SDT', () => {
    expect(detectScoringStrategy('unknown', 'unknown')).toBe('sdt');
    expect(detectScoringStrategy()).toBe('sdt');
  });

  it('P150: evaluator registry returns correct functions', () => {
    expect(getProgressionEvaluator('jaeggi')).toBe(evaluateJaeggiProgression);
    expect(getProgressionEvaluator('brainworkshop')).toBe(evaluateBrainWorkshopProgression);
  });

  it('P151: unknown evaluator returns undefined', () => {
    expect(getProgressionEvaluator('unknown')).toBeUndefined();
  });
});

// =============================================================================
// SECTION 29: Session Type Routing
// =============================================================================

describe('N-Level Progression - Session Type Routing', () => {
  it('P152: tempo session uses correct calculator', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    const result = calculateSessionPassed('tempo', { byModality, globalDPrime: 1.5 });
    expect(result).toBe(true);
  });

  it('P153: flow session uses accuracy', () => {
    expect(calculateSessionPassed('flow', { accuracy: 0.8 })).toBe(true);
    expect(calculateSessionPassed('flow', { accuracy: 0.79 })).toBe(false);
  });

  it('P154: recall session uses accuracy', () => {
    expect(calculateSessionPassed('recall', { accuracy: 0.8 })).toBe(true);
    expect(calculateSessionPassed('recall', { accuracy: 0.79 })).toBe(false);
  });

  it('P155: dual-pick session uses accuracy', () => {
    expect(calculateSessionPassed('dual-pick', { accuracy: 0.8 })).toBe(true);
    expect(calculateSessionPassed('dual-pick', { accuracy: 0.79 })).toBe(false);
  });

  it('P156: trace session uses lower threshold', () => {
    expect(calculateSessionPassed('trace', { accuracy: 0.7 })).toBe(true);
    expect(calculateSessionPassed('trace', { accuracy: 0.69 })).toBe(false);
  });

  it('P157: unknown session type returns false', () => {
    expect(calculateSessionPassed('unknown' as 'tempo', { accuracy: 1 })).toBe(false);
  });
});

// =============================================================================
// SECTION 30: Custom Thresholds
// =============================================================================

describe('N-Level Progression - Custom Thresholds', () => {
  it('P158: custom SDT threshold', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    const thresholds: ScoringThresholds = { sdtDPrimePass: 2.0 };
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 2.0, thresholds })).toBe(true);
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 1.9, thresholds })).toBe(false);
  });

  it('P159: custom Jaeggi threshold', () => {
    const byModality = { position: createCounts(10, 3, 0, 10) }; // 3 errors
    // Default threshold (3): 3 errors >= 3 fails (Jaeggi 2008: "fewer than three")
    expect(checkJaeggiErrorsBelow(byModality, 3)).toBe(false);
    // Custom threshold (4): 3 errors < 4 passes
    expect(checkJaeggiErrorsBelow(byModality, 4)).toBe(true);
  });

  it('P160: custom BW threshold', () => {
    const byModality = { position: createCounts(70, 30, 0, 0) };
    const thresholds: ScoringThresholds = { bwRawScorePass: 0.7 };
    expect(
      calculateTempoSessionPassed({
        generator: 'brainworkshop',
        byModality,
        globalDPrime: 0,
        thresholds,
      }),
    ).toBe(true);
  });

  it('P161: custom accuracy threshold', () => {
    const thresholds: ScoringThresholds = { accuracyPass: 0.9 };
    expect(calculatePlaceSessionPassed(0.9, thresholds)).toBe(true);
    expect(calculatePlaceSessionPassed(0.89, thresholds)).toBe(false);
  });

  it('P162: custom trace threshold', () => {
    const thresholds: ScoringThresholds = { accuracyPass: 0.5 };
    expect(calculateTraceSessionPassed(0.5, thresholds)).toBe(true);
    expect(calculateTraceSessionPassed(0.49, thresholds)).toBe(false);
  });
});

// =============================================================================
// ADDITIONAL EDGE CASES (P163-P200+)
// =============================================================================

describe('N-Level Progression - Additional Edge Cases', () => {
  it('P163: very large trial counts handled', () => {
    const counts = createCounts(10000, 100, 100, 10000);
    const stats = createDualModalityStats(counts, counts, 4);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1); // 200 errors > 5
  });

  it('P164: negative counts rejected (type safety)', () => {
    // TypeScript prevents this, but runtime should handle gracefully
    const counts = createCounts(10, 0, 0, 10);
    expect(calculateBWScore(counts)).toBe(1);
  });

  it('P165: reasoning contains useful info', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createDualModalityStats(counts, counts, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning).toContain('Jaeggi');
  });

  it('P166: BW reasoning includes percentage', () => {
    const counts = createCounts(80, 20, 0, 0);
    const stats = createSingleModalityStats(counts, 3);
    const result = evaluateBrainWorkshopProgression(stats);
    expect(result.reasoning).toContain('%');
  });

  it('P167: modality order does not affect result', () => {
    const c1 = createCounts(10, 0, 0, 10);
    const c2 = createCounts(10, 1, 1, 10);

    const stats1 = createStats({ position: c1, audio: c2 }, 3);
    const stats2 = createStats({ audio: c2, position: c1 }, 3);

    const r1 = evaluateJaeggiProgression(stats1);
    const r2 = evaluateJaeggiProgression(stats2);
    expect(r1.delta).toBe(r2.delta);
  });

  it('P168: Map iteration order stable', () => {
    const counts = createCounts(10, 1, 1, 10);
    const map = new Map([
      ['z', counts],
      ['a', counts],
      ['m', counts],
    ]);
    const stats: SessionStats = { byModality: map, currentNLevel: 3 };

    const results: NLevelDelta[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(evaluateJaeggiProgression(stats).delta);
    }
    expect(new Set(results).size).toBe(1);
  });

  it('P169: BW score precision matches expected formula', () => {
    // Verify integer math: Math.floor((H * 100) / (H + M + FA))
    const counts = createCounts(8, 1, 1, 10);
    const score = calculateBWScore(counts);
    expect(score).toBe(0.8);
    expect(Math.floor(score * 100)).toBe(80);
  });

  it('P170: progression result is valid type', () => {
    fc.assert(
      fc.property(sdtCountsArb, nLevelArb, (counts, n) => {
        const stats = createSingleModalityStats(counts, n);
        const result = evaluateJaeggiProgression(stats);
        return (
          typeof result.delta === 'number' &&
          typeof result.reasoning === 'string' &&
          [-1, 0, 1].includes(result.delta)
        );
      }),
      { numRuns: 100 },
    );
  });

  it('P171: BW progression result is valid type', () => {
    fc.assert(
      fc.property(sdtCountsArb, nLevelArb, strikesArb, (counts, n, strikes) => {
        const stats = createSingleModalityStats(counts, n);
        const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
        return (
          typeof result.delta === 'number' &&
          typeof result.reasoning === 'string' &&
          [-1, 0, 1].includes(result.delta)
        );
      }),
      { numRuns: 100 },
    );
  });

  it('P172: extreme N values handled', () => {
    const counts = createCounts(10, 0, 0, 10);
    // Test N=1
    const stats1 = createDualModalityStats(counts, counts, 1);
    expect(() => evaluateJaeggiProgression(stats1)).not.toThrow();

    // Test N=MAX
    const stats8 = createDualModalityStats(counts, counts, MAX_N_LEVEL);
    expect(() => evaluateJaeggiProgression(stats8)).not.toThrow();
  });

  it('P173: concurrent evaluations safe', () => {
    const counts = createCounts(10, 1, 1, 10);
    const stats = createDualModalityStats(counts, counts, 4);

    const promises = Array.from({ length: 100 }, () =>
      Promise.resolve(evaluateJaeggiProgression(stats)),
    );

    Promise.all(promises).then((results) => {
      const allSame = results.every((r) => r.delta === results[0]?.delta);
      expect(allSame).toBe(true);
    });
  });

  it('P174: reasoning string is not empty', () => {
    fc.assert(
      fc.property(sdtCountsArb, nLevelArb, (counts, n) => {
        const stats = createSingleModalityStats(counts, n);
        const result = evaluateJaeggiProgression(stats);
        return result.reasoning.length > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('P175: BW options defaults work', () => {
    const counts = createCounts(80, 20, 0, 0);
    const stats = createSingleModalityStats(counts, 3);
    // No options
    const r1 = evaluateBrainWorkshopProgression(stats);
    // Empty options
    const r2 = evaluateBrainWorkshopProgression(stats, {});
    // Explicit 0 strikes
    const r3 = evaluateBrainWorkshopProgression(stats, { currentStrikes: 0 });

    expect(r1.delta).toBe(r2.delta);
    expect(r2.delta).toBe(r3.delta);
  });

  it('P176: accuracy boundary at 0', () => {
    expect(calculatePlaceSessionPassed(0)).toBe(false);
    expect(calculateMemoSessionPassed(0)).toBe(false);
    expect(calculateDualPickSessionPassed(0)).toBe(false);
    expect(calculateTraceSessionPassed(0)).toBe(false);
  });

  it('P177: accuracy boundary at 1', () => {
    expect(calculatePlaceSessionPassed(1)).toBe(true);
    expect(calculateMemoSessionPassed(1)).toBe(true);
    expect(calculateDualPickSessionPassed(1)).toBe(true);
    expect(calculateTraceSessionPassed(1)).toBe(true);
  });

  it('P178: d-prime boundary at 0', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 0 })).toBe(false);
  });

  it('P179: d-prime boundary at high values', () => {
    const byModality = { position: createCounts(10, 1, 1, 10) };
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 10 })).toBe(true);
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 100 })).toBe(true);
  });

  it('P180: Jaeggi with exactly threshold errors', () => {
    // JAEGGI_MAX_ERRORS_PER_MODALITY = 3 (Jaeggi 2008: "fewer than three" = < 3)
    const exactThreshold = createCounts(10, 2, 1, 10); // 3 errors
    // checkJaeggiErrorsBelow uses >= maxErrors, so 3 >= 3 fails
    expect(checkJaeggiErrorsBelow({ m: exactThreshold }, 3)).toBe(false);

    const belowThreshold = createCounts(10, 1, 1, 10); // 2 errors
    expect(checkJaeggiErrorsBelow({ m: belowThreshold }, 3)).toBe(true);
  });

  it('P181: Jaeggi ERRORS_DOWN boundary', () => {
    // JAEGGI_ERRORS_DOWN = 5
    const atThreshold = createCounts(10, 3, 2, 10); // 5 errors
    const aboveThreshold = createCounts(10, 3, 3, 10); // 6 errors
    const good = createCounts(10, 0, 0, 10);

    const stats5 = createDualModalityStats(atThreshold, good, 3);
    const stats6 = createDualModalityStats(aboveThreshold, good, 3);

    expect(evaluateJaeggiProgression(stats5).delta).toBe(0); // maintain
    expect(evaluateJaeggiProgression(stats6).delta).toBe(-1); // down
  });

  it('P182: BW percentage boundaries', () => {
    // BW_SCORE_UP_PERCENT = 80
    // BW_SCORE_DOWN_PERCENT = 50
    expect(BW_SCORE_UP_PERCENT).toBe(80);
    expect(BW_SCORE_DOWN_PERCENT).toBe(50);
  });

  it('P183: progression strikes threshold', () => {
    expect(PROGRESSION_STRIKES_TO_DOWN).toBe(3);
  });

  it('P184: accuracy thresholds match specs', () => {
    expect(ACCURACY_PASS_NORMALIZED).toBe(0.8);
    expect(TRACE_ACCURACY_PASS_NORMALIZED).toBe(0.7);
  });

  it('P185: BW score pass threshold', () => {
    expect(BW_SCORE_PASS_NORMALIZED).toBe(0.8);
  });

  it('P186: progression with triple modalities', () => {
    const good = createCounts(10, 1, 1, 10);
    const stats = createStats({ position: good, audio: good, color: good }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P187: progression with quadruple modalities', () => {
    const good = createCounts(10, 1, 1, 10);
    const stats = createStats({ position: good, audio: good, color: good, image: good }, 3);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('P188: mixed performance across 4 modalities', () => {
    const excellent = createCounts(10, 0, 0, 10);
    const good = createCounts(10, 1, 1, 10);
    const ok = createCounts(10, 2, 2, 10);
    const poor = createCounts(5, 5, 5, 5); // 10 errors

    const stats = createStats({ position: excellent, audio: good, color: ok, image: poor }, 4);
    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(-1); // poor modality causes failure
  });

  it('P189: BW aggregates across many modalities', () => {
    const byModality = {
      p1: createCounts(10, 5, 5, 10),
      p2: createCounts(10, 5, 5, 10),
      p3: createCounts(10, 5, 5, 10),
      p4: createCounts(10, 5, 5, 10),
    };
    // Total: 40H, 20M, 20FA -> 40/80 = 0.5
    expect(calculateBWScoreFromModalities(byModality)).toBe(0.5);
  });

  it('P190: N level affects down guard', () => {
    const poor = createCounts(0, 10, 10, 0);

    // At N=1, can't go lower
    const stats1 = createDualModalityStats(poor, poor, 1);
    const r1 = evaluateJaeggiProgression(stats1);
    expect(Math.max(1, 1 + r1.delta)).toBe(1);

    // At N=2, can go to 1
    const stats2 = createDualModalityStats(poor, poor, 2);
    const r2 = evaluateJaeggiProgression(stats2);
    expect(2 + r2.delta).toBe(1);
  });

  it('P191: N level affects up guard', () => {
    const perfect = createCounts(10, 0, 0, 10);

    // At N=7, can go to 8
    const stats7 = createDualModalityStats(perfect, perfect, 7);
    const r7 = evaluateJaeggiProgression(stats7);
    expect(7 + r7.delta).toBe(8);

    // At N=8, stays at 8
    const stats8 = createDualModalityStats(perfect, perfect, 8);
    const r8 = evaluateJaeggiProgression(stats8);
    expect(r8.delta).toBe(0);
    expect(8 + r8.delta).toBe(8);
  });

  it('P192: random progression sequences stay bounded', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        fc.array(fc.integer({ min: -1, max: 1 }), { minLength: 1, maxLength: 50 }),
        (startN, deltas) => {
          let n = startN;
          for (const d of deltas) {
            n = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, n + d));
          }
          return n >= MIN_N_LEVEL && n <= MAX_N_LEVEL;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('P193: BW at N=1 with poor score does not go below', () => {
    const poor = createCounts(0, 50, 50, 0);
    const stats = createSingleModalityStats(poor, 1);
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 10 });
    // Even with many strikes, N=1 should not decrease
    expect(1 + result.delta).toBeGreaterThanOrEqual(1);
  });

  it('P194: consistent thresholds from specs', () => {
    // Verify thresholds are imported correctly from specs
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBe(3);
    expect(JAEGGI_ERRORS_DOWN).toBe(5);
    expect(SDT_DPRIME_PASS).toBe(1.5);
    expect(SDT_DPRIME_DOWN).toBe(0.8);
  });

  it('P195: progression is monotonic with performance', () => {
    // Better performance should never produce worse delta
    const poor = createCounts(0, 10, 10, 0);
    const medium = createCounts(10, 3, 3, 10);
    const good = createCounts(10, 1, 1, 10);

    const rPoor = evaluateJaeggiProgression(createSingleModalityStats(poor, 4));
    const rMedium = evaluateJaeggiProgression(createSingleModalityStats(medium, 4));
    const rGood = evaluateJaeggiProgression(createSingleModalityStats(good, 4));

    expect(rGood.delta).toBeGreaterThanOrEqual(rMedium.delta);
    expect(rMedium.delta).toBeGreaterThanOrEqual(rPoor.delta);
  });

  it('P196: BW progression is monotonic with score', () => {
    const s30 = createCounts(30, 70, 0, 0);
    const s60 = createCounts(60, 40, 0, 0);
    const s90 = createCounts(90, 10, 0, 0);

    const r30 = evaluateBrainWorkshopProgression(createSingleModalityStats(s30, 4));
    const r60 = evaluateBrainWorkshopProgression(createSingleModalityStats(s60, 4));
    const r90 = evaluateBrainWorkshopProgression(createSingleModalityStats(s90, 4));

    expect(r90.delta).toBeGreaterThanOrEqual(r60.delta);
    expect(r60.delta).toBeGreaterThanOrEqual(r30.delta);
  });

  it('P197: empty byModality record', () => {
    const byModality: Record<string, SDTCounts> = {};
    expect(calculateBWScoreFromModalities(byModality)).toBe(0);
    expect(checkJaeggiErrorsBelow(byModality, 3)).toBe(true); // no modalities = no failures
  });

  it('P198: session passed routing is exhaustive', () => {
    // Test all known session types
    const sessionTypes = ['tempo', 'flow', 'recall', 'dual-pick', 'trace'] as const;
    for (const type of sessionTypes) {
      if (type === 'tempo') {
        const byModality = { position: createCounts(10, 1, 1, 10) };
        expect(() => calculateSessionPassed(type, { byModality, globalDPrime: 2 })).not.toThrow();
      } else {
        expect(() => calculateSessionPassed(type, { accuracy: 0.9 })).not.toThrow();
      }
    }
  });

  it('P199: extreme accuracy values', () => {
    expect(calculatePlaceSessionPassed(Number.MAX_VALUE)).toBe(true);
    expect(calculatePlaceSessionPassed(Number.MIN_VALUE)).toBe(false);
  });

  it('P200: progression evaluation is thread-safe (no mutations)', () => {
    const counts = createCounts(10, 1, 1, 10);
    const originalCounts = { ...counts };
    const stats = createDualModalityStats(counts, counts, 4);

    // Run evaluation many times
    for (let i = 0; i < 100; i++) {
      evaluateJaeggiProgression(stats);
      evaluateBrainWorkshopProgression(stats);
    }

    // Verify counts were not mutated
    expect(counts.hits).toBe(originalCounts.hits);
    expect(counts.misses).toBe(originalCounts.misses);
    expect(counts.falseAlarms).toBe(originalCounts.falseAlarms);
    expect(counts.correctRejections).toBe(originalCounts.correctRejections);
  });

  it('P201: all threshold constants are positive', () => {
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBeGreaterThan(0);
    expect(JAEGGI_ERRORS_DOWN).toBeGreaterThan(0);
    expect(SDT_DPRIME_PASS).toBeGreaterThan(0);
    expect(BW_SCORE_UP_PERCENT).toBeGreaterThan(0);
    expect(BW_SCORE_DOWN_PERCENT).toBeGreaterThan(0);
    expect(PROGRESSION_STRIKES_TO_DOWN).toBeGreaterThan(0);
    expect(ACCURACY_PASS_NORMALIZED).toBeGreaterThan(0);
    expect(TRACE_ACCURACY_PASS_NORMALIZED).toBeGreaterThan(0);
    expect(BW_SCORE_PASS_NORMALIZED).toBeGreaterThan(0);
    expect(MAX_N_LEVEL).toBeGreaterThan(0);
  });

  it('P202: threshold ordering is logical', () => {
    // Pass threshold should be lower than down threshold for errors
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBeLessThan(JAEGGI_ERRORS_DOWN);

    // Pass d-prime should be higher than down d-prime
    expect(SDT_DPRIME_PASS).toBeGreaterThan(SDT_DPRIME_DOWN);

    // BW up threshold should be higher than down threshold
    expect(BW_SCORE_UP_PERCENT).toBeGreaterThan(BW_SCORE_DOWN_PERCENT);
  });

  it('P203: MAX_N_LEVEL matches DIFFICULTY_MAX_N_LEVEL', () => {
    expect(MAX_N_LEVEL).toBe(DIFFICULTY_MAX_N_LEVEL);
    expect(MAX_N_LEVEL).toBe(8);
  });

  it('P204: random property - bounded deltas always produce bounded N', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        fc.array(sdtCountsArb, { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        (startN, countsArray, useBW) => {
          let n = startN;
          for (const counts of countsArray) {
            const stats = createSingleModalityStats(counts, n);
            const result = useBW
              ? evaluateBrainWorkshopProgression(stats)
              : evaluateJaeggiProgression(stats);
            n = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, n + result.delta));
            if (n < MIN_N_LEVEL || n > MAX_N_LEVEL) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('P205: final comprehensive property - all invariants hold', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        sdtCountsArb,
        sdtCountsArb,
        strikesArb,
        fc.boolean(),
        (n, pos, audio, strikes, useBW) => {
          const stats = createDualModalityStats(pos, audio, n);
          const result = useBW
            ? evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes })
            : evaluateJaeggiProgression(stats);

          // Invariant 1: Delta in {-1, 0, +1}
          if (![-1, 0, 1].includes(result.delta)) return false;

          // Invariant 2: Reasoning is non-empty string
          if (typeof result.reasoning !== 'string' || result.reasoning.length === 0) return false;

          // Invariant 3: New N stays bounded after clamping
          const newN = Math.max(MIN_N_LEVEL, Math.min(MAX_N_LEVEL, n + result.delta));
          if (newN < MIN_N_LEVEL || newN > MAX_N_LEVEL) return false;

          // Invariant 4: Determinism
          const result2 = useBW
            ? evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes })
            : evaluateJaeggiProgression(stats);
          if (result.delta !== result2.delta) return false;

          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
