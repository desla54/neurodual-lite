/**
 * WCST (Wisconsin Card Sorting Test) Specification
 *
 * SINGLE SOURCE OF TRUTH for the WCST.
 *
 * Grant & Berg (1948):
 * - Sort cards by hidden rule (color, shape, number)
 * - Rule changes after consecutive correct sorts
 * - Player infers new rule through feedback
 * - Measures cognitive flexibility and set-shifting
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  WCST_DEFAULT_TRIALS,
  WCST_RULE_CHANGE_THRESHOLD,
  WCST_STIMULUS_TIMEOUT_MS,
  WCST_FEEDBACK_MS,
  WCST_ITI_MS,
  MODE_COLOR_WCST,
} from './thresholds';

// =============================================================================
// WCST Extensions
// =============================================================================

export interface WcstExtensions {
  /** Number of consecutive correct before rule changes */
  readonly ruleChangeThreshold: number;
  /** Feedback display duration (ms) */
  readonly feedbackMs: number;
  /** Inter-trial interval (ms) */
  readonly itiMs: number;
}

// =============================================================================
// WCST Specification
// =============================================================================

export const WcstSpec: ModeSpec = {
  metadata: {
    id: 'wcst',
    displayName: 'WCST',
    description: 'Sort cards by a hidden rule. Adapt when the rule changes.',
    tags: ['training', 'flexibility', 'executive'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: WCST_STIMULUS_TIMEOUT_MS,
    intervalMs: WCST_ITI_MS,
    feedbackDurationMs: WCST_FEEDBACK_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: WCST_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_WCST,
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

  extensions: {
    ruleChangeThreshold: WCST_RULE_CHANGE_THRESHOLD,
    feedbackMs: WCST_FEEDBACK_MS,
    itiMs: WCST_ITI_MS,
  } satisfies WcstExtensions,
};

// =============================================================================
// All WCST Specs
// =============================================================================

export const WcstSpecs = {
  wcst: WcstSpec,
} as const;
