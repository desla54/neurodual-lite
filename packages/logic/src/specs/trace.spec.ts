/**
 * Dual Trace Mode Specification
 *
 * SINGLE SOURCE OF TRUTH for Dual Trace behavior.
 *
 * Dual Trace is an active recall mode where:
 * - User sees a stimulus position
 * - User swipes to indicate the N-back position
 * - Or double-taps for matches
 * - Optionally traces handwritten letters
 *
 * Two rhythm modes:
 * - 'self-paced': User controls pace (tour par tour)
 * - 'timed': Automatic progression with time window
 */

import type { ModeSpec } from './types';
import {
  // Scoring
  TRACE_ACCURACY_PASS_NORMALIZED,
  // Timing
  TIMING_SESSION_PREP_MS,
  TIMING_STIMULUS_TRACE_WARMUP_MS,
  TIMING_RESPONSE_WINDOW_TRACE_MS,
  TIMING_RULE_DISPLAY_TRACE_MS,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  // Defaults
  DEFAULT_TRIALS_COUNT_TEMPO,
  // Trace-specific
  TRACE_WRITING_MIN_SIZE_PX,
  TRACE_WRITING_TIMEOUT_MS,
  TRACE_WRITING_GRID_FADE_OPACITY,
  // Trace Arithmetic Interference
  TRACE_ARITHMETIC_MIN_OPERATIONS,
  TRACE_ARITHMETIC_MAX_OPERATIONS,
  TRACE_ARITHMETIC_MIN_RESULT,
  TRACE_ARITHMETIC_MAX_RESULT,
  TRACE_ARITHMETIC_MAX_DIGIT,
  TRACE_ARITHMETIC_TIMEOUT_MS,
  // Colors
  MODE_COLOR_DUAL_TRACE,
} from './thresholds';

// =============================================================================
// Trace-specific Extensions
// =============================================================================

/**
 * Writing zone display modes.
 */
export type TraceWritingMode = 'grid-overlay' | 'target-cell' | 'floating-zone' | 'fullscreen';

/**
 * Rhythm mode for trace sessions.
 */
export type TraceRhythmMode = 'self-paced' | 'timed';

/**
 * Arithmetic interference configuration.
 * When enabled, inserts an arithmetic challenge between stimulus and rule reveal.
 * Forces the phonological loop to be occupied, preventing position chunking.
 */
export interface ArithmeticInterferenceConfig {
  /** Whether arithmetic interference is enabled */
  readonly enabled: boolean;
  /** Variant of arithmetic interference (keeps legacy behavior by default). */
  readonly variant: 'simple' | 'color-cue-2step' | 'grid-cue-chain';
  /** Minimum number of operations in the chain (e.g., 4 = "3 + 5 - 2 + 4") */
  readonly minOperations: number;
  /** Maximum number of operations */
  readonly maxOperations: number;
  /** Minimum allowed result (to avoid negative numbers) */
  readonly minResult: number;
  /** Maximum allowed result (1-2 digits, easy to write) */
  readonly maxResult: number;
  /** Maximum digit value in operations (0-9) */
  readonly maxDigit: number;
  /** Timeout for writing the answer (ms) */
  readonly timeoutMs: number;
  /** Display duration for the color cue (2-step variant only). */
  readonly cueDisplayMs: number;
}

export interface TraceMindfulTimingConfig {
  /** Enables duration-constrained gestures/writing in self-paced non-sequential sessions. */
  readonly enabled: boolean;
  /** Target duration for swipe / hold position actions (ms). */
  readonly positionDurationMs: number;
  /** Accepted tolerance around the position target duration (ms). */
  readonly positionToleranceMs: number;
  /** Target duration for writing actions (ms). */
  readonly writingDurationMs: number;
  /** Accepted tolerance around the writing target duration (ms). */
  readonly writingToleranceMs: number;
}

/**
 * Trace-specific extensions to the base ModeSpec.
 */
export interface TraceExtensions {
  /** Rhythm mode */
  readonly rhythmMode: TraceRhythmMode;

  /** Rule display duration after feedback (ms) */
  readonly ruleDisplayMs: number;

  /** Whether audio feedback sounds are enabled */
  readonly soundEnabled: boolean;

  /** Whether audio letter stimulus is enabled */
  readonly audioEnabled: boolean;

  /** Whether color modality is enabled */
  readonly colorEnabled: boolean;

  /** Whether image modality is enabled */
  readonly imageEnabled?: boolean;

  /** Whether digits modality is enabled */
  readonly digitsEnabled?: boolean;

  /** Whether emotions modality is enabled */
  readonly emotionsEnabled?: boolean;

  /** Whether words modality is enabled */
  readonly wordsEnabled?: boolean;

  /** Whether tones modality is enabled */
  readonly tonesEnabled?: boolean;

  /** Whether spatial modality is enabled */
  readonly spatialEnabled?: boolean;

  /**
   * Adaptive timing enabled (experimental).
   * When enabled, the session may adjust timing based on performance.
   */
  readonly adaptiveTimingEnabled: boolean;

  /**
   * Dynamic rules: each trial has random active modalities.
   * Distribution: 80% pairs, 10% single, 10% all three.
   */
  readonly dynamicRules: boolean;

  /**
   * Dynamic swipe direction: each trial has random swipe direction.
   * Only applies when position is the only active modality.
   * Distribution: 50% n-to-target, 50% target-to-n.
   */
  readonly dynamicSwipeDirection: boolean;

  /** Handwriting configuration */
  readonly writing: {
    readonly enabled: boolean;
    readonly mode: TraceWritingMode;
    readonly minSizePx: number;
    readonly timeoutMs: number;
    readonly gridFadeOpacity: number;
    readonly showHint: boolean;
  };

  /** Arithmetic interference configuration */
  readonly arithmeticInterference: ArithmeticInterferenceConfig;

  /** Dyslatéralisation configuration (mirror grid + mirror swipe) */
  readonly dyslatéralisation: {
    readonly gridMode: '3x3' | '3x4' | '4x3' | '4x4';
    readonly mirrorSwipe: boolean;
    /** Mirror axis: horizontal (L↔R), vertical (T↔B), or dynamic (random H/V per trial) */
    readonly mirrorAxis: 'horizontal' | 'vertical' | 'dynamic';
  };

  /**
   * Sequential trace mode: instead of one swipe T→T-N, user performs N sequential swipes
   * T→T-1, T-1→T-2, ..., T-(N-1)→T-N. Only active in self-paced mode.
   */
  readonly sequentialTrace: boolean;

  /** Duration-constrained gesture / writing option ("pleine conscience"). */
  readonly mindfulTiming: TraceMindfulTimingConfig;
}

/**
 * Type alias for Trace mode specs.
 * Use this in machine input types instead of raw ModeSpec.
 */
export type TraceSpec = ModeSpec & { extensions: TraceExtensions };

// =============================================================================
// Dual Trace Specification
// =============================================================================

export const DualTraceSpec: TraceSpec = {
  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------
  metadata: {
    id: 'dual-trace',
    displayName: 'Dual Trace',
    description: 'Swipe vers la position N-back à chaque stimulus. Rappel actif permanent.',
    tags: ['training', 'active', 'swipe'],
    difficultyLevel: 3,
    version: '1.0.0',
  },

  // ---------------------------------------------------------------------------
  // Session Type
  // ---------------------------------------------------------------------------
  sessionType: 'TraceSession',

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------
  /**
   * Scoring Strategy: Accuracy-based (beta threshold)
   *
   * **Passed Calculation**:
   * 1. Count correct swipe/tap responses / total responses
   * 2. Score = accuracy * 100 (percentage 0-100)
   * 3. `passed = score >= 70%` (TRACE_ACCURACY_PASS)
   *
   * **Note**: Lower threshold (70% vs 80%) due to beta mode status.
   * Mode is still being refined for difficulty balance.
   *
   * **Dynamic Rules**: When enabled, each trial has varying active modalities
   * (position/audio/color). Responding on non-active modality = false alarm.
   *
   * **Judge Implementation**: AccuracyJudge
   * **Code**: packages/logic/src/judge/accuracy-judge.ts:128
   */
  scoring: {
    strategy: 'accuracy',
    passThreshold: TRACE_ACCURACY_PASS_NORMALIZED, // 70%, lower for beta
  },

  // ---------------------------------------------------------------------------
  // Timing (all in milliseconds)
  // ---------------------------------------------------------------------------
  timing: {
    prepDelayMs: TIMING_SESSION_PREP_MS,
    stimulusDurationMs: 1000, // 1s (mode-specific default)
    intervalMs: 500, // 0.5s blank gap between trials
    responseWindowMs: TIMING_RESPONSE_WINDOW_TRACE_MS,
    feedbackDurationMs: 1000, // 1s (mode-specific default)
    warmupStimulusDurationMs: TIMING_STIMULUS_TRACE_WARMUP_MS,
  },

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------
  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: GEN_LURE_PROBABILITY_DEFAULT,
    sequenceMode: 'tempo',
  },

  // ---------------------------------------------------------------------------
  // Session Defaults
  // ---------------------------------------------------------------------------
  defaults: {
    nLevel: 1, // Mode-specific default: start at level 1
    trialsCount: DEFAULT_TRIALS_COUNT_TEMPO, // 20 trials
    activeModalities: ['position', 'audio', 'image', 'emotions', 'spatial'], // All modalities for testing
  },

  // ---------------------------------------------------------------------------
  // Adaptivity
  // ---------------------------------------------------------------------------
  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: [
      'nLevel',
      'trialsCount',
      'rhythmMode',
      'activeModalities',
      'dynamicRules',
      'dynamicSwipeDirection',
      'mindfulTimingEnabled',
      'mindfulPositionDurationMs',
      'mindfulPositionToleranceMs',
      'mindfulWritingDurationMs',
      'mindfulWritingToleranceMs',
      'arithmeticInterferenceVariant',
    ],
  },

  // ---------------------------------------------------------------------------
  // Report Configuration
  // ---------------------------------------------------------------------------
  report: {
    sections: [
      'HERO',
      'RECENT_TREND',
      'PERFORMANCE',
      'INSIGHTS',
      'SPEED',
      'NEXT_STEP',
      'REWARD_INDICATOR',
      'DETAILS',
    ],
    display: {
      modeScoreKey: 'report.modeScore.traceAccuracy',
      modeScoreTooltipKey: 'report.modeScore.traceAccuracyTooltip',
      speedStatKey: 'report.speed.responseTime',
      insightMetrics: ['confidence', 'responseTime', 'writingAccuracy'],
      colors: MODE_COLOR_DUAL_TRACE,
    },
  },

  // ---------------------------------------------------------------------------
  // Stats Configuration (Aggregate Stats Page)
  // ---------------------------------------------------------------------------
  stats: {
    simple: {
      sections: [
        'ACTIVITY_KPIS',
        'SESSIONS_PER_DAY',
        'PERFORMANCE_KPIS',
        'MODE_SCORE',
        'EVOLUTION_ACCURACY',
        'EVOLUTION_N_LEVEL',
        'MODALITY_TABLE',
        'ERROR_PROFILE',
      ],
    },
    advanced: {
      sections: [
        'UPS_SUMMARY',
        'MODE_SCORE',
        'DISTRIBUTION',
        'TIMING_STATS',
        'TIMING_BY_MODALITY',
        'TIMING_VARIABILITY',
        'ERROR_AWARENESS',
        'SDT_MODALITY_TABLE',
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Trace-specific Extensions
  // ---------------------------------------------------------------------------
  extensions: {
    rhythmMode: 'self-paced', // Tour par tour by default
    ruleDisplayMs: TIMING_RULE_DISPLAY_TRACE_MS, // 1s
    soundEnabled: false, // Disabled by default (feedback sounds not recommended for training)
    audioEnabled: false, // Audio letter stimulus disabled by default
    colorEnabled: false, // Color modality disabled by default
    imageEnabled: false, // Image modality disabled by default
    digitsEnabled: false, // Digits modality disabled by default
    emotionsEnabled: false, // Emotions modality disabled by default
    wordsEnabled: false, // Words modality disabled by default
    tonesEnabled: false, // Tones modality disabled by default
    spatialEnabled: false, // Spatial modality disabled by default
    dynamicRules: false, // Dynamic rules disabled by default
    dynamicSwipeDirection: false, // Dynamic swipe direction disabled by default
    adaptiveTimingEnabled: false, // Adaptive timing disabled by default

    writing: {
      enabled: true,
      mode: 'grid-overlay',
      minSizePx: TRACE_WRITING_MIN_SIZE_PX,
      timeoutMs: TRACE_WRITING_TIMEOUT_MS,
      gridFadeOpacity: TRACE_WRITING_GRID_FADE_OPACITY,
      showHint: false,
    },

    arithmeticInterference: {
      enabled: false,
      variant: 'simple',
      minOperations: TRACE_ARITHMETIC_MIN_OPERATIONS,
      maxOperations: TRACE_ARITHMETIC_MAX_OPERATIONS,
      minResult: TRACE_ARITHMETIC_MIN_RESULT,
      maxResult: TRACE_ARITHMETIC_MAX_RESULT,
      maxDigit: TRACE_ARITHMETIC_MAX_DIGIT,
      timeoutMs: TRACE_ARITHMETIC_TIMEOUT_MS,
      cueDisplayMs: 1000,
    },

    dyslatéralisation: {
      gridMode: '3x3',
      mirrorSwipe: false,
      mirrorAxis: 'horizontal',
    },

    sequentialTrace: false,

    mindfulTiming: {
      enabled: false,
      positionDurationMs: 3000,
      positionToleranceMs: 200,
      writingDurationMs: 2000,
      writingToleranceMs: 200,
    },
  },
};

// =============================================================================
// Helper: Build TraceSessionConfig from Spec
// =============================================================================

/**
 * Build a TraceSessionConfig object from the spec.
 * This is what gets passed to TraceSession.
 */
export function buildTraceSessionConfig(
  overrides: Partial<{
    nLevel: number;
    trialsCount: number;
    rhythmMode: TraceRhythmMode;
    activeModalities: readonly string[];
  }> = {},
) {
  const spec = DualTraceSpec;

  // All timing values come from spec (which imports from thresholds.ts SSOT)
  // No fallbacks needed since DualTraceSpec.timing is complete
  return {
    nLevel: overrides.nLevel ?? spec.defaults.nLevel,
    trialsCount: overrides.trialsCount ?? spec.defaults.trialsCount,
    rhythmMode: overrides.rhythmMode ?? spec.extensions.rhythmMode,
    stimulusDurationMs: spec.timing.stimulusDurationMs,
    responseWindowMs: spec.timing.responseWindowMs,
    feedbackDurationMs: spec.timing.feedbackDurationMs,
    ruleDisplayMs: spec.extensions.ruleDisplayMs,
    intervalMs: spec.timing.intervalMs,
    warmupStimulusDurationMs: spec.timing.warmupStimulusDurationMs,
    soundEnabled: spec.extensions.soundEnabled,
    audioEnabled: spec.extensions.audioEnabled,
    colorEnabled: spec.extensions.colorEnabled,
    writing: spec.extensions.writing,
    dynamicRules: spec.extensions.dynamicRules,
    dynamicSwipeDirection: spec.extensions.dynamicSwipeDirection,
    arithmeticInterference: spec.extensions.arithmeticInterference,
  };
}
