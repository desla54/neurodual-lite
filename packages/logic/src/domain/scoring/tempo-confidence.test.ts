/**
 * TempoConfidenceCalculator Tests
 *
 * Tests for the Tempo mode confidence calculation.
 */

import { describe, expect, test } from 'bun:test';
import { TempoConfidenceCalculator } from './tempo-confidence';
import type { TempoResponseData } from '../../types/ups';

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

describe('TempoConfidenceCalculator', () => {
  describe('calculate()', () => {
    test('returns neutral score when no valid data', () => {
      const responses = createResponses(0);

      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.hasEnoughData).toBe(false);
      expect(result.score).toBe(50);
      expect(result.components.timingDiscipline).toBe(50);
    });

    test('returns valid result when sufficient data', () => {
      const responses = createResponses(15);

      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.hasEnoughData).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('well-timed responses yield high score', () => {
      // All responses after stimulus, consistent RT and press duration
      const responses = createResponses(20, {
        responsePhase: 'after_stimulus',
        reactionTimeMs: 400,
        pressDurationMs: 150,
        result: 'hit',
      });

      const result = TempoConfidenceCalculator.calculate(responses);

      expect(result.score).toBeGreaterThan(80);
      expect(result.components.timingDiscipline).toBe(100);
    });
  });

  describe('calculateScore()', () => {
    test('returns null when no valid data', () => {
      const responses = createResponses(0);

      const score = TempoConfidenceCalculator.calculateScore(responses);

      expect(score).toBeNull();
    });

    test('returns number when sufficient data', () => {
      const responses = createResponses(15);

      const score = TempoConfidenceCalculator.calculateScore(responses);

      expect(score).not.toBeNull();
      expect(typeof score).toBe('number');
    });
  });
});

// =============================================================================
// TimingDiscipline Tests
// =============================================================================

describe('TimingDiscipline', () => {
  test('100% during stimulus = 0 score', () => {
    const responses = createResponses(15, { responsePhase: 'during_stimulus' });

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.timingDiscipline).toBe(0);
  });

  test('0% during stimulus = 100 score', () => {
    const responses = createResponses(15, { responsePhase: 'after_stimulus' });

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.timingDiscipline).toBe(100);
  });

  test('50% during stimulus = 50 score', () => {
    const responses = [
      ...createResponses(8, { responsePhase: 'during_stimulus' }),
      ...createResponses(7, { responsePhase: 'after_stimulus' }).map((r, i) => ({
        ...r,
        trialIndex: 8 + i,
      })),
    ];

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.timingDiscipline).toBeCloseTo(47, 0); // 1 - 8/15 ≈ 47%
  });
});

// =============================================================================
// RTStability Tests
// =============================================================================

describe('RTStability', () => {
  test('consistent RTs yield high stability', () => {
    // All RTs around 400ms with minimal variation
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      reactionTimeMs: 400 + (i % 2 === 0 ? 5 : -5), // 395-405ms
    }));

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.rtStability).toBeGreaterThan(90);
  });

  test('dual-match second responses do not tank stability', () => {
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
      responses.push(
        createResponse({
          trialIndex: i,
          inputMethod: 'touch',
          responseIndexInTrial: 1,
          reactionTimeMs: 1400,
        }),
      );
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.components.rtStability).toBeGreaterThan(90);
  });

  test('highly variable RTs yield low stability', () => {
    // RTs ranging from 200ms to 800ms
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      reactionTimeMs: 200 + i * 40, // 200, 240, 280, ..., 760
    }));

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.rtStability).toBeLessThan(50);
  });
});

// =============================================================================
// PressStability Tests
// =============================================================================

describe('PressStability', () => {
  test('consistent press durations yield high stability', () => {
    const responses = createResponses(15).map((r, i) => ({
      ...r,
      pressDurationMs: 150 + (i % 2 === 0 ? 2 : -2), // 148-152ms
    }));

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.pressStability).toBeGreaterThan(90);
  });

  test('null press durations yield neutral score', () => {
    const responses = createResponses(15).map((r) => ({
      ...r,
      pressDurationMs: null,
    }));

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.pressStability).toBe(50);
  });
});

// =============================================================================
// ErrorAwareness (PES) Tests
// =============================================================================

describe('ErrorAwareness (PES)', () => {
  test('slowing after errors yields high score', () => {
    // Create a sequence with errors followed by slower correct responses
    const responses: TempoResponseData[] = [];

    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        // Error trial
        responses.push(
          createResponse({
            trialIndex: i,
            result: 'miss',
            reactionTimeMs: 0,
            pressDurationMs: null,
          }),
        );
      } else if (i % 4 === 1) {
        // Post-error trial (slower)
        responses.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 500 }));
      } else {
        // Normal trial
        responses.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 400 }));
      }
    }

    const result = TempoConfidenceCalculator.calculate(responses);

    // PES ratio should be ~1.25 (500/400), yielding high score
    expect(result.components.errorAwareness).toBeGreaterThan(70);
  });

  test('no slowing after errors yields low score', () => {
    const withSlowing: TempoResponseData[] = [];
    const noSlowing: TempoResponseData[] = [];

    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        const err = createResponse({
          trialIndex: i,
          result: 'miss',
          reactionTimeMs: 0,
          pressDurationMs: null,
        });
        withSlowing.push(err);
        noSlowing.push(err);
        continue;
      }

      // Post-error hit is slower in "withSlowing", same as baseline in "noSlowing".
      if (i % 4 === 1) {
        withSlowing.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 500 }));
        noSlowing.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 400 }));
      } else {
        withSlowing.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 400 }));
        noSlowing.push(createResponse({ trialIndex: i, result: 'hit', reactionTimeMs: 400 }));
      }
    }

    const a = TempoConfidenceCalculator.calculate(withSlowing).components.errorAwareness;
    const b = TempoConfidenceCalculator.calculate(noSlowing).components.errorAwareness;

    expect(a).toBeGreaterThan(b);
  });

  test('insufficient errors yield neutral score', () => {
    // Only 1 error, not enough for PES calculation
    const responses = createResponses(15, { result: 'hit' });
    responses[5] = {
      ...responses[5]!,
      result: 'miss',
      reactionTimeMs: 0,
      pressDurationMs: null,
    };

    const result = TempoConfidenceCalculator.calculate(responses);

    // With too few errors for PES/recovery, we fall back to inhibition (no false alarms => high).
    expect(result.components.errorAwareness).toBe(100);
  });

  test('ignores same-trial cross-modality adjacency', () => {
    const responses: TempoResponseData[] = [];

    for (let i = 0; i < 20; i += 4) {
      responses.push(
        createResponse({
          trialIndex: i,
          modality: 'audio',
          result: 'miss',
          reactionTimeMs: 0,
          pressDurationMs: null,
        }),
      );
      responses.push(
        createResponse({
          trialIndex: i,
          modality: 'position',
          result: 'hit',
          reactionTimeMs: 520,
          responsePhase: 'after_stimulus',
        }),
      );
      responses.push(
        createResponse({
          trialIndex: i + 1,
          modality: 'position',
          result: 'hit',
          reactionTimeMs: 420,
          responsePhase: 'after_stimulus',
        }),
      );
    }

    const result = TempoConfidenceCalculator.calculate(responses);

    // With limited PES/recovery measurability, we fall back to inhibition.
    expect(result.components.errorAwareness).toBeGreaterThanOrEqual(80);
  });
});

// =============================================================================
// FocusScore (Micro-Lapses) Tests
// =============================================================================

describe('FocusScore (Micro-Lapses)', () => {
  test('no lapses yields high score', () => {
    // All RTs around 400ms, none exceeding 2.5x median
    const responses = createResponses(15, { reactionTimeMs: 400, result: 'hit' });

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.components.focusScore).toBe(100);
  });

  test('many lapses yield low score', () => {
    // Majority normal RTs with some extreme outliers (lapses)
    // Median will be ~400ms, threshold = 1000ms, so 1500ms+ are lapses
    const responses = createResponses(20, { result: 'hit' }).map((r, i) => ({
      ...r,
      // 15 normal RTs (400ms), 5 lapses (1500ms > 2.5 * 400)
      reactionTimeMs: i < 15 ? 400 : 1500,
    }));

    const result = TempoConfidenceCalculator.calculate(responses);

    // Lapse score = 75, engagement = 100 => blended focus = 83
    expect(result.components.focusScore).toBe(83);
  });

  test('insufficient hits uses engagement only (session still has enough actions)', () => {
    // Make the session scorable (>=10 valid actions), but keep hits below minHits.
    const responses = createResponses(15, { result: 'falseAlarm', reactionTimeMs: 420 });
    for (let i = 0; i < 5; i++) {
      responses[i] = {
        ...responses[i]!,
        result: 'hit',
        reactionTimeMs: 420,
        pressDurationMs: 150,
      };
    }

    const result = TempoConfidenceCalculator.calculate(responses);
    expect(result.hasEnoughData).toBe(true);

    // No misses / no-action targets => engagement is high.
    expect(result.components.focusScore).toBe(100);
  });
});

// =============================================================================
// Aggregation Tests
// =============================================================================

describe('Aggregation', () => {
  test('weights sum to 1.0', () => {
    // Verify weights from the spec
    const weights = {
      timingDiscipline: 0.35,
      rtStability: 0.2,
      pressStability: 0.2,
      errorAwareness: 0.2,
      focusScore: 0.05,
    };

    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  test('score is clamped to 0-100', () => {
    const responses = createResponses(15);

    const result = TempoConfidenceCalculator.calculate(responses);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
