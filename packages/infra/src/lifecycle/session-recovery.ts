/**
 * Session Recovery Service
 *
 * Provides localStorage-based session recovery for page refreshes.
 * Works in tandem with SQLite event storage.
 *
 * Pattern:
 * 1. During game: periodically save recovery snapshot to localStorage
 * 2. On page load: check for existing snapshot
 * 3. If found & fresh: offer to resume (events are in SQLite)
 * 4. On resume/decline: clear the snapshot
 *
 * Why localStorage over SQLite for this?
 * - Synchronous access on page load (no async init needed)
 * - Very small data (just metadata, not events)
 * - Events are already in SQLite which persists across refreshes
 */

import {
  RecoveryProjector,
  type SessionRecoverySnapshot,
  type RecoveryCheckResult,
  type RecoveredSessionState,
  type PersistencePort,
  type RawVersionedEvent,
  migrateAndValidateEventBatch,
} from '@neurodual/logic';
import { sessionRecoveryLog } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'nd_session_recovery';

/** Snapshot considered stale after 30 minutes */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/** Snapshot expires completely after 2 hours */
const EXPIRY_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// =============================================================================
// Core API
// =============================================================================

/**
 * Save a recovery snapshot to localStorage.
 * Call this on each trial presentation or pause.
 */
export function saveRecoverySnapshot(snapshot: SessionRecoverySnapshot): void {
  try {
    const data = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    // localStorage might be full or disabled - fail silently
    console.warn('[Session Recovery] Failed to save snapshot:', error);
  }
}

/**
 * Load a recovery snapshot from localStorage.
 * Returns null if no snapshot exists or it's invalid.
 */
export function loadRecoverySnapshot(): SessionRecoverySnapshot | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const snapshot = JSON.parse(data) as SessionRecoverySnapshot;

    // Basic validation
    if (!snapshot.sessionId || !snapshot.modeId || !snapshot.config) {
      console.warn('[Session Recovery] Invalid snapshot structure');
      clearRecoverySnapshot();
      return null;
    }

    return snapshot;
  } catch (error) {
    console.warn('[Session Recovery] Failed to load snapshot:', error);
    clearRecoverySnapshot();
    return null;
  }
}

/**
 * Clear the recovery snapshot.
 * Call this when:
 * - Session completes normally
 * - User declines to resume
 * - User explicitly starts a new session
 */
export function clearRecoverySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Pipeline recovery key (from apps/web/services/session-pipeline.ts)
 * Duplicated here to allow clearing on logout without circular dependencies.
 */
const PIPELINE_RECOVERY_KEY = 'neurodual:pipeline:recovery';

/**
 * Clear ALL recovery-related localStorage data.
 * Call this on logout to prevent cross-account leakage.
 *
 * Clears:
 * - nd_session_recovery (session recovery snapshot)
 * - neurodual:pipeline:recovery (pipeline crash recovery state)
 */
export function clearAllRecoveryData(): void {
  clearRecoverySnapshot();
  try {
    localStorage.removeItem(PIPELINE_RECOVERY_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Check if there's a recoverable session.
 * This is the main entry point for recovery logic.
 */
export function checkForRecoverableSession(): RecoveryCheckResult {
  const snapshot = loadRecoverySnapshot();

  if (!snapshot) {
    return { hasSession: false, snapshot: null, isStale: false };
  }

  const age = Date.now() - snapshot.timestamp;

  // Expired completely - auto-clear
  if (age > EXPIRY_THRESHOLD_MS) {
    clearRecoverySnapshot();
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
 * Check if a session recovery snapshot exists without loading it.
 * Use this for quick checks in routing logic.
 */
export function hasRecoverySnapshot(): boolean {
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
 * Create a recovery snapshot from session state.
 * Helper for building the snapshot object.
 */
export function createRecoverySnapshot(params: {
  sessionId: string;
  modeId: SessionRecoverySnapshot['modeId'];
  config: SessionRecoverySnapshot['config'];
  trialIndex: number;
  totalTrials: number;
  nLevel?: number;
  declaredEnergyLevel?: number;
  playMode?: SessionRecoverySnapshot['playMode'];
  journeyStageId?: number;
  journeyId?: string;
}): SessionRecoverySnapshot {
  return {
    sessionId: params.sessionId,
    modeId: params.modeId,
    config: params.config,
    trialIndex: params.trialIndex,
    totalTrials: params.totalTrials,
    timestamp: Date.now(),
    nLevel: params.nLevel,
    declaredEnergyLevel: params.declaredEnergyLevel,
    playMode: params.playMode,
    journeyStageId: params.journeyStageId,
    journeyId: params.journeyId,
  };
}

// =============================================================================
// Browser Event Handlers (for apps/web to use)
// =============================================================================

/**
 * Install beforeunload handler to save snapshot on page close.
 * Returns cleanup function.
 *
 * @param getSnapshot - Function that returns current snapshot or null if session not active
 */
export function installRecoveryHandlers(
  getSnapshot: () => SessionRecoverySnapshot | null,
): () => void {
  const handleBeforeUnload = () => {
    const snapshot = getSnapshot();
    if (snapshot) {
      saveRecoverySnapshot(snapshot);
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      const snapshot = getSnapshot();
      if (snapshot) {
        saveRecoverySnapshot(snapshot);
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
 * Build full recovered session state from snapshot + events.
 * Combines localStorage snapshot with SQLite events via RecoveryProjector.
 *
 * @param persistence - PersistencePort to fetch events
 * @returns Full RecoveredSessionState or null if recovery not possible
 */
export async function buildRecoveredState(
  persistence: PersistencePort,
): Promise<RecoveredSessionState | null> {
  // 1. Check for snapshot in localStorage
  const checkResult = checkForRecoverableSession();

  if (!checkResult.hasSession || !checkResult.snapshot) {
    return null;
  }

  const snapshot = checkResult.snapshot;

  // 2. Fetch events from SQLite
  const storedEvents = await persistence.getSession(snapshot.sessionId);

  const streamVersion: number | undefined = undefined;

  sessionRecoveryLog.debug('Fetched events for session:', {
    sessionId: snapshot.sessionId,
    eventCount: storedEvents.length,
    eventTypes: storedEvents.map((e) => e.type),
  });

  if (storedEvents.length === 0) {
    console.warn('[SessionRecovery] No events found for session');
    clearRecoverySnapshot();
    return null;
  }

  // 3. Convert StoredEvent to GameEvent with validation
  // CRITICAL: spread payload FIRST, then override schemaVersion
  // Otherwise, payload.schemaVersion (potentially undefined) would overwrite our default
  const rawEvents: RawVersionedEvent[] = storedEvents.map((e) => ({
    ...e.payload, // Spread first
    id: e.id,
    sessionId: e.session_id,
    type: e.type,
    timestamp: e.timestamp,
    schemaVersion: (e.payload['schemaVersion'] as number) ?? 1, // Then override with default
  }));

  const { events, errorCount } = migrateAndValidateEventBatch(rawEvents, {
    strict: false,
    logErrors: true,
    targetVersion: 1,
  });

  if (errorCount > 0) {
    console.warn(`[SessionRecovery] ${errorCount} events failed validation`);
  }

  sessionRecoveryLog.debug('Converted events:', {
    eventCount: events.length,
    firstEvent: events[0] ? { type: events[0].type, sessionId: events[0].sessionId } : null,
  });

  // 4. Project events to get trial history and responses
  const projected = RecoveryProjector.project(events);

  sessionRecoveryLog.debug('Projection result:', {
    hasProjected: !!projected,
    sessionId: projected?.sessionId,
    lastTrialIndex: projected?.lastTrialIndex,
  });

  if (!projected) {
    // Session already ended or invalid
    console.warn('[SessionRecovery] Projection failed - session may have ended or invalid events');
    clearRecoverySnapshot();
    return null;
  }

  const snapshotTrialIndex = Number.isFinite(snapshot.trialIndex)
    ? Math.trunc(snapshot.trialIndex)
    : -1;
  const projectedLastTrialIndex = projected.lastTrialIndex;
  const fallbackLastTrialIndex =
    snapshotTrialIndex >= 0 ? Math.min(snapshotTrialIndex, snapshot.totalTrials - 1) : -1;
  const resolvedLastTrialIndex = Math.max(projectedLastTrialIndex, fallbackLastTrialIndex);

  // 5. Build full recovered state
  return {
    sessionId: snapshot.sessionId,
    modeId: snapshot.modeId,
    playMode:
      snapshot.playMode ??
      (projected.journeyStageId != null || projected.journeyId != null ? 'journey' : 'free'),
    config: snapshot.config,
    lastTrialIndex: resolvedLastTrialIndex,
    trialHistory: projected.trialHistory,
    responses: projected.responses,
    startTimestamp: projected.startTimestamp,
    nLevel: snapshot.nLevel,
    journeyStageId: projected.journeyStageId ?? undefined,
    journeyId: projected.journeyId ?? undefined,
    gameMode: projected.gameMode ?? undefined,
    isStale: checkResult.isStale,
    declaredEnergyLevel: snapshot.declaredEnergyLevel as 1 | 2 | 3 | undefined,
    // CRITICAL: Include all existing events for accurate session report
    // Without this, only post-recovery events would be counted in the final report
    existingEvents: events,
    // CRITICAL: Preserve original trialsSeed to regenerate the same sequence
    // Without this, the generator produces different trials after recovery
    trialsSeed: projected.trialsSeed ?? undefined,
    // CRITICAL: Stream version from emt_streams (authoritative source)
    // Used to initialize currentStreamVersion in GameSessionXState
    // Falls back to event count if not available
    streamVersion,
  };
}
