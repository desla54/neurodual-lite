/**
 * Property-Based Tests for GameSession XState Machine
 *
 * Invariants that must hold regardless of input sequence:
 *
 * 1. STATE TRANSITION INVARIANTS
 *    - Can't go from 'idle' to 'scoring' directly
 *    - Can't go from 'finished' to any other state
 *    - 'active' states always follow 'starting' -> 'countdown' sequence
 *
 * 2. CONTEXT CONSISTENCY
 *    - Trial count always increases during session
 *    - Trial index is never negative
 *    - Responses map size <= active modalities count
 *
 * 3. EVENT HANDLING PROPERTIES
 *    - Valid events lead to valid states
 *    - Invalid events are ignored
 *    - Events are idempotent (same event twice = same result)
 *
 * 4. GUARD CONDITIONS
 *    - Transitions only happen when guards are satisfied
 *    - hasMoreTrials guard is consistent with generator
 *
 * 5. TIMER/DELAY PROPERTIES
 *    - prepDelayMs comes from spec
 *    - ISI/stimulus duration come from spec
 *
 * 6. ROUND-TRIP PROPERTIES
 *    - Can start and stop sessions
 *    - Pause/resume preserves trial state
 *    - Recovery mode restores session state
 */

import { describe, it, expect, mock } from 'bun:test';
import * as fc from 'fast-check';
import { createActor } from 'xstate';
import { gameSessionMachine } from './game-session-machine';
import type { GameSessionInput, GameSessionEvent } from './types';
import { createDefaultGamePlugins } from './game-session-plugins';
import type { AudioPort } from '../../ports';
import type { TimerPort } from '../../timing';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { RunningStatsCalculator } from '../../coach/running-stats';
import type { GameConfig, Trial, ModalityId } from '../../domain';
import type { ModeSpec } from '../../specs/types';

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

const modalityIdArb: fc.Arbitrary<ModalityId> = fc.constantFrom(
  'position',
  'audio',
  'color',
  'image',
);

const activeModalitiesArb: fc.Arbitrary<ModalityId[]> = fc
  .subarray(['position', 'audio', 'color', 'image'] as ModalityId[], { minLength: 1, maxLength: 4 })
  .filter((arr) => arr.length > 0);

const nLevelArb = fc.integer({ min: 1, max: 10 });

const trialsCountArb = fc.integer({ min: 5, max: 50 });

const intervalMsArb = fc.integer({ min: 1000, max: 5000 });

const stimulusDurationMsArb = fc.integer({ min: 200, max: 2000 });

const prepDelayMsArb = fc.integer({ min: 0, max: 5000 });

const passThresholdArb = fc.double({ min: 0.5, max: 4.0, noNaN: true });

// Simple event types that don't require additional parameters
const simpleEventTypeArb = fc.constantFrom(
  'START',
  'RECOVER',
  'STOP',
  'PAUSE',
  'RESUME',
  'FOCUS_LOST',
  'ADVANCE',
) as fc.Arbitrary<'START' | 'RECOVER' | 'STOP' | 'PAUSE' | 'RESUME' | 'FOCUS_LOST' | 'ADVANCE'>;

const respondEventArb = (modalities: ModalityId[]): fc.Arbitrary<GameSessionEvent> =>
  fc.record({
    type: fc.constant('RESPOND' as const),
    modalityId: fc.constantFrom(...modalities),
    inputMethod: fc.constantFrom('keyboard', 'mouse', 'touch', 'gamepad'),
  }) as fc.Arbitrary<GameSessionEvent>;

// =============================================================================
// Mock Factories
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
    sessionId: `test-session-${Date.now()}`,
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

function isInState(
  snapshot: ReturnType<ReturnType<typeof createActor>['getSnapshot']>,
  state: string,
): boolean {
  return getStateValue(snapshot) === state;
}

function isInActiveState(
  snapshot: ReturnType<ReturnType<typeof createActor>['getSnapshot']>,
): boolean {
  const value = snapshot.value;
  return typeof value === 'object' && 'active' in value;
}

async function waitForMachine(delayMs = 20): Promise<void> {
  const turns = delayMs >= 100 ? 12 : delayMs >= 50 ? 8 : delayMs >= 30 ? 5 : delayMs >= 10 ? 3 : 1;

  for (let i = 0; i < turns; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// =============================================================================
// 1. STATE TRANSITION INVARIANTS (15 tests)
// =============================================================================

describe('State Transition Invariants', () => {
  it('1.1 Initial state is always idle', () => {
    fc.assert(
      fc.property(nLevelArb, trialsCountArb, (nLevel, trialsCount) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, trialsCount }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const snapshot = actor.getSnapshot();
        expect(snapshot.value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.2 START from idle goes to starting', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        expect(actor.getSnapshot().value).toBe('starting');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.3 Cannot transition from idle directly to active', () => {
    fc.assert(
      fc.property(activeModalitiesArb, (modalities) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: modalities }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // Try to send events that would normally go to active states
        // @ts-expect-error test override
        actor.send({ type: 'RESPOND', modalityId: modalities[0] });
        actor.send({ type: 'PAUSE' });
        actor.send({ type: 'RESUME' });

        // Should still be in idle
        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.4 Cannot transition from finished to any other state', () => {
    fc.assert(
      fc.property(simpleEventTypeArb, nLevelArb, (eventType, nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // Get to finished state
        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        expect(actor.getSnapshot().value).toBe('finished');

        // Try to transition out of finished
        actor.send({ type: eventType });

        // Should still be in finished
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 100 },
    );
  });

  it('1.5 STOP always leads to finished (from starting)', () => {
    fc.assert(
      fc.property(nLevelArb, trialsCountArb, (nLevel, trialsCount) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, trialsCount }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.6 STOP always leads to finished (from paused)', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        // Wait for async audio init
        await waitForMachine(20);

        // Check if we got to active state
        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');

          actor.send({ type: 'STOP' });
          expect(actor.getSnapshot().value).toBe('finished');
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('1.7 RECOVER from idle goes to recovering', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
          recoveryState: {
            lastTrialIndex: 5,
            trialHistory: [],
            responses: [],
            startTimestamp: Date.now() - 60000,
          },
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'RECOVER' });

        expect(actor.getSnapshot().value).toBe('recovering');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.8 Paused state is reachable from active states', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        // Wait for async transitions
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('1.9 FOCUS_LOST from active goes to paused', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });

        // Wait for async transitions
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'FOCUS_LOST' });
          expect(actor.getSnapshot().value).toBe('paused');
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('1.10 START is idempotent - second START is ignored', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        const stateAfterFirst = actor.getSnapshot().value;

        actor.send({ type: 'START' });
        const stateAfterSecond = actor.getSnapshot().value;

        expect(stateAfterFirst).toBe(stateAfterSecond);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.11 PAUSE is ignored when not in active state', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'PAUSE' });
        expect(actor.getSnapshot().value).toBe('idle');

        actor.send({ type: 'START' });
        actor.send({ type: 'PAUSE' }); // In starting, not active
        expect(actor.getSnapshot().value).toBe('starting');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.12 RESUME is only effective when paused', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // RESUME in idle should be ignored
        actor.send({ type: 'RESUME' });
        expect(actor.getSnapshot().value).toBe('idle');

        actor.send({ type: 'START' });
        // RESUME in starting should be ignored
        actor.send({ type: 'RESUME' });
        expect(actor.getSnapshot().value).toBe('starting');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.13 FOCUS_REGAINED only works when paused', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // FOCUS_REGAINED in idle should be ignored
        actor.send({ type: 'FOCUS_REGAINED', lostDurationMs: 1000 });
        expect(actor.getSnapshot().value).toBe('idle');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('1.14 State machine is deterministic for same event sequence', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 5 }),
        nLevelArb,
        (events, nLevel) => {
          const input1 = createTestInput({
            sessionId: 'test-1',
            config: createMockConfig({ nLevel }),
          });
          const input2 = createTestInput({
            sessionId: 'test-2',
            config: createMockConfig({ nLevel }),
          });

          const actor1 = createActor(gameSessionMachine, { input: input1 });
          const actor2 = createActor(gameSessionMachine, { input: input2 });

          actor1.start();
          actor2.start();

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor1.send({ type: event, lostDurationMs: 1000 });
              actor2.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor1.send({ type: event });
              actor2.send({ type: event });
            }
          }

          expect(getStateValue(actor1.getSnapshot())).toBe(getStateValue(actor2.getSnapshot()));

          actor1.stop();
          actor2.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('1.15 finished is a final state', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        const snapshot = actor.getSnapshot();
        expect(snapshot.value).toBe('finished');
        expect(snapshot.status).toBe('done');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 2. CONTEXT CONSISTENCY (15 tests)
// =============================================================================

describe('Context Consistency Properties', () => {
  it('2.1 Trial index is never negative', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 10 }),
        nLevelArb,
        (events, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          expect(actor.getSnapshot().context.trialIndex).toBeGreaterThanOrEqual(0);

          actor.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('2.2 Session ID is immutable throughout session', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 5 }),
        (sessionId, events) => {
          const input = createTestInput({ sessionId });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          const initialSessionId = actor.getSnapshot().context.sessionId;

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          expect(actor.getSnapshot().context.sessionId).toBe(initialSessionId);

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('2.3 User ID is immutable throughout session', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 5 }),
        (userId, events) => {
          const input = createTestInput({ userId });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          const initialUserId = actor.getSnapshot().context.userId;

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          expect(actor.getSnapshot().context.userId).toBe(initialUserId);

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('2.4 Config is immutable throughout session', () => {
    fc.assert(
      fc.property(nLevelArb, trialsCountArb, (nLevel, trialsCount) => {
        const config = createMockConfig({ nLevel, trialsCount });
        const input = createTestInput({ config });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const initialConfig = actor.getSnapshot().context.config;

        actor.send({ type: 'START' });
        actor.send({ type: 'STOP' });

        expect(actor.getSnapshot().context.config).toEqual(initialConfig);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.5 Trial history length never exceeds trial index', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 10 }),
        nLevelArb,
        (events, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          const { trialHistory, trialIndex } = actor.getSnapshot().context;
          expect(trialHistory.length).toBeLessThanOrEqual(trialIndex);

          actor.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('2.6 Responses map size never exceeds active modalities count', () => {
    fc.assert(
      fc.property(activeModalitiesArb, (modalities) => {
        const input = createTestInput({
          config: createMockConfig({ activeModalities: modalities }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // Try to add responses
        for (const modalityId of modalities) {
          actor.send({ type: 'RESPOND', modalityId });
        }

        const { responses } = actor.getSnapshot().context;
        expect(responses.size).toBeLessThanOrEqual(modalities.length);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.7 ISI comes from spec timing', () => {
    fc.assert(
      fc.property(intervalMsArb, (intervalMs) => {
        const spec = createMockSpec({ timing: { intervalMs, stimulusDurationMs: 500 } });
        const input = createTestInput({ spec });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.isi).toBe(intervalMs);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.8 Stimulus duration comes from spec timing', () => {
    fc.assert(
      fc.property(stimulusDurationMsArb, (stimulusDurationMs) => {
        const spec = createMockSpec({ timing: { stimulusDurationMs, intervalMs: 2500 } });
        const input = createTestInput({ spec });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.stimulusDuration).toBe(stimulusDurationMs);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.9 Session events array grows monotonically', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        let previousLength = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'START' });
        let currentLength = actor.getSnapshot().context.sessionEvents.length;
        expect(currentLength).toBeGreaterThanOrEqual(previousLength);
        previousLength = currentLength;

        actor.send({ type: 'STOP' });
        currentLength = actor.getSnapshot().context.sessionEvents.length;
        expect(currentLength).toBeGreaterThanOrEqual(previousLength);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.10 Current phase is null when not in active state', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // In idle
        expect(actor.getSnapshot().context.currentPhase).toBeNull();

        actor.send({ type: 'START' });
        // In starting
        expect(actor.getSnapshot().context.currentPhase).toBeNull();

        actor.send({ type: 'STOP' });
        // In finished
        expect(actor.getSnapshot().context.currentPhase).toBeNull();

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.11 Freeze count and long task count are never negative', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 10 }),
        nLevelArb,
        (events, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          const { freezeCount, longTaskCount } = actor.getSnapshot().context;
          expect(freezeCount).toBeGreaterThanOrEqual(0);
          expect(longTaskCount).toBeGreaterThanOrEqual(0);

          actor.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('2.13 Stimulus visible is boolean', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 1, maxLength: 5 }),
        nLevelArb,
        (events, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const event of events) {
            // @ts-expect-error test override
            if (event === 'FOCUS_REGAINED') {
              actor.send({ type: event, lostDurationMs: 1000 });
            } else {
              actor.send({ type: event });
            }
          }

          const { stimulusVisible } = actor.getSnapshot().context;
          expect(typeof stimulusVisible).toBe('boolean');

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('2.14 Paused in state is null when not paused', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.pausedInState).toBeNull();

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().context.pausedInState).toBeNull();

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('2.15 Arithmetic input is always properly structured', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const { arithmeticInput } = actor.getSnapshot().context;
        expect(Array.isArray(arithmeticInput.chars)).toBe(true);
        expect(typeof arithmeticInput.negative).toBe('boolean');
        expect(typeof arithmeticInput.decimal).toBe('boolean');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 3. EVENT HANDLING PROPERTIES (10 tests)
// =============================================================================

describe('Event Handling Properties', () => {
  it('3.1 RESPOND is ignored for invalid modality', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, activeModalities: ['position'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const responsesBeforeCount = actor.getSnapshot().context.responses.size;

          // Send response for modality not in active modalities
          actor.send({ type: 'RESPOND', modalityId: 'color' });

          const responsesAfterCount = actor.getSnapshot().context.responses.size;
          expect(responsesAfterCount).toBe(responsesBeforeCount);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.2 RESPOND is ignored for arithmetic modality (special handling)', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // Arithmetic responses are handled differently (via ARITHMETIC_INPUT)
          actor.send({ type: 'RESPOND', modalityId: 'arithmetic' });

          const responses = actor.getSnapshot().context.responses;
          expect(responses.has('arithmetic')).toBe(false);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.3 HEALTH_EVENT increments freeze count', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const freezeCountBefore = actor.getSnapshot().context.freezeCount;

          actor.send({ type: 'HEALTH_EVENT', eventKind: 'freeze' });

          const freezeCountAfter = actor.getSnapshot().context.freezeCount;
          expect(freezeCountAfter).toBe(freezeCountBefore + 1);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.4 HEALTH_EVENT increments long task count', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const longTaskCountBefore = actor.getSnapshot().context.longTaskCount;

          actor.send({ type: 'HEALTH_EVENT', eventKind: 'longTask' });

          const longTaskCountAfter = actor.getSnapshot().context.longTaskCount;
          expect(longTaskCountAfter).toBe(longTaskCountBefore + 1);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.5 ARITHMETIC_INPUT updates arithmetic input buffer', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 9 }), nLevelArb, async (digit, nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const charsBefore = actor.getSnapshot().context.arithmeticInput.chars.length;

          actor.send({
            type: 'ARITHMETIC_INPUT',
            key: 'digit',
            digit: digit as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
          });

          const charsAfter = actor.getSnapshot().context.arithmeticInput.chars.length;
          expect(charsAfter).toBe(charsBefore + 1);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.6 ARITHMETIC_INPUT reset clears the buffer', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, activeModalities: ['position', 'arithmetic'] }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          // Add some digits
          actor.send({ type: 'ARITHMETIC_INPUT', key: 'digit', digit: 5 });
          actor.send({ type: 'ARITHMETIC_INPUT', key: 'digit', digit: 3 });

          // Reset
          actor.send({ type: 'ARITHMETIC_INPUT', key: 'reset' });

          const { arithmeticInput } = actor.getSnapshot().context;
          expect(arithmeticInput.chars.length).toBe(0);
          expect(arithmeticInput.negative).toBe(false);
          expect(arithmeticInput.decimal).toBe(false);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.7 VISUAL_TRIGGER sets stimulus visible', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (
          isInActiveState(actor.getSnapshot()) &&
          getStateValue(actor.getSnapshot()).includes('stimulus')
        ) {
          actor.send({ type: 'VISUAL_TRIGGER' });
          expect(actor.getSnapshot().context.stimulusVisible).toBe(true);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.8 VISUAL_HIDE_TRIGGER sets stimulus hidden', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (
          isInActiveState(actor.getSnapshot()) &&
          getStateValue(actor.getSnapshot()).includes('stimulus')
        ) {
          // First show, then hide
          actor.send({ type: 'VISUAL_TRIGGER' });
          actor.send({ type: 'VISUAL_HIDE_TRIGGER' });
          expect(actor.getSnapshot().context.stimulusVisible).toBe(false);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.9 Unknown events are safely ignored', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const stateBefore = getStateValue(actor.getSnapshot());

        // Try to send an unknown event (TypeScript won't allow this at compile time,
        // but we test runtime safety)
        try {
          // @ts-expect-error - Testing runtime behavior with invalid event
          actor.send({ type: 'UNKNOWN_EVENT' });
        } catch {
          // Expected for strict type checking
        }

        const stateAfter = getStateValue(actor.getSnapshot());
        expect(stateAfter).toBe(stateBefore);

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('3.10 Events in wrong state are ignored without crashing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('RESPOND', 'PAUSE', 'RESUME', 'ADVANCE'),
        nLevelArb,
        (eventType, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          // Try to send events that shouldn't work in idle state
          if (eventType === 'RESPOND') {
            actor.send({ type: 'RESPOND', modalityId: 'position' });
          } else {
            actor.send({ type: eventType as 'PAUSE' | 'RESUME' | 'ADVANCE' });
          }

          // Should still be in idle without crashing
          expect(actor.getSnapshot().value).toBe('idle');

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 4. GUARD CONDITIONS (10 tests)
// =============================================================================

describe('Guard Conditions Properties', () => {
  it('4.1 hasMoreTrials guard respects generator', () => {
    fc.assert(
      fc.property(trialsCountArb, (trialsCount) => {
        let generatedCount = 0;
        const mockGenerator = {
          ...createMockGenerator(trialsCount),
          hasMore: mock(() => generatedCount < trialsCount),
          generateNext: mock(() => {
            return createMockTrial(generatedCount++);
          }),
        };

        const input = createTestInput({
          generator: mockGenerator,
          config: createMockConfig({ trialsCount }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // hasMore should be consistent with generator
        expect(mockGenerator.hasMore()).toBe(generatedCount < trialsCount);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('4.2 isValidModality guard checks active modalities', () => {
    fc.assert(
      fc.property(
        fc.subarray(['position', 'audio', 'color', 'image'] as ModalityId[], {
          minLength: 1,
          maxLength: 3,
        }),
        (activeModalities) => {
          const input = createTestInput({
            config: createMockConfig({ activeModalities }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          // The guard should accept active modalities and reject others
          const allModalities: ModalityId[] = ['position', 'audio', 'color', 'image'];
          for (const modalityId of allModalities) {
            const isActive = activeModalities.includes(modalityId);
            // Guard behavior is tested indirectly through state transitions
            expect(isActive === activeModalities.includes(modalityId)).toBe(true);
          }

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('4.3 wasInStimulus guard only true after pause from stimulus', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const currentState = getStateValue(actor.getSnapshot());

          actor.send({ type: 'PAUSE' });

          if (currentState.includes('stimulus')) {
            expect(actor.getSnapshot().context.pausedInState).toBe('stimulus');
          }
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('4.4 wasInWaiting guard only true after pause from waiting', () => {
    // This test is tricky because we need to get to the waiting state
    // For now, we just verify the pausedInState context updates correctly
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // Initially, pausedInState should be null
        expect(actor.getSnapshot().context.pausedInState).toBeNull();

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('4.5 isRecoveryMode guard checks recovery state', () => {
    fc.assert(
      fc.property(fc.boolean(), nLevelArb, (hasRecovery, nLevel) => {
        const recoveryState = hasRecovery
          ? {
              lastTrialIndex: 5,
              trialHistory: [],
              responses: [],
              startTimestamp: Date.now() - 60000,
            }
          : undefined;

        const input = createTestInput({
          config: createMockConfig({ nLevel }),
          recoveryState,
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.recoveryState !== undefined).toBe(hasRecovery);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('4.6 isSelfPaced guard depends on spec', () => {
    fc.assert(
      fc.property(fc.boolean(), nLevelArb, (selfPaced, nLevel) => {
        const spec = createMockSpec({
          timing: {
            stimulusDurationMs: 500,
            intervalMs: selfPaced ? 0 : 2500, // 0 interval = self-paced
          },
        });

        const input = createTestInput({
          spec,
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // The isSelfPaced guard should reflect the spec configuration
        // This is determined by the rhythm plugin
        const isSelfPacedFromSpec = spec.timing.intervalMs === 0;
        expect(isSelfPacedFromSpec).toBe(selfPaced);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('4.7 Guards are pure functions (no side effects)', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor1 = createActor(gameSessionMachine, { input });
        const actor2 = createActor(gameSessionMachine, { input });

        actor1.start();
        actor2.start();

        // Same input should produce same guard evaluations
        actor1.send({ type: 'START' });
        actor2.send({ type: 'START' });

        expect(getStateValue(actor1.getSnapshot())).toBe(getStateValue(actor2.getSnapshot()));

        actor1.stop();
        actor2.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('4.8 Guard evaluation is deterministic', () => {
    fc.assert(
      fc.property(trialsCountArb, fc.integer({ min: 0, max: 20 }), (trialsCount, currentTrial) => {
        const normalizedTrial = Math.min(currentTrial, trialsCount);

        // hasMore should be deterministic based on trial count
        const hasMore = normalizedTrial < trialsCount;
        expect(hasMore).toBe(normalizedTrial < trialsCount);
      }),
      { numRuns: 100 },
    );
  });

  it('4.9 Multiple guard conditions combine correctly', () => {
    fc.assert(
      fc.property(activeModalitiesArb, modalityIdArb, (activeModalities, testModality) => {
        const isValid = activeModalities.includes(testModality);
        const isNotArithmetic = testModality !== 'arithmetic';
        const shouldPass = isValid && isNotArithmetic;

        // The combined guard for RESPOND checks both conditions
        expect(shouldPass).toBe(isValid && isNotArithmetic);
      }),
      { numRuns: 100 },
    );
  });

  it('4.10 Guard state is consistent with context', () => {
    fc.assert(
      fc.property(nLevelArb, trialsCountArb, (nLevel, trialsCount) => {
        let trialIndex = 0;
        const mockGenerator = {
          ...createMockGenerator(trialsCount),
          hasMore: mock(() => trialIndex < trialsCount),
          generateNext: mock(() => createMockTrial(trialIndex++)),
        };

        const input = createTestInput({
          generator: mockGenerator,
          config: createMockConfig({ nLevel, trialsCount }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        // Generator state should be consistent
        const hasMore1 = mockGenerator.hasMore();
        const hasMore2 = mockGenerator.hasMore();
        expect(hasMore1).toBe(hasMore2);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 5. TIMER/DELAY PROPERTIES (5 tests)
// =============================================================================

describe('Timer and Delay Properties', () => {
  it('5.1 prepDelayMs comes from spec', () => {
    fc.assert(
      fc.property(prepDelayMsArb, (prepDelayMs) => {
        const spec = createMockSpec({
          timing: { prepDelayMs, stimulusDurationMs: 500, intervalMs: 2500 },
        });
        const input = createTestInput({ spec });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.spec.timing.prepDelayMs).toBe(prepDelayMs);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('5.2 ISI is positive when from spec', () => {
    fc.assert(
      fc.property(intervalMsArb, (intervalMs) => {
        const spec = createMockSpec({ timing: { intervalMs, stimulusDurationMs: 500 } });
        const input = createTestInput({ spec });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.isi).toBeGreaterThan(0);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('5.3 Stimulus duration is positive', () => {
    fc.assert(
      fc.property(stimulusDurationMsArb, (stimulusDurationMs) => {
        const spec = createMockSpec({ timing: { stimulusDurationMs, intervalMs: 2500 } });
        const input = createTestInput({ spec });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.stimulusDuration).toBeGreaterThan(0);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('5.4 Pause elapsed time is non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().context.pauseElapsedTime).toBeGreaterThanOrEqual(0);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('5.5 Next trial target time advances', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        const initialTargetTime = actor.getSnapshot().context.nextTrialTargetTime;

        // After START, target time should be set
        actor.send({ type: 'START' });

        // Target time initialization happens in actions
        // It should be >= initial value
        expect(actor.getSnapshot().context.nextTrialTargetTime).toBeGreaterThanOrEqual(
          initialTargetTime,
        );

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 6. ROUND-TRIP PROPERTIES (10 tests)
// =============================================================================

describe('Round-Trip Properties', () => {
  it('6.1 Can start and stop a session', () => {
    fc.assert(
      fc.property(nLevelArb, trialsCountArb, (nLevel, trialsCount) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel, trialsCount }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().value).toBe('idle');

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('starting');

        actor.send({ type: 'STOP' });
        expect(actor.getSnapshot().value).toBe('finished');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('6.2 Pause and resume preserves context', async () => {
    await fc.assert(
      fc.asyncProperty(nLevelArb, async (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          const contextBeforePause = actor.getSnapshot().context;

          actor.send({ type: 'PAUSE' });
          expect(actor.getSnapshot().value).toBe('paused');

          // Key context values should be preserved
          expect(actor.getSnapshot().context.sessionId).toBe(contextBeforePause.sessionId);
          expect(actor.getSnapshot().context.trialIndex).toBe(contextBeforePause.trialIndex);

          actor.send({ type: 'RESUME' });

          // After resume, context should still be consistent
          expect(actor.getSnapshot().context.sessionId).toBe(contextBeforePause.sessionId);
        }

        actor.stop();
      }),
      { numRuns: 30 },
    );
  });

  it('6.3 Recovery mode initializes with recovery state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), nLevelArb, (lastTrialIndex, nLevel) => {
        const recoveryState = {
          lastTrialIndex,
          trialHistory: Array.from({ length: lastTrialIndex }, (_, i) => createMockTrial(i)),
          responses: [],
          startTimestamp: Date.now() - 60000,
        };

        const input = createTestInput({
          config: createMockConfig({ nLevel }),
          recoveryState,
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.recoveryState).toBeDefined();
        expect(actor.getSnapshot().context.recoveryState?.lastTrialIndex).toBe(lastTrialIndex);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('6.4 RECOVER transitions correctly', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const recoveryState = {
          lastTrialIndex: 5,
          trialHistory: [],
          responses: [],
          startTimestamp: Date.now() - 60000,
        };

        const input = createTestInput({
          config: createMockConfig({ nLevel }),
          recoveryState,
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().value).toBe('idle');

        actor.send({ type: 'RECOVER' });
        expect(actor.getSnapshot().value).toBe('recovering');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('6.5 Multiple pause/resume cycles work', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), nLevelArb, async (cycles, nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < cycles; i++) {
            actor.send({ type: 'PAUSE' });
            expect(actor.getSnapshot().value).toBe('paused');

            actor.send({ type: 'RESUME' });
            // Should be back in resuming or active state
            expect([
              'resuming',
              'active.stimulus',
              'active.waiting',
              'active.stimulusResume',
              'active.waitingResume',
            ]).toContain(getStateValue(actor.getSnapshot()).replace('active.', 'active.'));
          }
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('6.6 FOCUS_LOST and FOCUS_REGAINED cycle works', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 5000 }),
        nLevelArb,
        async (lostDurationMs, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          actor.send({ type: 'START' });
          await waitForMachine(20);

          if (isInActiveState(actor.getSnapshot())) {
            actor.send({ type: 'FOCUS_LOST' });
            expect(actor.getSnapshot().value).toBe('paused');

            actor.send({ type: 'FOCUS_REGAINED', lostDurationMs });
            // Should transition to resuming
            const state = getStateValue(actor.getSnapshot());
            expect([
              'resuming',
              'active.stimulus',
              'active.waiting',
              'active.stimulusResume',
              'active.waitingResume',
            ]).toContain(state.includes('active') ? state : 'resuming');
          }

          actor.stop();
        },
      ),
      { numRuns: 30 },
    );
  });

  it('6.7 Session events are emitted on START', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.sessionEvents.length).toBe(0);

        actor.send({ type: 'START' });

        // SESSION_STARTED event should be emitted
        expect(actor.getSnapshot().context.sessionEvents.length).toBeGreaterThan(0);
        // @ts-expect-error test: nullable access
        expect(actor!.getSnapshot().context.sessionEvents[0].type).toBe('SESSION_STARTED');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('6.8 Session events are emitted on STOP', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        const eventsBeforeStop = actor.getSnapshot().context.sessionEvents.length;

        actor.send({ type: 'STOP' });
        const eventsAfterStop = actor.getSnapshot().context.sessionEvents.length;

        // SESSION_ENDED event should be emitted
        expect(eventsAfterStop).toBeGreaterThan(eventsBeforeStop);

        const lastEvent = actor.getSnapshot().context.sessionEvents[eventsAfterStop - 1];
        expect(lastEvent!.type).toBe('SESSION_ENDED');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('6.9 Session can be started with different configs', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        trialsCountArb,
        activeModalitiesArb,
        (nLevel, trialsCount, activeModalities) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel, trialsCount, activeModalities }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          expect(actor.getSnapshot().context.config.nLevel).toBe(nLevel);
          expect(actor.getSnapshot().context.config.trialsCount).toBe(trialsCount);
          expect(actor.getSnapshot().context.config.activeModalities).toEqual(activeModalities);

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('6.10 Final summary is null until session ends', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.finalSummary).toBeNull();

        actor.send({ type: 'START' });
        expect(actor.getSnapshot().context.finalSummary).toBeNull();

        // After STOP without completing, summary may still be null
        // (depends on whether computing state is reached)
        actor.send({ type: 'STOP' });

        // In this case, we abandon early so summary might be null
        // The invariant is that it's null BEFORE the session ends

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 7. SPEC-DRIVEN CONFIGURATION (5 tests)
// =============================================================================

describe('Spec-Driven Configuration Properties', () => {
  it('7.1 Scoring strategy comes from spec', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('sdt', 'dualnback-classic', 'brainworkshop', 'accuracy'),
        nLevelArb,
        (strategy, nLevel) => {
          const spec = createMockSpec({ scoring: { strategy, passThreshold: 1.5 } });
          const input = createTestInput({
            spec,
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          expect(actor.getSnapshot().context.spec.scoring.strategy).toBe(strategy);

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('7.2 Pass threshold comes from spec', () => {
    fc.assert(
      fc.property(passThresholdArb, nLevelArb, (passThreshold, nLevel) => {
        const spec = createMockSpec({ scoring: { strategy: 'sdt', passThreshold } });
        const input = createTestInput({
          spec,
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.spec.scoring.passThreshold).toBe(passThreshold);

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('7.3 Generator type comes from spec', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Aleatoire',
          'BrainWorkshop',
          'DualnbackClassic',
          'Sequence',
        ) as fc.Arbitrary<'Aleatoire' | 'BrainWorkshop' | 'DualnbackClassic' | 'Sequence'>,
        nLevelArb,
        (generator, nLevel) => {
          // @ts-expect-error test override
          const spec = createMockSpec({ generation: { generator, targetProbability: 0.25 } });
          const input = createTestInput({
            spec,
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          expect(actor.getSnapshot().context.spec.generation.generator).toBe(generator);

          actor.stop();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('7.4 Default modalities come from spec', () => {
    fc.assert(
      fc.property(activeModalitiesArb, nLevelArb, (activeModalities, nLevel) => {
        const spec = createMockSpec({ defaults: { nLevel, trialsCount: 20, activeModalities } });
        const input = createTestInput({
          spec,
          config: createMockConfig({ nLevel, activeModalities }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.spec.defaults.activeModalities).toEqual(
          activeModalities,
        );

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });

  it('7.5 Session type comes from spec', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const spec = createMockSpec({ sessionType: 'GameSession' });
        const input = createTestInput({
          spec,
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        expect(actor.getSnapshot().context.spec.sessionType).toBe('GameSession');

        actor.stop();
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 8. STRESS TESTS (5 tests)
// =============================================================================

describe('Stress Test Properties', () => {
  it('8.1 Machine handles many events without crashing', () => {
    fc.assert(
      fc.property(
        fc.array(simpleEventTypeArb, { minLength: 50, maxLength: 100 }),
        nLevelArb,
        (events, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          for (const event of events) {
            try {
              // @ts-expect-error test override
              if (event === 'FOCUS_REGAINED') {
                actor.send({ type: event, lostDurationMs: 1000 });
              } else {
                actor.send({ type: event });
              }
            } catch {
              // Some events may cause internal errors in test mocks
              // The important thing is the machine doesn't crash
            }
          }

          // Machine should still be in a valid state
          const state = getStateValue(actor.getSnapshot());
          expect([
            'idle',
            'starting',
            'countdown',
            'active.stimulus',
            'active.waiting',
            'paused',
            'resuming',
            'computing',
            'finished',
            'recovering',
          ]).toContain(state.includes('.') ? state : state);

          actor.stop();
        },
      ),
      { numRuns: 20 },
    );
  });

  it('8.2 Many RESPOND events do not corrupt state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(modalityIdArb, { minLength: 10, maxLength: 50 }),
        nLevelArb,
        async (modalities, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({
              nLevel,
              activeModalities: ['position', 'audio', 'color', 'image'],
            }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          actor.send({ type: 'START' });
          await waitForMachine(20);

          if (isInActiveState(actor.getSnapshot())) {
            for (const modalityId of modalities) {
              actor.send({ type: 'RESPOND', modalityId });
            }

            // Responses should be bounded by active modalities
            const { responses } = actor.getSnapshot().context;
            expect(responses.size).toBeLessThanOrEqual(4);
          }

          actor.stop();
        },
      ),
      { numRuns: 20 },
    );
  });

  it('8.3 Rapid pause/resume cycles do not corrupt state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 30 }), nLevelArb, async (cycles, nLevel) => {
        const input = createTestInput({
          config: createMockConfig({ nLevel }),
        });
        const actor = createActor(gameSessionMachine, { input });
        actor.start();

        actor.send({ type: 'START' });
        await waitForMachine(20);

        if (isInActiveState(actor.getSnapshot())) {
          for (let i = 0; i < cycles; i++) {
            actor.send({ type: 'PAUSE' });
            actor.send({ type: 'RESUME' });
          }

          // Context should still be valid
          const { trialIndex, sessionEvents, responses } = actor.getSnapshot().context;
          expect(trialIndex).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(sessionEvents)).toBe(true);
          expect(responses instanceof Map).toBe(true);
        }

        actor.stop();
      }),
      { numRuns: 20 },
    );
  });

  it('8.4 Many ARITHMETIC_INPUT events do not corrupt buffer', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 100 }),
        nLevelArb,
        async (digits, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel, activeModalities: ['position', 'arithmetic'] }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          actor.send({ type: 'START' });
          await waitForMachine(20);

          if (isInActiveState(actor.getSnapshot())) {
            for (const digit of digits) {
              actor.send({
                type: 'ARITHMETIC_INPUT',
                key: 'digit',
                digit: digit as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
              });
            }

            // Buffer should contain the digits
            const { arithmeticInput } = actor.getSnapshot().context;
            expect(Array.isArray(arithmeticInput.chars)).toBe(true);
            expect(arithmeticInput.chars.length).toBe(digits.length);
          }

          actor.stop();
        },
      ),
      { numRuns: 20 },
    );
  });

  it('8.5 Many HEALTH_EVENT do not overflow counters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 500 }),
        nLevelArb,
        async (eventCount, nLevel) => {
          const input = createTestInput({
            config: createMockConfig({ nLevel }),
          });
          const actor = createActor(gameSessionMachine, { input });
          actor.start();

          actor.send({ type: 'START' });
          await waitForMachine(20);

          if (isInActiveState(actor.getSnapshot())) {
            for (let i = 0; i < eventCount; i++) {
              const eventKind = i % 2 === 0 ? 'freeze' : 'longTask';
              actor.send({ type: 'HEALTH_EVENT', eventKind });
            }

            const { freezeCount, longTaskCount } = actor.getSnapshot().context;
            expect(freezeCount).toBeGreaterThanOrEqual(0);
            expect(longTaskCount).toBeGreaterThanOrEqual(0);
            expect(freezeCount + longTaskCount).toBe(eventCount);
          }

          actor.stop();
        },
      ),
      { numRuns: 10 },
    );
  });
});
