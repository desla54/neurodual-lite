/**
 * Digit Span Specification
 *
 * SINGLE SOURCE OF TRUTH for the Digit Span Task (Wechsler, 1955).
 *
 * Forward: remember and reproduce sequences of digits in same order.
 * Backward: remember and reproduce sequences in reverse order.
 * Span increases on success, session ends after 2 consecutive failures.
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_DIGIT_SPAN,
  DIGIT_SPAN_DEFAULT_START_SPAN,
  DIGIT_SPAN_MAX_SPAN,
  DIGIT_SPAN_MAX_CONSECUTIVE_FAILURES,
  DIGIT_SPAN_DIGIT_DISPLAY_MS,
  DIGIT_SPAN_DIGIT_GAP_MS,
} from './thresholds';

// =============================================================================
// Digit Span Specification
// =============================================================================

export const DigitSpanSpec: ModeSpec = {
  metadata: {
    id: 'digit-span',
    displayName: 'Digit Span',
    description: 'Remember and reproduce digit sequences of increasing length.',
    tags: ['training', 'verbal', 'span'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: DIGIT_SPAN_DIGIT_DISPLAY_MS,
    intervalMs: DIGIT_SPAN_DIGIT_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: DIGIT_SPAN_DEFAULT_START_SPAN,
    trialsCount: 14,
    activeModalities: ['audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.digitSpan',
      modeScoreTooltipKey: 'report.modeScore.digitSpanTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_DIGIT_SPAN,
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
    startSpan: DIGIT_SPAN_DEFAULT_START_SPAN,
    maxSpan: DIGIT_SPAN_MAX_SPAN,
    maxConsecutiveFailures: DIGIT_SPAN_MAX_CONSECUTIVE_FAILURES,
    digitDisplayMs: DIGIT_SPAN_DIGIT_DISPLAY_MS,
    digitGapMs: DIGIT_SPAN_DIGIT_GAP_MS,
  },
};

// =============================================================================
// All Digit Span Specs
// =============================================================================

export const DigitSpanSpecs = {
  'digit-span': DigitSpanSpec,
} as const;
