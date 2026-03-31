/**
 * Magnets Specification
 *
 * SINGLE SOURCE OF TRUTH for the Magnets puzzle mode.
 *
 * Inspired by Simon Tatham's "Magnets" puzzle.
 * Grid divided into domino-shaped regions. Each domino is either a magnet (+/-)
 * or neutral (empty). Clue numbers on edges show how many + and - in each row/column.
 * No two same poles can be orthogonally adjacent.
 * Grid sizes: 4x6 (level 1), 6x6 (level 2), 6x8 (level 3).
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_MAGNETS: ModeColorSpec = {
  bg: 'bg-red-100 dark:bg-red-500/20',
  border: 'border-red-200',
  text: 'text-red-600 dark:text-red-400',
  accent: 'red-500',
};

// =============================================================================
// Grid Configs
// =============================================================================

export const MAGNETS_GRID_CONFIGS = {
  1: { rows: 4, cols: 6 },
  2: { rows: 6, cols: 6 },
  3: { rows: 6, cols: 8 },
} as const;

// =============================================================================
// Magnets Specification
// =============================================================================

export const MagnetsSpec: ModeSpec = {
  metadata: {
    id: 'magnets',
    displayName: 'Magnets',
    description:
      'Place magnets (+/-) or leave dominoes neutral so that clue counts are satisfied and no two same poles are orthogonally adjacent.',
    tags: ['training', 'logic', 'deduction'],
    difficultyLevel: 3,
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
    trialsCount: 3,
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
      colors: MODE_COLOR_MAGNETS,
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
    gridConfigs: MAGNETS_GRID_CONFIGS,
  },
};

// =============================================================================
// All Magnets Specs
// =============================================================================

export const MagnetsSpecs = {
  magnets: MagnetsSpec,
} as const;
