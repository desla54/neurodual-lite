/**
 * Mosaic Specification
 *
 * SINGLE SOURCE OF TRUTH for the Mosaic puzzle mode.
 *
 * Fill cells (black) or leave them empty (white) on a grid so that every
 * numbered clue equals the count of filled cells in its 3x3 neighbourhood
 * (the cell itself + its 8 neighbours).
 *
 * Grid sizes: 5x5 (Level 1), 7x7 (Level 2), 9x9 (Level 3).
 * Inspired by Simon Tatham's "Mosaic".
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_MOSAIC = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

// =============================================================================
// Mosaic Specification
// =============================================================================

export const MosaicSpec: ModeSpec = {
  metadata: {
    id: 'mosaic',
    displayName: 'Mosaic',
    description:
      'Fill cells to satisfy number clues. Each clue shows how many of its 3x3 neighbourhood cells are filled.',
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
      colors: MODE_COLOR_MOSAIC,
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
// All Mosaic Specs
// =============================================================================

export const MosaicSpecs = {
  mosaic: MosaicSpec,
} as const;
