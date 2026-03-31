/**
 * Galaxies Specification
 *
 * SINGLE SOURCE OF TRUTH for the Galaxies puzzle mode.
 *
 * Divide a grid into regions, each containing exactly one dot (galaxy center).
 * Each region must be rotationally symmetric (180 degrees) around its dot.
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 9x9 (level 3).
 *
 * Inspired by Simon Tatham's "Galaxies" puzzle.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_GALAXIES = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
} as const;

// =============================================================================
// Galaxies Specification
// =============================================================================

export const GalaxiesSpec: ModeSpec = {
  metadata: {
    id: 'galaxies',
    displayName: 'Galaxies',
    description:
      'Divide a grid into symmetric regions around galaxy centers. Each region must contain exactly one dot and be rotationally symmetric.',
    tags: ['training', 'spatial', 'logic'],
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
      colors: MODE_COLOR_GALAXIES,
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
// All Galaxies Specs
// =============================================================================

export const GalaxiesSpecs = {
  galaxies: GalaxiesSpec,
} as const;
