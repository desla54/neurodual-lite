import { describe, expect, it } from 'bun:test';
import { DefaultAudioPolicy } from './audio-policy';
import { AUDIO_SYNC_BUFFER_MS } from '../../../domain';

describe('DefaultAudioPolicy (memo)', () => {
  describe('shouldPlayStimulus', () => {
    it('should return true when audio is in active modalities', () => {
      const policy = new DefaultAudioPolicy();
      expect(policy.shouldPlayStimulus(['position', 'audio'])).toBe(true);
    });

    it('should return false when audio is not in active modalities', () => {
      const policy = new DefaultAudioPolicy();
      expect(policy.shouldPlayStimulus(['position'])).toBe(false);
    });

    it('should return true when only audio is active', () => {
      const policy = new DefaultAudioPolicy();
      expect(policy.shouldPlayStimulus(['audio'])).toBe(true);
    });

    it('should return false for empty modalities', () => {
      const policy = new DefaultAudioPolicy();
      expect(policy.shouldPlayStimulus([])).toBe(false);
    });
  });

  describe('getAudioSyncBufferMs', () => {
    it('should return the correct buffer value', () => {
      const policy = new DefaultAudioPolicy();
      expect(policy.getAudioSyncBufferMs()).toBe(AUDIO_SYNC_BUFFER_MS);
    });
  });
});
