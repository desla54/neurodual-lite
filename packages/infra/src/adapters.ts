/**
 * Adapters
 *
 * Implementations of logic ports using infra services.
 * These adapters bridge the logic layer with infrastructure.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { EmmettEventStore } from './es-emmett/powersync-emmett-event-store';
import type {
  ActivityStats,
  AlgorithmStatePort,
  AudioPort,
  CommandBusPort,
  DevLoggerPort,
  DistributionStats,
  ErrorProfileStats,
  PlaceConfidenceStats,
  FocusStats,
  HistoryPort,
  JourneyPort,
  ModalityStatsRow,
  ModalityTimingStats,
  ModeBreakdown,
  ModeScoreStats,
  PerformanceStats,
  PersistencePort,
  PostErrorSlowingStats,
  ProgressionPort,
  ProfilePort,
  MemoConfidenceStats,
  ReadModelPort,
  SessionLogData,
  SessionScorePoint,
  SettingsPort,
  StatsPort,
  StatsTimingStats,
  TimeSeriesPoint,
  SyncPort,
  UPSStats,
  ZoneStats,
  JourneyState,
} from '@neurodual/logic';
import {
  ALTERNATING_JOURNEY_FIRST_MODE,
  browserClock,
  cryptoRandom,
  createSeededRandom,
  createEmptyJourneyState,
  createEmptyProfile,
  isSimulatorMode,
} from '@neurodual/logic';
import { audioService, type Voice, type Language } from './audio/audio-service';
import { createAlgorithmStateAdapter } from './algorithm-state/algorithm-state-adapter';
import { createHistoryAdapter } from './history/history-adapter';
import { createJourneyAdapter } from './journey/journey-adapter';
import { createProfileAdapter } from './profile/profile-adapter';
import { createProgressionAdapter } from './progression/progression-adapter';
import { createSettingsAdapter } from './settings/settings-adapter';
import { logSessionToDev } from './dev-logger';
import { createProfileReadModel, type ProfileReadModel } from './read-models/profile-read-model';
import { getWatchdogContext, withWatchdogContext } from './diagnostics/freeze-watchdog';
import { createPowerSyncReadModelAdapter } from './read-models/powersync-read-model-adapter';
import { createCommandBus } from './es-emmett/command-bus';
import { supabaseAuthAdapter } from './supabase';
import { safeJsonParse } from './db/sql-helpers';

// =============================================================================
// Infra-only Port Extension
// =============================================================================

/**
 * InfraPersistencePort extends PersistencePort with PowerSync-specific access.
 * Only used within infra layer (not exposed to logic).
 */
export interface InfraPersistencePort extends PersistencePort {
  getPowerSyncDb(): Promise<AbstractPowerSyncDatabase>;
  /**
   * Get the Emmett event store for indexed event reads.
   * Returns null if not yet initialized (during early startup).
   */
  getEventStore(): Promise<EmmettEventStore | null>;
}

// =============================================================================
// Audio Adapter
// =============================================================================

/**
 * AudioAdapter implements AudioPort using the audioService singleton.
 * Casts string types to strict Voice/Language types used internally.
 */
export const audioAdapter: AudioPort = {
  setConfig: (config) =>
    audioService.setConfig({
      ...(config.language && { language: config.language as Language }),
      ...(config.voice && { voice: config.voice as Voice }),
      ...(config.audioPreset && { audioPreset: config.audioPreset }),
      ...(config.pinkNoiseLevel !== undefined && { pinkNoiseLevel: config.pinkNoiseLevel }),
      ...(config.binauralCarrierHz !== undefined && {
        binauralCarrierHz: config.binauralCarrierHz,
      }),
    }),
  getConfig: () => audioService.getConfig(),
  init: () => audioService.init(),
  resume: () => audioService.resume(),
  play: (sound) => audioService.play(sound),
  playToneValue: (tone) => audioService.playToneValue(tone),
  schedule: (sound, delayMs, onSync, options) =>
    audioService.schedule(sound, delayMs, onSync, options),
  scheduleMultiple: (sounds, delayMs, onSync, options) =>
    audioService.scheduleMultiple(sounds, delayMs, onSync, options),
  scheduleOperation: (operation, delayMs) =>
    audioService.scheduleOperation(
      operation as 'add' | 'subtract' | 'multiply' | 'divide',
      delayMs,
    ),
  scheduleCallback: (delayMs, callback) => audioService.scheduleCallback(delayMs, callback),
  cancelCallback: (callbackId) => audioService.cancelCallback(callbackId),
  getCurrentTime: () => audioService.getCurrentTime(),
  stopAll: () => audioService.stopAll(),
  isReady: () => audioService.isReady(),
  // Sound effects
  playCorrect: () => audioService.playCorrect(),
  playIncorrect: () => audioService.playIncorrect(),
  playClick: () => audioService.playClick(),
  playSwipe: () => audioService.playSwipe(),
  playCountdownTick: (value) => audioService.playCountdownTick(value),
  // Volume
  getVolumeLevel: () => audioService.getVolumeLevel(),
};

// =============================================================================
// Dev Logger Adapter
// =============================================================================

/**
 * DevLoggerAdapter implements DevLoggerPort using logSessionToDev.
 */
export const devLoggerAdapter: DevLoggerPort = {
  logSession: (data: SessionLogData) => logSessionToDev(data),
};

// =============================================================================
// Progression Adapter
// =============================================================================

export { createProgressionAdapter } from './progression/progression-adapter';

// =============================================================================
// Clock & Random Adapters (re-exported from logic for convenience)
// =============================================================================

/**
 * Clock adapter using browser's performance.now() and Date.now()
 */
export { browserClock as clockAdapter };

/**
 * Random adapter using crypto.getRandomValues()
 */
export { cryptoRandom as randomAdapter };

/**
 * Factory for seeded random (for reproducibility in tests/replay)
 */
export { createSeededRandom };

// =============================================================================
// Adapters Factory (Injection-based - preferred for new code)
// =============================================================================

/**
 * All adapters created from a single PersistencePort.
 * Preferred over using individual singleton adapters.
 */
export interface InfraAdapters {
  history: HistoryPort;
  journey: JourneyPort;
  profile: ProfilePort;
  progression: ProgressionPort;
  readModels: ReadModelPort;
  profileReadModel: ProfileReadModel;
  stats: StatsPort;
  settings: SettingsPort;
  algorithmState: AlgorithmStatePort;
  commandBus: CommandBusPort;
}

export interface CreateAdaptersOptions {
  /**
   * Optional SyncPort for opportunistic sync (e.g. after deleting a session).
   * Errors are ignored since background sync will catch up later.
   */
  syncPort?: SyncPort;
}

function getReadModelUserIds(userId: string | null): string[] {
  return userId ? [userId, 'local'] : ['local'];
}

function createEmptyProjectedJourneyState(config: {
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
}) {
  const empty = createEmptyJourneyState(
    config.targetLevel,
    config.startLevel,
    isSimulatorMode(config.gameMode),
  );
  if (config.gameMode === 'dual-track-dnb-hybrid') {
    empty.nextSessionGameMode = ALTERNATING_JOURNEY_FIRST_MODE;
  }
  return empty;
}

async function readProjectedJourneyState(
  persistence: InfraPersistencePort,
  config: {
    readonly journeyId: string;
    readonly startLevel: number;
    readonly targetLevel: number;
    readonly gameMode?: string;
  },
  userId: string | null,
) {
  const journeyId = config.journeyId.trim();
  const empty = createEmptyProjectedJourneyState(config);
  if (journeyId.length === 0) return empty;

  const db = await persistence.getPowerSyncDb();
  const effectiveUserIds = getReadModelUserIds(userId);
  const placeholders = effectiveUserIds.map(() => '?').join(', ');
  const preferredUserId = userId ?? 'local';
  const row = await db.getOptional<{ state_json: string | null }>(
    `SELECT state_json
       FROM journey_state_projection
      WHERE journey_id = ?
        AND user_id IN (${placeholders})
      ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
    [journeyId, ...effectiveUserIds, preferredUserId],
  );

  if (!row?.state_json) return empty;

  return safeJsonParse<JourneyState>(row.state_json, empty);
}

async function yieldToMain(): Promise<void> {
  // Use MessageChannel for fastest yield, falling back to RAF then setTimeout
  // MessageChannel is not throttled like RAF during page load
  if (typeof MessageChannel !== 'undefined') {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
    return;
  }
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createLazyStatsAdapter(persistence: PersistencePort): StatsPort {
  let innerPromise: Promise<StatsPort> | null = null;

  const getInner = async (): Promise<StatsPort> => {
    innerPromise ??= import('./stats/stats-adapter').then((mod) =>
      mod.createStatsAdapter(persistence),
    );
    return innerPromise;
  };

  const call = async <T>(fn: (inner: StatsPort) => Promise<T>): Promise<T> => fn(await getInner());

  return {
    getActivityStats: (filters) => call((inner) => inner.getActivityStats(filters)),
    getPerformanceStats: (filters) => call((inner) => inner.getPerformanceStats(filters)),
    getModalityStats: (filters) => call((inner) => inner.getModalityStats(filters)),
    getTimeSeries: (filters) => call((inner) => inner.getTimeSeries(filters)),
    getSessionScoreSeries: (filters) =>
      call((inner) => inner.getSessionScoreSeries?.(filters) ?? Promise.resolve([])),
    getModeScore: (filters) => call((inner) => inner.getModeScore(filters)),
    getZoneStats: (filters) => call((inner) => inner.getZoneStats(filters)),
    getDistributionStats: (filters) => call((inner) => inner.getDistributionStats(filters)),
    getModeBreakdown: (filters) => call((inner) => inner.getModeBreakdown(filters)),
    getFocusStats: (filters) => call((inner) => inner.getFocusStats(filters)),
    getTimingStats: (filters) => call((inner) => inner.getTimingStats(filters)),
    getModalityTimingStats: (filters) => call((inner) => inner.getModalityTimingStats(filters)),
    getPostErrorSlowingStats: (filters) => call((inner) => inner.getPostErrorSlowingStats(filters)),
    getErrorProfileStats: (filters) => call((inner) => inner.getErrorProfileStats(filters)),
    getUPSStats: (filters) => call((inner) => inner.getUPSStats(filters)),
    getPlaceConfidenceStats: (filters) => call((inner) => inner.getPlaceConfidenceStats(filters)),
    getMemoConfidenceStats: (filters) => call((inner) => inner.getMemoConfidenceStats(filters)),
    getAvailableInputMethods: (filters) => call((inner) => inner.getAvailableInputMethods(filters)),
  };
}

/**
 * Create all adapters with explicit persistence injection.
 * This is the preferred way to create adapters for new code.
 *
 * @example
 * ```ts
 * const persistence = await setupPersistence();
 * const adapters = createAdapters(persistence);
 *
 * // Use in providers
 * <HistoryProvider adapter={adapters.history}>
 *   <ProfileProvider adapter={adapters.profile}>
 *     <App />
 *   </ProfileProvider>
 * </HistoryProvider>
 * ```
 */
export function createAdapters(
  persistence: InfraPersistencePort,
  options?: CreateAdaptersOptions,
): InfraAdapters {
  const getActiveReadModelUserId = (): string | null => {
    const authState = supabaseAuthAdapter.getState();
    return authState.status === 'authenticated' ? authState.session.user.id : null;
  };

  // Create a lazy eventStore wrapper that defers getEventStore() until first readStream call
  const lazyEventStore = {
    readStream: async (args: {
      streamId: { aggregateType: string; aggregateId: string };
      fromVersion?: bigint;
      maxCount?: bigint;
    }) => {
      const eventStore = await persistence.getEventStore();
      if (!eventStore) {
        // Return empty result if eventStore not available (fallback to SQL in history-adapter)
        return {
          currentStreamVersion: 0n,
          streamExists: false,
          events: [],
        };
      }
      return eventStore.readStream(args);
    },
  };

  const history = createHistoryAdapter(persistence, {
    syncPort: options?.syncPort,
    eventStore: lazyEventStore,
  });
  const readModels = createPowerSyncReadModelAdapter();
  return {
    history,
    journey: createJourneyAdapter(history, {
      getProjectedState: async (config) =>
        readProjectedJourneyState(persistence, config, getActiveReadModelUserId()),
    }),
    profile: createProfileAdapter(persistence),
    progression: createProgressionAdapter(persistence),
    readModels,
    profileReadModel: createProfileReadModel(readModels),
    stats: createLazyStatsAdapter(persistence),
    settings: createSettingsAdapter(persistence),
    algorithmState: createAlgorithmStateAdapter(persistence),
    commandBus: createCommandBus(persistence),
  };
}

/**
 * Async version of createAdapters that yields between adapter creations.
 * This helps avoid long main-thread blocks during startup on slower devices.
 */
export async function createAdaptersAsync(
  persistence: InfraPersistencePort,
  options?: CreateAdaptersOptions,
): Promise<InfraAdapters> {
  const getActiveReadModelUserId = (): string | null => {
    const authState = supabaseAuthAdapter.getState();
    return authState.status === 'authenticated' ? authState.session.user.id : null;
  };

  const baseContext = getWatchdogContext() ?? 'createAdapters';

  // Granular timing for debugging freezes - logs if any step takes > 100ms
  const timings: { name: string; duration: number }[] = [];
  const timedCreate = <T>(name: string, fn: () => T): T => {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    timings.push({ name, duration });
    if (duration > 100) {
      console.warn(`[Adapters] ⚠️ ${name} took ${duration.toFixed(0)}ms`);
    }
    return result;
  };

  const step = <T>(name: string, fn: () => T): T => {
    // Important: context must NOT span an `await yieldToMain()`, otherwise any unrelated long task
    // that runs while awaiting the yield will be misattributed to the previous step.
    return withWatchdogContext(`${baseContext}:${name}`, () => timedCreate(name, fn));
  };

  // Create a lazy eventStore wrapper that defers getEventStore() until first readStream call
  const lazyEventStore = {
    readStream: async (args: {
      streamId: { aggregateType: string; aggregateId: string };
      fromVersion?: bigint;
      maxCount?: bigint;
    }) => {
      const eventStore = await persistence.getEventStore();
      if (!eventStore) {
        // Return empty result if eventStore not available (fallback to SQL in history-adapter)
        return {
          currentStreamVersion: 0n,
          streamExists: false,
          events: [],
        };
      }
      return eventStore.readStream(args);
    },
  };

  const history = step('createHistoryAdapter', () =>
    createHistoryAdapter(persistence, {
      syncPort: options?.syncPort,
      eventStore: lazyEventStore,
    }),
  );
  await yieldToMain();

  const readModels = step('createReadModelsAdapter', () => createPowerSyncReadModelAdapter());
  await yieldToMain();

  const journey = step('createJourneyAdapter', () =>
    createJourneyAdapter(history, {
      getProjectedState: async (config) =>
        readProjectedJourneyState(persistence, config, getActiveReadModelUserId()),
    }),
  );
  await yieldToMain();

  const profile = step('createProfileAdapter', () => createProfileAdapter(persistence));
  await yieldToMain();

  const progression = step('createProgressionAdapter', () => createProgressionAdapter(persistence));
  await yieldToMain();

  const stats = step('createLazyStatsAdapter', () => createLazyStatsAdapter(persistence));
  await yieldToMain();

  const settings = step('createSettingsAdapter', () => createSettingsAdapter(persistence));
  await yieldToMain();

  const algorithmState = step('createAlgorithmStateAdapter', () =>
    createAlgorithmStateAdapter(persistence),
  );

  // Log total if any adapter was slow
  const total = timings.reduce((sum, t) => sum + t.duration, 0);
  if (total > 200) {
    console.warn(
      `[Adapters] Total creation time: ${total.toFixed(0)}ms`,
      timings.map((t) => `${t.name}: ${t.duration.toFixed(0)}ms`).join(', '),
    );
  }

  return {
    history,
    journey,
    profile,
    progression,
    readModels,
    profileReadModel: createProfileReadModel(readModels),
    stats,
    settings,
    algorithmState,
    commandBus: createCommandBus(persistence),
  };
}

// =============================================================================
// Noop Adapters Factory (for immediate render before SQLite is ready)
// =============================================================================

const NOOP_USER_ID = 'noop-user';

/**
 * Create placeholder adapters that return empty/default values.
 * These allow the UI to render immediately while SQLite initializes.
 * They will be replaced with real adapters once persistence is ready.
 *
 * @example
 * ```ts
 * const adaptersRef = useRef<InfraAdapters>(createNoopInfraAdapters());
 * // Later when persistence is ready:
 * adaptersRef.current = createAdapters(persistence);
 * ```
 */
export function createNoopInfraAdapters(): InfraAdapters {
  const noopHistory: HistoryPort = {
    getSessions: async () => [],
    deleteSession: async () => {},
    deleteSessions: async () => {},
    exportSessions: async () => ({
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      sessions: [],
    }),
    importSessions: async () => ({ imported: 0, updated: 0, skipped: 0, errors: [] }),
    getReport: async () => null,
    getSessionEvents: async () => [],
    // Noop should NOT be considered ready: it indicates persistence/read-models are not wired yet.
    isReady: () => false,
    setReady: () => {},
  };

  const noopJourney: JourneyPort = {
    getJourneyState: async () => createEmptyJourneyState(),
    recordAttempt: async () => ({
      isValidating: false,
      score: 0,
      strategy: 'balanced' as const,
      totalValidatingSessions: 0,
      sessionsRemaining: 1,
      stageCompleted: false,
      nextStageUnlocked: null,
      nextPlayableStage: null,
    }),
    getStageDefinition: () => undefined,
    getCurrentStageDefinition: async () => null,
  };

  const emptyProfile = createEmptyProfile(NOOP_USER_ID);
  const noopProfile: ProfilePort = {
    getProfile: async () => emptyProfile,
  };

  const noopProgression: ProgressionPort = {
    getProgression: async () => null,
    getBadges: async () => [],
    hasBadge: async () => false,
  };

  // Empty stats defaults
  const emptyActivityStats: ActivityStats = {
    sessionsCount: 0,
    totalPlayTimeMs: 0,
    avgSessionDurationMs: 0,
    activeDays: 0,
  };

  const emptyPerformanceStats: PerformanceStats = {
    currentNLevel: 1,
    maxNLevel: 1,
    unifiedAccuracy: 0,
    upsScore: 0,
  };

  const emptyModeScoreStats: ModeScoreStats = { last: null, avg: null, best: null, worst: null };
  const emptyDistributionStats: DistributionStats = {
    upsStdDev: 0,
    upsPercentiles: { p25: 0, p50: 0, p75: 0 },
    durationPercentiles: { p25: 0, p50: 0, p75: 0 },
    upsBuckets: [],
  };
  const emptyFocusStats: FocusStats = { focusLostCount: 0, focusLostTotalMs: 0 };
  const emptyTimingStats: StatsTimingStats = {
    avgResponseTimeMs: null,
    medianResponseTimeMs: null,
    medianResponseTimeDuringStimulusMs: null,
    medianResponseTimeAfterStimulusMs: null,
    medianResponseTimeAfterStimulusOffsetMs: null,
    minResponseTimeMs: null,
    maxResponseTimeMs: null,
    p25ResponseTimeMs: null,
    p75ResponseTimeMs: null,
    avgISIMs: null,
    avgStimulusDurationMs: null,
    responsesDuringStimulus: 0,
    responsesAfterStimulus: 0,
    responseCount: 0,
  };
  const emptyErrorProfileStats: ErrorProfileStats = {
    errorRate: 0,
    missShare: null,
    faShare: null,
    totalHits: 0,
    totalMisses: 0,
    totalFalseAlarms: 0,
    totalCorrectRejections: 0,
  };
  const emptyUPSStats: UPSStats = { upsScore: 0, upsScoreLast: null, upsScoreBest: null };
  const emptyPlaceConfidenceStats: PlaceConfidenceStats = {
    confidenceScoreAvg: null,
    confidenceScoreLast: null,
    directnessRatioAvg: null,
    wrongSlotDwellMsTotal: null,
  };
  const emptyMemoConfidenceStats: MemoConfidenceStats = {
    confidenceScoreAvg: null,
    confidenceScoreLast: null,
    fluencyScoreAvg: null,
    fluencyScoreLast: null,
    correctionsCountTotal: null,
  };

  const noopStats: InfraAdapters['stats'] = {
    getActivityStats: async (): Promise<ActivityStats> => emptyActivityStats,
    getPerformanceStats: async (): Promise<PerformanceStats> => emptyPerformanceStats,
    getModalityStats: async (): Promise<ModalityStatsRow[]> => [],
    getTimeSeries: async (): Promise<TimeSeriesPoint[]> => [],
    getSessionScoreSeries: async (): Promise<SessionScorePoint[]> => [],
    getModeScore: async (): Promise<ModeScoreStats> => emptyModeScoreStats,
    getZoneStats: async (): Promise<ZoneStats | null> => null,
    getDistributionStats: async (): Promise<DistributionStats> => emptyDistributionStats,
    getModeBreakdown: async (): Promise<ModeBreakdown[]> => [],
    getFocusStats: async (): Promise<FocusStats> => emptyFocusStats,
    getTimingStats: async (): Promise<StatsTimingStats> => emptyTimingStats,
    getModalityTimingStats: async (): Promise<ModalityTimingStats[]> => [],
    getPostErrorSlowingStats: async (): Promise<PostErrorSlowingStats[]> => [],
    getErrorProfileStats: async (): Promise<ErrorProfileStats> => emptyErrorProfileStats,
    getUPSStats: async (): Promise<UPSStats> => emptyUPSStats,
    getPlaceConfidenceStats: async (): Promise<PlaceConfidenceStats> => emptyPlaceConfidenceStats,
    getMemoConfidenceStats: async (): Promise<MemoConfidenceStats> => emptyMemoConfidenceStats,
    getAvailableInputMethods: async () => [],
  };

  const noopSettings: SettingsPort = {
    getSettings: async () => null,
    saveSettings: async () => {},
  };

  const noopAlgorithmState: AlgorithmStatePort = {
    loadState: async () => null,
    saveState: async () => {},
    clearStates: async () => {},
  };

  // NOTE: Subscribable.getSnapshot() MUST be referentially stable unless data changes.
  // Returning a new object on every call will cause useSyncExternalStore infinite re-renders.
  const staticStore = <T>(snapshot: T) => ({
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  });
  const emptyRowsSnapshot = {
    data: [] as unknown[],
    // While using noop adapters, we are effectively waiting for SQLite/PowerSync init.
    isPending: true,
    error: null as string | null,
  };
  const emptyRowsStore = staticStore(emptyRowsSnapshot);
  const countRowsSnapshot = {
    data: [{ count: 0 }] as unknown[],
    isPending: true,
    error: null as string | null,
  };
  const countRowsStore = staticStore(countRowsSnapshot);
  const headerCountsSnapshot = {
    data: [{ filtered_count: 0, total_count: 0 }] as unknown[],
    isPending: true,
    error: null as string | null,
  };
  const headerCountsStore = staticStore(headerCountsSnapshot);
  const maxLevelSnapshot = {
    data: [{ max_level: null }] as unknown[],
    isPending: true,
    error: null as string | null,
  };
  const maxLevelStore = staticStore(maxLevelSnapshot);

  const noopReadModels: ReadModelPort = {
    journeyState: (config, _userId) => {
      const isSimulator = isSimulatorMode(config.gameMode);
      const state = createEmptyJourneyState(config.targetLevel, config.startLevel, isSimulator);
      const snapshot = { data: state, isPending: false, error: null };
      return {
        subscribe: () => () => {},
        getSnapshot: () => snapshot,
      };
    },

    profileSummary: () => emptyRowsStore,
    profileLatestSession: () => emptyRowsStore,
    profileSessionDays: () => emptyRowsStore,
    trainingDailyTotals: () => emptyRowsStore,
    profileProgression: () => emptyRowsStore,
    profileModalitySource: () => emptyRowsStore,
    profileStreak: () => emptyRowsStore,

    progressionSummary: () => emptyRowsStore,
    progressionUninterruptedStreak: () => emptyRowsStore,
    badgesUnlocked: () => emptyRowsStore,
    modeQuickStats: () => emptyRowsStore,
    lastPlayedMode: () => emptyRowsStore,

    replayRuns: () => emptyRowsStore,

    historyJourneyRecordableSessions: () => emptyRowsStore,
    historyAvailableJourneyIds: () => emptyRowsStore,
    historySessionSummariesFilteredCount: () => countRowsStore,
    historySessionSummariesFilteredIds: () => emptyRowsStore,
    historySessionSummariesPage: () => emptyRowsStore,
    historySessionSummariesHeaderCounts: () => headerCountsStore,
    historySessionSummariesCount: () => countRowsStore,
    historySessionSummariesIds: () => emptyRowsStore,
    historyMaxAchievedLevelForMode: () => maxLevelStore,
    historySessionsList: () => emptyRowsStore,
    historySessionDetails: () => emptyRowsStore,
    historySessionSummaries: () => emptyRowsStore,
    historyLastAdaptiveDPrime: () => emptyRowsStore,
    historyRecentSessionsForTrend: () => emptyRowsStore,
    historySessionsByGameMode: () => emptyRowsStore,
    historyJourneySessions: () => emptyRowsStore,
    historyLatestJourneySession: () => emptyRowsStore,
    historyBrainWorkshopStrikes: () => emptyRowsStore,

    adminRecentSessionHealth: () => emptyRowsStore,
  };

  return {
    history: noopHistory,
    journey: noopJourney,
    profile: noopProfile,
    progression: noopProgression,
    readModels: noopReadModels,
    profileReadModel: createProfileReadModel(noopReadModels),
    stats: noopStats,
    settings: noopSettings,
    algorithmState: noopAlgorithmState,
    // No persistence available here by design.
    // This is only used before SQLite is ready; command bus writes are not allowed.
    commandBus: {
      handle: async () => {
        throw new Error('[Adapters] Command bus not available before persistence init');
      },
    },
  };
}
