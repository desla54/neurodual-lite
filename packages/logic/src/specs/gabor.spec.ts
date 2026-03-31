/**
 * Gabor Detection Specification
 *
 * SINGLE SOURCE OF TRUTH for the Gabor Detection task.
 *
 * Campbell & Robson (1968):
 * - Detect a Gabor patch (oriented bars) embedded in visual noise
 * - Adaptive difficulty: contrast, orientation, eccentricity
 * - Measures low-level visual sensitivity and perceptual thresholds
 * - Key metrics: detection threshold, d-prime
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GABOR_DEFAULT_TRIALS,
  GABOR_DISPLAY_MS,
  GABOR_RESPONSE_TIMEOUT_MS,
  MODE_COLOR_GABOR,
} from './thresholds';

// =============================================================================
// Gabor Specification
// =============================================================================

export const GaborSpec: ModeSpec = {
  metadata: {
    id: 'gabor',
    displayName: 'Gabor Detection',
    description: 'Detect oriented patterns in visual noise. Measures perceptual sensitivity.',
    tags: ['training', 'perception', 'visual'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: GABOR_DISPLAY_MS,
    intervalMs: GABOR_RESPONSE_TIMEOUT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: GABOR_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_GABOR,
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
// All Gabor Specs
// =============================================================================

export const GaborSpecs = {
  gabor: GaborSpec,
} as const;
