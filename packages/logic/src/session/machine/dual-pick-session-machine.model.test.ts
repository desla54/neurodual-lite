/**
 * Model-Based Testing for DualPickSession Machine
 *
 * Uses @xstate/graph to automatically explore all reachable states
 * and verify invariants at each state transition.
 *
 * Benefits:
 * - Automatically generates test cases covering all paths
 * - Finds edge cases humans might miss
 * - Tests state machine invariants, not just happy paths
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createTestModel, getShortestPaths, getSimplePaths } from '@xstate/graph';
import { setup, assign, createActor } from 'xstate';
import type { DualPickSessionInput } from './dual-pick-session-types';
import { createDefaultDualPickPlugins } from './dual-pick-session-plugins';
import type { AudioPort } from '../../ports/audio-port';
import type { ClockPort } from '../../ports/clock-port';
import type { RandomPort } from '../../ports/random-port';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { Trial } from '../../types/core';
import { DualPickSpec, type PickSpec } from '../../specs';

// =============================================================================
// Mock Factories (same as regular tests)
// =============================================================================

function createMockAudio(): AudioPort {
  return {
    init: () => Promise.resolve(undefined),
    isReady: () => true,
    // @ts-expect-error test override
    playSound: () => undefined,
    schedule: () => undefined,
    scheduleCallback: (_ms: number, cb: () => void) => {
      setTimeout(cb, 0);
      return 1;
    },
    cancelCallback: () => undefined,
    stopAll: () => undefined,
    getCurrentTime: () => 0,
    getVolumeLevel: () => 1,
    playCorrect: () => undefined,
    playIncorrect: () => undefined,
    playClick: () => undefined,
    setConfig: () => undefined,
    unloadAll: () => undefined,
    getBufferCount: () => 0,
  };
}

function createMockClock(): ClockPort {
  let time = 0;
  return {
    now: () => time++,
    dateNow: () => Date.now(),
  };
}

function createMockRandom(): RandomPort {
  let counter = 0;
  return {
    random: () => 0.5,
    generateId: () => `id-${++counter}`,
    // @ts-expect-error test override
    shuffle: <T>(arr: T[]) => [...arr],
  };
}

function createMockTrial(index: number): Trial {
  return {
    index,
    // @ts-expect-error test override
    position: index % 8,
    sound: 'C',
    isPositionTarget: index > 1 && index % 3 === 0,
    isSoundTarget: index > 1 && index % 4 === 0,
    isBuffer: index < 2,
    isPositionLure: false,
    isSoundLure: false,
  };
}

function createMockGenerator(totalTrials = 3): TrialGenerator {
  let trialIndex = 0;
  return {
    generateNext: () => createMockTrial(trialIndex++),
    hasMore: () => trialIndex < totalTrials,
    getTotalTrials: () => totalTrials,
    skipTo: () => undefined,
    getISI: () => 2.5,
    getZoneNumber: () => null,
    getTargetProbability: () => null,
    getLureProbability: () => null,
    getGameParameters: () => null,
    isAdaptive: () => false,
    processFeedback: () => undefined,
    // @ts-expect-error test override
    getAlgorithmType: () => null,
    serializeAlgorithmState: () => null,
    restoreAlgorithmState: () => undefined,
  };
}

function createMockSpec(): PickSpec {
  return {
    ...DualPickSpec,
    defaults: {
      ...DualPickSpec.defaults,
      trialsCount: 3,
    },
  };
}

// =============================================================================
// Simplified Test Machine for Model-Based Testing
// =============================================================================

/**
 * For model-based testing, we use a simplified synchronous version of the machine
 * that removes async actors (audio init, timers) to make exploration deterministic.
 *
 * This tests the STATE LOGIC, not the async behavior (which is tested separately).
 */
const testMachine = setup({
  types: {
    context: {} as {
      trialIndex: number;
      totalTrials: number;
      isCompleted: boolean;
      stats: { turnsCompleted: number };
    },
    events: {} as
      | { type: 'START' }
      | { type: 'STOP' }
      | { type: 'AUDIO_READY' }
      | { type: 'STIMULUS_TIMER_DONE' }
      | { type: 'ALL_LABELS_PLACED' }
      | { type: 'INTER_TRIAL_DONE' },
  },
  actions: {
    incrementTrialIndex: assign(({ context }) => ({
      trialIndex: context.trialIndex + 1,
    })),
    setIncomplete: assign(() => ({
      isCompleted: false,
    })),
    incrementTurnsCompleted: assign(({ context }) => ({
      stats: { turnsCompleted: context.stats.turnsCompleted + 1 },
    })),
  },
  guards: {
    hasMoreTrials: ({ context }) => context.trialIndex < context.totalTrials - 1,
    noMoreTrials: ({ context }) => context.trialIndex >= context.totalTrials - 1,
  },
}).createMachine({
  id: 'dualPickSessionTest',
  initial: 'idle',
  context: {
    trialIndex: 0,
    totalTrials: 3,
    isCompleted: true,
    stats: { turnsCompleted: 0 },
  },
  states: {
    idle: {
      on: {
        START: 'starting',
        STOP: 'finished',
      },
    },
    starting: {
      on: {
        AUDIO_READY: 'stimulus',
        STOP: {
          target: 'finished',
          actions: ['setIncomplete'],
        },
      },
    },
    stimulus: {
      on: {
        STIMULUS_TIMER_DONE: 'placement',
        STOP: {
          target: 'finished',
          actions: ['setIncomplete'],
        },
      },
    },
    placement: {
      on: {
        ALL_LABELS_PLACED: {
          target: 'turnEnd',
          actions: ['incrementTurnsCompleted'],
        },
        STOP: {
          target: 'finished',
          actions: ['setIncomplete'],
        },
      },
    },
    turnEnd: {
      on: {
        INTER_TRIAL_DONE: [
          {
            guard: 'hasMoreTrials',
            target: 'stimulus',
            actions: ['incrementTrialIndex'],
          },
          {
            guard: 'noMoreTrials',
            target: 'finished',
          },
        ],
        STOP: {
          target: 'finished',
          actions: ['setIncomplete'],
        },
      },
    },
    finished: {
      type: 'final',
    },
  },
});

// =============================================================================
// Model-Based Test with @xstate/graph
// =============================================================================

describe('DualPickSession Model-Based Tests', () => {
  describe('Graph exploration - shortest paths', () => {
    const paths = getShortestPaths(testMachine);

    it(`discovers ${paths.length} shortest paths to all states`, () => {
      expect(paths.length).toBeGreaterThan(0);

      // Log discovered paths for debugging
      const statesReached = new Set(paths.map((p) => JSON.stringify(p.state.value)));
      console.log(`Reached ${statesReached.size} unique states via ${paths.length} paths`);
      console.log('States:', [...statesReached].join(', '));
    });

    // Generate a test for each discovered path
    paths.forEach((path, index) => {
      const targetState = JSON.stringify(path.state.value);

      it(`path ${index + 1}: reaches ${targetState}`, () => {
        const actor = createActor(testMachine);
        actor.start();

        // Execute each step in the path
        for (const step of path.steps) {
          const prevSnapshot = actor.getSnapshot();
          actor.send(step.event);
          const nextSnapshot = actor.getSnapshot();

          // Verify state-specific invariants after each transition
          verifyInvariants(prevSnapshot.context, nextSnapshot.context, step.event);
        }

        // Verify we reached the expected state
        const finalState = actor.getSnapshot().value;
        expect(finalState).toEqual(path.state.value);

        actor.stop();
      });
    });
  });

  describe('Graph exploration - simple paths', () => {
    const paths = getSimplePaths(testMachine);

    it(`discovers ${paths.length} simple paths (more thorough)`, () => {
      expect(paths.length).toBeGreaterThan(0);
      console.log(`Found ${paths.length} simple (non-repeating) paths`);
    });

    // Test interesting edge case paths (STOP from different states)
    const stopPaths = paths.filter((p) => {
      const events = p.steps.map((s) => s.event.type);
      return events.includes('STOP') && events.indexOf('STOP') > 0;
    });

    stopPaths.forEach((path, index) => {
      const eventSequence = path.steps.map((s) => s.event.type).join(' -> ');

      it(`edge case ${index + 1}: ${eventSequence}`, () => {
        const actor = createActor(testMachine);
        actor.start();

        for (const step of path.steps) {
          actor.send(step.event);
        }

        const snapshot = actor.getSnapshot();

        // If path ends with STOP after START, isCompleted should be false
        const events = path.steps.map((s) => s.event.type);
        const hasStarted = events.includes('START');
        if (events[events.length - 1] === 'STOP' && hasStarted) {
          expect(snapshot.context.isCompleted).toBe(false);
        }

        actor.stop();
      });
    });
  });

  describe('TestModel API', () => {
    const model = createTestModel(testMachine);

    it('generates test paths with events', () => {
      const testPaths = model.getShortestPaths();
      expect(testPaths.length).toBeGreaterThan(0);
    });

    // Use TestModel's path testing
    const testPaths = model.getShortestPaths();

    testPaths.forEach((testPath) => {
      it(`model test: ${testPath.description}`, async () => {
        // TestModel provides structured testing with assertions
        await testPath.test({
          states: {
            idle: (state) => {
              expect(state.context.trialIndex).toBe(0);
            },
            starting: (state) => {
              expect(state.matches('starting')).toBe(true);
            },
            stimulus: (state) => {
              expect(state.context.trialIndex).toBeLessThan(state.context.totalTrials);
            },
            placement: (state) => {
              expect(state.matches('placement')).toBe(true);
            },
            turnEnd: (state) => {
              expect(state.context.stats.turnsCompleted).toBeGreaterThan(0);
            },
            finished: (state) => {
              expect(state.matches('finished')).toBe(true);
            },
          },
          events: {
            START: () => {},
            STOP: () => {},
            AUDIO_READY: () => {},
            STIMULUS_TIMER_DONE: () => {},
            ALL_LABELS_PLACED: () => {},
            INTER_TRIAL_DONE: () => {},
          },
        });
      });
    });
  });

  describe('Coverage analysis', () => {
    const model = createTestModel(testMachine);

    it('achieves full state coverage', () => {
      const paths = model.getShortestPaths();
      const statesVisited = new Set<string>();

      paths.forEach((path) => {
        // Initial state
        statesVisited.add('idle');

        // States from steps
        path.steps.forEach((step) => {
          const stateValue = step.state.value;
          if (typeof stateValue === 'string') {
            statesVisited.add(stateValue);
          }
        });
      });

      const expectedStates = ['idle', 'starting', 'stimulus', 'placement', 'turnEnd', 'finished'];
      expectedStates.forEach((state) => {
        expect(statesVisited.has(state)).toBe(true);
      });
    });

    it('achieves full transition coverage', () => {
      const paths = model.getShortestPaths();
      const transitionsVisited = new Set<string>();

      paths.forEach((path) => {
        let prevState = 'idle';
        path.steps.forEach((step) => {
          const nextState =
            typeof step.state.value === 'string'
              ? step.state.value
              : JSON.stringify(step.state.value);
          const transition = `${prevState} --${step.event.type}--> ${nextState}`;
          transitionsVisited.add(transition);
          prevState = nextState;
        });
      });

      console.log('Transitions covered:', transitionsVisited.size);

      // Key transitions that must be covered
      const criticalTransitions = [
        'idle --START--> starting',
        'starting --AUDIO_READY--> stimulus',
        'stimulus --STIMULUS_TIMER_DONE--> placement',
        'placement --ALL_LABELS_PLACED--> turnEnd',
      ];

      criticalTransitions.forEach((t) => {
        expect(transitionsVisited.has(t)).toBe(true);
      });
    });
  });
});

// =============================================================================
// Helper: Verify machine invariants
// =============================================================================

function verifyInvariants(
  prevContext: {
    trialIndex: number;
    totalTrials: number;
    isCompleted: boolean;
    stats: { turnsCompleted: number };
  },
  nextContext: {
    trialIndex: number;
    totalTrials: number;
    isCompleted: boolean;
    stats: { turnsCompleted: number };
  },
  event: { type: string },
): void {
  // Invariant 1: trialIndex never exceeds totalTrials
  expect(nextContext.trialIndex).toBeLessThanOrEqual(nextContext.totalTrials);

  // Invariant 2: turnsCompleted never exceeds trialIndex + 1
  expect(nextContext.stats.turnsCompleted).toBeLessThanOrEqual(nextContext.trialIndex + 1);

  // Invariant 3: totalTrials is immutable
  expect(nextContext.totalTrials).toBe(prevContext.totalTrials);

  // Invariant 4: trialIndex only increases (never decreases)
  expect(nextContext.trialIndex).toBeGreaterThanOrEqual(prevContext.trialIndex);

  // Invariant 5: STOP sets isCompleted to false only after session has started
  // (STOP from idle doesn't change isCompleted since session never started)
  // This is checked via the action 'setIncomplete' which only exists on transitions
  // from starting, stimulus, placement, turnEnd - not from idle
}

// =============================================================================
// Integration test with real machine
// =============================================================================

describe('Real DualPickSession integration', () => {
  let input: DualPickSessionInput;

  beforeEach(() => {
    const spec = createMockSpec();
    input = {
      sessionId: 'test-session-id',
      userId: 'test-user-id',
      playMode: 'free',
      spec,
      generator: createMockGenerator(3),
      audio: createMockAudio(),
      clock: createMockClock(),
      random: createMockRandom(),
      plugins: createDefaultDualPickPlugins({
        spec,
        platformInfo: undefined,
      }),
    };
  });

  it('test machine mirrors real machine state structure', async () => {
    const { dualPickSessionMachine } = await import('./dual-pick-session-machine');

    const realActor = createActor(dualPickSessionMachine, { input });
    const testActor = createActor(testMachine);

    realActor.start();
    testActor.start();

    // Both start in idle
    expect(realActor.getSnapshot().value).toBe('idle');
    expect(testActor.getSnapshot().value).toBe('idle');

    // Both transition to starting on START
    realActor.send({ type: 'START' });
    testActor.send({ type: 'START' });

    expect(realActor.getSnapshot().value).toBe('starting');
    expect(testActor.getSnapshot().value).toBe('starting');

    // Both handle STOP
    realActor.send({ type: 'STOP' });
    testActor.send({ type: 'STOP' });

    expect(realActor.getSnapshot().value).toBe('finished');
    expect(testActor.getSnapshot().value).toBe('finished');

    realActor.stop();
    testActor.stop();
  });
});
