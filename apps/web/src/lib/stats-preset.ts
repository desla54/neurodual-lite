import type { JourneyFilterType, ModeType, SessionEndReportModel } from '@neurodual/logic';

export type StatsPreset = {
  readonly tab: 'simple';
  readonly mode: ModeType;
  readonly journeyFilter: JourneyFilterType;
};

function mapGameModeToModeFilter(gameMode: SessionEndReportModel['gameMode']): ModeType {
  switch (gameMode) {
    case 'dualnback-classic':
      return 'DualTempo';
    case 'dual-place':
      return 'DualPlace';
    case 'dual-memo':
      return 'DualMemo';
    case 'dual-pick':
      return 'DualPick';
    case 'dual-trace':
      return 'DualTrace';
    case 'dual-time':
      return 'DualTime';
    case 'corsi-block':
      return 'CorsiBlock';
    case 'ospan':
      return 'Ospan';
    case 'running-span':
      return 'RunningSpan';
    case 'pasat':
      return 'PASAT';
    case 'swm':
      return 'SWM';
    case 'sim-brainworkshop':
      return 'BrainWorkshop';
    case 'custom':
      return 'Libre';
    case 'dual-track':
      return 'DualTrack';
    case 'cognitive-task':
      return 'CognitiveTask';
    default:
      // All cognitive task types (stroop, flanker, etc.) map to CognitiveTask
      return 'CognitiveTask';
  }
}

export function getStatsPresetForReport(report: SessionEndReportModel): StatsPreset {
  if (
    report.playContext === 'journey' &&
    typeof report.journeyId === 'string' &&
    report.journeyId
  ) {
    return { tab: 'simple', mode: 'Journey', journeyFilter: report.journeyId };
  }

  return { tab: 'simple', mode: mapGameModeToModeFilter(report.gameMode), journeyFilter: 'all' };
}
