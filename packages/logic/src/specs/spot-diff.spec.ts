/**
 * Spot the Diff Specification
 *
 * SINGLE SOURCE OF TRUTH for the Spot the Diff visual comparison mode.
 *
 * Two grids side by side. The right grid has subtle differences (different
 * shape or color). Player taps the differing cells on the right grid.
 *
 * nLevel controls difficulty:
 * - Level 1: 2 differences on a 4x4 grid
 * - Level 2: 3 differences on a 5x5 grid
 * - Level 3: 4 differences on a 5x5 grid
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SPOT_DIFF = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Constants
// =============================================================================

export const SPOT_DIFF_DEFAULT_TRIALS = 8;
export const SPOT_DIFF_TIME_LIMIT_MS = 30_000;
export const SPOT_DIFF_FEEDBACK_CORRECT_MS = 800;
export const SPOT_DIFF_FEEDBACK_INCORRECT_MS = 400;
export const SPOT_DIFF_INTER_TRIAL_MS = 600;

// =============================================================================
// Spot Diff Specification
// =============================================================================

export const SpotDiffSpec: ModeSpec = {
  metadata: {
    id: 'spot-diff',
    displayName: 'Spot the Diff',
    description:
      'Find the differences between two grids. Tap the cells that differ on the right grid.',
    tags: ['training', 'attention', 'perception'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SPOT_DIFF_TIME_LIMIT_MS,
    intervalMs: 1, // Not applicable (spot-the-difference mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: SPOT_DIFF_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SPOT_DIFF,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY'],
    },
  },

  extensions: {
    timeLimitMs: SPOT_DIFF_TIME_LIMIT_MS,
    feedbackCorrectMs: SPOT_DIFF_FEEDBACK_CORRECT_MS,
    feedbackIncorrectMs: SPOT_DIFF_FEEDBACK_INCORRECT_MS,
    interTrialMs: SPOT_DIFF_INTER_TRIAL_MS,
  },
};

// =============================================================================
// All Spot Diff Specs
// =============================================================================

export const SpotDiffSpecs = {
  'spot-diff': SpotDiffSpec,
} as const;
