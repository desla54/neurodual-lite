/**
 * Reading Span Specification
 *
 * SINGLE SOURCE OF TRUTH for the Reading Span Task (Daneman & Carpenter, 1980).
 *
 * Read sentences for meaning (true/false judgment) + remember target words.
 * Set size increases on success, session ends after 2 consecutive failures.
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_READING_SPAN,
  READING_SPAN_DEFAULT_START_SPAN,
  READING_SPAN_MAX_SPAN,
  READING_SPAN_MAX_CONSECUTIVE_FAILURES,
  READING_SPAN_WORD_DISPLAY_MS,
} from './thresholds';

// =============================================================================
// Reading Span Specification
// =============================================================================

export const ReadingSpanSpec: ModeSpec = {
  metadata: {
    id: 'reading-span',
    displayName: 'Reading Span',
    description: 'Judge sentences and remember target words across sets of increasing size.',
    tags: ['training', 'verbal', 'complex-span'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: READING_SPAN_WORD_DISPLAY_MS,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: READING_SPAN_DEFAULT_START_SPAN,
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
      modeScoreKey: 'report.modeScore.readingSpan',
      modeScoreTooltipKey: 'report.modeScore.readingSpanTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_READING_SPAN,
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
    startSpan: READING_SPAN_DEFAULT_START_SPAN,
    maxSpan: READING_SPAN_MAX_SPAN,
    maxConsecutiveFailures: READING_SPAN_MAX_CONSECUTIVE_FAILURES,
    wordDisplayMs: READING_SPAN_WORD_DISPLAY_MS,
  },
};

// =============================================================================
// All Reading Span Specs
// =============================================================================

export const ReadingSpanSpecs = {
  'reading-span': ReadingSpanSpec,
} as const;
