/**
 * Sternberg Memory Search Specification
 *
 * SINGLE SOURCE OF TRUTH for the Sternberg Task (Sternberg, 1966).
 *
 * Memory scanning: memorize a set of letters, then determine if a probe was in the set.
 * RT increases linearly with set size, revealing memory scanning speed.
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_STERNBERG,
  STERNBERG_DEFAULT_TRIALS,
  STERNBERG_SET_DISPLAY_MS,
  STERNBERG_BLANK_MS,
  STERNBERG_RESPONSE_TIMEOUT_MS,
} from './thresholds';

// =============================================================================
// Sternberg Specification
// =============================================================================

export const SternbergSpec: ModeSpec = {
  metadata: {
    id: 'sternberg',
    displayName: 'Sternberg',
    description: 'Memorize a set of letters, then decide if a probe was in the set.',
    tags: ['training', 'memory-scanning', 'speed'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: STERNBERG_SET_DISPLAY_MS,
    intervalMs: STERNBERG_BLANK_MS,
    responseWindowMs: STERNBERG_RESPONSE_TIMEOUT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: STERNBERG_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'SPEED', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_STERNBERG,
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
    setDisplayMs: STERNBERG_SET_DISPLAY_MS,
    blankMs: STERNBERG_BLANK_MS,
    responseTimeoutMs: STERNBERG_RESPONSE_TIMEOUT_MS,
  },
};

// =============================================================================
// All Sternberg Specs
// =============================================================================

export const SternbergSpecs = {
  sternberg: SternbergSpec,
} as const;
