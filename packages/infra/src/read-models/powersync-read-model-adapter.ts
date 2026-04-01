import type { AbstractPowerSyncDatabase, QueryParam } from '@powersync/web';

import type {
  JourneyConfig,
  JourneyState,
  SessionSummariesCursor,
  SessionSummariesFilters,
  ReadModelPort,
  ReadModelSnapshot,
  Subscribable,
} from '@neurodual/logic';

import { getPowerSyncDatabase, isPowerSyncInitialized, openPowerSyncDatabase } from '../powersync';
import { withWatchdogContext } from '../diagnostics/freeze-watchdog';
import {
  buildAvailableJourneyIdsCompiledQuery,
  buildBrainWorkshopStrikesCompiledQuery,
  buildJourneyRecordableSessionsCompiledQuery,
  buildJourneySessionsCompiledQuery,
  buildLatestJourneySessionCompiledQuery,
  buildLastAdaptiveDPrimeCompiledQuery,
  buildLatestStatsGameModeCompiledQuery,
  buildMaxAchievedLevelCompiledQuery,
  buildRecentSessionsForTrendCompiledQuery,
  buildSessionDetailsCompiledQuery,
  buildSessionSummariesCompiledQuery,
  buildSessionSummariesCountCompiledQuery,
  buildSessionSummariesFilteredCountCompiledQuery,
  buildSessionSummariesFilteredIdsCompiledQuery,
  buildSessionSummariesHeaderCountsCompiledQuery,
  buildSessionSummariesIdsCompiledQuery,
  buildSessionSummariesPageCompiledQuery,
  buildSessionsByGameModeCompiledQuery,
  buildSessionsListCompiledQuery,
  type CompiledSqlQuery,
} from './history-queries';
// Legacy emt_messages SQL helpers removed — all event reads now go through
// session_events.events_json (parsed in JS) or session_summaries (pre-aggregated).
type Listener = () => void;
type RafWindow = typeof window & {
  requestAnimationFrame?: (cb: (timestamp: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
};

const READ_MODEL_WATCH_WARN_MS = 100;
const READ_MODEL_WATCH_DEBUG_KEY = '__neurodual_read_model_watch_debug__';

export interface ReadModelWatchStoreDebug {
  readonly name: string;
  readonly started: boolean;
  readonly listenerCount: number;
  readonly emitScheduled: boolean;
  readonly onDataCount: number;
  readonly onErrorCount: number;
  readonly stateChangeCount: number;
  readonly lastRowCount: number;
  readonly lastOnDataAt: string | null;
  readonly lastMapDurationMs: number | null;
  readonly lastEmitDurationMs: number | null;
  readonly lastEmitAt: string | null;
  readonly lastError: string | null;
}

export interface ReadModelWatchDebugSnapshot {
  readonly activeStores: number;
  readonly activeListeners: number;
  readonly queuedEmitCount: number;
  readonly lastSlowOperation: {
    readonly label: string;
    readonly durationMs: number;
    readonly at: string;
  } | null;
  readonly stores: readonly ReadModelWatchStoreDebug[];
}

type MutableReadModelWatchStoreDebug = {
  name: string;
  started: boolean;
  listenerCount: number;
  emitScheduled: boolean;
  onDataCount: number;
  onErrorCount: number;
  stateChangeCount: number;
  lastRowCount: number;
  lastOnDataAt: string | null;
  lastMapDurationMs: number | null;
  lastEmitDurationMs: number | null;
  lastEmitAt: string | null;
  lastError: string | null;
};

type ReadModelWatchDebugRegistry = {
  stores: Map<string, MutableReadModelWatchStoreDebug>;
  lastSlowOperation: ReadModelWatchDebugSnapshot['lastSlowOperation'];
};

function getReadModelWatchDebugRegistry(): ReadModelWatchDebugRegistry {
  const root = globalThis as typeof globalThis & {
    __neurodual_read_model_watch_debug__?: ReadModelWatchDebugRegistry;
  };

  if (!root[READ_MODEL_WATCH_DEBUG_KEY]) {
    root[READ_MODEL_WATCH_DEBUG_KEY] = {
      stores: new Map(),
      lastSlowOperation: null,
    };
  }

  return root[READ_MODEL_WATCH_DEBUG_KEY] as ReadModelWatchDebugRegistry;
}

function ensureStoreDebugEntry(name: string): MutableReadModelWatchStoreDebug {
  const registry = getReadModelWatchDebugRegistry();
  let entry = registry.stores.get(name);
  if (!entry) {
    entry = {
      name,
      started: false,
      listenerCount: 0,
      emitScheduled: false,
      onDataCount: 0,
      onErrorCount: 0,
      stateChangeCount: 0,
      lastRowCount: 0,
      lastOnDataAt: null,
      lastMapDurationMs: null,
      lastEmitDurationMs: null,
      lastEmitAt: null,
      lastError: null,
    };
    registry.stores.set(name, entry);
  }
  return entry;
}

function updateStoreDebug(
  name: string,
  mutate: (entry: MutableReadModelWatchStoreDebug) => void,
): void {
  mutate(ensureStoreDebugEntry(name));
}

function removeStoreDebug(name: string): void {
  getReadModelWatchDebugRegistry().stores.delete(name);
}

function recordSlowReadModelOperation(label: string, durationMs: number): void {
  getReadModelWatchDebugRegistry().lastSlowOperation = {
    label,
    durationMs,
    at: new Date().toISOString(),
  };
}

export function getReadModelWatchDebugSnapshot(): ReadModelWatchDebugSnapshot {
  const registry = getReadModelWatchDebugRegistry();
  const stores = Array.from(registry.stores.values()).map((entry) => ({ ...entry }));
  stores.sort((a, b) => {
    if (b.listenerCount !== a.listenerCount) {
      return b.listenerCount - a.listenerCount;
    }
    const aCost = Math.max(a.lastMapDurationMs ?? 0, a.lastEmitDurationMs ?? 0);
    const bCost = Math.max(b.lastMapDurationMs ?? 0, b.lastEmitDurationMs ?? 0);
    return bCost - aCost;
  });

  return {
    activeStores: stores.filter((store) => store.started).length,
    activeListeners: stores.reduce((sum, store) => sum + store.listenerCount, 0),
    queuedEmitCount: queuedWatchEmits.size,
    lastSlowOperation: registry.lastSlowOperation,
    stores,
  };
}

const queuedWatchEmits = new Set<() => void>();
let watchEmitFlushScheduled = false;
let watchEmitFlushRafId: number | null = null;
let watchEmitFlushTimeoutId: ReturnType<typeof setTimeout> | null = null;

function flushQueuedWatchEmits(): void {
  watchEmitFlushScheduled = false;
  watchEmitFlushRafId = null;
  watchEmitFlushTimeoutId = null;

  if (queuedWatchEmits.size === 0) return;

  const callbacks = Array.from(queuedWatchEmits);
  queuedWatchEmits.clear();

  withWatchdogContext(`ReadModelWatch.flush(count=${callbacks.length})`, () => {
    for (const callback of callbacks) {
      callback();
    }
  });
}

function scheduleQueuedWatchEmit(callback: () => void): void {
  queuedWatchEmits.add(callback);
  if (watchEmitFlushScheduled) return;

  watchEmitFlushScheduled = true;

  const win = (typeof window !== 'undefined' ? window : undefined) as RafWindow | undefined;
  if (win?.requestAnimationFrame) {
    watchEmitFlushRafId = win.requestAnimationFrame(() => {
      flushQueuedWatchEmits();
    });
    return;
  }

  watchEmitFlushTimeoutId = setTimeout(() => {
    flushQueuedWatchEmits();
  }, 0);
}

function cancelQueuedWatchEmit(callback: () => void): void {
  queuedWatchEmits.delete(callback);

  if (queuedWatchEmits.size > 0) {
    return;
  }

  const win = (typeof window !== 'undefined' ? window : undefined) as RafWindow | undefined;
  if (watchEmitFlushRafId !== null && win?.cancelAnimationFrame) {
    win.cancelAnimationFrame(watchEmitFlushRafId);
  }
  if (watchEmitFlushTimeoutId !== null) {
    clearTimeout(watchEmitFlushTimeoutId);
  }
  watchEmitFlushRafId = null;
  watchEmitFlushTimeoutId = null;
  watchEmitFlushScheduled = false;
}

function timeSyncOperation<T>(label: string, fn: () => T): T {
  const start =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const result = withWatchdogContext(label, fn);
  const end =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const durationMs = end - start;
  if (durationMs >= READ_MODEL_WATCH_WARN_MS) {
    recordSlowReadModelOperation(label, durationMs);
    console.warn(`[ReadModelWatch] ${label} took ${Math.round(durationMs)}ms`);
  }
  return result;
}

function createStaticSubscribable<T>(value: T): Subscribable<T> {
  return {
    subscribe: () => () => {},
    getSnapshot: () => value,
  };
}

function userScopeClause(userId: string | null): { clause: string; params: string[] } {
  const userIds = userIdsWithLocal(userId);
  if (userIds.length === 1) {
    return {
      clause: `user_id = ?`,
      params: userIds,
    };
  }
  return {
    clause: `user_id IN (${userIds.map(() => '?').join(', ')})`,
    params: userIds,
  };
}

function extractRows<Row>(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  // PowerSync WatchedQuery has returned different shapes across SDK/runtime versions.
  // Support both the "rows array" and the legacy execute-like { rows: { _array } } shape.
  const nested = (value as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array;
  return Array.isArray(nested) ? (nested as Row[]) : [];
}

function isUnknownWatchedQueryPayload(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return false;
  const nested = (value as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array;
  if (Array.isArray(nested)) return false;
  return true;
}

function createRowArrayComparator<Row>(options: {
  keyBy: (row: Row) => string;
  compareBy: (row: Row) => string;
}): (current: unknown, previous: unknown) => boolean {
  return (current, previous) => {
    const a = extractRows<Row>(current);
    const b = extractRows<Row>(previous);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const ar = a[i];
      const br = b[i];
      if (!ar || !br) return false;
      if (options.keyBy(ar) !== options.keyBy(br)) return false;
      if (options.compareBy(ar) !== options.compareBy(br)) return false;
    }
    return true;
  };
}

function normalizeComparatorValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${typeof value}:${String(value)}`;
  }
  if (value instanceof Date) return `d:${value.toISOString()}`;
  try {
    return `j:${JSON.stringify(value)}`;
  } catch {
    return `x:${String(value)}`;
  }
}

function shallowRowSignature(row: Record<string, unknown>): string {
  const keys = Object.keys(row).sort();
  return keys.map((key) => `${key}=${normalizeComparatorValue(row[key])}`).join('|');
}

function areRowArraysShallowEqual(current: unknown, previous: unknown): boolean {
  const a = extractRows<Record<string, unknown>>(current);
  const b = extractRows<Record<string, unknown>>(previous);
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const ar = a[i];
    const br = b[i];
    if (!ar || !br) return false;
    if (shallowRowSignature(ar) !== shallowRowSignature(br)) {
      return false;
    }
  }

  return true;
}

function userIdsWithLocal(userId: string | null): string[] {
  return userId ? [userId, 'local'] : ['local'];
}

function isMissingSessionSummariesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table: session_summaries');
}

function serializeFilters(filters: SessionSummariesFilters): string {
  const modalities = Array.from(filters.modalities ?? new Set<string>())
    .sort()
    .join(',');
  const nLevels = Array.from(filters.nLevels ?? new Set<number>())
    .sort((a, b) => a - b)
    .join(',');
  const start = filters.startDate ? filters.startDate.toISOString() : '';
  const end = filters.endDate ? filters.endDate.toISOString() : '';
  return [
    filters.mode,
    String(filters.journeyFilter ?? ''),
    String(filters.freeModeFilter ?? ''),
    modalities,
    start,
    end,
    nLevels,
  ].join('|');
}

function serializeCursor(cursor: SessionSummariesCursor | null): string {
  if (!cursor) return '';
  return `${cursor.createdAt}|${cursor.sessionId}`;
}

function getDbSync(): AbstractPowerSyncDatabase | null {
  try {
    return isPowerSyncInitialized() ? (getPowerSyncDatabase() as AbstractPowerSyncDatabase) : null;
  } catch {
    return null;
  }
}

function createPowerSyncWatchStore<T>(options: {
  name: string;
  getDb: () => Promise<AbstractPowerSyncDatabase>;
  sql: string;
  params: readonly unknown[];
  initial: ReadModelSnapshot<T>;
  comparator?: (current: unknown, previous: unknown) => boolean;
  map: (rows: Record<string, unknown>[]) => T;
  recoverMissingSessionSummariesAsEmpty?: boolean;
  onDispose?: () => void;
}): Subscribable<ReadModelSnapshot<T>> {
  ensureStoreDebugEntry(options.name);
  let snapshot = options.initial;
  const listeners = new Set<Listener>();
  let started = false;
  let disposeWatchedQuery: (() => void) | null = null;
  let emitScheduled = false;
  let hasResolvedInitialResult = false;
  // Prevent WatchedQuery leaks when subscribe/unsubscribe happens faster than
  // the async start() path (auth transitions, route changes, StrictMode).
  //
  // Without this guard, a start() can race with stop(): stop() runs before
  // the awaited getDb() resolves, leaving disposeWatchedQuery null. When the
  // async continues, it registers a WatchedQuery listener that is never disposed.
  let runId = 0;

  const emit = () => {
    emitScheduled = false;
    updateStoreDebug(options.name, (entry) => {
      entry.emitScheduled = false;
    });
    const emitLabel = `ReadModelWatch.${options.name}.emit(listeners=${listeners.size})`;
    const startedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    timeSyncOperation(emitLabel, () => {
      for (const l of listeners) l();
    });
    const endedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    updateStoreDebug(options.name, (entry) => {
      entry.lastEmitDurationMs = endedAt - startedAt;
      entry.lastEmitAt = new Date().toISOString();
    });
  };

  const scheduleEmit = () => {
    if (emitScheduled) return;
    emitScheduled = true;
    updateStoreDebug(options.name, (entry) => {
      entry.emitScheduled = true;
    });
    scheduleQueuedWatchEmit(emit);
  };

  const start = () => {
    if (started) return;
    started = true;
    updateStoreDebug(options.name, (entry) => {
      entry.started = true;
    });

    const myRunId = ++runId;
    const isActive = () => started && myRunId === runId && listeners.size > 0;

    (async () => {
      try {
        const db = await options.getDb();

        // If we were stopped while awaiting the DB, abort to avoid leaking watchers.
        if (!isActive()) {
          return;
        }

        const watchedQuery = db
          .query({
            sql: options.sql,
            parameters: options.params as unknown as readonly QueryParam[],
          })
          .watch({
            comparator: {
              checkEquality: options.comparator ?? areRowArraysShallowEqual,
            },
          });

        const dispose = watchedQuery.registerListener({
          onData: (rows: unknown) => {
            if (!isActive()) return;
            if (isUnknownWatchedQueryPayload(rows)) {
              // Fail loud: this would otherwise look like "0 rows" and break UI deterministically.
              console.error(
                `[PowerSync] WatchedQuery returned unexpected payload shape (${options.name}).`,
                rows,
              );
              snapshot = {
                ...snapshot,
                isPending: false,
                error: `[PowerSync] Unexpected WatchedQuery payload shape (${options.name})`,
              };
              hasResolvedInitialResult = true;
              scheduleEmit();
              return;
            }
            const extractedRows = extractRows<Record<string, unknown>>(rows);
            updateStoreDebug(options.name, (entry) => {
              entry.onDataCount += 1;
              entry.lastRowCount = extractedRows.length;
              entry.lastOnDataAt = new Date().toISOString();
              entry.lastError = null;
            });
            const mapLabel = `ReadModelWatch.${options.name}.map(rows=${extractedRows.length})`;
            const mapStartedAt =
              typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now();
            const mapped = timeSyncOperation(mapLabel, () => options.map(extractedRows));
            const mapEndedAt =
              typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now();
            updateStoreDebug(options.name, (entry) => {
              entry.lastMapDurationMs = mapEndedAt - mapStartedAt;
            });
            hasResolvedInitialResult = true;
            snapshot = { data: mapped, isPending: false, error: null };
            scheduleEmit();
          },
          onStateChange: (state: unknown) => {
            if (!isActive()) return;
            updateStoreDebug(options.name, (entry) => {
              entry.stateChangeCount += 1;
            });
            const s = state as { isLoading?: boolean; isFetching?: boolean; error?: unknown };
            const nextError = s.error ? String(s.error) : null;
            // Keep pending for the true initial load only. Legitimately empty result sets
            // must not flip back to "loading" on every background WatchedQuery refresh.
            const pending = Boolean(s.isLoading && !hasResolvedInitialResult);
            if (snapshot.isPending === pending && snapshot.error === nextError) {
              return;
            }
            snapshot = { ...snapshot, isPending: pending, error: nextError };
            scheduleEmit();
          },
          onError: (error: unknown) => {
            if (!isActive()) return;
            const errorMessage = error instanceof Error ? error.message : String(error);
            updateStoreDebug(options.name, (entry) => {
              entry.onErrorCount += 1;
              entry.lastError = errorMessage;
            });
            if (
              options.recoverMissingSessionSummariesAsEmpty &&
              isMissingSessionSummariesError(error)
            ) {
              hasResolvedInitialResult = true;
              snapshot = {
                data: options.map([]),
                isPending: false,
                error: null,
              };
              scheduleEmit();
              return;
            }
            if (snapshot.error === errorMessage && snapshot.isPending === false) {
              return;
            }
            hasResolvedInitialResult = true;
            snapshot = {
              ...snapshot,
              isPending: false,
              error: errorMessage,
            };
            scheduleEmit();
          },
        });

        // stop() can run between isActive() check and registerListener.
        // Dispose immediately in that case.
        if (!isActive()) {
          dispose();
          return;
        }

        disposeWatchedQuery = dispose;
      } catch (error) {
        if (!isActive()) return;
        if (
          options.recoverMissingSessionSummariesAsEmpty &&
          isMissingSessionSummariesError(error)
        ) {
          hasResolvedInitialResult = true;
          snapshot = {
            data: options.map([]),
            isPending: false,
            error: null,
          };
          scheduleEmit();
          return;
        }
        hasResolvedInitialResult = true;
        snapshot = {
          data: snapshot.data,
          isPending: false,
          error: (error as Error)?.message ?? String(error),
        };
        scheduleEmit();
      }
    })();
  };

  const stop = () => {
    // Invalidate any in-flight async start() run.
    runId += 1;
    cancelQueuedWatchEmit(emit);
    emitScheduled = false;
    updateStoreDebug(options.name, (entry) => {
      entry.emitScheduled = false;
    });
    disposeWatchedQuery?.();
    disposeWatchedQuery = null;
    started = false;
    hasResolvedInitialResult = false;
    updateStoreDebug(options.name, (entry) => {
      entry.started = false;
    });
    options.onDispose?.();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      updateStoreDebug(options.name, (entry) => {
        entry.listenerCount = listeners.size;
      });
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        updateStoreDebug(options.name, (entry) => {
          entry.listenerCount = listeners.size;
        });
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => snapshot,
  };
}

export function createPowerSyncReadModelAdapter(): ReadModelPort {
  const profileSummaryCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const profileLatestCache = new Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>();
  const profileSessionDaysCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const trainingDailyTotalsCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const profileProgressionCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const profileModalityCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const profileStreakCache = new Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>();

  const progressionSummaryCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const progressionStreakCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const badgesUnlockedCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const modeQuickStatsCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();
  const lastPlayedModeCache = new Map<
    string,
    Subscribable<ReadModelSnapshot<readonly unknown[]>>
  >();

  const replayRunsCache = new Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>();

  const historyCache = new Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>();
  const adminHealthCache = new Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>();

  const getDb = async () => {
    const db = getDbSync();
    if (db) return db;
    return openPowerSyncDatabase();
  };

  const watchRows = (options: {
    cacheKey: string;
    compiled: CompiledSqlQuery;
    comparator?: (current: unknown, previous: unknown) => boolean;
    recoverMissingSessionSummariesAsEmpty?: boolean;
    cache: Map<string, Subscribable<ReadModelSnapshot<readonly unknown[]>>>;
  }): Subscribable<ReadModelSnapshot<readonly unknown[]>> => {
    const existing = options.cache.get(options.cacheKey);
    if (existing) return existing;

    const store = createPowerSyncWatchStore<readonly unknown[]>({
      name: options.cacheKey,
      getDb,
      sql: options.compiled.sql,
      params: options.compiled.parameters,
      initial: { data: [], isPending: true, error: null },
      comparator: options.comparator,
      map: (rows) => rows as readonly unknown[],
      recoverMissingSessionSummariesAsEmpty: options.recoverMissingSessionSummariesAsEmpty,
      onDispose: () => {
        removeStoreDebug(options.cacheKey);
        options.cache.delete(options.cacheKey);
      },
    });
    options.cache.set(options.cacheKey, store);
    return store;
  };

  return {
    journeyState: (_config: JourneyConfig, _userId: string | null) => {
      // Journey projection removed — return empty state
      const empty = {} as JourneyState;
      return createStaticSubscribable({ data: empty, isPending: false, error: null });
    },

    // -----------------------------------------------------------------------
    // Profile
    // -----------------------------------------------------------------------

    profileSummary: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileSummary:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
          CAST(COALESCE(COUNT(*), 0) AS INTEGER) AS total_sessions,
          CAST(COALESCE(SUM(duration_ms), 0) AS INTEGER) AS total_duration_ms,
          CAST(COALESCE(SUM(trials_count), 0) AS INTEGER) AS total_trials,
          COALESCE(AVG(global_d_prime), 0) AS avg_d_prime,
          COALESCE(MAX(global_d_prime), 0) AS best_d_prime,
          CAST(COALESCE(MAX(n_level), 1) AS INTEGER) AS highest_n_level,
          CAST(COALESCE(SUM(focus_lost_total_ms), 0) AS INTEGER) AS total_focus_lost_ms,
          COALESCE(AVG(focus_lost_count), 0) AS avg_focus_lost_per_session
        FROM session_summaries
        WHERE ${scope.clause}
          AND reason = 'completed'`,
        parameters: scope.params,
      };
      return watchRows({
        cacheKey,
        compiled,
        cache: profileSummaryCache,
        comparator: createRowArrayComparator<{ total_sessions: number }>({
          keyBy: () => 'profile_summary',
          compareBy: (r) => String(r.total_sessions ?? 0),
        }),
      });
    },

    profileLatestSession: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileLatest:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT n_level, created_at
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
          ORDER BY created_at DESC, session_id DESC
          LIMIT 1`,
        parameters: scope.params,
      };
      return watchRows({
        cacheKey,
        compiled,
        cache: profileLatestCache,
        comparator: createRowArrayComparator<{ n_level: number; created_at: string | null }>({
          keyBy: () => 'profile_latest_session',
          compareBy: (r) => `${r.n_level ?? ''}|${r.created_at ?? ''}`,
        }),
      });
    },

    profileSessionDays: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileSessionDays:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT created_date AS day
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
            AND created_date IS NOT NULL
          GROUP BY created_date
          ORDER BY created_date ASC`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: profileSessionDaysCache });
    },

    trainingDailyTotals: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `trainingDailyTotals:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
            date(created_at, 'localtime') AS day,
            CAST(COALESCE(SUM(duration_ms), 0) AS INTEGER) AS total_duration_ms,
            CAST(COALESCE(COUNT(*), 0) AS INTEGER) AS sessions_count
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
            AND created_at IS NOT NULL
          GROUP BY date(created_at, 'localtime')
          ORDER BY date(created_at, 'localtime') ASC`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: trainingDailyTotalsCache });
    },

    profileProgression: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileProgression:${userId ?? 'local'}`;
      const weekStartExpr = `date(created_at, '-' || ((CAST(strftime('%w', created_at) AS INTEGER) + 6) % 7) || ' days')`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
            ${weekStartExpr} AS week_start,
            CAST(COALESCE(MAX(n_level), 1) AS INTEGER) AS n_level_max,
            COALESCE(AVG(global_d_prime), 0) AS avg_d_prime,
            CAST(COUNT(*) AS INTEGER) AS sessions_count
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
            AND created_at IS NOT NULL
          GROUP BY ${weekStartExpr}
          ORDER BY ${weekStartExpr} ASC`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: profileProgressionCache });
    },

    profileModalitySource: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileModalitySource:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
            session_id,
            by_modality,
            n_level,
            COALESCE(global_d_prime, 0) AS global_d_prime
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
          ORDER BY created_at DESC, session_id DESC`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: profileModalityCache });
    },

    profileStreak: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `profileStreak:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `WITH dates AS (
            SELECT DISTINCT created_date as day
            FROM session_summaries
            WHERE ${scope.clause}
              AND created_date IS NOT NULL
              AND reason != 'abandoned'
          ),
          with_row AS (
            SELECT day, ROW_NUMBER() OVER (ORDER BY day) as rn FROM dates
          ),
          with_islands AS (
            SELECT day, date(day, '-' || rn || ' days') as island_id FROM with_row
          ),
          streaks AS (
            SELECT
              island_id,
              MAX(day) as end_day,
              COUNT(*) as streak_length
            FROM with_islands
            GROUP BY island_id
          )
          SELECT
            COALESCE(
              (SELECT streak_length FROM streaks WHERE end_day >= date('now', '-1 day')),
              0
            ) AS current_streak,
            COALESCE((SELECT MAX(streak_length) FROM streaks), 0) AS best_streak,
            (SELECT MAX(day) FROM dates) AS last_active_date`,
        parameters: scope.params,
      };
      return watchRows({
        cacheKey,
        compiled,
        cache: profileStreakCache,
      });
    },

    // -----------------------------------------------------------------------
    // Progression
    // -----------------------------------------------------------------------

    progressionSummary: (userId: string | null) => {
      const projectionIds = userIdsWithLocal(userId);
      const placeholders = projectionIds.map(() => '?').join(', ');
      const cacheKey = `progressionSummary:${userId ?? 'local'}`;
      // Fast path: aggregate at most two projection rows (auth + local).
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
          CAST(COALESCE(SUM(sessions_count), 0) AS INTEGER) AS completed_sessions,
          CAST(COALESCE(SUM(abandoned_sessions), 0) AS INTEGER) AS abandoned_sessions,
          CAST(COALESCE(SUM(total_trials), 0) AS INTEGER) AS total_trials,
          MIN(first_session_at) AS first_session_at,
          CAST(COALESCE(SUM(total_xp), 0) AS INTEGER) AS total_xp,
          CAST(COALESCE(SUM(early_morning_sessions), 0) AS INTEGER) AS early_morning_sessions,
          CAST(COALESCE(SUM(late_night_sessions), 0) AS INTEGER) AS late_night_sessions
        FROM user_stats_projection
        WHERE id IN (${placeholders})`,
        parameters: projectionIds,
      };
      return watchRows({
        cacheKey,
        compiled,
        cache: progressionSummaryCache,
        recoverMissingSessionSummariesAsEmpty: true,
      });
    },

    progressionUninterruptedStreak: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const projectionIds = userIdsWithLocal(userId);
      const projectionPlaceholders = projectionIds.map(() => '?').join(', ');
      const cacheKey = `progressionStreak:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `WITH first_break AS (
            SELECT created_at, session_id
            FROM session_summaries
            WHERE ${scope.clause}
              AND reason = 'completed'
              AND focus_lost_count > 0
            ORDER BY created_at DESC, session_id DESC
            LIMIT 1
          ),
          completed AS (
            SELECT CAST(COALESCE(SUM(sessions_count), 0) AS INTEGER) AS completed_sessions
            FROM user_stats_projection
            WHERE id IN (${projectionPlaceholders})
          )
          SELECT CASE
            WHEN EXISTS (SELECT 1 FROM first_break) THEN (
              SELECT COUNT(*)
              FROM session_summaries
              WHERE ${scope.clause}
                AND reason = 'completed'
                AND (
                  created_at > (SELECT created_at FROM first_break)
                  OR (
                    created_at = (SELECT created_at FROM first_break)
                    AND session_id > (SELECT session_id FROM first_break)
                  )
                )
            )
            ELSE COALESCE((SELECT completed_sessions FROM completed), 0)
          END AS uninterrupted_streak`,
        parameters: [...scope.params, ...scope.params, ...projectionIds],
      };
      return watchRows({
        cacheKey,
        compiled,
        cache: progressionStreakCache,
        recoverMissingSessionSummariesAsEmpty: true,
      });
    },

    badgesUnlocked: (userId: string | null) => {
      // Badge unlock events were stored in emt_messages (removed).
      // Badges are now derived dynamically in useProgression — return empty result.
      const cacheKey = `badgesUnlocked:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT NULL AS id, NULL AS badge_id, NULL AS session_id, NULL AS timestamp WHERE 0`,
        parameters: [],
      };

      return watchRows({ cacheKey, compiled, cache: badgesUnlockedCache });
    },

    modeQuickStats: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `modeQuickStats:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
            game_mode,
            CAST(COALESCE(COUNT(*), 0) AS INTEGER) AS sessions,
            CAST(COALESCE(SUM(duration_ms), 0) AS INTEGER) AS total_time_ms,
            CAST(COALESCE(MAX(n_level), 1) AS INTEGER) AS max_level
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
          GROUP BY game_mode`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: modeQuickStatsCache });
    },

    lastPlayedMode: (userId: string | null) => {
      const scope = userScopeClause(userId);
      const cacheKey = `lastPlayedMode:${userId ?? 'local'}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT game_mode
          FROM session_summaries
          WHERE ${scope.clause}
            AND reason = 'completed'
          ORDER BY created_at DESC, session_id DESC
          LIMIT 1`,
        parameters: scope.params,
      };
      return watchRows({ cacheKey, compiled, cache: lastPlayedModeCache });
    },

    // -----------------------------------------------------------------------
    // Replay
    // -----------------------------------------------------------------------

    replayRuns: (sessionId: string) => {
      const cacheKey = `replayRuns:${sessionId}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT
            id,
            session_id,
            parent_run_id,
            depth,
            status,
            created_at
          FROM replay_runs
          WHERE session_id = ?
          ORDER BY depth ASC, created_at ASC, id ASC`,
        parameters: [sessionId],
      };
      return watchRows({ cacheKey, compiled, cache: replayRunsCache });
    },

    // -----------------------------------------------------------------------
    // History
    // -----------------------------------------------------------------------

    historyJourneyRecordableSessions: (userId, journeyId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildJourneyRecordableSessionsCompiledQuery(userIds, journeyId);
      const cacheKey = `historyJourneyRecordableSessions:${userId ?? 'local'}:${journeyId}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyAvailableJourneyIds: (userId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildAvailableJourneyIdsCompiledQuery(userIds);
      const cacheKey = `historyAvailableJourneyIds:${userId ?? 'local'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesFilteredCount: (userId, filters) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesFilteredCountCompiledQuery(userIds, filters);
      const cacheKey = `historyFilteredCount:${userId ?? 'local'}:${serializeFilters(filters)}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesFilteredIds: (userId, filters) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesFilteredIdsCompiledQuery(userIds, filters);
      const cacheKey = `historyFilteredIds:${userId ?? 'local'}:${serializeFilters(filters)}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesPage: (userId, filters, cursor, pageSize) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesPageCompiledQuery({
        userIds,
        filters,
        cursor,
        pageSize,
      });
      const cacheKey = `historyPage:${userId ?? 'local'}:${serializeFilters(filters)}:${serializeCursor(cursor)}:${pageSize}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesHeaderCounts: (userId, filters) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesHeaderCountsCompiledQuery(userIds, filters);
      const cacheKey = `historyHeaderCounts:${userId ?? 'local'}:${serializeFilters(filters)}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesCount: (userId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesCountCompiledQuery(userIds);
      const cacheKey = `historyCount:${userId ?? 'local'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummariesIds: (userId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesIdsCompiledQuery(userIds);
      const cacheKey = `historyIds:${userId ?? 'local'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyMaxAchievedLevelForMode: (userId, modeId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildMaxAchievedLevelCompiledQuery(userIds, modeId);
      const cacheKey = `historyMaxLevel:${userId ?? 'local'}:${modeId}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionsList: (userId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionsListCompiledQuery(userIds);
      const cacheKey = `historySessionsList:${userId ?? 'local'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionDetails: (userId, sessionId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionDetailsCompiledQuery(userIds, sessionId);
      const cacheKey = `historySessionDetails:${userId ?? 'local'}:${sessionId}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionSummaries: (userId, includeAbandoned) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionSummariesCompiledQuery(userIds, includeAbandoned);
      const cacheKey = `historySessionSummaries:${userId ?? 'local'}:${includeAbandoned ? '1' : '0'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyLastAdaptiveDPrime: (userId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildLastAdaptiveDPrimeCompiledQuery(userIds);
      const cacheKey = `historyLastAdaptiveDPrime:${userId ?? 'local'}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyLatestStatsGameMode: (userId, gameModeIds) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildLatestStatsGameModeCompiledQuery(userIds, gameModeIds);
      const cacheKey = `historyLatestStatsGameMode:${userId ?? 'local'}:${gameModeIds.join(',')}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyRecentSessionsForTrend: (userId, input) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildRecentSessionsForTrendCompiledQuery({
        userIds,
        gameMode: input.gameMode,
        referenceCreatedAtIso: input.referenceCreatedAtIso,
        excludeSessionId: input.excludeSessionId,
        limit: input.limit,
      });
      const cacheKey = `historyRecentTrend:${userId ?? 'local'}:${input.gameMode}:${input.referenceCreatedAtIso ?? ''}:${input.excludeSessionId}:${input.limit}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historySessionsByGameMode: (userId, gameMode) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildSessionsByGameModeCompiledQuery(userIds, gameMode);
      const cacheKey = `historyByMode:${userId ?? 'local'}:${gameMode}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyJourneySessions: (userId, journeyId) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildJourneySessionsCompiledQuery(userIds);
      // Filter journeyId at UI level (existing logic); keep query broad.
      const cacheKey = `historyJourneySessions:${userId ?? 'local'}:${journeyId}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyLatestJourneySession: (userId, journeyId) => {
      const normalizedJourneyId = journeyId?.trim() ?? '';
      if (normalizedJourneyId.length === 0) {
        return createStaticSubscribable({ data: [], isPending: false, error: null });
      }
      const userIds = userIdsWithLocal(userId);
      const compiled = buildLatestJourneySessionCompiledQuery(userIds, normalizedJourneyId);
      const cacheKey = `historyLatestJourneySession:${userId ?? 'local'}:${normalizedJourneyId}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    historyBrainWorkshopStrikes: (userId, journeyId, limit) => {
      const userIds = userIdsWithLocal(userId);
      const compiled = buildBrainWorkshopStrikesCompiledQuery(userIds, journeyId, limit);
      const cacheKey = `historyBwStrikes:${userId ?? 'local'}:${journeyId}:${limit}`;
      return watchRows({ cacheKey, compiled, cache: historyCache });
    },

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    adminRecentSessionHealth: (userId: string, refreshToken?: number) => {
      // Health metrics were stored in emt_messages SESSION_ENDED events (removed).
      // Return empty result — admin health panel needs migration to session_events.
      const token = typeof refreshToken === 'number' ? refreshToken : 0;
      const cacheKey = `adminHealth:${userId}:${token}`;
      const compiled: CompiledSqlQuery = {
        sql: `SELECT NULL AS session_id, NULL AS timestamp, NULL AS health_metrics, NULL AS e_user_id, NULL AS e_session_id WHERE 0`,
        parameters: [],
      };
      return watchRows({ cacheKey, compiled, cache: adminHealthCache });
    },
  };
}
