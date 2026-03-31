/**
 * @neurodual/core
 *
 * Logique pure Dual N-Back.
 * Zéro dépendance runtime, 100% réutilisable.
 *
 * @example
 * ```ts
 * import { BlockGenerator, DEFAULT_CONFIG } from '@neurodual/core';
 * import { calculateSessionPassed } from '@neurodual/logic';
 *
 * // Générer un bloc
 * const block = BlockGenerator.generate({
 *   ...DEFAULT_CONFIG,
 *   nLevel: 2,
 *   mode: 'BrainWorkshop',
 * });
 *
 * // Session scoring is done via session-passed.ts
 * // See calculateTempoSessionPassed, calculateBWScore, etc.
 * ```
 */

export type { GenerationContext } from './generator';
// Generator
export {
  BlockGenerator,
  BrainWorkshopStrategy,
  GeneratorStrategy,
  DualnbackClassicStrategy,
  strategyRegistry,
} from './generator';
// Random (pour les extensions)
export { generateId, SeededRandom } from './random';
// Scoring
export {
  evaluateProgression,
  PsychometricScore,
  // SDT Calculator (canonical probit, d-prime with Hautus correction)
  SDTCalculator,
  // Centralized Thresholds (Single Source of Truth)
  SCORING_THRESHOLDS,
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_PASS_NORMALIZED,
  BW_SCORE_DOWN_NORMALIZED,
  BW_RAW_SCORE_PASS,
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
  // Session Passed Calculator
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
} from './scoring';
export type { PerformanceTier } from './scoring';
export type {
  ScoringThresholds,
  ModalitySDTCounts,
  TempoPassedInput,
  AccuracyPassedInput,
  SessionType,
} from './scoring';
// Types
export type {
  ArithmeticAnswer,
  ArithmeticDifficulty,
  ArithmeticOperator,
  ArithmeticProblem,
  Block,
  BlockConfig,
  BlockScore,
  Color,
  FeedbackChannel,
  FeedbackMode,
  GeneratorName,
  KnownModality,
  LureType,
  ModalityStats,
  PendingKeyRecord,
  Position,
  ResponseRecord,
  SDTCounts,
  SDTCountsNullable,
  ImageShape,
  SpatialDirection,
  DigitValue,
  EmotionValue,
  WordValue,
  ToneValue,
  Sound,
  Trial,
  TrialInput,
  TrialType,
  UserInputs,
} from './types';
export {
  ARITHMETIC_ANSWERS,
  ARITHMETIC_OPERATORS_BY_DIFFICULTY,
  IMAGE_MODALITY_SHAPES,
  SPATIAL_DIRECTIONS,
  DIGIT_VALUES,
  EMOTION_VALUES,
  WORD_VALUES,
  TONE_VALUES,
} from './types';
export {
  AUDIO_SYNC_BUFFER_MS,
  COLORS,
  COLOR_VALUES,
  DEFAULT_CONFIG,
  isKnownModality,
  JAEGGI_CONFIG,
  POSITIONS,
  SOUNDS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS,
  VISUAL_LATENCY_OFFSET_MS,
} from './types';
// Value Objects
export { GameConfig } from './game-config';
export { ModalityStatsVO, SessionStats } from './session-stats';
export type { ModalityVerdict, TrialVerdict } from './trial-vo';
export type { TrialResult } from './types';
export { TrialVO } from './trial-vo';
export type { DailyStats, StreakInfo, TrendInfo, WeeklyStats } from './user-history';
export { UserHistory } from './user-history';
// Unified Metrics (cross-mode comparable metrics)
// Zone system (1-20) for progress visualization
export type { UnifiedMetrics } from './unified-metrics';
export {
  computeUnifiedMetrics,
  computeTempoAccuracy,
  computeSpecDrivenTempoAccuracy,
  computeMemoAccuracy,
  computePlaceAccuracy,
  createEmptyUnifiedMetrics,
} from './unified-metrics';
// UPS system (0-100) for performance measurement - re-exported from unified-metrics
// Note: JOURNEY_MIN_UPS is now exported from ./scoring/thresholds.ts (Single Source of Truth)
export { deriveTier, UnifiedScoreCalculator } from './unified-metrics';
export type {
  UnifiedPerformanceScore,
  // PerformanceTier already exported from ./scoring
  TempoAccuracyData,
  PlaceAccuracyData,
  MemoAccuracyData,
} from './unified-metrics';
export type {
  DualTrackCrowdingMode,
  DualTrackMotionComplexity,
  DualTrackPathEvaluation,
  DualTrackPathProfile,
  DualTrackPathSessionMetrics,
  DualTrackPerformanceBand,
  DualTrackTierProfile,
} from './track/dual-track-path';
export {
  DUAL_TRACK_DEFAULT_PRESET,
  DUAL_TRACK_MAX_TARGET_COUNT,
  DUAL_TRACK_MIN_TARGET_COUNT,
  DUAL_TRACK_PATH_ALGORITHM_TYPE,
  DUAL_TRACK_PATH_VERSION,
  DUAL_TRACK_TIER_COUNT,
  DUAL_TRACK_TIERS_PER_PHASE,
  createDefaultDualTrackPathProfile,
  evaluateDualTrackPathSession,
  getDualTrackTierCount,
  getDualTrackTierProfile,
  restoreDualTrackPathProfile,
  serializeDualTrackPathProfile,
  adjustDualTrackPathProfileToPreset,
} from './track/dual-track-path';
export type {
  TrackCrowdingEpisode,
  TrackReplayAnalysis,
  TrackReplayDefinition,
  TrackReplayObjectState,
  TrackReplaySnapshot,
} from './track/dual-track-replay';
export { analyzeTrackReplay, projectTrackReplaySnapshot } from './track/dual-track-replay';
// Modality System (extensible stimuli)
export type {
  FlexibleTrial,
  FlexibleTrialInput,
  ModalityDefinition,
  ModalityId,
  Stimulus,
  StimulusValue,
} from './modality';
export {
  createStimulus,
  FlexibleTrialBuilder,
  getActiveModalities,
  getColor,
  getHasResponse,
  getIsLure,
  getIsTarget,
  getLures,
  getLureType,
  getPosition,
  getResponseRT,
  getSound,
  getStimulus,
  getStimulusValue,
  getTargets,
  isFlexibleTrial,
  isFlexibleTrialInput,
  isLure,
  isTarget,
  modalityRegistry,
  ModalityRegistry,
  toTrial,
  toTrials,
} from './modality';
// Progression System (Badges, XP, Levels)
export type {
  // Unified XP Engine types
  AnySessionSummary,
  UnifiedXPContext,
  // Core types
  BadgeCategory,
  BadgeContext,
  BadgeDefinition,
  PremiumReward,
  PremiumRewardType,
  ProgressionRecord,
  UnlockedBadge,
  XPBreakdown,
} from './progression';
export {
  // Unified XP Engine (Single Source of Truth)
  calculateSessionXP,
  // Constants
  DAILY_SESSION_CAP,
  FLOW_BONUS_XP,
  MIN_XP_FLOOR,
  // Badges
  BADGES,
  checkNewBadges,
  getBadgeById,
  getBadgesByCategory,
  // Level utilities
  getLevel,
  getLevelProgress,
  getNextReward,
  getUnlockedRewards,
  getXPForNextLevel,
  getXPInCurrentLevel,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  PREMIUM_REWARDS,
  UserProgression,
  // Brain Workshop strikes helper
  calculateBrainWorkshopStrikes,
} from './progression';
export type { BrainWorkshopSessionData } from './progression';
// Calibration System (Cognitive Profile)
export type {
  CalibrationModality,
  CalibrationGameMode,
  CalibrationStep,
  CalibrationPhase,
  CalibrationState,
  CalibrationEvent,
  CalibrationBaselineFact,
  CalibrationResetFact,
  CalibrationSessionFact,
  CalibrationProjectionFacts,
  ModalityCalibrationState,
  CalibrationStrategy,
  ProgressionStrategy,
  CalibrationGameModeConfig,
  ModalityEvidenceStatus,
  CalibrationPlayConfig,
  StaircaseState,
} from './calibration';
export {
  CALIBRATION_MODALITIES,
  CALIBRATION_SEQUENCE,
  TRAINING_SEQUENCE,
  CALIBRATION_DERIVED_MODES,
  TOTAL_CALIBRATION_STEPS,
  NBACK_BLOCK_SIZE,
  DUAL_TRACK_BLOCK_SIZE,
  DUAL_TRACK_CALIBRATION_TRACKING_MS,
  MAX_BLOCKS_PER_STEP,
  THRESHOLD_UP,
  THRESHOLD_DOWN,
  CALIBRATION_MIN_LEVEL,
  CALIBRATION_MAX_LEVEL,
  START_LEVEL,
  DUAL_TRACK_BALL_CONFIG,
  DUAL_TRACK_BALL_CONFIG_SMALL,
  ROLLING_WINDOW,
  NBACK_DPRIME_UP,
  NBACK_DPRIME_DOWN,
  DT_ACCURACY_UP,
  DT_ACCURACY_DOWN,
  STAIRCASE_MAX_ROUNDS,
  STAIRCASE_FAIL_THRESHOLD,
  DEFAULT_MODALITY_STATE,
  DEFAULT_CALIBRATION_STATE,
  DEFAULT_STAIRCASE_STATE,
  applyStaircaseRound,
  jaeggiCalibrationStrategy,
  rollingWindowProgressionStrategy,
  setCalibrationStrategy,
  setProgressionStrategy,
  getCalibrationStrategy,
  getProgressionStrategy,
  getGameModeConfig,
  getActiveGameModeConfigs,
  buildCalibrationSequence,
  resultKey,
  getResult,
  getCalibrationProgress,
  getCurrentCalibrationStep,
  getMasteredLevel,
  getBlockSize,
  getDualTrackBallConfig,
  rollingAverage,
  applyBlockResult,
  shouldLevelUp,
  shouldLevelDown,
  computeProgress,
  findNextIncompleteStep,
  isCalibrationCompleteWithExclusions,
  applyCalibrationEvent,
  reduceCalibrationEvents,
  projectCalibrationProfileFromFacts,
  computeGlobalScore,
  findModalityExtremes,
  CALIBRATION_MODALITY_LABELS,
  MODALITY_TO_DT_IDENTITY,
  MODALITY_TO_NB_MODALITIES,
  getCalibrationStepScore,
  getSharedModalityLevel,
  getModalityEvidenceStatus,
  getCalibrationSessionScore,
  buildCalibrationPlayConfig,
  pickNextTrainingSession,
} from './calibration';
export type { NextTrainingSession } from './calibration';
// Session Health Metrics (RT Reliability)
export {
  computeSessionHealthMetrics,
  deriveQualityFlag,
  createEmptyHealthMetrics,
} from './health';
export type { SessionHealthInput } from './health';
