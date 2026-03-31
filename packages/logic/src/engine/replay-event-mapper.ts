import type { ReplayEvent } from '../types/replay-interactif';
import { safeParseEvent } from '../migration/event-validator';
import type { GameEvent } from './events';

/**
 * Convert interactive replay events (from `replay_events`) into validated GameEvents.
 *
 * Notes:
 * - `ReplayEvent.timestamp` is relative to the run start (ms). This function keeps it as-is.
 * - Invalid/unknown events are dropped (strictly), so downstream projectors remain pure.
 */
export function mapReplayEventsToGameEvents(
  sessionId: string,
  replayEvents: readonly ReplayEvent[],
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const replayEvent of replayEvents) {
    const timestamp = Number(replayEvent.timestamp);
    if (!Number.isFinite(timestamp)) continue;

    const candidate = {
      ...(replayEvent.payload ?? {}),
      id: replayEvent.id,
      sessionId,
      type: replayEvent.type,
      timestamp,
    };

    const parsed = safeParseEvent(candidate);
    if (parsed) events.push(parsed);
  }

  events.sort((a, b) => {
    const byTimestamp = a.timestamp - b.timestamp;
    if (byTimestamp !== 0) return byTimestamp;
    const aId = typeof a.id === 'string' ? a.id : '';
    const bId = typeof b.id === 'string' ? b.id : '';
    return aId.localeCompare(bId);
  });

  return events;
}
