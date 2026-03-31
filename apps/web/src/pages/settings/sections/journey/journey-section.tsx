/**
 * Journey settings section - full journey management
 *
 * Design: Matches Home page patterns (Code Design / Minimalisme Technique)
 */

import { lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SuspenseFade } from '../../../../components/suspense-fade';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useNavigate, useParams } from 'react-router';
import { CaretRight, Check, PencilSimple, Plus, Star, Trash } from '@phosphor-icons/react';
import { SettingsSegmentedControl } from '../../components/settings-segmented-control';
import {
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_MAX_LEVEL,
  resolveDualTrackJourneyPreset,
  resolveJourneyPresentation,
} from '@neurodual/logic';
import {
  InfoSheet,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
  useJourneyStateWithContext,
} from '@neurodual/ui';
import {
  FREE_TRAINING_RECOMMENDED_PRESET_ID,
  FREE_TRAINING_DEFAULT_PRESET_ID,
  FREE_TRAINING_QUAD_PRESET_ID,
  FREE_TRAINING_TRI_PRESET_ID,
  JOURNEY_DEFAULT_PRESET_ID,
  JOURNEY_RECOMMENDED_PRESET_ID,
  useSettingsStore,
  type FreeTrainingPreset,
  type SavedJourney,
} from '../../../../stores';
import {
  getReliabilityForGameMode,
  type ReliabilityLevel,
} from '../../../../stores/settings-store';
import { useAlphaEnabled, useBetaEnabled } from '../../../../hooks/use-beta-features';
import { resolveConcreteJourneySessionMode } from '../../../../lib/journey-session-mode';
import { nonAuthInputProps } from '../../../../utils/non-auth-input-props';
import { GAME_MODES, type GameMode } from '../../config';
import { getModeSettingsNavigation } from '../mode/mode-settings-navigation';
import { JourneyPresetSelector } from '../mode/journey-preset-selector';

const ModeSettingsPanelLazy = lazy(() =>
  import('../mode/mode-settings-panel').then((m) => {
    if (!m.ModeSettingsPanel) throw new Error('Chunk stale: ModeSettingsPanel export missing');
    return { default: m.ModeSettingsPanel };
  }),
);

const EMPTY_PRESETS: readonly FreeTrainingPreset[] = [];
const MODE_ICON_BY_ID = new Map(GAME_MODES.map((mode) => [mode.value, mode.icon]));

function resolvePresentationText(
  t: TFunction,
  text: ReturnType<typeof resolveJourneyPresentation>['title'],
): string {
  if (!text.key) return text.defaultValue;
  return t(text.key, {
    ...(text.values ?? {}),
    defaultValue: text.defaultValue,
  });
}

function getJourneyModeLabel(t: TFunction, journey: SavedJourney) {
  return resolvePresentationText(
    t,
    resolveJourneyPresentation({
      gameMode: journey.gameMode,
      strategyConfig: journey.strategyConfig,
    }).title,
  );
}

function getJourneyTotalStages(journey: SavedJourney): number {
  return (journey.targetLevel - journey.startLevel + 1) * (journey.gameMode ? 1 : 4);
}

function getJourneyIcon(journey: SavedJourney) {
  const modeId =
    resolveJourneyPresentation({
      gameMode: journey.gameMode,
      strategyConfig: journey.strategyConfig,
    }).iconModeIds[0] ??
    journey.gameMode ??
    'dualnback-classic';
  return MODE_ICON_BY_ID.get(modeId as GameMode);
}

function getDualTrackDifficultyLabel(t: TFunction, preset: 'easy' | 'medium' | 'hard'): string {
  switch (preset) {
    case 'easy':
      return t('journey.preset.easy', 'Easy');
    case 'medium':
      return t('journey.preset.medium', 'Recommended');
    case 'hard':
      return t('journey.preset.hard', 'Hard');
  }
}

function JourneyProgressBar({ current, total }: { current: number; total: number }): ReactNode {
  const pct = total > 0 ? Math.min(current / total, 1) * 100 : 0;
  return (
    <div className="w-full h-1 bg-muted/30">
      {pct > 0 ? (
        <div
          className="h-full rounded-r-full bg-[hsl(var(--woven-correct))]"
          style={{ width: `${pct}%`, opacity: 0.14 }}
        />
      ) : null}
    </div>
  );
}

function FeaturedJourneyCard({
  journey,
  title,
  subtitle,
  meta,
  progressCurrent,
  progressTotal,
  isSelected,
  isFavorite,
  onClick,
  onToggleFavorite,
}: {
  journey: SavedJourney;
  title: string;
  subtitle: string;
  meta: string;
  progressCurrent: number;
  progressTotal: number;
  isSelected: boolean;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}): ReactNode {
  const Icon = getJourneyIcon(journey);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`w-full overflow-hidden rounded-2xl text-left transition-colors ${
          isSelected
            ? 'border-2 border-primary/50 bg-card/85 backdrop-blur-lg ring-1 ring-primary/20 shadow-sm'
            : 'border border-border/50 bg-card/60 backdrop-blur-lg hover:border-primary/20 active:bg-secondary/40'
        }`}
      >
        <div className="flex items-start gap-3 p-3.5 pb-2.5 pe-12">
          <span className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
            {Icon ? <Icon size={18} weight="duotone" /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
              {isSelected ? (
                <Check size={14} weight="bold" className="shrink-0 text-primary" />
              ) : null}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <JourneyProgressBar current={progressCurrent} total={progressTotal} />
        <div className="px-3.5 py-2 text-[11px] font-medium text-muted-foreground">{meta}</div>
      </button>

      <div className="pointer-events-none absolute end-2 top-2 z-10 flex items-center">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
        >
          <Star
            size={15}
            weight={isFavorite ? 'fill' : 'regular'}
            className={isFavorite ? 'text-amber-500' : 'text-muted-foreground'}
          />
        </button>
      </div>
    </div>
  );
}

function CompactJourneyCard({
  journey,
  title,
  subtitle,
  isSelected,
  isFavorite,
  onClick,
  onToggleFavorite,
}: {
  journey: SavedJourney;
  title: string;
  subtitle: string;
  isSelected: boolean;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}): ReactNode {
  const Icon = getJourneyIcon(journey);
  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onClick}
        className={`h-full w-full rounded-xl text-left transition-colors ${
          isSelected
            ? 'border-2 border-primary/50 bg-card/85 backdrop-blur-lg ring-1 ring-primary/20 shadow-sm'
            : 'border border-border/50 bg-card/60 backdrop-blur-lg hover:border-primary/20 active:bg-secondary/40'
        }`}
      >
        <div className="flex h-full flex-col p-2.5 pe-9">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              {Icon ? <Icon size={14} weight="duotone" /> : null}
            </span>
            {isSelected ? <Check size={12} weight="bold" className="text-primary" /> : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{title}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>
      </button>

      <div className="pointer-events-none absolute end-1 top-1 z-10 flex items-center">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
        >
          <Star
            size={13}
            weight={isFavorite ? 'fill' : 'regular'}
            className={isFavorite ? 'text-amber-500' : 'text-muted-foreground'}
          />
        </button>
      </div>
    </div>
  );
}

export function JourneySection(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subSection } = useParams<{ subSection?: string }>();
  const { state: journeyState } = useJourneyStateWithContext();
  const alphaEnabled = useAlphaEnabled();
  const betaEnabled = useBetaEnabled();

  // Journey management from store
  const savedJourneys = useSettingsStore((s) => s.savedJourneys);
  const activeJourneyId = useSettingsStore((s) => s.ui.activeJourneyId);
  const createJourney = useSettingsStore((s) => s.createJourney);
  const renameJourney = useSettingsStore((s) => s.renameJourney);
  const favoriteJourneyIds = useSettingsStore((s) => s.ui.favoriteJourneyIds);
  const ensureFreeTrainingDefaultPreset = useSettingsStore(
    (s) => s.ensureFreeTrainingDefaultPreset,
  );
  const applyJourneyModeSettingsFromFreeTrainingProfile = useSettingsStore(
    (s) => s.applyJourneyModeSettingsFromFreeTrainingProfile,
  );
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const toggleFavoriteJourney = useSettingsStore((s) => s.toggleFavoriteJourney);
  const deleteJourney = useSettingsStore((s) => s.deleteJourney);
  const setJourneyStrategyConfig = useSettingsStore((s) => s.setJourneyStrategyConfig);
  const brainWorkshopFreeTrainingPresets = useSettingsStore(
    (s) => s.ui.freeTrainingPresetsByMode['sim-brainworkshop'] ?? EMPTY_PRESETS,
  );
  const dualTraceFreeTrainingPresets = useSettingsStore(
    (s) => s.ui.freeTrainingPresetsByMode['dual-trace'] ?? EMPTY_PRESETS,
  );

  // UI State
  const [createJourneyOpen, setCreateJourneyOpen] = useState(false);
  const [newJourneyName, setNewJourneyName] = useState('');
  const [newJourneyStart, setNewJourneyStart] = useState(JOURNEY_DEFAULT_START_LEVEL);
  const [newJourneyTarget, setNewJourneyTarget] = useState(JOURNEY_DEFAULT_TARGET_LEVEL);
  const [newJourneyMode, setNewJourneyMode] = useState<string>('dualnback-classic');
  const [newJourneyProfilePresetId, setNewJourneyProfilePresetId] = useState<string>(
    FREE_TRAINING_DEFAULT_PRESET_ID,
  );
  const [journeyToDelete, setJourneyToDelete] = useState<SavedJourney | null>(null);
  const [journeyToRename, setJourneyToRename] = useState<SavedJourney | null>(null);
  const [renameJourneyName, setRenameJourneyName] = useState('');
  const page = useMemo(() => {
    if (!subSection) return 'root';
    if (
      subSection === 'journeys' ||
      subSection === 'profiles' ||
      subSection === 'base' ||
      subSection === 'tempo' ||
      subSection === 'generator' ||
      subSection === 'advanced'
    ) {
      return subSection;
    }
    return 'root';
  }, [subSection]);

  // Get active journey
  const activeJourney = savedJourneys.find((j) => j.id === activeJourneyId);
  const getJourneyDisplayName = (journey: SavedJourney): string =>
    journey.nameKey ? t(journey.nameKey, journey.name) : journey.name;
  const getReliability = (journey: SavedJourney): ReliabilityLevel =>
    journey.reliability ?? getReliabilityForGameMode(journey.gameMode);
  const isReliabilityVisible = (reliability: ReliabilityLevel) => {
    if (reliability === 'prototype') return false;
    if (reliability === 'alpha') return alphaEnabled;
    if (reliability === 'beta') return betaEnabled;
    return true;
  };
  const visibleJourneys = savedJourneys.filter((journey) =>
    isReliabilityVisible(getReliability(journey)),
  );
  const reliabilityOrder: Record<ReliabilityLevel, number> = {
    stable: 0,
    beta: 1,
    alpha: 2,
    prototype: 3,
  };
  const sortedVisibleJourneys = useMemo(
    () =>
      [...visibleJourneys].sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        const rel = reliabilityOrder[getReliability(a)] - reliabilityOrder[getReliability(b)];
        if (rel !== 0) return rel;
        const created = (b.createdAt ?? 0) - (a.createdAt ?? 0);
        if (created !== 0) return created;
        return getJourneyDisplayName(a).localeCompare(getJourneyDisplayName(b));
      }),
    [visibleJourneys, t],
  );
  const favoriteJourneySet = new Set(favoriteJourneyIds ?? []);
  const selectedJourneyForList = activeJourneyId
    ? (visibleJourneys.find((j) => j.id === activeJourneyId) ?? null)
    : null;
  const canDeleteSelectedJourney = Boolean(
    selectedJourneyForList && !selectedJourneyForList.isDefault,
  );
  const canRenameSelectedJourney = canDeleteSelectedJourney;
  const canConfigureJourney =
    activeJourney?.gameMode === 'dual-track' ||
    activeJourney?.gameMode === 'sim-brainworkshop' ||
    activeJourney?.gameMode === 'dual-trace' ||
    activeJourney?.gameMode === 'dual-track-dnb-hybrid';
  const journeySettingsReadOnly = false;
  const isBw = activeJourney?.gameMode === 'sim-brainworkshop';
  const isDualTrace = activeJourney?.gameMode === 'dual-trace';
  const journeySettingsMode: GameMode | null = useMemo(() => {
    if (!activeJourney?.gameMode) return null;

    if (activeJourney.gameMode === 'dual-track-dnb-hybrid') {
      const concreteMode = resolveConcreteJourneySessionMode({
        journeyGameModeId: activeJourney.gameMode,
        nextSessionGameModeId: journeyState?.nextSessionGameMode,
        fallbackModeId: 'dual-track',
      });
      return concreteMode === 'dual-track' || concreteMode === 'dualnback-classic'
        ? concreteMode
        : 'dual-track';
    }

    if (activeJourney.gameMode === 'sim-brainworkshop' || activeJourney.gameMode === 'dual-trace') {
      return activeJourney.gameMode as GameMode;
    }

    return null;
  }, [activeJourney?.gameMode, journeyState?.nextSessionGameMode]);

  const journeyPresetsByJourneyId = useSettingsStore((s) => s.ui.journeyPresetsByJourneyId);
  const journeyActivePresetIdByJourneyId = useSettingsStore(
    (s) => s.ui.journeyActivePresetIdByJourneyId,
  );
  const activeJourneyPresetId = activeJourneyId
    ? journeyActivePresetIdByJourneyId[activeJourneyId]
    : undefined;
  const selectedJourneyProfileId = activeJourneyPresetId ?? JOURNEY_DEFAULT_PRESET_ID;
  const activeJourneyProfileLabel = useMemo(() => {
    if (!activeJourneyId) return t('journey.setup.profileNone');
    if (activeJourney?.gameMode === 'dual-track') {
      return getDualTrackDifficultyLabel(
        t,
        resolveDualTrackJourneyPreset({
          gameMode: activeJourney.gameMode,
          strategyConfig: activeJourney.strategyConfig,
        }),
      );
    }
    if (selectedJourneyProfileId === JOURNEY_RECOMMENDED_PRESET_ID)
      return t('settings.presets.recommended');
    if (selectedJourneyProfileId === JOURNEY_DEFAULT_PRESET_ID)
      return isBw ? t('journey.presets.currentSlot') : t('settings.presets.default');

    if (activeJourney?.gameMode === 'sim-brainworkshop') {
      if (selectedJourneyProfileId === FREE_TRAINING_RECOMMENDED_PRESET_ID)
        return t('settings.presets.dualNBack');
      if (selectedJourneyProfileId === FREE_TRAINING_TRI_PRESET_ID)
        return t('settings.presets.tri');
      if (selectedJourneyProfileId === FREE_TRAINING_QUAD_PRESET_ID)
        return t('settings.presets.quad');
      if (selectedJourneyProfileId === FREE_TRAINING_DEFAULT_PRESET_ID)
        return t('settings.presets.default');
      const match = brainWorkshopFreeTrainingPresets.find((p) => p.id === selectedJourneyProfileId);
      return match?.name ?? t('settings.presets.default');
    }

    if (activeJourney?.gameMode === 'dual-trace') {
      if (selectedJourneyProfileId === FREE_TRAINING_RECOMMENDED_PRESET_ID)
        return t('settings.presets.recommended');
      if (selectedJourneyProfileId === FREE_TRAINING_DEFAULT_PRESET_ID)
        return t('settings.presets.default');
      const match = dualTraceFreeTrainingPresets.find((p) => p.id === selectedJourneyProfileId);
      return match?.name ?? t('settings.presets.default');
    }

    const presets = journeyPresetsByJourneyId[activeJourneyId] ?? [];
    const match = presets.find((p) => p.id === selectedJourneyProfileId);
    return match?.name ?? t('settings.presets.default');
  }, [
    activeJourney?.gameMode,
    activeJourney?.strategyConfig,
    activeJourneyId,
    brainWorkshopFreeTrainingPresets,
    dualTraceFreeTrainingPresets,
    isBw,
    journeyPresetsByJourneyId,
    selectedJourneyProfileId,
    t,
  ]);

  const activeJourneyProfileViewLabel = useMemo(() => {
    if (!activeJourneyId) return t('journey.setup.profileNone');
    if (activeJourney?.gameMode === 'dual-track') {
      return getDualTrackDifficultyLabel(
        t,
        resolveDualTrackJourneyPreset({
          gameMode: activeJourney.gameMode,
          strategyConfig: activeJourney.strategyConfig,
        }),
      );
    }
    if (selectedJourneyProfileId === JOURNEY_RECOMMENDED_PRESET_ID)
      return t('settings.presets.recommended');
    if (selectedJourneyProfileId === JOURNEY_DEFAULT_PRESET_ID)
      return isBw
        ? t('journey.presets.currentSlotView', t('journey.presets.currentSlot'))
        : t('settings.presets.default');

    if (activeJourney?.gameMode === 'sim-brainworkshop') {
      if (selectedJourneyProfileId === FREE_TRAINING_RECOMMENDED_PRESET_ID)
        return t('settings.presets.dualNBack');
      if (selectedJourneyProfileId === FREE_TRAINING_TRI_PRESET_ID)
        return t('settings.presets.tri');
      if (selectedJourneyProfileId === FREE_TRAINING_QUAD_PRESET_ID)
        return t('settings.presets.quad');
      if (selectedJourneyProfileId === FREE_TRAINING_DEFAULT_PRESET_ID)
        return t('settings.presets.default');
      const match = brainWorkshopFreeTrainingPresets.find((p) => p.id === selectedJourneyProfileId);
      return match?.name ?? t('settings.presets.default');
    }

    if (activeJourney?.gameMode === 'dual-trace') {
      if (selectedJourneyProfileId === FREE_TRAINING_RECOMMENDED_PRESET_ID)
        return t('settings.presets.recommended');
      if (selectedJourneyProfileId === FREE_TRAINING_DEFAULT_PRESET_ID)
        return t('settings.presets.default');
      const match = dualTraceFreeTrainingPresets.find((p) => p.id === selectedJourneyProfileId);
      return match?.name ?? t('settings.presets.default');
    }

    const presets = journeyPresetsByJourneyId[activeJourneyId] ?? [];
    const match = presets.find((p) => p.id === selectedJourneyProfileId);
    return match?.name ?? t('settings.presets.default');
  }, [
    activeJourney?.gameMode,
    activeJourney?.strategyConfig,
    activeJourneyId,
    brainWorkshopFreeTrainingPresets,
    dualTraceFreeTrainingPresets,
    isBw,
    journeyPresetsByJourneyId,
    selectedJourneyProfileId,
    t,
  ]);

  useEffect(() => {
    ensureFreeTrainingDefaultPreset('sim-brainworkshop');
    ensureFreeTrainingDefaultPreset('dual-trace');
  }, [ensureFreeTrainingDefaultPreset]);

  useEffect(() => {
    if (subSection && page === 'root') {
      navigate('/settings/journey', { replace: true });
    }
  }, [navigate, page, subSection]);

  useEffect(() => {
    const canOpenJourneyConfigPage = Boolean(canConfigureJourney && journeySettingsMode);
    const isConfigPage =
      page === 'profiles' ||
      page === 'base' ||
      page === 'tempo' ||
      page === 'generator' ||
      page === 'advanced';
    const canStayOnPage = page === 'profiles' ? canConfigureJourney : canOpenJourneyConfigPage;
    if (isConfigPage && !canStayOnPage) {
      navigate('/settings/journey', { replace: true });
    }
  }, [canConfigureJourney, journeySettingsMode, navigate, page]);

  const resetCreateJourneyForm = () => {
    setNewJourneyName('');
    setNewJourneyStart(JOURNEY_DEFAULT_START_LEVEL);
    setNewJourneyTarget(JOURNEY_DEFAULT_TARGET_LEVEL);
    setNewJourneyMode('dualnback-classic');
    setNewJourneyProfilePresetId(FREE_TRAINING_DEFAULT_PRESET_ID);
  };

  const handleCreateJourney = () => {
    const name = newJourneyName.trim() || t('journey.defaultCustomName', 'My journey');
    const journeyId = createJourney(name, newJourneyStart, newJourneyTarget, newJourneyMode);

    if (newJourneyMode === 'sim-brainworkshop' || newJourneyMode === 'dual-trace') {
      applyJourneyModeSettingsFromFreeTrainingProfile(
        journeyId,
        newJourneyMode as 'sim-brainworkshop' | 'dual-trace',
        newJourneyProfilePresetId,
      );
    }
    setCreateJourneyOpen(false);
    resetCreateJourneyForm();
    toast.success(t('journey.created', 'Journey created.'));
  };

  const handleDeleteJourney = () => {
    if (!journeyToDelete) return;
    deleteJourney(journeyToDelete.id);
    setJourneyToDelete(null);
    toast.success(t('journey.deleted', 'Journey deleted.'));
  };

  const handleRenameJourney = () => {
    if (!journeyToRename) return;
    const nextName = renameJourneyName.trim();
    if (!nextName) return;
    renameJourney(journeyToRename.id, nextName);
    setJourneyToRename(null);
    setRenameJourneyName('');
    toast.success(t('journey.renamed', 'Journey renamed.'));
  };

  const isDualTrackResolved = journeySettingsMode === 'dual-track';
  const hasTempo = isBw || isDualTrace || isDualTrackResolved;
  const hasGenerator = isBw;
  const hasAdvanced = isBw || isDualTrace;
  const navCopy = useMemo(
    () => (journeySettingsMode ? getModeSettingsNavigation(journeySettingsMode) : null),
    [journeySettingsMode],
  );
  const currentJourneyProgress = activeJourney
    ? Math.max(0, (journeyState?.currentStage ?? 1) - 1)
    : 0;
  const favoriteJourneys = sortedVisibleJourneys.filter(
    (journey) => journey.id !== activeJourneyId && favoriteJourneySet.has(journey.id),
  );
  const remainingJourneys = sortedVisibleJourneys.filter(
    (journey) => journey.id !== activeJourneyId && !favoriteJourneySet.has(journey.id),
  );

  if (page === 'base' || page === 'tempo' || page === 'generator' || page === 'advanced') {
    if (!activeJourney || !canConfigureJourney || !journeySettingsMode) return null;

    return (
      <div className="space-y-6">
        <SuspenseFade fallback={<div className="h-32 rounded-2xl skeleton-breathe" />}>
          <ModeSettingsPanelLazy
            mode={journeySettingsMode}
            scopeOverride="journey"
            showPresets={false}
            forcedTab={page as 'base' | 'tempo' | 'generator' | 'advanced'}
            readOnly={journeySettingsReadOnly}
          />
        </SuspenseFade>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {page === 'journeys' ? (
          <Section>
            <div className="space-y-6">
              {activeJourney ? (
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('journey.current', 'Current journey')}
                  </h3>
                  <FeaturedJourneyCard
                    journey={activeJourney}
                    title={getJourneyDisplayName(activeJourney)}
                    subtitle={getJourneyModeLabel(t, activeJourney)}
                    meta={`N-${activeJourney.startLevel} → N-${activeJourney.targetLevel} • ${currentJourneyProgress}/${getJourneyTotalStages(activeJourney)} ${t('journey.stagesShort')}`}
                    progressCurrent={currentJourneyProgress}
                    progressTotal={getJourneyTotalStages(activeJourney)}
                    isSelected={true}
                    isFavorite={favoriteJourneySet.has(activeJourney.id)}
                    onClick={() => activateJourney(activeJourney.id)}
                    onToggleFavorite={() => toggleFavoriteJourney(activeJourney.id)}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    {canRenameSelectedJourney && selectedJourneyForList ? (
                      <button
                        type="button"
                        onClick={() => {
                          setJourneyToRename(selectedJourneyForList);
                          setRenameJourneyName(selectedJourneyForList.name);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/40 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                      >
                        <PencilSimple size={12} weight="bold" />
                        <span>{t('common.rename')}</span>
                      </button>
                    ) : null}

                    {canDeleteSelectedJourney && selectedJourneyForList ? (
                      <button
                        type="button"
                        onClick={() => setJourneyToDelete(selectedJourneyForList)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-xs font-bold uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash size={12} weight="bold" />
                        <span>{t('common.delete')}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {favoriteJourneys.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('settings.gameMode.selection', 'Favorites')}
                  </h3>
                  <div className="space-y-2">
                    {favoriteJourneys.map((journey) => (
                      <FeaturedJourneyCard
                        key={journey.id}
                        journey={journey}
                        title={getJourneyDisplayName(journey)}
                        subtitle={getJourneyModeLabel(t, journey)}
                        meta={`N-${journey.startLevel} → N-${journey.targetLevel} • ${getJourneyTotalStages(journey)} ${t('journey.stagesShort')}`}
                        progressCurrent={0}
                        progressTotal={getJourneyTotalStages(journey)}
                        isSelected={journey.id === activeJourneyId}
                        isFavorite={true}
                        onClick={() => activateJourney(journey.id)}
                        onToggleFavorite={() => toggleFavoriteJourney(journey.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('journey.setup.title', 'Selection')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCreateJourneyOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/40 px-3 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:bg-muted/30"
                  >
                    <Plus size={12} weight="bold" />
                    <span>{t('journey.new')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateJourneyOpen(true)}
                    className="flex min-h-[124px] flex-col items-start justify-between rounded-xl border border-dashed border-border/60 bg-card/60 p-2.5 text-left transition-colors hover:border-primary/35 hover:bg-card/60"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Plus size={16} weight="bold" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {t('journey.createNew', 'New journey')}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                        {t('journey.new', 'Create a new journey')}
                      </p>
                    </div>
                  </button>

                  {remainingJourneys.map((journey) => {
                    const totalStages = getJourneyTotalStages(journey);
                    const reliability = getReliability(journey);
                    const reliabilityLabel =
                      reliability === 'alpha'
                        ? ' • Alpha'
                        : reliability === 'beta'
                          ? ` • ${t('journey.badge.beta')}`
                          : '';
                    return (
                      <CompactJourneyCard
                        key={journey.id}
                        journey={journey}
                        title={getJourneyDisplayName(journey)}
                        subtitle={`${getJourneyModeLabel(t, journey)} • N-${journey.startLevel} → N-${journey.targetLevel} • ${totalStages} ${t('journey.stagesShort')}${reliabilityLabel}`}
                        isSelected={journey.id === activeJourneyId}
                        isFavorite={favoriteJourneySet.has(journey.id)}
                        onClick={() => activateJourney(journey.id)}
                        onToggleFavorite={() => toggleFavoriteJourney(journey.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>
        ) : page === 'profiles' ? (
          activeJourney ? (
            <Section
              title={
                activeJourney.gameMode === 'dual-track'
                  ? t('settings.tangram.difficulty', 'Difficulty')
                  : t('settings.presets.title')
              }
              action={
                journeySettingsReadOnly ? (
                  <InfoSheet
                    iconSize={14}
                    title={
                      activeJourney.gameMode === 'dual-track'
                        ? t('settings.tangram.difficulty', 'Difficulty')
                        : t('settings.presets.title')
                    }
                  >
                    {t('settings.freeTrainingCards.presetViewInfo')}
                  </InfoSheet>
                ) : null
              }
            >
              <div className="surface-card-typography w-full bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-4">
                {journeySettingsReadOnly ? (
                  <div className="text-sm text-muted-foreground">
                    {t('settings.freeTrainingCards.presetViewInfo')}
                  </div>
                ) : activeJourney.gameMode === 'sim-brainworkshop' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {t('settings.presets.title')}
                    </p>
                    <Select
                      value={selectedJourneyProfileId}
                      onValueChange={(value) => {
                        applyJourneyModeSettingsFromFreeTrainingProfile(
                          activeJourney.id,
                          'sim-brainworkshop',
                          value,
                        );
                      }}
                    >
                      <SelectTrigger className="w-full min-h-11 h-auto">
                        <SelectValue placeholder={t('settings.presets.default')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FREE_TRAINING_RECOMMENDED_PRESET_ID}>
                          {t('settings.presets.dualNBack')}
                        </SelectItem>
                        <SelectItem value={FREE_TRAINING_TRI_PRESET_ID}>
                          {t('settings.presets.tri')}
                        </SelectItem>
                        <SelectItem value={FREE_TRAINING_QUAD_PRESET_ID}>
                          {t('settings.presets.quad')}
                        </SelectItem>
                        <SelectItem value={FREE_TRAINING_DEFAULT_PRESET_ID}>
                          {t('settings.presets.default')}
                        </SelectItem>
                        {brainWorkshopFreeTrainingPresets
                          .filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : activeJourney.gameMode === 'dual-trace' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {t('settings.presets.title')}
                    </p>
                    <Select
                      value={selectedJourneyProfileId}
                      onValueChange={(value) => {
                        applyJourneyModeSettingsFromFreeTrainingProfile(
                          activeJourney.id,
                          'dual-trace',
                          value,
                        );
                      }}
                    >
                      <SelectTrigger className="w-full min-h-11 h-auto">
                        <SelectValue placeholder={t('settings.presets.default')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FREE_TRAINING_RECOMMENDED_PRESET_ID}>
                          {t('settings.presets.recommended')}
                        </SelectItem>
                        <SelectItem value={FREE_TRAINING_DEFAULT_PRESET_ID}>
                          {t('settings.presets.default')}
                        </SelectItem>
                        {dualTraceFreeTrainingPresets
                          .filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : activeJourney.gameMode === 'dual-track' ? (
                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {t('settings.tangram.difficulty', 'Difficulty')}
                      </div>
                    </div>
                    <SettingsSegmentedControl
                      value={
                        resolveDualTrackJourneyPreset({
                          gameMode: activeJourney.gameMode,
                          strategyConfig: activeJourney.strategyConfig,
                        }) ?? 'medium'
                      }
                      options={[
                        { value: 'easy', label: t('journey.preset.easy', 'Easy') },
                        { value: 'medium', label: t('journey.preset.medium', 'Recommended') },
                        { value: 'hard', label: t('journey.preset.hard', 'Hard') },
                      ]}
                      onChange={(preset) =>
                        setJourneyStrategyConfig(activeJourney.id, {
                          ...(activeJourney.strategyConfig ?? {}),
                          dualTrack: {
                            ...(activeJourney.strategyConfig?.dualTrack ?? {}),
                            preset,
                          },
                        })
                      }
                      className="shrink-0"
                    />
                  </div>
                ) : (
                  <JourneyPresetSelector
                    journeyId={activeJourney.id}
                    mode={journeySettingsMode ?? 'dual-track'}
                  />
                )}
              </div>
            </Section>
          ) : null
        ) : (
          <>
            <Section title={t('journey.setup.title')}>
              <div className="surface-card-typography w-full bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl">
                <div className="divide-y divide-border px-4">
                  <button
                    type="button"
                    onClick={() => navigate('/settings/journey/journeys')}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">{t('journey.setup.journey')}</div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                        {activeJourney
                          ? getJourneyDisplayName(activeJourney)
                          : t('journey.setup.journeyNone')}
                      </div>
                    </div>
                    <CaretRight
                      size={16}
                      weight="bold"
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>

                  {activeJourney?.gameMode !== 'dualnback-classic' ? (
                    <button
                      type="button"
                      onClick={() => navigate('/settings/journey/profiles')}
                      disabled={!activeJourney || !canConfigureJourney || journeySettingsReadOnly}
                      className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-foreground">
                          {activeJourney?.gameMode === 'dual-track'
                            ? t('settings.tangram.difficulty', 'Difficulty')
                            : t('journey.setup.profile')}
                        </div>
                        <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                          {activeJourney
                            ? activeJourneyProfileLabel
                            : t('journey.setup.profileNone')}
                        </div>
                      </div>
                      <CaretRight
                        size={16}
                        weight="bold"
                        className="shrink-0 text-muted-foreground"
                      />
                    </button>
                  ) : null}
                </div>
              </div>
            </Section>

            {activeJourney && journeySettingsMode ? (
              <Section
                title={t('settings.freeTrainingCards.presetViewTitle', {
                  preset: activeJourneyProfileViewLabel,
                })}
                action={
                  journeySettingsReadOnly ? (
                    <InfoSheet iconSize={14} title={t('settings.presets.title')}>
                      {t('settings.freeTrainingCards.presetViewInfo')}
                    </InfoSheet>
                  ) : null
                }
              >
                <div className="surface-card-typography w-full bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl">
                  <div className="divide-y divide-border px-4">
                    <button
                      type="button"
                      onClick={() => navigate('/settings/journey/base')}
                      className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-foreground">
                          {t(
                            navCopy?.base.title ?? 'settings.config.main',
                            navCopy?.base.titleDefault ?? '',
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                          {t(
                            navCopy?.base.subtitle ?? 'settings.freeTrainingCards.baseSubtitle',
                            navCopy?.base.subtitleDefault ?? '',
                          )}
                        </div>
                      </div>
                      <CaretRight
                        size={16}
                        weight="bold"
                        className="shrink-0 text-muted-foreground"
                      />
                    </button>

                    {hasTempo ? (
                      <button
                        type="button"
                        onClick={() => navigate('/settings/journey/tempo')}
                        className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground">
                            {t(
                              navCopy?.tempo.title ?? 'settings.brainworkshop.tempo',
                              navCopy?.tempo.titleDefault ?? '',
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {t(
                              navCopy?.tempo.subtitle ?? 'settings.freeTrainingCards.tempoSubtitle',
                              navCopy?.tempo.subtitleDefault ?? '',
                            )}
                          </div>
                        </div>
                        <CaretRight
                          size={16}
                          weight="bold"
                          className="shrink-0 text-muted-foreground"
                        />
                      </button>
                    ) : null}

                    {hasGenerator ? (
                      <button
                        type="button"
                        onClick={() => navigate('/settings/journey/generator')}
                        className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground">
                            {t(
                              navCopy?.generator.title ?? 'settings.brainworkshop.generator',
                              navCopy?.generator.titleDefault ?? '',
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {t(
                              navCopy?.generator.subtitle ??
                                'settings.freeTrainingCards.generatorSubtitle',
                              navCopy?.generator.subtitleDefault ?? '',
                            )}
                          </div>
                        </div>
                        <CaretRight
                          size={16}
                          weight="bold"
                          className="shrink-0 text-muted-foreground"
                        />
                      </button>
                    ) : null}

                    {hasAdvanced ? (
                      <button
                        type="button"
                        onClick={() => navigate('/settings/journey/advanced')}
                        className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground">
                            {t(
                              navCopy?.advanced.title ?? 'settings.config.advanced',
                              navCopy?.advanced.titleDefault ?? '',
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {t(
                              navCopy?.advanced.subtitle ??
                                'settings.freeTrainingCards.advancedSubtitle',
                              navCopy?.advanced.subtitleDefault ?? '',
                            )}
                          </div>
                        </div>
                        <CaretRight
                          size={16}
                          weight="bold"
                          className="shrink-0 text-muted-foreground"
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              </Section>
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={createJourneyOpen}
        onOpenChange={(open) => {
          setCreateJourneyOpen(open);
          if (!open) resetCreateJourneyForm();
        }}
      >
        <DialogContent closeAriaLabel={t('common.close')} className="w-[min(92vw,34rem)]">
          <div className="surface-card-typography space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base">{t('journey.createNew')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="journey-name"
                  className="text-3xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {t('journey.name')}
                </label>
                <input
                  id="journey-name"
                  type="text"
                  value={newJourneyName}
                  onChange={(e) => setNewJourneyName(e.target.value)}
                  placeholder={t('journey.namePlaceholder')}
                  className="w-full h-11 px-3 text-sm bg-surface border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/40"
                  {...nonAuthInputProps}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t('journey.mode')}
                </label>
                <Select
                  value={newJourneyMode}
                  onValueChange={(v) => {
                    setNewJourneyMode(v);
                    if (v !== 'sim-brainworkshop') {
                      setNewJourneyProfilePresetId(FREE_TRAINING_DEFAULT_PRESET_ID);
                    }
                  }}
                >
                  <SelectTrigger className="w-full h-11 border-border bg-surface text-sm rounded-xl shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="dualnback-classic" className="text-sm">
                      {t('settings.gameMode.dualnbackClassic')}
                    </SelectItem>
                    {alphaEnabled ? (
                      <SelectItem value="dual-catch" className="text-sm">
                        {t('settings.gameMode.dualCatch')}
                      </SelectItem>
                    ) : null}
                    <SelectItem value="sim-brainworkshop" className="text-sm">
                      {t('journey.modes.brainWorkshop')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newJourneyMode === 'sim-brainworkshop' ? (
                <div className="space-y-1.5">
                  <label className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('journey.setup.profile')}
                  </label>
                  <Select
                    value={newJourneyProfilePresetId}
                    onValueChange={(v) => setNewJourneyProfilePresetId(v)}
                  >
                    <SelectTrigger className="w-full h-11 border-border bg-surface text-sm rounded-xl shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value={FREE_TRAINING_RECOMMENDED_PRESET_ID} className="text-sm">
                        {t('settings.presets.dualNBack')}
                      </SelectItem>
                      <SelectItem value={FREE_TRAINING_TRI_PRESET_ID} className="text-sm">
                        {t('settings.presets.tri')}
                      </SelectItem>
                      <SelectItem value={FREE_TRAINING_QUAD_PRESET_ID} className="text-sm">
                        {t('settings.presets.quad')}
                      </SelectItem>
                      <SelectItem value={FREE_TRAINING_DEFAULT_PRESET_ID} className="text-sm">
                        {t('settings.presets.default')}
                      </SelectItem>
                      {brainWorkshopFreeTrainingPresets
                        .filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-sm">
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : newJourneyMode === 'dual-trace' ? (
                <div className="space-y-1.5">
                  <label className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('journey.setup.profile')}
                  </label>
                  <Select
                    value={newJourneyProfilePresetId}
                    onValueChange={(v) => setNewJourneyProfilePresetId(v)}
                  >
                    <SelectTrigger className="w-full h-11 border-border bg-surface text-sm rounded-xl shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value={FREE_TRAINING_RECOMMENDED_PRESET_ID} className="text-sm">
                        {t('settings.presets.recommended')}
                      </SelectItem>
                      <SelectItem value={FREE_TRAINING_DEFAULT_PRESET_ID} className="text-sm">
                        {t('settings.presets.default')}
                      </SelectItem>
                      {dualTraceFreeTrainingPresets
                        .filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-sm">
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t('journey.levels')}{' '}
                  <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground/70">
                    ({newJourneyTarget - newJourneyStart + 1} {t('journey.stages')})
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <Select
                    value={String(newJourneyStart)}
                    onValueChange={(v) => {
                      const val = Number(v);
                      setNewJourneyStart(val);
                      if (val > newJourneyTarget) setNewJourneyTarget(val);
                    }}
                  >
                    <SelectTrigger className="flex-1 h-11 border-border bg-surface text-sm font-mono rounded-xl shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {Array.from({ length: JOURNEY_MAX_LEVEL }, (_, i) => i + 1).map((level) => {
                        return (
                          <SelectItem
                            key={level}
                            value={String(level)}
                            className="text-sm font-mono"
                          >
                            N-{level}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  <span className="text-sm text-muted-foreground/60">à</span>

                  <Select
                    value={String(newJourneyTarget)}
                    onValueChange={(v) => setNewJourneyTarget(Number(v))}
                  >
                    <SelectTrigger className="flex-1 h-11 border-border bg-surface text-sm font-mono rounded-xl shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {Array.from(
                        { length: JOURNEY_MAX_LEVEL - newJourneyStart + 1 },
                        (_, i) => newJourneyStart + i,
                      ).map((level) => {
                        return (
                          <SelectItem
                            key={level}
                            value={String(level)}
                            className="text-sm font-mono"
                          >
                            N-{level}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                onClick={() => setCreateJourneyOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors"
                onClick={handleCreateJourney}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Journey Modal */}
      <Dialog
        open={Boolean(journeyToRename)}
        onOpenChange={(open) => {
          if (open) return;
          setJourneyToRename(null);
          setRenameJourneyName('');
        }}
      >
        <DialogContent closeAriaLabel={t('common.close')} className="w-[min(92vw,28rem)]">
          {journeyToRename ? (
            <div className="surface-card-typography space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted/30 flex items-center justify-center">
                <PencilSimple size={24} className="text-foreground" />
              </div>

              <DialogHeader className="text-center sm:text-center">
                <DialogTitle className="text-base">{t('journey.renameTitle')}</DialogTitle>
                <DialogDescription>
                  {t('journey.renameMessage', {
                    name: getJourneyDisplayName(journeyToRename),
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <label className="text-3xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t('journey.name')}
                </label>
                <input
                  type="text"
                  value={renameJourneyName}
                  onChange={(e) => setRenameJourneyName(e.target.value)}
                  placeholder={t('journey.namePlaceholder')}
                  className="w-full h-11 px-3 text-sm bg-surface border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                  onClick={() => setJourneyToRename(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors"
                  onClick={handleRenameJourney}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(journeyToDelete)}
        onOpenChange={(open) => !open && setJourneyToDelete(null)}
      >
        <DialogContent closeAriaLabel={t('common.close')} className="w-[min(92vw,28rem)]">
          {journeyToDelete ? (
            <div className="surface-card-typography space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash size={24} className="text-destructive" />
              </div>

              <DialogHeader className="text-center sm:text-center">
                <DialogTitle className="text-base">{t('journey.deleteConfirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('journey.deleteConfirmMessage', {
                    name: getJourneyDisplayName(journeyToDelete),
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                  onClick={() => setJourneyToDelete(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="h-10 px-4 text-xs font-bold uppercase tracking-wide text-white bg-destructive hover:bg-destructive/90 rounded-xl transition-colors"
                  onClick={handleDeleteJourney}
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
