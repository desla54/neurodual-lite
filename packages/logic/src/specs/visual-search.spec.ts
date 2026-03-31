/**
 * Visual Search Specification
 *
 * SINGLE SOURCE OF TRUTH for the Visual Search Task.
 *
 * Treisman & Gelade (1980):
 * - Find a target among distractors
 * - Feature search vs conjunction search
 * - RT slope with set size reveals search efficiency
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  MODE_COLOR_VISUAL_SEARCH,
  VISUAL_SEARCH_DEFAULT_TRIALS,
  VISUAL_SEARCH_ITI_MAX_MS,
  VISUAL_SEARCH_ITI_MIN_MS,
  VISUAL_SEARCH_RESPONSE_TIMEOUT_MS,
} from './thresholds';

export const VisualSearchSpec: ModeSpec = {
  metadata: {
    id: 'visual-search',
    displayName: 'Visual Search',
    description: 'Find the target hidden among distractors.',
    tags: ['training', 'attention', 'visual'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: VISUAL_SEARCH_RESPONSE_TIMEOUT_MS,
    intervalMs: Math.round((VISUAL_SEARCH_ITI_MIN_MS + VISUAL_SEARCH_ITI_MAX_MS) / 2),
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: VISUAL_SEARCH_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_VISUAL_SEARCH,
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

export const VisualSearchSpecs = {
  'visual-search': VisualSearchSpec,
} as const;
