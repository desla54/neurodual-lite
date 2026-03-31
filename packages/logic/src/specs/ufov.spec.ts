/**
 * UFOV (Useful Field of View) Specification
 *
 * SINGLE SOURCE OF TRUTH for the UFOV task.
 *
 * Ball et al. / Owsley:
 * - Central identification under brief exposure
 * - Divided attention: central identification + peripheral localization
 * - Selective attention: same task with peripheral distractors
 * - Adaptive display duration staircase with threshold reported per subtask
 * - Validated as a processing-speed / useful-field measure in aging studies
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  UFOV_DEFAULT_TRIALS,
  UFOV_INITIAL_DISPLAY_MS,
  UFOV_MASK_DURATION_MS,
  MODE_COLOR_UFOV,
} from './thresholds';

// =============================================================================
// UFOV Specification
// =============================================================================

export const UfovSpec: ModeSpec = {
  metadata: {
    id: 'ufov',
    displayName: 'UFOV',
    description:
      'Identify central and peripheral targets under brief exposure. Measures processing speed and attentional field.',
    tags: ['training', 'attention', 'perception', 'visual'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: UFOV_INITIAL_DISPLAY_MS,
    intervalMs: UFOV_MASK_DURATION_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: UFOV_DEFAULT_TRIALS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'adaptive',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'ufovVariant'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_UFOV,
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
// All UFOV Specs
// =============================================================================

export const UfovSpecs = {
  ufov: UfovSpec,
} as const;
