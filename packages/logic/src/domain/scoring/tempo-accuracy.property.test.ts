/**
 * Property-Based Tests for Tempo and Scoring Modules
 *
 * Tests invariants and properties using fast-check for:
 * - Tempo accuracy calculations (SDT, Jaeggi, BrainWorkshop)
 * - Tempo confidence scoring
 * - Psychometric score properties
 *
 * @see thresholds.ts for SSOT values
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

import { computeSpecDrivenTempoAccuracy } from './tempo-accuracy';
import { TempoConfidenceCalculator } from './tempo-confidence';
import { PsychometricScore } from './psychometric-score';
import { SDTCalculator } from './helpers/sdt-calculator';
import type { TempoResponseData } from '../../types/ups';
import {
  TEMPO_CONFIDENCE_NEUTRAL,
  TEMPO_CONFIDENCE_WEIGHTS,
  UPS_MIN_TRIALS_FOR_CONFIDENCE,
} from '../../types/ups';
import {
  PSYCHOMETRIC_DPRIME_ELITE,
  PSYCHOMETRIC_DPRIME_ADVANCED,
  PSYCHOMETRIC_DPRIME_INTERMEDIATE,
  PSYCHOMETRIC_SPAM_HIT_RATE,
  PSYCHOMETRIC_SPAM_FA_RATE,
  PSYCHOMETRIC_INACTIVE_HIT_RATE,
  PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD,
  PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD,
} from '../../specs/thresholds';

// =============================================================================
// Arbitrary Generators
// =============================================================================

/**
 * Generate non-negative integers for SDT counts.
 */
const nonNegativeInt = fc.integer({ min: 0, max: 1000 });

/**
 * Generate positive integers (at least 1).
 */
const positiveInt = fc.integer({ min: 1, max: 1000 });

/**
 * Generate valid reaction times in milliseconds (100-5000ms).
 */
const reactionTimeMs = fc.integer({ min: 100, max: 5000 });

/**
 * Generate valid press durations in milliseconds (50-2000ms).
 */
const pressDurationMs = fc.oneof(fc.constant(null), fc.integer({ min: 50, max: 2000 }));

/**
 * Generate response phases.
 */
const responsePhase = fc.constantFrom('during_stimulus', 'after_stimulus') as fc.Arbitrary<
  'during_stimulus' | 'after_stimulus'
>;

/**
 * Generate result types.
 */
const resultType = fc.constantFrom('hit', 'miss', 'falseAlarm', 'correctRejection') as fc.Arbitrary<
  'hit' | 'miss' | 'falseAlarm' | 'correctRejection'
>;

/**
 * Generate modality identifiers.
 */
const modality = fc.constantFrom('position', 'audio');

/**
 * Generate input methods.
 */
const inputMethod = fc.constantFrom('keyboard', 'mouse', 'touch', 'gamepad') as fc.Arbitrary<
  'keyboard' | 'mouse' | 'touch' | 'gamepad'
>;

/**
 * Generate a valid TempoResponseData.
 */
const tempoResponseData: fc.Arbitrary<TempoResponseData> = fc.record({
  trialIndex: nonNegativeInt,
  reactionTimeMs: reactionTimeMs,
  pressDurationMs: pressDurationMs,
  responsePhase: responsePhase,
  result: resultType,
  modality: modality,
  inputMethod: inputMethod,
  cursorTravelDistance: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  responseIndexInTrial: fc.option(fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>, { nil: undefined }),
});

/**
 * Generate an array of TempoResponseData with valid trial indices.
 */
const tempoResponseArray = (minLength: number, maxLength: number) =>
  fc
    .array(tempoResponseData, { minLength, maxLength })
    .map((responses) => responses.map((r, i) => ({ ...r, trialIndex: i })));

/**
 * Generate SDT counts (hits, misses, falseAlarms, correctRejections).
 */
const sdtCounts = fc.record({
  hits: nonNegativeInt,
  misses: nonNegativeInt,
  falseAlarms: nonNegativeInt,
  correctRejections: nonNegativeInt,
});

/**
 * Generate SDT counts ensuring total > 0.
 */
const nonEmptySDTCounts = fc
  .record({
    hits: nonNegativeInt,
    misses: nonNegativeInt,
    falseAlarms: nonNegativeInt,
    correctRejections: nonNegativeInt,
  })
  .filter((c) => c.hits + c.misses + c.falseAlarms + c.correctRejections > 0);

/**
 * Generate valid SDT counts (signal > 0 AND noise > 0).
 */
const validSDTCounts = fc
  .record({
    hits: nonNegativeInt,
    misses: nonNegativeInt,
    falseAlarms: nonNegativeInt,
    correctRejections: nonNegativeInt,
  })
  .filter((c) => c.hits + c.misses > 0 && c.falseAlarms + c.correctRejections > 0);

/**
 * Generate game mode identifiers.
 */
const gameMode = fc.constantFrom(
  'dual-catch',
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-tempo',
  'custom',
  'unknown-mode',
);

// =============================================================================
// PART 1: Tempo Accuracy Invariants (20 tests)
// =============================================================================

describe('Tempo Accuracy Property Tests', () => {
  // ---------------------------------------------------------------------------
  // Range Invariants
  // ---------------------------------------------------------------------------

  test('1. SDT accuracy is always in [0, 1]', () => {
    fc.assert(
      fc.property(sdtCounts, (counts) => {
        const accuracy = computeSpecDrivenTempoAccuracy(
          'dual-catch', // SDT mode
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('2. Jaeggi accuracy is always in [0, 1]', () => {
    fc.assert(
      fc.property(sdtCounts, (counts) => {
        const accuracy = computeSpecDrivenTempoAccuracy(
          'dualnback-classic', // Jaeggi mode
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('3. BrainWorkshop accuracy is always in [0, 1]', () => {
    fc.assert(
      fc.property(sdtCounts, (counts) => {
        const accuracy = computeSpecDrivenTempoAccuracy(
          'sim-brainworkshop', // BW mode
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('4. All game modes produce accuracy in [0, 1]', () => {
    fc.assert(
      fc.property(gameMode, sdtCounts, (mode, counts) => {
        const accuracy = computeSpecDrivenTempoAccuracy(
          mode,
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  // ---------------------------------------------------------------------------
  // Zero Case Handling
  // ---------------------------------------------------------------------------

  test('5. Empty counts (all zeros) return accuracy 0', () => {
    fc.assert(
      fc.property(gameMode, (mode) => {
        const accuracy = computeSpecDrivenTempoAccuracy(mode, 0, 0, 0, 0);
        expect(accuracy).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test('6. No signal trials (hits=0, misses=0) returns 0 for SDT', () => {
    fc.assert(
      fc.property(nonNegativeInt, nonNegativeInt, (fa, cr) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 0, 0, fa, cr);
        expect(accuracy).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  test('7. No noise trials (FA=0, CR=0) returns 0 for SDT', () => {
    fc.assert(
      fc.property(nonNegativeInt, nonNegativeInt, (hits, misses) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', hits, misses, 0, 0);
        expect(accuracy).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Monotonicity Properties
  // ---------------------------------------------------------------------------

  test('8. SDT: More hits (same FA) increases accuracy', () => {
    fc.assert(
      fc.property(
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        (hits, misses, fa, cr, extraHits) => {
          const acc1 = computeSpecDrivenTempoAccuracy('dual-catch', hits, misses, fa, cr);
          const acc2 = computeSpecDrivenTempoAccuracy(
            'dual-catch',
            hits + extraHits,
            misses,
            fa,
            cr,
          );
          // More hits means higher hit rate, which should increase or maintain accuracy
          expect(acc2).toBeGreaterThanOrEqual(acc1 - 0.001); // Allow small floating point variance
        },
      ),
      { numRuns: 300 },
    );
  });

  test('9. SDT: More correct rejections (same hits) increases accuracy', () => {
    fc.assert(
      fc.property(
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        (hits, misses, fa, cr, extraCR) => {
          const acc1 = computeSpecDrivenTempoAccuracy('dual-catch', hits, misses, fa, cr);
          const acc2 = computeSpecDrivenTempoAccuracy('dual-catch', hits, misses, fa, cr + extraCR);
          expect(acc2).toBeGreaterThanOrEqual(acc1 - 0.001);
        },
      ),
      { numRuns: 300 },
    );
  });

  test('10. BW: More hits (same errors) increases accuracy', () => {
    fc.assert(
      fc.property(
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        (hits, misses, fa, extraHits) => {
          const acc1 = computeSpecDrivenTempoAccuracy('sim-brainworkshop', hits, misses, fa, 0);
          const acc2 = computeSpecDrivenTempoAccuracy(
            'sim-brainworkshop',
            hits + extraHits,
            misses,
            fa,
            0,
          );
          expect(acc2).toBeGreaterThanOrEqual(acc1 - 0.001);
        },
      ),
      { numRuns: 300 },
    );
  });

  test('11. Jaeggi: Fewer errors increases accuracy', () => {
    fc.assert(
      fc.property(
        positiveInt,
        positiveInt,
        positiveInt,
        positiveInt,
        (hits, misses, fa, fewerErrors) => {
          fc.pre(misses >= fewerErrors || fa >= fewerErrors);
          const acc1 = computeSpecDrivenTempoAccuracy('dualnback-classic', hits, misses, fa, 0);
          const newMisses = misses >= fewerErrors ? misses - fewerErrors : misses;
          const newFA = fa >= fewerErrors && misses < fewerErrors ? fa - fewerErrors : fa;
          const acc2 = computeSpecDrivenTempoAccuracy(
            'dualnback-classic',
            hits,
            newMisses,
            newFA,
            0,
          );
          expect(acc2).toBeGreaterThanOrEqual(acc1 - 0.001);
        },
      ),
      { numRuns: 300 },
    );
  });

  // ---------------------------------------------------------------------------
  // Perfect Score Cases
  // ---------------------------------------------------------------------------

  test('12. Perfect performance (all hits, all CR) gives accuracy 1 for SDT', () => {
    fc.assert(
      fc.property(positiveInt, positiveInt, (hits, cr) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', hits, 0, 0, cr);
        expect(accuracy).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  test('13. Perfect performance (all hits, no FA) gives accuracy 1 for BW', () => {
    fc.assert(
      fc.property(positiveInt, (hits) => {
        const accuracy = computeSpecDrivenTempoAccuracy('sim-brainworkshop', hits, 0, 0, 0);
        expect(accuracy).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  test('14. Perfect Jaeggi performance (no errors) gives accuracy 1', () => {
    fc.assert(
      fc.property(positiveInt, (hits) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dualnback-classic', hits, 0, 0, 0);
        expect(accuracy).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Worst Case Handling
  // ---------------------------------------------------------------------------

  test('15. All misses (hits=0) returns 0 for SDT', () => {
    fc.assert(
      fc.property(positiveInt, positiveInt, positiveInt, (misses, fa, cr) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 0, misses, fa, cr);
        expect(accuracy).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  test('16. All FA (cr=0) returns 0 for SDT', () => {
    fc.assert(
      fc.property(positiveInt, positiveInt, positiveInt, (hits, misses, fa) => {
        const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', hits, misses, fa, 0);
        expect(accuracy).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Symmetry and Consistency
  // ---------------------------------------------------------------------------

  test('17. Accuracy is deterministic (same inputs = same output)', () => {
    fc.assert(
      fc.property(gameMode, sdtCounts, (mode, counts) => {
        const acc1 = computeSpecDrivenTempoAccuracy(
          mode,
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        const acc2 = computeSpecDrivenTempoAccuracy(
          mode,
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(acc1).toBe(acc2);
      }),
      { numRuns: 200 },
    );
  });

  test('18. Unknown game modes fall back to SDT strategy', () => {
    fc.assert(
      fc.property(validSDTCounts, (counts) => {
        const sdtAccuracy = computeSpecDrivenTempoAccuracy(
          'dual-catch',
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        const unknownAccuracy = computeSpecDrivenTempoAccuracy(
          'non-existent-mode-xyz',
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(unknownAccuracy).toBe(sdtAccuracy);
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Non-negative input validation
  // ---------------------------------------------------------------------------

  test('19. Accuracy calculation handles large values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10000, max: 100000 }),
        fc.integer({ min: 10000, max: 100000 }),
        fc.integer({ min: 10000, max: 100000 }),
        fc.integer({ min: 10000, max: 100000 }),
        gameMode,
        (hits, misses, fa, cr, mode) => {
          const accuracy = computeSpecDrivenTempoAccuracy(mode, hits, misses, fa, cr);
          expect(accuracy).toBeGreaterThanOrEqual(0);
          expect(accuracy).toBeLessThanOrEqual(1);
          expect(Number.isFinite(accuracy)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('20. Accuracy is always a finite number', () => {
    fc.assert(
      fc.property(gameMode, sdtCounts, (mode, counts) => {
        const accuracy = computeSpecDrivenTempoAccuracy(
          mode,
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(Number.isFinite(accuracy)).toBe(true);
        expect(Number.isNaN(accuracy)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// PART 2: Confidence Scoring (15 tests)
// =============================================================================

describe('Tempo Confidence Property Tests', () => {
  // ---------------------------------------------------------------------------
  // Range Invariants
  // ---------------------------------------------------------------------------

  test('21. Confidence score is always in [0, 100]', () => {
    fc.assert(
      fc.property(tempoResponseArray(0, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300 },
    );
  });

  test('22. All confidence components are in [0, 100]', () => {
    fc.assert(
      fc.property(tempoResponseArray(10, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        expect(result.components.timingDiscipline).toBeGreaterThanOrEqual(0);
        expect(result.components.timingDiscipline).toBeLessThanOrEqual(100);
        expect(result.components.rtStability).toBeGreaterThanOrEqual(0);
        expect(result.components.rtStability).toBeLessThanOrEqual(100);
        expect(result.components.pressStability).toBeGreaterThanOrEqual(0);
        expect(result.components.pressStability).toBeLessThanOrEqual(100);
        expect(result.components.errorAwareness).toBeGreaterThanOrEqual(0);
        expect(result.components.errorAwareness).toBeLessThanOrEqual(100);
        expect(result.components.focusScore).toBeGreaterThanOrEqual(0);
        expect(result.components.focusScore).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300 },
    );
  });

  // ---------------------------------------------------------------------------
  // Insufficient Data Handling
  // ---------------------------------------------------------------------------

  test('23. Empty responses return neutral score with hasEnoughData=false', () => {
    const result = TempoConfidenceCalculator.calculate([]);
    expect(result.hasEnoughData).toBe(false);
    expect(result.score).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  test('24. Insufficient responses return neutral components', () => {
    fc.assert(
      fc.property(tempoResponseArray(0, UPS_MIN_TRIALS_FOR_CONFIDENCE - 1), (responses) => {
        // Filter to ensure we have truly insufficient valid responses
        const validResponses = responses.filter(
          (r) => Number.isFinite(r.reactionTimeMs) && r.reactionTimeMs > 0,
        );
        if (validResponses.length < UPS_MIN_TRIALS_FOR_CONFIDENCE) {
          const result = TempoConfidenceCalculator.calculate(validResponses);
          expect(result.hasEnoughData).toBe(false);
          expect(result.components.timingDiscipline).toBe(TEMPO_CONFIDENCE_NEUTRAL);
          expect(result.components.rtStability).toBe(TEMPO_CONFIDENCE_NEUTRAL);
        }
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Timing Discipline Properties
  // ---------------------------------------------------------------------------

  test('25. All responses during stimulus gives low timing discipline', () => {
    fc.assert(
      fc.property(fc.integer({ min: UPS_MIN_TRIALS_FOR_CONFIDENCE, max: 30 }), (count) => {
        const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
          trialIndex: i,
          reactionTimeMs: 300,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus' as const,
          result: 'hit' as const,
          modality: 'position',
          inputMethod: 'keyboard' as const,
        }));
        const result = TempoConfidenceCalculator.calculate(responses);
        // All early responses = 0% timing discipline
        expect(result.components.timingDiscipline).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  test('26. All responses after stimulus gives perfect timing discipline', () => {
    fc.assert(
      fc.property(fc.integer({ min: UPS_MIN_TRIALS_FOR_CONFIDENCE, max: 30 }), (count) => {
        const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
          trialIndex: i,
          reactionTimeMs: 600,
          pressDurationMs: 100,
          responsePhase: 'after_stimulus' as const,
          result: 'hit' as const,
          modality: 'position',
          inputMethod: 'keyboard' as const,
        }));
        const result = TempoConfidenceCalculator.calculate(responses);
        expect(result.components.timingDiscipline).toBe(100);
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // RT Stability Properties
  // ---------------------------------------------------------------------------

  test('27. Constant RTs give high stability score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 800 }),
        fc.integer({ min: 10, max: 30 }),
        (rt, count) => {
          const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
            trialIndex: i,
            reactionTimeMs: rt, // All same RT
            pressDurationMs: 100,
            responsePhase: 'after_stimulus' as const,
            result: 'hit' as const,
            modality: 'position',
            inputMethod: 'keyboard' as const,
          }));
          const result = TempoConfidenceCalculator.calculate(responses);
          // CV = 0 for constant values, so stability should be 100
          expect(result.components.rtStability).toBe(100);
        },
      ),
      { numRuns: 50 },
    );
  });

  test('28. Highly variable RTs give lower stability score', () => {
    fc.assert(
      fc.property(fc.integer({ min: 15, max: 30 }), (count) => {
        const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
          trialIndex: i,
          reactionTimeMs: 200 + i * 200, // Increasing RTs: 200, 400, 600, ...
          pressDurationMs: 100,
          responsePhase: 'after_stimulus' as const,
          result: 'hit' as const,
          modality: 'position',
          inputMethod: 'keyboard' as const,
        }));
        const result = TempoConfidenceCalculator.calculate(responses);
        // High variance = lower stability
        expect(result.components.rtStability).toBeLessThan(100);
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // Error Awareness Properties
  // ---------------------------------------------------------------------------

  test('29. Perfect accuracy (no errors) gives high error awareness (inhibition)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 30 }), (count) => {
        const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
          trialIndex: i,
          reactionTimeMs: 500,
          pressDurationMs: 100,
          responsePhase: 'after_stimulus' as const,
          result: 'hit' as const, // All hits = no errors
          modality: 'position',
          inputMethod: 'keyboard' as const,
        }));
        const result = TempoConfidenceCalculator.calculate(responses);
        expect(result.components.errorAwareness).toBe(100);
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // Focus Score Properties
  // ---------------------------------------------------------------------------

  test('30. Consistent RTs (no lapses) give high focus score', () => {
    fc.assert(
      fc.property(fc.integer({ min: 15, max: 30 }), (count) => {
        const baseRT = 500;
        const responses: TempoResponseData[] = Array.from({ length: count }, (_, i) => ({
          trialIndex: i,
          reactionTimeMs: baseRT + (i % 3) * 10, // Small variance around 500ms
          pressDurationMs: 100,
          responsePhase: 'after_stimulus' as const,
          result: 'hit' as const,
          modality: 'position',
          inputMethod: 'keyboard' as const,
        }));
        const result = TempoConfidenceCalculator.calculate(responses);
        // No lapses (all RTs within 2.5x median) = 100 focus
        expect(result.components.focusScore).toBe(100);
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // Weight Sum Property
  // ---------------------------------------------------------------------------

  test('31. Confidence weights sum to 1.0', () => {
    const sum =
      TEMPO_CONFIDENCE_WEIGHTS.timingDiscipline +
      TEMPO_CONFIDENCE_WEIGHTS.rtStability +
      TEMPO_CONFIDENCE_WEIGHTS.pressStability +
      TEMPO_CONFIDENCE_WEIGHTS.errorAwareness +
      TEMPO_CONFIDENCE_WEIGHTS.focusScore;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  test('32. Confidence calculation is deterministic', () => {
    fc.assert(
      fc.property(tempoResponseArray(5, 30), (responses) => {
        const result1 = TempoConfidenceCalculator.calculate(responses);
        const result2 = TempoConfidenceCalculator.calculate(responses);
        expect(result1.score).toBe(result2.score);
        expect(result1.components).toEqual(result2.components);
        expect(result1.hasEnoughData).toBe(result2.hasEnoughData);
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Debug Method Consistency
  // ---------------------------------------------------------------------------

  test('33. calculateWithDebug returns same score as calculate', () => {
    fc.assert(
      fc.property(tempoResponseArray(5, 30), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        const debugResult = TempoConfidenceCalculator.calculateWithDebug(responses);
        expect(debugResult.score).toBe(result.score);
        expect(debugResult.hasEnoughData).toBe(result.hasEnoughData);
        expect(debugResult.components.timingDiscipline).toBe(result.components.timingDiscipline);
      }),
      { numRuns: 100 },
    );
  });

  test('34. calculateScore returns null when insufficient data', () => {
    const responses: TempoResponseData[] = [];
    const score = TempoConfidenceCalculator.calculateScore(responses);
    expect(score).toBeNull();
  });

  test('35. calculateScore matches calculate().score when sufficient data', () => {
    fc.assert(
      fc.property(tempoResponseArray(10, 30), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        const score = TempoConfidenceCalculator.calculateScore(responses);
        if (result.hasEnoughData) {
          expect(score).toBe(result.score);
        } else {
          expect(score).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// PART 3: Psychometric Properties (15 tests)
// =============================================================================

describe('Psychometric Score Property Tests', () => {
  // ---------------------------------------------------------------------------
  // Range Invariants
  // ---------------------------------------------------------------------------

  test('36. Hit rate is always in [0, 1]', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(score.hitRate).toBeGreaterThanOrEqual(0);
        expect(score.hitRate).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('37. False alarm rate is always in [0, 1]', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(score.falseAlarmRate).toBeGreaterThanOrEqual(0);
        expect(score.falseAlarmRate).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('38. Accuracy is always in [0, 1]', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(score.accuracy).toBeGreaterThanOrEqual(0);
        expect(score.accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  test('39. d-prime is always finite', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(Number.isFinite(score.dPrime)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test('40. Criterion is always finite', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(Number.isFinite(score.criterion)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test('41. Beta is always positive or zero', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(score.beta).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  // ---------------------------------------------------------------------------
  // Tier Classification
  // ---------------------------------------------------------------------------

  test('42. Performance tier is always valid', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(['novice', 'intermediate', 'advanced', 'elite']).toContain(score.tier);
      }),
      { numRuns: 500 },
    );
  });

  test('43. Higher d-prime corresponds to higher tier', () => {
    // Elite tier
    const eliteScore = new PsychometricScore(100, 0, 0, 100);
    expect(eliteScore.dPrime).toBeGreaterThanOrEqual(PSYCHOMETRIC_DPRIME_ELITE);
    expect(eliteScore.tier).toBe('elite');

    // Test tier boundaries
    expect(PSYCHOMETRIC_DPRIME_ELITE).toBeGreaterThan(PSYCHOMETRIC_DPRIME_ADVANCED);
    expect(PSYCHOMETRIC_DPRIME_ADVANCED).toBeGreaterThan(PSYCHOMETRIC_DPRIME_INTERMEDIATE);
  });

  // ---------------------------------------------------------------------------
  // Gaming Detection
  // ---------------------------------------------------------------------------

  test('44. Spamming detection: high hit rate AND high FA rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 96, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 51, max: 100 }),
        fc.integer({ min: 0, max: 49 }),
        (hits, misses, fa, cr) => {
          // Ensure rates exceed thresholds
          const totalSignal = hits + misses;
          const totalNoise = fa + cr;
          fc.pre(totalSignal > 0 && totalNoise > 0);
          fc.pre(hits / totalSignal > PSYCHOMETRIC_SPAM_HIT_RATE);
          fc.pre(fa / totalNoise > PSYCHOMETRIC_SPAM_FA_RATE);

          const score = new PsychometricScore(hits, misses, fa, cr);
          expect(score.isSpamming()).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('45. Inactive detection: very low hit rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 95, max: 100 }),
        nonNegativeInt,
        nonNegativeInt,
        (hits, misses, fa, cr) => {
          const totalSignal = hits + misses;
          fc.pre(totalSignal > 0);
          fc.pre(hits / totalSignal < PSYCHOMETRIC_INACTIVE_HIT_RATE);

          const score = new PsychometricScore(hits, misses, fa, cr);
          expect(score.isInactive()).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('46. Reliable scores are not gaming', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        // isReliable = !isSpamming AND !isInactive
        expect(score.isReliable()).toBe(!score.isGaming());
        expect(score.isGaming()).toBe(score.isSpamming() || score.isInactive());
      }),
      { numRuns: 300 },
    );
  });

  // ---------------------------------------------------------------------------
  // Bias Detection
  // ---------------------------------------------------------------------------

  test('47. Bias description is always valid', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        expect(['liberal', 'neutral', 'conservative']).toContain(score.getBiasDescription());
      }),
      { numRuns: 500 },
    );
  });

  test('48. Bias thresholds are symmetric around zero', () => {
    expect(PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD).toBe(-PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD);
  });

  // ---------------------------------------------------------------------------
  // Factory and Formatting
  // ---------------------------------------------------------------------------

  test('49. Factory method produces same result as constructor', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const fromConstructor = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        const fromFactory = PsychometricScore.from(counts);
        expect(fromFactory.dPrime).toBe(fromConstructor.dPrime);
        expect(fromFactory.hitRate).toBe(fromConstructor.hitRate);
        expect(fromFactory.tier).toBe(fromConstructor.tier);
      }),
      { numRuns: 200 },
    );
  });

  test('50. Formatted accuracy is valid percentage string', () => {
    fc.assert(
      fc.property(nonEmptySDTCounts, (counts) => {
        const score = new PsychometricScore(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );
        const formatted = score.formattedAccuracy;
        expect(formatted).toMatch(/^\d{1,3}%$/);
        const value = parseInt(formatted, 10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// PART 4: SDTCalculator Direct Tests (Bonus)
// =============================================================================

describe('SDTCalculator Property Tests', () => {
  test('Probit returns values in bounded range [-5, 5]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
        const z = SDTCalculator.probit(p);
        expect(z).toBeGreaterThanOrEqual(-5);
        expect(z).toBeLessThanOrEqual(5);
        expect(Number.isFinite(z)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test('Probit is monotonically increasing', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: 0.001, max: 0.1, noNaN: true }),
        (p, delta) => {
          fc.pre(p + delta <= 0.99);
          const z1 = SDTCalculator.probit(p);
          const z2 = SDTCalculator.probit(p + delta);
          expect(z2).toBeGreaterThanOrEqual(z1 - 0.0001); // Allow tiny float variance
        },
      ),
      { numRuns: 300 },
    );
  });

  test('Probit(0.5) equals 0', () => {
    const z = SDTCalculator.probit(0.5);
    expect(Math.abs(z)).toBeLessThan(0.001);
  });

  test('calculateDPrime returns 0 for anti-gaming cases', () => {
    // All zeros
    expect(SDTCalculator.calculateDPrime(0, 0, 0, 0)).toBe(0);

    // No signal trials
    expect(SDTCalculator.calculateDPrime(0, 0, 10, 10)).toBe(0);

    // No noise trials
    expect(SDTCalculator.calculateDPrime(10, 10, 0, 0)).toBe(0);

    // No hits (inactive)
    expect(SDTCalculator.calculateDPrime(0, 20, 5, 15)).toBe(0);

    // No correct rejections (spammer)
    expect(SDTCalculator.calculateDPrime(15, 5, 20, 0)).toBe(0);
  });

  test('calculateDPrime is higher for better discrimination', () => {
    const poor = SDTCalculator.calculateDPrime(50, 50, 50, 50); // 50% hit, 50% FA
    const good = SDTCalculator.calculateDPrime(80, 20, 20, 80); // 80% hit, 20% FA
    const excellent = SDTCalculator.calculateDPrime(95, 5, 5, 95); // 95% hit, 5% FA

    expect(good).toBeGreaterThan(poor);
    expect(excellent).toBeGreaterThan(good);
  });
});
