/**
 * PlaceSession XState Machine
 *
 * State machine for Flow session (drag-and-drop N-back).
 * Replaces the manual State Pattern implementation.
 *
 * State diagram:
 *
 *   idle ──START──► stimulus ──STIMULUS_COMPLETE──► placement
 *                                                       │
 *                       ┌──────ALL_PLACED───────────────┤
 *                       ▼                               │
 *   finished ◄──STOP── awaitingAdvance ──ADVANCE──► stimulus
 *       ▲                               (next trial)     ▲
 *       │                                                │
 *       └───────────────STOP─────────────────────────────┘
 */
import { setup, assign, fromPromise } from 'xstate';
import type {
  PlaceSessionMachineContext,
  PlaceSessionInput,
  PlaceSessionMachineEvent,
} from './place-session-types';
import { PlaceSessionProjector } from '../../engine';
import { emitAndPersist } from '../session-event-utils';
import type { PlaceRunningStats } from '../../types/place';
import type { AudioPort } from '../../ports';
import { TIMING_SESSION_STARTUP_MS } from '../../specs/thresholds';

function requirePlayMode(value: unknown): 'journey' | 'free' {
  if (value === 'journey' || value === 'free') return value;
  throw new Error(`[PlaceSessionMachine] Missing playMode (got ${String(value ?? 'undefined')})`);
}

// =============================================================================
// Event Emission Helper
// =============================================================================

/**
 * Emit a Flow event with proper schema fields and persistence.
 */
function emitEvent(
  context: PlaceSessionMachineContext,
  eventData: Record<string, unknown> & { type: string },
): void {
  const fullEventData =
    eventData.type === 'FLOW_SESSION_ENDED'
      ? {
          ...eventData,
          workflow: {
            completionInput: {
              mode: 'place',
              sessionId: context.sessionId,
              events: context.sessionEvents,
              summary: context.summary,
            },
          },
        }
      : eventData;

  const persistPromise = emitAndPersist(context, fullEventData);

  // Track critical events (STARTED/ENDED) for completion guarantees
  if (
    fullEventData.type === 'FLOW_SESSION_STARTED' ||
    fullEventData.type === 'FLOW_SESSION_ENDED'
  ) {
    context.pendingPersistence.push(persistPromise);
  }
}

// =============================================================================
// Constants (from SSOT)
// =============================================================================

const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
const STARTUP_DELAY_MS = IS_TEST_ENV ? 1 : TIMING_SESSION_STARTUP_MS;

// =============================================================================
// Helper Functions
// =============================================================================

function createEmptyStats(): PlaceRunningStats {
  return {
    totalDrops: 0,
    correctDrops: 0,
    errorCount: 0,
    turnsCompleted: 0,
    accuracy: 0,
  };
}

// =============================================================================
// Initial Context Factory
// =============================================================================

function createInitialContext(input: PlaceSessionInput): PlaceSessionMachineContext {
  const baseContext: PlaceSessionMachineContext = {
    ...input,
    trialIndex: 0,
    history: [],
    stimulus: null,
    proposals: [],
    placedProposals: new Map(),
    placementOrder: [],
    placementOrderIndex: 0,
    turnErrorCount: 0,
    turnDropOrder: 0,
    turnStartTime: 0,
    stats: createEmptyStats(),
    startTime: 0,
    stimulusTimerId: null,
    seq: 0,
    summary: null,
    sessionEvents: [],
    pendingPersistence: [],
  };

  // If recovering, restore state from recovered data
  if (input.recoveryState) {
    const { lastTrialIndex, startTimestamp } = input.recoveryState;

    return {
      ...baseContext,
      // Restore trial position - resume AT the interrupted trial (not +1)
      trialIndex: lastTrialIndex,
      startTime: startTimestamp,
    };
  }

  return baseContext;
}

// =============================================================================
// Machine Definition
// =============================================================================

export const placeSessionMachine = setup({
  types: {
    context: {} as PlaceSessionMachineContext,
    events: {} as PlaceSessionMachineEvent,
    input: {} as PlaceSessionInput,
  },

  actions: {
    // =========================================================================
    // Session Initialization
    // =========================================================================

    emitSessionStarted: ({ context }) => {
      emitEvent(context, {
        type: 'FLOW_SESSION_STARTED',
        userId: context.userId,
        config: {
          nLevel: context.spec.defaults.nLevel,
          activeModalities: context.spec.defaults.activeModalities,
          trialsCount: context.generator.getTotalTrials(),
          stimulusDurationMs: context.spec.timing.stimulusDurationMs,
          placementOrderMode: context.spec.extensions.placementOrderMode,
        },
        device: context.plugins.deviceContext.getDeviceInfo(context.audio),
        context: context.plugins.deviceContext.getTemporalContext(),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        journeyStartLevel: context.journeyStartLevel,
        journeyTargetLevel: context.journeyTargetLevel,
        journeyGameMode: context.journeyGameMode,
        journeyName: context.journeyName,
        playContext: requirePlayMode(context.playMode),
        spec: context.spec,
        gameMode: context.spec.metadata.id,
      });
    },

    setStartTime: assign(({ context }) => ({
      startTime: context.clock.now(),
    })),

    // =========================================================================
    // Stimulus Phase
    // =========================================================================

    generateTrial: assign(({ context }) => {
      const trial = context.generator.generateNext();
      const stimulus = { position: trial.position, sound: trial.sound };

      return {
        stimulus,
        history: [...context.history, stimulus],
      };
    }),

    emitStimulusShown: ({ context }) => {
      if (!context.stimulus) return;

      emitEvent(context, {
        type: 'FLOW_STIMULUS_SHOWN',
        trialIndex: context.trialIndex,
        position: context.stimulus.position,
        sound: context.stimulus.sound,
        stimulusDurationMs: context.spec.timing.stimulusDurationMs,
        adaptiveZone: context.generator.getZoneNumber() ?? undefined,
      });
    },

    playAudio: ({ context }) => {
      if (!context.stimulus) return;
      if (context.plugins.audio.shouldPlayStimulus(context.spec.defaults.activeModalities)) {
        context.audio.schedule(
          context.stimulus.sound as Parameters<AudioPort['play']>[0],
          0,
          () => {}, // onPlay callback required
        );
      }
    },

    clearStimulus: assign(() => ({
      stimulus: null,
    })),

    // =========================================================================
    // Placement Phase
    // =========================================================================

    setupPlacement: assign(({ context }) => {
      // Use proposal plugin for generation
      const { proposals } = context.plugins.proposal.generate({
        history: context.history,
        trialIndex: context.trialIndex,
        nLevel: context.spec.defaults.nLevel,
        activeModalities: context.spec.defaults.activeModalities,
        timelineMode: context.spec.extensions.timelineMode ?? 'separated',
        rng: () => context.random.random(),
        generateId: () => context.random.generateId(),
      });

      // Use proposal plugin for placement order generation
      const placementOrder = context.plugins.proposal.generatePlacementOrder({
        proposals,
        placementOrderMode: context.spec.extensions.placementOrderMode ?? 'free',
        rng: () => context.random.random(),
      });

      return {
        proposals,
        placedProposals: new Map<string, number>(),
        placementOrder,
        placementOrderIndex: 0,
        turnErrorCount: 0,
        turnDropOrder: 0,
        turnStartTime: context.clock.now(),
      };
    }),

    emitPlacementStarted: ({ context }) => {
      emitEvent(context, {
        type: 'FLOW_PLACEMENT_STARTED',
        trialIndex: context.trialIndex,
        proposalCount: context.proposals.length,
        proposalIds: context.proposals.map((p) => p.id),
      });
    },

    processDropResult: assign(({ context, event }) => {
      if (event.type !== 'DROP') return {};

      const { proposalId, targetSlot, trajectory } = event;
      const placedProposals = new Map(context.placedProposals);

      // Use drop validator plugin for validation
      const validationResult = context.plugins.drop.validate({
        proposalId,
        targetSlot,
        proposals: context.proposals,
        placedProposals: context.placedProposals,
        history: context.history,
      });

      // If not accepted (proposal not found or already placed), ignore
      if (!validationResult.isAccepted || !validationResult.proposal) return {};

      const proposal = validationResult.proposal;
      const correct = validationResult.isCorrect;

      // Emit event - handle unified vs position/audio proposals
      let proposalType: 'position' | 'audio';
      let proposalValue: number | string;

      if (proposal.type === 'unified') {
        // For unified, we pick 'position' type and the position value for event
        proposalType = 'position';
        proposalValue = proposal.position;
      } else {
        proposalType = proposal.type;
        proposalValue = proposal.value;
      }

      emitEvent(context, {
        type: 'FLOW_DROP_ATTEMPTED',
        trialIndex: context.trialIndex,
        proposalId: proposal.id,
        proposalType,
        proposalValue,
        targetSlot,
        correct,
        placementTimeMs: context.clock.now() - context.turnStartTime,
        dropOrder: context.turnDropOrder + 1,
        isLastSlot: false, // Simplified for now
        ...(trajectory && {
          dragStartedAtMs: trajectory.dragStartedAtMs,
          totalDistancePx: trajectory.totalDistancePx,
          directDistancePx: trajectory.directDistancePx,
          slotEnters: trajectory.slotEnters,
          trajectory: trajectory.trajectory,
          inputMethod: trajectory.inputMethod,
        }),
      });

      // Update stats
      const stats = { ...context.stats };
      stats.totalDrops++;
      if (correct) {
        stats.correctDrops++;
        placedProposals.set(proposalId, targetSlot);
      } else {
        stats.errorCount++;
      }
      stats.accuracy = stats.totalDrops > 0 ? stats.correctDrops / stats.totalDrops : 0;

      return {
        placedProposals,
        stats,
        turnDropOrder: context.turnDropOrder + 1,
        turnErrorCount: correct ? context.turnErrorCount : context.turnErrorCount + 1,
        placementOrderIndex: correct
          ? context.placementOrderIndex + 1
          : context.placementOrderIndex,
      };
    }),

    // =========================================================================
    // Turn Completion
    // =========================================================================

    emitTurnCompleted: ({ context }) => {
      emitEvent(context, {
        type: 'FLOW_TURN_COMPLETED',
        trialIndex: context.trialIndex,
        turnDurationMs: context.clock.now() - context.turnStartTime,
      });
    },

    emitDragCancelled: ({ context, event }) => {
      if (event.type !== 'DRAG_CANCELLED') return;

      // Only emit in 'free' mode (guided mode has no choice to cancel)
      if (context.spec.extensions.placementOrderMode !== 'free') return;

      const proposal = context.proposals.find((p) => p.id === event.proposalId);
      if (!proposal) return;

      emitEvent(context, {
        type: 'FLOW_DRAG_CANCELLED',
        trialIndex: context.trialIndex,
        proposalId: proposal.id,
        proposalType: proposal.type,
        dragDurationMs: event.trajectory?.dragDurationMs ?? 0,
        totalDistancePx: event.trajectory?.totalDistancePx,
        slotEnters: event.trajectory?.slotEnters?.map((e) => ({
          slot: e.slot,
          type: e.type,
          mirror: e.mirror,
          atMs: e.atMs,
        })),
        releasedOnSlot: event.trajectory?.releasedOnSlot,
        invalidDrop: event.trajectory?.invalidDrop,
        inputMethod: event.trajectory?.inputMethod ?? 'mouse',
      });
    },

    advanceTrial: assign(({ context }) => ({
      trialIndex: context.trialIndex + 1,
      stats: {
        ...context.stats,
        turnsCompleted: context.stats.turnsCompleted + 1,
      },
    })),

    // =========================================================================
    // Session End
    // =========================================================================

    emitSessionEnded: ({ context }) => {
      emitEvent(context, {
        type: 'FLOW_SESSION_ENDED',
        userId: context.userId,
        reason: 'completed',
        totalTrials: context.generator.getTotalTrials(),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
      });
    },

    emitSessionAbandoned: ({ context }) => {
      emitEvent(context, {
        type: 'FLOW_SESSION_ENDED',
        userId: context.userId,
        reason: 'abandoned',
        totalTrials: context.generator.getTotalTrials(),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
      });
    },

    computeSummary: assign(({ context }) => {
      // Cast to GameEvent[] for projector (projector expects typed events)
      const projectedSummary = PlaceSessionProjector.project(
        context.sessionEvents as unknown as import('../../engine').GameEvent[],
      );
      return { summary: projectedSummary };
    }),

    saveAlgorithmState: ({ context }) => {
      // Save algorithm state if port is available (fire and forget)
      if (
        context.algorithmStatePort &&
        context.plugins.algorithmState.canPersist(context.generator)
      ) {
        context.plugins.algorithmState
          .saveState(context.userId, context.generator, context.algorithmStatePort)
          .catch((err) => {
            console.warn('[PlaceSession] Failed to save algorithm state on end:', err);
          });
      }
    },

    ensureEventsPersisted: async ({ context }) => {
      if (context.pendingPersistence.length > 0) {
        console.log(
          `[PlaceSession] Waiting for ${context.pendingPersistence.length} pending persistence operations...`,
        );
        await Promise.all(context.pendingPersistence);
        context.pendingPersistence = [];
        console.log('[PlaceSession] All events persisted');
      }
    },

    stopAudio: ({ context }) => {
      context.audio.stopAll();
    },

    clearStimulusTimer: assign(({ context }) => {
      if (context.stimulusTimerId !== null) {
        context.audio.cancelCallback(context.stimulusTimerId);
      }
      return { stimulusTimerId: null };
    }),
  },

  guards: {
    hasMoreTrials: ({ context }) => {
      // Check if there's a trial AFTER advancing (trialIndex + 1)
      // trialIndex is 0-based, so after trial 19 (last of 20), we check 20 < 20 = false
      return context.trialIndex + 1 < context.generator.getTotalTrials();
    },

    allProposalsPlaced: ({ context }) => {
      return context.plugins.turn.isAllProposalsPlaced({
        proposals: context.proposals,
        placedProposals: context.placedProposals,
      });
    },
  },

  actors: {
    initAndDelay: fromPromise(async ({ input }: { input: PlaceSessionMachineContext }) => {
      await input.audio.init();

      // Load algorithm state if port is available
      if (input.algorithmStatePort && input.plugins.algorithmState.canPersist(input.generator)) {
        await input.plugins.algorithmState.loadAndRestoreState(
          input.userId,
          input.generator,
          input.algorithmStatePort,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
    }),

    waitForStimulusDuration: fromPromise(
      async ({ input, signal }: { input: PlaceSessionMachineContext; signal: AbortSignal }) => {
        return new Promise<void>((resolve, reject) => {
          const activeModalities = input.spec.defaults.activeModalities;
          const stimulusDurationMs = input.spec.timing.stimulusDurationMs;
          const isAudioOnly = activeModalities.length === 1 && activeModalities[0] === 'audio';

          // Schedule the callback and store ID for cancellation
          const callbackId = isAudioOnly
            ? input.audio.scheduleCallback(stimulusDurationMs, () => resolve())
            : input.audio.scheduleCallback(stimulusDurationMs, () => resolve());

          // Cancel the callback if XState stops the actor (e.g., navigation, session end)
          signal.addEventListener(
            'abort',
            () => {
              input.audio.cancelCallback(callbackId);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    ),
  },
}).createMachine({
  id: 'placeSession',
  initial: 'idle',
  context: ({ input }) => createInitialContext(input),

  states: {
    // =========================================================================
    // IDLE - Waiting for START
    // =========================================================================

    idle: {
      on: {
        START: 'starting',
      },
    },

    // =========================================================================
    // STARTING - Initialize audio
    // =========================================================================

    starting: {
      invoke: {
        id: 'initAndDelay',
        src: 'initAndDelay',
        input: ({ context }) => context,
        onDone: {
          target: 'stimulus',
          actions: ['emitSessionStarted', 'setStartTime'],
        },
        onError: {
          target: 'finished',
          actions: ['emitSessionAbandoned'],
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned'],
        },
      },
    },

    // =========================================================================
    // STIMULUS - Showing position + audio
    // =========================================================================

    stimulus: {
      entry: ['generateTrial', 'emitStimulusShown', 'playAudio'],
      invoke: {
        id: 'waitForStimulusDuration',
        src: 'waitForStimulusDuration',
        input: ({ context }) => context,
        onDone: {
          target: 'placement',
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned', 'computeSummary'],
        },
      },
    },

    // =========================================================================
    // PLACEMENT - Drag & drop phase
    // =========================================================================

    placement: {
      entry: ['clearStimulus', 'setupPlacement', 'emitPlacementStarted'],
      on: {
        DROP: [
          {
            guard: 'allProposalsPlaced',
            target: 'awaitingAdvance',
            actions: ['processDropResult', 'emitTurnCompleted'],
          },
          {
            actions: ['processDropResult'],
          },
        ],
        DRAG_CANCELLED: {
          actions: ['emitDragCancelled'],
        },
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned', 'computeSummary'],
        },
      },
      always: [
        {
          guard: 'allProposalsPlaced',
          target: 'awaitingAdvance',
          actions: ['emitTurnCompleted'],
        },
      ],
    },

    // =========================================================================
    // AWAITING_ADVANCE - UI requests next trial
    // =========================================================================

    awaitingAdvance: {
      on: {
        ADVANCE: [
          {
            guard: 'hasMoreTrials',
            target: 'stimulus',
            actions: ['advanceTrial'],
          },
          {
            target: 'finished',
            actions: ['advanceTrial', 'emitSessionEnded', 'computeSummary'],
          },
        ],
        STOP: {
          target: 'finished',
          actions: ['emitSessionAbandoned', 'computeSummary'],
        },
      },
    },

    // =========================================================================
    // FINISHED - Terminal state
    // =========================================================================

    finished: {
      type: 'final',
      entry: ['saveAlgorithmState', 'ensureEventsPersisted'],
    },
  },
});

export type PlaceSessionMachine = typeof placeSessionMachine;
