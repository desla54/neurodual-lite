/**
 * Number Series Specification
 *
 * SINGLE SOURCE OF TRUTH for the Number Series task.
 *
 * Numeric inductive reasoning:
 * - Complete a number sequence (e.g. 2, 4, 8, 16, ?)
 * - Difficulty: simple operations -> double rules -> nested sequences
 * - Complementary to Raven's (visual) - tests numerical reasoning
 * - Key metrics: accuracy, time per problem, difficulty level reached
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  NUMBER_SERIES_DEFAULT_TRIALS,
  NUMBER_SERIES_TIMEOUT_MS,
  MODE_COLOR_NUMBER_SERIES,
} from './thresholds';

// =============================================================================
// Number Series Specification
// =============================================================================

export const NumberSeriesSpec: ModeSpec = {
  metadata: {
    id: 'number-series',
    displayName: 'Number Series',
    description: 'Complete number sequences by finding the pattern. Measures numerical reasoning.',
    tags: ['training', 'reasoning', 'numerical'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: NUMBER_SERIES_TIMEOUT_MS,
    intervalMs: 1000,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: NUMBER_SERIES_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_NUMBER_SERIES,
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
// All Number Series Specs
// =============================================================================

export const NumberSeriesSpecs = {
  'number-series': NumberSeriesSpec,
} as const;
