/**
 * Loopy (Slitherlink) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Loopy puzzle mode.
 *
 * Draw a single closed loop along cell edges on a grid of square cells.
 * Numbers 0-3 in cells indicate how many edges of that cell are part of the loop.
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_LOOPY = {
  bg: 'bg-blue-100 dark:bg-blue-500/20',
  border: 'border-blue-200',
  text: 'text-blue-600 dark:text-blue-400',
  accent: 'blue-500',
} as const;

// =============================================================================
// Loopy Specification
// =============================================================================

export const LoopySpec: ModeSpec = {
  metadata: {
    id: 'loopy',
    displayName: 'Loopy',
    description:
      'Draw a single closed loop along cell edges. Numbers indicate how many edges of a cell are part of the loop.',
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
      colors: MODE_COLOR_LOOPY,
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
// All Loopy Specs
// =============================================================================

export const LoopySpecs = {
  loopy: LoopySpec,
} as const;
