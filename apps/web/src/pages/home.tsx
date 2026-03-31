/**
 * Home page - Main landing with Journey path or free mode
 */

// Lightweight metadata - does NOT import heavy gameModeRegistry (~1MB)
import { getEffectiveModeConfig, getRouteForMode, type GameModeId } from '../lib/mode-metadata';
import {
  Button,
  ChallengeCalendar,
  ChallengePath,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Hatching,
  JourneyPath,
  Logo,
  PageTransition,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  useChallenge20Query,
  useDailyPlaytimeGate,
  useHasPremiumAccess,
  useJourneyState,
  useNextJourneySession,
} from '@neurodual/ui';
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  GiftIcon,
  GridFourIcon,
  InfoIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TimerIcon,
  TrophyIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { NeuralWebButton } from '../components/profile/neural-web-button';
import { OspanMeasureButton } from '../components/profile/ospan-measure-button';
import { RavensMeasureButton } from '../components/profile/ravens-measure-button';
import { HomeOnboardingOverlay } from '../components/onboarding/home-onboarding-overlay';
import {
  FREE_TRAINING_DEFAULT_PRESET_ID,
  FREE_TRAINING_QUAD_PRESET_ID,
  FREE_TRAINING_RECOMMENDED_PRESET_ID,
  FREE_TRAINING_TRI_PRESET_ID,
  getReliabilityForGameMode,
  useSettingsStore,
  type SavedJourney,
} from '../stores/settings-store';
import {
  formatLocalDayKey,
  type LocalDayKey,
  resolveDualTrackJourneyPreset,
  resolveJourneyPresentation,
  type DualTrackJourneyPreset,
} from '@neurodual/logic';
import {
  DrawerSheet,
  profileDevEffectSync,
  useJourneyRecordableSessionsQuery,
} from '@neurodual/ui';
import { useIsReady } from '../providers';
import { UpgradeDialog } from './settings/components/upgrade-dialog';
import { isChallengeValidatedToday } from '../lib/challenge-feedback';
import {
  createFreePlayIntent,
  createSynergyPlayIntent,
  nextSessionToPlayIntent,
} from '../lib/play-intent';
import { SynergyTabContent } from '../components/synergy/synergy-tab-content';
import { SynergyRoundChart } from '../components/synergy/synergy-round-chart';
import { useSessionsByGameMode, CustomTooltip } from '@neurodual/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { getActiveGameMode, useSynergyStore } from '../stores/synergy-store';
import { useStore } from 'zustand';
import { buildJourneyConfigSnapshot } from '../lib/journey-config';
import { useAlphaEnabled, useBetaEnabled } from '../hooks/use-beta-features';
import { useModeGates } from '../hooks/use-mode-gates';
import { useHapticTrigger } from '../hooks/use-haptic';
import { useAnalytics } from '../hooks/use-analytics';
import { GAME_MODES, type GameModeConfig } from './settings/config';
import { SafeResponsiveContainer } from '../components/charts/safe-responsive-container';

const modeConfigMap = new Map<string, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

function formatSynergyLoopProgress(loopIndex: number, stepIndex: 0 | 1): string {
  return `${loopIndex + 1 + (stepIndex === 1 ? 0.5 : 0)}`;
}

// Categories for the home mode picker (two-level: category chips → mode chips)
const HOME_CATEGORIES = [
  {
    labelKey: 'settings.gameMode.categoryDualNBack',
    modes: [
      'dualnback-classic',
      'sim-brainworkshop',
      'dual-catch',
      'dual-place',
      'dual-pick',
      'dual-memo',
      'dual-trace',
      'custom',
    ],
  },
  {
    labelKey: 'settings.gameMode.categorySpeedTime',
    modes: ['dual-time', 'pasat'],
  },
  {
    labelKey: 'settings.gameMode.categoryWorkingMemory',
    modes: [
      'corsi-block',
      'ospan',
      'running-span',
      'swm',
      'symmetry-span',
      'reading-span',
      'digit-span',
      'sternberg',
      'letter-number',
    ],
  },
  {
    labelKey: 'settings.gameMode.categoryInhibition',
    modes: ['flanker', 'go-nogo', 'stop-signal', 'antisaccade', 'simon'],
  },
  {
    labelKey: 'settings.gameMode.categoryFlexibility',
    modes: ['stroop-flex', 'wcst', 'trail-making', 'task-switching'],
  },
  {
    labelKey: 'settings.gameMode.categoryAttention',
    modes: ['dual-track', 'change-detection', 'ant', 'posner-cueing', 'visual-search'],
  },
  {
    labelKey: 'settings.gameMode.categoryVigilance',
    modes: ['pvt'],
  },
  {
    labelKey: 'settings.gameMode.categoryCognitiveControl',
    modes: ['ax-cpt'],
  },
  {
    labelKey: 'settings.gameMode.categoryReasoning',
    modes: ['mental-rotation', 'visual-logic', 'gridlock'],
  },
] as const;

const HOME_MODE_IDS: readonly GameModeId[] = Array.from(
  new Set(HOME_CATEGORIES.flatMap((category) => category.modes)),
);

function getJourneyRuleToneClass(tone: 'info' | 'up' | 'stay' | 'down' | 'neutral'): string {
  switch (tone) {
    case 'up':
      return 'bg-emerald-500';
    case 'stay':
      return 'bg-amber-500';
    case 'down':
      return 'bg-red-500';
    case 'neutral':
      return 'bg-muted-foreground/50';
    case 'info':
      return 'bg-cyan-500';
  }
}

// Mode info keys are now in locales (modeInfo.{mode}.{howItWorks|scoring|tip})

export function HomePage(): ReactNode {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const triggerHaptic = useHapticTrigger();
  const { isModePlayable } = useModeGates();
  const alphaEnabled = useAlphaEnabled();
  const betaEnabled = useBetaEnabled();
  const hasPremium = useHasPremiumAccess();
  const dailyPlaytimeGate = useDailyPlaytimeGate();
  const isSystemReady = useIsReady();
  const { track } = useAnalytics();

  // Synergy store — reactive subscription so chart updates when config/results change
  const synergySnapshot = useStore(useSynergyStore);

  // Settings for simulator levels - selected mode can differ temporarily if a flag was disabled
  const currentMode = useSettingsStore((s) => s.currentMode);
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);
  const isCaptureHybrid = useSettingsStore((s) => s.ui.visualThemePreset) === 'capture-hybrid';
  const homeOnboardingCompleted = useSettingsStore((s) => s.ui.homeOnboardingCompleted);
  const showOnboarding = !homeOnboardingCompleted;

  // Free training presets ("profiles") are stored in the settings UI blob so they sync.
  const freeTrainingPresetsByMode = useSettingsStore((s) => s.ui.freeTrainingPresetsByMode);
  const freeTrainingActivePresetIdByMode = useSettingsStore(
    (s) => s.ui.freeTrainingActivePresetIdByMode,
  );
  const ensureFreeTrainingDefaultPreset = useSettingsStore(
    (s) => s.ensureFreeTrainingDefaultPreset,
  );
  const applyFreeTrainingRecommendedPreset = useSettingsStore(
    (s) => s.applyFreeTrainingRecommendedPreset,
  );
  const applyFreeTrainingTemplatePreset = useSettingsStore(
    (s) => s.applyFreeTrainingTemplatePreset,
  );
  const applyFreeTrainingPreset = useSettingsStore((s) => s.applyFreeTrainingPreset);

  // Home primary tab is managed by settings store (synced to cloud)
  const homeTab = useSettingsStore((s) => s.ui.homeTab);
  const setHomeTab = useSettingsStore((s) => s.setHomeTab);
  const isJourneyActive = homeTab === 'journey';
  const journeyStartLevelFromUi = useSettingsStore((s) => s.ui.journeyStartLevel);
  const journeyTargetLevelFromUi = useSettingsStore((s) => s.ui.journeyTargetLevel);
  const updateActiveJourneyLevels = useSettingsStore((s) => s.updateActiveJourneyLevels);
  const challengeTotalDays = useSettingsStore((s) => s.ui.challengeTotalDays);
  const challengeTargetMinutesPerDay = useSettingsStore((s) => s.ui.challengeTargetMinutesPerDay);
  const challengeStartedAtDay = useSettingsStore((s) => s.ui.challengeStartedAtDay);
  const challengeHasProgress = useSettingsStore((s) => s.ui.challengeHasProgress);
  const setChallengeTotalDays = useSettingsStore((s) => s.setChallengeTotalDays);
  const setChallengeTargetMinutesPerDay = useSettingsStore(
    (s) => s.setChallengeTargetMinutesPerDay,
  );
  const setChallengeStartedAtDay = useSettingsStore((s) => s.setChallengeStartedAtDay);
  const setChallengeHasProgress = useSettingsStore((s) => s.setChallengeHasProgress);
  const setJourneyModeSetting = useSettingsStore((s) => s.setJourneyModeSetting);
  const setJourneyStrategyConfig = useSettingsStore((s) => s.setJourneyStrategyConfig);

  const favoriteModes = useSettingsStore((s) => s.ui.favoriteModes);
  const favoriteJourneyIds = useSettingsStore((s) => s.ui.favoriteJourneyIds);
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const savedJourneys = useSettingsStore((s) => s.savedJourneys);

  const [showModeInfo, setShowModeInfo] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showChallengeSettings, setShowChallengeSettings] = useState(false);
  const [showChallengeCalendar, setShowChallengeCalendar] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [journeyQuickSettingsOpen, setJourneyQuickSettingsOpen] = useState(false);
  const isChallengeLockedMinutes = challengeHasProgress;
  const homeBackTarget = `${location.pathname}${location.search}`;
  const consumedHomeIntentRef = useRef<string | null>(null);

  // Journey management - select activeJourney directly to avoid re-renders when other journeys change
  const activeJourneyId = useSettingsStore((s) => s.ui.activeJourneyId);
  const isJourneyVisible = useCallback(
    (journey: Pick<SavedJourney, 'gameMode' | 'reliability'>): boolean => {
      const reliability = journey.reliability ?? getReliabilityForGameMode(journey.gameMode);
      if (reliability === 'prototype') return false;
      if (reliability === 'alpha') return alphaEnabled;
      if (reliability === 'beta') return betaEnabled;
      return true;
    },
    [alphaEnabled, betaEnabled],
  );
  const selectableJourneys = useMemo(() => {
    const favoriteSet = new Set(favoriteJourneyIds ?? []);
    const visible = savedJourneys.filter(
      (journey) =>
        favoriteSet.has(journey.id) &&
        isJourneyVisible(journey) &&
        (!journey.gameMode ||
          journey.gameMode === 'dual-track-dnb-hybrid' ||
          isModePlayable(journey.gameMode as GameModeId)),
    );
    // Sort by favorite order
    const orderMap = new Map((favoriteJourneyIds ?? []).map((id, i) => [id, i]));
    visible.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    return visible;
  }, [favoriteJourneyIds, isJourneyVisible, isModePlayable, savedJourneys]);
  const activeJourney: SavedJourney | undefined =
    selectableJourneys.find((j) => j.id === activeJourneyId) ?? selectableJourneys[0];
  const activeJourneyDisplayName = activeJourney
    ? activeJourney.nameKey
      ? t(activeJourney.nameKey, activeJourney.name)
      : activeJourney.name
    : '';
  const effectiveActiveJourneyId = activeJourney?.id ?? activeJourneyId;
  const activeJourneyModeSettings = useSettingsStore((s) =>
    effectiveActiveJourneyId
      ? s.ui.journeyModeSettingsByJourneyId[effectiveActiveJourneyId]
      : undefined,
  );
  const calibratedDualTrackStartLevel =
    activeJourney?.gameMode === 'dual-track' &&
    activeJourneyModeSettings?.dualTrackJourneyCalibrationCompleted &&
    typeof activeJourneyModeSettings.dualTrackJourneyCalibrationStartLevel === 'number'
      ? activeJourneyModeSettings.dualTrackJourneyCalibrationStartLevel
      : undefined;
  const effectiveJourneyStartLevel =
    calibratedDualTrackStartLevel ?? activeJourney?.startLevel ?? journeyStartLevelFromUi;
  const dualTrackCalibrationPending =
    activeJourney?.gameMode === 'dual-track' &&
    !activeJourneyModeSettings?.dualTrackJourneyCalibrationCompleted;
  // Snapshot of previous calibration state so we can restore it if the user cancels recalibration
  const [previousCalibrationSnapshot, setPreviousCalibrationSnapshot] = useState<{
    startLevel: number;
    preset?: 'easy' | 'medium' | 'hard';
  } | null>(null);
  const activeJourneyIndex = useMemo(
    () => selectableJourneys.findIndex((journey) => journey.id === effectiveActiveJourneyId),
    [effectiveActiveJourneyId, selectableJourneys],
  );
  const canCycleJourneys = selectableJourneys.length > 1;
  const selectJourneyByOffset = useCallback(
    (direction: -1 | 1) => {
      if (!canCycleJourneys || activeJourneyIndex < 0) return;
      const nextIndex =
        (activeJourneyIndex + direction + selectableJourneys.length) % selectableJourneys.length;
      const nextJourney = selectableJourneys[nextIndex];
      if (!nextJourney) return;
      activateJourney(nextJourney.id);
      track('journey_switched', {
        source: 'home_header',
        journey_id: nextJourney.id,
        game_mode: nextJourney.gameMode ?? 'unknown',
        direction: direction < 0 ? 'previous' : 'next',
      });
    },
    [activateJourney, activeJourneyIndex, canCycleJourneys, selectableJourneys, track],
  );
  const handleDualTrackJourneyDifficultyChange = useCallback(
    (preset: DualTrackJourneyPreset) => {
      if (
        !activeJourney ||
        (activeJourney.gameMode !== 'dual-track' &&
          activeJourney.gameMode !== 'dual-track-dnb-hybrid')
      )
        return;
      setJourneyStrategyConfig(activeJourney.id, {
        ...(activeJourney.strategyConfig ?? {}),
        dualTrack: {
          ...(activeJourney.strategyConfig?.dualTrack ?? {}),
          preset,
        },
      });
      if (activeJourney.gameMode === 'dual-track') {
        setJourneyModeSetting(activeJourney.id, 'dualTrackJourneyCalibrationPreset', preset);
      }
    },
    [activeJourney, setJourneyStrategyConfig],
  );

  useEffect(() => {
    if (!activeJourney) return;
    if (activeJourney.id === activeJourneyId) return;
    activateJourney(activeJourney.id);
  }, [activateJourney, activeJourney, activeJourneyId]);

  const homeJourneyConfig = useMemo(
    () =>
      buildJourneyConfigSnapshot({
        journeyId: effectiveActiveJourneyId,
        savedJourney: activeJourney,
        startLevel: effectiveJourneyStartLevel,
        targetLevel: activeJourney?.targetLevel ?? journeyTargetLevelFromUi,
        legacyJourneyModeSettings: activeJourneyModeSettings,
      }),
    [
      activeJourney?.strategyConfig,
      activeJourney?.targetLevel,
      activeJourney?.gameMode,
      activeJourneyModeSettings?.hybridDnbSessionsPerBlock,
      activeJourneyModeSettings?.hybridTrackSessionsPerBlock,
      effectiveActiveJourneyId,
      effectiveJourneyStartLevel,
      journeyTargetLevelFromUi,
    ],
  );
  const activeJourneyPresentation = useMemo(
    () =>
      resolveJourneyPresentation({
        gameMode: activeJourney?.gameMode,
        strategyConfig: homeJourneyConfig.strategyConfig,
      }),
    [activeJourney?.gameMode, homeJourneyConfig.strategyConfig],
  );
  const translateJourneyText = useCallback(
    (
      text:
        | ReturnType<typeof resolveJourneyPresentation>['title']
        | ReturnType<typeof resolveJourneyPresentation>['rulesDescription']
        | ReturnType<typeof resolveJourneyPresentation>['selectorDescription']
        | null
        | undefined,
    ): string => {
      if (!text) return '';
      if (!text.key) return text.defaultValue;
      return t(text.key, {
        ...(text.values ?? {}),
        defaultValue: text.defaultValue,
      });
    },
    [t],
  );
  const activeJourneyModeConfig = useMemo(() => {
    const primaryModeId = activeJourneyPresentation.iconModeIds[0] ?? activeJourney?.gameMode;
    return modeConfigMap.get(primaryModeId ?? 'dualnback-classic');
  }, [activeJourney?.gameMode, activeJourneyPresentation.iconModeIds]);
  const activeJourneySelectorDescription = useMemo(() => {
    if (activeJourneyPresentation.selectorDescription) {
      return translateJourneyText(activeJourneyPresentation.selectorDescription);
    }
    if (activeJourneyModeConfig?.descKey) {
      return t(activeJourneyModeConfig.descKey, '');
    }
    return t(
      'home.journeySelector.defaultDesc',
      'Follow one path at a time and unlock the next stage only when the current one is mastered.',
    );
  }, [
    activeJourneyModeConfig?.descKey,
    activeJourneyPresentation.selectorDescription,
    t,
    translateJourneyText,
  ]);
  const { state: journeyState } = useJourneyState(homeJourneyConfig);
  const { nextSession: nextJourneySession } = useNextJourneySession(homeJourneyConfig);
  const { data: journeySessions } = useJourneyRecordableSessionsQuery(
    effectiveActiveJourneyId ?? null,
    activeJourney?.gameMode,
  );
  const journeyChartData = useMemo(() => {
    const last5 = journeySessions.slice(-5);
    const data: { slot: string; idx: string; score?: number }[] = last5.map((s, index) => ({
      slot: `journey-${index}`,
      idx: `N-${s.nLevel}`,
      score: Math.round(Math.min(100, Math.max(0, s.dPrime * 33))),
    }));
    for (let i = data.length; i < 5; i++) {
      data.push({ slot: `journey-${i}`, idx: `${i + 1}` });
    }
    return data;
  }, [journeySessions]);
  const journeyChartLabels = useMemo(
    () => new Map(journeyChartData.map((point) => [point.slot, point.idx])),
    [journeyChartData],
  );
  const calibratedDualTrackPreset =
    activeJourney?.gameMode === 'dual-track' &&
    activeJourneyModeSettings?.dualTrackJourneyCalibrationCompleted
      ? (activeJourneyModeSettings.dualTrackJourneyCalibrationPreset as
          | DualTrackJourneyPreset
          | undefined)
      : undefined;
  const activeDualTrackJourneyDifficulty =
    activeJourney?.gameMode === 'dual-track' || activeJourney?.gameMode === 'dual-track-dnb-hybrid'
      ? (calibratedDualTrackPreset ??
        resolveDualTrackJourneyPreset({
          gameMode: activeJourney.gameMode,
          strategyConfig: homeJourneyConfig.strategyConfig,
        }))
      : null;
  const { data: challengeState, dailyTotals: challengeDailyTotals } = useChallenge20Query({
    totalDays: challengeTotalDays,
    targetMinutesPerDay: challengeTargetMinutesPerDay,
    startDay: challengeStartedAtDay ?? formatLocalDayKey(new Date()),
  });
  const challengeValidatedToday =
    Boolean(challengeStartedAtDay) &&
    !challengeState.isComplete &&
    isChallengeValidatedToday(challengeState);

  useEffect(() => {
    return profileDevEffectSync('HomePage.challengeHasProgress', () => {
      if (!challengeStartedAtDay) return;
      if (challengeHasProgress) return;
      if (challengeState.completedDays > 0) {
        setChallengeHasProgress(true);
      }
    });
  }, [
    challengeHasProgress,
    challengeStartedAtDay,
    challengeState.completedDays,
    setChallengeHasProgress,
  ]);

  // Binary simulator journeys can dynamically expand downward (e.g. start N-2, fail -> add N-1).
  // The projector exposes this via `suggestedStartLevel`, but Home must persist it in settings
  // so the rendered path (generated from startLevel) actually includes the new stage.
  useEffect(() => {
    return profileDevEffectSync('HomePage.suggestedStartLevel', () => {
      const supportsDynamicDownwardExpansion =
        activeJourney?.gameMode === 'dualnback-classic' ||
        activeJourney?.gameMode === 'sim-brainworkshop' ||
        activeJourney?.gameMode === 'dual-trace';
      if (!supportsDynamicDownwardExpansion) return;

      const suggested = journeyState?.suggestedStartLevel;
      if (typeof suggested !== 'number' || !Number.isFinite(suggested)) return;

      const currentStart = effectiveJourneyStartLevel;
      const currentTarget = activeJourney?.targetLevel ?? journeyTargetLevelFromUi;
      if (suggested >= currentStart) return;

      updateActiveJourneyLevels(suggested, currentTarget);
    });
  }, [
    activeJourney?.gameMode,
    journeyState?.suggestedStartLevel,
    activeJourney?.targetLevel,
    effectiveJourneyStartLevel,
    journeyStartLevelFromUi,
    journeyTargetLevelFromUi,
    updateActiveJourneyLevels,
  ]);

  // All playable modes (for browsing/discovery)
  const allPlayableModes = useMemo(
    () => HOME_MODE_IDS.filter((modeId) => isModePlayable(modeId)),
    [isModePlayable],
  );

  // Favorite + playable modes shown in the carousel
  const visibleModes = useMemo(() => {
    const favoriteSet = new Set(favoriteModes ?? []);
    const filtered = allPlayableModes.filter((m) => favoriteSet.has(m));
    const base = filtered.length > 0 ? filtered : allPlayableModes.slice(0, 1);
    // Always include currentMode so the carousel and play card stay in sync
    // with the mode selected in settings, even if it's not a favorite.
    if (
      currentMode &&
      !base.includes(currentMode as GameModeId) &&
      allPlayableModes.includes(currentMode as GameModeId)
    ) {
      return [...base, currentMode as GameModeId];
    }
    return base;
  }, [allPlayableModes, currentMode, favoriteModes]);

  const [previewMode, setPreviewMode] = useState<GameModeId>(() => {
    // Only use currentMode if it's both playable AND in the visible (favorite) list.
    // Otherwise fall back to the first visible mode to avoid sync-effect loops.
    if (isModePlayable(currentMode) && visibleModes.includes(currentMode as GameModeId)) {
      return currentMode;
    }
    return visibleModes[0] ?? 'dualnback-classic';
  });

  // Cross-page intent: open Home directly on free training card (used by tutorial completion).
  useEffect(() => {
    return profileDevEffectSync('HomePage.consumeLocationState', () => {
      const state = location.state as unknown as
        | {
            homeTab?: 'journey' | 'free' | 'challenge' | 'synergy';
            returnTab?: 'synergy';
            suggestedModeId?: GameModeId;
          }
        | null
        | undefined;
      if (!state) return;

      // Synergy return: consume returnTab as homeTab
      const effectiveTab = state.returnTab ?? state.homeTab;

      const intentSignature = JSON.stringify({
        homeTab: effectiveTab ?? null,
        suggestedModeId: state.suggestedModeId ?? null,
      });
      if (consumedHomeIntentRef.current === intentSignature) return;
      consumedHomeIntentRef.current = intentSignature;

      if (
        (effectiveTab === 'journey' ||
          effectiveTab === 'free' ||
          effectiveTab === 'challenge' ||
          effectiveTab === 'synergy') &&
        effectiveTab !== homeTab
      ) {
        setHomeTab(effectiveTab);
      }
      if (state.suggestedModeId && state.suggestedModeId !== previewMode) {
        setPreviewMode(state.suggestedModeId);
        if (isModePlayable(state.suggestedModeId) && state.suggestedModeId !== currentMode) {
          setCurrentMode(state.suggestedModeId);
        }
      }

      navigate('/', { replace: true, state: null });
    });
  }, [
    currentMode,
    homeTab,
    isModePlayable,
    location.state,
    navigate,
    previewMode,
    setCurrentMode,
    setHomeTab,
  ]);

  useEffect(() => {
    return profileDevEffectSync('HomePage.syncPreviewMode', () => {
      if (
        isModePlayable(currentMode) &&
        previewMode !== currentMode &&
        visibleModes.includes(currentMode as GameModeId)
      ) {
        setPreviewMode(currentMode);
      }
    });
  }, [currentMode, isModePlayable, previewMode, visibleModes]);

  const selectedMode = previewMode;
  const currentModeSettings = useSettingsStore((s) => s.modes[selectedMode]) ?? {};
  const recentSessionsForMode = useSessionsByGameMode(selectedMode);
  const recentScoresChartData = useMemo(() => {
    const completed = recentSessionsForMode.filter((s) => s.reason === 'completed');
    const last5 = completed.slice(0, 5).reverse();
    const data: { slot: string; idx: string; score?: number }[] = last5.map((s, index) => ({
      slot: `recent-${index}`,
      idx: `N-${s.nLevel}`,
      score: Math.round((s.unifiedMetrics?.accuracy ?? 0) * 100),
    }));
    for (let i = data.length; i < 5; i++) {
      data.push({ slot: `recent-${i}`, idx: `${i + 1}` });
    }
    return data;
  }, [recentSessionsForMode]);
  const recentScoresChartLabels = useMemo(
    () => new Map(recentScoresChartData.map((point) => [point.slot, point.idx])),
    [recentScoresChartData],
  );
  const isBrainWorkshopFreeMode = selectedMode === 'sim-brainworkshop';
  const hasPresetCycling = selectedMode === 'sim-brainworkshop' || selectedMode === 'dual-trace';

  // Ensure the default slot exists so cycling always has a stable baseline.
  useEffect(() => {
    return profileDevEffectSync('HomePage.ensureDefaultPreset', () => {
      if (!hasPresetCycling) return;
      ensureFreeTrainingDefaultPreset(selectedMode);
    });
  }, [ensureFreeTrainingDefaultPreset, hasPresetCycling, selectedMode]);

  const selectedFreeTrainingPresetId =
    freeTrainingActivePresetIdByMode[selectedMode] ?? FREE_TRAINING_DEFAULT_PRESET_ID;
  const freeTrainingProfiles = useMemo(() => {
    if (!hasPresetCycling) return [];

    const presets = freeTrainingPresetsByMode[selectedMode] ?? [];
    const userPresets = presets.filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID);

    // Tri/Quad templates only apply to Brain Workshop
    const builtInTemplates = isBrainWorkshopFreeMode
      ? [FREE_TRAINING_TRI_PRESET_ID, FREE_TRAINING_QUAD_PRESET_ID]
      : [];

    return [
      FREE_TRAINING_RECOMMENDED_PRESET_ID,
      ...builtInTemplates,
      FREE_TRAINING_DEFAULT_PRESET_ID,
      ...userPresets.map((p) => p.id),
    ];
  }, [freeTrainingPresetsByMode, hasPresetCycling, isBrainWorkshopFreeMode, selectedMode]);

  const selectedFreeTrainingProfileLabel = useMemo(() => {
    if (!hasPresetCycling) return null;

    if (selectedFreeTrainingPresetId === FREE_TRAINING_RECOMMENDED_PRESET_ID) {
      return isBrainWorkshopFreeMode
        ? t('settings.presets.dualNBack', 'Dual N-Back')
        : t('settings.presets.recommended');
    }
    if (selectedFreeTrainingPresetId === FREE_TRAINING_TRI_PRESET_ID) {
      return t('settings.presets.tri', 'Tri N-Back');
    }
    if (selectedFreeTrainingPresetId === FREE_TRAINING_QUAD_PRESET_ID) {
      return t('settings.presets.quad', 'Quad N-Back');
    }
    if (selectedFreeTrainingPresetId === FREE_TRAINING_DEFAULT_PRESET_ID) {
      return t('settings.presets.default', 'Custom');
    }

    const presets = freeTrainingPresetsByMode[selectedMode] ?? [];
    return presets.find((p) => p.id === selectedFreeTrainingPresetId)?.name ?? null;
  }, [freeTrainingPresetsByMode, hasPresetCycling, selectedFreeTrainingPresetId, selectedMode, t]);

  const cycleFreeTrainingProfile = (direction: 1 | -1) => {
    if (!hasPresetCycling) return;
    if (freeTrainingProfiles.length < 2) return;

    const currentIndex = freeTrainingProfiles.indexOf(selectedFreeTrainingPresetId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      (safeIndex + direction + freeTrainingProfiles.length) % freeTrainingProfiles.length;
    const nextId = freeTrainingProfiles[nextIndex];
    if (!nextId) return;

    if (nextId === FREE_TRAINING_RECOMMENDED_PRESET_ID) {
      applyFreeTrainingRecommendedPreset(selectedMode);
      return;
    }
    if (nextId === FREE_TRAINING_TRI_PRESET_ID || nextId === FREE_TRAINING_QUAD_PRESET_ID) {
      applyFreeTrainingTemplatePreset(selectedMode, nextId);
      return;
    }
    applyFreeTrainingPreset(selectedMode, nextId);
  };

  const canCycleModes = visibleModes.length > 1;

  // Cycle to next/previous visible mode
  const cycleMode = (direction: 1 | -1) => {
    const currentIndex = visibleModes.indexOf(selectedMode);
    if (currentIndex === -1) {
      const firstVisible = visibleModes[0];
      if (firstVisible) {
        setPreviewMode(firstVisible);
        setCurrentMode(firstVisible);
      }
      return;
    }
    const nextIndex = (currentIndex + direction + visibleModes.length) % visibleModes.length;
    const nextMode = visibleModes[nextIndex];
    if (nextMode) {
      setPreviewMode(nextMode);
      setCurrentMode(nextMode);
    }
  };

  // Get current mode settings (with fallback for legacy mode IDs)
  const effectiveMode = selectedMode;
  const effectiveModeConfig = getEffectiveModeConfig(effectiveMode, currentModeSettings);
  const currentTrialsCount = effectiveModeConfig.trialsCount;

  // Handle level change for any mode
  // Read from store state directly to avoid stale closures
  // N-4+ allowed for all users - UI shows locked play button for non-premium
  const handleLevelChange = (mode: GameModeId, delta: number) => {
    const state = useSettingsStore.getState();
    const modeSettings = state.modes[mode] ?? {};
    const modeConfig = getEffectiveModeConfig(mode, modeSettings);
    const currentLevel = modeConfig.nLevel;
    const newLevel = Math.max(1, Math.min(10, currentLevel + delta));
    setModeSettingFor(mode, 'nLevel', newLevel);
  };

  // Handle trials count change
  // Read from store state directly to avoid stale closures
  const handleTrialsChange = (mode: GameModeId, delta: number) => {
    const state = useSettingsStore.getState();
    const modeSettings = state.modes[mode] ?? {};
    const modeConfig = getEffectiveModeConfig(mode, modeSettings);
    const current = modeConfig.trialsCount;
    const newCount = Math.max(5, Math.min(50, current + delta));
    setModeSettingFor(mode, 'trialsCount', newCount);
  };

  return (
    <PageTransition
      className="flex-1 w-full max-w-md md:max-w-lg mx-auto self-stretch text-center"
      data-testid="home-page"
    >
      {showOnboarding && <HomeOnboardingOverlay />}

      <div className="relative flex min-h-full w-full flex-col items-center gap-3 pb-6">
        {/* Fiches accrochées — OSpan, Ravens, Profil cognitif (gauche → droite) */}
        <div
          className="absolute -top-1 -left-1 z-10 flex items-start gap-1"
          data-onboarding-target="fiches"
        >
          <div data-onboarding-target="fiche-ospan">
            <OspanMeasureButton />
          </div>
          <div data-onboarding-target="fiche-visual-logic">
            <RavensMeasureButton />
          </div>
          <div data-onboarding-target="fiche-profile">
            <NeuralWebButton />
          </div>
        </div>

        <div className="w-full pt-16 pb-5 sm:pt-20">
          <div className="px-6 py-4">
            <Logo
              className="w-full max-w-[200px] sm:max-w-[240px] h-auto text-foreground mx-auto"
              ariaLabel={t('home.ariaLabel')}
              showPremiumBadge={hasPremium}
            />
          </div>
        </div>

        {/* Mode Selector - Tabs in unified card */}
        {journeyState && (
          <div
            className="surface-card-typography home-card-typography w-full overflow-hidden rounded-[22px] border border-border/50 bg-card/85 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl"
            data-onboarding-target="main-card"
          >
            <Tabs
              value={homeTab}
              onValueChange={(value) => {
                if (
                  value === 'journey' ||
                  value === 'free' ||
                  value === 'challenge' ||
                  value === 'synergy'
                ) {
                  setHomeTab(value);
                }
              }}
              className="w-full"
            >
              {/* Tabs header - segmented control style */}
              <TabsList className="w-full rounded-none border-0 bg-transparent p-2">
                <TabsTrigger
                  value="free"
                  className="home-tab-label flex-1 rounded-xl"
                  data-onboarding-target="tab-training"
                >
                  {t('home.modeSelector.freeMode', 'Training')}
                </TabsTrigger>
                <TabsTrigger
                  value="synergy"
                  className="home-tab-label flex-1 rounded-xl"
                  data-onboarding-target="tab-synergy"
                >
                  {t('home.modeSelector.synergy', 'Synergy')}
                </TabsTrigger>
                <TabsTrigger
                  value="journey"
                  className="home-tab-label flex-1 rounded-xl"
                  data-onboarding-target="tab-journey"
                >
                  {t('home.modeSelector.journey', 'Journey')}
                </TabsTrigger>
                <TabsTrigger
                  value="challenge"
                  className="home-tab-label flex-1 rounded-xl"
                  data-onboarding-target="tab-challenge"
                >
                  {t('home.modeSelector.challenge', 'Challenge')}
                </TabsTrigger>
              </TabsList>

              {/* Woven border separator */}
              <Hatching id="tabs-hatch" />

              {/* Journey Path content */}
              <TabsContent value="journey" className="relative mt-0 w-full">
                {activeJourney && (
                  <div className="relative px-4 pt-8">
                    <div className="w-full">
                      <div className="flex items-center gap-3">
                        {canCycleJourneys && (
                          <button
                            type="button"
                            onClick={() => selectJourneyByOffset(-1)}
                            data-capture-control="icon"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/75 text-muted-foreground shadow-[0_14px_32px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 hover:text-foreground"
                            aria-label={t('journey.previous', 'Previous journey')}
                          >
                            <CaretLeftIcon size={16} weight="bold" />
                          </button>
                        )}

                        <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                          {activeJourneyPresentation.iconModeIds.length > 1 ? (
                            <div className="flex items-center gap-1.5">
                              {activeJourneyPresentation.iconModeIds.map((modeId, index) => {
                                const Icon = modeConfigMap.get(modeId)?.icon ?? TrophyIcon;
                                return (
                                  <div key={modeId} className="flex items-center gap-1.5">
                                    {index > 0 ? (
                                      <span className="text-muted-foreground/40 text-xs font-medium select-none">
                                        &amp;
                                      </span>
                                    ) : null}
                                    <Icon size={22} className="text-muted-foreground" />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            (() => {
                              const Icon = activeJourneyModeConfig?.icon ?? TrophyIcon;
                              return <Icon size={24} className="text-muted-foreground" />;
                            })()
                          )}
                          <h2
                            className="home-free-mode-title mt-1 block whitespace-normal text-pretty leading-tight font-semibold text-foreground"
                            title={activeJourneyDisplayName}
                          >
                            {activeJourneyDisplayName}
                          </h2>
                          <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="home-journey-range font-mono shrink-0 whitespace-nowrap">
                              N-{effectiveJourneyStartLevel ?? 1} {t('journey.levelTo', 'to')} N-
                              {activeJourney.targetLevel ?? 5}
                            </span>
                            <DrawerSheet
                              srTitle={t('common.info', 'Info')}
                              trigger={
                                <button
                                  type="button"
                                  data-capture-control="ghost-icon"
                                  className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                  aria-label={t('common.info', 'Info')}
                                >
                                  <InfoIcon
                                    size={isCaptureHybrid ? 16 : 14}
                                    weight={isCaptureHybrid ? 'bold' : 'regular'}
                                  />
                                </button>
                              }
                            >
                              <p className="typo-body text-muted-foreground">
                                {activeJourneySelectorDescription}
                              </p>
                            </DrawerSheet>
                          </div>

                          {(() => {
                            const MAX_DOTS = 5;
                            const activeIndex = activeJourneyIndex;
                            const total = selectableJourneys.length;
                            if (total <= 1 || activeIndex < 0) return null;

                            let windowStart = 0;
                            if (total > MAX_DOTS) {
                              windowStart = Math.min(
                                Math.max(0, activeIndex - Math.floor(MAX_DOTS / 2)),
                                total - MAX_DOTS,
                              );
                            }
                            const windowEnd = Math.min(windowStart + MAX_DOTS, total);
                            const windowedJourneys = selectableJourneys.slice(
                              windowStart,
                              windowEnd,
                            );

                            return (
                              <div className="mt-2 flex items-center justify-center gap-0.5">
                                {windowedJourneys.map((journey, windowIndex) => {
                                  const isActive = journey.id === activeJourney.id;
                                  const isEdge =
                                    total > MAX_DOTS &&
                                    ((windowIndex === 0 && windowStart > 0) ||
                                      (windowIndex === windowedJourneys.length - 1 &&
                                        windowEnd < total));
                                  const dotColor = isActive
                                    ? 'bg-foreground'
                                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50';
                                  const displayName = journey.nameKey
                                    ? t(journey.nameKey, journey.name)
                                    : journey.name;

                                  return (
                                    <button
                                      key={journey.id}
                                      type="button"
                                      onClick={() => {
                                        activateJourney(journey.id);
                                        track('journey_switched', {
                                          source: 'home_dots',
                                          journey_id: journey.id,
                                          game_mode: journey.gameMode ?? 'unknown',
                                          direction: 'picker',
                                        });
                                      }}
                                      className="flex h-8 w-8 items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                      aria-label={displayName}
                                    >
                                      <span
                                        className={`rounded-full transition-all ${dotColor} ${
                                          isEdge ? 'w-1.5 h-1.5 opacity-50' : 'w-2 h-2'
                                        }`}
                                      />
                                    </button>
                                  );
                                })}
                                {total > MAX_DOTS && (
                                  <span className="text-[10px] text-muted-foreground/60 font-mono ml-1 tabular-nums">
                                    {activeIndex + 1}/{total}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {canCycleJourneys && (
                          <button
                            type="button"
                            onClick={() => selectJourneyByOffset(1)}
                            data-capture-control="icon"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/75 text-muted-foreground shadow-[0_14px_32px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 hover:text-foreground"
                            aria-label={t('journey.next', 'Next journey')}
                          >
                            <CaretRightIcon size={16} weight="bold" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeJourney ? (
                  <>
                    {/* HERO: The Cards */}
                    <div className="mt-4">
                      <JourneyPath
                        state={journeyState}
                        hasPremium={hasPremium}
                        emphasis="hero"
                        gameMode={activeJourney.gameMode as string | undefined}
                        labels={{
                          pick: t('journey.stageLabels.pick', 'Pick'),
                          catch: t('journey.stageLabels.catch', 'Catch'),
                          place: t('journey.stageLabels.place', 'Place'),
                          memo: t('journey.stageLabels.memo', 'Memo'),
                          simulator: translateJourneyText(activeJourneyPresentation.title),
                          locked: t('journey.locked', 'Locked'),
                        }}
                      />
                    </div>

                    {/* Journey completed banner */}
                    {journeyState && journeyState.currentStage > journeyState.stages.length && (
                      <div className="mt-4 px-5">
                        <div className="flex items-start gap-3 rounded-[1rem] border border-border/50 bg-card/60 backdrop-blur-xl px-4 py-3">
                          <TrophyIcon
                            size={24}
                            weight="duotone"
                            className="text-amber-500 shrink-0 mt-0.5"
                          />
                          <div className="flex flex-col items-start min-w-0">
                            <span className="text-sm font-bold text-foreground">
                              {t('journey.completed.title', 'Journey completed!')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t('journey.completed.subtitle', 'All steps completed. Congrats!')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Footer: progression rules + quick settings */}
                    <div className="mt-12 px-4 pb-2">
                      <div className="space-y-2 px-1">
                        <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
                          <DrawerSheet
                            title={translateJourneyText(activeJourneyPresentation.rulesDescription)}
                            trigger={
                              <button type="button" className="home-footer-pill">
                                {t('home.training.howItWorksTitle', 'How it works')}
                              </button>
                            }
                          >
                            <ul className="typo-body text-muted-foreground space-y-1">
                              {activeJourneyPresentation.rules.map((rule) => (
                                <li
                                  key={rule.text.key ?? rule.text.defaultValue}
                                  className="flex items-center gap-2"
                                >
                                  <span
                                    className={cn(
                                      'w-2 h-2 rounded-full',
                                      getJourneyRuleToneClass(rule.tone),
                                    )}
                                  />
                                  {translateJourneyText(rule.text)}
                                </li>
                              ))}
                            </ul>
                          </DrawerSheet>

                          <button
                            type="button"
                            onClick={() => setJourneyQuickSettingsOpen((open) => !open)}
                            className="home-footer-pill inline-flex items-center gap-1.5"
                            aria-expanded={journeyQuickSettingsOpen}
                          >
                            <CaretDownIcon
                              size={13}
                              weight="bold"
                              className={`transition-transform duration-200 ${
                                journeyQuickSettingsOpen ? 'rotate-0' : '-rotate-90'
                              }`}
                            />
                            {t('home.quickSettings', 'Quick settings')}
                          </button>

                          {activeJourney?.gameMode === 'dual-track' &&
                            !dualTrackCalibrationPending && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!effectiveActiveJourneyId) return;
                                  setPreviousCalibrationSnapshot({
                                    startLevel: effectiveJourneyStartLevel,
                                    preset: calibratedDualTrackPreset,
                                  });
                                  setJourneyModeSetting(
                                    effectiveActiveJourneyId,
                                    'dualTrackJourneyCalibrationCompleted',
                                    false,
                                  );
                                  setJourneyModeSetting(
                                    effectiveActiveJourneyId,
                                    'dualTrackJourneyCalibrationStartLevel',
                                    undefined,
                                  );
                                  setJourneyModeSetting(
                                    effectiveActiveJourneyId,
                                    'dualTrackJourneyCalibrationPreset',
                                    undefined,
                                  );
                                  updateActiveJourneyLevels(2, activeJourney?.targetLevel ?? 5);
                                }}
                                className="home-footer-pill"
                              >
                                {t('journey.calibration.redo', 'Recalibrer')}
                              </button>
                            )}

                          <Link
                            to="/settings/journey"
                            state={{ backTo: homeBackTarget }}
                            className="home-footer-pill"
                          >
                            {t('home.journeySettings', 'Journey settings')}
                          </Link>
                        </div>

                        <div
                          className={cn(
                            'overflow-hidden transition-all duration-200',
                            journeyQuickSettingsOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0',
                          )}
                        >
                          <div className="border-t border-border/35 pt-3 pb-3">
                            {(() => {
                              const mode = activeJourney?.gameMode;
                              const hasStartLevel =
                                mode === 'dualnback-classic' ||
                                mode === 'sim-brainworkshop' ||
                                mode === 'dual-trace' ||
                                mode === 'dual-track-dnb-hybrid';
                              const hasDifficulty =
                                (mode === 'dual-track' || mode === 'dual-track-dnb-hybrid') &&
                                activeDualTrackJourneyDifficulty;

                              if (!hasStartLevel && !hasDifficulty) {
                                return (
                                  <div className="text-sm text-muted-foreground">
                                    {t(
                                      'home.journeyQuickSettingsUnavailable',
                                      'No quick settings available for this journey yet.',
                                    )}
                                  </div>
                                );
                              }

                              const targetLevel =
                                activeJourney?.targetLevel ?? journeyTargetLevelFromUi;

                              return (
                                <div className="flex flex-col gap-3">
                                  {hasStartLevel && (
                                    <div className="flex items-center">
                                      <span className="home-control-label text-muted-foreground w-20 shrink-0 text-left">
                                        {t('home.journeyStartLevel', 'Start level')}
                                      </span>
                                      <div className="flex-1 flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateActiveJourneyLevels(
                                              effectiveJourneyStartLevel - 1,
                                              targetLevel,
                                            )
                                          }
                                          data-capture-control="icon"
                                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                          disabled={effectiveJourneyStartLevel <= 1}
                                        >
                                          <MinusIcon size={18} weight="bold" />
                                        </button>
                                        <span className="home-control-value w-12 text-center font-mono font-semibold">
                                          N-{effectiveJourneyStartLevel}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateActiveJourneyLevels(
                                              effectiveJourneyStartLevel + 1,
                                              targetLevel,
                                            )
                                          }
                                          data-capture-control="icon"
                                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                          disabled={effectiveJourneyStartLevel >= targetLevel}
                                        >
                                          <PlusIcon size={18} weight="bold" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {hasDifficulty && (
                                    <div className="flex items-center">
                                      <span className="home-control-label text-muted-foreground w-20 shrink-0 text-left">
                                        {mode === 'dual-track'
                                          ? t('settings.tangram.difficulty', 'Difficulty')
                                          : t('journey.setup.profile', 'Profile')}
                                      </span>
                                      <div className="flex-1 flex items-center justify-center">
                                        <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
                                          {(
                                            [
                                              ['easy', t('journey.preset.easy', 'Easy')],
                                              ['medium', t('journey.preset.medium', 'Recommended')],
                                              ['hard', t('journey.preset.hard', 'Hard')],
                                            ] as const
                                          ).map(([preset, label]) => {
                                            const active =
                                              activeDualTrackJourneyDifficulty === preset;
                                            return (
                                              <button
                                                key={preset}
                                                type="button"
                                                onClick={() =>
                                                  handleDualTrackJourneyDifficultyChange(
                                                    preset as DualTrackJourneyPreset,
                                                  )
                                                }
                                                className={cn(
                                                  'rounded-full h-9 px-3 text-xs font-medium transition-colors',
                                                  active
                                                    ? 'bg-foreground text-background'
                                                    : 'text-muted-foreground hover:text-foreground',
                                                )}
                                              >
                                                {label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'home.journeyNoFavorites',
                        'No favorite journeys yet. Add some from the settings.',
                      )}
                    </p>
                    <Link
                      to="/settings/journey"
                      state={{ backTo: homeBackTarget }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {t('home.journeyGoToSettings', 'Journey settings')}
                    </Link>
                  </div>
                )}
              </TabsContent>

              {/* Free mode content */}
              <TabsContent value="free" className="relative mt-0 w-full px-3 pt-8 pb-0">
                {(() => {
                  const config = modeConfigMap.get(selectedMode);
                  const Icon = config?.icon ?? SlidersHorizontalIcon;
                  const modeLevel = effectiveModeConfig.nLevel;
                  const isComingSoonMode = !isModePlayable(selectedMode);
                  const isSimulator =
                    selectedMode === 'dualnback-classic' || selectedMode === 'sim-brainworkshop';

                  return (
                    <div className="w-full">
                      {/* Mode selector - arrows around icon/name */}
                      <div className="flex items-center gap-3 mb-3">
                        {canCycleModes && (
                          <button
                            type="button"
                            onClick={() => cycleMode(-1)}
                            data-capture-control="icon"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/75 text-muted-foreground shadow-[0_14px_32px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 hover:text-foreground"
                            aria-label={t('common.previous', 'Previous')}
                          >
                            <CaretLeftIcon size={16} weight="bold" />
                          </button>
                        )}

                        <div className="flex-1 flex flex-col items-center text-center min-w-0">
                          <Icon size={24} className={'text-muted-foreground'} />
                          <div className="flex items-center justify-center gap-1 mt-1 min-w-0">
                            <h3
                              className={`home-free-mode-title block max-w-[220px] sm:max-w-[260px] truncate font-semibold ${
                                isComingSoonMode ? 'text-muted-foreground' : 'text-foreground'
                              }`}
                              title={t(config?.labelKey ?? '', selectedMode)}
                            >
                              {t(config?.labelKey ?? '', selectedMode)}
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShowModeInfo(true)}
                              data-capture-control="ghost-icon"
                              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={t('common.moreInfo', 'More info')}
                            >
                              <InfoIcon
                                size={isCaptureHybrid ? 16 : 14}
                                weight={isCaptureHybrid ? 'bold' : 'regular'}
                              />
                            </button>
                          </div>
                          {isComingSoonMode && (
                            <div className="mt-1 flex items-center justify-center">
                              <span
                                className="home-mode-badge px-2 py-0.5 font-bold rounded-full border border-border/50 bg-card/60 backdrop-blur-xl text-muted-foreground uppercase inline-flex items-center gap-1"
                                data-locked="true"
                                data-capture-control="pill"
                              >
                                <LockIcon size={12} weight="bold" />
                                {t('common.comingSoon', 'Coming soon')}
                              </span>
                            </div>
                          )}
                          <p className="home-free-mode-desc text-muted-foreground mt-0.5">
                            {t(config?.descKey ?? '', '')}
                          </p>
                          {/* Mode indicator dots (windowed) */}
                          {(() => {
                            const MAX_DOTS = 5;
                            const activeIndex = visibleModes.indexOf(selectedMode);
                            const total = visibleModes.length;
                            // Compute window start so active dot stays centered
                            let windowStart = 0;
                            if (total > MAX_DOTS) {
                              windowStart = Math.min(
                                Math.max(0, activeIndex - Math.floor(MAX_DOTS / 2)),
                                total - MAX_DOTS,
                              );
                            }
                            const windowEnd = Math.min(windowStart + MAX_DOTS, total);
                            const windowedModes = visibleModes.slice(windowStart, windowEnd);

                            return (
                              <div className="flex items-center justify-center gap-0.5 mt-2">
                                {windowedModes.map((mode, wi) => {
                                  const isActive = mode === selectedMode;
                                  // Edge dots scale down when windowed
                                  const isEdge =
                                    total > MAX_DOTS &&
                                    ((wi === 0 && windowStart > 0) ||
                                      (wi === windowedModes.length - 1 && windowEnd < total));
                                  const dotColor = isActive
                                    ? 'bg-foreground'
                                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50';
                                  return (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() => {
                                        setPreviewMode(mode);
                                        if (isModePlayable(mode)) setCurrentMode(mode);
                                      }}
                                      className="w-8 h-8 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full transition-all"
                                      aria-label={t(modeConfigMap.get(mode)?.labelKey ?? '', mode)}
                                      data-locked={!isModePlayable(mode) ? 'true' : undefined}
                                      aria-disabled={!isModePlayable(mode) ? true : undefined}
                                    >
                                      <span
                                        className={`rounded-full transition-all ${dotColor} ${
                                          isEdge ? 'w-1.5 h-1.5 opacity-50' : 'w-2 h-2'
                                        }`}
                                      />
                                    </button>
                                  );
                                })}
                                {total > MAX_DOTS && (
                                  <span className="text-[10px] text-muted-foreground/60 font-mono ml-1 tabular-nums">
                                    {activeIndex + 1}/{total}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {/* Browse all modes */}
                          <Link
                            to="/settings/mode/mode"
                            state={{ backTo: homeBackTarget }}
                            data-capture-control="pill"
                            className="inline-flex items-center justify-center gap-1.5 mt-2 px-4 py-1.5 rounded-full text-sm font-medium border border-border/50 bg-card/60 backdrop-blur-xl text-foreground/70 shadow-[0_4px_12px_-6px_hsl(var(--glass-shadow)/0.25)] hover:border-border/70 hover:bg-card/85 hover:text-foreground transition-all mx-auto"
                            aria-label={t('home.allModes', 'Tous les jeux')}
                            data-onboarding-target="all-games"
                          >
                            <GridFourIcon size={16} weight="bold" />
                            {t('home.allModes', 'Tous les jeux')}
                          </Link>
                        </div>

                        {canCycleModes && (
                          <button
                            type="button"
                            onClick={() => cycleMode(1)}
                            data-capture-control="icon"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/75 text-muted-foreground shadow-[0_14px_32px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 hover:text-foreground"
                            aria-label={t('common.next', 'Next')}
                          >
                            <CaretRightIcon size={16} weight="bold" />
                          </button>
                        )}
                      </div>

                      {/* Settings section — collapsible */}
                      <div className="px-4 pb-0 pt-8">
                        <div className="space-y-2 px-1">
                          {isComingSoonMode ? (
                            <div className="h-3" data-locked="true" />
                          ) : (
                            <>
                              <div className="home-footer-pills flex w-full items-center justify-center flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setQuickSettingsOpen((o) => !o)}
                                  className="home-footer-pill inline-flex items-center gap-1.5"
                                  aria-expanded={quickSettingsOpen}
                                >
                                  <CaretDownIcon
                                    size={13}
                                    weight="bold"
                                    className={`transition-transform duration-200 ${
                                      quickSettingsOpen ? 'rotate-0' : '-rotate-90'
                                    }`}
                                  />
                                  {t('home.quickSettings', 'Quick settings')}
                                </button>
                                <Link
                                  to="/settings/mode"
                                  state={{ backTo: '/' }}
                                  className="home-footer-pill"
                                >
                                  {t('home.modeSettings', 'Mode settings')}
                                </Link>
                                <DrawerSheet
                                  srTitle={t('home.training.howItWorksTitle', 'How it works')}
                                  trigger={
                                    <button type="button" className="home-footer-pill">
                                      {t('home.training.howItWorksTitle', 'How it works')}
                                    </button>
                                  }
                                >
                                  <div className="space-y-4 text-muted-foreground typo-body">
                                    <p>
                                      <span className="font-semibold text-foreground">
                                        {t('home.training.howFavLabel', 'Your favorite games')}
                                      </span>
                                      {' — '}
                                      {t(
                                        'home.training.howFav',
                                        'Browse your favorite modes with a swipe. Access all available games via the dedicated button, and customize this selection in settings.',
                                      )}
                                    </p>
                                    <p>
                                      <span className="font-semibold text-foreground">
                                        {t('home.training.howSettingsLabel', 'Quick settings')}
                                      </span>
                                      {' — '}
                                      {t(
                                        'home.training.howSettings',
                                        'Adjust the level and main parameters right here. For advanced options, open the full mode settings.',
                                      )}
                                    </p>
                                    <p>
                                      <span className="font-semibold text-foreground">
                                        {t('home.training.howTrackingLabel', 'Tracking')}
                                      </span>
                                      {' — '}
                                      {t(
                                        'home.training.howTracking',
                                        'The chart shows your last 5 sessions on the selected mode, so you can track your progress at a glance.',
                                      )}
                                    </p>
                                  </div>
                                </DrawerSheet>
                              </div>
                              <div
                                className={`overflow-hidden transition-all duration-200 ${
                                  quickSettingsOpen
                                    ? 'max-h-[500px] opacity-100'
                                    : 'max-h-0 opacity-0'
                                }`}
                              >
                                <div className="border-t border-border/35 pt-3 pb-3">
                                  <div className="flex flex-col gap-3">
                                    {/* N-Level control */}
                                    <div className="flex items-center gap-1">
                                      <span className="home-control-label text-muted-foreground w-16 shrink-0 text-left">
                                        {t('home.customMode.level', 'Level')}
                                      </span>
                                      <div className="flex-1 flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleLevelChange(selectedMode, -1)}
                                          data-capture-control="icon"
                                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                          disabled={modeLevel <= 1}
                                        >
                                          <MinusIcon size={18} weight="bold" />
                                        </button>
                                        <span className="home-control-value w-12 text-center font-mono font-semibold">
                                          N-{modeLevel}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleLevelChange(selectedMode, 1)}
                                          data-capture-control="icon"
                                          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                          disabled={modeLevel >= 10}
                                        >
                                          <PlusIcon size={18} weight="bold" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Trials control - only for non-simulator modes */}
                                    {!isSimulator && (
                                      <div className="flex items-center gap-1">
                                        <span className="home-control-label text-muted-foreground w-16 shrink-0 text-left">
                                          {t('home.customMode.trials', 'Trials')}
                                        </span>
                                        <div className="flex-1 flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleTrialsChange(selectedMode, -5)}
                                            data-capture-control="icon"
                                            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                            disabled={currentTrialsCount <= 5}
                                          >
                                            <MinusIcon size={18} weight="bold" />
                                          </button>
                                          <span className="home-control-value w-12 text-center font-mono font-semibold">
                                            {currentTrialsCount}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleTrialsChange(selectedMode, 5)}
                                            data-capture-control="icon"
                                            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                            disabled={currentTrialsCount >= 50}
                                          >
                                            <PlusIcon size={18} weight="bold" />
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Profile ("preset") control — Brain Workshop & Dual Trace */}
                                    {hasPresetCycling && (
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="home-control-label text-muted-foreground w-16 shrink-0 text-left">
                                          {t('settings.presets.preset', 'Profile')}
                                        </span>
                                        <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
                                          <button
                                            type="button"
                                            onClick={() => cycleFreeTrainingProfile(-1)}
                                            data-capture-control="icon"
                                            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                            disabled={freeTrainingProfiles.length < 2}
                                            aria-label={t('common.previous', 'Previous')}
                                          >
                                            <CaretLeftIcon size={20} weight="regular" />
                                          </button>
                                          <DrawerSheet
                                            srTitle={t('settings.presets.title', 'Profiles')}
                                            trigger={
                                              <button
                                                type="button"
                                                className="home-control-value h-10 min-w-[7.5rem] max-w-[220px] sm:max-w-[260px] rounded-full bg-transparent px-3 text-center font-mono font-semibold truncate hover:bg-muted/30 active:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                title={
                                                  selectedFreeTrainingProfileLabel ?? undefined
                                                }
                                                aria-label={t('settings.presets.title', 'Profiles')}
                                              >
                                                {selectedFreeTrainingProfileLabel ??
                                                  t('settings.presets.none', 'No preset')}
                                              </button>
                                            }
                                          >
                                            <div className="typo-body font-semibold text-foreground break-words">
                                              {selectedFreeTrainingProfileLabel ??
                                                t('settings.presets.none', 'No preset')}
                                            </div>
                                          </DrawerSheet>
                                          <button
                                            type="button"
                                            onClick={() => cycleFreeTrainingProfile(1)}
                                            data-capture-control="icon"
                                            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                                            disabled={freeTrainingProfiles.length < 2}
                                            aria-label={t('common.next', 'Next')}
                                          >
                                            <CaretRightIcon size={20} weight="regular" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              {/* Challenge content */}
              <TabsContent value="challenge" className="w-full mt-0 relative">
                <div className="relative px-4 pt-8 pb-0">
                  <ChallengePath state={challengeState} emphasis="hero" />
                </div>

                {/* Footer: rules only */}
                <div className="px-4 pb-0 pt-8">
                  <div className="space-y-2 px-1 pb-2">
                    {challengeValidatedToday && (
                      <div>
                        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
                          <div className="text-sm font-semibold text-foreground">
                            {t('home.challenge.validatedToday.title', "Today's goal completed")}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {t(
                              'home.challenge.validatedToday.body',
                              'Your progress in the challenge will resume tomorrow.',
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
                              'Train for a set number of minutes each day, over a set number of days. You choose the duration and number of days in the settings.',
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-foreground">
                              {t('home.challenge.howCountsLabel', 'What counts')}
                            </span>
                            {' — '}
                            {t(
                              'home.challenge.howCounts',
                              'All your completed sessions count, regardless of the mode or journey.',
                            )}
                          </p>
                          <p>
                            <span className="font-semibold text-foreground">
                              {t('home.challenge.howPaceLabel', 'One day at a time')}
                            </span>
                            {' — '}
                            {t(
                              'home.challenge.howPace',
                              'Each validated day unlocks one card. Extra minutes do not carry over to the next day.',
                            )}
                          </p>
                        </div>
                      </DrawerSheet>

                      <button
                        type="button"
                        onClick={() => setShowChallengeCalendar(true)}
                        className="home-footer-pill"
                      >
                        {t('home.challenge.calendar', 'Calendar')}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowChallengeSettings(true)}
                        className="home-footer-pill"
                      >
                        {t('home.challengeSettings', 'Challenge settings')}
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Synergy content */}
              <TabsContent value="synergy" className="w-full mt-0 relative">
                <SynergyTabContent />
              </TabsContent>
            </Tabs>

            {/* Challenge footer spacing removed — no hatching, card ends tighter */}
          </div>
        )}

        {/* Bouton Jouer — contextuel par onglet */}
        {journeyState &&
          homeTab !== 'challenge' &&
          (() => {
            const cardCls =
              'w-full flex items-center gap-4 px-4 py-3 rounded-[22px] border border-border/50 bg-card/85 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl';
            const playCls =
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all active:scale-95 disabled:opacity-50';
            const playIcon = (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="7,4 21,12 7,20" />
              </svg>
            );

            // Format modalities for display — uses settings or well-known defaults
            const resolveModalities = (
              modeId: string,
              settings?: { activeModalities?: string[] },
            ): string[] => {
              if (settings?.activeModalities?.length) return settings.activeModalities;
              // Well-known defaults for modes without configurable modalities
              const DEFAULTS: Record<string, string[]> = {
                'dualnback-classic': ['position', 'audio'],
                'sim-brainworkshop': ['position', 'audio'],
                'dual-track': ['visual'],
                'dual-trace': ['position', 'audio'],
                'dual-catch': ['position', 'audio'],
                'dual-place': ['position', 'audio'],
                'dual-pick': ['position', 'audio'],
                'dual-memo': ['visual', 'audio'],
                'dual-time': ['position', 'audio'],
              };
              return DEFAULTS[modeId] ?? [];
            };
            const formatModalities = (modalities: string[]) => {
              if (modalities.length === 0) return null;
              return modalities
                .map((m) => t(`modality.${m}`, m.charAt(0).toUpperCase() + m.slice(1)))
                .join(', ');
            };

            // ── Synergy tab ──
            if (homeTab === 'synergy') {
              const synergyState = synergySnapshot;
              const synergyPhase = synergyState.phase;
              const synergyConfig = synergyState.config;
              const synergyActiveMode = getActiveGameMode(synergyState);
              const synergyModeLabel = synergyActiveMode === 'dual-track' ? 'Dual Track' : 'N-Back';
              const isResumable = synergyPhase === 'running';
              const isComplete = synergyPhase === 'complete';

              // Build per-round chart data
              const synergyResults = synergyState.sessionResults;
              const synergyChartData: { round: string; track?: number; nback?: number }[] = [];
              for (let i = 0; i + 1 < synergyResults.length; i += 2) {
                const dt = synergyResults[i];
                const nb = synergyResults[i + 1];
                if (dt && nb) {
                  synergyChartData.push({
                    round: `${synergyChartData.length + 1}`,
                    track: Math.round(dt.score),
                    nback: Math.round(nb.score),
                  });
                }
              }
              if (synergyResults.length % 2 === 1) {
                const dt = synergyResults[synergyResults.length - 1];
                if (dt) {
                  synergyChartData.push({
                    round: `${synergyChartData.length + 1}`,
                    track: Math.round(dt.score),
                  });
                }
              }
              for (let r = synergyChartData.length + 1; r <= synergyConfig.totalLoops; r++) {
                synergyChartData.push({ round: `${r}` });
              }

              return (
                <>
                  <div className={cardCls}>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-foreground">
                        {isComplete
                          ? t('home.synergy.complete', 'Synergy complete')
                          : isResumable
                            ? synergyModeLabel
                            : t('home.modeSelector.synergy', 'Synergy')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {isComplete
                          ? `${synergyConfig.totalLoops} ${t('home.sessionSummary.loops', 'loops')}`
                          : isResumable
                            ? `${t('home.synergy.loop', 'Loop')} ${formatSynergyLoopProgress(synergyState.loopIndex, synergyState.stepIndex)}/${synergyConfig.totalLoops}`
                            : `N-${synergyConfig.dualTrackNLevel}`}
                      </p>
                      {!isComplete && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {isResumable
                            ? synergyActiveMode === 'dual-track'
                              ? `${t('modality.visual', 'Visual')} · ${synergyConfig.dualTrackIdentityMode === 'color' ? t('modality.color', 'Color') : t('modality.letter', 'Letter')}`
                              : `${t(`modality.${synergyConfig.nbackModality}`, synergyConfig.nbackModality)}`
                            : `${t('modality.visual', 'Visual')} · ${t(`modality.${synergyConfig.nbackModality}`, synergyConfig.nbackModality)}`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className={playCls}
                      data-testid="start-game-button"
                      onClick={() => {
                        triggerHaptic(35);
                        const liveSynergyState = useSynergyStore.getState();
                        const liveSynergyPhase = liveSynergyState.phase;

                        if (liveSynergyPhase === 'complete') {
                          useSynergyStore.getState().reset();
                        }

                        const nextState = useSynergyStore.getState();
                        const nextPhase = nextState.phase;
                        const nextConfig = nextState.config;

                        if (nextPhase === 'idle') {
                          useSynergyStore.getState().start({});
                          const startedState = useSynergyStore.getState();
                          navigate(getRouteForMode('dual-track'), {
                            state: createSynergyPlayIntent('dual-track', {
                              loopIndex: 0,
                              totalLoops: startedState.config.totalLoops,
                              stepIndex: 0,
                            }),
                          });
                        } else if (nextPhase === 'running') {
                          const resumedState = useSynergyStore.getState();
                          const resumedMode = getActiveGameMode(resumedState);
                          navigate(getRouteForMode(resumedMode), {
                            state: createSynergyPlayIntent(resumedMode, {
                              loopIndex: resumedState.loopIndex,
                              totalLoops: nextConfig.totalLoops,
                              stepIndex: resumedState.stepIndex,
                            }),
                          });
                        }
                      }}
                    >
                      {playIcon}
                    </button>
                  </div>
                  <SynergyRoundChart
                    data={synergyChartData}
                    trackLabel={t('home.synergy.dualTrackTitle', 'Dual Track')}
                    nbackLabel={t('home.synergy.nbackTitle', 'N-Back')}
                    roundLabel={t('home.synergy.roundLabel', 'R')}
                    emptyLabel={t(
                      'home.synergy.chartEmpty',
                      'Start a loop to see your scores per round',
                    )}
                  />
                </>
              );
            }

            // ── Free / Journey tabs ──
            const isDailyLimitReached = dailyPlaytimeGate.isLimitReached;
            const isFreeModeComingSoon = !isJourneyActive && !isModePlayable(selectedMode);
            const isTrialAvailable = dailyPlaytimeGate.isTrialAvailable;
            const isPremiumLocked = isDailyLimitReached && !isTrialAvailable;

            const modeConfig = modeConfigMap.get(selectedMode);
            const modeLabel = modeConfig?.labelKey
              ? t(modeConfig.labelKey, selectedMode)
              : selectedMode;
            const modeLevel = effectiveModeConfig.nLevel;

            // Journey-specific label
            const journeyModeConfig = nextJourneySession
              ? modeConfigMap.get(nextJourneySession.gameMode as GameModeId)
              : null;
            const journeyLabel =
              isJourneyActive && journeyModeConfig?.labelKey ? t(journeyModeConfig.labelKey) : null;

            return (
              <>
                <div className={cardCls}>
                  {/* Left: session info */}
                  <div className="flex-1 min-w-0 text-left">
                    {isFreeModeComingSoon ? (
                      <p className="text-sm font-semibold text-muted-foreground">
                        {t('common.comingSoon', 'Coming soon')}
                      </p>
                    ) : isTrialAvailable ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">
                          {t('home.dailyLimit.trialOffer', 'Get 7 days free')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(
                            'home.dailyLimit.trialMessage',
                            "Today's session is done. Try unlimited training for free!",
                          )}
                        </p>
                      </>
                    ) : isPremiumLocked ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">
                          {t('home.dailyLimit.unlock', 'Go unlimited')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(
                            'home.dailyLimit.premiumMessage',
                            'Enjoying the app? Support its development and help grow the catalog.',
                          )}
                        </p>
                      </>
                    ) : isJourneyActive && nextJourneySession ? (
                      <>
                        <p className="text-sm font-bold text-foreground truncate">
                          {journeyLabel ?? nextJourneySession.gameMode}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          N-{nextJourneySession.nLevel} · {t('journey.stage', 'Stage')}{' '}
                          {nextJourneySession.stageId}/{journeyState?.stages.length ?? '?'}
                        </p>
                        {(() => {
                          const mods = resolveModalities(nextJourneySession.gameMode);
                          const label = formatModalities(mods);
                          return label ? (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-foreground truncate">{modeLabel}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          N-{modeLevel} · {currentTrialsCount}{' '}
                          {t('home.sessionSummary.trials', 'trials')}
                        </p>
                        {(() => {
                          const mods = resolveModalities(selectedMode, currentModeSettings);
                          const label = formatModalities(mods);
                          return label ? (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
                          ) : null;
                        })()}
                      </>
                    )}
                  </div>

                  {/* Right: play button */}
                  {isFreeModeComingSoon ? (
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted"
                      data-testid="start-game-button"
                      data-locked="true"
                    >
                      <LockIcon size={22} weight="bold" className="text-muted-foreground" />
                    </div>
                  ) : isTrialAvailable ? (
                    <button
                      type="button"
                      className={playCls}
                      data-testid="start-game-button"
                      onClick={() => {
                        dailyPlaytimeGate.activateTrial();
                        toast.success(
                          t(
                            'home.dailyLimit.trialActivated',
                            '7 days of unlimited training activated!',
                          ),
                          { duration: 4000 },
                        );
                      }}
                    >
                      <GiftIcon size={24} weight="bold" />
                    </button>
                  ) : isPremiumLocked ? (
                    <button
                      type="button"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-foreground transition-all active:scale-95"
                      data-testid="start-game-button"
                      onClick={() => setShowUpgradeDialog(true)}
                    >
                      <TimerIcon size={24} weight="bold" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={playCls}
                      data-testid="start-game-button"
                      disabled={!isSystemReady}
                      onClick={() => {
                        triggerHaptic(35);
                        if (
                          isJourneyActive &&
                          journeyState?.currentStage &&
                          journeyState.currentStage > journeyState.stages.length
                        ) {
                          navigate('/settings/journey');
                          return;
                        }
                        if (
                          isJourneyActive &&
                          journeyState?.currentStage &&
                          journeyState.currentStage <= journeyState.stages.length
                        ) {
                          if (!nextJourneySession) return;
                          const journeyRouterState = nextSessionToPlayIntent(nextJourneySession);
                          track('mode_selected', {
                            mode: nextJourneySession.gameMode,
                            source: dualTrackCalibrationPending
                              ? 'home_journey_calibration'
                              : 'home_journey',
                          });
                          navigate(nextJourneySession.route, { state: journeyRouterState });
                        } else {
                          if (!isModePlayable(selectedMode)) return;
                          track('mode_selected', {
                            mode: selectedMode,
                            source: 'home_free',
                          });
                          navigate(getRouteForMode(selectedMode), {
                            state: createFreePlayIntent(selectedMode),
                          });
                        }
                      }}
                    >
                      {playIcon}
                    </button>
                  )}
                </div>

                {/* Free trial countdown */}
                {dailyPlaytimeGate.isInFreeTrial &&
                  dailyPlaytimeGate.trialDaysRemaining != null && (
                    <div className="flex w-full items-center gap-3 rounded-[22px] border border-amber-400/30 bg-amber-500/10 px-4 py-3 backdrop-blur-2xl">
                      <GiftIcon size={20} weight="fill" className="shrink-0 text-amber-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {t('home.dailyLimit.trialActive', 'Free trial active')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('home.dailyLimit.trialDaysRemaining', {
                            count: dailyPlaytimeGate.trialDaysRemaining,
                            defaultValue_one: '{{count}} day remaining',
                            defaultValue_other: '{{count}} days remaining',
                            defaultValue: '{{count}} days remaining',
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                {/* Recent scores chart — last 5 sessions for this mode */}
                {!isJourneyActive && (
                  <div className="relative w-full rounded-[22px] border border-border/50 bg-card/85 p-3 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl">
                    <div className="mb-2 flex items-center justify-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-4 rounded-full bg-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {t('home.recentScores', 'Last 5 sessions')}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-28 w-full">
                      {!recentSessionsForMode.length && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground/60">
                            {t('home.recentScoresEmpty', 'Play a session to see your results')}
                          </span>
                        </div>
                      )}
                      <SafeResponsiveContainer>
                        <LineChart
                          accessibilityLayer={false}
                          data={recentScoresChartData}
                          margin={{ top: 8, right: 12, left: 6, bottom: 4 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            opacity={0.4}
                          />
                          <XAxis
                            dataKey="slot"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(value: string) =>
                              recentScoresChartLabels.get(value) ?? ''
                            }
                          />
                          <YAxis
                            width={30}
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v: number) => `${v}%`}
                          />
                          <Tooltip
                            cursor={false}
                            content={
                              <CustomTooltip
                                hideLabel
                                valueFormatter={(v: number) => `${v}%`}
                                labelFormatter={(label: string) =>
                                  recentScoresChartLabels.get(label) ?? label
                                }
                              />
                            }
                          />
                          <Line
                            isAnimationActive={false}
                            type="monotone"
                            dataKey="score"
                            name={t('home.recentScores', 'Last 5 sessions')}
                            stroke="hsl(var(--foreground))"
                            strokeWidth={2}
                            dot={{ r: 3, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                            activeDot={{ r: 4.5, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                          />
                        </LineChart>
                      </SafeResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Recent journey scores chart */}
                {isJourneyActive && (
                  <div className="relative w-full rounded-[22px] border border-border/50 bg-card/85 p-3 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl">
                    <div className="mb-2 flex items-center justify-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-4 rounded-full bg-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {t('home.recentScores', 'Last 5 sessions')}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-28 w-full">
                      {!journeySessions.length && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground/60">
                            {t('home.journeyScoresEmpty', 'Your journey scores will appear here')}
                          </span>
                        </div>
                      )}
                      <SafeResponsiveContainer>
                        <LineChart
                          accessibilityLayer={false}
                          data={journeyChartData}
                          margin={{ top: 8, right: 12, left: 6, bottom: 4 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            opacity={0.4}
                          />
                          <XAxis
                            dataKey="slot"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(value: string) => journeyChartLabels.get(value) ?? ''}
                          />
                          <YAxis
                            width={30}
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v: number) => `${v}%`}
                          />
                          <Tooltip
                            cursor={false}
                            content={
                              <CustomTooltip
                                hideLabel
                                valueFormatter={(v: number) => `${v}%`}
                                labelFormatter={(label: string) =>
                                  journeyChartLabels.get(label) ?? label
                                }
                              />
                            }
                          />
                          <Line
                            isAnimationActive={false}
                            type="monotone"
                            dataKey="score"
                            name={t('home.recentScores', 'Last 5 sessions')}
                            stroke="hsl(var(--foreground))"
                            strokeWidth={2}
                            dot={{ r: 3, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                            activeDot={{ r: 4.5, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                          />
                        </LineChart>
                      </SafeResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Calibration links below card */}
                {isJourneyActive && dualTrackCalibrationPending && previousCalibrationSnapshot && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!effectiveActiveJourneyId) return;
                        const prev = previousCalibrationSnapshot;
                        setJourneyModeSetting(
                          effectiveActiveJourneyId,
                          'dualTrackJourneyCalibrationCompleted',
                          true,
                        );
                        setJourneyModeSetting(
                          effectiveActiveJourneyId,
                          'dualTrackJourneyCalibrationStartLevel',
                          prev.startLevel,
                        );
                        if (prev.preset) {
                          setJourneyModeSetting(
                            effectiveActiveJourneyId,
                            'dualTrackJourneyCalibrationPreset',
                            prev.preset,
                          );
                        }
                        updateActiveJourneyLevels(prev.startLevel, activeJourney?.targetLevel ?? 5);
                        setPreviousCalibrationSnapshot(null);
                      }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('journey.calibration.continueAt', 'ou continuer au N-{{level}}', {
                        level: previousCalibrationSnapshot.startLevel,
                      })}
                    </button>
                  </div>
                )}
                {isJourneyActive && dualTrackCalibrationPending && !previousCalibrationSnapshot && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!effectiveActiveJourneyId) return;
                        setJourneyModeSetting(
                          effectiveActiveJourneyId,
                          'dualTrackJourneyCalibrationCompleted',
                          true,
                        );
                        setJourneyModeSetting(
                          effectiveActiveJourneyId,
                          'dualTrackJourneyCalibrationStartLevel',
                          2,
                        );
                        updateActiveJourneyLevels(2, activeJourney?.targetLevel ?? 5);
                      }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('journey.calibration.skipToN2', 'ou commencer au N-2')}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
      </div>

      {/* Mode Info Modal - Accessible via Radix Dialog
          Features: focus trap, Escape key, aria-modal, aria-labelledby */}
      <Dialog open={showModeInfo} onOpenChange={setShowModeInfo}>
        <DialogContent className="max-h-[80vh] overflow-y-auto p-5">
          {(() => {
            const config = modeConfigMap.get(selectedMode);
            const Icon = config?.icon ?? SlidersHorizontalIcon;
            const resolveModeInfo = (
              section: 'howItWorks' | 'scoring' | 'tip',
              fallbackKey: string,
              fallbackDefault: string,
            ): string => {
              const key = `modeInfo.${selectedMode}.${section}`;
              if (i18n.exists(key)) {
                return t(key);
              }
              if (section === 'howItWorks' && config?.descKey) {
                return t(config.descKey, fallbackDefault);
              }
              return t(fallbackKey, fallbackDefault);
            };
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2.5 rounded-xl ${'bg-muted/60'}`}>
                      <Icon size={24} className={'text-muted-foreground'} />
                    </div>
                    <DialogTitle>{t(config?.labelKey ?? '', selectedMode)}</DialogTitle>
                  </div>
                </DialogHeader>

                {/* Content sections */}
                <div className="space-y-4">
                  {/* How it works */}
                  <div>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {t('modeInfo.howItWorks')}
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {resolveModeInfo(
                        'howItWorks',
                        'modeInfo.generic.howItWorks',
                        'Description coming soon.',
                      )}
                    </p>
                  </div>

                  {/* Score */}
                  <div>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {t('modeInfo.scoring')}
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {resolveModeInfo(
                        'scoring',
                        'modeInfo.generic.scoring',
                        'Scoring details will be available soon.',
                      )}
                    </p>
                  </div>

                  {/* Tip */}
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                    <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                      {t('modeInfo.tip')}
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                      {resolveModeInfo(
                        'tip',
                        'modeInfo.generic.tip',
                        'Start slowly, prioritize accuracy, then build speed.',
                      )}
                    </p>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Challenge Settings Dialog */}
      <Dialog open={showChallengeSettings} onOpenChange={setShowChallengeSettings}>
        <DialogContent className="p-5">
          <DialogHeader>
            <DialogTitle>{t('home.challenge.settings.title', 'Challenge settings')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-3">
            {!challengeStartedAtDay ? (
              <div className="typo-caption text-muted-foreground">
                {t(
                  'home.challenge.settings.previewHint',
                  'Preview mode: you can still increase settings until you start the challenge.',
                )}
              </div>
            ) : isChallengeLockedMinutes ? (
              <div className="typo-caption text-muted-foreground">
                {t(
                  'home.challenge.settings.lockedHint',
                  'Challenge started: you can only decrease.',
                )}
              </div>
            ) : (
              <div className="typo-caption text-muted-foreground">
                {t(
                  'home.challenge.settings.readyHint',
                  'Challenge ready: increases are allowed until your first session.',
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="typo-body font-semibold text-foreground">
                  {t('home.challenge.settings.days', 'Days')}
                </div>
                <div className="typo-caption text-muted-foreground">
                  {t('home.challenge.settings.daysDesc', 'Challenge duration in days')}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChallengeTotalDays(challengeTotalDays - 1)}
                  data-capture-control="icon"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                  disabled={challengeTotalDays <= 1}
                  aria-label={t('common.decrease', 'Decrease')}
                >
                  <CaretLeftIcon size={20} weight="regular" />
                </button>
                <span className="home-control-value w-14 text-center font-mono font-semibold">
                  {challengeTotalDays}
                </span>
                <button
                  type="button"
                  onClick={() => setChallengeTotalDays(challengeTotalDays + 1)}
                  data-capture-control="icon"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                  disabled={challengeTotalDays >= 365}
                  aria-label={t('common.increase', 'Increase')}
                >
                  <CaretRightIcon size={20} weight="regular" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="typo-body font-semibold text-foreground">
                  {t('home.challenge.settings.minutes', 'Minutes per day')}
                </div>
                <div className="typo-caption text-muted-foreground">
                  {t('home.challenge.settings.minutesDesc', 'Daily training goal')}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay - 1)}
                  data-capture-control="icon"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                  disabled={isChallengeLockedMinutes || challengeTargetMinutesPerDay <= 1}
                  aria-label={t('common.decrease', 'Decrease')}
                >
                  <CaretLeftIcon size={20} weight="regular" />
                </button>
                <span className="home-control-value w-14 text-center font-mono font-semibold">
                  {challengeTargetMinutesPerDay}
                </span>
                <button
                  type="button"
                  onClick={() => setChallengeTargetMinutesPerDay(challengeTargetMinutesPerDay + 1)}
                  data-capture-control="icon"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl transition-all hover:border-border/70 hover:bg-card/85 disabled:opacity-40"
                  disabled={isChallengeLockedMinutes || challengeTargetMinutesPerDay >= 240}
                  aria-label={t('common.increase', 'Increase')}
                >
                  <CaretRightIcon size={20} weight="regular" />
                </button>
              </div>
            </div>
          </div>

          {!challengeStartedAtDay && (
            <div className="mt-5 flex justify-center">
              <Button
                size="lg"
                className="w-auto px-10 rounded-full"
                onClick={() => {
                  triggerHaptic(35);
                  setChallengeStartedAtDay(formatLocalDayKey(new Date()));
                  setChallengeHasProgress(false);
                  setShowChallengeSettings(false);
                }}
              >
                {t('home.challenge.settings.start', 'Start challenge')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Challenge calendar modal */}
      <Dialog open={showChallengeCalendar} onOpenChange={setShowChallengeCalendar}>
        <DialogContent className="p-6" hideCloseButton>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{t('home.challenge.calendar', 'Calendar')}</DialogTitle>
              <button
                type="button"
                onClick={() => setShowChallengeCalendar(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                aria-label={t('common.close', 'Close')}
              >
                <XIcon size={18} />
              </button>
            </div>
          </DialogHeader>
          <div className="mt-4">
            <ChallengeCalendar
              state={challengeState}
              startDay={(challengeStartedAtDay as LocalDayKey | null) ?? null}
              dailyTotals={challengeDailyTotals}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer with legal links (required for Google OAuth consent screen) - hidden on mobile (bottom nav overlap) */}
      <footer className="hidden md:block fixed bottom-0 left-0 right-0 py-3 text-center text-xs text-muted-foreground/50 pointer-events-none">
        <div className="flex items-center justify-center gap-3 pointer-events-auto">
          <Link to="/legal/privacy" className="hover:text-muted-foreground transition-colors">
            {t('legal.privacy.title')}
          </Link>
          <span>•</span>
          <Link to="/legal/terms" className="hover:text-muted-foreground transition-colors">
            {t('legal.terms.title')}
          </Link>
          <span>•</span>
          <Link to="/legal/mentions" className="hover:text-muted-foreground transition-colors">
            {t('legal.mentions.title')}
          </Link>
        </div>
      </footer>

      {/* Premium upgrade dialog */}
      <UpgradeDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        source="home"
      />
    </PageTransition>
  );
}
