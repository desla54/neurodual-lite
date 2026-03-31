/**
 * Time Mode Specification (Dual Time)
 *
 * SINGLE SOURCE OF TRUTH for Time-based game modes.
 *
 * Dual Time (alpha):
 * - Temporal anchoring via guided slide duration
 * - Optional post-trial time estimation
 */

import type { ModeSpec } from './types';
import {
  // Scoring
  ACCURACY_PASS_NORMALIZED,
  // Timing
  TIMING_STIMULUS_FLOW_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_LABEL,
  // Defaults
  DEFAULT_TRIALS_COUNT_FLOW,
  // Colors
  MODE_COLOR_DUAL_TIME,
} from './thresholds';

// =============================================================================
// Dual Time Specification
// =============================================================================

export const DualTimeSpec: ModeSpec = {
  metadata: {
    id: 'dual-time',
    displayName: 'Dual Time',
    description: 'Ancrage temporel par glissade régulière et estimation du temps.',
    tags: ['training', 'time', 'alpha'],
    difficultyLevel: 2,
    version: '0.2.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TIMING_STIMULUS_FLOW_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: GEN_LURE_PROBABILITY_LABEL,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
    activeModalities: ['position', 'audio'],
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
      colors: MODE_COLOR_DUAL_TIME,
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
};

// =============================================================================
// All Time Specs
// =============================================================================

export const TimeSpecs = {
  'dual-time': DualTimeSpec,
} as const;
