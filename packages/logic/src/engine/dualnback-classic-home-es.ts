import type { GameEvent, SessionSummary } from './events';
import { SessionProjector } from './session-projector';
import { SOUNDS } from '../types/core';
import { migrateAndValidateEvent } from '../migration/event-validator';
import type { RawVersionedEvent } from '../migration/types';

interface AggregateStream<TAggregateId, TEvent> {
  readonly aggregateId: TAggregateId;
  readonly version: number;
  readonly events: readonly TEvent[];
}

function collectAggregateEvents<TAggregateId, TEvent>(input: {
  readonly aggregateId: TAggregateId;
  readonly events: readonly TEvent[];
  readonly selectAggregateId: (event: TEvent) => TAggregateId;
  readonly validateEvent?: (event: TEvent, index: number) => TEvent | null;
  readonly equals?: (left: TAggregateId, right: TAggregateId) => boolean;
}): AggregateStream<TAggregateId, TEvent> {
  const equals = input.equals ?? Object.is;
  const collected: TEvent[] = [];

  for (const [index, rawEvent] of input.events.entries()) {
    const event = input.validateEvent ? input.validateEvent(rawEvent, index) : rawEvent;
    if (event === null) continue;
    const eventAggregateId = input.selectAggregateId(event);
    if (!equals(eventAggregateId, input.aggregateId)) continue;
    collected.push(event);
  }

  return {
    aggregateId: input.aggregateId,
    version: collected.length,
    events: collected,
  };
}

function normalizeLegacyTempoEvent(event: unknown): unknown {
  if (typeof event !== 'object' || event === null) return event;
  const record = event as Record<string, unknown>;
  if (record['type'] !== 'TRIAL_PRESENTED') return event;

  const trial = record['trial'];
  if (typeof trial !== 'object' || trial === null) return event;
  const trialRecord = trial as Record<string, unknown>;
  const nextTrial: Record<string, unknown> = { ...trialRecord };

  // Legacy position pool (sometimes 0-8) → clamp to 0-7.
  if (typeof nextTrial['position'] === 'number' && Number.isFinite(nextTrial['position'])) {
    nextTrial['position'] = ((nextTrial['position'] % 8) + 8) % 8;
  }

  // Legacy sound pool A-H → canonical pool (C/H/K/L/Q/R/S/T).
  if (typeof nextTrial['sound'] === 'string' && nextTrial['sound'].length === 1) {
    const idx = nextTrial['sound'].charCodeAt(0) - 65; // 'A'
    if (idx >= 0 && idx < SOUNDS.length) {
      const mapped = SOUNDS[idx];
      if (mapped) nextTrial['sound'] = mapped;
    }
  }

  // Legacy trialType strings → canonical FR labels (derive from target flags).
  if (
    typeof nextTrial['trialType'] === 'string' &&
    (nextTrial['trialType'] === 'buffer' ||
      nextTrial['trialType'] === 'target' ||
      nextTrial['trialType'] === 'standard')
  ) {
    const isBuffer = nextTrial['isBuffer'] === true;
    const isPositionTarget = nextTrial['isPositionTarget'] === true;
    const isSoundTarget = nextTrial['isSoundTarget'] === true;

    nextTrial['trialType'] = isBuffer
      ? 'Tampon'
      : isPositionTarget && isSoundTarget
        ? 'Dual'
        : isPositionTarget
          ? 'V-Seul'
          : isSoundTarget
            ? 'A-Seul'
            : 'Non-Cible';
  }

  return { ...record, trial: nextTrial };
}

function parseTempoEventOrSkip(event: unknown, index: number): GameEvent | null {
  const validated = migrateAndValidateEvent(event as RawVersionedEvent, {
    strict: false,
    logErrors: false,
    targetVersion: 1,
    output: 'canonical',
  });

  if (validated.success) return validated.event;

  // Legacy normalization fallback (kept for extra resilience on TRIAL_PRESENTED formats).
  const normalized = normalizeLegacyTempoEvent(event);
  const validated2 = migrateAndValidateEvent(normalized as RawVersionedEvent, {
    strict: false,
    logErrors: false,
    targetVersion: 1,
    output: 'canonical',
  });
  if (validated2.success) return validated2.event;

  // Skip invalid events instead of throwing — corrupted events (e.g. invalid
  // reactionTimeMs after JSON round-trip) should not crash the entire session.
  const type =
    typeof event === 'object' && event !== null && 'type' in event
      ? String((event as { type?: unknown }).type)
      : 'unknown';
  console.warn(`[HomeES] Skipping invalid event at index ${index} (${type}): ${validated2.error}`);
  return null;
}

export interface DualnbackClassicHomeEsProjection {
  readonly summary: SessionSummary;
  readonly eventsForProjection: readonly GameEvent[];
}

export function projectDualnbackClassicTempoWithHomeEs(input: {
  readonly sessionId: string;
  readonly events: readonly GameEvent[];
}): DualnbackClassicHomeEsProjection | null {
  const stream = collectAggregateEvents({
    aggregateId: input.sessionId,
    events: input.events,
    selectAggregateId: (event) => event.sessionId,
    validateEvent: parseTempoEventOrSkip,
  });
  if (stream.events.length === 0) return null;

  const summary = SessionProjector.project(stream.events);
  if (!summary) return null;

  return {
    summary,
    eventsForProjection: stream.events,
  };
}
