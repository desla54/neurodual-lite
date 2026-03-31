/**
 * MemoSession XState Machine
 *
 * Central state machine for Memo mode sessions.
 * Migrated from manual State Pattern with 100% functional equivalence.
 *
 * ARCHITECTURE:
 * - Uses AudioContext-based timing via audio.scheduleCallback()
 * - Adaptive trial generation via SequenceTrialGenerator
 * - Anti-chunking with random fill order
 * - Correction limits (max 3 per cell)
 *
 * State diagram:
 *
 *   idle ──START──► stimulus ◄───────────────────────┐
 *                       │                            │
 *                       │ (timer ends)               │
 *                       ▼                            │
 *                    recall                          │
 *                       │                            │
 *                       │ COMMIT (window complete)   │
 *                       ▼                            │
 *               ┌───feedback?───┐                    │
 *               │  (if enabled) │────────────────────┘
 *               │               │
 *               └───────────────┘
 *                       │
 *                       │ (no more trials)
 *                       ▼
 *                   finished
 */
import { setup, assign, fromPromise } from 'xstate';
import type {
  MemoSessionContext,
  MemoSessionEvent,
  MemoSessionInput,
  MemoSessionSnapshot,
  MemoPhase,
  StimulusTimerInput,
  FeedbackTimerInput,
} from './memo-session-types';
import { AUDIO_END_BUFFER_MS } from './memo-session-types';
import { AUDIO_SYNC_BUFFER_MS } from '../../domain';
import { MemoSessionProjector } from '../../engine';
import { emitAndPersist } from '../session-event-utils';
import {
  DEFAULT_PROGRESSIVE_CONFIG,
  getWindowDepthForTrial,
  isWindowComplete,
} from '../../types/memo';
import type { SlotPicks } from '../../types/memo';

function requirePlayMode(value: unknown): 'journey' | 'free' {
  if (value === 'journey' || value === 'free') return value;
  throw new Error(`[MemoSessionMachine] Missing playMode (got ${String(value ?? 'undefined')})`);
}

// =============================================================================
// Helper Functions (moved to plugins, keeping only event emission helper)
// =============================================================================

// =============================================================================
// Initial Context Factory
// =============================================================================

function createInitialContext(input: MemoSessionInput): MemoSessionContext {
  const spec = input.spec;
  const ext = spec.extensions;
  const nLevel = spec.defaults.nLevel;

  // Initialize adaptive params
  // Window depth = nLevel + 1 (slots: N, N-1, ..., N-nLevel)
  // When progressive is disabled, use full depth from start
  const progressiveWindow = ext.progressiveWindow;
  const effectiveWindowDepth = progressiveWindow?.enabled
    ? progressiveWindow.initialDepth
    : nLevel + 1;

  return {
    ...input,
    currentTrial: null,
    trialIndex: 0,
    trials: [],
    stimulusStartTime: 0,
    recallStartTime: 0,
    phaseEnteredAt: 0,
    currentPicks: new Map(),
    correctionCounts: new Map(),
    fillOrder: [],
    fillOrderIndex: 0,
    effectiveWindowDepth,
    effectiveLureProbability: ext.initialLureProbability ?? spec.generation.lureProbability,
    effectiveTargetProbability: spec.generation.targetProbability,
    message: null,
    finalSummary: null,
    sessionEvents: [],
    seq: 0,
    pendingPersistence: [],
  };
}

// =============================================================================
// Snapshot Builder (delegates to plugin)
// =============================================================================

function buildSnapshot(context: MemoSessionContext, phase: MemoPhase): MemoSessionSnapshot {
  return context.plugins.snapshot.build({
    phase,
    phaseEnteredAt: context.phaseEnteredAt,
    trialIndex: context.trialIndex,
    currentTrial: context.currentTrial,
    currentPicks: context.currentPicks,
    correctionCounts: context.correctionCounts,
    fillOrder: context.fillOrder,
    fillOrderIndex: context.fillOrderIndex,
    effectiveWindowDepth: context.effectiveWindowDepth,
    sessionEvents: context.sessionEvents,
    trials: context.trials,
    generator: context.generator,
    spec: context.spec,
    message: context.message,
    finalSummary: context.finalSummary,
  });
}

// =============================================================================
// Event Emission Helpers
// =============================================================================

/**
 * Emit a MemoEvent to the event store and session events.
 * Delegates envelope creation to the shared emitAndPersist utility.
 */
function emitEvent(
  context: MemoSessionContext,
  eventData: Record<string, unknown> & { type: string },
): void {
  const fullEventData =
    eventData.type === 'RECALL_SESSION_ENDED'
      ? {
          ...eventData,
          workflow: {
            completionInput: {
              mode: 'memo',
              sessionId: context.sessionId,
              events: context.sessionEvents,
              summary: context.finalSummary,
            },
          },
        }
      : eventData;

  const persistPromise = emitAndPersist(context, fullEventData);

  // Track critical events (STARTED/ENDED) for completion guarantees
  if (
    fullEventData.type === 'RECALL_SESSION_STARTED' ||
    fullEventData.type === 'RECALL_SESSION_ENDED'
  ) {
    context.pendingPersistence.push(persistPromise);
  }
}

// =============================================================================
// Fill Order & Algorithm Type Guards (moved to plugins)
// =============================================================================

// =============================================================================
// Machine Definition
// =============================================================================

export const memoSessionMachine = setup({
  types: {
    context: {} as MemoSessionContext,
    events: {} as MemoSessionEvent,
    input: {} as MemoSessionInput,
  },

  actions: {
    // =========================================================================
    // Session Initialization
    // =========================================================================

    emitSessionStarted: ({ context }) => {
      // Use plugins for device and context info
      const deviceInfo = context.plugins.deviceContext.getDeviceInfo(context.audio);
      const sessionContextInfo = context.plugins.deviceContext.getSessionContextInfo();
      const spec = context.spec;
      const ext = spec.extensions;
      const trialsCount = context.generator.getTotalTrials();

      emitEvent(context, {
        type: 'RECALL_SESSION_STARTED',
        userId: context.userId,
        config: {
          nLevel: spec.defaults.nLevel,
          activeModalities: spec.defaults.activeModalities,
          trialsCount,
          stimulusDurationSeconds: spec.timing.stimulusDurationMs / 1000,
          feedbackMode: ext.feedbackMode ?? 'on-commit',
          feedbackDurationMs: ext.feedbackDurationMs,
          progressiveWindow: ext.progressiveWindow ?? DEFAULT_PROGRESSIVE_CONFIG,
          scoringVersion: spec.metadata.version,
          targetProbability: spec.generation.targetProbability,
          lureProbability: spec.generation.lureProbability,
          fillOrderMode: ext.fillOrderMode ?? 'sequential',
          disableWindowAdaptation: ext.disableWindowAdaptation,
          initialLureProbability: ext.initialLureProbability,
        },
        device: deviceInfo,
        context: sessionContextInfo,
        trialsSeed: context.random.getSeed?.() ?? 'no-seed',
        trialsHash: `adaptive-${context.random.getSeed?.() ?? 'no-seed'}`,
        trialsCount,
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        journeyStartLevel: context.journeyStartLevel,
        journeyTargetLevel: context.journeyTargetLevel,
        journeyGameMode: context.journeyGameMode,
        journeyName: context.journeyName,
        playContext: requirePlayMode(context.playMode),
        spec,
        gameMode: spec.metadata.id,
      });
    },

    setPhaseEnteredAt: assign(({ context }) => ({
      phaseEnteredAt: context.clock.now(),
    })),

    // =========================================================================
    // Stimulus State
    // =========================================================================

    generateAndSetTrial: assign(({ context }) => {
      // Clone trials for immutability (never mutate context directly)
      const trials = [...context.trials];

      // Generate trial on demand if needed
      while (trials.length <= context.trialIndex && context.generator.hasMore()) {
        const trial = context.generator.generateNext();
        trials.push(trial);
      }

      const currentTrial = trials[context.trialIndex] ?? null;
      return { currentTrial, trials };
    }),

    emitStimulusShown: ({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return;

      const gameParams = context.generator.getGameParameters();
      // Spec has stimulusDurationMs directly
      const stimulusDurationMs =
        gameParams?.stimulusDuration !== undefined
          ? gameParams.stimulusDuration * 1000
          : context.spec.timing.stimulusDurationMs;

      emitEvent(context, {
        type: 'RECALL_STIMULUS_SHOWN',
        trialIndex: context.trialIndex,
        trial,
        stimulusDurationMs,
      });
    },

    setStimulusStartTime: assign(({ context }) => ({
      stimulusStartTime: context.clock.now() + AUDIO_SYNC_BUFFER_MS,
    })),

    scheduleAudio: ({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return;

      // Use audio plugin to check if audio should be played
      if (context.plugins.audio.shouldPlayStimulus(context.spec.defaults.activeModalities)) {
        const bufferMs = context.plugins.audio.getAudioSyncBufferMs();
        context.audio.schedule(trial.sound, bufferMs, () => {
          // Callback when audio starts - used for precise timing
        });
      }
    },

    emitStimulusHidden: ({ context }) => {
      emitEvent(context, {
        type: 'RECALL_STIMULUS_HIDDEN',
        trialIndex: context.trialIndex,
      });
    },

    // =========================================================================
    // Recall State
    // =========================================================================

    resetPicksAndGenerateFillOrder: assign(({ context }) => {
      const requiredDepth = getWindowDepthForTrial(
        context.trialIndex,
        context.effectiveWindowDepth,
      );

      // Use fillOrder plugin to generate fill order
      const fillOrder = context.plugins.fillOrder.generate(
        {
          windowDepth: requiredDepth,
          activeModalities: context.spec.defaults.activeModalities,
          fillOrderMode: context.spec.extensions.fillOrderMode ?? 'sequential',
        },
        () => context.random.random(),
      );

      return {
        currentPicks: new Map<number, SlotPicks>(),
        correctionCounts: new Map<string, number>(),
        fillOrder,
        fillOrderIndex: 0,
        recallStartTime: context.clock.now(),
      };
    }),

    emitWindowOpened: ({ context }) => {
      const requiredDepth = getWindowDepthForTrial(
        context.trialIndex,
        context.effectiveWindowDepth,
      );
      emitEvent(context, {
        type: 'RECALL_WINDOW_OPENED',
        trialIndex: context.trialIndex,
        requiredWindowDepth: requiredDepth,
      });
    },

    recordPick: assign(({ context, event }) => {
      if (event.type !== 'PICK') return {};

      const { slotIndex, pick, inputMethod } = event;

      // Use pick plugin to process the pick
      const result = context.plugins.pick.process({
        slotIndex,
        pick,
        currentPicks: context.currentPicks,
        correctionCounts: context.correctionCounts,
        fillOrder: context.fillOrder,
        fillOrderIndex: context.fillOrderIndex,
        trialIndex: context.trialIndex,
      });

      if (!result.isAccepted) {
        return {}; // Pick rejected (max corrections or cell not active)
      }

      // Emit RECALL_PICKED event (machine orchestrates)
      emitEvent(context, {
        type: 'RECALL_PICKED',
        trialIndex: context.trialIndex,
        slotIndex,
        pick,
        isCorrection: result.isCorrection,
        inputMethod,
      });

      return {
        currentPicks: result.newPicks,
        correctionCounts: result.newCorrectionCounts,
        fillOrderIndex: result.newFillOrderIndex,
      };
    }),

    emitWindowCommittedAndAdvance: assign(({ context }) => {
      const recallDurationMs = context.clock.now() - context.recallStartTime;

      // Emit WINDOW_COMMITTED event
      emitEvent(context, {
        type: 'RECALL_WINDOW_COMMITTED',
        trialIndex: context.trialIndex,
        recallDurationMs,
      });

      // Get stats for feedback
      const stats = MemoSessionProjector.computeStatsUpToWindow(
        context.sessionEvents,
        context.trials,
        context.trialIndex,
        context.spec.defaults.activeModalities,
      );
      const windowAccuracy = stats.accuracy;

      // Use windowEval plugin (PURE - only builds feedback, no side effects)
      const evalResult = context.plugins.windowEval.evaluate({
        trialIndex: context.trialIndex,
        trials: context.trials,
        recallDurationMs,
        windowAccuracy,
      });

      // Machine handles trial generation (side effect belongs here, not in plugin)
      const trials = [...context.trials]; // Clone for immutability
      if (context.generator.hasMore()) {
        const nextTrial = context.generator.generateNext(evalResult.feedback);
        trials.push(nextTrial);
      }

      // Machine reads new adaptive params from generator
      const generator = context.generator;
      const hasGetNLevel = 'getNLevel' in generator && typeof generator.getNLevel === 'function';
      const newWindowDepth = hasGetNLevel
        ? (generator as { getNLevel(): number }).getNLevel() + 1
        : context.effectiveWindowDepth;
      const newLureProbability = generator.getLureProbability() ?? context.effectiveLureProbability;
      const newTargetProbability =
        generator.getTargetProbability() ?? context.effectiveTargetProbability;

      // Check if params changed
      const paramsChanged =
        newWindowDepth !== context.effectiveWindowDepth ||
        newLureProbability !== context.effectiveLureProbability ||
        newTargetProbability !== context.effectiveTargetProbability;

      // Emit params updated event if changed
      if (paramsChanged) {
        const changeReasons: string[] = [];
        if (newWindowDepth !== context.effectiveWindowDepth) {
          changeReasons.push(`windowDepth: ${context.effectiveWindowDepth} → ${newWindowDepth}`);
        }
        if (newLureProbability !== context.effectiveLureProbability) {
          changeReasons.push(
            `lureProbability: ${context.effectiveLureProbability.toFixed(2)} → ${newLureProbability.toFixed(2)}`,
          );
        }
        if (newTargetProbability !== context.effectiveTargetProbability) {
          changeReasons.push(
            `targetProbability: ${context.effectiveTargetProbability.toFixed(2)} → ${newTargetProbability.toFixed(2)}`,
          );
        }

        emitEvent(context, {
          type: 'RECALL_PARAMS_UPDATED',
          effectiveWindowDepth: newWindowDepth,
          effectiveLureProbability: newLureProbability,
          effectiveTargetProbability: newTargetProbability,
          decisionReason: changeReasons.join(', '),
          triggerWindowIndex: context.trialIndex,
        });
      }

      return {
        trials, // Return new array (immutable)
        trialIndex: context.trialIndex + 1,
        effectiveWindowDepth: newWindowDepth,
        effectiveLureProbability: newLureProbability,
        effectiveTargetProbability: newTargetProbability,
      };
    }),

    // =========================================================================
    // Feedback State
    // =========================================================================

    emitCorrectionShown: ({ context }) => {
      const trialIndex = context.trialIndex - 1; // Window just committed
      emitEvent(context, {
        type: 'RECALL_CORRECTION_SHOWN',
        trialIndex,
        feedbackDurationMs: context.spec.extensions.feedbackDurationMs,
      });
    },

    // =========================================================================
    // Session End
    // =========================================================================

    emitSessionEnded: ({ context }) => {
      emitEvent(context, {
        type: 'RECALL_SESSION_ENDED',
        userId: context.userId,
        reason: 'completed',
        totalTrials: context.trialIndex,
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
      });
    },

    emitSessionAbandoned: ({ context }) => {
      emitEvent(context, {
        type: 'RECALL_SESSION_ENDED',
        userId: context.userId,
        reason: 'abandoned',
        totalTrials: context.trialIndex + 1,
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
      });
    },

    computeFinalSummary: assign(({ context }) => {
      const summary = MemoSessionProjector.projectExtended(context.sessionEvents, context.trials);

      // Log to devLogger if available
      context.devLogger?.logSession({
        sessionId: context.sessionId,
        events: context.sessionEvents,
        summary,
      });

      // Save algorithm state using plugin (machine orchestrates async call)
      if (context.algorithmStatePort) {
        context.plugins.algorithmState
          .saveState(context.userId, context.generator, context.algorithmStatePort)
          .catch(() => {
            // Error already logged in plugin
          });
      }

      return { finalSummary: summary };
    }),

    stopAudio: ({ context }) => {
      context.audio.stopAll();
    },

    ensureEventsPersisted: async ({ context }) => {
      if (context.pendingPersistence.length > 0) {
        console.log(
          `[MemoSession] Waiting for ${context.pendingPersistence.length} pending persistence operations...`,
        );
        await Promise.all(context.pendingPersistence);
        context.pendingPersistence = [];
        console.log('[MemoSession] All events persisted');
      }
    },
  },

  guards: {
    hasMoreTrials: ({ context }) => {
      return context.trialIndex < context.generator.getTotalTrials();
    },

    isWindowComplete: ({ context }) => {
      const requiredDepth = getWindowDepthForTrial(
        context.trialIndex,
        context.effectiveWindowDepth,
      );
      return isWindowComplete(
        context.currentPicks,
        context.trialIndex,
        requiredDepth,
        context.spec.defaults.activeModalities,
      );
    },

    isFeedbackEnabled: ({ context }) => {
      return context.spec.extensions.feedbackMode === 'on-commit';
    },

    noMoreTrials: ({ context }) => {
      return context.trialIndex >= context.generator.getTotalTrials();
    },
  },

  actors: {
    // =========================================================================
    // Audio Initialization
    // =========================================================================

    initAudio: fromPromise(async ({ input }: { input: MemoSessionContext }) => {
      // Load algorithm state from previous sessions (meta-learning) via plugin
      if (input.algorithmStatePort) {
        await input.plugins.algorithmState.loadAndRestoreState(
          input.userId,
          input.generator,
          input.algorithmStatePort,
        );
      }

      // Initialize audio
      await input.audio.init();
    }),

    // =========================================================================
    // Stimulus Timer
    // =========================================================================

    stimulusTimer: fromPromise(async ({ input }: { input: StimulusTimerInput }) => {
      const { context, isAudioOnly } = input;
      const activeModalities = context.spec.defaults.activeModalities;

      const gameParams = context.generator.getGameParameters();
      // Spec has stimulusDurationMs directly
      const stimulusDurationMs =
        gameParams?.stimulusDuration !== undefined
          ? gameParams.stimulusDuration * 1000
          : context.spec.timing.stimulusDurationMs;

      return new Promise<void>((resolve) => {
        if (isAudioOnly) {
          // Audio-only mode: use audio.schedule with onEnded
          const trial = context.currentTrial;
          if (trial && activeModalities.includes('audio')) {
            context.audio.schedule(trial.sound, AUDIO_SYNC_BUFFER_MS, () => {}, {
              onEnded: () => {
                context.audio.scheduleCallback(AUDIO_END_BUFFER_MS, () => resolve());
              },
            });
          } else {
            context.audio.scheduleCallback(stimulusDurationMs + AUDIO_SYNC_BUFFER_MS, () =>
              resolve(),
            );
          }
        } else {
          // Normal mode: wait for stimulus duration
          context.audio.scheduleCallback(stimulusDurationMs + AUDIO_SYNC_BUFFER_MS, () =>
            resolve(),
          );
        }
      });
    }),

    // =========================================================================
    // Feedback Timer
    // =========================================================================

    feedbackTimer: fromPromise(async ({ input }: { input: FeedbackTimerInput }) => {
      const { context } = input;
      const feedbackDurationMs = context.spec.extensions.feedbackDurationMs;

      return new Promise<void>((resolve) => {
        context.audio.scheduleCallback(feedbackDurationMs, () => resolve());
      });
    }),
  },
}).createMachine({
  id: 'memoSession',
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
      entry: ['emitSessionStarted', 'setPhaseEnteredAt'],
      invoke: {
        id: 'initAudio',
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'stimulus',
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
    // STIMULUS - Display stimulus for duration
    // =========================================================================

    stimulus: {
      entry: [
        'setPhaseEnteredAt',
        'generateAndSetTrial',
        'emitStimulusShown',
        'setStimulusStartTime',
        'scheduleAudio',
      ],

      always: [
        {
          // No trial = session complete
          guard: ({ context }) => context.currentTrial === null,
          target: 'finished',
          actions: ['emitSessionEnded', 'computeFinalSummary'],
        },
      ],

      invoke: {
        id: 'stimulusTimer',
        src: 'stimulusTimer',
        input: ({ context }) => ({
          context,
          isAudioOnly:
            context.spec.defaults.activeModalities.length === 1 &&
            context.spec.defaults.activeModalities[0] === 'audio',
        }),
        onDone: {
          target: 'recall',
          actions: ['emitStimulusHidden'],
        },
        onError: {
          // Timer cancelled (stop)
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
    // RECALL - User fills memory window
    // =========================================================================

    recall: {
      entry: ['setPhaseEnteredAt', 'resetPicksAndGenerateFillOrder', 'emitWindowOpened'],

      on: {
        PICK: {
          actions: ['recordPick'],
        },

        COMMIT: [
          // With feedback enabled → feedback state
          {
            guard: ({ context }) => {
              const requiredDepth = getWindowDepthForTrial(
                context.trialIndex,
                context.effectiveWindowDepth,
              );
              const complete = isWindowComplete(
                context.currentPicks,
                context.trialIndex,
                requiredDepth,
                context.spec.defaults.activeModalities,
              );
              return complete && context.spec.extensions.feedbackMode === 'on-commit';
            },
            target: 'feedback',
            actions: ['emitWindowCommittedAndAdvance'],
          },
          // Without feedback → stimulus or finished
          {
            guard: ({ context }) => {
              const requiredDepth = getWindowDepthForTrial(
                context.trialIndex,
                context.effectiveWindowDepth,
              );
              const complete = isWindowComplete(
                context.currentPicks,
                context.trialIndex,
                requiredDepth,
                context.spec.defaults.activeModalities,
              );
              return complete && context.spec.extensions.feedbackMode !== 'on-commit';
            },
            target: 'stimulus',
            actions: ['emitWindowCommittedAndAdvance'],
          },
        ],

        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned'],
        },
      },
    },

    // =========================================================================
    // FEEDBACK - Show corrections
    // =========================================================================

    feedback: {
      entry: ['setPhaseEnteredAt', 'emitCorrectionShown'],

      invoke: {
        id: 'feedbackTimer',
        src: 'feedbackTimer',
        input: ({ context }) => ({ context }),
        onDone: [
          {
            guard: 'hasMoreTrials',
            target: 'stimulus',
          },
          {
            target: 'finished',
            actions: ['emitSessionEnded', 'computeFinalSummary'],
          },
        ],
        onError: {
          // Timer cancelled
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
    // FINISHED - Terminal state
    // =========================================================================

    finished: {
      type: 'final',
      entry: ['setPhaseEnteredAt', 'ensureEventsPersisted'],
    },
  },
});

// =============================================================================
// Snapshot Helper
// =============================================================================

export { buildSnapshot };
export type { MemoSessionSnapshot, MemoPhase };
