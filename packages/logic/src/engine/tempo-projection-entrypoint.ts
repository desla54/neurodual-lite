import type { GameEvent, SessionSummary } from './events';
import { SessionProjector } from './session-projector';
import { projectTempoFromHomeEsRegistry } from './tempo-home-es-registry';

export interface TempoProjectionEntrypointResult {
  readonly summary: SessionSummary;
  readonly eventsForProjection: readonly GameEvent[];
}

/**
 * Single entrypoint for Tempo projection stream selection.
 *
 * Goal: guarantee that all Tempo projections (live completion, history rebuild, drift repair)
 * use the exact same event stream (isolation by sessionId) and the same summary derivation.
 */
export function projectTempoSessionEntrypoint(input: {
  readonly sessionId: string;
  readonly gameMode: string;
  readonly events: readonly GameEvent[];
}): TempoProjectionEntrypointResult | null {
  if (input.gameMode === 'dualnback-classic') {
    const projection = projectTempoFromHomeEsRegistry({
      sessionId: input.sessionId,
      gameMode: input.gameMode,
      events: input.events,
    });
    if (!projection) return null;
    return {
      summary: projection.summary,
      eventsForProjection: projection.eventsForProjection,
    };
  }

  const eventsForProjection = input.events.filter((event) => event.sessionId === input.sessionId);
  const summary = SessionProjector.project(eventsForProjection);
  if (!summary) return null;

  return {
    summary,
    eventsForProjection,
  };
}
