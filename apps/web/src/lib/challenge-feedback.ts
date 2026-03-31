import {
  formatLocalDayKey,
  type Challenge20State,
  type LocalDayKey,
  type SessionEndReportModel,
} from '@neurodual/logic';

export function getValidatedChallengeDay(state: Challenge20State): LocalDayKey | null {
  if (state.completedDays <= 0) return null;
  return state.cards[state.completedDays - 1]?.completedDay ?? null;
}

export function isChallengeValidatedToday(state: Challenge20State): boolean {
  return getValidatedChallengeDay(state) === state.today;
}

export function getReportLocalDay(
  report: Pick<SessionEndReportModel, 'createdAt'>,
): LocalDayKey | null {
  const createdAt = new Date(report.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return null;
  return formatLocalDayKey(createdAt);
}
