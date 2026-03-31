/**
 * Black Box Specification
 *
 * SINGLE SOURCE OF TRUTH for the Black Box puzzle mode.
 *
 * Inspired by Simon Tatham's "Black Box". Deduce hidden ball positions inside
 * a grid by firing lasers from the edges and observing their outcomes:
 *   - Hit (H): absorbed by a ball directly in the laser's path
 *   - Reflect (R): bounced back to the entry point (ball adjacent diagonally at entry, or double deflection)
 *   - Detour (number): exits from a different edge cell (deflected by balls adjacent diagonally)
 *   - Pass-through: exits from the opposite edge (no interaction)
 *
 * Difficulty levels controlled via nLevel:
 *   Level 1: 5x5 grid, 3 balls
 *   Level 2: 8x8 grid, 4 balls
 *   Level 3: 10x10 grid, 5 balls
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_BLACKBOX = {
  bg: 'bg-gray-100 dark:bg-gray-500/20',
  border: 'border-gray-200',
  text: 'text-gray-600 dark:text-gray-400',
  accent: 'gray-500',
} as const;

// =============================================================================
// Black Box Specification
// =============================================================================

export const BlackBoxSpec: ModeSpec = {
  metadata: {
    id: 'blackbox',
    displayName: 'Black Box',
    description:
      'Deduce hidden ball positions by firing lasers from the edges and observing how they interact.',
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
      colors: MODE_COLOR_BLACKBOX,
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
// All Black Box Specs
// =============================================================================

export const BlackBoxSpecs = {
  blackbox: BlackBoxSpec,
} as const;
