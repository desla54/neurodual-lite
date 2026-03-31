/**
 * @neurodual/infra
 *
 * Services d'infrastructure (audio, storage, etc.)
 */

export type { AudioPreset, Language, Voice } from './audio/audio-service';
export { AudioService, audioService } from './audio/audio-service';
export { loadTone, getToneSync } from './audio/tone-loader';
export {
  audioLifecycleMachine,
  audioLifecycleAdapter,
  AudioLifecycleAdapter,
} from './audio/audio-lifecycle-machine';

// Handwriting Recognition (CNN TensorFlow.js)
export {
  CNNRecognizer,
  createCNNRecognizer,
  getSharedCNNRecognizer,
  isSharedCNNRecognizerReady,
  disposeSharedCNNRecognizer,
  DigitRecognizer,
  createDigitRecognizer,
  getSharedDigitRecognizer,
  isSharedDigitRecognizerReady,
  disposeSharedDigitRecognizer,
  DirectionRecognizer,
  getSharedDirectionRecognizer,
  type StrokePoint,
  type RecognitionResult,
  type DigitRecognitionResult,
  type DirectionStrokePoint,
  type DirectionRecognitionResult,
} from './recognizer';

// Database (SQLite - unified across platforms)
// Types only - implementation is internal
export type { EventInput, StoredEvent } from '@neurodual/logic';

// Emmett (strict command-based writes)
export type { AppendEvent, EmmettEventStore } from './es-emmett/powersync-emmett-event-store';
export {
  createStreamId,
  parseStreamId,
  streamIdToString,
  createEmmettEventStore,
} from './es-emmett/powersync-emmett-event-store';
export {
  ConcurrencyError,
  StreamNotFoundError,
  StreamAlreadyExistsError,
} from './es-emmett/errors';
export {
  EVENT_SCHEMA_VERSION,
  type EventStoreConfig,
  defaultEventStoreConfig,
} from './es-emmett/config';
export { createCommandBus } from './es-emmett/command-bus';

// Projections (read models from Emmett event store)
export {
  computeStreak,
  computeNLevel,
} from './projections/projection-manager';
export {
  toProjectedEvent,
  type ProjectionCatchUpReport,
} from './projections/projection-processor';
/** @deprecated Use getConfiguredProcessorEngine instead */
export {
  getProjectionProcessor,
  resetProjectionProcessor,
  type ProjectionProcessor,
} from './projections/projection-processor';
export type {
  ProjectedEvent,
  ProjectionDefinition,
} from './projections/projection-definition';
export {
  getConfiguredProcessorEngine,
  resetProcessorEngine,
  invalidateProcessorEngineCache,
  type ProcessorEngine,
} from './projections/configured-engine';
export {
  applyBaselineDirectly,
  applyProfileSessionDirectly,
  applyResetDirectly,
} from './projections/cognitive-profile-projection';
export {
  createStreakAdapter,
  type StreakAdapter,
  type StreakAdapterOptions,
} from './projections/streak-adapter';
export {
  createDailyActivityAdapter,
  type DailyActivityAdapter,
  type DailyActivityAdapterOptions,
} from './projections/daily-activity-adapter';
export {
  createInitialStreakState,
  evolveStreakState,
  evolveStreakStateFromEmmett,
  streakStateToInfo,
  getCurrentDate,
  type StreakState,
  type StreakCheckpoint,
} from './projections/streak-projection';
export {
  createInitialDailyActivityState,
  evolveDailyActivityState,
  evolveDailyActivityStateFromEmmett,
  getRecentActivity,
  getActivityForDate as getProjectionActivityForDate,
  getTotalSessions,
  type DailyActivityState,
  type DailyActivityCheckpoint,
  type DailyActivity,
} from './projections/daily-activity-projection';

// System event writer injection
export {
  setSystemEventWriterCommandBus,
  setSystemEventWriterPersistence,
} from './events/system-event-writer';

export { SessionEndWorkflowRunner } from './es-emmett/session-end-workflow-runner';

// Schema (Single Source of Truth for DB schema)
export { SQLITE_SCHEMA } from './db/sqlite-schema';
export {
  createDrizzleClient,
  type NeuroDualDrizzleDatabase,
  drizzleSchema,
  PowerSyncDrizzleAppSchema,
} from './db/drizzle';

// Storage Monitoring (IndexedDB quota)
export {
  checkStorageAndWarn,
  formatBytes,
  getStorageQuotaInfo,
  type StorageQuotaInfo,
} from './db/storage-monitor';

// Platform Detection & Persistent Storage
export { requestPersistentStorage, isCapacitorNative } from './db/platform-detector';
// Note: setupAudio was removed - audio is initialized via audioAdapter.init()

// Dev tools (no-op in production)
export { logSessionToDev } from './dev-logger';

// Logger (silent in production)
export { createLogger } from './logger';

// Persistence (SQLite)
export {
  deleteSessionEvents,
  getPersistencePort,
  setupPersistence,
  type PowerSyncPersistencePort,
} from './persistence/setup-persistence';
export { appendSystemEvents } from './events/system-event-writer';
export { createEventReader, type EventReader } from './events/event-reader';

// Adapters (implementations of logic ports)
export {
  audioAdapter,
  clockAdapter,
  createAdapters,
  createAdaptersAsync,
  createProgressionAdapter,
  createSeededRandom,
  createNoopInfraAdapters,
  devLoggerAdapter,
  randomAdapter,
} from './adapters';
export type { InfraAdapters, InfraPersistencePort } from './adapters';
export type { ProfileReadModel } from './read-models/profile-read-model';
export { createProfileReadModel } from './read-models/profile-read-model';
export type {
  JourneyReadModel,
  JourneyReadModelResult,
  NextJourneySession,
} from './read-models/journey-read-model';
export { createJourneyReadModel } from './read-models/journey-read-model';

// Factory functions for individual adapters (with injection)
export { createHistoryAdapter, setupHistoryPowerSyncWatch } from './history/history-adapter';
export {
  insertSessionSummaryFromEvent,
  rebuildAllSummaries,
  rebuildMissingSessionSummaries,
  repairDriftedSessionSummaries,
} from './history/history-projection';
export { SESSION_END_EVENT_TYPES } from '@neurodual/logic';
export {
  clearAuthTransitionMigrationMeta,
  runAuthTransitionHistoryMigration,
} from './history/history-migration';
export { runHistoryIntegrityDiagnostics } from './history/history-diagnostics';
export {
  runHistoryBigBangCutover,
  type HistoryBigBangCutoverReport,
} from './history/history-bigbang';
export { createProfileAdapter } from './profile/profile-adapter';
export { createSettingsAdapter } from './settings/settings-adapter';
export { createAlgorithmStateAdapter } from './algorithm-state/algorithm-state-adapter';

// Supabase (Auth, Subscriptions, Admin functions)
export {
  getSupabase,
  initSupabase,
  isSupabaseConfigured,
  supabaseAuthAdapter,
  setAuthSignOutCallback,
  supabaseSubscriptionAdapter,
  freeSubscriptionAdapter,
  // Admin functions (direct Supabase operations, not PowerSync)
  deleteAllUserData,
  cleanupOrphanSessions,
  forceFullResync,
  // No-op adapters for when Supabase is not configured
  noopAuthAdapter,
  noopSubscriptionAdapter,
  noopSyncAdapter,
  // Settings Sync
  pullSettings,
  pushSettings,
  syncSettings,
} from './supabase';
export type {
  Database,
  SettingsData,
  SettingsSyncResult,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './supabase';

// Payments (RevenueCat + Lemon Squeezy)
export {
  configureRevenueCat,
  revenueCatAdapter,
  type RevenueCatConfig,
  configureLemonSqueezy,
  lemonSqueezyAdapter,
  initLemonSqueezyAdapter,
  type LemonSqueezyConfig,
} from './payments';

// Journey (Training Path)
export { createJourneyAdapter } from './journey';

// Stats
export type {
  StatsFilters,
  ActivityStats,
  PerformanceStats,
  ModalityStatsRow,
  TimeSeriesPoint,
  SessionScorePoint,
  ModeScoreStats,
  ZoneStats,
} from './stats';

// Replay (session replay adapters)
export {
  createReplayAdapter,
  createReplayAdapterFromCommandBus,
  createReplayInteractifAdapter,
  interactiveReplayMachine,
  InteractiveReplayAdapter,
  createInteractiveReplayAdapter,
} from './replay';

// Stats Sharing (anonymous leaderboard stats)
export {
  submitSessionStats,
  buildStatsPayload,
  fetchPlayerStats,
  type SessionStatsPayload,
  type SubmitStatsResult,
  type PlayerStatsResult,
} from './stats-sharing';

// Rewards (XP-based Premium rewards)
export {
  rewardAdapter,
  createRewardAdapter,
  noopRewardAdapter,
  initRewardAdapter,
  resetRewardAdapter,
} from './rewards';

// XP Context (external context for XP calculation)
export { createXPContextAdapter } from './xp/xp-context-adapter';

// Lifecycle (Disposal & Session Recovery)
export {
  // Disposal Registry
  registerDisposal,
  unregisterDisposal,
  disposeAll,
  getDisposalCount,
  type DisposalCallback,
  // Session Recovery
  saveRecoverySnapshot,
  loadRecoverySnapshot,
  clearRecoverySnapshot,
  clearAllRecoveryData,
  checkForRecoverableSession,
  hasRecoverySnapshot,
  createRecoverySnapshot,
  installRecoveryHandlers,
  buildRecoveredState,
  // Tutorial Recovery (localStorage-based)
  saveTutorialRecoverySnapshot,
  loadTutorialRecoverySnapshot,
  clearTutorialRecoverySnapshot,
  checkForRecoverableTutorial,
  createTutorialRecoverySnapshot,
  // Replay Recovery (interactive correction mode)
  saveReplayRecoverySnapshot,
  loadReplayRecoverySnapshot,
  clearReplayRecoverySnapshot,
  checkForRecoverableReplay,
  hasReplayRecoverySnapshot,
  createReplayRecoverySnapshot,
  installReplayRecoveryHandlers,
  buildRecoveredReplayState,
  cleanupOrphanedRuns,
  // App Lifecycle Machine (XState)
  AppLifecycleAdapter,
  appMachine as appLifecycleMachine,
  type AppLifecycleInput,
  // Persistence Lifecycle Machine (XState)
  PersistenceLifecycleAdapter,
  persistenceMachine as persistenceLifecycleMachine,
  type PersistenceInput,
  createPersistenceAdapter,
  getPersistenceAdapter,
  resetPersistenceAdapter,
  // Platform Lifecycle Source (Web/Mobile abstraction)
  createPlatformLifecycleSource,
  WebPlatformLifecycleSource,
  MobilePlatformLifecycleSource,
  // Network Lifecycle Machine (XState)
  NetworkLifecycleAdapter,
  networkMachine as networkLifecycleMachine,
  getNetworkAdapter,
  resetNetworkAdapter,
  // Deep Link Handler (Mobile OAuth/reset-password)
  DeepLinkHandler,
  setupDeepLinkHandler,
} from './lifecycle';

// Local wipe (PowerSync + caches)
export { wipeLocalDeviceData } from './lifecycle/local-data-wipe';

// Pipeline (XState orchestration)
export {
  SessionEndPipelineAdapter,
  pipelineMachine as sessionEndPipelineMachine,
  type PipelineDependencies,
} from './pipeline';

// Session Manager
export {
  GameSessionManager,
  getSessionManager,
  resetSessionManager,
  type GameSessionManagerConfig,
  type PausableSession,
  type SessionFactory,
} from './session';

// Haptic (Vibration feedback)
export { hapticAdapter } from './haptic';

// Wake Lock (Keep screen awake during sessions)
export { wakeLockAdapter } from './wakelock';

// Platform Info (device + display)
export { createPlatformInfoPort } from './platform-info-port';

// Native Social Login (Google/Apple in-app sign-in on mobile)
export {
  initNativeSocialLogin,
  type NativeSocialLoginConfig,
} from './social-login/native-social-login';

// Diagnostics (Freeze detection & debugging)
export {
  startFreezeWatchdog,
  stopFreezeWatchdog,
  isWatchdogRunning,
  setWatchdogContext,
  clearWatchdogContext,
  withWatchdogContext,
  withWatchdogContextAsync,
  onFreeze,
  onLongTask,
  getFreezeHistory,
  enableLongTaskObserver,
  disableLongTaskObserver,
  installEventStoreFlushOnPageHide,
  collectDbDiagnostics,
  collectPowerSyncFreezeSnapshot,
  type FreezeEvent,
  type LongTaskEvent,
  type DbDiagnostics,
  type PowerSyncFreezeSnapshot,
} from './diagnostics';

// Ports adapters (for app-level DI)
export {
  sessionRecoveryAdapter,
  replayRecoveryAdapter,
  tutorialRecoveryAdapter,
  diagnosticsAdapter,
  settingsSyncAdapter,
  deepLinkAdapter,
  infraProbeAdapter,
  oauthCallbackAdapter,
  eventReaderFactoryAdapter,
  adminHistoryMaintenanceAdapter,
  sessionPipelineFactoryAdapter,
  persistenceHealthAdapter,
} from './ports';

// PowerSync (Real-time sync for emt_messages)
export {
  // Schema
  PowerSyncAppSchema,
  type PowerSyncDatabase,
  type PowerSyncEventRow,
  type PowerSyncEventSignalRow,
  // Database lifecycle
  openPowerSyncDatabase,
  initPowerSyncDatabase,
  connectPowerSyncDatabase,
  getPowerSyncDatabase,
  getPowerSyncRuntimeState,
  getPowerSyncDebugPort,
  isPowerSyncInitialized,
  closePowerSyncDatabase,
  disconnectPowerSync,
  reconnectPowerSync,
  recordPowerSyncLifecycleSignal,
  recordPowerSyncReconnectStart,
  recordPowerSyncReconnectResult,
  recordPowerSyncSyncGate,
  samplePowerSyncRuntimeMemory,
  // Connector
  getPowerSyncConnector,
  resetPowerSyncConnector,
  SupabasePowerSyncConnector,
  // Event watchers
  watchUserEvents,
  watchUserEventsByTypes,
  watchUserEventSignalsByTypes,
  watchSessionEvents,
  watchSessionEnded,
  getUserEvents,
  getSessionEvents,
  type EventWatchCallback,
  type EventSignalWatchCallback,
  // Sync adapter (implements SyncPort - replaces sync-service)
  powerSyncSyncAdapter,
  getPowerSyncSyncAdapter,
  resetPowerSyncSyncAdapter,
  startPowerSyncStatusWatcher,
  stopPowerSyncStatusWatcher,
  // Runtime policy helpers
  isLikelyFatalPowerSyncStorageError,
  markPowerSyncFallbackToIdb,
  readPowerSyncVfsPreference,
  writePowerSyncVfsPreference,
  clearPowerSyncVfsPreference,
} from './powersync';
