/**
 * ModalityFilter - Multi-select filter for position/audio/color modalities
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CaretDown, Stack, MapPin, MusicNote, Palette } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '../../primitives';
import type { ModalityFilterSet } from './types';

export interface ModalityFilterProps {
  readonly selected: ModalityFilterSet;
  readonly onChange: (modalities: ModalityFilterSet) => void;
}

const AVAILABLE_MODALITIES: { id: string; labelKey: string; icon: typeof MapPin; color: string }[] =
  [
    { id: 'position', labelKey: 'common.position', icon: MapPin, color: 'text-blue-500' },
    { id: 'audio', labelKey: 'common.audio', icon: MusicNote, color: 'text-amber-500' },
    { id: 'color', labelKey: 'common.color', icon: Palette, color: 'text-pink-500' },
  ];

export function ModalityFilter({ selected, onChange }: ModalityFilterProps): ReactNode {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const toggleModality = (modalityId: string) => {
    const newSet = new Set(selected);
    if (newSet.has(modalityId)) {
      newSet.delete(modalityId);
    } else {
      newSet.add(modalityId);
    }
    onChange(newSet);
  };

  // Build display label
  const getDisplayLabel = () => {
    if (selected.size === 0) {
      return t('stats.modality.all');
    }
    const names = AVAILABLE_MODALITIES.filter((m) => selected.has(m.id)).map((m) => t(m.labelKey));
    return names.join(' + ');
  };

  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
        {t('stats.modality.title')}
      </span>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              <Stack size={16} className="text-muted-foreground" />
              <span className="font-medium">{getDisplayLabel()}</span>
              {selected.size > 0 && (
                <span className="px-1.5 py-0.5 text-3xs font-bold bg-primary text-primary-foreground rounded-full">
                  {selected.size}
                </span>
              )}
            </span>
            <CaretDown size={16} className="text-muted-foreground" />
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
              <span>{t('stats.modality.all')}</span>
              {selected.size === 0 && <Check size={16} className="ml-auto text-primary" />}
            </button>

            <div className="h-px bg-border my-2" />

            {/* Modality checkboxes */}
            {AVAILABLE_MODALITIES.map((mod) => {
              const isChecked = selected.has(mod.id);
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => toggleModality(mod.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    isChecked
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <Icon size={16} className={mod.color} />
                  <span>{t(mod.labelKey)}</span>
                  <div
                    className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                    }`}
                  >
                    {isChecked && <Check size={12} className="text-primary-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
