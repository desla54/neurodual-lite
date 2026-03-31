/**
 * Sokoban Specification
 *
 * SINGLE SOURCE OF TRUTH for the Sokoban box-pushing puzzle mode.
 *
 * Push all boxes onto target positions on a grid.
 * Grid sizes scale with nLevel: 5x5 (easy), 6x6 (medium), 7x7 (hard).
 * Measures planning, spatial reasoning, and executive control.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_SOKOBAN = {
  bg: 'bg-amber-100 dark:bg-amber-600/20',
  border: 'border-amber-300',
  text: 'text-amber-700 dark:text-amber-400',
  accent: 'amber-600',
} as const;

// =============================================================================
// Sokoban Specification
// =============================================================================

export const SokobanSpec: ModeSpec = {
  metadata: {
    id: 'sokoban',
    displayName: 'Sokoban',
    description:
      'Push boxes onto target positions on a grid. Plan moves carefully — you can only push, not pull.',
    tags: ['training', 'planning', 'spatial'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 60000, // Self-paced puzzle, 60s time limit
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
    trialsCount: 6,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SOKOBAN,
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
// All Sokoban Specs
// =============================================================================

export const SokobanSpecs = {
  sokoban: SokobanSpec,
} as const;
