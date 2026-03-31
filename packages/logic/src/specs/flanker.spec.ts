/**
 * Flanker Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Eriksen Flanker Task.
 *
 * Attentional inhibition task (Eriksen & Eriksen, 1974):
 * - Central arrow surrounded by flanker arrows
 * - Player identifies direction of the central arrow
 * - Congruent vs incongruent conditions measure attentional filtering
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  FLANKER_DEFAULT_TRIALS,
  FLANKER_STIMULUS_TIMEOUT_MS,
  FLANKER_ITI_MS,
  MODE_COLOR_FLANKER,
} from './thresholds';

// =============================================================================
// Flanker Specification
// =============================================================================

export const FlankerSpec: ModeSpec = {
  metadata: {
    id: 'flanker',
    displayName: 'Flanker',
    description: 'Identify the central arrow direction while ignoring flankers.',
    tags: ['training', 'attention', 'inhibition'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: FLANKER_STIMULUS_TIMEOUT_MS,
    intervalMs: FLANKER_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: FLANKER_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_FLANKER,
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
// All Flanker Specs
// =============================================================================

export const FlankerSpecs = {
  flanker: FlankerSpec,
} as const;
