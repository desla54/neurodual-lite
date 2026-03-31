import { describe, expect, it } from 'bun:test';
import {
  createEmptyModalityStats,
  createEmptyTraceStats,
  createEmptyAllModalityStats,
  computeModalityResult,
  computeAllModalityResults,
  updateModalityStats,
  getEnabledModalities,
  type TraceModalityStats,
  type TraceModality,
} from './trace';

describe('trace types helpers', () => {
  describe('createEmptyModalityStats', () => {
    it('should return empty SDT counts', () => {
      const stats = createEmptyModalityStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.falseAlarms).toBe(0);
      expect(stats.correctRejections).toBe(0);
    });
  });

  describe('createEmptyTraceStats', () => {
    it('should return empty running stats', () => {
      const stats = createEmptyTraceStats();
      expect(stats.trialsCompleted).toBe(0);
      expect(stats.warmupTrials).toBe(0);
      expect(stats.correctResponses).toBe(0);
      expect(stats.incorrectResponses).toBe(0);
      expect(stats.timeouts).toBe(0);
      expect(stats.accuracy).toBe(0);
    });
  });

  describe('createEmptyAllModalityStats', () => {
    it('should create stats for all enabled modalities', () => {
      const modalities: TraceModality[] = ['position', 'audio', 'color'];
      const stats = createEmptyAllModalityStats(modalities);

      expect(stats.position).toEqual({
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
      });
      expect(stats.audio).toEqual({
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
      });
      expect(stats.color).toEqual({
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
      });
    });

    it('should create stats only for specified modalities', () => {
      const modalities: TraceModality[] = ['position'];
      const stats = createEmptyAllModalityStats(modalities);

      expect(stats.position).toBeDefined();
      // Note: TypeScript typing requires all keys, but implementation only adds specified ones
      expect(Object.keys(stats)).toContain('position');
    });
  });

  describe('computeModalityResult', () => {
    describe('when modality is active', () => {
      it('should return hit when target exists, responded correctly', () => {
        const result = computeModalityResult(true, true, true, true);
        expect(result).toBe('hit');
      });

      it('should return miss when target exists but response incorrect', () => {
        const result = computeModalityResult(true, true, false, true);
        expect(result).toBe('miss');
      });

      it('should return miss when target exists but no response', () => {
        const result = computeModalityResult(true, false, false, true);
        expect(result).toBe('miss');
      });

      it('should return correctRejection when no target and no response', () => {
        const result = computeModalityResult(true, false, false, false);
        expect(result).toBe('correctRejection');
      });

      it('should return correctRejection when no target and correct empty response', () => {
        const result = computeModalityResult(true, true, true, false);
        expect(result).toBe('correctRejection');
      });

      it('should return falseAlarm when no target but responded incorrectly', () => {
        const result = computeModalityResult(true, true, false, false);
        expect(result).toBe('falseAlarm');
      });
    });

    describe('when modality is NOT active', () => {
      it('should return falseAlarm when user responded', () => {
        const result = computeModalityResult(false, true, true, true);
        expect(result).toBe('falseAlarm');
      });

      it('should return correctRejection when user did not respond', () => {
        const result = computeModalityResult(false, false, false, false);
        expect(result).toBe('correctRejection');
      });
    });
  });

  describe('computeAllModalityResults', () => {
    it('should compute results for all enabled modalities', () => {
      const activeModalities: TraceModality[] = ['position', 'audio'];
      const enabledModalities: TraceModality[] = ['position', 'audio', 'color'];

      const results = computeAllModalityResults(
        activeModalities,
        enabledModalities,
        true, // positionCorrect
        true, // audioCorrect
        null, // colorCorrect
        true, // hadPositionTarget
        true, // hadAudioTarget
        false, // hadColorTarget
      );

      expect(results.position).toBe('hit');
      expect(results.audio).toBe('hit');
      expect(results.color).toBe('correctRejection'); // Not active, no response
    });

    it('should handle position only scenario', () => {
      const activeModalities: TraceModality[] = ['position'];
      const enabledModalities: TraceModality[] = ['position'];

      const results = computeAllModalityResults(
        activeModalities,
        enabledModalities,
        false, // positionCorrect - incorrect response
        null, // audioCorrect
        null, // colorCorrect
        true, // hadPositionTarget
        false, // hadAudioTarget
        false, // hadColorTarget
      );

      expect(results.position).toBe('miss');
    });

    it('should handle color modality', () => {
      const activeModalities: TraceModality[] = ['color'];
      const enabledModalities: TraceModality[] = ['position', 'color'];

      const results = computeAllModalityResults(
        activeModalities,
        enabledModalities,
        null, // positionCorrect - no response
        null, // audioCorrect
        true, // colorCorrect
        true, // hadPositionTarget
        false, // hadAudioTarget
        true, // hadColorTarget
      );

      expect(results.position).toBe('correctRejection'); // Not active, no response
      expect(results.color).toBe('hit');
    });

    it('should handle false alarm on non-active modality', () => {
      const activeModalities: TraceModality[] = ['audio'];
      const enabledModalities: TraceModality[] = ['position', 'audio'];

      const results = computeAllModalityResults(
        activeModalities,
        enabledModalities,
        true, // positionCorrect - responded even though not active
        null, // audioCorrect - no response on active modality
        null, // colorCorrect
        true, // hadPositionTarget
        true, // hadAudioTarget
        false, // hadColorTarget
      );

      expect(results.position).toBe('falseAlarm'); // Not active but responded
      expect(results.audio).toBe('miss'); // Active but no response
    });
  });

  describe('updateModalityStats', () => {
    const baseStats: TraceModalityStats = {
      hits: 5,
      misses: 3,
      falseAlarms: 2,
      correctRejections: 10,
    };

    it('should increment hits', () => {
      const updated = updateModalityStats(baseStats, 'hit');
      expect(updated.hits).toBe(6);
      expect(updated.misses).toBe(3);
    });

    it('should increment misses', () => {
      const updated = updateModalityStats(baseStats, 'miss');
      expect(updated.misses).toBe(4);
      expect(updated.hits).toBe(5);
    });

    it('should increment falseAlarms', () => {
      const updated = updateModalityStats(baseStats, 'falseAlarm');
      expect(updated.falseAlarms).toBe(3);
      expect(updated.hits).toBe(5);
    });

    it('should increment correctRejections', () => {
      const updated = updateModalityStats(baseStats, 'correctRejection');
      expect(updated.correctRejections).toBe(11);
      expect(updated.hits).toBe(5);
    });

    it('should return new object (immutable)', () => {
      const updated = updateModalityStats(baseStats, 'hit');
      expect(updated).not.toBe(baseStats);
    });
  });

  describe('getEnabledModalities', () => {
    it('should return only position when nothing else enabled', () => {
      const modalities = getEnabledModalities({
        audioEnabled: false,
        colorEnabled: false,
      });
      expect(modalities).toEqual(['position']);
    });

    it('should include audio when enabled', () => {
      const modalities = getEnabledModalities({
        audioEnabled: true,
        colorEnabled: false,
      });
      expect(modalities).toEqual(['position', 'audio']);
    });

    it('should include color when enabled', () => {
      const modalities = getEnabledModalities({
        audioEnabled: false,
        colorEnabled: true,
      });
      expect(modalities).toEqual(['position', 'color']);
    });

    it('should include all when all enabled', () => {
      const modalities = getEnabledModalities({
        audioEnabled: true,
        colorEnabled: true,
      });
      expect(modalities).toEqual(['position', 'audio', 'color']);
    });
  });
});
