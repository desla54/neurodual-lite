/**
 * @neurodual/logic
 *
 * Core logic for the Dual N-Back game.
 * Contains domain, engine, coach, and session modules.
 */

export * from './catalog/stats-catalog';
export { TEMPO_PES_THRESHOLDS } from './types/ups';

export type {
  TrainingModalityStats,
  TrainingRunningStats,
  ConfigurableSettingKey,
  GameModeDefinition,
  GameModeId,
  ModeResolutionContext,
  ModeSettings,
  ResolvedGameMode,
  TrialResponse,
} from './coach';

export {
  DEFAULT_JOURNEY_ID,
  DUALNBACK_CLASSIC_JOURNEY_ID,
  BRAINWORKSHOP_JOURNEY_ID,
  DUAL_TRACE_JOURNEY_ID,
  DUAL_TRACK_EASY_JOURNEY_ID,
  DUAL_TRACK_MEDIUM_JOURNEY_ID,
  DUAL_TRACK_JOURNEY_ID,
  DUAL_TRACK_DNB_JOURNEY_ID,
  BUILT_IN_JOURNEYS,
} from './catalog/journeys';

export { resolveStatsContext } from './catalog/stats-context';

export {
  SESSION_END_EVENT_TYPES,
  SESSION_END_EVENT_TYPES_ARRAY,
  isSessionEndEventType,
  type SessionEndEventType,
} from './engine/session-end-event-types';
export {
  SESSION_START_EVENT_TYPES,
  SESSION_START_EVENT_TYPES_ARRAY,
  isSessionStartEventType,
  type SessionStartEventType,
} from './engine/session-start-event-types';
// Removed: tower, gridlock, mental-rotation, ravens, go-nogo, stop-signal, trail-making (deleted game modes)
// =============================================================================
// Coach (trial generation and stats)
// =============================================================================
export {
  // Game Modes
  gameModeRegistry,
  // Running Stats
  RunningStatsCalculator,
  // Trial Generators
  PreGeneratedTrialGenerator,
  SequenceTrialGenerator,
  createSequenceTrialGenerator,
} from './coach';
export type {
  ArithmeticAnswer,
  ArithmeticDifficulty,
  ArithmeticOperator,
  ArithmeticProblem,
  BadgeCategory,
  BadgeContext,
  BadgeDefinition,
  Block,
  BlockConfig,
  BlockScore,
  BrainWorkshopSessionData,
  Color,
  DailyStats,
  FeedbackChannel,
  FeedbackMode,
  GenerationContext,
  GeneratorName,
  KnownModality,
  LureType,
  ModalityId,
  ModalityStats,
  ModalityVerdict,
  SDTCounts,
  SDTCountsNullable,
  PerformanceTier,
  Position,
  PremiumReward,
  PremiumRewardType,
  ProgressionRecord,
  ImageShape,
  SpatialDirection,
  DigitValue,
  EmotionValue,
  WordValue,
  ToneValue,
  Sound,
  StreakInfo,
  TrendInfo,
  Trial,
  TrialInput,
  TrialResult as DomainTrialResult,
  TrialType,
  TrialVerdict,
  UnifiedMetrics,
  UnifiedPerformanceScore,
  UnlockedBadge,
  UserInputs,
  WeeklyStats,
  XPBreakdown,
  // Unified XP Engine types
  AnySessionSummary,
  DualTrackCrowdingMode,
  DualTrackMotionComplexity,
  DualTrackPathEvaluation,
  DualTrackPathProfile,
  DualTrackPathSessionMetrics,
  DualTrackPerformanceBand,
  DualTrackTierProfile,
  TrackCrowdingEpisode,
  TrackReplayAnalysis,
  TrackReplayDefinition,
  TrackReplayObjectState,
  TrackReplaySnapshot,
  UnifiedXPContext,
} from './domain';
// =============================================================================
// Domain (pure logic, types, scoring)
// =============================================================================
export {
  // Progression System (Unified XP Engine - Single Source of Truth)
  BADGES,
  calculateSessionXP,
  // Constants
  DAILY_SESSION_CAP,
  FLOW_BONUS_XP,
  MIN_XP_FLOOR,
  DUAL_TRACK_MAX_TARGET_COUNT,
  DUAL_TRACK_MIN_TARGET_COUNT,
  DUAL_TRACK_PATH_ALGORITHM_TYPE,
  DUAL_TRACK_PATH_VERSION,
  DUAL_TRACK_TIER_COUNT,
  // Utilities
  analyzeTrackReplay,
  checkNewBadges,
  createDefaultDualTrackPathProfile,
  evaluateDualTrackPathSession,
  getBadgeById,
  getBadgesByCategory,
  getDualTrackTierCount,
  getDualTrackTierProfile,
  getLevel,
  getLevelProgress,
  getNextReward,
  getUnlockedRewards,
  getXPForNextLevel,
  getXPInCurrentLevel,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  PREMIUM_REWARDS,
  projectTrackReplaySnapshot,
  restoreDualTrackPathProfile,
  serializeDualTrackPathProfile,
  adjustDualTrackPathProfileToPreset,
  UserProgression,
  // Constants
  ARITHMETIC_ANSWERS,
  ARITHMETIC_OPERATORS_BY_DIFFICULTY,
  AUDIO_SYNC_BUFFER_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS,
  COLORS,
  IMAGE_MODALITY_SHAPES,
  SPATIAL_DIRECTIONS,
  DIGIT_VALUES,
  EMOTION_VALUES,
  WORD_VALUES,
  TONE_VALUES,
  DEFAULT_CONFIG,
  // Scoring
  evaluateProgression,
  PsychometricScore,
  GameConfig,
  // Random
  generateId,
  JAEGGI_CONFIG,
  DualnbackClassicStrategy,
  // Value Objects
  ModalityStatsVO,
  POSITIONS,
  // SDT Calculator (canonical d-prime with Hautus correction)
  SDTCalculator,
  SeededRandom,
  SessionStats,
  SOUNDS,
  COLOR_VALUES,
  TrialVO,
  UserHistory,
  // Unified Metrics
  computeUnifiedMetrics,
  computeTempoAccuracy,
  computeSpecDrivenTempoAccuracy,
  computeMemoAccuracy,
  computePlaceAccuracy,
  createEmptyUnifiedMetrics,
  // UPS (Unified Performance Score)
  deriveTier,
  JOURNEY_MIN_UPS,
  UnifiedScoreCalculator,
  // Brain Workshop strikes calculator
  calculateBrainWorkshopStrikes,
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
  // OSPAN
  PROCESSING_ACCURACY_THRESHOLD,
  // Session Passed Calculator
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
  // Trial helpers
  getIsTarget,
  // Calibration System (Cognitive Profile)
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
  DEFAULT_MODALITY_STATE,
  DEFAULT_CALIBRATION_STATE,
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
  isCalibrationCompleteWithExclusions,
  getMasteredLevel,
  getBlockSize,
  getDualTrackBallConfig,
  rollingAverage,
  applyBlockResult,
  shouldLevelUp,
  shouldLevelDown,
  computeProgress,
  applyCalibrationEvent,
  reduceCalibrationEvents,
  projectCalibrationProfileFromFacts,
  computeGlobalScore,
  findModalityExtremes,
  findNextIncompleteStep,
  CALIBRATION_MODALITY_LABELS,
  MODALITY_TO_DT_IDENTITY,
  MODALITY_TO_NB_MODALITIES,
  getCalibrationStepScore,
  getSharedModalityLevel,
  getModalityEvidenceStatus,
  getCalibrationSessionScore,
  buildCalibrationPlayConfig,
  pickNextTrainingSession,
  // Staircase calibration (intra-session)
  STAIRCASE_MAX_ROUNDS,
  STAIRCASE_FAIL_THRESHOLD,
  DEFAULT_STAIRCASE_STATE,
  applyStaircaseRound,
} from './domain';
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
  NextTrainingSession,
  StaircaseState,
} from './domain';
export type {
  // Events
  BaseEvent,
  // Cognitive types
  CognitiveProfile,
  // Profile types (computed from events)
  DeviceInfo,
  EventQuery,
  FatigueMetrics,
  FlowMetrics,
  FocusLostEvent,
  FocusRegainedEvent,
  GameEvent,
  GameEventType,
  InputMisfiredEvent,
  ModalityProfile,
  ProgressionPoint,
  // Memo Events
  MemoSessionStartedEvent,
  MemoSessionEndedEvent,
  MemoStimulusShownEvent,
  MemoEvent,
  // Dual Label Events
  DualPickSessionStartedEvent,
  DualPickSessionEndedEvent,
  // Trace Events
  TraceSessionStartedEvent,
  TraceSessionEndedEvent,
  TraceResponseEvent,
  // Place Events
  PlaceSessionStartedEvent,
  PlaceSessionEndedEvent,
  PlaceDropAttemptedEvent,
  PlaceTurnCompletedEvent,
  PlaceStimulusShownEvent,
  PlacePlacementStartedEvent,
  PlaceDragCancelledEvent,
  PlaceSlotEnter,
  PlaceEvent,
  ResilienceMetrics,
  RhythmMetrics,
  RunningStats as EngineRunningStats,
  SessionPlayContext,
  TemporalContext,
  SessionEndedEvent,
  SessionImportedEvent,
  SessionPausedEvent,
  SessionResumedEvent,
  SessionStartedEvent,
  SessionSummary,
  TimingStats,
  TrialOutcome,
  TrialPresentedEvent,
  TrialResult,
  PlayerProfile,
  UserResponseEvent,
  UserStateDeclaredEvent,
  ValidatedGameEvent,
} from './engine';
// =============================================================================
// Engine (event store, projections)
// =============================================================================
export {
  // Cognitive Profiler (OOP class)
  CognitiveProfiler,
  // Session Projector (OOP class)
  SessionProjector,
  // Memo Session Projector (OOP class)
  MemoSessionProjector,
  // Flow Session Projector (OOP class)
  PlaceSessionProjector,
  // Dual Label Session Projector (OOP class)
  DualPickSessionProjector,
  // UPS Projector (Unified Performance Score)
  UPSProjector,
  // Profile Projector
  computeProfileFromEvents,
  createEmptyProfile,
  rebuildProfile,
  projectProfileFromSessions,
  projectPlayerProfileFromRows,
  // Progression Projector
  createEmptyProgression,
  projectProgressionFromSessions,
  // Helper functions for modality stats access
  getAllReactionTimes,
  getModalityStats,
  getTotalStats,
  getTrialModalityOutcome,
  // Zod schema for cloud event validation
  GameEventSchema,
  // Turn Projectors (lazy-loaded turn-by-turn detail for reports)
  projectTempoTurns,
  projectMemoTurns,
  projectPlaceTurns,
  projectTraceTurns,
  projectTrackTurns,
  projectCognitiveTaskTurns,
  // Tempo projection entrypoint (shared stream selection)
  projectTempoSessionEntrypoint,
  // Session summary inputs (projection SSOT)
  projectImportedSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectDualPickSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectTimeSessionToSummaryInput,
  projectTrackSessionToSummaryInput,
  projectCorsiSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
  projectRunningSpanSessionToSummaryInput,
  projectPasatSessionToSummaryInput,
  projectSwmSessionToSummaryInput,
} from './engine';

export type {
  TraceEvent,
  MotEvent,
  CorsiEvent,
  OspanEvent,
  RunningSpanEvent,
  PasatEvent,
  SwmEvent,
} from './engine';
export type {
  PlaceDropConfidenceMetrics,
  PlaceModalityStats,
  PlaceTurnResult,
  PlaceExtendedStats,
  PlaceExtendedSummary,
  // Memo confidence metrics
  MemoWindowConfidenceMetrics,
  MemoExtendedSummary,
} from './engine';
// =============================================================================
// Ports (interfaces for external dependencies)
// =============================================================================
export type {
  AudioConfig,
  AudioPort,
  AudioPreset,
  // Audio Lifecycle
  AudioLifecycleEvent,
  AudioLifecyclePort,
  AudioLifecycleState,
  AudioLoadingProgress,
  // App Lifecycle
  AppLifecyclePort,
  AppLifecycleState,
  InitializationProgress,
  // Persistence Lifecycle
  PersistenceLifecyclePort,
  PersistenceLifecycleState,
  // Platform Lifecycle
  PlatformLifecycleSource,
  PlatformLifecycleEvent,
  PlatformLifecycleListener,
  // Game Session Manager
  GameSessionManagerPort,
  GameSessionManagerEvent,
  GameSessionManagerListener,
  ManagedSessionInfo,
  SessionLifecycleState,
  SessionMode,
  SpawnSessionOptions,
  // Network Lifecycle
  NetworkLifecyclePort,
  NetworkLifecycleEvent,
  NetworkState,
  NetworkStateListener,
  NetworkInfo,
  NetworkQuality,
  // Session End Pipeline
  SessionEndPipelinePort,
  SessionEndPipelineInput,
  SessionEndPipelineEvent,
  PipelineState,
  PipelineStage,
  PersistedPipelineState,
  DevLoggerPort,
  HistoryModalityStats,
  HistoryPort,
  ImportResult,
  ProfilePort,
  ProgressionData,
  ProgressionPort,
  SessionEndReason,
  SessionHistoryExport,
  SessionHistoryItem,
  SessionHistoryItemJSON,
  SessionLogData,
  // Auth Port
  AuthError,
  AuthPort,
  AuthResult,
  AuthSession,
  AuthState,
  AuthStateListener,
  AuthUser,
  AuthUserProfile,
  SignInCredentials,
  SignUpCredentials,
  // Subscription Port
  PaymentProvider,
  PlanType,
  Subscription,
  SubscriptionListener,
  SubscriptionPort,
  SubscriptionState,
  SubscriptionStatus,
  // Sync Port
  SyncPort,
  SyncResult,
  SyncState,
  SyncStateListener,
  SyncStatus,
  // Payment Port
  CustomerInfo,
  PaymentPort,
  PaymentStateListener,
  Product,
  ProductId,
  PurchaseResult,
  // License Port (Lemon Squeezy)
  LicensePort,
  LicenseState,
  LicenseStateListener,
  LicenseStatus,
  LicenseValidationResult,
  LicenseActivationResult,
  LicenseDeactivationResult,
  LicenseProduct,
  CheckoutOptions,
  CheckoutUrlResult,
  // Reward Port
  RewardPort,
  RewardGrantResult,
  RewardState,
  RewardStateListener,
  PendingReward,
  GrantedReward,
  // XP Context Port
  XPContextPort,
  XPExternalContext,
  // Reactive read-models
  Subscribable,
  Unsubscribe,
  ReadModelSnapshot,
  ReadModelPort,
  ModalityFilterSet,
  NLevelFilterSet,
  ModeType,
  JourneyFilterType,
  FreeModeFilterType,
  SessionSummariesFilters,
  SessionSummariesCursor,
  CommandBusPort,
} from './ports';
export { combineSubscribables, mapSubscribable } from './ports';
export type {
  // Clock Port
  ClockPort,
  // Random Port
  RandomPort,
  // Platform Info Port
  PlatformInfo,
  PlatformInfoPort,
} from './ports';
export {
  nullDevLogger,
  // Subscription helpers
  calculateDaysRemaining,
  planHasCloudSync,
  planHasPremiumAccess,
  PREMIUM_N_THRESHOLD,
  DAILY_PLAYTIME_GRACE_DAYS,
  DAILY_PLAYTIME_GRACE_LIMIT_MS,
  DAILY_PLAYTIME_STANDARD_LIMIT_MS,
  FREE_TRIAL_DURATION_DAYS,
  // Clock adapter
  browserClock,
  // Random adapters
  cryptoRandom,
  createSeededRandom,
  // XP Context (null implementation)
  nullXPContextPort,
  // License helpers
  maskLicenseKey,
  createEmptyLicenseState,
  // Session End Pipeline helpers
  PIPELINE_STAGES,
  calculatePipelineProgress,
  // History row transformation (for @powersync/react useQuery in ui)
  sessionSummaryRowToHistoryItem,
  // Audio preset helpers
  isSyncPreset,
} from './ports';

export type {
  // Recovery
  SessionRecoveryPort,
  CreateRecoverySnapshotParams,
  ReplayRecoveryPort,
  CreateReplayRecoverySnapshotParams,
  TutorialRecoveryPort,
  // Diagnostics
  DiagnosticsPort,
  FreezeEvent,
  LongTaskEvent,
  // Settings sync
  SettingsSyncPort,
  SettingsSyncResult,
  SettingsData,
  // Deep links
  DeepLinkPort,
  DeepLinkHandlerPort,
  // Infra probes
  InfraProbePort,
  // OAuth callback
  OAuthCallbackPort,
  OAuthCodeExchangeResult,
  // Events
  EventReaderPort,
  EventReaderFactoryPort,
  // Admin maintenance
  AdminHistoryMaintenancePort,
  // Session pipeline factory
  PipelineRecoveryStoragePort,
  CreateSessionPipelineOptions,
  SessionPipelineFactoryPort,
  // Persistence health
  PersistenceHealthPort,
  PersistenceHealthData,
  PowerSyncRuntimeHealth,
  ProjectionHealth,
} from './ports';
// Stats Port (SQL-first statistics)
export type {
  StatsPort,
  StatsFilters,
  StatsMode,
  StatsInputMethod,
  ActivityStats,
  PerformanceStats,
  ModalityStatsRow,
  TimeSeriesPoint,
  SessionScorePoint,
  ModeScoreStats,
  ZoneStats,
  ErrorProfileStats,
  UPSStats,
  PlaceConfidenceStats,
  MemoConfidenceStats,
  DistributionStats,
  ModeBreakdown,
  FocusStats,
  StatsTimingStats,
  ModalityTimingStats,
  PostErrorSlowingStats,
} from './ports';
// =============================================================================
// Session (game orchestration)
// =============================================================================
export {
  GameSessionXState,
  // Trace Session XState Wrapper (BETA)
  TraceSessionXState,
  analyzeTimeSpeed,
  buildTimeSessionSummary,
  buildTimeTrialResult,
  computeTimeAccuracyScore,
  computeTimeRegularityScore,
  createInitialTimeSessionState,
  transitionTimeSessionMachine,
  // Corsi Block
  createInitialCorsiSessionState,
  transitionCorsiSessionMachine,
  generateCorsiSequence,
  buildCorsiSessionSummary,
  // OSPAN
  createInitialOspanSessionState,
  transitionOspanSessionMachine,
  generateOspanEquation,
  generateStandardOspanSequence,
  selectOspanLetters,
  buildOspanSessionSummary,
  // Running Span
  createInitialRunningSpanSessionState,
  transitionRunningSpanSessionMachine,
  generateRunningSpanStream,
  buildRunningSpanSessionSummary,
  // PASAT
  createInitialPasatSessionState,
  transitionPasatSessionMachine,
  generatePasatNumber,
  buildPasatSessionSummary,
  // SWM
  createInitialSwmSessionState,
  transitionSwmSessionMachine,
  generateSwmTokenPosition,
  buildSwmSessionSummary,
  // Decider (Phase 0: shared contract for pure session state machines)
  createEnvelopeFactory,
  givenDecider,
} from './session';
export type {
  // Decider types
  SessionDecider,
  SessionEventDraft,
  SessionCompletionDraft,
  DeciderTransition,
  EnvelopeFactoryConfig,
  EventEnvelopeFactory,
  MaterializedEvent,
  DeciderTestHarness,
} from './session';
export type {
  AlgorithmId,
  FeedbackConfig,
  GameSessionDeps,
  SessionListener,
  SessionPhase,
  SessionSnapshot,
  // Trace Session XState Wrapper (BETA)
  TraceWrapperSnapshot,
  TraceWrapperListener,
  TraceWrapperPhase,
  TraceWrapperDeps,
  SliderSample,
  SlideResult,
  SpeedSegment,
  TimeTrialResult,
  TimeTrialPhase,
  TimeSessionPhase,
  TimeSessionEndReason,
  TimeSliderShape,
  TimeSliderDirection,
  TimeSessionSummary,
  TimeSessionMachineConfig,
  TimeSessionMachineState,
  TimeSessionMachineAction,
  TimeSessionEventDraft,
  TimeCompletionDraft,
  TimeSessionMachineTransition,
  // Corsi Block
  CorsiDirection,
  CorsiTrialPhase,
  CorsiSessionPhase,
  CorsiEndReason,
  CorsiTrialResult,
  CorsiSessionSummary,
  CorsiSessionMachineConfig,
  CorsiSessionMachineState,
  CorsiSessionMachineAction,
  CorsiSessionEventDraft,
  CorsiCompletionDraft,
  CorsiSessionMachineTransition,
  // OSPAN
  OspanTrialPhase,
  OspanSessionPhase,
  OspanEndReason,
  OspanEquationResult,
  OspanSetResult,
  OspanSessionSummary,
  OspanSessionMachineConfig,
  OspanSessionMachineState,
  OspanSessionMachineAction,
  OspanSessionEventDraft,
  OspanCompletionDraft,
  OspanSessionMachineTransition,
  // Running Span
  RunningSpanTrialPhase,
  RunningSpanSessionPhase,
  RunningSpanEndReason,
  RunningSpanTrialResult,
  RunningSpanSessionSummary,
  RunningSpanSessionMachineConfig,
  RunningSpanSessionMachineState,
  RunningSpanSessionMachineAction,
  RunningSpanSessionEventDraft,
  RunningSpanCompletionDraft,
  RunningSpanSessionMachineTransition,
  // PASAT
  PasatTrialPhase,
  PasatSessionPhase,
  PasatEndReason,
  PasatTrialResult,
  PasatSessionSummary,
  PasatSessionMachineConfig,
  PasatSessionMachineState,
  PasatSessionMachineAction,
  PasatSessionEventDraft,
  PasatCompletionDraft,
  PasatSessionMachineTransition,
  // SWM
  SwmRoundPhase,
  SwmSessionPhase,
  SwmEndReason,
  SwmRoundResult,
  SwmSessionSummary,
  SwmSessionMachineConfig,
  SwmSessionMachineState,
  SwmSessionMachineAction,
  SwmSessionEventDraft,
  SwmCompletionDraft,
  SwmSessionMachineTransition,
} from './session';
// XState Machine (new)
export {
  gameSessionMachine,
  tutorialSessionMachine,
  traceSessionMachine,
  dualPickSessionMachine,
  memoSessionMachine,
  placeSessionMachine,
} from './session/machine';
export type {
  GameSessionInput,
  GameSessionContext,
  GameSessionEvent,
  GameSessionStateValue,
  GameSessionSnapshot,
  // Tutorial Session Machine
  TutorialSessionInput,
  TutorialSessionEvent,
  TutorialSessionContext,
  TutorialSessionStateValue,
  TutorialCompletionReport,
  TutorialAssessmentResult,
  // Trace Session Machine
  TraceSessionInput as TraceSessionMachineInput,
  TraceSessionContext as TraceSessionMachineContext,
  TraceSessionEvent as TraceSessionMachineEvent,
  TraceSessionSnapshot as TraceSessionMachineSnapshot,
  TracePhase as TraceSessionMachinePhase,
  TraceSpec as TraceSessionMachineSpec,
  TutorialSessionSnapshot,
  TutorialStimulus,
  TutorialUserResponse,
  // DualPick Session Machine
  DualPickSessionInput as DualPickMachineInput,
  DualPickSessionEvent as DualPickMachineEvent,
  DualPickSessionSnapshot as DualPickMachineSnapshot,
  DualPickSessionSnapshot, // Alias for backward compatibility
  DualPickPhase as DualPickMachinePhase,
  DualPickSession, // Session proxy interface for UI hooks
  // Memo Session Machine (alias to avoid conflict with report's MemoSessionInput)
  MemoSessionInput as MemoSessionMachineInput,
  MemoSessionEvent,
  MemoSessionSnapshot,
  MemoPhase,
  // Flow Session Machine (alias to avoid conflict with report's PlaceSessionInput)
  PlaceSessionInput as PlaceSessionMachineInput,
  PlaceSessionMachineEvent,
  PlaceSessionMachineSnapshot,
  PlaceSessionMachineSnapshot as PlaceSessionSnapshot, // Alias for backward compatibility
  PlaceSessionMachineStateValue,
} from './session/machine';
// Trace session helpers
export {
  getEnabledModalities,
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedWritingSound,
  getExpectedColor,
  getExpectedWritingColor,
  getExpectedImage,
  getExpectedDigit,
  getExpectedEmotion,
  getExpectedWord,
  getExpectedTone,
  getExpectedSpatialDirection,
  getNBackActiveModalities,
  getTrialCycleDuration,
} from './session/machine/trace-session-types';
export {
  buildDualTraceSessionMachineInput,
  createTimingSourceFromTraceSessionTimings,
  deriveTraceSessionTimings,
  resolveTraceGridMode,
} from './session/machine/trace-session-input-builder';
export type {
  BuildDualTraceSessionMachineInputArgs,
  DualTraceSessionBuildResult,
  TraceMirrorAxisSetting,
  TraceSelfPacedTimingSettings,
  TraceSessionTimings,
} from './session/machine/trace-session-input-builder';
export type {
  GenerateTraceTrialsOptions,
  TraceTrialGenerationRandom,
} from './session/trace-trial-generation';
export {
  generateTraceActiveModalities,
  generateTraceTrials,
} from './session/trace-trial-generation';
// Trace session plugins
export type {
  TraceSessionPlugins,
  TimingSource,
  TimingSourceUpdate,
  TraceArithmeticProblem,
  TraceArithmeticColorCue,
  TraceArithmeticCueToken,
} from './session/machine/trace-session-plugins';
// Removed: trace-timing-utils (deleted with trace game mode)

// DualPick session plugins
export { createDefaultDualPickPlugins } from './session/machine/dual-pick-session-plugins';
export type { DualPickSessionPlugins } from './session/machine/dual-pick-session-plugins';

// Memo session plugins
export { createDefaultMemoPlugins } from './session/machine/memo-session-plugins';
export type { MemoSessionPlugins } from './session/machine/memo-session-plugins';

// Flow session plugins
export { createDefaultPlacePlugins } from './session/machine/place-session-plugins';
export type { PlaceSessionPlugins } from './session/machine/place-session-plugins';

// =============================================================================
// Memo Types (from types/recall.ts)
// =============================================================================
export type {
  ModalityPick,
  SlotPicks,
  WindowPicks,
  EvaluatedPick,
  WindowResult,
  MemoModalityStats,
  MemoSlotStats,
  MemoTrend,
  MemoRunningStats,
  ProgressiveWindowConfig,
  MemoFeedbackMode,
  MemoFillOrderMode,
  MemoSessionConfig,
  MemoSessionSummary,
} from './types/memo';
export {
  TREND_WINDOW_SIZE,
  TREND_THRESHOLD,
  createEmptyMemoStats,
  DEFAULT_PROGRESSIVE_CONFIG,
  DEFAULT_RECALL_SESSION_CONFIG,
  getWindowDepthForTrial,
  getRequiredCells,
  isWindowComplete,
} from './types/memo';
// =============================================================================
// Place Types (from types/place.ts)
// =============================================================================
export type {
  PlaceProposal,
  PlaceDropResult,
  PlaceDragSlotEnter,
  PlaceDragTrajectory,
  PlaceSessionConfig,
  PlaceRunningStats,
  PlaceSessionSummary,
  PlacePhase,
  PlacementOrderMode,
  PlaceTimelineMode,
  PlacementTarget,
  PlaceDistractorSource,
} from './types/place';
export {
  DEFAULT_PLACE_SESSION_CONFIG,
  createEmptyPlaceStats,
} from './types/place';
// =============================================================================
// Dual Label Types (BETA)
// =============================================================================
export type {
  DualPickId,
  DualPickProposal,
  DualPickTimelineCard,
  DualPickSlotEnter,
  DualPickDragTrajectory,
  DualPickSessionConfig,
  DualPickRunningStats,
  DualPickSessionSummary,
  DualPickPhase,
  DualPickTimelineMode,
  DualPickDistractorSource,
  DualPickPlacementOrderMode,
} from './types/dual-pick';
export {
  DEFAULT_DUAL_PICK_SESSION_CONFIG,
  createEmptyDualPickStats,
} from './types/dual-pick';
// =============================================================================
// Trace Types (BETA)
// =============================================================================
export type {
  TraceRhythmMode,
  TraceTrial,
  TraceResponseType,
  TraceResponse,
  TraceSessionConfig,
  TraceRunningStats,
  TraceSessionSummary,
  TracePhase,
  TraceWritingMode,
  TraceWritingConfig,
  TraceWritingResult,
  TraceModality,
  TraceModalityResult,
  TraceModalityStats,
  SwipeDirection,
} from './types/trace';
export {
  DEFAULT_TRACE_SESSION_CONFIG,
  DEFAULT_TRACE_WRITING_CONFIG,
  createEmptyTraceStats,
  createEmptyModalityStats,
  createEmptyAllModalityStats,
  computeModalityResult,
  computeAllModalityResults,
  updateModalityStats,
  validateTraceActionDuration,
  getMirrorPosition,
  getGridDimensions,
} from './types/trace';
export type { MirrorAxis, GridMode } from './types/trace';
// =============================================================================
// Journey (Training Path)
// =============================================================================
export type {
  JourneyConfig,
  JourneyMeta,
  JourneyModeType,
  HybridJourneyStageProgress,
  HybridJourneyDecisionZone,
  JourneyStrategyConfig,
  HybridJourneyStrategyConfig,
  DualTrackJourneyPreset,
  DualTrackJourneyStrategyConfig,
  JourneyStageDefinition,
  JourneyStageProgress,
  JourneyStageStatus,
  JourneyState,
} from './types/journey';
export {
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_MAX_LEVEL,
  JOURNEY_MODE_TO_GAME_MODE,
  JOURNEY_MODES_PER_LEVEL,
} from './types/journey';
export {
  // Journey constants and generators
  ALTERNATING_JOURNEY_FIRST_MODE,
  ALTERNATING_JOURNEY_SECOND_MODE,
  createDefaultHybridJourneyStrategyConfig,
  DEFAULT_DUAL_TRACK_JOURNEY_PRESET,
  generateJourneyStages,
  getAcceptedGameModesForJourney,
  getFirstPremiumStage,
  isAlternatingJourneyMode,
  resolveDualTrackJourneyPreset,
  resolveHybridJourneyStrategyConfig,
  resolveHybridJourneyTrackProfile,
  resolveJourneyStrategyConfig,
  getSessionsRequired,
  getSessionsRequired as getRequiredSessions,
  getStageDefinition,
  getTotalStagesForTarget,
  isSimulatorMode,
  isStageRequiresPremium,
  JOURNEY_MIN_PASSING_SCORE,
  JOURNEY_PREMIUM_N_THRESHOLD,
  JOURNEY_SCORE_THRESHOLDS,
  // Journey native scoring (source of truth)
  computeNativeJourneyScore,
  computeJourneyScoreFromStats,
  computeJourneyScoreForSession,
  createScoreResultFromPrecomputed,
  hasSDTStats,
  getScoringStrategyForMode,
  getThresholdForStrategy,
  BW_THRESHOLD,
  BALANCED_THRESHOLD,
  // Journey router
  getJourneyRoute,
  getRouteForGameMode,
  hasSpecificRoute,
  // Raw stats scoring helpers
  aggregateRawStats,
  computeBrainWorkshopScoreFromRaw,
  computeDualnbackClassicScoreFromRaw,
  isSessionPassing,
  // Jaeggi binary protocol (2008)
  computeJaeggiProgression,
  buildJourneyTransitionRecord,
  decideJourneyAttempt,
  journeyTransitionRecordToContext,
  deriveJourneyContextFromState,
  // Journey workflow
  deriveNextSession,
  toWorkflowConfig,
} from './domain/journey';
export type { DeriveJourneyContextInput } from './domain/journey';
export type {
  // Journey scoring types
  JourneyScoringStrategy,
  JourneyScoreResult,
  JourneyScoreDetails,
  PrecomputedScoreSession,
  RawSDTStats,
  // Jaeggi binary protocol types
  JaeggiProgression,
  DualnbackClassicProgressionResult,
  // Journey router types
  JourneyRoute,
  // Journey workflow types
  JourneyEvent,
  JourneyCommand,
  JourneyOutput,
  NextSessionCommand,
  JourneyWorkflowConfig,
} from './domain/journey';
export {
  computeJourneyScore,
  createEmptyJourneyState,
  getCurrentStageProgress,
  isJourneyComplete,
  projectJourneyFromHistory,
  // Session Completion Projector (Single Source of Truth for session completion)
  SessionCompletionProjector,
  projectSessionReportFromEvents,
  SESSION_REPORT_PROJECTION_VERSION,
  projectDualnbackClassicTempoWithHomeEs,
} from './engine';
export type { JourneyProjectionSession } from './engine';
export type {
  Challenge20Config,
  Challenge20State,
  ChallengeDayCard,
  LocalDayKey,
  TrainingDailyTotal,
} from './types/challenge';
export {
  createDefaultChallenge20Config,
  formatLocalDayKey,
  projectChallenge20FromDailyTotals,
} from './engine';
export type {
  ProjectSessionReportFromEventsInput,
  SessionCompletionInput,
  TempoCompletionInput,
  PlaceCompletionInput,
  MemoCompletionInput,
  DualPickCompletionInput,
  TraceCompletionInput,
  TimeCompletionInput,
  TrackCompletionInput,
  CorsiCompletionInput,
  OspanCompletionInput,
  RunningSpanCompletionInput,
  PasatCompletionInput,
  SwmCompletionInput,
  SessionCompletionResult,
  SessionCompletionWithXPResult,
  XPContextInput,
  TempoProjectionEntrypointResult,
} from './engine';
export type {
  AttemptResult,
  JourneyPort,
  JourneyRecordableSession,
} from './ports';
// =============================================================================
// Migration (event versioning and migration)
// =============================================================================
export {
  // Registration
  registerAllMigrations,
  getMigrationCount,
  // Registry
  eventMigrationRegistry,
  // Validator
  migrateAndValidateEvent,
  migrateAndValidateEventBatch,
  isValidEventShape,
  safeParseEvent,
  // Constants
  CURRENT_SCHEMA_VERSION,
  DEFAULT_VALIDATION_CONFIG,
} from './migration';
export type {
  SchemaVersion,
  RawVersionedEvent,
  MigrationEntry,
  MigrationResult,
  MigrationSuccessResult,
  MigrationErrorResult,
  ValidationConfig,
} from './migration';
// =============================================================================
// Schemas (boundary validation)
// =============================================================================
export {
  // Session History
  HistoryModalityStatsSchema,
  SessionEndReasonSchema,
  SessionHistoryItemJSONSchema,
  SessionHistoryExportSchema,
  // Settings
  SettingsDataSchema,
  // Subscription
  PlanTypeSchema,
  SubscriptionStatusSchema,
  PaymentProviderSchema,
  SubscriptionRowSchema,
  // User
  UserRowSchema,
  // Algorithm State
  AlgorithmStateSchema,
  // Journey State
  JourneyStageProgressSchema,
  JourneyStateSchema,
  // Lemon Squeezy Schemas
  LemonSqueezyLicenseValidationSchema,
  type ValidatedLemonSqueezyLicenseValidation,
  LemonSqueezyWebhookPayloadSchema,
  type ValidatedLemonSqueezyWebhookPayload,
  LemonSqueezyWebhookEventSchema,
  type LemonSqueezyWebhookEvent,
  // Helpers
  safeParseWithLog,
  parseOrThrow,
  parseOrDefault,
} from './schemas';
export type {
  ValidatedSessionHistoryExport,
  ValidatedSettingsData,
  ValidatedSubscriptionRow,
  ValidatedUserRow,
} from './schemas';
// =============================================================================
// Sequence (adaptive algorithms)
// =============================================================================
export {
  createDualTempoAlgorithm,
  createDualMemoAlgorithm,
  createDualPlaceAlgorithm,
  createFixedAlgorithm,
  createThompsonSamplingAlgorithm,
  createAdaptiveControllerAlgorithm,
  createMetaLearningAlgorithm,
} from './sequence';
export type {
  AdaptiveAlgorithm,
  AdaptationMode,
  TrainingObjective,
  ThompsonSamplingConfig,
  AdaptiveControllerConfig,
  ControllerGains,
  UserProfile,
  MetaLearningConfig,
  HistoricalSessionData,
  AlgorithmState,
} from './sequence';
// =============================================================================
// Algorithm State Port (meta-learning persistence)
// =============================================================================
export type {
  AlgorithmStatePort,
  AlgorithmType,
  StoredAlgorithmState,
} from './ports';
// Replay Port
export type {
  ReplayPort,
  ReplaySession,
  ReplaySessionType,
  ReplaySessionBase,
  ReplayTempoSession,
  ReplayPlaceSession,
  ReplayMemoSession,
  ReplayDualPickSession,
  ReplayTrackSession,
} from './ports';
// Settings Port
export type { SettingsPort, UserSettings, UISettings, SavedJourney } from './ports';
// Replay Interactif Port
export type { ReplayInteractifPort } from './ports';
// Interactive Replay Lifecycle Port
export type {
  InteractiveReplayLifecyclePort,
  InteractiveReplayLifecycleState,
  InteractiveReplaySpeed,
  InteractiveReplayInput,
  InteractiveReplayContext,
  InteractiveReplayMachineEvent,
  InteractiveReplayStateListener,
  InteractiveReplayContextListener,
} from './ports';
// Persistence Port (unified DB access)
export type {
  PersistencePort,
  PersistenceWriteTransaction,
  EventInput,
  StoredEvent,
  EventQueryOptions,
  SessionSummariesOptions,
  SessionSummaryRow,
  SessionSummaryInput,
  AlgorithmStateResult,
  BadgeHistorySnapshot,
  // Focused sub-interfaces
  EventStorePort,
  SessionSummaryStorePort,
  SQLQueryPort,
  SettingsStorePort,
  AlgorithmStateStorePort,
  PersistenceSyncPort,
  PendingDeletionsPort,
  StatsHelpersPort,
  DatabaseLifecyclePort,
} from './ports';
// Haptic Port
export type { HapticPort, HapticImpactStyle, HapticNotificationType } from './ports';
// Cursor Position Port (for mouse RT analysis)
export type { CursorPositionPort, CursorPosition } from './ports';
// Wake Lock Port (keep screen awake during sessions)
export type { WakeLockPort } from './ports';
// Replay Interactif Types
export type {
  ReplayRun,
  ReplayRunInput,
  ReplayRunStatus,
  ReplayEvent,
  ReplayEventInput,
  ReplayEventActor,
  SkipReason,
  SkippableEventType,
  StructureEventType,
  RunScore,
} from './types/replay-interactif';
// Replay Projector
export {
  parseTempoEvents,
  projectTempoSnapshot,
  getActiveResponsesAtTime,
  mapReplayEventsToGameEvents,
  parsePlaceEvents,
  projectPlaceSnapshot,
  getPlaceDropsAtTime,
  getPlaceInFlightDragsAtTime,
  parseMemoEvents,
  projectMemoSnapshot,
  getMemoPicksAtTime,
  // DualPick replay
  parseDualPickEvents,
  projectDualPickSnapshot,
  getDualPickInFlightDragsAtTime,
  getDualPickDropsAtTime,
  parseTrackEvents,
  projectTrackSnapshot,
  identifySkippableEvents,
  // Interactive Replay Engine
  InteractiveReplayEngine,
} from './engine';
export type {
  TempoReplayData,
  PlaceReplayData,
  PlaceDropData,
  InFlightDrag,
  MemoReplayData,
  MemoPickData,
  // DualPick replay types
  DualPickReplayData,
  DualPickDropData,
  TrackReplayData,
  TrackReplayTrialData,
  TrackReplayPlaybackSnapshot,
  // Interactive Replay
  InteractiveReplayEvent,
  RunScoreDelta,
} from './engine';
// =============================================================================
// Session Report (unified end-of-game reports)
// =============================================================================
export type {
  ContextualMessage,
  ContextualMessageData,
  TranslatableMessage,
  DualPickDetails,
  ErrorProfile,
  PlaceDetails,
  PlaceTurnDetail,
  JourneyContext,
  LibreDetails,
  MemoDetails,
  ModeScore,
  ModeSpecificDetails,
  NextStepRecommendation,
  PerformanceLevel,
  MemoWindowDetail,
  ReportGameMode,
  SessionEndReportModel,
  SimulatorDetails,
  SpeedStats,
  TempoConfidenceDebug,
  TempoDetails,
  TempoTrialDetail,
  TrackDetails,
  TrackTurnDetail,
  CognitiveTaskTrialDetail,
  CorsiTurnDetail,
  OspanSetDetail,
  OspanDetails,
  TraceDetails,
  TurnDetail,
  TurnErrorTag,
  TurnKind,
  TurnSummary,
  TurnVerdict,
  UnifiedModalityStats,
  UnifiedTotals,
} from './types/session-report';
// Removed: ospan (deleted game mode)
// Note: FocusStats (for session report) is exported from './ports' as part of stats-port
export {
  resolveJourneyPresentation,
  type JourneyPresentationModel,
  type JourneyPresentationRule,
  type JourneyPresentationText,
} from './domain/journey/presentation';
export {
  generateContextualMessageData,
  generateContextualMessage,
  generateContextualMessageEN,
  convertTempoSession,
  convertMemoSession,
  convertPlaceSession,
  convertDualPickSession,
  convertTraceSession,
  convertGenericSession,
  buildCurrentJourneyGuidanceContext,
  buildDualTrackJourneyDisplay,
  computeProgressionIndicatorModel,
  computeJaeggiExplanation,
  computeBrainWorkshopExplanation,
  resolveJourneyCompletion,
  type DualTrackJourneyDisplay,
  recommendNextLevelForTempo,
  recommendNextLevelFromPassed,
  recommendJourneyStage,
  type TempoSessionInput,
  type MemoSessionInput,
  type PlaceSessionInput,
  type PlaceModalityStatsInput,
  type DualPickSessionInput,
  type TraceSessionInput,
  type GenericSessionInput,
  type ModalityErrorInfo,
  type ProgressionExplanation,
  type JourneyCompletionState,
  type ProgressionIndicatorAction,
  type ProgressionIndicatorHeadline,
  type ProgressionIndicatorModel,
  type ProgressionIndicatorScope,
  type ProgressionIndicatorTone,
  type ProgressionMessageKind,
  type LevelRecommendation,
  type RecommendationDirection,
  type TempoLevelRecommendationInput,
  type JourneyStageRecommendation,
  type JourneyStageRecommendationInput,
} from './domain/report';
// =============================================================================
// Trajectory (for session replay)
// =============================================================================
export type {
  CompactTrajectory,
  TrajectoryPoint,
  RawTrajectoryPoint,
} from './types/trajectory';
export {
  encodeTrajectory,
  decodeTrajectory,
  interpolateTrajectory,
  getTrajectoryDuration,
  createTrajectorySampler,
  TRAJECTORY_SAMPLE_INTERVAL_MS,
} from './types/trajectory';
// =============================================================================
// Specs (Single Source of Truth for Game Modes)
// =============================================================================
export {
  // Thresholds (re-exported from specs)
  THRESHOLDS,
  // All Specs Registry
  AllSpecs,
  // Spec → BlockConfig helper (Phase 4/7: spec-first simplification)
  getBlockConfigFromSpec,
  // Tempo Specs
  DualCatchSpec,
  CustomModeSpec,
  DualnbackClassicSpec,
  SimBrainWorkshopSpec,
  TempoSpecs,
  // OSPAN Spec
  OspanSpec,
  OspanSpecs,
  // Removed: DualPlaceSpec, PlaceSpecs, PlaceSpec, DualMemoSpec, MemoSpecs, MemoSpec,
  // DualPickSpec, PickSpecs, DualTraceSpec, buildTraceSessionConfig (deleted game modes)
  // Tutorial Specs
  ClassicTutorialSpec,
  TutorialSpecs,
  getTutorialSpec,
  TUTORIAL_HUB_ORDER,
  // Modality UI Helpers
  getModalityFamily,
  getModalityColor,
  getModalityLabelInfo,
  getOptimalModalityLayout,
  isHexColor,
  // Control Configuration (Data-Driven Game Controls)
  MODALITY_SHORTCUTS,
  MODALITY_COLORS,
  MODALITY_LABEL_KEYS,
  getControlConfig,
  getControlConfigs,
  resolveModalityForKey,
  getModalitiesForKey,
  isGameControlKey,
  // Report Display Helpers (spec-driven)
  getModeDisplaySpec,
  getModeColors,
  getReportSections,
  getModeScoringStrategy,
  // Mode Name Helpers (SSOT for mode names)
  getModeI18nKey,
  getModeName,
  getAllModeIds,
  // Stats Specs (spec-driven stats page)
  getStatsSpec,
  GlobalStatsSpec,
  JourneyStatsSpec,
  DefaultStatsSpec,
  // App Metadata
  APP_VERSION,
  // Session Timing
  TIMING_ISI_PAUSE_SECONDS,
  // Storage Monitoring
  STORAGE_WARNING_THRESHOLD_PERCENT,
  STORAGE_CRITICAL_THRESHOLD_PERCENT,
  // Removed: TRAJECTORY_MAX_POINTS, TRAJECTORY_MAX_DURATION_MS, TRAJECTORY_WARNING_POINTS (deleted with trace mode)
  DUAL_TRACK_DNB_HYBRID_MODE_ID,
} from './specs';
export type {
  ModeSpec,
  ModeMetadataSpec,
  ModeId,
  ScoringSpec,
  ScoringStrategy as SpecScoringStrategy, // Renamed to avoid conflict with domain/scoring
  TimingSpec,
  GenerationSpec,
  SessionDefaultsSpec,
  AdaptivitySpec,
  SessionType,
  // Report types
  ReportSectionId,
  ModeReportSpec,
  // Extension types
  DualnbackClassicExtensions,
  BrainWorkshopExtensions,
  OspanExtensions,
  // Removed: PlaceExtensions, MemoExtensions, PickExtensions, PickSpec, TraceExtensions,
  // ArithmeticInterferenceConfig, TraceWritingMode, TraceRhythmMode (deleted game modes)
  // Tutorial types
  TutorialSpec,
  TutorialStepSpec,
  TutorialIntent,
  TutorialExitCondition,
  TutorialTimingConfig,
  TimelineSlotId,
  TutorialId,
  TutorialSpecId,
  ExpectedMatch,
  ExpectedSwipe,
  ExpectedClassification,
  ExpectedPlacement,
  ExpectedRecall,
  TutorialSlot,
  PositionClassification,
  SoundClassification,
  // Spotlight types
  SpotlightTarget,
  SpotlightPosition,
  SpotlightStepSpec,
  TutorialSpotlightConfig,
  // Modality UI Types
  ModalityFamily,
  ModalityLayout,
  ReportUISpec,
  ModalityLabelInfo,
  // Control Configuration Types
  ControlColor,
  ControlConfig,
  // Report Display Types (spec-driven)
  ReportDisplaySpec,
  ModeColorSpec,
  InsightMetricId,
  // Stats Section Types (spec-driven stats page)
  SimpleStatsSectionId,
  AdvancedStatsSectionId,
  ModeStatsSpec,
} from './specs';
// Spec Validation (Zod schemas for runtime checks)
export {
  ModeSpecSchema,
  validateModeSpec,
  safeValidateModeSpec,
  validateAllSpecs,
  validateSessionConfig,
  devValidateSpec,
  validateJudgeMatchesSpec,
  isThresholdReasonable,
  ModeMetadataSchema,
  TimingSpecSchema,
  ScoringSpecSchema,
  GenerationSpecSchema,
  SessionDefaultsSpecSchema,
  AdaptivitySpecSchema,
  ModeReportSpecSchema,
  type ValidatedModeSpec,
} from './specs/validation';
// =============================================================================
// Timing (abstract timer implementations)
// =============================================================================
export {
  // Factory
  createTimer,
  createTimerFromMode,
  createTimerForTrace,
  getTimingMode,
  rhythmModeToTimingMode,
  TIMING_MODE_KEY,
  // Implementations (for testing)
  IntervalTimer,
  SelfPacedTimer,
  RhythmicTimer,
  // Event loop lag measurement (for session health metrics)
  startLagSampler,
  stopLagSampler,
  getLastMeasuredLag,
  measureEventLoopLag,
  isLagSamplerRunning,
} from './timing';
export type {
  TimerPort,
  TimerConfig,
  TimingMode,
  WaitResult,
  RhythmicTimerConfig,
  TraceTimingConfig,
} from './timing';
// =============================================================================
// Judge (abstract trial evaluation)
// =============================================================================
export {
  // Factory
  createJudge,
  createJudgeFromConfig,
  getScoringStrategy,
  JUDGE_KEY,
  // Implementations (for testing)
  AccuracyJudge,
  SDTJudge,
  // Constants
  DEFAULT_SDT_FEEDBACK,
} from './judge';
export type {
  // Trial Judge
  TrialJudge,
  JudgeConfig,
  EvaluationContext,
  TrialResponse as JudgeTrialResponse, // Renamed to avoid conflict with coach/TrialResponse
  ModalityResponse as JudgeModalityResponse,
  // Verdict
  TrialVerdict as JudgeTrialVerdict, // Renamed to avoid conflict with domain/TrialVerdict
  ModalityVerdict as JudgeModalityVerdict,
  JudgeSummary,
  ModalitySummary,
  VerdictCounts,
  TrialResultType,
  FeedbackAction,
  FeedbackReaction,
  VisualFeedback,
  SoundFeedback,
} from './judge';
// =============================================================================
// Input (unified user input abstraction)
// =============================================================================
export {
  // Intent Builders
  Intents,
  // Type Guards
  isSessionControlIntention,
  isTempoIntention,
  isPlaceIntention,
  isMemoIntention,
  isTraceIntention,
  isCoachingIntention,
  // Intent Handler Helpers
  accepted,
  ignored,
  error,
} from './input';
export type {
  // GameIntention Types
  GameIntention,
  InputMethod,
  DragTrajectory as IntentDragTrajectory, // Renamed to avoid conflict
  TrajectoryPoint as IntentTrajectoryPoint, // Renamed to avoid conflict with types/trajectory
  StartIntention,
  StopIntention,
  PauseIntention,
  ResumeIntention,
  ClaimMatchIntention,
  ReleaseClaimIntention,
  MisfiredInputIntention,
  DeclareEnergyIntention,
  DropItemIntention,
  CancelDragIntention,
  AdvanceIntention,
  SelectValueIntention,
  ConfirmSelectionIntention,
  SwipeIntention,
  TapIntention,
  SkipIntention,
  WritingCompleteIntention,
  // Intent Handler
  IntentHandler,
  IntentResult,
} from './input';

// Session Recovery Types
export type {
  RecoveryModeId,
  SessionRecoverySnapshot,
  RecoveryCheckResult,
  RecoveredSessionState,
  // Tutorial Recovery
  TutorialRecoverySnapshot,
  TutorialRecoveryCheckResult,
  // Replay Recovery (ReplaySessionType already exported from ports)
  ReplayRecoverySnapshot,
  ReplayRecoveryCheckResult,
  RecoveredReplayState,
} from './types/recovery';

// Recovery Projector (for session recovery from events)
export { RecoveryProjector, ReplayRecoveryProjector } from './engine';
export type { RecoverableState } from './engine';

// =============================================================================
// Utils (mode normalization, helpers)
// =============================================================================
export { normalizeModeId } from './utils/mode-normalizer';

// =============================================================================
// Diagnostics (dev/debug tools)
// =============================================================================
export {
  analyzeAllSessionsFromEvents,
  analyzeSessionEvents,
} from './diagnostics/integrity';
export type {
  EventCounts,
  IntegrityCheck,
  IntegrityReport,
  IntegrityReportSummary,
  IntegrityStatus,
  RecalculatedStats,
} from './diagnostics/integrity';
