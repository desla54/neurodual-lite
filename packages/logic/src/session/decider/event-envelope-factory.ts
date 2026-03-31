/**
 * EventEnvelopeFactory — Stamps pure event drafts with envelope fields.
 *
 * Guarantees that EVERY materialized event has: id, timestamp, sessionId, userId,
 * eventId, seq, schemaVersion, occurredAtMs, monotonicMs.
 *
 * Uses ClockPort + RandomPort for testability (deterministic timestamps and IDs in tests).
 */

import type { ClockPort } from '../../ports/clock-port';
import type { RandomPort } from '../../ports/random-port';
import type { SessionEventEnvelope } from '../session-event-utils';
import type { SessionEventDraft } from './session-decider';

// =============================================================================
// Config
// =============================================================================

export interface EnvelopeFactoryConfig {
  readonly sessionId: string;
  readonly userId: string;
  readonly clock: ClockPort;
  readonly random: RandomPort;
}

// =============================================================================
// Materialized Event
// =============================================================================

/**
 * A fully-enveloped event: draft data merged with envelope fields.
 */
export type MaterializedEvent<TDraft extends SessionEventDraft = SessionEventDraft> = TDraft &
  SessionEventEnvelope & { readonly userId: string };

// =============================================================================
// Factory
// =============================================================================

export interface EventEnvelopeFactory {
  /**
   * Stamp a draft with envelope fields.
   * Seq auto-increments on each call.
   */
  materialize<TDraft extends SessionEventDraft>(draft: TDraft): MaterializedEvent<TDraft>;

  /** Current sequence number (for inspection/testing). */
  readonly seq: number;

  /** The sessionId this factory stamps onto events. */
  readonly sessionId: string;

  /** The userId this factory stamps onto events. */
  readonly userId: string;
}

/**
 * Create an EventEnvelopeFactory bound to a session + user.
 */
export function createEnvelopeFactory(config: EnvelopeFactoryConfig): EventEnvelopeFactory {
  let seq = 0;

  return {
    materialize<TDraft extends SessionEventDraft>(draft: TDraft): MaterializedEvent<TDraft> {
      const now = config.clock.dateNow();
      const id = config.random.generateId();
      const currentSeq = seq++;

      return {
        ...draft,
        id,
        timestamp: now,
        sessionId: config.sessionId,
        userId: config.userId,
        eventId: id,
        seq: currentSeq,
        schemaVersion: 1 as const,
        occurredAtMs: now,
        monotonicMs: config.clock.now(),
      };
    },

    get seq() {
      return seq;
    },

    get sessionId() {
      return config.sessionId;
    },

    get userId() {
      return config.userId;
    },
  };
}
