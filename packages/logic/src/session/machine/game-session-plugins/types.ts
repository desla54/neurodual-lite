/**
 * GameSession Plugin Types
 *
 * Type definitions for the plugin architecture.
 * Follows the same pattern as TraceSessionPlugins.
 *
 * PRINCIPLES:
 * - Data in / Data out: Plugins receive explicit inputs, return pure data
 * - Machine = orchestrator: Only the machine calls services (audio.play, timer.wait)
 * - No mutation: Plugins return results, machine does assign()
 * - No coupling: Plugins don't call each other, pass through explicit inputs
 */

import type { ModeSpec } from '../../../specs/types';
import type { Trial, ModalityId, ResponseRecord } from '../../../domain';
import type { TrialVerdict, TrialJudge } from '../../../judge';
import type { TrialFeedback } from '../../../types';
import type { GameEvent } from '../../../engine';

// =============================================================================
// ResponseProcessor
// =============================================================================

/**
 * Input for processing a response.
 */
export interface ResponseInput {
  readonly modalityId: string;
  readonly inputMethod: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot';
  readonly stimulusStartTime: number; // AudioContext time (seconds)
  readonly currentAudioTime: number; // AudioContext time (seconds)
  readonly sessionId: string;
  readonly trialIndex: number;
  readonly currentPhase: 'stimulus' | 'waiting' | null;
}

/**
 * Result of processing a response.
 */
export interface ResponseResult {
  readonly isValid: boolean;
  readonly rt: number | null; // Reaction time ms
  readonly isDuplicate: boolean;
  readonly isTooFast: boolean; // < minValidRtMs
  readonly filtered: {
    readonly reason: 'too_fast' | 'touch_bounce';
    readonly reactionTimeMs: number | null;
    readonly minValidRtMs?: number;
    readonly deltaSinceFirstMs?: number;
  } | null;
  readonly duplicateEvent: GameEvent | null;
  readonly updates: {
    readonly pressed: boolean;
    readonly rt: number | null;
  } | null;
}

/**
 * ResponseProcessor validates user responses.
 * Detects duplicates, filters too-fast responses.
 */
export interface ResponseProcessor {
  /**
   * Validate a response for a modality.
   */
  processResponse(
    input: ResponseInput,
    existingResponse: ResponseRecord | undefined,
    activeModalities: readonly string[],
  ): ResponseResult;

  /**
   * Get minimum valid RT from spec.
   */
  getMinValidRtMs(): number;
}

// =============================================================================
// TrialEndProcessor
// =============================================================================

/**
 * Scoring strategy type.
 */
export type ScoringStrategy = 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy';

/**
 * Input for processing end of trial.
 */
export interface TrialEndInput {
  readonly trial: Trial;
  readonly responses: Map<ModalityId, ResponseRecord>;
  readonly activeModalities: readonly string[];
  readonly passThreshold: number;
  readonly downThreshold: number | undefined;
  readonly scoringStrategy: ScoringStrategy;
}

/**
 * Result of processing end of trial.
 */
export interface TrialEndResult {
  /** Verdict from judge (if available) */
  readonly verdict: TrialVerdict | null;

  /** Feedback for adaptive generator */
  readonly generatorFeedback: TrialFeedback | null;

  /** Audio feedback decisions */
  readonly feedbackSounds: ReadonlyArray<'correct' | 'incorrect'>;
}

/**
 * TrialEndProcessor evaluates trial results.
 * Uses judge for verdict, builds generator feedback.
 */
export interface TrialEndProcessor {
  /**
   * Process end of trial: judge evaluation, generator feedback.
   */
  processTrial(input: TrialEndInput, judge: TrialJudge | null): TrialEndResult;
}

// =============================================================================
// AudioPolicy
// =============================================================================

/**
 * AudioPolicy decides what sounds to play.
 * Does NOT call audio.play() - machine orchestrates that.
 */
export interface AudioPolicy {
  /**
   * Check if audio feedback is enabled.
   */
  isAudioFeedbackEnabled(): boolean;

  /**
   * Get sounds to play based on verdict.
   */
  getFeedbackSounds(verdict: TrialVerdict | null): ReadonlyArray<'correct' | 'incorrect'>;
}

// =============================================================================
// RhythmController
// =============================================================================

/**
 * Timing adjustment result after resume.
 */
export interface ResumeTimingAdjustment {
  readonly nextTrialTargetTime: number;
  readonly stimulusStartTime: number;
}

/**
 * RhythmController manages timing and drift correction.
 */
export interface RhythmController {
  /**
   * Check if self-paced mode.
   */
  isSelfPaced(): boolean;

  /**
   * Get stimulus duration for timer.
   */
  getStimulusDuration(): number;

  /**
   * Get ISI (inter-stimulus interval).
   */
  getIsi(): number;

  /**
   * Calculate next trial target time with drift correction.
   */
  getNextTrialTarget(currentTargetTime: number, currentAudioTime: number, isiMs: number): number;

  /**
   * Adjust timing after resume from pause.
   */
  adjustAfterResume(
    pauseDurationMs: number,
    pauseElapsedTimeMs: number,
    nextTrialTargetTime: number,
    stimulusStartTime: number,
    currentAudioTime: number,
  ): ResumeTimingAdjustment;

  /**
   * Calculate waiting duration with drift correction.
   */
  calculateWaitingDuration(targetTime: number, currentTime: number, isiMs: number): number;

  /**
   * Get self-paced max timeout.
   */
  getSelfPacedMaxTimeout(): number;
}

// =============================================================================
// ModalityEvaluator
// =============================================================================

/**
 * Input for modality evaluation.
 */
export interface ModalityEvalInput {
  readonly trial: Trial;
  readonly responses: Map<ModalityId, ResponseRecord>;
  readonly activeModalities: readonly string[];
}

/**
 * Per-modality feedback result.
 */
export interface ModalityFeedbackResult {
  readonly wasTarget: boolean;
  readonly isCorrect: boolean;
  readonly reactionTime: number | undefined;
}

/**
 * Result of modality evaluation.
 */
export interface ModalityEvalResult {
  readonly byModality: Record<string, ModalityFeedbackResult>;
  readonly isAnyTarget: boolean;
  readonly isCorrect: boolean;
  readonly minReactionTime: number | undefined;
}

/**
 * ModalityEvaluator scores responses per modality.
 * Used for adaptive generator feedback.
 */
export interface ModalityEvaluator {
  /**
   * Evaluate response correctness per modality.
   */
  evaluate(input: ModalityEvalInput): ModalityEvalResult;
}

// =============================================================================
// AudioVisualSyncPolicy
// =============================================================================

/**
 * Sync mode for audio-visual synchronization.
 */
export type SyncMode = 'single-audio' | 'multi-audio' | 'visual-only';

/**
 * AudioVisualSyncPolicy determines sync configuration.
 */
export interface AudioVisualSyncPolicy {
  /**
   * Check if multi-audio mode (BrainWorkshop).
   */
  hasMultiAudio(): boolean;

  /**
   * Get visual offset delay from spec (start).
   */
  getVisualOffsetMs(): number;

  /**
   * Get post-visual offset (end): compensates render delay at extinction.
   */
  getPostVisualOffsetMs(): number;

  /**
   * Get multi-audio stagger delay.
   */
  getMultiAudioStaggerMs(): number;

  /**
   * Determine sync mode based on active modalities.
   */
  getSyncMode(trial: Trial | null): SyncMode;

  /**
   * Get audio sync buffer.
   */
  getAudioSyncBufferMs(): number;
}

// =============================================================================
// GameSessionPlugins (Container)
// =============================================================================

/**
 * Container for all GameSession plugins.
 * Created once via factory, readonly during session.
 */
export interface GameSessionPlugins {
  readonly response: ResponseProcessor;
  readonly trialEnd: TrialEndProcessor;
  readonly audio: AudioPolicy;
  readonly rhythm: RhythmController;
  readonly modality: ModalityEvaluator;
  readonly audioVisualSync: AudioVisualSyncPolicy;
}

// =============================================================================
// Factory Config
// =============================================================================

/**
 * Configuration for creating default plugins.
 */
export interface CreateDefaultPluginsConfig {
  readonly spec: ModeSpec;
  /** User's configured modalities (may differ from spec.defaults) */
  readonly activeModalities: readonly string[];
  readonly feedbackConfig?: { visualFeedback: boolean; audioFeedback: boolean };
}
