/**
 * Memory Match Specification
 *
 * SINGLE SOURCE OF TRUTH for the Memory Match card-pairing task.
 *
 * Classic card-matching game: find all pairs by flipping cards two at a time.
 * Grid sizes scale with nLevel: 3x4 (6 pairs), 4x4 (8 pairs), 4x5 (10 pairs).
 * Measures visual working memory and spatial recall.
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Constants
// =============================================================================

export const MEMORY_MATCH_FLIP_BACK_MS = 800;
export const MEMORY_MATCH_DEFAULT_BOARDS = 5;

export const MODE_COLOR_MEMORY_MATCH = {
  bg: 'bg-violet-100 dark:bg-violet-500/20',
  border: 'border-violet-200',
  text: 'text-violet-600 dark:text-violet-400',
  accent: 'violet-500',
} as const;

// =============================================================================
// Memory Match Specification
// =============================================================================

export const MemoryMatchSpec: ModeSpec = {
  metadata: {
    id: 'memory-match',
    displayName: 'Memory Match',
    description: 'Find matching pairs of cards.',
    tags: ['training', 'memory'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: MEMORY_MATCH_FLIP_BACK_MS,
    intervalMs: 1, // Not applicable (card-flip mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 2,
    trialsCount: MEMORY_MATCH_DEFAULT_BOARDS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'INSIGHTS', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.memoryMatch',
      modeScoreTooltipKey: 'report.modeScore.memoryMatchTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_MEMORY_MATCH,
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
    flipBackMs: MEMORY_MATCH_FLIP_BACK_MS,
    defaultBoards: MEMORY_MATCH_DEFAULT_BOARDS,
    gridConfigs: [
      { rows: 2, cols: 3, pairs: 3 },
      { rows: 3, cols: 4, pairs: 6 },
      { rows: 4, cols: 4, pairs: 8 },
      { rows: 4, cols: 5, pairs: 10 },
    ],
  },
};

// =============================================================================
// All Memory Match Specs
// =============================================================================

export const MemoryMatchSpecs = {
  'memory-match': MemoryMatchSpec,
} as const;
