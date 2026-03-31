/**
 * Processor Errors — record projection/processor errors in `es_projection_errors`.
 *
 * Tracks errors during event processing so degraded processors can be
 * identified and retried. This is a library concern.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

export interface ProcessorEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly globalPosition: bigint;
}

export async function recordProcessorError(
  db: AbstractPowerSyncDatabase,
  params: {
    readonly processorName: string;
    readonly event?: ProcessorEvent;
    readonly error: unknown;
  },
): Promise<void> {
  const event = params.event;
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  const stack = params.error instanceof Error ? (params.error.stack ?? null) : null;
  const eventStreamId =
    typeof event?.data?.['sessionId'] === 'string'
      ? `session:${event.data['sessionId']}`
      : typeof event?.data?.['journeyId'] === 'string'
        ? `journey:${event.data['journeyId']}`
        : 'unknown';
  const eventType = event?.type ?? 'unknown';
  const eventGlobalPosition = event ? String(event.globalPosition) : '0';
  const failedAt = new Date().toISOString();

  await db.execute(
    `INSERT OR REPLACE INTO es_projection_errors
       (id, projector_name, event_global_position, event_stream_id, event_type, error_message, error_stack, failed_at, retry_count, last_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT retry_count + 1 FROM es_projection_errors WHERE id = ?), 0), ?)`,
    [
      `${params.processorName}:${eventGlobalPosition}`,
      params.processorName,
      eventGlobalPosition,
      eventStreamId,
      eventType,
      message,
      stack,
      failedAt,
      `${params.processorName}:${eventGlobalPosition}`,
      failedAt,
    ],
  );
}
