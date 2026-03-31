/**
 * Pick Mode Specification (Dual Pick)
 *
 * SINGLE SOURCE OF TRUTH for Pick-based game modes.
 *
 * Pick mode (inverse of Place):
 * - Stimuli fill the timeline automatically
 * - User must identify which stimulus corresponds to N, N-1, N-2
 * - Drag labels to the correct timeline slots
 */

import type { ModeSpec } from './types';
import {
  // Scoring
  ACCURACY_PASS_NORMALIZED,
  // Timing
  TIMING_STIMULUS_FLOW_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_LABEL,
  // Defaults
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_FLOW,
  DEFAULT_DISTRACTOR_COUNT,
  // Colors
  MODE_COLOR_DUAL_PICK,
} from './thresholds';

// =============================================================================
// Pick-specific Extensions
// =============================================================================

/**
 * Pick-specific extensions to the base ModeSpec.
 */
export interface PickExtensions {
  /** Placement order mode */
  readonly placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  /** Number of distractor cards */
  readonly distractorCount: number;
  /** Timeline mode: 'separated' (default) or 'unified' (binding - position+audio together) */
  readonly timelineMode?: 'separated' | 'unified';
  /** Distractor source: 'random' (default) or 'proactive' (old stimuli outside window) */
  readonly distractorSource?: 'random' | 'proactive';
  /** Mirror timeline for dyslateralisation training */
  readonly mirrorTimeline?: boolean;
  /** Play only with mirror timeline when enabled */
  readonly mirrorOnlyMode?: boolean;
  /** Hide filled cards after placement */
  readonly hideFilledCards?: boolean;
  /** Disable immediate repetitions */
  readonly noRepetitions?: boolean;
  /** Color-code trials for visual anchoring */
  readonly trialColorCoding?: boolean;
  /** Show modality labels (Position/Audio) */
  readonly flowShowModalityLabels?: boolean;
  /** Show time labels (Présent/Passé) */
  readonly flowShowTimeLabels?: boolean;
  /** Show recenter button */
  readonly flowShowRecenterButton?: boolean;
  /** Grid scale factor (0.7 to 1.3) */
  readonly flowGridScale?: number;
  /** Show countdown instead of counter */
  readonly flowCountdownMode?: boolean;
  /** Show N-level badge in HUD */
  readonly flowShowNLevel?: boolean;
  /** Show adaptive zone in HUD */
  readonly flowShowAdaptiveZone?: boolean;
}

/**
 * Type alias for Pick mode specs (Dual Pick).
 * Use this in machine input types instead of raw ModeSpec.
 */
export type PickSpec = ModeSpec & { extensions: PickExtensions };

// =============================================================================
// Dual Pick Specification
// =============================================================================

export const DualPickSpec: PickSpec = {
  metadata: {
    id: 'dual-pick',
    displayName: 'Dual Pick',
    description: 'Identifie les stimuli N, N-1, N-2 dans la timeline.',
    tags: ['training', 'pick', 'beta'],
    difficultyLevel: 3,
    version: '1.0.0',
  },

  sessionType: 'DualPickSession',

  /**
   * Scoring Strategy: Accuracy-based
   *
   * **Passed Calculation**:
   * 1. Count correct label placements / total label placements
   * 2. Score = accuracy * 100 (percentage 0-100)
   * 3. `passed = score >= 80%` (ACCURACY_PASS)
   *
   * **Judge Implementation**: AccuracyJudge
   * **Code**: packages/logic/src/judge/accuracy-judge.ts:128
   */
  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TIMING_STIMULUS_FLOW_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: GEN_LURE_PROBABILITY_LABEL,
    sequenceMode: 'flow',
  },

  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
    activeModalities: ['position', 'audio'],
  },

  adaptivity: {
    algorithm: 'adaptive',
    nLevelSource: 'user',
    configurableSettings: [
      'nLevel',
      'trialsCount',
      'activeModalities',
      'algorithm',
      'placementOrderMode',
    ],
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
      modeScoreKey: 'report.modeScore.placementAccuracy',
      modeScoreTooltipKey: 'report.modeScore.placementAccuracyTooltip',
      speedStatKey: 'report.speed.placementTime',
      insightMetrics: ['confidence', 'directness', 'placementTime', 'wrongSlotDwell'],
      colors: MODE_COLOR_DUAL_PICK,
    },
  },

  stats: {
    simple: {
      sections: [
        'ACTIVITY_KPIS',
        'SESSIONS_PER_DAY',
        'PERFORMANCE_KPIS',
        'MODE_SCORE',
        'FLOW_CONFIDENCE',
        'EVOLUTION_ACCURACY',
        'EVOLUTION_N_LEVEL',
        'MODALITY_TABLE',
        'ERROR_PROFILE',
      ],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'MODE_SCORE', 'FLOW_CONFIDENCE', 'DISTRIBUTION'],
    },
  },

  extensions: {
    placementOrderMode: 'free',
    distractorCount: DEFAULT_DISTRACTOR_COUNT,
    timelineMode: 'separated',
    distractorSource: 'random',
    mirrorTimeline: false,
    mirrorOnlyMode: false,
    hideFilledCards: false,
    noRepetitions: false,
    trialColorCoding: false,
    flowShowModalityLabels: false,
    flowShowTimeLabels: false,
    flowShowRecenterButton: true,
    flowGridScale: 1.0,
    flowCountdownMode: false,
    flowShowNLevel: false,
    flowShowAdaptiveZone: false,
  },
};

// =============================================================================
// All Label Specs
// =============================================================================

export const PickSpecs = {
  'dual-pick': DualPickSpec,
} as const;
