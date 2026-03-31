/**
 * Dual Track Specification (MOT - Multiple Object Tracking)
 *
 * SINGLE SOURCE OF TRUTH for the Multiple Object Tracking mode.
 *
 * Gameplay:
 * - Multiple balls move around the screen
 * - Some are highlighted as targets at the start
 * - All become identical and move for a tracking period
 * - Player taps the ones they think are targets
 * - Scoring: accuracy (correct targets / total targets)
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  TIMING_INTERVAL_DEFAULT_MS,
  GEN_TARGET_PROBABILITY_DEFAULT,
  MODE_COLOR_DUAL_TRACK,
  MOT_DEFAULT_TOTAL_OBJECTS,
  MOT_DEFAULT_TARGET_COUNT,
  MOT_HIGHLIGHT_DURATION_MS,
  MOT_TRACKING_DURATION_MS,
  MOT_BALL_RADIUS_PX,
  MOT_SPEED_PX_PER_SEC,
  MOT_DEFAULT_ROUNDS,
} from './thresholds';

// =============================================================================
// Track Extensions
// =============================================================================

export interface TrackExtensions {
  /** Total number of objects on screen */
  readonly totalObjects: number;
  /** Number of targets to track */
  readonly targetCount: number;
  /** Duration of target highlight phase (ms) */
  readonly highlightDurationMs: number;
  /** Duration of tracking/movement phase (ms) */
  readonly trackingDurationMs: number;
  /** Ball radius in pixels */
  readonly ballRadiusPx: number;
  /** Movement speed (pixels per second) */
  readonly speedPxPerSec: number;
  /** Optional identity-binding variant for target selection */
  readonly trackingIdentityMode?:
    | 'classic'
    | 'color'
    | 'position'
    | 'image'
    | 'spatial'
    | 'digits'
    | 'emotions'
    | 'words';
  /** Speak one letter per target before movement starts */
  readonly trackingLetterAudioEnabled?: boolean;
  /** Play one tone per target before movement starts (additive audio channel) */
  readonly trackingTonesEnabled?: boolean;
  /** Movement complexity profile */
  readonly motionComplexity?: 'smooth' | 'standard' | 'agile';
  /** Crowding / proximity profile */
  readonly crowdingMode?: 'low' | 'standard' | 'dense';
  /** Enable a focus ball: one target gets a subtle visual cue during tracking */
  readonly focusCrossEnabled?: boolean;
}

// =============================================================================
// Dual Track Specification
// =============================================================================

export const DualTrackSpec: ModeSpec = {
  metadata: {
    id: 'dual-track',
    displayName: 'Dual Track',
    description: 'Track multiple moving objects with sustained attention.',
    tags: ['training', 'attention', 'tracking'],
    difficultyLevel: 2,
    version: '0.1.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: MOT_HIGHLIGHT_DURATION_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: MOT_DEFAULT_TARGET_COUNT,
    trialsCount: MOT_DEFAULT_ROUNDS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'adaptive',
    nLevelSource: 'user',
    configurableSettings: [
      'algorithm',
      'nLevel',
      'trialsCount',
      'trackingDurationMode',
      'trackingDurationMs',
      'trackingSpeedMode',
      'trackingSpeedPxPerSec',
      'trackingIdentityMode',
      'trackingLetterAudioEnabled',
      'motionComplexity',
      'crowdingMode',
      'trackingFocusBallEnabled',
    ],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'ERROR_PROFILE', 'SPEED', 'DETAILS'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_DUAL_TRACK,
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

  extensions: {
    totalObjects: MOT_DEFAULT_TOTAL_OBJECTS,
    targetCount: MOT_DEFAULT_TARGET_COUNT,
    highlightDurationMs: MOT_HIGHLIGHT_DURATION_MS,
    trackingDurationMs: MOT_TRACKING_DURATION_MS,
    ballRadiusPx: MOT_BALL_RADIUS_PX,
    speedPxPerSec: MOT_SPEED_PX_PER_SEC,
    trackingIdentityMode: 'classic',
    trackingLetterAudioEnabled: false,
    focusCrossEnabled: false,
  } satisfies TrackExtensions,
};

// =============================================================================
// All Track Specs
// =============================================================================

export const TrackSpecs = {
  'dual-track': DualTrackSpec,
} as const;
