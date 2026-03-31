/**
 * Signpost Specification
 *
 * SINGLE SOURCE OF TRUTH for the Signpost puzzle mode.
 *
 * NxN grid where each cell has an arrow pointing in one of 8 directions.
 * Player numbers cells 1 to N² following the arrows: each numbered cell's
 * arrow must point toward the next number in the sequence.
 * Grid sizes: 3x3 (level 1), 4x4 (level 2), 5x5 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SIGNPOST = {
  bg: 'bg-pink-100 dark:bg-pink-500/20',
  border: 'border-pink-200',
  text: 'text-pink-600 dark:text-pink-400',
  accent: 'pink-500',
} as const;

// =============================================================================
// Signpost Specification
// =============================================================================

export const SignpostSpec: ModeSpec = {
  metadata: {
    id: 'signpost',
    displayName: 'Signpost',
    description:
      'Number all cells from 1 to N² following the arrows. Each cell points toward the next number in the path.',
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
    trialsCount: 5,
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
      colors: MODE_COLOR_SIGNPOST,
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
// All Signpost Specs
// =============================================================================

export const SignpostSpecs = {
  signpost: SignpostSpec,
} as const;
