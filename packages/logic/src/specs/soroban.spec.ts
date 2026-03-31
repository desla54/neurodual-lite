/**
 * Soroban (Japanese Abacus) Training Specification
 *
 * SINGLE SOURCE OF TRUTH for the Soroban training mode.
 *
 * Mental arithmetic using a virtual Japanese abacus:
 * - Each rod has 1 heaven bead (value 5) and 4 earth beads (value 1 each)
 * - Trial types: recognition (number → beads), reading (beads → number), calculation
 * - Trains numerical cognition, spatial reasoning, and mental arithmetic
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  SOROBAN_DEFAULT_TRIALS,
  SOROBAN_RESPONSE_TIMEOUT_MS,
  SOROBAN_ITI_MS,
  MODE_COLOR_SOROBAN,
} from './thresholds';

// =============================================================================
// Soroban Specification
// =============================================================================

export const SorobanSpec: ModeSpec = {
  metadata: {
    id: 'soroban',
    displayName: 'Soroban',
    description: 'Practice mental arithmetic using a Japanese abacus.',
    tags: ['training', 'numerical', 'arithmetic', 'spatial'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SOROBAN_RESPONSE_TIMEOUT_MS,
    intervalMs: SOROBAN_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: SOROBAN_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SOROBAN,
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
// All Soroban Specs
// =============================================================================

export const SorobanSpecs = {
  soroban: SorobanSpec,
} as const;
