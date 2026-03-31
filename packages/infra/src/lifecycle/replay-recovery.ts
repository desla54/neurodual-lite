/**
 * Replay Recovery Service
 *
 * Provides localStorage-based recovery for interactive replay (correction mode).
 * Works in tandem with SQLite replay_runs/replay_events tables.
 *
 * Pattern:
 * 1. On START: create run in DB, save snapshot to localStorage
 * 2. During replay: update snapshot periodically (time, trial index)
 * 3. On page load: check for existing snapshot
 * 4. If found & fresh: offer to resume (events are in SQLite)
 * 5. On resume/decline: clear the snapshot
 *
 * Why localStorage over SQLite for this?
 * - Synchronous access on page load (no async init needed)
 * - Very small data (just metadata: runId, currentTimeMs, speed)
 * - Events are already in SQLite (replay_events) which persists across refreshes
 */

import {
  ReplayRecoveryProjector,
  type ReplayRecoverySnapshot,
  type ReplayRecoveryCheckResult,
  type RecoveredReplayState,
  type ReplayInteractifPort,
  type PersistencePort,
} from '@neurodual/logic';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { requireDrizzleDb } from '../db/drizzle';
import { replayLog } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'nd_replay_recovery';

/** Snapshot considered stale after 30 minutes */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/** Snapshot expires completely after 2 hours */
const EXPIRY_THRESHOLD_MS = 2 * 60 * 60 * 1000;

const replayRunsTable = sqliteTable('replay_runs', {
  id: text('id'),
  status: text('status'),
  created_at: integer('created_at'),
});

// =============================================================================
// Core API
// =============================================================================

/**
 * Save a replay recovery snapshot to localStorage.
 * Call this on playback start, after each trial, or on pause.
 */
export function saveReplayRecoverySnapshot(snapshot: ReplayRecoverySnapshot): void {
  try {
    const data = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    // localStorage might be full or disabled - fail silently
    console.warn('[Replay Recovery] Failed to save snapshot:', error);
  }
}

/**
 * Load a replay recovery snapshot from localStorage.
 * Returns null if no snapshot exists or it's invalid.
 */
export function loadReplayRecoverySnapshot(): ReplayRecoverySnapshot | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const snapshot = JSON.parse(data) as ReplayRecoverySnapshot;

    // Basic validation
    if (!snapshot.runId || !snapshot.sessionId || !snapshot.sessionType) {
      console.warn('[Replay Recovery] Invalid snapshot structure');
      clearReplayRecoverySnapshot();
      return null;
    }

    return snapshot;
  } catch (error) {
    console.warn('[Replay Recovery] Failed to load snapshot:', error);
    clearReplayRecoverySnapshot();
    return null;
  }
}

/**
 * Clear the replay recovery snapshot.
 * Call this when:
 * - Replay completes (run validated)
 * - User declines to resume
 * - User explicitly abandons the run
 */
export function clearReplayRecoverySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Check if there's a recoverable replay.
 * This is the main entry point for recovery logic.
 */
export function checkForRecoverableReplay(): ReplayRecoveryCheckResult {
  const snapshot = loadReplayRecoverySnapshot();

  if (!snapshot) {
    return { hasSession: false, snapshot: null, isStale: false };
  }

  const age = Date.now() - snapshot.timestamp;

  // Expired completely - auto-clear
  if (age > EXPIRY_THRESHOLD_MS) {
    clearReplayRecoverySnapshot();
    return { hasSession: false, snapshot: null, isStale: false };
  }

  const isStale = age > STALE_THRESHOLD_MS;

  return {
    hasSession: true,
    snapshot,
    isStale,
  };
}

/**
 * Check if a replay recovery snapshot exists without loading it.
 * Use this for quick checks in routing logic.
 */
export function hasReplayRecoverySnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a replay recovery snapshot from current state.
 * Helper for building the snapshot object.
 */
export function createReplayRecoverySnapshot(params: {
  runId: string;
  sessionId: string;
  sessionType: ReplayRecoverySnapshot['sessionType'];
  parentRunId: string | null;
  currentTimeMs: number;
  currentTrialIndex: number;
  speed: 0.5 | 1 | 2;
}): ReplayRecoverySnapshot {
  return {
    runId: params.runId,
    sessionId: params.sessionId,
    sessionType: params.sessionType,
    parentRunId: params.parentRunId,
    currentTimeMs: params.currentTimeMs,
    currentTrialIndex: params.currentTrialIndex,
    speed: params.speed,
    timestamp: Date.now(),
  };
}

// =============================================================================
// Browser Event Handlers (for apps/web to use)
// =============================================================================

/**
 * Install beforeunload handler to save snapshot on page close.
 * Returns cleanup function.
 *
 * @param getSnapshot - Function that returns current snapshot or null if replay not active
 */
export function installReplayRecoveryHandlers(
  getSnapshot: () => ReplayRecoverySnapshot | null,
): () => void {
  const handleBeforeUnload = () => {
    const snapshot = getSnapshot();
    if (snapshot) {
      saveReplayRecoverySnapshot(snapshot);
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      const snapshot = getSnapshot();
      if (snapshot) {
        saveReplayRecoverySnapshot(snapshot);
      }
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

// =============================================================================
// Full Recovery State Builder
// =============================================================================

/**
 * Build full recovered replay state from snapshot + events.
 * Combines localStorage snapshot with SQLite events via ReplayRecoveryProjector.
 *
 * @param adapter - ReplayInteractifPort to fetch run and events
 * @returns Full RecoveredReplayState or null if recovery not possible
 */
export async function buildRecoveredReplayState(
  adapter: ReplayInteractifPort,
): Promise<RecoveredReplayState | null> {
  // 1. Check for snapshot in localStorage
  const checkResult = checkForRecoverableReplay();

  if (!checkResult.hasSession || !checkResult.snapshot) {
    return null;
  }

  const snapshot = checkResult.snapshot;

  // 2. Fetch run from DB
  const run = await adapter.getRun(snapshot.runId);

  if (!run) {
    // Run was deleted or doesn't exist
    clearReplayRecoverySnapshot();
    return null;
  }

  // 3. Check if run is already completed
  if (run.status === 'completed') {
    clearReplayRecoverySnapshot();
    return null;
  }

  // 4. Fetch events for this run
  const events = await adapter.getEventsForRun(snapshot.runId);

  // 5. Project using ReplayRecoveryProjector
  const projected = ReplayRecoveryProjector.project(run, events, snapshot.timestamp);

  if (!projected) {
    clearReplayRecoverySnapshot();
    return null;
  }

  return projected;
}

// =============================================================================
// Orphan Cleanup
// =============================================================================

/**
 * Yield to the main thread to prevent UI freezes during heavy loops.
 * Uses MessageChannel for fastest yield (not throttled like RAF).
 */
async function yieldToMain(): Promise<void> {
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

function isLikelySqliteLockContention(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('database is locked') ||
    message.includes('database locked') ||
    message.includes('database is busy') ||
    message.includes('database busy') ||
    message.includes('lock timeout')
  );
}

/**
 * Clean up orphaned runs (in_progress for too long).
 * Call this on app startup.
 * Deletes in small batches and yields between batches to prevent UI freezes.
 *
 * @param persistence - PersistencePort
 * @param thresholdMs - How old a run must be to be considered orphaned (default: 2h)
 * @returns Number of deleted runs
 */
export async function cleanupOrphanedRuns(
  persistence: PersistencePort,
  thresholdMs: number = EXPIRY_THRESHOLD_MS,
): Promise<{ deletedCount: number }> {
  const db = requireDrizzleDb(persistence);
  const threshold = Date.now() - thresholdMs;

  // Keep writes tiny and interleaved with yields to minimize main-thread blocking
  // on Web SQLite backends during startup.
  const batchSize = 5;
  let deletedCount = 0;

  while (true) {
    const batch = await db
      .select({ id: replayRunsTable.id })
      .from(replayRunsTable)
      .where(
        and(eq(replayRunsTable.status, 'in_progress'), lt(replayRunsTable.created_at, threshold)) ??
          sql`1 = 0`,
      )
      .orderBy(asc(replayRunsTable.created_at), asc(replayRunsTable.id))
      .limit(batchSize);

    const runIds = batch.map((r) => r.id);
    if (runIds.length === 0) break;

    for (const runId of runIds) {
      try {
        // Delete events first (no FK cascade guaranteed on local-only tables)
        await db.run(sql`DELETE FROM replay_events WHERE run_id = ${runId}`);
        await db.run(sql`DELETE FROM replay_runs WHERE id = ${runId}`);
        deletedCount += 1;
      } catch (error) {
        // Best-effort maintenance task: abort quietly when DB is busy to avoid
        // long lock waits and startup freezes. We'll retry on next app start.
        if (isLikelySqliteLockContention(error)) {
          replayLog.debug(
            `Skipping orphaned runs cleanup due SQLite lock contention (deleted so far: ${deletedCount})`,
          );
          return { deletedCount };
        }
        throw error;
      }
      await yieldToMain();
    }
  }

  if (deletedCount > 0) {
    replayLog.debug(`Deleted ${deletedCount} orphaned replay runs`);
  }

  return { deletedCount };
}
