import type { GameEvent } from './events';
import {
  projectDualnbackClassicTempoWithHomeEs,
  type DualnbackClassicHomeEsProjection,
} from './dualnback-classic-home-es';

type TempoHomeEsProjector = (input: {
  readonly sessionId: string;
  readonly events: readonly GameEvent[];
}) => DualnbackClassicHomeEsProjection | null;

const tempoHomeEsRegistry: Partial<Record<string, TempoHomeEsProjector>> = {
  'dualnback-classic': projectDualnbackClassicTempoWithHomeEs,
};

export function projectTempoFromHomeEsRegistry(input: {
  readonly sessionId: string;
  readonly gameMode: string;
  readonly events: readonly GameEvent[];
}): DualnbackClassicHomeEsProjection | null | undefined {
  if (input.gameMode !== 'dualnback-classic') return undefined;

  const projector = tempoHomeEsRegistry[input.gameMode];
  if (!projector) return undefined;

  return projector({
    sessionId: input.sessionId,
    events: input.events,
  });
}
