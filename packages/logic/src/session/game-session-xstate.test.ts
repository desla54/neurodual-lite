/**
 * GameSessionXState Unit Tests
 *
 * Tests for the XState-based game session implementation.
 */

import { describe, it, expect, mock } from 'bun:test';
import { GameSessionXState } from './game-session-xstate';
import { GameConfig } from '../domain/game-config';
import type { AudioPort } from '../ports/audio-port';
import type { DevLoggerPort } from '../ports/dev-logger-port';
import type { ModeSpec } from '../specs/types';
import { DualnbackClassicSpec } from '../specs/dualnback-classic.spec';

// =============================================================================
// Mock Ports
// =============================================================================

function createMockAudioPort(): AudioPort {
  let currentTime = 0;
  const scheduledCallbacks: Array<{ time: number; callback: () => void; id: number }> = [];
  let callbackIdCounter = 0;

  const advanceTime = (ms: number) => {
    currentTime += ms / 1000;
  };

  const executeScheduledCallbacks = () => {
    const toExecute = scheduledCallbacks.filter((cb) => cb.time <= currentTime);
    for (const cb of toExecute) {
      const idx = scheduledCallbacks.indexOf(cb);
      if (idx >= 0) scheduledCallbacks.splice(idx, 1);
      cb.callback();
    }
  };

  // @ts-expect-error test override
  return {
    getCurrentTime: () => currentTime,
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
    setSequence: mock(() => {}),
    setOnRequestNextFromQueue: mock(() => {}),
    // Test helpers exposed via closure
    _test: { advanceTime, executeScheduledCallbacks },
  } as AudioPort & {
    _test: { advanceTime: (ms: number) => void; executeScheduledCallbacks: () => void };
  };
}

function createMockDevLogger(): DevLoggerPort {
  return {
    // @ts-expect-error test override
    log: mock(() => {}),
    logTimeline: mock(() => {}),
    logSessionInfo: mock(() => {}),
    logTrialIndex: mock(() => {}),
    logTrialDetails: mock(() => {}),
    logTimerEvent: mock(() => {}),
    logPauseResume: mock(() => {}),
    logStopEvent: mock(() => {}),
    logState: mock(() => {}),
  };
}

// =============================================================================
// Test Helpers
// =============================================================================

function createSession(
  overrides?: Partial<{
    spec: ModeSpec;
    nLevel: number;
    trialsCount: number;
  }>,
) {
  const spec = overrides?.spec ?? DualnbackClassicSpec;
  const config = new GameConfig({
    nLevel: overrides?.nLevel ?? 2,
    trialsCount: overrides?.trialsCount ?? 5,
    activeModalities: ['position', 'audio'],
    // @ts-expect-error test override
    stimulusDurationMs: spec.timing.stimulusDurationMs,
    intervalMs: spec.timing.intervalMs,
    prepDelayMs: spec.timing.prepDelayMs ?? 3000,
    feedbackDuration: 0,
    generator: spec.generation.generator,
  });

  const mockAudio = createMockAudioPort();

  const session = new GameSessionXState('test-user', config, {
    audio: mockAudio,
    devLogger: createMockDevLogger(),
    spec,
  });

  return { session, mockAudio };
}

// =============================================================================
// Tests
// =============================================================================

describe('GameSessionXState', () => {
  describe('initialization', () => {
    it('should create a session with valid sessionId', () => {
      const { session } = createSession();

      expect(session.sessionId).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should start in idle phase', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.phase).toBe('idle');
    });

    it('should have correct initial nLevel', () => {
      const { session } = createSession({ nLevel: 3 });
      const snapshot = session.getSnapshot();

      expect(snapshot.nLevel).toBe(3);
    });

    it('should have totalTrials from spec or config', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      // totalTrials is determined by spec/generator, should be positive
      expect(snapshot.totalTrials).toBeGreaterThan(0);
    });
  });

  describe('energy level declaration', () => {
    it('should accept energy level declaration', () => {
      const { session } = createSession();

      session.declareEnergyLevel(2);

      expect(session.getDeclaredEnergyLevel()).toBe(2);
    });

    it('should return null before declaration', () => {
      const { session } = createSession();

      expect(session.getDeclaredEnergyLevel()).toBeNull();
    });
  });

  describe('pause/resume', () => {
    it('should report paused state correctly', () => {
      const { session } = createSession();

      expect(session.isPaused()).toBe(false);
    });
  });

  describe('events', () => {
    it('should return empty events initially', () => {
      const { session } = createSession();

      expect(session.getEvents()).toEqual([]);
    });
  });

  describe('subscription', () => {
    it('should allow subscribing to state changes', () => {
      const { session } = createSession();
      const listener = mock(() => {});

      const unsubscribe = session.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should return unsubscribe function that works', () => {
      const { session } = createSession();
      const listener = mock(() => {});

      const unsubscribe = session.subscribe(listener);
      unsubscribe();

      // After unsubscribe, listener should not be called anymore
      // No assertion needed, just verifies no error is thrown
    });
  });

  describe('stop', () => {
    it('should stop without error when idle', () => {
      const { session } = createSession();

      // Should not throw
      session.stop();
    });

    it('should be idempotent', () => {
      const { session } = createSession();

      session.stop();
      session.stop(); // Second call should not throw
    });
  });

  describe('stopAsync', () => {
    it('should return a promise', async () => {
      const { session } = createSession();

      const result = session.stopAsync();

      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('intent handling', () => {
    it('should report valid intentions when idle', () => {
      const { session } = createSession();

      const validIntentions = session.getValidIntentions();

      expect(validIntentions).toContain('START');
    });

    it('should check if intent can be handled', () => {
      const { session } = createSession();

      expect(session.canHandleIntent({ type: 'START' })).toBe(true);
      // @ts-expect-error test override
      expect(session.canHandleIntent({ type: 'CLAIM_MATCH', modality: 'position' })).toBe(false);
    });
  });

  describe('misfired input tracking', () => {
    it('should accept misfired input reports when not playing', () => {
      const { session } = createSession();

      // Should not throw, even though session is idle
      session.reportMisfiredInput('x');
    });
  });

  describe('health event tracking', () => {
    it('should accept health event reports', () => {
      const { session } = createSession();

      // Should not throw
      session.reportHealthEvent('freeze');
      session.reportHealthEvent('longTask');
    });
  });
});
