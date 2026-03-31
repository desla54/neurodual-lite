/**
 * ANT (Attention Network Test) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Attention Network Test.
 *
 * Fan et al. (2002):
 * - Combines flanker + spatial cueing + alerting in one test
 * - Measures three attentional networks:
 *   1. Alerting (no cue vs double cue)
 *   2. Orienting (center cue vs spatial cue)
 *   3. Executive control (congruent vs incongruent flankers)
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, MODE_COLOR_ANT } from './thresholds';

export const AntSpec: ModeSpec = {
  metadata: {
    id: 'ant',
    displayName: 'ANT',
    description: 'Attention Network Test — measures alerting, orienting, and executive control.',
    tags: ['training', 'attention', 'executive'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 1700,
    intervalMs: 2500,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 96,
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
      colors: MODE_COLOR_ANT,
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

export const AntSpecs = {
  ant: AntSpec,
} as const;
