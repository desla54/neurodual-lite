/**
 * Stub — EmmettEventStore types kept for backward compatibility.
 * The actual event store has been removed (replaced by direct writes).
 */

export interface StoredEvent {
  eventId: string;
  streamPosition: bigint;
  globalPosition: bigint;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type AppendEvent = {
  eventId: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export interface EmmettEventStore {
  appendToStream(args: unknown): Promise<unknown>;
  readStream(args: unknown): Promise<unknown>;
  aggregateStream(streamId: unknown, options: unknown): Promise<unknown>;
  readAll(args: unknown): Promise<unknown>;
  registerInlineProjection(definition: unknown): void;
  onEventsAppended(callback: (events: StoredEvent[]) => void): () => void;
}

export function createEmmettEventStore(..._args: unknown[]): EmmettEventStore {
  throw new Error('[EmmettEventStore] Event store has been removed. Use DirectCommandBus instead.');
}

export function streamIdToString(streamId: { aggregateType: string; aggregateId: string }): string {
  return `${streamId.aggregateType}:${streamId.aggregateId}`;
}

export type StreamId = {
  aggregateId: string;
  aggregateType: string;
};

export function createStreamId(
  boundedContext: string,
  aggregateType: string,
  aggregateId: string,
): StreamId {
  return { aggregateType: `${boundedContext}:${aggregateType}`, aggregateId };
}

export function parseStreamId(streamId: string): {
  boundedContext?: string;
  aggregateType: string;
  aggregateId: string;
} {
  const parts = streamId.split(':');
  if (parts.length <= 2) {
    return { aggregateType: parts[0] ?? '', aggregateId: parts[1] ?? '' };
  }
  return { boundedContext: parts[0], aggregateType: parts[1] ?? '', aggregateId: parts.slice(2).join(':') };
}
