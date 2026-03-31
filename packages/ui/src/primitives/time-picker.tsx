/**
 * TimePicker - Themed time picker (avoids native Android/WebView clock UI)
 * Nordic design system
 */

import { Clock } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Close popover after selecting minutes (default: true). */
  closeOnMinuteSelect?: boolean;
}

function normalizeTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function toTwoDigits(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseTime(value: string): { hour: number; minute: number } {
  const normalized = normalizeTime(value) ?? '20:00';
  const [h, m] = normalized.split(':');
  return { hour: Number(h), minute: Number(m) };
}

function formatTime(hour: number, minute: number): string {
  return `${toTwoDigits(hour)}:${toTwoDigits(minute)}`;
}

export function TimePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  ariaLabel,
  closeOnMinuteSelect = true,
}: TimePickerProps): ReactNode {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [{ hour, minute }, setDraft] = useState(() => parseTime(value));

  useEffect(() => {
    if (!open) return;
    setDraft(parseTime(value));
  }, [open, value]);

  const displayValue = normalizeTime(value);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const commit = (next: { hour: number; minute: number }, opts?: { close?: boolean }) => {
    setDraft(next);
    onChange(formatTime(next.hour, next.minute));
    if (opts?.close) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            'flex items-center justify-between gap-2',
            'h-10 w-28 rounded-xl border border-border bg-surface px-3',
            'text-sm font-semibold text-foreground',
            'hover:bg-secondary/50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-visual focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !displayValue && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {displayValue ?? placeholder ?? t('selectTime', 'Select a time')}
          </span>
          <Clock size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-2" align="end">
        <div className="flex gap-2">
          <div className="w-16">
            <div
              role="listbox"
              aria-label={t('hours', 'Hours')}
              className="h-52 overflow-auto rounded-xl border border-border bg-surface p-1"
            >
              {hours.map((h) => {
                const active = h === hour;
                return (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => commit({ hour: h, minute })}
                    className={cn(
                      'w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    {toTwoDigits(h)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-16">
            <div
              role="listbox"
              aria-label={t('minutes', 'Minutes')}
              className="h-52 overflow-auto rounded-xl border border-border bg-surface p-1"
            >
              {minutes.map((m) => {
                const active = m === minute;
                return (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => commit({ hour, minute: m }, { close: closeOnMinuteSelect })}
                    className={cn(
                      'w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    {toTwoDigits(m)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
