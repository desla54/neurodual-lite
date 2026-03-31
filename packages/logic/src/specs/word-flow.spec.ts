/**
 * Word Flow (Verbal Fluency) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Word Flow task.
 *
 * Thurstone (1938):
 * - Category displayed (animals, fruits, countries...)
 * - Type as many valid words as possible in 60 seconds
 * - Instant validation against built-in dictionary
 * - Scoring: total count, semantic clusters, category switches
 * - Phonemic variant: words starting with a given letter
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  WORD_FLOW_DEFAULT_ROUNDS,
  WORD_FLOW_ROUND_DURATION_MS,
  MODE_COLOR_WORD_FLOW,
} from './thresholds';

// =============================================================================
// Word Flow Specification
// =============================================================================

export const WordFlowSpec: ModeSpec = {
  metadata: {
    id: 'word-flow',
    displayName: 'Word Flow',
    description: 'Generate as many words as possible in a category. Measures verbal fluency.',
    tags: ['training', 'language', 'fluency', 'verbal'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: WORD_FLOW_ROUND_DURATION_MS,
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
    trialsCount: WORD_FLOW_DEFAULT_ROUNDS,
    activeModalities: ['audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: [],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_WORD_FLOW,
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
// All Word Flow Specs
// =============================================================================

export const WordFlowSpecs = {
  'word-flow': WordFlowSpec,
} as const;
