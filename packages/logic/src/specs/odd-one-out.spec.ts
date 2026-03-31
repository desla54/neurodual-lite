/**
 * Odd One Out Specification
 *
 * SINGLE SOURCE OF TRUTH for the Odd One Out task.
 *
 * Abstract reasoning paradigm:
 * - Grid of 4-9 stimuli, one differs by an abstract rule (shape, color, size, pattern)
 * - The rule changes without warning (like WCST but faster)
 * - More accessible than Raven's matrices, same cognitive domain
 * - Key metrics: accuracy, rule detection speed, adaptation to rule shifts
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  ODD_ONE_OUT_DEFAULT_TRIALS,
  ODD_ONE_OUT_TIMEOUT_MS,
  MODE_COLOR_ODD_ONE_OUT,
} from './thresholds';

// =============================================================================
// Odd One Out Specification
// =============================================================================

export const OddOneOutSpec: ModeSpec = {
  metadata: {
    id: 'odd-one-out',
    displayName: 'Odd One Out',
    description: 'Find the different item based on an abstract rule. Measures inductive reasoning.',
    tags: ['training', 'reasoning', 'categorization'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: ODD_ONE_OUT_TIMEOUT_MS,
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
    trialsCount: ODD_ONE_OUT_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_ODD_ONE_OUT,
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
// All Odd One Out Specs
// =============================================================================

export const OddOneOutSpecs = {
  'odd-one-out': OddOneOutSpec,
} as const;
