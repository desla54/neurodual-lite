/**
 * TraceSession XState Machine
 *
 * State machine for Dual Trace mode using XState v5.
 * Replaces the manual State Pattern implementation in trace-states/.
 *
 * Key features:
 * - Two rhythm modes: self-paced (no timeout) and timed (with drift correction)
 * - Writing phase for handwriting recognition (optional)
 * - Dynamic rules: per-trial modality selection
 * - Pause/resume with accurate timing preservation
 * - Event sourcing: all state changes emit GameEvents
 *
 * ALL timing values are read from context.spec - NEVER hardcoded.
 */

import { setup, assign, fromPromise, raise, type ActorRefFrom } from 'xstate';
import type {
  TraceSessionContext,
  TraceSessionInput,
  TraceSessionEvent,
  TracePhase,
  TimerActorInput,
  ResponseTimerInput,
} from './trace-session-types';
import {
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedWritingSound,
  getExpectedWritingColor,
  getExpectedImage,
  getExpectedDigit,
  getExpectedEmotion,
  getExpectedWord,
  getExpectedTone,
  getExpectedSpatialDirection,
  getTrialCycleDuration,
  getEnabledModalities,
} from './trace-session-types';
import {
  createEmptyTraceStats,
  createEmptyAllModalityStats,
  getGridDimensions,
  getMirrorPosition,
  validateTraceActionDuration,
  type TraceResponse,
  type TraceRunningStats,
  type TraceSessionSummary,
  type TraceWritingResult,
  type MirrorAxis,
  type SwipeDirection,
} from '../../types/trace';
import type {
  TraceSessionStartedEvent,
  TraceStimulusShownEvent,
  TraceStimulusHiddenEvent,
  TraceResponseEvent,
  TraceTimeoutEvent,
  TraceWritingStartedEvent,
  TraceWritingTimeoutEvent,
  TraceWritingCompletedEvent,
  TraceArithmeticStartedEvent,
  TraceArithmeticCompletedEvent,
  TraceArithmeticTimeoutEvent,
  TraceSessionEndedEvent,
  TracePausedEvent,
  TraceResumedEvent,
  DeviceInfo,
  TemporalContext,
} from '../../engine/events';
import {
  APP_VERSION,
  AUDIO_SYNC_BUFFER_MS as _AUDIO_SYNC_BUFFER_MS,
  getTimeOfDayFromHour,
  TIMING_SESSION_PREP_MS,
  TRACE_EXTINCTION_MAX_MS,
  TRACE_EXTINCTION_MIN_MS,
  TRACE_EXTINCTION_RATIO,
} from '../../specs/thresholds';
import { ModeSpecSchema } from '../../specs/validation';
import type { ReportGameMode } from '../../types/session-report';
import { createEventEnvelope } from '../session-event-utils';

function persistEvent(
  context: { sessionId: string; commandBus?: unknown },
  event: Record<string, unknown>,
): void {
  const bus = context.commandBus as
    | {
        handle: (cmd: {
          readonly type: string;
          readonly data: Record<string, unknown>;
          readonly metadata: {
            readonly commandId: string;
            readonly timestamp: Date;
            readonly correlationId?: string;
          };
        }) => Promise<unknown>;
      }
    | undefined;

  const id = String(event['id'] ?? '');
  if (bus && id.length > 0) {
    const type = String(event['type'] ?? '');
    const commandType = type.endsWith('_STARTED')
      ? 'SESSION/START'
      : type.endsWith('_ENDED')
        ? 'SESSION/END'
        : type.startsWith('TRACE_')
          ? 'SESSION/RECORD_TRIAL'
          : 'SESSION/RECORD_TELEMETRY';
    const commandId = type.endsWith('_ENDED')
      ? `end:${context.sessionId}`
      : type.endsWith('_STARTED')
        ? `start:${context.sessionId}`
        : `evt:${id}`;

    void bus.handle({
      type: commandType,
      data: {
        sessionId: context.sessionId,
        event,
      },
      metadata: {
        commandId,
        timestamp: new Date(),
      },
    });
  }
  // Si commandBus n'est pas fourni, on ne fait pas d'erreur (utile pour les tests)
}

// =============================================================================
// Constants (structural, not timing - timing comes from spec)
// =============================================================================

/** Buffer for audio scheduling to ensure sync @see thresholds.ts (SSOT) */
const AUDIO_SYNC_BUFFER_MS = _AUDIO_SYNC_BUFFER_MS;

function requirePlayMode(value: unknown): 'journey' | 'free' {
  if (value === 'journey' || value === 'free') return value;
  throw new Error(`[TraceSessionMachine] Missing playMode (got ${String(value ?? 'undefined')})`);
}

// =============================================================================
// Helper Functions (pure, used by actions)
// =============================================================================

// createEventEnvelope imported from session-event-utils (replaces createTraceBaseEvent + global eventSeq)

/**
 * Get device info for event emission.
 * @param audio - AudioPort to get volume level (optional)
 */
function getDeviceInfo(context: TraceSessionContext): DeviceInfo {
  const info = context.platformInfoPort?.getPlatformInfo();
  return {
    platform: info?.platform ?? 'web',
    screenWidth: info?.screenWidth ?? 0,
    screenHeight: info?.screenHeight ?? 0,
    userAgent: info?.userAgent ?? 'unknown',
    touchCapable: info?.touchCapable ?? false,
    volumeLevel: context.audio.getVolumeLevel() ?? null,
    appVersion: APP_VERSION,
  };
}

/**
 * Get temporal context for event emission.
 */
function getTemporalContext(): TemporalContext {
  const now = new Date();
  const hour = now.getHours();

  return {
    timeOfDay: getTimeOfDayFromHour(hour),
    localHour: hour,
    dayOfWeek: now.getDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// needsWritingPhase moved to WritingOrchestrator plugin

/**
 * Calculate remaining time for a phase during resume.
 */
function calculateRemainingTime(
  fullDuration: number,
  _phaseStartTime: number,
  pauseElapsedTime: number,
): number {
  return Math.max(0, fullDuration - pauseElapsedTime);
}

/**
 * Calculate extinction duration from stimulus duration.
 * Extinction happens at 65% of stimulus duration, clamped between 200ms and 1500ms.
 */
function calculateExtinctionDuration(stimulusDurationMs: number): number {
  return Math.max(
    TRACE_EXTINCTION_MIN_MS,
    Math.min(TRACE_EXTINCTION_MAX_MS, stimulusDurationMs * TRACE_EXTINCTION_RATIO),
  );
}

function getSequentialExpectedGesturePositions(
  context: TraceSessionContext,
  expectedFromRaw: number,
  expectedToRaw: number,
): { expectedFrom: number; expectedTo: number } {
  const dyslat = context.spec.extensions.dyslatéralisation;
  const mirrorSwipe = dyslat?.mirrorSwipe ?? false;
  if (!mirrorSwipe) return { expectedFrom: expectedFromRaw, expectedTo: expectedToRaw };

  const gridMode = dyslat?.gridMode ?? '3x3';
  const { cols, rows } = getGridDimensions(gridMode);
  const mirrorAxisSetting = dyslat?.mirrorAxis ?? 'horizontal';
  const axis: MirrorAxis =
    mirrorAxisSetting === 'dynamic'
      ? (context.currentTrial?.mirrorAxis ?? 'horizontal')
      : (mirrorAxisSetting as MirrorAxis);

  return {
    expectedFrom: getMirrorPosition(expectedFromRaw, cols, rows, axis),
    expectedTo: getMirrorPosition(expectedToRaw, cols, rows, axis),
  };
}

function getSequentialRawStepPositions(
  context: TraceSessionContext,
  stepIndex: number,
): {
  expectedFromPosition: number;
  expectedToPosition: number;
} {
  const trialIndex = context.trialIndex;
  const nLevel = context.spec.defaults.nLevel;
  const swipeDirection: SwipeDirection = context.currentTrial?.swipeDirection ?? 'n-to-target';

  const { fromTrialIndex, toTrialIndex } =
    swipeDirection === 'target-to-n'
      ? {
          fromTrialIndex: trialIndex - nLevel + stepIndex,
          toTrialIndex: trialIndex - nLevel + stepIndex + 1,
        }
      : { fromTrialIndex: trialIndex - stepIndex, toTrialIndex: trialIndex - stepIndex - 1 };

  return {
    expectedFromPosition: context.trials[fromTrialIndex]?.position ?? -1,
    expectedToPosition: context.trials[toTrialIndex]?.position ?? -1,
  };
}

function applyMindfulWritingValidation(context: TraceSessionContext, result: TraceWritingResult) {
  const mindfulTiming = context.spec.extensions.mindfulTiming;
  if (!mindfulTiming?.enabled) {
    return {
      ...result,
      timingTargetMs: null,
      timingToleranceMs: null,
      timingAccepted: null,
    };
  }

  const timing = validateTraceActionDuration(
    result.writingTimeMs,
    mindfulTiming.writingDurationMs,
    mindfulTiming.writingToleranceMs,
  );

  return {
    ...result,
    isCorrect: result.isCorrect && timing.accepted,
    colorCorrect: result.colorCorrect === null ? null : result.colorCorrect && timing.accepted,
    timingTargetMs: mindfulTiming.writingDurationMs,
    timingToleranceMs: mindfulTiming.writingToleranceMs,
    timingAccepted: timing.accepted,
  };
}

/**
 * Update running stats with a response.
 */
function updateStats(
  stats: TraceRunningStats,
  isCorrect: boolean,
  isTimeout: boolean,
  isWarmup: boolean,
): TraceRunningStats {
  if (isWarmup) {
    return {
      ...stats,
      warmupTrials: stats.warmupTrials + 1,
    };
  }

  const newTrialsCompleted = stats.trialsCompleted + 1;
  const newCorrect = isCorrect ? stats.correctResponses + 1 : stats.correctResponses;
  const newIncorrect =
    !isCorrect && !isTimeout ? stats.incorrectResponses + 1 : stats.incorrectResponses;
  const newTimeouts = isTimeout ? stats.timeouts + 1 : stats.timeouts;

  return {
    ...stats,
    trialsCompleted: newTrialsCompleted,
    correctResponses: newCorrect,
    incorrectResponses: newIncorrect,
    timeouts: newTimeouts,
    accuracy: newTrialsCompleted > 0 ? newCorrect / newTrialsCompleted : 0,
  };
}

// =============================================================================
// Machine Definition
// =============================================================================

export const traceSessionMachine = setup({
  types: {
    context: {} as TraceSessionContext,
    events: {} as TraceSessionEvent,
    input: {} as TraceSessionInput,
  },

  // ===========================================================================
  // Guards
  // ===========================================================================
  guards: {
    hasMoreTrials: ({ context }) => context.trialIndex < context.trials.length - 1,

    isWarmup: ({ context }) => isWarmupTrial(context),

    isTimed: ({ context }) => context.plugins.rhythm.isTimed(),

    isSelfPaced: ({ context }) => context.plugins.rhythm.isSelfPaced(),

    needsWritingPhase: ({ context }) =>
      context.plugins.writing.needsWritingPhase(
        context.trialIndex,
        isWarmupTrial(context),
        context.currentTrial?.activeModalities,
      ),

    needsArithmeticPhase: ({ context }) =>
      context.plugins.arithmetic.needsArithmeticPhase(context.trialIndex, isWarmupTrial(context)),

    hasResponded: ({ context }) => context.hasResponded,

    canRespond: ({ context }) => !context.hasResponded,

    // Pause restoration guards
    wasInStimulus: ({ context }) => context.pausedInPhase === 'stimulus',
    wasInArithmetic: ({ context }) => context.pausedInPhase === 'arithmetic',
    wasInResponse: ({ context }) => context.pausedInPhase === 'response',
    wasInWriting: ({ context }) => context.pausedInPhase === 'writing',
    wasInPositionFeedback: ({ context }) => context.pausedInPhase === 'positionFeedback',
    wasInWritingFeedback: ({ context }) => context.pausedInPhase === 'writingFeedback',
    wasInWaiting: ({ context }) => context.pausedInPhase === 'waiting',
    wasInPreStimGap: ({ context }) => context.pausedInPhase === 'preStimGap',

    // Sequential trace guards (only fire when sequentialTrace + self-paced + non-warmup)
    isSequentialIntermediateStep: ({ context }) =>
      Boolean(context.spec.extensions.sequentialTrace) &&
      !context.plugins.rhythm.isTimed() &&
      !isWarmupTrial(context) &&
      context.sequentialStepIndex < context.spec.defaults.nLevel - 1,

    isSequentialLastStep: ({ context }) =>
      Boolean(context.spec.extensions.sequentialTrace) &&
      !context.plugins.rhythm.isTimed() &&
      !isWarmupTrial(context) &&
      context.sequentialStepIndex === context.spec.defaults.nLevel - 1,

    isSequentialWritingIntermediateStep: ({ context }) =>
      Boolean(context.spec.extensions.sequentialTrace) &&
      !context.plugins.rhythm.isTimed() &&
      !isWarmupTrial(context) &&
      context.writingStepIndex < context.spec.defaults.nLevel - 1,
  },

  // ===========================================================================
  // Actions
  // ===========================================================================
  actions: {
    // --- Initialization ---
    setSessionStartTime: assign(({ context }) => ({
      sessionStartTime: context.clock.now(),
    })),

    setAbsoluteStartTime: assign(({ context }) => {
      const now = context.audio.getCurrentTime();
      return {
        absoluteSessionStartTime: now,
        nextTrialTargetTime: now + getTrialCycleDuration(context.spec) / 1000,
      };
    }),

    // --- Trial Management ---
    setCurrentTrial: assign(({ context }) => ({
      currentTrial: context.trials[context.trialIndex] ?? null,
      hasResponded: false,
      writingResult: null,
      feedbackPosition: null,
      feedbackType: null,
      feedbackFromUserAction: false,
      positionFeedbackDurationMs: 0,
      writingFeedbackDurationMs: 0,
      sequentialStepIndex: 0,
      sequentialStepResults: [],
    })),

    setFeedbackDurationsAfterResponse: assign(({ context }) => {
      const full = context.plugins.rhythm.getFeedbackDurationMs();
      const needsWriting = context.plugins.writing.needsWritingPhase(
        context.trialIndex,
        isWarmupTrial(context),
        context.currentTrial?.activeModalities,
      );

      if (!needsWriting) {
        return {
          positionFeedbackDurationMs: full,
          writingFeedbackDurationMs: 0,
        };
      }

      const positionMs = Math.max(1, Math.floor(full * 0.35));
      const writingMs = Math.max(1, full - positionMs);
      return {
        positionFeedbackDurationMs: positionMs,
        writingFeedbackDurationMs: writingMs,
      };
    }),

    advanceTrial: assign(({ context }) => ({
      trialIndex: context.trialIndex + 1,
    })),

    advanceTrialTargetTime: assign(({ context }) => ({
      nextTrialTargetTime: context.nextTrialTargetTime + getTrialCycleDuration(context.spec) / 1000,
    })),

    // --- Phase Timing ---
    setPhaseStartTime: assign(({ context }) => ({
      phaseStartTime: context.clock.now(),
    })),

    setResponseStartTime: assign(({ context }) => ({
      responseStartTime: context.clock.now(),
    })),

    // --- Response Recording ---
    recordSwipe: assign(({ context, event }) => {
      if (event.type !== 'SWIPE' || !context.currentTrial) return {};

      // Normalize inputMethod: 'keyboard' treated as undefined (no specific method)
      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      // Plugin: data in / data out
      const { response, updates } = context.plugins.response.processSwipe(
        {
          fromPosition: event.fromPosition,
          toPosition: event.toPosition,
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        context.trialIndex,
        context.trials,
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: true,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, response.isCorrect, false, response.isWarmup),
      };
    }),

    // Records one intermediate sequential swipe step (does NOT set hasResponded)
    recordSequentialSwipeStep: assign(({ context, event }) => {
      if (event.type !== 'SWIPE' || !context.currentTrial) return {};

      const k = context.sequentialStepIndex;

      // Step k validates BOTH endpoints so the user must truly sweep through the chain.
      // Direction can be flipped via swipeDirection (n-to-target vs target-to-n).
      const { expectedFromPosition, expectedToPosition } = getSequentialRawStepPositions(
        context,
        k,
      );
      const { expectedFrom, expectedTo } = getSequentialExpectedGesturePositions(
        context,
        expectedFromPosition,
        expectedToPosition,
      );

      const fromCorrect = expectedFromPosition >= 0 && event.fromPosition === expectedFrom;
      const toCorrect = expectedToPosition >= 0 && event.toPosition === expectedTo;
      const isCorrect = fromCorrect && toCorrect;

      const newResult = {
        fromPosition: event.fromPosition,
        toPosition: event.toPosition,
        expectedFromPosition,
        expectedToPosition,
        expectedFromGesture: expectedFrom,
        expectedToGesture: expectedTo,
        fromCorrect,
        toCorrect,
        isCorrect,
      };

      return {
        sequentialStepResults: [...context.sequentialStepResults, newResult],
        sequentialStepIndex: context.sequentialStepIndex + 1,
      };
    }),

    // Records the final sequential swipe step and builds the full TraceResponse
    recordFinalSequentialSwipe: assign(({ context, event }) => {
      if (event.type !== 'SWIPE' || !context.currentTrial) return {};

      const k = context.sequentialStepIndex;
      const nLevel = context.spec.defaults.nLevel;
      const trialIndex = context.trialIndex;

      const { expectedFromPosition, expectedToPosition } = getSequentialRawStepPositions(
        context,
        k,
      );
      const { expectedFrom, expectedTo } = getSequentialExpectedGesturePositions(
        context,
        expectedFromPosition,
        expectedToPosition,
      );

      const fromCorrect = expectedFromPosition >= 0 && event.fromPosition === expectedFrom;
      const toCorrect = expectedToPosition >= 0 && event.toPosition === expectedTo;
      const isCorrect = fromCorrect && toCorrect;

      const finalResult = {
        fromPosition: event.fromPosition,
        toPosition: event.toPosition,
        expectedFromPosition,
        expectedToPosition,
        expectedFromGesture: expectedFrom,
        expectedToGesture: expectedTo,
        fromCorrect,
        toCorrect,
        isCorrect,
      };

      const allResults = [...context.sequentialStepResults, finalResult];
      const allCorrect = allResults.every((s) => s.isCorrect);

      // Feedback position = final target T-N
      const feedbackPosition = context.trials[trialIndex - nLevel]?.position ?? null;

      // Normalize inputMethod
      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      // Build TraceResponse based on the last swipe, then override correctness
      const { response } = context.plugins.response.processSwipe(
        {
          fromPosition: event.fromPosition,
          toPosition: event.toPosition,
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        trialIndex,
        context.trials,
      );

      const finalResponse: TraceResponse = {
        ...response,
        // Override position/correctness to reflect sequential logic
        position: feedbackPosition ?? response.position,
        expectedPosition:
          context.trials[trialIndex - nLevel]?.position ?? response.expectedPosition,
        isCorrect: allCorrect,
      };

      return {
        hasResponded: true,
        feedbackPosition,
        feedbackType: allCorrect ? ('correct' as const) : ('incorrect' as const),
        feedbackFromUserAction: true,
        responses: [...context.responses, finalResponse],
        stats: updateStats(context.stats, allCorrect, false, response.isWarmup),
        sequentialStepResults: allResults,
        sequentialStepIndex: context.sequentialStepIndex + 1,
      };
    }),

    // Records one intermediate sequential double-tap step (same-cell, does NOT set hasResponded)
    recordSequentialDoubleTapStep: assign(({ context, event }) => {
      if (event.type !== 'DOUBLE_TAP' || !context.currentTrial) return {};

      const k = context.sequentialStepIndex;
      const { expectedFromPosition, expectedToPosition } = getSequentialRawStepPositions(
        context,
        k,
      );
      const { expectedFrom, expectedTo } = getSequentialExpectedGesturePositions(
        context,
        expectedFromPosition,
        expectedToPosition,
      );

      const fromCorrect = expectedFromPosition >= 0 && event.position === expectedFrom;
      const toCorrect = expectedToPosition >= 0 && event.position === expectedTo;
      const isCorrect = fromCorrect && toCorrect;

      const newResult = {
        fromPosition: event.position,
        toPosition: event.position,
        expectedFromPosition,
        expectedToPosition,
        expectedFromGesture: expectedFrom,
        expectedToGesture: expectedTo,
        fromCorrect,
        toCorrect,
        isCorrect,
      };

      return {
        sequentialStepResults: [...context.sequentialStepResults, newResult],
        sequentialStepIndex: context.sequentialStepIndex + 1,
      };
    }),

    // Records the final sequential double-tap step and builds the full TraceResponse
    recordFinalSequentialDoubleTap: assign(({ context, event }) => {
      if (event.type !== 'DOUBLE_TAP' || !context.currentTrial) return {};

      const k = context.sequentialStepIndex;
      const nLevel = context.spec.defaults.nLevel;
      const trialIndex = context.trialIndex;

      const { expectedFromPosition, expectedToPosition } = getSequentialRawStepPositions(
        context,
        k,
      );
      const { expectedFrom, expectedTo } = getSequentialExpectedGesturePositions(
        context,
        expectedFromPosition,
        expectedToPosition,
      );

      const fromCorrect = expectedFromPosition >= 0 && event.position === expectedFrom;
      const toCorrect = expectedToPosition >= 0 && event.position === expectedTo;
      const isCorrect = fromCorrect && toCorrect;

      const finalResult = {
        fromPosition: event.position,
        toPosition: event.position,
        expectedFromPosition,
        expectedToPosition,
        expectedFromGesture: expectedFrom,
        expectedToGesture: expectedTo,
        fromCorrect,
        toCorrect,
        isCorrect,
      };

      const allResults = [...context.sequentialStepResults, finalResult];
      const allCorrect = allResults.every((s) => s.isCorrect);

      const feedbackPosition = context.trials[trialIndex - nLevel]?.position ?? null;

      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      const { response } = context.plugins.response.processDoubleTap(
        {
          position: event.position,
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        trialIndex,
        context.trials,
      );

      const finalResponse: TraceResponse = {
        ...response,
        position: feedbackPosition ?? response.position,
        expectedPosition:
          context.trials[trialIndex - nLevel]?.position ?? response.expectedPosition,
        isCorrect: allCorrect,
      };

      return {
        hasResponded: true,
        feedbackPosition,
        feedbackType: allCorrect ? ('correct' as const) : ('incorrect' as const),
        feedbackFromUserAction: true,
        responses: [...context.responses, finalResponse],
        stats: updateStats(context.stats, allCorrect, false, response.isWarmup),
        sequentialStepResults: allResults,
        sequentialStepIndex: context.sequentialStepIndex + 1,
      };
    }),

    // Reset writing step index at the start of the writing phase
    resetWritingStepIndex: assign({ writingStepIndex: 0 }),

    // Increment writing step index for sequential writing
    incrementWritingStepIndex: assign(({ context }) => ({
      writingStepIndex: context.writingStepIndex + 1,
    })),

    recordDoubleTap: assign(({ context, event }) => {
      if (event.type !== 'DOUBLE_TAP' || !context.currentTrial) return {};

      // Normalize inputMethod: 'keyboard' treated as undefined (no specific method)
      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      // Plugin: data in / data out
      const { response, updates } = context.plugins.response.processDoubleTap(
        {
          position: event.position,
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        context.trialIndex,
        context.trials,
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: true,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, response.isCorrect, false, response.isWarmup),
      };
    }),

    recordHold: assign(({ context, event }) => {
      if (event.type !== 'HOLD' || !context.currentTrial) return {};

      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      const { response, updates } = context.plugins.response.processHold(
        {
          position: event.position,
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          actionDurationMs: event.actionDurationMs,
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        context.trialIndex,
        context.trials,
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: true,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, response.isCorrect, false, response.isWarmup),
      };
    }),

    recordCenterTap: assign(({ context, event }) => {
      if (event.type !== 'CENTER_TAP' || !context.currentTrial) return {};

      // Normalize inputMethod: 'keyboard' treated as undefined (no specific method)
      const inputMethod =
        event.inputMethod === 'mouse' || event.inputMethod === 'touch'
          ? event.inputMethod
          : undefined;

      // Plugin: data in / data out
      const { response, updates } = context.plugins.response.processCenterTap(
        {
          responseTimeMs: context.clock.now() - context.responseStartTime,
          responseAtMs: context.clock.now(),
          inputMethod,
          capturedAtMs: event.capturedAtMs,
        },
        context.currentTrial,
        context.trialIndex,
        context.trials,
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: true,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, response.isCorrect, false, response.isWarmup),
      };
    }),

    recordSkip: assign(({ context }) => {
      if (!context.currentTrial) return {};

      // Plugin: data in / data out
      const { response, updates } = context.plugins.response.processSkip(
        context.currentTrial,
        context.trialIndex,
        context.trials,
        context.clock.now(),
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: true,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, false, false, response.isWarmup),
      };
    }),

    recordTimeout: assign(({ context }) => {
      if (!context.currentTrial) return {};

      // Plugin: data in / data out
      const { response, updates } = context.plugins.response.processTimeout(
        context.currentTrial,
        context.trialIndex,
        context.trials,
        context.clock.now(),
      );

      return {
        hasResponded: true,
        feedbackPosition: updates.feedbackPosition,
        feedbackType: updates.feedbackType,
        feedbackFromUserAction: false,
        responses: [...context.responses, response],
        stats: updateStats(context.stats, false, true, response.isWarmup),
      };
    }),

    recordWarmupComplete: assign(({ context }) => {
      const response: TraceResponse = {
        trialIndex: context.trialIndex,
        responseType: 'skip',
        position: null,
        expectedPosition: null,
        expectedSound: null,
        expectedColor: null,
        colorResponse: null,
        isCorrect: true,
        isWarmup: true,
        responseTimeMs: null,
        responseAtMs: context.clock.now(),
      };

      return {
        hasResponded: true,
        responses: [...context.responses, response],
        stats: {
          ...context.stats,
          warmupTrials: context.stats.warmupTrials + 1,
        },
      };
    }),

    // --- Audio (delegated to AudioPolicy plugin) ---
    playStimulus: ({ context }) => {
      const decision = context.plugins.audio.getStimulusSound(context.currentTrial);
      if (!decision) return;

      if (decision.click) {
        context.audio.playClick();
      }
      if (decision.sound) {
        context.audio.play(decision.sound);
      }
      if (decision.tone) {
        context.audio.playToneValue?.(decision.tone);
      }
    },

    playFeedback: ({ context }) => {
      const feedbackSound = context.plugins.audio.getFeedbackSound(context.feedbackType);
      if (feedbackSound === 'correct') {
        context.audio.playCorrect();
      } else if (feedbackSound === 'incorrect') {
        context.audio.playIncorrect();
      }
    },

    playSwipe: ({ context }) => {
      // Play swipe gesture sound (soft whoosh)
      if (context.spec.extensions.soundEnabled) {
        context.audio.playSwipe();
      }
    },

    stopAudio: ({ context }) => {
      context.audio.stopAll();
    },

    // --- Writing ---
    setWritingResult: assign(({ context, event }) => {
      if (event.type !== 'WRITING_COMPLETE') return {};

      const next = applyMindfulWritingValidation(context, event.result);
      // Persist writing result onto the latest response for this trial so it
      // is available in TraceSessionSummary (report, history, analytics).
      const updatedResponses = [...context.responses];
      for (let i = updatedResponses.length - 1; i >= 0; i--) {
        const prev = updatedResponses[i];
        if (prev && prev.trialIndex === context.trialIndex) {
          updatedResponses[i] = {
            ...prev,
            writingResult: next,
            colorResponse: next.selectedColor ?? null,
          };
          break;
        }
      }

      return { writingResult: next, responses: updatedResponses };
    }),

    setWritingTimeout: assign(({ context }) => {
      const next = applyMindfulWritingValidation(
        context,
        context.plugins.writing.createTimeoutResult({
          expectedSound: getExpectedWritingSound(context),
          expectedColor: getExpectedWritingColor(context),
          expectedImage: getExpectedImage(context),
          expectedDigit: getExpectedDigit(context),
          expectedEmotion: getExpectedEmotion(context),
          expectedWord: getExpectedWord(context),
          expectedTone: getExpectedTone(context),
          expectedSpatialDirection: getExpectedSpatialDirection(context),
        }),
      );

      const updatedResponses = [...context.responses];
      for (let i = updatedResponses.length - 1; i >= 0; i--) {
        const prev = updatedResponses[i];
        if (prev && prev.trialIndex === context.trialIndex) {
          updatedResponses[i] = {
            ...prev,
            writingResult: next,
            colorResponse: null,
          };
          break;
        }
      }

      return { writingResult: next, responses: updatedResponses };
    }),

    // --- Arithmetic Interference ---
    generateArithmeticProblem: assign(({ context }) => ({
      arithmeticProblem: context.plugins.arithmetic.generateProblem({
        stimulusPosition: context.currentTrial?.position ?? null,
        previousStimulusPosition: context.trials[context.trialIndex - 1]?.position ?? null,
      }),
      arithmeticResult: null,
    })),

    setArithmeticResult: assign(({ context, event }) => {
      if (event.type !== 'ARITHMETIC_COMPLETE') return {};
      const problem = context.arithmeticProblem;
      if (!problem) return {};

      const result = context.plugins.arithmetic.validateAnswer(
        problem.expression,
        problem.answer,
        event.userAnswer,
        event.confidence,
        event.writingTimeMs,
      );
      return { arithmeticResult: result };
    }),

    setArithmeticTimeout: assign(({ context }) => {
      const problem = context.arithmeticProblem;
      if (!problem) return {};
      return {
        arithmeticResult: context.plugins.arithmetic.createTimeoutResult(
          problem.expression,
          problem.answer,
        ),
      };
    }),

    clearArithmeticState: assign({
      arithmeticProblem: null,
      arithmeticResult: null,
    }),

    // --- Rule Visibility ---
    setRuleVisible: assign({ ruleVisible: true }),
    setRuleHidden: assign({ ruleVisible: false }),

    // --- Stimulus Visibility (extinction) ---
    setStimulusVisible: assign({ stimulusVisible: true }),
    setStimulusHidden: assign({ stimulusVisible: false }),

    // --- Pause/Resume ---
    savePauseState: assign(({ context }) => {
      // Determine which phase we're in based on current state
      // This will be set by the state that triggers PAUSE
      const elapsed = context.clock.now() - context.phaseStartTime;
      return {
        pauseElapsedTime: elapsed,
        // Use audio clock for consistent timing with scheduler (returns seconds)
        focusLostTime: context.audio.getCurrentTime(),
      };
    }),

    setPausedInStimulus: assign({ pausedInPhase: 'stimulus' as TracePhase }),
    setPausedInArithmetic: assign({ pausedInPhase: 'arithmetic' as TracePhase }),
    setPausedInResponse: assign({ pausedInPhase: 'response' as TracePhase }),
    setPausedInWriting: assign({ pausedInPhase: 'writing' as TracePhase }),
    setPausedInPositionFeedback: assign({ pausedInPhase: 'positionFeedback' as TracePhase }),
    setPausedInWritingFeedback: assign({ pausedInPhase: 'writingFeedback' as TracePhase }),
    setPausedInWaiting: assign({ pausedInPhase: 'waiting' as TracePhase }),
    setPausedInPreStimGap: assign({ pausedInPhase: 'preStimGap' as TracePhase }),

    adjustTimingAfterResume: assign(({ context }) => {
      if (!context.plugins.rhythm.isTimed()) return {};

      // Shift target time forward by pause duration
      // Use audio clock (seconds) for consistency with nextTrialTargetTime
      const currentAudioTime = context.audio.getCurrentTime();
      const pauseDuration = currentAudioTime - (context.focusLostTime ?? currentAudioTime);
      return {
        nextTrialTargetTime: context.nextTrialTargetTime + pauseDuration,
      };
    }),

    clearPauseState: assign({
      pauseElapsedTime: 0,
      pausedInPhase: null,
      focusLostTime: null,
    }),

    // --- Timer Management ---
    cancelTimers: ({ context }) => {
      context.timer.cancel?.();
    },

    // --- Modality Results (delegated to ModalityEvaluator plugin) ---
    computeModalityResults: assign(({ context }) => {
      // Plugin handles the enabled check internally
      if (!context.plugins.modality.isEnabled() || isWarmupTrial(context)) return {};

      const currentTrial = context.currentTrial;
      if (!currentTrial) return {};

      const activeModalities = currentTrial.activeModalities;

      // Get the last response for this trial
      const lastResponse = context.responses[context.responses.length - 1];
      if (!lastResponse) return {};

      // Delegate to ModalityEvaluator plugin
      const { results, updatedStats } = context.plugins.modality.evaluate(
        {
          response: lastResponse,
          activeModalities,
          writingResult: context.writingResult,
          hadPositionTarget: getExpectedPosition(context) !== null,
          hadAudioTarget: getExpectedWritingSound(context) !== null,
          hadColorTarget: getExpectedWritingColor(context) !== null,
          hadImageTarget: getExpectedImage(context) !== null,
          hadDigitTarget: getExpectedDigit(context) !== null,
          hadEmotionTarget: getExpectedEmotion(context) !== null,
          hadWordTarget: getExpectedWord(context) !== null,
          hadToneTarget: getExpectedTone(context) !== null,
          hadSpatialTarget: getExpectedSpatialDirection(context) !== null,
        },
        context.stats,
      );

      // Update the last response with modality results
      const updatedResponses = [...context.responses];
      if (updatedResponses.length > 0) {
        updatedResponses[updatedResponses.length - 1] = {
          ...lastResponse,
          modalityResults: results,
          activeModalities,
        };
      }

      return {
        responses: updatedResponses,
        stats: updatedStats,
      };
    }),

    // --- Adaptive Timing ---
    recordAdaptiveOutcome: assign(({ context }) => {
      // Plugin handles the enabled check internally
      if (!context.plugins.adaptiveTiming.isEnabled()) return {};

      const isWarmup = isWarmupTrial(context);

      // Get the last response for this trial
      const lastResponse = context.responses[context.responses.length - 1];
      if (!lastResponse) return {};

      // Record outcome in the adaptive timing controller
      context.plugins.adaptiveTiming.onTrialCompleted({
        isCorrect: lastResponse.isCorrect,
        responseTimeMs: lastResponse.responseTimeMs,
        isWarmup,
      });

      // If warmup, don't apply adaptive adjustments yet
      if (isWarmup) return {};

      // Get the adaptive values and update timing source
      const newStimulusDurationMs = context.plugins.adaptiveTiming.getCurrentStimulusDurationMs();
      const newResponseWindowMs = context.plugins.adaptiveTiming.getCurrentResponseWindowMs();

      // Only update if enabled and values have changed
      return {
        timingSource: {
          ...context.timingSource,
          stimulusDurationMs: newStimulusDurationMs,
          // Only update response window in timed mode
          ...(context.plugins.rhythm.isTimed() && {
            responseWindowMs: newResponseWindowMs,
          }),
        },
      };
    }),

    // --- Summary ---
    computeSummary: assign(({ context, event }) => {
      // Policy: STOP always means the session is abandoned (even if we were on the last trial).
      const isStop = (event as { type?: unknown } | null)?.type === 'STOP';
      const completed = !isStop && context.trialIndex >= context.trials.length - 1;
      const summary: TraceSessionSummary = {
        sessionId: context.sessionId,
        nLevel: context.spec.defaults.nLevel,
        totalTrials: context.trials.length,
        rhythmMode: context.spec.extensions.rhythmMode,
        finalStats: context.stats,
        durationMs: context.clock.now() - context.sessionStartTime,
        completed,
        score: context.stats.accuracy * 100,
        responses: context.responses,
      };
      return { summary };
    }),

    // --- Event Emission ---
    emitSessionStarted: ({ context }) => {
      const playContext = requirePlayMode(context.playMode);
      const rhythmMode = context.spec.extensions.rhythmMode;
      const persistableSpec = ModeSpecSchema.safeParse(context.spec).success
        ? context.spec
        : undefined;
      const event: TraceSessionStartedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_SESSION_STARTED',
        userId: context.userId,
        config: {
          nLevel: context.spec.defaults.nLevel,
          trialsCount: context.trials.length,
          rhythmMode,
          stimulusDurationMs: context.spec.timing.stimulusDurationMs,
          responseWindowMs: context.spec.timing.responseWindowMs,
        },
        device: getDeviceInfo(context),
        context: getTemporalContext(),
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        journeyStartLevel: context.journeyStartLevel,
        journeyTargetLevel: context.journeyTargetLevel,
        journeyGameMode: context.journeyGameMode as ReportGameMode | undefined,
        journeyName: context.journeyName,
        playContext,
        // Spec is optional; only persist it if it matches the runtime ModeSpec validation schema.
        // This prevents session start from failing due to spec drift or per-session overrides.
        spec: persistableSpec,
        gameMode: context.spec.metadata.id as ReportGameMode,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitStimulusShown: ({ context }) => {
      const trial = context.currentTrial;
      if (!trial) return;

      const event: TraceStimulusShownEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_STIMULUS_SHOWN',
        trialIndex: context.trialIndex,
        position: trial.position,
        isWarmup: isWarmupTrial(context),
        stimulusDurationMs: context.spec.timing.stimulusDurationMs,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitStimulusHidden: ({ context }) => {
      const event: TraceStimulusHiddenEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_STIMULUS_HIDDEN',
        trialIndex: context.trialIndex,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitTimeout: ({ context }) => {
      const event: TraceTimeoutEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_TIMED_OUT',
        trialIndex: context.trialIndex,
        expectedPosition: getExpectedPosition(context),
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitResponse: ({ context }) => {
      const lastResponse = context.responses[context.responses.length - 1];
      if (!lastResponse) return;

      // Calculate processing lag if capturedAtMs is available
      const processingLagMs =
        lastResponse.capturedAtMs && lastResponse.responseAtMs
          ? Math.max(0, lastResponse.responseAtMs - lastResponse.capturedAtMs)
          : undefined;

      const event: TraceResponseEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_RESPONDED',
        trialIndex: lastResponse.trialIndex,
        responseType: lastResponse.responseType === 'timeout' ? 'skip' : lastResponse.responseType,
        position: lastResponse.position,
        expectedPosition: lastResponse.expectedPosition,
        isCorrect: lastResponse.isCorrect,
        isWarmup: lastResponse.isWarmup,
        responseTimeMs: lastResponse.responseTimeMs ?? 0,
        inputMethod: lastResponse.inputMethod,
        processingLagMs,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitWritingStarted: ({ context }) => {
      const event: TraceWritingStartedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_WRITING_STARTED',
        trialIndex: context.trialIndex,
        expectedLetter: getExpectedSound(context),
        mode: context.spec.extensions.writing.mode,
        timeoutMs: context.plugins.writing.getTimeoutMs(),
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitWritingTimeout: ({ context }) => {
      const event: TraceWritingTimeoutEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_WRITING_TIMEOUT',
        trialIndex: context.trialIndex,
        writingTimeMs: context.plugins.writing.getTimeoutMs(),
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitWritingResult: ({ context }) => {
      if (!context.writingResult) return;

      const event: TraceWritingCompletedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_WRITING_COMPLETED',
        trialIndex: context.trialIndex,
        recognizedLetter: context.writingResult.recognizedLetter,
        expectedLetter: context.writingResult.expectedLetter,
        isCorrect: context.writingResult.isCorrect,
        confidence: context.writingResult.confidence,
        writingTimeMs: context.writingResult.writingTimeMs,
        selectedColor: context.writingResult.selectedColor ?? null,
        expectedColor: context.writingResult.expectedColor ?? null,
        colorCorrect: context.writingResult.colorCorrect ?? null,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitArithmeticStarted: ({ context }) => {
      const problem = context.arithmeticProblem;
      if (!problem) return;

      const event: TraceArithmeticStartedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_ARITHMETIC_STARTED',
        trialIndex: context.trialIndex,
        expression: problem.expression,
        correctAnswer: problem.answer,
        timeoutMs: context.plugins.arithmetic.getTimeoutMs(),
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitArithmeticResult: ({ context }) => {
      const result = context.arithmeticResult;
      if (!result) return;

      const event: TraceArithmeticCompletedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_ARITHMETIC_COMPLETED',
        trialIndex: context.trialIndex,
        expression: result.expression,
        correctAnswer: result.correctAnswer,
        userAnswer: result.userAnswer,
        isCorrect: result.isCorrect,
        confidence: result.confidence,
        writingTimeMs: result.writingTimeMs,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitArithmeticTimeout: ({ context }) => {
      const problem = context.arithmeticProblem;
      if (!problem) return;

      const event: TraceArithmeticTimeoutEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_ARITHMETIC_TIMEOUT',
        trialIndex: context.trialIndex,
        expression: problem.expression,
        correctAnswer: problem.answer,
        writingTimeMs: context.plugins.arithmetic.getTimeoutMs(),
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitSessionEnded: ({ context }) => {
      const playContext = requirePlayMode(context.playMode);
      const event: TraceSessionEndedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_SESSION_ENDED',
        userId: context.userId,
        reason: context.summary?.completed ? 'completed' : 'abandoned',
        totalTrials: context.trials.length,
        trialsCompleted: context.stats.trialsCompleted,
        score: context.summary?.score ?? 0,
        durationMs: context.summary?.durationMs ?? 0,
        journeyStageId: context.journeyStageId,
        journeyId: context.journeyId,
        playContext,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitPaused: ({ context }) => {
      const event: TracePausedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_PAUSED',
        trialIndex: context.trialIndex,
        previousPhase: context.pausedInPhase ?? 'stimulus',
        elapsedMs: context.pauseElapsedTime,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    emitResumed: ({ context }) => {
      const event: TraceResumedEvent = {
        ...createEventEnvelope(context),
        type: 'TRACE_RESUMED',
        trialIndex: context.trialIndex,
      };
      context.sessionEvents.push(event);
      persistEvent(context, event);
    },

    // --- Hot-reload timing ---
    updateTimings: assign(({ context, event }) => {
      if (event.type !== 'UPDATE_TIMINGS') return {};
      return {
        timingSource: {
          ...context.timingSource,
          ...event.timings,
        },
      };
    }),
  },

  // ===========================================================================
  // Actors (Timers)
  // ===========================================================================
  actors: {
    // Initialize audio before starting
    initAudio: fromPromise(async ({ input }: { input: TraceSessionContext }) => {
      await input.audio.init?.();
      // Small delay for UI to settle - use audio-clock for consistency
      await input.timer.waitForDuration(100);
    }),

    // Countdown before first trial (3,2,1,0). Duration is spec-driven.
    countdownTimer: fromPromise(async ({ input }: { input: TraceSessionContext }) => {
      const ms = input.spec.timing.prepDelayMs ?? TIMING_SESSION_PREP_MS;
      if (ms > 0) {
        await input.timer.waitForDuration(ms);
      }
    }),

    // Extinction timer - hides stimulus after delay to force memorization
    // Uses AudioContext timer for precise timing (not setTimeout)
    // NOTE: Reads from RhythmController (not spec) to support hot-reload
    extinctionTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const isWarmup = isWarmupTrial(context);
      // Use RhythmController to get current timing (supports hot-reload)
      const stimulusDurationMs = context.plugins.rhythm.getStimulusDurationMs(isWarmup);
      // Extinction at 65% of stimulus duration (matches timed mode ratio)
      // Clamp between 200ms (minimum readable) and 1500ms (max before it's too long)
      const fullExtinctionMs = calculateExtinctionDuration(stimulusDurationMs);

      // Use remaining time if resuming from pause, otherwise use full duration
      const extinctionMs = isResume && remainingMs !== undefined ? remainingMs : fullExtinctionMs;

      // Skip if already completed (remaining <= 0)
      if (extinctionMs <= 0) {
        return { completed: true };
      }

      await context.timer.waitForDuration(extinctionMs);
      return { completed: true };
    }),

    // Stimulus timer (delegated to RhythmController plugin for duration)
    // IMPORTANT: Use waitForDuration instead of waitForStimulusEnd
    // In self-paced mode, waitForStimulusEnd resolves immediately (by design),
    // but we need actual duration to allow extinction timer to complete.
    // User can still respond during stimulus phase via SWIPE/DOUBLE_TAP events.
    stimulusTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const isWarmup = isWarmupTrial(context);

      const fullDuration = context.plugins.rhythm.getStimulusDurationMs(isWarmup);
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      await context.timer.waitForDuration(duration + AUDIO_SYNC_BUFFER_MS);
      return { completed: true };
    }),

    // Response timer - no timer in self-paced mode (delegated to RhythmController plugin)
    responseTimer: fromPromise(
      async ({ input, signal }: { input: ResponseTimerInput; signal: AbortSignal }) => {
        const { context, hasTimeout, isResume, remainingMs } = input;

        if (!hasTimeout) {
          // Self-paced: wait until XState cancels the actor via AbortSignal
          // This prevents memory leaks from orphaned promises
          return new Promise<{ timedOut: boolean }>((_, reject) => {
            const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
            signal.addEventListener('abort', onAbort, { once: true });
          });
        }

        const fullDuration = context.plugins.rhythm.getResponseWindowMs();
        const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

        await context.timer.waitForResponseWindow(duration);
        return { timedOut: true };
      },
    ),

    // Writing timer (delegated to WritingOrchestrator plugin for timeout)
    writingTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration = context.plugins.writing.getTimeoutMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      // Use audio-clock timer for precise timing
      await context.timer.waitForDuration(duration);
      return { timedOut: true };
    }),

    // Arithmetic interference timer (delegated to ArithmeticOrchestrator plugin for timeout)
    arithmeticTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration = context.plugins.arithmetic.getTimeoutMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      // Use audio-clock timer for precise timing
      await context.timer.waitForDuration(duration);
      return { timedOut: true };
    }),

    // Feedback timer (delegated to RhythmController plugin for duration)
    feedbackTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration = context.plugins.rhythm.getFeedbackDurationMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      // Use audio-clock timer for precise feedback timing
      await context.timer.waitForDuration(duration);
      return { completed: true };
    }),

    // Immediate position feedback timer (duration computed per trial)
    positionFeedbackTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration =
        context.positionFeedbackDurationMs > 0
          ? context.positionFeedbackDurationMs
          : context.plugins.rhythm.getFeedbackDurationMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      await context.timer.waitForDuration(duration);
      return { completed: true };
    }),

    // Immediate writing feedback timer (duration computed per trial)
    writingFeedbackTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration =
        context.writingFeedbackDurationMs > 0
          ? context.writingFeedbackDurationMs
          : context.plugins.rhythm.getFeedbackDurationMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      await context.timer.waitForDuration(duration);
      return { completed: true };
    }),

    // Rule reveal timer (after arithmetic, before response)
    ruleRevealTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;
      const fullDuration = context.plugins.rhythm.getRuleDisplayMs();
      const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

      // Use audio-clock timer for precise timing
      await context.timer.waitForDuration(duration);
      return { completed: true };
    }),

    // Waiting timer - rule display only (delegated to RhythmController plugin)
    // NOTE: intervalMs is now handled by preStimGapTimer to create a visual gap
    // between rule disappearing and stimulus appearing (memory enforcement)
    waitingTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;

      if (context.plugins.rhythm.isTimed()) {
        // DRIFT CORRECTION: Use absolute target time
        const targetTime = context.nextTrialTargetTime;
        const currentTime = context.audio.getCurrentTime();

        // Plugin calculates drift-corrected durations
        const timing = context.plugins.rhythm.calculateWaitingTiming(targetTime, currentTime);

        // Wait for rule display phase only (intervalMs moved to preStimGapTimer)
        if (timing.ruleDisplayMs > 0) {
          await context.timer.waitForDuration(timing.ruleDisplayMs);
        }
      } else {
        // Self-paced: fixed timing for rule display only
        const fullDuration = context.plugins.rhythm.getRuleDisplayMs();
        const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

        await context.timer.waitForDuration(duration);
      }

      return { completed: true };
    }),

    // Pre-stimulus gap timer - empty screen between rule and stimulus
    // This forces memorization of the rule before seeing the stimulus
    preStimGapTimer: fromPromise(async ({ input }: { input: TimerActorInput }) => {
      const { context, isResume, remainingMs } = input;

      if (context.plugins.rhythm.isTimed()) {
        // DRIFT CORRECTION: intervalMs portion
        const targetTime = context.nextTrialTargetTime;
        const currentTime = context.audio.getCurrentTime();

        const timing = context.plugins.rhythm.calculateWaitingTiming(targetTime, currentTime);

        if (timing.intervalMs > 0) {
          await context.timer.waitForDuration(timing.intervalMs);
        }
      } else {
        // Self-paced: fixed interval timing
        const fullDuration = context.plugins.rhythm.getIntervalMs();
        const duration = isResume && remainingMs !== undefined ? remainingMs : fullDuration;

        await context.timer.waitForDuration(duration);
      }

      return { completed: true };
    }),
  },
}).createMachine({
  id: 'traceSession',
  initial: 'idle',

  // ===========================================================================
  // Initial Context
  // ===========================================================================
  context: ({ input }) => {
    const enabledModalities = getEnabledModalities(input.spec.extensions);

    // Determine starting trial index (recovery or fresh start)
    // For recovery: lastTrialIndex is the last SHOWN trial, so we resume AT that trial
    // (not +1, since the trial was interrupted before completion)
    const startTrialIndex = input.recoveryState ? input.recoveryState.lastTrialIndex : 0;

    return {
      ...input,
      // Mutable copy of timing for hot-reload support
      timingSource: { ...input.initialTimingSource },
      trialIndex: startTrialIndex,
      currentTrial: null,
      responseStartTime: 0,
      sessionStartTime: 0,
      phaseStartTime: 0,
      absoluteSessionStartTime: 0,
      nextTrialTargetTime: 0,
      hasResponded: false,
      responses: [],
      feedbackPosition: null,
      feedbackType: null,
      feedbackFromUserAction: false,
      positionFeedbackDurationMs: 0,
      writingFeedbackDurationMs: 0,
      writingResult: null,
      arithmeticProblem: null,
      arithmeticResult: null,
      sequentialStepIndex: 0,
      sequentialStepResults: [],
      writingStepIndex: 0,
      ruleVisible: true,
      stimulusVisible: true,
      stats: input.spec.extensions.dynamicRules
        ? {
            ...createEmptyTraceStats(),
            modalityStats: createEmptyAllModalityStats(enabledModalities),
          }
        : createEmptyTraceStats(),
      pauseElapsedTime: 0,
      pausedInPhase: null,
      focusLostTime: null,
      summary: null,
      sessionEvents: [],
      seq: 0,
    };
  },

  // ===========================================================================
  // Global Events (handled from any state)
  // ===========================================================================
  on: {
    UPDATE_TIMINGS: {
      actions: 'updateTimings',
    },
  },

  // ===========================================================================
  // States
  // ===========================================================================
  states: {
    idle: {
      on: {
        START: 'starting',
      },
    },

    starting: {
      entry: ['setSessionStartTime', 'emitSessionStarted'],
      invoke: {
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: [
          {
            target: 'countdown',
          },
          { target: 'countdown' },
        ],
        onError: {
          target: 'finished',
          actions: ['cancelTimers', 'stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },
    },

    countdown: {
      invoke: {
        src: 'countdownTimer',
        input: ({ context }) => context,
        onDone: [
          {
            target: 'active',
            guard: 'isTimed',
            actions: ['setAbsoluteStartTime'],
          },
          { target: 'active' },
        ],
        onError: {
          target: 'finished',
          actions: ['cancelTimers', 'stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },
    },

    active: {
      initial: 'stimulus',

      on: {
        STOP: {
          target: 'finished',
          actions: ['cancelTimers', 'stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },

      states: {
        stimulus: {
          entry: [
            'setStimulusVisible',
            'setCurrentTrial',
            'setPhaseStartTime',
            'setResponseStartTime',
            'emitStimulusShown',
            'playStimulus',
          ],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInStimulus',
                'savePauseState',
                'cancelTimers',
                'stopAudio',
                'emitPaused',
              ],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInStimulus',
                'savePauseState',
                'cancelTimers',
                'stopAudio',
                'emitPaused',
              ],
            },
            // Self-paced: can respond during stimulus
            SWIPE: [
              // Sequential intermediate step: record step, stay in stimulus phase
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialSwipeStep'],
              },
              // Sequential last step: record final step + full feedback
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              // Normal (non-sequential) swipe
              {
                guard: 'canRespond',
                actions: [
                  'playSwipe',
                  'recordSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            DOUBLE_TAP: [
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialDoubleTapStep'],
              },
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              {
                guard: 'canRespond',
                actions: [
                  'recordDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            HOLD: {
              guard: 'canRespond',
              actions: [
                'recordHold',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            CENTER_TAP: {
              guard: 'canRespond',
              actions: [
                'recordCenterTap',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
          },
          // Two parallel timers:
          // 1. extinctionTimer: hides stimulus after 65% of duration (forces memorization)
          // 2. stimulusTimer: controls phase duration, then transitions to response/feedback
          invoke: [
            {
              src: 'extinctionTimer',
              input: ({ context }) => ({ context, isResume: false }),
              onDone: {
                // Hide stimulus when extinction timer completes
                actions: 'setStimulusHidden',
              },
            },
            {
              src: 'stimulusTimer',
              input: ({ context }) => ({ context, isResume: false }),
              onDone: [
                // Warmup: skip response phase, go directly to feedback
                {
                  guard: 'isWarmup',
                  actions: [
                    'emitStimulusHidden',
                    'recordWarmupComplete',
                    'setFeedbackDurationsAfterResponse',
                  ],
                  target: 'positionFeedback',
                },
                // Non-warmup with arithmetic interference: go to arithmetic phase first
                {
                  guard: 'needsArithmeticPhase',
                  actions: ['emitStimulusHidden'],
                  target: 'arithmetic',
                },
                // Non-warmup without arithmetic: go directly to response
                {
                  actions: ['emitStimulusHidden'],
                  target: 'response',
                },
              ],
            },
          ],
        },

        // Arithmetic interference phase (between stimulus and response)
        // NO TIMEOUT: User must respond correctly before proceeding
        arithmetic: {
          entry: ['setPhaseStartTime', 'generateArithmeticProblem', 'emitArithmeticStarted'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInArithmetic', 'savePauseState', 'emitPaused'],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: ['setPausedInArithmetic', 'savePauseState', 'emitPaused'],
            },
            ARITHMETIC_REFRESH: {
              actions: ['generateArithmeticProblem', 'emitArithmeticStarted'],
            },
            ARITHMETIC_COMPLETE: {
              actions: ['setArithmeticResult', 'emitArithmeticResult'],
              target: 'ruleReveal',
            },
          },
          // No timer - stays in this state until ARITHMETIC_COMPLETE is received
        },

        // Rule reveal state - shows rule indicator after arithmetic, before response
        // Grid is enabled during this phase so the user can begin swiping immediately.
        // An early SWIPE/DOUBLE_TAP cancels the timer and jumps straight to response.
        ruleReveal: {
          entry: ['setPhaseStartTime', 'setRuleVisible'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInWaiting', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: ['setPausedInWaiting', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
            // Allow early response: skip remaining reveal time, re-raise the
            // event so `response` processes it in the same microtask.
            SWIPE: {
              target: 'response',
              actions: raise(({ event }) => event),
            },
            DOUBLE_TAP: {
              target: 'response',
              actions: raise(({ event }) => event),
            },
            HOLD: {
              target: 'response',
              actions: raise(({ event }) => event),
            },
          },
          invoke: {
            src: 'ruleRevealTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: {
              actions: ['setRuleHidden'],
              target: 'response',
            },
          },
          exit: ['setRuleHidden'],
        },

        response: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInResponse',
                'savePauseState',
                'cancelTimers',
                'stopAudio',
                'emitPaused',
              ],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInResponse',
                'savePauseState',
                'cancelTimers',
                'stopAudio',
                'emitPaused',
              ],
            },
            SWIPE: [
              // Sequential intermediate step: record step, stay in response phase
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialSwipeStep'],
              },
              // Sequential last step: record final step + full feedback
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              // Normal (non-sequential) swipe
              {
                guard: 'canRespond',
                actions: [
                  'playSwipe',
                  'recordSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            DOUBLE_TAP: [
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialDoubleTapStep'],
              },
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              {
                guard: 'canRespond',
                actions: [
                  'recordDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            HOLD: {
              guard: 'canRespond',
              actions: [
                'recordHold',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            CENTER_TAP: {
              guard: 'canRespond',
              actions: [
                'recordCenterTap',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            SKIP: {
              guard: 'isSelfPaced',
              actions: ['recordSkip', 'emitResponse', 'setFeedbackDurationsAfterResponse'],
              target: 'positionFeedback',
            },
          },
          invoke: {
            src: 'responseTimer',
            input: ({ context }) => ({
              context,
              hasTimeout: context.plugins.rhythm.isTimed(),
              isResume: false,
            }),
            onDone: {
              // Timeout (only fires in timed mode)
              actions: [
                'recordTimeout',
                'emitTimeout',
                'emitResponse',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
          },
        },

        positionFeedback: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInPositionFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInPositionFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
          },
          invoke: {
            src: 'positionFeedbackTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: [
              {
                guard: 'needsWritingPhase',
                // Reset step index here (first entry only), NOT in writing entry (would reset on self-transitions too)
                actions: ['resetWritingStepIndex'],
                target: 'writing',
              },
              {
                actions: ['computeModalityResults', 'recordAdaptiveOutcome'],
                target: 'waiting',
              },
            ],
          },
        },

        writing: {
          entry: ['setPhaseStartTime', 'cancelTimers', 'emitWritingStarted'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInWriting', 'savePauseState', 'emitPaused'],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: ['setPausedInWriting', 'savePauseState', 'emitPaused'],
            },
            WRITING_COMPLETE: [
              // Sequential writing: intermediate step — show per-step feedback first
              {
                guard: 'isSequentialWritingIntermediateStep',
                actions: ['setWritingResult', 'emitWritingResult'],
                target: 'writingStepFeedback',
              },
              // Final (or non-sequential) step
              {
                actions: ['setWritingResult', 'emitWritingResult'],
                target: 'writingFeedback',
              },
            ],
          },
          invoke: {
            src: 'writingTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: {
              actions: ['setWritingTimeout', 'emitWritingTimeout', 'emitWritingResult'],
              target: 'writingFeedback',
            },
          },
        },

        // Sequential-only: brief per-step feedback before advancing to the next writing step
        writingStepFeedback: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInWritingFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInWritingFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
          },
          invoke: {
            src: 'writingFeedbackTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: {
              // Advance to next sequential writing step
              actions: ['incrementWritingStepIndex'],
              target: 'writing',
            },
          },
        },

        writingFeedback: {
          entry: ['setPhaseStartTime', 'computeModalityResults', 'recordAdaptiveOutcome'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInWritingFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInWritingFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
          },
          invoke: {
            src: 'writingFeedbackTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: { target: 'waiting' },
          },
        },

        waiting: {
          entry: ['setPhaseStartTime', 'setRuleVisible'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInWaiting', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: ['setPausedInWaiting', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
          },
          invoke: {
            src: 'waitingTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: {
              // Rule display complete, hide rule and go to gap phase
              actions: ['setRuleHidden'],
              target: 'preStimGap',
            },
          },
          exit: ['setRuleHidden'],
        },

        // Pre-stimulus gap: empty screen between rule and stimulus
        // Forces user to memorize the rule before seeing the stimulus
        preStimGap: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInPreStimGap', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
            FOCUS_LOST: {
              target: '#traceSession.paused',
              actions: ['setPausedInPreStimGap', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
          },
          invoke: {
            src: 'preStimGapTimer',
            input: ({ context }) => ({ context, isResume: false }),
            onDone: [
              {
                guard: 'hasMoreTrials',
                actions: ['advanceTrial', 'advanceTrialTargetTime'],
                target: 'stimulus',
              },
              {
                actions: ['advanceTrialTargetTime'],
                target: '#traceSession.computing',
              },
            ],
          },
        },

        // Resume states
        // NOTE: stimulusResume invokes both extinctionTimer and stimulusTimer in parallel
        // (just like the original stimulus state) to handle pause/resume correctly.
        stimulusResume: {
          entry: ['setPhaseStartTime', 'playStimulus'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInStimulus',
                'savePauseState',
                'cancelTimers',
                'stopAudio',
                'emitPaused',
              ],
            },
            SWIPE: {
              guard: 'canRespond',
              actions: [
                'playSwipe',
                'recordSwipe',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            DOUBLE_TAP: {
              guard: 'canRespond',
              actions: [
                'recordDoubleTap',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            HOLD: {
              guard: 'canRespond',
              actions: [
                'recordHold',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            CENTER_TAP: {
              guard: 'canRespond',
              actions: [
                'recordCenterTap',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
          },
          // Two parallel timers (same as original stimulus state):
          // 1. extinctionTimer: hides stimulus after remaining extinction time
          // 2. stimulusTimer: controls phase duration, then transitions
          invoke: [
            {
              src: 'extinctionTimer',
              input: ({ context }) => {
                // Only run if stimulus is still visible
                if (!context.stimulusVisible) {
                  return { context, isResume: true, remainingMs: 0 };
                }
                const stimulusDurationMs = context.plugins.rhythm.getStimulusDurationMs(
                  isWarmupTrial(context),
                );
                const extinctionDuration = calculateExtinctionDuration(stimulusDurationMs);
                const remainingExtinction = Math.max(
                  0,
                  extinctionDuration - context.pauseElapsedTime,
                );
                return { context, isResume: true, remainingMs: remainingExtinction };
              },
              onDone: {
                // Hide stimulus when extinction timer completes (if still visible)
                actions: 'setStimulusHidden',
              },
            },
            {
              src: 'stimulusTimer',
              input: ({ context }) => ({
                context,
                isResume: true,
                remainingMs: calculateRemainingTime(
                  context.plugins.rhythm.getStimulusDurationMs(isWarmupTrial(context)),
                  context.phaseStartTime,
                  context.pauseElapsedTime,
                ),
              }),
              onDone: [
                {
                  guard: 'isWarmup',
                  actions: [
                    'emitStimulusHidden',
                    'recordWarmupComplete',
                    'setFeedbackDurationsAfterResponse',
                  ],
                  target: 'positionFeedback',
                },
                // Non-warmup with arithmetic: go to arithmetic phase
                {
                  guard: 'needsArithmeticPhase',
                  actions: ['emitStimulusHidden'],
                  target: 'arithmetic',
                },
                // Non-warmup without arithmetic: go to response
                {
                  actions: ['emitStimulusHidden'],
                  target: 'response',
                },
              ],
            },
          ],
        },

        responseResume: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInResponse', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
            SWIPE: [
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialSwipeStep'],
              },
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              {
                guard: 'canRespond',
                actions: [
                  'playSwipe',
                  'recordSwipe',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            DOUBLE_TAP: [
              {
                guard: 'isSequentialIntermediateStep',
                actions: ['playSwipe', 'recordSequentialDoubleTapStep'],
              },
              {
                guard: 'isSequentialLastStep',
                actions: [
                  'playSwipe',
                  'recordFinalSequentialDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
              {
                guard: 'canRespond',
                actions: [
                  'recordDoubleTap',
                  'emitResponse',
                  'playFeedback',
                  'setFeedbackDurationsAfterResponse',
                ],
                target: 'positionFeedback',
              },
            ],
            CENTER_TAP: {
              guard: 'canRespond',
              actions: [
                'recordCenterTap',
                'emitResponse',
                'playFeedback',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
            SKIP: {
              guard: 'isSelfPaced',
              actions: ['recordSkip', 'emitResponse', 'setFeedbackDurationsAfterResponse'],
              target: 'positionFeedback',
            },
          },
          invoke: {
            src: 'responseTimer',
            input: ({ context }) => ({
              context,
              hasTimeout: context.plugins.rhythm.isTimed(),
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.plugins.rhythm.getResponseWindowMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: {
              actions: [
                'recordTimeout',
                'emitTimeout',
                'emitResponse',
                'setFeedbackDurationsAfterResponse',
              ],
              target: 'positionFeedback',
            },
          },
        },

        writingResume: {
          entry: ['setPhaseStartTime', 'emitWritingStarted'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInWriting', 'savePauseState', 'emitPaused'],
            },
            WRITING_COMPLETE: {
              actions: ['setWritingResult', 'emitWritingResult'],
              target: 'writingFeedback',
            },
          },
          invoke: {
            src: 'writingTimer',
            input: ({ context }) => ({
              context,
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.plugins.writing.getTimeoutMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: {
              actions: ['setWritingTimeout', 'emitWritingTimeout', 'emitWritingResult'],
              target: 'writingFeedback',
            },
          },
        },

        // Resume arithmetic - NO TIMEOUT, waits for user response
        arithmeticResume: {
          entry: ['setPhaseStartTime', 'emitArithmeticStarted'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInArithmetic', 'savePauseState', 'emitPaused'],
            },
            ARITHMETIC_COMPLETE: {
              actions: ['setArithmeticResult', 'emitArithmeticResult'],
              target: 'ruleReveal',
            },
          },
          // No timer - stays in this state until ARITHMETIC_COMPLETE is received
        },

        positionFeedbackResume: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInPositionFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
          },
          invoke: {
            src: 'positionFeedbackTimer',
            input: ({ context }) => ({
              context,
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.positionFeedbackDurationMs ||
                  context.plugins.rhythm.getFeedbackDurationMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: [
              {
                guard: 'needsWritingPhase',
                actions: ['resetWritingStepIndex'],
                target: 'writing',
              },
              {
                actions: ['computeModalityResults', 'recordAdaptiveOutcome'],
                target: 'waiting',
              },
            ],
          },
        },

        writingFeedbackResume: {
          entry: ['setPhaseStartTime', 'computeModalityResults', 'recordAdaptiveOutcome'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: [
                'setPausedInWritingFeedback',
                'savePauseState',
                'cancelTimers',
                'emitPaused',
              ],
            },
          },
          invoke: {
            src: 'writingFeedbackTimer',
            input: ({ context }) => ({
              context,
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.writingFeedbackDurationMs || context.plugins.rhythm.getFeedbackDurationMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: { target: 'waiting' },
          },
        },

        waitingResume: {
          entry: ['setPhaseStartTime', 'setRuleVisible'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInWaiting', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
          },
          invoke: {
            src: 'waitingTimer',
            input: ({ context }) => ({
              context,
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.plugins.rhythm.getRuleDisplayMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: {
              actions: ['setRuleHidden'],
              target: 'preStimGap',
            },
          },
          exit: ['setRuleHidden'],
        },

        preStimGapResume: {
          entry: ['setPhaseStartTime'],
          on: {
            PAUSE: {
              target: '#traceSession.paused',
              actions: ['setPausedInPreStimGap', 'savePauseState', 'cancelTimers', 'emitPaused'],
            },
          },
          invoke: {
            src: 'preStimGapTimer',
            input: ({ context }) => ({
              context,
              isResume: true,
              remainingMs: calculateRemainingTime(
                context.plugins.rhythm.getIntervalMs(),
                context.phaseStartTime,
                context.pauseElapsedTime,
              ),
            }),
            onDone: [
              {
                guard: 'hasMoreTrials',
                actions: ['advanceTrial', 'advanceTrialTargetTime'],
                target: 'stimulus',
              },
              {
                actions: ['advanceTrialTargetTime'],
                target: '#traceSession.computing',
              },
            ],
          },
        },
      },
    },

    paused: {
      on: {
        RESUME: {
          target: 'resuming',
          actions: ['adjustTimingAfterResume', 'emitResumed'],
        },
        FOCUS_REGAINED: {
          target: 'resuming',
          actions: ['adjustTimingAfterResume', 'emitResumed'],
        },
        STOP: {
          target: 'finished',
          actions: ['cancelTimers', 'stopAudio', 'computeSummary', 'emitSessionEnded'],
        },
      },
    },

    resuming: {
      always: [
        { guard: 'wasInStimulus', target: 'active.stimulusResume', actions: ['clearPauseState'] },
        {
          guard: 'wasInArithmetic',
          target: 'active.arithmeticResume',
          actions: ['clearPauseState'],
        },
        { guard: 'wasInResponse', target: 'active.responseResume', actions: ['clearPauseState'] },
        { guard: 'wasInWriting', target: 'active.writingResume', actions: ['clearPauseState'] },
        {
          guard: 'wasInPositionFeedback',
          target: 'active.positionFeedbackResume',
          actions: ['clearPauseState'],
        },
        {
          guard: 'wasInWritingFeedback',
          target: 'active.writingFeedbackResume',
          actions: ['clearPauseState'],
        },
        { guard: 'wasInWaiting', target: 'active.waitingResume', actions: ['clearPauseState'] },
        {
          guard: 'wasInPreStimGap',
          target: 'active.preStimGapResume',
          actions: ['clearPauseState'],
        },
        // Fallback
        { target: 'active.stimulus', actions: ['clearPauseState'] },
      ],
    },

    computing: {
      entry: ['computeSummary'],
      always: {
        target: 'finished',
        actions: ['emitSessionEnded'],
      },
    },

    finished: {
      type: 'final',
    },
  },
});

// =============================================================================
// Type Exports
// =============================================================================

export type TraceSessionMachine = typeof traceSessionMachine;
export type TraceSessionActor = ActorRefFrom<typeof traceSessionMachine>;
