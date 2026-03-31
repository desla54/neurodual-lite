/**
 * Time Estimation Specification
 *
 * SINGLE SOURCE OF TRUTH for the Time Estimation task.
 *
 * Temporal perception paradigm:
 * - Stimulus appears for X seconds -> reproduce that duration
 * - Variants: production (produce 3s), reproduction (copy seen duration),
 *   discrimination (shorter or longer?)
 * - Measures internal clock accuracy
 * - Affected by ADHD, aging, frontal disorders
 * - Key metrics: absolute error, coefficient of variation, directional bias
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  TIME_ESTIMATION_DEFAULT_TRIALS,
  TIME_ESTIMATION_MAX_DURATION_MS,
  MODE_COLOR_TIME_ESTIMATION,
} from './thresholds';

// =============================================================================
// Time Estimation Specification
// =============================================================================

export const TimeEstimationSpec: ModeSpec = {
  metadata: {
    id: 'time-estimation',
    displayName: 'Time Estimation',
    description: 'Reproduce temporal intervals accurately. Measures internal clock precision.',
    tags: ['training', 'timing', 'perception'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TIME_ESTIMATION_MAX_DURATION_MS,
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
    trialsCount: TIME_ESTIMATION_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_TIME_ESTIMATION,
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
// All Time Estimation Specs
// =============================================================================

export const TimeEstimationSpecs = {
  'time-estimation': TimeEstimationSpec,
} as const;
