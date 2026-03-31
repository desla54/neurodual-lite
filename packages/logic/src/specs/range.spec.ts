/**
 * Range (Kurodoko) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Range puzzle mode.
 *
 * Place black cells on a grid so that each numbered cell can "see" exactly
 * that many white cells (including itself) in the 4 cardinal directions.
 * Black cells cannot be orthogonally adjacent. All white cells must stay connected.
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_RANGE = {
  bg: 'bg-sky-100 dark:bg-sky-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
} as const;

// =============================================================================
// Range Specification
// =============================================================================

export const RangeSpec: ModeSpec = {
  metadata: {
    id: 'range',
    displayName: 'Range',
    description:
      'Place black cells so each number sees exactly that many white cells in the 4 cardinal directions. Black cells cannot touch orthogonally and all white cells must stay connected.',
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
      colors: MODE_COLOR_RANGE,
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
// All Range Specs
// =============================================================================

export const RangeSpecs = {
  range: RangeSpec,
} as const;
