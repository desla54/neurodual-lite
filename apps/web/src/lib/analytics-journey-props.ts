import type { SessionEndReportModel } from '@neurodual/logic';
import { computeProgressionIndicatorModel } from '@neurodual/logic';
import type { AnalyticsEventMap } from '../services/analytics-events';

/** Extract journey-related analytics props from a session report. */
export function getJourneyAnalyticsProps(report: SessionEndReportModel) {
  const ctx = report.journeyContext;
  const indicator = computeProgressionIndicatorModel(report);
  return {
    journey_id: ctx?.journeyId ?? report.journeyId,
    stage_id: ctx?.stageId ?? report.journeyStageId,
    recommendation_tone: indicator?.headline,
    stage_completed: ctx?.stageCompleted,
    consecutive_strikes: ctx?.consecutiveStrikes,
    journey_game_mode: ctx?.journeyGameMode,
  } as const;
}

/** Build the full `report_action_clicked` payload from a report. */
export function buildReportActionPayload(
  report: SessionEndReportModel,
  action: AnalyticsEventMap['report_action_clicked']['action'],
): AnalyticsEventMap['report_action_clicked'] {
  return {
    session_id: report.sessionId,
    action,
    mode: report.gameMode,
    n_level: report.nLevel,
    play_context: report.playContext ?? 'free',
    journey_id: report.journeyContext?.journeyId ?? report.journeyId,
    stage_id: report.journeyContext?.stageId ?? report.journeyStageId,
  };
}
