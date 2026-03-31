/**
 * DefaultResponseProcessor
 *
 * Validates user responses (swipe, double-tap, center-tap, skip, timeout).
 * Pure functions: explicit inputs, no side effects, no context dependency.
 *
 * PRINCIPLES:
 * - Data in / Data out: receives inputs, returns ResponseResult
 * - No mutation: creates new response objects
 * - Spec-driven: uses nLevel from spec for warmup detection
 */

import type { Sound, Color } from '../../../types/core';
import type {
  TracePosition,
  TraceTrial,
  TraceResponse,
  SwipeDirection,
  MirrorAxis,
} from '../../../types/trace';
import {
  getMirrorPosition,
  getGridDimensions,
  validateTraceActionDuration,
} from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';
import type {
  ResponseProcessor,
  SwipeInput,
  DoubleTapInput,
  HoldInput,
  CenterTapInput,
  ResponseResult,
} from './types';

// =============================================================================
// Factory
// =============================================================================

export interface ResponseProcessorConfig {
  readonly spec: TraceSpec;
}

/**
 * Creates a DefaultResponseProcessor.
 * All config is explicit, no hidden dependencies.
 */
export function createDefaultResponseProcessor(config: ResponseProcessorConfig): ResponseProcessor {
  const { spec } = config;
  const nLevel = spec.defaults.nLevel;
  const dyslat = spec.extensions.dyslatéralisation;
  const mirrorSwipe = dyslat?.mirrorSwipe ?? false;
  const mirrorAxisSetting = dyslat?.mirrorAxis ?? 'horizontal';
  const isDynamicAxis = mirrorAxisSetting === 'dynamic';
  const gridMode = dyslat?.gridMode ?? '3x3';
  const { cols: gridCols, rows: gridRows } = getGridDimensions(gridMode);
  const mindfulTiming = spec.extensions.mindfulTiming;
  const mindfulTimingEnabled = mindfulTiming?.enabled === true;

  function getPositionTimingResult(actionDurationMs?: number): {
    accepted: boolean;
    targetMs: number | null;
    toleranceMs: number | null;
  } {
    if (!mindfulTimingEnabled) {
      return {
        accepted: true,
        targetMs: null,
        toleranceMs: null,
      };
    }

    if (actionDurationMs === undefined) {
      return {
        accepted: false,
        targetMs: mindfulTiming.positionDurationMs,
        toleranceMs: mindfulTiming.positionToleranceMs,
      };
    }

    const result = validateTraceActionDuration(
      actionDurationMs,
      mindfulTiming.positionDurationMs,
      mindfulTiming.positionToleranceMs,
    );
    return {
      accepted: result.accepted,
      targetMs: mindfulTiming.positionDurationMs,
      toleranceMs: mindfulTiming.positionToleranceMs,
    };
  }

  /** Resolve the effective mirror axis for a trial. */
  function getTrialMirrorAxis(trial: TraceTrial): MirrorAxis {
    if (isDynamicAxis) return trial.mirrorAxis ?? 'horizontal';
    return mirrorAxisSetting as MirrorAxis;
  }

  // -------------------------------------------------------------------------
  // Helper Functions (pure, no side effects)
  // -------------------------------------------------------------------------
  // NOTE: These functions duplicate logic from trace-session-types.ts.
  // - trace-session-types.ts has context-based versions for selectors/snapshots
  // - This file has primitive-based versions for plugin interface
  // The logic is trivial (trialIndex < nLevel) but if the warmup formula
  // changes, BOTH files must be updated. Consider extracting to a shared
  // utility if this becomes a maintenance burden.

  function isWarmupTrial(trialIndex: number): boolean {
    return trialIndex < nLevel;
  }

  function getExpectedPosition(
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): TracePosition | null {
    if (isWarmupTrial(trialIndex)) return null;
    const nBackIndex = trialIndex - nLevel;
    return trials[nBackIndex]?.position ?? null;
  }

  function getExpectedSound(trialIndex: number, trials: readonly TraceTrial[]): Sound | null {
    if (isWarmupTrial(trialIndex)) return null;
    const nBackIndex = trialIndex - nLevel;
    return trials[nBackIndex]?.sound ?? null;
  }

  function getExpectedColor(trialIndex: number, trials: readonly TraceTrial[]): Color | null {
    if (isWarmupTrial(trialIndex)) return null;
    const nBackIndex = trialIndex - nLevel;
    return trials[nBackIndex]?.color ?? null;
  }

  // -------------------------------------------------------------------------
  // Response Processors
  // -------------------------------------------------------------------------

  function processSwipe(
    input: SwipeInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult {
    const {
      fromPosition,
      toPosition,
      responseTimeMs,
      responseAtMs,
      actionDurationMs,
      inputMethod,
      capturedAtMs,
    } = input;
    const rawCurrentPosition = trial.position;
    const rawTargetPosition = getExpectedPosition(trialIndex, trials);
    // When mirrorSwipe is enabled, the entire swipe is mirrored (both endpoints)
    // Normal swipe A→B becomes mirror(A)→mirror(B), axis may vary per trial
    const axis = mirrorSwipe ? getTrialMirrorAxis(trial) : null;
    const currentPosition =
      mirrorSwipe && axis
        ? getMirrorPosition(rawCurrentPosition, gridCols, gridRows, axis)
        : rawCurrentPosition;
    const targetPosition =
      mirrorSwipe && rawTargetPosition !== null && axis
        ? getMirrorPosition(rawTargetPosition, gridCols, gridRows, axis)
        : rawTargetPosition;
    const swipeDirection: SwipeDirection = trial.swipeDirection ?? 'n-to-target';
    const isWarmup = isWarmupTrial(trialIndex);

    // Validate swipe based on direction:
    // - 'n-to-target': from mirror(current) to mirror(N-back target)
    // - 'target-to-n': from mirror(N-back target) to mirror(current)
    const spatiallyCorrect =
      !isWarmup &&
      targetPosition !== null &&
      (swipeDirection === 'n-to-target'
        ? fromPosition === currentPosition && toPosition === targetPosition
        : fromPosition === targetPosition && toPosition === currentPosition);
    const timing = getPositionTimingResult(actionDurationMs);
    const isCorrect = spatiallyCorrect && timing.accepted;

    const response: TraceResponse = {
      trialIndex,
      responseType: 'swipe',
      position: toPosition,
      expectedPosition: targetPosition,
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect,
      isWarmup,
      responseTimeMs,
      responseAtMs,
      inputMethod,
      capturedAtMs,
      actionDurationMs: actionDurationMs ?? null,
      timingTargetMs: timing.targetMs,
      timingToleranceMs: timing.toleranceMs,
      timingAccepted: mindfulTimingEnabled ? timing.accepted : null,
    };

    // Feedback displays on RAW positions (what the user sees), not mirror positions (gesture)
    const feedbackPos =
      mirrorSwipe && axis ? getMirrorPosition(toPosition, gridCols, gridRows, axis) : toPosition;

    return {
      response,
      updates: {
        feedbackPosition: feedbackPos,
        feedbackType: isCorrect ? 'correct' : 'incorrect',
      },
    };
  }

  function processDoubleTap(
    input: DoubleTapInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult {
    const { position, responseTimeMs, responseAtMs, inputMethod, capturedAtMs } = input;
    const expected = getExpectedPosition(trialIndex, trials);
    const isWarmup = isWarmupTrial(trialIndex);

    // Double-tap is correct if current position matches N-back position
    const isCorrect = !isWarmup && trial.position === expected;

    const response: TraceResponse = {
      trialIndex,
      responseType: 'double-tap',
      position,
      expectedPosition: expected,
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect,
      isWarmup,
      responseTimeMs,
      responseAtMs,
      inputMethod,
      capturedAtMs,
      actionDurationMs: null,
      timingTargetMs: null,
      timingToleranceMs: null,
      timingAccepted: null,
    };

    return {
      response,
      updates: {
        feedbackPosition: position,
        feedbackType: isCorrect ? 'correct' : 'incorrect',
      },
    };
  }

  function processHold(
    input: HoldInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult {
    const { position, responseTimeMs, responseAtMs, actionDurationMs, inputMethod, capturedAtMs } =
      input;
    const expected = getExpectedPosition(trialIndex, trials);
    const isWarmup = isWarmupTrial(trialIndex);
    const timing = getPositionTimingResult(actionDurationMs);

    const spatiallyCorrect =
      !isWarmup && trial.position === expected && position === trial.position;
    const isCorrect = spatiallyCorrect && timing.accepted;

    const response: TraceResponse = {
      trialIndex,
      responseType: 'hold',
      position,
      expectedPosition: expected,
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect,
      isWarmup,
      responseTimeMs,
      responseAtMs,
      inputMethod,
      capturedAtMs,
      actionDurationMs,
      timingTargetMs: timing.targetMs,
      timingToleranceMs: timing.toleranceMs,
      timingAccepted: mindfulTimingEnabled ? timing.accepted : null,
    };

    return {
      response,
      updates: {
        feedbackPosition: position,
        feedbackType: isCorrect ? 'correct' : 'incorrect',
      },
    };
  }

  function processCenterTap(
    input: CenterTapInput,
    _trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult {
    const { responseTimeMs, responseAtMs, inputMethod, capturedAtMs } = input;
    const expected = getExpectedPosition(trialIndex, trials);
    const isWarmup = isWarmupTrial(trialIndex);

    // Center tap = explicit rejection - correct if no target expected
    const isCorrect = !isWarmup && expected === null;

    const response: TraceResponse = {
      trialIndex,
      responseType: 'reject',
      position: null,
      expectedPosition: expected,
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect,
      isWarmup,
      responseTimeMs,
      responseAtMs,
      inputMethod,
      capturedAtMs,
      actionDurationMs: null,
      timingTargetMs: null,
      timingToleranceMs: null,
      timingAccepted: null,
    };

    return {
      response,
      updates: {
        feedbackPosition: null,
        feedbackType: isCorrect ? 'correct' : 'incorrect',
      },
    };
  }

  function processSkip(
    _trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
    responseAtMs: number,
  ): ResponseResult {
    const isWarmup = isWarmupTrial(trialIndex);

    const response: TraceResponse = {
      trialIndex,
      responseType: 'skip',
      position: null,
      expectedPosition: getExpectedPosition(trialIndex, trials),
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect: false,
      isWarmup,
      responseTimeMs: null,
      responseAtMs,
      actionDurationMs: null,
      timingTargetMs: null,
      timingToleranceMs: null,
      timingAccepted: null,
    };

    return {
      response,
      updates: {
        feedbackPosition: null,
        feedbackType: null, // No feedback for skip
      },
    };
  }

  function processTimeout(
    _trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
    responseAtMs: number,
  ): ResponseResult {
    const isWarmup = isWarmupTrial(trialIndex);

    const response: TraceResponse = {
      trialIndex,
      responseType: 'timeout',
      position: null,
      expectedPosition: getExpectedPosition(trialIndex, trials),
      expectedSound: getExpectedSound(trialIndex, trials),
      expectedColor: getExpectedColor(trialIndex, trials),
      colorResponse: null,
      isCorrect: false,
      isWarmup,
      responseTimeMs: null,
      responseAtMs,
      actionDurationMs: null,
      timingTargetMs: null,
      timingToleranceMs: null,
      timingAccepted: null,
    };

    return {
      response,
      updates: {
        feedbackPosition: null,
        feedbackType: 'incorrect', // Timeout shows incorrect feedback
      },
    };
  }

  // -------------------------------------------------------------------------
  // Return Plugin Interface
  // -------------------------------------------------------------------------

  return {
    processSwipe,
    processDoubleTap,
    processHold,
    processCenterTap,
    processSkip,
    processTimeout,
    isWarmupTrial,
    getExpectedPosition,
    getExpectedSound,
    getExpectedColor,
  };
}
