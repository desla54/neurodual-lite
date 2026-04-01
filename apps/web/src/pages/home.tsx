/**
 * Home page — horizontal scroll layout
 * Modes → Parcours → Challenge, all scrolling horizontally.
 */

import { getRouteForMode, type GameModeId } from '../lib/mode-metadata';
import {
  Button,
  cn,
  ChallengePath,
  DrawerSheet,
  JourneyPath,
  Logo,
  PageTransition,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useChallenge20Query,
  useIsPremium,
} from '@neurodual/ui';
import {
  formatLocalDayKey,
  generateJourneyStages,
  JOURNEY_MAX_LEVEL,
} from '@neurodual/logic';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft, CaretRight, GearSix, Play } from '@phosphor-icons/react';
import { useNavigate } from 'react-router';
import { OspanMeasureButton } from '../components/profile/ospan-measure-button';
import { isChallengeValidatedToday } from '../lib/challenge-feedback';

import {
  DUALNBACK_CLASSIC_JOURNEY_ID,
  BRAINWORKSHOP_JOURNEY_ID,
  NEURODUAL_MIX_JOURNEY_ID,
  useSettingsStore,
} from '../stores/settings-store';
import { useJourneyStateQuery } from '../hooks/use-journey-state-query';
import { GAME_MODES, type GameModeConfig } from './settings/config';
import { createFreePlayIntent, createJourneyPlayIntent } from '../lib/play-intent';

const modeConfigMap = new Map<string, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

const ALL_MODES: GameModeId[] = [
  'dualnback-classic',
  'sim-brainworkshop',
  'ospan',
  'stroop-flex',
  'gridlock',
];
const EMPTY_SETTINGS: Readonly<Record<string, unknown>> = Object.freeze({});

const JOURNEY_OPTIONS = [
  {
    id: NEURODUAL_MIX_JOURNEY_ID,
    labelKey: 'home.journey.neurodualMix',
    label: 'Parcours NeuroDual',
    gameMode: 'neurodual-mix',
  },
  {
    id: DUALNBACK_CLASSIC_JOURNEY_ID,
    labelKey: 'home.journey.dualnbackClassic',
    label: 'Parcours DNB Classique',
    gameMode: 'dualnback-classic',
  },
  {
    id: BRAINWORKSHOP_JOURNEY_ID,
    labelKey: 'home.journey.brainworkshop',
    label: 'Parcours Brain Workshop',
    gameMode: 'sim-brainworkshop',
  },
] as const;


export function HomePage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasPremium = useIsPremium();
  const currentMode = useSettingsStore((s) => s.currentMode);
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);

  // Challenge
  const { data: challengeState } = useChallenge20Query();
  const challengeValidatedToday = challengeState
    ? isChallengeValidatedToday(challengeState)
    : false;
  const challengeTotalDays = useSettingsStore((s) => s.ui.challengeTotalDays);
  const challengeTargetMinutesPerDay = useSettingsStore((s) => s.ui.challengeTargetMinutesPerDay);
  const challengeStartedAtDay = useSettingsStore((s) => s.ui.challengeStartedAtDay);
  const setChallengeTotalDays = useSettingsStore((s) => s.setChallengeTotalDays);
  const setChallengeTargetMinutesPerDay = useSettingsStore(
    (s) => s.setChallengeTargetMinutesPerDay,
  );
  const setChallengeStartedAtDay = useSettingsStore((s) => s.setChallengeStartedAtDay);
  const setChallengeHasProgress = useSettingsStore((s) => s.setChallengeHasProgress);

  // Parcours
  const activeJourneyId = useSettingsStore((s) => s.ui.activeJourneyId);
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const updateActiveJourneyLevels = useSettingsStore((s) => s.updateActiveJourneyLevels);
  const activeJourney = useSettingsStore((s) =>
    s.savedJourneys.find((j) => j.id === activeJourneyId),
  );
  const journeyStartLevel = activeJourney?.startLevel ?? (activeJourneyId === NEURODUAL_MIX_JOURNEY_ID ? 1 : 2);
  const journeyTargetLevel = activeJourney?.targetLevel ?? 5;
  const journeyGameMode =
    JOURNEY_OPTIONS.find((o) => o.id === activeJourneyId)?.gameMode ?? 'dualnback-classic';

  // Read persisted journey state from SQLite (all parcours)
  const { data: journeyState } = useJourneyStateQuery(
    activeJourneyId,
    journeyStartLevel,
    journeyTargetLevel,
    journeyGameMode,
  );

  // Selected journey stage (null = free play mode)
  const [selectedJourneyStageId, setSelectedJourneyStageId] = useState<number | null>(null);
  const journeyStageDefinitions = useMemo(
    () => generateJourneyStages(journeyTargetLevel, journeyStartLevel, true, journeyGameMode),
    [journeyStartLevel, journeyTargetLevel, journeyGameMode],
  );
  const selectedStageDef =
    selectedJourneyStageId !== null
      ? journeyStageDefinitions.find((s) => s.stageId === selectedJourneyStageId)
      : null;

  // Quick settings toggle
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const modeSettings =
    useSettingsStore((s) => s.modes[currentMode as keyof typeof s.modes]) ?? EMPTY_SETTINGS;
  const setModeSetting = useSettingsStore((s) => s.setModeSetting);
  const currentModeNLevel = (modeSettings as any).nLevel ?? 2;
  const currentModeTrialsCount = (modeSettings as any).trialsCount ?? 20;
  const selectedModeConfig = modeConfigMap.get(currentMode);

  // Per-mode quick settings capabilities
  const quickCfg = useMemo(() => {
    switch (currentMode) {
      case 'stroop-flex':
        return {
          hasNLevel: true,
          nMin: 1,
          nMax: 9,
          nDefault: 1,
          hasTrials: true,
          tMin: 10,
          tMax: 50,
          tStep: 5,
          tDefault: 96,
        };
      case 'ospan':
        return {
          hasNLevel: false,
          nMin: 1,
          nMax: 1,
          nDefault: 1,
          hasTrials: true,
          tMin: 10,
          tMax: 50,
          tStep: 5,
          tDefault: 10,
        };
      case 'gridlock':
        return {
          hasNLevel: true,
          nMin: 1,
          nMax: 10,
          nDefault: 1,
          hasTrials: true,
          tMin: 10,
          tMax: 50,
          tStep: 5,
          tDefault: 12,
        };
      case 'dual-mix':
        return {
          hasNLevel: true,
          nMin: 1,
          nMax: 20,
          nDefault: 2,
          hasTrials: true,
          tMin: 10,
          tMax: 60,
          tStep: 5,
          tDefault: 20,
        };
      default: // dualnback-classic, sim-brainworkshop
        return {
          hasNLevel: true,
          nMin: 1,
          nMax: 20,
          nDefault: 2,
          hasTrials: true,
          tMin: 5,
          tMax: 100,
          tStep: 5,
          tDefault: 20,
        };
    }
  }, [currentMode]);

  const handleSelectMode = (modeId: GameModeId) => {
    setCurrentMode(modeId);
    setSelectedJourneyStageId(null); // Deselect journey stage when switching mode
  };

  const handleLaunchMode = () => {
    if (selectedStageDef) {
      // Launch journey stage — resolve composite modes (neurodual-mix) to a concrete game mode
      const concreteMode =
        journeyState?.nextSessionGameMode ??
        (journeyGameMode === 'neurodual-mix' ? 'stroop-flex' : journeyGameMode);
      const route = getRouteForMode(concreteMode as GameModeId);
      setCurrentMode(concreteMode as GameModeId);
      navigate(route === '/nback' ? `/nback?mode=${concreteMode}` : route, {
        state: createJourneyPlayIntent(selectedStageDef.stageId, activeJourneyId ?? undefined, {
          gameModeId: concreteMode,
          journeyStartLevel,
          journeyTargetLevel,
          journeyGameModeId: journeyGameMode,
          journeyNLevel: selectedStageDef.nLevel,
        }),
      });
      return;
    }
    const route = getRouteForMode(currentMode as GameModeId);
    navigate(route === '/nback' ? `/nback?mode=${currentMode}` : route, {
      state: createFreePlayIntent(currentMode as GameModeId),
    });
  };

  return (
    <PageTransition
      className="flex-1 w-full max-w-md md:max-w-lg mx-auto self-stretch text-center"
      data-testid="home-page"
    >
      <div className="relative flex min-h-full w-full flex-col items-center gap-5 pb-8">
        {/* OSpan badge */}
        <div className="absolute -top-1 -left-1 z-10" data-onboarding-target="fiches">
          <div data-onboarding-target="fiche-ospan">
            <OspanMeasureButton />
          </div>
        </div>

        {/* Logo */}
        <div className="w-full pt-14 pb-0 sm:pt-18">
          <div className="px-6 py-2">
            <Logo
              className="w-full max-w-[200px] sm:max-w-[240px] h-auto text-foreground mx-auto"
              ariaLabel={t('home.ariaLabel')}
              showPremiumBadge={hasPremium}
            />
          </div>
        </div>

        {/* ═══ Section 1: Modes — horizontal scroll ═══ */}
        <section className="w-full home-card-typography">
          <div className="grid grid-cols-3 px-4 gap-2">
            {ALL_MODES.map((modeId) => {
              const config = modeConfigMap.get(modeId);
              const Icon = config?.icon;
              const label = config?.labelKey ? t(config.labelKey, modeId) : modeId;
              const isActive = currentMode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  onClick={() => handleSelectMode(modeId)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-all',
                    'border-border/50 bg-card',
                    'hover:border-border/70 hover:bg-card',
                    'active:scale-[0.97]',
                    isActive && 'ring-2 ring-primary/40 border-primary/30 shadow-md',
                  )}
                >
                  {Icon && (
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
                        config?.bgClass ?? 'bg-muted/30',
                      )}
                    >
                      <Icon
                        size={18}
                        weight="duotone"
                        className={config?.colorClass ?? 'text-muted-foreground'}
                      />
                    </div>
                  )}
                  <span className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">
                    {label}
                  </span>
                </button>
              );
            })}
            {/* 6th card: Quick Settings toggle */}
            <button
              type="button"
              onClick={() => setShowQuickSettings((v) => !v)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-all',
                'border-border/50 bg-card',
                'hover:border-border/70 hover:bg-card',
                'active:scale-[0.97]',
                showQuickSettings && 'ring-2 ring-primary/40 border-primary/30 shadow-md',
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/30">
                <GearSix size={18} weight="duotone" className="text-muted-foreground" />
              </div>
              <span className="text-[11px] font-semibold text-foreground leading-tight">
                {t('home.quickSettings', 'Réglages')}
              </span>
            </button>
          </div>
        </section>

        {/* ═══ Quick Settings (replaces progression when active) ═══ */}
        {showQuickSettings ? (
          <div className="w-full px-3">
            <div className="rounded-[20px] border border-border/50 bg-card overflow-hidden shadow-[0_8px_32px_-16px_hsl(var(--border)/0.2)]">
              <div className="home-card-typography p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    {modeConfigMap.get(currentMode)?.labelKey
                      ? t(modeConfigMap.get(currentMode)!.labelKey)
                      : currentMode}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowQuickSettings(false)}
                    className="home-footer-pill text-[10px]"
                  >
                    {t('common.close', 'Fermer')}
                  </button>
                </div>

                {/* N-Level */}
                {quickCfg.hasNLevel && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="typo-body font-semibold text-foreground">
                        {t('settings.config.nLevel', 'Niveau N-Back')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setModeSetting('nLevel', Math.max(quickCfg.nMin, currentModeNLevel - 1))
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                        disabled={currentModeNLevel <= quickCfg.nMin}
                      >
                        <CaretLeft size={20} />
                      </button>
                      <span className="w-14 text-center font-mono font-semibold">
                        N-{currentModeNLevel}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setModeSetting('nLevel', Math.min(quickCfg.nMax, currentModeNLevel + 1))
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                        disabled={currentModeNLevel >= quickCfg.nMax}
                      >
                        <CaretRight size={20} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Trials count */}
                {quickCfg.hasTrials && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="typo-body font-semibold text-foreground">
                        {t('settings.config.trialsCount', 'Essais')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setModeSetting(
                            'trialsCount',
                            Math.max(quickCfg.tMin, currentModeTrialsCount - quickCfg.tStep),
                          )
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                        disabled={currentModeTrialsCount <= quickCfg.tMin}
                      >
                        <CaretLeft size={20} />
                      </button>
                      <span className="w-14 text-center font-mono font-semibold">
                        {currentModeTrialsCount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setModeSetting(
                            'trialsCount',
                            Math.min(quickCfg.tMax, currentModeTrialsCount + quickCfg.tStep),
                          )
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                        disabled={currentModeTrialsCount >= quickCfg.tMax}
                      >
                        <CaretRight size={20} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Link to full settings */}
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/settings/mode')}
                    className="home-footer-pill"
                  >
                    {t('home.allSettings', 'Tous les réglages')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ═══ Progression zone — Parcours + Challenge ═══ */
          <div className="w-full px-3">
            <div className="rounded-[20px] border border-border/50 bg-card overflow-hidden shadow-[0_8px_32px_-16px_hsl(var(--border)/0.2)]">
              {/* ── Parcours ── */}
              <section className="home-card-typography pt-4">
                <div className="flex items-center justify-between px-5 mb-3">
                  <Select value={activeJourneyId} onValueChange={(id) => activateJourney(id)}>
                    <SelectTrigger className="h-auto w-auto border-none bg-transparent shadow-none text-sm font-bold uppercase tracking-wider text-muted-foreground gap-1.5 p-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOURNEY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {t(opt.labelKey, opt.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="px-1">
                  <JourneyPath
                    state={journeyState}
                    gameMode={journeyGameMode}
                    emphasis="hero"
                    onStageClick={(stageId) => {
                      const stage = journeyState.stages.find((s) => s.stageId === stageId);
                      if (!stage || stage.status === 'locked') return;
                      // Toggle selection: deselect if already selected
                      setSelectedJourneyStageId((prev) => (prev === stageId ? null : stageId));
                    }}
                  />
                </div>
                <div className="mt-3 px-5">
                  <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
                    <DrawerSheet
                      title={t('home.journey.rulesTitle', 'How it works')}
                      trigger={
                        <button type="button" className="home-footer-pill">
                          {t('home.training.howItWorksTitle', 'How it works')}
                        </button>
                      }
                    >
                      <div className="space-y-4 text-muted-foreground typo-body">
                        {journeyGameMode === 'dualnback-classic' && (
                          <>
                            <p className="font-semibold text-foreground">
                              {t('journey.progression.jaeggi.description', 'Based on your weakest modality:')}
                            </p>
                            <ul className="space-y-2 list-none pl-0">
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                <span>{t('journey.progression.jaeggi.up', 'Fewer than 3 errors → Level up')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold shrink-0">→</span>
                                <span>{t('journey.progression.jaeggi.stay', '3 to 5 errors → Stay at this level')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-destructive font-bold shrink-0">↓</span>
                                <span>{t('journey.progression.jaeggi.down', 'More than 5 errors → Level down')}</span>
                              </li>
                            </ul>
                          </>
                        )}
                        {journeyGameMode === 'sim-brainworkshop' && (
                          <>
                            <p className="font-semibold text-foreground">
                              {t('journey.progression.brainworkshop.description', 'Brain Workshop protocol:')}
                            </p>
                            <ul className="space-y-2 list-none pl-0">
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                <span>{t('journey.progression.brainworkshop.up', '80% or higher → Level up')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold shrink-0">→</span>
                                <span>{t('journey.progression.brainworkshop.stay', '50% to 79% → Stay')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-destructive font-bold shrink-0">↓</span>
                                <span>{t('journey.progression.brainworkshop.strike', '3 scores in a row under 50% → Level down')}</span>
                              </li>
                            </ul>
                          </>
                        )}
                        {journeyGameMode === 'neurodual-mix' && (
                          <>
                            <p className="font-semibold text-foreground">
                              {t('journey.progression.neurodualMix.description', 'NeuroDual Mix — DNB Classic + Stroop Flex:')}
                            </p>
                            <ul className="space-y-2 list-none pl-0">
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                <span>{t('journey.progression.neurodualMix.fill', 'Each session with 85%+ accuracy fills the stage by 10%')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold shrink-0">→</span>
                                <span>{t('journey.progression.neurodualMix.both', 'Both DNB Classic and Stroop Flex sessions count')}</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-primary font-bold shrink-0">✓</span>
                                <span>{t('journey.progression.neurodualMix.unlock', 'At 100%, the next N-level unlocks')}</span>
                              </li>
                            </ul>
                          </>
                        )}
                      </div>
                    </DrawerSheet>
                    <DrawerSheet
                      title={t('home.journey.settings', 'Journey settings')}
                      trigger={
                        <button type="button" className="home-footer-pill">
                          {t('home.journey.settings', 'Journey settings')}
                        </button>
                      }
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="typo-body font-semibold text-foreground">
                              {t('home.journey.startLevel', 'Start level')}
                            </div>
                            <div className="typo-caption text-muted-foreground">
                              {t('home.journey.startLevelDesc', 'N-level to start from')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveJourneyLevels(
                                  Math.max(2, journeyStartLevel - 1),
                                  journeyTargetLevel,
                                )
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                              disabled={journeyStartLevel <= 2}
                            >
                              <CaretLeft size={20} />
                            </button>
                            <span className="w-14 text-center font-mono font-semibold">
                              N-{journeyStartLevel}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveJourneyLevels(
                                  Math.min(journeyTargetLevel, journeyStartLevel + 1),
                                  journeyTargetLevel,
                                )
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                              disabled={journeyStartLevel >= journeyTargetLevel}
                            >
                              <CaretRight size={20} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="typo-body font-semibold text-foreground">
                              {t('home.journey.targetLevel', 'Target level')}
                            </div>
                            <div className="typo-caption text-muted-foreground">
                              {t('home.journey.targetLevelDesc', 'N-level to reach')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveJourneyLevels(
                                  journeyStartLevel,
                                  Math.max(journeyStartLevel, journeyTargetLevel - 1),
                                )
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                              disabled={journeyTargetLevel <= journeyStartLevel}
                            >
                              <CaretLeft size={20} />
                            </button>
                            <span className="w-14 text-center font-mono font-semibold">
                              N-{journeyTargetLevel}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveJourneyLevels(
                                  journeyStartLevel,
                                  Math.min(JOURNEY_MAX_LEVEL, journeyTargetLevel + 1),
                                )
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                              disabled={journeyTargetLevel >= JOURNEY_MAX_LEVEL}
                            >
                              <CaretRight size={20} />
                            </button>
                          </div>
                        </div>
                        <div className="text-center text-sm text-muted-foreground">
                          {t('home.journey.stagesCount', '{{count}} stages', {
                            count: journeyTargetLevel - journeyStartLevel + 1,
                          })}
                        </div>
                      </div>
                    </DrawerSheet>
                  </div>
                </div>
              </section>

              {/* Separator */}
              <div className="mx-5 my-1 border-t border-border/50" />

              {/* ── Challenge ── */}
              {challengeState && (
                <section className="home-card-typography pt-3 pb-4">
                  <div className="flex items-center justify-between px-5 mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t('home.challenge.sectionTitle', 'Challenge')}
                    </h2>
                    <span className="text-xs text-muted-foreground/70 font-mono">
                      {challengeState.config.totalDays}
                      {t('home.challenge.daysUnit', 'j')} ·{' '}
                      {challengeState.config.targetMinutesPerDay} min/
                      {t('home.challenge.dayUnit', 'j')}
                    </span>
                  </div>
                  <div className="px-1">
                    <ChallengePath state={challengeState} emphasis="hero" showHeader={false} />
                  </div>
                  {challengeValidatedToday && (
                    <div className="mx-5 mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {t('home.challenge.validatedToday.title', "Today's goal completed")}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 px-5">
                    <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
                      <DrawerSheet
                        title={t('home.challenge.rulesTitle', 'How it works')}
                        trigger={
                          <button type="button" className="home-footer-pill">
                            {t('home.training.howItWorksTitle', 'How it works')}
                          </button>
                        }
                      >
                        <div className="space-y-4 text-muted-foreground typo-body">
                          <p>
                            <span className="font-semibold text-foreground">
                              {t('home.challenge.howGoalLabel', 'The goal')}
                            </span>
                            {' — '}
                            {t(
                              'home.challenge.howGoal',
                              'Train for a set number of minutes each day.',
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-foreground">
                              {t('home.challenge.howCountsLabel', 'What counts')}
                            </span>
                            {' — '}
                            {t('home.challenge.howCounts', 'All completed sessions count.')}
                          </p>
                          <p>
                            <span className="font-semibold text-foreground">
                              {t('home.challenge.howPaceLabel', 'One day at a time')}
                            </span>
                            {' — '}
                            {t('home.challenge.howPace', 'Extra minutes do not carry over.')}
                          </p>
                        </div>
                      </DrawerSheet>
                      <DrawerSheet
                        title={t('home.challenge.settings.title', 'Challenge settings')}
                        trigger={
                          <button type="button" className="home-footer-pill">
                            {t('home.challengeSettings', 'Challenge settings')}
                          </button>
                        }
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="typo-body font-semibold text-foreground">
                                {t('home.challenge.settings.days', 'Days')}
                              </div>
                              <div className="typo-caption text-muted-foreground">
                                {t('home.challenge.settings.daysDesc', 'Duration')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setChallengeTotalDays(challengeTotalDays - 1)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                                disabled={challengeTotalDays <= 1}
                              >
                                <CaretLeft size={20} />
                              </button>
                              <span className="w-14 text-center font-mono font-semibold">
                                {challengeTotalDays}
                              </span>
                              <button
                                type="button"
                                onClick={() => setChallengeTotalDays(challengeTotalDays + 1)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                                disabled={challengeTotalDays >= 365}
                              >
                                <CaretRight size={20} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="typo-body font-semibold text-foreground">
                                {t('home.challenge.settings.minutes', 'Minutes/day')}
                              </div>
                              <div className="typo-caption text-muted-foreground">
                                {t('home.challenge.settings.minutesDesc', 'Daily goal')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay - 1)
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                                disabled={challengeTargetMinutesPerDay <= 1}
                              >
                                <CaretLeft size={20} />
                              </button>
                              <span className="w-14 text-center font-mono font-semibold">
                                {challengeTargetMinutesPerDay}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay + 1)
                                }
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                                disabled={challengeTargetMinutesPerDay >= 240}
                              >
                                <CaretRight size={20} />
                              </button>
                            </div>
                          </div>
                          {!challengeStartedAtDay && (
                            <div className="flex justify-center pt-2">
                              <Button
                                size="lg"
                                className="w-auto px-10 rounded-full"
                                onClick={() => {
                                  setChallengeStartedAtDay(formatLocalDayKey(new Date()));
                                  setChallengeHasProgress(false);
                                }}
                              >
                                {t('home.challenge.settings.start', 'Start challenge')}
                              </Button>
                            </div>
                          )}
                        </div>
                      </DrawerSheet>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* ═══ Sticky Play Bar ═══ */}
        {(selectedModeConfig || selectedStageDef) && (
          <div className="sticky bottom-2 z-20 flex justify-center px-4">
            <button
              type="button"
              onClick={handleLaunchMode}
              className="flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-2xl bg-foreground text-background shadow-lg active:scale-[0.98] transition-transform"
            >
              {selectedStageDef ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 p-1.5 rounded-xl bg-background/20">
                      {(() => {
                        const journeyModeConfig = modeConfigMap.get(journeyGameMode);
                        const Icon = journeyModeConfig?.icon;
                        return Icon ? (
                          <Icon size={18} weight="duotone" className="text-background" />
                        ) : null;
                      })()}
                    </span>
                    <span className="text-sm font-semibold whitespace-nowrap text-background">
                      {t('home.journey.stageLabel', 'Étape {{id}} · N-{{n}}', {
                        id: selectedStageDef.stageId,
                        n: selectedStageDef.nLevel,
                      })}
                    </span>
                    <span className="shrink-0 p-1 rounded-full bg-background/20">
                      <Play size={16} weight="fill" className="text-background" />
                    </span>
                  </div>
                  <span className="text-[10px] text-background/60 font-mono">
                    {JOURNEY_OPTIONS.find((o) => o.id === activeJourneyId)?.label ?? 'Parcours'}
                  </span>
                </>
              ) : selectedModeConfig ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 p-1.5 rounded-xl bg-background/20">
                      <selectedModeConfig.icon
                        size={18}
                        weight="duotone"
                        className="text-background"
                      />
                    </span>
                    <span className="text-sm font-semibold whitespace-nowrap text-background">
                      {t(selectedModeConfig.labelKey)}
                    </span>
                    <span className="shrink-0 p-1 rounded-full bg-background/20">
                      <Play size={16} weight="fill" className="text-background" />
                    </span>
                  </div>
                  <span className="text-[10px] text-background/60 font-mono">
                    {quickCfg.hasNLevel ? `N-${currentModeNLevel} · ` : ''}
                    {currentModeTrialsCount} {t('home.sticky.trials', 'essais')}
                  </span>
                </>
              ) : null}
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
