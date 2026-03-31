/**
 * Analogies Specification
 *
 * SINGLE SOURCE OF TRUTH for the Analogies task.
 *
 * Analogical reasoning:
 * - A is to B as C is to ? (with abstract shapes/symbols)
 * - Multiple choice format
 * - Measures analogical reasoning - key component of fluid intelligence
 * - Complementary to Raven's (matrices) and Number Series (numerical)
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  ANALOGIES_DEFAULT_TRIALS,
  ANALOGIES_TIMEOUT_MS,
  MODE_COLOR_ANALOGIES,
} from './thresholds';

// =============================================================================
// Analogies Specification
// =============================================================================

export const AnalogiesSpec: ModeSpec = {
  metadata: {
    id: 'analogies',
    displayName: 'Analogies',
    description: 'Solve visual analogies (A:B :: C:?). Measures analogical reasoning.',
    tags: ['training', 'reasoning', 'fluid-intelligence'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: ANALOGIES_TIMEOUT_MS,
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
    trialsCount: ANALOGIES_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_ANALOGIES,
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
// All Analogies Specs
// =============================================================================

export const AnalogiesSpecs = {
  analogies: AnalogiesSpec,
} as const;
