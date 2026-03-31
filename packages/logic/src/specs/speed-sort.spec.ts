/**
 * Speed Sort Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Speed Sort (card sorting) Task.
 *
 * Cards appear one at a time with properties (color, shape, number).
 * Player must sort each card into the correct category based on the
 * CURRENT sorting rule (by color, by shape, or by number).
 * The rule changes periodically to test cognitive flexibility.
 *
 * Inspired by the Wisconsin Card Sorting Test, simplified for training:
 * - 4 colors (red, blue, green, yellow)
 * - 4 shapes (circle, square, triangle, star)
 * - 4 numbers (1, 2, 3, 4)
 * - Rule switches every 5-8 cards
 * - nLevel controls complexity: 1 = 2 properties, 2 = 3 properties, 3 = faster switches
 * - Measures: accuracy + reaction time
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  SPEED_SORT_DEFAULT_TRIALS,
  SPEED_SORT_STIMULUS_TIMEOUT_MS,
  SPEED_SORT_ITI_MS,
  MODE_COLOR_SPEED_SORT,
} from './thresholds';

// =============================================================================
// Speed Sort Specification
// =============================================================================

export const SpeedSortSpec: ModeSpec = {
  metadata: {
    id: 'speed-sort',
    displayName: 'Speed Sort',
    description: 'Sort cards by changing rules as fast as possible.',
    tags: ['training', 'flexibility', 'speed'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SPEED_SORT_STIMULUS_TIMEOUT_MS,
    intervalMs: SPEED_SORT_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: SPEED_SORT_DEFAULT_TRIALS,
    activeModalities: ['visual'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'SPEED', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SPEED_SORT,
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
// All Speed Sort Specs
// =============================================================================

export const SpeedSortSpecs = {
  'speed-sort': SpeedSortSpec,
} as const;
