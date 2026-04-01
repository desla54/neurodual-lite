/**
 * Session Event Stats Reader
 *
 * Reads raw events from session_events.events_json and returns typed arrays
 * for stats computation. Replaces the old emt_messages SQL queries with a
 * JS-based approach: load JSON blobs, parse, filter by event type.
 *
 * All events are stored flat (e.g. { type: 'USER_RESPONDED', reactionTimeMs: 450, ... })
 * — NOT in the old Emmett envelope format (message_data.$.data.*).
 */

import type { SQLQueryPort } from '@neurodual/logic';

// =============================================================================
// Types — match the columns that stats-adapter previously extracted via SQL
// =============================================================================

export interface ResponseEventRow {
  sessionId: string;
  modality: string | null;
  rt: number | null;
  phase: string | null;
  inputMethod: string | null;
  normalizedInputMethod: string;
  responseIndexInTrial: number | null;
  capturedAtMs: number | null;
  stimulusShownAtMs: number | null;
  stimulusHiddenAtMs: number | null;
  processingLagMs: number | null;
  trialIndex: number | null;
  buttonPositionX: number | null;
}

export interface TrialPresentedRow {
  sessionId: string;
  trialIndex: number | null;
  isPositionTarget: boolean;
  isAudioTarget: boolean;
  audioSyncAtMs: number | null;
  stimulusShownAtMs: number | null;
  audioEndedAtMs: number | null;
  stimulusHiddenAtMs: number | null;
}

export interface FilteredResponseRow {
  reason: string | null;
  inputMethod: string | null;
  normalizedInputMethod: string;
}

export interface PipelineLatencyRow {
  inputToDispatchMs: number | null;
  inputToPaintMs: number | null;
  normalizedInputMethod: string;
}

// =============================================================================
// Internal helpers
// =============================================================================

type RawEvent = Record<string, unknown>;

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

function normalizeInputMethod(
  inputMethod: string | null,
  buttonPositionX: number | null,
): string {
  if (inputMethod && inputMethod.length > 0) return inputMethod;
  if (buttonPositionX !== null) return 'mouse';
  return 'keyboard';
}

// =============================================================================
// Core: load events from session_events for given session IDs
// =============================================================================

const BATCH_SIZE = 50;

async function loadEventsForSessions(
  queryPort: SQLQueryPort,
  sessionIds: readonly string[],
): Promise<{ sessionId: string; events: RawEvent[] }[]> {
  if (sessionIds.length === 0) return [];

  const results: { sessionId: string; events: RawEvent[] }[] = [];

  for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
    const batch = sessionIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(', ');
    const rows = await queryPort.query<{ session_id: string; events_json: string }>(
      `SELECT session_id, events_json FROM session_events WHERE session_id IN (${placeholders})`,
      batch as string[],
    );
    for (const row of rows.rows) {
      try {
        const events = JSON.parse(row.events_json) as RawEvent[];
        results.push({ sessionId: row.session_id, events });
      } catch {
        // Skip unparseable sessions
      }
    }
  }

  return results;
}

// =============================================================================
// Public API
// =============================================================================

export function createEventStatsReader(queryPort: SQLQueryPort) {
  async function getFilteredSessionIds(
    cteSql: string,
    cteParams: unknown[],
  ): Promise<string[]> {
    const result = await queryPort.query<{ session_id: string }>(
      `${cteSql} SELECT session_id FROM filtered_session_ids`,
      cteParams,
    );
    return result.rows.map((r) => r.session_id);
  }

  async function getResponseEvents(
    sessionIds: readonly string[],
  ): Promise<ResponseEventRow[]> {
    const sessions = await loadEventsForSessions(queryPort, sessionIds);
    const rows: ResponseEventRow[] = [];

    for (const { sessionId, events } of sessions) {
      for (const e of events) {
        if (e['type'] !== 'USER_RESPONDED') continue;

        const inputMethod = asString(e['inputMethod']);
        const bpx = (e['buttonPosition'] as { x?: unknown } | undefined)?.x;
        const buttonPositionX = asNumber(bpx);

        rows.push({
          sessionId,
          modality: asString(e['modality']),
          rt: asNumber(e['reactionTimeMs']),
          phase: asString(e['responsePhase']),
          inputMethod,
          normalizedInputMethod: normalizeInputMethod(inputMethod, buttonPositionX),
          responseIndexInTrial: asNumber(e['responseIndexInTrial']),
          capturedAtMs: asNumber(e['capturedAtMs']),
          stimulusShownAtMs: asNumber(e['stimulusShownAtMs']),
          stimulusHiddenAtMs: asNumber(e['stimulusHiddenAtMs']),
          processingLagMs: asNumber(e['processingLagMs']),
          trialIndex: asNumber(e['trialIndex']),
          buttonPositionX,
        });
      }
    }

    return rows;
  }

  async function getTrialPresentedEvents(
    sessionIds: readonly string[],
  ): Promise<TrialPresentedRow[]> {
    const sessions = await loadEventsForSessions(queryPort, sessionIds);
    const rows: TrialPresentedRow[] = [];

    for (const { sessionId, events } of sessions) {
      for (const e of events) {
        if (e['type'] !== 'TRIAL_PRESENTED') continue;

        const trial = e['trial'] as Record<string, unknown> | undefined;
        rows.push({
          sessionId,
          trialIndex: asNumber(trial?.['index'] ?? e['trialIndex']),
          isPositionTarget: trial?.['isPositionTarget'] === true || trial?.['isPositionTarget'] === 1,
          isAudioTarget:
            trial?.['isSoundTarget'] === true ||
            trial?.['isSoundTarget'] === 1 ||
            trial?.['isAudioTarget'] === true ||
            trial?.['isAudioTarget'] === 1,
          audioSyncAtMs: asNumber(e['audioSyncAtMs']),
          stimulusShownAtMs: asNumber(e['stimulusShownAtMs']),
          audioEndedAtMs: asNumber(e['audioEndedAtMs']),
          stimulusHiddenAtMs: asNumber(e['stimulusHiddenAtMs']),
        });
      }
    }

    return rows;
  }

  async function getFilteredResponseEvents(
    sessionIds: readonly string[],
  ): Promise<FilteredResponseRow[]> {
    const sessions = await loadEventsForSessions(queryPort, sessionIds);
    const rows: FilteredResponseRow[] = [];

    for (const { events } of sessions) {
      for (const e of events) {
        if (e['type'] !== 'RESPONSE_FILTERED') continue;

        const inputMethod = asString(e['inputMethod']);
        const bpx = (e['buttonPosition'] as { x?: unknown } | undefined)?.x;
        const buttonPositionX = asNumber(bpx);

        rows.push({
          reason: asString(e['reason']),
          inputMethod,
          normalizedInputMethod: normalizeInputMethod(inputMethod, buttonPositionX),
        });
      }
    }

    return rows;
  }

  async function countDuplicateResponseEvents(
    sessionIds: readonly string[],
    inputMethodFilter?: string,
  ): Promise<number> {
    const sessions = await loadEventsForSessions(queryPort, sessionIds);
    let count = 0;

    for (const { events } of sessions) {
      for (const e of events) {
        if (e['type'] !== 'DUPLICATE_RESPONSE_DETECTED') continue;

        if (inputMethodFilter) {
          const inputMethod = asString(e['inputMethod']);
          const bpx = (e['buttonPosition'] as { x?: unknown } | undefined)?.x;
          const normalized = normalizeInputMethod(inputMethod, asNumber(bpx));
          if (normalized !== inputMethodFilter) continue;
        }

        count++;
      }
    }

    return count;
  }

  async function getPipelineLatencyEvents(
    sessionIds: readonly string[],
  ): Promise<PipelineLatencyRow[]> {
    const sessions = await loadEventsForSessions(queryPort, sessionIds);
    const rows: PipelineLatencyRow[] = [];

    for (const { events } of sessions) {
      for (const e of events) {
        if (e['type'] !== 'INPUT_PIPELINE_LATENCY') continue;

        const inputMethod = asString(e['inputMethod']);
        const bpx = (e['buttonPosition'] as { x?: unknown } | undefined)?.x;
        const buttonPositionX = asNumber(bpx);

        rows.push({
          inputToDispatchMs: asNumber(e['inputToDispatchMs']),
          inputToPaintMs: asNumber(e['inputToPaintMs']),
          normalizedInputMethod: normalizeInputMethod(inputMethod, buttonPositionX),
        });
      }
    }

    return rows;
  }

  return {
    getFilteredSessionIds,
    getResponseEvents,
    getTrialPresentedEvents,
    getFilteredResponseEvents,
    countDuplicateResponseEvents,
    getPipelineLatencyEvents,
  };
}

export type EventStatsReader = ReturnType<typeof createEventStatsReader>;
