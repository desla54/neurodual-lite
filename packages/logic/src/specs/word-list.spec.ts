/**
 * Word List Learning Specification (RAVLT-inspired)
 *
 * SINGLE SOURCE OF TRUTH for the Word List Learning task.
 *
 * Rey (1941) / RAVLT:
 * - List of 15 words presented sequentially
 * - 5 learning trials with recall after each
 * - Interference list, then delayed recall
 * - Scoring: learning curve (trials 1->5), proactive/retroactive interference
 * - Mobile adaptation: select words from a pool rather than free recall
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  WORD_LIST_DEFAULT_LIST_SIZE,
  WORD_LIST_WORD_DISPLAY_MS,
  MODE_COLOR_WORD_LIST,
} from './thresholds';

// =============================================================================
// Word List Specification
// =============================================================================

export const WordListSpec: ModeSpec = {
  metadata: {
    id: 'word-list',
    displayName: 'Word List',
    description:
      'Learn and recall word lists across multiple trials. Measures verbal episodic memory.',
    tags: ['training', 'memory', 'episodic', 'verbal'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: WORD_LIST_WORD_DISPLAY_MS,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: WORD_LIST_DEFAULT_LIST_SIZE,
    activeModalities: ['audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_WORD_LIST,
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
};

// =============================================================================
// All Word List Specs
// =============================================================================

export const WordListSpecs = {
  'word-list': WordListSpec,
} as const;
