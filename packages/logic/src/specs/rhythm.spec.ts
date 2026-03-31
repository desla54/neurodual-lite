/**
 * Rhythm Reproduction Specification
 *
 * SINGLE SOURCE OF TRUTH for the Rhythm Reproduction task.
 *
 * Temporal-motor paradigm:
 * - Rhythmic pattern played (auditory or visual beats)
 * - User reproduces the pattern by tapping
 * - Adaptive difficulty: number of beats (3->8), pattern complexity, tempo
 * - Crosses timing + working memory
 * - Key metrics: timing accuracy (ms deviation), pattern accuracy
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, RHYTHM_DEFAULT_TRIALS, MODE_COLOR_RHYTHM } from './thresholds';

// =============================================================================
// Rhythm Specification
// =============================================================================

export const RhythmSpec: ModeSpec = {
  metadata: {
    id: 'rhythm',
    displayName: 'Rhythm',
    description: 'Listen and reproduce rhythmic patterns by tapping. Measures temporal precision.',
    tags: ['training', 'timing', 'motor', 'memory'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 5000,
    intervalMs: 1000,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: RHYTHM_DEFAULT_TRIALS,
    activeModalities: ['audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_RHYTHM,
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
};

// =============================================================================
// All Rhythm Specs
// =============================================================================

export const RhythmSpecs = {
  rhythm: RhythmSpec,
} as const;
