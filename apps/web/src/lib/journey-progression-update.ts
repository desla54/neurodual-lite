import type { ModalityId, SessionEndReportModel } from '@neurodual/logic';
import type { JourneySessionResult } from './journey-progression';

export interface JourneyProgressionUpdate {
  readonly sessionId: string;
  readonly journeyId: string;
  readonly journeyGameMode: string;
  readonly result: JourneySessionResult;
}

function normalizeReportGameMode(report: SessionEndReportModel): string | undefined {
  if (report.gameMode === 'cognitive-task' && report.taskType === 'stroop-flex') {
    return 'stroop-flex';
  }
  return typeof report.gameMode === 'string' && report.gameMode.length > 0 ? report.gameMode : undefined;
}

export function extractJourneyProgressionUpdate(
  report: SessionEndReportModel,
): JourneyProgressionUpdate | null {
  if (report.playContext !== 'journey') return null;

  const sessionId = typeof report.sessionId === 'string' && report.sessionId.length > 0
    ? report.sessionId
    : undefined;
  const journeyId =
    typeof report.journeyId === 'string' && report.journeyId.length > 0
      ? report.journeyId
      : undefined;
  const gameMode = normalizeReportGameMode(report);
  const journeyGameMode =
    typeof report.journeyContext?.journeyGameMode === 'string' &&
    report.journeyContext.journeyGameMode.length > 0
      ? report.journeyContext.journeyGameMode
      : gameMode;

  if (!sessionId || !journeyId || !gameMode || !journeyGameMode) {
    return null;
  }

  const nLevel = report.nLevel;
  const accuracy = report.unifiedAccuracy;
  if (nLevel == null || accuracy == null) return null;

  const modalityErrors: number[] = [];
  if (report.byModality) {
    for (const stats of Object.values(
      report.byModality as Record<ModalityId, { misses: number | null; falseAlarms: number | null }>,
    )) {
      const misses = stats.misses ?? 0;
      const fa = stats.falseAlarms ?? 0;
      modalityErrors.push(misses + fa);
    }
  }

  return {
    sessionId,
    journeyId,
    journeyGameMode,
    result: {
      gameMode,
      nLevel,
      accuracy,
      upsScore: report.ups?.score,
      modalityErrors: modalityErrors.length > 0 ? modalityErrors : undefined,
    },
  };
}
