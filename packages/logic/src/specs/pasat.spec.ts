/**
 * PASAT (Paced Auditory Serial Addition Test) Specification
 *
 * SINGLE SOURCE OF TRUTH for the PASAT task.
 *
 * Serial addition under time pressure:
 * - Single digits (1-9) presented one at a time
 * - Add each number to the previous one and respond with the sum
 * - ISI (inter-stimulus interval) decreases on success
 * - Session ends after all trials or consecutive failures
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_PASAT,
  PASAT_DEFAULT_ISI_MS,
  PASAT_MIN_ISI_MS,
  PASAT_ISI_STEP_MS,
  PASAT_MAX_CONSECUTIVE_FAILURES,
  PASAT_DEFAULT_TRIALS,
} from './thresholds';

// =============================================================================
// PASAT Extensions
// =============================================================================

export interface PasatExtensions {
  /** Starting inter-stimulus interval (ms) */
  readonly defaultIsiMs: number;
  /** Minimum ISI (ms) — fastest pace */
  readonly minIsiMs: number;
  /** ISI decrease step on success block (ms) */
  readonly isiStepMs: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Default number of trials per session */
  readonly defaultTrials: number;
}

// =============================================================================
// PASAT Specification
// =============================================================================

export const PasatSpec: ModeSpec = {
  metadata: {
    id: 'pasat',
    displayName: 'PASAT',
    description: 'Add each number to the previous one. Pace increases on success.',
    tags: ['training', 'working-memory', 'processing-speed', 'arithmetic'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: PASAT_DEFAULT_ISI_MS,
    intervalMs: 1,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: PASAT_DEFAULT_TRIALS,
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
      modeScoreKey: 'report.modeScore.pasatAccuracy',
      modeScoreTooltipKey: 'report.modeScore.pasatAccuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_PASAT,
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
    defaultIsiMs: PASAT_DEFAULT_ISI_MS,
    minIsiMs: PASAT_MIN_ISI_MS,
    isiStepMs: PASAT_ISI_STEP_MS,
    maxConsecutiveFailures: PASAT_MAX_CONSECUTIVE_FAILURES,
    defaultTrials: PASAT_DEFAULT_TRIALS,
  } satisfies PasatExtensions,
};

// =============================================================================
// All PASAT Specs
// =============================================================================

export const PasatSpecs = {
  pasat: PasatSpec,
} as const;
