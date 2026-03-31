/**
 * Session Event Utilities
 *
 * Shared envelope creation for all session machines (Trace, Place, Memo, DualPick).
 * Single source of truth for base event fields: id, timestamp, sessionId, eventId,
 * seq, schemaVersion, occurredAtMs, monotonicMs.
 *
 * GameSession is OUT OF SCOPE — different pattern (no seq, no persistComplete).
 */

import type { ClockPort } from '../ports/clock-port';
import type { RandomPort } from '../ports/random-port';

/**
 * Minimal context needed to create an event envelope.
 * All 4 machines (Trace, Place, Memo, DualPick) satisfy this.
 */
export interface EventEmitterContext {
  readonly sessionId: string;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  seq: number;
  readonly correlationId?: string; // Pour corréler les événements d'une session
}

/**
 * Base envelope fields shared by all session events.
 */
export interface SessionEventEnvelope {
  readonly id: string;
  readonly timestamp: number;
  readonly sessionId: string;
  readonly eventId: string;
  readonly seq: number;
  readonly schemaVersion: 1;
  readonly occurredAtMs: number;
  readonly monotonicMs: number;
}

/**
 * Create an event envelope with base fields.
 * Uses clock.dateNow() for testability (vs raw Date.now()).
 */
export function createEventEnvelope(context: EventEmitterContext): SessionEventEnvelope {
  const now = context.clock.dateNow();
  const id = context.random.generateId();
  return {
    id,
    timestamp: now,
    sessionId: context.sessionId,
    eventId: id,
    seq: context.seq++,
    schemaVersion: 1,
    occurredAtMs: now,
    monotonicMs: context.clock.now(),
  };
}

/**
 * Create a full event (envelope + data), push to array, persist.
 * Convenience wrapper used by Place, DualPick, Memo.
 *
 * Uses `unknown[]` for sessionEvents to accommodate both GameEvent[] (DualPick, Memo)
 * and the looser Record<string, unknown> array (Place).
 *
 * Returns a Promise that resolves when the event is persisted (or rejects on error).
 * The promise is logged but not thrown - callers can await if they need guarantees.
 */
export function emitAndPersist(
  context: EventEmitterContext & { sessionEvents: unknown[]; commandBus?: unknown },
  eventData: Record<string, unknown> & { type: string },
): Promise<void> {
  const envelope = createEventEnvelope(context);
  const fullEvent = { ...envelope, ...eventData };
  context.sessionEvents.push(fullEvent);

  const bus = context.commandBus as
    | {
        handle: (cmd: {
          readonly type: string;
          readonly data: Record<string, unknown>;
          readonly metadata: {
            readonly commandId: string;
            readonly timestamp: Date;
            readonly correlationId?: string;
          };
        }) => Promise<unknown>;
      }
    | undefined;
  if (bus) {
    const type = String(fullEvent.type);
    const commandType = type.endsWith('_STARTED')
      ? 'SESSION/START'
      : type.endsWith('_ENDED')
        ? 'SESSION/END'
        : type.startsWith('TRIAL_') ||
            type.startsWith('FLOW_') ||
            type.startsWith('RECALL_') ||
            type.startsWith('DUAL_PICK_')
          ? 'SESSION/RECORD_TRIAL'
          : type.includes('RESPON')
            ? 'SESSION/RECORD_RESPONSE'
            : 'SESSION/RECORD_TELEMETRY';
    const commandId = type.endsWith('_ENDED')
      ? `end:${context.sessionId}`
      : type.endsWith('_STARTED')
        ? `start:${context.sessionId}`
        : `evt:${String(envelope.id)}`;

    return bus
      .handle({
        type: commandType,
        data: {
          sessionId: context.sessionId,
          event: fullEvent,
        },
        // Include timestamp and correlationId in metadata
        metadata: {
          commandId,
          timestamp: new Date(),
          correlationId: context.correlationId,
        },
      })
      .catch((err) => {
        console.error(`[emitAndPersist] Failed to persist ${type}:`, err);
      }) as Promise<void>;
  }
  // Si commandBus n'est pas fourni, on ne fait pas d'erreur (utile pour les tests)
  // Les événements sont toujours ajoutés à sessionEvents
  return Promise.resolve();
}
