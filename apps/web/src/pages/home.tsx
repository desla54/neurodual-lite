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
  useChallenge20Query,
  useIsPremium,
} from '@neurodual/ui';
import { formatLocalDayKey, generateJourneyStages, JOURNEY_MAX_LEVEL } from '@neurodual/logic';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown, CaretLeft, CaretRight, Check, GearSix, Play } from '@phosphor-icons/react';
import { OspanMeasureButton } from '../components/profile/ospan-measure-button';
import { isChallengeValidatedToday } from '../lib/challenge-feedback';
import { useTransitionNavigate } from '../hooks/use-transition-navigate';
import { useHaptic } from '../hooks/use-haptic';

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
  const { transitionNavigate } = useTransitionNavigate();
  const haptic = useHaptic();
  const hasPremium = useIsPremium();
  const currentMode = useSettingsStore((s) => s.freeTraining.selectedModeId);
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
  const activeJourneyId = useSettingsStore((s) => s.journeyUi.selectedJourneyId);
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const updateActiveJourneyLevels = useSettingsStore((s) => s.updateActiveJourneyLevels);
  const activeJourney = useSettingsStore((s) =>
    s.savedJourneys.find((j) => j.id === activeJourneyId),
  );
  const journeyStartLevel =
    activeJourney?.startLevel ?? (activeJourneyId === NEURODUAL_MIX_JOURNEY_ID ? 1 : 2);
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
  const currentJourneyStageId =
    journeyState.stages.find((stage) => stage.status === 'unlocked')?.stageId ?? null;
  const effectiveJourneyStageId = selectedJourneyStageId ?? currentJourneyStageId;
  const effectiveJourneyStageDef =
    effectiveJourneyStageId !== null
      ? (journeyStageDefinitions.find((s) => s.stageId === effectiveJourneyStageId) ?? null)
      : null;

  // Quick settings toggle
  const [carouselPage, setCarouselPage] = useState(0);
  const modeSettings =
    useSettingsStore((s) => s.modes[currentMode as keyof typeof s.modes]) ?? EMPTY_SETTINGS;
  const setModeSetting = useSettingsStore((s) => s.setModeSetting);
  const currentModeNLevel =
    ((modeSettings as Record<string, unknown>)['nLevel'] as number | undefined) ?? 2;
  const currentModeTrialsCount =
    ((modeSettings as Record<string, unknown>)['trialsCount'] as number | undefined) ??
    (currentMode === 'dual-mix' ? 10 : 20);
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
          nMax: 9,
          nDefault: 2,
          hasTrials: true,
          tMin: 5,
          tMax: 60,
          tStep: 5,
          tDefault: 10,
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

  const handleSelectJourney = (journeyId: string) => {
    if (journeyId === activeJourneyId) return;
    setSelectedJourneyStageId(null);
    activateJourney(journeyId);
  };

  const goToCarouselPage = (nextPage: number) => {
    setCarouselPage(Math.max(0, Math.min(2, nextPage)));
  };

  useEffect(() => {
    if (carouselPage !== 1) return;
    if (selectedJourneyStageId !== null) return;
    if (currentJourneyStageId === null) return;
    setSelectedJourneyStageId(currentJourneyStageId);
  }, [carouselPage, currentJourneyStageId, selectedJourneyStageId]);

  const handleLaunchMode = () => {
    haptic.impact('medium');
    if (effectiveJourneyStageDef) {
      // Launch journey stage — resolve composite modes (neurodual-mix) to a concrete game mode
      const concreteMode =
        journeyState?.nextSessionGameMode ??
        (journeyGameMode === 'neurodual-mix' ? 'stroop-flex' : journeyGameMode);
      const route = getRouteForMode(concreteMode as GameModeId);
      setCurrentMode(concreteMode as GameModeId);
      transitionNavigate(route === '/nback' ? `/nback?mode=${concreteMode}` : route, {
        state: createJourneyPlayIntent(
          effectiveJourneyStageDef.stageId,
          activeJourneyId ?? undefined,
          {
            gameModeId: concreteMode,
            journeyStartLevel,
            journeyTargetLevel,
            journeyGameModeId: journeyGameMode,
            journeyNLevel: effectiveJourneyStageDef.nLevel,
          },
        ),
        direction: 'modal',
      });
      return;
    }
    const route = getRouteForMode(currentMode as GameModeId);
    transitionNavigate(route === '/nback' ? `/nback?mode=${currentMode}` : route, {
      state: createFreePlayIntent(currentMode as GameModeId),
      direction: 'modal',
    });
  };

  const showModeAction = carouselPage === 0 && Boolean(selectedModeConfig);
  const showJourneyAction = carouselPage === 1 && Boolean(effectiveJourneyStageDef);
  const showChallengeAction = false;

  return (
    <div
      className="flex-1 w-full max-w-md md:max-w-lg mx-auto self-stretch text-center"
      data-testid="home-page"
    >
      <div className="relative flex min-h-full w-full flex-col items-center gap-5 pb-8">
        {/* OSpan badge */}
        <div
          className="absolute -left-1 z-10"
          style={{ top: 'calc(-1 * var(--safe-top) - 0.25rem)' }}
          data-onboarding-target="fiches"
        >
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

        <div className="flex flex-1 w-full flex-col justify-center gap-5">
          <section className="w-full px-0.5 pt-1 home-card-typography">
            <div className="pt-1">
              <div className="overflow-hidden">
                <div
                  className="flex w-full transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${carouselPage * 100}%)` }}
                >
                  <div className="w-full shrink-0">
                    <div className="grid auto-rows-fr grid-cols-3 gap-2 px-1 py-2">
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
                              'flex h-full min-h-[6.6rem] flex-col items-center justify-start gap-2 rounded-2xl border px-2 py-3 text-center transition-all',
                              'border-border/50 bg-card',
                              'hover:border-border/70 hover:bg-card',
                              'active:scale-[0.97]',
                              isActive &&
                                'border-foreground/80 shadow-[inset_0_0_0_2px_hsl(var(--foreground)/0.88),0_8px_24px_-12px_hsl(var(--foreground)/0.28)]',
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
                            <span className="flex min-h-[2.5rem] items-center text-[11px] font-semibold leading-tight text-foreground">
                              {label}
                            </span>
                          </button>
                        );
                      })}
                      <DrawerSheet
                        title={t('home.quickSettings', 'Réglages rapides')}
                        trigger={
                          <button
                            type="button"
                            className="flex h-full min-h-[6.6rem] flex-col items-center justify-start gap-2 rounded-2xl border border-border/50 bg-card px-2 py-3 text-center transition-all hover:border-border/70 hover:bg-card active:scale-[0.97]"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/30">
                              <GearSix
                                size={18}
                                weight="duotone"
                                className="text-muted-foreground"
                              />
                            </div>
                            <span className="flex min-h-[2.5rem] items-center text-[11px] font-semibold leading-tight text-foreground">
                              {t('home.quickSettings', 'Réglages')}
                            </span>
                          </button>
                        }
                      >
                        <div className="space-y-5">
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
                                    setModeSetting(
                                      'nLevel',
                                      Math.max(quickCfg.nMin, currentModeNLevel - 1),
                                    )
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
                                    setModeSetting(
                                      'nLevel',
                                      Math.min(quickCfg.nMax, currentModeNLevel + 1),
                                    )
                                  }
                                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card disabled:opacity-40"
                                  disabled={currentModeNLevel >= quickCfg.nMax}
                                >
                                  <CaretRight size={20} />
                                </button>
                              </div>
                            </div>
                          )}

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
                                      Math.max(
                                        quickCfg.tMin,
                                        currentModeTrialsCount - quickCfg.tStep,
                                      ),
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
                                      Math.min(
                                        quickCfg.tMax,
                                        currentModeTrialsCount + quickCfg.tStep,
                                      ),
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

                          <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => transitionNavigate('/settings/mode')}
                              className="home-footer-pill"
                            >
                              {t('home.allSettings', 'Tous les réglages')}
                            </button>
                          </div>
                        </div>
                      </DrawerSheet>
                    </div>
                  </div>

                  <div className="w-full shrink-0 px-1 pt-2">
                    <div className="rounded-[28px] border border-border/45 bg-card px-4 py-4 shadow-[0_10px_30px_-20px_hsl(var(--foreground)/0.18)]">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <DrawerSheet
                            title={t('home.journey.selectTitle', 'Choisir un parcours')}
                            trigger={
                              <button
                                type="button"
                                className="flex min-h-10 w-auto max-w-[85%] items-center justify-between gap-2 px-2 py-1 text-left"
                              >
                                <span className="min-w-0 truncate text-[14px] font-semibold text-foreground">
                                  {t(
                                    JOURNEY_OPTIONS.find((opt) => opt.id === activeJourneyId)
                                      ?.labelKey ?? 'home.journey.neurodualMix',
                                    JOURNEY_OPTIONS.find((opt) => opt.id === activeJourneyId)
                                      ?.label ?? 'Parcours',
                                  )}
                                </span>
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-foreground/55">
                                  <CaretDown size={14} weight="bold" />
                                </span>
                              </button>
                            }
                          >
                            <div className="space-y-2">
                              {JOURNEY_OPTIONS.map((opt) => {
                                const isActive = opt.id === activeJourneyId;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleSelectJourney(opt.id)}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all',
                                      isActive
                                        ? 'border-foreground/60 bg-foreground/[0.05]'
                                        : 'border-border/50 bg-card',
                                    )}
                                  >
                                    <span className="text-sm font-semibold text-foreground">
                                      {t(opt.labelKey, opt.label)}
                                    </span>
                                    <span
                                      className={cn(
                                        'flex h-7 w-7 items-center justify-center rounded-full',
                                        isActive
                                          ? 'bg-foreground text-background'
                                          : 'bg-muted/40 text-transparent',
                                      )}
                                    >
                                      <Check size={14} weight="bold" />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </DrawerSheet>
                        </div>
                        <div>
                          <JourneyPath
                            state={journeyState}
                            gameMode={journeyGameMode}
                            emphasis="hero"
                            onStageClick={(stageId) => {
                              const stage = journeyState.stages.find((s) => s.stageId === stageId);
                              if (!stage || stage.status === 'locked') return;
                              setSelectedJourneyStageId((prev) =>
                                prev === stageId ? null : stageId,
                              );
                            }}
                          />
                        </div>
                        <div className="flex w-full items-center justify-center gap-3 text-sm text-muted-foreground">
                          <DrawerSheet
                            title={t('home.journey.rulesTitle', 'How it works')}
                            trigger={
                              <button
                                type="button"
                                className="transition-colors hover:text-foreground"
                              >
                                {t('home.training.howItWorksTitle', 'How it works')}
                              </button>
                            }
                          >
                            <div className="space-y-4 text-muted-foreground typo-body">
                              {journeyGameMode === 'dualnback-classic' && (
                                <>
                                  <p className="font-semibold text-foreground">
                                    {t(
                                      'journey.progression.jaeggi.description',
                                      'Based on your weakest modality:',
                                    )}
                                  </p>
                                  <ul className="space-y-2 list-none pl-0">
                                    <li className="flex items-start gap-2">
                                      <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                      <span>
                                        {t(
                                          'journey.progression.jaeggi.up',
                                          'Fewer than 3 errors → Level up',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-amber-500 font-bold shrink-0">→</span>
                                      <span>
                                        {t(
                                          'journey.progression.jaeggi.stay',
                                          '3 to 5 errors → Stay at this level',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-destructive font-bold shrink-0">↓</span>
                                      <span>
                                        {t(
                                          'journey.progression.jaeggi.down',
                                          'More than 5 errors → Level down',
                                        )}
                                      </span>
                                    </li>
                                  </ul>
                                </>
                              )}
                              {journeyGameMode === 'sim-brainworkshop' && (
                                <>
                                  <p className="font-semibold text-foreground">
                                    {t(
                                      'journey.progression.brainworkshop.description',
                                      'Brain Workshop protocol:',
                                    )}
                                  </p>
                                  <ul className="space-y-2 list-none pl-0">
                                    <li className="flex items-start gap-2">
                                      <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                      <span>
                                        {t(
                                          'journey.progression.brainworkshop.up',
                                          '80% or higher → Level up',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-amber-500 font-bold shrink-0">→</span>
                                      <span>
                                        {t(
                                          'journey.progression.brainworkshop.stay',
                                          '50% to 79% → Stay',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-destructive font-bold shrink-0">↓</span>
                                      <span>
                                        {t(
                                          'journey.progression.brainworkshop.strike',
                                          '3 scores in a row under 50% → Level down',
                                        )}
                                      </span>
                                    </li>
                                  </ul>
                                </>
                              )}
                              {journeyGameMode === 'neurodual-mix' && (
                                <>
                                  <p className="font-semibold text-foreground">
                                    {t(
                                      'journey.progression.neurodualMix.description',
                                      'NeuroDual Mix — DNB Classic + Stroop Flex:',
                                    )}
                                  </p>
                                  <ul className="space-y-2 list-none pl-0">
                                    <li className="flex items-start gap-2">
                                      <span className="text-emerald-500 font-bold shrink-0">↑</span>
                                      <span>
                                        {t(
                                          'journey.progression.neurodualMix.fill',
                                          'Each session with 85%+ accuracy fills the stage by 10%',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-amber-500 font-bold shrink-0">→</span>
                                      <span>
                                        {t(
                                          'journey.progression.neurodualMix.both',
                                          'Both DNB Classic and Stroop Flex sessions count',
                                        )}
                                      </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                      <span className="text-primary font-bold shrink-0">✓</span>
                                      <span>
                                        {t(
                                          'journey.progression.neurodualMix.unlock',
                                          'At 100%, the next N-level unlocks',
                                        )}
                                      </span>
                                    </li>
                                  </ul>
                                </>
                              )}
                            </div>
                          </DrawerSheet>
                          <span className="h-3.5 w-px bg-border/80" aria-hidden="true" />
                          <DrawerSheet
                            title={t('home.journey.settings', 'Journey settings')}
                            trigger={
                              <button
                                type="button"
                                className="transition-colors hover:text-foreground"
                              >
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
                          <span className="h-3.5 w-px bg-border/80" aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full shrink-0 px-1">
                    {challengeState && (
                      <div className="rounded-[28px] border border-border/45 bg-card px-4 py-4 shadow-[0_10px_30px_-20px_hsl(var(--foreground)/0.18)]">
                        <div className="space-y-4">
                          <div className="flex justify-center">
                            <div className="px-2 py-1 text-[14px] font-semibold text-foreground">
                              {t('home.challenge.sectionTitle', 'Challenge')}
                            </div>
                          </div>
                          <div className="text-center text-xs font-mono text-muted-foreground/70">
                            {challengeState.config.totalDays}
                            {t('home.challenge.daysUnit', 'j')} ·{' '}
                            {challengeState.config.targetMinutesPerDay} min/
                            {t('home.challenge.dayUnit', 'j')}
                          </div>
                          <div>
                            <ChallengePath
                              state={challengeState}
                              emphasis="hero"
                              showHeader={false}
                            />
                          </div>
                          {challengeValidatedToday && (
                            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-3 py-2 text-center">
                              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                {t('home.challenge.validatedToday.title', "Today's goal completed")}
                              </span>
                            </div>
                          )}
                          <div className="flex w-full items-center justify-center gap-3 text-sm text-muted-foreground">
                            <DrawerSheet
                              title={t('home.challenge.rulesTitle', 'How it works')}
                              trigger={
                                <button
                                  type="button"
                                  className="transition-colors hover:text-foreground"
                                >
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
                            <span className="h-3.5 w-px bg-border/80" aria-hidden="true" />
                            <DrawerSheet
                              title={t('home.challenge.settings.title', 'Challenge settings')}
                              trigger={
                                <button
                                  type="button"
                                  className="transition-colors hover:text-foreground"
                                >
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
                                        setChallengeTargetMinutesPerDay(
                                          challengeTargetMinutesPerDay - 1,
                                        )
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
                                        setChallengeTargetMinutesPerDay(
                                          challengeTargetMinutesPerDay + 1,
                                        )
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
                                      className="w-auto rounded-full px-10"
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
                            <span className="h-3.5 w-px bg-border/80" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => goToCarouselPage(carouselPage - 1)}
                  disabled={carouselPage === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-card text-foreground disabled:opacity-35"
                  aria-label={t('common.previous', 'Précédent')}
                >
                  <CaretLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => goToCarouselPage(page)}
                      className={cn(
                        'h-2.5 rounded-full transition-all',
                        carouselPage === page ? 'w-6 bg-foreground' : 'w-2.5 bg-border',
                      )}
                      aria-label={t('home.carousel.goToPage', 'Aller à la page {{page}}', {
                        page: page + 1,
                      })}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => goToCarouselPage(carouselPage + 1)}
                  disabled={carouselPage === 2}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-card text-foreground disabled:opacity-35"
                  aria-label={t('common.next', 'Suivant')}
                >
                  <CaretRight size={18} />
                </button>
              </div>
            </div>
          </section>

          {(showModeAction || showJourneyAction || showChallengeAction) && (
            <div className="flex justify-center px-4">
              <button
                type="button"
                onClick={handleLaunchMode}
                className="flex w-full max-w-sm items-center justify-between gap-4 rounded-2xl border border-border/50 bg-card px-4 py-3.5 text-foreground shadow-lg active:scale-[0.98] transition-transform sm:py-3"
              >
                {showJourneyAction && effectiveJourneyStageDef ? (
                  <>
                    <div className="min-w-0 flex flex-1 items-center gap-3 text-left">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40 sm:h-8 sm:w-8">
                        {(() => {
                          const journeyModeConfig = modeConfigMap.get(journeyGameMode);
                          const Icon = journeyModeConfig?.icon;
                          return Icon ? (
                            <Icon
                              size={16}
                              weight="duotone"
                              className="text-foreground/85 sm:size-[15px]"
                            />
                          ) : null;
                        })()}
                      </span>
                      <span className="min-w-0 flex flex-col">
                        <span className="truncate text-[15px] font-semibold text-foreground sm:text-sm">
                          {t(
                            JOURNEY_OPTIONS.find((o) => o.id === activeJourneyId)?.labelKey ??
                              'home.journey.neurodualMix',
                            JOURNEY_OPTIONS.find((o) => o.id === activeJourneyId)?.label ??
                              'Parcours',
                          )}
                        </span>
                        <span className="truncate text-[11px] font-mono text-muted-foreground sm:text-[10px]">
                          {t('home.journey.stageLabel', 'Étape {{id}} · N-{{n}}', {
                            id: effectiveJourneyStageDef.stageId,
                            n: effectiveJourneyStageDef.nLevel,
                          })}
                        </span>
                      </span>
                    </div>
                    <span className="flex h-12 min-w-[30%] max-w-[34%] items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-[15px] font-semibold text-background shadow-sm sm:h-11 sm:min-w-[28%] sm:max-w-[32%] sm:text-sm">
                      <Play size={17} weight="fill" className="text-background sm:size-[16px]" />
                      {t('common.play', 'Jouer')}
                    </span>
                  </>
                ) : showModeAction && selectedModeConfig ? (
                  <>
                    <div className="min-w-0 flex flex-1 items-center gap-3 text-left">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40 sm:h-8 sm:w-8">
                        <selectedModeConfig.icon
                          size={16}
                          weight="duotone"
                          className="text-foreground/85 sm:size-[15px]"
                        />
                      </span>
                      <span className="min-w-0 flex flex-col">
                        <span className="truncate text-[15px] font-semibold text-foreground sm:text-sm">
                          {t(selectedModeConfig.labelKey)}
                        </span>
                        <span className="truncate text-[11px] font-mono text-muted-foreground sm:text-[10px]">
                          {quickCfg.hasNLevel ? `N-${currentModeNLevel} · ` : ''}
                          {currentModeTrialsCount} {t('home.sticky.trials', 'essais')}
                        </span>
                      </span>
                    </div>
                    <span className="flex h-12 min-w-[30%] max-w-[34%] items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-[15px] font-semibold text-background shadow-sm sm:h-11 sm:min-w-[28%] sm:max-w-[32%] sm:text-sm">
                      <Play size={17} weight="fill" className="text-background sm:size-[16px]" />
                      {t('common.play', 'Jouer')}
                    </span>
                  </>
                ) : null}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
