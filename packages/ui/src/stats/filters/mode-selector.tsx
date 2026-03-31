/**
 * ModeSelector - Game mode filter dropdown with nested submenu for Journey
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  CaretDown,
  Check,
  Database,
  Eye,
  Folder,
  GraduationCap,
  Lightning,
  MapPin,
  MapTrifold,
  PencilSimple,
  SlidersHorizontal,
  Stack,
  Tag,
} from '@phosphor-icons/react';
import { resolveStatsContext, type IconKey } from '@neurodual/logic';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../primitives';
import type { FreeModeFilterType, JourneyFilterType, ModeType } from './types';

export interface ModeSelectorProps {
  readonly value: ModeType;
  readonly onChange: (mode: ModeType) => void;
  /** Beta features enabled (legacy). Prefer `featureAccess`. */
  readonly betaEnabled?: boolean;
  /** Access gating for experimental modes (alpha/beta). */
  readonly featureAccess?: { betaEnabled: boolean; alphaEnabled: boolean };
  /** Journey filter - only used when mode is 'Journey' */
  readonly journeyFilter?: JourneyFilterType;
  /** Callback when journey filter changes */
  readonly onJourneyFilterChange?: (journeyId: JourneyFilterType) => void;
  /** Free training mode sub-filter - only used when mode is 'Libre' */
  readonly freeModeFilter?: FreeModeFilterType;
  /** Callback when free training mode sub-filter changes */
  readonly onFreeModeFilterChange?: (mode: FreeModeFilterType) => void;
  /** Available journeys from session history */
  readonly availableJourneys?: readonly string[];
  /** If false, hide Journey/Libre entries from the selector. */
  readonly showContextModes?: boolean;
}

const ICONS: Record<IconKey, typeof Brain> = {
  stack: Stack,
  'map-trifold': MapTrifold,
  'graduation-cap': GraduationCap,
  brain: Brain,
  lightning: Lightning,
  'map-pin': MapPin,
  database: Database,
  tag: Tag,
  sliders: SlidersHorizontal,
  pencil: PencilSimple,
  eye: Eye,
};

export function ModeSelector({
  value,
  onChange,
  betaEnabled = false,
  featureAccess,
  journeyFilter = 'all',
  onJourneyFilterChange,
  freeModeFilter = 'all',
  onFreeModeFilterChange,
  availableJourneys = [],
  showContextModes = true,
}: ModeSelectorProps): ReactNode {
  const { t } = useTranslation();

  const access = {
    betaEnabled: featureAccess?.betaEnabled ?? betaEnabled,
    alphaEnabled: featureAccess?.alphaEnabled ?? false,
  };

  const ctx = resolveStatsContext({
    mode: value,
    journeyFilter,
    availableJourneyIds: availableJourneys,
    access,
  });

  const modes = ctx.options.modes;
  const journeys = ctx.options.journeys;
  const visibleModes = modes.filter((mode) => {
    if (mode.locked) return false;
    if (!showContextModes && (mode.value === 'Journey' || mode.value === 'Libre')) return false;
    return true;
  });
  const visibleJourneys = journeys.filter((journey) => !journey.locked);
  const normalizedJourneyFilter = ctx.normalized.journeyFilter;

  const getModeLabel = (mode: (typeof modes)[number]): string =>
    mode.labelKey ? t(mode.labelKey) : String(mode.value);

  const getJourneyLabel = (journey: (typeof journeys)[number]): string =>
    journey.labelKey ? t(journey.labelKey) : String(journey.value);

  const compactText = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    if (maxLen <= 3) return text.slice(0, Math.max(0, maxLen));
    return `${text.slice(0, maxLen - 3)}...`;
  };

  const getJourneyShortLabel = (journey: (typeof journeys)[number]): string => {
    const fullLabel = getJourneyLabel(journey);
    if (journey.value === 'all') {
      return fullLabel.split(' ')[0] || fullLabel;
    }
    if (journey.shortCode) return journey.shortCode;
    const cleaned = fullLabel.replace(/^Parcours\s+/i, '').replace(/^Journey\s+/i, '');
    return compactText(cleaned, 14);
  };

  const selectedMode =
    visibleModes.find((m) => m.value === value) ??
    visibleModes.find((m) => m.value === ctx.normalized.mode) ??
    visibleModes[0];
  const freeModeOptions = visibleModes.filter(
    (m) => m.value !== 'all' && m.value !== 'Journey' && m.value !== 'Libre',
  );
  const normalizedFreeModeFilter =
    freeModeFilter === 'all' || freeModeOptions.some((m) => m.value === freeModeFilter)
      ? freeModeFilter
      : 'all';
  const selectedFreeMode =
    normalizedFreeModeFilter === 'all'
      ? null
      : freeModeOptions.find((mode) => mode.value === normalizedFreeModeFilter);
  const selectedJourney =
    visibleJourneys.find((j) => j.value === normalizedJourneyFilter) ?? visibleJourneys[0];

  const display = (() => {
    if (!selectedMode) {
      return { icon: Stack, label: t('stats.mode.all') };
    }
    if (value === 'Journey' && selectedJourney) {
      return {
        icon: MapTrifold,
        label: `J: ${getJourneyShortLabel(selectedJourney)}`,
      };
    }
    if (value === 'Libre' && selectedFreeMode) {
      return {
        icon: SlidersHorizontal,
        label: `L: ${getModeLabel(selectedFreeMode)}`,
      };
    }
    const Icon = ICONS[selectedMode.iconKey] ?? Stack;
    return { icon: Icon, label: getModeLabel(selectedMode) };
  })();

  const displayTitle =
    value === 'Journey'
      ? (() => {
          const journeyLabel = selectedJourney
            ? getJourneyLabel(selectedJourney)
            : t('stats.journey.all');
          const journeyWord = t('stats.mode.journey');
          if (
            journeyLabel.toLowerCase().includes(journeyWord.toLowerCase()) ||
            journeyLabel.toLowerCase().startsWith('parcours')
          ) {
            return journeyLabel;
          }
          return `${journeyWord} - ${journeyLabel}`;
        })()
      : display.label;

  const handleModeChange = (newMode: string) => {
    onChange(newMode as ModeType);
  };

  const handleJourneyChange = (journeyId: string) => {
    if (value !== 'Journey') {
      onChange('Journey');
    }
    onJourneyFilterChange?.(journeyId as JourneyFilterType);
  };

  const handleFreeModeChange = (modeId: string) => {
    if (value !== 'Libre') {
      onChange('Libre');
    }
    onFreeModeFilterChange?.(modeId as FreeModeFilterType);
  };

  const hasJourneySubmenu = onJourneyFilterChange !== undefined;
  const hasFreeModeSubmenu = onFreeModeFilterChange !== undefined;

  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
        {t('stats.mode.title')}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={displayTitle}
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              <display.icon size={16} className="text-muted-foreground" />
              <span className="font-medium">{display.label}</span>
            </span>
            <CaretDown className="h-4 w-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuRadioGroup
            value={selectedMode?.value ?? 'all'}
            onValueChange={handleModeChange}
          >
            {visibleModes.map((mode) => {
              const ModeIcon = ICONS[mode.iconKey] ?? Stack;

              if (mode.value === 'Journey' && hasJourneySubmenu) {
                const isSelected = value === 'Journey';
                return (
                  <DropdownMenuSub key={mode.value}>
                    <DropdownMenuSubTrigger className={isSelected ? 'bg-slate-50' : ''} inset>
                      {isSelected && (
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-2 ${mode.locked ? 'opacity-60' : ''}`}
                      >
                        <ModeIcon size={16} className="text-muted-foreground" />
                        <span>{getModeLabel(mode)}</span>
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={value === 'Journey' ? normalizedJourneyFilter : '__none__'}
                        onValueChange={handleJourneyChange}
                      >
                        {visibleJourneys.map((journey) => {
                          const Icon = ICONS[journey.iconKey] ?? Folder;
                          const label = getJourneyLabel(journey);
                          return (
                            <DropdownMenuRadioItem key={journey.value} value={journey.value}>
                              <span className="flex items-center gap-2">
                                <Icon size={16} className="text-muted-foreground" />
                                <span>{label}</span>
                              </span>
                            </DropdownMenuRadioItem>
                          );
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              }

              if (mode.value === 'Libre' && hasFreeModeSubmenu) {
                const isSelected = value === 'Libre';
                return (
                  <DropdownMenuSub key={mode.value}>
                    <DropdownMenuSubTrigger className={isSelected ? 'bg-slate-50' : ''} inset>
                      {isSelected && (
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-2 ${mode.locked ? 'opacity-60' : ''}`}
                      >
                        <ModeIcon size={16} className="text-muted-foreground" />
                        <span>{getModeLabel(mode)}</span>
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={value === 'Libre' ? normalizedFreeModeFilter : '__none__'}
                        onValueChange={handleFreeModeChange}
                      >
                        <DropdownMenuRadioItem key="all" value="all">
                          <span className="flex items-center gap-2">
                            <Stack size={16} className="text-muted-foreground" />
                            <span>{t('stats.mode.all')}</span>
                          </span>
                        </DropdownMenuRadioItem>
                        {freeModeOptions.map((freeMode) => {
                          const FreeModeIcon = ICONS[freeMode.iconKey] ?? Stack;
                          return (
                            <DropdownMenuRadioItem key={freeMode.value} value={freeMode.value}>
                              <span className="flex items-center gap-2">
                                <FreeModeIcon size={16} className="text-muted-foreground" />
                                <span>{getModeLabel(freeMode)}</span>
                              </span>
                            </DropdownMenuRadioItem>
                          );
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              }

              return (
                <DropdownMenuRadioItem key={mode.value} value={mode.value}>
                  <span className="flex items-center gap-2">
                    <ModeIcon size={16} className="text-muted-foreground" />
                    <span>{getModeLabel(mode)}</span>
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
