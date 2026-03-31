/**
 * GameSession XState Machine Tests
 *
 * Tests for the XState-based game session machine.
 * Uses mock services to verify state transitions.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { gameSessionMachine } from './game-session-machine';
import type { GameSessionInput } from './types';
import { createDefaultGamePlugins } from './game-session-plugins';
import type { AudioPort } from '../../ports';
import type { TimerPort } from '../../timing';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { RunningStatsCalculator } from '../../coach/running-stats';
import type { GameConfig, Trial } from '../../domain';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockAudio(): AudioPort {
  return {
    init: mock(() => Promise.resolve(undefined)),
    isReady: mock(() => true),
    // @ts-expect-error test override
    playSound: mock(() => undefined),
    schedule: mock(() => undefined),
    scheduleCallback: mock(() => 1),
    cancelCallback: mock(() => undefined),
    stopAll: mock(() => undefined),
    getCurrentTime: mock(() => 0),
    getVolumeLevel: mock(() => 1),
    playCorrect: mock(() => undefined),
    playIncorrect: mock(() => undefined),
    playClick: mock(() => undefined),
    setConfig: mock(() => undefined),
    unloadAll: mock(() => undefined),
    getBufferCount: mock(() => 0),
  };
}

function createMockTimer(): TimerPort {
  return {
    init: mock(() => undefined),
    startTrial: mock(() => undefined),
    waitForStimulusEnd: mock(() => Promise.resolve({ type: 'completed' as const })),
    waitForResponseWindow: mock(() => Promise.resolve({ type: 'completed' as const })),
    cancel: mock(() => undefined),
    getCurrentTime: mock(() => 0),
    // @ts-expect-error test override
    reset: mock(() => undefined),
  };
}

function createMockTrial(index: number): Trial {
  return {
    index,
    position: 4,
    sound: 'C',
    // @ts-expect-error test override
    color: 'blue',
    isPositionTarget: false,
    isAudioTarget: false,
    isColorTarget: false,
  };
}

function createMockGenerator(totalTrials = 22): TrialGenerator {
  let trialIndex = 0;
  return {
    generateNext: mock(() => createMockTrial(trialIndex++)),
    hasMore: mock(() => trialIndex < totalTrials),
    getTotalTrials: mock(() => totalTrials),
    skipTo: mock(() => undefined),
    getISI: mock(() => 2.5),
    getZoneNumber: mock(() => null),
    getTargetProbability: mock(() => null),
    getLureProbability: mock(() => null),
    getGameParameters: mock(() => null),
    isAdaptive: mock(() => false),
    processFeedback: mock(() => undefined),
    // @ts-expect-error test override
    getAlgorithmType: mock(() => null),
    serializeAlgorithmState: mock(() => null),
    restoreAlgorithmState: mock(() => undefined),
  };
}

function createMockStatsCalculator(): RunningStatsCalculator {
  return {
    calculate: mock(() => ({
      currentDPrime: 1.5,
      byModality: {},
    })),
    record: mock(() => undefined),
    reset: mock(() => undefined),
  } as unknown as RunningStatsCalculator;
}

function createMockConfig(): GameConfig {
  // @ts-expect-error test override
  return {
    nLevel: 2,
    trialsCount: 20,
    intervalSeconds: 2.5,
    stimulusDurationSeconds: 0.5,
    activeModalities: ['position', 'audio'],
    generator: 'PreGenerated',
    targetProbability: 0.25,
  } as GameConfig;
}

function createMockSpec() {
  return {
    metadata: {
      id: 'test-mode',
      displayName: 'Test Mode',
      description: 'Test mode for unit tests',
      tags: ['test'],
      difficultyLevel: 3,
      version: '1.0.0',
    },
    sessionType: 'GameSession' as const,
    scoring: {
      strategy: 'sdt' as const,
      passThreshold: 1.5,
      downThreshold: 0.8,
    },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 2500,
      prepDelayMs: 0, // Skip countdown in tests
    },
    generation: {
      generator: 'BrainWorkshop' as const,
      targetProbability: 0.25,
      lureProbability: 0.125,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'] as const,
    },
    adaptivity: {
      algorithm: 'none' as const,
      nLevelSource: 'user' as const,
      configurableSettings: [] as string[],
    },
    report: {
      sections: ['HERO', 'PERFORMANCE'] as const,
    },
  };
}

function createTestInput(overrides: Partial<GameSessionInput> = {}): GameSessionInput {
  const spec = overrides.spec ?? createMockSpec();
  return {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    playMode: 'free',
    config: createMockConfig(),
    audio: createMockAudio(),
    timer: createMockTimer(),
    generator: createMockGenerator(),
    statsCalculator: createMockStatsCalculator(),
    judge: null,
    // @ts-expect-error test override
    spec,
    trialsSeed: 'test-seed',
    plugins: createDefaultGamePlugins({
      spec: spec as import('../../specs/types').ModeSpec,
      activeModalities: createMockConfig().activeModalities,
    }),
    ...overrides,
  };
}

async function waitForCondition(
  condition: () => boolean,
  { timeoutMs = 250, stepMs = 5 }: { timeoutMs?: number; stepMs?: number } = {},
): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timeout while waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('GameSessionMachine', () => {
  let input: GameSessionInput;

  beforeEach(() => {
    input = createTestInput();
  });

  describe('Initial State', () => {
    it('starts in idle state', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('idle');

      actor.stop();
    });

    it('initializes context from input', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.sessionId).toBe('test-session-id');
      expect(context.userId).toBe('test-user-id');
      expect(context.trialIndex).toBe(0);
      expect(context.currentTrial).toBeNull();

      actor.stop();
    });
  });

  describe('State Transitions', () => {
    it('transitions from idle to starting on START', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('starting');

      actor.stop();
    });

    it('ignores START when not in idle', () => {
      const actor = createActor(gameSessionMachine, { input });
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
      const actor = createActor(gameSessionMachine, { input });
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
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      actor.send({ type: 'PAUSE' });

      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('ignores RESUME when not paused', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'RESUME' });

      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });
  });

  describe('Response Handling', () => {
    it('ignores RESPOND when in idle', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      actor.send({ type: 'RESPOND', modalityId: 'position' });

      // Should still be in idle
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });
  });

  describe('Context Updates', () => {
    it('increments trialIndex on trial generation', async () => {
      // This test would require waiting for async state transitions
      // For now, just verify the machine can be created and started
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      expect(actor.getSnapshot().context.trialIndex).toBe(0);

      actor.stop();
    });
  });

  describe('Session Events', () => {
    it('initializes with empty sessionEvents', () => {
      const actor = createActor(gameSessionMachine, { input });
      actor.start();

      expect(actor.getSnapshot().context.sessionEvents).toEqual([]);

      actor.stop();
    });

    it('uses explicit playMode for SESSION_STARTED playContext', () => {
      const actor = createActor(gameSessionMachine, {
        input: createTestInput({
          playMode: 'free',
        }),
      });
      actor.start();
      actor.send({ type: 'START' });

      const startEvent = actor
        .getSnapshot()
        .context.sessionEvents.find((event) => event.type === 'SESSION_STARTED');

      expect(startEvent).toBeDefined();
      expect((startEvent as { playContext?: 'journey' | 'free' }).playContext).toBe('free');

      actor.stop();
    });

    it('accepts calibration playMode for SESSION_STARTED playContext', () => {
      const actor = createActor(gameSessionMachine, {
        input: createTestInput({
          playMode: 'calibration',
        }),
      });
      actor.start();
      actor.send({ type: 'START' });

      const startEvent = actor
        .getSnapshot()
        .context.sessionEvents.find((event) => event.type === 'SESSION_STARTED');

      expect(startEvent).toBeDefined();
      expect(
        (startEvent as { playContext?: 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' })
          .playContext,
      ).toBe('calibration');

      actor.stop();
    });
  });

  describe('Spec-Driven Configuration', () => {
    it('sets audioPreset from spec when starting', async () => {
      const mockAudio = createMockAudio();
      const specWithPreset = {
        metadata: { id: 'dualnback-classic', displayName: 'Sim Jaeggi' },
        sessionType: 'GameSession' as const,
        scoring: { strategy: 'dualnback-classic' as const, passThreshold: 3 },
        timing: {
          stimulusDurationMs: 500,
          intervalMs: 3000,
          prepDelayMs: 0, // Skip countdown in tests
          audioPreset: 'default' as const,
        },
        generation: {
          generator: 'DualnbackClassic' as const,
          targetProbability: 0.5,
          lureProbability: 0,
        },
        defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position', 'audio'] },
        adaptivity: {
          algorithm: 'none' as const,
          nLevelSource: 'user' as const,
          configurableSettings: [],
        },
        report: { sections: [] },
      };

      const inputWithSpec = createTestInput({
        audio: mockAudio,
        // @ts-expect-error test override
        spec: specWithPreset,
      });

      const actor = createActor(gameSessionMachine, { input: inputWithSpec });
      actor.start();
      actor.send({ type: 'START' });

      // Wait for async initAudio to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudio.setConfig).toHaveBeenCalledWith({ audioPreset: 'default' });
      actor.stop();
    });

    it('does not set audioPreset when spec has no audioPreset', async () => {
      const mockAudio = createMockAudio();
      const specWithoutPreset = {
        metadata: { id: 'dual-catch', displayName: 'Dual Catch' },
        sessionType: 'GameSession' as const,
        scoring: { strategy: 'sdt' as const, passThreshold: 1.5 },
        timing: {
          stimulusDurationMs: 500,
          intervalMs: 3000,
          prepDelayMs: 0, // Skip countdown in tests
          // No audioPreset defined
        },
        generation: {
          generator: 'Sequence' as const,
          targetProbability: 0.3,
          lureProbability: 0.15,
        },
        defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position', 'audio'] },
        adaptivity: {
          algorithm: 'none' as const,
          nLevelSource: 'user' as const,
          configurableSettings: [],
        },
        report: { sections: [] },
      };

      const inputWithSpec = createTestInput({
        audio: mockAudio,
        // @ts-expect-error test override
        spec: specWithoutPreset,
      });

      const actor = createActor(gameSessionMachine, { input: inputWithSpec });
      actor.start();
      actor.send({ type: 'START' });

      // Wait for async initAudio to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // setConfig should NOT be called for audioPreset
      expect(mockAudio.setConfig).not.toHaveBeenCalled();
      actor.stop();
    });

    it('uses visualOffsetMs from spec when scheduling audio', async () => {
      const mockAudio = createMockAudio();
      const mockTimer = createMockTimer();
      const specWithVisualTransition = {
        metadata: { id: 'dualnback-classic', displayName: 'Sim Jaeggi' },
        sessionType: 'GameSession' as const,
        scoring: { strategy: 'dualnback-classic' as const, passThreshold: 3 },
        timing: {
          stimulusDurationMs: 500,
          intervalMs: 3000,
          prepDelayMs: 0, // Skip countdown in tests
          visualOffsetMs: 0, // Spec-defined value
        },
        generation: {
          generator: 'DualnbackClassic' as const,
          targetProbability: 0.5,
          lureProbability: 0,
        },
        defaults: { nLevel: 2, trialsCount: 20, activeModalities: ['position', 'audio'] },
        adaptivity: {
          algorithm: 'none' as const,
          nLevelSource: 'user' as const,
          configurableSettings: [],
        },
        report: { sections: [] },
      };

      const inputWithSpec = createTestInput({
        audio: mockAudio,
        timer: mockTimer,
        // @ts-expect-error test override
        spec: specWithVisualTransition,
      });

      const actor = createActor(gameSessionMachine, { input: inputWithSpec });
      actor.start();
      actor.send({ type: 'START' });

      // Wait for state to transition to active.stimulus.
      // Poll with retries to avoid fixed sleeps.
      for (let i = 0; i < 50; i++) {
        const state = actor.getSnapshot().value;
        if (typeof state === 'object' && 'active' in state) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Check that audio.schedule was called with visualOffsetMs: 0
      expect(mockAudio.schedule).toHaveBeenCalledWith(
        expect.any(String), // sound
        expect.any(Number), // delayMs (AUDIO_SYNC_BUFFER_MS)
        expect.any(Function), // onSync callback
        expect.objectContaining({
          visualOffsetMs: 0, // From spec.timing.visualOffsetMs
        }),
      );

      actor.stop();
    });
  });

  describe('Event capture (timing quality)', () => {
    it('emits RESPONSE_FILTERED when a response is too fast', async () => {
      let audioTimeSec = 1000;
      const audio = createMockAudio();
      audio.getCurrentTime = mock(() => audioTimeSec);

      const timer = createMockTimer();
      // Keep stimulus state stable during this test.
      // @ts-expect-error test override
      timer.waitForStimulusEnd = mock(() => new Promise(() => {}));

      const spec = createMockSpec();
      // @ts-expect-error test override
      spec.timing = { ...spec.timing, prepDelayMs: 0, minValidRtMs: 100 };

      const actor = createActor(gameSessionMachine, {
        input: createTestInput({
          audio,
          timer,
          // @ts-expect-error test override
          spec: spec as import('../../specs/types').ModeSpec,
        }),
      });
      actor.start();
      actor.send({ type: 'START' });

      await waitForCondition(() => actor.getSnapshot().matches({ active: 'stimulus' }));

      // stimulusStartTime ~= audioTime + 80ms buffer (AUDIO_SYNC_BUFFER_MS)
      audioTimeSec = 1000.09; // RT ~= 10ms (too fast)
      actor.send({
        type: 'RESPOND',
        modalityId: 'position',
        inputMethod: 'keyboard',
        capturedAtMs: 1,
      });

      const events = actor.getSnapshot().context.sessionEvents;
      const filtered = events.filter((e) => e.type === 'RESPONSE_FILTERED');
      expect(filtered.length).toBe(1);
      if (filtered[0]?.type === 'RESPONSE_FILTERED') {
        expect(filtered[0].reason).toBe('too_fast');
        expect(filtered[0].modality).toBe('position');
      }

      // Must not emit a USER_RESPONDED for filtered inputs when capturedAtMs is present.
      expect(events.some((e) => e.type === 'USER_RESPONDED')).toBe(false);

      actor.stop();
    });

    it('emits RESPONSE_FILTERED touch_bounce and does not emit USER_RESPONDED', async () => {
      let audioTimeSec = 1000;
      const audio = createMockAudio();
      audio.getCurrentTime = mock(() => audioTimeSec);

      const timer = createMockTimer();
      // @ts-expect-error test override
      timer.waitForStimulusEnd = mock(() => new Promise(() => {}));

      const spec = createMockSpec();
      // @ts-expect-error test override
      spec.timing = { ...spec.timing, prepDelayMs: 0, minValidRtMs: 100 };

      const actor = createActor(gameSessionMachine, {
        input: createTestInput({
          audio,
          timer,
          // @ts-expect-error test override
          spec: spec as import('../../specs/types').ModeSpec,
        }),
      });
      actor.start();
      actor.send({ type: 'START' });

      await waitForCondition(() => actor.getSnapshot().matches({ active: 'stimulus' }));

      // First valid response: RT ~= 150ms
      audioTimeSec = 1000.2;
      actor.send({
        type: 'RESPOND',
        modalityId: 'position',
        inputMethod: 'touch',
        capturedAtMs: 10,
      });

      // Second touch within 80ms of the first: should be filtered as touch bounce.
      audioTimeSec = 1000.25; // deltaSinceFirst ~= 50ms
      actor.send({
        type: 'RESPOND',
        modalityId: 'position',
        inputMethod: 'touch',
        capturedAtMs: 11,
      });

      const events = actor.getSnapshot().context.sessionEvents;
      const responded = events.filter((e) => e.type === 'USER_RESPONDED');
      expect(responded.length).toBe(1);

      const filtered = events.filter((e) => e.type === 'RESPONSE_FILTERED');
      expect(filtered.length).toBe(1);
      if (filtered[0]?.type === 'RESPONSE_FILTERED') {
        expect(filtered[0].reason).toBe('touch_bounce');
        expect(filtered[0].modality).toBe('position');
        expect(typeof filtered[0].deltaSinceFirstMs).toBe('number');
      }

      actor.stop();
    });
  });
});
