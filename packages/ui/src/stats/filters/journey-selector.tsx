/**
 * JourneySelector - Sub-filter for selecting a specific journey
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Folder, GraduationCap, Lock, MapTrifold, Stack } from '@phosphor-icons/react';
import { resolveStatsContext, type IconKey } from '@neurodual/logic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../primitives';
import type { JourneyFilterType } from './types';

export interface JourneySelectorProps {
  readonly value: JourneyFilterType;
  readonly onChange: (journeyId: JourneyFilterType) => void;
  readonly availableJourneys: readonly string[];
  readonly betaEnabled?: boolean;
  readonly featureAccess?: { betaEnabled: boolean; alphaEnabled: boolean };
}

const ICONS: Record<IconKey, typeof MapTrifold> = {
  stack: Stack,
  'map-trifold': MapTrifold,
  'graduation-cap': GraduationCap,
  brain: Brain,
  lightning: Stack,
  'map-pin': Stack,
  database: Stack,
  tag: Stack,
  sliders: Stack,
  pencil: Stack,
  eye: Stack,
  shuffle: Stack,
  calculator: Stack,
  'car-profile': Stack,
};

export function JourneySelector({
  value,
  onChange,
  availableJourneys,
  betaEnabled = false,
  featureAccess,
}: JourneySelectorProps): ReactNode {
  const { t } = useTranslation();

  const access = {
    betaEnabled: featureAccess?.betaEnabled ?? betaEnabled,
    alphaEnabled: featureAccess?.alphaEnabled ?? false,
  };

  const ctx = resolveStatsContext({
    mode: 'Journey',
    journeyFilter: value,
    availableJourneyIds: availableJourneys,
    access,
  });

  const options = ctx.options.journeys.map((o) => {
    const Icon = ICONS[o.iconKey] ?? Folder;
    return {
      value: o.value,
      label: o.labelKey ? t(o.labelKey) : String(o.value),
      desc: o.descKey ? t(o.descKey) : t('stats.journey.customDesc'),
      icon: Icon,
      locked: o.locked,
    };
  });

  const firstSelectable = options.find((o) => !o.locked)?.value ?? options[0]?.value ?? 'all';
  const selectedOption =
    options.find((o) => o.value === ctx.normalized.journeyFilter) ?? options[0];

  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
        {t('stats.journey.title')}
      </span>
      <Select
        value={options.some((o) => o.value === value) ? value : firstSelectable}
        onValueChange={(v: string) => {
          const selected = options.find((o) => o.value === v);
          if (selected?.locked) return;
          onChange(v as JourneyFilterType);
        }}
      >
        <SelectTrigger className="w-full h-12">
          <SelectValue>
            <span className="flex items-center gap-2">
              {selectedOption?.locked && (
                <Lock size={14} weight="bold" className="text-amber-500 shrink-0" />
              )}
              {selectedOption?.icon && (
                <selectedOption.icon size={16} className="text-muted-foreground" />
              )}
              <span className="font-medium">{selectedOption?.label ?? t('stats.journey.all')}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.locked}
              className={option.locked ? 'opacity-60' : ''}
            >
              <span className="flex items-center gap-2">
                {option.locked && (
                  <Lock size={12} weight="bold" className="text-amber-500 shrink-0" />
                )}
                <option.icon size={16} className="text-muted-foreground" />
                <span>{option.label}</span>
                {option.locked && (
                  <span className="ml-auto text-xxs text-amber-500 font-bold uppercase">
                    {t('common.beta', 'Beta')}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOption?.desc && (
        <p className="mt-2 px-2 text-3xs text-muted-foreground leading-tight">
          {selectedOption.desc}
        </p>
      )}
    </div>
  );
}
