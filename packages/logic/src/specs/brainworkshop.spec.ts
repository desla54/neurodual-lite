/**
 * Sim BrainWorkshop Mode Specification
 *
 * Faithful implementation of Brain Workshop v4.x/v5 protocol.
 *
 * Key differences from other modes:
 * - Timing: tick-based (30 ticks × 100ms = 3s interval)
 * - Trials: dynamic formula (20 + n²)
 * - Generation: 2-stage (guaranteed match + interference)
 * - Scoring: H / (H + M + FA) - ignores Correct Rejections
 *
 * @see https://brainworkshop.sourceforge.net/
 */

import type { ModeSpec } from './types';
import type { TempoUiExtensions } from './tempo-shared';
import {
  // BW Scoring
  BW_SCORE_PASS_NORMALIZED,
  BW_SCORE_DOWN_NORMALIZED,
  // BW Timing (tick-based)
  BW_TICKS_DEFAULT,
  BW_TICK_DURATION_MS,
  BW_STIMULUS_BASE_TICKS,
  BW_STIMULUS_TICKS_PER_EXTRA_POSITION,
  // Session prep (shared)
  TIMING_SESSION_PREP_MS,
  // BW Generation
  BW_CHANCE_GUARANTEED_MATCH,
  BW_CHANCE_INTERFERENCE,
  // BW Trials formula
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
  // Shared
  FLOW_CONFIDENCE_THRESHOLD,
  TIMING_MIN_VALID_RT_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  DEFAULT_N_LEVEL,
  // UPS
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  // Tempo Confidence Weights
  TEMPO_WEIGHT_TIMING_DISCIPLINE,
  TEMPO_WEIGHT_RT_STABILITY,
  TEMPO_WEIGHT_PRESS_STABILITY,
  TEMPO_WEIGHT_ERROR_AWARENESS,
  TEMPO_WEIGHT_FOCUS,
  // Colors
  MODE_COLOR_SIM_BRAINWORKSHOP,
} from './thresholds';

// =============================================================================
// BrainWorkshop Extensions
// =============================================================================

/**
 * Extensions specific to Brain Workshop mode.
 *
 * BW 2-Stage Generation Algorithm:
 * - Stage 1 (Guaranteed Match): Force a correct N-back match.
 * - Stage 2 (Interference): Generate near-miss stimuli for cognitive confusion.
 * Both stages run independently for each trial.
 */
export interface BrainWorkshopExtensions extends TempoUiExtensions {
  /** N-Level locked by default (protocol recommendation) */
  readonly nLevelLockedByDefault: boolean;

  // === Generation (BW 2-stage algorithm) ===

  /**
   * Stage 1: Guaranteed match probability (default 12.5%).
   * At each trial, with this probability, force a correct match.
   */
  readonly guaranteedMatchProbability: number;

  /**
   * Stage 2: Interference probability (default 12.5%).
   * Generate near-miss stimuli using offsets [-1, +1, N].
   */
  readonly interferenceProbability: number;

  // === Advanced Features ===

  /**
   * Variable N-Back mode.
   * N varies during session according to beta distribution.
   */
  readonly variableNBack: boolean;

  /**
   * Crab-Back mode.
   * N oscillates: 1-3-5-1-3-5... (for 3-back).
   */
  readonly crabBackMode: boolean;

  /**
   * Multi-stimulus mode (1-4 simultaneous visuals).
   * Each has independent N-back history.
   */
  readonly multiStimulus: 1 | 2 | 3 | 4;

  /**
   * Differentiation mode for multiple stimuli.
   * 'color' = differentiated by color.
   * 'image' = differentiated by shape/image.
   */
  readonly multiMode: 'color' | 'image';

  /**
   * Multi-audio mode (1-2 simultaneous sounds).
   */
  readonly multiAudio: 1 | 2;

  /**
   * Self-paced mode.
   * User advances manually (Enter key) instead of timer.
   */
  readonly selfPaced: boolean;
}

// =============================================================================
// BrainWorkshop Spec
// =============================================================================

/**
 * Calculate TOTAL trials count using BW formula: 20 + n²
 *
 * Buffer trials (first N) are INCLUDED in this total.
 * Example: 2-back → 20 + 4 = 24 total (2 warmup + 22 scorable)
 */
export function calculateBWTrialsCount(nLevel: number): number {
  return BW_TRIALS_BASE + nLevel ** BW_TRIALS_EXPONENT;
}

/**
 * Calculate interval from ticks (default: 30 ticks × 100ms = 3000ms)
 */
export function calculateBWIntervalMs(ticks: number = BW_TICKS_DEFAULT): number {
  return ticks * BW_TICK_DURATION_MS;
}

/**
 * BW FAITHFUL: Calculate stimulus display duration.
 *
 * The stimulus is visible for a SHORT duration, then disappears.
 * This challenges iconic memory (short-term visual memory).
 *
 * Formula: (baseTicks + extraPositions × ticksPerExtra) × tickDuration
 * - 1 position: 5 ticks × 100ms = 500ms
 * - 2 positions: 6 ticks × 100ms = 600ms
 * - 3 positions: 7 ticks × 100ms = 700ms
 * - 4 positions: 8 ticks × 100ms = 800ms
 *
 * @param multiStimulus Number of simultaneous visual positions (1-4)
 */
export function calculateBWStimulusDurationMs(multiStimulus: 1 | 2 | 3 | 4 = 1): number {
  const extraPositions = multiStimulus - 1;
  const ticks = BW_STIMULUS_BASE_TICKS + extraPositions * BW_STIMULUS_TICKS_PER_EXTRA_POSITION;
  return ticks * BW_TICK_DURATION_MS;
}

export const SimBrainWorkshopSpec: ModeSpec & { extensions: BrainWorkshopExtensions } = {
  metadata: {
    id: 'sim-brainworkshop',
    displayName: 'Simulateur Brain Workshop',
    description:
      'Protocole Brain Workshop fidèle. Génération probabiliste avec progression automatique.',
    tags: ['training', 'brainworkshop', 'probabilistic'],
    difficultyLevel: 3,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  /**
   * Scoring Strategy: Brain Workshop Protocol
   *
   * **Formula**: `Score% = Hits / (Hits + Misses + FalseAlarms) * 100`
   *
   * **Key Behavior**: Correct Rejections (CR) are IGNORED.
   * This makes BW scoring more punitive than standard accuracy.
   * Example: 5H, 1M, 1FA, 17CR → BW: 71.4% vs Accuracy: 91.7%
   *
   * **Passed**: Score% >= 80%
   * **Strike**: Score% < 50%
   * **Regression**: 3 strikes au même N (les strikes ne reset pas sur STAY)
   *
   * **UPS**: Unified Performance Score combines accuracy (BW formula) with
   * confidence metrics (timing discipline, RT stability, error awareness, focus).
   * Formula: UPS = 100 * (Accuracy^0.6) * (Confidence^0.4)
   *
   * @see domain/scoring/brainworkshop.ts
   * @see domain/scoring/unified-score.ts
   */
  scoring: {
    strategy: 'brainworkshop',
    passThreshold: BW_SCORE_PASS_NORMALIZED,
    downThreshold: BW_SCORE_DOWN_NORMALIZED,
    flowThreshold: FLOW_CONFIDENCE_THRESHOLD,
    ups: {
      accuracyWeight: UPS_ACCURACY_WEIGHT,
      confidenceWeight: UPS_CONFIDENCE_WEIGHT,
    },
    confidence: {
      timingDiscipline: TEMPO_WEIGHT_TIMING_DISCIPLINE,
      rtStability: TEMPO_WEIGHT_RT_STABILITY,
      pressStability: TEMPO_WEIGHT_PRESS_STABILITY,
      errorAwareness: TEMPO_WEIGHT_ERROR_AWARENESS,
      focusScore: TEMPO_WEIGHT_FOCUS,
    },
  },

  /**
   * Timing: Tick-based system
   *
   * BW uses "ticks" (100ms each). Default = 30 ticks = 3000ms interval.
   *
   * BW FAITHFUL: Stimulus disappears BEFORE interval ends!
   * - Default: 5 ticks = 500ms (challenges iconic memory)
   * - Multi-stimulus: +1 tick (100ms) per extra position
   *
   * Prep delay: 4 seconds (same as other modes for consistent UX).
   */
  timing: {
    stimulusDurationMs: calculateBWStimulusDurationMs(), // 500ms (NOT 3000ms!)
    intervalMs: calculateBWIntervalMs(), // 30 ticks × 100ms = 3000ms
    prepDelayMs: TIMING_SESSION_PREP_MS, // 4000ms (consistent with other modes)
    minValidRtMs: TIMING_MIN_VALID_RT_MS,
    visualOffsetMs: TIMING_VISUAL_OFFSET_DEFAULT_MS,
  },

  /**
   * Generation: BrainWorkshop generator
   *
   * Note: BW generation params (guaranteedMatchProbability, interferenceProbability,
   * variableNBack, crabBackMode, multiStimulus) are in extensions (flat).
   * The generator reads from config.extensions via extractBWConfig().
   * targetProbability/lureProbability are not used by BW generator.
   */
  generation: {
    generator: 'BrainWorkshop',
    targetProbability: 0, // Not used - BW uses 2-stage algorithm
    lureProbability: 0, // Not used - BW uses interference
  },

  /**
   * Defaults
   *
   * Note: trialsCount is calculated dynamically as 20 + n².
   * Buffer trials (first N where no match is possible) are INCLUDED in this total.
   * For 2-back: 24 total = 2 warmup + 22 scorable trials.
   */
  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsCount: calculateBWTrialsCount(DEFAULT_N_LEVEL), // 20 + 2² = 24 (buffer included)
    activeModalities: ['position', 'audio'],
  },

  adaptivity: {
    algorithm: 'none', // BW has its own progression (3 strikes)
    nLevelSource: 'user',
    configurableSettings: [
      'nLevel',
      'trialsCount', // Optional manual override (auto formula remains default behavior)
      'activeModalities',
      // Timing (tick-based in BW, but exposed as seconds for consistency)
      'intervalSeconds',
      'stimulusDurationSeconds',
      // BW Generation
      'guaranteedMatchProbability',
      'interferenceProbability',
      // BW Advanced Features
      'variableNBack',
      'crabBackMode',
      // Multi-stimulus
      'multiStimulus',
      'multiMode',
      'multiAudio',
      'selfPaced',
      // Advanced knobs (formula: trialsBase + trialsFactor * n^trialsExponent)
      'trialsBase',
      'trialsFactor',
      'trialsExponent',
      'arithmeticDifficulty',
    ],
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
      modeScoreKey: 'report.modeScore.bwScore',
      modeScoreTooltipKey: 'report.modeScore.bwScoreTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_SIM_BRAINWORKSHOP,
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
    // UI Extensions
    nLevelLockedByDefault: true,
    guidedMode: false,
    mirrorMode: false,
    gameCountdownMode: false,
    gameShowProgressBar: true,
    gameShowNLevel: true,

    // BW Generation (2-stage algorithm) - flat for generator compatibility
    guaranteedMatchProbability: BW_CHANCE_GUARANTEED_MATCH, // 12.5%
    interferenceProbability: BW_CHANCE_INTERFERENCE, // 12.5%

    // Advanced Features (all disabled by default)
    variableNBack: false,
    crabBackMode: false,
    multiStimulus: 1,
    multiMode: 'color',
    multiAudio: 1,
    selfPaced: false,
  },
};
