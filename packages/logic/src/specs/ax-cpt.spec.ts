/**
 * AX-CPT Specification
 *
 * SINGLE SOURCE OF TRUTH for the AX-CPT (Continuous Performance Test).
 *
 * Braver et al. (2001):
 * - Context-dependent response task (cue-probe)
 * - Respond "target" only to A-X cue-probe pairs
 * - Dissociates proactive vs reactive cognitive control strategies
 * - AX (70%), AY (10%), BX (10%), BY (10%)
 */

import type { ModeSpec } from './types';
import { ACCURACY_PASS_NORMALIZED, MODE_COLOR_AX_CPT } from './thresholds';

export const AxCptSpec: ModeSpec = {
  metadata: {
    id: 'ax-cpt',
    displayName: 'AX-CPT',
    description: 'Context-dependent response task measuring cognitive control.',
    tags: ['training', 'executive', 'control'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: 750,
    intervalMs: 1000,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.7,
    lureProbability: 0.1,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: 30,
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
      colors: MODE_COLOR_AX_CPT,
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

export const AxCptSpecs = {
  'ax-cpt': AxCptSpec,
} as const;
