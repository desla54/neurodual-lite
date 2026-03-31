/**
 * Dual Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Dual Task paradigm.
 *
 * Pashler (1994):
 * - Split screen: visual task (top) + auditory task (bottom)
 * - Both tasks run simultaneously and continuously
 * - Scoring: isolated performance vs combined -> dual-task cost (%)
 * - Measures attentional resource sharing and central bottleneck
 * - Simple variant: regular tapping (maintain rhythm) + visual classification
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  DUAL_TASK_VISUAL_TIMEOUT_MS,
  MODE_COLOR_DUAL_TASK,
} from './thresholds';

// =============================================================================
// Dual Task Specification
// =============================================================================

export const DualTaskSpec: ModeSpec = {
  metadata: {
    id: 'dual-task',
    displayName: 'Dual Task',
    description:
      'Perform two tasks simultaneously. Measures divided attention and multitasking cost.',
    tags: ['training', 'executive', 'multitasking', 'attention'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: DUAL_TASK_VISUAL_TIMEOUT_MS,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 60,
    activeModalities: ['position', 'audio'],
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
      colors: MODE_COLOR_DUAL_TASK,
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
// All Dual Task Specs
// =============================================================================

export const DualTaskSpecs = {
  'dual-task': DualTaskSpec,
} as const;
