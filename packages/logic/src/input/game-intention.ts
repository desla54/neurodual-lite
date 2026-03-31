/**
 * GameIntention - Unified Input Abstraction
 *
 * SINGLE SOURCE OF TRUTH for user input types across all game modes.
 *
 * GameIntention represents WHAT the user wants to do, not HOW they did it.
 * This decouples the UI layer (keyboard, touch, gamepad) from the game logic.
 *
 * Benefits:
 * - Sessions accept the same intention types regardless of input method
 * - Easy to add new input methods (voice, eye-tracking, etc.)
 * - Clear contract between UI and Logic layers
 * - Simplifies testing (just send intentions, not simulate inputs)
 */

import type { ModalityId } from '../types/core';

// =============================================================================
// Input Method
// =============================================================================

/**
 * How the user provided the input.
 * Used for analytics and adaptive feedback (e.g., touch users get larger targets).
 */
export type InputMethod = 'keyboard' | 'touch' | 'gamepad' | 'mouse' | 'voice' | 'bot';

// =============================================================================
// Drag Trajectory (for Place/Pick modes)
// =============================================================================

/**
 * Trajectory point during a drag operation.
 */
export interface TrajectoryPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number; // timestamp in ms
}

/**
 * Complete drag trajectory for confidence analysis.
 */
export interface DragTrajectory {
  readonly points: readonly TrajectoryPoint[];
  readonly startTime: number;
  readonly endTime: number;
  readonly pauses: readonly { start: number; end: number }[];
}

// =============================================================================
// Session Control Intentions
// =============================================================================

/**
 * Start the session.
 */
export interface StartIntention {
  readonly type: 'START';
}

/**
 * Stop/abandon the session.
 */
export interface StopIntention {
  readonly type: 'STOP';
}

/**
 * Pause the session.
 */
export interface PauseIntention {
  readonly type: 'PAUSE';
}

/**
 * Resume a paused session.
 */
export interface ResumeIntention {
  readonly type: 'RESUME';
}

// =============================================================================
// Tempo Mode Intentions (GameSession)
// =============================================================================

/**
 * Claim a match for a modality (keydown/touchstart).
 * The user believes the current stimulus matches N-back.
 */
export interface ClaimMatchIntention {
  readonly type: 'CLAIM_MATCH';
  readonly modality: ModalityId;
  readonly inputMethod: InputMethod;
  /**
   * Timestamp captured at the moment of keydown/touchstart (performance.now()).
   * Used to measure processing lag through React/XState pipeline.
   * If not provided, lag measurement is skipped.
   */
  readonly capturedAtMs?: number;
  /**
   * Correlation ID for input telemetry (UI → machine → stats).
   * Generated at input time (e.g. crypto.randomUUID()).
   */
  readonly telemetryId?: string;
  /**
   * Timestamp recorded immediately after dispatching the intention (performance.now()).
   * Used to estimate input→dispatch latency in the UI layer.
   */
  readonly dispatchCompletedAtMs?: number;
  /**
   * Button position when clicked (mouse input only).
   * Used with cursorPosition from TRIAL_PRESENTED to calculate travel distance for RT analysis.
   */
  readonly buttonPosition?: { readonly x: number; readonly y: number };
}

/**
 * Release a match claim (keyup/touchend).
 * Completes the response recording with press duration.
 */
export interface ReleaseClaimIntention {
  readonly type: 'RELEASE_CLAIM';
  readonly modality: ModalityId;
  /** Duration the key/button was held down, in milliseconds */
  readonly pressDurationMs: number;
}

/**
 * Report UI pipeline latency for a specific input sample.
 * This is telemetry only: it does not change gameplay state.
 */
export interface ReportInputPipelineLatencyIntention {
  readonly type: 'REPORT_INPUT_PIPELINE_LATENCY';
  /** Correlation ID to link input samples through UI → machine → stats. */
  readonly telemetryId: string;
  readonly modality: ModalityId;
  readonly inputMethod: InputMethod;
  readonly trialIndex: number;
  readonly phase: 'stimulus' | 'waiting';
  /** performance.now() captured at input time (keydown/pointerdown). */
  readonly capturedAtMs: number;
  /** performance.now() immediately after dispatch() returns (optional; UI may omit). */
  readonly dispatchCompletedAtMs?: number;
  /** performance.now() captured right after the render commit for this input sample. */
  readonly commitAtMs: number;
  /** performance.now() captured after a paint (double rAF). */
  readonly paintAtMs: number;
}

// =============================================================================
// Brain Workshop Arithmetic (typed-answer)
// =============================================================================

export type ArithmeticInputKey =
  | { readonly kind: 'digit'; readonly digit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
  | { readonly kind: 'minus' }
  | { readonly kind: 'decimal' }
  | { readonly kind: 'reset' };

/**
 * Update the arithmetic typed-answer buffer (Brain Workshop faithful).
 *
 * - Digits append
 * - Minus toggles sign
 * - Decimal adds '.' once
 * - Reset clears all input
 */
export interface ArithmeticInputIntention {
  readonly type: 'ARITHMETIC_INPUT';
  readonly key: ArithmeticInputKey;
  readonly inputMethod?: InputMethod;
}

/**
 * Report a misfired input (wrong key pressed).
 * Used for analytics and coaching feedback.
 */
export interface MisfiredInputIntention {
  readonly type: 'MISFIRED_INPUT';
  readonly key: string;
}

/**
 * Declare current energy level.
 * Used by adaptive coaching to adjust difficulty.
 */
export interface DeclareEnergyIntention {
  readonly type: 'DECLARE_ENERGY';
  readonly level: 1 | 2 | 3;
}

// =============================================================================
// Place/Pick Mode Intentions (PlaceSession, DualPickSession)
// =============================================================================

/**
 * Drop a draggable item onto a target slot.
 * Used in Place (card placement) and Pick (label placement) modes.
 */
export interface DropItemIntention {
  readonly type: 'DROP_ITEM';
  readonly itemId: string;
  readonly targetSlot: number;
  readonly trajectory?: DragTrajectory;
}

/**
 * Cancel a drag operation (drop outside valid zone).
 */
export interface CancelDragIntention {
  readonly type: 'CANCEL_DRAG';
  readonly itemId: string;
}

/**
 * Advance to the next trial (after all placements are done).
 * Used in Place mode when awaiting user confirmation to proceed.
 */
export interface AdvanceIntention {
  readonly type: 'ADVANCE';
}

// =============================================================================
// Memo Mode Intentions (MemoSession)
// =============================================================================

/**
 * Select a value for a slot in recall mode.
 * User picks a position or sound for the N, N-1, N-2 slots.
 */
export interface SelectValueIntention {
  readonly type: 'SELECT_VALUE';
  readonly slot: number; // 0 = N, 1 = N-1, 2 = N-2
  readonly modality: ModalityId;
  readonly value: number | string; // position (0-8) or sound name
  /** Input method used for this selection (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
}

/**
 * Confirm the current selection and advance.
 */
export interface ConfirmSelectionIntention {
  readonly type: 'CONFIRM_SELECTION';
}

// =============================================================================
// Trace Mode Intentions (TraceSession)
// =============================================================================

/**
 * Swipe gesture indicating direction recall.
 * User swipes from current position to remembered N-back position.
 */
export interface SwipeIntention {
  readonly type: 'SWIPE';
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly inputMethod: InputMethod;
}

/**
 * Tap gesture for match indication or rejection.
 */
export interface TapIntention {
  readonly type: 'TAP';
  readonly position: number | 'center';
  readonly count: 1 | 2; // single tap vs double tap
  readonly inputMethod: InputMethod;
}

/**
 * Skip the current trial (self-paced mode).
 */
export interface SkipIntention {
  readonly type: 'SKIP';
}

/**
 * Complete handwriting input.
 */
export interface WritingCompleteIntention {
  readonly type: 'WRITING_COMPLETE';
  readonly recognizedLetter: string | null;
  readonly confidence: number;
  readonly strokeData?: unknown;
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * All possible game intentions.
 *
 * Each session type handles a subset of these:
 * - GameSession: START, STOP, PAUSE, RESUME, CLAIM_MATCH, RELEASE_CLAIM, MISFIRED_INPUT, DECLARE_ENERGY
 * - PlaceSession: START, STOP, PAUSE, RESUME, DROP_ITEM, CANCEL_DRAG
 * - MemoSession: START, STOP, PAUSE, RESUME, SELECT_VALUE, CONFIRM_SELECTION
 * - TraceSession: START, STOP, PAUSE, RESUME, SWIPE, TAP, SKIP, WRITING_COMPLETE
 * - DualPickSession: START, STOP, PAUSE, RESUME, DROP_ITEM, CANCEL_DRAG
 */
export type GameIntention =
  // Session control
  | StartIntention
  | StopIntention
  | PauseIntention
  | ResumeIntention
  // Tempo mode
  | ClaimMatchIntention
  | ReleaseClaimIntention
  | ReportInputPipelineLatencyIntention
  | ArithmeticInputIntention
  // Coaching (GameSession-specific)
  | MisfiredInputIntention
  | DeclareEnergyIntention
  // Place/Pick mode
  | DropItemIntention
  | CancelDragIntention
  | AdvanceIntention
  // Memo mode
  | SelectValueIntention
  | ConfirmSelectionIntention
  // Trace mode
  | SwipeIntention
  | TapIntention
  | SkipIntention
  | WritingCompleteIntention;

// =============================================================================
// Type Guards
// =============================================================================

export function isSessionControlIntention(
  intention: GameIntention,
): intention is StartIntention | StopIntention | PauseIntention | ResumeIntention {
  return ['START', 'STOP', 'PAUSE', 'RESUME'].includes(intention.type);
}

export function isTempoIntention(
  intention: GameIntention,
): intention is ClaimMatchIntention | ReleaseClaimIntention | ReportInputPipelineLatencyIntention {
  return ['CLAIM_MATCH', 'RELEASE_CLAIM', 'REPORT_INPUT_PIPELINE_LATENCY'].includes(intention.type);
}

export function isArithmeticInputIntention(
  intention: GameIntention,
): intention is ArithmeticInputIntention {
  return intention.type === 'ARITHMETIC_INPUT';
}

export function isCoachingIntention(
  intention: GameIntention,
): intention is MisfiredInputIntention | DeclareEnergyIntention {
  return ['MISFIRED_INPUT', 'DECLARE_ENERGY'].includes(intention.type);
}

export function isPlaceIntention(
  intention: GameIntention,
): intention is DropItemIntention | CancelDragIntention | AdvanceIntention {
  return ['DROP_ITEM', 'CANCEL_DRAG', 'ADVANCE'].includes(intention.type);
}

export function isMemoIntention(
  intention: GameIntention,
): intention is SelectValueIntention | ConfirmSelectionIntention {
  return ['SELECT_VALUE', 'CONFIRM_SELECTION'].includes(intention.type);
}

export function isTraceIntention(
  intention: GameIntention,
): intention is SwipeIntention | TapIntention | SkipIntention | WritingCompleteIntention {
  return ['SWIPE', 'TAP', 'SKIP', 'WRITING_COMPLETE'].includes(intention.type);
}

// =============================================================================
// Intent Builders (Convenience Factories)
// =============================================================================

export const Intents = {
  // Session control
  start: (): StartIntention => ({ type: 'START' }),
  stop: (): StopIntention => ({ type: 'STOP' }),
  pause: (): PauseIntention => ({ type: 'PAUSE' }),
  resume: (): ResumeIntention => ({ type: 'RESUME' }),

  // Tempo mode
  claimMatch: (
    modality: ModalityId,
    inputMethod: InputMethod = 'keyboard',
    options?: {
      capturedAtMs?: number;
      telemetryId?: string;
      dispatchCompletedAtMs?: number;
      buttonPosition?: { x: number; y: number };
    },
  ): ClaimMatchIntention => ({
    type: 'CLAIM_MATCH',
    modality,
    inputMethod,
    capturedAtMs: options?.capturedAtMs,
    telemetryId: options?.telemetryId,
    dispatchCompletedAtMs: options?.dispatchCompletedAtMs,
    buttonPosition: options?.buttonPosition,
  }),
  releaseClaim: (modality: ModalityId, pressDurationMs: number): ReleaseClaimIntention => ({
    type: 'RELEASE_CLAIM',
    modality,
    pressDurationMs,
  }),
  reportInputPipelineLatency: (
    modality: ModalityId,
    inputMethod: InputMethod,
    params: {
      telemetryId: string;
      phase: 'stimulus' | 'waiting';
      trialIndex: number;
      capturedAtMs: number;
      dispatchCompletedAtMs?: number;
      commitAtMs: number;
      paintAtMs: number;
    },
  ): ReportInputPipelineLatencyIntention => ({
    type: 'REPORT_INPUT_PIPELINE_LATENCY',
    telemetryId: params.telemetryId,
    modality,
    inputMethod,
    phase: params.phase,
    trialIndex: params.trialIndex,
    capturedAtMs: params.capturedAtMs,
    dispatchCompletedAtMs: params.dispatchCompletedAtMs,
    commitAtMs: params.commitAtMs,
    paintAtMs: params.paintAtMs,
  }),

  // Brain Workshop arithmetic typed-answer
  arithmeticInput: (
    key: ArithmeticInputKey,
    inputMethod?: InputMethod,
  ): ArithmeticInputIntention => ({
    type: 'ARITHMETIC_INPUT',
    key,
    inputMethod,
  }),

  // Coaching
  misfiredInput: (key: string): MisfiredInputIntention => ({
    type: 'MISFIRED_INPUT',
    key,
  }),
  declareEnergy: (level: 1 | 2 | 3): DeclareEnergyIntention => ({
    type: 'DECLARE_ENERGY',
    level,
  }),

  // Place/Pick mode
  dropItem: (
    itemId: string,
    targetSlot: number,
    trajectory?: DragTrajectory,
  ): DropItemIntention => ({
    type: 'DROP_ITEM',
    itemId,
    targetSlot,
    trajectory,
  }),
  cancelDrag: (itemId: string): CancelDragIntention => ({
    type: 'CANCEL_DRAG',
    itemId,
  }),
  advance: (): AdvanceIntention => ({ type: 'ADVANCE' }),

  // Memo mode
  selectValue: (
    slot: number,
    modality: ModalityId,
    value: number | string,
    inputMethod?: 'mouse' | 'touch',
  ): SelectValueIntention => ({
    type: 'SELECT_VALUE',
    slot,
    modality,
    value,
    inputMethod,
  }),
  confirmSelection: (): ConfirmSelectionIntention => ({ type: 'CONFIRM_SELECTION' }),

  // Trace mode
  swipe: (
    fromPosition: number,
    toPosition: number,
    inputMethod: InputMethod = 'touch',
  ): SwipeIntention => ({
    type: 'SWIPE',
    fromPosition,
    toPosition,
    inputMethod,
  }),
  tap: (
    position: number | 'center',
    count: 1 | 2,
    inputMethod: InputMethod = 'touch',
  ): TapIntention => ({
    type: 'TAP',
    position,
    count,
    inputMethod,
  }),
  skip: (): SkipIntention => ({ type: 'SKIP' }),
  writingComplete: (
    recognizedLetter: string | null,
    confidence: number,
    strokeData?: unknown,
  ): WritingCompleteIntention => ({
    type: 'WRITING_COMPLETE',
    recognizedLetter,
    confidence,
    strokeData,
  }),
} as const;
