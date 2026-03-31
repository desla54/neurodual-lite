/**
 * Filling Specification
 *
 * SINGLE SOURCE OF TRUTH for the Filling puzzle mode.
 *
 * Grid where each cell must contain a number. Connected groups of cells with
 * the same number must have exactly that many cells. Some cells are pre-filled
 * as clues (locked). Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 *
 * Inspired by Simon Tatham's "Filling" puzzle.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_FILLING = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

// =============================================================================
// Filling Specification
// =============================================================================

export const FillingSpec: ModeSpec = {
  metadata: {
    id: 'filling',
    displayName: 'Filling',
    description:
      'Fill a grid so that connected groups of identical numbers contain exactly that many cells.',
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
      colors: MODE_COLOR_FILLING,
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
// All Filling Specs
// =============================================================================

export const FillingSpecs = {
  filling: FillingSpec,
} as const;
