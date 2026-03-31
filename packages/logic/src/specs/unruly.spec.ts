/**
 * Unruly (Binairo/Takuzu) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Unruly puzzle mode.
 *
 * Fill a grid with black and white cells following three constraints:
 * (1) No three consecutive same-color cells in any row/column
 * (2) Each row must have equal numbers of black and white cells
 * (3) Each column must have equal numbers of black and white cells
 * Grid sizes: 6x6 (level 1), 8x8 (level 2), 10x10 (level 3).
 * Inspired by Simon Tatham's "Unruly".
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_UNRULY = {
  bg: 'bg-violet-100 dark:bg-violet-500/20',
  border: 'border-violet-200',
  text: 'text-violet-600 dark:text-violet-400',
  accent: 'violet-500',
} as const;

// =============================================================================
// Unruly Specification
// =============================================================================

export const UnrulySpec: ModeSpec = {
  metadata: {
    id: 'unruly',
    displayName: 'Unruly',
    description:
      'Fill a grid with black and white cells. No three in a row, and each row/column must have equal counts.',
    tags: ['training', 'logic', 'deduction'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 120000, // Self-paced puzzle, 120s time limit
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
    trialsCount: 5,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_UNRULY,
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
};

// =============================================================================
// All Unruly Specs
// =============================================================================

export const UnrulySpecs = {
  unruly: UnrulySpec,
} as const;
