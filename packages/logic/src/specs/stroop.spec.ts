/**
 * Stroop Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Stroop Color-Word Interference Task.
 *
 * Classic inhibition task (Stroop, 1935):
 * - Color words displayed in incongruent ink colors
 * - Player must name the ink color, ignoring the word
 * - Measures interference control / response inhibition
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  STROOP_DEFAULT_TRIALS,
  STROOP_STIMULUS_TIMEOUT_MS,
  STROOP_ITI_MS,
  MODE_COLOR_STROOP,
  MODE_COLOR_STROOP_FLEX,
} from './thresholds';

// =============================================================================
// Stroop Specification
// =============================================================================

export const StroopSpec: ModeSpec = {
  metadata: {
    id: 'stroop',
    displayName: 'Stroop',
    description: 'Name the ink color of color words. Measures inhibition.',
    tags: ['training', 'inhibition', 'attention'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: STROOP_STIMULUS_TIMEOUT_MS,
    intervalMs: STROOP_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: STROOP_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_STROOP,
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
// Stroop Flex Specification
// =============================================================================

export const StroopFlexSpec: ModeSpec = {
  metadata: {
    id: 'stroop-flex',
    displayName: 'Stroop Flex',
    description: 'Stroop with dynamic rule switching. Measures cognitive flexibility.',
    tags: ['training', 'inhibition', 'flexibility', 'attention'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: STROOP_STIMULUS_TIMEOUT_MS,
    intervalMs: STROOP_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 20,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'RECENT_TREND', 'PERFORMANCE', 'SPEED', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_STROOP_FLEX,
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
// All Stroop Specs
// =============================================================================

export const StroopSpecs = {
  stroop: StroopSpec,
  'stroop-flex': StroopFlexSpec,
} as const;
