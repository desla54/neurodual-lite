/**
 * GameSession XState Machine
 *
 * Central state machine for game sessions.
 * Replaces the manual State Pattern implementation.
 *
 * TIMING ARCHITECTURE:
 * - Uses TimerPort (backed by AudioContext) for precise timing
 * - NO setTimeout/after delays in critical path (stimulus/waiting)
 * - Drift correction via RhythmController plugin
 * - Audio-visual sync via AudioVisualSyncPolicy plugin
 *
 * State diagram:
 *
 *   idle ──START──► starting ──AUDIO_READY──► active.stimulus
 *                                                 │    ▲
 *                                    STIMULUS_END─┘    │
 *                                                 ▼    │
 *   finished ◄──ALL_TRIALS_DONE── active.waiting ─┘
 *       ▲                              │
 *       │                              │
 *       └───────STOP───────────────────┼──────────────┐
 *                                      │              │
 *                                PAUSE─┼─────► paused─┘
 *                                      │         │
 *                                RESUME◄─────────┘
 */
import { setup, assign, fromPromise } from 'xstate';
import type { GameSessionContext, GameSessionInput, GameSessionEvent } from './types';
import { generateId, computeSessionHealthMetrics } from '../../domain';
import type { SessionHealthMetrics } from '../../engine/events';
import type { SessionPlayContext } from '../../engine/events';
import {
  APP_VERSION,
  TIMING_SESSION_PREP_MS,
  FLOW_CONFIDENCE_THRESHOLD,
  getTimeOfDayFromHour,
} from '../../specs/thresholds';
import { getLastMeasuredLag } from '../../timing';
import { getIsTarget } from '../../domain/modality';
import type { ModalityId, ResponseRecord, Trial } from '../../domain';
import type { GameEvent, SessionSummary } from '../../engine';
import { SessionProjector } from '../../engine';
import { calculateSessionXP } from '../../domain/progression/xp';
import type { ReportGameMode } from '../../types/session-report';
import type { UserResponseEvent } from '../../engine/events';
import type { ModalityFeedback, TrialFeedback, XPBreakdown } from '../../types';
import { nullXPContextPort, type XPExternalContext } from '../../ports';
import {
  computeBWArithmeticCorrectAnswer,
  parseBWArithmeticAnswer,
  rationalEquals,
} from '../../domain/modality/bw-arithmetic';

const SHOULD_LOG_SESSION_TIMING =
  typeof globalThis !== 'undefined' &&
  (globalThis as unknown as { __NEURODUAL_DEBUG_SESSION_TIMING__?: boolean })
    .__NEURODUAL_DEBUG_SESSION_TIMING__ === true;

const XP_CONTEXT_TIMEOUT_MS = 1500;

function countResponsesForTrial(events: readonly GameEvent[], trialIndex: number): number {
  let count = 0;
  for (const event of events) {
    if (event?.type === 'USER_RESPONDED' && event.trialIndex === trialIndex) {
      count += 1;
    }
  }
  return count;
}

function appendSessionEventInPlace(context: GameSessionContext, event: GameEvent): number {
  const nextIndex = context.sessionEvents.length;
  context.sessionEvents.push(event);
  return nextIndex;
}

function patchLastTrialPresentedInPlace(
  context: GameSessionContext,
  patch: Record<string, unknown>,
): void {
  const index = context.lastTrialPresentedIndex;
  if (index === null || index < 0 || index >= context.sessionEvents.length) {
    return;
  }

  const existing = context.sessionEvents[index];
  if (!existing || existing.type !== 'TRIAL_PRESENTED') {
    return;
  }

  context.sessionEvents[index] = { ...existing, ...patch } as GameEvent;
}

function requirePlayMode(value: unknown): SessionPlayContext {
  if (
    value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
  ) {
    return value;
  }
  throw new Error(`[GameSessionMachine] Missing playMode (got ${String(value ?? 'undefined')})`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// =============================================================================
// Recovery Helpers
// =============================================================================

/**
 * Convert UserResponseEvent[] to TrialFeedback[] for generator recovery.
 * Groups responses by trial index and determines correctness based on trial targets.
 */
function responsesToFeedbacks(
  responses: readonly UserResponseEvent[],
  trials: readonly Trial[],
  activeModalities: readonly string[],
): TrialFeedback[] {
  // Group responses by trial index
  const responsesByTrial = new Map<number, UserResponseEvent[]>();
  for (const response of responses) {
    const existing = responsesByTrial.get(response.trialIndex) ?? [];
    existing.push(response);
    responsesByTrial.set(response.trialIndex, existing);
  }

  const feedbacks: TrialFeedback[] = [];

  for (const trial of trials) {
    const trialResponses = responsesByTrial.get(trial.index) ?? [];
    const byModality: Partial<Record<ModalityId, ModalityFeedback>> = {};

    let isAnyTarget = false;
    let isGloballyCorrect = true;
    let minReactionTime: number | undefined;

    for (const modalityId of activeModalities) {
      const wasTarget = getIsTarget(trial, modalityId as ModalityId);
      const response = trialResponses.find((r) => r.modality === modalityId);
      const pressed = modalityId === 'arithmetic' ? (response?.isCorrect ?? false) : !!response;
      const isCorrect = modalityId === 'arithmetic' ? pressed : wasTarget === pressed;

      isAnyTarget = isAnyTarget || wasTarget;
      isGloballyCorrect = isGloballyCorrect && isCorrect;

      if (response?.reactionTimeMs !== undefined && modalityId !== 'arithmetic') {
        if (minReactionTime === undefined || response.reactionTimeMs < minReactionTime) {
          minReactionTime = response.reactionTimeMs;
        }
      }

      byModality[modalityId as ModalityId] = {
        wasTarget,
        isCorrect,
        reactionTime: response?.reactionTimeMs,
      };
    }

    feedbacks.push({
      isTarget: isAnyTarget,
      isCorrect: isGloballyCorrect,
      reactionTime: minReactionTime,
      byModality,
    });
  }

  return feedbacks;
}

// =============================================================================
// Initial Context Factory
// =============================================================================

function createInitialContext(input: GameSessionInput): GameSessionContext {
  // Spec-Driven: spec.timing is the SSOT
  const isi = input.spec.timing.intervalMs;
  const stimulusDuration = input.spec.timing.stimulusDurationMs;

  // Base context
  const baseContext: GameSessionContext = {
    ...input,
    currentTrial: null,
    trialIndex: 0,
    trialHistory: [],
    isi,
    stimulusDuration,
    stimulusStartTime: 0,
    sessionStartTime: 0,
    nextTrialTargetTime: 0,
    currentPhase: null,
    responses: new Map(),
    pendingKeys: new Map(),
    arithmeticInput: { chars: [], negative: false, decimal: false, lastInputMethod: null },
    pauseElapsedTime: 0,
    pauseStartedAtAudioTime: null,
    pausedInState: null,
    focusLostTime: null,
    finalSummary: null,
    sessionEvents: [],
    lastTrialPresentedIndex: null,
    currentTrialResponseCount: 0,
    xpBreakdown: null,
    declaredEnergyLevel: null,
    freezeCount: 0,
    longTaskCount: 0,
    healthMetrics: null,
    stimulusVisible: false,
    visualTriggerCallbackAtMs: null,
    visualHideCallbackAtMs: null,
    audioSyncCallbackAtMs: null,
    audioEndedCallbackAtMs: null,
  };

  // If recovering, restore state from recovered data
  if (input.recoveryState) {
    const { lastTrialIndex, trialHistory, startTimestamp, existingEvents } = input.recoveryState;

    return {
      ...baseContext,
      // Restore trial position - resume AT the interrupted trial (not +1)
      // If user already responded to this trial, the machine will handle it
      // STATE-4 fix: Ensure trialIndex is non-negative
      trialIndex: Math.max(0, lastTrialIndex),
      trialHistory: [...trialHistory],
      sessionStartTime: startTimestamp,
      // CRITICAL: Include existing events from SQLite for accurate session report
      // Without this, only post-recovery events would be counted in the final report
      sessionEvents: existingEvents ? [...existingEvents] : [],
      lastTrialPresentedIndex: existingEvents
        ? [...existingEvents].reduce<number | null>((found, event, index) => {
            return event?.type === 'TRIAL_PRESENTED' ? index : found;
          }, null)
        : null,
      currentTrialResponseCount: existingEvents
        ? countResponsesForTrial(existingEvents, Math.max(0, lastTrialIndex))
        : 0,
    };
  }

  return baseContext;
}

// =============================================================================
// Compute Final Results Types
// =============================================================================

interface ComputeFinalResultsInput {
  context: GameSessionContext;
}

interface ComputeFinalResultsOutput {
  summary: SessionSummary;
  xpBreakdown: XPBreakdown;
  healthMetrics: SessionHealthMetrics;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getDeviceInfo(ctx: GameSessionContext) {
  const info = ctx.platformInfoPort?.getPlatformInfo();

  return {
    platform: info?.platform ?? ('web' as const),
    screenWidth: info?.screenWidth ?? 0,
    screenHeight: info?.screenHeight ?? 0,
    userAgent: info?.userAgent ?? 'unknown',
    touchCapable: info?.touchCapable ?? false,
    volumeLevel: ctx.audio?.getVolumeLevel() ?? null,
    appVersion: APP_VERSION,
    eventLoopLagMs: getLastMeasuredLag(),
  };
}

function getSessionContextInfo() {
  const now = new Date();
  const hour = now.getHours();

  return {
    timeOfDay: getTimeOfDayFromHour(hour),
    localHour: hour,
    dayOfWeek: now.getDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// =============================================================================
// Timer Service Input Types
// =============================================================================

interface StimulusTimerInput {
  context: GameSessionContext;
  isResume: boolean;
  remainingMs?: number;
}

interface WaitingTimerInput {
  context: GameSessionContext;
  isResume: boolean;
  remainingMs?: number;
}

// =============================================================================
// Machine Definition
// =============================================================================

export const gameSessionMachine = setup({
  types: {
    context: {} as GameSessionContext,
    events: {} as GameSessionEvent,
    input: {} as GameSessionInput,
  },

  delays: {
    /**
     * Preparation delay before first trial (countdown: 3, 2, 1...).
     * Reads from spec.timing.prepDelayMs, falls back to TIMING_SESSION_PREP_MS.
     */
    PREP_DELAY: ({ context }) => context.spec.timing.prepDelayMs ?? TIMING_SESSION_PREP_MS,
  },

  actions: {
    // =========================================================================
    // Session Initialization
    // =========================================================================

    /**
     * Set audio preset from spec BEFORE audio init.
     * This ensures the AudioService loads the correct sound files.
     */
    setAudioPresetFromSpec: ({ context }) => {
      const audioPreset = context.spec.timing.audioPreset;
      if (audioPreset) {
        context.audio.setConfig({ audioPreset });
      }
    },

    // Utilise assign() pour garantir l'immutabilité du contexte XState
    // Le spread operator crée un nouveau tableau au lieu de muter l'existant
    emitSessionStarted: assign(({ context }) => {
      const event: GameEvent = {
        type: 'SESSION_STARTED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        userId: context.userId,
        nLevel: context.config.nLevel,
        device: getDeviceInfo(context),
        context: getSessionContextInfo(),
        // Build config inline from user config (for legacy event consumers)
        config: {
          nLevel: context.config.nLevel,
          activeModalities: [...context.config.activeModalities],
          trialsCount: context.config.trialsCount,
          targetProbability: context.config.targetProbability,
          lureProbability: context.config.lureProbability,
          intervalSeconds: context.config.intervalSeconds,
          stimulusDurationSeconds: context.config.stimulusDurationSeconds,
          generator: context.config.generator,
        },
        spec: context.spec,
        gameMode: context.spec.metadata.id as ReportGameMode,
        ...(context.spec.metadata.id === 'sim-brainworkshop' &&
        typeof context.initialStrikes === 'number'
          ? { currentStrikes: context.initialStrikes }
          : {}),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        journeyStartLevel: context.journeyStartLevel,
        journeyTargetLevel: context.journeyTargetLevel,
        journeyGameMode: context.journeyGameMode as ReportGameMode | undefined,
        journeyName: context.journeyName,
        journeyStrategyConfig: context.journeyStrategyConfig,
        playContext: requirePlayMode(context.playMode),
        trialsSeed: context.trialsSeed,
        trialsHash: `seed-${context.trialsSeed}`,
        feedbackConfig: context.feedbackConfig,
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, event);
      return {};
    }),

    /**
     * Emit SESSION_RESUMED when recovering an interrupted session.
     * This marks the recovery point in the event stream.
     * Immutable: nouveau tableau avec l'événement RESUMED ajouté
     */
    emitSessionResumed: assign(({ context }) => {
      const event: GameEvent = {
        type: 'SESSION_RESUMED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        timestamp: Date.now(),
        id: generateId(),
        trialIndex: context.trialIndex,
      };
      appendSessionEventInPlace(context, event);
      return {};
    }),

    /**
     * Advance generator to recovery position.
     * Replays feedbacks for adaptive generators to rebuild internal state.
     */
    advanceGeneratorForRecovery: ({ context }) => {
      if (!context.recoveryState) return;

      const { lastTrialIndex, trialHistory, responses } = context.recoveryState;
      const targetIndex = lastTrialIndex + 1;

      // Convert responses to feedbacks for adaptive generator
      const feedbacks = responsesToFeedbacks(
        responses,
        trialHistory,
        context.config.activeModalities,
      );

      // Advance generator to correct position
      context.generator.skipTo(targetIndex, trialHistory, feedbacks);
    },

    setSessionStartTime: assign(({ context }) => {
      const now = context.audio.getCurrentTime();
      return {
        sessionStartTime: now,
        // Note: nextTrialTargetTime is set by resetTrialTargetTime after audio init
        // to avoid stale targets if audio init takes a long time
      };
    }),

    /**
     * Reset nextTrialTargetTime to current time + ISI.
     * Called AFTER audio init to ensure the target isn't stale.
     *
     * BUG FIX: If audio init takes longer than ISI (e.g., preloading sounds),
     * the original target would be in the past, causing waitingTimer to
     * resolve immediately with duration=0, making the game run too fast.
     */
    resetTrialTargetTime: assign(({ context }) => {
      const now = context.audio.getCurrentTime();
      const newTarget = now + context.isi / 1000;
      if (SHOULD_LOG_SESSION_TIMING) {
        console.log('[XState] resetTrialTargetTime:', { now, isi: context.isi, newTarget });
      }
      return {
        nextTrialTargetTime: newTarget,
      };
    }),

    // =========================================================================
    // Trial Generation & Presentation
    // =========================================================================

    generateTrial: assign(({ context }) => {
      const trial = context.generator.generateNext();
      // generator.getISI() returns seconds, context.isi is in milliseconds
      const generatorIsiSeconds = context.generator.getISI?.();
      const isi =
        generatorIsiSeconds !== null && generatorIsiSeconds !== undefined
          ? generatorIsiSeconds * 1000 // Convert seconds to ms
          : context.isi;

      // Start trial tracking for drift correction
      context.timer.startTrial(context.trialIndex);

      return {
        currentTrial: trial,
        isi,
        responses: new Map<ModalityId, ResponseRecord>(),
        lastTrialPresentedIndex: null,
        currentTrialResponseCount: 0,
        // Reset A/V callback timestamps so they can't leak across trials.
        visualTriggerCallbackAtMs: null,
        visualHideCallbackAtMs: null,
        audioSyncCallbackAtMs: null,
        audioEndedCallbackAtMs: null,
        // BW: reset arithmetic typed-answer buffer at trial start
        arithmeticInput: { chars: [], negative: false, decimal: false, lastInputMethod: null },
      };
    }),

    // Événement TRIAL_PRESENTED avec spread immutable
    emitTrialPresented: assign(({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return {};

      const syncPolicy = context.plugins.audioVisualSync;
      const visualOffsetMs = syncPolicy.getVisualOffsetMs();
      const audioSyncBufferMs = syncPolicy.getAudioSyncBufferMs();
      const syncMode = syncPolicy.getSyncMode(trial);
      const scheduledStimulusStartAudioTimeSec =
        context.audio.getCurrentTime() + audioSyncBufferMs / 1000;
      const useAudioDrivenVisualSync = context.useAudioDrivenVisualSync;

      // Capture cursor position at stimulus time (for mouse RT analysis)
      const cursorPosition = context.cursorPositionPort?.getCurrentPosition() ?? undefined;

      const event: GameEvent = {
        type: 'TRIAL_PRESENTED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        trial,
        isiMs: context.isi,
        stimulusDurationMs: context.stimulusDuration,
        syncMode,
        audioSyncBufferMs,
        visualOffsetMs,
        useAudioDrivenVisualSync,
        scheduledStimulusStartAudioTimeSec,
        effectiveTargetProbability: context.generator.getTargetProbability() ?? undefined,
        effectiveLureProbability: context.generator.getLureProbability() ?? undefined,
        adaptiveZone: context.generator.getZoneNumber() ?? undefined,
        estimatedDPrime: context.statsCalculator.calculate().currentDPrime,
        // Mouse input tracking: cursor position at stimulus time
        cursorPosition,
        timestamp: Date.now(),
        id: generateId(),
      };
      const insertedIndex = appendSessionEventInPlace(context, event);
      return {
        sessionEvents: context.sessionEvents,
        lastTrialPresentedIndex: insertedIndex,
        currentTrialResponseCount: 0,
      };
    }),

    /**
     * Schedule audio with visual latency compensation via AudioVisualSyncPolicy plugin.
     * Plugin handles: sync mode detection, visual offset, multi-audio stagger config.
     * Machine orchestrates: actual audio scheduling calls.
     */
    scheduleAudioVisualSync: assign(({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return {};

      // Get config from AudioVisualSyncPolicy plugin
      const syncPolicy = context.plugins.audioVisualSync;
      const rhythm = context.plugins.rhythm;
      const visualOffsetMs = syncPolicy.getVisualOffsetMs();
      const postVisualOffsetMs = syncPolicy.getPostVisualOffsetMs();
      const audioSyncBufferMs = syncPolicy.getAudioSyncBufferMs();
      const syncMode = syncPolicy.getSyncMode(trial);
      const toneValue =
        context.config.activeModalities.includes('tones') && trial.tones ? trial.tones : null;
      const hasScheduledAudio = syncMode === 'multi-audio' || syncMode === 'single-audio';

      // Approximate timestamp for pause handling during buffer
      const approximateStartTime = context.audio.getCurrentTime() + audioSyncBufferMs / 1000;

      // Callbacks for visual pre-trigger and timestamp
      const triggerVisual = () => {
        // Call the callback to send VISUAL_TRIGGER event to the actor
        // This triggers setStimulusVisible action for precise audio-visual sync
        context.onVisualTrigger?.();
      };

      const triggerHideVisual = () => {
        context.onVisualHideTrigger?.();
      };

      // BETA: Audio-driven visual sync - hide visual when audio actually ends
      const onEnded =
        context.useAudioDrivenVisualSync && hasScheduledAudio
          ? () => {
              context.onAudioEnded?.();
            }
          : undefined;

      // Pre-hide at fixed stimulus duration (generalist A/V sync).
      // In self-paced modes, do not auto-hide: stimulus stays until the user advances.
      // In audio-driven mode, avoid double-hide paths (hide is driven by onEnded).
      const shouldAutoHide =
        !rhythm.isSelfPaced() && (!context.useAudioDrivenVisualSync || !hasScheduledAudio);
      const postDelayMs = shouldAutoHide ? rhythm.getStimulusDuration() : undefined;
      const onPostSync = shouldAutoHide ? triggerHideVisual : undefined;
      const showDelayMs = Math.max(0, audioSyncBufferMs - visualOffsetMs);
      const hideDelayMs = shouldAutoHide
        ? Math.max(0, audioSyncBufferMs + rhythm.getStimulusDuration() - postVisualOffsetMs)
        : undefined;

      const setTimestamp = () => {
        const firedAtMs = performance.now();
        patchLastTrialPresentedInPlace(context, {
          scheduledAudioSyncAtMs: firedAtMs,
          scheduledStimulusShownAtMs: firedAtMs - audioSyncBufferMs + showDelayMs,
          scheduledStimulusHiddenAtMs:
            hideDelayMs !== undefined ? firedAtMs - audioSyncBufferMs + hideDelayMs : undefined,
        });
        if (toneValue) {
          context.audio.playToneValue?.(toneValue);
        }
        context.onAudioSync?.();
        // This is handled by the stimulusTimer service completion
      };

      // Capture expected schedule timestamps for drift diagnostics (performance.now timebase).
      // This uses the moment scheduling is invoked as a reference (best effort).
      const scheduleCalledAtMs = performance.now();

      patchLastTrialPresentedInPlace(context, {
        audioScheduleCalledAtMs: scheduleCalledAtMs,
      });

      // Machine orchestrates audio scheduling based on sync mode
      if (syncMode === 'multi-audio' && trial.sound2) {
        context.audio.scheduleMultiple(
          [trial.sound, trial.sound2],
          audioSyncBufferMs,
          setTimestamp,
          {
            staggerMs: syncPolicy.getMultiAudioStaggerMs(),
            onPreSync: triggerVisual,
            visualOffsetMs,
            onPostSync,
            postDelayMs,
            postVisualOffsetMs,
            onEnded, // BETA: Audio-driven visual sync
          },
        );
      } else if (syncMode === 'single-audio') {
        context.audio.schedule(trial.sound, audioSyncBufferMs, setTimestamp, {
          onPreSync: triggerVisual,
          visualOffsetMs,
          onPostSync,
          postDelayMs,
          postVisualOffsetMs,
          onEnded, // BETA: Audio-driven visual sync
        });
      } else {
        // visual-only mode
        context.audio.scheduleCallback(showDelayMs, triggerVisual);
        if (shouldAutoHide) {
          context.audio.scheduleCallback(hideDelayMs ?? 0, triggerHideVisual);
        }
        context.audio.scheduleCallback(audioSyncBufferMs, setTimestamp);
      }

      // Brain Workshop arithmetic: operation cue is an audio instruction (no match button).
      // BW plays it only after the warmup buffer (trial_number > back).
      if (
        context.config.activeModalities.includes('arithmetic') &&
        trial.arithmeticOperation &&
        trial.index >= context.config.nLevel
      ) {
        context.audio.scheduleOperation?.(trial.arithmeticOperation, audioSyncBufferMs);
      }

      return {
        stimulusStartTime: approximateStartTime,
      };
    }),

    /**
     * Set precise stimulus start time (called when timer confirms stimulus started)
     */
    setPreciseStimulusStartTime: assign(({ context }) => ({
      stimulusStartTime: context.audio.getCurrentTime(),
    })),

    setPhaseStimulus: assign(() => ({
      currentPhase: 'stimulus' as const,
    })),

    // Audio-visual sync: triggered by audio callback
    setStimulusVisible: assign(({ context, event }) => {
      const firedAtMs = event.type === 'VISUAL_TRIGGER' ? (event.firedAtMs ?? null) : null;
      if (firedAtMs !== null) {
        patchLastTrialPresentedInPlace(context, {
          stimulusShownAtMs: firedAtMs,
        });
      }
      return {
        stimulusVisible: true,
        visualTriggerCallbackAtMs: firedAtMs,
      };
    }),

    // Audio-visual sync: triggered by audio clock to pre-hide stimulus (render latency compensation)
    setStimulusHidden: assign(({ context, event }) => {
      const firedAtMs = event.type === 'VISUAL_HIDE_TRIGGER' ? (event.firedAtMs ?? null) : null;
      if (firedAtMs !== null) {
        patchLastTrialPresentedInPlace(context, {
          stimulusHiddenAtMs: firedAtMs,
        });
      }
      return {
        stimulusVisible: false,
        visualHideCallbackAtMs: firedAtMs,
      };
    }),

    setAudioSyncCallbackAtMs: assign(({ context, event }) => {
      if (event.type !== 'AUDIO_SYNC') return {};
      const firedAtMs = event.firedAtMs ?? null;
      if (firedAtMs !== null) {
        patchLastTrialPresentedInPlace(context, {
          audioSyncAtMs: firedAtMs,
        });
      }
      return {
        audioSyncCallbackAtMs: firedAtMs,
      };
    }),

    setAudioEndedCallbackAtMs: assign(({ context, event }) => {
      if (event.type !== 'AUDIO_ENDED') return {};
      const firedAtMs = event.firedAtMs ?? null;
      if (firedAtMs !== null) {
        patchLastTrialPresentedInPlace(context, {
          audioEndedAtMs: firedAtMs,
        });
      }
      return {
        audioEndedCallbackAtMs: firedAtMs,
      };
    }),

    resetStimulusVisible: assign(() => ({
      stimulusVisible: false,
    })),

    setPhaseWaiting: assign(() => ({
      currentPhase: 'waiting' as const,
    })),

    // =========================================================================
    // Response Recording
    // =========================================================================

    /**
     * Record user response via ResponseProcessor plugin.
     * Plugin handles: duplicate detection, too-fast filtering, RT calculation.
     * Gestion conditionnelle du duplicateEvent de manière immutable
     */
    recordResponse: assign(({ context, event }) => {
      if (event.type !== 'RESPOND') return {};

      const { modalityId, inputMethod, capturedAtMs, telemetryId } = event;
      const now = context.audio.getCurrentTime();

      // Delegate to ResponseProcessor plugin (data in / data out)
      const result = context.plugins.response.processResponse(
        {
          modalityId,
          inputMethod: inputMethod ?? 'keyboard',
          stimulusStartTime: context.stimulusStartTime,
          currentAudioTime: now,
          sessionId: context.sessionId,
          trialIndex: context.currentTrial?.index ?? 0,
          currentPhase: context.currentPhase,
        },
        context.responses.get(modalityId),
        context.config.activeModalities,
      );

      // If duplicate, add event immutably and return early
      if (result.duplicateEvent) {
        appendSessionEventInPlace(context, result.duplicateEvent);
        return {};
      }

      if (result.filtered) {
        const processingLagMs =
          capturedAtMs !== undefined ? performance.now() - capturedAtMs : undefined;

        const responseFilteredEvent: GameEvent = {
          type: 'RESPONSE_FILTERED',
          schemaVersion: 1,
          sessionId: context.sessionId,
          trialIndex: context.currentTrial?.index ?? 0,
          modality: modalityId,
          reason: result.filtered.reason,
          reactionTimeMs: result.filtered.reactionTimeMs ?? null,
          inputMethod: inputMethod ?? 'keyboard',
          phase: context.currentPhase === 'waiting' ? 'waiting' : 'stimulus',
          telemetryId,
          capturedAtMs,
          processingLagMs,
          minValidRtMs: result.filtered.minValidRtMs,
          deltaSinceFirstMs: result.filtered.deltaSinceFirstMs,
          timestamp: Date.now(),
          id: generateId(),
        };

        appendSessionEventInPlace(context, responseFilteredEvent);
        return {};
      }

      if (!result.isValid || !result.updates) {
        return {};
      }

      // Valid response - update state
      const responses = new Map(context.responses);
      responses.set(modalityId, result.updates);

      const pendingKeys = new Map(context.pendingKeys);
      pendingKeys.set(modalityId, {
        keydownTime: now,
        // Safe: when isValid is true, rt is always a number (default 0 as fallback)
        rt: result.rt ?? 0,
        trialIndex: context.currentTrial?.index ?? 0,
        inputMethod,
        capturedAtMs,
        telemetryId,
      });

      return { responses, pendingKeys };
    }),

    // Enregistre la réponse utilisateur de manière immutable
    emitUserResponse: assign(({ context, event }) => {
      if (event.type !== 'RESPOND') return {};

      const { modalityId, inputMethod, capturedAtMs, telemetryId, buttonPosition } = event;
      const pending = context.pendingKeys.get(modalityId);
      if (!pending) {
        return {};
      }
      if (capturedAtMs !== undefined && pending.capturedAtMs !== capturedAtMs) {
        return {};
      }
      if (
        telemetryId !== undefined &&
        typeof pending.telemetryId === 'string' &&
        pending.telemetryId !== telemetryId
      ) {
        return {};
      }

      const response = context.responses.get(modalityId);
      if (!response?.pressed) return {}; // Was filtered (too fast)

      const responseAtAudioTimeSec = context.audio.getCurrentTime();

      // Calculate processing lag if early timestamp was captured
      // This measures React/XState pipeline delay
      const processingLagMs =
        capturedAtMs !== undefined ? performance.now() - capturedAtMs : undefined;
      const stimulusShownAtMs = context.visualTriggerCallbackAtMs ?? context.audioSyncCallbackAtMs;
      const stimulusHiddenAtMs = context.visualHideCallbackAtMs ?? context.audioEndedCallbackAtMs;

      // Determine if this response was correct (Hit vs False Alarm)
      // Map modalityId to the corresponding target flag on the trial
      const trial = context.currentTrial;
      const wasTarget = trial ? getIsTarget(trial, modalityId as ModalityId) : false;

      // Calculate responseIndexInTrial: count how many USER_RESPONDED events
      // already exist for this trial (0 = first response, 1 = second response)
      const currentTrialIndex = context.currentTrial?.index ?? 0;
      // Cap at 1 (only 0 or 1 are valid values for responseIndexInTrial)
      const responseIndexInTrial = (context.currentTrialResponseCount > 0 ? 1 : 0) as 0 | 1;

      const responseEvent: GameEvent = {
        type: 'USER_RESPONDED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        trialIndex: currentTrialIndex,
        modality: modalityId,
        reactionTimeMs: response.rt ?? 0,
        pressDurationMs: 0, // Updated on RELEASE
        responsePhase: context.currentPhase === 'waiting' ? 'after_stimulus' : 'during_stimulus',
        inputMethod: inputMethod ?? 'keyboard',
        telemetryId,
        capturedAtMs,
        processingLagMs,
        stimulusShownAtMs: stimulusShownAtMs ?? undefined,
        stimulusHiddenAtMs: stimulusHiddenAtMs ?? undefined,
        stimulusStartAudioTimeSec: context.stimulusStartTime,
        responseAtAudioTimeSec,
        stimulusVisibleAtResponse: context.stimulusVisible,
        wasTarget,
        isCorrect: wasTarget, // Hit = true, False Alarm = false
        // Mouse input tracking
        buttonPosition,
        responseIndexInTrial,
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, responseEvent);
      return {
        currentTrialResponseCount: context.currentTrialResponseCount + 1,
      };
    }),

    emitInputPipelineLatency: assign(({ context, event }) => {
      if (event.type !== 'REPORT_INPUT_PIPELINE_LATENCY') return {};

      const clampMs = (value: number): number => {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(60000, Math.round(value)));
      };

      const capturedAtMs = event.capturedAtMs;
      const dispatchCompletedAtMs = event.dispatchCompletedAtMs;
      const commitAtMs = event.commitAtMs;
      const paintAtMs = event.paintAtMs;

      if (
        !Number.isFinite(capturedAtMs) ||
        !Number.isFinite(commitAtMs) ||
        !Number.isFinite(paintAtMs)
      ) {
        return {};
      }

      const inputToDispatchMs =
        typeof dispatchCompletedAtMs === 'number' && Number.isFinite(dispatchCompletedAtMs)
          ? clampMs(dispatchCompletedAtMs - capturedAtMs)
          : undefined;
      const inputToCommitMs = clampMs(commitAtMs - capturedAtMs);
      const inputToPaintMs = clampMs(paintAtMs - capturedAtMs);

      const pipelineEvent: GameEvent = {
        type: 'INPUT_PIPELINE_LATENCY',
        schemaVersion: 1,
        sessionId: context.sessionId,
        trialIndex: event.trialIndex,
        modality: event.modalityId,
        inputMethod: event.inputMethod,
        phase: event.phase,
        telemetryId: event.telemetryId,
        capturedAtMs,
        dispatchCompletedAtMs,
        commitAtMs,
        paintAtMs,
        inputToDispatchMs,
        inputToCommitMs,
        inputToPaintMs,
        timestamp: Date.now(),
        id: generateId(),
      };

      appendSessionEventInPlace(context, pipelineEvent);
      return {};
    }),

    /**
     * Apply press duration (keydown->keyup) to the last USER_RESPONDED event.
     *
     * USER_RESPONDED is emitted on keydown for accurate RT; press duration only
     * becomes known on RELEASE.
     */
    applyPressDurationOnRelease: assign(({ context, event }) => {
      if (event.type !== 'RELEASE') return {};

      const modalityId = event.modalityId;
      if (!context.config.activeModalities.includes(modalityId)) return {};

      const pending = context.pendingKeys.get(modalityId);
      if (!pending) return {};

      const trialIndex = pending.trialIndex;
      const nextPendingKeys = new Map(context.pendingKeys);
      nextPendingKeys.delete(modalityId);

      // Find last USER_RESPONDED for this modality/trial and patch pressDurationMs.
      const events = context.sessionEvents;
      let idx = -1;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e?.type !== 'USER_RESPONDED') continue;
        if (e.modality !== modalityId) continue;
        if (e.trialIndex !== trialIndex) continue;
        idx = i;
        break;
      }

      if (idx < 0) {
        return { pendingKeys: nextPendingKeys };
      }

      const existing = events[idx];
      if (!existing || existing.type !== 'USER_RESPONDED') {
        return { pendingKeys: nextPendingKeys };
      }

      const pressDurationMs =
        typeof event.pressDurationMs === 'number' && Number.isFinite(event.pressDurationMs)
          ? Math.max(0, Math.round(event.pressDurationMs))
          : 0;

      context.sessionEvents[idx] = {
        ...existing,
        pressDurationMs,
      } as GameEvent;

      return {
        sessionEvents: context.sessionEvents,
        pendingKeys: nextPendingKeys,
      };
    }),

    /**
     * Brain Workshop arithmetic typed-answer buffer updates.
     * This is NOT a tempo "match" response, and should not generate USER_RESPONDED directly.
     * A synthetic USER_RESPONDED is emitted at trial end after answer evaluation.
     */
    updateArithmeticInput: assign(({ context, event }) => {
      if (event.type !== 'ARITHMETIC_INPUT') return {};
      if (!context.config.activeModalities.includes('arithmetic')) return {};

      const prev = context.arithmeticInput;
      const next = {
        chars: [...prev.chars],
        negative: prev.negative,
        decimal: prev.decimal,
        lastInputMethod: event.inputMethod ?? prev.lastInputMethod,
      };

      switch (event.key) {
        case 'reset':
          return {
            arithmeticInput: {
              chars: [],
              negative: false,
              decimal: false,
              lastInputMethod: next.lastInputMethod,
            },
          };
        case 'minus':
          return { arithmeticInput: { ...next, negative: !next.negative } };
        case 'decimal':
          if (!next.decimal) {
            next.decimal = true;
            next.chars.push('.');
          }
          return { arithmeticInput: next };
        case 'digit':
          if (event.digit === undefined) return {};
          next.chars.push(String(event.digit));
          return { arithmeticInput: next };
      }
    }),

    // =========================================================================
    // Trial End Processing
    // =========================================================================

    /**
     * Process end of trial via TrialEndProcessor plugin.
     * Plugin handles: judge evaluation, generator feedback, audio feedback decisions.
     * Machine orchestrates: stats recording, judge recording, audio playback.
     * Note: Uses assign() for immutable event emission, side effects remain in-place.
     */
    processTrialEnd: assign(({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return {};

      // BW arithmetic typed-answer evaluation (no dedicated match key).
      // We synthesize a response at trial end:
      // - pressed=true  => correct answer
      // - pressed=false => incorrect answer
      const responsesForScoring = new Map(context.responses);
      let arithmeticEvent: GameEvent | null = null;

      if (
        context.config.activeModalities.includes('arithmetic') &&
        !trial.isBuffer &&
        typeof trial.arithmeticNumber === 'number' &&
        trial.arithmeticOperation !== undefined
      ) {
        const effectiveBack = trial.effectiveNBack ?? context.config.nLevel;
        const nBackTrialIndex = trial.index - effectiveBack;
        const nBackTrial = context.trialHistory.find((t) => t.index === nBackTrialIndex);

        if (typeof nBackTrial?.arithmeticNumber === 'number') {
          const userAnswer = parseBWArithmeticAnswer(
            context.arithmeticInput.chars.join(''),
            context.arithmeticInput.negative,
          );
          const correctAnswer = computeBWArithmeticCorrectAnswer(
            trial.arithmeticOperation,
            nBackTrial.arithmeticNumber,
            trial.arithmeticNumber,
          );
          const isCorrect = rationalEquals(userAnswer, correctAnswer);

          // Feed the judge/stats with correctness as "pressed"
          responsesForScoring.set('arithmetic', { pressed: isCorrect, rt: null });

          // Emit a synthetic USER_RESPONDED for arithmetic so event-sourced projections stay correct.
          const alreadyEmitted = context.sessionEvents.some(
            (e) =>
              e.type === 'USER_RESPONDED' &&
              e.trialIndex === trial.index &&
              e.modality === 'arithmetic',
          );
          if (!alreadyEmitted) {
            const raw = context.arithmeticInput.chars.join('');
            const displayAnswer =
              raw === '' || raw === '.'
                ? '0'
                : `${context.arithmeticInput.negative ? '-' : ''}${raw}`;

            arithmeticEvent = {
              type: 'USER_RESPONDED',
              schemaVersion: 1,
              sessionId: context.sessionId,
              trialIndex: trial.index,
              modality: 'arithmetic',
              reactionTimeMs: 0,
              pressDurationMs: 0,
              responsePhase: 'after_stimulus',
              inputMethod: context.arithmeticInput.lastInputMethod ?? undefined,
              wasTarget: true,
              isCorrect,
              // BW: store typed answer for fidelity/debug.
              answerText: displayAnswer,
              timestamp: Date.now(),
              id: generateId(),
            };
          }
        }
      }

      // Record in stats calculator (machine responsibility)
      const trialResponse = {
        trialIndex: trial.index,
        responses: responsesForScoring,
        timestamp: new Date(),
      };
      context.statsCalculator.record(trial, trialResponse);

      // Delegate to TrialEndProcessor plugin (data in / data out)
      const result = context.plugins.trialEnd.processTrial(
        {
          trial,
          responses: responsesForScoring,
          activeModalities: context.config.activeModalities,
          passThreshold: context.spec.scoring.passThreshold,
          downThreshold: context.spec.scoring.downThreshold,
          scoringStrategy: context.spec.scoring.strategy as
            | 'sdt'
            | 'dualnback-classic'
            | 'brainworkshop'
            | 'accuracy',
        },
        context.judge,
      );

      // Machine orchestrates: record verdict in judge
      if (result.verdict && context.judge && !trial.isBuffer) {
        context.judge.record(result.verdict);
      }

      // Machine orchestrates: play feedback sounds
      for (const sound of result.feedbackSounds) {
        if (sound === 'correct') context.audio.playCorrect();
        else if (sound === 'incorrect') context.audio.playIncorrect();
      }

      // Machine orchestrates: send feedback to adaptive generator
      if (result.generatorFeedback && context.generator.isAdaptive()) {
        context.generator.processFeedback(result.generatorFeedback);
      }

      // Return immutable sessionEvents update if arithmetic event was created
      if (arithmeticEvent) {
        appendSessionEventInPlace(context, arithmeticEvent);
        return {};
      }
      return {};
    }),

    // =========================================================================
    // Trial Advancement & Drift Correction
    // =========================================================================

    /**
     * Advance to next trial via RhythmController plugin.
     * Plugin handles: drift correction for consistent BPM.
     */
    advanceTrial: assign(({ context }) => {
      const currentTime = context.audio.getCurrentTime();

      // Delegate drift correction to RhythmController plugin
      const nextTarget = context.plugins.rhythm.getNextTrialTarget(
        context.nextTrialTargetTime,
        currentTime,
        context.isi,
      );

      return {
        trialIndex: context.trialIndex + 1,
        trialHistory: context.currentTrial
          ? [...context.trialHistory, context.currentTrial]
          : context.trialHistory,
        nextTrialTargetTime: nextTarget,
      };
    }),

    // =========================================================================
    // Pause/Resume Handling
    // =========================================================================

    savePauseState: assign(({ context }) => {
      // Cancel any pending timer
      context.timer.cancel();
      const currentAudioTime = context.audio.getCurrentTime();

      return {
        pauseElapsedTime: (currentAudioTime - context.stimulusStartTime) * 1000,
        pauseStartedAtAudioTime: currentAudioTime,
        pausedInState: 'stimulus' as const,
      };
    }),

    savePauseStateWaiting: assign(({ context }) => {
      // Cancel any pending timer
      context.timer.cancel();
      const currentAudioTime = context.audio.getCurrentTime();

      return {
        pauseElapsedTime: (currentAudioTime - context.stimulusStartTime) * 1000,
        pauseStartedAtAudioTime: currentAudioTime,
        pausedInState: 'waiting' as const,
      };
    }),

    /**
     * Adjust timing after resume via RhythmController plugin.
     * Plugin handles: shifting targets forward to maintain rhythm.
     */
    adjustTimingAfterResume: assign(({ context }) => {
      const currentAudioTime = context.audio.getCurrentTime();
      const pauseDurationMs =
        context.pauseStartedAtAudioTime === null
          ? 0
          : Math.max(0, (currentAudioTime - context.pauseStartedAtAudioTime) * 1000);
      const adjustment = context.plugins.rhythm.adjustAfterResume(
        pauseDurationMs,
        context.pauseElapsedTime,
        context.nextTrialTargetTime,
        context.stimulusStartTime,
        currentAudioTime,
      );

      return {
        nextTrialTargetTime: adjustment.nextTrialTargetTime,
        stimulusStartTime: adjustment.stimulusStartTime,
        pauseStartedAtAudioTime: null,
      };
    }),

    // =========================================================================
    // Focus Tracking
    // =========================================================================

    recordFocusLost: assign(({ context }) => ({
      focusLostTime: context.audio.getCurrentTime(),
    })),

    // Trace la perte de focus pour analytics
    emitFocusLost: assign(({ context }) => {
      const event: GameEvent = {
        type: 'FOCUS_LOST',
        schemaVersion: 1,
        sessionId: context.sessionId,
        trialIndex: context.currentTrial?.index ?? null,
        phase: context.pausedInState ?? 'stimulus',
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, event);
      return {};
    }),

    // Trace le retour de focus
    emitFocusRegained: assign(({ context, event }) => {
      if (event.type !== 'FOCUS_REGAINED') return {};
      const focusEvent: GameEvent = {
        type: 'FOCUS_REGAINED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        trialIndex: context.currentTrial?.index ?? null,
        lostDurationMs: event.lostDurationMs,
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, focusEvent);
      return {};
    }),

    // =========================================================================
    // Session Health Tracking
    // =========================================================================

    /**
     * Record a health event (freeze or long task) from the UI.
     * These are used to compute session health metrics at session end.
     */
    recordHealthEvent: assign(({ context, event }) => {
      if (event.type !== 'HEALTH_EVENT') return {};
      if (event.eventKind === 'freeze') {
        return { freezeCount: context.freezeCount + 1 };
      }
      if (event.eventKind === 'longTask') {
        return { longTaskCount: context.longTaskCount + 1 };
      }
      return {};
    }),

    adjustTimingAfterFocusRegained: assign(({ context, event }) => {
      if (event.type !== 'FOCUS_REGAINED') return {};
      // STATE-3 fix: Ensure lostDurationMs is non-negative to prevent timing going backward
      const pauseDuration = Math.max(0, event.lostDurationMs) / 1000;
      return {
        nextTrialTargetTime: context.nextTrialTargetTime + pauseDuration,
      };
    }),

    // =========================================================================
    // Session End
    // =========================================================================

    // Finalise la session avec événement immutable
    emitSessionEnded: assign(({ context }) => {
      const event: GameEvent = {
        type: 'SESSION_ENDED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        userId: context.userId,
        reason: 'completed',
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
        // Include XP breakdown in event for persistence
        xpBreakdown: context.xpBreakdown ?? undefined,
        // Include health metrics for psychometric data quality assessment
        healthMetrics: context.healthMetrics ?? undefined,
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, event);
      return {};
    }),

    // Marque l'abandon de session
    emitSessionAbandoned: assign(({ context }) => {
      const event: GameEvent = {
        type: 'SESSION_ENDED',
        schemaVersion: 1,
        sessionId: context.sessionId,
        userId: context.userId,
        reason: 'abandoned',
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext: requirePlayMode(context.playMode),
        timestamp: Date.now(),
        id: generateId(),
      };
      appendSessionEventInPlace(context, event);
      return {};
    }),

    // =========================================================================
    // Cleanup
    // =========================================================================

    stopAudio: ({ context }) => {
      context.audio.stopAll();
    },

    cancelTimer: ({ context }) => {
      context.timer.cancel();
    },

    computeFinalSummary: assign(() => {
      // SessionSummary computed by SessionProjector from events
      return { finalSummary: null };
    }),

    /**
     * Store computed results (summary + XP + healthMetrics) in context.
     * Called when computeFinalResults actor completes.
     */
    storeComputedResults: assign({
      finalSummary: ({ event }) => {
        const output = (event as unknown as { output: ComputeFinalResultsOutput }).output;
        return output.summary;
      },
      xpBreakdown: ({ event }) => {
        const output = (event as unknown as { output: ComputeFinalResultsOutput }).output;
        return output.xpBreakdown;
      },
      healthMetrics: ({ event }) => {
        const output = (event as unknown as { output: ComputeFinalResultsOutput }).output;
        return output.healthMetrics;
      },
    }),
  },

  guards: {
    hasMoreTrials: ({ context }) => {
      // Delegate to generator which knows total trials (including warmup buffer)
      return context.generator.hasMore();
    },

    isValidModality: ({ context, event }) => {
      if (event.type !== 'RESPOND') return false;
      // BW arithmetic is NOT a "match" button modality; input is typed and evaluated at trial end.
      if (event.modalityId === 'arithmetic') return false;
      return context.config.activeModalities.includes(event.modalityId);
    },

    wasInStimulus: ({ context }) => {
      return context.pausedInState === 'stimulus';
    },

    wasInWaiting: ({ context }) => {
      return context.pausedInState === 'waiting';
    },

    isRecoveryMode: ({ context }) => {
      return context.recoveryState !== undefined;
    },

    // STATE-2 fix: Guard to ensure recoveryState exists before RECOVER
    hasRecoveryState: ({ context }) => {
      return context.recoveryState !== undefined;
    },

    /**
     * Check if self-paced mode via RhythmController plugin.
     */
    isSelfPaced: ({ context }) => {
      return context.plugins.rhythm.isSelfPaced();
    },

    isNotSelfPaced: ({ context }) => {
      return !context.plugins.rhythm.isSelfPaced();
    },
  },

  actors: {
    // =========================================================================
    // Audio Initialization
    // =========================================================================

    initAudio: fromPromise(async ({ input }: { input: GameSessionContext }) => {
      if (!input.audio.isReady()) {
        try {
          await input.audio.init();
        } catch (error) {
          console.warn('[GameSessionMachine] Audio init failed, continuing without audio', {
            sessionId: input.sessionId,
            gameMode: input.spec.metadata.id,
            error,
          });
        }
      }
    }),

    // =========================================================================
    // TimerPort-driven Stimulus Timer
    // =========================================================================

    /**
     * Wait for stimulus duration using TimerPort via RhythmController plugin.
     * Plugin handles: self-paced detection, duration calculation.
     */
    stimulusTimer: fromPromise(async ({ input }: { input: StimulusTimerInput }) => {
      const { context, isResume, remainingMs } = input;
      const rhythm = context.plugins.rhythm;

      let duration: number;
      if (isResume && remainingMs !== undefined) {
        // Resume: use remaining time
        duration = remainingMs;
      } else if (rhythm.isSelfPaced()) {
        // Self-paced mode: use long timeout (user advances with ADVANCE event)
        duration = rhythm.getSelfPacedMaxTimeout();
      } else {
        // Normal entry: full stimulus duration + sync buffer
        duration =
          rhythm.getStimulusDuration() + context.plugins.audioVisualSync.getAudioSyncBufferMs();
      }

      if (SHOULD_LOG_SESSION_TIMING) {
        console.log('[XState] stimulusTimer:', {
          duration,
          stimulusDuration: rhythm.getStimulusDuration(),
          isSelfPaced: rhythm.isSelfPaced(),
        });
      }

      const result = await context.timer.waitForStimulusEnd(duration);

      if (result.type === 'cancelled') {
        throw new Error('cancelled');
      }

      return result;
    }),

    // =========================================================================
    // TimerPort-driven Waiting Timer (with Drift Correction)
    // =========================================================================

    /**
     * Wait for response window via RhythmController plugin.
     * Plugin handles: drift correction for consistent BPM.
     */
    waitingTimer: fromPromise(async ({ input }: { input: WaitingTimerInput }) => {
      const { context, isResume, remainingMs } = input;
      const rhythm = context.plugins.rhythm;

      let duration: number;
      if (isResume && remainingMs !== undefined) {
        // Resume: use remaining time
        duration = remainingMs;
      } else {
        // DRIFT CORRECTION via plugin
        const targetTime = context.nextTrialTargetTime;
        const currentTime = context.audio.getCurrentTime();
        duration = rhythm.calculateWaitingDuration(targetTime, currentTime, context.isi);
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log('[XState] waitingTimer:', {
            targetTime,
            currentTime,
            duration,
            isi: context.isi,
          });
        }
      }

      const result = await context.timer.waitForResponseWindow(duration);

      if (result.type === 'cancelled') {
        throw new Error('cancelled');
      }

      return result;
    }),

    // =========================================================================
    // Compute Final Results (Summary + XP)
    // =========================================================================

    /**
     * Compute session summary and XP at session end.
     * This is the Single Source of Truth for end-of-session calculations.
     */
    computeFinalResults: fromPromise(
      async ({
        input,
      }: {
        input: ComputeFinalResultsInput;
      }): Promise<ComputeFinalResultsOutput> => {
        const { context } = input;
        const computeStart = performance.now();
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log('[XState computeFinalResults] started', {
            eventCount: context.sessionEvents.length,
          });
        }

        // 1. Project session summary from events using static method
        const projectStart = performance.now();
        const summary = SessionProjector.project(context.sessionEvents);
        const projectDuration = performance.now() - projectStart;
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log(
            `[XState computeFinalResults] SessionProjector.project took ${projectDuration.toFixed(0)}ms`,
          );
        }

        if (!summary) {
          throw new Error('Failed to project session summary');
        }

        // 2. Get XP context from port (streak, daily count, etc.)
        // IMPORTANT: This must never block the end-of-session transition.
        // SQLite adapters can be briefly locked by event persistence; bound the wait.
        const xpContextStart = performance.now();
        const xpPort = context.xpContextPort ?? nullXPContextPort;

        let externalContext: XPExternalContext;
        try {
          externalContext = await withTimeout(
            xpPort.getXPContext(context.userId, summary),
            XP_CONTEXT_TIMEOUT_MS,
            `[XState computeFinalResults] getXPContext timeout after ${XP_CONTEXT_TIMEOUT_MS}ms (session=${context.sessionId})`,
          );
        } catch (err) {
          // Fallback: compute XP without daily/streak bonuses.
          // We prefer under-awarding bonuses over blocking the UI/report transition.
          externalContext = {
            streakDays: 1,
            isFirstOfDay: false,
            sessionsToday: 0,
            newBadges: [],
          };

          const errorObj = err instanceof Error ? err : new Error(String(err));
          console.warn('[XState computeFinalResults] getXPContext failed, using fallback', {
            sessionId: context.sessionId,
            error: errorObj.message,
          });
        }

        const xpContextDuration = performance.now() - xpContextStart;
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log(
            `[XState computeFinalResults] getXPContext took ${xpContextDuration.toFixed(0)}ms`,
          );
        }

        // 3. Calculate XP using unified XP engine
        const xpCalcStart = performance.now();
        // Extract confidence score from tempoConfidence if available
        const confidenceScore = summary.tempoConfidence?.score ?? null;
        // Flow state is determined by high confidence (>flowThreshold%) and good performance
        const flowThreshold = context.spec.scoring.flowThreshold ?? FLOW_CONFIDENCE_THRESHOLD;
        const isInFlow = confidenceScore !== null && confidenceScore > flowThreshold;

        const xpBreakdown = calculateSessionXP({
          session: summary,
          newBadges: externalContext.newBadges,
          streakDays: externalContext.streakDays,
          isFirstOfDay: externalContext.isFirstOfDay,
          confidenceScore,
          isInFlow,
          sessionsToday: externalContext.sessionsToday,
        });
        const xpCalcDuration = performance.now() - xpCalcStart;
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log(
            `[XState computeFinalResults] calculateSessionXP took ${xpCalcDuration.toFixed(0)}ms`,
          );
        }

        // 4. Compute session health metrics for psychometric data quality
        const healthStart = performance.now();
        // Extract eventLoopLagAtStart from SESSION_STARTED event
        const sessionStartedEvent = context.sessionEvents.find((e) => e.type === 'SESSION_STARTED');
        const eventLoopLagAtStart =
          (sessionStartedEvent as { device?: { eventLoopLagMs?: number } } | undefined)?.device
            ?.eventLoopLagMs ?? 0;

        const healthMetrics = computeSessionHealthMetrics({
          sessionEvents: context.sessionEvents,
          eventLoopLagAtStart,
          freezeCount: context.freezeCount,
          longTaskCount: context.longTaskCount,
        });
        const healthDuration = performance.now() - healthStart;
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log(
            `[XState computeFinalResults] computeSessionHealthMetrics took ${healthDuration.toFixed(0)}ms`,
            { quality: healthMetrics.quality, score: healthMetrics.reliabilityScore },
          );
        }

        const totalDuration = performance.now() - computeStart;
        if (SHOULD_LOG_SESSION_TIMING) {
          console.log(`[XState computeFinalResults] completed in ${totalDuration.toFixed(0)}ms`);
        }

        return { summary, xpBreakdown, healthMetrics };
      },
    ),
  },
}).createMachine({
  id: 'gameSession',
  initial: 'idle',
  context: ({ input }) => createInitialContext(input),

  states: {
    // =========================================================================
    // IDLE - Waiting for START or RECOVER
    // =========================================================================

    idle: {
      on: {
        START: {
          target: 'starting',
        },
        // STATE-2 fix: Only allow RECOVER if recoveryState exists
        RECOVER: {
          target: 'recovering',
          guard: 'hasRecoveryState',
        },
      },
    },

    // =========================================================================
    // RECOVERING - Resume from interrupted session
    // =========================================================================

    recovering: {
      entry: ['setAudioPresetFromSpec', 'advanceGeneratorForRecovery', 'emitSessionResumed'],
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned'],
        },
      },
      invoke: {
        id: 'initAudioForRecovery',
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'active',
          actions: ['resetTrialTargetTime'],
        },
        onError: {
          target: 'finished',
          actions: ['emitSessionAbandoned'],
        },
      },
    },

    // =========================================================================
    // STARTING - Initialize audio, emit session started
    // =========================================================================

    starting: {
      entry: ['setAudioPresetFromSpec', 'emitSessionStarted', 'setSessionStartTime'],
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned'],
        },
      },
      invoke: {
        id: 'initAudio',
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'countdown',
        },
        onError: {
          target: 'finished',
          actions: ['emitSessionAbandoned'],
        },
      },
    },

    // =========================================================================
    // COUNTDOWN - Wait for prepDelayMs before first trial (3, 2, 1...)
    // =========================================================================

    countdown: {
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'emitSessionAbandoned'],
        },
      },
      after: {
        PREP_DELAY: {
          target: 'active',
          // Reset trial target time AFTER countdown completes
          // to prevent stale target if audio init + countdown took long
          actions: ['resetTrialTargetTime'],
        },
      },
    },

    // =========================================================================
    // ACTIVE - Main game loop (stimulus <-> waiting)
    // =========================================================================

    active: {
      initial: 'stimulus',

      on: {
        STOP: {
          target: 'finished',
          actions: ['cancelTimer', 'stopAudio', 'emitSessionAbandoned'],
        },
        REPORT_INPUT_PIPELINE_LATENCY: {
          actions: ['emitInputPipelineLatency'],
        },
        FOCUS_LOST: {
          target: 'paused',
          actions: [
            'savePauseState',
            'recordFocusLost',
            'emitFocusLost',
            'cancelTimer',
            'stopAudio',
          ],
        },
        // Track health events (freezes, long tasks) during active session
        HEALTH_EVENT: {
          actions: ['recordHealthEvent'],
        },
      },

      states: {
        // =====================================================================
        // STIMULUS - Display stimulus, wait for TimerPort
        // =====================================================================

        stimulus: {
          entry: [
            'setPhaseStimulus',
            'generateTrial',
            'emitTrialPresented',
            'scheduleAudioVisualSync',
          ],

          exit: ['resetStimulusVisible'],

          on: {
            AUDIO_SYNC: {
              actions: ['setAudioSyncCallbackAtMs'],
            },
            // Audio-visual sync: triggered by audio callback
            VISUAL_TRIGGER: {
              actions: ['setStimulusVisible'],
            },
            // Audio-visual sync: pre-hide stimulus from the audio clock
            VISUAL_HIDE_TRIGGER: {
              actions: ['setStimulusHidden'],
            },
            // BETA: Audio-driven visual sync - hide visual when audio playback ends
            AUDIO_ENDED: {
              actions: ['setAudioEndedCallbackAtMs', 'resetStimulusVisible'],
            },
            RESPOND: {
              guard: 'isValidModality',
              actions: ['recordResponse', 'emitUserResponse'],
            },
            RELEASE: {
              actions: ['applyPressDurationOnRelease'],
            },
            ARITHMETIC_INPUT: {
              actions: ['updateArithmeticInput'],
            },
            PAUSE: {
              target: '#gameSession.paused',
              actions: ['savePauseState', 'cancelTimer', 'stopAudio'],
            },
            // Self-paced mode: user advances manually
            ADVANCE: [
              {
                target: 'stimulus',
                reenter: true, // Force entry actions (generateTrial) to re-run
                guard: 'hasMoreTrials',
                actions: ['processTrialEnd', 'advanceTrial', 'cancelTimer'],
              },
              {
                target: '#gameSession.computing',
                actions: ['processTrialEnd', 'advanceTrial', 'cancelTimer'],
              },
            ],
          },

          // TimerPort-driven transition (NO setTimeout)
          invoke: {
            id: 'stimulusTimer',
            src: 'stimulusTimer',
            input: ({ context }) => ({
              context,
              isResume: false,
            }),
            onDone: {
              target: 'waiting',
              guard: 'isNotSelfPaced', // Only auto-transition if NOT self-paced
              actions: ['setPreciseStimulusStartTime'],
            },
            onError: {
              // Timer cancelled (pause/stop) - handled by explicit transitions
            },
          },
        },

        // =====================================================================
        // WAITING - Wait for response window, then advance or finish
        // =====================================================================

        waiting: {
          entry: ['setPhaseWaiting'],

          on: {
            RESPOND: {
              guard: 'isValidModality',
              actions: ['recordResponse', 'emitUserResponse'],
            },
            RELEASE: {
              actions: ['applyPressDurationOnRelease'],
            },
            ARITHMETIC_INPUT: {
              actions: ['updateArithmeticInput'],
            },
            PAUSE: {
              target: '#gameSession.paused',
              actions: ['savePauseStateWaiting', 'cancelTimer', 'stopAudio'],
            },
            // Self-paced mode: user advances manually (also allowed in waiting)
            ADVANCE: [
              {
                target: 'stimulus',
                reenter: true, // Force entry actions (generateTrial) to re-run
                guard: 'hasMoreTrials',
                actions: ['processTrialEnd', 'advanceTrial', 'cancelTimer'],
              },
              {
                target: '#gameSession.computing',
                actions: ['processTrialEnd', 'advanceTrial', 'cancelTimer'],
              },
            ],
          },

          // TimerPort-driven transition with drift correction
          invoke: {
            id: 'waitingTimer',
            src: 'waitingTimer',
            input: ({ context }) => ({
              context,
              isResume: false,
            }),
            onDone: [
              {
                target: 'stimulus',
                guard: 'hasMoreTrials',
                actions: ['processTrialEnd', 'advanceTrial'],
              },
              {
                // All trials done → compute results (summary + XP)
                target: '#gameSession.computing',
                actions: ['processTrialEnd', 'advanceTrial'],
              },
            ],
            onError: {
              // Timer cancelled (pause/stop) - handled by explicit transitions
            },
          },
        },

        // =====================================================================
        // STIMULUS RESUME - Resume stimulus with remaining time
        // =====================================================================

        stimulusResume: {
          entry: ['setPhaseStimulus'],
          on: {
            RESPOND: {
              guard: 'isValidModality',
              actions: ['recordResponse', 'emitUserResponse'],
            },
            RELEASE: {
              actions: ['applyPressDurationOnRelease'],
            },
            ARITHMETIC_INPUT: {
              actions: ['updateArithmeticInput'],
            },
            PAUSE: {
              target: '#gameSession.paused',
              actions: ['savePauseState', 'cancelTimer', 'stopAudio'],
            },
          },

          invoke: {
            id: 'stimulusTimerResume',
            src: 'stimulusTimer',
            input: ({ context }) => {
              // Calculate remaining time via plugins
              const totalDuration =
                context.plugins.rhythm.getStimulusDuration() +
                context.plugins.audioVisualSync.getAudioSyncBufferMs();
              const remaining = Math.max(0, totalDuration - context.pauseElapsedTime);
              return {
                context,
                isResume: true,
                remainingMs: remaining,
              };
            },
            onDone: {
              target: 'waiting',
              actions: ['setPreciseStimulusStartTime'],
            },
            onError: {
              // Timer cancelled
            },
          },
        },

        // =====================================================================
        // WAITING RESUME - Resume waiting with remaining time
        // =====================================================================

        waitingResume: {
          entry: ['setPhaseWaiting'],
          on: {
            RESPOND: {
              guard: 'isValidModality',
              actions: ['recordResponse', 'emitUserResponse'],
            },
            RELEASE: {
              actions: ['applyPressDurationOnRelease'],
            },
            ARITHMETIC_INPUT: {
              actions: ['updateArithmeticInput'],
            },
            PAUSE: {
              target: '#gameSession.paused',
              actions: ['savePauseStateWaiting', 'cancelTimer', 'stopAudio'],
            },
          },

          invoke: {
            id: 'waitingTimerResume',
            src: 'waitingTimer',
            input: ({ context }) => {
              // Calculate remaining time (ISI - elapsed)
              const remaining = Math.max(0, context.isi - context.pauseElapsedTime);
              return {
                context,
                isResume: true,
                remainingMs: remaining,
              };
            },
            onDone: [
              {
                target: 'stimulus',
                guard: 'hasMoreTrials',
                actions: ['processTrialEnd', 'advanceTrial'],
              },
              {
                // All trials done → compute results (summary + XP)
                target: '#gameSession.computing',
                actions: ['processTrialEnd', 'advanceTrial'],
              },
            ],
            onError: {
              // Timer cancelled
            },
          },
        },

        // History pseudo-state for resume
        hist: {
          type: 'history',
          history: 'shallow',
        },
      },
    },

    // =========================================================================
    // PAUSED - Session paused (manual or focus lost)
    // =========================================================================

    paused: {
      on: {
        RESUME: {
          target: 'resuming',
          actions: ['adjustTimingAfterResume'],
        },
        FOCUS_REGAINED: {
          target: 'resuming',
          actions: ['emitFocusRegained', 'adjustTimingAfterFocusRegained'],
        },
        STOP: {
          target: 'finished',
          actions: ['emitSessionAbandoned'],
        },
      },
    },

    // =========================================================================
    // RESUMING - Intermediate state to restart timers with remaining time
    // =========================================================================

    resuming: {
      always: [
        {
          target: 'active.stimulusResume',
          guard: 'wasInStimulus',
        },
        {
          target: 'active.waitingResume',
          guard: 'wasInWaiting',
        },
        {
          target: 'active.hist',
        },
      ],
    },

    // =========================================================================
    // COMPUTING - Compute final results (summary + XP) before finishing
    // =========================================================================

    computing: {
      entry: ['cancelTimer', 'stopAudio'],
      invoke: {
        id: 'computeFinalResults',
        src: 'computeFinalResults',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'finished',
          actions: ['storeComputedResults', 'emitSessionEnded'],
        },
        onError: {
          // If computation fails, still finish but with null results
          target: 'finished',
          actions: ['emitSessionEnded'],
        },
      },
    },

    // =========================================================================
    // FINISHED - Session complete or abandoned (final state)
    // =========================================================================

    finished: {
      type: 'final',
    },
  },
});

export type GameSessionMachine = typeof gameSessionMachine;
