/**
 * InteractiveReplayMachine (XState v5)
 *
 * State machine for interactive replay sessions where users can correct mistakes.
 * Orchestrates the InteractiveReplayEngine and ReplayInteractifPort.
 *
 * States:
 * - idle: No replay active
 * - loading: Creating replay run in DB
 * - ready: Run created, waiting to start playback
 * - playing: Replaying with tick updates
 * - paused: Playback paused
 * - awaitingCompletion: Replay finished, waiting to complete/abandon
 * - finished: Run completed
 * - error: An error occurred
 *
 * Timing: Uses external RAF loop sending TICK events for 60fps performance.
 * Audio: Handled via action that calls AudioPort.play() on trial changes.
 */

import { setup, assign, fromPromise, createActor, type SnapshotFrom } from 'xstate';
import {
  InteractiveReplayEngine,
  type InteractiveReplayEvent,
  type RunScoreDelta,
  type GameEvent,
  type ModalityId,
  type ReplayRun,
  type ReplayEvent,
  type ReplayInteractifPort,
  type InteractiveReplayLifecyclePort,
  type InteractiveReplayLifecycleState,
  type InteractiveReplaySpeed,
  type InteractiveReplayInput,
  type InteractiveReplayContext,
  type InteractiveReplayStateListener,
  type InteractiveReplayContextListener,
  type RecoveredReplayState,
  type ReplaySessionType,
} from '@neurodual/logic';
import type { AudioPort } from '@neurodual/logic';
import { replayLog } from '../logger';
import {
  saveReplayRecoverySnapshot,
  clearReplayRecoverySnapshot,
  createReplayRecoverySnapshot,
} from '../lifecycle/replay-recovery';

// =============================================================================
// Machine Context
// =============================================================================

interface MachineContext {
  // Input (set on START)
  adapter: ReplayInteractifPort | null;
  sessionId: string;
  sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
  parentEvents: readonly GameEvent[];
  activeModalities: readonly ModalityId[];
  parentRunId: string | null;
  totalDurationMs: number;

  // Engine (created in loading)
  engine: InteractiveReplayEngine | null;

  // Pending depth (calculated in loading, before run is created)
  pendingDepth: 0 | 1 | 2 | 3;

  // Run (created only on completion, NOT at start)
  run: ReplayRun | null;

  // Playback state
  currentTimeMs: number;
  speed: InteractiveReplaySpeed;

  // Events emitted during replay
  events: readonly InteractiveReplayEvent[];

  // Tracking for incremental persistence
  lastPersistedEventIndex: number;

  // Current trial tracking (for audio)
  currentTrialIndex: number;
  lastPlayedTrialIndex: number;

  // Final score
  score: RunScoreDelta | null;

  // Error
  error: Error | null;

  // Audio adapter (optional, for playing sounds)
  audioAdapter: AudioPort | null;
}

// =============================================================================
// Machine Events
// =============================================================================

type MachineEvent =
  | { type: 'START'; input: InteractiveReplayInput; audioAdapter?: AudioPort }
  | {
      type: 'RECOVER';
      recoveredState: RecoveredReplayState;
      parentEvents: readonly GameEvent[];
      activeModalities: readonly ModalityId[];
      sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
      audioAdapter?: AudioPort;
    }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'RESPOND'; modality: ModalityId }
  | { type: 'SET_SPEED'; speed: InteractiveReplaySpeed }
  | { type: 'COMPLETE' }
  | { type: 'ABANDON' }
  | { type: 'RESET' };

// =============================================================================
// Machine Input
// =============================================================================

type MachineInput = Record<string, never>;

// =============================================================================
// XState Machine Definition
// =============================================================================

export const interactiveReplayMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
    input: {} as MachineInput,
  },

  actions: {
    logTransition: (_, params: { from: string; to: string }) => {
      replayLog.debug(`[InteractiveReplay] ${params.from} → ${params.to}`);
    },

    setInput: assign(({ event }) => {
      if (event.type !== 'START') return {};
      const { input, audioAdapter } = event;
      return {
        adapter: input.adapter,
        sessionId: input.sessionId,
        sessionType: input.sessionType,
        parentEvents: input.parentEvents,
        activeModalities: input.activeModalities,
        parentRunId: input.parentRunId,
        totalDurationMs: input.totalDurationMs,
        audioAdapter: audioAdapter ?? null,
      };
    }),

    setRecoveryInput: assign(({ event }) => {
      if (event.type !== 'RECOVER') return {};
      const { recoveredState, parentEvents, activeModalities, sessionType, audioAdapter } = event;

      // Calculate totalDurationMs from parent events
      const sessionEndEvent = parentEvents.find((e) => e.type === 'SESSION_ENDED');
      const sessionStartEvent = parentEvents.find((e) => e.type === 'SESSION_STARTED');
      const totalDurationMs =
        sessionEndEvent && sessionStartEvent
          ? sessionEndEvent.timestamp - sessionStartEvent.timestamp
          : 0;

      return {
        sessionId: recoveredState.run.sessionId,
        sessionType,
        parentEvents,
        activeModalities,
        parentRunId: recoveredState.run.parentRunId,
        totalDurationMs,
        currentTimeMs: recoveredState.lastTimeMs,
        currentTrialIndex: recoveredState.lastTrialIndex,
        audioAdapter: audioAdapter ?? null,
      };
    }),

    setRun: assign((_, params: { run: ReplayRun }) => ({
      run: params.run,
    })),

    setEngine: assign((_, params: { engine: InteractiveReplayEngine }) => ({
      engine: params.engine,
    })),

    setSpeed: assign(({ event }) => {
      if (event.type !== 'SET_SPEED') return {};
      return { speed: event.speed };
    }),

    processTick: assign(({ context, event }) => {
      if (event.type !== 'TICK' || !context.engine) return {};

      const deltaMs = event.deltaMs * context.speed;
      const emitted = context.engine.tick(deltaMs);
      const newTimeMs = context.engine.getCurrentTimeMs();
      const newTrialIndex = context.engine.getCurrentTrialIndex();

      // Update events if new ones were emitted
      const newEvents = emitted.length > 0 ? context.engine.getEmittedEvents() : context.events;

      return {
        currentTimeMs: newTimeMs,
        events: newEvents,
        currentTrialIndex: newTrialIndex,
      };
    }),

    playTrialSound: ({ context }) => {
      if (!context.audioAdapter || !context.engine) return;

      const currentIndex = context.currentTrialIndex;
      if (currentIndex === context.lastPlayedTrialIndex) return;

      // Get trial state for current trial
      const trialState = context.engine.getTrialState(currentIndex);
      if (!trialState) return;

      // Play sound if audio modality is active
      if (context.activeModalities.includes('audio')) {
        const sound = trialState.trial.sound;
        if (sound) {
          context.audioAdapter.play(sound);
          replayLog.debug(`[InteractiveReplay] Playing sound: ${sound}`);
        }
      }
    },

    updateLastPlayedTrial: assign(({ context }) => ({
      lastPlayedTrialIndex: context.currentTrialIndex,
    })),

    handleResponse: assign(({ context, event }) => {
      if (event.type !== 'RESPOND' || !context.engine) return {};

      const replayEvent = context.engine.handleUserResponse(event.modality);
      if (replayEvent) {
        return {
          events: context.engine.getEmittedEvents(),
        };
      }
      return {};
    }),

    computeScore: assign(({ context }) => {
      if (!context.engine) return {};
      return {
        score: context.engine.computeScore(),
      };
    }),

    captureError: assign(({ event }) => {
      const errorEvent = event as unknown as { error: unknown };
      const error =
        errorEvent.error instanceof Error ? errorEvent.error : new Error(String(errorEvent.error));
      return { error };
    }),

    clearError: assign(() => ({
      error: null,
    })),

    resetContext: assign(() => ({
      adapter: null,
      sessionId: '',
      sessionType: 'tempo' as const,
      parentEvents: [] as readonly GameEvent[],
      activeModalities: [] as readonly ModalityId[],
      parentRunId: null,
      totalDurationMs: 0,
      engine: null,
      pendingDepth: 1 as 0 | 1 | 2 | 3,
      run: null,
      currentTimeMs: 0,
      speed: 1 as InteractiveReplaySpeed,
      events: [] as readonly InteractiveReplayEvent[],
      lastPersistedEventIndex: 0,
      currentTrialIndex: 0,
      lastPlayedTrialIndex: -1,
      score: null,
      error: null,
      audioAdapter: null,
    })),

    // Recovery: save snapshot to localStorage
    saveSnapshot: ({ context }) => {
      if (!context.run || !context.engine) return;

      const snapshot = createReplayRecoverySnapshot({
        runId: context.run.id,
        sessionId: context.sessionId,
        sessionType: context.sessionType as ReplaySessionType,
        parentRunId: context.parentRunId,
        currentTimeMs: context.currentTimeMs,
        currentTrialIndex: context.currentTrialIndex,
        speed: context.speed,
      });
      saveReplayRecoverySnapshot(snapshot);
    },

    // Recovery: clear snapshot from localStorage
    clearSnapshot: () => {
      clearReplayRecoverySnapshot();
    },

    // Persist events to DB (fire-and-forget for incremental persistence)
    persistEventsAsync: assign(({ context }) => {
      if (!context.run || !context.engine || !context.adapter) return {};

      const events = context.events;
      const lastIndex = context.lastPersistedEventIndex;

      // Only persist if we have new events
      if (events.length <= lastIndex) return {};

      const newEvents = events.slice(lastIndex);
      const runId = context.run.id;
      const adapter = context.adapter;

      // Convert to input format and persist (fire-and-forget)
      const eventInputs = newEvents.map((e) => ({
        runId,
        type: e.type,
        timestamp: e.timestamp,
        payload: e.payload,
        actor: e.actor,
        originEventId: e.originEvent?.id ?? null,
        skipped: e.skipped,
        skipReason: e.skipReason,
      }));

      adapter.appendEventsBatch(eventInputs).catch((err) => {
        replayLog.warn(`[InteractiveReplay] Failed to persist events batch: ${err}`);
      });

      return { lastPersistedEventIndex: events.length };
    }),
  },

  guards: {
    // Guard receives event to calculate new time BEFORE processTick runs
    willBeFinished: ({ context, event }) => {
      if (!context.engine) return false;
      if (event.type !== 'TICK') return false;

      const newTimeMs = context.currentTimeMs + event.deltaMs * context.speed;
      return context.engine.isFinished() || newTimeMs >= context.totalDurationMs;
    },
  },

  actors: {
    // Initialize engine only (run is NOT created until completion)
    initEngine: fromPromise(
      async ({
        input,
      }: {
        input: {
          adapter: ReplayInteractifPort;
          sessionId: string;
          sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
          parentRunId: string | null;
          parentEvents: readonly GameEvent[];
          activeModalities: readonly ModalityId[];
        };
      }): Promise<{ engine: InteractiveReplayEngine; depth: 0 | 1 | 2 | 3 }> => {
        const { adapter, sessionId, sessionType, parentRunId, parentEvents, activeModalities } =
          input;

        // Check if we can create a new run (validates depth limit)
        const canCreate = await adapter.canCreateRun(sessionId, parentRunId);
        if (!canCreate) {
          throw new Error('Maximum replay depth reached');
        }

        // Calculate pending depth (will be used when run is actually created)
        const depth = await adapter.getNextDepth(sessionId, parentRunId);

        // Create the engine with sessionType for mode-specific handling
        // NOTE: Run is NOT created yet - only on completion
        const engine = new InteractiveReplayEngine(parentEvents, activeModalities, sessionType);

        replayLog.info(
          `[InteractiveReplay] Engine created for session ${sessionId} (${sessionType}), pendingDepth=${depth}`,
        );

        return { engine, depth };
      },
    ),

    // Persist a batch of events to the run (called incrementally during playback)
    persistEventsBatch: fromPromise(
      async ({
        input,
      }: {
        input: {
          adapter: ReplayInteractifPort;
          runId: string;
          events: readonly InteractiveReplayEvent[];
          lastPersistedIndex: number;
        };
      }): Promise<{ newLastPersistedIndex: number }> => {
        const { adapter, runId, events, lastPersistedIndex } = input;

        // Only persist events we haven't persisted yet
        const newEvents = events.slice(lastPersistedIndex);
        if (newEvents.length === 0) {
          return { newLastPersistedIndex: lastPersistedIndex };
        }

        // Convert to input format
        const eventInputs = newEvents.map((e) => ({
          runId,
          type: e.type,
          timestamp: e.timestamp,
          payload: e.payload,
          actor: e.actor,
          originEventId: e.originEvent?.id ?? null,
          skipped: e.skipped,
          skipReason: e.skipReason,
        }));

        await adapter.appendEventsBatch(eventInputs);

        return { newLastPersistedIndex: events.length };
      },
    ),

    // Create run AND persist all events at once (only called on completion)
    createAndCompleteRun: fromPromise(
      async ({
        input,
      }: {
        input: {
          adapter: ReplayInteractifPort;
          sessionId: string;
          parentRunId: string | null;
          engine: InteractiveReplayEngine;
        };
      }): Promise<{ run: ReplayRun; score: RunScoreDelta }> => {
        const { adapter, sessionId, parentRunId, engine } = input;

        // Create the run NOW (status = 'in_progress')
        const run = await adapter.createRun(sessionId, parentRunId);

        // Persist ALL events at once
        const eventInputs = engine.toReplayEventInputs(run.id);
        if (eventInputs.length > 0) {
          await adapter.appendEventsBatch(eventInputs);
        }

        // Mark run as completed immediately
        await adapter.completeRun(run.id);

        // Compute final score
        const score = engine.computeScore();

        replayLog.info(
          `[InteractiveReplay] Created and completed run ${run.id} with ${eventInputs.length} events`,
        );

        return { run, score };
      },
    ),

    // Delete the run (for abandoning)
    deleteRun: fromPromise(
      async ({
        input,
      }: {
        input: {
          adapter: ReplayInteractifPort;
          runId: string;
        };
      }): Promise<void> => {
        const { adapter, runId } = input;

        await adapter.deleteRun(runId);

        replayLog.info(`[InteractiveReplay] Deleted abandoned run ${runId}`);
      },
    ),

    // Restore engine from recovered state
    restoreEngine: fromPromise(
      async ({
        input,
      }: {
        input: {
          recoveredState: RecoveredReplayState;
          parentEvents: readonly GameEvent[];
          activeModalities: readonly ModalityId[];
          sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
        };
      }): Promise<{ engine: InteractiveReplayEngine; run: ReplayRun }> => {
        const { recoveredState, parentEvents, activeModalities, sessionType } = input;

        // Recreate the engine with parent events
        const engine = new InteractiveReplayEngine(parentEvents, activeModalities, sessionType);

        // Fast-forward engine to the recovered time
        // This replays the structure events up to lastTimeMs
        engine.seekTo(recoveredState.lastTimeMs);

        // Restore emitted events (user responses that were already made)
        engine.restoreEmittedEvents(recoveredState.emittedEvents as ReplayEvent[]);

        replayLog.info(
          `[InteractiveReplay] Restored engine to ${recoveredState.lastTimeMs}ms, trial ${recoveredState.lastTrialIndex}`,
        );

        return { engine, run: recoveredState.run };
      },
    ),
  },
}).createMachine({
  id: 'interactiveReplay',
  initial: 'idle',
  context: () => ({
    adapter: null,
    sessionId: '',
    sessionType: 'tempo' as const,
    parentEvents: [],
    activeModalities: [],
    parentRunId: null,
    totalDurationMs: 0,
    engine: null,
    pendingDepth: 1 as 0 | 1 | 2 | 3,
    run: null,
    currentTimeMs: 0,
    speed: 1 as InteractiveReplaySpeed,
    events: [],
    lastPersistedEventIndex: 0,
    currentTrialIndex: 0,
    lastPlayedTrialIndex: -1,
    score: null,
    error: null,
    audioAdapter: null,
  }),

  states: {
    // =========================================================================
    // IDLE - Waiting for START or RECOVER
    // =========================================================================
    idle: {
      on: {
        START: {
          target: 'loading',
          actions: [{ type: 'logTransition', params: { from: 'idle', to: 'loading' } }, 'setInput'],
        },
        RECOVER: {
          target: 'recovering',
          actions: [
            { type: 'logTransition', params: { from: 'idle', to: 'recovering' } },
            'setRecoveryInput',
          ],
        },
      },
    },

    // =========================================================================
    // LOADING - Initializing engine only (run NOT created until completion)
    // =========================================================================
    loading: {
      invoke: {
        id: 'initEngine',
        src: 'initEngine',
        input: ({ context }) => {
          if (!context.adapter) throw new Error('No adapter');
          return {
            adapter: context.adapter,
            sessionId: context.sessionId,
            sessionType: context.sessionType,
            parentRunId: context.parentRunId,
            parentEvents: context.parentEvents,
            activeModalities: context.activeModalities,
          };
        },
        onDone: {
          target: 'ready',
          actions: [
            { type: 'logTransition', params: { from: 'loading', to: 'ready' } },
            {
              type: 'setEngine',
              params: ({ event }) => ({ engine: event.output.engine }),
            },
            assign(({ event }) => ({ pendingDepth: event.output.depth })),
            // NOTE: No run created yet, no snapshot saved
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'loading', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // RECOVERING - Restoring engine from recovered state
    // =========================================================================
    recovering: {
      invoke: {
        id: 'restoreEngine',
        src: 'restoreEngine',
        input: ({ event }) => {
          if (event.type !== 'RECOVER') throw new Error('Expected RECOVER event');
          return {
            recoveredState: event.recoveredState,
            parentEvents: event.parentEvents,
            activeModalities: event.activeModalities,
            sessionType: event.sessionType,
          };
        },
        onDone: {
          target: 'paused',
          actions: [
            { type: 'logTransition', params: { from: 'recovering', to: 'paused' } },
            {
              type: 'setEngine',
              params: ({ event }) => ({ engine: event.output.engine }),
            },
            {
              type: 'setRun',
              params: ({ event }) => ({ run: event.output.run }),
            },
            'saveSnapshot',
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'recovering', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // READY - Waiting for PLAY
    // =========================================================================
    ready: {
      on: {
        PLAY: {
          target: 'playing',
          actions: [{ type: 'logTransition', params: { from: 'ready', to: 'playing' } }],
        },
        ABANDON: {
          target: 'abandoning',
          actions: [{ type: 'logTransition', params: { from: 'ready', to: 'abandoning' } }],
        },
      },
    },

    // =========================================================================
    // PLAYING - Processing ticks (events kept in memory, NOT persisted)
    // =========================================================================
    playing: {
      on: {
        PAUSE: {
          target: 'paused',
          actions: [
            { type: 'logTransition', params: { from: 'playing', to: 'paused' } },
            // NOTE: No DB persistence - events stay in memory until completion
          ],
        },
        TICK: [
          {
            guard: 'willBeFinished',
            target: 'awaitingCompletion',
            actions: [
              'processTick',
              'playTrialSound',
              'updateLastPlayedTrial',
              'computeScore',
              // NOTE: No DB persistence here - will persist on COMPLETE
              { type: 'logTransition', params: { from: 'playing', to: 'awaitingCompletion' } },
            ],
          },
          {
            actions: ['processTick', 'playTrialSound', 'updateLastPlayedTrial'],
          },
        ],
        RESPOND: {
          actions: ['handleResponse'],
          // NOTE: Events stored in memory only, persisted on completion
        },
        SET_SPEED: {
          actions: ['setSpeed'],
        },
        ABANDON: {
          target: 'abandoning',
          actions: [{ type: 'logTransition', params: { from: 'playing', to: 'abandoning' } }],
        },
      },
    },

    // =========================================================================
    // PAUSED - Playback paused (events in memory only)
    // =========================================================================
    paused: {
      on: {
        PLAY: {
          target: 'playing',
          actions: [{ type: 'logTransition', params: { from: 'paused', to: 'playing' } }],
        },
        RESPOND: {
          // Allow responses while paused (edge case but valid)
          actions: ['handleResponse'],
        },
        SET_SPEED: {
          actions: ['setSpeed'],
        },
        ABANDON: {
          target: 'abandoning',
          actions: [{ type: 'logTransition', params: { from: 'paused', to: 'abandoning' } }],
        },
      },
    },

    // =========================================================================
    // AWAITING_COMPLETION - Replay finished, waiting for user
    // =========================================================================
    awaitingCompletion: {
      on: {
        COMPLETE: {
          target: 'completing',
          actions: [
            { type: 'logTransition', params: { from: 'awaitingCompletion', to: 'completing' } },
          ],
        },
        ABANDON: {
          target: 'abandoning',
          actions: [
            { type: 'logTransition', params: { from: 'awaitingCompletion', to: 'abandoning' } },
          ],
        },
      },
    },

    // =========================================================================
    // COMPLETING - Create run AND persist ALL events at once
    // =========================================================================
    completing: {
      invoke: {
        id: 'createAndCompleteRun',
        src: 'createAndCompleteRun',
        input: ({ context }) => {
          if (!context.adapter) throw new Error('No adapter');
          if (!context.engine) throw new Error('No engine');
          return {
            adapter: context.adapter,
            sessionId: context.sessionId,
            parentRunId: context.parentRunId,
            engine: context.engine,
          };
        },
        onDone: {
          target: 'finished',
          actions: [
            { type: 'logTransition', params: { from: 'completing', to: 'finished' } },
            {
              type: 'setRun',
              params: ({ event }) => ({ run: event.output.run }),
            },
            assign(({ event }) => ({ score: event.output.score })),
            'clearSnapshot',
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'completing', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // ABANDONING - Just reset (no DB cleanup needed since run wasn't created)
    // =========================================================================
    abandoning: {
      // No invoke needed - run was never created in DB
      always: {
        target: 'idle',
        actions: [
          { type: 'logTransition', params: { from: 'abandoning', to: 'idle' } },
          'clearSnapshot',
          'resetContext',
        ],
      },
    },

    // =========================================================================
    // FINISHED - Run completed successfully
    // =========================================================================
    finished: {
      on: {
        RESET: {
          target: 'idle',
          actions: [
            { type: 'logTransition', params: { from: 'finished', to: 'idle' } },
            'resetContext',
          ],
        },
        START: {
          target: 'loading',
          actions: [
            'resetContext',
            { type: 'logTransition', params: { from: 'finished', to: 'loading' } },
            'setInput',
          ],
        },
      },
    },

    // =========================================================================
    // ERROR - An error occurred
    // =========================================================================
    error: {
      on: {
        RESET: {
          target: 'idle',
          actions: [
            { type: 'logTransition', params: { from: 'error', to: 'idle' } },
            'resetContext',
            'clearError',
          ],
        },
        START: {
          target: 'loading',
          actions: [
            'resetContext',
            'clearError',
            { type: 'logTransition', params: { from: 'error', to: 'loading' } },
            'setInput',
          ],
        },
      },
    },
  },
});

// Machine type for external use
type InteractiveReplayMachineSnapshot = SnapshotFrom<typeof interactiveReplayMachine>;

// =============================================================================
// Adapter Class (implements InteractiveReplayLifecyclePort)
// =============================================================================

/**
 * InteractiveReplayAdapter
 *
 * Wraps the XState machine to implement InteractiveReplayLifecyclePort.
 */
export class InteractiveReplayAdapter implements InteractiveReplayLifecyclePort {
  private actor: ReturnType<typeof createActor<typeof interactiveReplayMachine>>;

  // Cached values for useSyncExternalStore compatibility
  // (must return same object reference if values haven't changed)
  private cachedState: InteractiveReplayLifecycleState = 'idle';
  private cachedContext: InteractiveReplayContext = {
    run: null,
    currentTimeMs: 0,
    speed: 1,
    events: [],
    score: null,
    error: null,
    currentTrialIndex: 0,
  };

  // External listeners (notified AFTER cache is updated)
  private stateListeners = new Set<(state: InteractiveReplayLifecycleState) => void>();
  private contextListeners = new Set<(ctx: InteractiveReplayContext) => void>();

  constructor() {
    this.actor = createActor(interactiveReplayMachine, { input: {} });
    this.actor.start();

    // Initialize cached values from initial state
    this.updateCachedValues();

    // Single subscription: update cache THEN notify listeners
    this.actor.subscribe(() => {
      this.updateCachedValues();
      // Notify listeners AFTER cache is updated
      for (const listener of this.stateListeners) {
        listener(this.cachedState);
      }
      for (const listener of this.contextListeners) {
        listener(this.cachedContext);
      }
    });

    replayLog.info('[InteractiveReplay] XState machine started');
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private getSnapshot(): InteractiveReplayMachineSnapshot {
    return this.actor.getSnapshot();
  }

  private updateCachedValues(): void {
    const snapshot = this.getSnapshot();
    const newState = this.mapStateValue(snapshot.value as string);
    const ctx = snapshot.context;

    // Update state cache if changed
    if (newState !== this.cachedState) {
      replayLog.debug(`[InteractiveReplay] Cache update: ${this.cachedState} → ${newState}`);
      this.cachedState = newState;
    }

    // Update context cache only if values changed
    // (create new object only when necessary)
    if (
      this.cachedContext.run !== ctx.run ||
      this.cachedContext.currentTimeMs !== ctx.currentTimeMs ||
      this.cachedContext.speed !== ctx.speed ||
      this.cachedContext.events !== ctx.events ||
      this.cachedContext.score !== ctx.score ||
      this.cachedContext.error !== ctx.error ||
      this.cachedContext.currentTrialIndex !== ctx.currentTrialIndex
    ) {
      this.cachedContext = {
        run: ctx.run,
        currentTimeMs: ctx.currentTimeMs,
        speed: ctx.speed,
        events: ctx.events,
        score: ctx.score,
        error: ctx.error,
        currentTrialIndex: ctx.currentTrialIndex,
      };
    }
  }

  private mapStateValue(value: string): InteractiveReplayLifecycleState {
    // XState state values to port state mapping
    switch (value) {
      case 'idle':
        return 'idle';
      case 'loading':
        return 'loading';
      case 'recovering':
        return 'loading'; // Show as loading to user
      case 'ready':
        return 'ready';
      case 'playing':
        return 'playing';
      case 'paused':
        return 'paused';
      case 'awaitingCompletion':
        return 'awaitingCompletion';
      case 'completing':
        return 'awaitingCompletion'; // Still awaiting from UI perspective
      case 'abandoning':
        return 'idle'; // Transitioning to idle
      case 'finished':
        return 'finished';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  getState(): InteractiveReplayLifecycleState {
    // Return cached value for useSyncExternalStore compatibility
    return this.cachedState;
  }

  getContext(): InteractiveReplayContext {
    // Return cached value for useSyncExternalStore compatibility
    return this.cachedContext;
  }

  getProgress(): number {
    const ctx = this.getSnapshot().context;
    if (ctx.totalDurationMs <= 0) return 0;
    return Math.min(1, ctx.currentTimeMs / ctx.totalDurationMs);
  }

  hasRespondedForModality(modality: ModalityId): boolean {
    const ctx = this.getSnapshot().context;
    return ctx.engine?.hasRespondedForModality(modality) ?? false;
  }

  wasParentFalseAlarm(modality: ModalityId): boolean {
    const ctx = this.getSnapshot().context;
    return ctx.engine?.wasParentFalseAlarm(modality) ?? false;
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  start(): void {
    // Note: This requires input to be provided via sendStart() method
    // This is a simplified interface; real usage goes through sendStart
    replayLog.warn('[InteractiveReplay] start() called without input - use sendStart() instead');
  }

  /**
   * Start with full input (preferred method)
   */
  sendStart(input: InteractiveReplayInput, audioAdapter?: AudioPort): void {
    this.actor.send({ type: 'START', input, audioAdapter });
  }

  /**
   * Recover from a previous interrupted run
   */
  sendRecover(
    recoveredState: RecoveredReplayState,
    parentEvents: readonly GameEvent[],
    activeModalities: readonly ModalityId[],
    sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track',
    audioAdapter?: AudioPort,
  ): void {
    this.actor.send({
      type: 'RECOVER',
      recoveredState,
      parentEvents,
      activeModalities,
      sessionType,
      audioAdapter,
    });
  }

  play(): void {
    this.actor.send({ type: 'PLAY' });
  }

  pause(): void {
    this.actor.send({ type: 'PAUSE' });
  }

  togglePlayPause(): void {
    const state = this.getState();
    if (state === 'playing') {
      this.pause();
    } else if (state === 'ready' || state === 'paused') {
      this.play();
    }
  }

  tick(deltaMs: number): void {
    this.actor.send({ type: 'TICK', deltaMs });
  }

  respond(modality: ModalityId): void {
    this.actor.send({ type: 'RESPOND', modality });
  }

  setSpeed(speed: InteractiveReplaySpeed): void {
    this.actor.send({ type: 'SET_SPEED', speed });
  }

  complete(): void {
    this.actor.send({ type: 'COMPLETE' });
  }

  abandon(): void {
    this.actor.send({ type: 'ABANDON' });
  }

  reset(): void {
    this.actor.send({ type: 'RESET' });
  }

  // ===========================================================================
  // Mode-Specific Corrections
  // ===========================================================================

  flowDrop(
    proposalId: string,
    proposalType: 'position' | 'audio' | 'unified',
    proposalValue: number | string,
    targetSlot: number,
  ): void {
    const ctx = this.getSnapshot().context;
    if (!ctx.engine) return;

    const event = ctx.engine.handleFlowDrop(proposalId, proposalType, proposalValue, targetSlot);
    if (event) {
      replayLog.debug(
        `[InteractiveReplay] Flow drop: ${proposalType}=${proposalValue} → slot ${targetSlot}`,
      );
    }
  }

  recallPick(slotIndex: number, modality: 'position' | 'audio', value: number | string): void {
    const ctx = this.getSnapshot().context;
    if (!ctx.engine) return;

    const event = ctx.engine.handleRecallPick(slotIndex, modality, value);
    if (event) {
      replayLog.debug(`[InteractiveReplay] Recall pick: slot ${slotIndex}, ${modality}=${value}`);
    }
  }

  dualPickDrop(proposalId: string, label: string, targetSlot: number): void {
    const ctx = this.getSnapshot().context;
    if (!ctx.engine) return;

    const event = ctx.engine.handleDualPickDrop(proposalId, label, targetSlot);
    if (event) {
      replayLog.debug(`[InteractiveReplay] DualPick drop: ${label} → slot ${targetSlot}`);
    }
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  subscribe(listener: InteractiveReplayStateListener): () => void {
    // Emit initial state
    listener(this.cachedState);

    // Add to listeners set (will be notified AFTER cache updates)
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribeContext(listener: InteractiveReplayContextListener): () => void {
    // Emit initial context
    listener(this.cachedContext);

    // Add to listeners set (will be notified AFTER cache updates)
    this.contextListeners.add(listener);

    return () => {
      this.contextListeners.delete(listener);
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  dispose(): void {
    this.actor.stop();
    replayLog.info('[InteractiveReplay] XState machine stopped');
  }
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * Create a new InteractiveReplayAdapter instance.
 */
export function createInteractiveReplayAdapter(): InteractiveReplayLifecyclePort {
  return new InteractiveReplayAdapter();
}
