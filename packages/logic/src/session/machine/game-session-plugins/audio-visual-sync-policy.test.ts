import { describe, expect, it } from 'bun:test';
import { DefaultAudioVisualSyncPolicy } from './audio-visual-sync-policy';
import type { ModeSpec } from '../../../specs/types';
import {
  MULTI_AUDIO_STAGGER_MS,
  AUDIO_SYNC_BUFFER_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS,
} from '../../../specs/thresholds';
import type { Trial } from '../../../domain';

describe('DefaultAudioVisualSyncPolicy', () => {
  function createSpec(visualOffsetMs?: number): ModeSpec {
    return {
      id: 'test-mode',
      timing: {
        stimulusDurationMs: 500,
        intervalMs: 3000,
        visualOffsetMs,
      },
    } as unknown as ModeSpec;
  }

  function createTrial(overrides: Partial<Trial> = {}): Trial {
    return {
      index: 0,
      isBuffer: false,
      position: 0,
      sound: 0,
      color: 0,
      image: 0,
      trialType: 'filler',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
      ...overrides,
    } as Trial;
  }

  describe('constructor defaults', () => {
    it('should use default visual offset when spec does not provide one', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio'],
      });

      expect(policy.getVisualOffsetMs()).toBe(TIMING_VISUAL_OFFSET_DEFAULT_MS);
    });

    it('should use spec-provided visual offset', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(50),
        activeModalities: ['position', 'audio'],
      });

      expect(policy.getVisualOffsetMs()).toBe(50);
    });

    it('should use constant for post-visual offset', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position'],
      });

      expect(policy.getPostVisualOffsetMs()).toBe(TIMING_POST_VISUAL_OFFSET_MS);
    });

    it('should use constant for multi-audio stagger', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['audio', 'audio2'],
      });

      expect(policy.getMultiAudioStaggerMs()).toBe(MULTI_AUDIO_STAGGER_MS);
    });

    it('should use constant for audio sync buffer', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['audio'],
      });

      expect(policy.getAudioSyncBufferMs()).toBe(AUDIO_SYNC_BUFFER_MS);
    });
  });

  describe('hasMultiAudio', () => {
    it('should return true when both audio and audio2 are active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio', 'audio2'],
      });

      expect(policy.hasMultiAudio()).toBe(true);
    });

    it('should return false when only audio is active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio'],
      });

      expect(policy.hasMultiAudio()).toBe(false);
    });

    it('should return false when only audio2 is active (no audio)', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio2'],
      });

      expect(policy.hasMultiAudio()).toBe(false);
    });

    it('should return false when no audio modalities are active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'color'],
      });

      expect(policy.hasMultiAudio()).toBe(false);
    });
  });

  describe('getSyncMode', () => {
    it('should return multi-audio when audio+audio2 active and trial has sound2', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio', 'audio2'],
      });
      const trial = createTrial({ sound2: 'C' });

      expect(policy.getSyncMode(trial)).toBe('multi-audio');
    });

    it('should return single-audio when audio+audio2 active but trial has no sound2', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio', 'audio2'],
      });
      const trial = createTrial(); // no sound2

      expect(policy.getSyncMode(trial)).toBe('single-audio');
    });

    it('should return single-audio when only audio is active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio'],
      });
      const trial = createTrial({ sound2: 'C' });

      expect(policy.getSyncMode(trial)).toBe('single-audio');
    });

    it('should return visual-only when no audio modalities are active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'color'],
      });
      const trial = createTrial();

      expect(policy.getSyncMode(trial)).toBe('visual-only');
    });

    it('should return visual-only when only audio2 is active (no primary audio)', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio2'],
      });
      const trial = createTrial({ sound2: 'K' });

      expect(policy.getSyncMode(trial)).toBe('visual-only');
    });

    it('should handle null trial gracefully', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio', 'audio2'],
      });

      // null trial => trial?.sound2 is undefined => not multi-audio
      expect(policy.getSyncMode(null)).toBe('single-audio');
    });

    it('should return single-audio with null trial when only audio active', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['audio'],
      });

      expect(policy.getSyncMode(null)).toBe('single-audio');
    });

    it('should return visual-only with null trial when no audio', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position'],
      });

      expect(policy.getSyncMode(null)).toBe('visual-only');
    });
  });

  describe('visual offset = 0 by default', () => {
    it('should have zero visual offset by default for deterministic sync', () => {
      const policy = new DefaultAudioVisualSyncPolicy({
        spec: createSpec(),
        activeModalities: ['position', 'audio'],
      });

      expect(policy.getVisualOffsetMs()).toBe(0);
    });
  });
});
