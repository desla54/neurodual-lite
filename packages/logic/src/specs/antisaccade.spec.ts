/**
 * Antisaccade Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Antisaccade Task.
 *
 * Hallett (1978):
 * - Cue appears on one side of the screen
 * - Pro-saccade: target appears on SAME side as cue
 * - Anti-saccade: target appears on OPPOSITE side of cue
 * - Player reports the direction of a small arrow target
 * - Measures suppression of reflexive orienting
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  ANTISACCADE_DEFAULT_TRIALS,
  ANTISACCADE_FIXATION_MS,
  ANTISACCADE_TARGET_TIMEOUT_MS,
  MODE_COLOR_ANTISACCADE,
} from './thresholds';

// =============================================================================
// Antisaccade Specification
// =============================================================================

export const AntisaccadeSpec: ModeSpec = {
  metadata: {
    id: 'antisaccade',
    displayName: 'Antisaccade',
    description: 'Respond on the opposite side of the cue.',
    tags: ['training', 'inhibition', 'attention'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: ANTISACCADE_TARGET_TIMEOUT_MS,
    intervalMs: ANTISACCADE_FIXATION_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: ANTISACCADE_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_ANTISACCADE,
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
// All Antisaccade Specs
// =============================================================================

export const AntisaccadeSpecs = {
  antisaccade: AntisaccadeSpec,
} as const;
