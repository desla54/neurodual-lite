/**
 * Color Rush Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Color Rush (Stroop-like color sorting) Task.
 *
 * A colored word appears on screen (e.g., the word "BLEU" written in red).
 * Player must tap the button matching the INK COLOR, ignoring the word text.
 * Speed pressure increases over time as stimulus timeout decreases.
 *
 * Inspired by the Stroop effect, designed for fast-paced inhibition training:
 * - 4 colors: red, blue, green, yellow
 * - Congruent trials (~30%): word matches ink → easier
 * - Incongruent trials (~70%): word differs from ink → harder (Stroop interference)
 * - Speed pressure: timeout starts at 2500ms, decreases by 50ms every 5 trials (min 1000ms)
 * - nLevel 1 = 3 colors, nLevel 2 = 4 colors, nLevel 3 = 4 colors + shape distractors
 * - Tracks: accuracy, RT, congruent vs incongruent accuracy difference
 */

import type { ModeSpec, ModeColorSpec } from './types';

// =============================================================================
// Local Constants (not in thresholds.ts per spec)
// =============================================================================

const COLOR_RUSH_DEFAULT_TRIALS = 40;
const COLOR_RUSH_STIMULUS_TIMEOUT_MS = 2500;
const COLOR_RUSH_ITI_MS = 300;
const ACCURACY_PASS = 0.75;

export const MODE_COLOR_COLOR_RUSH: ModeColorSpec = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
};

// =============================================================================
// Color Rush Specification
// =============================================================================

export const ColorRushSpec: ModeSpec = {
  metadata: {
    id: 'color-rush',
    displayName: 'Color Rush',
    description: 'Tap the ink color, ignore the word. Speed increases over time.',
    tags: ['training', 'inhibition', 'speed'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS,
  },

  timing: {
    stimulusDurationMs: COLOR_RUSH_STIMULUS_TIMEOUT_MS,
    intervalMs: COLOR_RUSH_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 0.5,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: COLOR_RUSH_DEFAULT_TRIALS,
    activeModalities: ['visual'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount', 'nLevel'],
  },

  report: {
    sections: [
      'HERO',
      'PERFORMANCE',
      'ERROR_PROFILE',
      'SPEED',
      'INSIGHTS',
      'DETAILS',
      'RECENT_TREND',
    ],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_COLOR_RUSH,
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
// All Color Rush Specs
// =============================================================================

export const ColorRushSpecs = {
  'color-rush': ColorRushSpec,
} as const;
