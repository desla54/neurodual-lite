/**
 * Light Up (Akari) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Light Up puzzle mode.
 *
 * Place light bulbs on a grid to illuminate all white cells.
 * Bulbs shine in 4 directions until hitting a wall or edge.
 * Numbered walls constrain how many adjacent bulbs they require.
 * No two bulbs may see each other (same row/col without wall between).
 * Grid sizes: 5x5 (level 1), 7x7 (level 2), 10x10 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_LIGHTUP = {
  bg: 'bg-yellow-100 dark:bg-yellow-500/20',
  border: 'border-yellow-200',
  text: 'text-yellow-600 dark:text-yellow-400',
  accent: 'yellow-500',
} as const;

// =============================================================================
// Light Up Specification
// =============================================================================

export const LightUpSpec: ModeSpec = {
  metadata: {
    id: 'lightup',
    displayName: 'Light Up',
    description:
      'Place light bulbs on a grid to illuminate every cell. Bulbs shine in 4 directions; no two may see each other.',
    tags: ['training', 'logic', 'planning'],
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
      colors: MODE_COLOR_LIGHTUP,
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
// All Light Up Specs
// =============================================================================

export const LightUpSpecs = {
  lightup: LightUpSpec,
} as const;
