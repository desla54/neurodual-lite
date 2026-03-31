/**
 * Cube Specification
 *
 * SINGLE SOURCE OF TRUTH for the Cube puzzle mode.
 *
 * Inspired by Simon Tatham's "Cube". Roll a cube around a grid to collect
 * colored squares. When the cube rolls onto a target cell, it picks the color
 * up onto its bottom face. Goal: collect every target.
 *
 * Grid sizes / targets: 4x4 / 4 (nLevel 1), 5x5 / 6 (nLevel 2), 6x6 / 8 (nLevel 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_CUBE = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
} as const;

// =============================================================================
// Cube Specification
// =============================================================================

export const CubeSpec: ModeSpec = {
  metadata: {
    id: 'cube',
    displayName: 'Cube',
    description:
      'Roll a cube around a grid to collect colored squares. Track which face is which as the cube rolls.',
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
      colors: MODE_COLOR_CUBE,
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
// All Cube Specs
// =============================================================================

export const CubeSpecs = {
  cube: CubeSpec,
} as const;
