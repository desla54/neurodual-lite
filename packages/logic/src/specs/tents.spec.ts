/**
 * Tents Puzzle Specification
 *
 * SINGLE SOURCE OF TRUTH for the Tents puzzle mode.
 *
 * Place a tent adjacent (4-connected) to each tree. Tents cannot touch each
 * other, even diagonally. Row/column clue numbers indicate how many tents
 * belong in that row/column.
 * Grid sizes: 6x6 (level 1), 8x8 (level 2), 10x10 (level 3).
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_TENTS: ModeColorSpec = {
  bg: 'bg-green-100 dark:bg-green-500/20',
  border: 'border-green-200',
  text: 'text-green-600 dark:text-green-400',
  accent: 'green-500',
};

// =============================================================================
// Grid Configs (extensions)
// =============================================================================

export const TENTS_GRID_CONFIGS = {
  1: { rows: 6, cols: 6 },
  2: { rows: 8, cols: 8 },
  3: { rows: 10, cols: 10 },
} as const;

// =============================================================================
// Tents Specification
// =============================================================================

export const TentsSpec: ModeSpec = {
  metadata: {
    id: 'tents',
    displayName: 'Tents',
    description:
      'Place a tent next to each tree so that no two tents touch, matching the row and column counts.',
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
      colors: MODE_COLOR_TENTS,
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
    gridConfigs: TENTS_GRID_CONFIGS,
  },
};

// =============================================================================
// All Tents Specs
// =============================================================================

export const TentsSpecs = {
  tents: TentsSpec,
} as const;
