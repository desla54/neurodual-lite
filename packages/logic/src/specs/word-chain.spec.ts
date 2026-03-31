/**
 * Word Chain (Associative Fluency) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Word Chain task.
 *
 * Associative fluency paradigm:
 * - Seed word provided, user types an associated word
 * - Each new word must be associated with the previous one
 * - Free association chain - measures semantic flexibility
 * - Scoring: chain length, categorical diversity, inter-word time
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  WORD_CHAIN_DEFAULT_ROUNDS,
  WORD_CHAIN_ROUND_DURATION_MS,
  MODE_COLOR_WORD_CHAIN,
} from './thresholds';

// =============================================================================
// Word Chain Specification
// =============================================================================

export const WordChainSpec: ModeSpec = {
  metadata: {
    id: 'word-chain',
    displayName: 'Word Chain',
    description: 'Build chains of associated words. Measures associative fluency.',
    tags: ['training', 'language', 'fluency', 'semantic'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: WORD_CHAIN_ROUND_DURATION_MS,
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
    trialsCount: WORD_CHAIN_DEFAULT_ROUNDS,
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
      colors: MODE_COLOR_WORD_CHAIN,
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
// All Word Chain Specs
// =============================================================================

export const WordChainSpecs = {
  'word-chain': WordChainSpec,
} as const;
