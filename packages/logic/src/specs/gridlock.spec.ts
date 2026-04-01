/**
 * Gridlock Specification
 *
 * SINGLE SOURCE OF TRUTH for the Gridlock sliding puzzle task.
 *
 * Classic sliding-block puzzle on a 6×6 grid:
 * - Slide vehicles horizontally or vertically to clear a path
 * - Free the red car (piece A) by moving it to the right edge
 * - Mixed challenge set (classic, precision, memory, timed)
 * - Measures planning, spatial reasoning, executive control
 * - Key metrics: efficiency, planning time, control, mastery score
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GRIDLOCK_DEFAULT_PUZZLES,
  GRIDLOCK_TIME_LIMIT_MS,
  MODE_COLOR_GRIDLOCK,
} from './thresholds';

// =============================================================================
// Gridlock Specification
// =============================================================================

export const GridlockSpec: ModeSpec = {
  metadata: {
    id: 'gridlock',
    displayName: 'Gridlock',
    description:
      'Slide vehicles on a 6×6 grid to free the red car. Measures planning and spatial reasoning.',
    tags: ['training', 'executive', 'planning', 'spatial'],
    difficultyLevel: 4,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: GRIDLOCK_TIME_LIMIT_MS,
    intervalMs: 1,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: GRIDLOCK_DEFAULT_PUZZLES,
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
      colors: MODE_COLOR_GRIDLOCK,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'DISTRIBUTION'],
    },
  },
};

// =============================================================================
// All Gridlock Specs
// =============================================================================

export const GridlockSpecs = {
  gridlock: GridlockSpec,
} as const;
