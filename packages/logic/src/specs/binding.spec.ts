/**
 * Binding Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Binding Task.
 *
 * Luck & Vogel (1997):
 * - Memory array: shapes with colors at specific positions
 * - Brief display, then retention interval
 * - Test: "Was this shape at this position?" / "Was this color with this shape?"
 * - Measures feature binding in working memory
 * - Adaptive set size (3 -> 6 items)
 * - Key metrics: accuracy for bound vs unbound features, K estimate (Cowan's K)
 *
 * STATUS: PLACEHOLDER - Not yet implemented
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  BINDING_DEFAULT_TRIALS,
  BINDING_DISPLAY_MS,
  BINDING_RETENTION_MS,
  MODE_COLOR_BINDING,
} from './thresholds';

// =============================================================================
// Binding Specification
// =============================================================================

export const BindingSpec: ModeSpec = {
  metadata: {
    id: 'binding',
    displayName: 'Binding',
    description:
      'Remember shape-color-position associations. Measures feature binding in working memory.',
    tags: ['training', 'memory', 'working-memory', 'binding'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: BINDING_DISPLAY_MS,
    intervalMs: BINDING_RETENTION_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: BINDING_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_BINDING,
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
// All Binding Specs
// =============================================================================

export const BindingSpecs = {
  binding: BindingSpec,
} as const;
