/**
 * Tests for DefaultResponseProcessor
 *
 * Validates response processing logic in isolation.
 * No XState machine needed - pure function tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createDefaultResponseProcessor } from './response-processor';
import type { ResponseProcessor } from './types';
import type { TraceTrial } from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';

// =============================================================================
// Test Setup
// =============================================================================

function createMockSpec(
  nLevel = 2,
  overrides?: {
    mindfulTimingEnabled?: boolean;
    positionDurationMs?: number;
    positionToleranceMs?: number;
  },
): TraceSpec {
  return {
    modeId: 'trace',
    sessionType: 'TraceSession',
    scoring: { strategy: 'accuracy', passThreshold: 0.7, downThreshold: 0.4 },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 1000,
      responseWindowMs: 2000,
      feedbackDurationMs: 300,
    },
    // @ts-expect-error test override
    generation: { generator: 'trace' },
    defaults: { nLevel, trialsCount: 20, activeModalities: ['position'] },
    // @ts-expect-error test override
    report: { sections: [] },
    // @ts-expect-error test override
    extensions: {
      rhythmMode: 'timed',
      dynamicRules: false,
      dynamicSwipeDirection: false,
      audioEnabled: false,
      soundEnabled: false,
      colorEnabled: false,
      writingEnabled: false,
      writingTimeoutMs: 5000,
      ruleDisplayMs: 500,
      mindfulTiming: {
        enabled: overrides?.mindfulTimingEnabled ?? false,
        positionDurationMs: overrides?.positionDurationMs ?? 3000,
        positionToleranceMs: overrides?.positionToleranceMs ?? 200,
        writingDurationMs: 2000,
        writingToleranceMs: 200,
      },
    },
  };
}

function createMockTrials(count = 5): TraceTrial[] {
  // @ts-expect-error test override
  return Array.from({ length: count }, (_, i) => ({
    position: i % 9, // 0-8 positions
    sound: String.fromCharCode(65 + (i % 26)) as any, // A, B, C...
    color: null,
    swipeDirection: 'n-to-target' as const,
  }));
}

describe('DefaultResponseProcessor', () => {
  let processor: ResponseProcessor;
  let trials: TraceTrial[];

  beforeEach(() => {
    processor = createDefaultResponseProcessor({ spec: createMockSpec(2) });
    trials = createMockTrials(10);
  });

  // ===========================================================================
  // Warmup Detection
  // ===========================================================================

  describe('isWarmupTrial', () => {
    it('should return true for trials before nLevel', () => {
      expect(processor.isWarmupTrial(0)).toBe(true);
      expect(processor.isWarmupTrial(1)).toBe(true);
    });

    it('should return false for trials at or after nLevel', () => {
      expect(processor.isWarmupTrial(2)).toBe(false);
      expect(processor.isWarmupTrial(5)).toBe(false);
    });

    it('should respect nLevel from spec', () => {
      const proc3 = createDefaultResponseProcessor({ spec: createMockSpec(3) });
      expect(proc3.isWarmupTrial(0)).toBe(true);
      expect(proc3.isWarmupTrial(2)).toBe(true);
      expect(proc3.isWarmupTrial(3)).toBe(false);
    });
  });

  // ===========================================================================
  // Expected Value Getters
  // ===========================================================================

  describe('getExpectedPosition', () => {
    it('should return null for warmup trials', () => {
      expect(processor.getExpectedPosition(0, trials)).toBe(null);
      expect(processor.getExpectedPosition(1, trials)).toBe(null);
    });

    it('should return N-back position for non-warmup trials', () => {
      // nLevel = 2, so trial 2 should look at trial 0
      expect(processor.getExpectedPosition(2, trials)).toBe(trials[0]!.position);
      // trial 3 should look at trial 1
      expect(processor.getExpectedPosition(3, trials)).toBe(trials[1]!.position);
    });
  });

  describe('getExpectedSound', () => {
    it('should return null for warmup trials', () => {
      expect(processor.getExpectedSound(0, trials)).toBe(null);
    });

    it('should return N-back sound for non-warmup trials', () => {
      expect(processor.getExpectedSound(2, trials)).toBe(trials[0]!.sound);
    });
  });

  describe('getExpectedColor', () => {
    it('should return null for warmup trials', () => {
      expect(processor.getExpectedColor(0, trials)).toBe(null);
    });

    it('should return N-back color for non-warmup trials', () => {
      // Our mock trials have null colors
      expect(processor.getExpectedColor(2, trials)).toBe(null);
    });
  });

  // ===========================================================================
  // Swipe Processing
  // ===========================================================================

  describe('processSwipe', () => {
    it('should mark warmup swipes as incorrect', () => {
      const result = processor.processSwipe(
        { fromPosition: 0, toPosition: 1, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[0],
        0, // warmup trial
        trials,
      );

      expect(result.response.isWarmup).toBe(true);
      expect(result.response.isCorrect).toBe(false);
      expect(result.response.responseType).toBe('swipe');
    });

    it('should validate correct n-to-target swipe', () => {
      // Trial 2 has position 2, N-back (trial 0) has position 0
      const trial = { ...trials[2], position: 5 };
      const trialsWithTargetMatch = [
        { ...trials[0], position: 3 }, // target
        trials[1],
        trial,
      ];

      const result = processor.processSwipe(
        { fromPosition: 5, toPosition: 3, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trial,
        2,
        trialsWithTargetMatch,
      );

      expect(result.response.isCorrect).toBe(true);
      expect(result.response.isWarmup).toBe(false);
      expect(result.updates.feedbackType).toBe('correct');
      expect(result.updates.feedbackPosition).toBe(3);
    });

    it('should mark incorrect swipe as incorrect', () => {
      const result = processor.processSwipe(
        { fromPosition: 0, toPosition: 5, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[2],
        2, // non-warmup
        trials,
      );

      // fromPosition doesn't match current, toPosition doesn't match target
      expect(result.response.isCorrect).toBe(false);
      expect(result.updates.feedbackType).toBe('incorrect');
    });

    it('should validate target-to-n swipe direction', () => {
      // @ts-expect-error test override
      const trial: TraceTrial = { ...trials[2], position: 5, swipeDirection: 'target-to-n' };
      const trialsWithTargetMatch = [
        { ...trials[0], position: 3 }, // target
        trials[1],
        trial,
      ];

      // target-to-n: from target (3) to current (5)
      const result = processor.processSwipe(
        { fromPosition: 3, toPosition: 5, responseTimeMs: 500, responseAtMs: 1000 },
        trial,
        2,
        // @ts-expect-error test override
        trialsWithTargetMatch,
      );

      expect(result.response.isCorrect).toBe(true);
    });

    it('should include timing information in response', () => {
      const result = processor.processSwipe(
        { fromPosition: 0, toPosition: 1, responseTimeMs: 750, responseAtMs: 2500 },
        // @ts-expect-error test override
        trials[2],
        2,
        trials,
      );

      expect(result.response.responseTimeMs).toBe(750);
      expect(result.response.responseAtMs).toBe(2500);
    });

    it('should reject a spatially-correct swipe when mindful timing is outside tolerance', () => {
      const mindfulProcessor = createDefaultResponseProcessor({
        spec: createMockSpec(2, { mindfulTimingEnabled: true }),
      });
      const trial = { ...trials[2], position: 5 };
      const trialsWithTargetMatch = [{ ...trials[0], position: 3 }, trials[1], trial];

      const result = mindfulProcessor.processSwipe(
        {
          fromPosition: 5,
          toPosition: 3,
          responseTimeMs: 500,
          responseAtMs: 1000,
          actionDurationMs: 2500,
        },
        // @ts-expect-error test override
        trial,
        2,
        trialsWithTargetMatch,
      );

      expect(result.response.timingAccepted).toBe(false);
      expect(result.response.isCorrect).toBe(false);
      expect(result.updates.feedbackType).toBe('incorrect');
    });
  });

  // ===========================================================================
  // Double-Tap Processing
  // ===========================================================================

  describe('processDoubleTap', () => {
    it('should mark warmup double-taps as incorrect', () => {
      const result = processor.processDoubleTap(
        { position: 0, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[0],
        0,
        trials,
      );

      expect(result.response.isWarmup).toBe(true);
      expect(result.response.isCorrect).toBe(false);
      expect(result.response.responseType).toBe('double-tap');
    });

    it('should validate correct double-tap when position matches target', () => {
      // Create a match: trial 2 has same position as trial 0
      const matchingTrials: TraceTrial[] = [
        // @ts-expect-error test override
        { ...trials[0], position: 5 },
        // @ts-expect-error test override
        trials[1],
        // @ts-expect-error test override
        { ...trials[2], position: 5 },
      ];

      const result = processor.processDoubleTap(
        { position: 5, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        matchingTrials[2],
        2,
        matchingTrials,
      );

      expect(result.response.isCorrect).toBe(true);
      expect(result.updates.feedbackType).toBe('correct');
    });

    it('should mark incorrect double-tap when position does not match', () => {
      const result = processor.processDoubleTap(
        { position: 2, responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[2],
        2,
        trials,
      );

      // trial[2].position = 2, trial[0].position = 0 (N-back)
      // They don't match, so incorrect
      expect(result.response.isCorrect).toBe(false);
      expect(result.updates.feedbackType).toBe('incorrect');
    });
  });

  describe('processHold', () => {
    it('should validate a mindful hold when position and duration both match', () => {
      const mindfulProcessor = createDefaultResponseProcessor({
        spec: createMockSpec(2, { mindfulTimingEnabled: true }),
      });
      const matchingTrials: TraceTrial[] = [
        // @ts-expect-error test override
        { ...trials[0], position: 5 },
        // @ts-expect-error test override
        trials[1],
        // @ts-expect-error test override
        { ...trials[2], position: 5 },
      ];

      const result = mindfulProcessor.processHold(
        {
          position: 5,
          responseTimeMs: 3100,
          responseAtMs: 3100,
          actionDurationMs: 3000,
        },
        // @ts-expect-error test override
        matchingTrials[2],
        2,
        matchingTrials,
      );

      expect(result.response.responseType).toBe('hold');
      expect(result.response.timingAccepted).toBe(true);
      expect(result.response.isCorrect).toBe(true);
      expect(result.updates.feedbackType).toBe('correct');
    });
  });

  // ===========================================================================
  // Center-Tap (Rejection) Processing
  // ===========================================================================

  describe('processCenterTap', () => {
    it('should mark warmup center-taps as incorrect', () => {
      const result = processor.processCenterTap(
        { responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[0],
        0,
        trials,
      );

      expect(result.response.isWarmup).toBe(true);
      expect(result.response.isCorrect).toBe(false);
      expect(result.response.responseType).toBe('reject');
    });

    it('should not have a simple case for "no target expected"', () => {
      // Center tap is correct when expected position is null
      // This happens when the N-back trial doesn't have a position
      // For our basic tests, all trials have positions, so center tap is incorrect
      const result = processor.processCenterTap(
        { responseTimeMs: 500, responseAtMs: 1000 },
        // @ts-expect-error test override
        trials[2],
        2,
        trials,
      );

      // trial[0] has position 0 (not null), so rejection is incorrect
      expect(result.response.isCorrect).toBe(false);
      expect(result.updates.feedbackPosition).toBe(null);
    });
  });

  // ===========================================================================
  // Skip Processing
  // ===========================================================================

  describe('processSkip', () => {
    it('should mark skip as incorrect with no feedback', () => {
      // @ts-expect-error test override
      const result = processor.processSkip(trials[2], 2, trials, 1000);

      expect(result.response.isCorrect).toBe(false);
      expect(result.response.responseType).toBe('skip');
      expect(result.response.responseTimeMs).toBe(null);
      expect(result.updates.feedbackType).toBe(null);
      expect(result.updates.feedbackPosition).toBe(null);
    });

    it('should include expected values in skip response', () => {
      // @ts-expect-error test override
      const result = processor.processSkip(trials[2], 2, trials, 1000);

      expect(result.response.expectedPosition).toBe(trials[0]!.position);
      expect(result.response.expectedSound).toBe(trials[0]!.sound);
    });
  });

  // ===========================================================================
  // Timeout Processing
  // ===========================================================================

  describe('processTimeout', () => {
    it('should mark timeout as incorrect with incorrect feedback', () => {
      // @ts-expect-error test override
      const result = processor.processTimeout(trials[2], 2, trials, 1000);

      expect(result.response.isCorrect).toBe(false);
      expect(result.response.responseType).toBe('timeout');
      expect(result.response.responseTimeMs).toBe(null);
      expect(result.updates.feedbackType).toBe('incorrect');
    });

    it('should mark warmup timeout with isWarmup flag', () => {
      // @ts-expect-error test override
      const result = processor.processTimeout(trials[0], 0, trials, 1000);

      expect(result.response.isWarmup).toBe(true);
      expect(result.response.isCorrect).toBe(false);
    });
  });
});
