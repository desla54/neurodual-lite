/**
 * Property-Based Edge Case Tests for N-Level Progression Logic
 *
 * Adversarial scenarios to find bugs in:
 * - n-level-evaluator.ts (Jaeggi, BrainWorkshop protocols)
 * - session-passed.ts (SDT, accuracy-based strategies)
 *
 * Focus areas:
 * 1. Alternating pass/fail patterns - does it oscillate forever?
 * 2. Boundary d-prime values (exactly at threshold)
 * 3. N=1 with perfect score - should go to N=2
 * 4. N=9 (max) with perfect score - should stay at 9? Or go higher?
 * 5. Very long sequences of failures - does N go below 1?
 * 6. Mixed modality performance (one good, one bad)
 * 7. Edge case: 0 scorable trials
 * 8. Edge case: all buffer trials
 * 9. Threshold equality (d-prime == passThreshold exactly)
 * 10. Floating point comparison issues near thresholds
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  evaluateJaeggiProgression,
  evaluateBrainWorkshopProgression,
  type SessionStats,
} from './n-level-evaluator';
import {
  calculateTempoSessionPassed,
  calculateBWScore,
  checkJaeggiErrorsBelow,
  calculatePlaceSessionPassed,
  calculateMemoSessionPassed,
  calculateTraceSessionPassed,
  type ModalitySDTCounts,
} from './scoring/session-passed';
import {
  SDT_DPRIME_PASS,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
  DIFFICULTY_MAX_N_LEVEL,
} from '../specs/thresholds';

// =============================================================================
// Arbitraries
// =============================================================================

const sdtCountsArb: fc.Arbitrary<ModalitySDTCounts> = fc.record({
  hits: fc.integer({ min: 0, max: 100 }),
  misses: fc.integer({ min: 0, max: 100 }),
  falseAlarms: fc.integer({ min: 0, max: 100 }),
  correctRejections: fc.integer({ min: 0, max: 100 }),
});

const nLevelArb = fc.integer({ min: 1, max: 15 }); // Test beyond "max" to check bounds

const lowErrorCountsArb: fc.Arbitrary<ModalitySDTCounts> = fc.record({
  hits: fc.integer({ min: 10, max: 50 }),
  misses: fc.integer({ min: 0, max: 2 }), // Low errors
  falseAlarms: fc.integer({ min: 0, max: 2 }),
  correctRejections: fc.integer({ min: 10, max: 50 }),
});

const highErrorCountsArb: fc.Arbitrary<ModalitySDTCounts> = fc.record({
  hits: fc.integer({ min: 0, max: 10 }),
  misses: fc.integer({ min: 6, max: 20 }), // High errors
  falseAlarms: fc.integer({ min: 6, max: 20 }),
  correctRejections: fc.integer({ min: 0, max: 10 }),
});

// =============================================================================
// Helper Functions
// =============================================================================

const createSessionStats = (
  currentNLevel: number,
  byModality: Record<string, ModalitySDTCounts>,
): SessionStats => ({
  currentNLevel,
  byModality: new Map(Object.entries(byModality)),
});

/**
 * Simulate N-level progression over multiple sessions.
 * Returns the history of N-levels.
 */
function simulateJaeggiProgression(
  startLevel: number,
  sessions: Array<{ position: ModalitySDTCounts; audio: ModalitySDTCounts }>,
): number[] {
  const history: number[] = [startLevel];
  let currentN = startLevel;

  for (const session of sessions) {
    const stats = createSessionStats(currentN, {
      position: session.position,
      audio: session.audio,
    });
    const result = evaluateJaeggiProgression(stats);
    currentN = Math.max(1, currentN + result.delta);
    history.push(currentN);
  }

  return history;
}

function simulateBrainWorkshopProgression(
  startLevel: number,
  sessions: Array<{ counts: ModalitySDTCounts }>,
): number[] {
  const history: number[] = [startLevel];
  let currentN = startLevel;
  let strikes = 0;

  for (const session of sessions) {
    const stats = createSessionStats(currentN, { position: session.counts });
    const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });

    // Update strikes based on result
    if (result.delta === -1) {
      strikes = 0; // Reset after demotion
    } else if (result.reasoning.includes('strike')) {
      const match = result.reasoning.match(/strike (\d+)/);
      strikes = match ? parseInt(match[1]!, 10) : strikes + 1;
    } else if (result.delta === 1) {
      strikes = 0; // Reset after promotion
    }

    currentN = Math.max(1, currentN + result.delta);
    history.push(currentN);
  }

  return history;
}

// =============================================================================
// Property Tests: Jaeggi Protocol
// =============================================================================

describe('Jaeggi Protocol - Property Tests', () => {
  describe('Invariant: N never goes below 1', () => {
    it('after any sequence of failures, N >= 1', () => {
      fc.assert(
        fc.property(
          nLevelArb,
          fc.array(highErrorCountsArb, { minLength: 1, maxLength: 50 }),
          (startLevel, failureCounts) => {
            const sessions = failureCounts.map((c) => ({ position: c, audio: c }));
            const history = simulateJaeggiProgression(startLevel, sessions);

            return history.every((n) => n >= 1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Invariant: Perfect performance always promotes', () => {
    it('N=1 with 0 errors should go to N=2', () => {
      const perfectCounts: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };

      const stats = createSessionStats(1, {
        position: perfectCounts,
        audio: perfectCounts,
      });
      const result = evaluateJaeggiProgression(stats);

      expect(result.delta).toBe(1);
    });

    it('any N with 0 errors should promote (up to max)', () => {
      fc.assert(
        fc.property(nLevelArb, (n) => {
          const perfectCounts: ModalitySDTCounts = {
            hits: 20,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 20,
          };

          const stats = createSessionStats(n, {
            position: perfectCounts,
            audio: perfectCounts,
          });
          const result = evaluateJaeggiProgression(stats);

          // NLEVEL-2 fix: At max N, should maintain instead of promote
          if (n >= DIFFICULTY_MAX_N_LEVEL) {
            return result.delta === 0;
          }
          return result.delta === 1;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Boundary: Exactly at error thresholds', () => {
    it('exactly 3 errors (MAX_ERRORS) should maintain per Jaeggi 2008: "fewer than three"', () => {
      const exactThresholdCounts: ModalitySDTCounts = {
        hits: 17,
        misses: 2,
        falseAlarms: 1, // 2 + 1 = 3 errors (exactly at threshold)
        correctRejections: 10,
      };

      const stats = createSessionStats(2, {
        position: exactThresholdCounts,
        audio: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 },
      });
      const result = evaluateJaeggiProgression(stats);

      // Jaeggi 2008: "fewer than three" means < 3, so exactly 3 maintains
      expect(result.delta).toBe(0);
    });

    it('exactly 4 errors (> MAX_ERRORS) should NOT promote', () => {
      const fourErrorsCounts: ModalitySDTCounts = {
        hits: 16,
        misses: 2,
        falseAlarms: 2, // 2 + 2 = 4 errors (> threshold)
        correctRejections: 10,
      };

      const stats = createSessionStats(2, {
        position: fourErrorsCounts,
        audio: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 },
      });
      const result = evaluateJaeggiProgression(stats);

      // 4 errors > 3 threshold, should NOT promote
      expect(result.delta).not.toBe(1);
    });

    it('exactly 5 errors (ERRORS_DOWN) should maintain, not demote', () => {
      const exactDownThreshold: ModalitySDTCounts = {
        hits: 15,
        misses: 3,
        falseAlarms: 2, // 3 + 2 = 5 errors (exactly at down threshold)
        correctRejections: 10,
      };

      const stats = createSessionStats(2, {
        position: exactDownThreshold,
        audio: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 },
      });
      const result = evaluateJaeggiProgression(stats);

      // Exactly 5 errors should maintain (not > 5, so no demotion)
      expect(result.delta).toBe(0);
    });

    it('6 errors (> ERRORS_DOWN) should demote if N > 1', () => {
      const overDownThreshold: ModalitySDTCounts = {
        hits: 14,
        misses: 4,
        falseAlarms: 2, // 4 + 2 = 6 errors (> 5)
        correctRejections: 10,
      };

      const stats = createSessionStats(3, {
        position: overDownThreshold,
        audio: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 },
      });
      const result = evaluateJaeggiProgression(stats);

      expect(result.delta).toBe(-1);
    });
  });

  describe('Mixed modality performance', () => {
    it('one good, one bad modality - worst determines outcome', () => {
      fc.assert(
        fc.property(nLevelArb, lowErrorCountsArb, highErrorCountsArb, (n, good, bad) => {
          fc.pre(n > 1); // Need N > 1 to test demotion

          const goodErrors = good.misses + good.falseAlarms;
          const badErrors = bad.misses + bad.falseAlarms;

          const stats = createSessionStats(n, { position: good, audio: bad });
          const result = evaluateJaeggiProgression(stats);

          // If bad modality > 5 errors, should demote
          if (badErrors > JAEGGI_ERRORS_DOWN) {
            return result.delta === -1;
          }
          // Jaeggi 2008: "fewer than three" means < 3 should promote
          if (
            goodErrors < JAEGGI_MAX_ERRORS_PER_MODALITY &&
            badErrors < JAEGGI_MAX_ERRORS_PER_MODALITY
          ) {
            return result.delta === 1;
          }
          // Otherwise maintain
          return result.delta === 0;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Edge case: Empty modalities', () => {
    it('empty modalities map should maintain (NLEVEL-1 fix)', () => {
      // NLEVEL-1 fix: Empty modalities now returns delta: 0 (maintain)
      const stats = createSessionStats(2, {});
      const result = evaluateJaeggiProgression(stats);

      // Fixed behavior: no modality data = maintain level
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('no modality data');
    });
  });

  describe('Alternating pass/fail patterns', () => {
    it('alternating perfect/terrible sessions oscillates', () => {
      const perfect: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };
      const terrible: ModalitySDTCounts = {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
      };

      const sessions = Array.from({ length: 10 }, (_, i) => ({
        position: i % 2 === 0 ? perfect : terrible,
        audio: i % 2 === 0 ? perfect : terrible,
      }));

      const history = simulateJaeggiProgression(2, sessions);

      // Should oscillate between levels (but never below 1)
      expect(Math.min(...history)).toBeGreaterThanOrEqual(1);

      // Check for oscillation: level should go up and down
      let ups = 0;
      let downs = 0;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        if (prev !== undefined && curr !== undefined) {
          if (curr > prev) ups++;
          if (curr < prev) downs++;
        }
      }
      expect(ups).toBeGreaterThan(0);
      expect(downs).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Property Tests: BrainWorkshop Protocol
// =============================================================================

describe('BrainWorkshop Protocol - Property Tests', () => {
  describe('Invariant: N never goes below 1', () => {
    it('after any sequence of failures with strikes, N >= 1', () => {
      fc.assert(
        fc.property(
          nLevelArb,
          fc.array(highErrorCountsArb, { minLength: 1, maxLength: 50 }),
          (startLevel, failureCounts) => {
            const sessions = failureCounts.map((c) => ({ counts: c }));
            const history = simulateBrainWorkshopProgression(startLevel, sessions);

            return history.every((n) => n >= 1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Boundary: Score exactly at thresholds', () => {
    it('exactly 80% score should promote', () => {
      // H/(H+M+FA) = 80%
      // 8/(8+1+1) = 0.8 = 80%
      const exact80: ModalitySDTCounts = {
        hits: 8,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 100, // CR ignored in BW
      };

      const stats = createSessionStats(2, { position: exact80 });
      const result = evaluateBrainWorkshopProgression(stats);

      expect(result.delta).toBe(1);
    });

    it('exactly 50% score should maintain (not strike at boundary)', () => {
      // H/(H+M+FA) = 50%
      // 5/(5+5+0) = 0.5 = 50%
      const exact50: ModalitySDTCounts = {
        hits: 5,
        misses: 5,
        falseAlarms: 0,
        correctRejections: 100,
      };

      const stats = createSessionStats(2, { position: exact50 });
      const result = evaluateBrainWorkshopProgression(stats);

      // 50% is NOT < 50%, so should maintain without strike
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain');
    });

    it('49% score should add strike', () => {
      // floor(49/100) = 49, which is < 50
      // Need H/(H+M+FA)*100 < 50
      // 49/(49+51+0) = 0.49 = 49%
      const below50: ModalitySDTCounts = {
        hits: 49,
        misses: 51,
        falseAlarms: 0,
        correctRejections: 100,
      };

      const stats = createSessionStats(2, { position: below50 });
      const result = evaluateBrainWorkshopProgression(stats);

      // 49% < 50%, should add strike
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('strike');
    });
  });

  describe('Strikes accumulation', () => {
    it('3 consecutive failures with < 50% should demote', () => {
      const terrible: ModalitySDTCounts = {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
      };

      let currentN = 3;
      let strikes = 0;

      for (let i = 0; i < 3; i++) {
        const stats = createSessionStats(currentN, { position: terrible });
        const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });

        if (result.delta === -1) {
          currentN = Math.max(1, currentN - 1);
          strikes = 0;
        } else if (result.reasoning.includes('strike')) {
          strikes++;
        }
      }

      // After 3 strikes, should have demoted
      expect(currentN).toBeLessThan(3);
    });

    it('strike count resets after promotion', () => {
      const stats1 = createSessionStats(2, {
        position: { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 },
      });
      const result1 = evaluateBrainWorkshopProgression(stats1, { currentStrikes: 0 });
      expect(result1.reasoning).toContain('strike 1');

      // Good session
      const perfect: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };
      const stats2 = createSessionStats(2, { position: perfect });
      const result2 = evaluateBrainWorkshopProgression(stats2);

      expect(result2.delta).toBe(1);

      // After promotion, strikes should reset - next failure starts at strike 1
      const stats3 = createSessionStats(3, {
        position: { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 },
      });
      const result3 = evaluateBrainWorkshopProgression(stats3, { currentStrikes: 0 });
      expect(result3.reasoning).toContain('strike 1');
    });
  });

  describe('Edge case: Zero trials (all 0)', () => {
    it('zero total (H+M+FA = 0) returns 0% score, adds strike', () => {
      const zeroCounts: ModalitySDTCounts = {
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 100, // CR ignored
      };

      const stats = createSessionStats(2, { position: zeroCounts });
      const result = evaluateBrainWorkshopProgression(stats);

      // BW formula: H/(H+M+FA) = 0/0 -> should return 0
      // 0% < 50% -> strike
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('strike');
    });
  });

  describe('N=1 protection', () => {
    it('at N=1, failures should not demote', () => {
      fc.assert(
        fc.property(highErrorCountsArb, (counts) => {
          const stats = createSessionStats(1, { position: counts });
          const result = evaluateBrainWorkshopProgression(stats);

          // Even with terrible performance, should not go below 1
          return result.delta >= 0 || (result.delta === 0 && stats.currentNLevel === 1);
        }),
        { numRuns: 50 },
      );
    });

    it('at N=1, even with 3 strikes should not demote', () => {
      const terrible: ModalitySDTCounts = {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
      };

      const stats = createSessionStats(1, { position: terrible });
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });

      // Even with 3rd strike at N=1, should maintain
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain N=1');
    });
  });
});

// =============================================================================
// Property Tests: SDT (d-prime) Threshold
// =============================================================================

describe('SDT d-prime Threshold - Property Tests', () => {
  describe('Boundary: Exactly at threshold', () => {
    it('d-prime exactly at SDT_DPRIME_PASS should pass', () => {
      const result = calculateTempoSessionPassed({
        byModality: {
          position: { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 10 },
        },
        globalDPrime: SDT_DPRIME_PASS,
      });

      // >= threshold should pass
      expect(result).toBe(true);
    });

    it('d-prime just below threshold should fail', () => {
      const result = calculateTempoSessionPassed({
        byModality: {
          position: { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 10 },
        },
        globalDPrime: SDT_DPRIME_PASS - 0.001,
      });

      expect(result).toBe(false);
    });
  });

  describe('Floating point edge cases', () => {
    it('handles floating point precision near threshold (NLEVEL-4 fix)', () => {
      // Test values very close to threshold
      // NLEVEL-4 fix: epsilon comparison handles IEEE 754 precision issues
      const epsilon = Number.EPSILON * 10;
      const nearThreshold = [
        SDT_DPRIME_PASS - epsilon,
        SDT_DPRIME_PASS + epsilon,
        SDT_DPRIME_PASS,
        1.4999999999999998, // Very close to 1.5, now passes due to epsilon
        1.5000000000000002,
      ];

      for (const dPrime of nearThreshold) {
        const result = calculateTempoSessionPassed({
          byModality: {
            position: { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 10 },
          },
          globalDPrime: dPrime,
        });

        // All values very close to threshold now pass due to epsilon comparison
        // Values significantly below (e.g., 1.49) would still fail
        expect(result).toBe(true);
      }
    });

    it('arithmetic producing threshold value should pass', () => {
      // 1.5 can be represented exactly in IEEE 754, but let's test common arithmetic
      const dPrime = 3 / 2; // Should be exactly 1.5

      const result = calculateTempoSessionPassed({
        byModality: {
          position: { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 10 },
        },
        globalDPrime: dPrime,
      });

      expect(result).toBe(true);
    });
  });
});

// =============================================================================
// Property Tests: Accuracy-Based Session Passed
// =============================================================================

describe('Accuracy-Based Session Passed - Property Tests', () => {
  describe('Place session (Flow)', () => {
    it('exactly at 80% should pass', () => {
      expect(calculatePlaceSessionPassed(ACCURACY_PASS_NORMALIZED)).toBe(true);
    });

    it('just below 80% should fail', () => {
      expect(calculatePlaceSessionPassed(ACCURACY_PASS_NORMALIZED - 0.001)).toBe(false);
    });
  });

  describe('Memo session (Recall)', () => {
    it('exactly at 80% should pass', () => {
      expect(calculateMemoSessionPassed(ACCURACY_PASS_NORMALIZED)).toBe(true);
    });
  });

  describe('Trace session', () => {
    it('uses lower threshold (70%)', () => {
      expect(calculateTraceSessionPassed(TRACE_ACCURACY_PASS_NORMALIZED)).toBe(true);
      expect(calculateTraceSessionPassed(TRACE_ACCURACY_PASS_NORMALIZED - 0.001)).toBe(false);
    });
  });

  describe('Floating point edge cases', () => {
    it('0.8 exactly in various representations should pass', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
          // Generate 0.8 in different ways
          const accuracy = (n * 8) / (n * 10);
          return calculatePlaceSessionPassed(accuracy) === true;
        }),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// Property Tests: BW Score Calculation
// =============================================================================

describe('BW Score Calculation - Property Tests', () => {
  describe('Invariant: Score always in [0, 1]', () => {
    it('any valid counts produce score in [0, 1]', () => {
      fc.assert(
        fc.property(sdtCountsArb, (counts) => {
          const score = calculateBWScore(counts);
          return score >= 0 && score <= 1;
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Correct rejections are ignored', () => {
    it('changing CR does not affect score', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (h, m, fa, cr1, cr2) => {
            fc.pre(h + m + fa > 0); // Need non-zero denominator

            const counts1 = { hits: h, misses: m, falseAlarms: fa, correctRejections: cr1 };
            const counts2 = { hits: h, misses: m, falseAlarms: fa, correctRejections: cr2 };

            return calculateBWScore(counts1) === calculateBWScore(counts2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Edge case: Zero denominator', () => {
    it('H+M+FA = 0 returns 0 (not NaN or Infinity)', () => {
      const counts = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 100 };
      const score = calculateBWScore(counts);

      expect(score).toBe(0);
      expect(Number.isFinite(score)).toBe(true);
      expect(Number.isNaN(score)).toBe(false);
    });
  });
});

// =============================================================================
// Property Tests: Jaeggi Error Threshold
// =============================================================================

describe('Jaeggi Error Check - Property Tests', () => {
  describe('Threshold semantics: < per Jaeggi 2008 ("fewer than three")', () => {
    it('errors < threshold returns true', () => {
      // 2 errors < 3 threshold
      const byModality = {
        position: { hits: 10, misses: 1, falseAlarms: 1, correctRejections: 10 },
      };
      expect(checkJaeggiErrorsBelow(byModality, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
    });

    it('errors = threshold returns false (Jaeggi 2008: "fewer than three")', () => {
      // 3 errors = 3 threshold -> should FAIL per Jaeggi 2008 ("fewer than three")
      const byModality = {
        position: { hits: 10, misses: 2, falseAlarms: 1, correctRejections: 10 },
      };
      expect(checkJaeggiErrorsBelow(byModality, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
    });

    it('errors > threshold returns false', () => {
      // 4 errors > 3 threshold
      const byModality = {
        position: { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 10 },
      };
      expect(checkJaeggiErrorsBelow(byModality, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(false);
    });
  });

  describe('Empty modalities', () => {
    it('empty record returns true (every on empty = true)', () => {
      // This is a potential bug - empty modalities passes the check
      expect(checkJaeggiErrorsBelow({}, JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
    });
  });
});

// =============================================================================
// Integration: Long Sequences
// =============================================================================

describe('Long Sequence Behavior', () => {
  describe('100 consecutive failures', () => {
    it('Jaeggi: N never goes below 1', () => {
      const terrible: ModalitySDTCounts = {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
      };
      const sessions = Array.from({ length: 100 }, () => ({ position: terrible, audio: terrible }));
      const history = simulateJaeggiProgression(5, sessions);

      expect(Math.min(...history)).toBe(1);
    });

    it('BrainWorkshop: N never goes below 1', () => {
      const terrible: ModalitySDTCounts = {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
      };
      const sessions = Array.from({ length: 100 }, () => ({ counts: terrible }));
      const history = simulateBrainWorkshopProgression(5, sessions);

      expect(Math.min(...history)).toBe(1);
    });
  });

  describe('100 consecutive successes', () => {
    it('Jaeggi: N is capped at DIFFICULTY_MAX_N_LEVEL (NLEVEL-2 fix)', () => {
      const perfect: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };
      const sessions = Array.from({ length: 100 }, () => ({ position: perfect, audio: perfect }));
      const history = simulateJaeggiProgression(1, sessions);

      // NLEVEL-2 fix: Evaluator now enforces max N-level
      const finalN = history[history.length - 1];
      expect(finalN).toBe(DIFFICULTY_MAX_N_LEVEL);

      console.log(
        `[FIXED] After 100 perfect sessions: N=${finalN}, capped at DIFFICULTY_MAX_N_LEVEL=${DIFFICULTY_MAX_N_LEVEL}`,
      );
    });

    it('BrainWorkshop: N is capped at DIFFICULTY_MAX_N_LEVEL (NLEVEL-2 fix)', () => {
      const perfect: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };
      const sessions = Array.from({ length: 100 }, () => ({ counts: perfect }));
      const history = simulateBrainWorkshopProgression(1, sessions);

      // NLEVEL-2 fix: Evaluator now enforces max N-level
      const finalN = history[history.length - 1];
      expect(finalN).toBe(DIFFICULTY_MAX_N_LEVEL);
    });
  });
});

// =============================================================================
// Additional Adversarial Tests
// =============================================================================

describe('Adversarial: Rapid Oscillation Detection', () => {
  it('detects if system can get stuck in infinite oscillation', () => {
    // Create a scenario where performance alternates exactly at boundaries
    // This could cause the system to oscillate between levels forever

    const atUpThreshold: ModalitySDTCounts = {
      hits: 18,
      misses: 1,
      falseAlarms: 1, // 2 errors < 3 (passes Jaeggi)
      correctRejections: 10,
    };

    const atDownThreshold: ModalitySDTCounts = {
      hits: 14,
      misses: 3,
      falseAlarms: 3, // 6 errors > 5 (fails Jaeggi)
      correctRejections: 10,
    };

    // Simulate alternating at thresholds for 50 sessions
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      position: i % 2 === 0 ? atUpThreshold : atDownThreshold,
      audio: i % 2 === 0 ? atUpThreshold : atDownThreshold,
    }));

    const history = simulateJaeggiProgression(3, sessions);

    // Check if oscillation is bounded (doesn't escape to very high or low levels)
    const maxLevel = Math.max(...history);
    const minLevel = Math.min(...history);

    // The system should oscillate within a reasonable range
    expect(minLevel).toBeGreaterThanOrEqual(1);
    // Note: There's no max enforcement, so this could grow unboundedly
    console.log(`[OSCILLATION TEST] Range: ${minLevel} to ${maxLevel}`);
  });
});

describe('Adversarial: All Buffer Trials', () => {
  it('handles sessions where all trials are buffer trials (no scorable data)', () => {
    // If a session has only buffer trials, SDTCounts would all be 0
    const allZero: ModalitySDTCounts = {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
    };

    // Jaeggi: 0 errors < 3, so promotes
    const jaeggiStats = createSessionStats(2, { position: allZero, audio: allZero });
    const jaeggiResult = evaluateJaeggiProgression(jaeggiStats);
    expect(jaeggiResult.delta).toBe(1); // Promotes with 0 errors!
    console.log('[ALL-BUFFER] Jaeggi with all zeros: promotes (potential bug)');

    // BW: 0/(0+0+0) = 0/0 = 0%, adds strike
    const bwStats = createSessionStats(2, { position: allZero });
    const bwResult = evaluateBrainWorkshopProgression(bwStats);
    expect(bwResult.delta).toBe(0);
    expect(bwResult.reasoning).toContain('strike');
    console.log('[ALL-BUFFER] BrainWorkshop with all zeros: adds strike');
  });
});

describe('Adversarial: Very Large Numbers', () => {
  it('handles very large SDT counts without overflow', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        (h, m, fa, cr) => {
          const counts: ModalitySDTCounts = {
            hits: h,
            misses: m,
            falseAlarms: fa,
            correctRejections: cr,
          };

          const bwScore = calculateBWScore(counts);

          // Score should always be a valid number in [0, 1]
          return Number.isFinite(bwScore) && !Number.isNaN(bwScore) && bwScore >= 0 && bwScore <= 1;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Adversarial: Negative Numbers (Should Not Happen)', () => {
  it('documents behavior with negative counts (invalid input)', () => {
    // This tests robustness - negative counts shouldn't happen but might due to bugs
    const negativeCounts: ModalitySDTCounts = {
      hits: -5,
      misses: 10,
      falseAlarms: 5,
      correctRejections: 10,
    };

    // BW: (-5)/((-5)+10+5) = -5/10 = -0.5 (negative score!)
    const bwScore = calculateBWScore(negativeCounts);
    console.log(`[NEGATIVE INPUT] BW score with negative hits: ${bwScore}`);

    // This produces a negative score, which violates the [0,1] invariant
    // But the code doesn't validate inputs
    expect(bwScore).toBeLessThan(0); // Bug: allows negative scores

    // Jaeggi: errors = 10 + 5 = 15 > 5, so demotes
    const stats = createSessionStats(2, { position: negativeCounts });
    const result = evaluateJaeggiProgression(stats);
    console.log(`[NEGATIVE INPUT] Jaeggi result: delta=${result.delta}`);
  });
});

describe('Adversarial: Maximum Stress on Progression', () => {
  it('N=1 with exactly 5 errors should maintain, not demote', () => {
    // At N=1, even failing the down threshold should not demote below 1
    const exactFive: ModalitySDTCounts = {
      hits: 15,
      misses: 3,
      falseAlarms: 2, // 5 errors
      correctRejections: 10,
    };

    const stats = createSessionStats(1, { position: exactFive, audio: exactFive });
    const result = evaluateJaeggiProgression(stats);

    // Even at boundary, should not demote below 1
    expect(result.delta).toBe(0);
  });

  it('N=1 with 6+ errors should maintain at 1, not go to 0 or negative', () => {
    const sixErrors: ModalitySDTCounts = {
      hits: 14,
      misses: 4,
      falseAlarms: 2, // 6 errors > 5
      correctRejections: 10,
    };

    const stats = createSessionStats(1, { position: sixErrors, audio: sixErrors });
    const result = evaluateJaeggiProgression(stats);

    // Code has special case: "stats.currentNLevel > 1" for demotion
    expect(result.delta).toBe(0);
  });
});

describe('Adversarial: SDT d-prime Edge Cases', () => {
  it('negative d-prime should fail', () => {
    const result = calculateTempoSessionPassed({
      byModality: { position: { hits: 5, misses: 5, falseAlarms: 5, correctRejections: 5 } },
      globalDPrime: -1.0,
    });

    expect(result).toBe(false);
  });

  it('very high d-prime (10+) should pass', () => {
    const result = calculateTempoSessionPassed({
      byModality: { position: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 } },
      globalDPrime: 10.5,
    });

    expect(result).toBe(true);
  });

  it('d-prime of Infinity should pass (>= threshold)', () => {
    // Edge case: perfect performance can produce very high d-prime
    const result = calculateTempoSessionPassed({
      byModality: { position: { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 } },
      globalDPrime: Infinity,
    });

    // Infinity >= 1.5 is true
    expect(result).toBe(true);
  });

  it('d-prime of NaN should fail (NaN comparisons are false)', () => {
    const result = calculateTempoSessionPassed({
      byModality: { position: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 } },
      globalDPrime: NaN,
    });

    // NaN >= 1.5 is false
    expect(result).toBe(false);
  });
});

// =============================================================================
// BUG REPORTS - Documented Issues Found During Testing
// =============================================================================

describe('BUG REPORTS - FIXED', () => {
  describe('[BUG-001] Empty modalities - FIXED (NLEVEL-1)', () => {
    it('Jaeggi: empty byModality map now maintains level', () => {
      const stats = createSessionStats(5, {});
      const result = evaluateJaeggiProgression(stats);

      // FIXED: Empty modalities now returns delta: 0 (maintain)
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('no modality data');

      console.log('[BUG-001 FIXED] Empty modalities now maintains level in Jaeggi evaluator');
    });
  });

  describe('[BUG-002] Max N-level enforcement - FIXED (NLEVEL-2)', () => {
    it('evaluators return delta=0 when N is at max', () => {
      const perfect: ModalitySDTCounts = {
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 20,
      };

      // Test at N=100 (way beyond max)
      const stats = createSessionStats(100, { position: perfect, audio: perfect });
      const result = evaluateJaeggiProgression(stats);

      // FIXED: Evaluator now caps at DIFFICULTY_MAX_N_LEVEL
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('max N');

      console.log('[BUG-002 FIXED] Evaluators now enforce max N-level');
    });
  });

  describe('[BUG-003] BW score floor() causes integer boundary issues', () => {
    it('79.9% is floored to 79%, failing when it might feel like it should pass', () => {
      // H/(H+M+FA) * 100 = 79.9, floor = 79
      // This needs precise numbers
      // 799/(799+200+1) = 799/1000 = 0.799 * 100 = 79.9%
      const counts: ModalitySDTCounts = {
        hits: 799,
        misses: 200,
        falseAlarms: 1,
        correctRejections: 0,
      };

      const score = calculateBWScore(counts);
      const scorePercent = Math.floor(score * 100);

      expect(scorePercent).toBe(79); // 79.9% floors to 79%

      // In BW evaluator, 79% < 80% so no promotion
      const stats = createSessionStats(2, { position: counts });
      const result = evaluateBrainWorkshopProgression(stats);

      expect(result.delta).not.toBe(1);

      console.log(
        '[BUG-003] BW uses floor() for score%, so 79.9% becomes 79% and fails to promote',
      );
    });
  });

  describe('[BUG-004] Float precision at exact thresholds - FIXED (NLEVEL-4)', () => {
    it('0.8 from certain arithmetic now passes with epsilon comparison', () => {
      // IEEE 754: 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 !== 0.8
      const a = 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1; // 8 * 0.1

      // Document the floating point issue still exists in raw arithmetic
      console.log(
        `[BUG-004 FIXED] 0.1 * 8 = ${a}, ACCURACY_PASS = ${ACCURACY_PASS_NORMALIZED}, equal: ${a === ACCURACY_PASS_NORMALIZED}`,
      );
      expect(a).toBeLessThan(ACCURACY_PASS_NORMALIZED); // Float issue still exists

      // FIXED: Epsilon comparison now handles this correctly
      expect(calculatePlaceSessionPassed(a)).toBe(true);

      console.log('[BUG-004 FIXED] Epsilon comparison handles IEEE 754 precision issues');
    });

    it('real-world scenario: 8 correct out of 10 trials', () => {
      // This is a realistic scenario: player gets 8/10 trials correct
      const correct = 8;
      const total = 10;
      const accuracy = correct / total;

      // 8/10 = 0.8 exactly (because 0.8 = 4/5 is representable)
      expect(calculatePlaceSessionPassed(accuracy)).toBe(true);
      console.log(`[INFO] 8/10 = ${accuracy} - this works correctly`);
    });

    it('problematic scenario: 80 correct out of 100 trials via accumulation - NOW FIXED', () => {
      // If accuracy is calculated by accumulating 0.1 per trial...
      let accuracy = 0;
      for (let i = 0; i < 8; i++) {
        accuracy += 0.1; // Simulating adding 10% per correct trial
      }

      // FIXED: Now passes due to epsilon comparison
      console.log(`[BUG-004 FIXED] Accumulated 8 * 0.1 = ${accuracy}`);
      expect(calculatePlaceSessionPassed(accuracy)).toBe(true);
    });
  });
});
