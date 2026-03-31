/**
 * SelfPacedTimer Unit Tests
 *
 * Tests for the self-paced timing system used by PlaceSession, MemoSession, etc.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SelfPacedTimer } from './self-paced-timer';
import type { AudioPort } from '../ports/audio-port';
import type { TimerConfig } from './timer-port';

// =============================================================================
// Mock AudioPort
// =============================================================================

function createMockAudioPort() {
  let currentTime = 0;
  const scheduledCallbacks: Array<{ time: number; callback: () => void; id: number }> = [];
  let callbackIdCounter = 0;

  return {
    getCurrentTime: () => currentTime,
    advanceTime: (ms: number) => {
      currentTime += ms / 1000;
    },
    executeScheduledCallbacks: () => {
      const toExecute = scheduledCallbacks.filter((cb) => cb.time <= currentTime);
      for (const cb of toExecute) {
        const idx = scheduledCallbacks.indexOf(cb);
        if (idx >= 0) scheduledCallbacks.splice(idx, 1);
        cb.callback();
      }
    },
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
    init: mock(() => Promise.resolve()),
    play: mock(() => {}),
    playClick: mock(() => {}),
    playCorrect: mock(() => {}),
    playIncorrect: mock(() => {}),
    stopAll: mock(() => {}),
    isReady: mock(() => true),
  };
}

function createConfig(mockAudio: ReturnType<typeof createMockAudioPort>): TimerConfig {
  return {
    mode: 'self-paced',
    audio: mockAudio as unknown as AudioPort,
    stimulusDurationMs: 500,
    intervalMs: 3000,
    feedbackDurationMs: 200,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SelfPacedTimer', () => {
  let timer: SelfPacedTimer;
  let mockAudio: ReturnType<typeof createMockAudioPort>;

  beforeEach(() => {
    timer = new SelfPacedTimer();
    mockAudio = createMockAudioPort();
    timer.init(createConfig(mockAudio));
  });

  describe('init', () => {
    it('should initialize with config', () => {
      expect(timer.isPaused()).toBe(false);
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
      mockAudio.advanceTime(500);
      expect(timer.getElapsedTime()).toBeCloseTo(0.5, 2);
    });
  });

  describe('waitForStimulusEnd', () => {
    it('should resolve immediately in self-paced mode', async () => {
      timer.startTrial(0);
      const result = await timer.waitForStimulusEnd();
      expect(result.type).toBe('completed');
    });

    it('should ignore duration parameter', async () => {
      timer.startTrial(0);
      const result = await timer.waitForStimulusEnd(5000);
      expect(result.type).toBe('completed');
    });
  });

  describe('waitForResponseWindow', () => {
    it('should wait until notifyUserAction is called', async () => {
      timer.startTrial(0);

      let resolved = false;
      const promise = timer.waitForResponseWindow().then((result) => {
        resolved = true;
        return result;
      });

      // Not resolved yet
      await Promise.resolve();
      expect(resolved).toBe(false);

      // User action triggers resolution
      mockAudio.advanceTime(1500);
      timer.notifyUserAction();

      const result = await promise;
      expect(result.type).toBe('user-action');
      // @ts-expect-error test override
      expect(result.elapsedMs).toBeCloseTo(1.5, 1);
    });
  });

  describe('notifyUserAction', () => {
    it('should resolve pending wait', async () => {
      timer.startTrial(0);

      const promise = timer.waitForResponseWindow();
      mockAudio.advanceTime(200);
      timer.notifyUserAction();

      const result = await promise;
      expect(result.type).toBe('user-action');
    });

    it('should be no-op if no pending wait', () => {
      timer.startTrial(0);
      // Should not throw
      timer.notifyUserAction();
    });
  });

  describe('cancel', () => {
    it('should cancel pending wait and resolve with cancelled', async () => {
      timer.startTrial(0);

      const promise = timer.waitForResponseWindow();
      timer.cancel();

      const result = await promise;
      expect(result.type).toBe('cancelled');
    });

    it('should be safe to call when nothing is pending', () => {
      timer.startTrial(0);
      // Should not throw
      timer.cancel();
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
      mockAudio.advanceTime(300);

      timer.pause();
      const elapsedAtPause = timer.getElapsedTime();

      mockAudio.advanceTime(1000);
      expect(timer.getElapsedTime()).toBeCloseTo(elapsedAtPause, 2);
    });

    it('should resume with correct elapsed time', () => {
      timer.startTrial(0);
      mockAudio.advanceTime(300);

      timer.pause();
      mockAudio.advanceTime(500); // Time passes during pause
      timer.resume();

      mockAudio.advanceTime(200);
      // Elapsed should be 300 (before pause) + 200 (after resume) = 500ms = 0.5s
      expect(timer.getElapsedTime()).toBeCloseTo(0.5, 1);
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

  describe('getCurrentTime', () => {
    it('should return current audio time', () => {
      mockAudio.advanceTime(1000);
      expect(timer.getCurrentTime()).toBe(1);
    });
  });

  describe('waitForFeedback', () => {
    it('should wait for feedback duration', async () => {
      timer.startTrial(0);

      const promise = timer.waitForFeedback();

      // Feedback duration is 200ms in config
      mockAudio.advanceTime(200);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });

    it('should cancel feedback timer on user action', async () => {
      timer.startTrial(0);

      const promise = timer.waitForFeedback();

      // User action before timer completes
      mockAudio.advanceTime(100);
      timer.notifyUserAction();

      const result = await promise;
      expect(result.type).toBe('user-action');
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

      const promise = timer.waitForDuration(500);

      mockAudio.advanceTime(500);
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

    it('should return cancelled when paused', async () => {
      timer.startTrial(0);
      timer.pause();

      const result = await timer.waitForDuration(500);
      expect(result.type).toBe('cancelled');
    });

    it('should NOT be interrupted by notifyUserAction', async () => {
      timer.startTrial(0);

      const promise = timer.waitForDuration(500);

      mockAudio.advanceTime(250);
      timer.notifyUserAction(); // Should NOT affect waitForDuration

      mockAudio.advanceTime(250);
      mockAudio.executeScheduledCallbacks();

      const result = await promise;
      expect(result.type).toBe('completed');
    });
  });

  describe('waitForResponseWindow when paused', () => {
    it('should wait when paused', async () => {
      timer.startTrial(0);
      timer.pause();

      let resolved = false;
      timer.waitForResponseWindow().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);
    });
  });

  describe('pause cancels pending feedback timer', () => {
    it('should cancel feedback timer on pause', async () => {
      timer.startTrial(0);

      const promise = timer.waitForFeedback();
      mockAudio.advanceTime(100);

      timer.pause();

      // Resume and trigger user action
      timer.resume();
      timer.notifyUserAction();

      const result = await promise;
      expect(result.type).toBe('user-action');
    });
  });
});
