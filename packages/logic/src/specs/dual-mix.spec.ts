/**
 * Dual Mix Specification
 *
 * Composite cognitive-task mode combining:
 * - Dual N-Back turn
 * - Stroop Flex turn
 * - Optional Gridlock move
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  MODE_COLOR_DUAL_TASK,
} from './thresholds';

export const DualMixSpec: ModeSpec = {
  metadata: {
    id: 'dual-mix',
    displayName: 'Dual Mix',
    description:
      'Composite session mixing N-Back, Stroop Flex and Gridlock in a single turn loop.',
    tags: ['training', 'composite', 'executive', 'attention'],
    difficultyLevel: 4,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 2500,
    intervalMs: 500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.33,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 2,
    trialsCount: 20,
    activeModalities: ['position', 'audio', 'color'],
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

export const DualMixSpecs = {
  'dual-mix': DualMixSpec,
} as const;
