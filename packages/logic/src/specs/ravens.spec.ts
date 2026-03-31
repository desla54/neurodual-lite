/**
 * Ravens Progressive Matrices Specification
 *
 * SINGLE SOURCE OF TRUTH for the Ravens Progressive Matrices Task.
 *
 * Raven (1938):
 * - 3x3 matrix of visual patterns with one missing
 * - Select the correct pattern to complete the matrix
 * - Rules involve shape, fill, size, count transformations
 * - The most widely used measure of fluid intelligence (Gf)
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_RAVENS,
  RAVENS_DEFAULT_TRIALS,
} from './thresholds';

// =============================================================================
// Ravens Extensions
// =============================================================================

export interface RavensExtensions {
  /** Default number of problems per session */
  readonly defaultTrials: number;
  /** Adaptive difficulty mode */
  readonly difficultyMode: '2up1down';
  /** Start level for adaptive staircase */
  readonly startLevel: number;
  /** Maximum difficulty level */
  readonly maxLevel: number;
  /** Number of answer options (6 or 8 depending on difficulty level) */
  readonly optionCount: 6 | 8;
}

// =============================================================================
// Ravens Specification
// =============================================================================

export const RavensSpec: ModeSpec = {
  metadata: {
    id: 'visual-logic',
    displayName: 'Visual Logic',
    description: 'Complete visual pattern matrices by finding the missing piece.',
    tags: ['training', 'reasoning', 'fluid-intelligence'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 0, // Self-paced
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: RAVENS_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none', // Adaptive 2-up/1-down staircase is handled locally in ravens-training.tsx, not via the spec pipeline
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_RAVENS,
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
    defaultTrials: RAVENS_DEFAULT_TRIALS,
    difficultyMode: '2up1down',
    startLevel: 1,
    maxLevel: 10,
    optionCount: 6,
  } satisfies RavensExtensions,
};

// =============================================================================
// All Ravens Specs
// =============================================================================

export const RavensSpecs = {
  'visual-logic': RavensSpec,
} as const;
