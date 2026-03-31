/**
 * Inline Projection — runs atomically within the appendToStream transaction.
 *
 * Unlike async processors that catch up after the fact, inline projections
 * execute in the SAME transaction as the event append. This guarantees
 * atomicity: either both the events and the projection writes succeed, or
 * neither does.
 *
 * Use cases:
 * - session_in_progress accumulation (mid-session event buffering)
 * - Denormalized counters that must be consistent with the event log
 *
 * Follows Emmett's onBeforeCommit pattern.
 */

import type { StoredEvent } from './event-store-types';

/** Transaction handle passed to inline projections */
export type InlineTransaction = {
  execute(sql: string, params?: (string | number | null)[]): Promise<unknown>;
};

/**
 * Inline projection definition.
 * Runs within the appendToStream write transaction.
 */
export interface InlineProjectionDefinition {
  readonly id: string;
  readonly canHandle: ReadonlySet<string>;
  readonly handle: (events: readonly StoredEvent[], tx: InlineTransaction) => Promise<void>;
}
