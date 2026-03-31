/**
 * Task Switching Specification
 *
 * SINGLE SOURCE OF TRUTH for the Task Switching paradigm.
 *
 * Rogers & Monsell (1995):
 * - Alternate between two classification rules (odd/even vs high/low)
 * - Switch cue (background color) tells which rule to apply
 * - Measures switch cost (RT difference between switch and repeat trials)
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  TASK_SWITCHING_DEFAULT_TRIALS,
  TASK_SWITCHING_CUE_MS,
  TASK_SWITCHING_STIMULUS_TIMEOUT_MS,
  TASK_SWITCHING_FEEDBACK_MS,
  TASK_SWITCHING_ITI_MS,
  MODE_COLOR_TASK_SWITCHING,
} from './thresholds';

// =============================================================================
// Task Switching Extensions
// =============================================================================

export interface TaskSwitchingExtensions {
  /** Cue display duration before stimulus (ms) */
  readonly cueMs: number;
  /** Stimulus timeout (ms) */
  readonly stimulusTimeoutMs: number;
  /** Feedback display duration (ms) */
  readonly feedbackMs: number;
  /** Inter-trial interval (ms) */
  readonly itiMs: number;
}

// =============================================================================
// Task Switching Specification
// =============================================================================

export const TaskSwitchingSpec: ModeSpec = {
  metadata: {
    id: 'task-switching',
    displayName: 'Task Switching',
    description: 'Alternate between two classification rules. Measures switch cost.',
    tags: ['training', 'flexibility', 'executive'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TASK_SWITCHING_STIMULUS_TIMEOUT_MS,
    intervalMs: TASK_SWITCHING_ITI_MS,
    feedbackDurationMs: TASK_SWITCHING_FEEDBACK_MS,
    responseWindowMs: TASK_SWITCHING_STIMULUS_TIMEOUT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: TASK_SWITCHING_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'RECENT_TREND', 'PERFORMANCE', 'SPEED', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_TASK_SWITCHING,
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

  extensions: {
    cueMs: TASK_SWITCHING_CUE_MS,
    stimulusTimeoutMs: TASK_SWITCHING_STIMULUS_TIMEOUT_MS,
    feedbackMs: TASK_SWITCHING_FEEDBACK_MS,
    itiMs: TASK_SWITCHING_ITI_MS,
  } satisfies TaskSwitchingExtensions,
};

// =============================================================================
// All Task Switching Specs
// =============================================================================

export const TaskSwitchingSpecs = {
  'task-switching': TaskSwitchingSpec,
} as const;
