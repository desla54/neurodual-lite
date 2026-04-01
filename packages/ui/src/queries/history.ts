/**
 * History Queries
 *
 * Reactive read-models are provided by infra via ReadModelPort.
 * TanStack Query is only used for mutations (delete, import, export).
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BrainWorkshopSessionData,
  HistoryModalityStats,
  HistoryPort,
  SessionEndReportModel,
  SessionHistoryExport,
  SessionHistoryItem,
  SessionSummariesCursor,
  SessionSummariesFilters,
  SessionSummaryRow as SessionSummaryRowPort,
} from '@neurodual/logic';
import {
  calculateBrainWorkshopStrikes,
  computeUnifiedMetrics,
  normalizeModeId,
  resolveGameModeIdsForStatsMode,
  SCORING_THRESHOLDS,
} from '@neurodual/logic';
import { useSubscribable } from '../reactive/use-subscribable';
import { profileDevEffectSync } from '../debug/dev-effect-profiler';
import { useCurrentUser } from './auth';
import {
  dbRowToSessionSummaryRow,
  filterValidRows,
  historyLiteSignature,
  normalizeSessionSummaryListRows,
  parseConsecutiveStrikesFromJourneyContext,
  parseHistoryModalityStats,
  parseJourneyStageId,
  parseSqlDate,
  parseSqlDateToMs,
  rowToHistoryItem,
  rowToHistoryItemLite,
  LatestJourneySessionRowSchema,
  SessionSummaryDetailsRowSchema,
  type SessionSummaryRowDb,
} from './history-row-model';
import { queryKeys } from './keys';
import { getReadModelsAdapter } from './read-models';

// =============================================================================
// Adapter Reference (injected via Provider) - only for mutations
// =============================================================================

let historyAdapter: HistoryPort | null = null;
const EMPTY_SESSION_DETAILS_SNAPSHOT = { data: [], isPending: false, error: null } as const;
const EMPTY_SESSION_DETAILS_STORE = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_SESSION_DETAILS_SNAPSHOT,
};

export function setHistoryAdapter(adapter: HistoryPort): void {
  historyAdapter = adapter;
}

export function getHistoryAdapter(): HistoryPort {
  if (!historyAdapter) {
    throw new Error('History adapter not initialized. Call setHistoryAdapter first.');
  }
  return historyAdapter;
}

export function getOptionalHistoryAdapter(): HistoryPort | null {
  return historyAdapter;
}

// =============================================================================
// Shared helper (used by tests)
// =============================================================================

const DEFAULT_ACTIVE_MODALITIES_CSV = 'audio,position';

function normalizeModalitiesCsv(modalities: ReadonlySet<string>): string {
  return Array.from(modalities).sort().join(',');
}

function buildInPlaceholders(values: readonly unknown[]): { sql: string; params: unknown[] } {
  const placeholders = values.map(() => '?').join(',');
  return { sql: `(${placeholders})`, params: [...values] };
}

/**
 * Build a SQL WHERE clause for session_summaries filters.
 * This is a pure helper for UI/tests; it is NOT used for reactivity.
 */
export function buildSessionSummariesWhere(
  userId: string,
  filters: SessionSummariesFilters,
): { whereSql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  clauses.push('user_id = ?');
  params.push(userId);

  // Only completed sessions are considered in stats/history views.
  clauses.push("(reason IS NULL OR reason = 'completed')");

  // Mode filter
  if (filters.mode !== 'all') {
    if (filters.mode === 'Journey') {
      clauses.push(`play_context = 'journey'`);
      if (filters.journeyFilter !== 'all') {
        clauses.push('journey_id = ?');
        params.push(filters.journeyFilter);
      }
    } else if (filters.mode === 'Libre') {
      clauses.push(`play_context = 'free'`);
      if (filters.freeModeFilter !== 'all') {
        const expected = resolveGameModeIdsForStatsMode(
          filters.freeModeFilter as Parameters<typeof resolveGameModeIdsForStatsMode>[0],
        );
        if (!expected || expected.length === 0) {
          clauses.push('1 = 0');
        } else {
          const { sql, params: inParams } = buildInPlaceholders(expected);
          clauses.push(`game_mode IN ${sql}`);
          params.push(...inParams);
        }
      }
    } else {
      const expected = resolveGameModeIdsForStatsMode(
        filters.mode as Parameters<typeof resolveGameModeIdsForStatsMode>[0],
      );
      if (!expected || expected.length === 0) {
        clauses.push('1 = 0');
      } else {
        const { sql, params: inParams } = buildInPlaceholders(expected);
        clauses.push(`game_mode IN ${sql}`);
        params.push(...inParams);
      }
    }
  }

  // Exact modalities match (same behavior as the UI filter)
  if (filters.modalities.size > 0) {
    clauses.push(`COALESCE(active_modalities_csv, '${DEFAULT_ACTIVE_MODALITIES_CSV}') = ?`);
    params.push(normalizeModalitiesCsv(filters.modalities));
  }

  // Date range (ISO strings are lexicographically comparable)
  if (filters.startDate) {
    clauses.push('created_at >= ?');
    params.push(filters.startDate.toISOString());
  }
  if (filters.endDate) {
    const endOfDay = new Date(filters.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    clauses.push('created_at <= ?');
    params.push(endOfDay.toISOString());
  }

  // N-level filter
  if (filters.nLevels.size > 0) {
    const levels = Array.from(filters.nLevels).sort((a, b) => a - b);
    const { sql, params: inParams } = buildInPlaceholders(levels);
    clauses.push(`n_level IN ${sql}`);
    params.push(...inParams);
  }

  return {
    whereSql: `WHERE ${clauses.join('\n  AND ')}`,
    params,
  };
}

export function buildJourneyRecordableSessionsCompiledQuery(
  userIds: readonly string[],
  journeyId: string,
): { sql: string; parameters: readonly unknown[] } {
  const effectiveUserIds = Array.from(
    new Set(userIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  const placeholders = effectiveUserIds.map(() => '?').join(', ');

  return {
    sql: `SELECT
        session_id,
        created_at,
        journey_stage_id,
        journey_id,
        n_level,
        global_d_prime,
        game_mode,
        ups_score,
        passed,
        by_modality
      FROM "session_summaries"
      WHERE "user_id" in (${placeholders})
        AND "journey_id" = ?
        AND "play_context" = 'journey'
        AND "journey_stage_id" is not null
        AND ("reason" is null OR "reason" = 'completed')
      ORDER BY "created_at", "session_id"`,
    parameters: [...effectiveUserIds, journeyId],
  };
}

// Re-export types for UI consumers.
export type { SessionSummariesCursor, SessionSummariesFilters };

// =============================================================================
// Read-model hooks
// =============================================================================

/** Inline replacement for deleted JourneyProjectionSession from logic */
export interface JourneyProjectionSession {
  journeyStageId?: number;
  journeyId?: string;
  nLevel?: number;
  dPrime: number;
  gameMode?: string;
  upsScore?: number | null;
  timestamp?: number;
  byModality?: Record<string, HistoryModalityStats>;
  passed?: boolean;
  sessionId?: string;
  adaptivePathProgressPct?: number;
}

export function useJourneyRecordableSessionsQuery(
  journeyId: string | null,
  journeyGameMode?: string | null,
): {
  data: JourneyProjectionSession[];
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const normalizedJourneyMode = journeyGameMode ? normalizeModeId(journeyGameMode) : null;

  const effectiveJourneyId = journeyId ?? '';
  const enabled = journeyId != null && journeyId !== '';

  const snap = useSubscribable(
    getReadModelsAdapter().historyJourneyRecordableSessions(user?.id ?? null, effectiveJourneyId),
  );
  const rows = snap.data as Array<{
    session_id: string;
    created_at: string | null;
    journey_stage_id: string | null;
    journey_id: string | null;
    n_level: number;
    global_d_prime: number | null;
    game_mode: string | null;
    ups_score: number | null;
    passed: number | null;
    by_modality: string | null;
  }>;

  const sessions = useMemo<JourneyProjectionSession[]>(() => {
    if (!enabled) return [];
    if (!rows) return [];
    const out: JourneyProjectionSession[] = [];

    for (const row of rows) {
      const rowGameMode = row.game_mode ? normalizeModeId(row.game_mode) : null;
      if (normalizedJourneyMode) {
        if (rowGameMode && rowGameMode !== normalizedJourneyMode) continue;
      }

      const stageId = parseJourneyStageId(row.journey_stage_id);
      if (stageId == null) continue;
      if (!row.journey_id) continue;
      const createdAtMs = parseSqlDateToMs(row.created_at);
      if (createdAtMs == null) continue;

      const byModality: Record<string, HistoryModalityStats> = {};
      for (const [modality, stats] of Object.entries(parseHistoryModalityStats(row.by_modality))) {
        byModality[modality] = {
          ...stats,
          avgRT: null,
        };
      }

      out.push({
        journeyStageId: stageId,
        journeyId: row.journey_id,
        nLevel: Number(row.n_level),
        dPrime: Number(row.global_d_prime ?? 0),
        gameMode: rowGameMode ?? undefined,
        upsScore: row.ups_score ?? undefined,
        timestamp: createdAtMs,
        byModality: Object.keys(byModality).length > 0 ? byModality : undefined,
        passed: row.passed === 1 ? true : row.passed === 0 ? false : undefined,
      });
    }

    out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return out;
  }, [enabled, rows, rows?.length, normalizedJourneyMode]);

  return {
    data: sessions,
    isPending: enabled ? snap.isPending : false,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useAvailableJourneyIdsQuery(): {
  journeyIds: string[];
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const snap = useSubscribable(getReadModelsAdapter().historyAvailableJourneyIds(user?.id ?? null));
  const rows = snap.data as Array<{ journey_id: string | null }>;

  const journeyIds = useMemo(() => {
    const ids = (rows ?? []).map((r) => r.journey_id).filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
  }, [rows, rows?.length]);

  return {
    journeyIds,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useSessionSummariesFilteredCountQuery(filters: SessionSummariesFilters): {
  count: number;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();
  const countSnap = useSubscribable(
    readModels.historySessionSummariesFilteredCount(user?.id ?? null, filters),
  );
  const idsSnap = useSubscribable(
    readModels.historySessionSummariesFilteredIds(user?.id ?? null, filters),
  );

  const countRows = countSnap.data as Array<{ count: number }>;
  const idRows = idsSnap.data as Array<{ session_id: string }>;

  const aggregateCount = Number(countRows?.[0]?.count ?? 0);
  const distinctCount = idRows?.length ?? 0;

  return {
    count: Math.max(aggregateCount, distinctCount),
    isPending: countSnap.isPending || idsSnap.isPending,
    error:
      (countSnap.error ?? idsSnap.error) ? new Error(countSnap.error ?? idsSnap.error ?? '') : null,
  };
}

export function useSessionSummariesPageQuery(
  filters: SessionSummariesFilters,
  cursor: SessionSummariesCursor | null,
  pageSize: number = 20,
): {
  sessions: SessionHistoryItem[];
  nextCursor: SessionSummariesCursor | null;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const userId = user?.id ?? 'local';
  const historyLiteCacheRef = useRef(
    new Map<string, { signature: string; item: SessionHistoryItem }>(),
  );

  const snap = useSubscribable(
    getReadModelsAdapter().historySessionSummariesPage(user?.id ?? null, filters, cursor, pageSize),
  );
  const validRows = useMemo(
    () => normalizeSessionSummaryListRows(snap.data, 'useSessionSummariesPageQuery'),
    [snap.data, (snap.data as unknown[] | undefined)?.length],
  );

  const sessions = useMemo(() => {
    if (!validRows) return [];
    const nextCache = new Map<string, { signature: string; item: SessionHistoryItem }>();
    const out: SessionHistoryItem[] = [];

    for (const row of validRows) {
      const cacheKey = `${userId}:${row.session_id}`;
      const signature = historyLiteSignature(row);
      const cached = historyLiteCacheRef.current.get(cacheKey);
      if (cached && cached.signature === signature) {
        out.push(cached.item);
        nextCache.set(cacheKey, cached);
        continue;
      }
      const item = rowToHistoryItemLite(row);
      out.push(item);
      nextCache.set(cacheKey, { signature, item });
    }

    historyLiteCacheRef.current = nextCache;
    return out;
  }, [userId, validRows, validRows.length]);

  const nextCursor = useMemo<SessionSummariesCursor | null>(() => {
    const last = validRows[validRows.length - 1];
    if (!last) return null;
    return { createdAt: last.created_at ?? '', sessionId: last.session_id };
  }, [validRows, validRows.length]);

  return {
    sessions,
    nextCursor,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useSessionSummariesHeaderCountsQuery(filters: SessionSummariesFilters): {
  filteredCount: number;
  totalCount: number;
  isPending: boolean;
  error: Error | null;
} {
  // Avoid nested compiled SQL (fragile across SQLite/PowerSync versions).
  // Compose counts from two simpler watched queries instead.
  const filtered = useSessionSummariesFilteredCountQuery(filters);
  const total = useSessionSummariesCountQuery();

  const totalCount = Math.max(0, total.count, filtered.count);
  const filteredCount = Math.max(0, Math.min(filtered.count, totalCount));

  return {
    filteredCount,
    totalCount,
    isPending: filtered.isPending || total.isPending,
    error: filtered.error ?? total.error,
  };
}

export function useSessionSummariesCountQuery(): {
  count: number;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();
  const countSnap = useSubscribable(readModels.historySessionSummariesCount(user?.id ?? null));
  const idsSnap = useSubscribable(readModels.historySessionSummariesIds(user?.id ?? null));
  const countRows = countSnap.data as Array<{ count: number }>;
  const idRows = idsSnap.data as Array<{ session_id: string }>;

  const aggregateCount = Number(countRows?.[0]?.count ?? 0);
  const distinctCount = idRows?.length ?? 0;

  return {
    count: Math.max(aggregateCount, distinctCount),
    isPending: countSnap.isPending || idsSnap.isPending,
    error:
      (countSnap.error ?? idsSnap.error) ? new Error(countSnap.error ?? idsSnap.error ?? '') : null,
  };
}

/**
 * Returns the game_mode of the most recent completed session among the given mode IDs.
 * Used to auto-select the last played mode when switching stats tabs.
 */
export function useLatestStatsGameModeQuery(gameModeIds: readonly string[]): {
  gameMode: string | null;
  isPending: boolean;
} {
  const user = useCurrentUser();
  const stableIds = useMemo(() => gameModeIds, [gameModeIds.join(',')]);
  const snap = useSubscribable(
    getReadModelsAdapter().historyLatestStatsGameMode(user?.id ?? null, stableIds),
  );
  const rows = snap.data as Array<{ game_mode: string | null }>;
  return {
    gameMode: rows?.[0]?.game_mode ?? null,
    isPending: snap.isPending,
  };
}

export function useMaxAchievedLevelForModeQuery(gameMode: string): {
  maxLevel: number | null;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const normalizedMode = useMemo(() => normalizeModeId(gameMode ?? ''), [gameMode]);
  const snap = useSubscribable(
    getReadModelsAdapter().historyMaxAchievedLevelForMode(user?.id ?? null, normalizedMode),
  );
  const rows = snap.data as Array<{ max_level: number | null }>;
  const maxLevelRaw = rows?.[0]?.max_level ?? null;
  const maxLevel = maxLevelRaw == null ? null : Number(maxLevelRaw);

  return {
    maxLevel,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

/**
 * @deprecated Prefer scoped hooks (page/count/details).
 */
export function useSessionsQuery() {
  const user = useCurrentUser();
  const userId = user?.id ?? 'local';
  const historyLiteCacheRef = useRef(
    new Map<string, { signature: string; item: SessionHistoryItem }>(),
  );
  const snap = useSubscribable(getReadModelsAdapter().historySessionsList(user?.id ?? null));
  const validRows = useMemo(
    () => normalizeSessionSummaryListRows(snap.data, 'useSessionsQuery'),
    [snap.data, (snap.data as unknown[] | undefined)?.length],
  );

  const sessions = useMemo(() => {
    if (!validRows) return [];
    const nextCache = new Map<string, { signature: string; item: SessionHistoryItem }>();
    const out: SessionHistoryItem[] = [];

    for (const row of validRows) {
      const cacheKey = `${userId}:${row.session_id}`;
      const signature = historyLiteSignature(row);
      const cached = historyLiteCacheRef.current.get(cacheKey);
      if (cached && cached.signature === signature) {
        out.push(cached.item);
        nextCache.set(cacheKey, cached);
        continue;
      }
      const item = rowToHistoryItemLite(row);
      out.push(item);
      nextCache.set(cacheKey, { signature, item });
    }

    historyLiteCacheRef.current = nextCache;
    return out;
  }, [userId, validRows, validRows.length]);

  return {
    data: sessions,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useSessionDetailsQuery(sessionId: string): {
  data: SessionHistoryItem | null;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const effectiveSessionId = sessionId && sessionId !== '__none__' ? sessionId : null;
  const snap = useSubscribable(
    effectiveSessionId
      ? getReadModelsAdapter().historySessionDetails(user?.id ?? null, effectiveSessionId)
      : EMPTY_SESSION_DETAILS_STORE,
  );

  const session = useMemo(() => {
    if (!effectiveSessionId) return null;
    const row = filterValidRows<SessionSummaryRowDb>(
      (snap.data as unknown[] | undefined)?.slice(0, 1),
      SessionSummaryDetailsRowSchema,
      'useSessionDetailsQuery',
    )[0];
    if (!row) return null;
    return rowToHistoryItem(row);
  }, [effectiveSessionId, snap.data, (snap.data as unknown[] | undefined)?.length]);

  return {
    data: session,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useSessionStoredReportQuery(sessionId: string | null): {
  data: SessionEndReportModel | null;
  isPending: boolean;
  error: Error | null;
} {
  const adapter = getOptionalHistoryAdapter();
  const effectiveSessionId = sessionId && sessionId !== '__none__' ? sessionId : null;

  const reportQuery = useQuery({
    queryKey: effectiveSessionId
      ? queryKeys.history.report(effectiveSessionId)
      : [...queryKeys.history.all, 'report', '__none__'],
    queryFn: async () => {
      if (!adapter || !effectiveSessionId) return null;
      return adapter.getReport(effectiveSessionId);
    },
    enabled: effectiveSessionId !== null && adapter !== null,
    retry: false,
  });

  return {
    data: reportQuery.data ?? null,
    isPending: effectiveSessionId !== null && (adapter === null || reportQuery.isPending),
    error: reportQuery.error
      ? reportQuery.error instanceof Error
        ? reportQuery.error
        : new Error(String(reportQuery.error))
      : null,
  };
}

export function useLatestJourneySessionQuery(journeyId: string | null): {
  data: { id: string; createdAt: Date; nLevel: number } | null;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const snap = useSubscribable(
    getReadModelsAdapter().historyLatestJourneySession(user?.id ?? null, journeyId ?? ''),
  );

  const latest = useMemo(() => {
    const row = filterValidRows(
      (snap.data as unknown[] | undefined)?.slice(0, 1),
      LatestJourneySessionRowSchema,
      'useLatestJourneySessionQuery',
    )[0];
    if (!row || !row.created_at || row.n_level == null) return null;
    const createdAt = parseSqlDate(row.created_at);
    if (!createdAt) return null;
    return { id: row.session_id, createdAt, nLevel: Number(row.n_level) };
  }, [snap.data, (snap.data as unknown[] | undefined)?.length]);

  return {
    data: latest,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useSessionSummariesQuery(options?: { includeAbandoned?: boolean }): {
  data: SessionSummaryRowPort[];
  isPending: boolean;
  error: Error | null;
} {
  const includeAbandoned = options?.includeAbandoned ?? false;
  const user = useCurrentUser();
  const snap = useSubscribable(
    getReadModelsAdapter().historySessionSummaries(user?.id ?? null, includeAbandoned),
  );

  const summaries = useMemo(() => {
    const validRows = filterValidRows<SessionSummaryRowDb>(
      snap.data as unknown[],
      SessionSummaryDetailsRowSchema,
      'useSessionSummariesQuery',
    );
    return validRows.map(dbRowToSessionSummaryRow);
  }, [snap.data, (snap.data as unknown[] | undefined)?.length]);

  return {
    data: summaries,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

/** @deprecated Use useSessionsQuery */
export function useSessionsSuspenseQuery() {
  return useSessionsQuery();
}

// =============================================================================
// Derived Queries (Selectors)
// =============================================================================

export function useSessionCount(): number {
  const { count } = useSessionSummariesCountQuery();
  return count;
}

export function useSessionsByGameMode(gameMode: string): SessionHistoryItem[] {
  const user = useCurrentUser();
  const normalizedMode = useMemo(() => normalizeModeId(gameMode ?? ''), [gameMode]);
  const snap = useSubscribable(
    getReadModelsAdapter().historySessionsByGameMode(user?.id ?? null, normalizedMode),
  );
  const validRows = useMemo(
    () => normalizeSessionSummaryListRows(snap.data, 'useSessionsByGameMode'),
    [snap.data, (snap.data as unknown[] | undefined)?.length],
  );
  return useMemo(
    () => validRows.map((row) => rowToHistoryItemLite(row)),
    [validRows, validRows.length],
  );
}

export function useJourneySessions(): SessionHistoryItem[] {
  const user = useCurrentUser();
  const snap = useSubscribable(getReadModelsAdapter().historyJourneySessions(user?.id ?? null, ''));
  const validRows = useMemo(
    () => normalizeSessionSummaryListRows(snap.data, 'useJourneySessions'),
    [snap.data, (snap.data as unknown[] | undefined)?.length],
  );
  return useMemo(
    () => validRows.map((row) => rowToHistoryItemLite(row)),
    [validRows, validRows.length],
  );
}

export function useSessionById(sessionId: string): SessionHistoryItem | null {
  const { data } = useSessionDetailsQuery(sessionId);
  return data;
}

interface LastAdaptiveDPrimeRow {
  session_id: string;
  created_at: string | null;
  global_d_prime: number | null;
}

export function useLastAdaptiveDPrime(): number | undefined {
  const user = useCurrentUser();
  const snap = useSubscribable(getReadModelsAdapter().historyLastAdaptiveDPrime(user?.id ?? null));
  const rows = snap.data as LastAdaptiveDPrimeRow[];
  const latest = rows?.[0];
  if (!latest) return undefined;
  const parsed = Number(latest.global_d_prime ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type TrendHistorySession = Pick<
  SessionHistoryItem,
  'id' | 'createdAt' | 'dPrime' | 'upsScore' | 'upsAccuracy' | 'unifiedMetrics' | 'byModality'
>;

interface RecentTrendSessionRow {
  session_id: string;
  created_at: string | null;
  n_level: number;
  global_d_prime: number | null;
  accuracy: number | null;
  ups_score: number | null;
  ups_accuracy: number | null;
}

export function useRecentSessionsForTrendQuery(input: {
  gameMode: string;
  referenceCreatedAt: string;
  excludeSessionId: string;
  limit?: number;
}): {
  sessions: TrendHistorySession[];
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const normalizedMode = useMemo(() => normalizeModeId(input.gameMode ?? ''), [input.gameMode]);
  const referenceCreatedAtIso = useMemo(() => {
    return parseSqlDate(input.referenceCreatedAt)?.toISOString() ?? null;
  }, [input.referenceCreatedAt]);
  const limit = useMemo(
    () =>
      typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
        ? Math.floor(input.limit)
        : 5,
    [input.limit],
  );

  const snap = useSubscribable(
    getReadModelsAdapter().historyRecentSessionsForTrend(user?.id ?? null, {
      gameMode: normalizedMode,
      referenceCreatedAtIso,
      excludeSessionId: input.excludeSessionId,
      limit,
    }),
  );
  const rows = snap.data as RecentTrendSessionRow[];

  const sessions = useMemo<TrendHistorySession[]>(() => {
    if (!rows || rows.length === 0) return [];
    const out: TrendHistorySession[] = [];
    for (const row of rows) {
      const createdAt = parseSqlDate(row.created_at);
      if (!createdAt) continue;
      const accuracy =
        row.ups_accuracy != null
          ? row.ups_accuracy / 100
          : (row.accuracy ?? (row.global_d_prime != null ? row.global_d_prime / 3 : 0));
      out.push({
        id: row.session_id,
        createdAt,
        dPrime: row.global_d_prime ?? 0,
        byModality: {},
        unifiedMetrics: computeUnifiedMetrics(accuracy, row.n_level),
        upsScore: row.ups_score ?? undefined,
        upsAccuracy: row.ups_accuracy ?? undefined,
      });
    }
    return out;
  }, [rows, rows?.length]);

  return {
    sessions,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}

export function useBrainWorkshopStrikes(journeyId: string | null): number {
  const user = useCurrentUser();
  const limit = 200;
  const snap = useSubscribable(
    getReadModelsAdapter().historyBrainWorkshopStrikes(user?.id ?? null, journeyId ?? '', limit),
  );
  const rows = snap.data as Array<{
    session_id: string;
    created_at: string | null;
    n_level: number;
    total_hits: number | null;
    total_misses: number | null;
    total_fa: number | null;
    journey_context: string | null;
  }>;

  return useMemo(() => {
    if (!journeyId) return 0;
    if (!rows || rows.length === 0) return 0;

    const sessionData: BrainWorkshopSessionData[] = [];
    let latestTimestamp = Number.NEGATIVE_INFINITY;
    let latestConsecutiveStrikes: number | null = null;
    for (const row of rows) {
      const hits = Number(row.total_hits ?? 0);
      const misses = Number(row.total_misses ?? 0);
      const falseAlarms = Number(row.total_fa ?? 0);
      const denominator = hits + misses + falseAlarms;
      // BrainWorkshop score% is compared against integer thresholds; mirror the projector by truncating.
      const score = denominator > 0 ? Math.floor((hits * 100) / denominator) : 0;
      const timestamp = parseSqlDateToMs(row.created_at);
      if (timestamp == null) continue;
      sessionData.push({ score, nLevel: row.n_level, timestamp });

      if (timestamp >= latestTimestamp) {
        latestTimestamp = timestamp;
        latestConsecutiveStrikes = parseConsecutiveStrikesFromJourneyContext(
          row.journey_context,
          2,
        );
      }
    }

    if (sessionData.length === 0) return 0;

    // Prefer authoritative strikes from JOURNEY_TRANSITION_DECIDED on the latest session when available.
    // Fallback to history-derived computation while the system event is still pending (or legacy rows).
    if (latestConsecutiveStrikes !== null) return latestConsecutiveStrikes;
    return calculateBrainWorkshopStrikes(sessionData);
  }, [rows, journeyId]);
}

export function useBrainWorkshopStrikesBySessionId(
  journeyId: string | null,
): Readonly<Record<string, number>> {
  const user = useCurrentUser();
  const limit = 2000;
  const snap = useSubscribable(
    getReadModelsAdapter().historyBrainWorkshopStrikes(user?.id ?? null, journeyId ?? '', limit),
  );
  const rows = snap.data as Array<{
    session_id: string;
    created_at: string | null;
    n_level: number;
    total_hits: number | null;
    total_misses: number | null;
    total_fa: number | null;
    journey_context: string | null;
  }>;

  return useMemo(() => {
    if (!journeyId) return {};
    if (!rows || rows.length === 0) return {};

    const {
      upPercent,
      downPercent,
      strikes: strikesToDown,
    } = SCORING_THRESHOLDS.scoring.brainworkshop;

    const sessions = rows
      .map((row) => {
        const hits = Number(row.total_hits ?? 0);
        const misses = Number(row.total_misses ?? 0);
        const falseAlarms = Number(row.total_fa ?? 0);
        const denom = hits + misses + falseAlarms;
        const scorePercent = denom > 0 ? Math.floor((hits * 100) / denom) : 0;
        const timestamp = parseSqlDateToMs(row.created_at);
        if (timestamp == null) return null;
        return {
          sessionId: row.session_id,
          nLevel: row.n_level,
          timestamp,
          scorePercent,
          consecutiveStrikes: parseConsecutiveStrikesFromJourneyContext(
            row.journey_context,
            strikesToDown - 1,
          ),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .filter((s) => typeof s.sessionId === 'string' && s.sessionId.length > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sessions.length === 0) return {};

    // Simulate BW binary journey progression to compute strikes AFTER each session.
    // This matches the journey projector source-of-truth used on Home.
    let currentNLevel = sessions[0]?.nLevel ?? 1;
    let strikes = 0;
    const bySessionId: Record<string, number> = {};

    for (const s of sessions) {
      // Follow the journey projector rule: only sessions at the current level affect strikes.
      if (s.nLevel !== currentNLevel) {
        if (typeof s.consecutiveStrikes === 'number') {
          bySessionId[s.sessionId] = s.consecutiveStrikes;
        }
        continue;
      }

      let computedStrikesAfter: number;
      if (s.scorePercent >= upPercent) {
        currentNLevel = currentNLevel + 1;
        strikes = 0;
        computedStrikesAfter = 0;
      } else if (s.scorePercent < downPercent) {
        strikes += 1;
        if (strikes >= strikesToDown) {
          currentNLevel = Math.max(currentNLevel - 1, 1);
          strikes = 0;
          computedStrikesAfter = 0;
        } else {
          computedStrikesAfter = strikes;
        }
      } else {
        // 50-79%: maintain, strikes unchanged
        computedStrikesAfter = strikes;
      }

      const strikesAfter = s.consecutiveStrikes ?? computedStrikesAfter;
      bySessionId[s.sessionId] = strikesAfter;
      strikes = strikesAfter;
    }

    return bySessionId;
  }, [rows, journeyId]);
}

// =============================================================================
// Mutations
// =============================================================================

export function useDeleteSession() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await getHistoryAdapter().deleteSession(sessionId);
    },
  });
}

export function useDeleteSessions() {
  return useMutation({
    mutationFn: async (sessionIds: readonly string[]) => {
      await getHistoryAdapter().deleteSessions(sessionIds);
    },
  });
}

export function useExportSessions() {
  return useMutation({
    mutationFn: async () => getHistoryAdapter().exportSessions(),
  });
}

export function useImportSessions() {
  return useMutation({
    mutationFn: async (data: SessionHistoryExport) => getHistoryAdapter().importSessions(data),
  });
}

// =============================================================================
// Ready State
// =============================================================================

export function useHistoryIsReady(): boolean {
  const adapter = getOptionalHistoryAdapter();
  // If adapters are not initialized yet (startup / HMR), treat history as NOT ready.
  const [isReady, setIsReady] = useState<boolean>(() => adapter?.isReady() ?? false);

  useEffect(() => {
    return profileDevEffectSync('useHistoryIsReady.effect', () => {
      if (!adapter) {
        setIsReady(false);
        return;
      }

      setIsReady(adapter.isReady());
      const interval = setInterval(() => {
        setIsReady(adapter.isReady());
      }, 250);
      return () => clearInterval(interval);
    });
  }, [adapter]);

  return isReady;
}
