/**
 * Flood Specification
 *
 * SINGLE SOURCE OF TRUTH for the Flood puzzle mode.
 *
 * Fill the entire grid with a single color by flood-filling from the top-left corner.
 * Grid sizes: 8x8 (easy), 10x10 (medium), 14x14 (hard).
 * Number of colors: 4 (easy), 5 (medium), 6 (hard).
 * Max moves limit scales with grid size and color count.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_FLOOD = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

// =============================================================================
// Grid Configs
// =============================================================================

export const FLOOD_GRID_CONFIGS = {
  1: { size: 8, colors: 4, maxMoves: 18 },
  2: { size: 10, colors: 5, maxMoves: 22 },
  3: { size: 14, colors: 6, maxMoves: 30 },
} as const;

// =============================================================================
// Flood Specification
// =============================================================================

export const FloodSpec: ModeSpec = {
  metadata: {
    id: 'flood',
    displayName: 'Flood',
    description: 'Fill the entire board with one color by flood-filling from the top-left corner.',
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
    trialsCount: 5,
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
      colors: MODE_COLOR_FLOOD,
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

  extensions: {
    gridConfigs: FLOOD_GRID_CONFIGS,
  },
};

// =============================================================================
// All Flood Specs
// =============================================================================

export const FloodSpecs = {
  flood: FloodSpec,
} as const;
