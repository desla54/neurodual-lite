/**
 * Pipeline Specification
 *
 * SINGLE SOURCE OF TRUTH for the Pipeline puzzle mode.
 *
 * Connect pipes from a source (top-left) to a destination (bottom-right) on a grid.
 * Player rotates pre-placed pipe pieces to create a continuous path.
 * Grid sizes: 5x5 (nLevel 1), 6x6 (nLevel 2), 7x7 (nLevel 3).
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, GEN_TARGET_PROBABILITY_DEFAULT } from './thresholds';

// =============================================================================
// Constants
// =============================================================================

const PIPELINE_DEFAULT_N_LEVEL = 1;
const PIPELINE_DEFAULT_TRIALS_COUNT = 6;
const PIPELINE_DIFFICULTY_LEVEL = 3;

// =============================================================================
// Mode Color
// =============================================================================

export const MODE_COLOR_PIPELINE = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;

// =============================================================================
// Pipeline Specification
// =============================================================================

export const PipelineSpec: ModeSpec = {
  metadata: {
    id: 'pipeline',
    displayName: 'Pipeline',
    description: 'Connect pipes from source to destination by rotating pipe pieces on a grid.',
    tags: ['training', 'planning', 'spatial'],
    difficultyLevel: PIPELINE_DIFFICULTY_LEVEL,
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
    nLevel: PIPELINE_DEFAULT_N_LEVEL,
    trialsCount: PIPELINE_DEFAULT_TRIALS_COUNT,
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
      colors: MODE_COLOR_PIPELINE,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY'],
    },
  },
};

// =============================================================================
// All Pipeline Specs
// =============================================================================

export const PipelineSpecs = {
  pipeline: PipelineSpec,
} as const;
