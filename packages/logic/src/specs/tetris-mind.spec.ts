/**
 * Tetris Mind Specification
 *
 * SINGLE SOURCE OF TRUTH for the Tetris Mind spatial rotation mode.
 *
 * A target shape (hole/outline) is shown. The player must mentally rotate
 * tetromino-like pieces to determine which one fits the hole.
 *
 * nLevel difficulty:
 * - Level 1: Pieces rotated 0 or 90 degrees only
 * - Level 2: Any rotation (0/90/180/270)
 * - Level 3: Rotation + mirror flip
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_TETRIS_MIND = {
  bg: 'bg-purple-100 dark:bg-purple-500/20',
  border: 'border-purple-200',
  text: 'text-purple-600 dark:text-purple-400',
  accent: 'purple-500',
} as const;

// =============================================================================
// Constants
// =============================================================================

export const TETRIS_MIND_DEFAULT_TRIALS = 20;
export const TETRIS_MIND_FEEDBACK_CORRECT_MS = 800;
export const TETRIS_MIND_FEEDBACK_INCORRECT_MS = 1200;
export const TETRIS_MIND_ITI_MS = 600;

// =============================================================================
// Tetris Mind Specification
// =============================================================================

export const TetrisMindSpec: ModeSpec = {
  metadata: {
    id: 'tetris-mind',
    displayName: 'Tetris Mind',
    description:
      'Mentally rotate pieces to find the one that fits the target hole. Spatial reasoning and mental rotation training.',
    tags: ['training', 'spatial', 'rotation'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 60000, // Self-paced puzzle, 60s time limit
    intervalMs: 1, // Not applicable (puzzle mode)
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: TETRIS_MIND_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_TETRIS_MIND,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'DISTRIBUTION'],
    },
  },
};

// =============================================================================
// All Tetris Mind Specs
// =============================================================================

export const TetrisMindSpecs = {
  'tetris-mind': TetrisMindSpec,
} as const;
