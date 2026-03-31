/**
 * Pearl (Masyu) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Pearl puzzle mode.
 *
 * Draw a single closed loop through all pearls on a grid.
 * Black pearls: loop turns 90° on the pearl, goes straight on both sides.
 * White pearls: loop goes straight through, turns on at least one neighbour.
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_PEARL = {
  bg: 'bg-gray-100 dark:bg-gray-500/20',
  border: 'border-gray-200',
  text: 'text-gray-600 dark:text-gray-400',
  accent: 'gray-500',
} as const;

// =============================================================================
// Pearl Specification
// =============================================================================

export const PearlSpec: ModeSpec = {
  metadata: {
    id: 'pearl',
    displayName: 'Pearl',
    description:
      'Draw a single closed loop through all pearls. Black pearls force turns, white pearls force straights.',
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
      colors: MODE_COLOR_PEARL,
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
// All Pearl Specs
// =============================================================================

export const PearlSpecs = {
  pearl: PearlSpec,
} as const;
