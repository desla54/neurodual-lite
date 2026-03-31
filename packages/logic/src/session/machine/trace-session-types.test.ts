import { describe, expect, it } from 'bun:test';
import {
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedWritingSound,
  getExpectedColor,
  getExpectedWritingColor,
  getTrialCycleDuration,
  type TraceSessionContext,
  type TraceSpec,
} from './trace-session-types';
import type { Position, Sound, Color } from '../../types/core';

describe('trace-session-types', () => {
  // Helper to create mock context
  function createMockContext(
    trialIndex: number,
    nLevel: number,
    trials: Array<{ position: Position; sound: Sound; color: Color }> = [],
    writingStepIndex = 0,
  ): TraceSessionContext {
    return {
      trialIndex,
      spec: {
        defaults: { nLevel },
      } as TraceSpec,
      trials,
      writingStepIndex,
    } as unknown as TraceSessionContext;
  }

  describe('isWarmupTrial', () => {
    it('should return true for trials before nLevel', () => {
      const context = createMockContext(0, 2);
      expect(isWarmupTrial(context)).toBe(true);

      const context2 = createMockContext(1, 2);
      expect(isWarmupTrial(context2)).toBe(true);
    });

    it('should return false for trials at or after nLevel', () => {
      const context = createMockContext(2, 2);
      expect(isWarmupTrial(context)).toBe(false);

      const context2 = createMockContext(5, 2);
      expect(isWarmupTrial(context2)).toBe(false);
    });

    it('should handle different nLevels', () => {
      expect(isWarmupTrial(createMockContext(2, 3))).toBe(true);
      expect(isWarmupTrial(createMockContext(3, 3))).toBe(false);

      expect(isWarmupTrial(createMockContext(0, 1))).toBe(true);
      expect(isWarmupTrial(createMockContext(1, 1))).toBe(false);
    });
  });

  describe('getExpectedPosition', () => {
    const trials = [
      { position: 3 as Position, sound: 'C' as Sound, color: 'ink-black' as Color },
      { position: 5 as Position, sound: 'H' as Sound, color: 'ink-navy' as Color },
      { position: 7 as Position, sound: 'K' as Sound, color: 'ink-burgundy' as Color },
      { position: 1 as Position, sound: 'L' as Sound, color: 'ink-forest' as Color },
    ];

    it('should return null for warmup trials', () => {
      const context = createMockContext(0, 2, trials);
      expect(getExpectedPosition(context)).toBe(null);

      const context2 = createMockContext(1, 2, trials);
      expect(getExpectedPosition(context2)).toBe(null);
    });

    it('should return N-back position after warmup', () => {
      // With nLevel=2, trial 2 should match trial 0
      const context = createMockContext(2, 2, trials);
      expect(getExpectedPosition(context)).toBe(3);

      // Trial 3 should match trial 1
      const context2 = createMockContext(3, 2, trials);
      expect(getExpectedPosition(context2)).toBe(5);
    });

    it('should return null if N-back trial does not exist', () => {
      // Use trial index that's beyond the array bounds
      // trials has indices 0, 1, 2, 3. With trialIndex=6 and nLevel=2, nBackIndex=4 (out of bounds)
      const context = createMockContext(6, 2, trials);
      expect(getExpectedPosition(context)).toBe(null);
    });
  });

  describe('getExpectedSound', () => {
    const trials = [
      { position: 3 as Position, sound: 'C' as Sound, color: 'ink-black' as Color },
      { position: 5 as Position, sound: 'H' as Sound, color: 'ink-navy' as Color },
      { position: 7 as Position, sound: 'K' as Sound, color: 'ink-burgundy' as Color },
    ];

    it('should return null for warmup trials', () => {
      const context = createMockContext(0, 2, trials);
      expect(getExpectedSound(context)).toBe(null);
    });

    it('should return N-back sound after warmup', () => {
      const context = createMockContext(2, 2, trials);
      expect(getExpectedSound(context)).toBe('C');
    });

    it('should return null if N-back trial does not exist', () => {
      // trials has indices 0, 1, 2. With trialIndex=5 and nLevel=2, nBackIndex=3 (out of bounds)
      const context = createMockContext(5, 2, trials);
      expect(getExpectedSound(context)).toBe(null);
    });
  });

  describe('getExpectedWritingSound', () => {
    const trials = [
      { position: 3 as Position, sound: 'C' as Sound, color: 'ink-black' as Color },
      { position: 5 as Position, sound: 'H' as Sound, color: 'ink-navy' as Color },
      { position: 7 as Position, sound: 'K' as Sound, color: 'ink-burgundy' as Color },
      { position: 1 as Position, sound: 'L' as Sound, color: 'ink-forest' as Color },
    ];

    it('should return null for warmup trials', () => {
      const context = createMockContext(0, 2, trials, 0);
      expect(getExpectedWritingSound(context)).toBe(null);
    });

    it('should return T-N sound for writingStepIndex=0', () => {
      // trialIndex=3, nLevel=2 → T-N index = 1
      const context = createMockContext(3, 2, trials, 0);
      expect(getExpectedWritingSound(context)).toBe('H');
    });

    it('should return the next sound for writingStepIndex=1', () => {
      // trialIndex=3, nLevel=2, step=1 → index = 2
      const context = createMockContext(3, 2, trials, 1);
      expect(getExpectedWritingSound(context)).toBe('K');
    });
  });

  describe('getExpectedColor', () => {
    const trials = [
      { position: 3 as Position, sound: 'C' as Sound, color: 'ink-black' as Color },
      { position: 5 as Position, sound: 'H' as Sound, color: 'ink-navy' as Color },
      { position: 7 as Position, sound: 'K' as Sound, color: 'ink-burgundy' as Color },
    ];

    it('should return null for warmup trials', () => {
      const context = createMockContext(0, 2, trials);
      expect(getExpectedColor(context)).toBe(null);
    });

    it('should return N-back color after warmup', () => {
      const context = createMockContext(2, 2, trials);
      expect(getExpectedColor(context)).toBe('ink-black');
    });

    it('should return null if N-back trial does not exist', () => {
      // trials has indices 0, 1, 2. With trialIndex=5 and nLevel=2, nBackIndex=3 (out of bounds)
      const context = createMockContext(5, 2, trials);
      expect(getExpectedColor(context)).toBe(null);
    });
  });

  describe('getExpectedWritingColor', () => {
    const trials = [
      { position: 3 as Position, sound: 'C' as Sound, color: 'ink-black' as Color },
      { position: 5 as Position, sound: 'H' as Sound, color: 'ink-navy' as Color },
      { position: 7 as Position, sound: 'K' as Sound, color: 'ink-burgundy' as Color },
      { position: 1 as Position, sound: 'L' as Sound, color: 'ink-forest' as Color },
    ];

    it('should return null for warmup trials', () => {
      const context = createMockContext(0, 2, trials, 0);
      expect(getExpectedWritingColor(context)).toBe(null);
    });

    it('should return T-N color for writingStepIndex=0', () => {
      // trialIndex=3, nLevel=2 → T-N index = 1
      const context = createMockContext(3, 2, trials, 0);
      expect(getExpectedWritingColor(context)).toBe('ink-navy');
    });

    it('should return the next color for writingStepIndex=1', () => {
      // trialIndex=3, nLevel=2, step=1 → index = 2
      const context = createMockContext(3, 2, trials, 1);
      expect(getExpectedWritingColor(context)).toBe('ink-burgundy');
    });
  });

  describe('getTrialCycleDuration', () => {
    it('should calculate total duration correctly', () => {
      const spec = {
        timing: {
          stimulusDurationMs: 500,
          responseWindowMs: 2000,
          feedbackDurationMs: 500,
          intervalMs: 500,
        },
        extensions: {
          ruleDisplayMs: 1000,
        },
      } as TraceSpec;

      // 500 + 2000 + 500 + 1000 + 500 = 4500
      expect(getTrialCycleDuration(spec)).toBe(4500);
    });

    it('should use default feedback duration when not specified', () => {
      const spec = {
        timing: {
          stimulusDurationMs: 500,
          responseWindowMs: 2000,
          // No feedbackDurationMs
          intervalMs: 500,
        },
        extensions: {
          ruleDisplayMs: 1000,
        },
      } as TraceSpec;

      // Default feedback is TIMING_FEEDBACK_DEFAULT_MS = 500
      // 500 + 2000 + 500 + 1000 + 500 = 4500
      expect(getTrialCycleDuration(spec)).toBe(4500);
    });

    it('should handle zero response window', () => {
      const spec = {
        timing: {
          stimulusDurationMs: 500,
          responseWindowMs: 0,
          feedbackDurationMs: 500,
          intervalMs: 500,
        },
        extensions: {
          ruleDisplayMs: 1000,
        },
      } as TraceSpec;

      // 500 + 0 + 500 + 1000 + 500 = 2500
      expect(getTrialCycleDuration(spec)).toBe(2500);
    });
  });
});
