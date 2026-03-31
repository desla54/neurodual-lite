/**
 * IntervalTimer Unit Tests
 *
 * Tests for the timing system used by GameSession.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { IntervalTimer } from './interval-timer';
import type { AudioPort } from '../ports/audio-port';

// =============================================================================
// Mock AudioPort
// =============================================================================

function createMockAudioPort(): AudioPort & {
  advanceTime: (ms: number) => void;
  executeScheduledCallbacks: () => void;
} {
  let currentTime = 0;
  const scheduledCallbacks: Array<{ time: number; callback: () => void; id: number }> = [];
  let callbackIdCounter = 0;

  return {
    // Time management
    getCurrentTime: () => currentTime,
    advanceTime: (ms: number) => {
      currentTime += ms / 1000; // Convert ms to seconds (AudioContext uses seconds)
    },
    executeScheduledCallbacks: () => {
      const toExecute = scheduledCallbacks.filter((cb) => cb.time <= currentTime);
      for (const cb of toExecute) {
        const idx = scheduledCallbacks.indexOf(cb);
        if (idx >= 0) scheduledCallbacks.splice(idx, 1);
        cb.callback();
      }
    },

    // AudioPort interface
    scheduleCallback: (delayMs: number, callback: () => void) => {
      const id = callbackIdCounter++;
      const targetTime = currentTime + delayMs / 1000;
      scheduledCallbacks.push({ time: targetTime, callback, id });
      return id;
    },
    cancelCallback: (id: number) => {
      const idx = scheduledCallbacks.findIndex((cb) => cb.id === id);
      if (idx >= 0) scheduledCallbacks.splice(idx, 1);
    },

    // Unused in these tests
    init: mock(() => Promise.resolve()),
    play: mock(() => {}),
    playClick: mock(() => {}),
    playCorrect: mock(() => {}),
    playIncorrect: mock(() => {}),
    stopAll: mock(() => {}),
    isReady: mock(() => true),
    // @ts-expect-error test override
    setSequence: mock(() => {}),
    setOnRequestNextFromQueue: mock(() => {}),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('IntervalTimer', () => {
  let timer: IntervalTimer;
  let mockAudio: ReturnType<typeof createMockAudioPort>;

  beforeEach(() => {
    timer = new IntervalTimer();
    mockAudio = createMockAudioPort();
    // @ts-expect-error test override
    timer.init({
      audio: mockAudio,
      stimulusDurationMs: 500,
      intervalMs: 3000,
    });
  });

  describe('init', () => {
    it('should initialize with config', () => {
      expect(timer.isPaused()).toBe(false);
      expect(timer.getCurrentTime()).toBe(0);
    });
  });

  describe('startTrial', () => {
    it('should set trial start time', () => {
      mockAudio.advanceTime(100);
      timer.startTrial(0);
      expect(timer.getElapsedTime()).toBeCloseTo(0, 2);
    });

    it('should track elapsed time after start', () => {
      timer.startTrial(0);
      mockAudio.advanceTime(250);
      expect(timer.getElapsedTime()).toBeCloseTo(0.25, 2);
    });
  });

  describe('waitForStimulusEnd', () => {
    it('should resolve after stimulus duration', async () => {
      timer.startTrial(0);

      const promise = timer.waitForStimulusEnd();

      // Advance time and execute callbacks
      mockAudio.advanceTime(500);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });

    it('should use custom duration when provided', async () => {
      timer.startTrial(0);

      const promise = timer.waitForStimulusEnd(200);

      mockAudio.advanceTime(200);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });
  });

  describe('waitForResponseWindow', () => {
    it('should use provided remaining time', async () => {
      timer.startTrial(0);

      const promise = timer.waitForResponseWindow(1000);

      mockAudio.advanceTime(1000);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });
  });

  // waitForFeedback tested implicitly via integration tests

  describe('cancel', () => {
    it('should cancel pending timer and resolve with cancelled', async () => {
      timer.startTrial(0);

      const promise = timer.waitForStimulusEnd();
      timer.cancel();

      const result = await promise;
      expect(result.type).toBe('cancelled');
    });
  });

  describe('pause/resume', () => {
    it('should pause and track paused state', () => {
      timer.startTrial(0);
      expect(timer.isPaused()).toBe(false);

      timer.pause();
      expect(timer.isPaused()).toBe(true);

      timer.resume();
      expect(timer.isPaused()).toBe(false);
    });

    it('should preserve elapsed time during pause', () => {
      timer.startTrial(0);
      mockAudio.advanceTime(100);

      timer.pause();
      const elapsedAtPause = timer.getElapsedTime();

      // Time advances but elapsed should be frozen
      mockAudio.advanceTime(500);
      expect(timer.getElapsedTime()).toBeCloseTo(elapsedAtPause, 2);
    });

    it('should not pause twice', () => {
      timer.startTrial(0);
      timer.pause();
      timer.pause(); // Second call should be no-op
      expect(timer.isPaused()).toBe(true);
    });

    it('should not resume when not paused', () => {
      timer.startTrial(0);
      timer.resume(); // Should be no-op
      expect(timer.isPaused()).toBe(false);
    });
  });

  describe('notifyUserAction', () => {
    it('should be a no-op (interval mode ignores user actions for timing)', () => {
      timer.startTrial(0);
      // Should not throw
      timer.notifyUserAction();
    });
  });

  describe('waitForFeedback', () => {
    it('should wait for feedback duration', async () => {
      timer.startTrial(0);

      const promise = timer.waitForFeedback();

      // Default feedback duration from TIMING_FEEDBACK_DEFAULT_MS
      mockAudio.advanceTime(1500);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });

    it('should wait when paused', async () => {
      timer.startTrial(0);
      timer.pause();

      let resolved = false;
      timer.waitForFeedback().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);
    });
  });

  describe('waitForDuration', () => {
    it('should wait for specified duration', async () => {
      timer.startTrial(0);

      const promise = timer.waitForDuration(750);

      mockAudio.advanceTime(750);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });

    it('should resolve immediately for zero duration', async () => {
      timer.startTrial(0);
      const result = await timer.waitForDuration(0);
      expect(result.type).toBe('completed');
    });

    it('should resolve immediately for negative duration', async () => {
      timer.startTrial(0);
      const result = await timer.waitForDuration(-100);
      expect(result.type).toBe('completed');
    });

    it('should wait when paused', async () => {
      timer.startTrial(0);
      timer.pause();

      let resolved = false;
      timer.waitForDuration(500).then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);
    });
  });

  describe('getElapsedTime during pause', () => {
    it('should return frozen elapsed time when paused', () => {
      timer.startTrial(0);
      mockAudio.advanceTime(200);

      timer.pause();
      const elapsed = timer.getElapsedTime();

      mockAudio.advanceTime(500);
      expect(timer.getElapsedTime()).toBe(elapsed);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

async function advanceAndResolve(
  promise: Promise<{ type: string }>,
  mockAudio: ReturnType<typeof createMockAudioPort>,
  ms: number,
): Promise<{ type: string }> {
  mockAudio.advanceTime(ms);
  mockAudio.executeScheduledCallbacks();
  return promise;
}
