/**
 * Tests for RhythmicTimer
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { RhythmicTimer } from './rhythmic-timer';
import type { AudioPort } from '../ports/audio-port';

describe('RhythmicTimer', () => {
  let timer: RhythmicTimer;
  let mockAudio: AudioPort;
  const callbacks: Map<number, { duration: number; cb: () => void }> = new Map();
  let nextCallbackId = 1;
  let currentTime = 0;

  beforeEach(() => {
    currentTime = 0;
    callbacks.clear();
    nextCallbackId = 1;

    mockAudio = {
      getCurrentTime: mock(() => currentTime),
      scheduleCallback: mock((duration, cb) => {
        const id = nextCallbackId++;
        callbacks.set(id, { duration, cb });
        return id;
      }),
      cancelCallback: mock((id) => {
        callbacks.delete(id);
      }),
      play: mock(() => {}),
      init: mock(() => Promise.resolve()),
      stopAll: mock(() => {}),
    } as any;

    timer = new RhythmicTimer();
    timer.init({
      audio: mockAudio,
      stimulusDurationMs: 500,
      intervalMs: 2500,
      // @ts-expect-error test override
      nLevel: 2,
    });
  });

  function fastForward(ms: number) {
    currentTime += ms;
    // Execute all callbacks that should have fired
    for (const [id, item] of callbacks.entries()) {
      // This is a simplified mock timer, we don't track absolute scheduled time
      // but for rhythmic timer tests, we manually trigger them or advance currentTime.
    }
  }

  test('should initialize and start trial', () => {
    timer.startTrial(0);
    expect(mockAudio.getCurrentTime).toHaveBeenCalled();
  });

  test('waitForStimulusEnd should resolve after duration', async () => {
    const promise = timer.waitForStimulusEnd();

    // Trigger callback manually
    const callback = callbacks.get(1);
    expect(callback?.duration).toBe(500);
    callback?.cb();

    const result = await promise;
    expect(result.type).toBe('completed');
  });

  test('waitForResponseWindow should resolve with timeout', async () => {
    const promise = timer.waitForResponseWindow();

    const callback = callbacks.get(1);
    expect(callback?.duration).toBe(2000); // 2500 - 500
    callback?.cb();

    const result = await promise;
    expect(result.type).toBe('timeout');
  });

  test('notifyUserAction should resolve early', async () => {
    const promise = timer.waitForResponseWindow();

    // Advance time past minimum interval (default 300ms)
    currentTime = 400;
    timer.notifyUserAction();

    const result = await promise;
    expect(result.type).toBe('user-action');
    // @ts-expect-error test override
    expect(result.elapsedMs).toBe(400);
    expect(mockAudio.cancelCallback).toHaveBeenCalled();
  });

  test('notifyUserAction should ignore spam', async () => {
    const promise = timer.waitForResponseWindow();

    currentTime = 50; // Less than 100ms (threshold)
    timer.notifyUserAction();

    // The callback from scheduleCallback should still be there
    expect(callbacks.size).toBe(1);

    // Resolve manually to finish the test
    const id = Array.from(callbacks.keys())[0];
    // @ts-expect-error test override
    callbacks.get(id)?.cb();
    await promise;
  });

  describe('Wait methods when paused', () => {
    test('waitForStimulusEnd should queue when paused', async () => {
      timer.pause();
      const promise = timer.waitForStimulusEnd();
      expect(callbacks.size).toBe(0);

      timer.resume();
      expect(callbacks.size).toBe(1);
      const id = Array.from(callbacks.keys())[0];
      // @ts-expect-error test override
      callbacks.get(id)?.cb();
      await promise;
    });

    test('waitForResponseWindow should queue when paused', async () => {
      timer.pause();
      const promise = timer.waitForResponseWindow();
      expect(callbacks.size).toBe(0);

      timer.resume();
      expect(callbacks.size).toBe(1);
      const id = Array.from(callbacks.keys())[0];
      // @ts-expect-error test override
      callbacks.get(id)?.cb();
      await promise;
    });

    test('waitForFeedback should queue when paused', async () => {
      timer.pause();
      const promise = timer.waitForFeedback();
      expect(callbacks.size).toBe(0);
      // Access private member via cast to check it's set
      expect((timer as any).pendingResolve).toBeDefined();

      timer.resume();
      const id = Array.from(callbacks.keys())[0];
      // @ts-expect-error test override
      callbacks.get(id)?.cb();
      await promise;
    });

    test('waitForDuration should queue when paused', async () => {
      timer.pause();
      const promise = timer.waitForDuration(100);
      expect(callbacks.size).toBe(0);
      expect((timer as any).pendingResolve).toBeDefined();

      timer.resume();
      const id = Array.from(callbacks.keys())[0];
      // @ts-expect-error test override
      callbacks.get(id)?.cb();
      await promise;
    });
  });

  test('waitForFeedback should use default duration', async () => {
    timer.waitForFeedback();
    const callback = callbacks.get(1);
    expect(callback?.duration).toBeDefined();
  });

  test('waitForDuration should resolve immediately for non-positive values', async () => {
    const result = await timer.waitForDuration(0);
    expect(result.type).toBe('completed');
  });

  test('waitForDuration should schedule for positive values', async () => {
    timer.waitForDuration(100);
    expect(callbacks.get(1)?.duration).toBe(100);
  });

  test('cancel should abort pending waits', async () => {
    const promise = timer.waitForStimulusEnd();
    timer.cancel();
    const result = await promise;
    expect(result.type).toBe('cancelled');
  });

  describe('Pause/Resume', () => {
    test('pause should stop current timer', () => {
      timer.waitForStimulusEnd();
      expect(callbacks.size).toBe(1);
      timer.pause();
      expect(callbacks.size).toBe(0);
      expect(timer.isPaused()).toBe(true);
    });

    test('resume should reschedule remaining time', async () => {
      const promise = timer.waitForResponseWindow(); // 2000ms
      currentTime = 500;
      timer.pause();

      currentTime = 1000;
      timer.resume();

      expect(callbacks.size).toBe(1);
      const callback = Array.from(callbacks.values())[0];
      expect(callback!.duration).toBe(1500); // 2000 - 500
      expect(timer.isPaused()).toBe(false);
    });

    test('getElapsedTime should work when paused', () => {
      timer.startTrial(0);
      currentTime = 1000;
      timer.pause();
      currentTime = 2000;
      expect(timer.getElapsedTime()).toBe(1000);
    });

    test('should not pause twice', () => {
      timer.pause();
      const callCount = (mockAudio.getCurrentTime as any).mock.calls.length;
      timer.pause();
      expect((mockAudio.getCurrentTime as any).mock.calls.length).toBe(callCount);
    });

    test('should not resume if not paused', () => {
      timer.resume();
      expect(mockAudio.scheduleCallback).not.toHaveBeenCalled();
    });
  });

  test('getCurrentTime utility', () => {
    currentTime = 1234;
    expect(timer.getCurrentTime()).toBe(1234);
  });
});
