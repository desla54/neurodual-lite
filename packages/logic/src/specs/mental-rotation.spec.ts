/**
 * Mental Rotation Specification
 *
 * SINGLE SOURCE OF TRUTH for the Mental Rotation Task.
 *
 * Shepard & Metzler (1971):
 * - Compare two shapes side by side
 * - Determine if they are the same (rotated) or mirror images
 * - RT increases linearly with rotation angle
 * - Measures spatial visualization and mental transformation
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_MENTAL_ROTATION,
  MENTAL_ROTATION_DEFAULT_TRIALS,
  MENTAL_ROTATION_TIMEOUT_MS,
  MENTAL_ROTATION_ITI_MS,
} from './thresholds';

// =============================================================================
// Mental Rotation Extensions
// =============================================================================

export interface MentalRotationExtensions {
  /** Default number of trials per session */
  readonly defaultTrials: number;
  /** Response timeout per trial (ms) */
  readonly timeoutMs: number;
  /** Inter-trial interval (ms) */
  readonly itiMs: number;
}

// =============================================================================
// Mental Rotation Specification
// =============================================================================

export const MentalRotationSpec: ModeSpec = {
  metadata: {
    id: 'mental-rotation',
    displayName: 'Mental Rotation',
    description: 'Compare rotated shapes to identify same vs mirror.',
    tags: ['training', 'spatial', 'visualization'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: MENTAL_ROTATION_TIMEOUT_MS,
    intervalMs: MENTAL_ROTATION_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: MENTAL_ROTATION_DEFAULT_TRIALS,
    activeModalities: ['position'],
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
      colors: MODE_COLOR_MENTAL_ROTATION,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS', 'EVOLUTION_ACCURACY'],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'DISTRIBUTION'],
    },
  },

  extensions: {
    defaultTrials: MENTAL_ROTATION_DEFAULT_TRIALS,
    timeoutMs: MENTAL_ROTATION_TIMEOUT_MS,
    itiMs: MENTAL_ROTATION_ITI_MS,
  } satisfies MentalRotationExtensions,
};

// =============================================================================
// All Mental Rotation Specs
// =============================================================================

export const MentalRotationSpecs = {
  'mental-rotation': MentalRotationSpec,
} as const;
