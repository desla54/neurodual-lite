/**
 * Memo Mode Specification (Dual Memo)
 *
 * SINGLE SOURCE OF TRUTH for Memo-based game modes.
 *
 * Memo mode:
 * - User sees stimuli sequence
 * - Then must reconstruct the N-back window from memory
 * - Active recall without visible references
 */

import type { ModeSpec } from './types';
import {
  // Scoring
  ACCURACY_PASS_NORMALIZED,
  // Timing
  TIMING_STIMULUS_RECALL_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_FEEDBACK_MS,
  // Generation
  GEN_TARGET_PROBABILITY_HIGH,
  GEN_LURE_PROBABILITY_NONE,
  // Defaults
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_FLOW,
  // Recall-specific
  RECALL_WINDOW_DEPTH,
  RECALL_PROGRESSIVE_INITIAL_DEPTH,
  RECALL_PROGRESSIVE_EXPANSION_THRESHOLD,
  RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD,
  RECALL_PROGRESSIVE_OBSERVATION_WINDOWS,
  RECALL_PROGRESSIVE_COOLDOWN_WINDOWS,
  // Colors
  MODE_COLOR_DUAL_MEMO,
} from './thresholds';

// =============================================================================
// Memo-specific Extensions
// =============================================================================

/**
 * Memo-specific extensions to the base ModeSpec.
 */
export interface MemoExtensions {
  /** Window depth (N levels to recall) */
  readonly windowDepth: number;
  /** Feedback duration after each recall window */
  readonly feedbackDurationMs: number;
  /** Feedback mode: 'none' (no session pause) or 'on-commit' (show corrections) */
  readonly feedbackMode?: 'none' | 'on-commit';
  /** Fill order mode: 'sequential' or 'random' (cell-level anti-chunking) */
  readonly fillOrderMode?: 'sequential' | 'random';
  /** Color-code trials for visual anchoring */
  readonly trialColorCoding?: boolean;
  /** Progressive window config */
  readonly progressiveWindow?: {
    readonly enabled: boolean;
    readonly initialDepth: number;
    readonly expansionThreshold: number;
    readonly contractionThreshold: number;
    readonly observationWindows: number;
    readonly cooldownWindows: number;
  };
  /** Disable window depth adaptation (for Journey fixed difficulty) */
  readonly disableWindowAdaptation?: boolean;
  /** Initial lure probability for adaptive generator */
  readonly initialLureProbability?: number;
}

/**
 * Type alias for Memo mode specs.
 * Use this in machine input types instead of raw ModeSpec.
 */
export type MemoSpec = ModeSpec & { extensions: MemoExtensions };

// =============================================================================
// Dual Memo Specification
// =============================================================================

export const DualMemoSpec: MemoSpec = {
  metadata: {
    id: 'dual-memo',
    displayName: 'Dual Memo',
    description: "Mode de rappel actif. Remplis les cartes N, N-1, N-2 avant d'avancer.",
    tags: ['training', 'recall', 'manual'],
    difficultyLevel: 2,
    version: '1.0.0',
  },

  sessionType: 'MemoSession',

  /**
   * Scoring Strategy: Accuracy-based
   *
   * **Passed Calculation**:
   * 1. Count correct memory recalls / total cell picks
   * 2. Score = accuracy * 100 (percentage 0-100)
   * 3. `passed = score >= 80%` (ACCURACY_PASS)
   *
   * **Note**: Each cell (slot × modality) is evaluated independently.
   * Progressive window mode may reduce # of cells based on performance.
   *
   * **Judge Implementation**: AccuracyJudge
   * **Code**: packages/logic/src/judge/accuracy-judge.ts:128
   */
  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TIMING_STIMULUS_RECALL_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS, // Not used in recall (user-paced)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_HIGH,
    lureProbability: GEN_LURE_PROBABILITY_NONE,
    sequenceMode: 'memo',
  },

  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
    activeModalities: ['position', 'audio'],
  },

  adaptivity: {
    algorithm: 'adaptive',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount', 'activeModalities', 'algorithm'],
  },

  report: {
    sections: [
      'HERO',
      'RECENT_TREND',
      'PERFORMANCE',
      'INSIGHTS',
      'NEXT_STEP',
      'REWARD_INDICATOR',
      'DETAILS',
    ],
    display: {
      modeScoreKey: 'report.modeScore.recallAccuracy',
      modeScoreTooltipKey: 'report.modeScore.recallAccuracyTooltip',
      speedStatKey: 'report.speed.recallTime',
      insightMetrics: ['confidence', 'fluency', 'corrections', 'slotAccuracy', 'recentAccuracies'],
      colors: MODE_COLOR_DUAL_MEMO,
    },
  },

  stats: {
    simple: {
      sections: [
        'ACTIVITY_KPIS',
        'SESSIONS_PER_DAY',
        'PERFORMANCE_KPIS',
        'MODE_SCORE',
        'RECALL_CONFIDENCE',
        'EVOLUTION_ACCURACY',
        'EVOLUTION_N_LEVEL',
        'MODALITY_TABLE',
        'ERROR_PROFILE',
      ],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'MODE_SCORE', 'RECALL_CONFIDENCE', 'DISTRIBUTION'],
    },
  },

  extensions: {
    windowDepth: RECALL_WINDOW_DEPTH, // Recall N, N-1, N-2
    feedbackDurationMs: TIMING_FEEDBACK_MS,
    feedbackMode: 'on-commit',
    fillOrderMode: 'sequential',
    trialColorCoding: false,
    progressiveWindow: {
      enabled: true,
      initialDepth: RECALL_PROGRESSIVE_INITIAL_DEPTH,
      expansionThreshold: RECALL_PROGRESSIVE_EXPANSION_THRESHOLD,
      contractionThreshold: RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD,
      observationWindows: RECALL_PROGRESSIVE_OBSERVATION_WINDOWS,
      cooldownWindows: RECALL_PROGRESSIVE_COOLDOWN_WINDOWS,
    },
    disableWindowAdaptation: false,
    initialLureProbability: GEN_LURE_PROBABILITY_NONE,
  },
};

// =============================================================================
// All Recall Specs
// =============================================================================

export const MemoSpecs = {
  'dual-memo': DualMemoSpec,
} as const;
