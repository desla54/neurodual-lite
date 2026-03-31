import { useMemo } from 'react';

import {
  projectChallenge20FromDailyTotals,
  type Challenge20State,
  type LocalDayKey,
  type TrainingDailyTotal,
} from '@neurodual/logic';

import { useSubscribable } from '../reactive/use-subscribable';
import { useCurrentUser } from './auth';
import { getReadModelsAdapter } from './read-models';

type TrainingDailyTotalRowDb = {
  day: LocalDayKey | string | null;
  total_duration_ms: number | null;
  sessions_count: number | null;
};

function normalizeDailyTotals(rows: readonly TrainingDailyTotalRowDb[]): TrainingDailyTotal[] {
  const out: TrainingDailyTotal[] = [];
  for (const row of rows) {
    const dayRaw = row?.day;
    if (typeof dayRaw !== 'string' || dayRaw.trim().length === 0) continue;
    out.push({
      day: dayRaw as LocalDayKey,
      totalDurationMs: Math.max(0, Number(row.total_duration_ms ?? 0)),
      sessionsCount: Math.max(0, Number(row.sessions_count ?? 0)),
    });
  }
  return out;
}

export function useChallenge20Query(): {
  data: Challenge20State;
  dailyTotals: TrainingDailyTotal[];
  isPending: boolean;
  error: Error | null;
} & {
  readonly config: { totalDays: number; targetMinutesPerDay: number };
};

export function useChallenge20Query(config?: {
  readonly totalDays?: number;
  readonly targetMinutesPerDay?: number;
  readonly startDay?: LocalDayKey | string | null;
}): {
  data: Challenge20State;
  dailyTotals: TrainingDailyTotal[];
  isPending: boolean;
  error: Error | null;
  readonly config: { totalDays: number; targetMinutesPerDay: number };
};

export function useChallenge20Query(config?: {
  readonly totalDays?: number;
  readonly targetMinutesPerDay?: number;
  readonly startDay?: LocalDayKey | string | null;
}) {
  const user = useCurrentUser();
  const readModels = getReadModelsAdapter();
  const snap = useSubscribable(readModels.trainingDailyTotals(user?.id ?? null));
  const rows = snap.data as TrainingDailyTotalRowDb[];

  const effectiveConfig = useMemo(
    () => ({
      totalDays: Math.max(1, Math.min(365, Math.floor(config?.totalDays ?? 20))),
      targetMinutesPerDay: Math.max(
        1,
        Math.min(240, Math.floor(config?.targetMinutesPerDay ?? 15)),
      ),
      startDay: typeof config?.startDay === 'string' ? (config.startDay as LocalDayKey) : null,
    }),
    [config?.startDay, config?.targetMinutesPerDay, config?.totalDays],
  );

  const dailyTotals = useMemo(() => normalizeDailyTotals(rows ?? []), [rows, rows?.length]);

  const state = useMemo(() => {
    return projectChallenge20FromDailyTotals({
      dailyTotals,
      config: {
        totalDays: effectiveConfig.totalDays,
        targetMinutesPerDay: effectiveConfig.targetMinutesPerDay,
      },
      startDay: effectiveConfig.startDay,
    });
  }, [
    dailyTotals,
    effectiveConfig.startDay,
    effectiveConfig.targetMinutesPerDay,
    effectiveConfig.totalDays,
  ]);

  return {
    data: state,
    dailyTotals,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
    config: {
      totalDays: effectiveConfig.totalDays,
      targetMinutesPerDay: effectiveConfig.targetMinutesPerDay,
    },
  };
}
