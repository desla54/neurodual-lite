/**
 * Symmetry Span Specification
 *
 * SINGLE SOURCE OF TRUTH for the Symmetry Span Task.
 *
 * Complex span task (Unsworth et al., 2005):
 * - Alternate between symmetry judgments and spatial memory
 * - Judge if a pattern is vertically symmetrical
 * - Remember highlighted squares in a 4x4 grid
 * - Recall the sequence of squares at the end of each set
 * - Measures complex visuo-spatial working memory span
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_SYMMETRY_SPAN,
  SYMMETRY_SPAN_DEFAULT_SET_SIZE,
  SYMMETRY_SPAN_MAX_SET_SIZE,
  SYMMETRY_SPAN_TOTAL_SETS,
  SYMMETRY_SPAN_MAX_CONSECUTIVE_FAILURES,
  SYMMETRY_SPAN_POSITION_DISPLAY_MS,
  SYMMETRY_SPAN_PROCESSING_THRESHOLD,
} from './thresholds';

// =============================================================================
// Symmetry Span Extensions
// =============================================================================

export interface SymmetrySpanExtensions {
  /** Starting set size (number of positions to remember per set) */
  readonly startSetSize: number;
  /** Maximum set size */
  readonly maxSetSize: number;
  /** Total sets per session */
  readonly totalSets: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Duration to display each position to remember (ms) */
  readonly positionDisplayMs: number;
  /** Processing accuracy threshold to advance set size */
  readonly processingThreshold: number;
}

// =============================================================================
// Symmetry Span Specification
// =============================================================================

export const SymmetrySpanSpec: ModeSpec = {
  metadata: {
    id: 'symmetry-span',
    displayName: 'Symmetry Span',
    description: 'Judge symmetry patterns and recall spatial positions.',
    tags: ['training', 'spatial', 'span', 'complex-span'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: SYMMETRY_SPAN_POSITION_DISPLAY_MS,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: SYMMETRY_SPAN_DEFAULT_SET_SIZE,
    trialsCount: SYMMETRY_SPAN_TOTAL_SETS,
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
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SYMMETRY_SPAN,
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
    startSetSize: SYMMETRY_SPAN_DEFAULT_SET_SIZE,
    maxSetSize: SYMMETRY_SPAN_MAX_SET_SIZE,
    totalSets: SYMMETRY_SPAN_TOTAL_SETS,
    maxConsecutiveFailures: SYMMETRY_SPAN_MAX_CONSECUTIVE_FAILURES,
    positionDisplayMs: SYMMETRY_SPAN_POSITION_DISPLAY_MS,
    processingThreshold: SYMMETRY_SPAN_PROCESSING_THRESHOLD,
  } satisfies SymmetrySpanExtensions,
};

// =============================================================================
// All Symmetry Span Specs
// =============================================================================

export const SymmetrySpanSpecs = {
  'symmetry-span': SymmetrySpanSpec,
} as const;
