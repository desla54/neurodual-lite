/**
 * Corsi Block Specification
 *
 * SINGLE SOURCE OF TRUTH for the Corsi Block Tapping Task.
 *
 * Classic spatial working memory test:
 * - Blocks light up in sequence on a 3x3 grid
 * - Player reproduces the sequence by tapping blocks in order
 * - Span increases on success, session ends after consecutive failures
 * - Forward and backward variants
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_CORSI_BLOCK,
  CORSI_DEFAULT_START_SPAN,
  CORSI_MAX_SPAN,
  CORSI_MAX_CONSECUTIVE_FAILURES,
  CORSI_BLOCK_HIGHLIGHT_MS,
  CORSI_BLOCK_GAP_MS,
} from './thresholds';

// =============================================================================
// Corsi Block Extensions
// =============================================================================

export interface CorsiExtensions {
  /** Starting span (number of blocks in first sequence) */
  readonly startSpan: number;
  /** Maximum span (game ends when exceeded) */
  readonly maxSpan: number;
  /** Consecutive failures before session ends */
  readonly maxConsecutiveFailures: number;
  /** Direction: 'forward' = same order, 'backward' = reverse order */
  readonly direction: 'forward' | 'backward';
  /** Duration of block highlight during presentation (ms) */
  readonly blockHighlightMs: number;
  /** Gap between blocks during presentation (ms) */
  readonly blockGapMs: number;
}

// =============================================================================
// Corsi Block Specification
// =============================================================================

export const CorsiBlockSpec: ModeSpec = {
  metadata: {
    id: 'corsi-block',
    displayName: 'Corsi Block',
    description: 'Reproduce spatial sequences of increasing length.',
    tags: ['training', 'spatial', 'span'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: CORSI_BLOCK_HIGHLIGHT_MS,
    intervalMs: CORSI_BLOCK_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: CORSI_DEFAULT_START_SPAN,
    trialsCount: 14,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'corsiDirection', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.corsiSpan',
      modeScoreTooltipKey: 'report.modeScore.corsiSpanTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_CORSI_BLOCK,
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
    startSpan: CORSI_DEFAULT_START_SPAN,
    maxSpan: CORSI_MAX_SPAN,
    maxConsecutiveFailures: CORSI_MAX_CONSECUTIVE_FAILURES,
    direction: 'forward',
    blockHighlightMs: CORSI_BLOCK_HIGHLIGHT_MS,
    blockGapMs: CORSI_BLOCK_GAP_MS,
  } satisfies CorsiExtensions,
};

// =============================================================================
// All Corsi Specs
// =============================================================================

export const CorsiSpecs = {
  'corsi-block': CorsiBlockSpec,
} as const;
