/**
 * Maze Planning Specification
 *
 * SINGLE SOURCE OF TRUTH for the Maze task.
 *
 * Procedurally generated mazes:
 * - Phase 1: Plan (visually inspect the maze)
 * - Phase 2: Execute (trace/navigate the path)
 * - Adaptive difficulty: grid size increases (5x5 -> 12x12)
 * - Measures spatial planning, navigation, strategy
 * - Key metrics: planning time, execution errors, path efficiency
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  MAZE_DEFAULT_PROBLEMS,
  MAZE_PLANNING_TIME_MS,
  MODE_COLOR_MAZE,
} from './thresholds';

// =============================================================================
// Maze Specification
// =============================================================================

export const MazeSpec: ModeSpec = {
  metadata: {
    id: 'maze',
    displayName: 'Maze Planning',
    description: 'Plan and navigate through procedural mazes. Measures spatial planning.',
    tags: ['training', 'executive', 'planning', 'spatial'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: MAZE_PLANNING_TIME_MS,
    intervalMs: 1000,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: MAZE_DEFAULT_PROBLEMS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_MAZE,
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
// All Maze Specs
// =============================================================================

export const MazeSpecs = {
  maze: MazeSpec,
} as const;
