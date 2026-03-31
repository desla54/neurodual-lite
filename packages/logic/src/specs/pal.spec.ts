/**
 * PAL (Paired Associates Learning) Specification
 *
 * SINGLE SOURCE OF TRUTH for the PAL task.
 *
 * Sahakian et al. (1988) / CANTAB:
 * - Grid of boxes that open to reveal abstract patterns
 * - Encoding phase: boxes open one at a time to show patterns
 * - Recall phase: pattern shown, user selects which box it was in
 * - Adaptive difficulty: number of pairs (2 -> 8)
 * - Gold standard for early detection of cognitive decline
 * - Key metrics: total errors, first trial memory score, stages completed
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  PAL_DEFAULT_START_PAIRS,
  PAL_REVEAL_DURATION_MS,
  MODE_COLOR_PAL,
} from './thresholds';

// =============================================================================
// PAL Specification
// =============================================================================

export const PalSpec: ModeSpec = {
  metadata: {
    id: 'pal',
    displayName: 'Paired Associates',
    description: 'Remember which pattern was in which location. Measures episodic memory.',
    tags: ['training', 'memory', 'episodic', 'spatial'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: PAL_REVEAL_DURATION_MS,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: PAL_DEFAULT_START_PAIRS,
    trialsCount: 12,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_PAL,
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
// All PAL Specs
// =============================================================================

export const PalSpecs = {
  pal: PalSpec,
} as const;
