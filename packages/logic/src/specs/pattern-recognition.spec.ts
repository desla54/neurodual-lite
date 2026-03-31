/**
 * Pattern Recognition Memory Specification
 *
 * SINGLE SOURCE OF TRUTH for the Pattern Recognition Memory task.
 *
 * CANTAB / Sahakian et al.:
 * - Sequence of abstract visual patterns shown during encoding
 * - After a delay, distinguish "seen" patterns from novel ones
 * - Two-alternative forced choice (old vs new)
 * - Key metrics: percent correct, latency, d-prime
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  PATTERN_RECOGNITION_DEFAULT_PATTERNS,
  PATTERN_RECOGNITION_DISPLAY_MS,
  MODE_COLOR_PATTERN_RECOGNITION,
} from './thresholds';

// =============================================================================
// Pattern Recognition Specification
// =============================================================================

export const PatternRecognitionSpec: ModeSpec = {
  metadata: {
    id: 'pattern-recognition',
    displayName: 'Pattern Recognition',
    description:
      'Recognize previously seen patterns among novel ones. Measures visual recognition memory.',
    tags: ['training', 'memory', 'episodic', 'visual'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: PATTERN_RECOGNITION_DISPLAY_MS,
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
    trialsCount: PATTERN_RECOGNITION_DEFAULT_PATTERNS,
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
      colors: MODE_COLOR_PATTERN_RECOGNITION,
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

// =============================================================================
// All Pattern Recognition Specs
// =============================================================================

export const PatternRecognitionSpecs = {
  'pattern-recognition': PatternRecognitionSpec,
} as const;
