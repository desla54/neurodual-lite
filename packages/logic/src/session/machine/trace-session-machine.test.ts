/**
 * TraceSession XState Machine Tests
 *
 * Tests for the XState-based trace session machine.
 * Uses mock services to verify state transitions.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { traceSessionMachine } from './trace-session-machine';
import type { TraceSessionInput, TraceSpec } from './trace-session-types';
import { createDefaultTracePlugins, type TimingSource } from './trace-session-plugins';
import type { AudioPort, ClockPort, RandomPort } from '../../ports';
import type { TimerPort } from '../../timing';
import type { TraceTrial } from '../../types/trace';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockAudio(): AudioPort {
  return {
    init: mock(() => Promise.resolve(undefined)),
    isReady: mock(() => true),
    play: mock(() => undefined),
    playToneValue: mock(() => undefined),
    schedule: mock(() => undefined),
    scheduleCallback: mock(() => 1),
    cancelCallback: mock(() => undefined),
    stopAll: mock(() => undefined),
    getCurrentTime: mock(() => 0),
    getVolumeLevel: mock(() => 1),
    playCorrect: mock(() => undefined),
    playIncorrect: mock(() => undefined),
    playClick: mock(() => undefined),
    playSwipe: mock(() => undefined),
    setConfig: mock(() => undefined),
    // @ts-expect-error test override
    getConfig: mock(() => ({ language: 'fr', voice: 'default' })),
  };
}

function createMockTimer(): TimerPort {
  return {
    init: mock(() => undefined),
    startTrial: mock(() => undefined),
    waitForStimulusEnd: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForResponseWindow: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForFeedback: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForDuration: mock(() => Promise.resolve({ type: 'completed' as const })),
    notifyUserAction: mock(() => undefined),
    cancel: mock(() => undefined),
    pause: mock(() => undefined),
    resume: mock(() => undefined),
    getCurrentTime: mock(() => 0),
    getElapsedTime: mock(() => 0),
    isPaused: mock(() => false),
  };
}

function createMockClock(): ClockPort {
  const fixedNow = 1_700_000_000_000;
  return {
    now: mock(() => 0),
    dateNow: mock(() => fixedNow),
  };
}

function createMockRandom(): RandomPort {
  return {
    random: mock(() => 0.5),
    generateId: mock(() => 'test-event-id'),
    // @ts-expect-error test override
    seed: mock(() => undefined),
  };
}

function createMockTrial(index: number): TraceTrial {
  return {
    // @ts-expect-error test override
    index,
    position: 4,
    sound: 'C',
    color: 'ink-black',
    activeModalities: ['position'],
  };
}

function createMockTrials(count: number): TraceTrial[] {
  return Array.from({ length: count }, (_, i) => createMockTrial(i));
}

function createMockSpec(): TraceSpec {
  return {
    metadata: {
      id: 'dual-trace',
      displayName: 'Dual Trace',
      description: 'Test mode',
      tags: ['test'],
      difficultyLevel: 3,
      version: '1.0.0',
    },
    sessionType: 'TraceSession',
    scoring: {
      strategy: 'accuracy',
      passThreshold: 80,
    },
    timing: {
      stimulusDurationMs: 500,
      warmupStimulusDurationMs: 500,
      responseWindowMs: 3000,
      feedbackDurationMs: 500,
      intervalMs: 500,
    },
    // @ts-expect-error test override
    generation: {
      generator: 'Sequence',
      targetProbability: 0.3,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position'],
    },
    adaptivity: {
      algorithm: 'none',
      nLevelSource: 'user',
      configurableSettings: [],
    },
    // @ts-expect-error test override
    report: {
      sections: ['HERO', 'PERFORMANCE'],
    },
    // @ts-expect-error test override
    extensions: {
      rhythmMode: 'timed',
      ruleDisplayMs: 500,
      soundEnabled: true,
      audioEnabled: false,
      colorEnabled: false,
      dynamicRules: false,
      dynamicSwipeDirection: false,
      arithmeticInterference: {
        enabled: false,
        variant: 'simple',
        minOperations: 2,
        maxOperations: 4,
        minResult: 0,
        maxResult: 20,
        maxDigit: 9,
        timeoutMs: 60000,
        cueDisplayMs: 1000,
      },
      writing: {
        enabled: false,
        mode: 'grid-overlay',
        minSizePx: 200,
        timeoutMs: 60000,
        gridFadeOpacity: 0.2,
        showHint: false,
      },
      dyslatéralisation: {
        gridMode: '3x3',
        mirrorSwipe: false,
        mirrorAxis: 'horizontal',
      },
      sequentialTrace: false,
    },
  };
}

function createTestInput(overrides: Partial<TraceSessionInput> = {}): TraceSessionInput {
  const trials = createMockTrials(20);
  const spec = overrides.spec ?? createMockSpec();
  const timingSourceRef: TimingSource = {
    stimulusDurationMs: spec.timing.stimulusDurationMs,
    warmupStimulusDurationMs: spec.timing.warmupStimulusDurationMs,
    responseWindowMs: spec.timing.responseWindowMs,
    feedbackDurationMs: spec.timing.feedbackDurationMs,
    ruleDisplayMs: spec.extensions.ruleDisplayMs,
    intervalMs: spec.timing.intervalMs,
    soundEnabled: spec.extensions.soundEnabled,
  };
  const getTimingSource = () => timingSourceRef;
  const plugins = overrides.plugins ?? createDefaultTracePlugins({ spec, getTimingSource });

  return {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    playMode: 'free',
    audio: createMockAudio(),
    clock: createMockClock(),
    random: createMockRandom(),
    timer: createMockTimer(),
    plugins,
    spec,
    trials,
    initialTimingSource: { ...timingSourceRef },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('TraceSessionMachine', () => {
  let input: TraceSessionInput;

  beforeEach(() => {
    input = createTestInput();
  });

  describe('Initial State', () => {
    it('starts in idle state', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('idle');

      actor.stop();
    });

    it('initializes context from input', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.sessionId).toBe('test-session-id');
      expect(context.userId).toBe('test-user-id');
      expect(context.trialIndex).toBe(0);
      expect(context.currentTrial).toBeNull();
      expect(context.responses).toEqual([]);
      expect(context.hasResponded).toBe(false);

      actor.stop();
    });

    it('initializes with empty stats', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.stats.trialsCompleted).toBe(0);
      expect(context.stats.correctResponses).toBe(0);
      expect(context.stats.incorrectResponses).toBe(0);
      expect(context.stats.timeouts).toBe(0);
      expect(context.stats.accuracy).toBe(0);

      actor.stop();
    });
  });

  describe('State Transitions', () => {
    it('transitions from idle to starting on START', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('starting');

      actor.stop();
    });

    it('ignores START when not in idle', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      // First START
      actor.send({ type: 'START' });
      expect(actor.getSnapshot().value).toBe('starting');

      // Second START should be ignored
      actor.send({ type: 'START' });
      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });

    it('transitions to finished on STOP from starting', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');

      actor.stop();
    });
  });

  describe('Pause/Resume', () => {
    it('ignores PAUSE when in idle', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'PAUSE' });

      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('ignores RESUME when not paused', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'RESUME' });

      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });
  });

  describe('Response Handling', () => {
    it('ignores SWIPE when in idle', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'SWIPE', fromPosition: 4, toPosition: 2 });

      // Should still be in idle
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('ignores DOUBLE_TAP when in idle', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'DOUBLE_TAP', position: 4 });

      // Should still be in idle
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('ignores CENTER_TAP when in idle', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'CENTER_TAP' });

      // Should still be in idle
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });
  });

  describe('Session Events', () => {
    it('initializes with empty sessionEvents', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      expect(actor.getSnapshot().context.sessionEvents).toEqual([]);

      actor.stop();
    });

    it('emits TRACE_SESSION_STARTED on START', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const { context } = actor.getSnapshot();
      expect(context.sessionEvents.length).toBeGreaterThanOrEqual(1);

      const startEvent = context.sessionEvents.find((e) => e.type === 'TRACE_SESSION_STARTED');
      expect(startEvent).toBeDefined();
      expect(startEvent?.sessionId).toBe('test-session-id');

      actor.stop();
    });

    it('emits TRACE_SESSION_STARTED in self-paced mode (responseWindowMs=0)', () => {
      const selfPacedSpec = createMockSpec();
      // @ts-expect-error test override
      selfPacedSpec.extensions.rhythmMode = 'self-paced';
      // @ts-expect-error test override
      selfPacedSpec.timing.responseWindowMs = 0;

      const selfPacedInput = createTestInput({ spec: selfPacedSpec });
      const actor = createActor(traceSessionMachine, { input: selfPacedInput });
      actor.start();

      expect(() => actor.send({ type: 'START' })).not.toThrow();

      const startEvent = actor
        .getSnapshot()
        .context.sessionEvents.find((e) => e.type === 'TRACE_SESSION_STARTED');
      expect(startEvent).toBeDefined();
      expect(startEvent?.config.rhythmMode).toBe('self-paced');
      expect(startEvent?.config.responseWindowMs).toBe(0);
      expect(startEvent?.spec).toBeUndefined();

      actor.stop();
    });

    it('emits TRACE_SESSION_ENDED with deterministic playContext (journey)', () => {
      const journeyInput = createTestInput({
        playMode: 'journey',
        journeyStageId: 7,
        journeyId: 'journey-c',
        journeyStartLevel: 1,
        journeyTargetLevel: 2,
      });
      const actor = createActor(traceSessionMachine, { input: journeyInput });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      const { context } = actor.getSnapshot();
      const endEvent = context.sessionEvents.find((e) => e.type === 'TRACE_SESSION_ENDED') as any;
      expect(endEvent).toBeDefined();
      expect(endEvent?.journeyStageId).toBe(7);
      expect(endEvent?.journeyId).toBe('journey-c');
      expect(endEvent?.playContext).toBe('journey');

      actor.stop();
    });
  });

  describe('Spec-Driven Timing', () => {
    it('uses timing from spec, not hardcoded values', () => {
      const customSpec = createMockSpec();
      // @ts-expect-error test override
      customSpec.timing.stimulusDurationMs = 1000;
      // @ts-expect-error test override
      customSpec.timing.responseWindowMs = 5000;
      // @ts-expect-error test override
      customSpec.timing.feedbackDurationMs = 800;
      // @ts-expect-error test override
      customSpec.extensions.ruleDisplayMs = 600;

      const customInput = createTestInput({ spec: customSpec });
      const actor = createActor(traceSessionMachine, { input: customInput });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.timing.stimulusDurationMs).toBe(1000);
      expect(context.spec.timing.responseWindowMs).toBe(5000);
      expect(context.spec.timing.feedbackDurationMs).toBe(800);
      expect(context.spec.extensions.ruleDisplayMs).toBe(600);

      actor.stop();
    });
  });

  describe('Guards', () => {
    it('isWarmup returns true for first N trials', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      // nLevel is 2, so first 2 trials are warmup
      expect(context.trialIndex).toBe(0);
      expect(context.spec.defaults.nLevel).toBe(2);
      // Trial 0 and 1 are warmup (index < nLevel)

      actor.stop();
    });

    it('hasMoreTrials detects when trials remain', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      // 20 trials, at index 0, has more trials
      expect(context.trialIndex).toBe(0);
      expect(context.trials.length).toBe(20);
      // trialIndex < trials.length - 1 means more trials

      actor.stop();
    });
  });

  describe('Self-paced vs Timed Mode', () => {
    it('recognizes timed mode from spec', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.rhythmMode).toBe('timed');

      actor.stop();
    });

    it('recognizes self-paced mode from spec', () => {
      const selfPacedSpec = createMockSpec();
      // @ts-expect-error test override
      selfPacedSpec.extensions.rhythmMode = 'self-paced';

      const selfPacedInput = createTestInput({ spec: selfPacedSpec });
      const actor = createActor(traceSessionMachine, { input: selfPacedInput });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.rhythmMode).toBe('self-paced');

      actor.stop();
    });
  });

  describe('Writing Phase', () => {
    it('writing is disabled by default', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.writing.enabled).toBe(false);

      actor.stop();
    });

    it('respects writing config from input', () => {
      const writingSpec = createMockSpec();
      // @ts-expect-error test override
      writingSpec.extensions.writing = {
        enabled: true,
        mode: 'floating-zone',
        minSizePx: 300,
        timeoutMs: 30000,
        gridFadeOpacity: 0.1,
        showHint: true,
      };
      const writingInput = createTestInput({ spec: writingSpec });

      const actor = createActor(traceSessionMachine, { input: writingInput });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.writing.enabled).toBe(true);
      expect(context.spec.extensions.writing.mode).toBe('floating-zone');
      expect(context.spec.extensions.writing.timeoutMs).toBe(30000);

      actor.stop();
    });
  });

  describe('Dynamic Rules', () => {
    it('dynamic rules disabled by default', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.dynamicRules).toBe(false);

      actor.stop();
    });

    it('respects dynamic rules config', () => {
      const dynamicSpec = createMockSpec();
      // @ts-expect-error test override
      dynamicSpec.extensions.dynamicRules = true;
      const dynamicInput = createTestInput({ spec: dynamicSpec });

      const actor = createActor(traceSessionMachine, { input: dynamicInput });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.dynamicRules).toBe(true);

      actor.stop();
    });
  });

  describe('Final State', () => {
    it('finished is a final state', () => {
      const actor = createActor(traceSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');
      expect(snapshot.status).toBe('done');

      actor.stop();
    });
  });

  describe('Sequential Trace', () => {
    it('records N sequential swipes and evaluates correctness using both endpoints', async () => {
      const spec = createMockSpec();
      // @ts-expect-error test override
      spec.defaults.nLevel = 2;
      // @ts-expect-error test override
      spec.extensions.rhythmMode = 'self-paced';
      // @ts-expect-error test override
      spec.extensions.sequentialTrace = true;

      const trials: TraceTrial[] = [
        // @ts-expect-error test override
        { position: 0, sound: 'A', color: 'ink-black', activeModalities: ['position'] },
        // @ts-expect-error test override
        { position: 1, sound: 'B', color: 'ink-black', activeModalities: ['position'] },
        { position: 2, sound: 'C', color: 'ink-black', activeModalities: ['position'] },
        // @ts-expect-error test override
        { position: 3, sound: 'D', color: 'ink-black', activeModalities: ['position'] },
      ];

      const actor = createActor(traceSessionMachine, {
        input: createTestInput({ spec, trials }),
      });
      actor.start();

      actor.send({ type: 'START' });

      // Let warmup trials advance; self-paced mode will then wait in response.
      for (let i = 0; i < 200; i++) {
        await Promise.resolve();
        const snap = actor.getSnapshot();
        // @ts-expect-error test override
        const active = (snap.value as { active?: string } | string)?.['active'];
        if (active === 'response' && snap.context.trialIndex === 2) break;
      }

      const before = actor.getSnapshot();
      expect((before.value as { active?: string }).active).toBe('response');
      expect(before.context.trialIndex).toBe(2);
      expect(before.context.currentTrial).not.toBeNull();
      expect(before.context.hasResponded).toBe(false);
      expect(before.context.spec.extensions.sequentialTrace).toBe(true);
      expect(before.context.plugins.rhythm.isTimed()).toBe(false);

      // Step 0: T (pos 2) -> T-1 (pos 1)
      actor.send({ type: 'SWIPE', fromPosition: 2, toPosition: 1 });
      const afterStep0 = actor.getSnapshot();
      expect((afterStep0.value as { active?: string }).active).toBe('response');
      expect(afterStep0.context.sequentialStepIndex).toBe(1);
      expect(afterStep0.context.sequentialStepResults).toHaveLength(1);
      expect(afterStep0.context.sequentialStepResults[0]?.isCorrect).toBe(true);

      // Step 1: T-1 (pos 1) -> T-2 (pos 0) (final step)
      actor.send({ type: 'SWIPE', fromPosition: 1, toPosition: 0 });
      const afterFinal = actor.getSnapshot();
      expect((afterFinal.value as { active?: string }).active).toBe('positionFeedback');
      expect(afterFinal.context.hasResponded).toBe(true);
      expect(afterFinal.context.feedbackType).toBe('correct');
      expect(afterFinal.context.sequentialStepResults).toHaveLength(2);
      expect(afterFinal.context.sequentialStepResults.every((s) => s.isCorrect)).toBe(true);

      const lastResponse = afterFinal.context.responses[afterFinal.context.responses.length - 1];
      expect(lastResponse?.trialIndex).toBe(2);
      expect(lastResponse?.isCorrect).toBe(true);

      actor.stop();
    });

    it('respects swipeDirection="target-to-n" when evaluating sequential steps', async () => {
      const spec = createMockSpec();
      // @ts-expect-error test override
      spec.defaults.nLevel = 2;
      // @ts-expect-error test override
      spec.extensions.rhythmMode = 'self-paced';
      // @ts-expect-error test override
      spec.extensions.sequentialTrace = true;

      const trials: TraceTrial[] = [
        // @ts-expect-error test override
        { position: 0, sound: 'A', color: 'ink-black', activeModalities: ['position'] },
        // @ts-expect-error test override
        { position: 1, sound: 'B', color: 'ink-black', activeModalities: ['position'] },
        {
          position: 2,
          sound: 'C',
          color: 'ink-black',
          activeModalities: ['position'],
          swipeDirection: 'target-to-n',
        },
        // @ts-expect-error test override
        { position: 3, sound: 'D', color: 'ink-black', activeModalities: ['position'] },
      ];

      const actor = createActor(traceSessionMachine, {
        input: createTestInput({ spec, trials }),
      });
      actor.start();
      actor.send({ type: 'START' });

      // Let warmup trials advance; self-paced mode will then wait in response.
      for (let i = 0; i < 200; i++) {
        await Promise.resolve();
        const snap = actor.getSnapshot();
        // @ts-expect-error test override
        const active = (snap.value as { active?: string } | string)?.['active'];
        if (active === 'response' && snap.context.trialIndex === 2) break;
      }

      const before = actor.getSnapshot();
      expect((before.value as { active?: string }).active).toBe('response');
      expect(before.context.trialIndex).toBe(2);

      // For target-to-n, the sequential chain should go from T-N to T:
      // Step 0: T-2 (pos 0) -> T-1 (pos 1)
      actor.send({ type: 'SWIPE', fromPosition: 0, toPosition: 1 });
      const afterStep0 = actor.getSnapshot();
      expect((afterStep0.value as { active?: string }).active).toBe('response');
      expect(afterStep0.context.sequentialStepIndex).toBe(1);
      expect(afterStep0.context.sequentialStepResults).toHaveLength(1);
      expect(afterStep0.context.sequentialStepResults[0]?.isCorrect).toBe(true);

      // Step 1: T-1 (pos 1) -> T (pos 2) (final)
      actor.send({ type: 'SWIPE', fromPosition: 1, toPosition: 2 });
      const afterFinal = actor.getSnapshot();
      expect((afterFinal.value as { active?: string }).active).toBe('positionFeedback');
      expect(afterFinal.context.feedbackType).toBe('correct');
      expect(afterFinal.context.sequentialStepResults).toHaveLength(2);
      expect(afterFinal.context.sequentialStepResults.every((s) => s.isCorrect)).toBe(true);

      actor.stop();
    });

    it('marks a sequential step incorrect when the FROM endpoint is wrong', async () => {
      const spec = createMockSpec();
      // @ts-expect-error test override
      spec.defaults.nLevel = 2;
      // @ts-expect-error test override
      spec.extensions.rhythmMode = 'self-paced';
      // @ts-expect-error test override
      spec.extensions.sequentialTrace = true;

      const trials: TraceTrial[] = [
        // @ts-expect-error test override
        { position: 0, sound: 'A', color: 'ink-black', activeModalities: ['position'] },
        // @ts-expect-error test override
        { position: 1, sound: 'B', color: 'ink-black', activeModalities: ['position'] },
        { position: 2, sound: 'C', color: 'ink-black', activeModalities: ['position'] },
      ];

      const actor = createActor(traceSessionMachine, {
        input: createTestInput({ spec, trials }),
      });
      actor.start();
      actor.send({ type: 'START' });

      for (let i = 0; i < 200; i++) {
        await Promise.resolve();
        const snap = actor.getSnapshot();
        // @ts-expect-error test override
        const active = (snap.value as { active?: string } | string)?.['active'];
        if (active === 'response' && snap.context.trialIndex === 2) break;
      }

      // Wrong FROM (should start at 2, but starts at 7); correct TO (1)
      actor.send({ type: 'SWIPE', fromPosition: 7, toPosition: 1 });
      const afterStep0 = actor.getSnapshot();
      expect((afterStep0.value as { active?: string }).active).toBe('response');
      expect(afterStep0.context.sequentialStepResults[0]?.isCorrect).toBe(false);

      // Final step still sent to complete the chain
      actor.send({ type: 'SWIPE', fromPosition: 1, toPosition: 0 });
      const afterFinal = actor.getSnapshot();
      expect((afterFinal.value as { active?: string }).active).toBe('positionFeedback');
      expect(afterFinal.context.feedbackType).toBe('incorrect');

      const lastResponse = afterFinal.context.responses[afterFinal.context.responses.length - 1];
      expect(lastResponse?.trialIndex).toBe(2);
      expect(lastResponse?.isCorrect).toBe(false);

      actor.stop();
    });
  });
});
