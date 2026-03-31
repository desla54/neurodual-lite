/**
 * Shared type definitions for the Emmett event store.
 *
 * Extracted to break the circular dependency between
 * powersync-emmett-event-store.ts and inline-projection.ts.
 */

export type StoredEvent = {
  eventId: string;
  streamPosition: bigint;
  globalPosition: bigint;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
};
