/**
 * Palisade Specification
 *
 * SINGLE SOURCE OF TRUTH for the Palisade puzzle mode.
 *
 * Divide a grid into regions of a fixed size K.
 * Clue numbers in some cells indicate how many of that cell's 4 edges are region boundaries.
 * All regions must be connected and contain exactly K cells.
 * Level 1: 6x6 grid, K=3; Level 2: 8x8 grid, K=4; Level 3: 10x10 grid, K=5.
 *
 * Inspired by Simon Tatham's "Palisade" puzzle.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_PALISADE = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Palisade Specification
// =============================================================================

export const PalisadeSpec: ModeSpec = {
  metadata: {
    id: 'palisade',
    displayName: 'Palisade',
    description:
      'Divide a grid into equal-size regions using boundary walls. Clue numbers show how many edges of a cell are boundaries.',
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
      colors: MODE_COLOR_PALISADE,
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
// All Palisade Specs
// =============================================================================

export const PalisadeSpecs = {
  palisade: PalisadeSpec,
} as const;
