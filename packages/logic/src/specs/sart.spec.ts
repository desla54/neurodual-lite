/**
 * SART (Sustained Attention to Response Task) Specification
 *
 * SINGLE SOURCE OF TRUTH for the SART.
 *
 * Robertson et al. (1997):
 * - Digits 1-9 appear one at a time
 * - Press for ALL digits EXCEPT the target (3)
 * - Inverse Go/No-Go: default response is "go", inhibition is rare
 * - Measures sustained attention and lapses (mind-wandering)
 * - Key metrics: commission errors (pressing on 3), omission errors, RT variability
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  SART_DEFAULT_TRIALS,
  SART_STIMULUS_DURATION_MS,
  SART_MASK_DURATION_MS,
  SART_GO_PROBABILITY,
  MODE_COLOR_SART,
} from './thresholds';

// =============================================================================
// SART Specification
// =============================================================================

export const SartSpec: ModeSpec = {
  metadata: {
    id: 'sart',
    displayName: 'SART',
    description: 'Press for every digit except 3. Measures sustained attention and lapses.',
    tags: ['training', 'attention', 'vigilance', 'inhibition'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SART_STIMULUS_DURATION_MS,
    intervalMs: SART_MASK_DURATION_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: SART_GO_PROBABILITY,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: SART_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_SART,
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
// All SART Specs
// =============================================================================

export const SartSpecs = {
  sart: SartSpec,
} as const;
