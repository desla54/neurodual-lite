/**
 * Go/No-Go Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Go/No-Go Task.
 *
 * Classic motor inhibition task:
 * - Green circle = GO (tap quickly)
 * - Red circle = NO-GO (withhold response)
 * - Measures prepotent response inhibition
 * - 75% go / 25% no-go ratio creates prepotent tendency
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GO_NOGO_DEFAULT_TRIALS,
  GO_NOGO_STIMULUS_DURATION_MS,
  GO_NOGO_ITI_MS,
  GO_NOGO_GO_PROBABILITY,
  MODE_COLOR_GO_NOGO,
} from './thresholds';

// =============================================================================
// Go/No-Go Specification
// =============================================================================

export const GoNogoSpec: ModeSpec = {
  metadata: {
    id: 'go-nogo',
    displayName: 'Go / No-Go',
    description: 'Tap for go stimuli, withhold for no-go. Measures response inhibition.',
    tags: ['training', 'inhibition', 'motor'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: GO_NOGO_STIMULUS_DURATION_MS,
    intervalMs: GO_NOGO_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GO_NOGO_GO_PROBABILITY,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: GO_NOGO_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_GO_NOGO,
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
// All Go/No-Go Specs
// =============================================================================

export const GoNogoSpecs = {
  'go-nogo': GoNogoSpec,
} as const;
