/**
 * Task Juggling Specification
 *
 * SINGLE SOURCE OF TRUTH for the Task Juggling paradigm.
 *
 * Inspired by SynWin and priority management paradigms:
 * - 3-4 independent mini-tasks running in parallel with separate timers
 * - Each task has a deadline - user must switch between them strategically
 * - Measures priority management, strategic switching, time pressure handling
 * - Highly ecological: simulates real-world multitasking
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  TASK_JUGGLING_DEFAULT_SUBTASKS,
  TASK_JUGGLING_SUBTASK_DEADLINE_MS,
  MODE_COLOR_TASK_JUGGLING,
} from './thresholds';

// =============================================================================
// Task Juggling Specification
// =============================================================================

export const TaskJugglingSpec: ModeSpec = {
  metadata: {
    id: 'task-juggling',
    displayName: 'Task Juggling',
    description:
      'Manage multiple concurrent tasks with deadlines. Measures strategic multitasking.',
    tags: ['training', 'executive', 'multitasking', 'planning'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TASK_JUGGLING_SUBTASK_DEADLINE_MS,
    intervalMs: 1000,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: TASK_JUGGLING_DEFAULT_SUBTASKS,
    trialsCount: 20,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: [],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_TASK_JUGGLING,
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
// All Task Juggling Specs
// =============================================================================

export const TaskJugglingSpecs = {
  'task-juggling': TaskJugglingSpec,
} as const;
