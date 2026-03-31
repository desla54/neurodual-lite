/**
 * 2048 Specification
 *
 * SINGLE SOURCE OF TRUTH for the 2048 puzzle mode.
 *
 * Slide and merge numbered tiles to reach the target value.
 * Target: 2048 (level 1), 4096 (level 2), 8192 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_2048 = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

// =============================================================================
// 2048 Specification
// =============================================================================

export const TwentyFortyEightSpec: ModeSpec = {
  metadata: {
    id: '2048',
    displayName: '2048',
    description: 'Slide and merge numbered tiles to reach 2048. A test of planning and arithmetic.',
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
    stimulusDurationMs: 300000, // 5 minutes per puzzle
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
    trialsCount: 1,
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
      colors: MODE_COLOR_2048,
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
// All 2048 Specs
// =============================================================================

export const TwentyFortyEightSpecs = {
  '2048': TwentyFortyEightSpec,
} as const;
