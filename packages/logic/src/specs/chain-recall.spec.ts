/**
 * Chain Recall Specification
 *
 * SINGLE SOURCE OF TRUTH for the Chain Recall Task.
 *
 * "I went to the market and bought..." — memorize a growing chain of items.
 * Each round adds one item; the player must recall ALL items in order.
 * Session ends after 2 consecutive failures at the same chain length.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Constants
// =============================================================================

export const CHAIN_RECALL_DEFAULT_START_LENGTH = 2;
export const CHAIN_RECALL_MAX_LENGTH = 20;
export const CHAIN_RECALL_MAX_CONSECUTIVE_FAILURES = 2;
export const CHAIN_RECALL_ITEM_DISPLAY_MS = 1500;
export const CHAIN_RECALL_ITEM_GAP_MS = 500;
export const CHAIN_RECALL_DEFAULT_TRIALS = 15;

export const MODE_COLOR_CHAIN_RECALL = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

// =============================================================================
// Chain Recall Specification
// =============================================================================

export const ChainRecallSpec: ModeSpec = {
  metadata: {
    id: 'chain-recall',
    displayName: 'Chain Recall',
    description: 'Memorize a growing sequence of items.',
    tags: ['training', 'memory', 'span'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: CHAIN_RECALL_ITEM_DISPLAY_MS,
    intervalMs: CHAIN_RECALL_ITEM_GAP_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: CHAIN_RECALL_DEFAULT_START_LENGTH,
    trialsCount: CHAIN_RECALL_DEFAULT_TRIALS,
    activeModalities: ['visual'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.chainRecall',
      modeScoreTooltipKey: 'report.modeScore.chainRecallTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_CHAIN_RECALL,
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
    startLength: CHAIN_RECALL_DEFAULT_START_LENGTH,
    maxLength: CHAIN_RECALL_MAX_LENGTH,
    maxConsecutiveFailures: CHAIN_RECALL_MAX_CONSECUTIVE_FAILURES,
    itemDisplayMs: CHAIN_RECALL_ITEM_DISPLAY_MS,
    itemGapMs: CHAIN_RECALL_ITEM_GAP_MS,
  },
};

// =============================================================================
// All Chain Recall Specs
// =============================================================================

export const ChainRecallSpecs = {
  'chain-recall': ChainRecallSpec,
} as const;
