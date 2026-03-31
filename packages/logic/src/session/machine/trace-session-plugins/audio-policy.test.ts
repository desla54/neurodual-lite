/**
 * Tests for DefaultAudioPolicy
 *
 * Validates audio decision logic in isolation.
 * No audio service needed - pure decision tests.
 */

import { describe, it, expect } from 'bun:test';
import { createDefaultAudioPolicy } from './audio-policy';
import type { TraceTrial } from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';

// =============================================================================
// Test Setup
// =============================================================================

function createMockSpec(audioEnabled = false, soundEnabled = false): TraceSpec {
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
    defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position'] },
    // @ts-expect-error test override
    report: { sections: [] },
    // @ts-expect-error test override
    extensions: {
      rhythmMode: 'timed',
      dynamicRules: false,
      dynamicSwipeDirection: false,
      audioEnabled,
      soundEnabled,
      colorEnabled: false,
      writingEnabled: false,
      writingTimeoutMs: 5000,
      ruleDisplayMs: 500,
    },
  };
}

function createMockTrial(
  sound: string | null = 'A',
  tone: TraceTrial['tone'] = undefined,
): TraceTrial {
  return {
    position: 0,
    sound: sound as any,
    color: 'ink-black',
    activeModalities: ['position'],
    swipeDirection: 'n-to-target',
    tone,
  };
}

describe('DefaultAudioPolicy', () => {
  // ===========================================================================
  // Configuration Queries
  // ===========================================================================

  describe('isAudioEnabled', () => {
    it('should return false when audioEnabled is false', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, false),
      });
      expect(policy.isAudioEnabled()).toBe(false);
    });

    it('should return true when audioEnabled is true', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, false),
      });
      expect(policy.isAudioEnabled()).toBe(true);
    });
  });

  describe('isSoundEnabled', () => {
    it('should return false when soundEnabled is false', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, false),
      });
      expect(policy.isSoundEnabled()).toBe(false);
    });

    it('should return true when soundEnabled is true', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      expect(policy.isSoundEnabled()).toBe(true);
    });
  });

  // ===========================================================================
  // Stimulus Sound
  // ===========================================================================

  describe('getStimulusSound', () => {
    it('should return null when no trial', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, true),
      });
      expect(policy.getStimulusSound(null)).toBe(null);
    });

    it('should return null when both audio and sound are disabled', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, false),
      });
      const trial = createMockTrial('A');
      expect(policy.getStimulusSound(trial)).toBe(null);
    });

    it('should return letter sound when audioEnabled is true', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, false),
      });
      const trial = createMockTrial('A');
      expect(policy.getStimulusSound(trial)).toEqual({ sound: 'A' });
    });

    it('should return click when soundEnabled but not audioEnabled', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      const trial = createMockTrial('A');
      expect(policy.getStimulusSound(trial)).toEqual({ click: true });
    });

    it('should prefer letter sound over click when both enabled', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, true),
      });
      const trial = createMockTrial('B');
      expect(policy.getStimulusSound(trial)).toEqual({ sound: 'B' });
    });

    it('should return click when audioEnabled but trial has no sound', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, true),
      });
      const trial = createMockTrial(null);
      expect(policy.getStimulusSound(trial)).toEqual({ click: true });
    });

    it('should return null when audioEnabled but trial has no sound and soundEnabled is false', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, false),
      });
      const trial = createMockTrial(null);
      expect(policy.getStimulusSound(trial)).toBe(null);
    });

    it('should return tone stimulus when trial has a tone', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      const trial = createMockTrial(null, 'C4');
      expect(policy.getStimulusSound(trial)).toEqual({ tone: 'C4' });
    });

    it('should return both tone and letter sound when both are present', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(true, true),
      });
      const trial = createMockTrial('B', 'D4');
      expect(policy.getStimulusSound(trial)).toEqual({ sound: 'B', tone: 'D4' });
    });
  });

  // ===========================================================================
  // Feedback Sound
  // ===========================================================================

  describe('getFeedbackSound', () => {
    it('should return null when soundEnabled is false', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, false),
      });
      expect(policy.getFeedbackSound('correct')).toBe(null);
      expect(policy.getFeedbackSound('incorrect')).toBe(null);
    });

    it('should return null when feedbackType is null', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      expect(policy.getFeedbackSound(null)).toBe(null);
    });

    it('should return correct when feedbackType is correct', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      expect(policy.getFeedbackSound('correct')).toBe('correct');
    });

    it('should return incorrect when feedbackType is incorrect', () => {
      const policy = createDefaultAudioPolicy({
        spec: createMockSpec(false, true),
      });
      expect(policy.getFeedbackSound('incorrect')).toBe('incorrect');
    });
  });
});
