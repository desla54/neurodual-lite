/**
 * TraceSession XState Machine Types
 *
 * Type definitions for the XState-based trace session machine.
 * Replaces the manual State Pattern implementation.
 *
 * Key differences from GameSession:
 * - Two rhythm modes: self-paced and timed
 * - Writing phase for handwriting recognition
 * - Dynamic rules (per-trial modality selection)
 * - Swipe/double-tap input instead of button press
 */

import type {
  TraceTrial,
  TraceModality,
  TraceResponse,
  TraceRunningStats,
  TraceWritingResult,
  TraceSessionSummary,
  TraceModalityResult,
  TraceRhythmMode,
  TracePosition,
} from '../../types/trace';
// Re-export for backward compatibility (moved to types/trace.ts to break cycle)
export { getEnabledModalities } from '../../types/trace';
import type { ModeSpec, TimingSpec } from '../../specs/types';
import type { TraceExtensions } from '../../specs/trace.spec';
import type { AudioPort, ClockPort, PlatformInfoPort, RandomPort } from '../../ports';
import type { TimerPort } from '../../timing';
import type { GameEvent } from '../../engine/events';
import type { Color, Sound } from '../../types/core';
import { TIMING_FEEDBACK_DEFAULT_MS } from '../../specs/thresholds';
import type {
  TraceSessionPlugins,
  TimingSource,
  TimingSourceUpdate,
  ArithmeticResult,
  TraceArithmeticProblem,
} from './trace-session-plugins';

// =============================================================================
// Trace-specific Timing (stricter than base TimingSpec)
// =============================================================================

/**
 * Timing configuration for Trace mode.
 * Makes responseWindowMs and feedbackDurationMs required (not optional).
 * This ensures no fallback values are needed in the machine.
 */
export interface TraceTimingSpec extends TimingSpec {
  /** Response window duration (ms) - REQUIRED for Trace */
  readonly responseWindowMs: number;
  /** Feedback display duration (ms) - REQUIRED for Trace */
  readonly feedbackDurationMs: number;
  /** Warmup stimulus duration (ms) - REQUIRED for Trace */
  readonly warmupStimulusDurationMs: number;
}

// =============================================================================
// Spec Type (ModeSpec with TraceExtensions + strict timing)
// =============================================================================

/**
 * The complete spec type for Trace mode.
 * Includes base ModeSpec plus trace-specific extensions.
 * Uses TraceTimingSpec to ensure all timing values are provided.
 */
export type TraceSpec = Omit<ModeSpec, 'timing'> & {
  timing: TraceTimingSpec;
  extensions: TraceExtensions;
};

// =============================================================================
// Input (for machine creation)
// =============================================================================

/**
 * Input provided when creating the trace session machine actor.
 * Contains all immutable configuration and injected dependencies.
 *
 * SPEC-FIRST: All config values are read from spec.defaults and spec.extensions.
 * No intermediate config type needed.
 */
export interface TraceSessionInput {
  // Identity
  readonly sessionId: string;
  readonly userId: string;

  /** Explicit play context for deterministic events/reports */
  readonly playMode: 'journey' | 'free';

  // Services (injected)
  readonly audio: AudioPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly timer: TimerPort;

  /** Optional command bus for strict command-based event persistence. */
  readonly commandBus?: import('../../ports/command-bus-port').CommandBusPort;

  /**
   * Platform info port (device + display).
   * Used for TRACE_SESSION_STARTED device context without accessing browser APIs in logic.
   */
  readonly platformInfoPort?: PlatformInfoPort;

  /**
   * Plugins - REQUIRED.
   * Created once via createDefaultPlugins(), readonly during session.
   * Machine delegates business logic to these plugins.
   */
  readonly plugins: TraceSessionPlugins;

  /**
   * Mode specification - REQUIRED.
   * The spec is the Single Source of Truth for timing, scoring, and generation.
   * All timing values MUST be read from spec, never hardcoded.
   */
  readonly spec: TraceSpec;

  /**
   * Pre-generated trials with activeModalities for each.
   * Trials are generated once at session creation, not during the session.
   */
  readonly trials: readonly TraceTrial[];

  // Session metadata
  readonly gameMode?: string;
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;

  /**
   * Initial timing source values (computed from spec).
   * Used to initialize the mutable timingSource in context.
   */
  readonly initialTimingSource: TimingSource;

  /**
   * Recovery state for resuming interrupted sessions.
   * If provided, session will resume from the next trial after lastTrialIndex.
   */
  readonly recoveryState?: {
    readonly sessionId: string;
    readonly lastTrialIndex: number;
    readonly startTimestamp: number;
  };
}

// =============================================================================
// Context (Extended State)
// =============================================================================

/**
 * Machine context - all mutable state during the session.
 * Extends input with runtime state that changes during the session.
 */
export interface TraceSessionContext extends TraceSessionInput {
  /**
   * Mutable timing source for hot-reload support.
   * RhythmController reads from this via getter for current timing values.
   * Updated via UPDATE_TIMINGS event from settings overlay.
   */
  timingSource: TimingSource;

  /** Event sequence counter (per session, starts at 0). */
  seq: number;

  // Trial state
  trialIndex: number;
  currentTrial: TraceTrial | null;

  // Timing
  responseStartTime: number;
  sessionStartTime: number;
  phaseStartTime: number;

  // Drift correction (timed mode only)
  /** Session start in AudioContext time (seconds) */
  absoluteSessionStartTime: number;
  /** Target time for next trial end in AudioContext time (seconds) */
  nextTrialTargetTime: number;

  // Response state
  hasResponded: boolean;
  responses: TraceResponse[];

  // Feedback state
  feedbackPosition: number | null;
  feedbackType: 'correct' | 'incorrect' | null;
  feedbackFromUserAction: boolean;

  /** Duration of the immediate position feedback phase (ms) */
  positionFeedbackDurationMs: number;
  /** Duration of the immediate writing feedback phase (ms) */
  writingFeedbackDurationMs: number;

  // Writing state
  writingResult: TraceWritingResult | null;

  // Arithmetic interference state
  /** Current arithmetic problem (expression + answer) */
  arithmeticProblem: TraceArithmeticProblem | null;
  /** Result of arithmetic challenge */
  arithmeticResult: ArithmeticResult | null;

  // Rule visibility (waiting phase)
  ruleVisible: boolean;

  // Stimulus visibility (extinction - goes false after extinctionMs)
  stimulusVisible: boolean;

  // Running stats
  stats: TraceRunningStats;

  // Pause/resume
  pauseElapsedTime: number;
  pausedInPhase: TracePhase | null;
  focusLostTime: number | null;

  // Sequential trace state (only used when spec.extensions.sequentialTrace === true)
  /** Current sequential swipe step index (0..nLevel-1) */
  sequentialStepIndex: number;
  /** Results accumulated per sequential swipe step */
  sequentialStepResults: Array<{
    fromPosition: number;
    toPosition: number;
    expectedFromPosition: number;
    expectedToPosition: number;
    /** Expected positions in gesture space (after dyslat mirror transform) */
    expectedFromGesture: number;
    expectedToGesture: number;
    /** Per-endpoint correctness (case-by-case feedback) */
    fromCorrect: boolean;
    toCorrect: boolean;
    isCorrect: boolean;
  }>;
  /** Current sequential writing step index (0..nLevel-1), oldest-first */
  writingStepIndex: number;

  // Final results
  summary: TraceSessionSummary | null;
  sessionEvents: GameEvent[];
}

// =============================================================================
// Events
// =============================================================================

/**
 * Events that can be sent to the trace session machine.
 * External inputs from UI, focus tracking, and session control.
 */
export type TraceSessionEvent =
  // Session control
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  // Position responses
  | {
      type: 'SWIPE';
      fromPosition: number;
      toPosition: number;
      actionDurationMs?: number;
      inputMethod?: 'mouse' | 'touch' | 'keyboard';
      capturedAtMs?: number;
    }
  | {
      type: 'DOUBLE_TAP';
      position: number;
      inputMethod?: 'mouse' | 'touch' | 'keyboard';
      capturedAtMs?: number;
    }
  | {
      type: 'HOLD';
      position: number;
      actionDurationMs: number;
      inputMethod?: 'mouse' | 'touch' | 'keyboard';
      capturedAtMs?: number;
    }
  | { type: 'CENTER_TAP'; inputMethod?: 'mouse' | 'touch' | 'keyboard'; capturedAtMs?: number }
  | { type: 'SKIP' }
  // Writing
  | { type: 'WRITING_COMPLETE'; result: TraceWritingResult }
  // Arithmetic interference
  | {
      type: 'ARITHMETIC_COMPLETE';
      userAnswer: number;
      confidence: number;
      writingTimeMs: number;
    }
  | { type: 'ARITHMETIC_REFRESH' }
  // Focus tracking
  | { type: 'FOCUS_LOST' }
  | { type: 'FOCUS_REGAINED'; lostDurationMs: number }
  // Settings hot-reload
  | { type: 'UPDATE_TIMINGS'; timings: TimingSourceUpdate };

// =============================================================================
// Phase Type
// =============================================================================

/**
 * Trace session phases.
 * Used for snapshot and pause/resume tracking.
 */
export type TracePhase =
  | 'idle'
  | 'starting'
  | 'countdown'
  | 'stimulus'
  | 'arithmetic'
  | 'ruleReveal'
  | 'response'
  | 'writing'
  | 'positionFeedback'
  | 'writingFeedback'
  | 'waiting'
  | 'preStimGap'
  | 'paused'
  | 'computing'
  | 'finished';

// =============================================================================
// Snapshot (for UI)
// =============================================================================

/**
 * Snapshot of the session state for UI consumption.
 * Derived from the XState machine state by the selector.
 */
export interface TraceSessionSnapshot {
  readonly phase: TracePhase;
  /** Preparation delay before first stimulus in ms (countdown: 3,2,1,0) */
  readonly prepDelayMs: number;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly stimulus: TraceTrial | null;
  readonly feedbackPosition: number | null;
  readonly feedbackType: 'correct' | 'incorrect' | null;
  readonly feedbackFromUserAction: boolean;
  readonly stats: TraceRunningStats;
  readonly nLevel: number;
  readonly rhythmMode: TraceRhythmMode;
  readonly isWarmup: boolean;
  readonly expectedPosition: number | null;
  readonly expectedSound: Sound | null;
  readonly expectedColor: Color | null;
  /** Expected sound for the CURRENT writing step (sequential-aware) */
  readonly expectedWritingSound: Sound | null;
  /** Expected color for the CURRENT writing step (sequential-aware) */
  readonly expectedWritingColor: Color | null;
  /** Expected shape for current trial (image modality) */
  readonly expectedImage: string | null;
  /** Expected digit for current trial (digits modality) */
  readonly expectedDigit: string | null;
  /** Expected emotion for current trial (emotions modality) */
  readonly expectedEmotion: string | null;
  /** Expected word for current trial (words modality) */
  readonly expectedWord: string | null;
  /** Expected tone for current trial (tones modality) */
  readonly expectedTone: string | null;
  /** Expected direction for current trial (spatial modality) */
  readonly expectedSpatialDirection: string | null;
  readonly isPaused: boolean;
  readonly isWriting: boolean;
  readonly writingResult: TraceWritingResult | null;
  /** Whether currently in arithmetic phase */
  readonly isArithmetic: boolean;
  /** Current arithmetic problem (if in arithmetic phase) */
  readonly arithmeticProblem: TraceArithmeticProblem | null;
  /** Result of last arithmetic challenge */
  readonly arithmeticResult: ArithmeticResult | null;
  readonly summary: TraceSessionSummary | null;
  readonly dynamicRules: boolean;
  readonly activeModalities: readonly TraceModality[] | null;
  /** Active modalities of the N-back trial (the one being recalled), for writing step selection */
  readonly nBackActiveModalities: readonly string[] | null;
  readonly enabledModalities: readonly TraceModality[];
  readonly lastModalityResults: Readonly<Record<TraceModality, TraceModalityResult>> | null;
  readonly ruleVisible: boolean;
  /** Whether stimulus is visible (false after extinction delay) */
  readonly stimulusVisible: boolean;
  /** Whether sequential trace mode is active (self-paced + sequentialTrace extension) */
  readonly isSequentialTrace: boolean;
  /** Current sequential swipe step (0 = first step) */
  readonly sequentialStepIndex: number;
  /** Total number of sequential steps (= nLevel) */
  readonly sequentialStepCount: number;
  /** Per-step results for feedback display */
  readonly sequentialStepResults: ReadonlyArray<{
    readonly fromPosition: number;
    readonly toPosition: number;
    readonly expectedFromPosition: number;
    readonly expectedToPosition: number;
    /** Expected positions in gesture space (after dyslat mirror transform) */
    readonly expectedFromGesture: number;
    readonly expectedToGesture: number;
    /** Per-endpoint correctness (case-by-case feedback) */
    readonly fromCorrect: boolean;
    readonly toCorrect: boolean;
    readonly isCorrect: boolean;
  }>;
  /** Current sequential writing step (0 = oldest stimulus T-N) */
  readonly writingStepIndex: number;
}

// =============================================================================
// Timer Actor Input Types
// =============================================================================

/**
 * Input for timer actors that need to handle resume with remaining time.
 */
export interface TimerActorInput {
  readonly context: TraceSessionContext;
  readonly isResume: boolean;
  readonly remainingMs?: number;
}

/**
 * Input for response timer with timed/self-paced mode distinction.
 */
export interface ResponseTimerInput extends TimerActorInput {
  /** Whether this timer should have a timeout (timed mode, non-warmup) */
  readonly hasTimeout: boolean;
}

// =============================================================================
// Helper Types
// =============================================================================

// NOTE: getEnabledModalities moved to types/trace.ts and re-exported above

// =============================================================================
// Context-based Helpers
// =============================================================================
// NOTE: These are convenience wrappers for snapshot selectors.
// The primitive-based equivalents live in response-processor.ts for the plugin.
// If the warmup formula changes (trialIndex < nLevel), update BOTH files.

/**
 * Check if a trial is a warmup trial (first N trials where N = nLevel).
 */
export function isWarmupTrial(context: TraceSessionContext): boolean {
  return context.trialIndex < context.spec.defaults.nLevel;
}

/**
 * Get expected N-back position for current trial.
 * Returns null if warmup trial.
 */
export function getExpectedPosition(context: TraceSessionContext): TracePosition | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.position ?? null;
}

/**
 * Get expected N-back sound for current trial.
 * Returns null if warmup trial.
 */
export function getExpectedSound(context: TraceSessionContext): Sound | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.sound ?? null;
}

/**
 * Get expected sound for the current writing step.
 *
 * In sequential trace mode, writing can be broken into multiple steps (T-N, T-N+1, ...),
 * tracked by context.writingStepIndex. For non-sequential writing, writingStepIndex is 0.
 *
 * Returns null if warmup or out of bounds.
 */
export function getExpectedWritingSound(context: TraceSessionContext): Sound | null {
  if (isWarmupTrial(context)) return null;
  const step = context.writingStepIndex ?? 0;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel + step;
  return context.trials[nBackIndex]?.sound ?? null;
}

/**
 * Get expected N-back color for current trial.
 * Returns null if warmup trial.
 */
export function getExpectedColor(context: TraceSessionContext): Color | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.color ?? null;
}

/**
 * Get expected color for the current writing step.
 *
 * See getExpectedWritingSound() for the sequential rationale.
 * Returns null if warmup or out of bounds.
 */
export function getExpectedWritingColor(context: TraceSessionContext): Color | null {
  if (isWarmupTrial(context)) return null;
  const step = context.writingStepIndex ?? 0;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel + step;
  return context.trials[nBackIndex]?.color ?? null;
}

/**
 * Get expected N-back image for current trial.
 * Returns null if warmup trial or no image on N-back trial.
 */
export function getExpectedImage(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.image ?? null;
}

/**
 * Get expected N-back digit for current trial.
 */
export function getExpectedDigit(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  const digit = context.trials[nBackIndex]?.digit;
  return digit != null ? String(digit) : null;
}

/**
 * Get expected N-back emotion for current trial.
 */
export function getExpectedEmotion(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.emotion ?? null;
}

/**
 * Get expected N-back word for current trial.
 */
export function getExpectedWord(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.word ?? null;
}

/**
 * Get expected N-back tone for current trial.
 */
export function getExpectedTone(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.tone ?? null;
}

/**
 * Get expected N-back spatial direction for current trial.
 */
export function getExpectedSpatialDirection(context: TraceSessionContext): string | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.spatialDirection ?? null;
}

/**
 * Get the active modalities of the N-back trial (the one the user must recall).
 * Used to determine which writing steps to show — must match the trial being recalled,
 * not the current trial (which may have different active modalities with dynamicRules).
 */
export function getNBackActiveModalities(context: TraceSessionContext): readonly string[] | null {
  if (isWarmupTrial(context)) return null;
  const nBackIndex = context.trialIndex - context.spec.defaults.nLevel;
  return context.trials[nBackIndex]?.activeModalities ?? null;
}

/**
 * Calculate the expected duration of one complete trial cycle.
 * Used for drift correction in timed mode.
 */
export function getTrialCycleDuration(spec: TraceSpec): number {
  const timing = spec.timing;
  const ext = spec.extensions;
  return (
    timing.stimulusDurationMs +
    (timing.responseWindowMs ?? 0) +
    (timing.feedbackDurationMs ?? TIMING_FEEDBACK_DEFAULT_MS) +
    ext.ruleDisplayMs +
    timing.intervalMs
  );
}
