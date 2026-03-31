/**
 * Running Span Specification
 *
 * SINGLE SOURCE OF TRUTH for the Running Span Task.
 *
 * Serial recall of recent items from an unpredictably long stream:
 * - Letters appear one at a time at a fixed rate
 * - The stream length varies randomly (participant doesn't know when it ends)
 * - When the stream stops, recall the LAST N items in order
 * - Span increases on success, session ends after consecutive failures
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_RUNNING_SPAN,
  RUNNING_SPAN_DEFAULT_START_SPAN,
  RUNNING_SPAN_MAX_SPAN,
  RUNNING_SPAN_MAX_CONSECUTIVE_FAILURES,
  RUNNING_SPAN_ITEM_DISPLAY_MS,
  RUNNING_SPAN_ITEM_GAP_MS,
  RUNNING_SPAN_MIN_EXTRA_ITEMS,
  RUNNING_SPAN_MAX_EXTRA_ITEMS,
} from './thresholds';

// =============================================================================
// Running Span Extensions
// =============================================================================

export interface RunningSpanExtensions {
  /** Starting span (number of final items to recall) */
  readonly startSpan: number;
  /** Maximum span */
  readonly maxSpan: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Duration to display each item (ms) */
  readonly itemDisplayMs: number;
  /** Gap between items (ms) */
  readonly itemGapMs: number;
  /** Minimum extra items before the recall window */
  readonly minExtraItems: number;
  /** Maximum extra items before the recall window */
  readonly maxExtraItems: number;
  /** Letter pool for stream items */
  readonly letterPool: readonly string[];
}

// =============================================================================
// Running Span Specification
// =============================================================================

export const RunningSpanSpec: ModeSpec = {
  metadata: {
    id: 'running-span',
    displayName: 'Running Span',
    description: 'Stream of letters stops unpredictably. Recall the last N in order.',
    tags: ['training', 'working-memory', 'span', 'updating'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: RUNNING_SPAN_ITEM_DISPLAY_MS,
    intervalMs: RUNNING_SPAN_ITEM_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: RUNNING_SPAN_DEFAULT_START_SPAN,
    trialsCount: 15,
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
      modeScoreKey: 'report.modeScore.runningSpan',
      modeScoreTooltipKey: 'report.modeScore.runningSpanTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_RUNNING_SPAN,
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
    startSpan: RUNNING_SPAN_DEFAULT_START_SPAN,
    maxSpan: RUNNING_SPAN_MAX_SPAN,
    maxConsecutiveFailures: RUNNING_SPAN_MAX_CONSECUTIVE_FAILURES,
    itemDisplayMs: RUNNING_SPAN_ITEM_DISPLAY_MS,
    itemGapMs: RUNNING_SPAN_ITEM_GAP_MS,
    minExtraItems: RUNNING_SPAN_MIN_EXTRA_ITEMS,
    maxExtraItems: RUNNING_SPAN_MAX_EXTRA_ITEMS,
    letterPool: ['B', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W'],
  } satisfies RunningSpanExtensions,
};

// =============================================================================
// All Running Span Specs
// =============================================================================

export const RunningSpanSpecs = {
  'running-span': RunningSpanSpec,
} as const;
