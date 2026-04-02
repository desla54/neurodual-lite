/**
 * Stats Adapter
 *
 * SQL-first adapter for statistics queries.
 *
 * **Session-summary architecture:**
 * - Reads from `session_summaries` only
 * - Event-level queries only for detailed timing/PES stats
 *
 * Architecture: infra/ adapter pattern
 * - Uses PersistencePort (injected) for SQL queries
 * - Returns typed results for UI consumption
 * - Filters are applied in SQL, not in-memory
 *
 * SQLite Migration Notes:
 * - PERCENTILE_CONT → JS percentile() helper
 * - STDDEV_SAMP → JS stddev() helper
 * - jsonb_each → Parse JSON in JavaScript
 * - ANY($N::text[]) → IN (?, ?, ...)
 * - COUNT(*) FILTER → SUM(CASE WHEN...)
 */

import type {
  ActivityStats,
  DistributionStats,
  ErrorProfileStats,
  PlaceConfidenceStats,
  FocusStats,
  ModalityStatsRow,
  ModalityTimingStats,
  ModeBreakdown,
  ModeScoreStats,
  PerformanceStats,
  PostErrorSlowingStats,
  MemoConfidenceStats,
  SessionScorePoint,
  SQLQueryPort,
  StatsFilters,
  StatsInputMethod,
  StatsTimingStats as TimingStats,
  StatsPort,
  TimeSeriesPoint,
  UPSStats,
  ZoneStats,
} from '@neurodual/logic';
import { resolveGameModeIdsForStatsMode, TEMPO_PES_THRESHOLDS } from '@neurodual/logic';
import { SESSION_SUMMARIES_PROJECTION_VERSION } from '../history/history-projection';
import { buildInClause, percentile, stddev, toFiniteNumber } from '../db/sql-helpers';
import { createEventStatsReader, type EventStatsReader } from './session-event-stats-reader';

// =============================================================================
// Stats Cache (RAM + SQLite)
// =============================================================================

// Bump to invalidate all persisted stats cache entries when result shapes change.
const STATS_CACHE_VERSION = 6;
const STATS_MEM_CACHE_MAX_ENTRIES = 128;

type StatsCacheRow = {
  revision: string;
  version: number;
  payload_json: string;
};

type StatsCache = {
  getOrCompute: <T>(kind: string, filters: unknown, compute: () => Promise<T>) => Promise<T>;
};

const statsCacheByPersistence = new WeakMap<SQLQueryPort, StatsCache>();

function serializeStatsFiltersKey(filters: unknown): string {
  if (!filters || typeof filters !== 'object') return 'null';
  const f = filters as Record<string, unknown>;

  const mode = typeof f['mode'] === 'string' ? (f['mode'] as string) : '';
  const journeyId = f['journeyId'] == null ? '' : String(f['journeyId']);
  const startDate =
    f['startDate'] instanceof Date
      ? (f['startDate'] as Date).toISOString()
      : f['startDate']
        ? String(f['startDate'])
        : '';
  const endDate =
    f['endDate'] instanceof Date
      ? (f['endDate'] as Date).toISOString()
      : f['endDate']
        ? String(f['endDate'])
        : '';
  const inputMethod = f['inputMethod'] == null ? '' : String(f['inputMethod']);

  const modalities = (() => {
    const m = f['modalities'];
    if (m instanceof Set) return Array.from(m).map(String).sort().join(',');
    if (Array.isArray(m)) return m.map(String).sort().join(',');
    return '';
  })();

  const nLevels = (() => {
    const n = f['nLevels'];
    if (n instanceof Set) return Array.from(n).map(String).sort().join(',');
    if (Array.isArray(n)) return n.map(String).sort().join(',');
    return '';
  })();

  // Keep it deterministic and compact (no JSON stringify to avoid key-order surprises).
  return `m=${mode};j=${journeyId};sd=${startDate};ed=${endDate};im=${inputMethod};mod=${modalities};nl=${nLevels}`;
}

function createStatsCache(persistence: SQLQueryPort): StatsCache {
  const mem = new Map<string, { revision: string; value: unknown }>();
  const inFlight = new Map<string, Promise<unknown>>();
  let lastRevision: { userId: string; revision: string; atMs: number } | null = null;

  const pendingDbWrites = new Map<
    string,
    {
      readonly cacheKey: string;
      readonly userId: string;
      readonly kind: string;
      readonly filtersKey: string;
      readonly revision: string;
      readonly payloadJson: string;
    }
  >();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const getUserRevision = async (userId: string): Promise<string> => {
    const now = Date.now();
    // Avoid hammering SQLite when multiple stats endpoints fire at once.
    // This is safe because revision is only used for cache invalidation.
    if (lastRevision && lastRevision.userId === userId && now - lastRevision.atMs < 5000) {
      return lastRevision.revision;
    }
    const r = await persistence.query<{ c: number; max_created_at: string | null }>(
      `
      SELECT
        COUNT(*) as c,
        MAX(created_at) as max_created_at
      FROM session_summaries
      WHERE user_id = ?
        AND reason = 'completed'
    `,
      [userId],
    );
    const row = r.rows[0];
    // Include the session_summaries projection version so cached stats are invalidated
    // when read-model semantics change (even if row count / max created_at stay the same).
    const rev = `v${SESSION_SUMMARIES_PROJECTION_VERSION}:${row?.c ?? 0}:${row?.max_created_at ?? ''}`;
    lastRevision = { userId, revision: rev, atMs: now };
    return rev;
  };

  const cacheKey = (userId: string, kind: string, filtersKey: string): string => {
    return `stats:${STATS_CACHE_VERSION}:${userId}:${kind}:${filtersKey}`;
  };

  const setMemEntry = (key: string, entry: { revision: string; value: unknown }): void => {
    if (mem.has(key)) {
      mem.delete(key);
    }
    mem.set(key, entry);
    while (mem.size > STATS_MEM_CACHE_MAX_ENTRIES) {
      const oldestKey = mem.keys().next().value;
      if (oldestKey === undefined) break;
      mem.delete(oldestKey);
    }
  };

  const getOrCompute: StatsCache['getOrCompute'] = async (kind, filters, compute) => {
    const userId = getActiveUserId();
    const filtersKey = serializeStatsFiltersKey(filters);
    const key = cacheKey(userId, kind, filtersKey);

    const revision = await getUserRevision(userId);

    const memHit = mem.get(key);
    if (memHit && memHit.revision === revision) {
      setMemEntry(key, memHit);
      return memHit.value as Awaited<ReturnType<typeof compute>>;
    }
    if (memHit) {
      mem.delete(key);
    }

    const existingInFlight = inFlight.get(key);
    if (existingInFlight) return existingInFlight as Promise<Awaited<ReturnType<typeof compute>>>;

    const p = (async () => {
      try {
        try {
          const rowRes = await persistence.query<StatsCacheRow>(
            `SELECT revision, version, payload_json FROM stats_cache WHERE cache_key = ?`,
            [key],
          );
          const row = rowRes.rows[0];
          if (row && row.version === STATS_CACHE_VERSION && row.revision === revision) {
            try {
              const parsed = JSON.parse(row.payload_json) as unknown;
              setMemEntry(key, { revision, value: parsed });
              return parsed as Awaited<ReturnType<typeof compute>>;
            } catch {
              // Corrupt cache entry - treat as miss.
            }
          }
        } catch {
          // Cache table may not exist yet (before migrations) - treat as miss.
        }

        const value = await compute();
        setMemEntry(key, { revision, value });

        // Persist best-effort (debounced + coalesced).
        try {
          const payloadJson = JSON.stringify(value);
          pendingDbWrites.set(key, {
            cacheKey: key,
            userId,
            kind,
            filtersKey,
            revision,
            payloadJson,
          });
          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              const entries = Array.from(pendingDbWrites.values());
              pendingDbWrites.clear();
              if (entries.length === 0) return;
              void persistence
                .writeTransaction(async (tx) => {
                  for (const e of entries) {
                    await tx.execute(
                      `
                      INSERT INTO stats_cache (
                        cache_key,
                        user_id,
                        kind,
                        filters_key,
                        revision,
                        version,
                        updated_at,
                        payload_json
                      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
                      ON CONFLICT(cache_key) DO UPDATE SET
                        revision = excluded.revision,
                        version = excluded.version,
                        updated_at = excluded.updated_at,
                        payload_json = excluded.payload_json
                    `,
                      [
                        e.cacheKey,
                        e.userId,
                        e.kind,
                        e.filtersKey,
                        e.revision,
                        STATS_CACHE_VERSION,
                        e.payloadJson,
                      ],
                    );
                  }
                })
                .catch(() => {
                  // Best-effort persistence only.
                });
            }, 1500); // PERFORMANCE: Increased from 250ms to reduce SQLite writes (2026-02-28)
          }
        } catch {
          // Best-effort persistence only.
        }

        return value;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, p);
    return p as Promise<Awaited<ReturnType<typeof compute>>>;
  };

  return { getOrCompute };
}

// =============================================================================
// Auth Helpers
// =============================================================================

/**
 * Get the current active user ID for filtering queries.
 *
 * - If Supabase is NOT configured → local-only mode, return 'local'
 * - If Supabase IS configured and authenticated → return user.id
 * - If Supabase IS configured but not authenticated → return 'local' (for local sessions)
 */
function getActiveUserId(): string {
  return 'local';
}

// =============================================================================
// SQL Helpers
// =============================================================================

/**
 * Get the spec-driven accuracy SQL fragment based on mode.
 *
 * Formulas by mode (matches computeSpecDrivenTempoAccuracy in unified-metrics.ts):
 * - DualnbackClassic/BrainWorkshop: hits / (hits + misses + fa) - error-based, CR excluded
 * - DualTempo/Libre: (hitRate + crRate) / 2 - arithmetic SDT proxy (backend-compatible)
 * - DualPlace/DualMemo/DualPick: hits / (hits + misses) - simple accuracy
 * - all/Journey: Use SDT formula as default (most common)
 *
 * @param mode - The stats filter mode
 * @param prefix - Column prefix (e.g., 'total_' for session_summaries, '' for modality stats)
 * @returns SQL CASE expression for unified_accuracy
 */
function getAccuracySQL(mode: StatsFilters['mode'], prefix = 'total_'): string {
  const h = `${prefix}hits`;
  const m = `${prefix}misses`;
  const fa = `${prefix}fa`;
  const cr = `${prefix}cr`;

  // DualnbackClassic/BrainWorkshop: accuracy = hits / (hits + misses + fa)
  // CR are excluded (not relevant for error-based scoring)
  if (mode === 'DualnbackClassic' || mode === 'BrainWorkshop') {
    return `
      CASE
        WHEN SUM(${h} + ${m} + ${fa}) = 0 THEN NULL
        ELSE SUM(${h}) * 1.0 / NULLIF(SUM(${h} + ${m} + ${fa}), 0)
      END`;
  }

  // DualPlace/DualMemo/DualPick: accuracy = hits / (hits + misses)
  // No FA/CR in these modes
  if (mode === 'DualPlace' || mode === 'DualMemo' || mode === 'DualPick') {
    return `
      CASE
        WHEN SUM(${h} + ${m}) = 0 THEN NULL
        ELSE SUM(${h}) * 1.0 / NULLIF(SUM(${h} + ${m}), 0)
      END`;
  }

  // DualTempo/Libre/all/Journey: SDT Combined accuracy = (hitRate + crRate) / 2
  // Uses arithmetic mean instead of geometric (SQRT not available on Android native SQLite)
  // For similar rates, arithmetic ≈ geometric. Returns hitRate alone if no FA/CR data.
  return `
    CASE
      WHEN SUM(${h} + ${m}) = 0 THEN NULL
      WHEN SUM(${fa} + ${cr}) = 0 THEN
        SUM(${h}) * 1.0 / NULLIF(SUM(${h} + ${m}), 0)
      ELSE
        (
          COALESCE(SUM(${h}) * 1.0 / NULLIF(SUM(${h} + ${m}), 0), 0) +
          COALESCE(SUM(${cr}) * 1.0 / NULLIF(SUM(${fa} + ${cr}), 0), 0)
        ) / 2.0
    END`;
}

function getAccuracyPerSessionSQL(mode: StatsFilters['mode'], prefix = 'total_'): string {
  const h = `${prefix}hits`;
  const m = `${prefix}misses`;
  const fa = `${prefix}fa`;
  const cr = `${prefix}cr`;

  if (mode === 'DualnbackClassic' || mode === 'BrainWorkshop') {
    return `
      CASE
        WHEN (${h} + ${m} + ${fa}) = 0 THEN NULL
        ELSE ${h} * 1.0 / NULLIF((${h} + ${m} + ${fa}), 0)
      END`;
  }

  if (mode === 'DualPlace' || mode === 'DualMemo' || mode === 'DualPick') {
    return `
      CASE
        WHEN (${h} + ${m}) = 0 THEN NULL
        ELSE ${h} * 1.0 / NULLIF((${h} + ${m}), 0)
      END`;
  }

  return `
    CASE
      WHEN (${h} + ${m}) = 0 THEN NULL
      WHEN (${fa} + ${cr}) = 0 THEN
        ${h} * 1.0 / NULLIF((${h} + ${m}), 0)
      ELSE
        (
          COALESCE(${h} * 1.0 / NULLIF((${h} + ${m}), 0), 0) +
          COALESCE(${cr} * 1.0 / NULLIF((${fa} + ${cr}), 0), 0)
        ) / 2.0
    END`;
}

function getErrorRatePerSessionPercentSQL(prefix = 'total_'): string {
  const h = `${prefix}hits`;
  const m = `${prefix}misses`;
  const fa = `${prefix}fa`;

  return `
    CASE
      WHEN (${h} + ${m} + ${fa}) = 0 THEN NULL
      ELSE ((${m} + ${fa}) * 1.0 / NULLIF((${h} + ${m} + ${fa}), 0)) * 100
    END`;
}

function computeUnifiedAccuracy(
  mode: StatsFilters['mode'],
  hits: number,
  misses: number,
  fa: number,
  cr: number,
): number {
  if (mode === 'DualnbackClassic' || mode === 'BrainWorkshop') {
    const errorTotal = hits + misses + fa;
    return errorTotal > 0 ? hits / errorTotal : 0;
  }
  if (mode === 'DualPlace' || mode === 'DualMemo' || mode === 'DualPick') {
    const simpleTotal = hits + misses;
    return simpleTotal > 0 ? hits / simpleTotal : 0;
  }
  const hitTotal = hits + misses;
  const crTotal = fa + cr;
  if (hitTotal === 0) return 0;
  if (crTotal === 0) return hits / hitTotal;
  const hitRate = hits / hitTotal;
  const crRate = cr / crTotal;
  return (hitRate + crRate) / 2;
}

// =============================================================================
// Filter Helpers
// =============================================================================

function normalizeModalitiesCsv(modalities: Set<string>): string {
  return Array.from(modalities).sort().join(',');
}

const JOURNEY_SESSION_SQL = `(play_context = 'journey')`;
const FREE_SESSION_SQL = `(play_context = 'free')`;

type FilteredSessionsWhere = {
  whereClause: string;
  params: unknown[];
  hasValidUser: boolean;
};

function buildFilteredSessionsWhere(filters: StatsFilters): FilteredSessionsWhere {
  const userId = getActiveUserId();

  const conditions: string[] = [
    'user_id = ?', // Filter by current user
    "reason = 'completed'", // Only completed sessions
  ];
  const params: unknown[] = [userId];

  // Mode filter
  const hasJourneyFilter = filters.journeyId !== undefined && filters.journeyId !== null;
  const journeyView = filters.mode === 'Journey';
  const journeyScoped = journeyView || hasJourneyFilter;

  if (journeyScoped) {
    conditions.push(JOURNEY_SESSION_SQL);

    // Optional: limit to a specific journey.
    // We allow this even when filters.mode is not 'Journey' so callers can
    // reuse mode-specific formulas (DualnbackClassic/BW) while scoping to a journey.
    if (filters.journeyId && filters.journeyId !== 'all') {
      conditions.push('journey_id = ?');
      params.push(filters.journeyId);
    }
  }

  // For the Journey aggregate view, do not constrain by game_mode (can span multiple modes).
  if (!journeyView && filters.mode !== 'all') {
    if (filters.mode === 'Libre') {
      conditions.push(FREE_SESSION_SQL);
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: ModeType broader than StatsModeFilter
      const gameModeIds = resolveGameModeIdsForStatsMode(filters.mode as any);
      if (gameModeIds.length > 0) {
        const { sql: inClause, params: inParams } = buildInClause([...gameModeIds]);
        conditions.push(`game_mode IN ${inClause}`);
        params.push(...inParams);
      }
    }
  }

  // Date filter (SQLite accepts ISO date strings directly)
  if (filters.startDate) {
    conditions.push('created_at >= ?');
    params.push(filters.startDate.toISOString());
  }
  if (filters.endDate) {
    // End of day
    const endOfDay = new Date(filters.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push('created_at <= ?');
    params.push(endOfDay.toISOString());
  }

  // Modality filter: rely on normalized active_modalities_csv (no JSON scans in WHERE).
  if (filters.modalities.size > 0) {
    const modalityCsv = normalizeModalitiesCsv(filters.modalities);
    conditions.push(`active_modalities_csv = ?`);
    params.push(modalityCsv);
  }

  // N-level filter (multi-select)
  if (filters.nLevels.size > 0) {
    const nLevelsArray = Array.from(filters.nLevels);
    const { sql: inClause, params: inParams } = buildInClause(nLevelsArray);
    conditions.push(`n_level IN ${inClause}`);
    params.push(...inParams);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    whereClause,
    params,
    hasValidUser: true,
  };
}

/** Build the filtered sessions CTE based on filters (SQLite version) */
function buildFilteredSessionsCTE(filters: StatsFilters): {
  sql: string;
  params: unknown[];
  hasValidUser: boolean;
} {
  const { whereClause, params, hasValidUser } = buildFilteredSessionsWhere(filters);
  return {
    sql: `WITH filtered_sessions AS (
      SELECT * FROM session_summaries ${whereClause}
    )`,
    params,
    hasValidUser,
  };
}

/**
 * IDs-only variant for event-level stats.
 *
 * Critical: avoid `SELECT *` so SQLite can use a narrower plan and avoid pulling
 * large JSON columns from `session_summaries` when we only need session IDs.
 */
function buildFilteredSessionIdsCTE(filters: StatsFilters): {
  sql: string;
  params: unknown[];
  hasValidUser: boolean;
} {
  const { whereClause, params, hasValidUser } = buildFilteredSessionsWhere(filters);
  return {
    sql: `WITH filtered_session_ids AS (
      SELECT session_id FROM session_summaries ${whereClause}
    )`,
    params,
    hasValidUser,
  };
}

// =============================================================================
// Time Series Helpers
// =============================================================================

type QueryFn = <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

/**
 * Get time series from session_summaries.
 * Uses pre-computed worst_modality_error_rate column.
 */
async function getTimeSeriesFromSummaries(
  query: QueryFn,
  filters: StatsFilters,
): Promise<TimeSeriesPoint[]> {
  const { sql: cte, params } = buildFilteredSessionsCTE(filters);
  const accuracySQL = getAccuracySQL(filters.mode, 'fs.total_');
  const accuracyPerSessionSQL = getAccuracyPerSessionSQL(filters.mode, 'fs.total_');
  const errorRatePerSessionPercentSQL = getErrorRatePerSessionPercentSQL('fs.total_');

  // Use pre-computed worst_modality_error_rate instead of GROUP_CONCAT
  const result = await query<{
    day: string;
    sessions_count: number;
    total_duration_ms: number;
    unified_accuracy: number;
    min_unified_accuracy: number | null;
    max_unified_accuracy: number | null;
    avg_n_level: number;
    min_n_level: number;
    max_n_level: number;
    ups_score: number;
    min_ups_score: number | null;
    max_ups_score: number | null;
    worst_error_avg: number | null;
    min_error_rate_percent: number | null;
    max_error_rate_percent: number | null;
  }>(
    `
    ${cte}
    SELECT
      fs.created_date as day,
      COUNT(*) as sessions_count,
      SUM(fs.duration_ms) as total_duration_ms,
      ${accuracySQL} as unified_accuracy,
      MIN(${accuracyPerSessionSQL}) as min_unified_accuracy,
      MAX(${accuracyPerSessionSQL}) as max_unified_accuracy,
      COALESCE(AVG(fs.n_level), 1) as avg_n_level,
      COALESCE(MIN(fs.n_level), 1) as min_n_level,
      COALESCE(MAX(fs.n_level), 1) as max_n_level,
      COALESCE(
        SUM(
          CASE
            WHEN fs.ups_score IS NOT NULL THEN
              fs.ups_score * (fs.total_hits + fs.total_misses + fs.total_fa + fs.total_cr)
            ELSE 0
          END
        ) / NULLIF(
          SUM(
            CASE
              WHEN fs.ups_score IS NOT NULL THEN (fs.total_hits + fs.total_misses + fs.total_fa + fs.total_cr)
              ELSE 0
            END
          ),
          0
        ),
        0
      ) as ups_score,
      MIN(fs.ups_score) as min_ups_score,
      MAX(fs.ups_score) as max_ups_score,
      CASE
        WHEN SUM(fs.total_hits + fs.total_misses + fs.total_fa) = 0 THEN NULL
        ELSE ((SUM(fs.total_misses) + SUM(fs.total_fa)) * 1.0 /
              NULLIF(SUM(fs.total_hits + fs.total_misses + fs.total_fa), 0)) * 100
      END as worst_error_avg
      ,
      MIN(${errorRatePerSessionPercentSQL}) as min_error_rate_percent,
      MAX(${errorRatePerSessionPercentSQL}) as max_error_rate_percent
    FROM filtered_sessions fs
    GROUP BY fs.created_date
    ORDER BY fs.created_date ASC
  `,
    params,
  );

  return result.rows.map((row) => ({
    day: row.day,
    sessionsCount: row.sessions_count,
    totalDurationMs: row.total_duration_ms,
    unifiedAccuracy: row.unified_accuracy ?? 0,
    minUnifiedAccuracy: row.min_unified_accuracy ?? null,
    maxUnifiedAccuracy: row.max_unified_accuracy ?? null,
    avgNLevel: row.avg_n_level,
    minNLevel: row.min_n_level,
    maxNLevel: row.max_n_level,
    minErrorRatePercent: row.min_error_rate_percent ?? null,
    maxErrorRatePercent: row.max_error_rate_percent ?? null,
    upsScore: row.ups_score,
    minUpsScore: row.min_ups_score ?? null,
    maxUpsScore: row.max_ups_score ?? null,
    worstModalityErrorRate: row.worst_error_avg,
  }));
}

// =============================================================================
// Stats Projection Fast-Path Helpers
// =============================================================================

/**
 * Returns true when the filters apply no constraints beyond the current user +
 * reason='completed'. In this case the pre-computed stats projections provide
 * O(1) answers, bypassing full session_summaries scans.
 */
function isBaselineQuery(filters: StatsFilters): boolean {
  return (
    filters.mode === 'all' &&
    !filters.journeyId &&
    !filters.startDate &&
    !filters.endDate &&
    filters.modalities.size === 0 &&
    filters.nLevels.size === 0 &&
    !filters.inputMethod
  );
}

// =============================================================================
// Stats Adapter
// =============================================================================

function createStatsAdapterWithQuery(query: QueryFn, eventReader: EventStatsReader): StatsPort {
  /** Execute the filtered_session_ids CTE and return the list of session IDs. */
  async function getFilteredSessionIds(filters: StatsFilters): Promise<string[]> {
    const { sql: cte, params } = buildFilteredSessionIdsCTE(filters);
    const result = await query<{ session_id: string }>(
      `${cte} SELECT session_id FROM filtered_session_ids`,
      params,
    );
    return result.rows.map((r) => r.session_id);
  }

  return {
    /**
     * Get activity stats (sessions count, total time, avg daily time on active days, active days)
     *
     * Fast path: reads O(1) from user_stats_projection for unfiltered baseline queries.
     * Slow path: full session_summaries scan for filtered queries.
     */
    async getActivityStats(filters: StatsFilters): Promise<ActivityStats> {
      // Fast path: O(1) projection read for baseline (no filters)
      if (isBaselineQuery(filters)) {
        const userId = getActiveUserId();
        const projResult = await query<{
          sessions_count: number;
          total_duration_ms: number;
          active_days: number;
        }>(
          `SELECT sessions_count, total_duration_ms, active_days
           FROM user_stats_projection WHERE id = ?`,
          [userId],
        );
        const pr = projResult.rows[0];
        if (pr && pr.sessions_count > 0) {
          return {
            sessionsCount: pr.sessions_count,
            totalPlayTimeMs: pr.total_duration_ms,
            avgSessionDurationMs:
              pr.active_days > 0 ? pr.total_duration_ms / pr.active_days : pr.total_duration_ms,
            activeDays: pr.active_days,
          };
        }
        // Fall through to slow path if projection row is missing
      }

      // Slow path: full CTE scan
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        sessions_count: number;
        total_play_time_ms: number;
        avg_session_duration_ms: number;
        active_days: number;
      }>(
        `
      ${cte}
      SELECT
        COUNT(*) as sessions_count,
        COALESCE(SUM(duration_ms), 0) as total_play_time_ms,
        COALESCE(
          CASE
            WHEN COUNT(DISTINCT created_date) > 0
              THEN (SUM(duration_ms) * 1.0) / COUNT(DISTINCT created_date)
            ELSE 0
          END,
          0
        ) as avg_session_duration_ms,
        COUNT(DISTINCT created_date) as active_days
      FROM filtered_sessions
    `,
        params,
      );

      const row = result.rows[0];
      return {
        sessionsCount: row?.sessions_count ?? 0,
        totalPlayTimeMs: row?.total_play_time_ms ?? 0,
        avgSessionDurationMs: row?.avg_session_duration_ms ?? 0,
        activeDays: row?.active_days ?? 0,
      };
    },

    /**
     * Get performance stats (current N-level, max N-level, unified accuracy, UPS)
     *
     * Fast path: reads O(1) from user_stats_projection for unfiltered baseline queries.
     * Slow path: full session_summaries scan for filtered queries.
     */
    async getPerformanceStats(filters: StatsFilters): Promise<PerformanceStats> {
      // Fast path: O(1) projection read for baseline (no filters)
      if (isBaselineQuery(filters)) {
        const userId = getActiveUserId();
        const projResult = await query<{
          max_n_level: number;
          last_n_level: number;
          ups_sum: number;
          ups_trial_count: number;
          total_hits: number;
          total_misses: number;
          total_fa: number;
          total_cr: number;
        }>(
          `SELECT max_n_level, last_n_level, ups_sum, ups_trial_count,
                  total_hits, total_misses, total_fa, total_cr
           FROM user_stats_projection WHERE id = ?`,
          [userId],
        );
        const pr = projResult.rows[0];
        if (pr && pr.total_hits + pr.total_misses + pr.total_fa + pr.total_cr > 0) {
          const upsScore = pr.ups_trial_count > 0 ? pr.ups_sum / pr.ups_trial_count : 0;
          const unifiedAccuracy = computeUnifiedAccuracy(
            filters.mode,
            pr.total_hits,
            pr.total_misses,
            pr.total_fa,
            pr.total_cr,
          );
          return {
            currentNLevel: pr.last_n_level ?? 1,
            maxNLevel: pr.max_n_level ?? 1,
            unifiedAccuracy,
            upsScore,
          };
        }
        // Fall through to slow path if projection row is missing
      }

      const { sql: cte, params } = buildFilteredSessionsCTE(filters);
      const accuracySQL = getAccuracySQL(filters.mode, 'total_');

      const result = await query<{
        current_n_level: number | null;
        max_n_level: number | null;
        unified_accuracy: number | null;
        ups_score: number | null;
      }>(
        `
      ${cte},
      last_session AS (
        SELECT n_level FROM filtered_sessions ORDER BY created_at DESC LIMIT 1
      )
      SELECT
        (SELECT n_level FROM last_session) as current_n_level,
        MAX(n_level) as max_n_level,
        ${accuracySQL} as unified_accuracy,
        COALESCE(
          SUM(
            CASE
              WHEN ups_score IS NOT NULL THEN
                ups_score * (total_hits + total_misses + total_fa + total_cr)
              ELSE 0
            END
          ) / NULLIF(
            SUM(
              CASE
                WHEN ups_score IS NOT NULL THEN (total_hits + total_misses + total_fa + total_cr)
                ELSE 0
              END
            ),
            0
          ),
          0
        ) as ups_score
      FROM filtered_sessions
    `,
        params,
      );

      const row = result.rows[0];
      return {
        currentNLevel: row?.current_n_level ?? 1,
        maxNLevel: row?.max_n_level ?? 1,
        unifiedAccuracy: row?.unified_accuracy ?? 0,
        upsScore: row?.ups_score ?? 0,
      };
    },

    /**
     * Get stats per modality (aggregated from by_modality JSON)
     *
     * Fast path: reads O(1) from user_modality_stats_projection for unfiltered baseline queries.
     * Eliminates N×8 json_extract calls on all session rows.
     * Slow path: CTE + json_extract scan for filtered queries.
     */
    async getModalityStats(filters: StatsFilters): Promise<ModalityStatsRow[]> {
      // Fast path: O(modality_count) projection read for baseline
      if (isBaselineQuery(filters)) {
        const userId = getActiveUserId();
        const projResult = await query<{
          modality: string;
          hits_sum: number;
          misses_sum: number;
          fa_sum: number;
          cr_sum: number;
          rt_sum: number;
          rt_count: number;
        }>(
          `SELECT modality, hits_sum, misses_sum, fa_sum, cr_sum, rt_sum, rt_count
           FROM user_modality_stats_projection WHERE user_id = ?`,
          [userId],
        );
        if (projResult.rows.length > 0) {
          return projResult.rows
            .filter((r) => r.hits_sum + r.misses_sum + r.fa_sum + r.cr_sum > 0)
            .map((r) => ({
              modality: r.modality,
              totalActions: r.hits_sum + r.misses_sum + r.fa_sum + r.cr_sum,
              unifiedAccuracy: computeUnifiedAccuracy(
                filters.mode,
                r.hits_sum,
                r.misses_sum,
                r.fa_sum,
                r.cr_sum,
              ),
              avgResponseTimeMs: r.rt_count > 0 ? r.rt_sum / r.rt_count : null,
              hits: r.hits_sum,
              misses: r.misses_sum,
              falseAlarms: r.fa_sum,
              correctRejections: r.cr_sum,
            }));
        }
        // Fall through to slow path if projection is empty
      }

      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      // Aggregate per-modality stats directly in SQL using json_extract.
      // CROSS JOIN with a known-modalities table avoids json_each() virtual rows;
      // json_extract does a direct O(1) path lookup per field.
      // This eliminates transferring all by_modality blobs to JS and calling JSON.parse N times.
      const result = await query<{
        modality: string;
        hits: number;
        misses: number;
        false_alarms: number;
        correct_rejections: number;
        rt_sum: number;
        rt_count: number;
      }>(
        `
      ${cte},
      known_modalities(m) AS (
        SELECT 'position' UNION ALL SELECT 'audio'
        UNION ALL SELECT 'color' UNION ALL SELECT 'image'
      )
      SELECT
        km.m AS modality,
        COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)), 0) AS hits,
        COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.misses') AS INTEGER)), 0) AS misses,
        COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)), 0) AS false_alarms,
        COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.correctRejections') AS INTEGER)), 0) AS correct_rejections,
        COALESCE(SUM(
          CASE
            WHEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL) > 0
              AND (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
                 + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)) > 0
            THEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL)
              * (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
               + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER))
            ELSE 0
          END
        ), 0) AS rt_sum,
        COALESCE(SUM(
          CASE
            WHEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL) > 0
              AND (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
                 + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)) > 0
            THEN (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
                + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER))
            ELSE 0
          END
        ), 0) AS rt_count
      FROM known_modalities km
      JOIN filtered_sessions s
        ON json_extract(s.by_modality, '$.' || km.m) IS NOT NULL
          AND s.by_modality IS NOT NULL
          AND s.by_modality != ''
      GROUP BY km.m
      HAVING hits + misses + false_alarms + correct_rejections > 0
    `,
        params,
      );

      return result.rows.map((row) => {
        const hits = toFiniteNumber(row.hits);
        const misses = toFiniteNumber(row.misses);
        const falseAlarms = toFiniteNumber(row.false_alarms);
        const correctRejections = toFiniteNumber(row.correct_rejections);
        const totalActions = hits + misses + falseAlarms + correctRejections;
        const rtCount = toFiniteNumber(row.rt_count);
        const rtSum = toFiniteNumber(row.rt_sum);

        return {
          modality: row.modality,
          totalActions,
          unifiedAccuracy: computeUnifiedAccuracy(
            filters.mode,
            hits,
            misses,
            falseAlarms,
            correctRejections,
          ),
          avgResponseTimeMs: rtCount > 0 ? rtSum / rtCount : null,
          hits,
          misses,
          falseAlarms,
          correctRejections,
        };
      });
    },

    /**
     * Get time series data (sessions/accuracy/N-level/UPS per day)
     */
    async getTimeSeries(filters: StatsFilters): Promise<TimeSeriesPoint[]> {
      return getTimeSeriesFromSummaries(query, filters);
    },

    /**
     * Get chronological score series (session-by-session, no daily averaging).
     *
     * X-axis is session index within current filters (1..N), sorted by created_at ASC.
     * This series is intentionally independent from calendar aggregation.
     */
    async getSessionScoreSeries(filters: StatsFilters): Promise<SessionScorePoint[]> {
      // No single native mode score exists for mixed "all" view.
      if (filters.mode === 'all') return [];

      const { sql: cte, params } = buildFilteredSessionsCTE(filters);
      const result = await query<{
        created_at: string;
        total_hits: number;
        total_misses: number;
        total_fa: number;
        total_cr: number;
        global_d_prime: number | null;
        ups_score: number | null;
      }>(
        `
      ${cte}
      SELECT
        created_at,
        total_hits,
        total_misses,
        total_fa,
        total_cr,
        global_d_prime,
        ups_score
      FROM filtered_sessions
      ORDER BY created_at ASC
      `,
        params,
      );

      const series: SessionScorePoint[] = [];
      for (const row of result.rows) {
        const hits = Number(row.total_hits ?? 0);
        const misses = Number(row.total_misses ?? 0);
        const falseAlarms = Number(row.total_fa ?? 0);
        const correctRejections = Number(row.total_cr ?? 0);

        let score: number | null = null;

        switch (filters.mode) {
          case 'DualTempo':
          case 'Libre':
            score = row.global_d_prime;
            break;

          case 'DualPlace':
          case 'DualMemo':
          case 'DualPick': {
            const total = hits + misses;
            score = total > 0 ? hits / total : null;
            break;
          }

          case 'BrainWorkshop': {
            const total = hits + misses + falseAlarms + correctRejections;
            score =
              total > 0
                ? (((hits + correctRejections - falseAlarms - misses) / total + 1) / 2) * 100
                : null;
            break;
          }

          case 'DualnbackClassic': {
            const total = hits + misses + falseAlarms;
            score = total > 0 ? ((misses + falseAlarms) / total) * 100 : null;
            break;
          }

          case 'Journey':
            score = row.ups_score;
            break;
        }

        if (score === null || Number.isNaN(score)) continue;
        series.push({
          sessionIndex: series.length + 1,
          createdAt: row.created_at,
          score,
        });
      }

      return series;
    },

    /**
     * Get mode-specific score (d', accuracy, BW score depending on mode)
     */
    async getModeScore(filters: StatsFilters): Promise<ModeScoreStats> {
      if (filters.mode === 'all') {
        return { last: null, avg: null, best: null, worst: null };
      }

      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      // Different metrics per mode
      if (filters.mode === 'DualTempo' || filters.mode === 'Libre') {
        // d' global
        const result = await query<{
          last_dprime: number | null;
          avg_dprime: number | null;
          best_dprime: number | null;
          worst_dprime: number | null;
        }>(
          `
        ${cte},
        last_session AS (
          SELECT global_d_prime FROM filtered_sessions ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          (SELECT global_d_prime FROM last_session) as last_dprime,
          AVG(global_d_prime) as avg_dprime,
          MAX(global_d_prime) as best_dprime,
          MIN(global_d_prime) as worst_dprime
        FROM filtered_sessions
        WHERE global_d_prime IS NOT NULL
      `,
          params,
        );

        const row = result.rows[0];
        return {
          last: row?.last_dprime ?? null,
          avg: row?.avg_dprime ?? null,
          best: row?.best_dprime ?? null,
          worst: row?.worst_dprime ?? null,
        };
      }

      if (
        filters.mode === 'DualPlace' ||
        filters.mode === 'DualMemo' ||
        filters.mode === 'DualPick'
      ) {
        // Accuracy %
        const result = await query<{
          last_accuracy: number | null;
          avg_accuracy: number | null;
          best_accuracy: number | null;
          worst_accuracy: number | null;
        }>(
          `
        ${cte},
        per_session AS (
          SELECT
            created_at,
            CASE
              WHEN (total_hits + total_misses) = 0 THEN NULL
              ELSE total_hits * 1.0 / NULLIF(total_hits + total_misses, 0)
            END as accuracy
          FROM filtered_sessions
        ),
        last_session AS (
          SELECT accuracy FROM per_session ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          (SELECT accuracy FROM last_session) as last_accuracy,
          AVG(accuracy) as avg_accuracy,
          MAX(accuracy) as best_accuracy,
          MIN(accuracy) as worst_accuracy
        FROM per_session
      `,
          params,
        );

        const row = result.rows[0];
        return {
          last: row?.last_accuracy ?? null,
          avg: row?.avg_accuracy ?? null,
          best: row?.best_accuracy ?? null,
          worst: row?.worst_accuracy ?? null,
        };
      }

      if (filters.mode === 'BrainWorkshop') {
        // BW score % = ((H+CR-FA-M)/Total + 1) / 2 * 100
        const result = await query<{
          last_bw: number | null;
          avg_bw: number | null;
          best_bw: number | null;
          worst_bw: number | null;
        }>(
          `
        ${cte},
        per_session AS (
          SELECT
            created_at,
            CASE
              WHEN (total_hits + total_misses + total_fa + total_cr) = 0 THEN NULL
              ELSE (((total_hits + total_cr - total_fa - total_misses) * 1.0 /
                     (total_hits + total_misses + total_fa + total_cr)) + 1) / 2 * 100
            END as bw_score
          FROM filtered_sessions
        ),
        last_session AS (
          SELECT bw_score FROM per_session ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          (SELECT bw_score FROM last_session) as last_bw,
          AVG(bw_score) as avg_bw,
          MAX(bw_score) as best_bw,
          MIN(bw_score) as worst_bw
        FROM per_session
        WHERE bw_score IS NOT NULL
      `,
          params,
        );

        const row = result.rows[0];
        return {
          last: row?.last_bw ?? null,
          avg: row?.avg_bw ?? null,
          best: row?.best_bw ?? null,
          worst: row?.worst_bw ?? null,
        };
      }

      if (filters.mode === 'DualnbackClassic') {
        // Dual N-Back Classic score = global session error rate (%)
        // Formula: (M + FA) / (H + M + FA) * 100, CR excluded.
        const result = await query<{
          last_error_rate: number | null;
          avg_error_rate: number | null;
          best_error_rate: number | null;
          worst_error_rate: number | null;
        }>(
          `
        ${cte}
        , per_session AS (
          SELECT
            created_at,
            CASE
              WHEN (total_hits + total_misses + total_fa) = 0 THEN NULL
              ELSE ((total_misses + total_fa) * 1.0 / NULLIF(total_hits + total_misses + total_fa, 0)) * 100
            END AS error_rate
          FROM filtered_sessions
        ),
        last_session AS (
          SELECT error_rate FROM per_session ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          (SELECT error_rate FROM last_session) as last_error_rate,
          AVG(error_rate) as avg_error_rate,
          MIN(error_rate) as best_error_rate,
          MAX(error_rate) as worst_error_rate
        FROM per_session
        WHERE error_rate IS NOT NULL
      `,
          params,
        );
        const row = result.rows[0];
        return {
          last: row?.last_error_rate ?? null,
          avg: row?.avg_error_rate ?? null,
          best: row?.best_error_rate ?? null,
          worst: row?.worst_error_rate ?? null,
        };
      }

      if (filters.mode === 'Journey') {
        // Journey score = UPS
        const result = await query<{
          last_score: number | null;
          avg_score: number | null;
          best_score: number | null;
          worst_score: number | null;
        }>(
          `
        ${cte},
        per_session AS (
          SELECT
            created_at,
            ups_score as journey_score
          FROM filtered_sessions
          WHERE ups_score IS NOT NULL
        ),
        last_session AS (
          SELECT journey_score FROM per_session ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          (SELECT journey_score FROM last_session) as last_score,
          AVG(journey_score) as avg_score,
          MAX(journey_score) as best_score,
          MIN(journey_score) as worst_score
        FROM per_session
      `,
          params,
        );

        const row = result.rows[0];
        return {
          last: row?.last_score ?? null,
          avg: row?.avg_score ?? null,
          best: row?.best_score ?? null,
          worst: row?.worst_score ?? null,
        };
      }

      return { last: null, avg: null, best: null, worst: null };
    },

    /**
     * Get Zone stats (for Advanced tab)
     * Uses JS percentile() helper instead of PERCENTILE_CONT
     */
    async getZoneStats(filters: StatsFilters): Promise<ZoneStats | null> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      // Fetch raw zone data and calculate percentile in JS
      const result = await query<{
        created_at: string;
        n_level: number;
        total_hits: number;
        total_misses: number;
        total_fa: number;
        total_cr: number;
      }>(
        `
      ${cte}
      SELECT
        created_at,
        n_level,
        total_hits,
        total_misses,
        total_fa,
        total_cr
      FROM filtered_sessions
      ORDER BY created_at DESC
    `,
        params,
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Calculate zones
      const zones: { zone: number; progress: number }[] = [];

      for (const row of result.rows) {
        const hits = row.total_hits;
        const misses = row.total_misses;
        const fa = row.total_fa;
        const cr = row.total_cr;

        // Calculate accuracy
        let accuracy: number | null = null;
        if (hits + misses > 0) {
          if (fa + cr === 0) {
            accuracy = hits / (hits + misses);
          } else {
            const hitRate = hits / (hits + misses);
            const crRate = cr / (fa + cr);
            accuracy = (hitRate + crRate) / 2;
          }
        }

        // Base zone from N-level
        const baseZone = Math.min(19, 1 + (row.n_level - 1) * 3);

        // Calculate bonus and progress
        let bonus = 0;
        let progressFrac = 0;
        if (accuracy !== null && accuracy >= 0.5) {
          const normalized = ((accuracy - 0.5) / 0.5) * 4;
          bonus = Math.floor(normalized);
          progressFrac = normalized - bonus;
        }

        const zone = Math.min(20, Math.max(1, baseZone + bonus));
        const progress = Math.min(100, Math.max(0, progressFrac * 100));

        zones.push({ zone, progress });
      }

      // Current (most recent)
      const current = zones[0];
      if (!current) {
        return null;
      }

      // Median zone
      const zoneValues = zones.map((z) => z.zone);
      const medianZone = percentile(zoneValues, 0.5) ?? 1;

      return {
        currentZone: current.zone,
        medianZone,
        zoneProgress: current.progress,
      };
    },

    /**
     * Get distribution stats (accuracy histogram, stddev, percentiles)
     * Uses JS helpers instead of PERCENTILE_CONT and STDDEV
     */
    async getDistributionStats(filters: StatsFilters): Promise<DistributionStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      // Fetch raw UPS and duration data
      const result = await query<{
        ups_score: number;
        duration_ms: number;
      }>(
        `
      ${cte}
      SELECT ups_score, duration_ms
      FROM filtered_sessions
      WHERE ups_score IS NOT NULL
    `,
        params,
      );

      const upsValues = result.rows.map((r) => r.ups_score);
      const durationValues = result.rows.map((r) => r.duration_ms);

      // Calculate using JS helpers
      const upsStdDev = stddev(upsValues) ?? 0;
      const p25Ups = percentile(upsValues, 0.25) ?? 0;
      const p50Ups = percentile(upsValues, 0.5) ?? 0;
      const p75Ups = percentile(upsValues, 0.75) ?? 0;
      const p25Dur = percentile(durationValues, 0.25) ?? 0;
      const p50Dur = percentile(durationValues, 0.5) ?? 0;
      const p75Dur = percentile(durationValues, 0.75) ?? 0;

      // Calculate buckets
      const buckets = [
        { min: 0, max: 20, count: 0 },
        { min: 20, max: 40, count: 0 },
        { min: 40, max: 60, count: 0 },
        { min: 60, max: 80, count: 0 },
        { min: 80, max: 100, count: 0 },
      ];

      for (const ups of upsValues) {
        const idx = ups < 20 ? 0 : ups < 40 ? 1 : ups < 60 ? 2 : ups < 80 ? 3 : ups <= 100 ? 4 : -1;
        if (idx >= 0 && idx < buckets.length) {
          const bucket = buckets[idx];
          if (bucket) bucket.count++;
        }
      }

      return {
        upsStdDev,
        upsPercentiles: {
          p25: p25Ups,
          p50: p50Ups,
          p75: p75Ups,
        },
        durationPercentiles: {
          p25: p25Dur,
          p50: p50Dur,
          p75: p75Dur,
        },
        upsBuckets: buckets,
      };
    },

    /**
     * Get breakdown by mode (when mode = all)
     */
    async getModeBreakdown(filters: StatsFilters): Promise<ModeBreakdown[]> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        mode: string;
        sessions_count: number;
        total_duration_ms: number;
        unified_accuracy: number;
        avg_n_level: number;
        max_n_level: number;
        avg_ups: number;
      }>(
        `
      ${cte},
      with_mode AS (
        SELECT
          CASE
            WHEN ${JOURNEY_SESSION_SQL} THEN 'Journey'
            WHEN game_mode = 'dualnback-classic' THEN 'DualTempo'
            WHEN game_mode = 'dual-place' THEN 'DualPlace'
            WHEN game_mode = 'dual-memo' THEN 'DualMemo'
            WHEN game_mode = 'dual-pick' THEN 'DualPick'
            WHEN game_mode = 'dualnback-classic' THEN 'DualnbackClassic'
            WHEN game_mode = 'sim-brainworkshop' THEN 'BrainWorkshop'
            WHEN game_mode = 'custom' THEN 'Libre'
            ELSE 'Other'
          END as mode,
          duration_ms,
          n_level,
          total_hits,
          total_misses,
          total_fa,
          total_cr,
          ups_score
        FROM filtered_sessions
      )
      SELECT
        mode,
        COUNT(*) as sessions_count,
        COALESCE(SUM(duration_ms), 0) as total_duration_ms,
        -- Spec-driven accuracy per mode (different formula per mode)
        CASE
          -- DualnbackClassic/BrainWorkshop: hits / (hits + misses + fa), CR excluded
          WHEN mode IN ('DualnbackClassic', 'BrainWorkshop') THEN
            CASE WHEN SUM(total_hits + total_misses + total_fa) = 0 THEN NULL
            ELSE SUM(total_hits) * 1.0 / NULLIF(SUM(total_hits + total_misses + total_fa), 0) END
          -- DualPlace/DualMemo/DualPick: hits / (hits + misses), no FA/CR
          WHEN mode IN ('DualPlace', 'DualMemo', 'DualPick') THEN
            CASE WHEN SUM(total_hits + total_misses) = 0 THEN NULL
            ELSE SUM(total_hits) * 1.0 / NULLIF(SUM(total_hits + total_misses), 0) END
          -- DualTempo/Libre/Journey/Other: SDT Combined (arithmetic mean, no SQRT on Android)
          ELSE
            CASE
              WHEN SUM(total_hits + total_misses) = 0 THEN NULL
              WHEN SUM(total_fa + total_cr) = 0 THEN
                SUM(total_hits) * 1.0 / NULLIF(SUM(total_hits + total_misses), 0)
              ELSE
                (
                  COALESCE(SUM(total_hits) * 1.0 / NULLIF(SUM(total_hits + total_misses), 0), 0) +
                  COALESCE(SUM(total_cr) * 1.0 / NULLIF(SUM(total_fa + total_cr), 0), 0)
                ) / 2.0
            END
        END as unified_accuracy,
        COALESCE(AVG(n_level), 1) as avg_n_level,
        COALESCE(MAX(n_level), 1) as max_n_level,
        COALESCE(
          SUM(
            CASE
              WHEN ups_score IS NOT NULL THEN
                ups_score * (total_hits + total_misses + total_fa + total_cr)
              ELSE 0
            END
          ) / NULLIF(
            SUM(
              CASE
                WHEN ups_score IS NOT NULL THEN (total_hits + total_misses + total_fa + total_cr)
                ELSE 0
              END
            ),
            0
          ),
          0
        ) as avg_ups
      FROM with_mode
      GROUP BY mode
      ORDER BY sessions_count DESC
    `,
        params,
      );

      return result.rows.map((row) => ({
        mode: row.mode,
        sessionsCount: row.sessions_count,
        totalDurationMs: row.total_duration_ms,
        unifiedAccuracy: row.unified_accuracy ?? 0,
        avgNLevel: row.avg_n_level,
        maxNLevel: row.max_n_level,
        avgUps: row.avg_ups,
      }));
    },

    /**
     * Get focus stats from pre-computed session_summaries.
     * Focus metrics are computed during projection and stored in summaries.
     */
    async getFocusStats(filters: StatsFilters): Promise<FocusStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        focus_lost_count: number;
        focus_lost_total_ms: number;
        session_count: number;
      }>(
        `${cte}
      SELECT
        COALESCE(SUM(focus_lost_count), 0) as focus_lost_count,
        COALESCE(SUM(focus_lost_total_ms), 0) as focus_lost_total_ms,
        COUNT(*) as session_count
      FROM filtered_sessions
      `,
        params,
      );

      const row = result.rows[0];
      const sessionCount = row?.session_count ?? 0;
      const focusLostCount = row?.focus_lost_count ?? 0;

      return {
        focusLostCount,
        focusLostTotalMs: row?.focus_lost_total_ms ?? 0,
        avgFocusLostPerSession: sessionCount > 0 ? focusLostCount / sessionCount : 0,
      };
    },

    /**
     * Get timing stats from pre-computed session_summaries.
     * Timing metrics (avg/median RT, during/after stimulus) are computed during projection.
     * Note: percentiles (p25/p75, min/max) and ISI/stimulus duration require event-level data
     * and are not available from summaries.
     */
    async getTimingStats(filters: StatsFilters): Promise<TimingStats> {
      const { sql: cte, params: baseParams } = buildFilteredSessionsCTE(filters);

      // When inputMethod filter is active, we need event-level data
      // (inputMethod is not stored in session_summaries)
      if (filters.inputMethod) {
        const sessionIds = await getFilteredSessionIds(filters);
        const inputMethodFilter = filters.inputMethod;

        // Load all event types in parallel from session_events JSON blobs
        const [responseEvents, filteredEvents, duplicateCount, pipelineEvents, trialEvents] =
          await Promise.all([
            eventReader.getResponseEvents(sessionIds),
            eventReader.getFilteredResponseEvents(sessionIds),
            eventReader.countDuplicateResponseEvents(sessionIds, inputMethodFilter),
            eventReader.getPipelineLatencyEvents(sessionIds),
            eventReader.getTrialPresentedEvents(sessionIds),
          ]);

        // Filter and compute RT values from USER_RESPONDED events
        let computedRtCount = 0;
        const computed = responseEvents
          .filter(
            (r) =>
              typeof r.rt === 'number' &&
              Number.isFinite(r.rt) &&
              r.rt > 0 &&
              (r.responseIndexInTrial === null || r.responseIndexInTrial === 0) &&
              (r.modality === null || r.modality !== 'arithmetic') &&
              r.normalizedInputMethod === inputMethodFilter,
          )
          .map((r) => {
            // biome-ignore lint/style/noNonNullAssertion: filtered upstream to have rt
            const legacyRt = r.rt!;
            const capturedAtMs = r.capturedAtMs;
            const stimulusShownAtMs = r.stimulusShownAtMs;
            const stimulusHiddenAtMs = r.stimulusHiddenAtMs;

            let rtMs = legacyRt;
            let didRecomputeRt = false;
            if (
              typeof capturedAtMs === 'number' &&
              Number.isFinite(capturedAtMs) &&
              typeof stimulusShownAtMs === 'number' &&
              Number.isFinite(stimulusShownAtMs)
            ) {
              const computedRt = capturedAtMs - stimulusShownAtMs;
              if (Number.isFinite(computedRt) && computedRt > 0 && computedRt <= 30000) {
                rtMs = computedRt;
                didRecomputeRt = true;
              }
            }

            if (didRecomputeRt) computedRtCount++;

            let phase = r.phase;
            if (
              typeof capturedAtMs === 'number' &&
              Number.isFinite(capturedAtMs) &&
              typeof stimulusHiddenAtMs === 'number' &&
              Number.isFinite(stimulusHiddenAtMs)
            ) {
              phase = capturedAtMs <= stimulusHiddenAtMs ? 'during_stimulus' : 'after_stimulus';
            }

            let afterOffsetRtMs: number | null = null;
            if (
              typeof capturedAtMs === 'number' &&
              Number.isFinite(capturedAtMs) &&
              typeof stimulusHiddenAtMs === 'number' &&
              Number.isFinite(stimulusHiddenAtMs)
            ) {
              const offsetRt = capturedAtMs - stimulusHiddenAtMs;
              if (Number.isFinite(offsetRt) && offsetRt > 0 && offsetRt <= 30000) {
                afterOffsetRtMs = offsetRt;
              }
            }

            return {
              rtMs,
              phase,
              afterOffsetRtMs,
              processingLagMs:
                typeof r.processingLagMs === 'number' && Number.isFinite(r.processingLagMs)
                  ? r.processingLagMs
                  : null,
            };
          })
          .filter((r) => Number.isFinite(r.rtMs) && r.rtMs > 0);

        const rtValues = computed.map((r) => r.rtMs);
        const duringValues = computed
          .filter((r) => r.phase === 'during_stimulus' || r.phase === 'duringStimulus')
          .map((r) => r.rtMs);
        const afterValues = computed
          .filter((r) => r.phase === 'after_stimulus' || r.phase === 'afterStimulus')
          .map((r) => r.rtMs);
        const afterOffsetValues = computed
          .filter(
            (r) =>
              (r.phase === 'after_stimulus' || r.phase === 'afterStimulus') &&
              typeof r.afterOffsetRtMs === 'number' &&
              Number.isFinite(r.afterOffsetRtMs) &&
              r.afterOffsetRtMs > 0,
          )
          .map((r) => r.afterOffsetRtMs as number);

        const processingLagValues = computed
          .map((r) => r.processingLagMs)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);

        // RESPONSE_FILTERED counts by reason
        let filteredTooFastCount = 0;
        let filteredTouchBounceCount = 0;
        for (const row of filteredEvents) {
          if (row.normalizedInputMethod !== inputMethodFilter) continue;
          if (row.reason === 'too_fast') filteredTooFastCount++;
          if (row.reason === 'touch_bounce') filteredTouchBounceCount++;
        }

        const duplicateResponseCount = duplicateCount;

        // INPUT_PIPELINE_LATENCY
        const inputToDispatchValues = pipelineEvents
          .filter(
            (r) =>
              r.normalizedInputMethod === inputMethodFilter &&
              typeof r.inputToDispatchMs === 'number' &&
              Number.isFinite(r.inputToDispatchMs) &&
              r.inputToDispatchMs >= 0 &&
              r.inputToDispatchMs <= 60000,
          )
          // biome-ignore lint/style/noNonNullAssertion: filtered to have inputToDispatchMs
          .map((r) => r.inputToDispatchMs!);
        const inputToPaintValues = pipelineEvents
          .filter(
            (r) =>
              r.normalizedInputMethod === inputMethodFilter &&
              typeof r.inputToPaintMs === 'number' &&
              Number.isFinite(r.inputToPaintMs) &&
              r.inputToPaintMs >= 0,
          )
          // biome-ignore lint/style/noNonNullAssertion: filtered to have inputToPaintMs
          .map((r) => r.inputToPaintMs!);

        // TRIAL_PRESENTED drift values
        const showDriftValues: number[] = [];
        const hideDriftValues: number[] = [];
        for (const row of trialEvents) {
          if (
            typeof row.audioSyncAtMs === 'number' &&
            Number.isFinite(row.audioSyncAtMs) &&
            typeof row.stimulusShownAtMs === 'number' &&
            Number.isFinite(row.stimulusShownAtMs)
          ) {
            const drift = row.stimulusShownAtMs - row.audioSyncAtMs;
            if (Number.isFinite(drift) && drift >= -60000 && drift <= 60000) {
              showDriftValues.push(drift);
            }
          }
          if (
            typeof row.audioEndedAtMs === 'number' &&
            Number.isFinite(row.audioEndedAtMs) &&
            typeof row.stimulusHiddenAtMs === 'number' &&
            Number.isFinite(row.stimulusHiddenAtMs)
          ) {
            const drift = row.stimulusHiddenAtMs - row.audioEndedAtMs;
            if (Number.isFinite(drift) && drift >= -60000 && drift <= 60000) {
              hideDriftValues.push(drift);
            }
          }
        }

        const duringStimulus = duringValues.length;
        const afterStimulus = afterValues.length;

        return {
          avgResponseTimeMs:
            rtValues.length > 0 ? rtValues.reduce((a, b) => a + b, 0) / rtValues.length : null,
          medianResponseTimeMs: rtValues.length > 0 ? percentile(rtValues, 0.5) : null,
          medianResponseTimeDuringStimulusMs:
            duringValues.length > 0 ? percentile(duringValues, 0.5) : null,
          medianResponseTimeAfterStimulusMs:
            afterValues.length > 0 ? percentile(afterValues, 0.5) : null,
          medianResponseTimeAfterStimulusOffsetMs:
            afterOffsetValues.length > 0
              ? percentile(afterOffsetValues, 0.5)
              : afterValues.length > 0
                ? percentile(afterValues, 0.5)
                : null,
          minResponseTimeMs: rtValues.length > 0 ? Math.min(...rtValues) : null,
          maxResponseTimeMs: rtValues.length > 0 ? Math.max(...rtValues) : null,
          p25ResponseTimeMs: rtValues.length > 0 ? percentile(rtValues, 0.25) : null,
          p75ResponseTimeMs: rtValues.length > 0 ? percentile(rtValues, 0.75) : null,
          avgISIMs: null,
          avgStimulusDurationMs: null,
          responsesDuringStimulus: duringStimulus,
          responsesAfterStimulus: afterStimulus,
          responseCount: rtValues.length,
          computedRtCount,
          processingLagP50Ms:
            processingLagValues.length > 0 ? percentile(processingLagValues, 0.5) : null,
          processingLagP95Ms:
            processingLagValues.length > 0 ? percentile(processingLagValues, 0.95) : null,
          filteredTooFastCount,
          filteredTouchBounceCount,
          duplicateResponseCount,
          inputToDispatchP50Ms:
            inputToDispatchValues.length > 0 ? percentile(inputToDispatchValues, 0.5) : null,
          inputToDispatchP95Ms:
            inputToDispatchValues.length > 0 ? percentile(inputToDispatchValues, 0.95) : null,
          inputToPaintP50Ms:
            inputToPaintValues.length > 0 ? percentile(inputToPaintValues, 0.5) : null,
          inputToPaintP95Ms:
            inputToPaintValues.length > 0 ? percentile(inputToPaintValues, 0.95) : null,
          avShowDriftP50Ms: showDriftValues.length > 0 ? percentile(showDriftValues, 0.5) : null,
          avShowDriftP95Ms: showDriftValues.length > 0 ? percentile(showDriftValues, 0.95) : null,
          avHideDriftP50Ms: hideDriftValues.length > 0 ? percentile(hideDriftValues, 0.5) : null,
          avHideDriftP95Ms: hideDriftValues.length > 0 ? percentile(hideDriftValues, 0.95) : null,
        };
      }

      // Primary path: session_summaries (no events scan needed)
      const summaryResult = await query<{
        avg_rt: number | null;
        median_rt: number | null;
        during_stimulus: number;
        after_stimulus: number;
      }>(
        `
      ${cte}
      SELECT
        AVG(avg_response_time_ms) as avg_rt,
        AVG(median_response_time_ms) as median_rt,
        COALESCE(SUM(responses_during_stimulus), 0) as during_stimulus,
        COALESCE(SUM(responses_after_stimulus), 0) as after_stimulus
      FROM filtered_sessions
      WHERE avg_response_time_ms IS NOT NULL
    `,
        baseParams,
      );

      const summaryRow = summaryResult.rows[0];
      return {
        avgResponseTimeMs: summaryRow?.avg_rt ?? null,
        medianResponseTimeMs: summaryRow?.median_rt ?? null,
        medianResponseTimeDuringStimulusMs: null,
        medianResponseTimeAfterStimulusMs: null,
        medianResponseTimeAfterStimulusOffsetMs: null,
        minResponseTimeMs: null,
        maxResponseTimeMs: null,
        p25ResponseTimeMs: null,
        p75ResponseTimeMs: null,
        avgISIMs: null,
        avgStimulusDurationMs: null,
        responsesDuringStimulus: summaryRow?.during_stimulus ?? 0,
        responsesAfterStimulus: summaryRow?.after_stimulus ?? 0,
        responseCount: (summaryRow?.during_stimulus ?? 0) + (summaryRow?.after_stimulus ?? 0),
      };
    },

    /**
     * Get timing stats grouped by modality (event-level: USER_RESPONDED)
     * Uses JS helpers for percentile and stddev
     */
    async getModalityTimingStats(filters: StatsFilters): Promise<ModalityTimingStats[]> {
      const sessionIds = await getFilteredSessionIds(filters);
      const responseEvents = await eventReader.getResponseEvents(sessionIds);

      // Group by modality and calculate stats
      const byModality = new Map<string, { all: number[]; during: number[] }>();
      const allowedInputMethods = new Set(['keyboard', 'mouse', 'touch']);
      for (const row of responseEvents) {
        if (typeof row.rt !== 'number' || !Number.isFinite(row.rt) || row.rt <= 0) {
          continue;
        }
        if (!row.modality) {
          continue;
        }
        if (row.modality === 'arithmetic') {
          continue;
        }
        // Prefer first response in trial for stability; older events may not have responseIndexInTrial.
        if (typeof row.responseIndexInTrial === 'number' && row.responseIndexInTrial !== 0) {
          continue;
        }

        if (filters.inputMethod) {
          if (filters.inputMethod === 'keyboard') {
            if (row.normalizedInputMethod !== 'keyboard') {
              continue;
            }
          } else if (row.normalizedInputMethod !== filters.inputMethod) {
            continue;
          }
        } else if (!allowedInputMethods.has(row.normalizedInputMethod)) {
          continue;
        }

        const existing = byModality.get(row.modality) ?? { all: [], during: [] };

        const capturedAtMs = row.capturedAtMs;
        const stimulusShownAtMs = row.stimulusShownAtMs;
        const stimulusHiddenAtMs = row.stimulusHiddenAtMs;

        let rtMs = row.rt;
        if (
          typeof capturedAtMs === 'number' &&
          Number.isFinite(capturedAtMs) &&
          typeof stimulusShownAtMs === 'number' &&
          Number.isFinite(stimulusShownAtMs)
        ) {
          const computedRt = capturedAtMs - stimulusShownAtMs;
          if (Number.isFinite(computedRt) && computedRt > 0 && computedRt <= 30000) {
            rtMs = computedRt;
          }
        }

        let phase: string | null = row.phase;
        if (
          typeof capturedAtMs === 'number' &&
          Number.isFinite(capturedAtMs) &&
          typeof stimulusHiddenAtMs === 'number' &&
          Number.isFinite(stimulusHiddenAtMs)
        ) {
          phase = capturedAtMs <= stimulusHiddenAtMs ? 'during_stimulus' : 'after_stimulus';
        }

        existing.all.push(rtMs);
        if (phase === 'during_stimulus' || phase === 'duringStimulus') {
          existing.during.push(rtMs);
        }
        byModality.set(row.modality, existing);
      }

      const stats: ModalityTimingStats[] = [];
      for (const [modality, buckets] of byModality) {
        const count = buckets.all.length;
        const avgRt = count > 0 ? buckets.all.reduce((a, b) => a + b, 0) / count : 0;
        const medianRt = percentile(buckets.all, 0.5);
        const stdDevRt = stddev(buckets.all);
        const duringCount = buckets.during.length;
        const avgDuring =
          duringCount > 0 ? buckets.during.reduce((a, b) => a + b, 0) / duringCount : null;
        const stdDevDuring = duringCount > 0 ? stddev(buckets.during) : null;

        stats.push({
          modality,
          avgResponseTimeMs: avgRt,
          medianResponseTimeMs: medianRt,
          stdDevResponseTimeMs: stdDevRt,
          count,
          duringCount,
          avgDuringResponseTimeMs: avgDuring,
          stdDevDuringResponseTimeMs: stdDevDuring,
          hasReliableData: count >= 5 && stdDevRt !== null,
          isSmallSample: count < 10,
        });
      }

      return stats.sort((a, b) => a.modality.localeCompare(b.modality));
    },

    /**
     * Get Post-Error Slowing (PES) stats per modality
     *
     * Definition aligned with TempoConfidence scoring:
     * - Identify errors per modality: miss or false alarm
     * - For each error, look ahead up to `TEMPO_PES_THRESHOLDS.lookaheadTrials` to find the first *hit*
     * - PES uses RT on those post-error hits compared to baseline hit RTs
     */
    async getPostErrorSlowingStats(filters: StatsFilters): Promise<PostErrorSlowingStats[]> {
      const sessionIds = await getFilteredSessionIds(filters);

      // Load trial and response events in parallel from session_events JSON blobs
      const [trialEventsRaw, responseEventsRaw] = await Promise.all([
        eventReader.getTrialPresentedEvents(sessionIds),
        eventReader.getResponseEvents(sessionIds),
      ]);

      type Modality = 'position' | 'audio';
      type TrialTargets = { position: boolean; audio: boolean };
      type ResponseRtByModality = Partial<Record<Modality, number>>;

      const trialsBySession = new Map<string, Map<number, TrialTargets>>();
      for (const row of trialEventsRaw) {
        if (!row.sessionId) continue;
        if (typeof row.trialIndex !== 'number' || !Number.isFinite(row.trialIndex)) continue;

        const sessionTrials = trialsBySession.get(row.sessionId) ?? new Map<number, TrialTargets>();
        sessionTrials.set(row.trialIndex, {
          position: row.isPositionTarget,
          audio: row.isAudioTarget,
        });
        trialsBySession.set(row.sessionId, sessionTrials);
      }

      const rtsBySession = new Map<string, Map<number, ResponseRtByModality>>();
      const allowedInputMethods = new Set<StatsInputMethod>(['keyboard', 'mouse', 'touch']);

      for (const row of responseEventsRaw) {
        if (!row.sessionId) continue;
        if (row.modality !== 'position' && row.modality !== 'audio') continue;
        if (typeof row.trialIndex !== 'number' || !Number.isFinite(row.trialIndex)) continue;
        if (typeof row.rt !== 'number' || !Number.isFinite(row.rt) || row.rt <= 0) continue;
        if (typeof row.responseIndexInTrial === 'number' && row.responseIndexInTrial !== 0) {
          continue;
        }

        if (filters.inputMethod) {
          if (row.normalizedInputMethod !== filters.inputMethod) continue;
        } else if (!allowedInputMethods.has(row.normalizedInputMethod as StatsInputMethod)) {
          continue;
        }

        const capturedAtMs = row.capturedAtMs;
        const stimulusShownAtMs = row.stimulusShownAtMs;
        let rtMs = row.rt;
        if (
          typeof capturedAtMs === 'number' &&
          Number.isFinite(capturedAtMs) &&
          typeof stimulusShownAtMs === 'number' &&
          Number.isFinite(stimulusShownAtMs)
        ) {
          const computedRt = capturedAtMs - stimulusShownAtMs;
          if (Number.isFinite(computedRt) && computedRt > 0 && computedRt <= 30000) {
            rtMs = computedRt;
          }
        }

        if (!Number.isFinite(rtMs) || rtMs <= 0 || rtMs > 30000) continue;

        const sessionTrials = trialsBySession.get(row.sessionId);
        if (!sessionTrials?.has(row.trialIndex)) continue;

        const sessionRts =
          rtsBySession.get(row.sessionId) ?? new Map<number, ResponseRtByModality>();
        const byTrial = sessionRts.get(row.trialIndex) ?? {};
        const modality = row.modality as Modality;

        const existing = byTrial[modality];
        if (existing === undefined || rtMs < existing) {
          byTrial[modality] = rtMs;
        }
        sessionRts.set(row.trialIndex, byTrial);
        rtsBySession.set(row.sessionId, sessionRts);
      }

      const mean = (values: readonly number[]): number =>
        values.reduce((a, b) => a + b, 0) / values.length;

      const rows: PostErrorSlowingStats[] = [];

      const modalities: readonly Modality[] = ['position', 'audio'];
      for (const modality of modalities) {
        const hitRTs: number[] = [];
        const postErrorHitRTs: number[] = [];

        for (const [sessionId, sessionTrials] of trialsBySession) {
          const trialIndices = [...sessionTrials.keys()].sort((a, b) => a - b);
          const sessionRts = rtsBySession.get(sessionId);

          const outcomeByTrial = new Map<
            number,
            'hit' | 'false_alarm' | 'miss' | 'correct_rejection'
          >();
          const rtByTrial = new Map<number, number>();

          for (const trialIndex of trialIndices) {
            const targets = sessionTrials.get(trialIndex);
            if (!targets) continue;
            const isTarget = modality === 'position' ? targets.position : targets.audio;
            const rt = sessionRts?.get(trialIndex)?.[modality];

            if (typeof rt === 'number' && Number.isFinite(rt) && rt > 0) {
              rtByTrial.set(trialIndex, rt);
              outcomeByTrial.set(trialIndex, isTarget ? 'hit' : 'false_alarm');
              if (isTarget) hitRTs.push(rt);
            } else {
              outcomeByTrial.set(trialIndex, isTarget ? 'miss' : 'correct_rejection');
            }
          }

          for (const trialIndex of trialIndices) {
            const outcome = outcomeByTrial.get(trialIndex);
            if (outcome !== 'miss' && outcome !== 'false_alarm') continue;

            const max = trialIndex + Math.max(1, TEMPO_PES_THRESHOLDS.lookaheadTrials);
            for (let t = trialIndex + 1; t <= max; t++) {
              if (!outcomeByTrial.has(t)) continue;
              if (outcomeByTrial.get(t) !== 'hit') continue;
              const rt = rtByTrial.get(t);
              if (typeof rt === 'number' && Number.isFinite(rt) && rt > 0) {
                postErrorHitRTs.push(rt);
                break;
              }
            }
          }
        }

        if (hitRTs.length === 0) continue;

        const avgRtOnHitsMs = mean(hitRTs);
        const hitTrialCount = hitRTs.length;
        const postErrorTrialCount = postErrorHitRTs.length;
        const avgRtAfterErrorMs = postErrorHitRTs.length > 0 ? mean(postErrorHitRTs) : null;
        const pesRatio =
          avgRtAfterErrorMs !== null &&
          avgRtOnHitsMs > 0 &&
          postErrorTrialCount >= TEMPO_PES_THRESHOLDS.minPairs
            ? avgRtAfterErrorMs / avgRtOnHitsMs
            : null;

        rows.push({
          modality,
          avgRtOnHitsMs,
          hitTrialCount,
          avgRtAfterErrorMs,
          pesRatio,
          postErrorTrialCount,
        });
      }

      return rows.sort((a, b) => a.modality.localeCompare(b.modality));
    },

    /**
     * Get Place confidence stats (only for DualPlace mode)
     */
    async getPlaceConfidenceStats(filters: StatsFilters): Promise<PlaceConfidenceStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        confidence_avg: number | null;
        confidence_last: number | null;
        directness_avg: number | null;
        wrong_dwell_total: number | null;
      }>(
        `
      ${cte},
      last_session AS (
        SELECT flow_confidence_score, flow_directness_ratio
        FROM filtered_sessions
        WHERE game_mode IN ('dual-place', 'flow')
        ORDER BY created_at DESC LIMIT 1
      )
      SELECT
        AVG(flow_confidence_score) as confidence_avg,
        (SELECT flow_confidence_score FROM last_session) as confidence_last,
        AVG(flow_directness_ratio) as directness_avg,
        SUM(flow_wrong_slot_dwell_ms) as wrong_dwell_total
      FROM filtered_sessions
      WHERE game_mode IN ('dual-place', 'flow')
    `,
        params,
      );

      const row = result.rows[0];
      return {
        confidenceScoreAvg: row?.confidence_avg ?? null,
        confidenceScoreLast: row?.confidence_last ?? null,
        directnessRatioAvg: row?.directness_avg ?? null,
        wrongSlotDwellMsTotal: row?.wrong_dwell_total ?? null,
      };
    },

    /**
     * Get Recall/Memo confidence stats (only for DualMemo mode)
     */
    async getMemoConfidenceStats(filters: StatsFilters): Promise<MemoConfidenceStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        confidence_avg: number | null;
        confidence_last: number | null;
        fluency_avg: number | null;
        fluency_last: number | null;
        corrections_total: number | null;
      }>(
        `
      ${cte},
      last_session AS (
        SELECT recall_confidence_score, recall_fluency_score
        FROM filtered_sessions
        WHERE game_mode = 'dual-memo'
        ORDER BY created_at DESC LIMIT 1
      )
      SELECT
        AVG(recall_confidence_score) as confidence_avg,
        (SELECT recall_confidence_score FROM last_session) as confidence_last,
        AVG(recall_fluency_score) as fluency_avg,
        (SELECT recall_fluency_score FROM last_session) as fluency_last,
        SUM(recall_corrections_count) as corrections_total
      FROM filtered_sessions
      WHERE game_mode = 'dual-memo'
    `,
        params,
      );

      const row = result.rows[0];
      return {
        confidenceScoreAvg: row?.confidence_avg ?? null,
        confidenceScoreLast: row?.confidence_last ?? null,
        fluencyScoreAvg: row?.fluency_avg ?? null,
        fluencyScoreLast: row?.fluency_last ?? null,
        correctionsCountTotal: row?.corrections_total ?? null,
      };
    },

    /**
     * Get error profile stats (§6.2.D, §8.5bis)
     * Cross-mode: uses unified counts (proxies Flow/Memo included)
     */
    async getErrorProfileStats(filters: StatsFilters): Promise<ErrorProfileStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        hits: number;
        misses: number;
        fa: number;
        cr: number;
        error_rate: number;
        miss_share: number | null;
        fa_share: number | null;
      }>(
        `
      ${cte}
      SELECT
        COALESCE(SUM(total_hits), 0) as hits,
        COALESCE(SUM(total_misses), 0) as misses,
        COALESCE(SUM(total_fa), 0) as fa,
        COALESCE(SUM(total_cr), 0) as cr,
        COALESCE(
          (SUM(total_misses) + SUM(total_fa)) * 1.0 / NULLIF(SUM(total_hits + total_misses + total_fa), 0),
          0
        ) as error_rate,
        CASE
          WHEN (SUM(total_misses) + SUM(total_fa)) = 0 THEN NULL
          ELSE SUM(total_misses) * 1.0 / (SUM(total_misses) + SUM(total_fa))
        END as miss_share,
        CASE
          WHEN (SUM(total_misses) + SUM(total_fa)) = 0 THEN NULL
          ELSE SUM(total_fa) * 1.0 / (SUM(total_misses) + SUM(total_fa))
        END as fa_share
      FROM filtered_sessions
    `,
        params,
      );

      const row = result.rows[0];
      return {
        errorRate: row?.error_rate ?? 0,
        missShare: row?.miss_share ?? null,
        faShare: row?.fa_share ?? null,
        totalHits: row?.hits ?? 0,
        totalMisses: row?.misses ?? 0,
        totalFalseAlarms: row?.fa ?? 0,
        totalCorrectRejections: row?.cr ?? 0,
      };
    },

    /**
     * Get UPS stats (weighted by actions, §8.3)
     */
    async getUPSStats(filters: StatsFilters): Promise<UPSStats> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{
        ups_score: number;
        ups_score_last: number | null;
        ups_score_best: number | null;
      }>(
        `
      ${cte},
      last_session AS (
        SELECT ups_score FROM filtered_sessions
        WHERE ups_score IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      )
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN ups_score IS NOT NULL THEN
                ups_score * (total_hits + total_misses + total_fa + total_cr)
              ELSE 0
            END
          ) / NULLIF(
            SUM(
              CASE
                WHEN ups_score IS NOT NULL THEN (total_hits + total_misses + total_fa + total_cr)
                ELSE 0
              END
            ),
            0
          ),
          0
        ) AS ups_score,
        (SELECT ups_score FROM last_session) as ups_score_last,
        MAX(ups_score) as ups_score_best
      FROM filtered_sessions
    `,
        params,
      );

      const row = result.rows[0];
      return {
        upsScore: row?.ups_score ?? 0,
        upsScoreLast: row?.ups_score_last ?? null,
        upsScoreBest: row?.ups_score_best ?? null,
      };
    },

    /**
     * Get available input methods from the data (for dynamic filter options)
     * Only returns input methods that have at least one USER_RESPONDED event
     */
    async getAvailableInputMethods(filters: StatsFilters): Promise<StatsInputMethod[]> {
      const { sql: cte, params } = buildFilteredSessionsCTE(filters);

      const result = await query<{ input_methods: string }>(
        `${cte}
        SELECT DISTINCT input_methods
        FROM filtered_sessions
        WHERE input_methods IS NOT NULL AND input_methods != ''`,
        params,
      );

      // Explode comma-separated values and deduplicate
      const validMethods: StatsInputMethod[] = ['keyboard', 'mouse', 'touch'];
      const found = new Set<StatsInputMethod>();
      for (const row of result.rows) {
        for (const method of row.input_methods.split(',')) {
          const trimmed = method.trim() as StatsInputMethod;
          if (validMethods.includes(trimmed)) {
            found.add(trimmed);
          }
        }
      }
      return [...found].sort();
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Strip inputMethod from filters before cache key computation.
 *
 * Only getTimingStats, getModalityTimingStats and getPostErrorSlowingStats
 * filter rows by inputMethod in SQL. All other endpoints ignore it entirely.
 * Using the full filters object (including inputMethod) as cache key for those
 * endpoints causes unnecessary cache misses when the AdvancedStatsTab
 * auto-picks a better input method after the initial load.
 */
function withoutInputMethod(filters: StatsFilters): StatsFilters {
  if (!filters.inputMethod) return filters;
  const { inputMethod: _dropped, ...rest } = filters;
  return rest as StatsFilters;
}

/**
 * Create a stats adapter with explicit persistence injection.
 * Only needs SQLQueryPort (read-only SQL queries).
 */
export function createStatsAdapter(persistence: SQLQueryPort): StatsPort {
  const reader = createEventStatsReader(persistence);
  const base = createStatsAdapterWithQuery(persistence.query.bind(persistence), reader);
  let cache = statsCacheByPersistence.get(persistence);
  if (!cache) {
    cache = createStatsCache(persistence);
    statsCacheByPersistence.set(persistence, cache);
  }

  return {
    // inputMethod stripped from cache key — these endpoints ignore it in SQL.
    getActivityStats: (filters) =>
      cache.getOrCompute('getActivityStats', withoutInputMethod(filters), () =>
        base.getActivityStats(filters),
      ),
    getPerformanceStats: (filters) =>
      cache.getOrCompute('getPerformanceStats', withoutInputMethod(filters), () =>
        base.getPerformanceStats(filters),
      ),
    getModalityStats: (filters) =>
      cache.getOrCompute('getModalityStats', withoutInputMethod(filters), () =>
        base.getModalityStats(filters),
      ),
    getTimeSeries: (filters) =>
      cache.getOrCompute('getTimeSeries', withoutInputMethod(filters), () =>
        base.getTimeSeries(filters),
      ),
    getSessionScoreSeries: (filters) =>
      cache.getOrCompute(
        'getSessionScoreSeries',
        withoutInputMethod(filters),
        () => base.getSessionScoreSeries?.(filters) ?? Promise.resolve([]),
      ),
    getModeScore: (filters) =>
      cache.getOrCompute('getModeScore', withoutInputMethod(filters), () =>
        base.getModeScore(filters),
      ),
    getZoneStats: (filters) =>
      cache.getOrCompute('getZoneStats', withoutInputMethod(filters), () =>
        base.getZoneStats(filters),
      ),
    getDistributionStats: (filters) =>
      cache.getOrCompute('getDistributionStats', withoutInputMethod(filters), () =>
        base.getDistributionStats(filters),
      ),
    getModeBreakdown: (filters) =>
      cache.getOrCompute('getModeBreakdown', withoutInputMethod(filters), () =>
        base.getModeBreakdown(filters),
      ),
    getFocusStats: (filters) =>
      cache.getOrCompute('getFocusStats', withoutInputMethod(filters), () =>
        base.getFocusStats(filters),
      ),
    getErrorProfileStats: (filters) =>
      cache.getOrCompute('getErrorProfileStats', withoutInputMethod(filters), () =>
        base.getErrorProfileStats(filters),
      ),
    getUPSStats: (filters) =>
      cache.getOrCompute('getUPSStats', withoutInputMethod(filters), () =>
        base.getUPSStats(filters),
      ),
    getPlaceConfidenceStats: (filters) =>
      cache.getOrCompute('getPlaceConfidenceStats', withoutInputMethod(filters), () =>
        base.getPlaceConfidenceStats(filters),
      ),
    getMemoConfidenceStats: (filters) =>
      cache.getOrCompute('getMemoConfidenceStats', withoutInputMethod(filters), () =>
        base.getMemoConfidenceStats(filters),
      ),
    getAvailableInputMethods: (filters) =>
      cache.getOrCompute('getAvailableInputMethods', withoutInputMethod(filters), () =>
        base.getAvailableInputMethods(filters),
      ),
    // inputMethod kept in cache key — these endpoints filter SQL by inputMethod.
    getTimingStats: (filters) =>
      cache.getOrCompute('getTimingStats', filters, () => base.getTimingStats(filters)),
    getModalityTimingStats: (filters) =>
      cache.getOrCompute('getModalityTimingStats', filters, () =>
        base.getModalityTimingStats(filters),
      ),
    getPostErrorSlowingStats: (filters) =>
      cache.getOrCompute('getPostErrorSlowingStats', filters, () =>
        base.getPostErrorSlowingStats(filters),
      ),
  };
}

// NOTE: Legacy singleton `statsAdapter` removed.
// Use injected `createStatsAdapter(persistence)` or the app-level adapter factory.
