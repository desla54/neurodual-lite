/**
 * Aggressive Property-Based Tests for Tempo Confidence Calculation
 *
 * These tests aim to find edge cases and potential bugs in:
 * - TempoConfidenceCalculator
 * - JaeggiConfidenceCalculator
 *
 * Focus areas:
 * 1. Zero variance (all identical values)
 * 2. Single response edge cases
 * 3. All correct vs all incorrect scenarios
 * 4. CV (coefficient of variation) edge cases
 * 5. PES (Post-Error Slowing) with no/all errors
 * 6. Focus score edge cases
 * 7. Extreme reaction times
 * 8. Geometric mean with zeros
 * 9. Weight sum verification
 * 10. Score bounds [0, 100]
 * 11. NaN propagation
 */

import { describe, expect, it, test } from 'bun:test';
import * as fc from 'fast-check';
import { TempoConfidenceCalculator } from './tempo-confidence';
import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
import type { TempoResponseData } from '../../types/ups';
import {
  TEMPO_CONFIDENCE_NEUTRAL,
  TEMPO_CONFIDENCE_WEIGHTS,
  TEMPO_FOCUS_THRESHOLDS,
  TEMPO_PES_THRESHOLDS,
  TEMPO_STABILITY_THRESHOLDS,
  UPS_MIN_TRIALS_FOR_CONFIDENCE,
  JAEGGI_ACCURACY_THRESHOLD,
  JAEGGI_WEIGHTS_WITH_TIMING,
  JAEGGI_WEIGHTS_WITHOUT_TIMING,
} from '../../types/ups';

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

const responsePhaseArb = fc.constantFrom<'during_stimulus' | 'after_stimulus'>(
  'during_stimulus',
  'after_stimulus',
);

const resultArb = fc.constantFrom<'hit' | 'miss' | 'falseAlarm' | 'correctRejection'>(
  'hit',
  'miss',
  'falseAlarm',
  'correctRejection',
);

const modalityArb = fc.constantFrom('position', 'audio', 'visual');

const inputMethodArb = fc.constantFrom<'keyboard' | 'mouse' | 'touch' | 'gamepad'>(
  'keyboard',
  'mouse',
  'touch',
  'gamepad',
);

// RT arbitrary with realistic range
const reactionTimeArb = fc.integer({ min: 50, max: 2000 });

// Extreme RT arbitrary for edge case testing
const extremeReactionTimeArb = fc.oneof(
  fc.constant(1), // Minimum 1ms
  fc.constant(50), // Minimum cognitive threshold
  fc.integer({ min: 5000, max: 10000 }), // Very slow
  fc.constant(0), // Zero (invalid)
  fc.constant(-1), // Negative (invalid)
);

// Press duration arbitrary
const pressDurationArb = fc.oneof(
  fc.integer({ min: 50, max: 500 }),
  fc.constant(null),
  fc.constant(0),
);

// Basic response generator
const responseArb = (trialIndex: number): fc.Arbitrary<TempoResponseData> =>
  fc.record({
    trialIndex: fc.constant(trialIndex),
    reactionTimeMs: reactionTimeArb,
    pressDurationMs: pressDurationArb,
    responsePhase: responsePhaseArb,
    result: resultArb,
    modality: modalityArb,
    inputMethod: fc.option(inputMethodArb, { nil: undefined }),
    cursorTravelDistance: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    responseIndexInTrial: fc.option(fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>, {
      nil: undefined,
    }),
  });

// Generate array of responses with sequential trial indices
const responsesArb = (minCount: number, maxCount: number): fc.Arbitrary<TempoResponseData[]> =>
  fc
    .integer({ min: minCount, max: maxCount })
    .chain((count) =>
      fc.tuple(...Array.from({ length: count }, (_, i) => responseArb(i))).map((arr) => arr),
    );

// Helper to create a valid response
function createValidResponse(
  trialIndex: number,
  overrides: Partial<TempoResponseData> = {},
): TempoResponseData {
  return {
    trialIndex,
    reactionTimeMs: 400,
    pressDurationMs: 150,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  };
}

// Helper to create many responses
function createResponses(
  count: number,
  overrides: Partial<TempoResponseData> = {},
): TempoResponseData[] {
  return Array.from({ length: count }, (_, i) => createValidResponse(i, overrides));
}

// =============================================================================
// 1. Zero Variance (All Identical Values) Tests
// =============================================================================

describe('Zero Variance Edge Cases', () => {
  describe('TempoConfidenceCalculator', () => {
    it('handles all identical RTs (zero variance, CV=0)', () => {
      const responses = createResponses(20, { reactionTimeMs: 400 });
      const result = TempoConfidenceCalculator.calculate(responses);

      // CV = 0 means perfect stability, should give max score
      expect(result.components.rtStability).toBe(100);
      expect(result.hasEnoughData).toBe(true);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles all identical press durations (zero variance)', () => {
      const responses = createResponses(20, { pressDurationMs: 150 });
      const result = TempoConfidenceCalculator.calculate(responses);

      // CV = 0 means perfect stability
      expect(result.components.pressStability).toBe(100);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles all responses during stimulus (early responses)', () => {
      const responses = createResponses(20, { responsePhase: 'during_stimulus' });
      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.components.timingDiscipline).toBe(0);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles all responses after stimulus (perfect timing)', () => {
      const responses = createResponses(20, { responsePhase: 'after_stimulus' });
      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.components.timingDiscipline).toBe(100);
      expect(Number.isNaN(result.score)).toBe(false);
    });
  });

  describe('JaeggiConfidenceCalculator', () => {
    it('handles all identical RTs with high accuracy', () => {
      const responses = createResponses(20, { reactionTimeMs: 400 });
      const result = JaeggiConfidenceCalculator.calculate(responses, 0.95);

      expect(result.components.rtStability).toBe(100);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles all identical RTs with low accuracy', () => {
      const responses = createResponses(20, { reactionTimeMs: 400 });
      const result = JaeggiConfidenceCalculator.calculate(responses, 0.5);

      expect(result.components.rtStability).toBe(100);
      expect(Number.isNaN(result.score)).toBe(false);
    });
  });
});

// =============================================================================
// 2. Single Response Edge Cases
// =============================================================================

describe('Single Response Edge Cases', () => {
  it('Tempo: handles single response (MIN_TRIALS = 1)', () => {
    const responses = createResponses(1);
    const result = TempoConfidenceCalculator.calculate(responses);

    // UPS_MIN_TRIALS_FOR_CONFIDENCE = 1, so single response is "enough"
    // This tests the edge case of minimal data
    if ((UPS_MIN_TRIALS_FOR_CONFIDENCE as any) === 1) {
      expect(result.hasEnoughData).toBe(true);
    } else {
      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBe(TEMPO_CONFIDENCE_NEUTRAL);
    }
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('Tempo: returns neutral for zero responses', () => {
    const responses: TempoResponseData[] = [];
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(false);
    expect(result.score).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  it('Jaeggi: handles single response (MIN_TRIALS = 1)', () => {
    const responses = createResponses(1);
    const result = JaeggiConfidenceCalculator.calculate(responses, 0.8);

    // UPS_MIN_TRIALS_FOR_CONFIDENCE = 1, so single response is "enough"
    if ((UPS_MIN_TRIALS_FOR_CONFIDENCE as any) === 1) {
      expect(result.hasEnoughData).toBe(true);
    } else {
      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBe(TEMPO_CONFIDENCE_NEUTRAL);
    }
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('Tempo: handles exactly MIN_TRIALS responses', () => {
    const responses = createResponses(UPS_MIN_TRIALS_FOR_CONFIDENCE);
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should have enough data if UPS_MIN_TRIALS_FOR_CONFIDENCE is 1
    if (UPS_MIN_TRIALS_FOR_CONFIDENCE >= 1) {
      expect(result.hasEnoughData).toBe(true);
    }
    expect(Number.isNaN(result.score)).toBe(false);
  });
});

// =============================================================================
// 3. All Correct vs All Incorrect Tests
// =============================================================================

describe('All Correct vs All Incorrect', () => {
  describe('TempoConfidenceCalculator', () => {
    it('handles all hits (perfect accuracy)', () => {
      const responses = createResponses(20, { result: 'hit' });
      const result = TempoConfidenceCalculator.calculate(responses);

      // No errors: inhibition (false-alarm restraint) should be high
      expect(result.components.errorAwareness).toBe(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles all misses', () => {
      const responses = createResponses(20, {
        result: 'miss',
        reactionTimeMs: 0,
        pressDurationMs: null,
      });
      const result = TempoConfidenceCalculator.calculate(responses);

      // All invalid RTs, should not have enough data
      expect(result.hasEnoughData).toBe(false);
    });

    it('handles all false alarms', () => {
      const responses = createResponses(20, { result: 'falseAlarm' });
      const result = TempoConfidenceCalculator.calculate(responses);

      // Should still calculate (FA can have valid RT)
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles all correct rejections', () => {
      const responses = createResponses(20, { result: 'correctRejection' });
      const result = TempoConfidenceCalculator.calculate(responses);

      // CR may or may not have valid RT depending on implementation
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('handles mixed errors and hits', () => {
      const responses: TempoResponseData[] = [];
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          responses.push(
            createValidResponse(i, { result: 'miss', reactionTimeMs: 0, pressDurationMs: null }),
          );
        } else {
          responses.push(createValidResponse(i, { result: 'hit' }));
        }
      }
      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.hasEnoughData).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});

// =============================================================================
// 4. CV (Coefficient of Variation) Edge Cases
// =============================================================================

describe('CV Edge Cases', () => {
  it('handles CV exactly at threshold', () => {
    // Create responses with CV exactly at TEMPO_RT_CV_THRESHOLD (0.6)
    // For CV = 0.6 with mean 400: std = 240, so values vary by +/- ~240
    const baseRT = 400;
    const targetCV = TEMPO_STABILITY_THRESHOLDS.rtCv; // 0.6
    const targetStd = baseRT * targetCV;

    // Create responses that approximate this CV
    const responses: TempoResponseData[] = [];
    const values = [160, 640, 160, 640, 160, 640, 160, 640, 160, 640]; // mean ~400, high variance
    for (let i = 0; i < 20; i++) {
      responses.push(createValidResponse(i, { reactionTimeMs: values[i % values.length] }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.components.rtStability)).toBe(false);
    expect(result.components.rtStability).toBeGreaterThanOrEqual(0);
    expect(result.components.rtStability).toBeLessThanOrEqual(100);
  });

  it('handles extremely high CV (CV > 1)', () => {
    // Values with very high variance
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      // Alternate between 100ms and 2000ms for extreme CV
      responses.push(createValidResponse(i, { reactionTimeMs: i % 2 === 0 ? 100 : 2000 }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.components.rtStability).toBe(0); // Should clamp to 0
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles mean of zero (all zero RTs)', () => {
    const responses = createResponses(20, { reactionTimeMs: 0 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Zero RT should make responses invalid
    expect(result.hasEnoughData).toBe(false);
  });
});

// =============================================================================
// 5. PES (Post-Error Slowing) Edge Cases
// =============================================================================

describe('PES Edge Cases', () => {
  it('handles no errors (perfect session)', () => {
    const responses = createResponses(20, { result: 'hit' });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.errorAwareness).toBe(100);
  });

  it('handles all errors (no correct responses)', () => {
    const responses = createResponses(20, {
      result: 'miss',
      reactionTimeMs: 0,
      pressDurationMs: null,
    });
    const result = TempoConfidenceCalculator.calculate(responses);

    // All misses with invalid RT = insufficient data
    expect(result.hasEnoughData).toBe(false);
  });

  it('handles errors with no post-error hits', () => {
    // Create pattern: error, error, error... (no hits following errors)
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        responses.push(
          createValidResponse(i, { result: 'miss', reactionTimeMs: 0, pressDurationMs: null }),
        );
      } else {
        responses.push(
          createValidResponse(i, { result: 'miss', reactionTimeMs: 0, pressDurationMs: null }),
        );
      }
    }
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(false);
  });

  it('handles exactly MIN_PAIRS errors with post-error slowing', () => {
    const responses: TempoResponseData[] = [];
    let trialIdx = 0;

    // Create exactly TEMPO_PES_MIN_PAIRS error-hit pairs
    for (let i = 0; i < TEMPO_PES_THRESHOLDS.minPairs; i++) {
      // Error
      responses.push(
        createValidResponse(trialIdx++, {
          result: 'miss',
          reactionTimeMs: 0,
          pressDurationMs: null,
        }),
      );
      // Post-error hit (slower)
      responses.push(createValidResponse(trialIdx++, { result: 'hit', reactionTimeMs: 500 }));
    }

    // Add more hits to meet minimum trials
    while (responses.length < 20) {
      responses.push(createValidResponse(trialIdx++, { result: 'hit', reactionTimeMs: 400 }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.components.errorAwareness)).toBe(false);
  });

  it('handles PES ratio at boundary values', () => {
    // Create scenario with PES ratio exactly at minRatio (0.9)
    const responses: TempoResponseData[] = [];
    let trialIdx = 0;

    // Add some normal hits first
    for (let i = 0; i < 10; i++) {
      responses.push(createValidResponse(trialIdx++, { result: 'hit', reactionTimeMs: 500 }));
    }

    // Add error-hit pairs with PES ratio = 0.9 (post-error RT = 0.9 * normal RT)
    for (let i = 0; i < 5; i++) {
      responses.push(
        createValidResponse(trialIdx++, {
          result: 'miss',
          reactionTimeMs: 0,
          pressDurationMs: null,
        }),
      );
      responses.push(createValidResponse(trialIdx++, { result: 'hit', reactionTimeMs: 450 })); // 450 < 500, so PES < 1
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.components.errorAwareness)).toBe(false);
    expect(result.components.errorAwareness).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// 6. Focus Score Edge Cases
// =============================================================================

describe('Focus Score Edge Cases', () => {
  it('handles no lapses', () => {
    const responses = createResponses(20, { result: 'hit', reactionTimeMs: 400 });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.focusScore).toBe(100);
  });

  it('handles insufficient hits for focus calculation', () => {
    // Less than TEMPO_FOCUS_MIN_HITS
    const hitCount = TEMPO_FOCUS_THRESHOLDS.minHits - 1;
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < hitCount; i++) {
      responses.push(createValidResponse(i, { result: 'hit', reactionTimeMs: 400 }));
    }
    // Add valid responses that are not hits
    for (let i = hitCount; i < 20; i++) {
      responses.push(createValidResponse(i, { result: 'correctRejection' }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    // With no "no-action target" periods, focus falls back to engagement (high).
    expect(result.components.focusScore).toBe(100);
  });

  it('handles all lapses (extreme case)', () => {
    // Create hits where all are lapses (RT > 2.5 * median)
    // If all have the same extreme RT, median = that RT, so nothing is > 2.5 * median
    // We need varying values where most exceed the threshold
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      // 15 normal RTs to set median around 400, 5 extreme lapses
      if (i < 5) {
        responses.push(createValidResponse(i, { result: 'hit', reactionTimeMs: 400 }));
      } else {
        // These should be > 2.5 * 400 = 1000
        responses.push(createValidResponse(i, { result: 'hit', reactionTimeMs: 1500 }));
      }
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    // Most RTs are 1500, median shifts, so lapses may be different
    expect(Number.isNaN(result.components.focusScore)).toBe(false);
  });

  it('handles lapse at exactly threshold (2.5x median)', () => {
    const responses: TempoResponseData[] = [];
    // Create responses with median 400
    for (let i = 0; i < 19; i++) {
      responses.push(createValidResponse(i, { result: 'hit', reactionTimeMs: 400 }));
    }
    // Add one at exactly 2.5 * 400 = 1000
    responses.push(createValidResponse(19, { result: 'hit', reactionTimeMs: 1000 }));

    const result = TempoConfidenceCalculator.calculate(responses);
    // RT = 1000 is NOT > 1000, so should not be counted as lapse
    expect(result.components.focusScore).toBe(100);
  });
});

// =============================================================================
// 7. Extreme Reaction Times
// =============================================================================

describe('Extreme Reaction Times', () => {
  it('handles minimum valid RT (1ms)', () => {
    const responses = createResponses(20, { reactionTimeMs: 1 });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles very high RT (10000ms)', () => {
    const responses = createResponses(20, { reactionTimeMs: 10000 });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles negative RT (should be treated as invalid)', () => {
    const responses = createResponses(20, { reactionTimeMs: -100 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Negative RT should be filtered out
    expect(result.hasEnoughData).toBe(false);
  });

  it('handles zero RT (should be invalid)', () => {
    const responses = createResponses(20, { reactionTimeMs: 0 });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(false);
  });

  it('handles mix of valid and invalid RTs', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 3 === 0) {
        responses.push(createValidResponse(i, { reactionTimeMs: 0 })); // Invalid
      } else {
        responses.push(createValidResponse(i, { reactionTimeMs: 400 })); // Valid
      }
    }
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should still have enough valid responses
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles Infinity RT', () => {
    const responses = createResponses(20, { reactionTimeMs: Number.POSITIVE_INFINITY });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Infinity should be filtered out by Number.isFinite check
    expect(result.hasEnoughData).toBe(false);
  });

  it('handles NaN RT', () => {
    const responses = createResponses(20, { reactionTimeMs: Number.NaN });
    const result = TempoConfidenceCalculator.calculate(responses);

    // NaN should be filtered out
    expect(result.hasEnoughData).toBe(false);
  });
});

// =============================================================================
// 8. Geometric Mean / Weight Sum Verification
// =============================================================================

describe('Weight Sum Verification', () => {
  it('Tempo weights sum to 1.0', () => {
    const sum =
      TEMPO_CONFIDENCE_WEIGHTS.timingDiscipline +
      TEMPO_CONFIDENCE_WEIGHTS.rtStability +
      TEMPO_CONFIDENCE_WEIGHTS.pressStability +
      TEMPO_CONFIDENCE_WEIGHTS.errorAwareness +
      TEMPO_CONFIDENCE_WEIGHTS.focusScore;

    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('Jaeggi withTiming weights sum to 1.0', () => {
    const sum =
      JAEGGI_WEIGHTS_WITH_TIMING.rtStability +
      JAEGGI_WEIGHTS_WITH_TIMING.errorAwareness +
      JAEGGI_WEIGHTS_WITH_TIMING.focusScore +
      JAEGGI_WEIGHTS_WITH_TIMING.timingDiscipline +
      JAEGGI_WEIGHTS_WITH_TIMING.pressStability;

    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('Jaeggi withoutTiming weights sum to 1.0', () => {
    const sum =
      JAEGGI_WEIGHTS_WITHOUT_TIMING.rtStability +
      JAEGGI_WEIGHTS_WITHOUT_TIMING.errorAwareness +
      JAEGGI_WEIGHTS_WITHOUT_TIMING.focusScore +
      JAEGGI_WEIGHTS_WITHOUT_TIMING.pressStability;

    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('Tempo score equals weighted sum of components', () => {
    const responses = createResponses(20, { responsePhase: 'after_stimulus' });
    const result = TempoConfidenceCalculator.calculate(responses);
    const debug = TempoConfidenceCalculator.calculateWithDebug(responses);

    if (result.hasEnoughData) {
      const expectedScore =
        debug.components.timingDiscipline * debug.weights.timingDiscipline +
        debug.components.rtStability * debug.weights.rtStability +
        debug.components.pressStability * debug.weights.pressStability +
        debug.components.errorAwareness * debug.weights.errorAwareness +
        debug.components.focusScore * debug.weights.focusScore;

      // Allow for rounding
      expect(result.score).toBeGreaterThanOrEqual(Math.floor(expectedScore));
      expect(result.score).toBeLessThanOrEqual(Math.ceil(expectedScore));
    }
  });
});

// =============================================================================
// 9. Score Bounds [0, 100]
// =============================================================================

describe('Score Bounds Property', () => {
  it('Tempo score is always in [0, 100] for random inputs', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);

        if (result.hasEnoughData) {
          return result.score >= 0 && result.score <= 100 && Number.isInteger(result.score);
        }
        return result.score === TEMPO_CONFIDENCE_NEUTRAL;
      }),
      { numRuns: 500 },
    );
  });

  it('Tempo components are always in [0, 100]', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);

        return (
          result.components.timingDiscipline >= 0 &&
          result.components.timingDiscipline <= 100 &&
          result.components.rtStability >= 0 &&
          result.components.rtStability <= 100 &&
          result.components.pressStability >= 0 &&
          result.components.pressStability <= 100 &&
          result.components.errorAwareness >= 0 &&
          result.components.errorAwareness <= 100 &&
          result.components.focusScore >= 0 &&
          result.components.focusScore <= 100
        );
      }),
      { numRuns: 500 },
    );
  });

  it('Jaeggi score is always in [0, 100] for random inputs and accuracy', () => {
    fc.assert(
      fc.property(
        responsesArb(15, 50),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (responses, accuracy) => {
          const result = JaeggiConfidenceCalculator.calculate(responses, accuracy);

          if (result.hasEnoughData) {
            return result.score >= 0 && result.score <= 100 && Number.isInteger(result.score);
          }
          return result.score === TEMPO_CONFIDENCE_NEUTRAL;
        },
      ),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// 10. NaN Propagation Tests
// =============================================================================

describe('NaN Propagation', () => {
  it('Tempo: no NaN in final score with valid inputs', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        return !Number.isNaN(result.score);
      }),
      { numRuns: 500 },
    );
  });

  it('Tempo: no NaN in components with valid inputs', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        return (
          !Number.isNaN(result.components.timingDiscipline) &&
          !Number.isNaN(result.components.rtStability) &&
          !Number.isNaN(result.components.pressStability) &&
          !Number.isNaN(result.components.errorAwareness) &&
          !Number.isNaN(result.components.focusScore)
        );
      }),
      { numRuns: 500 },
    );
  });

  it('Jaeggi: no NaN in final score', () => {
    fc.assert(
      fc.property(
        responsesArb(15, 50),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (responses, accuracy) => {
          const result = JaeggiConfidenceCalculator.calculate(responses, accuracy);
          return !Number.isNaN(result.score);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Tempo: handles NaN in input gracefully', () => {
    const responses = createResponses(20);
    // Inject NaN into one response
    (responses[5] as { reactionTimeMs: number }).reactionTimeMs = Number.NaN;

    const result = TempoConfidenceCalculator.calculate(responses);

    // Should not produce NaN
    expect(Number.isNaN(result.score)).toBe(false);
  });
});

// =============================================================================
// 11. Jaeggi Accuracy Threshold Edge Cases
// =============================================================================

describe('Jaeggi Accuracy Threshold', () => {
  it('applies timing penalty when accuracy < threshold', () => {
    const responses = createResponses(20, { responsePhase: 'during_stimulus' });
    const result = JaeggiConfidenceCalculator.calculate(
      responses,
      JAEGGI_ACCURACY_THRESHOLD - 0.01,
    );

    expect(result.timingPenaltyApplied).toBe(true);
    expect(result.components.timingDiscipline).not.toBeNull();
  });

  it('does not apply timing penalty when accuracy >= threshold', () => {
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, JAEGGI_ACCURACY_THRESHOLD);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(result.components.timingDiscipline).toBeNull();
  });

  it('handles accuracy exactly at threshold', () => {
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, JAEGGI_ACCURACY_THRESHOLD);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles accuracy = 0', () => {
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, 0);

    expect(result.timingPenaltyApplied).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles accuracy = 1', () => {
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, 1);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(Number.isNaN(result.score)).toBe(false);
  });
});

// =============================================================================
// 12. Mouse Input Adjustments
// =============================================================================

describe('Mouse Input Adjustments', () => {
  it('adjusts RT for mouse input with cursor travel distance', () => {
    const responses = createResponses(20, {
      inputMethod: 'mouse',
      cursorTravelDistance: 500,
      reactionTimeMs: 600,
    });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it('handles mostly pointer input (returns neutral pressStability)', () => {
    const responses = createResponses(20, {
      inputMethod: 'mouse',
      pressDurationMs: 50,
    });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should return neutral for pressStability with mouse input
    expect(result.components.pressStability).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  it('excludes second responses in dual-match trials for pointer input', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 10; i++) {
      // First response (index 0)
      responses.push({
        ...createValidResponse(i),
        inputMethod: 'mouse',
        responseIndexInTrial: 0,
        reactionTimeMs: 400,
      });
      // Second response (index 1) - should be excluded for pointer
      responses.push({
        ...createValidResponse(i),
        inputMethod: 'mouse',
        responseIndexInTrial: 1,
        reactionTimeMs: 200, // Faster because cursor already near
      });
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    // RT stability should be high because we're only considering first responses
    expect(result.components.rtStability).toBeGreaterThan(50);
  });

  it('includes second responses for keyboard input', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 10; i++) {
      // First response
      responses.push({
        ...createValidResponse(i),
        inputMethod: 'keyboard',
        responseIndexInTrial: 0,
        reactionTimeMs: 400,
      });
      // Second response - should be included for keyboard
      responses.push({
        ...createValidResponse(i),
        inputMethod: 'keyboard',
        responseIndexInTrial: 1,
        reactionTimeMs: 200,
      });
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    // RT stability should be lower because both response types are included
    expect(Number.isNaN(result.components.rtStability)).toBe(false);
  });
});

// =============================================================================
// 13. Debug Data Extraction
// =============================================================================

describe('Debug Data', () => {
  it('Tempo calculateWithDebug returns consistent results', () => {
    const responses = createResponses(20);
    const result = TempoConfidenceCalculator.calculate(responses);
    const debug = TempoConfidenceCalculator.calculateWithDebug(responses);

    expect(debug.score).toBe(result.score);
    expect(debug.hasEnoughData).toBe(result.hasEnoughData);
    expect(debug.components.timingDiscipline).toBe(result.components.timingDiscipline);
    expect(debug.components.rtStability).toBe(result.components.rtStability);
  });

  it('Jaeggi calculateWithDebug returns consistent results', () => {
    const responses = createResponses(20);
    const accuracy = 0.85;
    const result = JaeggiConfidenceCalculator.calculate(responses, accuracy);
    const debug = JaeggiConfidenceCalculator.calculateWithDebug(responses, accuracy);

    expect(debug.score).toBe(result.score);
    expect(debug.hasEnoughData).toBe(result.hasEnoughData);
    expect(debug.components.rtStability).toBe(result.components.rtStability);
  });
});

// =============================================================================
// 14. Multi-Modality Tests
// =============================================================================

describe('Multi-Modality', () => {
  it('handles responses from multiple modalities', () => {
    const responses: TempoResponseData[] = [];
    const modalities = ['position', 'audio', 'visual'];
    for (let i = 0; i < 30; i++) {
      responses.push(
        createValidResponse(i, {
          modality: modalities[i % 3],
          result: i % 5 === 0 ? 'miss' : 'hit',
          reactionTimeMs: i % 5 === 0 ? 0 : 400,
          pressDurationMs: i % 5 === 0 ? null : 150,
        }),
      );
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.components.errorAwareness)).toBe(false);
  });

  it('calculates PES separately per modality', () => {
    const responses: TempoResponseData[] = [];

    // Audio modality: errors with post-error slowing
    for (let i = 0; i < 10; i++) {
      if (i % 3 === 0 && i > 0) {
        responses.push(
          createValidResponse(i, {
            modality: 'audio',
            result: 'miss',
            reactionTimeMs: 0,
            pressDurationMs: null,
          }),
        );
      } else {
        responses.push(
          createValidResponse(i, {
            modality: 'audio',
            result: 'hit',
            reactionTimeMs: i % 3 === 1 ? 500 : 400, // Post-error is slower
          }),
        );
      }
    }

    // Position modality: no errors
    for (let i = 10; i < 20; i++) {
      responses.push(createValidResponse(i, { modality: 'position', result: 'hit' }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.components.errorAwareness)).toBe(false);
  });
});

// =============================================================================
// 15. Fuzz Testing with Property-Based Tests
// =============================================================================

describe('Fuzz Testing', () => {
  it('Tempo calculator never throws for any input', () => {
    fc.assert(
      fc.property(responsesArb(0, 100), (responses) => {
        try {
          TempoConfidenceCalculator.calculate(responses);
          TempoConfidenceCalculator.calculateScore(responses);
          TempoConfidenceCalculator.calculateWithDebug(responses);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('Jaeggi calculator never throws for any input', () => {
    fc.assert(
      fc.property(
        responsesArb(0, 100),
        fc.double({ min: -1, max: 2, noNaN: true }), // Include out-of-range accuracy
        (responses, accuracy) => {
          try {
            JaeggiConfidenceCalculator.calculate(responses, accuracy);
            JaeggiConfidenceCalculator.calculateScore(responses, accuracy);
            JaeggiConfidenceCalculator.calculateWithDebug(responses, accuracy);
            return true;
          } catch {
            return false;
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Tempo score is deterministic (same input = same output)', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result1 = TempoConfidenceCalculator.calculate(responses);
        const result2 = TempoConfidenceCalculator.calculate(responses);
        return (
          result1.score === result2.score &&
          result1.components.timingDiscipline === result2.components.timingDiscipline &&
          result1.components.rtStability === result2.components.rtStability
        );
      }),
      { numRuns: 200 },
    );
  });

  it('Tempo components are always integers', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const result = TempoConfidenceCalculator.calculate(responses);
        return (
          Number.isInteger(result.components.timingDiscipline) &&
          Number.isInteger(result.components.rtStability) &&
          Number.isInteger(result.components.pressStability) &&
          Number.isInteger(result.components.errorAwareness) &&
          Number.isInteger(result.components.focusScore)
        );
      }),
      { numRuns: 500 },
    );
  });

  it('calculateScore returns same value as calculate().score', () => {
    fc.assert(
      fc.property(responsesArb(15, 50), (responses) => {
        const fullResult = TempoConfidenceCalculator.calculate(responses);
        const scoreOnly = TempoConfidenceCalculator.calculateScore(responses);

        if (fullResult.hasEnoughData) {
          return scoreOnly === fullResult.score;
        }
        return scoreOnly === null;
      }),
      { numRuns: 300 },
    );
  });

  it('Jaeggi timing penalty is correctly applied based on accuracy', () => {
    fc.assert(
      fc.property(
        responsesArb(15, 50),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (responses, accuracy) => {
          const result = JaeggiConfidenceCalculator.calculate(responses, accuracy);
          if (!result.hasEnoughData) return true;

          if (accuracy < JAEGGI_ACCURACY_THRESHOLD) {
            return (
              result.timingPenaltyApplied === true && result.components.timingDiscipline !== null
            );
          }
          return (
            result.timingPenaltyApplied === false && result.components.timingDiscipline === null
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// Bug Reports
// =============================================================================

// =============================================================================
// 16. Additional Aggressive Edge Cases
// =============================================================================

describe('Additional Aggressive Edge Cases', () => {
  test('RT stability with only 2 values (below std threshold)', () => {
    // std() requires length >= 2, but rtStability requires >= 3
    const responses = createResponses(2, { reactionTimeMs: 400 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should get neutral since rtStability needs >= 3 RTs
    // But hasEnoughData may still be true (MIN_TRIALS = 1)
    expect(Number.isNaN(result.components.rtStability)).toBe(false);
    expect(result.components.rtStability).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  test('Press stability with only 2 values', () => {
    const responses = createResponses(2, { pressDurationMs: 150 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // pressStability requires >= 3 press durations
    expect(result.components.pressStability).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  test('All responses with same modality but different trial indices', () => {
    // PES calculation groups by modality, then sorts by trialIndex
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        createValidResponse(i, {
          modality: 'position',
          result: i % 4 === 0 ? 'miss' : 'hit',
          reactionTimeMs: i % 4 === 0 ? 0 : i % 4 === 1 ? 500 : 400,
          pressDurationMs: i % 4 === 0 ? null : 150,
        }),
      );
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.components.errorAwareness)).toBe(false);
  });

  test('Non-sequential trial indices', () => {
    // Trial indices that skip numbers (e.g., 0, 5, 10, 15...)
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(createValidResponse(i * 5, { result: 'hit' }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Negative trial indices', () => {
    // Should handle negative indices gracefully
    const responses: TempoResponseData[] = [];
    for (let i = -10; i < 10; i++) {
      responses.push(createValidResponse(i, { result: 'hit' }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Very large trial indices', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(createValidResponse(i * 1000000, { result: 'hit' }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Mixed valid and invalid responses at boundary', () => {
    // Create exactly MIN_TRIALS valid responses mixed with invalid ones
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < UPS_MIN_TRIALS_FOR_CONFIDENCE * 2; i++) {
      if (i < UPS_MIN_TRIALS_FOR_CONFIDENCE) {
        responses.push(createValidResponse(i)); // Valid
      } else {
        responses.push(
          createValidResponse(i, {
            reactionTimeMs: Number.NaN, // Invalid
            pressDurationMs: null,
          }),
        );
      }
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    // Should have exactly MIN_TRIALS valid responses
    expect(result.hasEnoughData).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('All responses are correctRejection (no hits)', () => {
    // correctRejection may or may not have RT depending on game logic
    const responses = createResponses(20, { result: 'correctRejection' });
    const result = TempoConfidenceCalculator.calculate(responses);

    // focusScore only counts hits, so should be neutral
    expect(result.components.focusScore).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  test('Responses with extremely varied press durations', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(createValidResponse(i, { pressDurationMs: 10 ** (i % 4) }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.components.pressStability)).toBe(false);
    // Very high variance should give low stability
    expect(result.components.pressStability).toBeLessThanOrEqual(100);
  });

  test('Empty modality string', () => {
    const responses = createResponses(20, { modality: '' });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Empty string is still a valid modality grouping key
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Unicode modality string', () => {
    const responses = createResponses(20, { modality: '\u{1F4A5}' }); // emoji
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Alternating input methods', () => {
    const responses: TempoResponseData[] = [];
    const methods: Array<'keyboard' | 'mouse' | 'touch' | 'gamepad'> = [
      'keyboard',
      'mouse',
      'touch',
      'gamepad',
    ];
    for (let i = 0; i < 20; i++) {
      responses.push(createValidResponse(i, { inputMethod: methods[i % 4] }));
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Cursor travel distance of 0', () => {
    const responses = createResponses(20, {
      inputMethod: 'mouse',
      cursorTravelDistance: 0,
    });

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('Very large cursor travel distance', () => {
    const responses = createResponses(20, {
      inputMethod: 'mouse',
      cursorTravelDistance: 100000, // Very large screen distance
      reactionTimeMs: 500,
    });

    const result = TempoConfidenceCalculator.calculate(responses);
    // Large travel distance may result in adjusted RT going to minimum (50ms)
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('RT adjustment that would go negative', () => {
    // If cursorTravelDistance is very large, adjusted RT = RT - (dist/speed)
    // should clamp to minimum 50ms
    const responses = createResponses(20, {
      inputMethod: 'mouse',
      cursorTravelDistance: 10000,
      reactionTimeMs: 100, // Small RT
    });

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(Number.isNaN(result.score)).toBe(false);
    // Should still have valid RT stability (clamped to 50ms)
  });
});

describe('POTENTIAL BUGS FOUND', () => {
  test('BUG #1: CV calculation returns 0 instead of Infinity when mean is 0', () => {
    // When all RTs are 0, mean = 0, and CV = std/mean would be Infinity or NaN
    // The code handles this by returning 0, but this masks a data quality issue
    const responses = createResponses(20, { reactionTimeMs: 0 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // This passes because invalid RTs are filtered, but edge case handling should be documented
    expect(result.hasEnoughData).toBe(false);
  });

  test('BUG #2: Press duration CV with all null values returns neutral', () => {
    // When all press durations are null, the calculation correctly returns neutral
    // This is expected behavior but worth documenting
    const responses = createResponses(20, { pressDurationMs: null });
    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.pressStability).toBe(TEMPO_CONFIDENCE_NEUTRAL);
  });

  test('BUG #3: PES calculation may divide by zero if avgRTCorrect is 0', () => {
    // If all correct RTs are 0 (invalid), avgRTCorrect = 0, and pesRatio = postError/0
    // The code guards against this, but let's verify
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        createValidResponse(i, {
          result: 'hit',
          reactionTimeMs: 0, // Invalid
          pressDurationMs: null, // Required for isValidRT to fail
        }),
      );
    }
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should handle gracefully (no data = neutral)
    expect(result.hasEnoughData).toBe(false);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('BUG #4: Jaeggi with accuracy > 1 should be clamped', () => {
    // Accuracy values > 1 are invalid but may occur due to bugs elsewhere
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, 1.5);

    // Should not produce invalid scores
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('BUG #5: Jaeggi with negative accuracy should be handled', () => {
    // Negative accuracy is invalid but may occur due to bugs
    const responses = createResponses(20);
    const result = JaeggiConfidenceCalculator.calculate(responses, -0.5);

    // Timing penalty should still apply (accuracy < threshold)
    expect(result.timingPenaltyApplied).toBe(true);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('BUG #6: FocusScore median calculation with even number of values', () => {
    // Median calculation for even-length arrays should average middle two values
    // Creating exactly 20 hits to test even-length array
    const responses = createResponses(20, { result: 'hit', reactionTimeMs: 400 });
    const result = TempoConfidenceCalculator.calculate(responses);

    // Should not produce NaN
    expect(Number.isNaN(result.components.focusScore)).toBe(false);
    expect(result.components.focusScore).toBe(100); // No lapses
  });

  test('BUG #7: std() returns 0 for single-element array (correct but edge case)', () => {
    // std() with 1 element returns 0, which is mathematically undefined
    // but the code handles it by requiring length >= 2
    const responses = createResponses(1);
    const result = TempoConfidenceCalculator.calculate(responses);

    // With UPS_MIN_TRIALS_FOR_CONFIDENCE = 1, this might pass through
    // Check that it doesn't produce NaN
    expect(Number.isNaN(result.score)).toBe(false);
  });
});
