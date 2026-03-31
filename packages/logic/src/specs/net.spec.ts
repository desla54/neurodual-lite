/**
 * Net Specification
 *
 * SINGLE SOURCE OF TRUTH for the Net puzzle mode.
 *
 * Inspired by Simon Tatham's "Net" puzzle.
 * Rotate tiles so the pipe network is fully connected from the source to every tile.
 * Grid sizes: 4x4 (level 1), 5x5 (level 2), 7x7 (level 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_NET = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Net Specification
// =============================================================================

export const NetSpec: ModeSpec = {
  metadata: {
    id: 'net',
    displayName: 'Net',
    description:
      'Rotate pipe tiles to connect the entire network from a source. Inspired by Simon Tatham\'s "Net".',
    tags: ['training', 'spatial', 'logic'],
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
      colors: MODE_COLOR_NET,
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
// All Net Specs
// =============================================================================

export const NetSpecs = {
  net: NetSpec,
} as const;
