/**
 * Pegs (Peg Solitaire) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Pegs puzzle mode.
 *
 * Jump pegs over each other to remove them, leaving just one.
 * Board shapes scale with nLevel: small cross (1), English board (2), large cross (3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_PEGS = {
  bg: 'bg-orange-100 dark:bg-orange-500/20',
  border: 'border-orange-200',
  text: 'text-orange-600 dark:text-orange-400',
  accent: 'orange-500',
} as const;

// =============================================================================
// Pegs Specification
// =============================================================================

export const PegsSpec: ModeSpec = {
  metadata: {
    id: 'pegs',
    displayName: 'Pegs',
    description: 'Jump pegs over each other to remove them all, leaving just one standing.',
    tags: ['training', 'logic', 'planning'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 120000, // Self-paced puzzle, 120s time limit
    intervalMs: 1, // Not applicable (puzzle mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 2,
    trialsCount: 3,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_PEGS,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY'],
    },
  },
};

// =============================================================================
// All Pegs Specs
// =============================================================================

export const PegsSpecs = {
  pegs: PegsSpec,
} as const;
