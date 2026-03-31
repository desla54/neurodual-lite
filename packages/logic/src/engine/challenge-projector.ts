import type {
  Challenge20Config,
  Challenge20State,
  LocalDayKey,
  TrainingDailyTotal,
} from '../types/challenge';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDayKey(date: Date): LocalDayKey {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}` as LocalDayKey;
}

function minutesFromMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, ms / 60000);
}

export function createDefaultChallenge20Config(): Challenge20Config {
  return { totalDays: 20, targetMinutesPerDay: 15 };
}

export function projectChallenge20FromDailyTotals(input: {
  readonly dailyTotals: readonly TrainingDailyTotal[];
  readonly now?: Date;
  readonly config?: Challenge20Config;
  /** Local day key (YYYY-MM-DD). Days before are ignored. */
  readonly startDay?: LocalDayKey | null;
}): Challenge20State {
  const now = input.now ?? new Date();
  const config = input.config ?? createDefaultChallenge20Config();

  const totalDays = Math.max(1, Math.min(365, Math.floor(config.totalDays)));
  const targetMinutesPerDay = Math.max(1, Math.floor(config.targetMinutesPerDay));
  const targetMs = targetMinutesPerDay * 60000;
  const today = formatLocalDayKey(now);
  const startDay = input.startDay ?? null;

  const totalsByDay = new Map<LocalDayKey, TrainingDailyTotal>();
  for (const row of input.dailyTotals) {
    if (!row?.day) continue;
    if (startDay && row.day.localeCompare(startDay) < 0) continue;
    if (row.day.localeCompare(today) > 0) continue;
    totalsByDay.set(row.day, {
      day: row.day,
      totalDurationMs: Math.max(0, Number(row.totalDurationMs ?? 0)),
      sessionsCount: Math.max(0, Number(row.sessionsCount ?? 0)),
    });
  }

  const completedDays = Array.from(totalsByDay.values())
    .filter((row) => row.totalDurationMs >= targetMs)
    .map((row) => row.day)
    .sort((a, b) => a.localeCompare(b));

  const completedUnique = Array.from(new Set(completedDays)).slice(0, totalDays);
  const completedCount = completedUnique.length;
  const isComplete = completedCount >= totalDays;

  const todayRow = totalsByDay.get(today);
  const todayDurationMs = todayRow?.totalDurationMs ?? 0;
  const todayMinutes = minutesFromMs(todayDurationMs);
  const hasCompletedToday = completedUnique.includes(today);
  const currentIndex = isComplete || hasCompletedToday ? null : completedCount + 1;

  const cards = Array.from({ length: totalDays }, (_, idx) => {
    const index = idx + 1;
    if (index <= completedCount) {
      const dayKey = completedUnique[index - 1] ?? null;
      const row = dayKey ? totalsByDay.get(dayKey) : undefined;
      return {
        index,
        completedDay: dayKey,
        completedMinutes: dayKey ? minutesFromMs(row?.totalDurationMs ?? 0) : null,
        status: 'completed' as const,
        currentMinutesToday: null,
        currentProgress: null,
      };
    }

    if (currentIndex !== null && index === currentIndex) {
      const progress = clamp01(todayDurationMs / targetMs);
      return {
        index,
        completedDay: null,
        completedMinutes: null,
        status: 'current' as const,
        currentMinutesToday: todayMinutes,
        currentProgress: progress,
      };
    }

    return {
      index,
      completedDay: null,
      completedMinutes: null,
      status: 'locked' as const,
      currentMinutesToday: null,
      currentProgress: null,
    };
  });

  return {
    config: { totalDays, targetMinutesPerDay },
    today,
    completedDays: completedCount,
    currentIndex,
    isComplete,
    cards,
    todayMinutes,
    todayDurationMs,
  };
}
