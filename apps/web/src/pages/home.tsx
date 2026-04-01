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
  useHasPremiumAccess,
} from '@neurodual/ui';
import {
  formatLocalDayKey,
  generateJourneyStages,
  JOURNEY_MAX_LEVEL,
  type JourneyState,
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
  useSettingsStore,
} from '../stores/settings-store';
import { GAME_MODES, type GameModeConfig } from './settings/config';
import { createFreePlayIntent } from '../lib/play-intent';

const modeConfigMap = new Map<string, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

const ALL_MODES: GameModeId[] = ['dualnback-classic', 'sim-brainworkshop', 'ospan', 'stroop-flex', 'gridlock'];

const JOURNEY_OPTIONS = [
  { id: DUALNBACK_CLASSIC_JOURNEY_ID, labelKey: 'home.journey.dualnbackClassic', label: 'Dual N-Back Classic', gameMode: 'dualnback-classic' },
  { id: BRAINWORKSHOP_JOURNEY_ID, labelKey: 'home.journey.brainworkshop', label: 'Brain Workshop', gameMode: 'sim-brainworkshop' },
] as const;

function buildJourneyState(startLevel: number, targetLevel: number): JourneyState {
  const stages = generateJourneyStages(targetLevel, startLevel, true);
  return {
    currentStage: 1,
    stages: stages.map((s) => ({
      stageId: s.stageId,
      status: s.stageId === 1 ? 'unlocked' : 'locked',
      validatingSessions: 0,
      bestScore: null,
    })),
    isActive: true,
    startLevel,
    targetLevel,
    isSimulator: true,
  };
}

export function HomePage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasPremium = useHasPremiumAccess();
  const currentMode = useSettingsStore((s) => s.currentMode);
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);

  // Challenge
  const { data: challengeState } = useChallenge20Query();
  const challengeValidatedToday = challengeState ? isChallengeValidatedToday(challengeState) : false;
  const challengeTotalDays = useSettingsStore((s) => s.ui.challengeTotalDays);
  const challengeTargetMinutesPerDay = useSettingsStore((s) => s.ui.challengeTargetMinutesPerDay);
  const challengeStartedAtDay = useSettingsStore((s) => s.ui.challengeStartedAtDay);
  const setChallengeTotalDays = useSettingsStore((s) => s.setChallengeTotalDays);
  const setChallengeTargetMinutesPerDay = useSettingsStore((s) => s.setChallengeTargetMinutesPerDay);
  const setChallengeStartedAtDay = useSettingsStore((s) => s.setChallengeStartedAtDay);
  const setChallengeHasProgress = useSettingsStore((s) => s.setChallengeHasProgress);

  // Parcours
  const activeJourneyId = useSettingsStore((s) => s.ui.activeJourneyId);
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const updateActiveJourneyLevels = useSettingsStore((s) => s.updateActiveJourneyLevels);
  const activeJourney = useSettingsStore((s) => s.savedJourneys.find((j) => j.id === activeJourneyId));
  const journeyStartLevel = activeJourney?.startLevel ?? 2;
  const journeyTargetLevel = activeJourney?.targetLevel ?? 5;
  const journeyGameMode = JOURNEY_OPTIONS.find((o) => o.id === activeJourneyId)?.gameMode ?? 'dualnback-classic';
  const journeyState = useMemo<JourneyState>(() => buildJourneyState(journeyStartLevel, journeyTargetLevel), [journeyStartLevel, journeyTargetLevel]);

  // Quick settings toggle
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const modeSettings = useSettingsStore((s) => s.modes[currentMode as keyof typeof s.modes] ?? {});
  const setModeSetting = useSettingsStore((s) => s.setModeSetting);
  const currentModeNLevel = (modeSettings as any).nLevel ?? 2;
  const currentModeTrialsCount = (modeSettings as any).trialsCount ?? 20;
  const selectedModeConfig = modeConfigMap.get(currentMode);

  const handleSelectMode = (modeId: GameModeId) => {
    setCurrentMode(modeId);
  };

  const handleLaunchMode = () => {
    const route = getRouteForMode(currentMode as GameModeId);
    navigate(route === '/nback' ? `/nback?mode=${currentMode}` : route, { state: createFreePlayIntent(currentMode as GameModeId) });
  };

  return (
    <PageTransition className="flex-1 w-full max-w-md md:max-w-lg mx-auto self-stretch text-center" data-testid="home-page">
      <div className="relative flex min-h-full w-full flex-col items-center gap-5 pb-8">
        {/* OSpan badge */}
        <div className="absolute -top-1 -left-1 z-10" data-onboarding-target="fiches">
          <div data-onboarding-target="fiche-ospan"><OspanMeasureButton /></div>
        </div>

        {/* Logo */}
        <div className="w-full pt-14 pb-0 sm:pt-18">
          <div className="px-6 py-2">
            <Logo className="w-full max-w-[200px] sm:max-w-[240px] h-auto text-foreground mx-auto" ariaLabel={t('home.ariaLabel')} showPremiumBadge={hasPremium} />
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
                    'border-border/50 bg-card/85 backdrop-blur-2xl',
                    'hover:border-border/70 hover:bg-card/95',
                    'active:scale-[0.97]',
                    isActive && 'ring-2 ring-primary/40 border-primary/30 shadow-md',
                  )}
                >
                  {Icon && (
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-full shrink-0', config?.bgClass ?? 'bg-muted/30')}>
                      <Icon size={18} weight="duotone" className={config?.colorClass ?? 'text-muted-foreground'} />
                    </div>
                  )}
                  <span className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">{label}</span>
                </button>
              );
            })}
            {/* 6th card: Quick Settings toggle */}
            <button
              type="button"
              onClick={() => setShowQuickSettings((v) => !v)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-all',
                'border-border/50 bg-card/85 backdrop-blur-2xl',
                'hover:border-border/70 hover:bg-card/95',
                'active:scale-[0.97]',
                showQuickSettings && 'ring-2 ring-primary/40 border-primary/30 shadow-md',
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/30">
                <GearSix size={18} weight="duotone" className="text-muted-foreground" />
              </div>
              <span className="text-[11px] font-semibold text-foreground leading-tight">{t('home.quickSettings', 'Réglages')}</span>
            </button>
          </div>
        </section>

        {/* ═══ Quick Settings (replaces progression when active) ═══ */}
        {showQuickSettings ? (
          <div className="w-full px-3">
            <div className="rounded-[20px] border border-border/50 bg-card/50 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_-16px_hsl(var(--glass-shadow)/0.2)]">
              <div className="home-card-typography p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    {modeConfigMap.get(currentMode)?.labelKey ? t(modeConfigMap.get(currentMode)!.labelKey) : currentMode}
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="typo-body font-semibold text-foreground">{t('settings.config.nLevel', 'Niveau N-Back')}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setModeSetting('nLevel', Math.max(1, currentModeNLevel - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={currentModeNLevel <= 1}><CaretLeft size={20} /></button>
                    <span className="w-14 text-center font-mono font-semibold">N-{currentModeNLevel}</span>
                    <button type="button" onClick={() => setModeSetting('nLevel', Math.min(20, currentModeNLevel + 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={currentModeNLevel >= 20}><CaretRight size={20} /></button>
                  </div>
                </div>

                {/* Trials count */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="typo-body font-semibold text-foreground">{t('settings.config.trialsCount', 'Essais')}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setModeSetting('trialsCount', Math.max(5, currentModeTrialsCount - 5))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={currentModeTrialsCount <= 5}><CaretLeft size={20} /></button>
                    <span className="w-14 text-center font-mono font-semibold">{currentModeTrialsCount}</span>
                    <button type="button" onClick={() => setModeSetting('trialsCount', Math.min(100, currentModeTrialsCount + 5))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={currentModeTrialsCount >= 100}><CaretRight size={20} /></button>
                  </div>
                </div>

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
        <div className="rounded-[20px] border border-border/50 bg-card/50 backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_-16px_hsl(var(--glass-shadow)/0.2)]">

        {/* ── Parcours ── */}
        <section className="home-card-typography pt-4">
          <div className="flex items-center justify-between px-5 mb-3">
            <Select value={activeJourneyId} onValueChange={(id) => activateJourney(id)}>
              <SelectTrigger className="h-auto w-auto border-none bg-transparent shadow-none text-sm font-bold uppercase tracking-wider text-muted-foreground gap-1.5 p-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOURNEY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>{t(opt.labelKey, opt.label)}</SelectItem>
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
                const route = getRouteForMode(journeyGameMode as GameModeId);
                setCurrentMode(journeyGameMode as GameModeId);
                navigate(route === '/nback' ? `/nback?mode=${journeyGameMode}` : route, {
                  state: createFreePlayIntent(journeyGameMode as GameModeId),
                });
              }}
            />
          </div>
          <div className="mt-3 px-5">
            <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
              <DrawerSheet
                title={t('home.journey.rulesTitle', 'How it works')}
                trigger={<button type="button" className="home-footer-pill">{t('home.training.howItWorksTitle', 'How it works')}</button>}
              >
                <div className="space-y-4 text-muted-foreground typo-body">
                  <p><span className="font-semibold text-foreground">{t('home.journey.howProgressionLabel', 'Progression')}</span>{' — '}{t('home.journey.howProgression', 'Complete sessions at each N-level to advance.')}</p>
                  <p><span className="font-semibold text-foreground">{t('home.journey.howScoringLabel', 'Scoring')}</span>{' — '}{t('home.journey.howScoring', 'Each stage requires a minimum score to pass.')}</p>
                </div>
              </DrawerSheet>
              <DrawerSheet
                title={t('home.journey.settings', 'Journey settings')}
                trigger={<button type="button" className="home-footer-pill">{t('home.journey.settings', 'Journey settings')}</button>}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="typo-body font-semibold text-foreground">{t('home.journey.startLevel', 'Start level')}</div><div className="typo-caption text-muted-foreground">{t('home.journey.startLevelDesc', 'N-level to start from')}</div></div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateActiveJourneyLevels(Math.max(2, journeyStartLevel - 1), journeyTargetLevel)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={journeyStartLevel <= 2}><CaretLeft size={20} /></button>
                      <span className="w-14 text-center font-mono font-semibold">N-{journeyStartLevel}</span>
                      <button type="button" onClick={() => updateActiveJourneyLevels(Math.min(journeyTargetLevel, journeyStartLevel + 1), journeyTargetLevel)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={journeyStartLevel >= journeyTargetLevel}><CaretRight size={20} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="typo-body font-semibold text-foreground">{t('home.journey.targetLevel', 'Target level')}</div><div className="typo-caption text-muted-foreground">{t('home.journey.targetLevelDesc', 'N-level to reach')}</div></div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateActiveJourneyLevels(journeyStartLevel, Math.max(journeyStartLevel, journeyTargetLevel - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={journeyTargetLevel <= journeyStartLevel}><CaretLeft size={20} /></button>
                      <span className="w-14 text-center font-mono font-semibold">N-{journeyTargetLevel}</span>
                      <button type="button" onClick={() => updateActiveJourneyLevels(journeyStartLevel, Math.min(JOURNEY_MAX_LEVEL, journeyTargetLevel + 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={journeyTargetLevel >= JOURNEY_MAX_LEVEL}><CaretRight size={20} /></button>
                    </div>
                  </div>
                  <div className="text-center text-sm text-muted-foreground">
                    {t('home.journey.stagesCount', '{{count}} stages', { count: journeyTargetLevel - journeyStartLevel + 1 })}
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
                {challengeState.config.totalDays}{t('home.challenge.daysUnit', 'j')} · {challengeState.config.targetMinutesPerDay} min/{t('home.challenge.dayUnit', 'j')}
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
                  trigger={<button type="button" className="home-footer-pill">{t('home.training.howItWorksTitle', 'How it works')}</button>}
                >
                  <div className="space-y-4 text-muted-foreground typo-body">
                    <p><span className="font-semibold text-foreground">{t('home.challenge.howGoalLabel', 'The goal')}</span>{' — '}{t('home.challenge.howGoal', 'Train for a set number of minutes each day.')}</p>
                    <p><span className="font-semibold text-foreground">{t('home.challenge.howCountsLabel', 'What counts')}</span>{' — '}{t('home.challenge.howCounts', 'All completed sessions count.')}</p>
                    <p><span className="font-semibold text-foreground">{t('home.challenge.howPaceLabel', 'One day at a time')}</span>{' — '}{t('home.challenge.howPace', 'Extra minutes do not carry over.')}</p>
                  </div>
                </DrawerSheet>
                <DrawerSheet
                  title={t('home.challenge.settings.title', 'Challenge settings')}
                  trigger={<button type="button" className="home-footer-pill">{t('home.challengeSettings', 'Challenge settings')}</button>}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><div className="typo-body font-semibold text-foreground">{t('home.challenge.settings.days', 'Days')}</div><div className="typo-caption text-muted-foreground">{t('home.challenge.settings.daysDesc', 'Duration')}</div></div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setChallengeTotalDays(challengeTotalDays - 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={challengeTotalDays <= 1}><CaretLeft size={20} /></button>
                        <span className="w-14 text-center font-mono font-semibold">{challengeTotalDays}</span>
                        <button type="button" onClick={() => setChallengeTotalDays(challengeTotalDays + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={challengeTotalDays >= 365}><CaretRight size={20} /></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div><div className="typo-body font-semibold text-foreground">{t('home.challenge.settings.minutes', 'Minutes/day')}</div><div className="typo-caption text-muted-foreground">{t('home.challenge.settings.minutesDesc', 'Daily goal')}</div></div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay - 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={challengeTargetMinutesPerDay <= 1}><CaretLeft size={20} /></button>
                        <span className="w-14 text-center font-mono font-semibold">{challengeTargetMinutesPerDay}</span>
                        <button type="button" onClick={() => setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 disabled:opacity-40" disabled={challengeTargetMinutesPerDay >= 240}><CaretRight size={20} /></button>
                      </div>
                    </div>
                    {!challengeStartedAtDay && (
                      <div className="flex justify-center pt-2">
                        <Button size="lg" className="w-auto px-10 rounded-full" onClick={() => { setChallengeStartedAtDay(formatLocalDayKey(new Date())); setChallengeHasProgress(false); }}>
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

        {/* Spacer for sticky bar */}
        <div className="h-14" />
      </div>

      {/* ═══ Sticky Play Bar ═══ */}
      {selectedModeConfig && (
        <div className="fixed bottom-[calc(var(--bottom-nav-offset,0.75rem)+3.5rem+0.5rem)] left-0 right-0 z-20 pointer-events-none flex justify-center px-4 md:bottom-4">
          <button
            type="button"
            onClick={handleLaunchMode}
            className="pointer-events-auto flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-2xl bg-transparent backdrop-blur-xl border-2 border-foreground shadow-lg active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 p-1.5 rounded-xl bg-foreground">
                <selectedModeConfig.icon size={18} weight="duotone" className="text-background" />
              </span>
              <span className="text-sm font-semibold whitespace-nowrap text-foreground">
                {t(selectedModeConfig.labelKey)}
              </span>
              <span className="shrink-0 p-1 rounded-full bg-foreground">
                <Play size={16} weight="fill" className="text-background" />
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              N-{currentModeNLevel} · {currentModeTrialsCount} {t('home.sticky.trials', 'essais')}
            </span>
          </button>
        </div>
      )}
    </PageTransition>
  );
}
