/**
 * Tangram Specification
 *
 * SINGLE SOURCE OF TRUTH for the Tangram puzzle mode.
 *
 * Arrange geometric polyomino pieces on an 8x8 grid to match a target silhouette.
 * Pieces snap to grid cells. Player can rotate pieces 90 degrees.
 * nLevel scales piece count and complexity:
 *   1 = 3-4 simple pieces (2-3 cells each)
 *   2 = 5-6 pieces (2-4 cells)
 *   3 = 6-7 pieces (3-5 cells)
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_TANGRAM: ModeColorSpec = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
};

// =============================================================================
// Tangram Specification
// =============================================================================

export const TangramSpec: ModeSpec = {
  metadata: {
    id: 'tangram',
    displayName: 'Tangram',
    description:
      'Arrange geometric pieces on a grid to recreate a target silhouette. Rotate and place polyomino shapes to fill the pattern exactly.',
    tags: ['training', 'spatial', 'creativity'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 60000, // Self-paced puzzle, 60s time limit
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
      colors: MODE_COLOR_TANGRAM,
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
// All Tangram Specs
// =============================================================================

export const TangramSpecs = {
  tangram: TangramSpec,
} as const;
