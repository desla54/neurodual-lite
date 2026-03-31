/**
 * Same Game Specification
 *
 * SINGLE SOURCE OF TRUTH for the Same Game puzzle mode.
 *
 * Clear colored cells from a grid by selecting groups of 2+ adjacent same-colored cells.
 * Cells fall down (gravity) and columns collapse left after removal.
 * Score = (n-1)^2 for removing a group of n cells.
 * Grid sizes: 10x8 (level 1), 12x10 (level 2), 15x10 (level 3).
 * Colors: 3 (levels 1-2), 4 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SAMEGAME = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Same Game Specification
// =============================================================================

export const SameGameSpec: ModeSpec = {
  metadata: {
    id: 'samegame',
    displayName: 'Same Game',
    description:
      'Clear the board by selecting groups of 2+ adjacent same-colored cells. Larger groups score more points.',
    tags: ['training', 'logic', 'planning'],
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
      colors: MODE_COLOR_SAMEGAME,
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
// All Same Game Specs
// =============================================================================

export const SameGameSpecs = {
  samegame: SameGameSpec,
} as const;
