/**
 * Reflex Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Reflex (Whack-a-Mole) Task.
 *
 * Stimuli appear at random positions in a grid:
 * - Green circle = TARGET (tap it!)
 * - Red circle = LURE (do NOT tap — Go/No-Go element)
 * - 70% target / 30% lure ratio
 * - Stimulus duration decreases as player improves
 * - Measures: hits, misses, false alarms, correct rejections, mean RT
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  REFLEX_DEFAULT_TRIALS,
  REFLEX_INITIAL_STIMULUS_MS,
  REFLEX_ITI_MS,
  REFLEX_TARGET_PROBABILITY,
  MODE_COLOR_REFLEX,
} from './thresholds';

// =============================================================================
// Reflex Specification
// =============================================================================

export const ReflexSpec: ModeSpec = {
  metadata: {
    id: 'reflex',
    displayName: 'Reflex',
    description: 'React to targets, ignore lures.',
    tags: ['training', 'attention', 'inhibition'],
    difficultyLevel: 1,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: REFLEX_INITIAL_STIMULUS_MS,
    intervalMs: REFLEX_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: REFLEX_TARGET_PROBABILITY,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: REFLEX_DEFAULT_TRIALS,
    activeModalities: ['visual'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'SPEED', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_REFLEX,
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
// All Reflex Specs
// =============================================================================

export const ReflexSpecs = {
  reflex: ReflexSpec,
} as const;
