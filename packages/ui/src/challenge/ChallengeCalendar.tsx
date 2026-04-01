'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Challenge20State, LocalDayKey, TrainingDailyTotal } from '@neurodual/logic';
import { CaretLeft, CaretRight, Check } from '@phosphor-icons/react';

import { cn } from '../lib/utils';
import { GLASS_SHADOW_SM } from '../primitives/glass';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDayKey(day: LocalDayKey): Date {
  return new Date(`${day}T00:00:00`);
}

function toDayKey(date: Date): LocalDayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` as LocalDayKey;
}

/** Return the Monday-based weekday headers for the user's locale (narrow). */
function getWeekdayHeaders(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  // 2026-01-05 is a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2026, 0, 5 + i);
    return fmt.format(d);
  });
}

function getMonthLabel(year: number, month: number, locale: string): string {
  const d = new Date(year, month, 1);
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const label = fmt.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Get calendar grid for a given month. Returns weeks × 7 days (null for empty cells). */
function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i++) week.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(new Date(year, month, day));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

function minutesFromMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 60000));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DayCellState = 'completed' | 'current' | 'has-training' | 'empty' | 'outside';

interface DayCellInfo {
  date: Date;
  dayKey: LocalDayKey;
  dayOfMonth: number;
  state: DayCellState;
  minutes: number;
  progress: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChallengeCalendarProps {
  readonly state: Challenge20State;
  readonly startDay: LocalDayKey | null;
  readonly dailyTotals?: TrainingDailyTotal[];
  readonly className?: string;
}

export function ChallengeCalendar({
  state,
  startDay,
  dailyTotals,
  className,
}: ChallengeCalendarProps): ReactNode {
  const { t, i18n } = useTranslation();
  const locale = i18n.language ?? 'en';

  const completedDays = useMemo(() => {
    const set = new Set<string>();
    for (const card of state.cards) {
      if (card.status === 'completed' && card.completedDay) {
        set.add(card.completedDay);
      }
    }
    return set;
  }, [state.cards]);

  const dailyTotalsMap = useMemo(() => {
    const map = new Map<string, TrainingDailyTotal>();
    if (dailyTotals) {
      for (const row of dailyTotals) {
        map.set(row.day, row);
      }
    }
    return map;
  }, [dailyTotals]);

  const todayDate = useMemo(() => parseDayKey(state.today), [state.today]);
  const startDate = useMemo(
    () => (startDay ? parseDayKey(startDay) : todayDate),
    [startDay, todayDate],
  );

  const minMonth = useMemo(
    () => ({ year: startDate.getFullYear(), month: startDate.getMonth() }),
    [startDate],
  );
  const maxMonth = useMemo(
    () => ({ year: todayDate.getFullYear(), month: todayDate.getMonth() }),
    [todayDate],
  );

  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

  const canGoPrev =
    viewYear > minMonth.year || (viewYear === minMonth.year && viewMonth > minMonth.month);
  const canGoNext =
    viewYear < maxMonth.year || (viewYear === maxMonth.year && viewMonth < maxMonth.month);

  const goPrev = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNext = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const weekdayHeaders = useMemo(() => getWeekdayHeaders(locale), [locale]);
  const monthLabel = useMemo(
    () => getMonthLabel(viewYear, viewMonth, locale),
    [viewYear, viewMonth, locale],
  );
  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const targetMs = state.config.targetMinutesPerDay * 60000;

  const resolveDayCell = (date: Date): DayCellInfo => {
    const dayKey = toDayKey(date);
    const dayOfMonth = date.getDate();
    const isBeforeStart = startDay ? dayKey.localeCompare(startDay) < 0 : false;
    const isAfterToday = dayKey.localeCompare(state.today) > 0;

    if (isBeforeStart || isAfterToday) {
      return { date, dayKey, dayOfMonth, state: 'outside', minutes: 0, progress: 0 };
    }

    const isToday = dayKey === state.today;
    const isCompleted = completedDays.has(dayKey);
    const row = dailyTotalsMap.get(dayKey);
    const minutes = row ? minutesFromMs(row.totalDurationMs) : 0;

    if (isCompleted) {
      return { date, dayKey, dayOfMonth, state: 'completed', minutes, progress: 1 };
    }

    if (isToday && state.currentIndex !== null) {
      const progress = targetMs > 0 ? Math.min(1, (row?.totalDurationMs ?? 0) / targetMs) : 0;
      return { date, dayKey, dayOfMonth, state: 'current', minutes, progress };
    }

    if (row && row.totalDurationMs > 0) {
      return { date, dayKey, dayOfMonth, state: 'has-training', minutes, progress: 0 };
    }

    return { date, dayKey, dayOfMonth, state: 'empty', minutes: 0, progress: 0 };
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Month navigation header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            canGoPrev
              ? 'text-foreground hover:bg-muted/50 cursor-pointer'
              : 'text-muted-foreground/30 cursor-default',
          )}
          aria-label={t('aria.previousMonth')}
        >
          <CaretLeft size={18} weight="bold" />
        </button>

        <span className="text-sm font-semibold text-foreground tracking-tight">{monthLabel}</span>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            canGoNext
              ? 'text-foreground hover:bg-muted/50 cursor-pointer'
              : 'text-muted-foreground/30 cursor-default',
          )}
          aria-label={t('aria.nextMonth')}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {weekdayHeaders.map((label, i) => (
          <div
            key={`wh-${i}`}
            className="text-center text-3xs font-medium text-muted-foreground uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {grid.flat().map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }
          const cell = resolveDayCell(date);
          return <CalendarDayCell key={cell.dayKey} cell={cell} />;
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day cell sub-component
// ---------------------------------------------------------------------------

function CalendarDayCell({ cell }: { cell: DayCellInfo }): ReactNode {
  const { state: cellState, dayOfMonth, minutes, progress } = cell;

  return (
    <div
      className={cn(
        'relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all text-xs',
        GLASS_SHADOW_SM,
        // States
        cellState === 'completed' &&
          'bg-emerald-500/25 border border-emerald-500/50',
        cellState === 'current' &&
          'bg-card border-2 border-primary ring-1 ring-primary/40',
        cellState === 'has-training' &&
          'bg-card border border-border/50',
        cellState === 'empty' &&
          'bg-card border border-border/50',
        cellState === 'outside' && 'opacity-40 bg-card border border-border/20',
      )}
      title={minutes > 0 ? `${minutes} min` : undefined}
    >
      {/* Progress fill for current day */}
      {cellState === 'current' && progress > 0 && (
        <div
          className={cn(
            'absolute inset-0 rounded-[6px] bg-primary/10 transition-all duration-500',
            progress >= 0.95 && 'rounded-[6px]',
          )}
          style={{
            clipPath: `inset(${Math.round((1 - progress) * 100)}% 0 0 0)`,
          }}
        />
      )}

      {/* Day number */}
      <span
        className={cn(
          'relative z-10 font-semibold tabular-nums leading-none',
          cellState === 'completed' && 'text-emerald-600 dark:text-emerald-300',
          cellState === 'current' && 'text-primary font-bold',
          cellState === 'has-training' && 'text-foreground',
          cellState === 'empty' && 'text-foreground/70',
          cellState === 'outside' && 'text-muted-foreground/50',
        )}
      >
        {dayOfMonth}
      </span>

      {/* Completed check badge */}
      {cellState === 'completed' && (
        <Check
          size={10}
          weight="bold"
          className="relative z-10 text-emerald-500 dark:text-emerald-400 mt-0.5"
        />
      )}

      {/* Minutes label for completed / current */}
      {(cellState === 'completed' || cellState === 'current') && minutes > 0 && (
        <span
          className={cn(
            'relative z-10 text-3xs leading-none mt-0.5 tabular-nums',
            cellState === 'completed' && 'text-emerald-600 dark:text-emerald-400',
            cellState === 'current' && 'text-primary',
          )}
        >
          {minutes}m
        </span>
      )}

      {/* Dot indicator for has-training but not goal-met */}
      {cellState === 'has-training' && (
        <div className="relative z-10 w-1 h-1 rounded-full bg-primary/50 mt-0.5" />
      )}
    </div>
  );
}
