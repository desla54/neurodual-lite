'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChallengeDayCard as ChallengeDayCardModel, LocalDayKey } from '@neurodual/logic';
import { Check, CalendarBlank, Lock } from '@phosphor-icons/react';

import { cn } from '../lib/utils';
import { GLASS_SHADOW, GLASS_SHADOW_LG, GLASS_SHADOW_SM } from '../primitives/glass';
import { InfoSheet } from '../primitives/info-sheet';

function toDayDate(day: LocalDayKey): Date | null {
  if (!day) return null;
  // Local date parsing: YYYY-MM-DDT00:00:00 (no timezone suffix) => local time.
  const date = new Date(`${day}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDayLabel(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short' })
      .format(date)
      .replace('.', '');
  } catch {
    return date.toLocaleDateString();
  }
}

function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return `${rounded} min`;
}

export interface ChallengeDayCardProps {
  readonly card: ChallengeDayCardModel;
  readonly emphasis?: 'normal' | 'hero';
  readonly isNext?: boolean;
  readonly isPast?: boolean;
  readonly onClick?: () => void;
}

export function ChallengeDayCard({
  card,
  emphasis = 'normal',
  isNext = false,
  isPast = false,
  onClick,
}: ChallengeDayCardProps): ReactNode {
  const { t, i18n } = useTranslation();
  const locale = i18n.language ?? 'en';

  const isHero = emphasis === 'hero';
  const isCompleted = card.status === 'completed';
  const isCurrent = card.status === 'current';
  const isLocked = card.status === 'locked';

  const pressRef = useRef<HTMLButtonElement>(null);
  const isInteractive = Boolean(onClick);

  const onPointerDown = useCallback(() => {
    if (!isInteractive || isLocked) return;
    pressRef.current?.classList.add('pressable--pressed');
  }, [isInteractive, isLocked]);

  const clearPressed = useCallback(() => {
    pressRef.current?.classList.remove('pressable--pressed');
  }, []);

  const progress = isCurrent ? (card.currentProgress ?? 0) : isCompleted ? 1 : 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round(progress * 100)));

  const completedDate = card.completedDay ? toDayDate(card.completedDay) : null;
  const completedLabel = completedDate ? formatDayLabel(completedDate, locale) : null;

  return (
    <div className={cn('flex flex-col items-center gap-1')}>
      <button
        ref={pressRef}
        type="button"
        className={cn(
          'relative flex flex-col items-center gap-1.5 p-3 transition-all duration-200',
          // Glass foundation
          'rounded-[1rem] border border-border/50 bg-card/75 backdrop-blur-2xl',
          GLASS_SHADOW,
          isHero
            ? 'min-w-[96px] w-[96px] sm:min-w-[104px] sm:w-[104px] p-3.5'
            : 'min-w-[84px] w-[84px]',
          isHero && !isCurrent && 'opacity-90',
          isHero && isPast && !isCurrent && 'opacity-65 scale-[0.94]',
          isHero && isNext && !isCurrent && !isPast && 'opacity-100 scale-[1.02]',
          isLocked && 'opacity-50',
          isCompleted && 'border-emerald-500/35 bg-card/85',
          isCurrent && [
            isHero
              ? `scale-[1.06] ${GLASS_SHADOW_LG} border-foreground/70 ring-2 ring-offset-2 ring-offset-background ring-foreground/90`
              : 'ring-2 ring-offset-2 ring-offset-background ring-primary',
          ],
          isInteractive ? 'pressable cursor-pointer' : 'cursor-default',
          isLocked && isInteractive && 'pressable--disabled',
        )}
        onPointerDown={isInteractive ? onPointerDown : undefined}
        onPointerUp={isInteractive ? clearPressed : undefined}
        onPointerLeave={isInteractive ? clearPressed : undefined}
        onPointerCancel={isInteractive ? clearPressed : undefined}
        onClick={onClick}
        aria-label={
          isCompleted
            ? t('home.challenge.card.completed', 'Day completed')
            : isCurrent
              ? t('home.challenge.card.current', 'Current day')
              : t('home.challenge.card.locked', 'Locked day')
        }
      >
        {/* Progress fill overlay (bottom to top) */}
        {isCurrent && progressPercent > 0 && (
          <div
            className={cn(
              'absolute left-0 right-0 bottom-0 transition-all duration-500 ease-out',
              'rounded-b-[14px]',
              progressPercent >= 95 && 'rounded-t-[14px]',
              'bg-primary/12',
            )}
            style={{ height: `${progressPercent}%` }}
          />
        )}

        {/* Stage number badge */}
        <div
          className={cn(
            isHero
              ? 'absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10'
              : 'absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-10',
            'bg-card/85 border border-border/50',
            GLASS_SHADOW_SM,
            isCompleted && 'bg-emerald-500 text-white border-emerald-500/60',
          )}
        >
          {isCompleted ? <Check size={12} weight="bold" /> : `J${card.index}`}
        </div>

        {/* Icon */}
        <div
          className={cn(
            isHero
              ? 'relative z-10 w-12 h-12 rounded-xl flex items-center justify-center'
              : 'relative z-10 w-11 h-11 rounded-xl flex items-center justify-center',
            'bg-muted/65 transition-colors',
            isLocked && 'text-muted-foreground',
            !isLocked && 'text-primary',
            isCompleted && 'text-emerald-500 dark:text-emerald-400',
          )}
        >
          {isLocked ? (
            <Lock size={isHero ? 24 : 22} weight="regular" />
          ) : (
            <CalendarBlank size={isHero ? 24 : 22} weight="regular" />
          )}
        </div>

        {/* Main label */}
        <span
          className={cn(
            'relative z-10 font-bold text-foreground tabular-nums',
            isHero ? 'text-base' : 'text-sm',
            isCompleted && 'text-emerald-700 dark:text-emerald-300',
          )}
        >
          {isCompleted
            ? t('home.challenge.done', 'Done')
            : isCurrent
              ? formatMinutes(card.currentMinutesToday)
              : '—'}
        </span>

        {/* Secondary label */}
        <span
          className={cn(
            'relative z-10 font-medium',
            isHero ? 'text-2xs' : 'text-3xs',
            isLocked && 'text-muted-foreground',
            isCurrent && 'text-primary',
            isCompleted && 'text-emerald-500 dark:text-emerald-400',
          )}
        >
          {isCompleted && completedLabel ? completedLabel : '\u00A0'}
        </span>

        {/* Completed tooltip */}
        {isCompleted && completedLabel && (
          <div className="absolute -bottom-3 right-1">
            <InfoSheet iconSize={10}>
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {t('home.challenge.validatedOn', 'Validated on')} {completedLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('home.challenge.minutes', 'Training')}: {formatMinutes(card.completedMinutes)}
                </div>
              </div>
            </InfoSheet>
          </div>
        )}
      </button>
    </div>
  );
}
