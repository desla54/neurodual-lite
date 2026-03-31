/**
 * Rectangles (Shikaku) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Rectangles puzzle mode.
 *
 * Divide a grid into rectangles, each containing exactly one number equal to its area.
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 * Inspired by Simon Tatham's "Rectangles".
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_RECTANGLES = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;

// =============================================================================
// Rectangles Specification
// =============================================================================

export const RectanglesSpec: ModeSpec = {
  metadata: {
    id: 'rectangles',
    displayName: 'Rectangles',
    description:
      'Divide a grid into rectangles so that each rectangle contains exactly one number equal to its area.',
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
      colors: MODE_COLOR_RECTANGLES,
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
// All Rectangles Specs
// =============================================================================

export const RectanglesSpecs = {
  rectangles: RectanglesSpec,
} as const;
