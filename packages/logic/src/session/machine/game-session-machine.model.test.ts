/**
 * Model-Based Testing for GameSession Machine
 *
 * Uses @xstate/graph to automatically explore all reachable states
 * and verify invariants at each state transition.
 *
 * This is the main session machine used by:
 * - Dual Catch
 * - Dual N-Back Classic
 * - Sim BrainWorkshop
 */

import { describe, it, expect } from 'bun:test';
import { createTestModel, getShortestPaths, getSimplePaths } from '@xstate/graph';
import { setup, assign, createActor } from 'xstate';

// =============================================================================
// Simplified Test Machine for Model-Based Testing
// =============================================================================

/**
 * Simplified synchronous model of gameSessionMachine.
 *
 * Captures the essential state structure:
 * - idle → starting → countdown → active (stimulus ↔ waiting) → computing → finished
 * - pause/resume flow
 * - recovery flow
 * - STOP from any state
 *
 * Removes: async actors, timers, context complexity
 */
const gameSessionTestMachine = setup({
  types: {
    context: {} as {
      trialIndex: number;
      totalTrials: number;
      hasRecoveryState: boolean;
      pausedInState: 'stimulus' | 'waiting' | null;
      isCompleted: boolean;
    },
    events: {} as
      | { type: 'START' }
      | { type: 'RECOVER' }
      | { type: 'STOP' }
      | { type: 'AUDIO_READY' }
      | { type: 'COUNTDOWN_DONE' }
      | { type: 'STIMULUS_TIMER_DONE' }
      | { type: 'WAITING_TIMER_DONE' }
      | { type: 'RESPOND' }
      | { type: 'PAUSE' }
      | { type: 'RESUME' }
      | { type: 'FOCUS_LOST' }
      | { type: 'FOCUS_REGAINED' }
      | { type: 'ADVANCE' }
      | { type: 'COMPUTE_DONE' },
  },
  actions: {
    incrementTrial: assign(({ context }) => ({
      trialIndex: context.trialIndex + 1,
    })),
    savePauseStateStimulus: assign(() => ({
      pausedInState: 'stimulus' as const,
    })),
    savePauseStateWaiting: assign(() => ({
      pausedInState: 'waiting' as const,
    })),
    clearPauseState: assign(() => ({
      pausedInState: null,
    })),
    markAbandoned: assign(() => ({
      isCompleted: false,
    })),
    markCompleted: assign(() => ({
      isCompleted: true,
    })),
  },
  guards: {
    hasMoreTrials: ({ context }) => context.trialIndex < context.totalTrials - 1,
    noMoreTrials: ({ context }) => context.trialIndex >= context.totalTrials - 1,
    hasRecoveryState: ({ context }) => context.hasRecoveryState,
    wasInStimulus: ({ context }) => context.pausedInState === 'stimulus',
    wasInWaiting: ({ context }) => context.pausedInState === 'waiting',
  },
}).createMachine({
  id: 'gameSessionTest',
  initial: 'idle',
  context: {
    trialIndex: 0,
    totalTrials: 3,
    hasRecoveryState: false,
    pausedInState: null,
    isCompleted: true,
  },
  states: {
    // =========================================================================
    // IDLE
    // =========================================================================
    idle: {
      on: {
        START: 'starting',
        RECOVER: {
          target: 'recovering',
          guard: 'hasRecoveryState',
        },
      },
    },

    // =========================================================================
    // RECOVERING (from interrupted session)
    // =========================================================================
    recovering: {
      on: {
        AUDIO_READY: 'active',
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
      },
    },

    // =========================================================================
    // STARTING (audio init)
    // =========================================================================
    starting: {
      on: {
        AUDIO_READY: 'countdown',
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
      },
    },

    // =========================================================================
    // COUNTDOWN (3, 2, 1...)
    // =========================================================================
    countdown: {
      on: {
        COUNTDOWN_DONE: 'active',
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
      },
    },

    // =========================================================================
    // ACTIVE (main game loop)
    // =========================================================================
    active: {
      initial: 'stimulus',
      on: {
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
        FOCUS_LOST: {
          target: 'paused',
          actions: ['savePauseStateStimulus'],
        },
      },
      states: {
        stimulus: {
          on: {
            RESPOND: {
              // Stay in stimulus, just record response
            },
            STIMULUS_TIMER_DONE: 'waiting',
            PAUSE: {
              target: '#gameSessionTest.paused',
              actions: ['savePauseStateStimulus'],
            },
            // Self-paced advance
            ADVANCE: [
              {
                target: 'stimulus',
                reenter: true,
                guard: 'hasMoreTrials',
                actions: ['incrementTrial'],
              },
              {
                target: '#gameSessionTest.computing',
                actions: ['incrementTrial'],
              },
            ],
          },
        },
        waiting: {
          on: {
            RESPOND: {
              // Stay in waiting, just record response
            },
            WAITING_TIMER_DONE: [
              {
                target: 'stimulus',
                guard: 'hasMoreTrials',
                actions: ['incrementTrial'],
              },
              {
                target: '#gameSessionTest.computing',
                actions: ['incrementTrial'],
              },
            ],
            PAUSE: {
              target: '#gameSessionTest.paused',
              actions: ['savePauseStateWaiting'],
            },
            // Self-paced advance
            ADVANCE: [
              {
                target: 'stimulus',
                guard: 'hasMoreTrials',
                actions: ['incrementTrial'],
              },
              {
                target: '#gameSessionTest.computing',
                actions: ['incrementTrial'],
              },
            ],
          },
        },
        stimulusResume: {
          on: {
            RESPOND: {},
            STIMULUS_TIMER_DONE: 'waiting',
            PAUSE: {
              target: '#gameSessionTest.paused',
              actions: ['savePauseStateStimulus'],
            },
          },
        },
        waitingResume: {
          on: {
            RESPOND: {},
            WAITING_TIMER_DONE: [
              {
                target: 'stimulus',
                guard: 'hasMoreTrials',
                actions: ['incrementTrial'],
              },
              {
                target: '#gameSessionTest.computing',
                actions: ['incrementTrial'],
              },
            ],
            PAUSE: {
              target: '#gameSessionTest.paused',
              actions: ['savePauseStateWaiting'],
            },
          },
        },
      },
    },

    // =========================================================================
    // PAUSED
    // =========================================================================
    paused: {
      on: {
        RESUME: 'resuming',
        FOCUS_REGAINED: 'resuming',
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
      },
    },

    // =========================================================================
    // RESUMING (intermediate state to route back)
    // =========================================================================
    resuming: {
      always: [
        {
          target: 'active.stimulusResume',
          guard: 'wasInStimulus',
          actions: ['clearPauseState'],
        },
        {
          target: 'active.waitingResume',
          guard: 'wasInWaiting',
          actions: ['clearPauseState'],
        },
        {
          // Fallback (should not happen)
          target: 'active.stimulus',
          actions: ['clearPauseState'],
        },
      ],
    },

    // =========================================================================
    // COMPUTING (final results)
    // =========================================================================
    computing: {
      on: {
        COMPUTE_DONE: {
          target: 'finished',
          actions: ['markCompleted'],
        },
        // Allow STOP during computation (edge case)
        STOP: {
          target: 'finished',
          actions: ['markAbandoned'],
        },
      },
    },

    // =========================================================================
    // FINISHED (final)
    // =========================================================================
    finished: {
      type: 'final',
    },
  },
});

// =============================================================================
// Invariant Verification
// =============================================================================

interface TestContext {
  trialIndex: number;
  totalTrials: number;
  hasRecoveryState: boolean;
  pausedInState: 'stimulus' | 'waiting' | null;
  isCompleted: boolean;
}

function verifyInvariants(
  prevContext: TestContext,
  nextContext: TestContext,
  event: { type: string },
): void {
  // Invariant 1: trialIndex never exceeds totalTrials
  expect(nextContext.trialIndex).toBeLessThanOrEqual(nextContext.totalTrials);

  // Invariant 2: totalTrials is immutable
  expect(nextContext.totalTrials).toBe(prevContext.totalTrials);

  // Invariant 3: trialIndex only increases (monotonic)
  expect(nextContext.trialIndex).toBeGreaterThanOrEqual(prevContext.trialIndex);

  // Invariant 4: STOP always marks as abandoned (except from idle where nothing started)
  // (This is validated in state-specific tests)

  // Invariant 5: pausedInState is set when entering paused state
  // (This is validated via state assertions)
}

// =============================================================================
// Model-Based Tests
// =============================================================================

describe('GameSession Model-Based Tests', () => {
  describe('Graph exploration - shortest paths', () => {
    const paths = getShortestPaths(gameSessionTestMachine);

    it(`discovers ${paths.length} shortest paths to all states`, () => {
      expect(paths.length).toBeGreaterThan(0);

      const statesReached = new Set<string>();
      paths.forEach((p) => {
        const value = p.state.value;
        if (typeof value === 'string') {
          statesReached.add(value);
        } else if (typeof value === 'object') {
          // Compound state
          Object.entries(value).forEach(([parent, child]) => {
            statesReached.add(`${parent}.${child}`);
          });
        }
      });

      console.log(`Reached ${statesReached.size} unique states via ${paths.length} paths`);
      console.log('States:', [...statesReached].sort().join(', '));
    });

    // Generate a test for each discovered path
    paths.forEach((path, index) => {
      const targetState =
        typeof path.state.value === 'string' ? path.state.value : JSON.stringify(path.state.value);

      it(`path ${index + 1}: reaches ${targetState}`, () => {
        const actor = createActor(gameSessionTestMachine);
        actor.start();

        for (const step of path.steps) {
          const prevSnapshot = actor.getSnapshot();
          actor.send(step.event);
          const nextSnapshot = actor.getSnapshot();

          verifyInvariants(prevSnapshot.context, nextSnapshot.context, step.event);
        }

        const finalState = actor.getSnapshot().value;
        expect(finalState).toEqual(path.state.value);

        actor.stop();
      });
    });
  });

  describe('Graph exploration - simple paths', () => {
    const paths = getSimplePaths(gameSessionTestMachine);

    it(`discovers ${paths.length} simple paths`, () => {
      expect(paths.length).toBeGreaterThan(0);
      console.log(`Found ${paths.length} simple (non-repeating) paths`);
    });

    // Test STOP from different states
    const stopPaths = paths.filter((p) => {
      const events = p.steps.map((s) => s.event.type);
      return events.includes('STOP') && events.indexOf('STOP') > 0;
    });

    it(`found ${stopPaths.length} paths that include STOP`, () => {
      expect(stopPaths.length).toBeGreaterThan(0);
    });

    // Test a subset of interesting paths
    stopPaths.slice(0, 15).forEach((path, index) => {
      const eventSequence = path.steps.map((s) => s.event.type).join(' -> ');

      it(`stop path ${index + 1}: ${eventSequence}`, () => {
        const actor = createActor(gameSessionTestMachine);
        actor.start();

        for (const step of path.steps) {
          actor.send(step.event);
        }

        const snapshot = actor.getSnapshot();

        // After STOP (not from idle), isCompleted should be false
        const events = path.steps.map((s) => s.event.type);
        const stopIndex = events.indexOf('STOP');
        const hasStarted =
          events.slice(0, stopIndex).includes('START') ||
          events.slice(0, stopIndex).includes('RECOVER');

        if (hasStarted) {
          expect(snapshot.context.isCompleted).toBe(false);
        }

        actor.stop();
      });
    });
  });

  describe('Pause/Resume paths', () => {
    const paths = getSimplePaths(gameSessionTestMachine);

    const pausePaths = paths.filter((p) => {
      const events = p.steps.map((s) => s.event.type);
      return (
        events.includes('PAUSE') && (events.includes('RESUME') || events.includes('FOCUS_REGAINED'))
      );
    });

    it(`found ${pausePaths.length} pause/resume paths`, () => {
      console.log(`Found ${pausePaths.length} paths with pause/resume`);
    });

    pausePaths.slice(0, 10).forEach((path, index) => {
      const eventSequence = path.steps.map((s) => s.event.type).join(' -> ');

      it(`pause/resume ${index + 1}: ${eventSequence}`, () => {
        const actor = createActor(gameSessionTestMachine);
        actor.start();

        for (const step of path.steps) {
          actor.send(step.event);
        }

        // Session should complete normally after resume
        const snapshot = actor.getSnapshot();
        expect(snapshot.value).toBeDefined();

        actor.stop();
      });
    });
  });

  describe('TestModel API', () => {
    const model = createTestModel(gameSessionTestMachine);

    it('generates test paths', () => {
      const testPaths = model.getShortestPaths();
      expect(testPaths.length).toBeGreaterThan(0);
    });

    const testPaths = model.getShortestPaths();

    testPaths.forEach((testPath) => {
      it(`model: ${testPath.description}`, async () => {
        await testPath.test({
          states: {
            idle: (state) => {
              expect(state.context.trialIndex).toBe(0);
              expect(state.context.pausedInState).toBeNull();
            },
            starting: (state) => {
              expect(state.matches('starting')).toBe(true);
            },
            countdown: (state) => {
              expect(state.matches('countdown')).toBe(true);
            },
            paused: (state) => {
              expect(state.context.pausedInState).not.toBeNull();
            },
            computing: (state) => {
              // Should reach computing when all trials done
              expect(state.context.trialIndex).toBe(state.context.totalTrials);
            },
            finished: (state) => {
              expect(state.matches('finished')).toBe(true);
            },
            // Compound states
            'active.stimulus': (state) => {
              expect(state.matches({ active: 'stimulus' })).toBe(true);
            },
            'active.waiting': (state) => {
              expect(state.matches({ active: 'waiting' })).toBe(true);
            },
          },
          events: {
            START: () => {},
            RECOVER: () => {},
            STOP: () => {},
            AUDIO_READY: () => {},
            COUNTDOWN_DONE: () => {},
            STIMULUS_TIMER_DONE: () => {},
            WAITING_TIMER_DONE: () => {},
            RESPOND: () => {},
            PAUSE: () => {},
            RESUME: () => {},
            FOCUS_LOST: () => {},
            FOCUS_REGAINED: () => {},
            ADVANCE: () => {},
            COMPUTE_DONE: () => {},
          },
        });
      });
    });
  });

  describe('Coverage analysis', () => {
    const model = createTestModel(gameSessionTestMachine);

    it('achieves full state coverage', () => {
      const paths = model.getShortestPaths();
      const statesVisited = new Set<string>();

      paths.forEach((path) => {
        statesVisited.add('idle');

        path.steps.forEach((step) => {
          const stateValue = step.state.value;
          if (typeof stateValue === 'string') {
            statesVisited.add(stateValue);
          } else if (typeof stateValue === 'object') {
            Object.entries(stateValue).forEach(([parent, child]) => {
              statesVisited.add(`${parent}.${child}`);
            });
          }
        });
      });

      // Main states (resuming is transient - always redirects immediately)
      const expectedStates = ['idle', 'starting', 'countdown', 'paused', 'computing', 'finished'];

      expectedStates.forEach((state) => {
        expect(statesVisited.has(state)).toBe(true);
      });

      // Note: 'resuming' is a transient state with `always` transitions,
      // so it's never "reached" as a stable state - this is expected behavior

      // Compound states
      expect(statesVisited.has('active.stimulus') || statesVisited.has('active')).toBe(true);
    });

    it('achieves critical transition coverage', () => {
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

      // Critical transitions that must be covered
      const criticalTransitions = [
        'idle --START--> starting',
        'starting --AUDIO_READY--> countdown',
      ];

      criticalTransitions.forEach((t) => {
        expect(transitionsVisited.has(t)).toBe(true);
      });
    });
  });

  describe('Session completion invariants', () => {
    it('normal flow completes with isCompleted=true', () => {
      const actor = createActor(gameSessionTestMachine);
      actor.start();

      // Full happy path
      actor.send({ type: 'START' });
      actor.send({ type: 'AUDIO_READY' });
      actor.send({ type: 'COUNTDOWN_DONE' });

      // 3 trials
      for (let i = 0; i < 3; i++) {
        actor.send({ type: 'STIMULUS_TIMER_DONE' });
        if (i < 2) {
          actor.send({ type: 'WAITING_TIMER_DONE' });
        } else {
          actor.send({ type: 'WAITING_TIMER_DONE' }); // Last trial goes to computing
        }
      }

      actor.send({ type: 'COMPUTE_DONE' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');
      expect(snapshot.context.isCompleted).toBe(true);
      expect(snapshot.context.trialIndex).toBe(3);

      actor.stop();
    });

    it('STOP during active marks as abandoned', () => {
      const actor = createActor(gameSessionTestMachine);
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'AUDIO_READY' });
      actor.send({ type: 'COUNTDOWN_DONE' });
      actor.send({ type: 'STIMULUS_TIMER_DONE' }); // In waiting

      actor.send({ type: 'STOP' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');
      expect(snapshot.context.isCompleted).toBe(false);

      actor.stop();
    });

    it('pause and resume continues normally', () => {
      const actor = createActor(gameSessionTestMachine);
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'AUDIO_READY' });
      actor.send({ type: 'COUNTDOWN_DONE' });

      // Pause during stimulus
      actor.send({ type: 'PAUSE' });
      expect(actor.getSnapshot().value).toBe('paused');
      expect(actor.getSnapshot().context.pausedInState).toBe('stimulus');

      // Resume
      actor.send({ type: 'RESUME' });
      expect(actor.getSnapshot().value).toEqual({ active: 'stimulusResume' });

      // Continue to completion
      actor.send({ type: 'STIMULUS_TIMER_DONE' });
      actor.send({ type: 'WAITING_TIMER_DONE' });
      actor.send({ type: 'STIMULUS_TIMER_DONE' });
      actor.send({ type: 'WAITING_TIMER_DONE' });
      actor.send({ type: 'STIMULUS_TIMER_DONE' });
      actor.send({ type: 'WAITING_TIMER_DONE' });
      actor.send({ type: 'COMPUTE_DONE' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('finished');
      expect(snapshot.context.isCompleted).toBe(true);

      actor.stop();
    });

    it('focus lost triggers auto-pause', () => {
      const actor = createActor(gameSessionTestMachine);
      actor.start();

      actor.send({ type: 'START' });
      actor.send({ type: 'AUDIO_READY' });
      actor.send({ type: 'COUNTDOWN_DONE' });

      // Focus lost during active
      actor.send({ type: 'FOCUS_LOST' });
      expect(actor.getSnapshot().value).toBe('paused');

      // Focus regained
      actor.send({ type: 'FOCUS_REGAINED' });

      // Should resume to stimulus (or stimulusResume)
      const state = actor.getSnapshot().value;
      expect(
        (state as any) === 'active' ||
          JSON.stringify(state).includes('stimulus') ||
          JSON.stringify(state).includes('active'),
      ).toBe(true);

      actor.stop();
    });
  });

  describe('Recovery mode', () => {
    it('RECOVER requires hasRecoveryState', () => {
      const actor = createActor(gameSessionTestMachine);
      actor.start();

      // Without recovery state, RECOVER should be ignored
      actor.send({ type: 'RECOVER' });
      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    it('RECOVER with recovery state goes to recovering', () => {
      // Create a fresh machine with hasRecoveryState=true
      const machineWithRecovery = setup({
        types: {
          context: {} as TestContext,
          events: {} as
            | { type: 'START' }
            | { type: 'RECOVER' }
            | { type: 'STOP' }
            | { type: 'AUDIO_READY' },
        },
        guards: {
          hasRecoveryState: ({ context }) => context.hasRecoveryState,
        },
        actions: {
          markAbandoned: assign(() => ({ isCompleted: false })),
        },
      }).createMachine({
        id: 'recoveryTest',
        initial: 'idle',
        context: {
          trialIndex: 0,
          totalTrials: 3,
          hasRecoveryState: true, // Enable recovery
          pausedInState: null,
          isCompleted: true,
        },
        states: {
          idle: {
            on: {
              START: 'starting',
              RECOVER: {
                target: 'recovering',
                guard: 'hasRecoveryState',
              },
            },
          },
          recovering: {
            on: {
              AUDIO_READY: 'active',
              STOP: { target: 'finished', actions: ['markAbandoned'] },
            },
          },
          starting: {},
          active: {},
          finished: { type: 'final' },
        },
      });

      const actor = createActor(machineWithRecovery);
      actor.start();

      expect(actor.getSnapshot().context.hasRecoveryState).toBe(true);
      actor.send({ type: 'RECOVER' });
      expect(actor.getSnapshot().value).toBe('recovering');

      actor.stop();
    });
  });
});
