import {
  CANONICAL_JOURNEYS,
  listStatsModeOptions,
  resolveEffectiveStatsGameModeId,
  resolveGameModeIdsForStatsMode,
  type FeatureAccess,
  type IconKey,
  type Reliability,
  type StatsModeFilter,
} from './stats-catalog';
import type { JourneyFilterType, ModeType } from '../ports/read-model-port';

export interface StatsOption<T extends string = string> {
  readonly value: T;
  readonly labelKey?: string;
  readonly descKey?: string;
  readonly iconKey: IconKey;
  readonly reliability: Reliability;
  readonly locked: boolean;
  /** Optional short label (e.g. for compact filter chips) */
  readonly shortCode?: string;
}

export interface ResolvedStatsContext {
  readonly normalized: {
    readonly mode: ModeType;
    readonly journeyFilter: JourneyFilterType;
  };
  readonly options: {
    readonly modes: readonly StatsOption<ModeType>[];
    readonly journeys: readonly StatsOption<JourneyFilterType>[];
  };
  /**
   * For chart/spec selection.
   * - In simulator journeys, we reuse the underlying base mode charts.
   */
  readonly effective: {
    readonly chartsMode: ModeType;
    readonly effectiveGameModeId: string | null;
    readonly effectiveGameModeIdsForFilter: readonly string[];
  };
}

function isLockedByReliability(reliability: Reliability, access: FeatureAccess): boolean {
  if (reliability === 'stable') return false;
  if (reliability === 'prototype') return !access.prototypesEnabled;
  if (reliability === 'beta') return !access.betaEnabled;
  return !access.alphaEnabled;
}

export function resolveStatsContext(input: {
  readonly mode: ModeType;
  readonly journeyFilter: JourneyFilterType;
  readonly availableJourneyIds: readonly string[];
  readonly access: FeatureAccess;
}): ResolvedStatsContext {
  const modeOptions = listStatsModeOptions().map((m) => ({
    value: m.value as unknown as ModeType,
    labelKey: m.labelKey,
    descKey: m.descKey,
    iconKey: m.iconKey,
    reliability: m.reliability,
    locked: isLockedByReliability(m.reliability, input.access),
  }));

  const journeys: StatsOption<JourneyFilterType>[] = [];
  journeys.push({
    value: 'all',
    labelKey: 'stats.journey.all',
    descKey: 'stats.journey.allDesc',
    iconKey: 'stack',
    reliability: 'stable',
    locked: false,
  });

  for (const j of CANONICAL_JOURNEYS) {
    journeys.push({
      value: j.id,
      labelKey: j.stats.labelKey,
      descKey: j.stats.descKey,
      iconKey: j.stats.iconKey,
      reliability: j.reliability,
      locked: isLockedByReliability(j.reliability, input.access),
      shortCode: j.stats.shortCode,
    });
  }

  for (const id of input.availableJourneyIds) {
    if (!id) continue;
    if (journeys.some((j) => j.value === id)) continue;
    journeys.push({
      value: id,
      iconKey: 'map-trifold',
      reliability: 'stable',
      locked: false,
      shortCode: undefined,
    });
  }

  const firstSelectableJourney = journeys.find((j) => !j.locked)?.value ?? 'all';
  const normalizedJourneyFilter = journeys.some((j) => j.value === input.journeyFilter)
    ? input.journeyFilter
    : firstSelectableJourney;

  const firstSelectableMode = modeOptions.find((m) => !m.locked)?.value ?? 'all';
  const normalizedMode = modeOptions.some((m) => m.value === input.mode)
    ? input.mode
    : (firstSelectableMode as ModeType);

  const effectiveGameModeId = resolveEffectiveStatsGameModeId({
    mode: normalizedMode as unknown as StatsModeFilter,
    journeyId:
      normalizedMode === 'Journey' && normalizedJourneyFilter !== 'all'
        ? (normalizedJourneyFilter as string)
        : null,
  });

  const chartsMode: ModeType = (() => {
    if (normalizedMode !== 'Journey') return normalizedMode;
    if (effectiveGameModeId === 'dualnback-classic') return 'DualnbackClassic';
    if (effectiveGameModeId === 'sim-brainworkshop') return 'BrainWorkshop';
    return 'Journey';
  })();

  const effectiveGameModeIdsForFilter =
    normalizedMode === 'Journey' || normalizedMode === 'all' || normalizedMode === 'Libre'
      ? []
      : resolveGameModeIdsForStatsMode(normalizedMode as unknown as StatsModeFilter);

  return {
    normalized: {
      mode: normalizedMode,
      journeyFilter: normalizedJourneyFilter,
    },
    options: {
      modes: modeOptions,
      journeys,
    },
    effective: {
      chartsMode,
      effectiveGameModeId,
      effectiveGameModeIdsForFilter,
    },
  };
}
