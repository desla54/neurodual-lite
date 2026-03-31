/**
 * Trail Making Test Specification
 *
 * SINGLE SOURCE OF TRUTH for the Trail Making Test (TMT).
 *
 * Reitan (1958):
 * - Part A: Connect numbers in order (1-2-3-4...)
 * - Part B: Alternate numbers and letters (1-A-2-B-3-C...)
 * - B-A difference = executive switching cost
 * - Measures processing speed and cognitive flexibility
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  TRAIL_MAKING_A_ITEMS,
  TRAIL_MAKING_B_ITEMS,
  TRAIL_MAKING_STIMULUS_TIMEOUT_MS,
  TRAIL_MAKING_ITI_MS,
  MODE_COLOR_TRAIL_MAKING,
} from './thresholds';

// =============================================================================
// Trail Making Extensions
// =============================================================================

export interface TrailMakingExtensions {
  /** Number of items in TMT-A */
  readonly tmtAItems: number;
  /** Number of items in TMT-B */
  readonly tmtBItems: number;
  /** Inter-phase interval (ms) */
  readonly itiMs: number;
}

// =============================================================================
// Trail Making Specification
// =============================================================================

export const TrailMakingSpec: ModeSpec = {
  metadata: {
    id: 'trail-making',
    displayName: 'Trail Making',
    description: 'Connect numbers and letters in alternating order. Measures switching cost.',
    tags: ['training', 'flexibility', 'speed'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TRAIL_MAKING_STIMULUS_TIMEOUT_MS,
    intervalMs: TRAIL_MAKING_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 2, // 1 TMT-A run + 1 TMT-B run
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: [],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'SPEED', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_TRAIL_MAKING,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'DISTRIBUTION'],
    },
  },

  extensions: {
    tmtAItems: TRAIL_MAKING_A_ITEMS,
    tmtBItems: TRAIL_MAKING_B_ITEMS,
    itiMs: TRAIL_MAKING_ITI_MS,
  } satisfies TrailMakingExtensions,
};

// =============================================================================
// All Trail Making Specs
// =============================================================================

export const TrailMakingSpecs = {
  'trail-making': TrailMakingSpec,
} as const;
