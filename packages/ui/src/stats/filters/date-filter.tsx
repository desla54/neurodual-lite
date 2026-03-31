/**
 * DateFilter - Date range filter with presets and custom picker
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, CalendarBlank, X } from '@phosphor-icons/react';
import {
  DatePicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../primitives';
import type { CustomDateRange, DateRangeOption } from './types';

export interface DateFilterProps {
  readonly value: DateRangeOption;
  readonly onChange: (option: DateRangeOption) => void;
  readonly customRange: CustomDateRange;
  readonly onCustomRangeChange: (range: CustomDateRange) => void;
}

export function DateFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}: DateFilterProps): ReactNode {
  const { t, i18n } = useTranslation();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const options: { value: DateRangeOption; labelKey: string }[] = [
    { value: 'all', labelKey: 'stats.period.allTime' },
    { value: 'today', labelKey: 'stats.period.today' },
    { value: 'week', labelKey: 'stats.period.last7Days' },
    { value: 'month', labelKey: 'stats.period.last30Days' },
    { value: 'custom', labelKey: 'stats.period.custom' },
  ];

  // Format date range for display
  const formatDateRangeDisplay = (range: CustomDateRange): string => {
    if (!range.startDate && !range.endDate) return t('stats.period.select');
    const formatDate = (d: Date) =>
      d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    if (range.startDate && range.endDate) {
      return `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
    }
    if (range.startDate) return t('stats.period.from', { date: formatDate(range.startDate) });
    if (range.endDate) return t('stats.period.until', { date: formatDate(range.endDate) });
    return t('stats.period.select');
  };

  const displayLabel =
    value === 'custom'
      ? formatDateRangeDisplay(customRange)
      : t(options.find((o) => o.value === value)?.labelKey ?? 'stats.period.allTime');

  const handleSelectChange = (v: string) => {
    const newValue = v as DateRangeOption;
    onChange(newValue);
    if (newValue === 'custom') {
      setIsPickerOpen(true);
    }
  };

  const handleStartDateChange = (date: Date | null) => {
    onCustomRangeChange({ ...customRange, startDate: date });
  };

  const handleEndDateChange = (date: Date | null) => {
    onCustomRangeChange({ ...customRange, endDate: date });
  };

  const clearCustomRange = () => {
    onCustomRangeChange({ startDate: null, endDate: null });
  };

  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
        {t('stats.period.title')}
      </span>

      {value !== 'custom' ? (
        <Select value={value} onValueChange={handleSelectChange}>
          <SelectTrigger className="w-full h-12">
            <SelectValue>
              <span className="flex items-center gap-2">
                <CalendarBlank size={16} className="text-muted-foreground" />
                <span className="font-medium">{displayLabel}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
            >
              <span className="flex items-center gap-2">
                <Calendar size={16} className="text-primary" />
                <span className="font-medium text-primary">{displayLabel}</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('all');
                  clearCustomRange();
                }}
                className="p-1 hover:bg-secondary rounded-lg transition-colors"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-primary">
                  {t('stats.period.customTitle')}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="p-1.5 hover:bg-secondary rounded-xl transition-colors"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('stats.period.startDate')}
                  </label>
                  <DatePicker
                    value={customRange.startDate}
                    onChange={handleStartDateChange}
                    placeholder={t('stats.period.selectDate')}
                    locale={i18n.language}
                    maxDate={customRange.endDate ?? new Date()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('stats.period.endDate')}
                  </label>
                  <DatePicker
                    value={customRange.endDate}
                    onChange={handleEndDateChange}
                    placeholder={t('stats.period.selectDate')}
                    locale={i18n.language}
                    minDate={customRange.startDate ?? undefined}
                    maxDate={new Date()}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={clearCustomRange}
                  className="flex-1 h-9 px-3 text-sm font-medium text-muted-foreground hover:text-primary bg-secondary hover:bg-secondary/80 rounded-xl transition-colors"
                >
                  {t('common.clear')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="flex-1 h-9 px-3 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors"
                >
                  {t('common.apply')}
                </button>
              </div>

              {/* Quick presets */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t('stats.period.shortcuts')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { labelKey: 'stats.period.all', value: 'all' as const },
                    { labelKey: 'stats.period.today', value: 'today' as const },
                    { labelKey: 'stats.period.days7', value: 'week' as const },
                    { labelKey: 'stats.period.days30', value: 'month' as const },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        onChange(preset.value);
                        clearCustomRange();
                        setIsPickerOpen(false);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-primary bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                    >
                      {t(preset.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
