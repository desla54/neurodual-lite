/**
 * Towers (Skyscrapers) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Towers puzzle mode.
 *
 * NxN latin square grid where each row and column contains digits 1-N exactly once.
 * Numbers represent building heights. Clues around the edges tell how many buildings
 * are visible from that direction (taller buildings hide shorter ones behind).
 * Grid sizes scale with nLevel: 4x4 (level 1), 5x5 (level 2), 6x6 (level 3).
 * Inspired by Simon Tatham's "Towers" puzzle.
 */

import type { ModeSpec, ModeColorSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_TOWERS: ModeColorSpec = {
  bg: 'bg-sky-100 dark:bg-sky-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
};

// =============================================================================
// Grid Configs (extensions)
// =============================================================================

export const TOWERS_GRID_CONFIGS = {
  1: { size: 4 },
  2: { size: 5 },
  3: { size: 6 },
} as const;

// =============================================================================
// Towers Specification
// =============================================================================

export const TowersSpec: ModeSpec = {
  metadata: {
    id: 'towers',
    displayName: 'Towers',
    description:
      'Fill an NxN grid so every row and column contains digits 1-N. Edge clues tell how many buildings are visible from that direction.',
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
    stimulusDurationMs: 300000, // 5 min time limit per puzzle
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
      colors: MODE_COLOR_TOWERS,
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
    gridConfigs: TOWERS_GRID_CONFIGS,
  },
};

// =============================================================================
// All Towers Specs
// =============================================================================

export const TowersSpecs = {
  towers: TowersSpec,
} as const;
