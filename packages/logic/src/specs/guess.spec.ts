/**
 * Guess (Mastermind) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Guess puzzle mode.
 *
 * Guess a hidden combination of colored pegs. After each guess, feedback shows
 * black pegs (right color, right position) and white pegs (right color, wrong position).
 * Difficulty scales with nLevel:
 *   Level 1 = 4 positions, 4 colors, 10 max guesses
 *   Level 2 = 4 positions, 6 colors, 12 max guesses
 *   Level 3 = 5 positions, 6 colors, 12 max guesses
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_GUESS = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
} as const;

// =============================================================================
// Guess Specification
// =============================================================================

export const GuessSpec: ModeSpec = {
  metadata: {
    id: 'guess',
    displayName: 'Mastermind',
    description:
      'Guess a hidden combination of colored pegs. Black pegs = right color & position, white pegs = right color only.',
    tags: ['training', 'logic', 'deduction'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 120000, // 2 min per puzzle
    intervalMs: 1, // Not applicable (puzzle mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
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
      colors: MODE_COLOR_GUESS,
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
// All Guess Specs
// =============================================================================

export const GuessSpecs = {
  guess: GuessSpec,
} as const;
