/**
 * Rhythm Tap Specification
 *
 * SINGLE SOURCE OF TRUTH for the Rhythm Tap task.
 *
 * A rhythm pattern is played (visual pulses). The player reproduces it by
 * tapping a central button at the correct timing. Scoring is based on the
 * accuracy of inter-tap intervals compared to the original pattern.
 *
 * - nLevel 1: 3-4 beats, 2 interval types
 * - nLevel 2: 4-5 beats, 3 interval types
 * - nLevel 3: 5-6 beats, all 5 interval types
 * - Tolerance: 150ms
 * - Intervals: [300, 450, 600, 800, 1000] ms
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  RHYTHM_TAP_DEFAULT_TRIALS,
  MODE_COLOR_RHYTHM_TAP,
} from './thresholds';

// =============================================================================
// Rhythm Tap Specification
// =============================================================================

export const RhythmTapSpec: ModeSpec = {
  metadata: {
    id: 'rhythm-tap',
    displayName: 'Rhythm Tap',
    description: 'Reproduce rhythmic patterns by tapping at the right timing.',
    tags: ['training', 'timing', 'perception'],
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
    trialsCount: RHYTHM_TAP_DEFAULT_TRIALS,
    activeModalities: ['visual'],
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
      colors: MODE_COLOR_RHYTHM_TAP,
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
// All Rhythm Tap Specs
// =============================================================================

export const RhythmTapSpecs = {
  'rhythm-tap': RhythmTapSpec,
} as const;
