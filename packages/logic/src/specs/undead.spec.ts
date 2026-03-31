/**
 * Undead Specification
 *
 * SINGLE SOURCE OF TRUTH for the Undead puzzle mode.
 *
 * Place ghosts (G), vampires (V), and zombies (Z) in empty cells of a grid
 * containing diagonal mirrors (/ and \). Clue numbers on the edges indicate
 * how many monsters are visible from that direction.
 *
 * Visibility rules:
 * - Ghosts: visible only in mirrors (reflected path)
 * - Vampires: visible only on direct line of sight (not through mirrors)
 * - Zombies: always visible (direct or reflected)
 *
 * Grid sizes: 4x4 (Level 1), 5x5 (Level 2), 6x6 (Level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_UNDEAD = {
  bg: 'bg-purple-100 dark:bg-purple-500/20',
  border: 'border-purple-200',
  text: 'text-purple-600 dark:text-purple-400',
  accent: 'purple-500',
} as const;

// =============================================================================
// Undead Specification
// =============================================================================

export const UndeadSpec: ModeSpec = {
  metadata: {
    id: 'undead',
    displayName: 'Undead',
    description:
      'Place ghosts, vampires, and zombies on a grid with mirrors. Clue numbers on the edges show how many monsters are visible from each direction.',
    tags: ['training', 'logic', 'deduction'],
    difficultyLevel: 3,
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
      colors: MODE_COLOR_UNDEAD,
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
// All Undead Specs
// =============================================================================

export const UndeadSpecs = {
  undead: UndeadSpec,
} as const;
