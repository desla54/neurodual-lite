/**
 * Simon Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Simon Task.
 *
 * Spatial conflict task (Simon & Rudell, 1967):
 * - Colored stimulus appears on left or right side
 * - Player responds by color, ignoring position
 * - Congruent: stimulus side matches response side
 * - Incongruent: stimulus side conflicts with response side
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  SIMON_DEFAULT_TRIALS,
  SIMON_STIMULUS_TIMEOUT_MS,
  SIMON_ITI_MS,
  MODE_COLOR_SIMON,
} from './thresholds';

// =============================================================================
// Simon Specification
// =============================================================================

export const SimonSpec: ModeSpec = {
  metadata: {
    id: 'simon',
    displayName: 'Simon',
    description:
      'Respond by color, ignoring stimulus position. Measures spatial conflict resolution.',
    tags: ['training', 'inhibition', 'spatial'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SIMON_STIMULUS_TIMEOUT_MS,
    intervalMs: SIMON_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: SIMON_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'RECENT_TREND', 'PERFORMANCE', 'SPEED', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SIMON,
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
// All Simon Specs
// =============================================================================

export const SimonSpecs = {
  simon: SimonSpec,
} as const;
