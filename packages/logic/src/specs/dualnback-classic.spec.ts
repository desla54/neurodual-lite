/**
 * Sim Jaeggi Mode Specification
 *
 * Clinical protocol from Jaeggi et al. research.
 * Fixed distribution, error-based scoring.
 */

import type { ModeSpec } from './types';
import type { TempoUiExtensions } from './tempo-shared';
import {
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  FLOW_CONFIDENCE_THRESHOLD,
  TIMING_STIMULUS_TEMPO_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_SESSION_PREP_MS,
  TIMING_MIN_VALID_RT_MS,
  TIMING_VISUAL_OFFSET_JAEGGI_MS,
  GEN_TARGET_PROBABILITY_JAEGGI,
  GEN_LURE_PROBABILITY_NONE,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_TEMPO,
  MODE_COLOR_SIM_JAEGGI,
  // UPS
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  // Jaeggi Confidence Weights
  JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD,
  JAEGGI_WEIGHT_RT_STABILITY,
  JAEGGI_WEIGHT_ERROR_AWARENESS,
  JAEGGI_WEIGHT_FOCUS,
  JAEGGI_WEIGHT_TIMING,
  JAEGGI_WEIGHT_PRESS_STABILITY,
  JAEGGI_WEIGHT_RT_STABILITY_HIGH,
  JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
  JAEGGI_WEIGHT_FOCUS_HIGH,
  JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
} from './thresholds';

export interface DualnbackClassicExtensions extends TempoUiExtensions {
  /** N-Level locked by default (protocol recommendation) */
  readonly nLevelLockedByDefault: boolean;
}

export const DualnbackClassicSpec: ModeSpec & { extensions: DualnbackClassicExtensions } = {
  metadata: {
    id: 'dualnback-classic',
    displayName: 'Dual N-Back classique',
    description: 'Mode classique. Distribution fixe validée scientifiquement.',
    tags: ['training', 'clinical', 'jaeggi', 'research'],
    difficultyLevel: 3,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  /**
   * Scoring Strategy: Jaeggi Clinical Protocol
   *
   * **Passed Calculation**:
   * Uses error counting per modality (< 3 errors to pass, "fewer than three" — Jaeggi 2008).
   * Score = (TP + TN) / (TP + TN + FP + FN) per modality.
   * Session score = lowest modality score.
   *
   * **Threshold**: JAEGGI_MAX_ERRORS_PER_MODALITY = 3 (boundary, exclusive)
   *
   * **Confidence**: Conditional system based on accuracy.
   * - If accuracy < 90%: timing penalty applied (réponses rapides = fébrilité potentielle)
   * - If accuracy >= 90%: timing penalty waived (réponses rapides = vivacité)
   *
   * @see domain/scoring/jaeggi-confidence.ts
   */
  scoring: {
    strategy: 'dualnback-classic',
    passThreshold: JAEGGI_MAX_ERRORS_PER_MODALITY,
    downThreshold: JAEGGI_ERRORS_DOWN,
    flowThreshold: FLOW_CONFIDENCE_THRESHOLD,
    ups: {
      accuracyWeight: UPS_ACCURACY_WEIGHT,
      confidenceWeight: UPS_CONFIDENCE_WEIGHT,
    },
    confidence: {
      accuracyThreshold: JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD,
      withTiming: {
        rtStability: JAEGGI_WEIGHT_RT_STABILITY,
        errorAwareness: JAEGGI_WEIGHT_ERROR_AWARENESS,
        focusScore: JAEGGI_WEIGHT_FOCUS,
        timingDiscipline: JAEGGI_WEIGHT_TIMING,
        pressStability: JAEGGI_WEIGHT_PRESS_STABILITY,
      },
      withoutTiming: {
        rtStability: JAEGGI_WEIGHT_RT_STABILITY_HIGH,
        errorAwareness: JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
        focusScore: JAEGGI_WEIGHT_FOCUS_HIGH,
        pressStability: JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
      },
    },
  },

  timing: {
    stimulusDurationMs: TIMING_STIMULUS_TEMPO_MS,
    intervalMs: TIMING_INTERVAL_DEFAULT_MS,
    prepDelayMs: TIMING_SESSION_PREP_MS,
    minValidRtMs: TIMING_MIN_VALID_RT_MS,
    visualOffsetMs: TIMING_VISUAL_OFFSET_JAEGGI_MS,
    // audioPreset defaults to 'default' (varied_aac)
  },

  generation: {
    generator: 'DualnbackClassic',
    // Note: Le générateur Jaeggi utilise une distribution FIXE (4 V-Seul + 4 A-Seul + 2 Dual + 10 Non-Cible).
    // Cette valeur est documentative pour la cohérence spec/génération.
    targetProbability: GEN_TARGET_PROBABILITY_JAEGGI,
    lureProbability: GEN_LURE_PROBABILITY_NONE,
  },

  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
    activeModalities: ['position', 'audio'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['nLevel', 'trialsCount', 'activeModalities'],
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
      modeScoreKey: 'report.modeScore.jaeggiErrors',
      modeScoreTooltipKey: 'report.modeScore.jaeggiErrorsTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SIM_JAEGGI,
    },
  },

  /**
   * Stats Sections for Jaeggi Mode
   *
   * **Key difference from other modes**: Uses EVOLUTION_ERROR_RATE instead of
   * EVOLUTION_ACCURACY because the Jaeggi methodology is error-based.
   *
   * In the Jaeggi 2008 study, progression is determined by error count in the
   * worst-performing modality: "fewer than three" = advance, 3-5 = maintain, "more than five" = regress.
   *
   * Showing error rate evolution (lower is better) is more meaningful than
   * accuracy evolution for users following this clinical protocol.
   *
   * @see docs/references/jaeggi-2008/README.md
   */
  stats: {
    simple: {
      sections: [
        'ACTIVITY_KPIS',
        'SESSIONS_PER_DAY',
        'PERFORMANCE_KPIS',
        'MODE_SCORE',
        'EVOLUTION_ERROR_RATE', // Jaeggi-specific: error rate instead of accuracy
        'EVOLUTION_N_LEVEL',
        'MODALITY_TABLE',
        'ERROR_PROFILE',
      ],
    },
    advanced: {
      sections: [
        // Temps
        'TIMING_STATS',
        'TIMING_BY_MODALITY',
        'TIMING_VARIABILITY',
        'ERROR_AWARENESS',
        // Performance
        'SDT_MODALITY_TABLE',
        'DISTRIBUTION',
        // Évolution
        'EVOLUTION_UPS',
      ],
    },
  },

  extensions: {
    nLevelLockedByDefault: true,
    guidedMode: false,
    mirrorMode: false,
    gameCountdownMode: false,
    gameShowProgressBar: true,
    gameShowNLevel: true,
  },
};
