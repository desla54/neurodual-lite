/**
 * Dominosa Specification
 *
 * SINGLE SOURCE OF TRUTH for the Dominosa puzzle mode.
 *
 * Grid filled with numbers. Player must partition the grid into dominoes
 * (pairs of adjacent cells). Each domino appears exactly once (like a full
 * set of dominoes from 0-0 to N-N).
 *
 * Grid sizes per nLevel:
 * - Level 1: N=2 → 3x2 grid (6 cells, 3 dominoes)
 * - Level 2: N=3 → 4x5 grid (20 cells, 10 dominoes)
 * - Level 3: N=4 → 5x6 grid (30 cells, 15 dominoes)
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_DOMINOSA: ModeColorSpec = {
  bg: 'bg-purple-100 dark:bg-purple-500/20',
  border: 'border-purple-200',
  text: 'text-purple-600 dark:text-purple-400',
  accent: 'purple-500',
};

// =============================================================================
// Grid Configs (extensions)
// =============================================================================

export const DOMINOSA_GRID_CONFIGS = {
  1: { n: 2, rows: 3, cols: 2 },
  2: { n: 3, rows: 4, cols: 5 },
  3: { n: 4, rows: 5, cols: 6 },
} as const;

// =============================================================================
// Dominosa Specification
// =============================================================================

export const DominosaSpec: ModeSpec = {
  metadata: {
    id: 'dominosa',
    displayName: 'Dominosa',
    description:
      'Partition a grid of numbers into dominoes so that each domino value appears exactly once.',
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
    nLevel: 2,
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
      colors: MODE_COLOR_DOMINOSA,
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
    gridConfigs: DOMINOSA_GRID_CONFIGS,
  },
};

// =============================================================================
// All Dominosa Specs
// =============================================================================

export const DominosaSpecs = {
  dominosa: DominosaSpec,
} as const;
