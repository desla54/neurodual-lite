/**
 * NLevelSelector - Multi-select filter for N-levels (1-9)
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CaretDown, Stack, Brain } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '../../primitives';
import type { NLevelFilterSet } from './types';

export interface NLevelSelectorProps {
  readonly selected: NLevelFilterSet;
  readonly onChange: (levels: NLevelFilterSet) => void;
}

const AVAILABLE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function NLevelSelector({ selected, onChange }: NLevelSelectorProps): ReactNode {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const toggleLevel = (level: number) => {
    const newSet = new Set(selected);
    if (newSet.has(level)) {
      newSet.delete(level);
    } else {
      newSet.add(level);
    }
    onChange(newSet);
  };

  // Build display label
  const getDisplayLabel = () => {
    if (selected.size === 0) {
      return t('stats.nLevel.all', 'Tous les niveaux');
    }
    // Sort and show ranges if consecutive
    const sorted = Array.from(selected).sort((a, b) => a - b);
    if (sorted.length <= 3) {
      return sorted.map((n) => `N-${n}`).join(', ');
    }
    return `N-${sorted[0]} ... N-${sorted[sorted.length - 1]}`;
  };

  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
        {t('stats.nLevel.title', 'Level')}
      </span>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              <Brain size={16} className="text-muted-foreground" />
              <span className="font-medium truncate">{getDisplayLabel()}</span>
              {selected.size > 0 && (
                <span className="px-1.5 py-0.5 text-3xs font-bold bg-primary text-primary-foreground rounded-full">
                  {selected.size}
                </span>
              )}
            </span>
            <CaretDown size={16} className="text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="space-y-1">
            {/* "All" option */}
            <button
              type="button"
              onClick={() => {
                onChange(new Set());
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                selected.size === 0
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-secondary text-foreground'
              }`}
            >
              <Stack size={16} className="text-muted-foreground" />
              <span>{t('stats.nLevel.all', 'Tous les niveaux')}</span>
              {selected.size === 0 && <Check size={16} className="ml-auto text-primary" />}
            </button>

            <div className="h-px bg-border my-2" />

            {/* Level checkboxes - grid layout for compact display */}
            <div className="grid grid-cols-3 gap-1">
              {AVAILABLE_LEVELS.map((level) => {
                const isChecked = selected.has(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-sm transition-colors ${
                      isChecked
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    <span>N-{level}</span>
                    {isChecked && <Check size={12} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
