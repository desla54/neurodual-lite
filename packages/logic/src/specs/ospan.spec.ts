/**
 * Operation Span (OSPAN) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Operation Span Task.
 *
 * Complex span task combining:
 * - Processing component: verify simple arithmetic equations (e.g., "3 + 4 = 8?")
 * - Storage component: memorize letters presented between equations
 * - Recall: reproduce the letters in order at the end of each set
 * - Span increases on success, session ends after consecutive failures
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_OSPAN,
  OSPAN_DEFAULT_START_SPAN,
  OSPAN_MAX_SPAN,
  OSPAN_MAX_CONSECUTIVE_FAILURES,
  OSPAN_ITEM_DISPLAY_MS,
  OSPAN_EQUATION_TIMEOUT_MS,
  OSPAN_ITEM_GAP_MS,
} from './thresholds';

// =============================================================================
// OSPAN Extensions
// =============================================================================

export interface OspanExtensions {
  /** Starting span (number of items to remember in first set) */
  readonly startSpan: number;
  /** Maximum span (game ends when exceeded) */
  readonly maxSpan: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Duration to display each memory item (ms) */
  readonly itemDisplayMs: number;
  /** Timeout for equation verification (ms) */
  readonly equationTimeoutMs: number;
  /** Gap between items during presentation (ms) */
  readonly itemGapMs: number;
  /** Minimum equation accuracy required for a valid measure */
  readonly processingAccuracyThreshold: number;
  /** Letter pool for memory items */
  readonly letterPool: readonly string[];
}

// =============================================================================
// OSPAN Specification
// =============================================================================

export const OspanSpec: ModeSpec = {
  metadata: {
    id: 'ospan',
    displayName: 'Operation Span',
    description: 'Verify equations while memorizing letters. Recall in order.',
    tags: ['training', 'working-memory', 'span', 'dual-task'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: OSPAN_ITEM_DISPLAY_MS,
    intervalMs: OSPAN_ITEM_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: OSPAN_DEFAULT_START_SPAN,
    trialsCount: 10,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.ospanSpan',
      modeScoreTooltipKey: 'report.modeScore.ospanSpanTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_OSPAN,
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
    startSpan: OSPAN_DEFAULT_START_SPAN,
    maxSpan: OSPAN_MAX_SPAN,
    maxConsecutiveFailures: OSPAN_MAX_CONSECUTIVE_FAILURES,
    itemDisplayMs: OSPAN_ITEM_DISPLAY_MS,
    equationTimeoutMs: OSPAN_EQUATION_TIMEOUT_MS,
    itemGapMs: OSPAN_ITEM_GAP_MS,
    processingAccuracyThreshold: 85,
    letterPool: ['F', 'H', 'J', 'K', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'Y'],
  } satisfies OspanExtensions,
};

// =============================================================================
// All OSPAN Specs
// =============================================================================

export const OspanSpecs = {
  ospan: OspanSpec,
} as const;
