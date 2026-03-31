/**
 * FiltersDropdown - Responsive filter container
 *
 * Mobile: Collapsible dropdown with JourneySelector separate
 * Desktop: Horizontal grid layout with nested submenu
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown, Funnel } from '@phosphor-icons/react';
import { ModalityFilter } from './modality-filter';
import { ModeSelector } from './mode-selector';
import { JourneySelector } from './journey-selector';
import { DateFilter } from './date-filter';
import { NLevelSelector } from './n-level-selector';
import type {
  CustomDateRange,
  DateRangeOption,
  FreeModeFilterType,
  JourneyFilterType,
  ModalityFilterSet,
  ModeType,
  NLevelFilterSet,
} from './types';

export interface FiltersDropdownProps {
  readonly modalityFilter: ModalityFilterSet;
  readonly onModalityFilterChange: (modalities: ModalityFilterSet) => void;
  readonly mode: ModeType;
  readonly onModeChange: (mode: ModeType) => void;
  /** Journey filter - only used when mode is 'Journey' */
  readonly journeyFilter: JourneyFilterType;
  /** Callback when journey filter changes */
  readonly onJourneyFilterChange: (journeyId: JourneyFilterType) => void;
  /** Free training sub-filter - only used when mode is 'Libre' */
  readonly freeModeFilter: FreeModeFilterType;
  /** Callback when free training mode filter changes */
  readonly onFreeModeFilterChange: (mode: FreeModeFilterType) => void;
  /** Available journeys from session history */
  readonly availableJourneys: readonly string[];
  readonly dateOption: DateRangeOption;
  readonly onDateChange: (option: DateRangeOption) => void;
  readonly customDateRange: CustomDateRange;
  readonly onCustomDateRangeChange: (range: CustomDateRange) => void;
  readonly nLevels: NLevelFilterSet;
  readonly onNLevelsChange: (levels: NLevelFilterSet) => void;
  /** Beta features enabled - if false, locks Dual* modes */
  readonly betaEnabled?: boolean;
  /** Access gating for experimental modes (alpha/beta). */
  readonly featureAccess?: { betaEnabled: boolean; alphaEnabled: boolean };
  /** If false, hide Journey/Libre sub-filters while keeping the main mode selector. */
  readonly showContextSubfilters?: boolean;
}

export function FiltersDropdown({
  modalityFilter,
  onModalityFilterChange,
  mode,
  onModeChange,
  journeyFilter,
  onJourneyFilterChange,
  freeModeFilter,
  onFreeModeFilterChange,
  availableJourneys,
  dateOption,
  onDateChange,
  customDateRange,
  onCustomDateRangeChange,
  nLevels,
  onNLevelsChange,
  betaEnabled = false,
  featureAccess,
  showContextSubfilters = true,
}: FiltersDropdownProps): ReactNode {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Count journey filter as active only when mode is Journey and a specific journey is selected
  const isJourneyFilterActive =
    showContextSubfilters && mode === 'Journey' && journeyFilter !== 'all';
  const isFreeModeFilterActive =
    showContextSubfilters && mode === 'Libre' && freeModeFilter !== 'all';

  const activeFiltersCount = [
    modalityFilter.size > 0,
    mode !== 'all',
    isJourneyFilterActive,
    isFreeModeFilterActive,
    dateOption !== 'all',
    nLevels.size > 0,
  ].filter(Boolean).length;

  return (
    <div className="mb-6">
      {/* Mobile: Dropdown button */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-border/50 rounded-2xl transition-all active:brightness-90"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary rounded-xl">
              <Funnel size={18} className="text-muted-foreground" />
            </div>
            <div className="text-left">
              <span className="font-semibold text-primary">{t('stats.filters.title')}</span>
              {activeFiltersCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </div>
          </div>
          <CaretDown
            size={20}
            className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown content - Mobile uses separate JourneySelector (no submenu) */}
        {isOpen && (
          <div className="mt-3 p-4 bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-border/50 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
            <ModeSelector
              value={mode}
              onChange={onModeChange}
              betaEnabled={betaEnabled}
              featureAccess={featureAccess}
              showContextModes={showContextSubfilters}
              freeModeFilter={showContextSubfilters ? freeModeFilter : undefined}
              onFreeModeFilterChange={showContextSubfilters ? onFreeModeFilterChange : undefined}
              // No journey props on mobile - we use separate JourneySelector below
            />
            {/* Show JourneySelector when Journey mode is selected (mobile) */}
            {showContextSubfilters && mode === 'Journey' && (
              <JourneySelector
                value={journeyFilter}
                onChange={onJourneyFilterChange}
                availableJourneys={availableJourneys}
                betaEnabled={betaEnabled}
                featureAccess={featureAccess}
              />
            )}
            <ModalityFilter selected={modalityFilter} onChange={onModalityFilterChange} />
            <NLevelSelector selected={nLevels} onChange={onNLevelsChange} />
            <DateFilter
              value={dateOption}
              onChange={onDateChange}
              customRange={customDateRange}
              onCustomRangeChange={onCustomDateRangeChange}
            />
          </div>
        )}
      </div>

      {/* Desktop: Grid layout with nested submenu */}
      <div className="hidden md:grid md:grid-cols-4 gap-4">
        <ModeSelector
          value={mode}
          onChange={onModeChange}
          betaEnabled={betaEnabled}
          featureAccess={featureAccess}
          showContextModes={showContextSubfilters}
          journeyFilter={showContextSubfilters ? journeyFilter : undefined}
          onJourneyFilterChange={showContextSubfilters ? onJourneyFilterChange : undefined}
          freeModeFilter={showContextSubfilters ? freeModeFilter : undefined}
          onFreeModeFilterChange={showContextSubfilters ? onFreeModeFilterChange : undefined}
          availableJourneys={showContextSubfilters ? availableJourneys : undefined}
        />
        <ModalityFilter selected={modalityFilter} onChange={onModalityFilterChange} />
        <NLevelSelector selected={nLevels} onChange={onNLevelsChange} />
        <DateFilter
          value={dateOption}
          onChange={onDateChange}
          customRange={customDateRange}
          onCustomRangeChange={onCustomDateRangeChange}
        />
      </div>
    </div>
  );
}
