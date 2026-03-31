/**
 * Scoring Module
 *
 * Centralized scoring utilities and calculators.
 *
 * Scoring strategies:
 * - SDT (default): d' average across modalities
 * - Jaeggi: error count per modality (Jaeggi 2008)
 * - BrainWorkshop: H / (H + M + FA) - CR ignored (faithful to BW v5.0)
 *
 * The actual scoring logic is in session-passed.ts (pure functions).
 */

// =============================================================================
// Thresholds - Single Source of Truth (re-exported from specs)
// =============================================================================
export {
  THRESHOLDS as SCORING_THRESHOLDS,
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_PASS_NORMALIZED,
  BW_RAW_SCORE_PASS,
  BW_SCORE_DOWN_NORMALIZED,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  JOURNEY_MIN_PASSING_SCORE,
  PROGRESSION_STRIKES_TO_DOWN,
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
  JOURNEY_MIN_UPS,
  // Trace Arithmetic Interference
  TRACE_ARITHMETIC_MIN_OPERATIONS,
  TRACE_ARITHMETIC_MAX_OPERATIONS,
  TRACE_ARITHMETIC_MIN_RESULT,
  TRACE_ARITHMETIC_MAX_RESULT,
  TRACE_ARITHMETIC_MAX_DIGIT,
  TRACE_ARITHMETIC_TIMEOUT_MS,
  // Trace Mirror Grid (Dyslatéralisation)
  TRACE_GRID_COLS_MIRROR,
  TRACE_GRID_ROWS_MIRROR,
  TRACE_POSITIONS_MIRROR,
  // Multi-stimulus (Brain Workshop)
  MULTI_AUDIO_STAGGER_MS,
  MULTI_STIMULUS_POSITION_MODALITIES,
  MULTI_AUDIO_MODALITIES,
  MULTI_STIMULUS_COLORS,
  MULTI_STIMULUS_SHAPES,
  MULTI_STIMULUS_TIMING_BONUS_MS,
  // UPS Tiers (for color coding in UI)
  UPS_TIER_ADVANCED,
  UPS_TIER_NOVICE,
  // Trace Writing Recognition
  TRACE_WRITING_MIN_POINTS_FOR_RECOGNITION,
  TRACE_WRITING_MIN_CONFIDENCE_THRESHOLD,
} from '../../specs/thresholds';
export type { Thresholds as ScoringThresholds } from '../../specs/thresholds';

// =============================================================================
// Session Passed Calculator - Single Source of Truth
// =============================================================================
export {
  calculateTempoSessionPassed,
  calculatePlaceSessionPassed,
  calculateMemoSessionPassed,
  calculateDualPickSessionPassed,
  calculateTraceSessionPassed,
  calculateSessionPassed,
  detectScoringStrategy,
  calculateBWScore,
  calculateBWScoreFromModalities,
  checkJaeggiErrorsBelow,
  getJaeggiErrorsByModality,
} from './session-passed';
export type {
  ModalitySDTCounts,
  TempoPassedInput,
  AccuracyPassedInput,
  ScoringStrategy as PassedScoringStrategy,
  SessionType,
} from './session-passed';

// =============================================================================
// SDT Calculator (probit, d-prime with Hautus correction)
// =============================================================================
export { SDTCalculator } from './helpers';

// =============================================================================
// Progression & Scoring Utilities
// =============================================================================
export { evaluateProgression } from './sdt';
export type { PerformanceTier } from './psychometric-score';
export { PsychometricScore } from './psychometric-score';

// UPS (Unified Performance Score)
export { TempoConfidenceCalculator } from './tempo-confidence';
export { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
export { JOURNEY_MIN_UPS as JOURNEY_MIN_UPS_LEGACY, UnifiedScoreCalculator } from './unified-score';
