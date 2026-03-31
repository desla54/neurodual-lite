/**
 * Mirror Specification
 *
 * SINGLE SOURCE OF TRUTH for the Mirror symmetry training mode.
 *
 * A pattern is shown on one side of a grid. The player reproduces it
 * in mirror (symmetry) on the other side.
 *
 * Symmetry types based on nLevel:
 * - Level 1: Vertical axis (left-right mirror, easiest)
 * - Level 2: Horizontal axis (top-bottom mirror)
 * - Level 3: Central/point symmetry (180 degree rotation)
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_MIRROR = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
} as const;

// =============================================================================
// Constants
// =============================================================================

export const MIRROR_GRID_ROWS = 4;
export const MIRROR_GRID_COLS = 4;
export const MIRROR_MIN_FILLED = 3;
export const MIRROR_MAX_FILLED = 6;
export const MIRROR_DEFAULT_TRIALS = 12;
export const MIRROR_FEEDBACK_CORRECT_MS = 800;
export const MIRROR_FEEDBACK_INCORRECT_MS = 1200;

// =============================================================================
// Mirror Specification
// =============================================================================

export const MirrorSpec: ModeSpec = {
  metadata: {
    id: 'mirror',
    displayName: 'Mirror',
    description:
      'Reproduce a pattern in mirror symmetry. Vertical, horizontal, or central symmetry depending on level.',
    tags: ['training', 'spatial', 'coordination'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 60000, // Self-paced puzzle, 60s time limit
    intervalMs: 1, // Not applicable (puzzle mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: MIRROR_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_MIRROR,
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
    gridRows: MIRROR_GRID_ROWS,
    gridCols: MIRROR_GRID_COLS,
    minFilled: MIRROR_MIN_FILLED,
    maxFilled: MIRROR_MAX_FILLED,
    feedbackCorrectMs: MIRROR_FEEDBACK_CORRECT_MS,
    feedbackIncorrectMs: MIRROR_FEEDBACK_INCORRECT_MS,
  },
};

// =============================================================================
// All Mirror Specs
// =============================================================================

export const MirrorSpecs = {
  mirror: MirrorSpec,
} as const;
