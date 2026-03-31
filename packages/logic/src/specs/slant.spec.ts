/**
 * Slant Specification
 *
 * SINGLE SOURCE OF TRUTH for the Slant puzzle mode.
 *
 * Inspired by Simon Tatham's "Slant" puzzle.
 * Fill a grid with \ and / diagonals so that:
 * - Each clue number at a grid intersection shows how many diagonals touch that point
 * - No closed loops are formed (all diagonals must form a tree-like structure)
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SLANT = {
  bg: 'bg-stone-100 dark:bg-stone-500/20',
  border: 'border-stone-200',
  text: 'text-stone-600 dark:text-stone-400',
  accent: 'stone-500',
} as const;

// =============================================================================
// Slant Specification
// =============================================================================

export const SlantSpec: ModeSpec = {
  metadata: {
    id: 'slant',
    displayName: 'Slant',
    description:
      'Fill a grid with diagonal lines so that clue numbers at intersections are satisfied and no loops are formed.',
    tags: ['training', 'logic', 'spatial'],
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
      colors: MODE_COLOR_SLANT,
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
// All Slant Specs
// =============================================================================

export const SlantSpecs = {
  slant: SlantSpec,
} as const;
