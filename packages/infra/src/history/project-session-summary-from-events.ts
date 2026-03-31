import type {
  GameEvent,
  RawVersionedEvent,
  SessionImportedEvent,
  SessionSummaryInput,
} from '@neurodual/logic';
import {
  migrateAndValidateEventBatch,
  projectCorsiSessionToSummaryInput,
  projectDualPickSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectImportedSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
  projectPasatSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectRunningSpanSessionToSummaryInput,
  projectSwmSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectTimeSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectTrackSessionToSummaryInput,
} from '@neurodual/logic';

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function userIdRank(value: string | null | undefined): number {
  if (!value) return 0;
  if (value === 'local') return 1;
  return looksLikeUuid(value) ? 3 : 2;
}

function resolveProjectedUserId(
  rawEvents: readonly RawVersionedEvent[],
  fallbackUserId?: unknown,
): string {
  let best: string | null =
    typeof fallbackUserId === 'string' && fallbackUserId.trim().length > 0
      ? fallbackUserId.trim()
      : null;
  let bestRank = userIdRank(best);

  for (const rawEvent of rawEvents) {
    const candidate = rawEvent['userId'];
    if (typeof candidate !== 'string' || candidate.trim().length === 0) continue;
    const normalized = candidate.trim();
    const rank = userIdRank(normalized);
    if (rank > bestRank) {
      best = normalized;
      bestRank = rank;
      if (rank >= 3) break;
    }
  }

  return best ?? 'local';
}

function extractXpBreakdown(
  sessionEvents: readonly GameEvent[],
): Record<string, unknown> | undefined {
  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const event = sessionEvents[i];
    if (event?.type !== 'XP_BREAKDOWN_COMPUTED') continue;
    const xpBreakdown = (event as unknown as { xpBreakdown?: unknown }).xpBreakdown;
    if (typeof xpBreakdown === 'object' && xpBreakdown !== null) {
      return xpBreakdown as Record<string, unknown>;
    }
    return undefined;
  }
  return undefined;
}

function enrichSummaryWithDerivedContext(
  summary: SessionSummaryInput,
  sessionEvents: readonly GameEvent[],
): SessionSummaryInput {
  if (summary.xpBreakdown !== undefined) {
    return summary;
  }

  const xpBreakdown = extractXpBreakdown(sessionEvents);
  return xpBreakdown ? { ...summary, xpBreakdown } : summary;
}

function projectValidatedSessionSummary(
  sessionId: string,
  sessionEvents: readonly GameEvent[],
  userId: string,
): SessionSummaryInput | null {
  const importedEvent = sessionEvents.find((event) => event.type === 'SESSION_IMPORTED') as
    | SessionImportedEvent
    | undefined;
  if (importedEvent) {
    return enrichSummaryWithDerivedContext(
      projectImportedSessionToSummaryInput(importedEvent, userId),
      sessionEvents,
    );
  }

  if (sessionEvents.some((event) => event.type === 'SESSION_ENDED')) {
    const summary = projectTempoSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'RECALL_SESSION_ENDED')) {
    const summary = projectRecallSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'FLOW_SESSION_ENDED')) {
    const summary = projectFlowSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'DUAL_PICK_SESSION_ENDED')) {
    const summary = projectDualPickSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'TRACE_SESSION_ENDED')) {
    const summary = projectTraceSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'TIME_SESSION_ENDED')) {
    const summary = projectTimeSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'MOT_SESSION_ENDED')) {
    const summary = projectTrackSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'CORSI_SESSION_ENDED')) {
    const summary = projectCorsiSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'OSPAN_SESSION_ENDED')) {
    const summary = projectOspanSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'RUNNING_SPAN_SESSION_ENDED')) {
    const summary = projectRunningSpanSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'PASAT_SESSION_ENDED')) {
    const summary = projectPasatSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  if (sessionEvents.some((event) => event.type === 'SWM_SESSION_ENDED')) {
    const summary = projectSwmSessionToSummaryInput({ sessionId, sessionEvents, userId });
    return summary ? enrichSummaryWithDerivedContext(summary, sessionEvents) : null;
  }

  return null;
}

export interface ProjectSessionSummaryResult {
  readonly summary: SessionSummaryInput | null;
  readonly sessionEvents: readonly GameEvent[];
  readonly userId: string;
  readonly errorCount: number;
  readonly isAbandoned: boolean;
}

export function projectSessionSummaryFromRawEvents(input: {
  sessionId: string;
  rawEvents: readonly RawVersionedEvent[];
  fallbackUserId?: unknown;
}): ProjectSessionSummaryResult {
  const userId = resolveProjectedUserId(input.rawEvents, input.fallbackUserId);

  const rawAbandonedEvent = input.rawEvents.find(
    (rawEvent) => (rawEvent as { reason?: unknown }).reason === 'abandoned',
  );
  if (rawAbandonedEvent) {
    return {
      summary: null,
      sessionEvents: [],
      userId,
      errorCount: 0,
      isAbandoned: true,
    };
  }

  const batchResult = migrateAndValidateEventBatch([...input.rawEvents], {
    strict: false,
    logErrors: false,
    targetVersion: 1,
    output: 'canonical',
  });
  const sessionEvents = batchResult.events;

  const abandonedEvent = sessionEvents.find(
    (event) =>
      'reason' in event && (event as unknown as { reason?: unknown }).reason === 'abandoned',
  );
  if (abandonedEvent) {
    return {
      summary: null,
      sessionEvents,
      userId,
      errorCount: batchResult.errorCount,
      isAbandoned: true,
    };
  }

  return {
    summary: projectValidatedSessionSummary(input.sessionId, sessionEvents, userId),
    sessionEvents,
    userId,
    errorCount: batchResult.errorCount,
    isAbandoned: false,
  };
}
