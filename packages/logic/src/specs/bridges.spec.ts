/**
 * Bridges (Hashiwokakero) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Bridges puzzle mode.
 *
 * Connect islands with horizontal/vertical bridges so that each island's number
 * equals its total bridge count, bridges don't cross, and all islands form a
 * single connected component.
 *
 * Levels: nLevel 1 = 6 islands, nLevel 2 = 10 islands, nLevel 3 = 15 islands.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_BRIDGES = {
  bg: 'bg-blue-100 dark:bg-blue-500/20',
  border: 'border-blue-200',
  text: 'text-blue-600 dark:text-blue-400',
  accent: 'blue-500',
} as const;

// =============================================================================
// Bridges Specification
// =============================================================================

export const BridgesSpec: ModeSpec = {
  metadata: {
    id: 'bridges',
    displayName: 'Bridges',
    description:
      'Connect islands with bridges so each island has the correct number of connections. All islands must form a single network.',
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
      colors: MODE_COLOR_BRIDGES,
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
// All Bridges Specs
// =============================================================================

export const BridgesSpecs = {
  bridges: BridgesSpec,
} as const;
