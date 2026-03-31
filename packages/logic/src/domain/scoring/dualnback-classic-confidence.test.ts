/**
 * JaeggiConfidenceCalculator Tests
 *
 * Tests for the Jaeggi mode confidence calculation.
 * Key difference from TempoConfidence: conditional timing penalty based on accuracy.
 */

import { describe, expect, test } from 'bun:test';
import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
import type { TempoResponseData } from '../../types/ups';
import {
  JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD,
  JAEGGI_WEIGHT_RT_STABILITY,
  JAEGGI_WEIGHT_ERROR_AWARENESS,
  JAEGGI_WEIGHT_FOCUS,
  JAEGGI_WEIGHT_TIMING,
  JAEGGI_WEIGHT_PRESS_STABILITY,
  JAEGGI_WEIGHT_RT_STABILITY_HIGH,
  JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
  JAEGGI_WEIGHT_FOCUS_HIGH,
  JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
} from '../../specs/thresholds';

// =============================================================================
// Helpers
// =============================================================================

function createResponse(
  overrides: Partial<TempoResponseData> & { trialIndex: number },
): TempoResponseData {
  return {
    reactionTimeMs: 400,
    pressDurationMs: 150,
    responsePhase: 'during_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  };
}

function createResponses(
  count: number,
  overrides?: Partial<TempoResponseData>,
): TempoResponseData[] {
  return Array.from({ length: count }, (_, i) => createResponse({ trialIndex: i, ...overrides }));
}

// =============================================================================
// Basic Tests
// =============================================================================

describe('JaeggiConfidenceCalculator', () => {
  describe('calculate()', () => {
    test('returns neutral score when no valid data', () => {
      const responses = createResponses(0);

      const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBe(50);
      expect(result.components.timingDiscipline).toBeNull();
    });

    test('returns valid result when sufficient data', () => {
      const responses = createResponses(15);

      const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

      expect(result.hasEnoughData).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('includes sessionAccuracy in result', () => {
      const responses = createResponses(15);

      const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

      expect(result.sessionAccuracy).toBe(0.85);
    });
  });

  describe('calculateScore()', () => {
    test('returns null when no valid data', () => {
      const responses = createResponses(0);

      const score = JaeggiConfidenceCalculator.calculateScore(responses, 0.85);

      expect(score).toBeNull();
    });

    test('returns number when sufficient data', () => {
      const responses = createResponses(15);

      const score = JaeggiConfidenceCalculator.calculateScore(responses, 0.85);

      expect(score).not.toBeNull();
      expect(typeof score).toBe('number');
    });
  });
});

// =============================================================================
// Conditional Timing Penalty Tests
// =============================================================================

describe('Conditional Timing Penalty', () => {
  test('accuracy >= 90% waives timing penalty', () => {
    const responses = createResponses(15, { responsePhase: 'during_stimulus' });

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.92);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(result.components.timingDiscipline).toBeNull();
  });

  test('accuracy < 90% applies timing penalty', () => {
    const responses = createResponses(15, { responsePhase: 'during_stimulus' });

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.timingPenaltyApplied).toBe(true);
    expect(result.components.timingDiscipline).not.toBeNull();
  });

  test('accuracy exactly 90% waives timing penalty', () => {
    const responses = createResponses(15);

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.9);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(result.components.timingDiscipline).toBeNull();
  });

  test('high performer with fast responses gets good score', () => {
    // All responses during stimulus (would be penalized in low accuracy)
    // But with 95% accuracy, timing is waived
    const responses = createResponses(20, {
      responsePhase: 'during_stimulus',
      reactionTimeMs: 300, // Fast
      pressDurationMs: 150,
      result: 'hit',
    });

    const highAccuracyResult = JaeggiConfidenceCalculator.calculate(responses, 0.95);
    const lowAccuracyResult = JaeggiConfidenceCalculator.calculate(responses, 0.8);

    // High performer should have higher confidence (no timing penalty)
    expect(highAccuracyResult.score).toBeGreaterThan(lowAccuracyResult.score);
  });

  test('player responding fast during stimulus is penalized only if accuracy is low', () => {
    const responses = createResponses(15, {
      responsePhase: 'during_stimulus', // All early responses
    });

    const resultHigh = JaeggiConfidenceCalculator.calculate(responses, 0.95);
    const resultLow = JaeggiConfidenceCalculator.calculate(responses, 0.75);

    // With high accuracy, no timing penalty
    expect(resultHigh.components.timingDiscipline).toBeNull();

    // With low accuracy, timing penalty applied (0% discipline for all early)
    expect(resultLow.components.timingDiscipline).toBe(0);
  });
});

// =============================================================================
// Weight Verification Tests
// =============================================================================

describe('Weights', () => {
  test('weights WITH timing sum to 1.0', () => {
    const sum =
      JAEGGI_WEIGHT_RT_STABILITY +
      JAEGGI_WEIGHT_ERROR_AWARENESS +
      JAEGGI_WEIGHT_FOCUS +
      JAEGGI_WEIGHT_TIMING +
      JAEGGI_WEIGHT_PRESS_STABILITY;

    expect(sum).toBeCloseTo(1.0);
  });

  test('weights WITHOUT timing sum to 1.0', () => {
    const sum =
      JAEGGI_WEIGHT_RT_STABILITY_HIGH +
      JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH +
      JAEGGI_WEIGHT_FOCUS_HIGH +
      JAEGGI_WEIGHT_PRESS_STABILITY_HIGH;

    expect(sum).toBeCloseTo(1.0);
  });

  test('accuracy threshold is 90%', () => {
    expect(JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD).toBe(0.9);
  });
});

describe('Touch fairness (press stability)', () => {
  test('touch sessions zero-out press stability weight and renormalize', () => {
    const responses = createResponses(20, { inputMethod: 'touch' });
    // Ensure the error awareness component is applicable (otherwise its weight becomes 0 too).
    responses[0] = { ...responses[0]!, result: 'falseAlarm' };

    const debug = JaeggiConfidenceCalculator.calculateWithDebug(responses, 0.95);

    expect(debug.hasEnoughData).toBe(true);
    expect(debug.weights.pressStability).toBe(0);
    expect(debug.weights.timingDiscipline).toBe(0);

    const sum =
      debug.weights.rtStability +
      debug.weights.errorAwareness +
      debug.weights.focusScore +
      debug.weights.timingDiscipline +
      debug.weights.pressStability;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  test('keyboard sessions keep press stability weight when eligible', () => {
    const responses = createResponses(20, { inputMethod: 'keyboard' });
    // Ensure the error awareness component is applicable.
    responses[0] = { ...responses[0]!, result: 'falseAlarm' };

    const debug = JaeggiConfidenceCalculator.calculateWithDebug(responses, 0.95);

    expect(debug.hasEnoughData).toBe(true);
    expect(debug.weights.pressStability).toBeCloseTo(0.1, 6);
  });
});

// =============================================================================
// Component Tests (similar to TempoConfidence)
// =============================================================================

describe('RTStability', () => {
  test('consistent RTs yield high stability', () => {
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      reactionTimeMs: 400 + (i % 2 === 0 ? 5 : -5), // 395-405ms
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.rtStability).toBeGreaterThan(90);
  });

  test('dual-match second responses do not tank mouse stability', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 12; i++) {
      // First response: stable
      responses.push(
        createResponse({
          trialIndex: i,
          inputMethod: 'mouse',
          responseIndexInTrial: 0,
          reactionTimeMs: 400,
        }),
      );
      // Second response in same trial: very slow (should be ignored for mouse)
      responses.push(
        createResponse({
          trialIndex: i,
          inputMethod: 'mouse',
          responseIndexInTrial: 1,
          reactionTimeMs: 1200,
        }),
      );
    }

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.95);
    expect(result.components.rtStability).toBeGreaterThan(90);
  });

  test('dual-match second responses do not tank touch stability', () => {
    const responses: TempoResponseData[] = [];
    for (let i = 0; i < 12; i++) {
      responses.push(
        createResponse({
          trialIndex: i,
          inputMethod: 'touch',
          responseIndexInTrial: 0,
          reactionTimeMs: 420,
        }),
      );
      // Second response should be ignored for RT stability sampling
      responses.push(
        createResponse({
          trialIndex: i,
          inputMethod: 'touch',
          responseIndexInTrial: 1,
          reactionTimeMs: 1200,
        }),
      );
    }

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.95);
    expect(result.components.rtStability).toBeGreaterThan(90);
  });

  test('highly variable RTs yield low stability', () => {
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      reactionTimeMs: 200 + i * 40, // 200, 240, 280, ..., 760
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.rtStability).toBeLessThan(50);
  });
});

describe('PressStability', () => {
  test('consistent press durations yield high stability', () => {
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      pressDurationMs: 150 + (i % 2 === 0 ? 2 : -2),
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.pressStability).toBeGreaterThan(90);
  });

  test('null press durations yield neutral score', () => {
    const responses = createResponses(15).map((r) => ({
      ...r,
      pressDurationMs: null,
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.pressStability).toBe(50);
  });
});

describe('ErrorAwareness (PES)', () => {
  test('slowing after errors yields high score', () => {
    const responses: TempoResponseData[] = [];

    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        responses.push(
          createResponse({
            trialIndex: i,
            result: 'miss',
            reactionTimeMs: 0,
            pressDurationMs: null,
          }),
        );
      } else if (i % 4 === 1) {
        responses.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 500 }));
      } else {
        responses.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 400 }));
      }
    }

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.errorAwareness).toBeGreaterThan(70);
  });

  test('insufficient errors yield neutral score', () => {
    const responses = createResponses(15, { result: 'hit' });
    responses[5] = {
      ...responses[5]!,
      result: 'miss',
      reactionTimeMs: 0,
      pressDurationMs: null,
    };

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.errorAwareness).toBe(100);
  });
});

describe('FocusScore (Micro-Lapses)', () => {
  test('no lapses yields high score', () => {
    const responses = createResponses(15, { reactionTimeMs: 400, result: 'hit' });

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.components.focusScore).toBe(100);
  });

  test('many lapses yield low score', () => {
    const responses = createResponses(20, { result: 'hit' }).map((r, i) => ({
      ...r,
      reactionTimeMs: i < 15 ? 400 : 1500, // 5 lapses > 2.5 * 400
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    // Lapse score = 75, engagement = 100 => blended focus = 83
    expect(result.components.focusScore).toBe(83);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  test('score is clamped to 0-100', () => {
    const responses = createResponses(15);

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.85);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('handles accuracy of exactly 0', () => {
    const responses = createResponses(15);

    const result = JaeggiConfidenceCalculator.calculate(responses, 0);

    expect(result.timingPenaltyApplied).toBe(true);
    expect(result.hasEnoughData).toBe(true);
  });

  test('handles accuracy of exactly 1', () => {
    const responses = createResponses(15);

    const result = JaeggiConfidenceCalculator.calculate(responses, 1);

    expect(result.timingPenaltyApplied).toBe(false);
    expect(result.hasEnoughData).toBe(true);
  });
});

// =============================================================================
// Known Vulnerabilities & Future Fixes (Documentation Tests)
// =============================================================================

describe('Known Vulnerabilities (Audit Findings)', () => {
  /**
   * The Masher: Spams inputs just after stimulus ends.
   * Current behavior: High score (97/100) because timing penalty only checks 'during_stimulus'.
   * Desired behavior: Should be penalized for inhuman reaction times (< 150ms) regardless of phase.
   */
  test('The Masher (Post-Stimulus Spam) currently gets a high score', () => {
    const responses = Array.from({ length: 20 }, (_, i) => ({
      trialIndex: i,
      reactionTimeMs: 500 + Math.random() * 100, // Just after stimulus
      pressDurationMs: 100,
      responsePhase: 'after_stimulus' as const,
      result: 'hit' as const,
      modality: 'audio',
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.6); // Low accuracy

    // This assertion documents the current FLAW.
    // When fixed, this test should fail and be updated to expect score < 50.
    expect(result.score).toBeGreaterThan(90);
    expect(result.components.timingDiscipline).toBe(100); // No penalty applied currently
  });

  /**
   * The Touch User: Erratic press durations on mobile.
   * Current behavior: Low score because press stability is treated same as keyboard.
   * Desired behavior: Should ignore or reduce weight of press stability for touch input.
   */
  test('The Touch User gets penalized for press stability', () => {
    const responses = Array.from({ length: 20 }, (_, i) => ({
      trialIndex: i,
      reactionTimeMs: 600,
      pressDurationMs: 20 + Math.random() * 150, // Erratic press duration
      responsePhase: 'during_stimulus' as const,
      result: 'hit' as const,
      modality: 'audio',
      inputMethod: 'touch' as const,
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.95);

    // This assertion documents the current FLAW.
    // When fixed, expect press stability to be ignored or score to be higher.
    expect(result.components.pressStability).toBeLessThan(60);
  });

  /**
   * The Metronome: Consistent timing, random accuracy.
   * Current behavior: High score because stability is high, despite low accuracy.
   * Desired behavior: Confidence should probably be gated by accuracy or d-prime.
   */
  test('The Metronome (Random clicking with rhythm) gets high confidence', () => {
    const responses = Array.from({ length: 20 }, (_, i) => ({
      trialIndex: i,
      reactionTimeMs: 600, // Perfect consistency
      pressDurationMs: 100,
      responsePhase: 'after_stimulus' as const,
      result: i % 2 === 0 ? ('hit' as const) : ('falseAlarm' as const),
      modality: 'audio',
    }));

    const result = JaeggiConfidenceCalculator.calculate(responses, 0.5); // Chance level

    // This documents that confidence is high even when playing randomly
    expect(result.score).toBeGreaterThan(80);
    expect(result.components.rtStability).toBeGreaterThan(90);
  });
});
