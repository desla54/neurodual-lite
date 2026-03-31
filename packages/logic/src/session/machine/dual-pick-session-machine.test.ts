/**
 * DualPickSession XState Machine Tests
 *
 * Tests for the XState-based DualPick session machine.
 * Uses mock services to verify state transitions.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { dualPickSessionMachine } from './dual-pick-session-machine';
import type { DualPickSessionInput } from './dual-pick-session-types';
import { createDefaultDualPickPlugins } from './dual-pick-session-plugins';
import type { AudioPort } from '../../ports/audio-port';
import type { ClockPort } from '../../ports/clock-port';
import type { PlatformInfoPort } from '../../ports/platform-info-port';
import type { RandomPort } from '../../ports/random-port';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { Trial } from '../../types/core';
import { DualPickSpec } from '../../specs';

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

function createMockClock(): ClockPort {
  let time = 0;
  return {
    now: mock(() => time++),
    dateNow: mock(() => Date.now()),
  };
}

function createMockRandom(): RandomPort {
  let counter = 0;
  return {
    random: mock(() => 0.5),
    generateId: mock(() => `id-${++counter}`),
    // @ts-expect-error test override
    shuffle: mock(<T>(arr: T[]) => [...arr]),
  };
}

function createMockPlatformInfoPort(): PlatformInfoPort {
  return {
    // @ts-expect-error test override
    getPlatformInfo: mock(() => ({
      platform: 'web',
      screenWidth: 1024,
      screenHeight: 768,
      userAgent: 'DualPickSessionMachine test',
      touchCapable: false,
    })),
  };
}

function createMockTrial(index: number): Trial {
  return {
    index,
    isBuffer: index < 2,
    // @ts-expect-error test override
    position: index % 8,
    sound: 'C',
    color: 'ink-black',
    image: 'circle',
    trialType: 'Non-Cible',
    isPositionTarget: index > 1 && index % 3 === 0,
    isSoundTarget: index > 1 && index % 4 === 0,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorLure: false,
    isImageLure: false,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
  };
}

function createMockGenerator(totalTrials = 12): TrialGenerator {
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

function createMockSpec() {
  return DualPickSpec;
}

function createTestInput(overrides: Partial<DualPickSessionInput> = {}): DualPickSessionInput {
  const spec = overrides.spec ?? createMockSpec();
  return {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    playMode: 'free',
    spec: spec as import('../../specs').PickSpec,
    generator: createMockGenerator(),
    audio: createMockAudio(),
    clock: createMockClock(),
    random: createMockRandom(),
    plugins: createDefaultDualPickPlugins({
      spec: spec as import('../../specs').PickSpec,
      platformInfo: createMockPlatformInfoPort(),
    }),
    commandBus: {
      handle: async () => {
        return;
      },
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DualPickSessionMachine', () => {
  let input: DualPickSessionInput;

  beforeEach(() => {
    input = createTestInput();
  });

  describe('Initial State', () => {
    it('starts in idle state', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('idle');

      actor.stop();
    });

    it('initializes context from input', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.sessionId).toBe('test-session-id');
      expect(context.userId).toBe('test-user-id');
      expect(context.trialIndex).toBe(0);
      expect(context.stimulus).toBeNull();
      expect(context.history).toHaveLength(0);
      expect(context.proposals).toHaveLength(0);

      actor.stop();
    });
  });

  describe('State Transitions', () => {
    it('transitions from idle to starting on START', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('starting');

      actor.stop();
    });

    it('ignores START when not in idle', () => {
      const actor = createActor(dualPickSessionMachine, { input });
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
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');

      actor.stop();
    });

    it('transitions to finished on STOP from idle', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'STOP' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');

      actor.stop();
    });
  });

  describe('Context Updates', () => {
    it('preserves initial context values', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.stimulus).toBeNull();
      expect(context.trialIndex).toBe(0);
      expect(context.history).toHaveLength(0);

      actor.stop();
    });

    it('emits session started event during starting', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const { context } = actor.getSnapshot();
      const startEvent = context.sessionEvents.find((e) => e.type === 'DUAL_PICK_SESSION_STARTED');
      expect(startEvent).toBeDefined();

      actor.stop();
    });

    it('sets startTime when entering starting state', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const { context } = actor.getSnapshot();
      expect(context.startTime).toBeGreaterThan(0);

      actor.stop();
    });
  });

  describe('DROP_LABEL Event', () => {
    it('ignores DROP_LABEL in idle state', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({
        type: 'DROP_LABEL',
        proposalId: 'test-proposal',
        targetSlot: 0,
        targetType: 'position',
      });

      // Should still be in idle
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('ignores DROP_LABEL in starting state', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      expect(actor.getSnapshot().value).toBe('starting');

      actor.send({
        type: 'DROP_LABEL',
        proposalId: 'test-proposal',
        targetSlot: 0,
        targetType: 'position',
      });

      // Should still be in starting (DROP_LABEL not handled here)
      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });
  });

  describe('Session Events', () => {
    it('emits SESSION_STARTED event on START', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const { context } = actor.getSnapshot();
      const startEvent = context.sessionEvents.find((e) => e.type === 'DUAL_PICK_SESSION_STARTED');
      expect(startEvent).toBeDefined();
      expect(startEvent?.sessionId).toBe('test-session-id');

      actor.stop();
    });

    it('SESSION_STARTED event includes config', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });

      const { context } = actor.getSnapshot();
      const startEvent = context.sessionEvents.find(
        (e) => e.type === 'DUAL_PICK_SESSION_STARTED',
      ) as any;

      expect(startEvent).toBeDefined();
      expect(startEvent.config).toBeDefined();
      expect(startEvent.config.nLevel).toBe(2);

      actor.stop();
    });

    it('emits SESSION_ENDED with deterministic playContext (journey)', async () => {
      const journeyInput = createTestInput({
        playMode: 'journey',
        journeyStageId: 3,
        journeyId: 'journey-b',
        journeyStartLevel: 1,
        journeyTargetLevel: 2,
      });
      const actor = createActor(dualPickSessionMachine, { input: journeyInput });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      let attempts = 0;
      while (
        !actor
          .getSnapshot()
          .context.sessionEvents.some((e) => e.type === 'DUAL_PICK_SESSION_ENDED') &&
        attempts < 50
      ) {
        await new Promise((r) => setTimeout(r, 1));
        attempts++;
      }

      const { context } = actor.getSnapshot();
      const endEvent = context.sessionEvents.find(
        (e) => e.type === 'DUAL_PICK_SESSION_ENDED',
      ) as any;
      expect(endEvent).toBeDefined();
      expect(endEvent?.journeyStageId).toBe(3);
      expect(endEvent?.journeyId).toBe('journey-b');
      expect(endEvent?.playContext).toBe('journey');

      actor.stop();
    });
  });

  describe('Recovery Mode', () => {
    it('initializes with recovery state when provided', () => {
      const recoveryInput = createTestInput({
        recoveryState: {
          sessionId: 'test-session-id',
          lastTrialIndex: 3,
          startTimestamp: 1000,
        },
      });

      const actor = createActor(dualPickSessionMachine, { input: recoveryInput });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.trialIndex).toBe(3);

      actor.stop();
    });

    it('advances generator on START when recovering', () => {
      const mockGenerator = createMockGenerator();
      const recoveryInput = createTestInput({
        generator: mockGenerator,
        recoveryState: {
          sessionId: 'test-session-id',
          lastTrialIndex: 3,
          startTimestamp: 1000,
        },
      });

      const actor = createActor(dualPickSessionMachine, { input: recoveryInput });
      actor.start();

      actor.send({ type: 'START' });

      // skipTo should have been called during recovery
      expect(mockGenerator.skipTo).toHaveBeenCalled();

      actor.stop();
    });
  });

  describe('Audio Scheduling', () => {
    it('initializes audio when entering starting state', () => {
      const mockAudio = createMockAudio();
      const inputWithAudio = createTestInput({ audio: mockAudio });

      const actor = createActor(dualPickSessionMachine, { input: inputWithAudio });
      actor.start();

      actor.send({ type: 'START' });

      // Audio init should be invoked as part of starting state
      expect(mockAudio.init).toHaveBeenCalled();

      actor.stop();
    });
  });

  describe('Stats Tracking', () => {
    it('initializes stats as empty', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      const { context } = actor.getSnapshot();
      expect(context.stats.turnsCompleted).toBe(0);
      expect(context.stats.correctDrops).toBe(0);
      expect(context.stats.totalDrops).toBe(0);

      actor.stop();
    });
  });

  describe('Spec Extensions', () => {
    it('uses placementOrderMode from spec', () => {
      const specWithGuided = {
        ...createMockSpec(),
        extensions: {
          ...createMockSpec().extensions,
          placementOrderMode: 'random' as const,
        },
      };
      const guidedInput = createTestInput({ spec: specWithGuided as any });

      const actor = createActor(dualPickSessionMachine, { input: guidedInput });
      actor.start();

      // Verify spec is used
      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.placementOrderMode).toBe('random');

      actor.stop();
    });

    it('uses timelineMode from spec', () => {
      const specWithUnified = {
        ...createMockSpec(),
        extensions: {
          ...createMockSpec().extensions,
          timelineMode: 'unified' as const,
        },
      };
      const unifiedInput = createTestInput({ spec: specWithUnified as any });

      const actor = createActor(dualPickSessionMachine, { input: unifiedInput });
      actor.start();

      // Verify spec is used
      const { context } = actor.getSnapshot();
      expect(context.spec.extensions.timelineMode).toBe('unified');

      actor.stop();
    });
  });

  describe('Finished State', () => {
    it('sets isCompleted on STOP', () => {
      const actor = createActor(dualPickSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'STOP' });

      // isCompleted should be false when stopped manually
      const { context } = actor.getSnapshot();
      expect(context.isCompleted).toBe(false);

      actor.stop();
    });
  });
});
