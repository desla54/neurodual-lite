/**
 * DualPickSession XState Machine
 *
 * Central state machine for Dual Pick mode sessions.
 * Migrated from manual State Pattern with 100% functional equivalence.
 *
 * ARCHITECTURE:
 * - Uses AudioContext-based timing via audio.scheduleCallback()
 * - Supports guided (random, oldestFirst, newestFirst) and free placement modes
 * - Distractor generation (random and proactive interference)
 * - Unified and separated timeline modes
 * - Plugin architecture for testable, pure data transformations
 *
 * State diagram:
 *
 *   idle ──START──► stimulus ◄──────────────────────┐
 *                       │                           │
 *                       │ (timer ends)              │
 *                       ▼                           │
 *                   placement                       │
 *                       │                           │
 *                       │ (all labels placed)       │
 *                       ▼                           │
 *              inter-trial-delay ───────────────────┘
 *                       │
 *                       │ (no more trials)
 *                       ▼
 *                   finished
 */
import { setup, assign, fromPromise } from 'xstate';
import type {
  DualPickSessionContext,
  DualPickSessionEvent,
  DualPickSessionInput,
  DualPickSessionSnapshot,
  DualPickStimulusTimerInput,
  DualPickInterTrialTimerInput,
} from './dual-pick-session-types';
import { INTER_TRIAL_DELAY_MS } from './dual-pick-session-types';
import { SCORING_POINTS_PER_ERROR } from '../../specs/thresholds';
import type { DualPickPhase } from '../../types/dual-pick';
import { createEmptyDualPickStats } from '../../types/dual-pick';
import { DualPickSessionProjector } from '../../engine';
import { emitAndPersist } from '../session-event-utils';
import type { AudioPort } from '../../ports';

function requirePlayMode(value: unknown): 'journey' | 'free' {
  if (value === 'journey' || value === 'free') return value;
  throw new Error(
    `[DualPickSessionMachine] Missing playMode (got ${String(value ?? 'undefined')})`,
  );
}

// =============================================================================
// Initial Context Factory
// =============================================================================

function createInitialContext(input: DualPickSessionInput): DualPickSessionContext {
  const baseContext: DualPickSessionContext = {
    ...input,
    trialIndex: 0,
    stimulus: null,
    history: [],
    proposals: [],
    timelineCards: [],
    placementOrder: [],
    placementOrderIndex: 0,
    stats: createEmptyDualPickStats(),
    summary: null,
    startTime: 0,
    turnStartedAtMs: 0,
    sessionEvents: [],
    seq: 0,
    pendingPersistence: [],
    isCompleted: true,
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
// Snapshot Builder (delegates to plugin)
// =============================================================================

function buildDualPickSnapshot(
  context: DualPickSessionContext,
  phase: DualPickPhase,
): DualPickSessionSnapshot {
  const currentTarget = context.plugins.placement.getCurrentTarget({
    placementOrderMode: context.spec.extensions.placementOrderMode ?? 'free',
    placementOrder: context.placementOrder,
    placementOrderIndex: context.placementOrderIndex,
  });

  return context.plugins.snapshot.build({
    phase,
    trialIndex: context.trialIndex,
    totalTrials: context.generator.getTotalTrials(),
    stimulus: context.stimulus,
    proposals: context.proposals,
    timelineCards: context.timelineCards,
    stats: context.stats,
    nLevel: context.spec.defaults.nLevel,
    summary: context.summary,
    history: context.history,
    activeModalities: context.spec.defaults.activeModalities,
    currentTarget,
  });
}

// =============================================================================
// Event Emission
// =============================================================================

function emitEvent(
  context: DualPickSessionContext,
  eventData: Record<string, unknown> & { type: string },
): void {
  const fullEventData =
    eventData.type === 'DUAL_PICK_SESSION_ENDED'
      ? {
          ...eventData,
          workflow: {
            completionInput: {
              mode: 'dual-pick',
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
    fullEventData.type === 'DUAL_PICK_SESSION_STARTED' ||
    fullEventData.type === 'DUAL_PICK_SESSION_ENDED'
  ) {
    context.pendingPersistence.push(persistPromise);
  }
}

// =============================================================================
// Machine Definition
// =============================================================================

export const dualPickSessionMachine = setup({
  types: {
    context: {} as DualPickSessionContext,
    events: {} as DualPickSessionEvent,
    input: {} as DualPickSessionInput,
  },

  actions: {
    // =========================================================================
    // Session Initialization
    // =========================================================================

    emitSessionStarted: ({ context }) => {
      emitEvent(context, {
        type: 'DUAL_PICK_SESSION_STARTED',
        userId: context.userId,
        config: {
          nLevel: context.spec.defaults.nLevel,
          activeModalities: context.spec.defaults.activeModalities,
          trialsCount: context.spec.defaults.trialsCount,
          stimulusDurationMs: context.spec.timing.stimulusDurationMs,
          placementOrderMode: context.spec.extensions.placementOrderMode,
          distractorCount: context.spec.extensions.distractorCount,
          timelineMode: context.spec.extensions.timelineMode,
          distractorSource: context.spec.extensions.distractorSource,
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
      startTime: context.recoveryState?.startTimestamp ?? context.clock.now(),
    })),

    /**
     * Advance generator to recovery position.
     * For DualPick mode, we simply skip to the next trial index.
     */
    advanceGeneratorForRecovery: ({ context }) => {
      if (!context.recoveryState) return;

      const { lastTrialIndex } = context.recoveryState;
      const targetIndex = lastTrialIndex + 1;

      // Advance generator to correct position (no feedbacks needed for DualPick)
      context.generator.skipTo(targetIndex);
    },

    // =========================================================================
    // Stimulus State
    // =========================================================================

    generateTrial: assign(({ context }) => {
      if (!context.generator.hasMore()) {
        return { stimulus: null };
      }

      const trial = context.generator.generateNext();
      const stimulus = { position: trial.position, sound: trial.sound };

      return {
        stimulus,
        history: [...context.history, stimulus],
        // Clear placed labels but keep card structure
        timelineCards: context.timelineCards.map((card) => ({ ...card, placedLabel: null })),
        proposals: [],
      };
    }),

    emitStimulusShown: ({ context }) => {
      if (!context.stimulus) return;

      emitEvent(context, {
        type: 'DUAL_PICK_STIMULUS_SHOWN',
        trialIndex: context.trialIndex,
        position: context.stimulus.position,
        sound: context.stimulus.sound,
        stimulusDurationMs: context.spec.timing.stimulusDurationMs,
        adaptiveZone: undefined,
      });
    },

    scheduleAudio: ({ context }) => {
      if (!context.stimulus) return;

      if (context.plugins.audio.shouldPlayStimulus(context.spec.defaults.activeModalities)) {
        context.audio.schedule(
          context.stimulus.sound as Parameters<AudioPort['play']>[0],
          0,
          () => {},
        );
      }
    },

    // =========================================================================
    // Placement State
    // =========================================================================

    clearStimulus: assign(() => ({
      stimulus: null,
    })),

    setupPlacement: assign(({ context }) => {
      // Use timeline plugin for generation
      const { timelineCards, proposals } = context.plugins.timeline.generate({
        history: context.history,
        trialIndex: context.trialIndex,
        nLevel: context.spec.defaults.nLevel,
        activeModalities: context.spec.defaults.activeModalities,
        timelineMode: context.spec.extensions.timelineMode ?? 'separated',
        distractorCount: context.spec.extensions.distractorCount ?? 0,
        distractorSource: context.spec.extensions.distractorSource ?? 'random',
        rng: () => context.random.random(),
        generateId: () => context.random.generateId(),
      });

      // Use timeline plugin for placement order generation
      const placementOrder = context.plugins.timeline.generatePlacementOrder({
        proposals,
        placementOrderMode: context.spec.extensions.placementOrderMode ?? 'free',
        rng: () => context.random.random(),
      });

      return {
        timelineCards,
        proposals,
        placementOrder,
        placementOrderIndex: 0,
        turnStartedAtMs: context.clock.now(),
      };
    }),

    emitPlacementStarted: ({ context }) => {
      emitEvent(context, {
        type: 'DUAL_PICK_PLACEMENT_STARTED',
        trialIndex: context.trialIndex,
        proposals: context.proposals.map((p) => ({
          id: p.id,
          label: p.label,
          type: p.type,
        })),
      });
    },

    processDropAttempt: assign(({ context, event }) => {
      if (event.type !== 'DROP_LABEL') return {};

      const { proposalId, targetSlot, targetType, trajectory } = event;

      // Use drop validator plugin for validation
      const validationResult = context.plugins.drop.validate({
        proposalId,
        targetSlot,
        targetType,
        proposals: context.proposals,
        timelineCards: context.timelineCards,
        history: context.history,
        placementOrderMode: context.spec.extensions.placementOrderMode ?? 'free',
        placementOrder: context.placementOrder,
        placementOrderIndex: context.placementOrderIndex,
      });

      // If proposal not found, silently ignore
      if (!validationResult.proposal) return {};

      const proposal = validationResult.proposal;

      // Calculate timing and position info for event
      const dragStartedAtMs = trajectory?.dragStartedAtMs;
      const placementTimeMs = dragStartedAtMs ? context.clock.now() - dragStartedAtMs : 0;
      const nonDistractorCards = context.timelineCards.filter((c) => !c.isDistractor);
      const distractorCards = context.timelineCards.filter((c) => c.isDistractor);
      const hasDistractors = distractorCards.length > 0;
      const placedCount = nonDistractorCards.filter((c) => c.placedLabel !== null).length;
      const isLastSlot = !hasDistractors && placedCount === nonDistractorCards.length - 1;
      const dropOrder = context.timelineCards.filter((c) => c.placedLabel !== null).length + 1;

      // Helper to emit drop attempted event
      const emitDropAttempted = (correct: boolean) => {
        emitEvent(context, {
          type: 'DUAL_PICK_DROP_ATTEMPTED',
          trialIndex: context.trialIndex,
          proposalId,
          proposalType: targetType,
          proposalLabel: proposal.label,
          targetSlot,
          mirror: false,
          correct,
          placementTimeMs,
          dropOrder,
          isLastSlot,
          dragStartedAtMs: trajectory?.dragStartedAtMs,
          totalDistancePx: trajectory?.totalDistancePx,
          directDistancePx: trajectory?.directDistancePx,
          slotEnters: trajectory?.slotEnters,
          trajectory: trajectory?.trajectory,
          inputMethod: trajectory?.inputMethod,
        });
      };

      // Handle rejection cases (already_placed, wrong_target, type_mismatch)
      if (!validationResult.isAccepted) {
        // Silent rejection - no event, no state change
        return {};
      }

      // Handle accepted but wrong (wrong_active_card, distractor)
      if (!validationResult.isCorrect) {
        emitDropAttempted(false);
        const nextTotal = context.stats.totalDrops + 1;
        return {
          stats: {
            ...context.stats,
            totalDrops: nextTotal,
            errorCount: context.stats.errorCount + 1,
            accuracy: context.stats.correctDrops / nextTotal,
          },
        };
      }

      // Handle correct drop
      emitDropAttempted(true);

      // Update timeline card with placed label
      const newTimelineCards = context.timelineCards.map((card) =>
        card.slot === targetSlot && card.type === targetType
          ? { ...card, placedLabel: proposal.label }
          : card,
      );

      const nextCorrect = context.stats.correctDrops + 1;
      const nextTotal = context.stats.totalDrops + 1;

      return {
        timelineCards: newTimelineCards,
        stats: {
          ...context.stats,
          totalDrops: nextTotal,
          correctDrops: nextCorrect,
          accuracy: nextCorrect / nextTotal,
        },
        placementOrderIndex:
          context.spec.extensions.placementOrderMode !== 'free'
            ? context.placementOrderIndex + 1
            : context.placementOrderIndex,
      };
    }),

    emitTurnCompleted: ({ context }) => {
      const turnDurationMs = context.clock.now() - context.turnStartedAtMs;
      emitEvent(context, {
        type: 'DUAL_PICK_TURN_COMPLETED',
        trialIndex: context.trialIndex,
        turnDurationMs,
      });
    },

    updateStatsForTurnComplete: assign(({ context }) => ({
      stats: {
        ...context.stats,
        turnsCompleted: context.stats.turnsCompleted + 1,
      },
    })),

    incrementTrialIndex: assign(({ context }) => ({
      trialIndex: context.trialIndex + 1,
    })),

    // =========================================================================
    // Session End
    // =========================================================================

    setIncomplete: assign(() => ({
      isCompleted: false,
    })),

    emitSessionEnded: ({ context }) => {
      emitEvent(context, {
        type: 'DUAL_PICK_SESSION_ENDED',
        userId: context.userId,
        reason: context.isCompleted ? 'completed' : 'abandoned',
        totalTrials: context.generator.getTotalTrials(),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
      });
    },

    computeSummary: assign(({ context }) => {
      const projectedSummary = DualPickSessionProjector.project(context.sessionEvents);

      if (projectedSummary) {
        return { summary: projectedSummary };
      }

      // Fallback if projection fails
      const durationMs = Math.round(context.clock.now() - context.startTime);
      const score = Math.max(0, 100 - context.stats.errorCount * SCORING_POINTS_PER_ERROR);

      return {
        summary: {
          sessionId: context.sessionId,
          nLevel: context.spec.defaults.nLevel,
          totalTrials: context.generator.getTotalTrials(),
          finalStats: context.stats,
          durationMs,
          completed: context.isCompleted,
          score,
          turnResults: [],
          extendedStats: {
            ...context.stats,
            byModality: {} as Record<
              string,
              {
                totalDrops: number;
                correctDrops: number;
                errorCount: number;
                accuracy: number;
                avgPlacementTimeMs: number;
              }
            >,
            trend: 'stable' as const,
            avgTurnDurationMs: 0,
            avgPlacementTimeMs: 0,
          },
          finalAdaptiveZone: null,
          confidenceScore: score,
          dropConfidenceMetrics: [],
        },
      };
    }),

    stopAudio: ({ context }) => {
      context.audio.stopAll();
    },

    ensureEventsPersisted: async ({ context }) => {
      if (context.pendingPersistence.length > 0) {
        console.log(
          `[DualPickSession] Waiting for ${context.pendingPersistence.length} pending persistence operations...`,
        );
        await Promise.all(context.pendingPersistence);
        context.pendingPersistence = [];
        console.log('[DualPickSession] All events persisted');
      }
    },
  },

  guards: {
    hasMoreTrials: ({ context }) => {
      return context.generator.hasMore();
    },

    noMoreTrials: ({ context }) => {
      return !context.generator.hasMore();
    },

    allLabelsPlaced: ({ context }) => {
      return context.plugins.placement.isAllLabelsPlaced({
        timelineCards: context.timelineCards,
      });
    },

    hasStimulusGenerated: ({ context }) => {
      return context.stimulus !== null;
    },
  },

  actors: {
    initAudio: fromPromise(async ({ input }: { input: DualPickSessionContext }) => {
      await input.audio.init();
    }),

    stimulusTimer: fromPromise(
      async ({ input, signal }: { input: DualPickStimulusTimerInput; signal: AbortSignal }) => {
        const { context } = input;
        const stimulusDurationMs = context.spec.timing.stimulusDurationMs;

        return new Promise<void>((resolve, reject) => {
          const callbackId = context.audio.scheduleCallback(stimulusDurationMs, () => resolve());
          // Cancel the callback if XState stops the actor (e.g., navigation, session end)
          signal.addEventListener(
            'abort',
            () => {
              context.audio.cancelCallback(callbackId);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    ),

    interTrialTimer: fromPromise(
      async ({ input, signal }: { input: DualPickInterTrialTimerInput; signal: AbortSignal }) => {
        const { context } = input;

        return new Promise<void>((resolve, reject) => {
          const callbackId = context.audio.scheduleCallback(INTER_TRIAL_DELAY_MS, () => resolve());
          // Cancel the callback if XState stops the actor
          signal.addEventListener(
            'abort',
            () => {
              context.audio.cancelCallback(callbackId);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    ),
  },
}).createMachine({
  id: 'dualPickSession',
  initial: 'idle',
  context: ({ input }) => createInitialContext(input),

  states: {
    // =========================================================================
    // IDLE - Waiting for START
    // =========================================================================

    idle: {
      on: {
        START: {
          target: 'starting',
        },
        STOP: {
          target: 'finished',
        },
      },
    },

    // =========================================================================
    // STARTING - Initialize audio
    // =========================================================================

    starting: {
      entry: ['emitSessionStarted', 'setStartTime', 'advanceGeneratorForRecovery'],
      invoke: {
        id: 'initAudio',
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'stimulus',
        },
        onError: {
          target: 'finished',
          actions: ['setIncomplete', 'emitSessionEnded', 'computeSummary'],
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'setIncomplete', 'emitSessionEnded', 'computeSummary'],
        },
      },
    },

    // =========================================================================
    // STIMULUS - Display stimulus for duration
    // =========================================================================

    stimulus: {
      entry: ['generateTrial', 'emitStimulusShown', 'scheduleAudio'],

      always: [
        {
          // No more trials = session complete
          guard: ({ context }) => context.stimulus === null,
          target: 'finished',
          actions: ['emitSessionEnded', 'computeSummary'],
        },
      ],

      invoke: {
        id: 'stimulusTimer',
        src: 'stimulusTimer',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'placement',
        },
        onError: {
          // Timer cancelled
        },
      },

      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'setIncomplete', 'emitSessionEnded', 'computeSummary'],
        },
      },
    },

    // =========================================================================
    // PLACEMENT - User places labels
    // =========================================================================

    placement: {
      entry: ['clearStimulus', 'setupPlacement', 'emitPlacementStarted'],

      on: {
        DROP_LABEL: {
          actions: ['processDropAttempt'],
        },

        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'setIncomplete', 'emitSessionEnded', 'computeSummary'],
        },
      },

      always: [
        {
          guard: 'allLabelsPlaced',
          target: 'turnEnd',
          actions: ['emitTurnCompleted', 'updateStatsForTurnComplete'],
        },
      ],
    },

    // =========================================================================
    // TURN_END - Inter-trial delay
    // =========================================================================

    turnEnd: {
      invoke: {
        id: 'interTrialTimer',
        src: 'interTrialTimer',
        input: ({ context }) => ({ context }),
        onDone: [
          {
            guard: 'hasMoreTrials',
            target: 'stimulus',
            actions: ['incrementTrialIndex'],
          },
          {
            target: 'finished',
            actions: ['emitSessionEnded', 'computeSummary'],
          },
        ],
        onError: {
          // Timer cancelled
        },
      },

      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'setIncomplete', 'emitSessionEnded', 'computeSummary'],
        },
      },
    },

    // =========================================================================
    // FINISHED - Terminal state
    // =========================================================================

    finished: {
      type: 'final',
      entry: ['ensureEventsPersisted'],
    },
  },
});

// =============================================================================
// Exports
// =============================================================================

export { buildDualPickSnapshot };
export type { DualPickSessionSnapshot, DualPickPhase };
