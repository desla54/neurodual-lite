/**
 * PlaceSessionMachine Tests (XState v5)
 *
 * Unit tests for the XState flow session machine.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createActor } from 'xstate';
import { placeSessionMachine } from './place-session-machine';
import type { PlaceSessionInput } from './place-session-types';
import { createDefaultPlacePlugins } from './place-session-plugins';

// =============================================================================
// Mock Setup
// =============================================================================

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 250;
  const intervalMs = options.intervalMs ?? 1;
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function createMockAudio() {
  return {
    init: mock(() => Promise.resolve()),
    schedule: mock(() => {}),
    play: mock(() => {}),
    stopAll: mock(() => {}),
    scheduleCallback: mock((_ms: number, cb: () => void) => {
      // Execute callback immediately for testing
      setTimeout(cb, 0);
      return 1;
    }),
    cancelCallback: mock(() => {}),
    isReady: () => true,
    getVolumeLevel: () => 0.8,
  };
}

function createMockClock() {
  let time = 0;
  return {
    now: () => time++,
    dateNow: () => Date.now(),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

function createMockRandom() {
  let idCounter = 0;
  return {
    random: () => 0.1234,
    generateId: () => `test-id-${idCounter++}`,
  };
}

function createMockGenerator(totalTrials = 5) {
  let trialIndex = 0;
  const sounds = ['C', 'H', 'K', 'L'] as const;
  return {
    generateNext: () => ({
      index: trialIndex++,
      position: (trialIndex - 1) % 8,
      sound: sounds[(trialIndex - 1) % sounds.length]!,
      isPositionTarget: false,
      isAudioTarget: false,
    }),
    getTotalTrials: () => totalTrials,
    getZoneNumber: () => 3,
    isAdaptive: () => false,
    processFeedback: mock(() => {}),
  };
}

function createTestSpec(): import('../../specs/place.spec').PlaceSpec {
  return {
    metadata: {
      id: 'dual-place',
      displayName: 'Dual Place',
      description: 'Test Spec',
      tags: [],
      difficultyLevel: 1,
      version: '1.0.0',
    },
    sessionType: 'PlaceSession',
    scoring: { strategy: 'accuracy', passThreshold: 0.8 },
    timing: { stimulusDurationMs: 500, intervalMs: 3000 },
    generation: {
      generator: 'Sequence',
      targetProbability: 0.3,
      lureProbability: 0.1,
      sequenceMode: 'flow',
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
    },
    adaptivity: {
      algorithm: 'adaptive',
      nLevelSource: 'user',
      configurableSettings: [],
    },
    report: {
      sections: [],
      display: {
        modeScoreKey: 'report.modeScore.placementAccuracy',
        modeScoreTooltipKey: 'report.modeScore.tooltip',
        speedStatKey: 'report.speedStat.responseTime',
        colors: {
          bg: '#000000',
          border: '#111111',
          text: '#ffffff',
          accent: '#00ff00',
        },
      },
    },
    extensions: {
      placementOrderMode: 'free',
      timelineMode: 'separated',
    },
  };
}

function createTestInput(): PlaceSessionInput {
  return {
    sessionId: 'test-session-id',
    userId: 'test-user',
    playMode: 'free',
    spec: createTestSpec(),
    audio: createMockAudio() as unknown as PlaceSessionInput['audio'],
    clock: createMockClock() as unknown as PlaceSessionInput['clock'],
    random: createMockRandom() as unknown as PlaceSessionInput['random'],
    generator: createMockGenerator() as unknown as PlaceSessionInput['generator'],
    plugins: createDefaultPlacePlugins({
      platformInfo: {
        getPlatformInfo: () => ({
          platform: 'web',
          screenWidth: 800,
          screenHeight: 600,
          userAgent: 'test',
          touchCapable: false,
        }),
      },
    }),
    commandBus: {
      handle: async () => {
        return;
      },
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('placeSessionMachine', () => {
  describe('initial state', () => {
    it('starts in idle state', () => {
      const actor = createActor(placeSessionMachine, { input: createTestInput() });
      actor.start();

      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('initializes context correctly', () => {
      const input = createTestInput();
      const actor = createActor(placeSessionMachine, { input });
      actor.start();

      const ctx = actor.getSnapshot().context;
      expect(ctx.sessionId).toBe(input.sessionId);
      expect(ctx.userId).toBe(input.userId);
      expect(ctx.trialIndex).toBe(0);
      expect(ctx.history).toEqual([]);
      expect(ctx.proposals).toEqual([]);

      actor.stop();
    });
  });

  describe('START event', () => {
    it('transitions idle → starting on START', () => {
      const actor = createActor(placeSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });

      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });
  });

  describe('state transitions', () => {
    it('ignores START when not in idle', async () => {
      const actor = createActor(placeSessionMachine, { input: createTestInput() });
      actor.start();

      // Start the session
      actor.send({ type: 'START' });

      // Wait for it to progress past starting
      await waitForCondition(() => actor.getSnapshot().value !== 'starting');

      // Try to start again - should be ignored
      actor.send({ type: 'START' });

      // Should NOT be back in starting
      expect(actor.getSnapshot().value).not.toBe('idle');

      actor.stop();
    });
  });

  describe('STOP event', () => {
    it('transitions to finished on STOP from starting', () => {
      const actor = createActor(placeSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      expect(actor.getSnapshot().value).toBe('finished');

      actor.stop();
    });
  });

  describe('session events', () => {
    it('emits FLOW_SESSION_STARTED event', async () => {
      const actor = createActor(placeSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });

      await waitForCondition(() =>
        actor.getSnapshot().context.sessionEvents.some((e) => e.type === 'FLOW_SESSION_STARTED'),
      );

      const events = actor.getSnapshot().context.sessionEvents;
      const startedEvent = events.find((e) => e.type === 'FLOW_SESSION_STARTED');

      expect(startedEvent).toBeDefined();
      expect(startedEvent?.sessionId).toBe('test-session-id');

      actor.stop();
    });

    it('emits FLOW_SESSION_ENDED with deterministic playContext (journey)', async () => {
      const actor = createActor(placeSessionMachine, {
        input: {
          ...createTestInput(),
          playMode: 'journey',
          journeyStageId: 5,
          journeyId: 'journey-a',
          journeyStartLevel: 1,
          journeyTargetLevel: 2,
        },
      });
      actor.start();

      actor.send({ type: 'START' });

      await waitForCondition(() =>
        actor.getSnapshot().context.sessionEvents.some((e) => e.type === 'FLOW_SESSION_STARTED'),
      );

      actor.send({ type: 'STOP' });

      await waitForCondition(() =>
        actor.getSnapshot().context.sessionEvents.some((e) => e.type === 'FLOW_SESSION_ENDED'),
      );

      const events = actor.getSnapshot().context.sessionEvents;
      const startedEvent = events.find((e) => e.type === 'FLOW_SESSION_STARTED') as any;
      const endedEvent = events.find((e) => e.type === 'FLOW_SESSION_ENDED') as any;

      expect(startedEvent?.journeyStageId).toBe(5);
      expect(startedEvent?.journeyId).toBe('journey-a');
      expect(startedEvent?.playContext).toBe('journey');

      expect(endedEvent?.journeyStageId).toBe(5);
      expect(endedEvent?.journeyId).toBe('journey-a');
      expect(endedEvent?.playContext).toBe('journey');

      actor.stop();
    });
  });
});
