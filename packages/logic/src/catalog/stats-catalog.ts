export type Reliability = 'stable' | 'beta' | 'alpha' | 'prototype';

export interface FeatureAccess {
  readonly betaEnabled: boolean;
  readonly alphaEnabled: boolean;
  readonly prototypesEnabled?: boolean;
}

export type StatsModeFilter =
  | 'all'
  | 'DualTempo'
  | 'DualPlace'
  | 'DualMemo'
  | 'DualPick'
  | 'DualTrace'
  | 'DualTime'
  | 'CorsiBlock'
  | 'Ospan'
  | 'RunningSpan'
  | 'PASAT'
  | 'SWM'
  | 'DualTrack'
  | 'CognitiveTask'
  | 'DualnbackClassic'
  | 'BrainWorkshop'
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
    id: 'dual-catch',
    statsMode: 'DualTempo',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualCatch',
      descKey: 'stats.mode.dualCatchDesc',
      iconKey: 'lightning',
      shortCode: 'Catch',
      presentationKind: 'tempo',
    },
  },
  {
    id: 'dual-place',
    statsMode: 'DualPlace',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualPlace',
      descKey: 'stats.mode.dualPlaceDesc',
      iconKey: 'map-pin',
      shortCode: 'Place',
      presentationKind: 'place',
    },
  },
  {
    id: 'dual-memo',
    statsMode: 'DualMemo',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualMemo',
      descKey: 'stats.mode.dualMemoDesc',
      iconKey: 'database',
      shortCode: 'Memo',
      presentationKind: 'memo',
    },
  },
  {
    id: 'dual-pick',
    statsMode: 'DualPick',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualPick',
      descKey: 'stats.mode.dualPickDesc',
      iconKey: 'tag',
      shortCode: 'Pick',
      presentationKind: 'pick',
    },
  },
  {
    id: 'dual-trace',
    statsMode: 'DualTrace',
    reliability: 'beta',
    stats: {
      labelKey: 'stats.mode.dualTrace',
      descKey: 'stats.mode.dualTraceDesc',
      iconKey: 'pencil',
      shortCode: 'Trace',
      presentationKind: 'trace',
    },
  },
  {
    id: 'dual-time',
    statsMode: 'DualTime',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualTime',
      descKey: 'stats.mode.dualTimeDesc',
      iconKey: 'sliders',
      shortCode: 'Time',
      presentationKind: 'other',
    },
  },
  {
    id: 'corsi-block',
    statsMode: 'CorsiBlock',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.corsiBlock',
      descKey: 'stats.mode.corsiBlockDesc',
      iconKey: 'database',
      shortCode: 'Corsi',
      presentationKind: 'other',
    },
  },
  {
    id: 'ospan',
    statsMode: 'Ospan',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.ospan',
      descKey: 'stats.mode.ospanDesc',
      iconKey: 'brain',
      shortCode: 'OSPAN',
      presentationKind: 'other',
    },
  },
  {
    id: 'running-span',
    statsMode: 'RunningSpan',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.runningSpan',
      descKey: 'stats.mode.runningSpanDesc',
      iconKey: 'brain',
      shortCode: 'RSPAN',
      presentationKind: 'other',
    },
  },
  {
    id: 'pasat',
    statsMode: 'PASAT',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.pasat',
      descKey: 'stats.mode.pasatDesc',
      iconKey: 'brain',
      shortCode: 'PASAT',
      presentationKind: 'other',
    },
  },
  {
    id: 'swm',
    statsMode: 'SWM',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.swm',
      descKey: 'stats.mode.swmDesc',
      iconKey: 'brain',
      shortCode: 'SWM',
      presentationKind: 'other',
    },
  },
  {
    id: 'dual-track',
    statsMode: 'DualTrack',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.dualTrack',
      descKey: 'stats.mode.dualTrackDesc',
      iconKey: 'eye',
      shortCode: 'Track',
      presentationKind: 'other',
    },
  },
  {
    id: 'cognitive-task',
    statsMode: 'CognitiveTask',
    reliability: 'alpha',
    stats: {
      labelKey: 'stats.mode.cognitiveTask',
      descKey: 'stats.mode.cognitiveTaskDesc',
      iconKey: 'brain',
      shortCode: 'CogTask',
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
  {
    id: 'dual-track-dnb-journey',
    kind: 'simulator',
    reliability: 'stable',
    stats: {
      labelKey: 'stats.journey.dualTrackDnbHybrid',
      descKey: 'stats.journey.dualTrackDnbHybridDesc',
      iconKey: 'eye',
      shortCode: 'Track+DNB',
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
    byMode('DualTempo'),
    byMode('DualPlace'),
    byMode('DualMemo'),
    byMode('DualPick'),
    byMode('DualTrace'),
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
