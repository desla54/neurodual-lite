/**
 * Keen (KenKen) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Keen puzzle mode.
 *
 * NxN latin square puzzle with arithmetic cages.
 * Each row/column has digits 1-N exactly once.
 * Cages group adjacent cells with a target number and operation (+, -, x, /).
 * Grid sizes: 4x4 (level 1), 5x5 (level 2), 6x6 (level 3).
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_KEEN: ModeColorSpec = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
};

// =============================================================================
// Keen Specification
// =============================================================================

export const KeenSpec: ModeSpec = {
  metadata: {
    id: 'keen',
    displayName: 'KenKen',
    description:
      'Fill the NxN grid so every row and column contains digits 1-N. Cages provide arithmetic clues.',
    tags: ['training', 'logic', 'arithmetic'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 600000, // 10 min time limit per puzzle
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
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_KEEN,
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
// All Keen Specs
// =============================================================================

export const KeenSpecs = {
  keen: KeenSpec,
} as const;
