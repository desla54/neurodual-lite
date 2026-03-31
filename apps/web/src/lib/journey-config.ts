import {
  BRAINWORKSHOP_JOURNEY_ID,
  DUALNBACK_CLASSIC_JOURNEY_ID,
  DUAL_TRACE_JOURNEY_ID,
  DUAL_TRACK_EASY_JOURNEY_ID,
  DUAL_TRACK_MEDIUM_JOURNEY_ID,
  DUAL_TRACK_DNB_HYBRID_MODE_ID,
  DUAL_TRACK_DNB_JOURNEY_ID,
  DUAL_TRACK_JOURNEY_ID,
  resolveJourneyStrategyConfig,
  type JourneyConfig,
  type ModeSettings,
} from '@neurodual/logic';

import type { SavedJourney } from '../stores/settings-store';

function resolveJourneyGameMode(journeyId: string, gameMode?: string): string | undefined {
  if (gameMode) return gameMode;
  if (journeyId === DUALNBACK_CLASSIC_JOURNEY_ID) return 'dualnback-classic';
  if (journeyId === BRAINWORKSHOP_JOURNEY_ID) return 'sim-brainworkshop';
  if (journeyId === DUAL_TRACE_JOURNEY_ID) return 'dual-trace';
  if (journeyId === DUAL_TRACK_EASY_JOURNEY_ID) return 'dual-track';
  if (journeyId === DUAL_TRACK_MEDIUM_JOURNEY_ID) return 'dual-track';
  if (journeyId === DUAL_TRACK_JOURNEY_ID) return 'dual-track';
  if (journeyId === DUAL_TRACK_DNB_JOURNEY_ID) return DUAL_TRACK_DNB_HYBRID_MODE_ID;
  return undefined;
}

export function buildJourneyConfigSnapshot(params: {
  readonly journeyId: string;
  readonly savedJourney?: SavedJourney;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly legacyJourneyModeSettings?: ModeSettings;
}): JourneyConfig {
  const gameMode = resolveJourneyGameMode(params.journeyId, params.savedJourney?.gameMode);
  return {
    journeyId: params.journeyId,
    startLevel: params.startLevel,
    targetLevel: params.targetLevel,
    gameMode,
    strategyConfig: resolveJourneyStrategyConfig({
      gameMode,
      strategyConfig: params.savedJourney?.strategyConfig,
      hybridTrackSessionsPerBlock: params.legacyJourneyModeSettings?.hybridTrackSessionsPerBlock,
      hybridDnbSessionsPerBlock: params.legacyJourneyModeSettings?.hybridDnbSessionsPerBlock,
    }),
  };
}
