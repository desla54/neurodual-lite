/**
 * ProMem (Prospective Memory) Specification
 *
 * SINGLE SOURCE OF TRUTH for the event-based Prospective Memory task.
 *
 * Einstein & McDaniel (1990):
 * - Ongoing task: categorize images (animal/object) or words
 * - Prospective instruction: "when you see a red word / winged animal,
 *   press the special button instead of categorizing"
 * - Prospective target is rare (~1 in 15 trials)
 * - Measures "remembering to remember"
 * - Difficulty: number of simultaneous prospective instructions (1 -> 3)
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  PROMEM_DEFAULT_TRIALS,
  PROMEM_STIMULUS_TIMEOUT_MS,
  PROMEM_ITI_MS,
  MODE_COLOR_PROMEM,
} from './thresholds';

// =============================================================================
// ProMem Specification
// =============================================================================

export const ProMemSpec: ModeSpec = {
  metadata: {
    id: 'promem',
    displayName: 'Prospective Memory',
    description:
      'Remember to perform an action when a specific event occurs during an ongoing task.',
    tags: ['training', 'memory', 'prospective', 'executive'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: PROMEM_STIMULUS_TIMEOUT_MS,
    intervalMs: PROMEM_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.93,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: PROMEM_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_PROMEM,
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
// All ProMem Specs
// =============================================================================

export const ProMemSpecs = {
  promem: ProMemSpec,
} as const;
