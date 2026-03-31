/**
 * PVT (Psychomotor Vigilance Test) Specification
 *
 * SINGLE SOURCE OF TRUTH for the PVT.
 *
 * Dinges & Powell (1985):
 * - Wait for a stimulus (counter) to appear at random intervals (2-10s)
 * - React as fast as possible when counter appears
 * - False starts (response before stimulus) are penalized
 * - Key metrics: median RT, fastest/slowest RT, lapses (RT > 500ms)
 * - Gold standard for sustained attention and fatigue assessment
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  PVT_DEFAULT_TRIALS,
  PVT_FOREPERIOD_MIN_MS,
  PVT_FOREPERIOD_MAX_MS,
  MODE_COLOR_PVT,
} from './thresholds';

// =============================================================================
// PVT Specification
// =============================================================================

export const PvtSpec: ModeSpec = {
  metadata: {
    id: 'pvt',
    displayName: 'PVT',
    description: 'React as fast as possible when the stimulus appears.',
    tags: ['training', 'vigilance', 'attention'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: PVT_FOREPERIOD_MAX_MS,
    intervalMs: PVT_FOREPERIOD_MIN_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: PVT_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_PVT,
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
// All PVT Specs
// =============================================================================

export const PvtSpecs = {
  pvt: PvtSpec,
} as const;
