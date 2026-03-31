/**
 * Letter-Number Sequencing Specification
 *
 * SINGLE SOURCE OF TRUTH for Letter-Number Sequencing (Gold et al., 1997).
 *
 * See/hear mixed sequence of letters and numbers, reorder:
 * numbers ascending, then letters alphabetically.
 * Span increases on success, session ends after 2 consecutive failures.
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_LETTER_NUMBER,
  LETTER_NUMBER_DEFAULT_START_SPAN,
  LETTER_NUMBER_MAX_SPAN,
  LETTER_NUMBER_MAX_CONSECUTIVE_FAILURES,
  LETTER_NUMBER_ITEM_DISPLAY_MS,
  LETTER_NUMBER_ITEM_GAP_MS,
} from './thresholds';

// =============================================================================
// Letter-Number Specification
// =============================================================================

export const LetterNumberSpec: ModeSpec = {
  metadata: {
    id: 'letter-number',
    displayName: 'Letter-Number',
    description:
      'Reorder mixed letter-number sequences: numbers ascending, then letters alphabetically.',
    tags: ['training', 'verbal', 'manipulation'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: LETTER_NUMBER_ITEM_DISPLAY_MS,
    intervalMs: LETTER_NUMBER_ITEM_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: LETTER_NUMBER_DEFAULT_START_SPAN,
    trialsCount: 14,
    activeModalities: ['audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.letterNumber',
      modeScoreTooltipKey: 'report.modeScore.letterNumberTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_LETTER_NUMBER,
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
    startSpan: LETTER_NUMBER_DEFAULT_START_SPAN,
    maxSpan: LETTER_NUMBER_MAX_SPAN,
    maxConsecutiveFailures: LETTER_NUMBER_MAX_CONSECUTIVE_FAILURES,
    itemDisplayMs: LETTER_NUMBER_ITEM_DISPLAY_MS,
    itemGapMs: LETTER_NUMBER_ITEM_GAP_MS,
  },
};

// =============================================================================
// All Letter-Number Specs
// =============================================================================

export const LetterNumberSpecs = {
  'letter-number': LetterNumberSpec,
} as const;
