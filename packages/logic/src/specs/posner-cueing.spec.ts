/**
 * Posner Cueing Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Posner Cueing Task.
 *
 * Posner (1980):
 * - Two boxes on screen (left/right) with fixation cross in center
 * - One box flashes (cue) then target (*) appears in one box
 * - Valid trials (80%): target in cued box (faster RT)
 * - Invalid trials (20%): target in uncued box (slower RT)
 * - Key metric: cueing effect = invalid RT - valid RT
 * - Foundational paradigm for spatial attention research
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  POSNER_DEFAULT_TRIALS,
  POSNER_FIXATION_MS,
  POSNER_TARGET_TIMEOUT_MS,
  MODE_COLOR_POSNER_CUEING,
} from './thresholds';

// =============================================================================
// Posner Cueing Specification
// =============================================================================

export const PosnerCueingSpec: ModeSpec = {
  metadata: {
    id: 'posner-cueing',
    displayName: 'Posner Cueing',
    description: 'Respond to the target location after a spatial cue.',
    tags: ['training', 'attention', 'spatial'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: POSNER_TARGET_TIMEOUT_MS,
    intervalMs: POSNER_FIXATION_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: POSNER_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_POSNER_CUEING,
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
// All Posner Cueing Specs
// =============================================================================

export const PosnerCueingSpecs = {
  'posner-cueing': PosnerCueingSpec,
} as const;
