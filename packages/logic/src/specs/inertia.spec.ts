/**
 * Inertia Specification
 *
 * SINGLE SOURCE OF TRUTH for the Inertia puzzle mode.
 *
 * Inspired by Simon Tatham's "Inertia". Navigate a grid collecting gems while
 * avoiding mines. The player slides in 8 directions until hitting a wall or edge.
 * Level 1: 8x8, 5 gems, 3 mines; Level 2: 10x10, 8 gems, 5 mines;
 * Level 3: 12x12, 12 gems, 8 mines.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_INERTIA = {
  bg: 'bg-yellow-100 dark:bg-yellow-500/20',
  border: 'border-yellow-200',
  text: 'text-yellow-600 dark:text-yellow-400',
  accent: 'yellow-500',
} as const;

// =============================================================================
// Inertia Specification
// =============================================================================

export const InertiaSpec: ModeSpec = {
  metadata: {
    id: 'inertia',
    displayName: 'Inertia',
    description:
      'Slide across a grid collecting gems while avoiding mines. Once moving, you slide until hitting a wall or the edge.',
    tags: ['training', 'spatial', 'planning'],
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
      colors: MODE_COLOR_INERTIA,
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
// All Inertia Specs
// =============================================================================

export const InertiaSpecs = {
  inertia: InertiaSpec,
} as const;
