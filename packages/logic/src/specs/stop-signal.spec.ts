/**
 * Stop-Signal Task Specification
 *
 * SINGLE SOURCE OF TRUTH for the Stop-Signal Task (SST).
 *
 * Logan & Cowan (1984):
 * - Primary GO task: respond to arrow direction (left/right)
 * - On ~25% of trials, a STOP signal appears after a variable delay (SSD)
 * - Player must inhibit their response on stop trials
 * - SSD adapts via staircase: +50ms on successful stop, -50ms on failed stop
 * - Key metric: SSRT (Stop Signal Reaction Time) = mean GO RT - mean SSD
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  GEN_TARGET_PROBABILITY_DEFAULT,
  STOP_SIGNAL_DEFAULT_TRIALS,
  STOP_SIGNAL_STIMULUS_DURATION_MS,
  STOP_SIGNAL_ITI_MS,
  MODE_COLOR_STOP_SIGNAL,
} from './thresholds';

// =============================================================================
// Stop-Signal Specification
// =============================================================================

export const StopSignalSpec: ModeSpec = {
  metadata: {
    id: 'stop-signal',
    displayName: 'Stop-Signal',
    description: 'Inhibit your response when the stop signal appears.',
    tags: ['training', 'inhibition', 'executive'],
    difficultyLevel: 3,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: STOP_SIGNAL_STIMULUS_DURATION_MS,
    intervalMs: STOP_SIGNAL_ITI_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: STOP_SIGNAL_DEFAULT_TRIALS,
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
      colors: MODE_COLOR_STOP_SIGNAL,
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
// All Stop-Signal Specs
// =============================================================================

export const StopSignalSpecs = {
  'stop-signal': StopSignalSpec,
} as const;
