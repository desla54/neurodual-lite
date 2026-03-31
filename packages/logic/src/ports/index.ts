/**
 * Ports
 *
 * Interfaces for external dependencies.
 * Allows logic to be independent of infrastructure.
 */

export { isSyncPreset } from './audio-port';
export type { AudioConfig, AudioPort, AudioPreset } from './audio-port';
export type {
  AudioLifecycleEvent,
  AudioLifecyclePort,
  AudioLifecycleState,
  AudioLoadingProgress,
} from './audio-lifecycle-port';
export type { DevLoggerPort, SessionLogData } from './dev-logger-port';
export { NullDevLogger, nullDevLogger } from './dev-logger-port';
export type {
  HistoryModalityStats,
  HistoryPort,
  ImportResult,
  SessionEndReason,
  SessionHistoryExport,
  SessionHistoryItem,
  SessionHistoryItemJSON,
} from './history-port';
export { sessionSummaryRowToHistoryItem } from './history-port';
export type { ProfilePort } from './profile-port';
export type { ProgressionData, ProgressionPort } from './progression-port';
export type {
  AuthError,
  AuthPort,
  AuthResult,
  AuthSession,
  AuthState,
  AuthStateListener,
  AuthUser,
  SignInCredentials,
  SignUpCredentials,
  UserProfile as AuthUserProfile,
} from './auth-port';
export type {
  PaymentProvider,
  PlanType,
  Subscription,
  SubscriptionListener,
  SubscriptionPort,
  SubscriptionState,
  SubscriptionStatus,
} from './subscription-port';
export {
  calculateDaysRemaining,
  planHasCloudSync,
  planHasPremiumAccess,
  PREMIUM_N_THRESHOLD,
  DAILY_PLAYTIME_GRACE_DAYS,
  DAILY_PLAYTIME_GRACE_LIMIT_MS,
  DAILY_PLAYTIME_STANDARD_LIMIT_MS,
  FREE_TRIAL_DURATION_DAYS,
} from './subscription-port';
export type {
  SyncPort,
  SyncResult,
  SyncState,
  SyncStateListener,
  SyncStatus,
} from './sync-port';
export type {
  CustomerInfo,
  PaymentPort,
  PaymentStateListener,
  Product,
  ProductId,
  PurchaseResult,
} from './payment-port';
export type {
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
} from './license-port';
export { maskLicenseKey, createEmptyLicenseState } from './license-port';
export type { ClockPort } from './clock-port';
export { browserClock } from './clock-port';
export type { RandomPort } from './random-port';
export { cryptoRandom, createSeededRandom } from './random-port';
export type {
  AttemptResult,
  JourneyPort,
  JourneyRecordableSession,
} from './journey-port';

export type { OAuthCallbackPort, OAuthCodeExchangeResult } from './oauth-callback-port';
export type { EventReaderPort, EventReaderFactoryPort } from './event-reader-port';
export type { AdminHistoryMaintenancePort } from './admin-history-maintenance-port';
export type {
  AlgorithmStatePort,
  AlgorithmType,
  StoredAlgorithmState,
} from './algorithm-state-port';
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
  TimingStats as StatsTimingStats, // Renamed to avoid conflict with engine TimingStats
  ModalityTimingStats,
  PostErrorSlowingStats,
} from './stats-port';
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
} from './replay-port';
export type { SettingsPort, UserSettings, UISettings, SavedJourney } from './settings-port';
export type { ReplayInteractifPort } from './replay-interactif-port';
export type {
  InteractiveReplayLifecyclePort,
  InteractiveReplayLifecycleState,
  InteractiveReplaySpeed,
  InteractiveReplayInput,
  InteractiveReplayContext,
  InteractiveReplayMachineEvent,
  InteractiveReplayStateListener,
  InteractiveReplayContextListener,
} from './interactive-replay-lifecycle-port';
export type {
  RewardPort,
  RewardGrantResult,
  RewardState,
  RewardStateListener,
  PendingReward,
  GrantedReward,
} from './reward-port';
export type { XPContextPort, XPExternalContext } from './xp-context-port';
export { nullXPContextPort } from './xp-context-port';
export type {
  AppLifecyclePort,
  AppLifecycleState,
  InitializationProgress,
} from './app-lifecycle-port';
export type {
  PersistenceLifecyclePort,
  PersistenceLifecycleState,
} from './persistence-lifecycle-port';
export type {
  PlatformLifecycleSource,
  PlatformLifecycleEvent,
  PlatformLifecycleListener,
} from './platform-lifecycle-port';
export type { PlatformInfo, PlatformInfoPort } from './platform-info-port';
export type {
  GameSessionManagerPort,
  GameSessionManagerEvent,
  GameSessionManagerListener,
  ManagedSessionInfo,
  SessionLifecycleState,
  SessionMode,
  SpawnSessionOptions,
} from './game-session-manager-port';
export type {
  NetworkLifecyclePort,
  NetworkLifecycleEvent,
  NetworkState,
  NetworkStateListener,
  NetworkInfo,
  NetworkQuality,
} from './network-lifecycle-port';
export type {
  SessionEndPipelinePort,
  SessionEndPipelineInput,
  SessionEndPipelineEvent,
  PipelineState,
  PipelineStage,
  PersistedPipelineState,
} from './session-end-pipeline-port';
export { PIPELINE_STAGES, calculatePipelineProgress } from './session-end-pipeline-port';

export type {
  PipelineRecoveryStoragePort,
  CreateSessionPipelineOptions,
  SessionPipelineFactoryPort,
} from './session-pipeline-factory-port';

export type {
  PersistenceHealthPort,
  PersistenceHealthData,
  PowerSyncRuntimeHealth,
  ProjectionHealth,
} from './persistence-health-port';

export type { CommandBusPort } from './command-bus-port';
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
} from './persistence-port';
export type {
  HapticPort,
  HapticImpactStyle,
  HapticNotificationType,
} from './haptic-port';

export type {
  SessionRecoveryPort,
  CreateRecoverySnapshotParams,
} from './session-recovery-port';
export type {
  ReplayRecoveryPort,
  CreateReplayRecoverySnapshotParams,
} from './replay-recovery-port';
export type { TutorialRecoveryPort } from './tutorial-recovery-port';
export type { DiagnosticsPort, FreezeEvent, LongTaskEvent } from './diagnostics-port';
export type { SettingsSyncPort, SettingsSyncResult, SettingsData } from './settings-sync-port';
export type { DeepLinkPort, DeepLinkHandlerPort } from './deep-link-port';
export type { InfraProbePort } from './infra-probe-port';
export type { CursorPositionPort, CursorPosition } from './cursor-position-port';
export type { WakeLockPort } from './wakelock-port';

// Reactive read-models (infra-backed)
export type { Subscribable, Unsubscribe, ReadModelSnapshot } from './reactive';
export { combineSubscribables } from './combine-subscribables';
export { mapSubscribable } from './map-subscribable';
export type {
  ReadModelPort,
  ModalityFilterSet,
  NLevelFilterSet,
  ModeType,
  JourneyFilterType,
  FreeModeFilterType,
  SessionSummariesFilters,
  SessionSummariesCursor,
} from './read-model-port';
