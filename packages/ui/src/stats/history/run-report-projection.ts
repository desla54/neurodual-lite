import {
  type ModalityId,
  projectSessionReportFromEvents,
  type GameEvent,
  type ReplayEvent,
  type SessionEndReportModel,
  type SessionHistoryItem,
} from '@neurodual/logic';

function inferTempoGameModeFromGenerator(generator: string): string {
  if (generator === 'DualnbackClassic') return 'dualnback-classic';
  if (generator === 'BrainWorkshop') return 'sim-brainworkshop';
  if (generator === 'Aleatoire') return 'custom';
  return 'dual-catch';
}

function inferModeHint(gameMode: string): 'tempo' | 'flow' | 'recall' | 'dual-pick' {
  if (gameMode === 'dual-place') return 'flow';
  if (gameMode === 'dual-memo') return 'recall';
  if (gameMode === 'dual-pick') return 'dual-pick';
  return 'tempo';
}

function mapReplayEventsToGameEvents(
  sessionId: string,
  replayEvents: readonly ReplayEvent[],
): GameEvent[] {
  const events = replayEvents
    .map((event) => {
      const timestamp = Number(event.timestamp);
      if (!Number.isFinite(timestamp)) return null;

      return {
        ...(event.payload ?? {}),
        id: event.id,
        sessionId,
        type: event.type,
        timestamp,
      } as unknown as GameEvent;
    })
    .filter((event): event is GameEvent => event !== null);

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

export function projectReplayRunReportFromHistorySession(
  session: SessionHistoryItem,
  runEvents: readonly ReplayEvent[],
  resolveModeLabel: (gameMode: string) => string,
): SessionEndReportModel | null {
  const events = mapReplayEventsToGameEvents(session.id, runEvents);
  if (events.length === 0) return null;

  const gameMode = session.gameMode ?? inferTempoGameModeFromGenerator(session.generator);
  return projectSessionReportFromEvents({
    sessionId: session.id,
    events,
    gameMode,
    modeHint: inferModeHint(gameMode),
    gameModeLabel: resolveModeLabel(gameMode),
    activeModalities: session.activeModalities as readonly ModalityId[],
    generator: session.generator,
    journeyContextFallback: session.journeyContext,
  });
}
