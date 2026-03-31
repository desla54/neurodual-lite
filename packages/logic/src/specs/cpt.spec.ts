/**
 * CPT (Continuous Performance Test) Specification
 *
 * SINGLE SOURCE OF TRUTH for the CPT.
 *
 * Conners (1995):
 * - Letters appear sequentially
 * - Respond only when A is followed by X (A-X sequence)
 * - Long duration (5-10 min) to measure vigilance decrement
 * - Key metrics: hits, false alarms, d-prime by time quartile
 * - Distinct from AX-CPT (which measures proactive/reactive control, not vigilance)
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  CPT_DEFAULT_TRIALS,
  CPT_STIMULUS_DURATION_MS,
  CPT_ISI_MS,
  CPT_TARGET_PROBABILITY,
  MODE_COLOR_CPT,
} from './thresholds';

// =============================================================================
// CPT Specification
// =============================================================================

export const CptSpec: ModeSpec = {
  metadata: {
    id: 'cpt',
    displayName: 'CPT',
    description: 'Detect A-X sequences among distractors. Measures sustained vigilance over time.',
    tags: ['training', 'attention', 'vigilance'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: CPT_STIMULUS_DURATION_MS,
    intervalMs: CPT_ISI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: CPT_TARGET_PROBABILITY,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: CPT_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'RECENT_TREND', 'PERFORMANCE', 'SPEED', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_CPT,
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
// All CPT Specs
// =============================================================================

export const CptSpecs = {
  cpt: CptSpec,
} as const;
