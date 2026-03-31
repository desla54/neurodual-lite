/**
 * Time-Based Prospective Memory Specification
 *
 * SINGLE SOURCE OF TRUTH for the time-based ProMem task.
 *
 * Einstein & McDaniel (1990):
 * - Ongoing continuous task (e.g. categorization)
 * - Instruction: "press the button every 2 minutes"
 * - No visible clock - user must internally estimate time
 * - Scoring: temporal precision (deviation from target interval)
 * - Measures internal clock + prospective memory
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  TIME_PROMEM_TARGET_INTERVAL_MS,
  MODE_COLOR_TIME_PROMEM,
} from './thresholds';

// =============================================================================
// Time ProMem Specification
// =============================================================================

export const TimeProMemSpec: ModeSpec = {
  metadata: {
    id: 'time-promem',
    displayName: 'Time Prospective',
    description: 'Remember to act at regular intervals while performing an ongoing task.',
    tags: ['training', 'memory', 'prospective', 'timing'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TIME_PROMEM_TARGET_INTERVAL_MS,
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
    trialsCount: 5,
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
      colors: MODE_COLOR_TIME_PROMEM,
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
// All Time ProMem Specs
// =============================================================================

export const TimeProMemSpecs = {
  'time-promem': TimeProMemSpec,
} as const;
