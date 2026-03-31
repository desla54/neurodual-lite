/**
 * Sudoku Specification
 *
 * SINGLE SOURCE OF TRUTH for the Sudoku puzzle mode.
 *
 * Classic 9x9 Sudoku puzzle. Fill the grid so every row, column, and 3x3 box
 * contains digits 1-9. Difficulty scales with nLevel.
 * Uses sudoku-core library for generation and validation.
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SUDOKU: ModeColorSpec = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
};

// =============================================================================
// Sudoku Specification
// =============================================================================

export const SudokuSpec: ModeSpec = {
  metadata: {
    id: 'sudoku',
    displayName: 'Sudoku',
    description:
      'Fill the 9\u00d79 grid so every row, column, and 3\u00d73 box contains digits 1\u20139.',
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
    stimulusDurationMs: 300000, // 5 min time limit per puzzle
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
    trialsCount: 1,
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
      colors: MODE_COLOR_SUDOKU,
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
// All Sudoku Specs
// =============================================================================

export const SudokuSpecs = {
  sudoku: SudokuSpec,
} as const;
