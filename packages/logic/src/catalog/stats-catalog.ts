export type Reliability = 'stable' | 'beta' | 'alpha' | 'prototype';

export interface FeatureAccess {
  readonly betaEnabled: boolean;
  readonly alphaEnabled: boolean;
  readonly prototypesEnabled?: boolean;
}

export type StatsModeFilter =
  | 'all'
  | 'DualTempo'
  | 'DualnbackClassic'
  | 'BrainWorkshop'
  | 'Gridlock'
  | 'StrobeFlex'
  | 'Ospan'
  | 'Libre'
  | 'Journey';
export type JourneyFilter = 'all' | (string & {});

export type IconKey =
  | 'stack'
  | 'map-trifold'
  | 'graduation-cap'
  | 'brain'
  | 'lightning'
  | 'map-pin'
  | 'database'
  | 'tag'
  | 'sliders'
  | 'pencil'
  | 'eye';

export interface StatsModeOption {
  readonly value: StatsModeFilter;
  readonly labelKey: string;
  readonly descKey: string;
  readonly iconKey: IconKey;
  readonly reliability: Reliability;
}

export interface GameModeMeta {
  readonly id: string;
  /** Stats filter mode that maps to this game mode (if applicable). */
  readonly statsMode: Exclude<StatsModeFilter, 'all' | 'Journey'>;
  readonly reliability: Reliability;
  readonly stats: {
    readonly labelKey: string;
    readonly descKey: string;
    readonly iconKey: IconKey;
    readonly shortCode: string;
    /** Presentation kind used by charts (tempo/place/memo/etc.) */
    readonly presentationKind: 'tempo' | 'place' | 'memo' | 'pick' | 'trace' | 'other';
  };
}

export interface JourneyMeta {
  readonly id: string;
  readonly kind: 'reference' | 'simulator' | 'custom';
  readonly reliability: Reliability;
  readonly stats: {
    readonly labelKey: string;
    readonly descKey: string;
    readonly iconKey: IconKey;
    readonly shortCode: string;
  };
  /** Simulator journeys map to a single underlying game mode for charts. */
  readonly simulatorGameModeId?: string;
}

export const CANONICAL_GAME_MODES: readonly GameModeMeta[] = [
  {
    id: 'dualnback-classic',
    statsMode: 'DualnbackClassic',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.mode.dualnbackClassic',
      descKey: 'stats.mode.dualnbackClassicDesc',
      iconKey: 'graduation-cap',
      shortCode: 'DNB',
      presentationKind: 'tempo',
    },
  },
  {
    id: 'sim-brainworkshop',
    statsMode: 'BrainWorkshop',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.mode.brainWorkshop',
      descKey: 'stats.mode.brainWorkshopDesc',
      iconKey: 'brain',
      shortCode: 'BW',
      presentationKind: 'tempo',
    },
  },
  {
    id: 'gridlock',
    statsMode: 'Gridlock',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.mode.gridlock',
      descKey: 'stats.mode.gridlockDesc',
      iconKey: 'brain',
      shortCode: 'Grid',
      presentationKind: 'other',
    },
  },
  {
    id: 'stroop-flex',
    statsMode: 'StrobeFlex',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.mode.strobeFlex',
      descKey: 'stats.mode.strobeFlexDesc',
      iconKey: 'eye',
      shortCode: 'Strobe',
      presentationKind: 'other',
    },
  },
  {
    id: 'ospan',
    statsMode: 'Ospan',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.mode.ospan',
      descKey: 'stats.mode.ospanDesc',
      iconKey: 'brain',
      shortCode: 'OSPAN',
      presentationKind: 'other',
    },
  },
] as const;

export const CANONICAL_JOURNEYS: readonly JourneyMeta[] = [
  {
    id: 'neurodual-default',
    kind: 'reference',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.journey.classic',
      descKey: 'stats.journey.classicDesc',
      iconKey: 'map-trifold',
      shortCode: 'Neurodual',
    },
  },
  {
    id: 'dualnback-classic-journey',
    kind: 'simulator',
    reliability: 'stable',
    simulatorGameModeId: 'dualnback-classic',
    stats: {
      labelKey: 'stats.journey.simJaeggi',
      descKey: 'stats.journey.simJaeggiDesc',
      iconKey: 'graduation-cap',
      shortCode: 'DNB',
    },
  },
  {
    id: 'sim-brainworkshop-journey',
    kind: 'simulator',
    reliability: 'stable',
    simulatorGameModeId: 'sim-brainworkshop',
    stats: {
      labelKey: 'stats.journey.simBrainworkshop',
      descKey: 'stats.journey.simBrainworkshopDesc',
      iconKey: 'brain',
      shortCode: 'BW',
    },
  },
] as const;

export function isVisibleByReliability(reliability: Reliability, access: FeatureAccess): boolean {
  if (reliability === 'stable') return true;
  if (reliability === 'beta') return access.betaEnabled;
  return access.alphaEnabled;
}

export function getGameModeMeta(gameModeId: string): GameModeMeta | null {
  return CANONICAL_GAME_MODES.find((m) => m.id === gameModeId) ?? null;
}

export function getJourneyMeta(journeyId: string): JourneyMeta | null {
  return CANONICAL_JOURNEYS.find((j) => j.id === journeyId) ?? null;
}

export function listStatsModeOptions(): readonly StatsModeOption[] {
  const byMode = (id: GameModeMeta['statsMode']): StatsModeOption => {
    const m = CANONICAL_GAME_MODES.find((x) => x.statsMode === id);
    if (!m) {
      return {
        value: id,
        labelKey: 'stats.mode.all',
        descKey: 'stats.mode.allDesc',
        iconKey: 'stack',
        reliability: 'stable',
      };
    }
    return {
      value: m.statsMode,
      labelKey: m.stats.labelKey,
      descKey: m.stats.descKey,
      iconKey: m.stats.iconKey,
      reliability: m.reliability,
    };
  };

  return [
    byMode('DualnbackClassic'),
    byMode('BrainWorkshop'),
    byMode('Gridlock'),
    byMode('StrobeFlex'),
    byMode('Ospan'),
    {
      value: 'Libre',
      labelKey: 'stats.mode.libre',
      descKey: 'stats.mode.libreDesc',
      iconKey: 'sliders',
      reliability: 'stable',
    },
    {
      value: 'Journey',
      labelKey: 'stats.mode.journey',
      descKey: 'stats.mode.journeyDesc',
      iconKey: 'map-trifold',
      reliability: 'stable',
    },
    {
      value: 'all',
      labelKey: 'stats.mode.all',
      descKey: 'stats.mode.allDesc',
      iconKey: 'stack',
      reliability: 'stable',
    },
  ] as const;
}

export function resolveGameModeIdsForStatsMode(mode: StatsModeFilter): readonly string[] {
  if (mode === 'all' || mode === 'Journey') return [];
  if (mode === 'Libre') return [];
  const meta = CANONICAL_GAME_MODES.find((m) => m.statsMode === mode);
  return meta ? [meta.id] : [];
}

export function resolveEffectiveStatsGameModeId(params: {
  mode: StatsModeFilter;
  journeyId: string | null | undefined;
}): string | null {
  if (params.mode === 'Journey') {
    const journeyId = params.journeyId;
    if (!journeyId) return null;
    const meta = getJourneyMeta(journeyId);
    return meta?.simulatorGameModeId ?? null;
  }

  if (params.mode === 'all' || params.mode === 'Libre') return null;
  const ids = resolveGameModeIdsForStatsMode(params.mode);
  return ids[0] ?? null;
}

export function resolvePresentationKind(params: {
  mode: StatsModeFilter;
  journeyId: string | null | undefined;
}): 'global' | GameModeMeta['stats']['presentationKind'] {
  if (params.mode === 'all' || params.mode === 'Libre') return 'global';
  if (params.mode === 'Journey') {
    const effective = resolveEffectiveStatsGameModeId(params);
    if (!effective) return 'global';
    return getGameModeMeta(effective)?.stats.presentationKind ?? 'other';
  }
  const ids = resolveGameModeIdsForStatsMode(params.mode);
  const id = ids[0];
  return id ? (getGameModeMeta(id)?.stats.presentationKind ?? 'other') : 'other';
}
