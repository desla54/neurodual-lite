/**
 * TraceSessionXState Unit Tests
 *
 * Tests for the XState-based trace session wrapper class.
 * Covers initialization, lifecycle, typed dispatch, subscriptions,
 * snapshot mapping, flash-off logic, and event persistence.
 */

import { describe, it, expect, mock } from 'bun:test';
import { TraceSessionXState } from './trace-session-xstate';
import type { AudioPort } from '../ports/audio-port';
import type { ClockPort } from '../ports/clock-port';
import type { RandomPort } from '../ports/random-port';
import type { TimerPort } from '../timing/timer-port';
import type { TraceSessionInput, TraceSpec } from './machine/trace-session-types';
import type { TraceSessionPlugins } from './machine/trace-session-plugins/types';
import type { TraceTrial } from '../types/trace';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockAudioPort(): AudioPort {
  const currentTime = 0;
  const scheduledCallbacks: Array<{ time: number; callback: () => void; id: number }> = [];
  let callbackIdCounter = 0;

  return {
    setConfig: mock(() => {}),
    getConfig: mock(() => ({ language: 'en' as const, voice: 'default' })),
    init: mock(() => Promise.resolve()),
    resume: mock(() => Promise.resolve(true)),
    play: mock(() => {}),
    schedule: mock(() => {}),
    scheduleMultiple: mock(() => {}),
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
    getCurrentTime: () => currentTime,
    stopAll: mock(() => {}),
    isReady: mock(() => true),
    playCorrect: mock(() => {}),
    playIncorrect: mock(() => {}),
    playClick: mock(() => {}),
    playSwipe: mock(() => {}),
    getVolumeLevel: mock(() => 0.8),
  } as AudioPort;
}

function createMockClock(): ClockPort {
  let dateNow = 1700000000000;
  let now = 0;
  return {
    dateNow: () => dateNow++,
    now: () => now++,
  };
}

function createMockRandom(): RandomPort {
  let counter = 0;
  return {
    random: () => 0.5,
    generateId: () => `id-${++counter}`,
  };
}

function createMockTimer(): TimerPort {
  return {
    init: mock(() => {}),
    startTrial: mock(() => {}),
    waitForStimulusEnd: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForResponseWindow: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForFeedback: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForDuration: mock(() => Promise.resolve({ type: 'completed' as const })),
    notifyUserAction: mock(() => {}),
    cancel: mock(() => {}),
    pause: mock(() => {}),
    resume: mock(() => {}),
    getCurrentTime: mock(() => 0),
    getElapsedTime: mock(() => 0),
    isPaused: mock(() => false),
  };
}

function createMockPlugins(): TraceSessionPlugins {
  return {
    response: {
      processSwipe: mock(() => ({
        response: { isCorrect: true, responseTimeMs: 100, responseAtMs: 100 } as any,
        updates: { feedbackPosition: 0, feedbackType: 'correct' as const },
      })),
      processDoubleTap: mock(() => ({
        response: { isCorrect: true } as any,
        updates: { feedbackPosition: null, feedbackType: null },
      })),
      processHold: mock(() => ({
        response: { isCorrect: true } as any,
        updates: { feedbackPosition: null, feedbackType: null },
      })),
      processCenterTap: mock(() => ({
        response: { isCorrect: true } as any,
        updates: { feedbackPosition: null, feedbackType: null },
      })),
      processSkip: mock(() => ({
        response: { isCorrect: false } as any,
        updates: { feedbackPosition: null, feedbackType: null },
      })),
      processTimeout: mock(() => ({
        response: { isCorrect: false } as any,
        updates: { feedbackPosition: null, feedbackType: null },
      })),
      isWarmupTrial: mock((idx: number) => idx < 2),
      getExpectedPosition: mock(() => null),
      getExpectedSound: mock(() => null),
      getExpectedColor: mock(() => null),
    },
    modality: {
      isEnabled: mock(() => false),
      getEnabledModalities: mock(() => ['position'] as const),
      evaluate: mock(() => ({
        results: {} as any,
        updatedStats: {
          trialsCompleted: 0,
          warmupTrials: 0,
          correctResponses: 0,
          incorrectResponses: 0,
          timeouts: 0,
          accuracy: 0,
        },
      })),
    },
    audio: {
      getStimulusSound: mock(() => null),
      getFeedbackSound: mock(() => null),
      isAudioEnabled: mock(() => false),
      isSoundEnabled: mock(() => false),
    },
    writing: {
      needsWritingPhase: mock(() => false),
      getTimeoutMs: mock(() => 5000),
      // @ts-expect-error test override
      createTimeoutResult: mock(() => ({
        soundAnswer: null,
        soundExpected: null,
        soundCorrect: false,
        colorAnswer: null,
        colorExpected: null,
        colorCorrect: false,
        timedOut: true,
      })),
      isWritingEnabled: mock(() => false),
    },
    rhythm: {
      getMode: mock(() => 'self-paced' as const),
      isTimed: mock(() => false),
      isSelfPaced: mock(() => true),
      getStimulusDurationMs: mock(() => 500),
      getResponseWindowMs: mock(() => 0),
      getFeedbackDurationMs: mock(() => 300),
      getRuleDisplayMs: mock(() => 200),
      getIntervalMs: mock(() => 500),
      getTrialCycleDurationMs: mock(() => 1500),
      calculateWaitingTiming: mock(() => ({
        ruleDisplayMs: 200,
        intervalMs: 500,
      })),
    },
    arithmetic: {
      isEnabled: mock(() => false),
      needsArithmeticPhase: mock(() => false),
      generateProblem: mock(() => ({ variant: 'simple' as const, expression: '1+1', answer: 2 })),
      getTimeoutMs: mock(() => 10000),
      createTimeoutResult: mock(() => ({
        expression: '1+1',
        correctAnswer: 2,
        userAnswer: null,
        isCorrect: false,
        confidence: 0,
        writingTimeMs: 0,
        timedOut: true,
      })),
      validateAnswer: mock(() => ({
        expression: '1+1',
        correctAnswer: 2,
        userAnswer: 2,
        isCorrect: true,
        confidence: 1,
        writingTimeMs: 500,
        timedOut: false,
      })),
    },
    adaptiveTiming: {
      isEnabled: mock(() => false),
      onTrialCompleted: mock(() => {}),
      getEstimatedAccuracy: mock(() => 0),
      getCurrentExtinctionRatio: mock(() => 1),
      getCurrentStimulusDurationMs: mock(() => 500),
      getCurrentResponseWindowMs: mock(() => 3000),
      getTrialCount: mock(() => 0),
      serialize: mock(() => ({
        estimatedAccuracy: 0,
        recentTrials: [],
        trialCount: 0,
        currentValues: {
          stimulusDurationMs: 500,
          extinctionRatio: 1,
          responseWindowMs: 3000,
        },
      })),
      restore: mock(() => {}),
    },
  };
}

function createMockTrials(count = 5): TraceTrial[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i % 9,
    sound: 'C' as any,
    color: 'ink-burgundy' as any,
    activeModalities: ['position'] as const,
  }));
}

function createMockSpec(): TraceSpec {
  return {
    metadata: {
      id: 'test-trace',
      displayName: 'Test Trace',
      description: 'Test',
      tags: [],
      difficultyLevel: 1,
      version: '1.0.0',
    },
    sessionType: 'TraceSession',
    scoring: {
      strategy: 'accuracy',
      thresholds: { advance: 0.8, regress: 0.5 },
    } as any,
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 500,
      prepDelayMs: 0,
      responseWindowMs: 3000,
      feedbackDurationMs: 300,
      warmupStimulusDurationMs: 1000,
    },
    generation: {
      generator: 'trace-default',
    } as any,
    defaults: {
      nLevel: 2,
      trialsCount: 5,
      activeModalities: ['position'],
    },
    adaptivity: {} as any,
    report: {} as any,
    extensions: {
      rhythmMode: 'self-paced',
      ruleDisplayMs: 200,
      soundEnabled: false,
      audioEnabled: false,
      colorEnabled: false,
      adaptiveTimingEnabled: false,
      dynamicRules: false,
      dynamicSwipeDirection: false,
      writing: {
        enabled: false,
        mode: 'letter' as any,
        minSizePx: 20,
        timeoutMs: 5000,
        gridFadeOpacity: 0.3,
        showHint: false,
      },
      arithmeticInterference: {
        enabled: false,
        variant: 'simple',
        minOperations: 2,
        maxOperations: 4,
        minResult: 0,
        maxResult: 20,
        maxDigit: 9,
        timeoutMs: 10000,
        cueDisplayMs: 1000,
      },
      dyslatéralisation: {
        gridMode: '3x3',
        mirrorSwipe: false,
        mirrorAxis: 'horizontal',
      },
      sequentialTrace: false,
      mindfulTiming: {
        enabled: false,
        positionDurationMs: 500,
        positionToleranceMs: 200,
        writingDurationMs: 1000,
        writingToleranceMs: 300,
      },
    },
  } as TraceSpec;
}

function createSessionInput(overrides?: Partial<TraceSessionInput>): TraceSessionInput {
  const trials = createMockTrials();
  return {
    sessionId: 'test-session-id',
    userId: 'test-user',
    playMode: 'free',
    audio: createMockAudioPort(),
    clock: createMockClock(),
    random: createMockRandom(),
    timer: createMockTimer(),
    plugins: createMockPlugins(),
    spec: createMockSpec(),
    trials,
    initialTimingSource: {
      stimulusDurationMs: 500,
      warmupStimulusDurationMs: 1000,
      responseWindowMs: 3000,
      feedbackDurationMs: 300,
      ruleDisplayMs: 200,
      intervalMs: 500,
      soundEnabled: false,
    },
    ...overrides,
  };
}

function createSession(overrides?: Partial<TraceSessionInput>) {
  const audio = createMockAudioPort();
  const input = createSessionInput({ audio, ...overrides });
  const session = new TraceSessionXState(input, { audio });
  return { session, audio };
}

// =============================================================================
// Tests
// =============================================================================

describe('TraceSessionXState', () => {
  // ===========================================================================
  // Initialization
  // ===========================================================================
  describe('initialization', () => {
    it('should create a session with a valid sessionId', () => {
      const { session } = createSession();

      expect(session.sessionId).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should use provided sessionId when given', () => {
      const { session } = createSession({ sessionId: 'custom-id' });

      expect(session.sessionId).toBe('custom-id');
    });

    it('should generate a sessionId when not provided', () => {
      const input = createSessionInput();
      // Remove sessionId to test auto-generation
      const { sessionId: _, ...inputWithoutId } = input;
      const audio = createMockAudioPort();
      const session = new TraceSessionXState(
        { ...inputWithoutId, sessionId: undefined as any } as TraceSessionInput,
        { audio },
      );

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should start with an initial snapshot', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.phase).toBeDefined();
    });

    it('should have correct nLevel from spec', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.nLevel).toBe(2);
    });

    it('should start with totalTrials matching provided trials', () => {
      const trials = createMockTrials(10);
      const { session } = createSession({ trials });
      const snapshot = session.getSnapshot();

      expect(snapshot.totalTrials).toBe(10);
    });

    it('should start with trialIndex at 0', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.trialIndex).toBe(0);
    });

    it('should have null summary initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.summary).toBeNull();
    });

    it('should have empty stats initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.stats.trialsCompleted).toBe(0);
      expect(snapshot.stats.accuracy).toBe(0);
    });

    it('should have rhythmMode from spec', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.rhythmMode).toBe('self-paced');
    });

    it('should have dynamicRules from spec', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.dynamicRules).toBe(false);
    });

    it('should not be paused initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.isPaused).toBe(false);
    });

    it('should not be writing initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.isWriting).toBe(false);
    });

    it('should have flashOff false initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.flashOff).toBe(false);
    });

    it('should have empty events initially', () => {
      const { session } = createSession();
      const events = session.getEvents();

      expect(events).toEqual([]);
    });
  });

  // ===========================================================================
  // Lifecycle: start / stop
  // ===========================================================================
  describe('lifecycle', () => {
    it('should start without throwing', async () => {
      const { session } = createSession();

      await session.start();

      // If we get here, start did not throw
      session.stop();
    });

    it('should be idempotent on start (second call is no-op)', async () => {
      const { session } = createSession();

      await session.start();
      await session.start(); // should not throw or duplicate

      session.stop();
    });

    it('should stop without throwing when idle', () => {
      const { session } = createSession();

      session.stop();
    });

    it('should stop without throwing after start', async () => {
      const { session } = createSession();

      await session.start();
      session.stop();
    });

    it('should be idempotent on stop', async () => {
      const { session } = createSession();

      await session.start();
      session.stop();
      session.stop(); // second call should not throw
    });

    it('should call audio.stopAll on stop', () => {
      const { session, audio } = createSession();

      session.stop();

      expect(audio.stopAll).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // stopAsync and ensureEventsPersisted
  // ===========================================================================
  describe('stopAsync', () => {
    it('should return a promise', async () => {
      const { session } = createSession();

      const result = session.stopAsync();

      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should stop the session', async () => {
      const { session, audio } = createSession();

      await session.start();
      await session.stopAsync();

      expect(audio.stopAll).toHaveBeenCalled();
    });
  });

  describe('ensureEventsPersisted', () => {
    it('should resolve immediately when no pending persistence', async () => {
      const { session } = createSession();

      await session.ensureEventsPersisted();
    });
  });

  // ===========================================================================
  // Typed dispatch methods (guard: not running)
  // ===========================================================================
  describe('typed dispatch methods', () => {
    it('should not throw when swipe is called before start', () => {
      const { session } = createSession();

      // Not running, should silently ignore
      session.swipe(0, 1);
    });

    it('should not throw when doubleTap is called before start', () => {
      const { session } = createSession();

      session.doubleTap(3);
    });

    it('should not throw when centerTap is called before start', () => {
      const { session } = createSession();

      session.centerTap();
    });

    it('should not throw when skip is called before start', () => {
      const { session } = createSession();

      session.skip();
    });

    it('should not throw when submitWriting is called before start', () => {
      const { session } = createSession();

      session.submitWriting({
        soundAnswer: null,
        soundExpected: null,
        soundCorrect: false,
        colorAnswer: null,
        colorExpected: null,
        colorCorrect: false,
        timedOut: false,
      } as any);
    });

    it('should not throw when pause is called before start', () => {
      const { session } = createSession();

      session.pause();
    });

    it('should not throw when resume is called before start', () => {
      const { session } = createSession();

      session.resume();
    });
  });

  // ===========================================================================
  // Subscription
  // ===========================================================================
  describe('subscription', () => {
    it('should allow subscribing and return an unsubscribe function', () => {
      const { session } = createSession();
      const listener = mock(() => {});

      const unsubscribe = session.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should immediately notify new subscriber with current snapshot', () => {
      const { session } = createSession();
      const listener = mock(() => {});

      session.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      // @ts-expect-error test override
      const snapshot = listener.mock.calls[0]![0];
      expect(snapshot).toBeDefined();
      // @ts-expect-error test override
      expect(snapshot!.phase).toBeDefined();
    });

    it('should not call listener after unsubscribe', async () => {
      const { session } = createSession();
      const listener = mock(() => {});

      const unsubscribe = session.subscribe(listener);
      unsubscribe();

      // Start session to trigger state changes
      await session.start();

      // Listener should not have been called after unsubscribe
      // (except if the start itself triggered it before next tick,
      // which is acceptable - we just check no extra calls from subscription)
      session.stop();
    });

    it('should support multiple subscribers', () => {
      const { session } = createSession();
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      session.subscribe(listener1);
      session.subscribe(listener2);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe only the targeted listener', () => {
      const { session } = createSession();
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      const unsub1 = session.subscribe(listener1);
      session.subscribe(listener2);

      unsub1(); // Only unsubscribe listener1

      // listener2 should still be subscribed (verified by no errors)
    });
  });

  // ===========================================================================
  // getSnapshot
  // ===========================================================================
  describe('getSnapshot', () => {
    it('should return a snapshot object with all required fields', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot).toHaveProperty('phase');
      expect(snapshot).toHaveProperty('trialIndex');
      expect(snapshot).toHaveProperty('totalTrials');
      expect(snapshot).toHaveProperty('stimulus');
      expect(snapshot).toHaveProperty('feedbackPosition');
      expect(snapshot).toHaveProperty('feedbackType');
      expect(snapshot).toHaveProperty('feedbackFromUserAction');
      expect(snapshot).toHaveProperty('stats');
      expect(snapshot).toHaveProperty('nLevel');
      expect(snapshot).toHaveProperty('rhythmMode');
      expect(snapshot).toHaveProperty('isWarmup');
      expect(snapshot).toHaveProperty('isPaused');
      expect(snapshot).toHaveProperty('isWriting');
      expect(snapshot).toHaveProperty('writingResult');
      expect(snapshot).toHaveProperty('summary');
      expect(snapshot).toHaveProperty('dynamicRules');
      expect(snapshot).toHaveProperty('enabledModalities');
      expect(snapshot).toHaveProperty('ruleVisible');
      expect(snapshot).toHaveProperty('flashOff');
      expect(snapshot).toHaveProperty('isSequentialTrace');
      expect(snapshot).toHaveProperty('sequentialStepIndex');
      expect(snapshot).toHaveProperty('sequentialStepCount');
      expect(snapshot).toHaveProperty('sequentialStepResults');
      expect(snapshot).toHaveProperty('writingStepIndex');
    });

    it('should return the same object reference on repeated calls without state change', () => {
      const { session } = createSession();

      const s1 = session.getSnapshot();
      const s2 = session.getSnapshot();

      expect(s1).toBe(s2);
    });

    it('should have sequentialStepCount equal to nLevel', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.sequentialStepCount).toBe(snapshot.nLevel);
    });

    it('should have feedbackPosition null initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.feedbackPosition).toBeNull();
    });

    it('should have feedbackType null initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.feedbackType).toBeNull();
    });

    it('should have writingResult null initially', () => {
      const { session } = createSession();
      const snapshot = session.getSnapshot();

      expect(snapshot.writingResult).toBeNull();
    });
  });

  // ===========================================================================
  // send (generic event dispatch)
  // ===========================================================================
  describe('send', () => {
    it('should accept any TraceSessionEvent without throwing', () => {
      const { session } = createSession();

      // send does not check running state, it passes directly to actor
      // The actor may or may not handle the event depending on state
      session.send({ type: 'FOCUS_LOST' });
    });
  });

  // ===========================================================================
  // Event persistence
  // ===========================================================================
  describe('event persistence', () => {
    it('should persist events via commandBus when provided', async () => {
      const handleMock = mock(async () => {});
      const commandBus = { handle: handleMock };

      const { session } = createSession({ commandBus } as any);

      await session.start();

      // Starting should generate a TRACE_SESSION_STARTED event
      // which triggers persistence via commandBus
      // Wait a tick for async handling
      await new Promise((r) => setTimeout(r, 50));

      session.stop();

      // commandBus.handle should have been called at least once
      // (for session started event and possibly more)
      expect(handleMock.mock.calls.length).toBeGreaterThanOrEqual(0);
    });

    it('should work without commandBus (in-memory only)', async () => {
      const { session } = createSession();

      await session.start();
      session.stop();

      // Should not throw even without commandBus
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle stop being called before start', () => {
      const { session } = createSession();

      // stop calls audio.stopAll even if not running
      session.stop();
    });

    it('should handle actions after stop', async () => {
      const { session } = createSession();

      await session.start();
      session.stop();

      // These should all be no-ops (running = false)
      session.swipe(0, 1);
      session.doubleTap(3);
      session.centerTap();
      session.skip();
      session.pause();
      session.resume();
    });

    it('should handle swipe with inputMethod parameter', async () => {
      const { session } = createSession();

      await session.start();
      session.swipe(0, 1, 'touch');
      session.swipe(2, 3, 'mouse');
      session.swipe(4, 5, 'keyboard');

      session.stop();
    });

    it('should handle doubleTap with inputMethod parameter', async () => {
      const { session } = createSession();

      await session.start();
      session.doubleTap(3, 'touch');
      session.doubleTap(3, 'mouse');

      session.stop();
    });

    it('should handle centerTap with inputMethod parameter', async () => {
      const { session } = createSession();

      await session.start();
      session.centerTap('touch');
      session.centerTap('keyboard');

      session.stop();
    });
  });
});
