/**
 * TraceSession Plugin Types
 *
 * Interfaces for the 5 plugins that handle business logic:
 * - ResponseProcessor: swipe/tap validation
 * - ModalityEvaluator: SDT per modality (optional if dynamicRules)
 * - AudioPolicy: stimulus/feedback sounds
 * - WritingOrchestrator: writing phase (optional)
 * - RhythmController: timing self-paced vs timed
 *
 * PRINCIPLES:
 * 1. Data in / Data out: Plugins receive explicit inputs, return pure data
 * 2. No side effects: Plugins don't call audio.play() or timer.wait()
 * 3. Machine orchestrates: Machine calls services based on plugin returns
 * 4. No coupling: Plugins don't call each other, pass through explicit inputs
 */

import type { Sound, Color, ToneValue } from '../../../types/core';
import type {
  TraceTrial,
  TraceModality,
  TraceResponse,
  TraceRunningStats,
  TraceWritingResult,
  TraceModalityResult,
  TraceRhythmMode,
} from '../../../types/trace';

// Re-export types needed by composition.ts
export type { TraceRunningStats } from '../../../types/trace';

// =============================================================================
// ResponseProcessor Types
// =============================================================================

/**
 * Input for swipe validation.
 * Explicit data - no context dependency.
 */
export interface SwipeInput {
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly responseTimeMs: number;
  readonly responseAtMs: number;
  readonly actionDurationMs?: number;
  /** Input method used for this response (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
  /** Timestamp when the input was captured (for processing lag calculation) */
  readonly capturedAtMs?: number;
}

/**
 * Input for double-tap validation.
 */
export interface DoubleTapInput {
  readonly position: number;
  readonly responseTimeMs: number;
  readonly responseAtMs: number;
  /** Input method used for this response (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
  /** Timestamp when the input was captured (for processing lag calculation) */
  readonly capturedAtMs?: number;
}

export interface HoldInput {
  readonly position: number;
  readonly responseTimeMs: number;
  readonly responseAtMs: number;
  readonly actionDurationMs: number;
  /** Input method used for this response (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
  /** Timestamp when the input was captured (for processing lag calculation) */
  readonly capturedAtMs?: number;
}

/**
 * Input for center-tap (rejection) validation.
 */
export interface CenterTapInput {
  readonly responseTimeMs: number;
  readonly responseAtMs: number;
  /** Input method used for this response (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
  /** Timestamp when the input was captured (for processing lag calculation) */
  readonly capturedAtMs?: number;
}

/**
 * Result from response processing.
 * Contains both the response and UI updates.
 * Machine only does assign() with these values.
 */
export interface ResponseResult {
  readonly response: TraceResponse;
  readonly updates: {
    readonly feedbackPosition: number | null;
    readonly feedbackType: 'correct' | 'incorrect' | null;
  };
}

/**
 * Validates user responses (swipe, double-tap, center-tap).
 * Pure functions that compute correctness without side effects.
 */
export interface ResponseProcessor {
  /**
   * Process a swipe gesture.
   * @param input - Swipe coordinates and timing
   * @param trial - Current trial being responded to
   * @param trialIndex - Index of current trial
   * @param trials - All trials (needed for N-back lookup)
   */
  processSwipe(
    input: SwipeInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult;

  /**
   * Process a double-tap gesture.
   */
  processDoubleTap(
    input: DoubleTapInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult;

  /**
   * Process a press-and-hold position match.
   */
  processHold(
    input: HoldInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult;

  /**
   * Process a center-tap (explicit rejection).
   */
  processCenterTap(
    input: CenterTapInput,
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
  ): ResponseResult;

  /**
   * Process a skip (user pressed skip button in self-paced mode).
   */
  processSkip(
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
    responseAtMs: number,
  ): ResponseResult;

  /**
   * Process a timeout (timed mode only).
   */
  processTimeout(
    trial: TraceTrial,
    trialIndex: number,
    trials: readonly TraceTrial[],
    responseAtMs: number,
  ): ResponseResult;

  /**
   * Check if a trial is a warmup trial.
   * Warmup trials are the first N trials where N = nLevel.
   */
  isWarmupTrial(trialIndex: number): boolean;

  /**
   * Get the expected N-back position for a trial.
   * Returns null if warmup or no N-back target.
   */
  getExpectedPosition(trialIndex: number, trials: readonly TraceTrial[]): number | null;

  /**
   * Get the expected N-back sound for a trial.
   */
  getExpectedSound(trialIndex: number, trials: readonly TraceTrial[]): Sound | null;

  /**
   * Get the expected N-back color for a trial.
   */
  getExpectedColor(trialIndex: number, trials: readonly TraceTrial[]): Color | null;
}

// =============================================================================
// ModalityEvaluator Types
// =============================================================================

/**
 * Input for modality evaluation.
 * Passed explicitly from response + writingResult.
 */
export interface ModalityEvalInput {
  readonly response: TraceResponse;
  readonly activeModalities: readonly TraceModality[];
  readonly writingResult: TraceWritingResult | null;
  readonly hadPositionTarget: boolean;
  readonly hadAudioTarget: boolean;
  readonly hadColorTarget: boolean;
  readonly hadImageTarget: boolean;
  readonly hadDigitTarget: boolean;
  readonly hadEmotionTarget: boolean;
  readonly hadWordTarget: boolean;
  readonly hadToneTarget: boolean;
  readonly hadSpatialTarget: boolean;
}

/**
 * Result from modality evaluation.
 * Returns NEW stats, doesn't mutate.
 */
export interface ModalityEvalResult {
  readonly results: Record<TraceModality, TraceModalityResult>;
  readonly updatedStats: TraceRunningStats;
}

/**
 * Evaluates SDT results per modality.
 * Only active when dynamicRules is enabled.
 */
export interface ModalityEvaluator {
  /**
   * Check if modality evaluation is enabled.
   * Returns true if dynamicRules is enabled in spec.
   */
  isEnabled(): boolean;

  /**
   * Get all enabled modalities.
   */
  getEnabledModalities(): readonly TraceModality[];

  /**
   * Evaluate a trial's modality results.
   * Returns new stats (immutable update).
   */
  evaluate(input: ModalityEvalInput, currentStats: TraceRunningStats): ModalityEvalResult;
}

// =============================================================================
// AudioPolicy Types
// =============================================================================

/**
 * Audio plan to play for stimulus.
 * - sound: play the specific letter sound
 * - tone: play the specific tone stimulus
 * - click: play a click sound fallback
 * - null: no sound
 */
export interface StimulusSoundDecision {
  readonly sound?: Sound;
  readonly tone?: ToneValue;
  readonly click?: boolean;
}

/**
 * Sound to play for feedback.
 * - 'correct': play correct sound
 * - 'incorrect': play incorrect sound
 * - null: no sound
 */
export type FeedbackSoundDecision = 'correct' | 'incorrect' | null;

/**
 * Decides which sounds to play.
 * Returns WHAT to play, machine ORCHESTRATES the call.
 */
export interface AudioPolicy {
  /**
   * Get the sound to play for a stimulus.
   * Based on spec.extensions.audioEnabled, soundEnabled and the trial payload.
   */
  getStimulusSound(trial: TraceTrial | null): StimulusSoundDecision | null;

  /**
   * Get the sound to play for feedback.
   * Based on spec.extensions.soundEnabled.
   */
  getFeedbackSound(feedbackType: 'correct' | 'incorrect' | null): FeedbackSoundDecision;

  /**
   * Check if audio modality is enabled (letter sounds).
   */
  isAudioEnabled(): boolean;

  /**
   * Check if feedback sounds are enabled.
   */
  isSoundEnabled(): boolean;
}

// =============================================================================
// WritingOrchestrator Types
// =============================================================================

/**
 * Manages the optional writing phase.
 * Used for all writing/selection modalities that follow the position response.
 */
export interface WritingTimeoutExpectations {
  readonly expectedSound: Sound | null;
  readonly expectedColor: Color | null;
  readonly expectedImage?: string | null;
  readonly expectedDigit?: string | number | null;
  readonly expectedEmotion?: string | null;
  readonly expectedWord?: string | null;
  readonly expectedTone?: ToneValue | string | null;
  readonly expectedSpatialDirection?: string | null;
}

export interface WritingOrchestrator {
  /**
   * Check if writing phase is needed for a trial.
   * True if not warmup, writing is enabled, and trial requests at least one writing modality.
   */
  needsWritingPhase(
    trialIndex: number,
    isWarmup: boolean,
    activeModalities?: readonly TraceModality[],
  ): boolean;

  /**
   * Get the timeout duration for writing phase.
   */
  getTimeoutMs(): number;

  /**
   * Create a timeout result when writing times out.
   */
  createTimeoutResult(expectations: WritingTimeoutExpectations): TraceWritingResult;

  /**
   * Check if writing is enabled in spec.
   */
  isWritingEnabled(): boolean;
}

// =============================================================================
// TimingSource Types (Mutable timing values for hot-reload)
// =============================================================================

/**
 * Mutable timing values that can be updated during a session.
 * Lives in context, read by RhythmController.
 *
 * This enables hot-reload of timing settings from the in-game settings overlay
 * without restarting the session.
 */
export interface TimingSource {
  /** Stimulus display duration (ms) */
  stimulusDurationMs: number;
  /** Warmup stimulus duration (ms) */
  warmupStimulusDurationMs: number;
  /** Response window duration (ms) - 0 in self-paced mode */
  responseWindowMs: number;
  /** Feedback display duration (ms) */
  feedbackDurationMs: number;
  /** Rule display duration (ms) */
  ruleDisplayMs: number;
  /** Interval/blank gap duration (ms) */
  intervalMs: number;
  /** Sound enabled for feedback */
  soundEnabled: boolean;
}

/**
 * Partial update for timing source.
 * Only specified fields will be updated.
 */
export type TimingSourceUpdate = Partial<TimingSource>;

// =============================================================================
// RhythmController Types
// =============================================================================

/**
 * Timing for waiting phase (rule display + interval).
 */
export interface WaitingTiming {
  readonly ruleDisplayMs: number;
  readonly intervalMs: number;
}

/**
 * Controls timing based on rhythm mode (self-paced vs timed).
 * Returns DURATIONS, machine ORCHESTRATES timer calls.
 */
export interface RhythmController {
  /**
   * Get the current rhythm mode.
   */
  getMode(): TraceRhythmMode;

  /**
   * Check if timed mode.
   */
  isTimed(): boolean;

  /**
   * Check if self-paced mode.
   */
  isSelfPaced(): boolean;

  /**
   * Get stimulus duration.
   * @param isWarmup - Warmup trials may have longer duration
   */
  getStimulusDurationMs(isWarmup: boolean): number;

  /**
   * Get response window duration.
   * Returns 0 in self-paced mode (no timeout).
   */
  getResponseWindowMs(): number;

  /**
   * Get feedback display duration.
   */
  getFeedbackDurationMs(): number;

  /**
   * Get rule display duration.
   */
  getRuleDisplayMs(): number;

  /**
   * Get interval duration (blank gap after rule).
   */
  getIntervalMs(): number;

  /**
   * Get total trial cycle duration.
   */
  getTrialCycleDurationMs(): number;

  /**
   * Calculate waiting timing with drift correction (timed mode).
   * @param targetTime - Target time for next trial (AudioContext time in seconds)
   * @param currentTime - Current AudioContext time in seconds
   * @returns Actual durations to use (may be compressed if behind schedule)
   */
  calculateWaitingTiming(targetTime: number, currentTime: number): WaitingTiming;
}

// =============================================================================
// ArithmeticOrchestrator Types
// =============================================================================

/**
 * Result from arithmetic challenge.
 * Tracks the problem, user answer, and correctness.
 */
export interface ArithmeticResult {
  /** The expression shown (e.g., "3 + 5 - 2 + 4 - 1") */
  readonly expression: string;
  /** The correct answer */
  readonly correctAnswer: number;
  /** The user's written answer (null if timed out) */
  readonly userAnswer: number | null;
  /** Whether the answer was correct */
  readonly isCorrect: boolean;
  /** Confidence from digit recognition (0-1) */
  readonly confidence: number;
  /** Time spent writing the answer (ms) */
  readonly writingTimeMs: number;
  /** Whether the challenge timed out */
  readonly timedOut: boolean;
}

// =============================================================================
// Arithmetic Problem Types (Trace)
// =============================================================================

export type TraceArithmeticCueToken = 'V' | 'N';

export interface TraceArithmeticColorCue {
  /** Digit shown on the left side during cue phase */
  readonly leftDigit: number;
  /** Digit shown on the right side during cue phase */
  readonly rightDigit: number;
  /** Token/color on the left side: 'V' (green) or 'N' (neutral/black) */
  readonly leftToken: TraceArithmeticCueToken;
  /** Token/color on the right side: always opposite of leftToken */
  readonly rightToken: TraceArithmeticCueToken;
}

export type TraceArithmeticProblem =
  | {
      readonly variant: 'simple';
      /** The expression shown (e.g., "3 + 5 - 2 + 4 - 1") */
      readonly expression: string;
      /** The correct answer */
      readonly answer: number;
    }
  | {
      readonly variant: 'color-cue-2step';
      /** The expression shown during solve (e.g., "V + 4") */
      readonly expression: string;
      /** The correct answer */
      readonly answer: number;
      /** First step: cue to memorize (two digits with opposite colors) */
      readonly cue: TraceArithmeticColorCue;
      /** Duration of the cue display before switching to solve */
      readonly cueDisplayMs: number;
    }
  | {
      /**
       * Grid-linked V/N cue + arithmetic chain.
       * Cue digits are derived from the last stimulus position (normal vs inverse indexing).
       */
      readonly variant: 'grid-cue-chain';
      /** The expression shown during solve (e.g., "V + 5 - 2 + 4") */
      readonly expression: string;
      /** The correct answer */
      readonly answer: number;
      /** First step: cue to memorize (two digits with opposite colors) */
      readonly cue: TraceArithmeticColorCue;
      /** Duration of the cue display before switching to solve */
      readonly cueDisplayMs: number;
    };

/**
 * Manages the arithmetic interference phase.
 * Inserts between stimulus and rule reveal to occupy phonological loop.
 *
 * Key behavior:
 * - Wrong answer = trial rejected (counted as incorrect)
 * - No answer (timeout) = trial rejected
 * - Must get correct answer to proceed
 */
export interface ArithmeticOrchestrator {
  /**
   * Check if arithmetic interference is enabled.
   */
  isEnabled(): boolean;

  /**
   * Check if arithmetic phase is needed for a trial.
   * Returns false for warmup trials.
   */
  needsArithmeticPhase(trialIndex: number, isWarmup: boolean): boolean;

  /**
   * Generate a new arithmetic problem.
   * Returns expression and expected answer.
   */
  generateProblem(input?: {
    /** Last shown stimulus position (current trial). */
    readonly stimulusPosition?: number | null;
    /** Previous stimulus position (trialIndex - 1). */
    readonly previousStimulusPosition?: number | null;
  }): TraceArithmeticProblem;

  /**
   * Get the timeout duration for the arithmetic phase.
   */
  getTimeoutMs(): number;

  /**
   * Create a timeout result when arithmetic times out.
   */
  createTimeoutResult(expression: string, correctAnswer: number): ArithmeticResult;

  /**
   * Validate user's answer and create result.
   * @param expression - The expression shown
   * @param correctAnswer - Expected answer
   * @param userAnswer - User's written answer
   * @param confidence - Recognition confidence
   * @param writingTimeMs - Time spent
   */
  validateAnswer(
    expression: string,
    correctAnswer: number,
    userAnswer: number,
    confidence: number,
    writingTimeMs: number,
  ): ArithmeticResult;
}

// =============================================================================
// AdaptiveTimingController Types
// =============================================================================

/**
 * Outcome of a single trial for adaptive timing.
 * Used to track accuracy in a sliding window.
 */
export interface TraceTrialOutcome {
  readonly isCorrect: boolean;
  readonly responseTimeMs: number | null;
  readonly isWarmup: boolean;
}

/**
 * Serializable state for adaptive timing controller.
 * Can be persisted and restored across sessions.
 */
export interface AdaptiveTimingState {
  readonly estimatedAccuracy: number;
  readonly recentTrials: readonly TraceTrialOutcome[];
  readonly trialCount: number;
  /** Current adaptive values (clamped to bounds) */
  readonly currentValues: {
    readonly stimulusDurationMs: number;
    readonly extinctionRatio: number;
    readonly responseWindowMs: number;
  };
}

/**
 * Controls adaptive timing to maintain target accuracy.
 * Adjusts stimulus duration, extinction ratio, and response window
 * based on recent performance.
 *
 * PRINCIPLES:
 * - Data out: returns values, doesn't mutate TimingSource
 * - Pure calculation: deterministic given same input
 * - Machine orchestrates: machine applies the adjustments to TimingSource
 */
export interface AdaptiveTimingController {
  /**
   * Check if adaptive timing is enabled.
   */
  isEnabled(): boolean;

  /**
   * Record a trial outcome for accuracy tracking.
   * Call this after each trial completes (skip warmup trials).
   * @param outcome - Trial outcome (correctness, RT, warmup status)
   */
  onTrialCompleted(outcome: TraceTrialOutcome): void;

  /**
   * Get the current estimated accuracy (EMA-smoothed).
   * Returns a value between 0 and 1.
   */
  getEstimatedAccuracy(): number;

  /**
   * Get the current adaptive extinction ratio.
   * Higher accuracy → lower ratio (harder to remember).
   */
  getCurrentExtinctionRatio(): number;

  /**
   * Get the current adaptive stimulus duration.
   * Higher accuracy → shorter duration (less time to encode).
   */
  getCurrentStimulusDurationMs(): number;

  /**
   * Get the current adaptive response window (timed mode only).
   * Higher accuracy → shorter window (more time pressure).
   */
  getCurrentResponseWindowMs(): number;

  /**
   * Get the number of non-warmup trials completed.
   */
  getTrialCount(): number;

  /**
   * Serialize the controller state for persistence.
   */
  serialize(): AdaptiveTimingState;

  /**
   * Restore controller state from serialized data.
   * @param state - Previously serialized state
   */
  restore(state: AdaptiveTimingState): void;
}

// =============================================================================
// Plugin Container
// =============================================================================

/**
 * Container for all plugins.
 * Created once via factory, readonly in context.
 */
export interface TraceSessionPlugins {
  readonly response: ResponseProcessor;
  readonly modality: ModalityEvaluator;
  readonly audio: AudioPolicy;
  readonly writing: WritingOrchestrator;
  readonly rhythm: RhythmController;
  readonly arithmetic: ArithmeticOrchestrator;
  readonly adaptiveTiming: AdaptiveTimingController;
}
