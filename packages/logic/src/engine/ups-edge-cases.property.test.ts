/**
 * Aggressive Property-Based Tests for UPS Edge Cases
 *
 * Focus: Find bugs in UPS calculation through edge case exploration
 *
 * Critical invariants tested:
 * 1. UPS score always in [0, 100] range
 * 2. Weight sum = 1.0 for all weight configurations
 * 3. Component scores (accuracy, confidence) each in valid range
 * 4. No NaN propagation through calculations
 * 5. Handling of edge cases: negative d', very high d', zero values
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { TempoConfidenceCalculator } from '../domain/scoring/tempo-confidence';
import {
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  TEMPO_CONFIDENCE_WEIGHTS,
  type TempoResponseData,
} from '../types/ups';

// =============================================================================
// Arbitraries for Edge Case Generation
// =============================================================================

// Arbitrary for very extreme accuracy values (boundary testing)
const extremeAccuracyArb = fc.oneof(
  fc.constant(0),
  fc.constant(100),
  fc.constant(0.0001), // Near-zero
  fc.constant(99.9999), // Near-100
  fc.integer({ min: 0, max: 100 }),
);

// Arbitrary for confidence that includes null and extremes
const extremeConfidenceArb = fc.oneof(
  fc.constant(null),
  fc.constant(0),
  fc.constant(100),
  fc.constant(0.0001),
  fc.constant(99.9999),
  fc.integer({ min: 0, max: 100 }),
);

// Arbitrary for SDT counts that can create edge cases
const sdtCountsArb = fc.record({
  hits: fc.integer({ min: 0, max: 1000 }),
  misses: fc.integer({ min: 0, max: 1000 }),
  falseAlarms: fc.integer({ min: 0, max: 1000 }),
  correctRejections: fc.integer({ min: 0, max: 1000 }),
});

// Extreme SDT counts for boundary testing
const extremeSdtCountsArb = fc.oneof(
  // All zeros
  fc.constant({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }),
  // Perfect performance
  fc.constant({ hits: 100, misses: 0, falseAlarms: 0, correctRejections: 100 }),
  // All hits, no CR (should trigger anti-gaming)
  fc.constant({ hits: 100, misses: 0, falseAlarms: 100, correctRejections: 0 }),
  // No hits (should trigger anti-gaming)
  fc.constant({ hits: 0, misses: 100, falseAlarms: 0, correctRejections: 100 }),
  // Very high counts
  fc.constant({ hits: 10000, misses: 0, falseAlarms: 0, correctRejections: 10000 }),
  // Single trial scenarios
  fc.constant({ hits: 1, misses: 0, falseAlarms: 0, correctRejections: 0 }),
  fc.constant({ hits: 0, misses: 1, falseAlarms: 0, correctRejections: 0 }),
  fc.constant({ hits: 0, misses: 0, falseAlarms: 1, correctRejections: 0 }),
  fc.constant({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 1 }),
  // Normal random
  sdtCountsArb,
);

// Arbitrary for reaction times with edge cases
const rtArb = fc.oneof(
  fc.constant(0), // Zero RT
  fc.constant(1), // Very fast
  fc.constant(50), // Minimum cognitive threshold
  fc.constant(10000), // Very slow
  fc.constant(Number.MAX_SAFE_INTEGER), // Extreme
  fc.integer({ min: 100, max: 2000 }), // Normal range
);

// Arbitrary for press durations with edge cases
const pressDurationArb = fc.oneof(
  fc.constant(null),
  fc.constant(0),
  fc.constant(1),
  fc.constant(50),
  fc.constant(5000),
  fc.integer({ min: 50, max: 500 }),
);

// =============================================================================
// UPS Formula Core Invariants
// =============================================================================

describe('UPS Edge Cases - Core Formula Invariants', () => {
  describe('Weight Sum Invariant', () => {
    it('UPS weights sum to exactly 1.0', () => {
      const sum = UPS_ACCURACY_WEIGHT + UPS_CONFIDENCE_WEIGHT;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('Tempo confidence weights sum to exactly 1.0', () => {
      const sum =
        TEMPO_CONFIDENCE_WEIGHTS.timingDiscipline +
        TEMPO_CONFIDENCE_WEIGHTS.rtStability +
        TEMPO_CONFIDENCE_WEIGHTS.pressStability +
        TEMPO_CONFIDENCE_WEIGHTS.errorAwareness +
        TEMPO_CONFIDENCE_WEIGHTS.focusScore;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  describe('Bounds Invariant - UPS always in [0, 100]', () => {
    it('never produces NaN for any input combination', () => {
      fc.assert(
        fc.property(extremeAccuracyArb, extremeConfidenceArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return !Number.isNaN(ups);
        }),
        { numRuns: 1000 },
      );
    });

    it('never produces Infinity for any input combination', () => {
      fc.assert(
        fc.property(extremeAccuracyArb, extremeConfidenceArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return Number.isFinite(ups);
        }),
        { numRuns: 1000 },
      );
    });

    it('UPS is always >= 0 for any valid inputs', () => {
      fc.assert(
        fc.property(extremeAccuracyArb, extremeConfidenceArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return ups >= 0;
        }),
        { numRuns: 1000 },
      );
    });

    it('UPS is always <= 100 for any valid inputs', () => {
      fc.assert(
        fc.property(extremeAccuracyArb, extremeConfidenceArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return ups <= 100;
        }),
        { numRuns: 1000 },
      );
    });

    it('UPS is always an integer (rounded)', () => {
      fc.assert(
        fc.property(extremeAccuracyArb, extremeConfidenceArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return Number.isInteger(ups);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe('Boundary Values', () => {
    it('UPS(0, 0) = 0', () => {
      expect(UnifiedScoreCalculator.calculateUPS(0, 0)).toBe(0);
    });

    it('UPS(100, 100) = 100', () => {
      expect(UnifiedScoreCalculator.calculateUPS(100, 100)).toBe(100);
    });

    it('UPS(0, 100) = 0 (accuracy dominates)', () => {
      expect(UnifiedScoreCalculator.calculateUPS(0, 100)).toBe(0);
    });

    it('UPS(100, 0) = 0 (confidence can zero out)', () => {
      expect(UnifiedScoreCalculator.calculateUPS(100, 0)).toBe(0);
    });

    it('UPS(accuracy, null) = accuracy (fallback mode)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (accuracy) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, null);
          return ups === Math.round(accuracy);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Out-of-range Input Handling', () => {
    it('clamps negative accuracy to 0', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000, max: -1 }), (negAccuracy) => {
          const ups = UnifiedScoreCalculator.calculateUPS(negAccuracy, 50);
          return ups >= 0 && ups <= 100;
        }),
        { numRuns: 100 },
      );
    });

    it('clamps accuracy > 100 to 100', () => {
      fc.assert(
        fc.property(fc.integer({ min: 101, max: 1000 }), (highAccuracy) => {
          const ups = UnifiedScoreCalculator.calculateUPS(highAccuracy, 50);
          return ups >= 0 && ups <= 100;
        }),
        { numRuns: 100 },
      );
    });

    it('clamps negative confidence to 0', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000, max: -1 }), (negConfidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(50, negConfidence);
          return ups >= 0 && ups <= 100;
        }),
        { numRuns: 100 },
      );
    });

    it('clamps confidence > 100 to 100', () => {
      fc.assert(
        fc.property(fc.integer({ min: 101, max: 1000 }), (highConfidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(50, highConfidence);
          return ups >= 0 && ups <= 100;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// Tempo Accuracy Calculation Edge Cases
// =============================================================================

describe('UPS Edge Cases - Tempo Accuracy', () => {
  const gameModes = ['dualnback-classic', 'sim-brainworkshop', 'custom'] as const;

  describe('Bounds Invariant - Accuracy always in [0, 100]', () => {
    it('accuracy is never NaN for any SDT counts', () => {
      fc.assert(
        fc.property(fc.constantFrom(...gameModes), extremeSdtCountsArb, (gameMode, data) => {
          const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, gameMode);
          return !Number.isNaN(accuracy);
        }),
        { numRuns: 500 },
      );
    });

    it('accuracy is always >= 0', () => {
      fc.assert(
        fc.property(fc.constantFrom(...gameModes), extremeSdtCountsArb, (gameMode, data) => {
          const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, gameMode);
          return accuracy >= 0;
        }),
        { numRuns: 500 },
      );
    });

    it('accuracy is always <= 100', () => {
      fc.assert(
        fc.property(fc.constantFrom(...gameModes), extremeSdtCountsArb, (gameMode, data) => {
          const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, gameMode);
          return accuracy <= 100;
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('Zero/Empty Data Edge Cases', () => {
    it('all zeros returns 0 for all modes', () => {
      const zeroData = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
      for (const mode of gameModes) {
        const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(zeroData, mode);
        expect(accuracy).toBe(0);
      }
    });

    it('single trial edge cases do not produce NaN', () => {
      const singleTrialCases = [
        { hits: 1, misses: 0, falseAlarms: 0, correctRejections: 0 },
        { hits: 0, misses: 1, falseAlarms: 0, correctRejections: 0 },
        { hits: 0, misses: 0, falseAlarms: 1, correctRejections: 0 },
        { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 1 },
      ];

      for (const data of singleTrialCases) {
        for (const mode of gameModes) {
          const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, mode);
          expect(Number.isNaN(accuracy)).toBe(false);
          expect(accuracy).toBeGreaterThanOrEqual(0);
          expect(accuracy).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('Division by Zero Edge Cases', () => {
    it('handles no signal trials (hits + misses = 0)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...gameModes),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (gameMode, fa, cr) => {
            const data = { hits: 0, misses: 0, falseAlarms: fa, correctRejections: cr };
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, gameMode);
            return (
              !Number.isNaN(accuracy) &&
              Number.isFinite(accuracy) &&
              accuracy >= 0 &&
              accuracy <= 100
            );
          },
        ),
        { numRuns: 200 },
      );
    });

    it('handles no noise trials (fa + cr = 0)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...gameModes),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (gameMode, hits, misses) => {
            const data = { hits, misses, falseAlarms: 0, correctRejections: 0 };
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, gameMode);
            return (
              !Number.isNaN(accuracy) &&
              Number.isFinite(accuracy) &&
              accuracy >= 0 &&
              accuracy <= 100
            );
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('SDT Geometric Mean Edge Cases (dualnback-classic)', () => {
    it('perfect hitRate with zero crRate gives 0 (geometric mean)', () => {
      // All hits, but all FA (no CR) -> crRate = 0 -> sqrt(1 * 0) = 0
      const data = { hits: 100, misses: 0, falseAlarms: 100, correctRejections: 0 };
      const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
      expect(accuracy).toBe(0);
    });

    it('perfect crRate with zero hitRate gives 0 (geometric mean)', () => {
      // All misses, but all CR (no FA) -> hitRate = 0 -> sqrt(0 * 1) = 0
      const data = { hits: 0, misses: 100, falseAlarms: 0, correctRejections: 100 };
      const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
      expect(accuracy).toBe(0);
    });

    it('balanced performance gives expected geometric mean', () => {
      // 50% hit rate, 50% CR rate -> sqrt(0.5 * 0.5) = 0.5 -> 50
      const data = { hits: 50, misses: 50, falseAlarms: 50, correctRejections: 50 };
      const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
      expect(accuracy).toBe(50);
    });
  });
});

// =============================================================================
// Tempo Confidence Calculation Edge Cases
// =============================================================================

describe('UPS Edge Cases - Tempo Confidence', () => {
  // Factory to create response data
  const createResponse = (overrides: Partial<TempoResponseData> = {}): TempoResponseData => ({
    trialIndex: 0,
    reactionTimeMs: 350,
    pressDurationMs: 120,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  });

  describe('Empty/Insufficient Data', () => {
    it('returns neutral score for empty responses', () => {
      const result = TempoConfidenceCalculator.calculate([]);
      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('single response is insufficient (minimum responses threshold)', () => {
      const responses = [createResponse()];
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles responses with all null press durations', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, pressDurationMs: null }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Zero Reaction Times', () => {
    it('handles all zero reaction times without NaN', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, reactionTimeMs: 0 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles mixed zero and normal reaction times', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          reactionTimeMs: i % 2 === 0 ? 0 : 350,
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });
  });

  describe('Identical Reaction Times (Zero Variance)', () => {
    it('handles all identical reaction times (CV would be 0)', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, reactionTimeMs: 350 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      // Perfect consistency should give high RT stability
      expect(result.components.rtStability).toBe(100);
    });

    it('handles all identical press durations', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, pressDurationMs: 120 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.pressStability).toBe(100);
    });
  });

  describe('Extreme Reaction Times', () => {
    it('handles very fast reaction times (1ms)', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, reactionTimeMs: 1 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles very slow reaction times (10000ms)', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, reactionTimeMs: 10000 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles mix of very fast and very slow RTs', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          reactionTimeMs: i % 2 === 0 ? 1 : 10000,
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('All Same Result Type', () => {
    it('handles all hits', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, result: 'hit' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      // No errors = perfect error awareness
      expect(result.components.errorAwareness).toBe(100);
    });

    it('handles all misses', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, result: 'miss' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });

    it('handles all false alarms', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, result: 'falseAlarm' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });

    it('handles all correct rejections', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, result: 'correctRejection' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });
  });

  describe('Response Phase Edge Cases', () => {
    it('handles all responses during stimulus (timing discipline = 0)', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, responsePhase: 'during_stimulus' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.timingDiscipline).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('handles all responses after stimulus (timing discipline = 100)', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, responsePhase: 'after_stimulus' }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.timingDiscipline).toBe(100);
    });
  });

  describe('Property-Based Edge Case Discovery', () => {
    const responseArb = fc.record({
      trialIndex: fc.integer({ min: 0, max: 100 }),
      reactionTimeMs: rtArb,
      pressDurationMs: pressDurationArb,
      responsePhase: fc.constantFrom('during_stimulus', 'after_stimulus') as fc.Arbitrary<
        'during_stimulus' | 'after_stimulus'
      >,
      result: fc.constantFrom('hit', 'miss', 'falseAlarm', 'correctRejection') as fc.Arbitrary<
        'hit' | 'miss' | 'falseAlarm' | 'correctRejection'
      >,
      modality: fc.constantFrom('position', 'audio', 'color', 'image'),
    });

    it('confidence score is always in [0, 100] for any response combination', () => {
      fc.assert(
        fc.property(fc.array(responseArb, { minLength: 0, maxLength: 50 }), (responses) => {
          const result = TempoConfidenceCalculator.calculate(responses);
          return (
            !Number.isNaN(result.score) &&
            Number.isFinite(result.score) &&
            result.score >= 0 &&
            result.score <= 100
          );
        }),
        { numRuns: 500 },
      );
    });

    it('all component scores are in [0, 100] for any response combination', () => {
      fc.assert(
        fc.property(fc.array(responseArb, { minLength: 5, maxLength: 50 }), (responses) => {
          const result = TempoConfidenceCalculator.calculate(responses);
          const { timingDiscipline, rtStability, pressStability, errorAwareness, focusScore } =
            result.components;

          return (
            timingDiscipline >= 0 &&
            timingDiscipline <= 100 &&
            rtStability >= 0 &&
            rtStability <= 100 &&
            pressStability >= 0 &&
            pressStability <= 100 &&
            errorAwareness >= 0 &&
            errorAwareness <= 100 &&
            focusScore >= 0 &&
            focusScore <= 100
          );
        }),
        { numRuns: 500 },
      );
    });
  });
});

// =============================================================================
// Full UPS Pipeline Integration Edge Cases
// =============================================================================

describe('UPS Edge Cases - Full Pipeline', () => {
  describe('calculateTempo Integration', () => {
    const gameModes = ['dualnback-classic', 'sim-brainworkshop', 'custom'] as const;

    it('full UPS result is valid for all game modes with zero data', () => {
      const zeroData = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };

      for (const mode of gameModes) {
        const result = UnifiedScoreCalculator.calculateTempo(mode, zeroData, [], false);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.components.accuracy).toBeGreaterThanOrEqual(0);
        expect(result.components.accuracy).toBeLessThanOrEqual(100);
        expect(['novice', 'intermediate', 'advanced', 'elite']).toContain(result.tier);
      }
    });

    it('gaming flag correctly marks ineligible', () => {
      const perfectData = { hits: 100, misses: 0, falseAlarms: 0, correctRejections: 100 };

      const notGaming = UnifiedScoreCalculator.calculateTempo(
        'dualnback-classic',
        perfectData,
        [],
        false,
      );
      const gaming = UnifiedScoreCalculator.calculateTempo(
        'dualnback-classic',
        perfectData,
        [],
        true,
      );

      expect(notGaming.journeyEligible).toBe(true);
      expect(gaming.journeyEligible).toBe(false);
    });
  });

  describe('calculatePlace Integration', () => {
    it('handles zero drops', () => {
      const result = UnifiedScoreCalculator.calculatePlace({
        correctDrops: 0,
        totalDrops: 0,
        confidenceScore: null,
      });
      expect(result.score).toBe(0);
      expect(result.components.accuracy).toBe(0);
    });

    it('handles more correct than total (invalid but should not crash)', () => {
      // This is an invalid state but the code should handle it gracefully
      const result = UnifiedScoreCalculator.calculatePlace({
        correctDrops: 100,
        totalDrops: 50, // Invalid: correct > total
        confidenceScore: 80,
      });
      // Should clamp or handle gracefully
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(Number.isFinite(result.score)).toBe(true);
    });
  });

  describe('calculateRecall Integration', () => {
    it('handles zero picks', () => {
      const result = UnifiedScoreCalculator.calculateRecall({
        correctPicks: 0,
        totalPicks: 0,
        avgConfidenceScore: null,
        windowsCompleted: 0,
      });
      expect(result.score).toBe(0);
      expect(result.components.accuracy).toBe(0);
    });
  });

  describe('calculateDualPick Integration', () => {
    it('handles zero drops', () => {
      const result = UnifiedScoreCalculator.calculateDualPick({
        correctDrops: 0,
        totalDrops: 0,
        confidenceScore: null,
      });
      expect(result.score).toBe(0);
    });
  });
});

// =============================================================================
// NaN Propagation Tests
// =============================================================================

describe('UPS Edge Cases - NaN Propagation Prevention', () => {
  it('calculateUPS never returns NaN even with extreme inputs', () => {
    const extremeInputs = [
      [Number.MAX_VALUE, 50],
      [50, Number.MAX_VALUE],
      [Number.MIN_VALUE, 50],
      [50, Number.MIN_VALUE],
      [-Infinity, 50],
      [50, -Infinity],
      [Infinity, 50],
      [50, Infinity],
    ];

    for (const [accuracy, confidence] of extremeInputs) {
      // @ts-expect-error test override
      const ups = UnifiedScoreCalculator.calculateUPS(accuracy as any, confidence);
      expect(!Number.isNaN(ups)).toBe(true);
      // After clamping and formula, result should be a valid number
      expect(ups).toBeGreaterThanOrEqual(0);
      expect(ups).toBeLessThanOrEqual(100);
    }
  });

  it('calculateTempoAccuracy never returns NaN even with extreme counts', () => {
    const extremeCases = [
      { hits: Number.MAX_SAFE_INTEGER, misses: 0, falseAlarms: 0, correctRejections: 0 },
      { hits: 0, misses: Number.MAX_SAFE_INTEGER, falseAlarms: 0, correctRejections: 0 },
      { hits: 0, misses: 0, falseAlarms: Number.MAX_SAFE_INTEGER, correctRejections: 0 },
      { hits: 0, misses: 0, falseAlarms: 0, correctRejections: Number.MAX_SAFE_INTEGER },
    ];

    for (const data of extremeCases) {
      const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
      expect(!Number.isNaN(accuracy)).toBe(true);
      expect(Number.isFinite(accuracy)).toBe(true);
    }
  });
});

// =============================================================================
// Stress Tests - Large Data Sets
// =============================================================================

describe('UPS Edge Cases - Stress Tests', () => {
  const createResponse = (overrides: Partial<TempoResponseData> = {}): TempoResponseData => ({
    trialIndex: 0,
    reactionTimeMs: 350,
    pressDurationMs: 120,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  });

  it('handles 10000 responses without overflow or precision issues', () => {
    const responses = Array.from({ length: 10000 }, (_, i) =>
      createResponse({
        trialIndex: i,
        reactionTimeMs: 300 + (i % 100), // Slight variation
        pressDurationMs: 100 + (i % 50),
        result:
          i % 4 === 0
            ? 'hit'
            : i % 4 === 1
              ? 'miss'
              : i % 4 === 2
                ? 'falseAlarm'
                : 'correctRejection',
      }),
    );
    const result = TempoConfidenceCalculator.calculate(responses);
    expect(!Number.isNaN(result.score)).toBe(true);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('handles very large SDT counts without precision loss', () => {
    const largeCount = 1_000_000;
    const data = {
      hits: largeCount,
      misses: 0,
      falseAlarms: 0,
      correctRejections: largeCount,
    };
    const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
    expect(accuracy).toBe(100); // Perfect performance should still be 100
  });
});

// =============================================================================
// Floating Point Precision Tests
// =============================================================================

describe('UPS Edge Cases - Floating Point Precision', () => {
  it('UPS formula does not lose precision with small values', () => {
    // Very small accuracy and confidence that might cause precision issues
    const ups1 = UnifiedScoreCalculator.calculateUPS(1, 1);
    expect(ups1).toBeGreaterThanOrEqual(0);
    expect(ups1).toBeLessThanOrEqual(100);

    // The formula 100 * (0.01)^0.6 * (0.01)^0.4 should give a valid small number
    // 100 * 0.01 = 1 (approximately, since 0.01^0.6 * 0.01^0.4 = 0.01)
    expect(ups1).toBe(1);
  });

  it('UPS formula rounds consistently', () => {
    // Test values that might round differently depending on implementation
    const edgeCases = [
      { accuracy: 75, confidence: 75 }, // Should give consistent result
      { accuracy: 50, confidence: 50 },
      { accuracy: 99, confidence: 99 },
    ];

    for (const { accuracy, confidence } of edgeCases) {
      const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
      const ups2 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
      const ups3 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
      expect(ups1).toBe(ups2);
      expect(ups2).toBe(ups3);
    }
  });

  it('geometric mean formula handles near-zero rates', () => {
    // 1 hit out of 1000 signals, 999 CR out of 1000 noise
    // hitRate = 0.001, crRate = 0.999
    // sqrt(0.001 * 0.999) = ~0.0316
    const data = {
      hits: 1,
      misses: 999,
      falseAlarms: 1,
      correctRejections: 999,
    };
    const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
    expect(accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy).toBeLessThanOrEqual(100);
    // sqrt(0.001 * 0.999) * 100 = ~3.16, rounded = 3
    expect(accuracy).toBe(3);
  });
});

// =============================================================================
// Regression Tests for Known Edge Cases
// =============================================================================

describe('UPS Edge Cases - Regression Tests', () => {
  it('BrainWorkshop mode handles all-FA correctly', () => {
    // BrainWorkshop formula: H / (H + M + FA) * 100
    // With 0 hits and 100 FA: 0 / (0 + 0 + 100) = 0
    const data = { hits: 0, misses: 0, falseAlarms: 100, correctRejections: 0 };
    const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'sim-brainworkshop');
    expect(accuracy).toBe(0);
  });

  it('dualnback-classic error rate handles edge case of no relevant trials', () => {
    // Jaeggi formula: (1 - errors / relevantTrials) * 100
    // With no relevant trials (H + M + FA = 0), should return 0 not NaN
    const data = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 100 };
    const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(data, 'dualnback-classic');
    expect(!Number.isNaN(accuracy)).toBe(true);
    expect(accuracy).toBeGreaterThanOrEqual(0);
  });

  it('confidence weight of 0.4 means 50% accuracy 100% confidence gives ~66', () => {
    // Formula: 100 * (0.5^0.6) * (1.0^0.4)
    // = 100 * 0.6598... * 1 = 65.98... ≈ 66
    const ups = UnifiedScoreCalculator.calculateUPS(50, 100);
    expect(ups).toBe(66);
  });

  it('accuracy weight of 0.6 means 100% accuracy 50% confidence gives ~76', () => {
    // Formula: 100 * (1.0^0.6) * (0.5^0.4)
    // = 100 * 1 * 0.7579... = 75.79... ≈ 76
    const ups = UnifiedScoreCalculator.calculateUPS(100, 50);
    expect(ups).toBe(76);
  });
});

// =============================================================================
// Scoring Strategy Correctness Tests
// =============================================================================

describe('UPS Edge Cases - Scoring Strategy Correctness', () => {
  describe('SDT Geometric Mean Properties', () => {
    it('geometric mean = 0 when either rate is 0', () => {
      // Zero hit rate (all misses)
      const zeroHitRate = { hits: 0, misses: 10, falseAlarms: 0, correctRejections: 10 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(zeroHitRate, 'dualnback-classic')).toBe(
        0,
      );

      // Zero CR rate (all false alarms)
      const zeroCRRate = { hits: 10, misses: 0, falseAlarms: 10, correctRejections: 0 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(zeroCRRate, 'dualnback-classic')).toBe(
        0,
      );
    });

    it('geometric mean < arithmetic mean (for unequal rates)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (hits, misses, fa, cr) => {
            const signalTrials = hits + misses;
            const noiseTrials = fa + cr;
            if (signalTrials === 0 || noiseTrials === 0) return true;

            const hitRate = hits / signalTrials;
            const crRate = cr / noiseTrials;
            const geometricMean = Math.sqrt(hitRate * crRate);
            const arithmeticMean = (hitRate + crRate) / 2;

            // Geometric mean is always <= arithmetic mean
            // (equality only when rates are equal)
            return geometricMean <= arithmeticMean + 0.0001;
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Jaeggi Error-Based Properties', () => {
    it('zero errors = 100% accuracy', () => {
      const noErrors = { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(noErrors, 'dualnback-classic')).toBe(
        100,
      );
    });

    it('all errors (M + FA = total relevant) = 0% accuracy', () => {
      const allErrors = { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 10 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(allErrors, 'dualnback-classic')).toBe(0);
    });

    it('CR count does not affect Jaeggi accuracy', () => {
      const base = { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 0 };
      const withCR = { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 100 };
      const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(base, 'dualnback-classic');
      const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(withCR, 'dualnback-classic');
      expect(acc1).toBe(acc2);
    });
  });

  describe('BrainWorkshop Properties', () => {
    it('zero hits = 0% accuracy', () => {
      const noHits = { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 10 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(noHits, 'sim-brainworkshop')).toBe(0);
    });

    it('all hits (no M, no FA) = 100% accuracy', () => {
      const perfectHits = { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 };
      expect(UnifiedScoreCalculator.calculateTempoAccuracy(perfectHits, 'sim-brainworkshop')).toBe(
        100,
      );
    });

    it('CR count does not affect BrainWorkshop accuracy', () => {
      const base = { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 0 };
      const withCR = { hits: 10, misses: 5, falseAlarms: 5, correctRejections: 100 };
      const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(base, 'sim-brainworkshop');
      const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(withCR, 'sim-brainworkshop');
      expect(acc1).toBe(acc2);
    });
  });

  describe('Cross-Strategy Comparison', () => {
    it('SDT geometric mean punishes extreme bias more than Jaeggi', () => {
      // Extreme responder: hits all signals but also false alarms everything
      const biasedResponder = { hits: 100, misses: 0, falseAlarms: 100, correctRejections: 0 };

      const sdtAccuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
        biasedResponder,
        'dualnback-classic',
      );
      const jaeggiAccuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
        biasedResponder,
        'dualnback-classic',
      );

      // SDT geometric mean = sqrt(1 * 0) = 0
      // Jaeggi = 1 - (0 + 100) / (100 + 0 + 100) = 1 - 0.5 = 0.5
      expect(sdtAccuracy).toBe(0);
      expect(jaeggiAccuracy).toBe(50);
    });

    it('conservative player: SDT penalizes no responses, Jaeggi rewards low FA', () => {
      // Conservative: rarely responds, few hits but also few FA
      const conservative = { hits: 5, misses: 95, falseAlarms: 5, correctRejections: 95 };

      const sdtAccuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
        conservative,
        'dualnback-classic',
      );
      const jaeggiAccuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
        conservative,
        'dualnback-classic',
      );

      // SDT = sqrt(5/100 * 95/100) = sqrt(0.05 * 0.95) = 0.218 = 22%
      // Jaeggi = 1 - (95 + 5) / (5 + 95 + 5) = 1 - 100/105 = 0.048 = 5%
      // Actually Jaeggi punishes more here because errors dominate
      expect(sdtAccuracy).toBeGreaterThan(jaeggiAccuracy);
    });
  });
});

// =============================================================================
// Response Data Validation Tests
// =============================================================================

describe('UPS Edge Cases - Response Data Validation', () => {
  const createResponse = (overrides: Partial<TempoResponseData> = {}): TempoResponseData => ({
    trialIndex: 0,
    reactionTimeMs: 350,
    pressDurationMs: 120,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  });

  describe('Multi-Modality Response Handling', () => {
    it('handles mixed modalities correctly', () => {
      const responses = [
        createResponse({ trialIndex: 0, modality: 'position', result: 'hit' }),
        createResponse({ trialIndex: 0, modality: 'audio', result: 'miss' }),
        createResponse({ trialIndex: 1, modality: 'position', result: 'correctRejection' }),
        createResponse({ trialIndex: 1, modality: 'audio', result: 'falseAlarm' }),
        createResponse({ trialIndex: 2, modality: 'position', result: 'hit' }),
        createResponse({ trialIndex: 2, modality: 'audio', result: 'hit' }),
        createResponse({ trialIndex: 3, modality: 'color', result: 'hit' }),
        createResponse({ trialIndex: 4, modality: 'image', result: 'hit' }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('errorAwareness handles modality-specific PES calculation', () => {
      // Create scenario where one modality has errors followed by slowing
      const responses = [
        // Modality 1: error then hit with longer RT
        createResponse({
          trialIndex: 0,
          modality: 'position',
          result: 'miss',
          reactionTimeMs: 300,
        }),
        createResponse({ trialIndex: 1, modality: 'position', result: 'hit', reactionTimeMs: 500 }), // PES
        createResponse({ trialIndex: 2, modality: 'position', result: 'hit', reactionTimeMs: 350 }),
        createResponse({ trialIndex: 3, modality: 'position', result: 'hit', reactionTimeMs: 350 }),
        // Modality 2: all hits (no PES to measure, but perfect awareness)
        createResponse({ trialIndex: 0, modality: 'audio', result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 1, modality: 'audio', result: 'hit', reactionTimeMs: 320 }),
        createResponse({ trialIndex: 2, modality: 'audio', result: 'hit', reactionTimeMs: 310 }),
        createResponse({ trialIndex: 3, modality: 'audio', result: 'hit', reactionTimeMs: 300 }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.errorAwareness).toBeGreaterThanOrEqual(0);
      expect(result.components.errorAwareness).toBeLessThanOrEqual(100);
    });
  });

  describe('Mouse Input Handling', () => {
    it('handles mouse input with cursor travel distance', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          inputMethod: 'mouse',
          cursorTravelDistance: 200 + i * 10,
          reactionTimeMs: 400,
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('mouse input with zero cursor distance does not crash', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          inputMethod: 'mouse',
          cursorTravelDistance: 0,
          reactionTimeMs: 400,
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });

    it('dual-match trials (responseIndexInTrial) handled correctly', () => {
      const responses = [
        // First response (primary)
        createResponse({
          trialIndex: 0,
          responseIndexInTrial: 0,
          reactionTimeMs: 350,
          inputMethod: 'mouse',
        }),
        // Second response (should be excluded for pointer input)
        createResponse({
          trialIndex: 0,
          responseIndexInTrial: 1,
          reactionTimeMs: 150,
          inputMethod: 'mouse',
        }),
        createResponse({
          trialIndex: 1,
          responseIndexInTrial: 0,
          reactionTimeMs: 340,
          inputMethod: 'mouse',
        }),
        createResponse({
          trialIndex: 1,
          responseIndexInTrial: 1,
          reactionTimeMs: 140,
          inputMethod: 'mouse',
        }),
        createResponse({
          trialIndex: 2,
          responseIndexInTrial: 0,
          reactionTimeMs: 360,
          inputMethod: 'mouse',
        }),
        createResponse({
          trialIndex: 2,
          responseIndexInTrial: 1,
          reactionTimeMs: 160,
          inputMethod: 'mouse',
        }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(!Number.isNaN(result.score)).toBe(true);
    });

    it('keyboard dual responses should include both RTs', () => {
      const responses = [
        createResponse({
          trialIndex: 0,
          responseIndexInTrial: 0,
          reactionTimeMs: 350,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 0,
          responseIndexInTrial: 1,
          reactionTimeMs: 355,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 1,
          responseIndexInTrial: 0,
          reactionTimeMs: 340,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 1,
          responseIndexInTrial: 1,
          reactionTimeMs: 345,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 2,
          responseIndexInTrial: 0,
          reactionTimeMs: 360,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 2,
          responseIndexInTrial: 1,
          reactionTimeMs: 365,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 3,
          responseIndexInTrial: 0,
          reactionTimeMs: 345,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 3,
          responseIndexInTrial: 1,
          reactionTimeMs: 350,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 4,
          responseIndexInTrial: 0,
          reactionTimeMs: 355,
          inputMethod: 'keyboard',
        }),
        createResponse({
          trialIndex: 4,
          responseIndexInTrial: 1,
          reactionTimeMs: 360,
          inputMethod: 'keyboard',
        }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      // Keyboard users can press both keys simultaneously, so both RTs are valid
      // RT stability should be high since values are close
      expect(result.components.rtStability).toBeGreaterThan(50);
    });
  });
});

// =============================================================================
// Tier Boundary Tests
// =============================================================================

describe('UPS Edge Cases - Tier Boundaries', () => {
  it('score 69 is novice, score 70 is intermediate', () => {
    const tier69 = UnifiedScoreCalculator.deriveTier(69);
    const tier70 = UnifiedScoreCalculator.deriveTier(70);
    expect(tier69.tier).toBe('novice');
    expect(tier70.tier).toBe('intermediate');
  });

  it('score 79 is intermediate, score 80 is advanced', () => {
    const tier79 = UnifiedScoreCalculator.deriveTier(79);
    const tier80 = UnifiedScoreCalculator.deriveTier(80);
    expect(tier79.tier).toBe('intermediate');
    expect(tier80.tier).toBe('advanced');
  });

  it('score 89 is advanced, score 90 is elite', () => {
    const tier89 = UnifiedScoreCalculator.deriveTier(89);
    const tier90 = UnifiedScoreCalculator.deriveTier(90);
    expect(tier89.tier).toBe('advanced');
    expect(tier90.tier).toBe('elite');
  });

  it('journey eligibility threshold at 70', () => {
    const below = UnifiedScoreCalculator.deriveTier(69, false);
    const atThreshold = UnifiedScoreCalculator.deriveTier(70, false);
    const above = UnifiedScoreCalculator.deriveTier(71, false);

    expect(below.journeyEligible).toBe(false);
    expect(atThreshold.journeyEligible).toBe(true);
    expect(above.journeyEligible).toBe(true);
  });
});

// =============================================================================
// Mathematical Correctness Verification
// =============================================================================

describe('UPS Edge Cases - Mathematical Correctness', () => {
  describe('UPS Formula Verification', () => {
    it('UPS formula matches manual calculation', () => {
      // Formula: UPS = round(100 * (A/100)^0.6 * (C/100)^0.4)
      const testCases = [
        { accuracy: 80, confidence: 90, expected: Math.round(100 * 0.8 ** 0.6 * 0.9 ** 0.4) },
        { accuracy: 50, confidence: 50, expected: Math.round(100 * 0.5 ** 0.6 * 0.5 ** 0.4) },
        { accuracy: 75, confidence: 85, expected: Math.round(100 * 0.75 ** 0.6 * 0.85 ** 0.4) },
      ];

      for (const { accuracy, confidence, expected } of testCases) {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        expect(ups).toBe(expected);
      }
    });

    it('exponent sum verification (0.6 + 0.4 = 1.0)', () => {
      // When A == C, UPS = round(100 * A/100) = A (since (A/100)^0.6 * (A/100)^0.4 = A/100)
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (value) => {
          const ups = UnifiedScoreCalculator.calculateUPS(value, value);
          return ups === Math.round(value);
        }),
        { numRuns: 101 }, // Test all values 0-100
      );
    });
  });

  describe('Geometric Mean Verification', () => {
    it('geometric mean matches manual calculation', () => {
      // sqrt(hitRate * crRate) * 100
      const testCases = [
        { hits: 80, misses: 20, fa: 10, cr: 90, expected: Math.round(Math.sqrt(0.8 * 0.9) * 100) },
        { hits: 50, misses: 50, fa: 50, cr: 50, expected: Math.round(Math.sqrt(0.5 * 0.5) * 100) },
        { hits: 100, misses: 0, fa: 0, cr: 100, expected: 100 },
      ];

      for (const { hits, misses, fa, cr, expected } of testCases) {
        const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
          { hits, misses, falseAlarms: fa, correctRejections: cr },
          'dualnback-classic',
        );
        expect(accuracy).toBe(expected);
      }
    });
  });

  describe('Rounding Edge Cases', () => {
    it('rounding at exact .5 boundary', () => {
      // JavaScript Math.round rounds .5 up (banker's rounding not used)
      // Test cases that result in exactly X.5
      // UPS = 100 * (A/100)^0.6 * (C/100)^0.4

      // We need to find values where result ends in .5
      // This is rare but let's verify the rounding behavior is consistent
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (a, c) => {
          const ups = UnifiedScoreCalculator.calculateUPS(a, c);
          // Verify that the result is always an integer
          return Number.isInteger(ups);
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('Edge Case Combinations', () => {
    it('accuracy 1, confidence 99 produces valid result', () => {
      const ups = UnifiedScoreCalculator.calculateUPS(1, 99);
      expect(ups).toBeGreaterThanOrEqual(0);
      expect(ups).toBeLessThanOrEqual(100);
      // 100 * (0.01)^0.6 * (0.99)^0.4 = 100 * 0.063 * 0.996 = ~6.3 ≈ 6
      expect(ups).toBe(6);
    });

    it('accuracy 99, confidence 1 produces valid result', () => {
      const ups = UnifiedScoreCalculator.calculateUPS(99, 1);
      expect(ups).toBeGreaterThanOrEqual(0);
      expect(ups).toBeLessThanOrEqual(100);
      // 100 * (0.99)^0.6 * (0.01)^0.4 = 100 * 0.994 * 0.158 = ~15.7 ≈ 16
      // Note: low confidence (0.4 weight) hurts less than low accuracy (0.6 weight)
      expect(ups).toBe(16);
    });

    it('near-boundary values around 70 (journey threshold)', () => {
      // Find accuracy/confidence combinations that give ~70
      // UPS = 100 * (A/100)^0.6 * (C/100)^0.4 = 70
      // If A = C = X, then X = 70

      const below70 = UnifiedScoreCalculator.calculateUPS(69, 69);
      const exactly70 = UnifiedScoreCalculator.calculateUPS(70, 70);
      const above70 = UnifiedScoreCalculator.calculateUPS(71, 71);

      expect(below70).toBeLessThan(70);
      expect(exactly70).toBe(70);
      expect(above70).toBeGreaterThan(70);
    });
  });
});

// =============================================================================
// Confidence Score Component Tests
// =============================================================================

describe('UPS Edge Cases - Confidence Components', () => {
  const createResponse = (overrides: Partial<TempoResponseData> = {}): TempoResponseData => ({
    trialIndex: 0,
    reactionTimeMs: 350,
    pressDurationMs: 120,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  });

  describe('CV (Coefficient of Variation) Edge Cases', () => {
    it('CV = 0 when all values identical (std = 0)', () => {
      // All identical RTs should give rtStability = 100
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({ trialIndex: i, reactionTimeMs: 300 }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.rtStability).toBe(100);
    });

    it('high CV (high variance) gives low stability', () => {
      // High variance in RTs: 100, 500, 100, 500, ...
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          reactionTimeMs: i % 2 === 0 ? 100 : 1000,
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      // Mean = 550, Std is very high relative to mean
      expect(result.components.rtStability).toBeLessThan(50);
    });
  });

  describe('PES (Post-Error Slowing) Edge Cases', () => {
    it('no slowing after error gives low errorAwareness', () => {
      const responses = [
        createResponse({ trialIndex: 0, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 1, result: 'miss', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 2, result: 'hit', reactionTimeMs: 300 }), // No slowing after error
        createResponse({ trialIndex: 3, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 4, result: 'miss', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 5, result: 'hit', reactionTimeMs: 300 }), // No slowing after error
        createResponse({ trialIndex: 6, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 7, result: 'hit', reactionTimeMs: 300 }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      // No PES should result in low error awareness
      expect(result.components.errorAwareness).toBeLessThanOrEqual(50);
    });

    it('clear slowing after error gives at least moderate errorAwareness', () => {
      const responses = [
        createResponse({ trialIndex: 0, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 1, result: 'miss', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 2, result: 'hit', reactionTimeMs: 450 }), // 50% slower after error
        createResponse({ trialIndex: 3, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 4, result: 'miss', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 5, result: 'hit', reactionTimeMs: 450 }), // 50% slower after error
        createResponse({ trialIndex: 6, result: 'hit', reactionTimeMs: 300 }),
        createResponse({ trialIndex: 7, result: 'hit', reactionTimeMs: 300 }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      // PES ratio = 450/325 = 1.38, which is moderate slowing
      // Score depends on PES thresholds from thresholds.ts
      expect(result.components.errorAwareness).toBeGreaterThanOrEqual(50);
      expect(result.components.errorAwareness).toBeLessThanOrEqual(100);
    });
  });

  describe('Focus Score (Lapse Detection) Edge Cases', () => {
    it('consistent RTs give high focus score', () => {
      const responses = Array.from({ length: 10 }, (_, i) =>
        createResponse({
          trialIndex: i,
          result: 'hit',
          reactionTimeMs: 300 + (i % 2) * 10, // Very small variation
        }),
      );
      const result = TempoConfidenceCalculator.calculate(responses);
      expect(result.components.focusScore).toBe(100);
    });

    it('occasional lapses (very slow RTs) reduce focus score', () => {
      const responses = [
        ...Array.from({ length: 8 }, (_, i) =>
          createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 300 }),
        ),
        // Two lapses at 3x median RT
        createResponse({ trialIndex: 8, result: 'hit', reactionTimeMs: 900 }),
        createResponse({ trialIndex: 9, result: 'hit', reactionTimeMs: 900 }),
      ];
      const result = TempoConfidenceCalculator.calculate(responses);
      // 2/10 lapses = 20% lapse rate.
      // FocusScore is a blended signal (micro-lapses + engagement + focus interruptions).
      expect(result.components.focusScore).toBe(86);
    });
  });
});
