/**
 * Tests for DefaultRhythmController
 *
 * Validates timing calculation logic in isolation.
 * No timer service needed - pure calculation tests.
 */

import { describe, it, expect } from 'bun:test';
import { createDefaultRhythmController } from './rhythm-controller';
import type { TraceSpec } from '../../../specs/trace.spec';
import type { TraceRhythmMode } from '../../../types/trace';
import { TIMING_FEEDBACK_DEFAULT_MS } from '../../../specs/thresholds';

// =============================================================================
// Test Setup
// =============================================================================

function createMockSpec(
  rhythmMode: TraceRhythmMode = 'timed',
  overrides: Partial<{
    stimulusDurationMs: number;
    responseWindowMs: number;
    feedbackDurationMs: number;
    intervalMs: number;
    ruleDisplayMs: number;
  }> = {},
): TraceSpec {
  return {
    modeId: 'trace',
    sessionType: 'TraceSession',
    scoring: { strategy: 'accuracy', passThreshold: 0.7, downThreshold: 0.4 },
    timing: {
      stimulusDurationMs: overrides.stimulusDurationMs ?? 500,
      intervalMs: overrides.intervalMs ?? 1000,
      responseWindowMs: overrides.responseWindowMs ?? 2000,
      feedbackDurationMs: overrides.feedbackDurationMs ?? 300,
    },
    // @ts-expect-error test override
    generation: { generator: 'trace' },
    defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position'] },
    // @ts-expect-error test override
    report: { sections: [] },
    // @ts-expect-error test override
    extensions: {
      rhythmMode,
      dynamicRules: false,
      dynamicSwipeDirection: false,
      audioEnabled: false,
      soundEnabled: false,
      colorEnabled: false,
      writingEnabled: false,
      writingTimeoutMs: 5000,
      ruleDisplayMs: overrides.ruleDisplayMs ?? 500,
    },
  };
}

function getControllerConfig(spec: TraceSpec) {
  return {
    rhythmMode: spec.extensions.rhythmMode,
    getTimingSource: () => ({
      stimulusDurationMs: spec.timing.stimulusDurationMs,
      warmupStimulusDurationMs: spec.timing.stimulusDurationMs,
      responseWindowMs: spec.timing.responseWindowMs,
      feedbackDurationMs: spec.timing.feedbackDurationMs,
      intervalMs: spec.timing.intervalMs,
      ruleDisplayMs: spec.extensions.ruleDisplayMs,
    }),
  };
}

describe('DefaultRhythmController', () => {
  // ===========================================================================
  // Mode Detection
  // ===========================================================================

  describe('mode detection', () => {
    it('should detect timed mode', () => {
      const spec = createMockSpec('timed');
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getMode()).toBe('timed');
      expect(controller.isTimed()).toBe(true);
      expect(controller.isSelfPaced()).toBe(false);
    });

    it('should detect self-paced mode', () => {
      const spec = createMockSpec('self-paced');
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getMode()).toBe('self-paced');
      expect(controller.isTimed()).toBe(false);
      expect(controller.isSelfPaced()).toBe(true);
    });
  });

  // ===========================================================================
  // Duration Getters
  // ===========================================================================

  describe('duration getters', () => {
    it('should return stimulus duration from spec', () => {
      const spec = createMockSpec('timed', { stimulusDurationMs: 750 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getStimulusDurationMs(false)).toBe(750);
      expect(controller.getStimulusDurationMs(true)).toBe(750); // Same for warmup
    });

    it('should return response window in timed mode', () => {
      const spec = createMockSpec('timed', { responseWindowMs: 3000 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getResponseWindowMs()).toBe(3000);
    });

    it('should return 0 response window in self-paced mode', () => {
      const spec = createMockSpec('self-paced', { responseWindowMs: 3000 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getResponseWindowMs()).toBe(0);
    });

    it('should return feedback duration from spec', () => {
      const spec = createMockSpec('timed', { feedbackDurationMs: 400 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getFeedbackDurationMs()).toBe(400);
    });

    it('should use default feedback duration when not specified', () => {
      const spec = createMockSpec('timed');
      // @ts-expect-error test override
      spec.timing.feedbackDurationMs = undefined;
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getFeedbackDurationMs()).toBe(TIMING_FEEDBACK_DEFAULT_MS);
    });

    it('should return rule display duration from extensions', () => {
      const spec = createMockSpec('timed', { ruleDisplayMs: 600 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getRuleDisplayMs()).toBe(600);
    });

    it('should return interval from spec', () => {
      const spec = createMockSpec('timed', { intervalMs: 1500 });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      expect(controller.getIntervalMs()).toBe(1500);
    });
  });

  // ===========================================================================
  // Trial Cycle Duration
  // ===========================================================================

  describe('getTrialCycleDurationMs', () => {
    it('should calculate total trial cycle duration', () => {
      const spec = createMockSpec('timed', {
        stimulusDurationMs: 500,
        responseWindowMs: 2000,
        feedbackDurationMs: 300,
        ruleDisplayMs: 500,
        intervalMs: 1000,
      });
      // @ts-expect-error test override
      const controller = createDefaultRhythmController(getControllerConfig(spec));
      // 500 + 2000 + 300 + 500 + 1000 = 4300
      expect(controller.getTrialCycleDurationMs()).toBe(4300);
    });
  });

  // ===========================================================================
  // Drift Correction (calculateWaitingTiming)
  // ===========================================================================

  describe('calculateWaitingTiming', () => {
    describe('self-paced mode', () => {
      it('should return fixed timing without drift correction', () => {
        const spec = createMockSpec('self-paced', {
          ruleDisplayMs: 500,
          intervalMs: 1000,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        const result = controller.calculateWaitingTiming(10, 5);

        expect(result.ruleDisplayMs).toBe(500);
        expect(result.intervalMs).toBe(1000);
      });
    });

    describe('timed mode', () => {
      it('should use full durations when on schedule', () => {
        const spec = createMockSpec('timed', {
          ruleDisplayMs: 500,
          intervalMs: 1000,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        // Target in 1.5 seconds, need 1.5 seconds (500 + 1000 ms)
        const result = controller.calculateWaitingTiming(10.5, 9);

        expect(result.ruleDisplayMs).toBe(500);
        expect(result.intervalMs).toBe(1000);
      });

      it('should expand interval when ahead of schedule', () => {
        const spec = createMockSpec('timed', {
          ruleDisplayMs: 500,
          intervalMs: 1000,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        // Target in 2 seconds, need 1.5 seconds
        // Extra 500ms goes to interval
        const result = controller.calculateWaitingTiming(11, 9);

        expect(result.ruleDisplayMs).toBe(500);
        expect(result.intervalMs).toBe(1500); // 2000 - 500
      });

      it('should compress proportionally when behind schedule', () => {
        const spec = createMockSpec('timed', {
          ruleDisplayMs: 600,
          intervalMs: 900,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        // Target in 0.75 seconds, need 1.5 seconds (600 + 900 ms)
        // Ratio = 750 / 1500 = 0.5
        const result = controller.calculateWaitingTiming(9.75, 9);

        expect(result.ruleDisplayMs).toBe(300); // 600 * 0.5
        expect(result.intervalMs).toBe(450); // 750 - 300
      });

      it('should handle extremely behind schedule (nearly zero time)', () => {
        const spec = createMockSpec('timed', {
          ruleDisplayMs: 500,
          intervalMs: 1000,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        // Target in 0.1 seconds, need 1.5 seconds
        // Very compressed
        const result = controller.calculateWaitingTiming(9.1, 9);

        expect(result.ruleDisplayMs).toBeGreaterThanOrEqual(0);
        expect(result.intervalMs).toBeGreaterThanOrEqual(0);
        expect(result.ruleDisplayMs + result.intervalMs).toBeCloseTo(100, 0);
      });

      it('should return zeros when past target time', () => {
        const spec = createMockSpec('timed', {
          ruleDisplayMs: 500,
          intervalMs: 1000,
        });
        // @ts-expect-error test override
        const controller = createDefaultRhythmController(getControllerConfig(spec));

        // Already past target time
        const result = controller.calculateWaitingTiming(8, 9);

        expect(result.ruleDisplayMs).toBe(0);
        expect(result.intervalMs).toBe(0);
      });
    });
  });
});
