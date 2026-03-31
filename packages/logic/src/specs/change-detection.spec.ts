/**
 * Change Detection Specification
 *
 * SINGLE SOURCE OF TRUTH for the Change Detection Task.
 *
 * Luck & Vogel (1997):
 * - Array of colored squares displayed briefly
 * - After a short delay, array reappears with possible change
 * - Player reports "same" or "different"
 * - Measures visual working memory capacity (Cowan's K)
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, MODE_COLOR_CHANGE_DETECTION } from './thresholds';

export const ChangeDetectionSpec: ModeSpec = {
  metadata: {
    id: 'change-detection',
    displayName: 'Change Detection',
    description: 'Detect color changes in brief visual displays.',
    tags: ['training', 'memory', 'visual'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 150,
    intervalMs: 900,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 24,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'SPEED', 'RECENT_TREND', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_CHANGE_DETECTION,
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

export const ChangeDetectionSpecs = {
  'change-detection': ChangeDetectionSpec,
} as const;
