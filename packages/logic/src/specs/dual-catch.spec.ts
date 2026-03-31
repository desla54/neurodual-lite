/**
 * Dual Catch Mode Specification
 *
 * Adaptive tempo mode with SDT scoring.
 * Default mode for casual training.
 */

import type { ModeSpec } from './types';
import type { TempoUiExtensions } from './tempo-shared';
import {
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  FLOW_CONFIDENCE_THRESHOLD,
  TIMING_STIMULUS_TEMPO_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_SESSION_PREP_MS,
  TIMING_MIN_VALID_RT_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_TEMPO,
  MODE_COLOR_DUAL_CATCH,
} from './thresholds';

export interface DualCatchExtensions extends TempoUiExtensions {
  /**
   * Target d' used by adaptive algorithms for the "promenade" difficulty band.
   * Skeleton value (tunable later).
   */
  readonly adaptiveTargetDPrime: number;
  /**
   * Fixed stimulus duration to preserve precise on/off synchronization.
   * Dual Catch must not adapt stimulus duration.
   */
  readonly fixedStimulusDurationMs: number;
}

export const DualCatchSpec: ModeSpec & { extensions: DualCatchExtensions } = {
  metadata: {
    id: 'dual-catch',
    displayName: 'Dual Catch',
    description: 'Attrape les correspondances N-back. Rythme adaptatif.',
    tags: ['training', 'default', 'adaptive'],
    difficultyLevel: 3,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  /**
   * Scoring Strategy: Signal Detection Theory (SDT)
   *
   * **Passed Calculation**:
   * 1. For each modality: calculate d' (d-prime) using Hautus log-linear correction
   * 2. Aggregate d' = average across all active modalities
   * 3. `passed = aggregate d' >= 1.5` (SDT_DPRIME_PASS)
   *
   * **Anti-gaming Safeguards**:
   * - Silence (hits=0 AND FA=0) → d' = 0
   * - Inactivity (hits=0) → d' = 0
   * - Spamming (CR=0) → d' = 0
   */
  scoring: {
    strategy: 'sdt',
    passThreshold: SDT_DPRIME_PASS,
    downThreshold: SDT_DPRIME_DOWN,
    flowThreshold: FLOW_CONFIDENCE_THRESHOLD,
  },

  timing: {
    stimulusDurationMs: TIMING_STIMULUS_TEMPO_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS,
    prepDelayMs: TIMING_SESSION_PREP_MS,
    minValidRtMs: TIMING_MIN_VALID_RT_MS,
    visualOffsetMs: TIMING_VISUAL_OFFSET_DEFAULT_MS,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
    lureProbability: GEN_LURE_PROBABILITY_DEFAULT,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
    activeModalities: ['position', 'audio'],
  },

  adaptivity: {
    algorithm: 'adaptive',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'activeModalities', 'algorithm'],
  },

  report: {
    sections: [
      'HERO',
      'RECENT_TREND',
      'PERFORMANCE',
      'CONFIDENCE_BREAKDOWN',
      'ERROR_PROFILE',
      'SPEED',
      'NEXT_STEP',
      'REWARD_INDICATOR',
      'DETAILS',
    ],
    display: {
      modeScoreKey: 'report.modeScore.dprime',
      modeScoreTooltipKey: 'report.modeScore.dprimeTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_DUAL_CATCH,
    },
  },

  stats: {
    simple: {
      sections: [
        'ACTIVITY_KPIS',
        'SESSIONS_PER_DAY',
        'PERFORMANCE_KPIS',
        'MODE_SCORE',
        'EVOLUTION_ACCURACY',
        'EVOLUTION_N_LEVEL',
        'MODALITY_TABLE',
        'ERROR_PROFILE',
      ],
    },
    advanced: {
      sections: [
        'UPS_SUMMARY',
        'MODE_SCORE',
        'DISTRIBUTION',
        'TIMING_STATS',
        'TIMING_BY_MODALITY',
        'TIMING_VARIABILITY',
        'ERROR_AWARENESS',
        'SDT_MODALITY_TABLE',
      ],
    },
  },

  extensions: {
    guidedMode: false,
    mirrorMode: false,
    gameCountdownMode: false,
    gameShowProgressBar: true,
    gameShowNLevel: true,
    adaptiveTargetDPrime: 2.2,
    fixedStimulusDurationMs: TIMING_STIMULUS_TEMPO_MS,
  },
};
