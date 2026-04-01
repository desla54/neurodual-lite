/**
 * History Projection
 *
 * Pure projection logic for all session types.
 * Converts events to session summaries for SQL storage.
 *
 * This module is the Single Source of Truth for:
 * - Event → SessionSummary projection
 * - Multi-mode support (Tempo, Recall, Flow, DualPick, Trace)
 * - UPS calculation for each mode
 */

import {
  type GameEvent,
  type SessionImportedEvent,
  projectDualPickSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectImportedSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
  normalizeModeId,
  type PersistencePort,
  // Migration
  migrateAndValidateEventBatch,
  migrateAndValidateEvent,
  type RawVersionedEvent,
  SESSION_END_EVENT_TYPES_ARRAY,
} from '@neurodual/logic';
import { sql, type SQL } from 'drizzle-orm';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { projectionLog } from '../logger';
import { requireDrizzleDb } from '../db/drizzle';
import { cleanupAbandonedSessionById } from './abandoned-cleanup';
import {
  getSessionEndEvents,
  findMissingSessionSummaries,
  getSessionEndEventsForSessions,
  getLatestSessionEndEvent,
} from '../es-emmett/event-queries';

// =============================================================================
// Constants
// =============================================================================

/**
 * Projection version for `session_summaries` read-model.
 *
 * Increment this when summary semantics change (new fields, scoring tweaks,
 * bug fixes). This lets the app transparently reproject summaries from events.
 */
declare const __PROJECTION_HASH__: string | undefined;
export const SESSION_SUMMARIES_PROJECTION_VERSION =
  typeof __PROJECTION_HASH__ === 'string' && __PROJECTION_HASH__.length > 0
    ? __PROJECTION_HASH__
    : 'dev';

// Session end types are centralized in @neurodual/logic; history projection keeps its own SQL list.

// =============================================================================
// Maintenance Singleflight
// =============================================================================

// Prevent concurrent projection maintenance jobs (init + sync + watches) from
// duplicating work and contending on SQLite.
const maintenanceInFlight = new Map<string, Promise<number>>();

function singleflightMaintenance(key: string, fn: () => Promise<number>): Promise<number> {
  const existing = maintenanceInFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      return await fn();
    } finally {
      maintenanceInFlight.delete(key);
    }
  })();

  maintenanceInFlight.set(key, p);
  return p;
}

function requirePowerSyncDb(persistence: PersistencePort): Promise<AbstractPowerSyncDatabase> {
  const candidate = persistence as unknown as {
    getPowerSyncDb?: () => Promise<AbstractPowerSyncDatabase>;
  };
  if (typeof candidate.getPowerSyncDb !== 'function') {
    throw new Error('[HistoryProjection] PersistencePort must expose getPowerSyncDb()');
  }
  return candidate.getPowerSyncDb();
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function userIdRank(value: string | null | undefined): number {
  if (!value) return 0;
  if (value === 'local') return 1;
  return looksLikeUuid(value) ? 3 : 2;
}

function resolveProjectedUserId(
  storedEvents: readonly { user_id: string | null }[],
  fallbackUserId?: unknown,
): string {
  let best: string | null =
    typeof fallbackUserId === 'string' && fallbackUserId.trim().length > 0
      ? fallbackUserId.trim()
      : null;
  let bestRank = userIdRank(best);

  for (const row of storedEvents) {
    const candidate = row.user_id?.trim();
    if (!candidate) continue;
    const rank = userIdRank(candidate);
    if (rank > bestRank) {
      best = candidate;
      bestRank = rank;
      if (rank >= 3) break;
    }
  }

  return best ?? 'local';
}

function isMissingSessionSummariesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table: session_summaries');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSessionSummariesTable(
  persistence: PersistencePort,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 4000;
  const pollMs = options?.pollMs ?? 75;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const result = await persistence.query<{ count: number }>(
        `SELECT COUNT(*) as count
           FROM (
             SELECT 1
             FROM sqlite_master
             WHERE (type = 'table' OR type = 'view')
               AND name = 'session_summaries'
             LIMIT 1
           )`,
      );
      if (Number(result.rows[0]?.count ?? 0) > 0) {
        return true;
      }
    } catch {
      // Best-effort: some runtimes can transiently reject sqlite_master access.
    }
    await sleep(pollMs);
  }

  return false;
}

type SessionSummaryInput = Parameters<PersistencePort['insertSessionSummary']>[0];

interface SessionSummaryWriter {
  insert: (summary: SessionSummaryInput) => Promise<void>;
}

function extractXpBreakdown(
  sessionEvents: readonly GameEvent[],
): Record<string, unknown> | undefined {
  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const e = sessionEvents[i];
    if (e?.type === 'XP_BREAKDOWN_COMPUTED') {
      const xpBreakdown = (e as unknown as { xpBreakdown?: unknown }).xpBreakdown;
      if (typeof xpBreakdown === 'object' && xpBreakdown !== null) {
        return xpBreakdown as Record<string, unknown>;
      }
      return undefined;
    }
  }
  return undefined;
}

function enrichSummaryWithDerivedContext(
  summary: SessionSummaryInput,
  sessionEvents: readonly GameEvent[],
): SessionSummaryInput {
  let enriched = summary;

  // journeyContext is no longer written to session_summaries — journey state
  // is rebuilt from facts by the journey-state-projection.

  if (enriched.xpBreakdown === undefined) {
    const xpBreakdown = extractXpBreakdown(sessionEvents);
    if (xpBreakdown) enriched = { ...enriched, xpBreakdown };
  }

  return enriched;
}

export interface RepairDriftedSessionSummariesOptions {
  /**
   * Restrict drift detection to one game mode (e.g. dualnback-classic).
   * If omitted, all non-abandoned session summaries are checked.
   */
  gameMode?: string;
  /**
   * Optional cap for one run (useful for low-priority background jobs).
   * If omitted, checks all matching summaries.
   */
  maxSessions?: number;
}

export interface RepairDriftedSessionSummariesResult {
  checked: number;
  repaired: number;
  drifted: number;
  skipped: number;
  errors: number;
}

async function cleanupAbandonedSession(
  persistence: PersistencePort,
  sessionId: string,
): Promise<void> {
  await cleanupAbandonedSessionById(persistence, sessionId);
}

// =============================================================================
// Projection Logic
// =============================================================================

/**
 * Insert a session summary from a session-ending event.
 * Only loads events for this specific session (O(events_per_session) instead of O(all_events)).
 *
 * IMPORTANT: All DB access goes through the injected PersistencePort to avoid race conditions.
 * The session-ending event is guaranteed to be persisted before this function is called
 * (the persistence layer awaits for session-end events before returning).
 */
export async function insertSessionSummaryFromEvent(
  persistence: PersistencePort,
  event: GameEvent,
  writer?: SessionSummaryWriter,
): Promise<void> {
  const effectiveWriter: SessionSummaryWriter =
    writer ??
    ({
      insert: (summary) => persistence.insertSessionSummary(summary),
    } satisfies SessionSummaryWriter);
  const sessionId = event.sessionId;
  projectionLog.debug(
    `[insertSessionSummaryFromEvent] Processing ${event.type} for session ${sessionId}`,
  );

  // Abandoned sessions have no value for the app: keep DB clean.
  // Do this BEFORE loading all events to avoid expensive work at startup.
  if ('reason' in event && event.reason === 'abandoned') {
    projectionLog.debug(
      `[insertSessionSummaryFromEvent] Abandoned session detected, deleting: ${sessionId} (${event.type})`,
    );
    await cleanupAbandonedSession(persistence, sessionId);
    return;
  }

  // Handle SESSION_IMPORTED specially - it has all data in the event itself
  if (event.type === 'SESSION_IMPORTED') {
    const importedEvent = event as SessionImportedEvent;
    // Still load the stored event row to recover the correct `user_id`
    // (important for cross-device sync where imported sessions belong to an authenticated user).
    const storedEvents = await persistence.getSession(sessionId);
    const userId = resolveProjectedUserId(storedEvents, (event as { userId?: unknown }).userId);
    await effectiveWriter.insert(projectImportedSessionToSummaryInput(importedEvent, userId));
    return;
  }

  // For other session types, load events for this session and project
  // All events should be visible now since session-end events await persistence
  const storedEvents = await persistence.getSession(sessionId);
  projectionLog.debug(
    `[insertSessionSummaryFromEvent] Found ${storedEvents.length} events for session ${sessionId}`,
  );
  if (storedEvents.length > 0) {
    const eventTypes = storedEvents.map((e) => e.type);
    projectionLog.debug(`[insertSessionSummaryFromEvent] Event types: ${eventTypes.join(', ')}`);
  }

  // Extract user_id from stored events (use first event's user_id, fallback to 'local')
  const userId = resolveProjectedUserId(storedEvents, (event as { userId?: unknown }).userId);

  // Convert StoredEvents to raw events for validation
  const rawEvents: RawVersionedEvent[] = storedEvents.map((e) => ({
    id: e.id,
    sessionId: e.session_id,
    type: e.type,
    timestamp: Number(e.timestamp),
    schemaVersion: (e.payload['schemaVersion'] as number) ?? 1,
    ...e.payload,
  }));

  const rawAbandonedEvent = rawEvents.find(
    (rawEvent) => (rawEvent as { reason?: unknown }).reason === 'abandoned',
  );
  if (rawAbandonedEvent) {
    projectionLog.debug(
      `[insertSessionSummaryFromEvent] Raw abandoned session detected, deleting before validation: ${sessionId} (${rawAbandonedEvent.type})`,
    );
    await cleanupAbandonedSessionById(persistence, sessionId);
    return;
  }

  const rawSessionStarted = rawEvents.find((e) => e.type === 'SESSION_STARTED') as
    | (RawVersionedEvent & { gameMode?: unknown })
    | undefined;
  const rawGameMode =
    typeof rawSessionStarted?.gameMode === 'string' ? rawSessionStarted.gameMode : undefined;
  // READ path must be tolerant: historical sessions should not disappear because schemas hardened.
  // We'll validate best-effort and keep projecting if the stream is mostly valid.
  const strictValidation = false;

  // Validate the full session stream before projection.
  let sessionEvents: GameEvent[];
  let errorCount: number;
  try {
    const batchResult = migrateAndValidateEventBatch(rawEvents, {
      strict: strictValidation,
      logErrors: false,
      targetVersion: 1,
      output: 'canonical',
    });
    sessionEvents = batchResult.events;
    errorCount = batchResult.errorCount;
  } catch (error) {
    projectionLog.error(
      `[insertSessionSummaryFromEvent] Validation failed for session ${sessionId} (${rawGameMode ?? 'unknown'}):`,
      error,
    );
    throw error;
  }

  if (errorCount > 0) {
    projectionLog.debug(
      `[insertSessionSummaryFromEvent] ${errorCount}/${rawEvents.length} events failed validation for session ${sessionId}`,
    );
  }

  // If the session is abandoned (legacy path where the end event wasn't passed into this function),
  // delete it completely to avoid clutter + avoid repeated reprojection attempts.
  const abandonedEndEvent = sessionEvents.find(
    (e) => 'reason' in e && (e as unknown as { reason?: unknown }).reason === 'abandoned',
  );
  if (abandonedEndEvent) {
    projectionLog.debug(
      `[insertSessionSummaryFromEvent] Abandoned session detected during projection, deleting: ${sessionId} (${abandonedEndEvent.type})`,
    );
    await cleanupAbandonedSession(persistence, sessionId);
    return;
  }

  // Project based on the *session stream*, not the triggering event type.
  // This allows reprojecting summaries when pipeline/system events are persisted after session end.
  const importedEvent = sessionEvents.find((e) => e.type === 'SESSION_IMPORTED') as
    | SessionImportedEvent
    | undefined;
  if (importedEvent) {
    const summary = projectImportedSessionToSummaryInput(importedEvent, userId);
    await effectiveWriter.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
    return;
  }

  if (sessionEvents.some((e) => e.type === 'SESSION_ENDED')) {
    await projectTempoSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
  if (sessionEvents.some((e) => e.type === 'RECALL_SESSION_ENDED')) {
    await projectRecallSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
  if (sessionEvents.some((e) => e.type === 'FLOW_SESSION_ENDED')) {
    await projectPlaceSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
  if (sessionEvents.some((e) => e.type === 'DUAL_PICK_SESSION_ENDED')) {
    await projectDualPickSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
  if (sessionEvents.some((e) => e.type === 'TRACE_SESSION_ENDED')) {
    await projectTraceSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
  if (sessionEvents.some((e) => e.type === 'OSPAN_SESSION_ENDED')) {
    await projectGenericSession(
      projectOspanSessionToSummaryInput,
      sessionId,
      sessionEvents,
      userId,
      effectiveWriter,
    );
    return;
  }
  if (sessionEvents.some((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED')) {
    await projectCognitiveTaskSession(sessionId, sessionEvents, userId, effectiveWriter);
    return;
  }
}

// =============================================================================
// Mode-specific Projectors
// =============================================================================

async function projectGenericSession(
  projector: (input: {
    sessionId: string;
    sessionEvents: GameEvent[];
    userId: string;
  }) => ReturnType<typeof projectTempoSessionToSummaryInput>,
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projector({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

async function projectTempoSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projectTempoSessionToSummaryInput({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

async function projectRecallSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projectRecallSessionToSummaryInput({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

async function projectPlaceSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projectFlowSessionToSummaryInput({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

async function projectDualPickSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projectDualPickSessionToSummaryInput({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

async function projectTraceSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const summary = projectTraceSessionToSummaryInput({ sessionId, sessionEvents, userId });
  if (!summary) return;
  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

function deriveNLevelFromCogMetrics(metrics: Record<string, unknown>): number {
  for (const key of [
    'reportedLevel',
    'maxLevel',
    'maxSpan',
    'maxForwardSpan',
    'maxBackwardSpan',
  ] as const) {
    const v = metrics[key];
    if (typeof v === 'number' && v >= 1) return Math.round(v);
  }
  return 1;
}

async function projectCognitiveTaskSession(
  sessionId: string,
  sessionEvents: GameEvent[],
  userId: string,
  writer: SessionSummaryWriter,
): Promise<void> {
  const endEvent = sessionEvents.find((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED') as
    | (GameEvent & {
        taskType?: string;
        reason?: string;
        accuracy?: number;
        correctTrials?: number;
        totalTrials?: number;
        durationMs?: number;
        meanRtMs?: number;
        playContext?: string;
        metrics?: Record<string, unknown>;
      })
    | undefined;
  if (!endEvent) return;

  const startEvent = sessionEvents.find((e) => e.type === 'COGNITIVE_TASK_SESSION_STARTED') as
    | (GameEvent & { timestamp?: number; playContext?: string })
    | undefined;

  const taskType = endEvent.taskType ?? 'unknown';
  const accuracy = endEvent.accuracy ?? 0;
  const durationMs = endEvent.durationMs ?? 0;
  const totalTrials = endEvent.totalTrials ?? 0;
  const correctTrials = endEvent.correctTrials ?? 0;
  const createdAt = startEvent?.timestamp ?? endEvent.timestamp ?? Date.now();
  const metrics = (endEvent.metrics ?? {}) as Record<string, unknown>;

  // Derive nLevel from metrics when available
  const nLevel = deriveNLevelFromCogMetrics(metrics);

  // Extract SDT counts from metrics if available
  const totalHits = typeof metrics['hits'] === 'number' ? metrics['hits'] : correctTrials;
  const totalMisses =
    typeof metrics['misses'] === 'number'
      ? metrics['misses']
      : Math.max(0, totalTrials - correctTrials);
  const totalFa = typeof metrics['falseAlarms'] === 'number' ? metrics['falseAlarms'] : 0;
  const totalCr =
    typeof metrics['correctRejections'] === 'number' ? metrics['correctRejections'] : 0;

  // Extract mean RT
  const meanRtMs = endEvent.meanRtMs;
  const avgResponseTimeMs =
    typeof meanRtMs === 'number' && meanRtMs > 0 ? Math.round(meanRtMs) : undefined;

  const summary: SessionSummaryInput = {
    sessionId,
    userId,
    sessionType: 'cognitive-task',
    createdAt: new Date(createdAt),
    gameMode: taskType,
    nLevel,
    durationMs,
    accuracy,
    globalDPrime: 0,
    passed: accuracy >= 0.6,
    reason: endEvent.reason,
    playContext: (endEvent.playContext ?? startEvent?.playContext ?? 'free') as 'free' | 'journey',
    trialsCount: totalTrials,
    totalHits,
    totalMisses,
    totalFa,
    totalCr,
    upsScore: Math.round(accuracy * 100),
    avgResponseTimeMs,
    byModality: {},
  };

  await writer.insert(enrichSummaryWithDerivedContext(summary, sessionEvents));
}

// =============================================================================
// Rebuild All Summaries
// =============================================================================

/**
 * Rebuild all session_summaries from events.
 * Call this after a fresh sync to project all sessions locally.
 *
 * Each insertSessionSummary is atomic (INSERT OR REPLACE), so no explicit
 * transaction is needed. This avoids "cannot start transaction within transaction"
 * errors when called during sync operations.
 */
async function projectAllSummariesInternal(
  persistence: PersistencePort,
  options: { clearExisting: boolean },
): Promise<number> {
  const drizzleDb = requireDrizzleDb(persistence);
  if (options.clearExisting) {
    // Clear existing summaries first - ensures clean rebuild with correct user_id
    // Use execute() for mutations (query() uses getAll() which is SELECT-only)
    await drizzleDb.run(sql`DELETE FROM session_summaries`);
    projectionLog.info('Cleared existing session_summaries');
  }

  // Get all session-ending events via centralized event-queries module.
  const psDb = await requirePowerSyncDb(persistence);
  const endEventsRows = await getSessionEndEvents(psDb, SESSION_END_TYPES);

  const rows = [...endEventsRows];
  let projected = 0;
  let errors = 0;
  const budget = { lastYieldMs: nowMs() };
  const totalChunks = Math.ceil(rows.length / PROJECTION_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * PROJECTION_CHUNK_SIZE;
    const end = Math.min(start + PROJECTION_CHUNK_SIZE, rows.length);
    const chunk = rows.slice(start, end);

    const summariesToInsert: SessionSummaryInput[] = [];
    const collectingWriter: SessionSummaryWriter = {
      insert: async (summary) => {
        summariesToInsert.push(summary);
      },
    };

    for (const row of chunk) {
      try {
        // Parse payload from JSON string (SQLite stores as TEXT)
        let parsedPayload: Record<string, unknown>;
        if (typeof row.payload === 'string') {
          try {
            parsedPayload = JSON.parse(row.payload);
          } catch {
            projectionLog.warn(
              `Failed to parse payload JSON for session ${row.session_id}, skipping`,
            );
            errors++;
            continue;
          }
        } else if (row.payload && typeof row.payload === 'object') {
          parsedPayload = row.payload;
        } else {
          projectionLog.warn(`Invalid payload type for session ${row.session_id}, skipping`);
          errors++;
          continue;
        }

        const rawEvent: RawVersionedEvent = {
          id: row.id,
          sessionId: row.session_id,
          type: row.type,
          timestamp: Number(row.timestamp),
          schemaVersion: (parsedPayload['schemaVersion'] as number) ?? 1,
          ...parsedPayload,
        };

        const validationResult = migrateAndValidateEvent(rawEvent, {
          strict: false,
          logErrors: true,
          targetVersion: 1,
        });

        if (!validationResult.success) {
          projectionLog.warn(
            `Event validation failed for session ${row.session_id}: ${validationResult.error}`,
          );
          errors++;
          continue;
        }

        await insertSessionSummaryFromEvent(persistence, validationResult.event, collectingWriter);
        await yieldIfOverBudget(budget);
      } catch (err) {
        errors++;
        projectionLog.warn(`Failed to project session ${row.session_id}:`, err);
      }
    }

    if (summariesToInsert.length > 0) {
      const inserted = await persistence.insertSessionSummariesBatch(summariesToInsert);
      projected += inserted;
      await yieldIfOverBudget(budget);
    }

    if (chunkIndex < totalChunks - 1) {
      projectionLog.debug(
        `${options.clearExisting ? 'rebuildAllSummaries' : 'reprojectAllSummaries'}: chunk ${chunkIndex + 1}/${totalChunks} done, yielding`,
      );
      await yieldToMainThread();
      budget.lastYieldMs = nowMs();
    }
  }

  projectionLog.info(
    `${options.clearExisting ? 'Rebuilt' : 'Reprojected'} ${projected} session summaries (${errors} errors)`,
  );
  return projected;
}

/**
 * Rebuild all session_summaries from events (clears table first).
 */
export async function rebuildAllSummaries(persistence: PersistencePort): Promise<number> {
  return singleflightMaintenance('rebuildAllSummaries', () =>
    projectAllSummariesInternal(persistence, { clearExisting: true }),
  );
}

/**
 * Reproject all session_summaries from events (upsert in-place).
 *
 * Use this when projection logic changes: it updates rows without wiping the table,
 * so the UI keeps showing existing history while the repair runs.
 */
export async function reprojectAllSummaries(persistence: PersistencePort): Promise<number> {
  return singleflightMaintenance('reprojectAllSummaries', () =>
    projectAllSummariesInternal(persistence, { clearExisting: false }),
  );
}

// =============================================================================
// Rebuild Missing Summaries (Non-Destructive)
// =============================================================================

/**
 * Chunk size for batch processing.
 * Smaller chunks = more responsive UI but slower total time.
 * 50 is a good balance for ~250 sessions.
 */
const PROJECTION_CHUNK_SIZE = 50;

/**
 * Yield to main thread between chunks to avoid freezing UI.
 * Uses MessageChannel for fastest yield (not throttled like RAF).
 */
function yieldToMainThread(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
  }
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

async function yieldIfOverBudget(state: { lastYieldMs: number }, budgetMs = 8): Promise<void> {
  const t = nowMs();
  if (t - state.lastYieldMs < budgetMs) return;
  await yieldToMainThread();
  state.lastYieldMs = nowMs();
}

/**
 * Rebuild only MISSING session_summaries from events.
 * Unlike rebuildAllSummaries, this does NOT delete existing summaries.
 *
 * Use this after sync pull to project only the newly synced sessions.
 * More efficient and safer than full rebuild.
 *
 * Algorithm:
 * 1. Find all session-end events
 * 2. Find which sessions already have summaries
 * 3. Only project the missing ones (in chunks to avoid UI freeze)
 */
export async function rebuildMissingSessionSummaries(
  persistence: PersistencePort,
): Promise<number> {
  return singleflightMaintenance('rebuildMissingSessionSummaries', async () => {
    const psDb = await requirePowerSyncDb(persistence);

    // Find session IDs that have session-end events but no summaries yet.
    const missingSessionIds = await findMissingSessionSummaries(psDb, SESSION_END_TYPES);

    if (missingSessionIds.length === 0) {
      projectionLog.debug('rebuildMissingSessionSummaries: no missing summaries found');
      return 0;
    }

    projectionLog.info(
      `rebuildMissingSessionSummaries: projecting ${missingSessionIds.length} missing sessions`,
    );

    // Get the session-end events for missing sessions (chunked internally by event-queries).
    const rows = await getSessionEndEventsForSessions(psDb, missingSessionIds, SESSION_END_TYPES);

    // Project newest sessions first so the history UI (ordered by created_at DESC)
    // populates quickly after login/sync instead of filling from oldest → newest.
    rows.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    let projected = 0;
    let errors = 0;
    const budget = { lastYieldMs: nowMs() };

    // Process in chunks to avoid freezing UI on large datasets
    const totalChunks = Math.ceil(rows.length / PROJECTION_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * PROJECTION_CHUNK_SIZE;
      const end = Math.min(start + PROJECTION_CHUNK_SIZE, rows.length);
      const chunk = rows.slice(start, end);

      const summariesToInsert: SessionSummaryInput[] = [];
      const collectingWriter: SessionSummaryWriter = {
        insert: async (summary) => {
          summariesToInsert.push(summary);
        },
      };

      for (const row of chunk) {
        try {
          // Parse payload from JSON string (SQLite stores as TEXT)
          let parsedPayload: Record<string, unknown>;
          if (typeof row.payload === 'string') {
            try {
              parsedPayload = JSON.parse(row.payload);
            } catch {
              projectionLog.warn(
                `Failed to parse payload JSON for session ${row.session_id}, skipping`,
              );
              errors++;
              continue;
            }
          } else if (row.payload && typeof row.payload === 'object') {
            parsedPayload = row.payload;
          } else {
            projectionLog.warn(`Invalid payload type for session ${row.session_id}, skipping`);
            errors++;
            continue;
          }

          const rawEvent: RawVersionedEvent = {
            id: row.id,
            sessionId: row.session_id,
            type: row.type,
            timestamp: Number(row.timestamp),
            schemaVersion: (parsedPayload['schemaVersion'] as number) ?? 1,
            ...parsedPayload,
          };

          // Validate event before projection
          const result = migrateAndValidateEvent(rawEvent, {
            strict: false,
            logErrors: true,
            targetVersion: 1,
          });

          if (!result.success) {
            projectionLog.warn(
              `Event validation failed for session ${row.session_id}: ${result.error}`,
            );
            errors++;
            continue;
          }

          await insertSessionSummaryFromEvent(persistence, result.event, collectingWriter);
          await yieldIfOverBudget(budget);
        } catch (err) {
          errors++;
          projectionLog.warn(`Failed to project session ${row.session_id}:`, err);
        }
      }

      // Batch insert projected summaries for this chunk in a single transaction (web perf).
      if (summariesToInsert.length > 0) {
        const inserted = await persistence.insertSessionSummariesBatch(summariesToInsert);
        projected += inserted;
        await yieldIfOverBudget(budget);
      }

      // Yield to main thread between chunks (except after last chunk)
      if (chunkIndex < totalChunks - 1) {
        projectionLog.debug(
          `rebuildMissingSessionSummaries: chunk ${chunkIndex + 1}/${totalChunks} done, yielding`,
        );
        await yieldToMainThread();
        budget.lastYieldMs = nowMs();
      }
    }

    projectionLog.info(`Rebuilt ${projected} missing session summaries (${errors} errors)`);
    return projected;
  });
}

// =============================================================================
// Eager Summary Projection (Pipeline Integration)
// =============================================================================

/**
 * Ensure that session_summaries has a row for the given sessionId.
 * If the summary already exists, this is a no-op.
 * Otherwise, finds the session-end event and projects a summary synchronously.
 *
 * Used by the pipeline to guarantee the read model is up-to-date BEFORE
 * returning the report to the UI (avoids stale journey strikes on the home card).
 */
export async function ensureSummaryProjectedForSession(
  persistence: PersistencePort,
  sessionId: string,
): Promise<void> {
  projectionLog.info(`[ensureSummaryProjected] Checking session ${sessionId}`);

  const tableReady = await waitForSessionSummariesTable(persistence);
  if (!tableReady) {
    projectionLog.warn(
      `[ensureSummaryProjected] session_summaries table unavailable for ${sessionId} after wait`,
    );
    return;
  }

  // Check if summary already exists
  let existing: { rows: { session_id: string }[] };
  try {
    existing = await persistence.query<{ session_id: string }>(
      `SELECT session_id FROM session_summaries WHERE session_id = ? LIMIT 1`,
      [sessionId],
    );
  } catch (error) {
    if (!isMissingSessionSummariesError(error)) {
      throw error;
    }
    projectionLog.warn(
      `[ensureSummaryProjected] session_summaries missing during existence check for ${sessionId}`,
    );
    return;
  }
  if (existing.rows.length > 0) {
    projectionLog.info(
      `[ensureSummaryProjected] Summary already exists for ${sessionId}, skipping`,
    );
    return;
  }

  // Find the latest session-end event via centralized event-queries module.
  const psDb = await requirePowerSyncDb(persistence);
  const endEvent = await getLatestSessionEndEvent(psDb, sessionId, SESSION_END_TYPES);
  if (!endEvent) {
    projectionLog.warn(`[ensureSummaryProjected] No session-end event found for ${sessionId}`);
    return;
  }

  projectionLog.info(
    `[ensureSummaryProjected] Found end event ${endEvent.type} for ${sessionId}, projecting...`,
  );

  const payload = parsePayloadObject(endEvent.payload);
  if (!payload) return;

  const rawEvent: RawVersionedEvent = {
    id: endEvent.id,
    sessionId: endEvent.session_id,
    type: endEvent.type,
    timestamp: Number(endEvent.timestamp),
    schemaVersion: (payload['schemaVersion'] as number) ?? 1,
    ...payload,
  };

  const validated = migrateAndValidateEvent(rawEvent, {
    strict: false,
    logErrors: true,
    targetVersion: 1,
  });
  if (!validated.success) {
    projectionLog.warn(
      `[ensureSummaryProjectedForSession] Validation failed for session ${sessionId}: ${validated.error}`,
    );
    return;
  }

  await insertSessionSummaryFromEvent(persistence, validated.event);
}

// =============================================================================
// Repair Helpers
// =============================================================================

type DriftComparableRow = {
  session_id: string;
  session_type: string | null;
  created_at: string | null;
  n_level: number | null;
  duration_ms: number | null;
  trials_count: number | null;
  total_hits: number | null;
  total_misses: number | null;
  total_fa: number | null;
  total_cr: number | null;
  global_d_prime: number | null;
  accuracy: number | null;
  generator: string | null;
  game_mode: string | null;
  passed: boolean | number | null;
  reason: string | null;
  journey_stage_id: string | null;
  journey_id: string | null;
  play_context: string | null;
  by_modality: unknown;
  adaptive_path_progress_pct: number | null;
  flow_confidence_score: number | null;
  flow_directness_ratio: number | null;
  flow_wrong_slot_dwell_ms: number | null;
  recall_confidence_score: number | null;
  recall_fluency_score: number | null;
  recall_corrections_count: number | null;
  ups_score: number | null;
  ups_accuracy: number | null;
  ups_confidence: number | null;
  avg_response_time_ms: number | null;
  median_response_time_ms: number | null;
  response_time_std_dev: number | null;
  avg_press_duration_ms: number | null;
  press_duration_std_dev: number | null;
  responses_during_stimulus: number | null;
  responses_after_stimulus: number | null;
  focus_lost_count: number | null;
  focus_lost_total_ms: number | null;
  worst_modality_error_rate: number | null;
  input_methods: string | null;
};

type EndEventRow = {
  id: string;
  session_id: string;
  type: string;
  timestamp: string | number;
  payload: unknown;
};

type ComparableSummary = {
  sessionType: string | null;
  createdAtMs: number | null;
  nLevel: number | null;
  durationMs: number | null;
  trialsCount: number | null;
  totalHits: number | null;
  totalMisses: number | null;
  totalFa: number | null;
  totalCr: number | null;
  globalDPrime: number | null;
  accuracy: number | null;
  generator: string | null;
  gameMode: string | null;
  passed: boolean | null;
  reason: string | null;
  journeyStageId: string | null;
  journeyId: string | null;
  playContext: string | null;
  byModality: string;
  adaptivePathProgressPct: number | null;
  flowConfidenceScore: number | null;
  flowDirectnessRatio: number | null;
  flowWrongSlotDwellMs: number | null;
  recallConfidenceScore: number | null;
  recallFluencyScore: number | null;
  recallCorrectionsCount: number | null;
  upsScore: number | null;
  upsAccuracy: number | null;
  upsConfidence: number | null;
  avgResponseTimeMs: number | null;
  medianResponseTimeMs: number | null;
  responseTimeStdDev: number | null;
  avgPressDurationMs: number | null;
  pressDurationStdDev: number | null;
  responsesDuringStimulus: number | null;
  responsesAfterStimulus: number | null;
  focusLostCount: number | null;
  focusLostTotalMs: number | null;
  worstModalityErrorRate: number | null;
  inputMethods: string | null;
};

const SESSION_END_TYPES = SESSION_END_EVENT_TYPES_ARRAY;

function parsePayloadObject(payload: unknown): Record<string, unknown> | null {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(6));
}

function normalizeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return null;
}

function normalizeDateToMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function toComparableCachedSummary(row: DriftComparableRow): ComparableSummary {
  const byModality = parsePayloadObject(row.by_modality) ?? {};

  return {
    sessionType: normalizeString(row.session_type),
    createdAtMs: normalizeDateToMs(row.created_at),
    nLevel: normalizeInt(row.n_level),
    durationMs: normalizeInt(row.duration_ms),
    trialsCount: normalizeInt(row.trials_count),
    totalHits: normalizeInt(row.total_hits),
    totalMisses: normalizeInt(row.total_misses),
    totalFa: normalizeInt(row.total_fa),
    totalCr: normalizeInt(row.total_cr),
    globalDPrime: normalizeNumber(row.global_d_prime),
    accuracy: normalizeNumber(row.accuracy),
    generator: normalizeString(row.generator),
    gameMode: normalizeString(row.game_mode),
    passed: normalizeBoolean(row.passed),
    reason: normalizeString(row.reason),
    journeyStageId: normalizeString(row.journey_stage_id),
    journeyId: normalizeString(row.journey_id),
    playContext: normalizeString(row.play_context),
    byModality: stableJson(byModality),
    adaptivePathProgressPct: normalizeNumber(row.adaptive_path_progress_pct),
    flowConfidenceScore: normalizeNumber(row.flow_confidence_score),
    flowDirectnessRatio: normalizeNumber(row.flow_directness_ratio),
    flowWrongSlotDwellMs: normalizeNumber(row.flow_wrong_slot_dwell_ms),
    recallConfidenceScore: normalizeNumber(row.recall_confidence_score),
    recallFluencyScore: normalizeNumber(row.recall_fluency_score),
    recallCorrectionsCount: normalizeNumber(row.recall_corrections_count),
    upsScore: normalizeNumber(row.ups_score),
    upsAccuracy: normalizeNumber(row.ups_accuracy),
    upsConfidence: normalizeNumber(row.ups_confidence),
    avgResponseTimeMs: normalizeNumber(row.avg_response_time_ms),
    medianResponseTimeMs: normalizeNumber(row.median_response_time_ms),
    responseTimeStdDev: normalizeNumber(row.response_time_std_dev),
    avgPressDurationMs: normalizeNumber(row.avg_press_duration_ms),
    pressDurationStdDev: normalizeNumber(row.press_duration_std_dev),
    responsesDuringStimulus: normalizeInt(row.responses_during_stimulus),
    responsesAfterStimulus: normalizeInt(row.responses_after_stimulus),
    focusLostCount: normalizeInt(row.focus_lost_count),
    focusLostTotalMs: normalizeInt(row.focus_lost_total_ms),
    worstModalityErrorRate: normalizeNumber(row.worst_modality_error_rate),
    inputMethods: normalizeString(row.input_methods),
  };
}

function toComparableExpectedSummary(summary: SessionSummaryInput): ComparableSummary {
  return {
    sessionType: normalizeString(summary.sessionType),
    createdAtMs: normalizeDateToMs(summary.createdAt),
    nLevel: normalizeInt(summary.nLevel),
    durationMs: normalizeInt(summary.durationMs),
    trialsCount: normalizeInt(summary.trialsCount),
    totalHits: normalizeInt(summary.totalHits),
    totalMisses: normalizeInt(summary.totalMisses),
    totalFa: normalizeInt(summary.totalFa),
    totalCr: normalizeInt(summary.totalCr),
    globalDPrime: normalizeNumber(summary.globalDPrime),
    accuracy: normalizeNumber(summary.accuracy),
    generator: normalizeString(summary.generator),
    gameMode: normalizeString(summary.gameMode),
    passed: normalizeBoolean(summary.passed),
    reason: normalizeString(summary.reason),
    journeyStageId: normalizeString(summary.journeyStageId),
    journeyId: normalizeString(summary.journeyId),
    playContext: normalizeString(summary.playContext),
    byModality: stableJson(summary.byModality ?? {}),
    adaptivePathProgressPct: normalizeNumber(summary.adaptivePathProgressPct),
    flowConfidenceScore: normalizeNumber(summary.flowConfidenceScore),
    flowDirectnessRatio: normalizeNumber(summary.flowDirectnessRatio),
    flowWrongSlotDwellMs: normalizeNumber(summary.flowWrongSlotDwellMs),
    recallConfidenceScore: normalizeNumber(summary.recallConfidenceScore),
    recallFluencyScore: normalizeNumber(summary.recallFluencyScore),
    recallCorrectionsCount: normalizeNumber(summary.recallCorrectionsCount),
    upsScore: normalizeNumber(summary.upsScore),
    upsAccuracy: normalizeNumber(summary.upsAccuracy),
    upsConfidence: normalizeNumber(summary.upsConfidence),
    avgResponseTimeMs: normalizeNumber(summary.avgResponseTimeMs),
    medianResponseTimeMs: normalizeNumber(summary.medianResponseTimeMs),
    responseTimeStdDev: normalizeNumber(summary.responseTimeStdDev),
    avgPressDurationMs: normalizeNumber(summary.avgPressDurationMs),
    pressDurationStdDev: normalizeNumber(summary.pressDurationStdDev),
    responsesDuringStimulus: normalizeInt(summary.responsesDuringStimulus),
    responsesAfterStimulus: normalizeInt(summary.responsesAfterStimulus),
    focusLostCount: normalizeInt(summary.focusLostCount),
    focusLostTotalMs: normalizeInt(summary.focusLostTotalMs),
    worstModalityErrorRate: normalizeNumber(summary.worstModalityErrorRate),
    inputMethods: normalizeString(summary.inputMethods),
  };
}

function hasSummaryDrift(
  cachedRow: DriftComparableRow,
  expectedSummary: SessionSummaryInput,
): boolean {
  const cachedComparable = toComparableCachedSummary(cachedRow);
  const expectedComparable = toComparableExpectedSummary(expectedSummary);
  return stableJson(cachedComparable) !== stableJson(expectedComparable);
}

/**
 * Detect stale/incorrect session_summaries by re-projecting from events and
 * repairing only mismatched rows.
 *
 * This keeps startup fast compared to full rebuilds while still ensuring the
 * cache remains aligned with the current projection logic.
 */
export async function repairDriftedSessionSummaries(
  persistence: PersistencePort,
  options: RepairDriftedSessionSummariesOptions = {},
): Promise<RepairDriftedSessionSummariesResult> {
  const db = requireDrizzleDb(persistence);
  const whereClauses: SQL[] = [sql`reason != 'abandoned'`];

  if (options.gameMode) {
    const normalizedGameMode = normalizeModeId(options.gameMode);
    whereClauses.push(sql`game_mode = ${normalizedGameMode}`);
  }

  const maxSessions =
    typeof options.maxSessions === 'number' && options.maxSessions > 0
      ? Math.floor(options.maxSessions)
      : null;
  const limitClause = maxSessions ? sql`LIMIT ${maxSessions}` : sql.raw('');

  const summaries = await db.all<DriftComparableRow>(
    sql`SELECT session_id, session_type, created_at, n_level, duration_ms, trials_count,
               total_hits, total_misses, total_fa, total_cr, global_d_prime, accuracy,
               generator, game_mode, passed, reason, journey_stage_id, journey_id, by_modality,
               adaptive_path_progress_pct,
               play_context,
               flow_confidence_score, flow_directness_ratio, flow_wrong_slot_dwell_ms,
               recall_confidence_score, recall_fluency_score, recall_corrections_count,
               ups_score, ups_accuracy, ups_confidence,
               avg_response_time_ms, median_response_time_ms, response_time_std_dev,
               avg_press_duration_ms, press_duration_std_dev,
               responses_during_stimulus, responses_after_stimulus,
               focus_lost_count, focus_lost_total_ms,
               worst_modality_error_rate, input_methods
        FROM session_summaries
        WHERE ${sql.join(whereClauses, sql` AND `)}
        ORDER BY created_at DESC
        ${limitClause}`,
  );
  if (summaries.length === 0) {
    return {
      checked: 0,
      repaired: 0,
      drifted: 0,
      skipped: 0,
      errors: 0,
    };
  }

  const sessionIds = summaries.map((row) => row.session_id).filter(Boolean);
  // Get session-end events via centralized event-queries module (chunked internally).
  const psDb = await requirePowerSyncDb(persistence);
  const endEventRows = await getSessionEndEventsForSessions(psDb, sessionIds, SESSION_END_TYPES);

  const latestEndEventBySessionId = new Map<string, EndEventRow>();
  for (const row of endEventRows) {
    const previous = latestEndEventBySessionId.get(row.session_id);
    const currentTs = Number(row.timestamp);
    const previousTs = previous ? Number(previous.timestamp) : Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(currentTs)) continue;
    if (!previous || currentTs >= previousTs) {
      latestEndEventBySessionId.set(row.session_id, row as EndEventRow);
    }
  }

  let checked = 0;
  let repaired = 0;
  let drifted = 0;
  let skipped = 0;
  let errors = 0;
  const budget = { lastYieldMs: nowMs() };

  for (const summaryRow of summaries) {
    const sessionId = summaryRow.session_id;
    const endRow = latestEndEventBySessionId.get(sessionId);
    if (!endRow) {
      skipped++;
      continue;
    }

    try {
      const parsedPayload = parsePayloadObject(endRow.payload);
      if (!parsedPayload) {
        skipped++;
        continue;
      }

      const rawEvent: RawVersionedEvent = {
        id: endRow.id,
        sessionId: endRow.session_id,
        type: endRow.type,
        timestamp: Number(endRow.timestamp),
        schemaVersion: (parsedPayload['schemaVersion'] as number) ?? 1,
        ...parsedPayload,
      };

      const strictValidation =
        endRow.type === 'SESSION_ENDED' &&
        normalizeModeId(summaryRow.game_mode ?? '') === 'dualnback-classic';

      const validated = migrateAndValidateEvent(rawEvent, {
        strict: strictValidation,
        logErrors: true,
        targetVersion: 1,
      });
      if (!validated.success) {
        errors++;
        continue;
      }

      const projectedSummaries: SessionSummaryInput[] = [];
      const collectingWriter: SessionSummaryWriter = {
        insert: async (summary) => {
          projectedSummaries.push(summary);
        },
      };

      await insertSessionSummaryFromEvent(persistence, validated.event, collectingWriter);

      const expectedSummary = projectedSummaries[0];
      if (!expectedSummary) {
        skipped++;
        continue;
      }

      checked++;
      if (hasSummaryDrift(summaryRow, expectedSummary)) {
        drifted++;
        await persistence.insertSessionSummary(expectedSummary);
        repaired++;
      }
    } catch (err) {
      errors++;
      projectionLog.warn(`repairDriftedSessionSummaries failed for session ${sessionId}:`, err);
    } finally {
      await yieldIfOverBudget(budget);
    }
  }

  projectionLog.info(
    `repairDriftedSessionSummaries: checked=${checked}, repaired=${repaired}, drifted=${drifted}, skipped=${skipped}, errors=${errors}`,
  );

  return {
    checked,
    repaired,
    drifted,
    skipped,
    errors,
  };
}

/**
 * Repair legacy session_summaries rows where `journey_stage_id` is present but
 * `journey_id` is missing (NULL/empty).
 *
 * Root cause: older builds validated events with Zod schemas that did not include
 * `journeyId`, and Zod stripped it during validation. Re-projecting the session
 * from its stored events restores `journey_id`.
 *
 * Returns the list of repaired session IDs.
 */
export async function repairJourneyIdsInSessionSummaries(
  persistence: PersistencePort,
): Promise<string[]> {
  const db = requireDrizzleDb(persistence);
  // Also repair sessions with missing game_mode or by_modality — these prevent
  // binary Jaeggi/BrainWorkshop scoring from working (score falls to UPS ~88
  // instead of binary 100, so the journey never advances).
  const targetRows = await db.all<{ session_id: string }>(
    sql`SELECT session_id
        FROM session_summaries
        WHERE (
          play_context IS NULL
          OR (
            play_context != 'journey'
            AND play_context != 'free'
            AND play_context != 'synergy'
            AND play_context != 'calibration'
            AND play_context != 'profile'
          )
        )
        OR (
          journey_stage_id IS NOT NULL
          AND (
            journey_id IS NULL OR journey_id = ''
            OR game_mode IS NULL OR game_mode = ''
            OR by_modality IS NULL OR by_modality = '' OR by_modality = '{}'
          )
        )`,
  );

  if (targetRows.length === 0) return [];

  const psDb = await requirePowerSyncDb(persistence);
  const repaired: string[] = [];
  let processed = 0;

  for (const row of targetRows) {
    const sessionId = row.session_id;
    if (!sessionId) continue;

    try {
      const endRow = await getLatestSessionEndEvent(psDb, sessionId, SESSION_END_TYPES);
      if (!endRow) continue;

      let parsedPayload: Record<string, unknown>;
      if (typeof endRow.payload === 'string') {
        parsedPayload = JSON.parse(endRow.payload) as Record<string, unknown>;
      } else if (endRow.payload && typeof endRow.payload === 'object') {
        parsedPayload = endRow.payload as Record<string, unknown>;
      } else {
        continue;
      }

      const rawEvent: RawVersionedEvent = {
        id: endRow.id,
        sessionId: endRow.session_id,
        type: endRow.type,
        timestamp: Number(endRow.timestamp),
        schemaVersion: (parsedPayload['schemaVersion'] as number) ?? 1,
        ...parsedPayload,
      };

      const validated = migrateAndValidateEvent(rawEvent, {
        strict: false,
        logErrors: true,
        targetVersion: 1,
      });
      if (!validated.success) continue;

      await insertSessionSummaryFromEvent(persistence, validated.event);
      repaired.push(sessionId);
    } catch (err) {
      projectionLog.warn(
        `repairJourneyIdsInSessionSummaries failed for session ${sessionId}:`,
        err,
      );
    } finally {
      processed++;
      // Yield periodically: this can run at startup and otherwise blocks the UI.
      if (processed % 5 === 0) {
        await yieldToMainThread();
      }
    }
  }

  return repaired;
}
