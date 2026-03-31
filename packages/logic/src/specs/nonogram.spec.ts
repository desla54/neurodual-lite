/**
 * Nonogram (Picross) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Nonogram puzzle mode.
 *
 * Fill a grid according to numeric clues on rows and columns to reveal a pattern.
 * Grid sizes scale with nLevel: 5x5 (level 1), 7x7 (level 2), 10x10 (level 3).
 * Puzzles are generated procedurally with ~40-60% fill rate.
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_NONOGRAM: ModeColorSpec = {
  bg: 'bg-sky-100 dark:bg-cyan-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-cyan-400',
  accent: 'cyan-500',
};

// =============================================================================
// Grid Configs (extensions)
// =============================================================================

export const NONOGRAM_GRID_CONFIGS = {
  1: { rows: 5, cols: 5 },
  2: { rows: 7, cols: 7 },
  3: { rows: 10, cols: 10 },
} as const;

// =============================================================================
// Nonogram Specification
// =============================================================================

export const NonogramSpec: ModeSpec = {
  metadata: {
    id: 'nonogram',
    displayName: 'Nonogram',
    description:
      'Fill a grid according to numeric clues on rows and columns to reveal a hidden pattern.',
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
    trialsCount: 5,
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
      colors: MODE_COLOR_NONOGRAM,
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
    gridConfigs: NONOGRAM_GRID_CONFIGS,
  },
};

// =============================================================================
// All Nonogram Specs
// =============================================================================

export const NonogramSpecs = {
  nonogram: NonogramSpec,
} as const;
