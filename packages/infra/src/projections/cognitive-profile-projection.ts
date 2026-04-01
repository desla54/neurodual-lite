/**
 * Cognitive Profile Projection (incremental evolve pattern)
 *
 * Maintains calibration state incrementally via evolve(state, event) → state.
 * Each incoming event is applied to the stored snapshot — no full rebuild.
 *
 * Event types handled:
 * - CALIBRATION_BASELINE_SET → applyCalibrationEvent(state, baselineEvent)
 * - CALIBRATION_RESET → applyCalibrationEvent(state, resetEvent)
 * - SESSION_*_ENDED (calibration/profile context only) → reconstruct single
 *   session → extract CalibrationSessionFact(s) → apply each incrementally
 *
 * Full rebuild via rebuildCalibrationProfile() truncates + replays through the handler.
 */

import {
  CALIBRATION_SEQUENCE,
  DEFAULT_CALIBRATION_STATE,
  SESSION_END_EVENT_TYPES_ARRAY,
  type GameEvent,
  isSessionEndEventType,
  type CalibrationEvent,
  type CalibrationGameMode,
  type CalibrationModality,
  type CalibrationSessionFact,
  type CalibrationState,
  type NextTrainingSession,
  type RawVersionedEvent,
  type SessionSummaryInput,
  applyCalibrationEvent,
  computeGlobalScore,
  findModalityExtremes,
  pickNextTrainingSession,
  resultKey,
} from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { ProjectedEvent, ProjectionDefinition } from './projection-definition';
import { safeJsonParse } from '../db/sql-helpers';
import { getSessionEvents, type EventRow } from '../persistence/session-queries';
import { projectSessionSummaryFromRawEvents } from '../history/project-session-summary-from-events';

// =============================================================================
// Types
// =============================================================================

type CalibrationEvidenceSource = 'none' | 'baseline' | 'session';

interface StepEvidenceRow {
  readonly baselineLevel: number | null;
  readonly source: CalibrationEvidenceSource;
}

/** Snapshot loaded from the projection table. */
interface ProfileSnapshot {
  state: CalibrationState;
  recentStepKeys: string[];
  baselineLevel: number | null;
  modalitySources: Record<string, StepEvidenceRow>;
}

// =============================================================================
// Modality resolution (shared by incremental + full rebuild)
// =============================================================================

/** Map from session-summary modality keys to CalibrationModality */
const MODALITY_KEY_MAP: Record<string, CalibrationModality> = {
  position: 'position',
  image: 'shape',
  color: 'color',
  spatial: 'spatial',
  audio: 'letters',
  digits: 'numbers',
  emotions: 'emotions',
  words: 'semantic',
  tones: 'tones',
};

function resolveCalibrationGameMode(gameMode: string | null): CalibrationGameMode {
  const isDualTrack = gameMode === 'dual-track' || gameMode === 'dual-catch';
  return isDualTrack ? 'dual-track' : 'nback';
}

function resolveCalibrationSessionModalities(
  byModality: Record<string, unknown> | undefined,
): Map<CalibrationModality, Record<string, unknown> | null> {
  const modalities = new Map<CalibrationModality, Record<string, unknown> | null>();
  for (const [rawKey, stats] of Object.entries(byModality ?? {})) {
    const modality = MODALITY_KEY_MAP[rawKey.trim()];
    if (modality && !modalities.has(modality)) {
      const normalizedStats =
        typeof stats === 'object' && stats !== null && !Array.isArray(stats)
          ? (stats as Record<string, unknown>)
          : null;
      modalities.set(modality, normalizedStats);
    }
  }
  return modalities;
}

function resolveCalibrationScore(
  gameMode: CalibrationGameMode,
  summary: Pick<SessionSummaryInput, 'accuracy' | 'globalDPrime'>,
  modalityStats?: Record<string, unknown> | null,
): number {
  if (gameMode === 'nback') {
    const modalityDPrime = modalityStats?.['dPrime'];
    if (typeof modalityDPrime === 'number' && Number.isFinite(modalityDPrime)) {
      return modalityDPrime;
    }
    return summary.globalDPrime ?? summary.accuracy ?? 0;
  }
  return summary.accuracy ?? 0;
}

function extractCalibrationSessionFactsFromSummary(
  summary: SessionSummaryInput,
): CalibrationSessionFact[] {
  if (summary.reason !== 'completed') return [];
  if (summary.playContext !== 'calibration' && summary.playContext !== 'profile') return [];

  const calibrationGameMode = resolveCalibrationGameMode(summary.gameMode ?? null);
  const modalities = resolveCalibrationSessionModalities(summary.byModality);
  if (modalities.size === 0) return [];

  const timestamp = summary.createdAt.getTime();
  return [...modalities.entries()].map(([modality, stats]) => ({
    modality,
    gameMode: calibrationGameMode,
    score: resolveCalibrationScore(calibrationGameMode, summary, stats),
    timestamp,
  }));
}

function toRawVersionedEvent(row: EventRow): RawVersionedEvent {
  const parsedPayload =
    typeof row.payload === 'string'
      ? safeJsonParse<Record<string, unknown>>(row.payload, {})
      : row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
  const sessionId =
    row.session_id ??
    (typeof parsedPayload['sessionId'] === 'string' ? (parsedPayload['sessionId'] as string) : '');

  return {
    ...parsedPayload,
    id: row.id,
    sessionId,
    type: row.type,
    timestamp: Number(row.timestamp),
    schemaVersion:
      typeof parsedPayload['schemaVersion'] === 'number'
        ? (parsedPayload['schemaVersion'] as number)
        : 1,
  };
}

// =============================================================================
// Snapshot persistence (read / write)
// =============================================================================

async function loadSnapshot(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<ProfileSnapshot | null> {
  const rows = await db.getAll<{
    phase: string | null;
    current_step_index: number | null;
    results_json: string | null;
    recent_step_keys_json: string | null;
    baseline_level: number | null;
    modality_sources_json: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>(
    `SELECT phase, current_step_index, results_json, recent_step_keys_json,
            baseline_level, modality_sources_json, started_at, completed_at
     FROM cognitive_profile_projection WHERE id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;

  const results = safeJsonParse<Record<string, unknown>>(row.results_json ?? '{}', {});
  const recentStepKeys = safeJsonParse<string[]>(row.recent_step_keys_json ?? '[]', []);
  const modalitySources = safeJsonParse<Record<string, StepEvidenceRow>>(
    row.modality_sources_json ?? '{}',
    {},
  );

  return {
    state: {
      phase: (row.phase as CalibrationState['phase']) ?? 'idle',
      currentStepIndex: row.current_step_index ?? 0,
      results: (results ?? {}) as Record<
        string,
        import('@neurodual/logic').ModalityCalibrationState
      >,
      startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    },
    recentStepKeys: Array.isArray(recentStepKeys)
      ? recentStepKeys.filter((k): k is string => typeof k === 'string')
      : [],
    baselineLevel: row.baseline_level ?? null,
    modalitySources: (modalitySources ?? {}) as Record<string, StepEvidenceRow>,
  };
}

function buildDerivedFields(
  state: CalibrationState,
  recentStepKeys: string[],
  baselineLevel: number | null,
  modalitySources: Record<string, StepEvidenceRow>,
): {
  globalScore: number;
  strongest: string | null;
  weakest: string | null;
  nextRecommendedSession: NextTrainingSession | null;
  modalitySources: Record<string, StepEvidenceRow>;
} {
  // Ensure all steps have an entry in modalitySources
  const completeSources = { ...modalitySources };
  for (const step of CALIBRATION_SEQUENCE) {
    const key = resultKey(step.modality, step.gameMode);
    if (!completeSources[key]) {
      const masteredLevel = state.results[key]?.masteredLevel ?? null;
      completeSources[key] = {
        source: baselineLevel != null && masteredLevel != null ? 'baseline' : 'none',
        baselineLevel,
      };
    }
  }

  return {
    globalScore: computeGlobalScore(state.results),
    ...findModalityExtremes(state.results),
    nextRecommendedSession: pickNextTrainingSession(
      state.results,
      recentStepKeys,
    ) as NextTrainingSession | null,
    modalitySources: completeSources,
  };
}

async function writeSnapshot(
  db: AbstractPowerSyncDatabase,
  userId: string,
  state: CalibrationState,
  recentStepKeys: string[],
  baselineLevel: number | null,
  modalitySources: Record<string, StepEvidenceRow>,
): Promise<void> {
  const derived = buildDerivedFields(state, recentStepKeys, baselineLevel, modalitySources);
  const now = new Date().toISOString();

  // Use writeTransaction to ensure watched queries are notified of the change
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT OR IGNORE INTO cognitive_profile_projection
         (id, user_id, phase, current_step_index, results_json, recent_step_keys_json,
          baseline_level, modality_sources_json, next_recommended_session_json, global_score,
          strongest_modality, weakest_modality, started_at, completed_at, updated_at)
       VALUES (?, ?, 'idle', 0, '{}', '[]', NULL, '{}', NULL, 0, NULL, NULL, NULL, NULL, ?)`,
      [userId, userId, now],
    );
    await tx.execute(
      `UPDATE cognitive_profile_projection
       SET phase = ?,
           current_step_index = ?,
           results_json = ?,
           recent_step_keys_json = ?,
           baseline_level = ?,
           modality_sources_json = ?,
           next_recommended_session_json = ?,
           global_score = ?,
           strongest_modality = ?,
           weakest_modality = ?,
           started_at = ?,
           completed_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        state.phase,
        state.currentStepIndex,
        JSON.stringify(state.results),
        JSON.stringify(recentStepKeys),
        baselineLevel,
        JSON.stringify(derived.modalitySources),
        derived.nextRecommendedSession ? JSON.stringify(derived.nextRecommendedSession) : null,
        derived.globalScore,
        derived.strongest,
        derived.weakest,
        state.startedAt ? new Date(state.startedAt).toISOString() : null,
        state.completedAt ? new Date(state.completedAt).toISOString() : null,
        now,
        userId,
      ],
    );
  });
}

// =============================================================================
// Single-session fact extraction
// =============================================================================

/**
 * Reconstruct a single session from session_events and extract CalibrationSessionFact(s).
 * O(events_per_session) — typically 20-100 events.
 */
async function extractSessionFacts(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
  userId: string,
): Promise<CalibrationSessionFact[]> {
  const eventRows = await getSessionEvents(db, sessionId);
  if (eventRows.length === 0) return [];

  let projection: ReturnType<typeof projectSessionSummaryFromRawEvents>;
  try {
    projection = projectSessionSummaryFromRawEvents({
      sessionId,
      rawEvents: eventRows.map(toRawVersionedEvent),
      fallbackUserId: userId,
    });
  } catch (error) {
    console.warn(
      `[cognitive-profile] Failed to reconstruct session ${sessionId} for ${userId}`,
      error,
    );
    return [];
  }

  if (projection.isAbandoned || !projection.summary) return [];
  return extractCalibrationSessionFactsFromSummary(projection.summary);
}

// =============================================================================
// Incremental handler — evolve(state, event) → state
// =============================================================================

/**
 * Process a batch of events for a single user incrementally.
 *
 * 1. Load current snapshot from cognitive_profile_projection
 * 2. For each event: apply via applyCalibrationEvent (pure fold)
 * 3. Write updated snapshot
 */
async function processUserEvents(
  db: AbstractPowerSyncDatabase,
  userId: string,
  events: readonly ProjectedEvent[],
): Promise<void> {
  const snapshot = await loadSnapshot(db, userId);
  let state = snapshot?.state ?? { ...DEFAULT_CALIBRATION_STATE };
  let recentStepKeys = snapshot?.recentStepKeys ?? [];
  let baselineLevel = snapshot?.baselineLevel ?? null;
  let modalitySources = snapshot?.modalitySources ?? {};
  let changed = false;

  for (const event of events) {
    if (event.type === 'CALIBRATION_RESET') {
      const timestamp =
        typeof event.data['timestamp'] === 'number'
          ? event.data['timestamp']
          : event.createdAt.getTime();

      state = applyCalibrationEvent(state, { type: 'CALIBRATION_RESET', timestamp });
      recentStepKeys = [];
      baselineLevel = null;
      modalitySources = {};
      changed = true;

      // Reset profile sessions counter (best-effort — table may not exist yet during replay)
      try {
        await db.execute(
          `UPDATE user_stats_projection SET profile_sessions_count = 0 WHERE user_id = ?`,
          [userId],
        );
      } catch {
        // Table/column not ready yet — will be correct after session-summaries replay
      }
    } else if (event.type === 'CALIBRATION_BASELINE_SET') {
      const level = event.data['level'];
      const timestamp =
        typeof event.data['timestamp'] === 'number'
          ? event.data['timestamp']
          : event.createdAt.getTime();

      if (typeof level === 'number' && Number.isFinite(level)) {
        const calibrationEvent: CalibrationEvent = {
          type: 'CALIBRATION_BASELINE_SET',
          timestamp,
          level,
        };
        state = applyCalibrationEvent(state, calibrationEvent);
        baselineLevel = level;

        // Update evidence: un-sessioned steps now have baseline evidence
        for (const step of CALIBRATION_SEQUENCE) {
          const key = resultKey(step.modality, step.gameMode);
          const existing = modalitySources[key];
          if (!existing || existing.source === 'none') {
            const masteredLevel = state.results[key]?.masteredLevel ?? null;
            modalitySources[key] = {
              source: masteredLevel != null ? 'baseline' : 'none',
              baselineLevel: level,
            };
          }
        }
        changed = true;
      }
    } else if (event.type === 'CALIBRATION_MODALITY_DETERMINED') {
      const modality = event.data['modality'];
      const gameMode = event.data['gameMode'];
      const masteredLevel = event.data['masteredLevel'];
      const timestamp =
        typeof event.data['timestamp'] === 'number'
          ? event.data['timestamp']
          : event.createdAt.getTime();

      if (
        typeof modality === 'string' &&
        typeof gameMode === 'string' &&
        typeof masteredLevel === 'number' &&
        Number.isFinite(masteredLevel)
      ) {
        const calibrationEvent: CalibrationEvent = {
          type: 'CALIBRATION_MODALITY_DETERMINED',
          timestamp,
          modality: modality as CalibrationModality,
          gameMode: gameMode as CalibrationGameMode,
          masteredLevel,
        };
        state = applyCalibrationEvent(state, calibrationEvent);

        const key = resultKey(modality as CalibrationModality, gameMode as CalibrationGameMode);
        modalitySources[key] = { source: 'session', baselineLevel };
        recentStepKeys = [key, ...recentStepKeys.filter((k) => k !== key)];
        changed = true;
      }
    } else if (isSessionEndEventType(event.type)) {
      // Session end — extract sessionId and reconstruct this single session
      const sessionId = event.data['sessionId'];
      if (typeof sessionId !== 'string' || sessionId.trim().length === 0) continue;

      const facts = await extractSessionFacts(db, sessionId.trim(), userId);
      if (facts.length === 0) continue;

      for (const fact of facts) {
        const calibrationEvent: CalibrationEvent = {
          type: 'CALIBRATION_SESSION_RECORDED',
          timestamp: fact.timestamp,
          modality: fact.modality,
          gameMode: fact.gameMode,
          score: fact.score,
        };
        state = applyCalibrationEvent(state, calibrationEvent);

        // Update evidence and recent step keys
        const key = resultKey(fact.modality, fact.gameMode);
        modalitySources[key] = { source: 'session', baselineLevel };
        // Prepend to recent (most recent first), avoid duplicates
        recentStepKeys = [key, ...recentStepKeys.filter((k) => k !== key)];
      }
      changed = true;
    }
  }

  if (changed) {
    await writeSnapshot(db, userId, state, recentStepKeys, baselineLevel, modalitySources);
  }
}

// =============================================================================
// Full rebuild (truncate + replay via projection handler)
// =============================================================================

/**
 * Full rebuild for a single user. Truncates their row and replays all
 * relevant events through processUserEvents directly.
 *
 * Used by tests and manual recovery only.
 */
export async function rebuildCalibrationProfile(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<CalibrationState> {
  // Delete existing row for this user
  await db.execute('DELETE FROM cognitive_profile_projection WHERE user_id = ?', [userId]);

  // Collect all relevant events from session_events for this user
  const sessionRows = await db.getAll<{
    session_id: string;
    events_json: string;
    created_at: string;
  }>(
    `SELECT session_id, events_json, created_at FROM session_events ORDER BY created_at ASC`,
  );

  const relevantTypes = new Set([
    'CALIBRATION_BASELINE_SET',
    'CALIBRATION_RESET',
    ...SESSION_END_EVENT_TYPES_ARRAY,
  ]);

  // Convert to ProjectedEvent format, filtering by userId and event type
  const events: ProjectedEvent[] = [];
  let posCounter = 0;
  for (const sessionRow of sessionRows) {
    let rawEvents: Record<string, unknown>[];
    try {
      rawEvents = JSON.parse(sessionRow.events_json) as Record<string, unknown>[];
    } catch {
      continue;
    }

    // Resolve session userId
    let sessionUserId: string | undefined;
    for (const e of rawEvents) {
      const uid = e['userId'];
      if (typeof uid === 'string' && uid.trim().length > 0) {
        sessionUserId = uid.trim();
        break;
      }
    }

    for (const e of rawEvents) {
      const type = String(e['type'] ?? '');
      if (!relevantTypes.has(type)) continue;

      // For baseline/reset events, check userId directly
      if (type === 'CALIBRATION_BASELINE_SET' || type === 'CALIBRATION_RESET') {
        if (e['userId'] !== userId) continue;
      }

      // For session end events, skip non-calibration contexts
      if (isSessionEndEventType(type)) {
        const playContext = e['playContext'];
        if (
          typeof playContext === 'string' &&
          playContext !== 'calibration' &&
          playContext !== 'profile'
        ) {
          continue;
        }
        const eventUserId = (typeof e['userId'] === 'string' && e['userId'].trim().length > 0)
          ? e['userId'].trim()
          : sessionUserId;
        if (eventUserId !== userId) continue;
      }

      const ts = typeof e['timestamp'] === 'number' ? e['timestamp'] : 0;
      events.push({
        type,
        data: e,
        globalPosition: BigInt(posCounter++),
        createdAt: new Date(ts || sessionRow.created_at),
      });
    }
  }

  // Replay directly through processUserEvents (avoids double userId resolution)
  await processUserEvents(db, userId, events);

  // Load and return the rebuilt state
  const snapshot = await loadSnapshot(db, userId);
  return snapshot?.state ?? { ...DEFAULT_CALIBRATION_STATE };
}

// =============================================================================
// Direct writes — bypass processor engine for immediate UI reactivity
// =============================================================================

/**
 * Apply a CALIBRATION_BASELINE_SET directly to the projection table.
 * Call this after commandBus.handle() so the UI updates immediately
 * (the processor engine will no-op when it catches up since state matches).
 */
export async function applyBaselineDirectly(
  db: AbstractPowerSyncDatabase,
  userId: string,
  level: number,
): Promise<void> {
  const snapshot = await loadSnapshot(db, userId);
  let state = snapshot?.state ?? { ...DEFAULT_CALIBRATION_STATE };
  const modalitySources = snapshot?.modalitySources ?? {};

  state = applyCalibrationEvent(state, {
    type: 'CALIBRATION_BASELINE_SET',
    timestamp: Date.now(),
    level,
  });

  // Update evidence for all steps
  for (const step of CALIBRATION_SEQUENCE) {
    const key = resultKey(step.modality, step.gameMode);
    const existing = modalitySources[key];
    if (!existing || existing.source === 'none') {
      const masteredLevel = state.results[key]?.masteredLevel ?? null;
      modalitySources[key] = {
        source: masteredLevel != null ? 'baseline' : 'none',
        baselineLevel: level,
      };
    }
  }

  await writeSnapshot(db, userId, state, snapshot?.recentStepKeys ?? [], level, modalitySources);
}

/**
 * Apply a CALIBRATION_RESET directly to the projection table.
 */
export async function applyResetDirectly(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<void> {
  const state = applyCalibrationEvent(
    { ...DEFAULT_CALIBRATION_STATE },
    { type: 'CALIBRATION_RESET', timestamp: Date.now() },
  );
  await writeSnapshot(db, userId, state, [], null, {});
}

/**
 * Apply a completed profile/calibration session directly to the projection table.
 * Call this after the session end pipeline persists events so the profile UI
 * updates immediately without waiting for the async processor engine.
 */
export async function applyProfileSessionDirectly(
  db: AbstractPowerSyncDatabase,
  input: {
    sessionId: string;
    sessionEvents: readonly GameEvent[];
    fallbackUserId?: string;
  },
): Promise<boolean> {
  const rawEvents: RawVersionedEvent[] = input.sessionEvents.map((event, index) => {
    const raw = event as unknown as Record<string, unknown>;
    return {
      ...raw,
      id:
        typeof raw['id'] === 'string' && raw['id'].trim().length > 0
          ? (raw['id'] as string)
          : `${input.sessionId}:direct:${index}`,
      sessionId:
        typeof raw['sessionId'] === 'string' && raw['sessionId'].trim().length > 0
          ? (raw['sessionId'] as string)
          : input.sessionId,
      type: String(raw['type'] ?? ''),
      timestamp: typeof raw['timestamp'] === 'number' ? (raw['timestamp'] as number) : Date.now(),
      schemaVersion:
        typeof raw['schemaVersion'] === 'number' ? (raw['schemaVersion'] as number) : 1,
    };
  });

  const projection = projectSessionSummaryFromRawEvents({
    sessionId: input.sessionId,
    rawEvents,
    fallbackUserId: input.fallbackUserId,
  });
  if (projection.isAbandoned || !projection.summary) return false;

  const facts = extractCalibrationSessionFactsFromSummary(projection.summary);
  if (facts.length === 0) return false;

  const snapshot = await loadSnapshot(db, projection.userId);
  let state = snapshot?.state ?? { ...DEFAULT_CALIBRATION_STATE };
  let recentStepKeys = snapshot?.recentStepKeys ?? [];
  const baselineLevel = snapshot?.baselineLevel ?? null;
  const modalitySources = snapshot?.modalitySources ?? {};

  for (const fact of facts) {
    state = applyCalibrationEvent(state, {
      type: 'CALIBRATION_SESSION_RECORDED',
      timestamp: fact.timestamp,
      modality: fact.modality,
      gameMode: fact.gameMode,
      score: fact.score,
    });

    const key = resultKey(fact.modality, fact.gameMode);
    modalitySources[key] = { source: 'session', baselineLevel };
    recentStepKeys = [key, ...recentStepKeys.filter((k) => k !== key)];
  }

  await writeSnapshot(db, projection.userId, state, recentStepKeys, baselineLevel, modalitySources);
  return true;
}

// =============================================================================
// Projection Definition
// =============================================================================

export const cognitiveProfileProjectionDefinition: ProjectionDefinition = {
  // v8: resolve userId from session start events in session_events when
  // end events lack userId (which is the norm for MOT/Track sessions).
  id: 'cognitive-profile',
  version: 10,
  canHandle: new Set([
    'CALIBRATION_BASELINE_SET',
    'CALIBRATION_RESET',
    'CALIBRATION_MODALITY_DETERMINED',
    ...SESSION_END_EVENT_TYPES_ARRAY,
  ]),

  async handle(events: readonly ProjectedEvent[], db: AbstractPowerSyncDatabase) {
    // Phase 1: Filter relevant events and resolve userId.
    // Session *_ENDED events often lack userId in their data (only *_STARTED has it).
    // For end events without userId, we query session_events for the session's start event.
    const eventsByUser = new Map<string, ProjectedEvent[]>();

    for (const event of events) {
      // For session end events, skip non-calibration contexts
      if (isSessionEndEventType(event.type)) {
        const playContext = event.data['playContext'];
        if (
          typeof playContext === 'string' &&
          playContext !== 'calibration' &&
          playContext !== 'profile'
        ) {
          continue;
        }
      }

      // Resolve userId from event data
      let userId = event.data['userId'];

      // Fallback: query session_events for the session's userId
      if (
        (typeof userId !== 'string' || userId.trim().length === 0) &&
        isSessionEndEventType(event.type)
      ) {
        const sid = event.data['sessionId'];
        if (typeof sid === 'string' && sid.trim().length > 0) {
          try {
            const rows = await db.getAll<{ events_json: string }>(
              `SELECT events_json FROM session_events WHERE session_id = ? LIMIT 1`,
              [sid.trim()],
            );
            if (rows[0]?.events_json) {
              const evts = JSON.parse(rows[0].events_json) as Record<string, unknown>[];
              for (const e of evts) {
                const uid = e['userId'];
                if (typeof uid === 'string' && uid.trim().length > 0) {
                  userId = uid.trim();
                  break;
                }
              }
            }
          } catch {
            // best-effort
          }
        }
      }

      if (typeof userId !== 'string' || userId.trim().length === 0) continue;

      const uid = (userId as string).trim();
      const list = eventsByUser.get(uid) ?? [];
      list.push(event);
      eventsByUser.set(uid, list);
    }

    // Phase 2: Process each user's events incrementally
    for (const [userId, userEvents] of eventsByUser) {
      try {
        await processUserEvents(db, userId, userEvents);
      } catch (error) {
        // Log but don't block the entire processor — one bad session shouldn't
        // prevent future updates. The ProcessorEngine would set isBlocked=true
        // if we rethrow, permanently stopping all profile updates.
        console.warn(
          `[cognitive-profile] Incremental update failed for user ${userId}, skipping batch`,
          error,
        );
      }
    }
  },

  async truncate(db: AbstractPowerSyncDatabase) {
    await db.execute('DELETE FROM cognitive_profile_projection');
  },
};
