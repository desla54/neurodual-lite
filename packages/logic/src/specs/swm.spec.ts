/**
 * SWM (Spatial Working Memory) Specification
 *
 * SINGLE SOURCE OF TRUTH for the SWM task.
 *
 * Cambridge-style spatial working memory search:
 * - Grid of boxes to search through
 * - Find hidden tokens one at a time
 * - A box that contained a token never contains another
 * - Errors: returning to already-checked or already-found boxes
 * - Difficulty increases with number of boxes
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_SWM,
  SWM_DEFAULT_START_BOXES,
  SWM_MAX_BOXES,
  SWM_MAX_CONSECUTIVE_FAILURES,
  SWM_SEARCH_TIMEOUT_MS,
} from './thresholds';

// =============================================================================
// SWM Extensions
// =============================================================================

export interface SwmExtensions {
  /** Starting number of boxes */
  readonly startBoxes: number;
  /** Maximum number of boxes */
  readonly maxBoxes: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Timeout per search round (ms) — 0 = no timeout */
  readonly searchTimeoutMs: number;
}

// =============================================================================
// SWM Specification
// =============================================================================

export const SwmSpec: ModeSpec = {
  metadata: {
    id: 'swm',
    displayName: 'SWM',
    description: 'Search boxes to find hidden tokens. Remember where you already looked.',
    tags: ['training', 'spatial', 'working-memory', 'executive'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SWM_SEARCH_TIMEOUT_MS,
    intervalMs: 1,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: SWM_DEFAULT_START_BOXES,
    trialsCount: 12,
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
      modeScoreKey: 'report.modeScore.swmErrors',
      modeScoreTooltipKey: 'report.modeScore.swmErrorsTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SWM,
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
    startBoxes: SWM_DEFAULT_START_BOXES,
    maxBoxes: SWM_MAX_BOXES,
    maxConsecutiveFailures: SWM_MAX_CONSECUTIVE_FAILURES,
    searchTimeoutMs: SWM_SEARCH_TIMEOUT_MS,
  } satisfies SwmExtensions,
};

// =============================================================================
// All SWM Specs
// =============================================================================

export const SwmSpecs = {
  swm: SwmSpec,
} as const;
