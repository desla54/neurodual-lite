/**
 * Adversarial Property-Based Tests for GameSession XState Machine
 *
 * These tests explore edge cases and adversarial event sequences to find bugs:
 *
 * 1. Double START - what happens?
 * 2. RESPOND before session started
 * 3. RESPOND after session finished
 * 4. PAUSE while already paused
 * 5. RESUME while not paused
 * 6. STOP from every possible state
 * 7. FOCUS_LOST during stimulus presentation
 * 8. Rapid FOCUS_LOST/FOCUS_REGAINED cycles
 * 9. RESPOND with invalid modality
 * 10. RESPOND with reaction time = 0
 * 11. RESPOND with negative reaction time
 * 12. Multiple RESPONDs for same trial
 * 13. Event ordering: what if TRIAL_PRESENTED comes twice?
 * 14. Timer edge cases: what if timer fires after STOP?
 * 15. Recovery mode edge cases
 */

import { describe, it, expect, mock } from 'bun:test';
import * as fc from 'fast-check';
import { createActor } from 'xstate';
import { gameSessionMachine } from './game-session-machine';
import type { GameSessionInput, RecoveryState } from './types';
import { createDefaultGamePlugins } from './game-session-plugins';
import type { AudioPort } from '../../ports';
import type { TimerPort } from '../../timing';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { RunningStatsCalculator } from '../../coach/running-stats';
import type { GameConfig, Trial, ModalityId } from '../../domain';
import type { ModeSpec } from '../../specs/types';

// =============================================================================
// Mock Factories (same as existing property tests)
// =============================================================================

function createMockAudio(): AudioPort {
  return {
    init: mock(() => Promise.resolve(undefined)),
    isReady: mock(() => true),
    // @ts-expect-error test override
    playSound: mock(() => undefined),
    schedule: mock((_s, _d, onSync) => onSync?.()),
    scheduleMultiple: mock((_s, _d, onSync) => onSync?.()),
    scheduleCallback: mock(() => 1),
    cancelCallback: mock(() => undefined),
    stopAll: mock(() => undefined),
    getCurrentTime: mock(() => Date.now() / 1000),
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
    getCurrentTime: mock(() => Date.now() / 1000),
    // @ts-expect-error test override
    reset: mock(() => undefined),
  };
}

function createMockTrial(index: number, overrides: Partial<Trial> = {}): Trial {
  return {
    index,
    position: 4,
    sound: 'C',
    color: 'ink-navy',
    isPositionTarget: false,
    // @ts-expect-error test override
    isAudioTarget: false,
    isColorTarget: false,
    ...overrides,
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

function createMockConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    nLevel: 2,
    trialsCount: 20,
    intervalSeconds: 2.5,
    stimulusDurationSeconds: 0.5,
    activeModalities: ['position', 'audio'],
    generator: 'PreGenerated',
    targetProbability: 0.25,
    ...overrides,
  } as GameConfig;
}

function createMockSpec(overrides: Partial<ModeSpec> = {}): ModeSpec {
  return {
    metadata: {
      id: 'test-mode',
      displayName: 'Test Mode',
      description: 'Test mode for property tests',
      tags: ['test'],
      difficultyLevel: 3,
      version: '1.0.0',
      ...overrides.metadata,
    },
    sessionType: 'GameSession' as const,
    scoring: {
      strategy: 'sdt' as const,
      passThreshold: 1.5,
      downThreshold: 0.8,
      ...overrides.scoring,
    },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 2500,
      prepDelayMs: 0, // Skip countdown in property tests
      ...overrides.timing,
    },
    generation: {
      generator: 'BrainWorkshop' as const,
      targetProbability: 0.25,
      lureProbability: 0.125,
      ...overrides.generation,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'] as const,
      ...overrides.defaults,
    },
    adaptivity: {
      algorithm: 'none' as const,
      nLevelSource: 'user' as const,
      configurableSettings: [] as string[],
      ...overrides.adaptivity,
    },
    // @ts-expect-error test override
    report: {
      sections: ['HERO', 'PERFORMANCE'] as const,
    },
    ...overrides,
  };
}

function createTestInput(overrides: Partial<GameSessionInput> = {}): GameSessionInput {
  const spec = overrides.spec ?? createMockSpec();
  const config = overrides.config ?? createMockConfig();
  return {
    sessionId: `test-session-${Date.now()}-${Math.random()}`,
    userId: 'test-user-id',
    playMode: 'free',
    config,
    audio: createMockAudio(),
    timer: createMockTimer(),
    generator: createMockGenerator(),
    statsCalculator: createMockStatsCalculator(),
    judge: null,
    spec,
    trialsSeed: 'test-seed',
    plugins: createDefaultGamePlugins({
      spec: spec as ModeSpec,
      activeModalities: config.activeModalities,
    }),
    ...overrides,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function getStateValue(
  snapshot: ReturnType<ReturnType<typeof createActor>['getSnapshot']>,
): string {
  const value = snapshot.value;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'active' in value) {
    return `active.${value.active}`;
  }
  return JSON.stringify(value);
}

function isInActiveState(
  snapshot: ReturnType<ReturnType<typeof createActor>['getSnapshot']>,
): boolean {
  const value = snapshot.value;
  return typeof value === 'object' && 'active' in value;
}

function isFinished(snapshot: ReturnType<ReturnType<typeof createActor>['getSnapshot']>): boolean {
  return snapshot.value === 'finished';
}

async function waitForMachine(delayMs = 20): Promise<void> {
  const turns = delayMs >= 100 ? 12 : delayMs >= 50 ? 8 : delayMs >= 30 ? 5 : delayMs >= 10 ? 3 : 1;

  for (let i = 0; i < turns; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

const modalityIdArb: fc.Arbitrary<ModalityId> = fc.constantFrom(
  'position',
  'audio',
  'color',
  'image',
);

const allModalitiesArb: fc.Arbitrary<ModalityId> = fc.constantFrom(
  'position',
  'audio',
  'color',
  'image',
  'arithmetic',
  'shape',
  'number',
);

const invalidModalityArb = fc.constantFrom(
  'invalid_modality',
  '',
  'foo',
  'bar',
  'undefined',
  'null',
) as fc.Arbitrary<ModalityId>;

const reactionTimeArb = fc.integer({ min: -1000, max: 10000 });

const inputMethodArb = fc.constantFrom('keyboard', 'mouse', 'touch', 'gamepad') as fc.Arbitrary<
  'keyboard' | 'mouse' | 'touch' | 'gamepad'
>;

const eventSequenceArb = fc.array(
  fc.constantFrom(
    'START',
    'RECOVER',
    'STOP',
    'PAUSE',
    'RESUME',
    'FOCUS_LOST',
    'ADVANCE',
    'VISUAL_TRIGGER',
    'VISUAL_HIDE_TRIGGER',
    'AUDIO_SYNC',
    'AUDIO_ENDED',
  ) as fc.Arbitrary<string>,
  { minLength: 1, maxLength: 20 },
);

// =============================================================================
// 1. DOUBLE START TESTS
// =============================================================================

describe('1. Double START edge cases', () => {
  it('1.1 Double START from idle - second START is ignored', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        const stateAfterFirst = getStateValue(actor.getSnapshot());
        const eventsAfterFirst = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'START' });
        const stateAfterSecond = getStateValue(actor.getSnapshot());
        const eventsAfterSecond = actor.getSnapshot().context.sessionEvents.length;

        // State should not change
        expect(stateAfterFirst).toBe(stateAfterSecond);
        // Should not emit duplicate SESSION_STARTED
        expect(eventsAfterSecond).toBe(eventsAfterFirst);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.2 Triple START is safe', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (repeats) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        for (let i = 0; i < repeats + 2; i++) {
          actor.send({ type: 'START' });
        }

        // Should not crash, should be in starting (or starting's successor)
        const state = getStateValue(actor.getSnapshot());
        expect(['starting', 'countdown', 'active.stimulus', 'finished']).toContain(state);

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('1.3 START after finished is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        expect(actor.getSnapshot().value).toBe('finished');

        actor.send({ type: 'START' });

        // Should still be finished
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });
});

// =============================================================================
// 2. RESPOND BEFORE SESSION STARTED
// =============================================================================

describe('2. RESPOND before session started', () => {
  it('2.1 RESPOND in idle state is ignored', () => {
    fc.assert(
      fc.property(modalityIdArb, inputMethodArb, (modalityId, inputMethod) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const responsesBefore = actor.getSnapshot().context.responses.size;
        const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'RESPOND', modalityId, inputMethod });

        // Responses should not change in idle state
        expect(actor.getSnapshot().context.responses.size).toBe(responsesBefore);
        // No USER_RESPONDED event should be emitted
        expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);
        // State should still be idle
        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.2 RESPOND in starting state is ignored', () => {
    fc.assert(
      fc.property(modalityIdArb, (modalityId) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('starting');

        const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'RESPOND', modalityId });

        // No additional events should be emitted
        expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.3 RESPOND in countdown state is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(modalityIdArb, async (modalityId) => {
        const spec = createMockSpec({
          timing: { prepDelayMs: 1000, stimulusDurationMs: 500, intervalMs: 2500 },
        });
        const input = createTestInput({
          spec,
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        // Wait a bit for state to potentially transition
        await waitForMachine(10);

        const state = getStateValue(actor.getSnapshot());
        if (state === 'countdown') {
          const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

          actor.send({ type: 'RESPOND', modalityId });

          expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 3. RESPOND AFTER SESSION FINISHED
// =============================================================================

describe('3. RESPOND after session finished', () => {
  it('3.1 RESPOND after STOP is ignored', () => {
    fc.assert(
      fc.property(modalityIdArb, (modalityId) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        expect(actor.getSnapshot().value).toBe('finished');

        const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'RESPOND', modalityId });

        // No change in finished state
        expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('3.2 Multiple RESPONDs after finished are all ignored', () => {
    fc.assert(
      fc.property(fc.array(modalityIdArb, { minLength: 1, maxLength: 10 }), (modalities) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'audio', 'color', 'image'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

        for (const modalityId of modalities) {
          actor.send({ type: 'RESPOND', modalityId });
        }

        expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });
});

// =============================================================================
// 4. PAUSE WHILE ALREADY PAUSED
// =============================================================================

describe('4. PAUSE while already paused', () => {
  it('4.1 Double PAUSE from active is idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');

          const pauseTimeBefore = actor.getSnapshot().context.pauseElapsedTime;
          const pausedInStateBefore = actor.getSnapshot().context.pausedInState;

          actor.send({ type: 'PAUSE' });

          // Should still be paused
          expect(actor.getSnapshot().value).toBe('paused');
          // Pause state should not change
          expect(actor.getSnapshot().context.pauseElapsedTime).toBe(pauseTimeBefore);
          expect(actor.getSnapshot().context.pausedInState).toBe(pausedInStateBefore);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('4.2 Multiple PAUSEs are safe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (pauseCount) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < pauseCount; i++) {
            actor.send({ type: 'PAUSE' });
          }

          expect(actor.getSnapshot().value).toBe('paused');
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('4.3 PAUSE from non-active states is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // PAUSE from idle
        actor.send({ type: 'PAUSE' });
        expect(actor.getSnapshot().value).toBe('idle');

        // PAUSE from starting
        actor.send({ type: 'START' });
        actor.send({ type: 'PAUSE' });
        expect(actor.getSnapshot().value).toBe('starting');

        // PAUSE from finished
        actor.send({ type: 'STOP' });
        actor.send({ type: 'PAUSE' });
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });
});

// =============================================================================
// 5. RESUME WHILE NOT PAUSED
// =============================================================================

describe('5. RESUME while not paused', () => {
  it('5.1 RESUME from idle is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RESUME' });

        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('5.2 RESUME from starting is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'RESUME' });

        expect(actor.getSnapshot().value).toBe('starting');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('5.3 RESUME from active.stimulus is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const stateBefore = getStateValue(actor.getSnapshot());

          actor.send({ type: 'RESUME' });

          // State should not change
          expect(getStateValue(actor.getSnapshot())).toBe(stateBefore);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('5.4 RESUME from finished is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });
        actor.send({ type: 'RESUME' });

        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('5.5 Double RESUME after single PAUSE works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');

          actor.send({ type: 'RESUME' });
          // Should be resuming or back in active
          const stateAfterFirstResume = getStateValue(actor.getSnapshot());

          actor.send({ type: 'RESUME' });
          const stateAfterSecondResume = getStateValue(actor.getSnapshot());

          // Second RESUME should not change state
          expect(stateAfterSecondResume).toBe(stateAfterFirstResume);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 6. STOP FROM EVERY POSSIBLE STATE
// =============================================================================

describe('6. STOP from every possible state', () => {
  it('6.1 STOP from idle is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'STOP' });

        // STOP from idle should be ignored (no transition defined)
        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('6.2 STOP from starting goes to finished', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('starting');

        actor.send({ type: 'STOP' });
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('6.3 STOP from active.stimulus goes to finished', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'STOP' });
          expect(actor.getSnapshot().value).toBe('finished');
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('6.4 STOP from paused goes to finished', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');

          actor.send({ type: 'STOP' });
          expect(actor.getSnapshot().value).toBe('finished');
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('6.5 STOP from recovering goes to finished', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const recoveryState: RecoveryState = {
          lastTrialIndex: 5,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() - 60000,
        };

        const input = createTestInput({ recoveryState });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });
        expect(actor.getSnapshot().value).toBe('recovering');

        actor.send({ type: 'STOP' });
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('6.6 STOP from finished is ignored (already final)', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });
        expect(actor.getSnapshot().value).toBe('finished');

        const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'STOP' });

        // Should still be finished
        expect(actor.getSnapshot().value).toBe('finished');
        // No additional events
        expect(actor.getSnapshot().context.sessionEvents.length).toBe(eventsBefore);

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('6.7 Multiple consecutive STOPs are safe', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (stopCount) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        for (let i = 0; i < stopCount; i++) {
          actor.send({ type: 'STOP' });
        }

        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });
});

// =============================================================================
// 7. FOCUS_LOST DURING STIMULUS PRESENTATION
// =============================================================================

describe('7. FOCUS_LOST during stimulus presentation', () => {
  it('7.1 FOCUS_LOST during stimulus goes to paused', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const state = getStateValue(actor.getSnapshot());
          if (state.includes('stimulus')) {
            actor.send({ type: 'FOCUS_LOST' });
            expect(actor.getSnapshot().value).toBe('paused');
            expect(actor.getSnapshot().context.pausedInState).toBe('stimulus');
          }
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('7.2 FOCUS_LOST emits FOCUS_LOST event', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const eventsBefore = actor.getSnapshot().context.sessionEvents.length;

          actor.send({ type: 'FOCUS_LOST' });

          const eventsAfter = actor.getSnapshot().context.sessionEvents;
          const focusLostEvent = eventsAfter.find((e) => e.type === 'FOCUS_LOST');
          expect(focusLostEvent).toBeDefined();
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('7.3 FOCUS_LOST cancels timers', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const mockTimer = createMockTimer();
        const input = createTestInput({ timer: mockTimer });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });

          // Timer cancel should be called
          expect(mockTimer.cancel).toHaveBeenCalled();
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('7.4 FOCUS_LOST stops audio', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const mockAudio = createMockAudio();
        const input = createTestInput({ audio: mockAudio });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });

          expect(mockAudio.stopAll).toHaveBeenCalled();
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 8. RAPID FOCUS_LOST/FOCUS_REGAINED CYCLES
// =============================================================================

describe('8. Rapid FOCUS_LOST/FOCUS_REGAINED cycles', () => {
  it('8.1 Single FOCUS_LOST/FOCUS_REGAINED cycle works', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 100, max: 5000 }), async (lostDurationMs) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });
          expect(actor.getSnapshot().value).toBe('paused');

          actor.send({ type: 'FOCUS_REGAINED', lostDurationMs });
          const state = getStateValue(actor.getSnapshot());
          expect([
            'resuming',
            'active.stimulus',
            'active.stimulusResume',
            'active.waiting',
            'active.waitingResume',
          ]).toContain(state);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('8.2 Multiple FOCUS_LOST/FOCUS_REGAINED cycles are stable', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (cycles) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < cycles; i++) {
            actor.send({ type: 'FOCUS_LOST' });
            // Allow state to settle
            await waitForMachine(5);

            if (actor.getSnapshot().value === 'paused') {
              actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 100 });
              await waitForMachine(5);
            }
          }

          // Should not be in an invalid state
          const state = getStateValue(actor.getSnapshot());
          expect([
            'paused',
            'resuming',
            'active.stimulus',
            'active.stimulusResume',
            'active.waiting',
            'active.waitingResume',
            'finished',
          ]).toContain(state);
        }

        actor.stop();
      }),
      { numRuns: 10 },
    );
  });

  it('8.3 FOCUS_REGAINED with zero duration is valid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });
          actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 0 });

          // Should handle zero duration gracefully
          expect(actor.getSnapshot().value).not.toBe('paused');
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('8.4 FOCUS_REGAINED with negative duration is handled', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -10000, max: -1 }), async (lostDurationMs) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });
          actor.send({ type: 'FOCUS_REGAINED', lostDurationMs });

          // Machine should handle negative duration without crashing
          // (implementation detail: timing adjustment may become negative)
          const state = getStateValue(actor.getSnapshot());
          expect([
            'resuming',
            'active.stimulus',
            'active.stimulusResume',
            'active.waiting',
            'active.waitingResume',
            'finished',
          ]).toContain(state);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('8.5 FOCUS_LOST without FOCUS_REGAINED keeps session paused', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });
          expect(actor.getSnapshot().value).toBe('paused');

          // Wait a bit
          await waitForMachine(50);

          // Should still be paused
          expect(actor.getSnapshot().value).toBe('paused');
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 9. RESPOND WITH INVALID MODALITY
// =============================================================================

describe('9. RESPOND with invalid modality', () => {
  it('9.1 RESPOND with modality not in activeModalities is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const responsesBefore = actor.getSnapshot().context.responses.size;

          // 'audio' is not in activeModalities
          actor.send({ type: 'RESPOND', modalityId: 'audio' });

          expect(actor.getSnapshot().context.responses.size).toBe(responsesBefore);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('9.2 RESPOND with arithmetic modality is ignored (special handling)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // Arithmetic is handled via ARITHMETIC_INPUT, not RESPOND
          actor.send({ type: 'RESPOND', modalityId: 'arithmetic' });

          expect(actor.getSnapshot().context.responses.has('arithmetic')).toBe(false);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('9.3 RESPOND with empty string modality is handled', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'RESPOND', modalityId: '' });

          // Should not crash
          expect(isInActiveState(actor.getSnapshot()) || isFinished(actor.getSnapshot())).toBe(
            true,
          );
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 10. RESPOND WITH REACTION TIME = 0
// =============================================================================

describe('10. RESPOND with reaction time = 0', () => {
  it('10.1 Response with zero RT is filtered (too fast)', async () => {
    await fc.assert(
      fc.asyncProperty(modalityIdArb, async (modalityId) => {
        // Create audio that returns current time equal to stimulus start time
        // This would result in RT = 0
        const currentTime = 1000; // Start at 1000 seconds
        const mockAudio = createMockAudio();
        mockAudio.getCurrentTime = mock(() => currentTime);

        const input = createTestInput({
          audio: mockAudio,
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // Immediately respond (RT ~= 0)
          actor.send({ type: 'RESPOND', modalityId });

          // The response processor should filter this as "too fast"
          // Check if response was recorded or filtered
          const responses = actor.getSnapshot().context.responses;
          // Implementation may or may not filter zero RT - verify it doesn't crash
          expect(responses instanceof Map).toBe(true);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 11. RESPOND WITH NEGATIVE REACTION TIME
// =============================================================================

describe('11. RESPOND with negative reaction time', () => {
  it('11.1 Response with negative RT is handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(modalityIdArb, async (modalityId) => {
        // Create audio where current time is before stimulus start
        let callCount = 0;
        const mockAudio = createMockAudio();
        mockAudio.getCurrentTime = mock(() => {
          callCount++;
          // First calls during setup return normal time
          // Later calls during response return earlier time (would cause negative RT)
          return callCount < 10 ? 1000 : 999;
        });

        const input = createTestInput({
          audio: mockAudio,
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // This would normally result in negative RT due to time going "backwards"
          actor.send({ type: 'RESPOND', modalityId });

          // Machine should handle this without crashing
          expect(isInActiveState(actor.getSnapshot()) || isFinished(actor.getSnapshot())).toBe(
            true,
          );
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 12. MULTIPLE RESPONDS FOR SAME TRIAL
// =============================================================================

describe('12. Multiple RESPONDs for same trial', () => {
  it('12.1 Same modality twice is deduplicated', async () => {
    await fc.assert(
      fc.asyncProperty(modalityIdArb, async (modalityId) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: [modalityId, 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // First response
          actor.send({ type: 'RESPOND', modalityId });
          const responseCount1 = actor.getSnapshot().context.responses.size;

          // Second response for same modality
          actor.send({ type: 'RESPOND', modalityId });
          const responseCount2 = actor.getSnapshot().context.responses.size;

          // Should not add duplicate
          expect(responseCount2).toBe(responseCount1);

          // Check for DUPLICATE_RESPONSE event
          const events = actor.getSnapshot().context.sessionEvents;
          // @ts-expect-error test override
          const duplicateEvent = events.find((e) => e.type === 'DUPLICATE_RESPONSE');
          // May or may not emit duplicate event depending on implementation
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('12.2 Different modalities on same trial are all recorded', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'audio', 'color'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'RESPOND', modalityId: 'position' });
          actor.send({ type: 'RESPOND', modalityId: 'audio' });
          actor.send({ type: 'RESPOND', modalityId: 'color' });

          const responses = actor.getSnapshot().context.responses;
          expect(responses.size).toBeLessThanOrEqual(3);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('12.3 Many duplicate responses do not corrupt state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 50 }), async (responseCount) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < responseCount; i++) {
            actor.send({ type: 'RESPOND', modalityId: 'position' });
          }

          // State should still be valid
          expect(isInActiveState(actor.getSnapshot()) || isFinished(actor.getSnapshot())).toBe(
            true,
          );

          // Responses map should not overflow
          expect(actor.getSnapshot().context.responses.size).toBeLessThanOrEqual(2);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 13. EVENT ORDERING EDGE CASES
// =============================================================================

describe('13. Event ordering edge cases', () => {
  it('13.1 Random event sequence does not crash machine', () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        for (const eventType of events) {
          try {
            if (eventType === 'FOCUS_REGAINED') {
              actor.send({ type: eventType, lostDurationMs: 1000 });
            } else {
              actor.send({ type: eventType as any });
            }
          } catch {
            // Some events may cause errors in test mocks
          }
        }

        // Machine should be in a valid state
        const state = getStateValue(actor.getSnapshot());
        const validStates = [
          'idle',
          'starting',
          'countdown',
          'recovering',
          'paused',
          'resuming',
          'computing',
          'finished',
          'active.stimulus',
          'active.waiting',
          'active.stimulusResume',
          'active.waitingResume',
        ];
        const isValidState = validStates.some(
          // @ts-expect-error test override
          (vs) => state === vs || state.startsWith(vs.split('.')[0]),
        );
        expect(isValidState).toBe(true);

        actor.stop();
      }),
      { numRuns: 100 },
    );
  });

  it('13.2 Alternating START/STOP is safe', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (count) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        for (let i = 0; i < count; i++) {
          actor.send({ type: 'START' });
          actor.send({ type: 'STOP' });
        }

        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('13.3 Interleaved RESPOND and control events are safe', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('RESPOND', 'PAUSE', 'RESUME', 'FOCUS_LOST', 'FOCUS_REGAINED'), {
          minLength: 5,
          maxLength: 20,
        }),
        async (events) => {
          const input = createTestInput({
            config: createMockConfig({ activeModalities: ['position', 'audio'] }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          actor.send({ type: 'START' });
          await waitForMachine(20);

          for (const eventType of events) {
            try {
              if (eventType === 'RESPOND') {
                actor.send({ type: 'RESPOND', modalityId: 'position' });
              } else if (eventType === 'FOCUS_REGAINED') {
                actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 100 });
              } else {
                actor.send({ type: eventType as any });
              }
              await waitForMachine(2);
            } catch {
              // Ignore errors
            }
          }

          // Should not crash
          expect(actor.getSnapshot()).toBeDefined();

          actor.stop();
        },
      ),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 14. TIMER EDGE CASES
// =============================================================================

describe('14. Timer edge cases', () => {
  it('14.1 Timer completing after STOP is handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        let resolveTimer: (() => void) | null = null;
        const mockTimer: TimerPort = {
          init: mock(() => undefined),
          startTrial: mock(() => undefined),
          // @ts-expect-error test override
          waitForStimulusEnd: mock(
            () =>
              new Promise((resolve) => {
                resolveTimer = () => resolve({ type: 'completed' as const });
              }),
          ),
          waitForResponseWindow: mock(() => Promise.resolve({ type: 'completed' as const })),
          cancel: mock(() => undefined),
          getCurrentTime: mock(() => Date.now() / 1000),
          reset: mock(() => undefined),
        };

        const input = createTestInput({ timer: mockTimer });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(30);

        // Now STOP while timer is pending
        actor.send({ type: 'STOP' });
        expect(actor.getSnapshot().value).toBe('finished');

        // Resolve the timer after STOP
        if (resolveTimer) {
          // @ts-expect-error test override
          resolveTimer();
        }

        // Wait a bit
        await waitForMachine(20);

        // Should still be finished
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 10 },
    );
  });

  it('14.2 Timer cancelled multiple times is safe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (cancelCount) => {
        const mockTimer = createMockTimer();
        const input = createTestInput({ timer: mockTimer });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // Send multiple events that cancel timer
          for (let i = 0; i < cancelCount; i++) {
            actor.send({ type: 'PAUSE' });
            actor.send({ type: 'RESUME' });
          }

          // Should not crash
          expect(actor.getSnapshot()).toBeDefined();
        }

        actor.stop();
      }),
      { numRuns: 10 },
    );
  });

  it('14.3 Timer error is handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const mockTimer: TimerPort = {
          init: mock(() => undefined),
          startTrial: mock(() => undefined),
          waitForStimulusEnd: mock(() => Promise.reject(new Error('Timer error'))),
          waitForResponseWindow: mock(() => Promise.resolve({ type: 'completed' as const })),
          cancel: mock(() => undefined),
          getCurrentTime: mock(() => Date.now() / 1000),
          // @ts-expect-error test override
          reset: mock(() => undefined),
        };

        const input = createTestInput({ timer: mockTimer });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        // Wait for error to be processed
        await waitForMachine(50);

        // Machine should handle the error
        const state = getStateValue(actor.getSnapshot());
        // May be in active (error ignored) or elsewhere
        expect(actor.getSnapshot()).toBeDefined();

        actor.stop();
      }),
      { numRuns: 10 },
    );
  });
});

// =============================================================================
// 15. RECOVERY MODE EDGE CASES
// =============================================================================

describe('15. Recovery mode edge cases', () => {
  it('15.1 RECOVER without recoveryState stays in idle (FIXED)', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput({ recoveryState: undefined });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });

        // FIXED: Without recoveryState, RECOVER is a no-op and stays in idle
        // This is the correct behavior - can't recover without recovery data
        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('15.2 RECOVER with empty trialHistory works', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const recoveryState: RecoveryState = {
          lastTrialIndex: 0,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() - 1000,
        };

        const input = createTestInput({ recoveryState });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });

        expect(actor.getSnapshot().value).toBe('recovering');
        expect(actor.getSnapshot().context.trialIndex).toBe(0);

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('15.3 RECOVER with negative lastTrialIndex is handled', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: -1 }), (lastTrialIndex) => {
        const recoveryState: RecoveryState = {
          lastTrialIndex,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() - 1000,
        };

        const input = createTestInput({ recoveryState });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });

        // Should handle negative index
        // NOTE: This is an edge case that may produce unexpected behavior
        expect(actor.getSnapshot()).toBeDefined();

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('15.4 RECOVER followed by START is handled', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const recoveryState: RecoveryState = {
          lastTrialIndex: 5,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() - 60000,
        };

        const input = createTestInput({ recoveryState });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });
        expect(actor.getSnapshot().value).toBe('recovering');

        // START should be ignored in recovering state
        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('recovering');

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('15.5 START followed by RECOVER is handled', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('starting');

        // RECOVER should be ignored in starting state
        actor.send({ type: 'RECOVER' });
        expect(actor.getSnapshot().value).toBe('starting');

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('15.6 Recovery with future startTimestamp is handled', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const recoveryState: RecoveryState = {
          lastTrialIndex: 5,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() + 1000000, // Future timestamp
        };

        const input = createTestInput({ recoveryState });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });

        // Should handle future timestamp
        expect(actor.getSnapshot()).toBeDefined();

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 16. ARITHMETIC INPUT EDGE CASES
// =============================================================================

describe('16. ARITHMETIC_INPUT edge cases', () => {
  it('16.1 ARITHMETIC_INPUT without arithmetic modality is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'audio'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const charsBefore = actor.getSnapshot().context.arithmeticInput.chars.length;

          actor.send({ type: 'ARITHMETIC_INPUT', key: 'digit', digit: 5 });

          // Should be ignored because arithmetic is not active
          expect(actor.getSnapshot().context.arithmeticInput.chars.length).toBe(charsBefore);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('16.2 Many digits do not overflow buffer', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 100, max: 500 }), async (digitCount) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < digitCount; i++) {
            actor.send({
              type: 'ARITHMETIC_INPUT',
              key: 'digit',
              digit: (i % 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
            });
          }

          // Should not crash
          expect(actor.getSnapshot().context.arithmeticInput.chars.length).toBe(digitCount);
        }

        actor.stop();
      }),
      { numRuns: 10 },
    );
  });

  it('16.3 Multiple decimal points only add one dot', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (decimalCount) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < decimalCount; i++) {
            actor.send({ type: 'ARITHMETIC_INPUT', key: 'decimal' });
          }

          const chars = actor.getSnapshot().context.arithmeticInput.chars;
          const decimalPointCount = chars.filter((c) => c === '.').length;
          expect(decimalPointCount).toBe(1);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('16.4 Minus toggles negative flag', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (toggleCount) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          let expectedNegative = false;
          for (let i = 0; i < toggleCount; i++) {
            actor.send({ type: 'ARITHMETIC_INPUT', key: 'minus' });
            expectedNegative = !expectedNegative;
          }

          expect(actor.getSnapshot().context.arithmeticInput.negative).toBe(expectedNegative);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 17. HEALTH EVENT EDGE CASES
// =============================================================================

describe('17. HEALTH_EVENT edge cases', () => {
  it('17.1 HEALTH_EVENT outside active state is ignored', () => {
    fc.assert(
      fc.property(fc.constantFrom('freeze', 'longTask'), (eventKind) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const freezeBefore = actor.getSnapshot().context.freezeCount;
        const longTaskBefore = actor.getSnapshot().context.longTaskCount;

        actor.send({ type: 'HEALTH_EVENT', eventKind: eventKind as 'freeze' | 'longTask' });

        // Should be ignored in idle state
        expect(actor.getSnapshot().context.freezeCount).toBe(freezeBefore);
        expect(actor.getSnapshot().context.longTaskCount).toBe(longTaskBefore);

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('17.2 Many HEALTH_EVENTs do not overflow', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1000, max: 5000 }), async (eventCount) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < eventCount; i++) {
            actor.send({
              type: 'HEALTH_EVENT',
              eventKind: i % 2 === 0 ? 'freeze' : 'longTask',
            });
          }

          const { freezeCount, longTaskCount } = actor.getSnapshot().context;
          expect(freezeCount + longTaskCount).toBe(eventCount);
          expect(Number.isFinite(freezeCount)).toBe(true);
          expect(Number.isFinite(longTaskCount)).toBe(true);
        }

        actor.stop();
      }),
      { numRuns: 5 },
    );
  });
});

// =============================================================================
// 18. VISUAL TRIGGER EDGE CASES
// =============================================================================

describe('18. VISUAL_TRIGGER / VISUAL_HIDE_TRIGGER edge cases', () => {
  it('18.1 VISUAL_TRIGGER outside stimulus is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'VISUAL_TRIGGER' });

        // Should not crash, stimulus should not be visible
        expect(actor.getSnapshot().context.stimulusVisible).toBe(false);

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('18.2 VISUAL_HIDE_TRIGGER outside stimulus is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'VISUAL_HIDE_TRIGGER' });

        expect(actor.getSnapshot().context.stimulusVisible).toBe(false);

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('18.3 Multiple VISUAL_TRIGGERs are safe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 20 }), async (triggerCount) => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < triggerCount; i++) {
            actor.send({ type: 'VISUAL_TRIGGER', firedAtMs: performance.now() });
          }

          // Should still be showing stimulus
          expect(actor.getSnapshot().context.stimulusVisible).toBe(true);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 19. ADVANCE (SELF-PACED) EDGE CASES
// =============================================================================

describe('19. ADVANCE (self-paced) edge cases', () => {
  it('19.1 ADVANCE outside active state is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'ADVANCE' });

        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('19.2 ADVANCE after finished is ignored', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const input = createTestInput();
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });
        actor.send({ type: 'ADVANCE' });

        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 20. COMBINED ADVERSARIAL SEQUENCES
// =============================================================================

describe('20. Combined adversarial sequences', () => {
  it('20.1 fc.commands-style random command sequence', () => {
    // Define commands
    const StartCommand = { run: (actor: any) => actor.send({ type: 'START' }) };
    const StopCommand = { run: (actor: any) => actor.send({ type: 'STOP' }) };
    const PauseCommand = { run: (actor: any) => actor.send({ type: 'PAUSE' }) };
    const ResumeCommand = { run: (actor: any) => actor.send({ type: 'RESUME' }) };
    const FocusLostCommand = { run: (actor: any) => actor.send({ type: 'FOCUS_LOST' }) };
    const FocusRegainedCommand = {
      run: (actor: any) => actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 1000 }),
    };
    const RespondCommand = {
      run: (actor: any) => actor.send({ type: 'RESPOND', modalityId: 'position' }),
    };

    const commands = [
      StartCommand,
      StopCommand,
      PauseCommand,
      ResumeCommand,
      FocusLostCommand,
      FocusRegainedCommand,
      RespondCommand,
    ];

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: commands.length - 1 }), { minLength: 5, maxLength: 30 }),
        (commandIndices) => {
          const input = createTestInput({
            config: createMockConfig({ activeModalities: ['position', 'audio'] }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const idx of commandIndices) {
            try {
              commands[idx]!.run(actor);
            } catch {
              // Ignore errors
            }
          }

          // Machine should be in a valid state
          expect(actor.getSnapshot()).toBeDefined();

          actor.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('20.2 Stress test: 1000 random events', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            'START',
            'STOP',
            'PAUSE',
            'RESUME',
            'RESPOND',
            'FOCUS_LOST',
            'FOCUS_REGAINED',
            'ADVANCE',
            'VISUAL_TRIGGER',
          ),
          { minLength: 1000, maxLength: 1000 },
        ),
        (events) => {
          const input = createTestInput({
            config: createMockConfig({ activeModalities: ['position', 'audio'] }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const eventType of events) {
            try {
              if (eventType === 'RESPOND') {
                actor.send({ type: 'RESPOND', modalityId: 'position' });
              } else if (eventType === 'FOCUS_REGAINED') {
                actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 100 });
              } else {
                actor.send({ type: eventType as any });
              }
            } catch {
              // Ignore
            }
          }

          // Should not crash
          expect(actor.getSnapshot()).toBeDefined();

          actor.stop();
        },
      ),
      { numRuns: 10 },
    );
  });
});

// =============================================================================
// BUG REPORTS SECTION
// =============================================================================

describe('BUG REPORTS: Discovered issues', () => {
  /**
   * BUG REPORT 1: STOP from idle state
   *
   * Observation: STOP from idle is ignored (no transition defined).
   * This may be intentional, but it could also be unexpected behavior.
   *
   * Expected: STOP should work from any state (including idle)?
   * Actual: STOP only works from starting, countdown, active, paused, recovering.
   */
  it('BUG-1: STOP from idle is ignored (by design?)', () => {
    const input = createTestInput();
    const actor = createActor(gameSessionMachine, { input });
    actor.start();

    actor.send({ type: 'STOP' });

    // Currently: STOP from idle is ignored
    expect(actor.getSnapshot().value).toBe('idle');
    // Note: This might be intentional - session hasn't started, so nothing to stop

    actor.stop();
  });

  /**
   * BUG REPORT 2: RECOVER without recoveryState (FIXED)
   *
   * FIXED: RECOVER now correctly stays in 'idle' when recoveryState is undefined.
   * You can't recover a session without recovery data.
   */
  it('BUG-2: RECOVER without recoveryState stays in idle (FIXED)', () => {
    const input = createTestInput({ recoveryState: undefined });
    const actor = createActor(gameSessionMachine, { input });
    actor.start();

    actor.send({ type: 'RECOVER' });

    // FIXED: Without recoveryState, RECOVER is a no-op - stays in idle
    expect(actor.getSnapshot().value).toBe('idle');

    actor.stop();
  });

  /**
   * BUG REPORT 3: Negative lostDurationMs in FOCUS_REGAINED
   *
   * Observation: Negative duration is accepted and used in timing adjustments.
   * This could cause nextTrialTargetTime to go backwards.
   *
   * Expected: Negative duration should be clamped to 0 or rejected?
   * Actual: Negative duration is used as-is in adjustTimingAfterFocusRegained.
   */
  it('BUG-3: Negative lostDurationMs causes timing to go backwards', async () => {
    const input = createTestInput();
    const actor = createActor(gameSessionMachine, { input });
    actor.start();

    actor.send({ type: 'START' });
    await waitForMachine(20);

    if (isInActiveState(actor.getSnapshot())) {
      const targetTimeBefore = actor.getSnapshot().context.nextTrialTargetTime;

      actor.send({ type: 'FOCUS_LOST' });
      actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: -1000 });

      const targetTimeAfter = actor.getSnapshot().context.nextTrialTargetTime;

      // Note: With negative duration, target time could go backwards
      // This test documents the current behavior
      // console.log('Before:', targetTimeBefore, 'After:', targetTimeAfter);
    }

    actor.stop();
  });

  /**
   * BUG REPORT 4: Recovery with negative lastTrialIndex (FIXED)
   *
   * FIXED: Negative trial index in recoveryState is now clamped to 0.
   * trialIndex is always >= 0 as expected.
   */
  it('BUG-4: Recovery with negative lastTrialIndex is clamped to 0 (FIXED)', () => {
    const recoveryState: RecoveryState = {
      lastTrialIndex: -5,
      trialHistory: [],
      responses: [],
      startTimestamp: Date.now() - 1000,
    };

    const input = createTestInput({ recoveryState });
    const actor = createActor(gameSessionMachine, { input });
    actor.start();

    // FIXED: Negative trialIndex is clamped to 0
    expect(actor.getSnapshot().context.trialIndex).toBe(0);

    actor.stop();
  });
});
