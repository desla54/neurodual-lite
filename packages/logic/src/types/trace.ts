/**
 * Trace Types - Dual Trace Mode
 *
 * Types for the Trace mode where users swipe to indicate the N-back position
 * or double-tap for matches, and optionally trace handwritten letters.
 *
 * Dynamic Rules:
 * Each trial has activeModalities specifying which modalities are "scorable".
 * - Responding on non-requested modality = False Alarm
 * - Not responding on requested modality = Miss
 * This forces cognitive flexibility and prevents automatism.
 *
 * Two rhythm modes:
 * - 'self-paced': Wait for user response before continuing (tour par tour)
 * - 'timed': Automatic progression with time window (continu/séquence)
 */

import type { Color, SDTCounts, Sound } from './core';
import {
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_TEMPO,
  TIMING_STIMULUS_TRACE_MS,
  TIMING_STIMULUS_TRACE_WARMUP_MS,
  TIMING_INTERVAL_TRACE_MS,
  TIMING_RESPONSE_WINDOW_TRACE_MS,
  TIMING_RULE_DISPLAY_TRACE_MS,
  TIMING_FEEDBACK_MS,
  TRACE_WRITING_MIN_SIZE_PX,
  TRACE_WRITING_TIMEOUT_MS,
  TRACE_WRITING_GRID_FADE_OPACITY,
  type ImageShape,
  type DigitValue,
  type EmotionValue,
  type WordValue,
  type ToneValue,
  type SpatialDirection,
} from '../specs/thresholds';

// =============================================================================
// Trace Modalities
// =============================================================================

/**
 * Modality types for Trace mode.
 * - 'position': Swipe/draw direction for N-back position
 * - 'audio': Write the N-back letter (handwriting)
 * - 'color': Select the N-back color (circular selector)
 * - 'image': Select the N-back shape (circular selector)
 * - 'digits': Write the N-back digit (handwriting)
 * - 'emotions': Select the N-back emotion (circular selector)
 * - 'words': Write the N-back word (handwriting)
 * - 'tones': Write the N-back note name (handwriting)
 * - 'spatial': Draw direction for spatial N-back (same as position)
 */
export type TraceModality =
  | 'position'
  | 'audio'
  | 'color'
  | 'image'
  | 'digits'
  | 'emotions'
  | 'words'
  | 'tones'
  | 'spatial';

/**
 * Trace grid position.
 *
 * Note: Unlike other modes that use the classic 8-position pool (0..7),
 * Dual Trace can run on true 3×4 / 4×3 / 4×4 grids. In that case, positions
 * are full grid indices (0..11 or 0..15 depending on gridMode).
 *
 * The valid range is therefore spec-driven by the effective grid mode:
 * - '3x3'  → 8 positions (excludes center)
 * - '3x4'  → 12 positions
 * - '4x3'  → 12 positions
 * - '4x4'  → 16 positions
 */
export type TracePosition = number;

/**
 * Swipe direction for dynamic swipe rules.
 * - 'n-to-target': Swipe from current stimulus (N) to N-back position (target)
 * - 'target-to-n': Swipe from N-back position (target) to current stimulus (N)
 */
export type SwipeDirection = 'n-to-target' | 'target-to-n';

/**
 * Mirror axis for dyslatéralisation.
 * - 'horizontal': Left↔Right flip (requires even number of columns)
 * - 'vertical': Top↔Bottom flip (requires even number of rows)
 */
export type MirrorAxis = 'horizontal' | 'vertical';

// =============================================================================
// Writing Zone Config (Flexible Handwriting Integration)
// =============================================================================

/**
 * Writing zone display mode.
 * - 'grid-overlay': Write on top of the grid (grid fades to background)
 * - 'target-cell': Write inside the target cell only
 * - 'floating-zone': Dedicated zone above/beside the grid
 * - 'fullscreen': Full screen writing surface
 */
export type TraceWritingMode = 'grid-overlay' | 'target-cell' | 'floating-zone' | 'fullscreen';

/**
 * Configuration for the handwriting phase.
 */
export interface TraceWritingConfig {
  /** Whether handwriting is enabled */
  readonly enabled: boolean;
  /** Display mode for writing zone */
  readonly mode: TraceWritingMode;
  /** Minimum size of writing zone in px (ensures usability on mobile) */
  readonly minSizePx: number;
  /** Maximum time to complete writing (ms) */
  readonly timeoutMs: number;
  /** Grid opacity during writing phase (0-1) */
  readonly gridFadeOpacity: number;
  /** Whether to show the expected letter as hint */
  readonly showHint: boolean;
}

/** @see thresholds.ts SSOT for numeric values */
export const DEFAULT_TRACE_WRITING_CONFIG: TraceWritingConfig = {
  enabled: false,
  mode: 'grid-overlay',
  minSizePx: TRACE_WRITING_MIN_SIZE_PX,
  timeoutMs: TRACE_WRITING_TIMEOUT_MS, // 60s safety timeout - user submits via OK button
  gridFadeOpacity: TRACE_WRITING_GRID_FADE_OPACITY,
  showHint: false,
};

// =============================================================================
// Session Config
// =============================================================================

/**
 * Rhythm mode for trace sessions.
 * - 'self-paced': User controls pace, trial waits for response or skip
 * - 'timed': Automatic progression with response time window
 */
export type TraceRhythmMode = 'self-paced' | 'timed';

/**
 * Configuration for a trace session.
 */
export interface TraceSessionConfig {
  readonly nLevel: number;
  readonly trialsCount: number;
  /** Rhythm mode: self-paced or timed (default: timed) */
  readonly rhythmMode: TraceRhythmMode;
  /** Duration of stimulus display (ms) */
  readonly stimulusDurationMs: number;
  /** Response window duration for timed mode (ms) */
  readonly responseWindowMs: number;
  /** Feedback display duration (ms) */
  readonly feedbackDurationMs: number;
  /** Rule indicator display duration (ms) - shown after feedback */
  readonly ruleDisplayMs: number;
  /** Interval between trials - blank gap after rule before next stimulus (ms) */
  readonly intervalMs: number;
  /** Warmup stimulus duration (longer for memorization, ms) */
  readonly warmupStimulusDurationMs: number;
  /** Whether to play audio feedback sounds (default: true) */
  readonly soundEnabled: boolean;
  /** Whether to play audio letter stimulus (default: false) */
  readonly audioEnabled: boolean;
  /** Whether color modality is enabled (default: false) */
  readonly colorEnabled: boolean;
  /** Handwriting configuration */
  readonly writing: TraceWritingConfig;
  /**
   * Dynamic rules: each trial has random active modalities.
   * Distribution: 80% pairs, 10% single, 10% all three.
   * When disabled, all enabled modalities are always active.
   */
  readonly dynamicRules: boolean;
  /**
   * Dynamic swipe direction: each trial has random swipe direction.
   * Only applies when position is the only active modality.
   * Distribution: 50% n-to-target, 50% target-to-n.
   */
  readonly dynamicSwipeDirection: boolean;
}

/** @see thresholds.ts SSOT for numeric values, aligns with DualTraceSpec */
export const DEFAULT_TRACE_SESSION_CONFIG: TraceSessionConfig = {
  nLevel: DEFAULT_N_LEVEL,
  trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
  rhythmMode: 'timed',
  stimulusDurationMs: TIMING_STIMULUS_TRACE_MS, // 2s to see and memorize position
  responseWindowMs: TIMING_RESPONSE_WINDOW_TRACE_MS, // 3s response window in timed mode
  feedbackDurationMs: TIMING_FEEDBACK_MS, // 1.5s feedback - long enough to see result
  ruleDisplayMs: TIMING_RULE_DISPLAY_TRACE_MS, // 1s rule indicator display
  intervalMs: TIMING_INTERVAL_TRACE_MS, // 0.5s blank gap before next stimulus
  warmupStimulusDurationMs: TIMING_STIMULUS_TRACE_WARMUP_MS, // 2.5s warmup - more time to memorize
  soundEnabled: true, // Audio feedback enabled by default
  audioEnabled: false, // Audio letter stimulus disabled by default
  colorEnabled: false, // Color modality disabled by default
  writing: DEFAULT_TRACE_WRITING_CONFIG,
  dynamicRules: false, // Dynamic rules disabled by default (option)
  dynamicSwipeDirection: false, // Dynamic swipe direction disabled by default
};

// =============================================================================
// Trial Types
// =============================================================================

/**
 * A single trace trial - position, audio letter, and color.
 * Includes activeModalities for dynamic rule system.
 */
export interface TraceTrial {
  readonly position: TracePosition;
  readonly sound: Sound; // Audio letter stimulus
  readonly color: Color; // Color of the stimulus
  /**
   * Which modalities are "scorable" for this trial.
   * Responding on non-active modality = False Alarm.
   * Not responding on active modality = Miss.
   */
  readonly activeModalities: readonly TraceModality[];
  /**
   * Required swipe direction for this trial (dynamic swipe rules).
   * - 'n-to-target': Swipe from current position to N-back position
   * - 'target-to-n': Swipe from N-back position to current position
   * Only relevant when dynamicSwipeDirection is enabled.
   */
  readonly swipeDirection?: SwipeDirection;
  /**
   * Mirror axis for this trial (dynamic mirror axis).
   * Only relevant when dyslatéralisation dynamicMirrorAxis is enabled.
   */
  readonly mirrorAxis?: MirrorAxis;
  /** Expected shape stimulus (image modality) */
  readonly image?: ImageShape;
  /** Expected digit stimulus (digits modality) */
  readonly digit?: DigitValue;
  /** Expected emotion stimulus (emotions modality) */
  readonly emotion?: EmotionValue;
  /** Expected word stimulus (words modality) */
  readonly word?: WordValue;
  /** Expected tone stimulus (tones modality) */
  readonly tone?: ToneValue;
  /** Expected spatial direction (spatial modality) */
  readonly spatialDirection?: SpatialDirection;
}

/**
 * Response type for a trace trial.
 * - 'swipe': User swiped from one position to another
 * - 'double-tap': User double-tapped (indicating match)
 * - 'hold': User pressed and held on the current position (mindful timing mode)
 * - 'reject': User explicitly rejected position response (double-tap center)
 * - 'timeout': No response within time window (timed mode only)
 * - 'skip': User skipped (self-paced mode only)
 */
export type TraceResponseType = 'swipe' | 'double-tap' | 'hold' | 'reject' | 'timeout' | 'skip';

/**
 * SDT result for a single modality.
 */
export type TraceModalityResult = 'hit' | 'miss' | 'falseAlarm' | 'correctRejection';

/**
 * Result of a single trace response, with SDT per modality.
 */
export interface TraceResponse {
  readonly trialIndex: number;
  readonly responseType: TraceResponseType;
  /** Target position for swipe, or current position for double-tap */
  readonly position: TracePosition | null;
  /** Expected N-back position (null for warmup) */
  readonly expectedPosition: TracePosition | null;
  /** Expected N-back sound (null for warmup) */
  readonly expectedSound: Sound | null;
  /** Expected N-back color (null for warmup) */
  readonly expectedColor: Color | null;
  /** User's color response (null if not provided) */
  readonly colorResponse: Color | null;
  readonly isCorrect: boolean;
  readonly isWarmup: boolean;
  readonly responseTimeMs: number | null;
  /** Monotonic timestamp when response was made */
  readonly responseAtMs: number | null;
  /** Handwriting result (if writing phase enabled) */
  readonly writingResult?: TraceWritingResult;
  /**
   * SDT result per modality (for dynamic rules).
   * Only present when dynamic rules are enabled.
   */
  readonly modalityResults?: Readonly<Record<TraceModality, TraceModalityResult>>;
  /** Which modalities were requested for this trial */
  readonly activeModalities?: readonly TraceModality[];
  /** Input method used for this response (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
  /** Timestamp when the input was captured (for processing lag calculation) */
  readonly capturedAtMs?: number;
  /** Duration of the executed position action itself (gesture / hold), when available. */
  readonly actionDurationMs?: number | null;
  /** Duration target used for acceptance, when a mindful timing rule was active. */
  readonly timingTargetMs?: number | null;
  /** Accepted tolerance around the duration target, when a mindful timing rule was active. */
  readonly timingToleranceMs?: number | null;
  /** Whether the measured action duration satisfied the mindful timing rule. */
  readonly timingAccepted?: boolean | null;
}

// =============================================================================
// Running Stats
// =============================================================================

/**
 * SDT stats for a single modality.
 * @deprecated Use SDTCounts from types/core.ts instead.
 */
export type TraceModalityStats = SDTCounts;

/**
 * Running stats during trace session.
 */
export interface TraceRunningStats {
  readonly trialsCompleted: number;
  readonly warmupTrials: number;
  readonly correctResponses: number;
  readonly incorrectResponses: number;
  readonly timeouts: number;
  readonly accuracy: number;
  /** Per-modality SDT stats (only when dynamic rules enabled) */
  readonly modalityStats?: Readonly<Record<TraceModality, TraceModalityStats>>;
}

export function createEmptyModalityStats(): TraceModalityStats {
  return {
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
  };
}

export function createEmptyTraceStats(): TraceRunningStats {
  return {
    trialsCompleted: 0,
    warmupTrials: 0,
    correctResponses: 0,
    incorrectResponses: 0,
    timeouts: 0,
    accuracy: 0,
  };
}

/**
 * Create empty modalityStats for all enabled modalities.
 */
export function createEmptyAllModalityStats(
  enabledModalities: readonly TraceModality[],
): Record<TraceModality, TraceModalityStats> {
  const stats: Partial<Record<TraceModality, TraceModalityStats>> = {};
  for (const modality of enabledModalities) {
    stats[modality] = createEmptyModalityStats();
  }
  return stats as Record<TraceModality, TraceModalityStats>;
}

/**
 * Compute SDT result for a single modality.
 *
 * @param isActive - Whether this modality was requested for the trial
 * @param didRespond - Whether the user responded (swipe, draw, select) vs rejected (no action)
 * @param wasCorrect - Whether the response was correct
 * @param hadTarget - Whether there was a target to recall (expected value exists)
 */
export function computeModalityResult(
  isActive: boolean,
  didRespond: boolean,
  wasCorrect: boolean,
  hadTarget: boolean,
): TraceModalityResult {
  if (isActive) {
    // Modality was requested (scored this trial)
    if (hadTarget) {
      // There was a target to recall
      if (didRespond && wasCorrect) {
        return 'hit'; // Correctly identified target
      }
      return 'miss'; // Failed to identify target (no response, wrong response, or incorrect rejection)
    }
    // No target to recall (should reject)
    if (!didRespond || wasCorrect) {
      return 'correctRejection'; // Correctly rejected or correct empty response
    }
    return 'falseAlarm'; // Responded when there was nothing to recall
  }
  // Modality was NOT requested (not scored this trial)
  if (didRespond) {
    // User responded on non-requested modality = false alarm
    return 'falseAlarm';
  }
  // Correctly did not respond on non-requested modality
  return 'correctRejection';
}

/**
 * Compute SDT results for all modalities in a trial.
 *
 * @param activeModalities - Modalities requested for this trial
 * @param enabledModalities - All modalities enabled in settings
 * @param positionCorrect - Whether position response was correct (null = no response)
 * @param audioCorrect - Whether audio (writing) response was correct (null = no response/not enabled)
 * @param colorCorrect - Whether color selection was correct (null = no response/not enabled)
 * @param hadPositionTarget - Whether there was a position to recall (expectedPosition !== null)
 * @param hadAudioTarget - Whether there was a sound to recall (expectedSound !== null)
 * @param hadColorTarget - Whether there was a color to recall (expectedColor !== null)
 * @param hadImageTarget - Whether there was an image to recall
 * @param hadDigitTarget - Whether there was a digit to recall
 * @param hadEmotionTarget - Whether there was an emotion to recall
 * @param hadWordTarget - Whether there was a word to recall
 * @param hadToneTarget - Whether there was a tone to recall
 * @param hadSpatialTarget - Whether there was a spatial direction to recall
 */
export function computeAllModalityResults(
  activeModalities: readonly TraceModality[],
  enabledModalities: readonly TraceModality[],
  positionCorrect: boolean | null,
  audioCorrect: boolean | null,
  colorCorrect: boolean | null,
  hadPositionTarget: boolean,
  hadAudioTarget: boolean,
  hadColorTarget: boolean,
  imageCorrect?: boolean | null,
  digitCorrect?: boolean | null,
  emotionCorrect?: boolean | null,
  wordCorrect?: boolean | null,
  toneCorrect?: boolean | null,
  directionCorrect?: boolean | null,
  hadImageTarget?: boolean,
  hadDigitTarget?: boolean,
  hadEmotionTarget?: boolean,
  hadWordTarget?: boolean,
  hadToneTarget?: boolean,
  hadSpatialTarget?: boolean,
): Record<TraceModality, TraceModalityResult> {
  const results: Partial<Record<TraceModality, TraceModalityResult>> = {};

  for (const modality of enabledModalities) {
    const isActive = activeModalities.includes(modality);

    switch (modality) {
      case 'position': {
        const didRespond = positionCorrect !== null;
        const wasCorrect = positionCorrect === true;
        results.position = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadPositionTarget,
        );
        break;
      }
      case 'audio': {
        const didRespond = audioCorrect !== null;
        const wasCorrect = audioCorrect === true;
        results.audio = computeModalityResult(isActive, didRespond, wasCorrect, hadAudioTarget);
        break;
      }
      case 'color': {
        const didRespond = colorCorrect !== null;
        const wasCorrect = colorCorrect === true;
        results.color = computeModalityResult(isActive, didRespond, wasCorrect, hadColorTarget);
        break;
      }
      case 'image': {
        const correct = imageCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.image = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadImageTarget ?? false,
        );
        break;
      }
      case 'digits': {
        const correct = digitCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.digits = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadDigitTarget ?? false,
        );
        break;
      }
      case 'emotions': {
        const correct = emotionCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.emotions = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadEmotionTarget ?? false,
        );
        break;
      }
      case 'words': {
        const correct = wordCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.words = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadWordTarget ?? false,
        );
        break;
      }
      case 'tones': {
        const correct = toneCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.tones = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadToneTarget ?? false,
        );
        break;
      }
      case 'spatial': {
        const correct = directionCorrect ?? null;
        const didRespond = correct !== null;
        const wasCorrect = correct === true;
        results.spatial = computeModalityResult(
          isActive,
          didRespond,
          wasCorrect,
          hadSpatialTarget ?? false,
        );
        break;
      }
    }
  }

  return results as Record<TraceModality, TraceModalityResult>;
}

/**
 * Update modalityStats with a new result for a modality.
 */
export function updateModalityStats(
  stats: TraceModalityStats,
  result: TraceModalityResult,
): TraceModalityStats {
  switch (result) {
    case 'hit':
      return { ...stats, hits: stats.hits + 1 };
    case 'miss':
      return { ...stats, misses: stats.misses + 1 };
    case 'falseAlarm':
      return { ...stats, falseAlarms: stats.falseAlarms + 1 };
    case 'correctRejection':
      return { ...stats, correctRejections: stats.correctRejections + 1 };
  }
}

// =============================================================================
// Session Summary
// =============================================================================

/**
 * Complete summary of a trace session.
 */
export interface TraceSessionSummary {
  readonly sessionId: string;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly rhythmMode: TraceRhythmMode;
  readonly finalStats: TraceRunningStats;
  readonly durationMs: number;
  readonly completed: boolean;
  /** Score 0-100 based on accuracy */
  readonly score: number;
  /** All responses for replay/analysis */
  readonly responses: readonly TraceResponse[];
}

// =============================================================================
// Phases
// =============================================================================

/**
 * Trace session phases.
 */
export type TracePhase =
  | 'idle' // Initial state, waiting for start()
  | 'starting' // Initializing session
  | 'countdown' // 3,2,1,0 countdown before first trial
  | 'stimulus' // Showing stimulus position
  | 'arithmetic' // Arithmetic interference phase (after stimulus)
  | 'ruleReveal' // Show rule indicator after arithmetic, before response
  | 'response' // Waiting for user response (timed mode)
  | 'writing' // Handwriting phase (after position response)
  | 'positionFeedback' // Immediate feedback for position response
  | 'writingFeedback' // Immediate feedback for writing validation
  | 'waiting' // Rule display phase (showing rule indicator)
  | 'preStimGap' // Empty gap between rule and stimulus (memory enforcement)
  | 'paused' // Session paused
  | 'computing' // Computing session summary
  | 'finished'; // Session complete

// =============================================================================
// Writing Result
// =============================================================================

/**
 * Result of handwriting recognition for a trial.
 * Includes optional color selection for color modality.
 */
export interface TraceWritingResult {
  /** Letter recognized by CNN */
  readonly recognizedLetter: string | null;
  /** Expected N-back letter */
  readonly expectedLetter: string | null;
  /** Whether recognition matched expected */
  readonly isCorrect: boolean;
  /** Confidence score from CNN (0-1) */
  readonly confidence: number;
  /** Time spent writing (ms) */
  readonly writingTimeMs: number;
  /** Whether user timed out */
  readonly timedOut: boolean;
  /** Color selected by user (color modality) */
  readonly selectedColor: Color | null;
  /** Expected N-back color (color modality) */
  readonly expectedColor: Color | null;
  /** Whether color selection matched expected (null when color is not requested) */
  readonly colorCorrect: boolean | null;
  /** Image selected by user (image modality) */
  readonly selectedImage?: string | null;
  /** Expected N-back image shape (image modality) */
  readonly expectedImage?: string | null;
  /** Whether image selection matched expected */
  readonly imageCorrect?: boolean | null;
  /** Digit recognized by handwriting (digits modality) */
  readonly recognizedDigit?: string | null;
  /** Expected N-back digit (digits modality) */
  readonly expectedDigit?: string | null;
  /** Whether digit recognition matched expected */
  readonly digitCorrect?: boolean | null;
  /** Emotion selected by user (emotions modality) */
  readonly selectedEmotion?: string | null;
  /** Expected N-back emotion (emotions modality) */
  readonly expectedEmotion?: string | null;
  /** Whether emotion selection matched expected */
  readonly emotionCorrect?: boolean | null;
  /** Word recognized by handwriting (words modality) */
  readonly recognizedWord?: string | null;
  /** Expected N-back word (words modality) */
  readonly expectedWord?: string | null;
  /** Whether word recognition matched expected */
  readonly wordCorrect?: boolean | null;
  /** Tone recognized by handwriting (tones modality) */
  readonly recognizedTone?: string | null;
  /** Expected N-back tone (tones modality) */
  readonly expectedTone?: string | null;
  /** Whether tone recognition matched expected */
  readonly toneCorrect?: boolean | null;
  /** Direction recognized by user (spatial modality) */
  readonly recognizedDirection?: string | null;
  /** Expected N-back direction (spatial modality) */
  readonly expectedDirection?: string | null;
  /** Whether direction recognition matched expected */
  readonly directionCorrect?: boolean | null;
  /** Duration target used for acceptance, when a mindful timing rule was active. */
  readonly timingTargetMs?: number | null;
  /** Accepted tolerance around the duration target, when a mindful timing rule was active. */
  readonly timingToleranceMs?: number | null;
  /** Whether the measured writing duration satisfied the mindful timing rule. */
  readonly timingAccepted?: boolean | null;
}

export interface TraceDurationValidationResult {
  readonly accepted: boolean;
  readonly minMs: number;
  readonly maxMs: number;
}

export function validateTraceActionDuration(
  durationMs: number,
  targetMs: number,
  toleranceMs: number,
): TraceDurationValidationResult {
  const safeDuration = Math.max(0, durationMs);
  const safeTarget = Math.max(0, targetMs);
  const safeTolerance = Math.max(0, toleranceMs);
  const minMs = Math.max(0, safeTarget - safeTolerance);
  const maxMs = safeTarget + safeTolerance;

  return {
    accepted: safeDuration >= minMs && safeDuration <= maxMs,
    minMs,
    maxMs,
  };
}

// =============================================================================
// Modality Utilities
// =============================================================================

/**
 * Minimal interface for extracting enabled modalities.
 * This avoids importing TraceExtensions from specs to prevent circular deps.
 */
interface TraceExtensionsForModalities {
  readonly audioEnabled: boolean;
  readonly colorEnabled: boolean;
  readonly imageEnabled?: boolean;
  readonly digitsEnabled?: boolean;
  readonly emotionsEnabled?: boolean;
  readonly wordsEnabled?: boolean;
  readonly tonesEnabled?: boolean;
  readonly spatialEnabled?: boolean;
}

/**
 * Enabled modalities derived from spec extensions.
 * Used by machine context initialization and snapshot selectors.
 */
export function getEnabledModalities(
  extensions: TraceExtensionsForModalities,
): readonly TraceModality[] {
  const modalities: TraceModality[] = ['position'];
  if (extensions.audioEnabled) modalities.push('audio');
  if (extensions.colorEnabled) modalities.push('color');
  if (extensions.imageEnabled) modalities.push('image');
  if (extensions.digitsEnabled) modalities.push('digits');
  if (extensions.emotionsEnabled) modalities.push('emotions');
  if (extensions.wordsEnabled) modalities.push('words');
  if (extensions.tonesEnabled) modalities.push('tones');
  if (extensions.spatialEnabled) modalities.push('spatial');
  return modalities;
}

// =============================================================================
// Mirror Grid Utilities (Dyslatéralisation)
// =============================================================================

/**
 * Compute the mirror position in a grid along a given axis.
 *
 * Horizontal (left↔right):  row * cols + (cols - 1 - col)
 * Vertical   (top↔bottom):  (rows - 1 - row) * cols + col
 *
 * @example 3×4 horizontal: 0↔3, 1↔2, 4↔7, 5↔6, 8↔11, 9↔10
 * @example 4×3 vertical:   0↔9, 1↔10, 2↔11, 3↔6, 4↔7, 5↔8
 */
export function getMirrorPosition(
  position: number,
  gridCols: number,
  gridRows: number,
  axis: MirrorAxis,
): number {
  const row = Math.floor(position / gridCols);
  const col = position % gridCols;
  if (axis === 'vertical') {
    return (gridRows - 1 - row) * gridCols + col;
  }
  return row * gridCols + (gridCols - 1 - col);
}

/** Grid mode: rows×cols layout identifier. */
export type GridMode = '3x3' | '3x4' | '4x3' | '4x4';

/** Get grid dimensions from a grid mode string. */
export function getGridDimensions(gridMode: GridMode): {
  cols: number;
  rows: number;
  positions: number;
} {
  switch (gridMode) {
    case '3x4':
      return { cols: 4, rows: 3, positions: 12 };
    case '4x3':
      return { cols: 3, rows: 4, positions: 12 };
    case '4x4':
      return { cols: 4, rows: 4, positions: 16 };
    default:
      return { cols: 3, rows: 3, positions: 8 };
  }
}
