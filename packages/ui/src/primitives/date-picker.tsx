/**
 * DatePicker - Themed date picker using react-day-picker
 * Nordic design system
 */

import { DayPicker } from 'react-day-picker';
import { format, type Locale } from 'date-fns';
import { fr, enUS, de, es } from 'date-fns/locale';
import { Calendar } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '../lib/utils';

const locales: Record<string, Locale> = {
  fr,
  en: enUS,
  de,
  es,
};

export interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  locale?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Sélectionner une date',
  locale = 'fr',
  minDate,
  maxDate,
  disabled = false,
  className,
}: DatePickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const dateLocale = locales[locale] || fr;

  const handleSelect = (date: Date | undefined) => {
    onChange(date ?? null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center justify-between gap-2 w-full h-10 px-3 rounded-xl',
            'border border-border bg-surface text-sm text-left',
            'hover:bg-secondary/50 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-visual focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {value ? format(value, 'dd MMM yyyy', { locale: dateLocale }) : placeholder}
          </span>
          <Calendar size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DayPicker
          mode="single"
          selected={value ?? undefined}
          onSelect={handleSelect}
          locale={dateLocale}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          showOutsideDays
          classNames={{
            root: 'p-3',
            months: 'flex flex-col',
            month: 'space-y-4',
            month_caption: 'flex justify-center pt-1 relative items-center',
            caption_label: 'text-sm font-medium text-foreground',
            nav: 'flex items-center gap-1',
            button_previous:
              'absolute left-1 h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex items-center justify-center',
            button_next:
              'absolute right-1 h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex items-center justify-center',
            month_grid: 'w-full border-collapse space-y-1',
            weekdays: 'flex',
            weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
            week: 'flex w-full mt-2',
            day: 'h-9 w-9 text-center text-sm p-0 relative flex items-center justify-center',
            day_button:
              'h-8 w-8 p-0 font-normal rounded-lg hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-visual',
            selected:
              'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
            today: 'bg-secondary text-foreground',
            outside: 'text-muted-foreground/50',
            disabled: 'text-muted-foreground/30 cursor-not-allowed hover:bg-transparent',
            hidden: 'invisible',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
