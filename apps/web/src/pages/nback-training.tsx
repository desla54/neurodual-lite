/**
 * Game page - Dual N-Back gameplay
 */

import { useJourneyStateWithContext, useNextJourneySessionWithContext } from '../lib/journey-stubs';
import type {
  CreateRecoverySnapshotParams,
  JourneyState,
  JourneyStrategyConfig,
  SessionEndReportModel,
} from '@neurodual/logic';
import {
  GameConfig,
  GameSessionXState,
  gameModeRegistry,
  getBlockConfigFromSpec,
  type AlgorithmId,
  // Session Report (unified)
  type ModalityId,
  generateContextualMessageData,
} from '@neurodual/logic';
import {
  CanvasWeave,
  GameControls,
  GameHUD,
  HUD_BADGE,
  Grid,
  GuidedTimeline,
  UnifiedSessionReport,
  type UnifiedSessionReportLabels,
  type StimulusStyle,
  type GridStyle,
  useGameSession,
  useRewardDetection,
  useUserProfile,
  useSessionCompletion,
  useLastAdaptiveDPrime,
  useJourneyConfigSafe,
  useGameControls,
  Spinner,
  resolveModalityColor,
  resolveThemeColor,
  useEffectiveUserId,
} from '@neurodual/ui';
import {
  GameSettingsOverlay,
  GameLayoutEditor,
  type LayoutZone,
  type ZoneConfig,
  ArithmeticKeypad,
  GameQuitModal,
  SyncHUD,
} from '../components/game';
import { BugReportModal } from '../components/bug-report/bug-report-modal';
import { AnimatedCountdownDigits } from '../components/game/animated-countdown-digits';
import {
  HeadphonesIcon,
  SpeakerSlashIcon,
  TimerIcon,
  WaveformIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { Suspense, lazy, useCallback, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useSearchParams, useNavigationType } from 'react-router';
import {
  CalibrationInterceptCommit,
  useCalibrationIntercept,
} from '../hooks/use-calibration-intercept';

import {
  useAdapters,
  useAppPorts,
  useCommandBus,
  useIsReady,
  usePersistence,
  useSystem,
} from '../providers';
import { useSettingsStore, type GameZoneLayouts, type ZoneRect } from '../stores/settings-store';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useViewportScale } from '../hooks/use-viewport-scale';
import { useStatsSharing } from '../hooks/use-stats-sharing';
import {
  useAdminEnabled,
  useAlphaEnabled,
  useBetaEnabled,
  useBetaScoringEnabled,
} from '../hooks/use-beta-features';
import { useGameLayout } from '../hooks/use-game-layout';
import { useHaptic, useHapticTrigger } from '../hooks/use-haptic';
import { useAudioPrewarm } from '../hooks/use-audio-prewarm';
import { useKeyboardControls } from '../hooks/use-keyboard-controls';
import { useCursorTrackingPort } from '../hooks/use-cursor-tracking-port';
import { useJourneyStageRedirect } from '../hooks/use-journey-stage-redirect';
import { useNbackInputTelemetry } from '../hooks/use-nback-input-telemetry';
import { useNbackReportRuntime } from '../hooks/use-nback-report-runtime';
import { useNbackTextureState } from '../hooks/use-nback-texture-state';
import { usePendingAutoStart } from '../hooks/use-pending-auto-start';
import { useRecoveredSessionReset } from '../hooks/use-recovered-session-reset';
import { useSessionBeforeUnloadFinalize } from '../hooks/use-session-before-unload-finalize';
import { useSessionDiagnosticsHealthReporting } from '../hooks/use-session-diagnostics-health-reporting';
import { useSessionRecoveryLoader } from '../hooks/use-session-recovery-loader';
import { useSessionRecoverySnapshot } from '../hooks/use-session-recovery-snapshot';
import { useSessionRelaunchOnFlag } from '../hooks/use-session-relaunch-on-flag';
import { useSessionStopOnUnmount } from '../hooks/use-session-stop-on-unmount';
import {
  useDelayedFlag,
  useFinishedSessionReportState,
  useStartedSession,
} from '../hooks/use-session-state';
import { useSessionWakeLock } from '../hooks/use-session-wake-lock';
import { useSynergySessionInvalidation } from '../hooks/use-synergy-session-invalidation';
import { useUnifiedReportLabels } from '../hooks/use-unified-report-labels';
import { useAnalytics } from '../hooks/use-analytics';
const AdminGameToolsLazy = lazy(() =>
  import('../components/dev/AdminGameTools').then((m) => ({ default: m.AdminGameTools })),
);
import { translateContextualMessage } from '../utils/contextual-message';
import {
  nextSessionToPlayIntent,
  resolvePlayIntent,
  resolveSessionPlayMode,
  type PlayIntentState,
  type PlayMode,
} from '../lib/play-intent';
import { getJourneyAnalyticsProps, buildReportActionPayload } from '../lib/analytics-journey-props';
import { useSynergyStore } from '../stores/synergy-store';
import { resolveReportJourneyAction } from '../lib/report-journey-action';
import { resolveNbackLaunch, type ResolvedNbackLaunch } from '../lib/resolve-nback-launch';
import { resolveNbackRuntimeContext } from '../lib/nback-runtime-context';
import { buildResolvedNbackModeSettings } from '../lib/synergy-nback-settings';
import { getStatsPresetForReport } from '../lib/stats-preset';
import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';
import { getRouteForMode } from '../lib/mode-metadata';

const isAlgorithmId = (value?: string): value is AlgorithmId =>
  value === 'adaptive' || value === 'meta-learning' || value === 'jitter-adaptive';

// Couleurs du HUD par mode de jeu
// Neutral badge — subtle contrast against HUD, no distracting colors
const MODE_BADGE_STYLE = { bg: 'bg-woven-cell-rest/60', text: 'text-woven-text' };
const NBACK_STIMULUS_HOST_SELECTOR = '[data-nd-sync-host="nback-stimulus"]';

function setNbackStimulusHostVisibility(visible: boolean): void {
  if (typeof document === 'undefined') return;
  const host = document.querySelector<HTMLElement>(NBACK_STIMULUS_HOST_SELECTOR);
  if (!host) return;
  host.style.setProperty('--nd-stimulus-visibility', visible ? '1' : '0');
}

function buildSynergyTempoConfigSignature(input: {
  effectiveMode: string;
  nLevel: number;
  trialsCount: number;
  activeModalities: readonly string[];
}): string {
  return [
    input.effectiveMode,
    input.nLevel,
    input.trialsCount,
    [...input.activeModalities].join(','),
  ].join('|');
}

// =============================================================================
// Starting Countdown Component
// =============================================================================

/**
 * Displays a countdown message when game is in countdown phase.
 * Shows "Préparez-vous... 3, 2, 1, 0" with numbers appearing progressively.
 *
 * SPEC-DRIVEN: Uses prepDelayMs from spec to calculate step timing.
 * For 4000ms: step changes at 1000ms (→"2"), 2000ms (→"1"), 3000ms (→"0").
 */
function StartingCountdown({
  phase,
  prepDelayMs,
  getReadyText,
  onCountdownSecond,
  scheduleAudio,
}: {
  phase: string;
  prepDelayMs: number;
  getReadyText: string;
  onCountdownSecond?: (value: 3 | 2 | 1 | 0) => void;
  /** Pre-schedule countdown sounds via Web Audio (jitter-free) */
  scheduleAudio?: (prepDelayMs: number) => () => void;
}): React.ReactNode {
  // Show during starting (audio init) or countdown phase
  if (phase !== 'starting' && phase !== 'countdown') {
    return null;
  }

  if (phase === 'starting') {
    return (
      <p className="text-sm text-muted-foreground animate-in fade-in duration-200">
        {getReadyText}
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground animate-in fade-in duration-200">
      {getReadyText}
      <AnimatedCountdownDigits prepDelayMs={prepDelayMs} onCountdownSecond={onCountdownSecond} scheduleAudio={scheduleAudio} />
    </p>
  );
}

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// GamePage Router - Dispatches to the right game component based on mode
// =============================================================================

export function NbackTrainingPage(): ReactNode {
  const location = useLocation();
  const { state: journeyState } = useJourneyStateWithContext();
  const journeyConfig = useJourneyConfigSafe();
  const routerState = location.state as PlayIntentState | null;
  const playIntent = resolvePlayIntent(routerState);
  const requestedPlayMode: PlayMode =
    routerState?.playMode === 'calibration' || routerState?.playMode === 'profile'
      ? routerState.playMode
      : playIntent.playMode;
  const activeJourneyFromStore = useSettingsStore(
    useShallow((s) => {
      const lookupId = playIntent.journeyId ?? s.ui.activeJourneyId;
      const journey = s.savedJourneys.find((j) => j.id === lookupId);
      return journey
        ? {
            id: journey.id,
            gameMode: journey.gameMode,
            startLevel: journey.startLevel,
            targetLevel: journey.targetLevel,
            strategyConfig: journey.strategyConfig,
          }
        : undefined;
    }),
  );

  const settingsMode = useSettingsStore((s) => s.currentMode);
  const baseLaunch = resolveNbackLaunch({
    playIntent,
    journeyStateCurrentStage: journeyState?.currentStage,
    journeyStateNextSessionGameMode: journeyState?.nextSessionGameMode,
    journeyConfig: journeyConfig ?? undefined,
    activeJourney: activeJourneyFromStore,
    settingsMode,
  });
  const requestedLaunch: ResolvedNbackLaunch = {
    ...baseLaunch,
    // Force Brain Workshop for calibration/profile: classic dual n-back only supports
    // position+audio, but the cognitive profile needs all 9 modalities.
    effectiveMode:
      requestedPlayMode === 'calibration' || requestedPlayMode === 'profile'
        ? 'sim-brainworkshop'
        : baseLaunch.effectiveMode,
  };

  return (
    <DualNBackGamePage
      requestedPlayMode={requestedPlayMode}
      requestedLaunch={requestedLaunch}
      requestedJourneyStrategyConfig={
        playIntent.journeyStrategyConfig ??
        journeyConfig?.strategyConfig ??
        activeJourneyFromStore?.strategyConfig
      }
    />
  );
}

// =============================================================================
// DualNBackGamePage - The main Dual N-Back game component
// =============================================================================

interface DualNBackGamePageProps {
  requestedPlayMode: PlayMode;
  requestedLaunch: ResolvedNbackLaunch;
  requestedJourneyStrategyConfig?: JourneyStrategyConfig;
}

function DualNBackGamePage({
  requestedPlayMode,
  requestedLaunch,
  requestedJourneyStrategyConfig,
}: DualNBackGamePageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const unifiedReportLabels = useUnifiedReportLabels();
  const [searchParams, setSearchParams] = useSearchParams();
  const { scale, shouldScale } = useViewportScale();
  const { state: journeyState } = useJourneyStateWithContext();
  const { algorithmState: algorithmStateAdapter } = useAdapters();
  const persistence = usePersistence();
  const commandBus = useCommandBus();
  const { platformLifecycle } = useSystem();
  const { audio, platformInfo, devLogger, sessionRecovery, diagnostics, xpContext } = useAppPorts();
  const xpContextPort = xpContext;

  // Bot config from URL params (e.g. ?bot=perfect&delay=100&accuracy=0.9)
  const initialBotConfig = useMemo(() => {
    const botMode = searchParams.get('bot');
    if (!botMode || botMode === 'off') return undefined;
    const validModes = ['perfect', 'realistic', 'random'] as const;
    if (!validModes.includes(botMode as (typeof validModes)[number])) return undefined;
    return {
      mode: botMode as 'perfect' | 'realistic' | 'random',
      accuracy: Number(searchParams.get('accuracy')) || 0.85,
      delayMs: Number(searchParams.get('delay')) || 200,
      falsePositiveRate: 0.05,
    };
  }, [searchParams]);

  // Session recovery state
  const { recoveredState, recoveryLoading } = useSessionRecoveryLoader({
    searchParams,
    setSearchParams,
    sessionRecovery,
    persistence,
  });

  const journeyConfigForGame = useJourneyConfigSafe();
  const activeJourneyIdFromStore = useSettingsStore((s) => s.journeyUi.selectedJourneyId);
  const activeJourney = useSettingsStore(
    useShallow(
      (
        s,
      ):
        | {
            id: string;
            name: string;
            nameKey?: string;
            gameMode?: string;
            startLevel: number;
            targetLevel: number;
            strategyConfig?: JourneyStrategyConfig;
          }
        | undefined => {
        const lookupId = requestedLaunch.journeyId ?? journeyConfigForGame?.journeyId ?? s.ui.activeJourneyId;
        const journey = s.savedJourneys.find((j) => j.id === lookupId);
        return journey
          ? {
              id: journey.id,
              name: journey.name,
              nameKey: journey.nameKey,
              gameMode: journey.gameMode,
              startLevel: journey.startLevel,
              targetLevel: journey.targetLevel,
              strategyConfig: journey.strategyConfig,
            }
          : undefined;
      },
    ),
  );
  const runtimeContext = resolveNbackRuntimeContext({
    requestedPlayMode,
    requestedLaunch,
    requestedJourneyStrategyConfig,
    recoveredState,
    journeyConfig: journeyConfigForGame,
    activeJourney,
    activeJourneyIdFromStore,
  });
  const effectivePlayMode = runtimeContext.effectivePlayMode;
  const effectiveJourneyStageId = runtimeContext.journeyStageId;
  const activeJourneyId = runtimeContext.activeJourneyId;
  const resolvedJourneyIdForSession = runtimeContext.resolvedJourneyIdForSession;
  const journeyGameMode = runtimeContext.journeyGameMode;
  const journeyTargetLevel = runtimeContext.journeyTargetLevel;
  const journeyStartLevel = runtimeContext.journeyStartLevel;
  const journeyNLevel = runtimeContext.journeyNLevel;
  const effectiveMode = runtimeContext.effectiveMode;
  const shouldUseJourneySettings = runtimeContext.shouldUseJourneySettings;
  const journeyStrategyConfig = runtimeContext.journeyStrategyConfig;
  const isSimulatorJourney = !!journeyGameMode;
  // Get last adaptive session d' for session initialization (Dual Tempo mode only)
  const lastAdaptiveDPrime = useLastAdaptiveDPrime();
  const { lastGrantedRewards, clearLastGranted } = useRewardDetection();
  const { shareStats } = useStatsSharing();
  const betaEnabled = useBetaEnabled();

  // Session completion hook (scoring, XP, progression, report)
  const {
    complete,
    result: completionResult,
    isProcessing: completionIsProcessing,
    error: completionError,
  } = useSessionCompletion({
    onComplete: () => sessionRecovery.clearRecoverySnapshot(),
  });

  const getBrainWorkshopInitialStrikes = useCallback(
    (input: {
      readonly sessionPlayMode: PlayMode;
      readonly nLevel: number;
    }): number | undefined => {
      if (effectiveMode !== 'sim-brainworkshop') return undefined;

      // No strikes for calibration/profile — level is driven by the calibration system
      if (input.sessionPlayMode === 'calibration' || input.sessionPlayMode === 'profile')
        return undefined;

      // Prefer the just-projected end report (no wait for history/journey re-projection).
      // Only reuse when the next session is started at the same N-level.
      const completionReport = completionResult?.report;
      const strikesFromCompletion = completionReport?.brainWorkshop?.strikesAfter;
      if (
        completionReport?.gameMode === 'sim-brainworkshop' &&
        completionReport.nLevel === input.nLevel &&
        typeof strikesFromCompletion === 'number'
      ) {
        return Math.max(0, Math.min(2, Math.round(strikesFromCompletion)));
      }

      // Journey fallback: rely on the journey projector state (authoritative).
      if (input.sessionPlayMode === 'journey') {
        return journeyState?.consecutiveStrikes ?? 0;
      }

      // Free-mode fallback: no persisted strike tracking (yet).
      return 0;
    },
    [completionResult?.report, effectiveMode, journeyState?.consecutiveStrikes],
  );

  // UI state for quit modal, settings overlay, layout editor, bug report and auto-start after "Play Again"
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(false);

  // Settings: UI partagée + settings spécifiques au mode effectif
  const modeSettings = useSettingsStore((s) => {
    if (shouldUseJourneySettings && typeof resolvedJourneyIdForSession === 'string') {
      return s.ui.journeyModeSettingsByJourneyId[resolvedJourneyIdForSession];
    }
    return s.modes[effectiveMode];
  });
  const {
    stimulusStyle,
    stimulusColor,
    colorModalityTheme,
    customImageUrl,
    stringArtPoints,
    buttonSoundsEnabled,
    soundEnabled,
    hapticEnabled,
    gridScale,
    controlsScale,
    tempoGridStyle,
    gameLayoutOrder,
    gameButtonOrder,
    gameZoneHeights,
    gameZoneLayouts,
    gameButtonLayouts,
    audioSyncPreset,
  } = useSettingsStore(
    useShallow((s) => ({
      stimulusStyle: s.ui.stimulusStyle,
      stimulusColor: s.ui.stimulusColor,
      colorModalityTheme: s.ui.colorModalityTheme,
      customImageUrl: s.ui.customImageUrl,
      stringArtPoints: s.ui.stringArtPoints,
      buttonSoundsEnabled: s.ui.buttonSoundsEnabled,
      soundEnabled: s.ui.soundEnabled,
      hapticEnabled: s.ui.hapticEnabled,
      gridScale: s.ui.gridScale,
      controlsScale: s.ui.controlsScale,
      tempoGridStyle: s.ui.tempoGridStyle,
      gameLayoutOrder: s.ui.gameLayoutOrder,
      gameButtonOrder: s.ui.gameButtonOrder,
      gameZoneHeights: s.ui.gameZoneHeights,
      gameZoneLayouts: s.ui.gameZoneLayouts,
      gameButtonLayouts: s.ui.gameButtonLayouts,
      audioSyncPreset: s.ui.audioSyncPreset,
    })),
  );
  const effectiveAudioSyncPreset = audioSyncPreset;
  // audioSyncPreset config is synced to audio service by useAudioSyncPreset() in MainLayout.
  const setButtonSoundsEnabled = useSettingsStore((s) => s.setButtonSoundsEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setGridScale = useSettingsStore((s) => s.setGridScale);
  const setControlsScale = useSettingsStore((s) => s.setControlsScale);
  const setTempoGridStyle = useSettingsStore((s) => s.setTempoGridStyle);
  const setGameLayoutOrder = useSettingsStore((s) => s.setGameLayoutOrder);
  const setGameButtonOrder = useSettingsStore((s) => s.setGameButtonOrder);
  const setGameZoneHeights = useSettingsStore((s) => s.setGameZoneHeights);
  const resetGameLayout = useSettingsStore((s) => s.resetGameLayout);
  const setGameZoneLayouts = useSettingsStore((s) => s.setGameZoneLayouts);
  const setGameButtonLayouts = useSettingsStore((s) => s.setGameButtonLayouts);
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);
  const setJourneyModeSetting = useSettingsStore((s) => s.setJourneyModeSetting);

  const setEffectiveModeSetting = useCallback(
    (key: string, value: unknown) => {
      if (shouldUseJourneySettings && typeof resolvedJourneyIdForSession === 'string') {
        setJourneyModeSetting(resolvedJourneyIdForSession, key as never, value as never);
        return;
      }
      setModeSettingFor(effectiveMode, key as never, value as never);
    },
    [
      effectiveMode,
      resolvedJourneyIdForSession,
      setJourneyModeSetting,
      setModeSettingFor,
      shouldUseJourneySettings,
    ],
  );

  // Load real user profile (replaces mock)
  const { profile: userProfile } = useUserProfile();
  // Always use Supabase user ID if authenticated, otherwise use local odalisqueId.
  // This ensures sessions are associated with the authenticated user's identity
  // and can be found when querying by user_id (regardless of cloud sync status).
  const userId = useEffectiveUserId();
  const currentNLevel = userProfile.currentNLevel;

  // Résoudre le mode de jeu via le registry
  // effectiveMode vient de GamePage (journey ou settings)
  // journeyNLevel override le nLevel si en mode parcours
  const synergyStoreConfig = useStore(useSynergyStore, (state) => state.config);
  const synergyConfig = effectivePlayMode === 'synergy' ? synergyStoreConfig : undefined;
  const routerState = location.state as PlayIntentState | null;
  const calibrationNbackConfig = useMemo(
    () =>
      effectivePlayMode === 'calibration' && routerState?.calibration
        ? {
            nLevel: routerState.calibration.level,
            blockSize: routerState.calibration.blockSize,
            nbackModalities: routerState.calibration.nbackModalities,
          }
        : effectivePlayMode === 'profile' && routerState?.profileTraining
          ? {
              nLevel: routerState.profileTraining.level,
              blockSize: routerState.profileTraining.blockSize,
              nbackModalities: routerState.profileTraining.nbackModalities,
            }
          : undefined,
    [effectivePlayMode, routerState?.calibration, routerState?.profileTraining],
  );
  const resolvedModeSettings = useMemo(
    () =>
      buildResolvedNbackModeSettings({
        modeSettings,
        recoveredConfig: recoveredState?.config
          ? {
              nLevel: recoveredState.config.nLevel,
              trialsCount: recoveredState.config.trialsCount,
              activeModalities: recoveredState.config.activeModalities,
            }
          : undefined,
        journeyNLevel,
        synergyConfig,
        calibrationConfig: calibrationNbackConfig,
      }),
    [journeyNLevel, modeSettings, synergyConfig, calibrationNbackConfig, recoveredState?.config],
  );

  const resolvedMode = useMemo(() => {
    const resolvedNLevel =
      typeof resolvedModeSettings.nLevel === 'number' ? resolvedModeSettings.nLevel : currentNLevel;
    return gameModeRegistry.resolveWithSettings(effectiveMode, resolvedModeSettings, {
      profileNLevel: resolvedNLevel,
    });
  }, [currentNLevel, effectiveMode, resolvedModeSettings]);
  const algorithmId = isAlgorithmId(resolvedMode.algorithmName)
    ? resolvedMode.algorithmName
    : undefined;

  // Block config derived from the resolved spec (includes BW multi-stim/audio modalities).
  const blockConfig = useMemo(() => getBlockConfigFromSpec(resolvedMode.spec), [resolvedMode.spec]);

  // Use the resolved config's activeModalities (which includes user/synergy overrides),
  // falling back to the spec-derived blockConfig only when the config has no override.
  const effectiveModalities = resolvedMode.config.activeModalities ?? blockConfig.activeModalities;

  const synergySessionConfigSignature = useMemo(
    () =>
      effectivePlayMode === 'synergy'
        ? buildSynergyTempoConfigSignature({
            effectiveMode,
            nLevel: blockConfig.nLevel,
            trialsCount: blockConfig.trialsCount,
            activeModalities: blockConfig.activeModalities,
          })
        : null,
    [
      effectiveMode,
      effectivePlayMode,
      blockConfig.nLevel,
      blockConfig.trialsCount,
      blockConfig.activeModalities,
    ],
  );

  // Tempo extensions - resolveWithSettings() garantit que les valeurs existent
  // (merge spec.extensions + user overrides)
  // Defensive: extensions can be undefined if registry resolution fails silently
  const tempoExtensions = (resolvedMode.spec.extensions ?? {}) as {
    guidedMode?: boolean;
    mirrorMode?: boolean;
    gameCountdownMode?: boolean;
    gameShowProgressBar?: boolean;
    gameShowNLevel?: boolean;
    multiMode?: 'color' | 'image';
    selfPaced?: boolean;
  };

  // Fallbacks protect against missing extensions (e.g. registry corruption)
  const guidedMode = tempoExtensions.guidedMode ?? false;
  const mirrorMode = tempoExtensions.mirrorMode ?? false;
  const gameCountdownMode = tempoExtensions.gameCountdownMode ?? true;
  const gameShowProgressBar = tempoExtensions.gameShowProgressBar ?? true;
  const gameShowNLevel = tempoExtensions.gameShowNLevel ?? true;
  const effectiveGuidedMode = guidedMode;
  // Multi-stimulus mode: 'color' uses colored squares, 'image' uses shapes
  const multiMode = tempoExtensions.multiMode;
  // Self-paced mode: user advances with Enter key instead of timer
  const selfPaced = tempoExtensions.selfPaced ?? false;

  const setGameCountdownMode = useCallback(
    (enabled: boolean) => setEffectiveModeSetting('gameCountdownMode', enabled),
    [setEffectiveModeSetting],
  );
  const setGameShowProgressBar = useCallback(
    (enabled: boolean) => setEffectiveModeSetting('gameShowProgressBar', enabled),
    [setEffectiveModeSetting],
  );
  const setGameShowNLevel = useCallback(
    (enabled: boolean) => setEffectiveModeSetting('gameShowNLevel', enabled),
    [setEffectiveModeSetting],
  );
  const setGuidedMode = useCallback(
    (enabled: boolean) => setEffectiveModeSetting('guidedMode', enabled),
    [setEffectiveModeSetting],
  );
  const setMirrorMode = useCallback(
    (enabled: boolean) => setEffectiveModeSetting('mirrorMode', enabled),
    [setEffectiveModeSetting],
  );

  // Créer la session avec useRef pour éviter la re-création sur changement de profil
  // Bug fix: useMemo recréait la session si userProfile changeait en background,
  // causant une perte de progression mid-game.
  // Using GameSessionXState (XState-based) for robust state management
  const sessionRef = useRef<GameSessionXState | null>(null);
  const sessionConfigSignatureRef = useRef<string | null>(null);
  const [, forceUpdate] = useState(0);

  // Defensive: in Journey mode, redirect to CURRENT stage when the requested
  // stage is BEHIND the current one (stale router state / browser back/refresh).
  // IMPORTANT: allow navigating to currentStage + 1 — this is the legitimate
  // "next stage" transition after completing a stage, where the PowerSync
  // reactive query may not have re-projected the journey state yet.
  const shouldRedirectToCurrentJourneyStage =
    navigationType === 'POP' &&
    !sessionRef.current &&
    !recoveryLoading &&
    journeyState?.isActive &&
    typeof effectiveJourneyStageId === 'number' &&
    typeof journeyState?.currentStage === 'number' &&
    effectiveJourneyStageId !== journeyState?.currentStage &&
    effectiveJourneyStageId < journeyState?.currentStage;

  const cursorPositionPort = useCursorTrackingPort();
  useRecoveredSessionReset({
    recoveredState,
    sessionRef,
    sessionConfigSignatureRef,
    forceUpdate,
  });
  useSynergySessionInvalidation({
    playMode: effectivePlayMode,
    nextSignature: synergySessionConfigSignature,
    sessionRef,
    sessionConfigSignatureRef,
    forceUpdate,
  });
  useJourneyStageRedirect({
    shouldRedirect: shouldRedirectToCurrentJourneyStage,
    navigate,
    path: '/nback',
    journeyStageId: journeyState?.currentStage,
    journeyId: resolvedJourneyIdForSession,
  });
  useAudioPrewarm(audio);

  // Fonction pour créer une nouvelle session (appelée au mount et sur "Play Again")
  const createSession = useCallback(
    (overrideNLevel?: number) => {
      diagnostics.setWatchdogContext('GamePage.createSession');

      // Cleanup previous session if exists
      sessionRef.current?.stop();

      // Use explicit override when starting from report actions to avoid
      // React/store timing races (settings update vs. session creation).
      const sessionBlockConfig =
        typeof overrideNLevel === 'number' && Number.isFinite(overrideNLevel)
          ? { ...blockConfig, nLevel: overrideNLevel }
          : blockConfig;
      const hasJourneySnapshot =
        typeof effectiveJourneyStageId === 'number' ||
        typeof resolvedJourneyIdForSession === 'string';
      const sessionPlayMode = resolveSessionPlayMode({
        requestedPlayMode: effectivePlayMode,
        hasJourneySnapshot,
      });
      const sessionJourneyGameMode =
        sessionPlayMode === 'journey'
          ? (journeyGameMode ??
            (effectiveMode === 'sim-brainworkshop' || effectiveMode === 'dualnback-classic'
              ? effectiveMode
              : undefined))
          : undefined;
      const sessionConfigSignature =
        effectivePlayMode === 'synergy'
          ? buildSynergyTempoConfigSignature({
              effectiveMode,
              nLevel: sessionBlockConfig.nLevel,
              trialsCount: sessionBlockConfig.trialsCount,
              activeModalities: sessionBlockConfig.activeModalities,
            })
          : null;

      sessionRef.current = new GameSessionXState(userId, new GameConfig(sessionBlockConfig), {
        audio,
        devLogger,
        platformLifecycleSource: platformLifecycle ?? undefined,
        platformInfoPort: platformInfo,
        // Mode Spec (Single Source of Truth) - contains scoring, timing, generation config
        // gameMode comes from spec.metadata.id - SSOT
        spec: resolvedMode.spec,
        // Context params
        playMode: sessionPlayMode,
        journeyStageId: effectiveJourneyStageId,
        journeyId: resolvedJourneyIdForSession,
        journeyStartLevel: sessionPlayMode === 'journey' ? journeyStartLevel : undefined,
        journeyTargetLevel: sessionPlayMode === 'journey' ? journeyTargetLevel : undefined,
        journeyGameMode: sessionPlayMode === 'journey' ? sessionJourneyGameMode : undefined,
        journeyName:
          sessionPlayMode === 'journey' ? (activeJourney?.name ?? 'Parcours') : undefined,
        journeyStrategyConfig: sessionPlayMode === 'journey' ? journeyStrategyConfig : undefined,
        // Feedback config (sounds gated by UI setting)
        feedbackConfig: { visualFeedback: false, audioFeedback: soundEnabled },
        // Pass last d' for Dual Tempo mode to continue from previous session's difficulty
        initialDPrime: effectiveMode === 'dualnback-classic' ? lastAdaptiveDPrime : undefined,
        // Pass user-selected adaptive algorithm
        algorithmId,
        // Algorithm state persistence for meta-learning
        algorithmStatePort: algorithmStateAdapter,
        // Pass BrainWorkshop strikes for proper progression (journey + free mode).
        initialStrikes: getBrainWorkshopInitialStrikes({
          sessionPlayMode,
          nLevel: sessionBlockConfig.nLevel,
        }),
        // XP context for computing XP breakdown at session end
        xpContextPort,
        // Strict ES writes via command bus (Emmett)
        commandBus: commandBus ?? undefined,
        // Cursor position tracking for mouse RT analysis
        cursorPositionPort,
        // Audio-driven visual sync disabled: timer-based (RAF sync loop) provides
        // frame-precise, consistent hide timing. Audio-driven path (player.onstop →
        // xState event) has inherent jitter from the audio thread callback.
        useAudioDrivenVisualSync: false,
        // Imperative stimulus rendering path (outside React) for lower-latency visual sync.
        onVisualTriggerImmediate: () => setNbackStimulusHostVisibility(true),
        onVisualHideImmediate: () => setNbackStimulusHostVisibility(false),
      });
      sessionConfigSignatureRef.current = sessionConfigSignature;

      diagnostics.clearWatchdogContext();

      // Force re-render to use new session
      forceUpdate((v) => v + 1);
    },
    [
      userId,
      resolvedMode.spec,
      effectivePlayMode,
      effectiveMode,
      effectiveJourneyStageId,
      resolvedJourneyIdForSession,
      journeyGameMode,
      journeyStartLevel,
      journeyTargetLevel,
      activeJourney?.name,
      lastAdaptiveDPrime,
      algorithmId,
      getBrainWorkshopInitialStrikes,
      blockConfig,
      xpContextPort,
      effectiveAudioSyncPreset,
      soundEnabled,
      platformLifecycle,
      cursorPositionPort,
      commandBus,
    ],
  );

  if (shouldRedirectToCurrentJourneyStage) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  // Lazy initialization: create session synchronously on first render
  // Skip if recovery is in progress - we'll create with recovered state when ready
  if (!sessionRef.current && !recoveryLoading) {
    // IMPORTANT: Do not create a session without commandBus.
    // Without it, the session will run but persist nothing, making history appear empty.
    if (commandBus == null) {
      diagnostics.setWatchdogContext('GamePage.lazyInit.waitForCommandBus');
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-muted-foreground">{t('common.loading', 'Loading...')}</div>
        </div>
      );
    }

    diagnostics.setWatchdogContext('GamePage.lazyInit');
    const hasJourneySnapshot =
      typeof effectiveJourneyStageId === 'number' ||
      typeof resolvedJourneyIdForSession === 'string';
    const sessionPlayMode = resolveSessionPlayMode({
      requestedPlayMode: effectivePlayMode,
      hasJourneySnapshot,
    });
    const sessionJourneyGameMode =
      sessionPlayMode === 'journey'
        ? (journeyGameMode ??
          (effectiveMode === 'sim-brainworkshop' || effectiveMode === 'dualnback-classic'
            ? effectiveMode
            : undefined))
        : undefined;
    const sessionConfigSignature =
      effectivePlayMode === 'synergy'
        ? buildSynergyTempoConfigSignature({
            effectiveMode,
            nLevel: blockConfig.nLevel,
            trialsCount: blockConfig.trialsCount,
            activeModalities: blockConfig.activeModalities,
          })
        : null;
    sessionRef.current = new GameSessionXState(userId, new GameConfig(blockConfig), {
      audio,
      devLogger,
      platformLifecycleSource: platformLifecycle ?? undefined,
      platformInfoPort: platformInfo,
      // Mode Spec (Single Source of Truth) - contains scoring, timing, generation config
      // gameMode comes from spec.metadata.id - SSOT
      spec: resolvedMode.spec,
      // Context params
      playMode: sessionPlayMode,
      journeyStageId: effectiveJourneyStageId,
      journeyId: resolvedJourneyIdForSession,
      journeyStartLevel: sessionPlayMode === 'journey' ? journeyStartLevel : undefined,
      journeyTargetLevel: sessionPlayMode === 'journey' ? journeyTargetLevel : undefined,
      journeyGameMode: sessionPlayMode === 'journey' ? sessionJourneyGameMode : undefined,
      journeyName: sessionPlayMode === 'journey' ? (activeJourney?.name ?? 'Parcours') : undefined,
      journeyStrategyConfig: sessionPlayMode === 'journey' ? journeyStrategyConfig : undefined,
      // Feedback config (sounds gated by UI setting)
      feedbackConfig: { visualFeedback: false, audioFeedback: soundEnabled },
      // Pass last d' for Dual Tempo mode to continue from previous session's difficulty
      initialDPrime: effectiveMode === 'dualnback-classic' ? lastAdaptiveDPrime : undefined,
      // Pass user-selected adaptive algorithm
      algorithmId,
      // Algorithm state persistence for meta-learning
      algorithmStatePort: algorithmStateAdapter,
      // Pass BrainWorkshop strikes for proper progression (journey + free mode).
      initialStrikes: getBrainWorkshopInitialStrikes({
        sessionPlayMode,
        nLevel: blockConfig.nLevel,
      }),
      // XP context for computing XP breakdown at session end
      xpContextPort,
      // Strict ES writes via command bus (Emmett)
      commandBus,
      // Cursor position tracking for mouse RT analysis
      cursorPositionPort,
      // Session recovery: pass recovered state if available
      recoveryState: recoveredState
        ? {
            sessionId: recoveredState.sessionId,
            lastTrialIndex: recoveredState.lastTrialIndex,
            trialHistory: [...recoveredState.trialHistory],
            responses: [...recoveredState.responses],
            startTimestamp: recoveredState.startTimestamp,
            // CRITICAL: Include existing events for accurate session report
            existingEvents: [...recoveredState.existingEvents],
            // CRITICAL: Preserve original trialsSeed to regenerate the same sequence
            trialsSeed: recoveredState.trialsSeed,
            // CRITICAL: Stream version from emt_streams (authoritative source)
            streamVersion: recoveredState.streamVersion,
          }
        : undefined,
      // Audio-driven visual sync disabled: timer-based (RAF sync loop) provides
      // frame-precise, consistent hide timing.
      useAudioDrivenVisualSync: false,
      // Imperative stimulus rendering path (outside React) for lower-latency visual sync.
      onVisualTriggerImmediate: () => setNbackStimulusHostVisibility(true),
      onVisualHideImmediate: () => setNbackStimulusHostVisibility(false),
    });
    sessionConfigSignatureRef.current = sessionConfigSignature;
    diagnostics.clearWatchdogContext();

    // Clear recovery snapshot after session created with it
    if (recoveredState) {
      sessionRecovery.clearRecoverySnapshot();
    }
  }

  // Show loading state while recovery is in progress or session not ready
  // Render GameplayContent only when session exists to avoid React hooks order violation
  const session = sessionRef.current;

  if (recoveryLoading || !session) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  // Render gameplay content with guaranteed non-null session
  return (
    <GameplayContent
      session={session}
      playMode={effectivePlayMode}
      effectiveMode={effectiveMode}
      resolvedMode={resolvedMode}
      blockConfig={blockConfig}
      journeyStageId={effectiveJourneyStageId}
      journeyId={resolvedJourneyIdForSession}
      activeJourneyId={activeJourneyId}
      journeyGameMode={journeyGameMode}
      journeyTargetLevel={journeyTargetLevel}
      journeyStartLevel={journeyStartLevel}
      journeyState={journeyState}
      isSimulatorJourney={isSimulatorJourney}
      effectiveGuidedMode={effectiveGuidedMode}
      mirrorMode={mirrorMode}
      betaEnabled={betaEnabled}
      buttonSoundsEnabled={buttonSoundsEnabled}
      soundEnabled={soundEnabled}
      hapticEnabled={hapticEnabled}
      stimulusStyle={stimulusStyle}
      stimulusColor={resolveThemeColor(stimulusColor, colorModalityTheme)}
      customImageUrl={customImageUrl}
      stringArtPoints={stringArtPoints}
      effectiveModalities={effectiveModalities}
      scale={scale}
      shouldScale={shouldScale}
      unifiedReportLabels={unifiedReportLabels}
      completionResult={completionResult}
      completionIsProcessing={completionIsProcessing}
      completionError={completionError}
      complete={complete}
      lastGrantedRewards={lastGrantedRewards}
      clearLastGranted={clearLastGranted}
      shareStats={shareStats}
      createSession={createSession}
      showQuitModal={showQuitModal}
      setShowQuitModal={setShowQuitModal}
      showSettingsOverlay={showSettingsOverlay}
      setShowSettingsOverlay={setShowSettingsOverlay}
      isBugReportOpen={isBugReportOpen}
      setIsBugReportOpen={setIsBugReportOpen}
      layoutEditMode={layoutEditMode}
      setLayoutEditMode={setLayoutEditMode}
      gameCountdownMode={gameCountdownMode}
      gameShowProgressBar={gameShowProgressBar}
      gameShowNLevel={gameShowNLevel}
      setButtonSoundsEnabled={setButtonSoundsEnabled}
      setSoundEnabled={setSoundEnabled}
      setHapticEnabled={setHapticEnabled}
      setGameCountdownMode={setGameCountdownMode}
      setGameShowProgressBar={setGameShowProgressBar}
      setGameShowNLevel={setGameShowNLevel}
      setGuidedMode={setGuidedMode}
      setMirrorMode={setMirrorMode}
      pendingAutoStart={pendingAutoStart}
      setPendingAutoStart={setPendingAutoStart}
      multiMode={multiMode}
      selfPaced={selfPaced}
      gridScale={gridScale}
      controlsScale={controlsScale}
      tempoGridStyle={tempoGridStyle}
      setGridScale={setGridScale}
      setControlsScale={setControlsScale}
      setTempoGridStyle={setTempoGridStyle}
      gameLayoutOrder={gameLayoutOrder}
      gameButtonOrder={gameButtonOrder}
      gameZoneHeights={gameZoneHeights}
      gameZoneLayouts={gameZoneLayouts}
      setGameZoneLayouts={setGameZoneLayouts}
      setGameButtonLayouts={setGameButtonLayouts}
      gameButtonLayouts={gameButtonLayouts}
      setGameLayoutOrder={setGameLayoutOrder}
      setGameButtonOrder={setGameButtonOrder}
      setGameZoneHeights={setGameZoneHeights}
      resetGameLayout={resetGameLayout}
      initialBotConfig={initialBotConfig}
    />
  );
}

// =============================================================================
// GameplayContent - Extracted to ensure useGameSession is always called
// =============================================================================

interface GameplayContentProps {
  session: GameSessionXState;
  playMode: PlayMode;
  effectiveMode: string;
  resolvedMode: ReturnType<typeof gameModeRegistry.resolveWithSettings>;
  blockConfig: ReturnType<typeof getBlockConfigFromSpec>;
  journeyStageId?: number;
  journeyId?: string;
  activeJourneyId: string | null;
  journeyGameMode?: string;
  journeyTargetLevel: number;
  journeyStartLevel: number;
  journeyState: JourneyState;
  isSimulatorJourney: boolean;
  effectiveGuidedMode: boolean;
  mirrorMode: boolean;
  /** Beta features enabled - controls visibility of guided/mirror mode in settings overlay */
  betaEnabled: boolean;
  buttonSoundsEnabled: boolean;
  soundEnabled: boolean;
  hapticEnabled: boolean;
  stimulusStyle: StimulusStyle;
  stimulusColor: string;
  customImageUrl: string | null;
  stringArtPoints: number;
  effectiveModalities: readonly string[];
  multiMode?: 'color' | 'image';
  scale: number;
  shouldScale: boolean;
  unifiedReportLabels: UnifiedSessionReportLabels;
  completionResult: ReturnType<typeof useSessionCompletion>['result'];
  completionIsProcessing: ReturnType<typeof useSessionCompletion>['isProcessing'];
  completionError: ReturnType<typeof useSessionCompletion>['error'];
  complete: ReturnType<typeof useSessionCompletion>['complete'];
  lastGrantedRewards: ReturnType<typeof useRewardDetection>['lastGrantedRewards'];
  clearLastGranted: () => void;
  shareStats: ReturnType<typeof useStatsSharing>['shareStats'];
  createSession: (overrideNLevel?: number) => void;
  showQuitModal: boolean;
  setShowQuitModal: React.Dispatch<React.SetStateAction<boolean>>;
  showSettingsOverlay: boolean;
  setShowSettingsOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  isBugReportOpen: boolean;
  setIsBugReportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  layoutEditMode: boolean;
  setLayoutEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  gameCountdownMode: boolean;
  gameShowProgressBar: boolean;
  gameShowNLevel: boolean;
  setButtonSoundsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setGameCountdownMode: (enabled: boolean) => void;
  setGameShowProgressBar: (enabled: boolean) => void;
  setGameShowNLevel: (enabled: boolean) => void;
  setGuidedMode: (enabled: boolean) => void;
  setMirrorMode: (enabled: boolean) => void;
  pendingAutoStart: boolean;
  setPendingAutoStart: React.Dispatch<React.SetStateAction<boolean>>;
  selfPaced: boolean;
  /** Grid scale factor (0.7 - 1.3) */
  gridScale: number;
  /** Controls scale factor (0.7 - 1.3) */
  controlsScale: number;
  /** Tempo grid style */
  tempoGridStyle: GridStyle;
  setGridScale: (value: number) => void;
  setControlsScale: (value: number) => void;
  setTempoGridStyle: (style: GridStyle) => void;
  /** Layout zone order */
  gameLayoutOrder: LayoutZone[];
  /** Button order (modality IDs), null = default */
  gameButtonOrder: string[] | null;
  /** Custom zone heights as flex proportions, null = auto */
  gameZoneHeights: { header: number; game: number; controls: number } | null;
  /** Custom 2D zone layouts, null = default CSS grid */
  gameZoneLayouts: GameZoneLayouts | null;
  setGameZoneLayouts: (layouts: GameZoneLayouts | null) => void;
  setGameButtonLayouts: (layouts: Record<string, ZoneRect> | null) => void;
  /** Per-button absolute layouts, null = grouped rendering */
  gameButtonLayouts: Record<string, ZoneRect> | null;
  setGameLayoutOrder: (order: LayoutZone[]) => void;
  setGameButtonOrder?: (order: string[] | null) => void;
  setGameZoneHeights?: (heights: { header: number; game: number; controls: number } | null) => void;
  resetGameLayout: () => void;
  /** Initial bot config from URL params */
  initialBotConfig?: import('../components/dev/useGameBot').BotConfig;
}

function GameplayContent({
  session,
  playMode: gameplayPlayMode,
  effectiveMode,
  resolvedMode,
  blockConfig,
  journeyStageId,
  journeyId: _journeyId,
  activeJourneyId,
  journeyGameMode,
  journeyTargetLevel,
  journeyStartLevel,
  journeyState,
  isSimulatorJourney,
  effectiveGuidedMode,
  mirrorMode,
  buttonSoundsEnabled,
  soundEnabled,
  hapticEnabled,
  stimulusStyle,
  stimulusColor,
  customImageUrl,
  stringArtPoints,
  effectiveModalities,
  scale,
  shouldScale,
  unifiedReportLabels,
  completionResult,
  completionIsProcessing,
  completionError,
  complete,
  lastGrantedRewards: _lastGrantedRewards,
  clearLastGranted: _clearLastGranted,
  shareStats,
  createSession,
  showQuitModal,
  setShowQuitModal,
  showSettingsOverlay,
  setShowSettingsOverlay,
  isBugReportOpen,
  setIsBugReportOpen,
  layoutEditMode,
  setLayoutEditMode,
  gameCountdownMode,
  gameShowProgressBar,
  gameShowNLevel,
  setButtonSoundsEnabled,
  setSoundEnabled,
  setHapticEnabled,
  setGameCountdownMode,
  setGameShowProgressBar,
  setGameShowNLevel,
  setGuidedMode,
  setMirrorMode,
  pendingAutoStart,
  setPendingAutoStart,
  multiMode,
  selfPaced,
  gridScale,
  controlsScale,
  tempoGridStyle,
  setGridScale,
  setControlsScale,
  setTempoGridStyle,
  gameLayoutOrder,
  gameButtonOrder,
  gameZoneHeights,
  gameZoneLayouts,
  gameButtonLayouts,
  setGameLayoutOrder,
  setGameButtonOrder,
  setGameZoneHeights,
  setGameZoneLayouts,
  setGameButtonLayouts,
  resetGameLayout,
  initialBotConfig,
}: GameplayContentProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { audio, wakeLock, diagnostics, sessionRecovery } = useAppPorts();
  const persistence = usePersistence();

  // Journey-specific props are provided for gameplay/navigation context, but not all are used in this view.
  void activeJourneyId;
  void journeyGameMode;
  void journeyTargetLevel;
  void journeyStartLevel;
  void journeyState;
  void isSimulatorJourney;
  void setGameLayoutOrder;
  void setGameZoneHeights;

  // Cell-rendered visual modalities still need a grid position even when position itself
  // is not scored. The generator always emits trial.position for anchoring the visual.
  const needsGridPosition =
    !effectiveModalities.includes('position') &&
    (effectiveModalities.includes('image') ||
      effectiveModalities.includes('color') ||
      effectiveModalities.includes('spatial') ||
      effectiveModalities.includes('digits') ||
      effectiveModalities.includes('emotions') ||
      effectiveModalities.includes('words'));

  const isDark = useSettingsStore((s) => s.ui.darkMode);
  const colorModalityTheme = useSettingsStore((s) => s.ui.colorModalityTheme);
  const { track } = useAnalytics();

  const isSystemReady = useIsReady();
  const commandBus = useCommandBus();
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const setStimulusStyle = useSettingsStore((s) => s.setStimulusStyle);
  const setStimulusColor = useSettingsStore((s) => s.setStimulusColor);
  const statsSharedRef = useRef<string | null>(null);
  // Zone refs for DOM capture when entering layout edit mode
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const zoneHeaderRef = useRef<HTMLDivElement>(null);
  const zoneGameRef = useRef<HTMLDivElement>(null);
  const zoneControlsRef = useRef<HTMLDivElement>(null);
  const { nextSession: nextJourneySessionForPlayAgain } = useNextJourneySessionWithContext();

  // Audio texture one-time info banner
  const audioSyncPreset = useSettingsStore((s) => s.ui.audioSyncPreset);
  const hasSeenPinkNoiseToast = useSettingsStore((s) => s.ui.hasSeenPinkNoiseToast);
  const setHasSeenPinkNoiseToast = useSettingsStore((s) => s.setHasSeenPinkNoiseToast);

  // Floating binaural mute pill (shown for first 3 sessions)
  const binauralMuteShownCount = useSettingsStore((s) => s.ui.binauralMuteShownCount);
  const setBinauralMuteShownCount = useSettingsStore((s) => s.setBinauralMuteShownCount);

  // useGameSession is now guaranteed to be called on every render of this component
  const { snapshot, dispatch } = useGameSession(session);
  const {
    phase,
    trial,
    trialIndex,
    totalTrials,
    message,
    summary,
    trialHistory,
    nLevel,
    prepDelayMs,
    arithmeticInput,
    stimulusVisible,
  } = snapshot;
  const isPaused = phase === 'paused';
  const { showPinkNoiseBanner, dismissPinkNoiseBanner, textureMuted, markTextureMuted } =
    useNbackTextureState({
      audioSyncPreset,
      hasSeenPinkNoiseToast,
      setHasSeenPinkNoiseToast,
      phase,
    });

  const safeTotalTrials = Math.max(0, totalTrials);
  const clampedTrialIndex =
    safeTotalTrials > 0 ? Math.min(Math.max(trialIndex, 0), safeTotalTrials - 1) : 0;
  const displayedTrial = safeTotalTrials > 0 ? clampedTrialIndex + 1 : 0;
  const consumedTrials = Math.min(safeTotalTrials, clampedTrialIndex + (trial ? 1 : 0));
  const remainingTrials = Math.max(0, safeTotalTrials - consumedTrials);
  const sessionJourneyStageId = session.getJourneyStageId();
  const sessionJourneyId = session.getJourneyId();
  const effectiveJourneyStageId = sessionJourneyStageId ?? journeyStageId;
  const effectiveJourneyId = sessionJourneyId ?? _journeyId;
  const isJourneySession =
    typeof effectiveJourneyStageId === 'number' || typeof effectiveJourneyId === 'string';
  const sessionPlayContext = resolveSessionPlayMode({
    requestedPlayMode: gameplayPlayMode,
    hasJourneySnapshot: isJourneySession,
  });
  const shouldRelaunchFromJourneyReportAction =
    phase === 'finished' &&
    (typeof journeyStageId === 'number' || typeof _journeyId === 'string') &&
    (sessionJourneyStageId !== journeyStageId || sessionJourneyId !== _journeyId);

  useStartedSession({
    phase,
    sessionId: summary?.sessionId ?? session.sessionId,
    onStarted: (sessionId) => {
      track('session_started', {
        session_id: sessionId,
        mode: effectiveMode,
        n_level: nLevel,
        modalities: effectiveModalities,
        play_context: sessionPlayContext,
        journey_id: effectiveJourneyId ?? undefined,
        algorithm: resolvedMode.algorithmName ?? undefined,
      });
    },
  });

  const {
    stableReport: stableFinishedReport,
    stableCompletion: stableFinishedCompletion,
    stableReportTick,
    stableReportSessionId,
    stableCompletionSessionId,
    reportReady,
    reportPending,
    reportFailed,
    sessionFinalizing,
  } = useFinishedSessionReportState<
    NonNullable<typeof summary>,
    SessionEndReportModel,
    NonNullable<GameplayContentProps['completionResult']>
  >({
    phase,
    summary,
    completionResult,
    completionIsProcessing,
    completionError,
  });

  // Access flags:
  // - betaEnabled: experimental gameplay options (layout editor, sync HUD, etc.)
  // - alphaEnabled: guided/mirror tempo toggles
  // - adminEnabled: developer tools (in-game bot panel)
  const alphaEnabled = useAlphaEnabled();
  const betaEnabled = useBetaEnabled();
  const adminEnabled = useAdminEnabled();
  const betaScoringEnabled = useBetaScoringEnabled();
  const triggerHaptic = useHapticTrigger();
  const haptic = useHaptic();
  const [devPanelOpen, setDevPanelOpen] = useState(false);

  // ========== LAYOUT EDIT MODE ==========
  // Layout edit mode now uses GameLayoutEditor component for drag/resize

  // Admin tools (bot + DevPanel) - lazy loaded only when admin enabled to avoid background lag
  // Calculate layout dimensions based on viewport and options
  // NOTE: gridScale is NOT passed here - it's applied via CSS transform on the grid container
  const isPlayingOrPaused = phase === 'stimulus' || phase === 'waiting' || phase === 'paused';
  // Reserve space for the pill during the first 3 sessions to avoid layout shift
  const reserveMutePillSpace =
    binauralMuteShownCount < 3 && audioSyncPreset !== 'default' && !textureMuted;
  const showMutePill = reserveMutePillSpace && isPlayingOrPaused;
  const matchControlsCount = useMemo(
    () => effectiveModalities.filter((m) => m !== 'arithmetic').length,
    [effectiveModalities],
  );
  // Arithmetic uses typed input (no match button). Reserve extra space for its keypad/answer UI.
  const layoutControlsCount =
    matchControlsCount + (effectiveModalities.includes('arithmetic') ? 6 : 0);
  const layout = useGameLayout({
    // MainLayout hides the global nav on game pages; don't reserve 4rem.
    navHeight: 0,
    showTimeline: effectiveGuidedMode && isPlayingOrPaused,
    showProgressBar: gameShowProgressBar,
    mirrorMode,
    controlsCount: layoutControlsCount,
    controlsScale,
  });

  // Keyboard controls - handled by useKeyboardControls hook (defined below after playClickIfEnabled)

  // Build activePositions Map for multi-stimulus Grid support
  // Combines trial.position (primary) with trial.positions (position2-4)
  // Only includes position modalities that are actually active in effectiveModalities
  const activePositions = useMemo(() => {
    if (!trial) return undefined;
    const map = new Map<string, number>();

    // Only add primary position if 'position' modality is active
    if (effectiveModalities.includes('position') && trial.position !== undefined) {
      map.set('position', trial.position);
    }

    // Add multi-stimulus positions only if their specific modality is active
    if (trial.positions) {
      for (const [modalityId, pos] of trial.positions) {
        if (effectiveModalities.includes(modalityId)) {
          map.set(modalityId, pos);
        }
      }
    }

    // Only return if we have multi-stimulus (more than 1 position)
    return map.size > 1 ? map : undefined;
  }, [trial, effectiveModalities]);

  // Build activeVisValues Map for Brain Workshop vis1-4 support
  // Keys: vis1..vis4, values: 0-7
  const activeVisValues = useMemo(() => {
    if (!trial?.visValues) return undefined;
    const map = new Map<string, number>();

    for (const [modalityId, value] of trial.visValues) {
      if (effectiveModalities.includes(modalityId)) {
        map.set(modalityId, value);
      }
    }

    return map.size > 0 ? map : undefined;
  }, [trial, effectiveModalities]);

  const gridStimulus = useMemo(() => {
    if (!trial) return null;

    for (const modalityId of effectiveModalities) {
      switch (modalityId) {
        case 'arithmetic':
          return {
            shape: null,
            text:
              typeof trial.arithmeticNumber === 'number' ? String(trial.arithmeticNumber) : null,
          };
        case 'image':
          return { shape: trial.image ?? null, text: null };
        case 'visvis':
        case 'visaudio':
        case 'audiovis':
          return { shape: null, text: trial.vis ?? null };
        case 'spatial':
          return { shape: null, text: trial.spatial ?? null };
        case 'digits':
          return {
            shape: null,
            text: typeof trial.digits === 'number' ? String(trial.digits) : null,
          };
        case 'emotions':
          return { shape: null, text: trial.emotions ?? null };
        case 'words':
          return { shape: null, text: trial.words ?? null };
        default:
          break;
      }
    }

    return { shape: null, text: null };
  }, [effectiveModalities, trial]);

  // Handle quit button - pause and show modal
  const handleQuitClick = useCallback(() => {
    if (phase === 'stimulus' || phase === 'waiting') {
      dispatch({ type: 'PAUSE' });
    }
    setShowQuitModal(true);
  }, [phase, dispatch]);

  const handleQuitConfirm = useCallback(() => {
    const safeTotalTrials = Math.max(1, totalTrials);
    track('session_abandoned', {
      session_id: summary?.sessionId ?? 'unknown',
      mode: effectiveMode,
      n_level: nLevel,
      trials_completed: trialIndex,
      total_trials: totalTrials,
      progress_pct: Math.round((trialIndex / safeTotalTrials) * 100),
      play_context: sessionPlayContext,
      journey_id: effectiveJourneyId,
      stage_id: effectiveJourneyStageId,
    });
    dispatch({ type: 'STOP' });
    navigate('/');
  }, [
    dispatch,
    navigate,
    track,
    summary,
    effectiveMode,
    nLevel,
    trialIndex,
    totalTrials,
    sessionPlayContext,
  ]);

  const handleQuitCancel = useCallback(() => {
    setShowQuitModal(false);
  }, []);

  const handleRestartFromPause = useCallback(() => {
    triggerHaptic(10);
    createSession();
    setPendingAutoStart(true);
  }, [triggerHaptic, createSession, setPendingAutoStart]);

  const setStatsTab = useSettingsStore((s) => s.setStatsTab);
  const setStatsMode = useSettingsStore((s) => s.setStatsMode);
  const setStatsJourneyFilter = useSettingsStore((s) => s.setStatsJourneyFilter);

  // Callbacks for SessionReport
  const handlePlayAgain = useCallback(async () => {
    const r = stableFinishedReport;
    if (r) track('report_action_clicked', buildReportActionPayload(r, 'play_again'));
    // Hybrid journey: if the read model's next mode differs from current mode,
    // navigate to the correct page instead of restarting the same mode.
    if (
      r &&
      isJourneySession &&
      nextJourneySessionForPlayAgain &&
      !nextJourneySessionForPlayAgain.isComplete
    ) {
      if (nextJourneySessionForPlayAgain.gameMode !== r.gameMode) {
        navigate(nextJourneySessionForPlayAgain.route, {
          state: nextSessionToPlayIntent(nextJourneySessionForPlayAgain),
        });
        return;
      }
    }
    createSession();
    setPendingAutoStart(true);
  }, [
    createSession,
    isJourneySession,
    nextJourneySessionForPlayAgain,
    navigate,
    setPendingAutoStart,
    stableFinishedReport,
    track,
  ]);

  /**
   * Start a new free-training session at a specific level.
   * Keeps manual shortcuts safe by clamping to valid N-back bounds.
   */
  const handleBackToHome = useCallback(async () => {
    const r = stableFinishedReport;
    if (r) track('report_action_clicked', buildReportActionPayload(r, 'home'));
    navigate('/');
  }, [navigate, stableFinishedReport, track]);

  const handleReplay = useCallback(() => {
    if (summary?.sessionId) {
      const r = stableFinishedReport;
      if (r) track('report_action_clicked', buildReportActionPayload(r, 'replay'));
      navigate(`/replay/${summary.sessionId}`);
    }
  }, [navigate, stableFinishedReport, summary?.sessionId, track]);

  // Interactive correction (only for Tempo mode)
  const handleCorrect = useCallback(() => {
    if (summary?.sessionId) {
      const r = stableFinishedReport;
      if (r) track('report_action_clicked', buildReportActionPayload(r, 'correct'));
      navigate(`/replay/${summary.sessionId}?mode=interactive`);
    }
  }, [navigate, stableFinishedReport, summary?.sessionId, track]);

  // Play click sound on button press (if enabled)
  const playClickIfEnabled = useCallback(() => {
    if (!buttonSoundsEnabled) {
      return;
    }
    if (typeof window === 'undefined') {
      audio.playClick();
      return;
    }
    window.setTimeout(() => {
      audio.playClick();
    }, 0);
  }, [buttonSoundsEnabled]);

  const unlockSessionAudioFromGesture = useCallback(() => {
    // Firefox is stricter than Chrome about Web Audio autoplay/user-activation.
    // Kick off init synchronously from the real click/tap handler so the session
    // can start even on a fresh profile / first launch.
    void audio.init().catch(() => {});
  }, [audio]);

  const scheduleCountdownAudio = useCallback(
    (prepDelayMs: number) => {
      if (!buttonSoundsEnabled) return () => {};
      return audio.scheduleCountdownTicks?.(prepDelayMs) ?? (() => {});
    },
    [buttonSoundsEnabled, audio],
  );
  const { onClaimTelemetry: handleClaimTelemetry } = useNbackInputTelemetry({
    phase,
    trialIndex,
    snapshot,
    dispatch,
  });

  // Keyboard controls - tracks pressed keys and handles keydown/keyup
  const { pressedKeys } = useKeyboardControls({
    phase,
    effectiveModalities,
    dispatch,
    playClick: playClickIfEnabled,
    onClaimTelemetry: handleClaimTelemetry,
    selfPaced,
    devPanelEnabled: adminEnabled,
    setDevPanelOpen,
  });

  const translateControlLabel = useCallback(
    (key: string, fallback?: string) => (fallback ? t(key, fallback) : t(key)),
    [t],
  );

  const { controls: generatedControls } = useGameControls({
    effectiveModalities,
    pressedKeys,
    dispatch,
    playClick: playClickIfEnabled,
    t: translateControlLabel,
    buttonOrder: gameButtonOrder,
    onClaimTelemetry: handleClaimTelemetry,
  });

  const positionAudioButtonsInverted = useMemo(() => {
    const positionIndex = generatedControls.findIndex((c) => c.id === 'position');
    const audioIndex = generatedControls.findIndex((c) => c.id === 'audio');
    if (positionIndex === -1 || audioIndex === -1) return undefined;
    return audioIndex < positionIndex;
  }, [generatedControls]);

  const controlShortcutHint = useMemo(() => {
    if (generatedControls.length === 0) return null;
    return generatedControls.map((control) => `${control.shortcut} ${control.label}`).join(' · ');
  }, [generatedControls]);

  const handlePositionAudioButtonsInvertedChange = useCallback(
    (nextInverted: boolean) => {
      if (!setGameButtonOrder) return;
      const currentOrder =
        gameButtonOrder && gameButtonOrder.length > 0
          ? [...gameButtonOrder]
          : generatedControls.map((c) => c.id);
      const positionIndex = currentOrder.indexOf('position');
      const audioIndex = currentOrder.indexOf('audio');
      if (positionIndex === -1 || audioIndex === -1) return;
      const isInverted = audioIndex < positionIndex;
      if (isInverted === nextInverted) return;
      currentOrder[positionIndex] = 'audio';
      currentOrder[audioIndex] = 'position';
      setGameButtonOrder(currentOrder);
    },
    [gameButtonOrder, generatedControls, setGameButtonOrder],
  );

  const handleControlsReorder = useCallback(
    (newOrder: string[]) => {
      setGameButtonOrder?.(newOrder);
    },
    [setGameButtonOrder],
  );

  // Session Recovery: save snapshot while playing
  const sessionRecoveryEnabled = useSettingsStore((s) => s.ui.sessionRecoveryEnabled);
  const recoverySnapshotParams = useMemo<CreateRecoverySnapshotParams>(
    () => ({
      sessionId: session.sessionId,
      modeId: 'game',
      config: blockConfig,
      trialIndex,
      totalTrials,
      nLevel,
      playMode: sessionPlayContext,
      journeyStageId: effectiveJourneyStageId,
      journeyId: effectiveJourneyId,
    }),
    [
      session.sessionId,
      blockConfig,
      trialIndex,
      totalTrials,
      nLevel,
      sessionPlayContext,
      effectiveJourneyStageId,
      effectiveJourneyId,
    ],
  );
  useSessionRelaunchOnFlag({
    shouldRelaunch: shouldRelaunchFromJourneyReportAction,
    relaunchSession: () => createSession(),
    queueStart: () => setPendingAutoStart(true),
  });
  useSessionBeforeUnloadFinalize({
    phase,
    dispatch,
    session,
  });
  useSessionDiagnosticsHealthReporting({
    diagnostics,
    session,
  });
  useSessionWakeLock({
    phase,
    wakeLock,
  });
  usePendingAutoStart({
    pendingAutoStart,
    phase,
    dispatch,
    startEvent: { type: 'START' },
    setPendingAutoStart,
  });
  useSessionStopOnUnmount(session);
  useSessionRecoverySnapshot({
    enabled: sessionRecoveryEnabled,
    phase,
    activePhases: ['stimulus', 'waiting', 'paused'],
    sessionRecovery,
    params: recoverySnapshotParams,
  });

  // NOTE: Focus tracking (auto-pause on tab switch) is handled by GameSession.setupFocusTracking()
  // See packages/logic/src/session/game-session.ts:472-489

  // Session Completion: scoring, XP, progression, report storage
  // Direct callback on XState actor — fires synchronously when machine reaches 'finished',
  // bypassing React's render cycle for immediate persistence.
  session.onFinished = useEffectEvent(
    (
      finishedSummary: import('@neurodual/logic').SessionSummary | null,
      events: readonly import('@neurodual/logic').GameEvent[],
    ) => {
      if (!finishedSummary?.sessionId) return;

      const currentSessionId = finishedSummary.sessionId;
      const isAbandoned = events.some(
        (event) =>
          event.type === 'SESSION_ENDED' && 'reason' in event && event.reason === 'abandoned',
      );
      if (isAbandoned) {
        void cleanupAbandonedSession(persistence, currentSessionId).catch(() => {});
        return;
      }

      const currentMuteCount = useSettingsStore.getState().ui.binauralMuteShownCount;
      if (currentMuteCount < 3) {
        setBinauralMuteShownCount(currentMuteCount + 1);
      }

      void (async () => {
        const completion = await complete({
          mode: 'tempo',
          sessionId: currentSessionId,
          events,
          generator: finishedSummary.generator,
          gameMode: effectiveMode,
          gameModeLabel:
            effectiveMode === 'dualnback-classic'
              ? t('settings.gameMode.dualnbackClassic')
              : effectiveMode === 'dualnback-classic'
                ? t('settings.gameMode.dualnbackClassic')
                : effectiveMode === 'sim-brainworkshop'
                  ? t('settings.gameMode.brainWorkshop')
                  : t('settings.gameMode.libre'),
          activeModalities: effectiveModalities as readonly ModalityId[],
          currentStrikes:
            effectiveMode === 'sim-brainworkshop' ? session.getInitialStrikes() : undefined,
        });
        if (!completion) return;

        track('session_completed', {
          session_id: currentSessionId,
          mode: effectiveMode,
          n_level: nLevel,
          modalities: effectiveModalities,
          duration_ms: completion.report.durationMs,
          ups: completion.ups.score,
          passed: completion.passed,
          next_level: completion.nextLevel,
          level_change: completion.nextLevel - nLevel,
          xp_earned: completion.xpBreakdown?.total ?? 0,
          badges_earned: completion.newBadges?.length ?? 0,
          leveled_up: completion.leveledUp,
          play_context: sessionPlayContext,
          ...getJourneyAnalyticsProps(completion.report),
        });
      })();
    },
  );

  const isPlaying = phase === 'stimulus' || phase === 'waiting';
  // Keep stimulus layers mounted during active phases.
  const renderStimulusLayers = isPlaying && !isPaused;
  const stimulusHostVisibility = renderStimulusLayers && stimulusVisible ? '1' : '0';

  // Brain Workshop variable N-back: must display effective N per trial (otherwise unplayable).
  const bwVariableNBackEnabled =
    effectiveMode === 'sim-brainworkshop' &&
    (resolvedMode.spec.extensions as { variableNBack?: boolean } | undefined)?.variableNBack ===
      true;
  const baseNLevel = nLevel;
  const displayNLevel =
    bwVariableNBackEnabled &&
    trial &&
    typeof trial.effectiveNBack === 'number' &&
    trial.index >= baseNLevel
      ? trial.effectiveNBack
      : baseNLevel;
  const shouldShowNLevel = gameShowNLevel || bwVariableNBackEnabled;

  // ========== LAYOUT CAPTURE (initial positions for edit mode) ==========
  const captureCurrentLayout = (): Record<string, ZoneRect> => {
    const container = gameContainerRef.current;
    const result: Record<string, ZoneRect> = {};
    if (!container) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      result['header'] = { x: 0, y: 0, w, h: Math.round(h * 0.14) };
      result['game'] = { x: 0, y: Math.round(h * 0.14), w, h: Math.round(h * 0.57) };
      const btnY = Math.round(h * 0.71);
      const btnH = Math.round(h * 0.14);
      const btnW = Math.round(w / Math.max(1, effectiveModalities.length));
      effectiveModalities.forEach((m, i) => {
        result[`btn_${m}`] = { x: i * btnW, y: btnY, w: btnW, h: btnH };
      });
      return result;
    }
    const cRect = container.getBoundingClientRect();
    const toRect = (el: Element): ZoneRect => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left - cRect.left),
        y: Math.round(r.top - cRect.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    if (zoneHeaderRef.current) result['header'] = toRect(zoneHeaderRef.current);
    if (zoneGameRef.current) result['game'] = toRect(zoneGameRef.current);
    // Capture individual button positions from DOM
    for (const m of effectiveModalities) {
      const btn = container.querySelector(`[data-testid="btn-match-${m}"]`);
      if (btn) {
        result[`btn_${m}`] = toRect(btn);
      } else if (zoneControlsRef.current) {
        // Fallback: distribute buttons across controls zone
        const ctrl = toRect(zoneControlsRef.current);
        const idx = effectiveModalities.indexOf(m);
        const count = effectiveModalities.length;
        const w = Math.round(ctrl.w / count);
        result[`btn_${m}`] = { x: ctrl.x + idx * w, y: ctrl.y, w, h: ctrl.h };
      }
    }
    return result;
  };

  // ========== RENDER ZONE CONTENT (for GameLayoutEditor — header/game only) ==========
  // Note: Must be defined before any early returns (React hooks rule)
  const renderZoneContent = useCallback(
    (zone: LayoutZone, _isDragging: boolean) => {
      switch (zone) {
        case 'header':
          return (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden">
                <CanvasWeave lineCount={8} rounded="full" />
                <div className="relative z-10 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-bold uppercase">
                  N-{displayNLevel}
                </div>
                <div className="relative z-10 px-3 py-1.5 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text">
                  {String(displayedTrial).padStart(2, '0')} /{' '}
                  {String(safeTotalTrials).padStart(2, '0')}
                </div>
              </div>
            </div>
          );
        case 'game':
          return (
            <div className="flex items-center justify-center h-full">
              <Grid
                activePosition={null}
                showStimulus={false}
                stimulusStyle={stimulusStyle}
                gridStyle={tempoGridStyle}
                color={resolveThemeColor(stimulusColor, colorModalityTheme)}
                showPlayButton={false}
                className="rounded-2xl opacity-50"
              />
            </div>
          );
        default:
          return null;
      }
    },
    [
      displayNLevel,
      displayedTrial,
      safeTotalTrials,
      stimulusStyle,
      stimulusColor,
      effectiveModalities,
      controlsScale,
      t,
      tempoGridStyle,
    ],
  );

  // ========== RENDER BUTTON CONTENT (per-modality preview for editor) ==========
  const renderButtonContent = useCallback(
    (modalityId: string) => (
      <div className="w-full h-full flex items-center justify-center">
        <GameControls
          controls={generatedControls.filter((c) => c.id === modalityId)}
          disabled
          scale={controlsScale}
        />
      </div>
    ),
    [generatedControls, controlsScale],
  );

  // Calibration mode: intercept session end, record accuracy, navigate back
  const { pendingCommit: pendingCalibrationCommit } = useCalibrationIntercept(
    phase,
    stableFinishedReport,
    'nback',
  );
  const finalizingPending =
    effectiveMode === 'dualnback-classic' &&
    phase === 'finished' &&
    (sessionFinalizing || reportPending);
  const showDelayedFinalizingOverlay = useDelayedFlag(finalizingPending, 320);

  const showClassicGridFinalizingOverlay = finalizingPending && showDelayedFinalizingOverlay;
  const shouldSynergyReturn = useNbackReportRuntime({
    phase,
    summary,
    stableReportTick,
    completionIsProcessing,
    completionResult,
    stableReportSessionId,
    stableCompletionSessionId,
    reportReady,
    reportPending,
    finalizingPending,
    showClassicGridFinalizingOverlay,
    gameplayPlayMode,
    stableFinishedReport,
    stableFinishedCompletion,
    effectiveMode,
    navigate,
  });
  if (shouldSynergyReturn) {
    return null;
  }

  if (pendingCalibrationCommit) {
    return (
      <CalibrationInterceptCommit
        key={pendingCalibrationCommit.sessionId}
        {...pendingCalibrationCommit}
      />
    );
  }

  // Show report when finished and completion data is ready.
  // For Dual N-Back classic, while data is not ready we keep the game page visible
  // and render a grid-only finalizing overlay (see main game render below).
  if (phase === 'finished' && summary && reportReady) {
    const stableReport = stableFinishedReport;
    const stableCompletion = stableFinishedCompletion;
    if (!stableReport || !stableCompletion) {
      return null;
    }

    const reportVariant = location.pathname.startsWith('/beta/')
      ? ('beta' as const)
      : ('stable' as const);
    const contextMessage = translateContextualMessage(
      t,
      generateContextualMessageData(stableReport, {
        style: reportVariant === 'beta' ? 'analyst' : 'simple',
        variant: reportVariant,
      }),
    );

    // Share anonymous stats (if user opted in) - only once per session
    if (statsSharedRef.current !== summary.sessionId) {
      statsSharedRef.current = summary.sessionId;
      shareStats(stableReport);
    }

    return (
      <div className="game-report-scroll" data-testid="session-report-transition">
        <div
          className="relative space-y-6 pt-0 pb-8 px-0 md:px-4 md:py-8"
          data-testid="session-report-container"
        >
          <UnifiedSessionReport
            data={stableReport}
            message={contextMessage}
            labels={{
              ...unifiedReportLabels,
              // Resolve spec-driven labels dynamically from report data
              modeScoreLabel: t(stableReport.modeScore.labelKey),
              modeScoreTooltip: stableReport.modeScore.tooltipKey
                ? t(stableReport.modeScore.tooltipKey)
                : undefined,
            }}
            onPlayAgain={handlePlayAgain}
            onBackToHome={handleBackToHome}
            onStartAtLevel={(level) => {
              track(
                'report_action_clicked',
                buildReportActionPayload(stableReport, 'start_at_level'),
              );
              createSession(level);
              setPendingAutoStart(true);
            }}
            onGoToJourneyStage={(stageId, nLevel) => {
              track('report_action_clicked', buildReportActionPayload(stableReport, 'go_to_stage'));
              const journeyId =
                stableReport.journeyId ?? stableReport.journeyContext?.journeyId ?? undefined;
              const suggestedStartLevel = stableReport.journeyContext?.suggestedStartLevel;
              if (
                typeof journeyId === 'string' &&
                typeof suggestedStartLevel === 'number' &&
                Number.isFinite(suggestedStartLevel)
              ) {
                useSettingsStore.getState().expandJourneyStartLevel(journeyId, suggestedStartLevel);
              }
              const action = resolveReportJourneyAction({
                stageId,
                nLevel,
                journeyId,
                currentJourneyStageId: effectiveJourneyStageId,
                currentJourneyId: effectiveJourneyId,
                reportNLevel: stableReport.nLevel,
                suggestedStartLevel,
                journeyGameModeId: journeyGameMode ?? stableReport.gameMode,
                currentSessionGameModeId: stableReport.gameMode,
                nextSessionGameModeId:
                  stableReport.journeyContext?.nextSessionGameMode ?? stableReport.gameMode,
              });
              if (action.kind === 'relaunch-current-session') {
                createSession(action.overrideNLevel);
                setPendingAutoStart(true);
                return;
              }
              const targetModeId = action.intent.gameModeId ?? stableReport.gameMode;
              navigate(getRouteForMode(targetModeId), {
                state: action.intent,
              });
            }}
            onGoToStats={(report) => {
              track('report_action_clicked', buildReportActionPayload(report, 'go_to_stats'));
              const preset = getStatsPresetForReport(report);
              setStatsTab(preset.tab);
              setStatsMode(preset.mode);
              setStatsJourneyFilter(preset.journeyFilter);
              navigate('/stats');
            }}
            onReplay={handleReplay}
            onCorrect={
              [
                'dualnback-classic',
                'dual-place',
                'dual-memo',
                'dualnback-classic',
                'sim-brainworkshop',
                'custom',
              ].includes(effectiveMode ?? '')
                ? handleCorrect
                : undefined
            }
            showFloatingCloseButton
            xpData={
              stableCompletion.xpBreakdown
                ? {
                    xpBreakdown: stableCompletion.xpBreakdown,
                    leveledUp: stableCompletion.leveledUp,
                    newLevel: stableCompletion.newLevel,
                    newBadges: stableCompletion.newBadges,
                  }
                : undefined
            }
            betaEnabled={betaScoringEnabled}
          />

        </div>
      </div>
    );
  }

  // Hauteur Timeline : normale = h-28 (112px), mirror = h-60 (240px)
  const timelineHeight = mirrorMode ? 'h-60' : 'h-28';

  // Style pour le scale desktop (legacy, kept for compatibility)
  const scaleStyle = shouldScale
    ? {
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
      }
    : undefined;

  // CSS Grid layout with calculated dimensions
  // Generate row heights based on layout order
  // When custom zone heights are set (edit mode), use flex proportions
  const getRowHeight = (zone: LayoutZone): string => {
    if (gameZoneHeights) {
      // Use flex proportions when custom heights are set
      return `${gameZoneHeights[zone]}fr`;
    }
    // Default auto-sizing
    switch (zone) {
      case 'header':
        return 'auto';
      case 'game':
        return `${layout.gameAreaHeight}px`;
      case 'controls':
        return layout.isMobile ? `${layout.controlsHeight}px` : 'auto';
    }
  };

  // On mobile: 1fr spacer at the bottom only (push content up).
  // On desktop: 1fr spacer between header and game + 1fr at bottom → vertically centers game+controls.
  const headerIdx = gameLayoutOrder.indexOf('header');
  const useDesktopCenter = !layout.isMobile && headerIdx !== -1;

  const rowDefs: string[] = [];
  const areaDefs: string[] = [];
  for (let i = 0; i < gameLayoutOrder.length; i++) {
    const zone = gameLayoutOrder[i] as LayoutZone;
    rowDefs.push(getRowHeight(zone));
    areaDefs.push(`"${zone}"`);
    // Insert spacer right after header on desktop
    if (useDesktopCenter && i === headerIdx) {
      rowDefs.push('1fr');
      areaDefs.push('"."');
    }
  }
  // Trailing spacer (always present)
  rowDefs.push('1fr');
  areaDefs.push('"."');

  const gridLayoutStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: rowDefs.join(' '),
    gridTemplateAreas: areaDefs.join(' '),
    gap: 'var(--game-page-gap)',
    height: 'var(--fullscreen-usable-height)',
    padding: '0 var(--game-page-pad-x)',
    paddingBottom: 'var(--game-page-pad-bottom)',
  };

  // ========== LAYOUT EDIT MODE RENDER ==========
  if (layoutEditMode) {
    // Build initial layouts: merge saved zone layouts + saved button layouts + captured from DOM
    const captured = captureCurrentLayout();
    const initialLayouts: Record<string, ZoneRect> = { ...captured };
    if (gameZoneLayouts) {
      initialLayouts['header'] = gameZoneLayouts.header;
      initialLayouts['game'] = gameZoneLayouts.game;
    }
    if (gameButtonLayouts) {
      for (const [id, rect] of Object.entries(gameButtonLayouts)) {
        initialLayouts[`btn_${id}`] = rect;
      }
    }

    const editorZones: ZoneConfig[] = [
      { id: 'header', label: 'HUD', color: '#f59e0b', element: renderZoneContent('header', false) },
      { id: 'game', label: 'Grille', color: '#10b981', element: renderZoneContent('game', false) },
      ...effectiveModalities.map((m) => ({
        id: `btn_${m}`,
        label: t(`game.controls.${m}`, m),
        color: '#3b82f6',
        element: renderButtonContent(m),
      })),
    ];

    return (
      <div style={{ position: 'relative', height: 'var(--fullscreen-usable-height)' }}>
        <GameLayoutEditor
          zones={editorZones}
          initialLayouts={initialLayouts}
          onSave={(layouts) => {
            const { header, game, ...rest } = layouts;
            if (header && game) setGameZoneLayouts({ header, game });
            const btnLayouts: Record<string, ZoneRect> = {};
            for (const [key, rect] of Object.entries(rest)) {
              if (key.startsWith('btn_')) btnLayouts[key.slice(4)] = rect;
            }
            setGameButtonLayouts(Object.keys(btnLayouts).length > 0 ? btnLayouts : null);
            setLayoutEditMode(false);
          }}
          onReset={() => {
            resetGameLayout();
            setLayoutEditMode(false);
          }}
          onClose={() => setLayoutEditMode(false)}
        />
      </div>
    );
  }

  // ========== NORMAL GAME RENDER ==========
  const containerStyle = gameZoneLayouts
    ? {
        position: 'relative' as const,
        height: 'var(--fullscreen-usable-height)',
        width: '100%',
        overflow: 'hidden',
      }
    : { ...gridLayoutStyle, ...(scaleStyle ?? {}) };

  return (
    <div
      ref={gameContainerRef}
      className="relative overflow-hidden"
      data-testid="game-page"
      style={containerStyle}
    >
      {/* Background weave texture - very subtle */}
      <CanvasWeave lineCount={24} rounded="none" opacity={0.04} />

      {betaEnabled && <SyncHUD enabled={betaEnabled} snapshot={snapshot} />}

      {/* ========== AUDIO TEXTURE INTRO BANNER — overlay above all zones ========== */}
      {/* Gated behind beta — kept for future reintroduction */}
      {betaEnabled && showPinkNoiseBanner && (
        <div
          className="absolute left-1/2 top-3 z-50 w-[calc(100%-0.75rem)] -translate-x-1/2"
          style={{
            maxWidth: layout.isMobile
              ? undefined
              : `${Math.min(layout.availableWidth, layout.gridSize + 32)}px`,
          }}
        >
          <div className="flex flex-col bg-card border border-border/50 rounded-2xl shadow-xl p-4">
            {/* Icon + description */}
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                <WaveformIcon size={18} />
              </div>
              <p className="text-sm text-foreground leading-snug">{t('game.pinkNoiseInfo')}</p>
            </div>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={dismissPinkNoiseBanner}
              className="mt-3 self-end py-1.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90"
            >
              {t('game.pinkNoiseDismiss')}
            </button>
          </div>
        </div>
      )}

      {/* ========== ZONE HEADER ========== */}
      <div
        ref={zoneHeaderRef}
        className="flex flex-col items-center pt-4 lg:pt-2"
        style={
          gameZoneLayouts
            ? {
                position: 'absolute',
                left: gameZoneLayouts.header.x,
                top: gameZoneLayouts.header.y,
                width: gameZoneLayouts.header.w,
                height: gameZoneLayouts.header.h,
              }
            : { gridArea: 'header' }
        }
      >
        {/* HUD — unified GameHUD with custom slots */}
        <GameHUD
          customLabel={
            shouldShowNLevel ? (
              <button
                type="button"
                className="relative z-10 w-[54px] h-8 cursor-pointer [perspective:200px]"
                onClick={(e) => {
                  e.currentTarget.querySelector('.flip-inner')?.classList.toggle('flipped');
                }}
                data-testid="n-level-display"
              >
                <div className="flip-inner relative w-full h-full transition-transform duration-300 [transform-style:preserve-3d] [&.flipped]:[transform:rotateY(180deg)]">
                  <div
                    className={`w-full h-full px-1.5 rounded-lg text-[13px] font-bold uppercase [backface-visibility:hidden] flex items-center justify-center leading-none ${MODE_BADGE_STYLE.bg} ${MODE_BADGE_STYLE.text}`}
                    data-capture-badge="game-hud"
                  >
                    N-{displayNLevel}
                  </div>
                  <div
                    className={`absolute inset-0 w-full h-full px-1.5 rounded-lg text-[13px] font-bold uppercase [backface-visibility:hidden] [transform:rotateY(180deg)] flex items-center justify-center leading-none ${MODE_BADGE_STYLE.bg} ${MODE_BADGE_STYLE.text}`}
                    data-capture-badge="game-hud"
                  >
                    {effectiveMode === 'sim-brainworkshop'
                      ? 'BW'
                      : effectiveMode === 'dualnback-classic'
                        ? 'DNB'
                        : 'DC'}
                  </div>
                </div>
              </button>
            ) : undefined
          }
          customTrialCounter={
            <button
              type="button"
              className={`${HUD_BADGE} gap-1 cursor-pointer`}
              onClick={() => setGameCountdownMode(!gameCountdownMode)}
              data-capture-badge="game-hud"
            >
              <TimerIcon size={12} weight="bold" className="text-woven-text-muted" />
              {gameCountdownMode ? (
                <span className="text-[15px] tabular-nums tracking-tight">{remainingTrials}</span>
              ) : (
                <>
                  <span className="text-[15px] tabular-nums tracking-tight">
                    {String(displayedTrial).padStart(2, '0')}
                  </span>
                  <span className="text-woven-text-muted"> / </span>
                  <span className="text-[15px] tabular-nums tracking-tight">
                    {String(safeTotalTrials).padStart(2, '0')}
                  </span>
                </>
              )}
            </button>
          }
          trialIndex={trialIndex}
          totalTrials={totalTrials}
          countdownMode={gameCountdownMode}
          isPaused={isPaused}
          canPause={isPlaying || isPaused}
          onTogglePause={() => {
            playClickIfEnabled();
            if (isPaused) {
              dispatch({ type: 'RESUME' });
            } else {
              dispatch({ type: 'PAUSE' });
            }
          }}
          onSettings={() => {
            if (isPlaying && !isPaused) {
              dispatch({ type: 'PAUSE' });
            }
            setShowSettingsOverlay(true);
          }}
          onQuit={handleQuitClick}
          onRestart={handleRestartFromPause}
          showProgressBar={gameShowProgressBar}
          onHaptic={triggerHaptic}
          className="pt-0"
        />

        {/* ========== BINAURAL MUTE PILL — below mute pill ========== */}
        {betaEnabled && reserveMutePillSpace && (
          <div
            className={`mt-2 flex items-center gap-1.5 ${showMutePill ? 'animate-in fade-in slide-in-from-top-1 duration-300' : 'invisible'}`}
          >
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                audio.setConfig({ pinkNoiseLevel: 0 });
                markTextureMuted();
              }}
              data-capture-control="pill"
              className="relative flex items-center gap-1.5 py-2.5 px-4 rounded-full bg-woven-surface border border-woven-border/25 text-woven-text text-xs font-medium transition-colors hover:bg-woven-cell-rest"
            >
              <CanvasWeave lineCount={6} rounded="full" opacity={0.04} />
              <SpeakerSlashIcon size={14} className="relative z-10 shrink-0" />
              <span className="relative z-10">{t('game.hud.muteTexture')}</span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setBinauralMuteShownCount(3)}
              data-capture-control="ghost-icon"
              className="relative z-10 w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-woven-cell-rest"
              aria-label={t('common.dismiss')}
            >
              <XIcon size={12} />
            </button>
          </div>
        )}

        {/* Timeline slot - reserve height early to avoid header/game layout shift */}
        {effectiveGuidedMode && (
          <div
            className={`w-full ${timelineHeight} flex items-end justify-center transition-opacity duration-150 ${
              isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={!isPlaying}
          >
            {isPlaying ? (
              <GuidedTimeline trials={trialHistory} nLevel={nLevel} mirrorMode={mirrorMode} />
            ) : null}
          </div>
        )}

        <div className="relative h-10 w-full shrink-0 px-4">
          <div className="absolute inset-0 flex items-center justify-center text-center">
            {isPaused ? null : phase === 'idle' && !message ? (
              <p className="text-center text-xs text-muted-foreground/70 hidden lg:block">
                {t('game.hud.spaceToStart')}
              </p>
            ) : selfPaced && isPlaying && !message ? (
              <p className="text-center text-xs text-muted-foreground/70 hidden lg:block">
                {t('game.hud.enterToAdvance', 'Press Enter to advance')}
              </p>
            ) : (
              <StartingCountdown
                phase={phase}
                prepDelayMs={prepDelayMs}
                getReadyText={t('game.starting.getReady')}
                scheduleAudio={scheduleCountdownAudio}
              />
            )}
          </div>
        </div>
      </div>

      {/* ========== ZONE GAME ========== */}
      {/* Centrage absolu seulement avec 2 modalités ou moins (mode standard) */}
      {/* Sinon utiliser la zone grid normale (mode BW multi-modalités) */}
      <div
        ref={zoneGameRef}
        className="flex flex-col items-center justify-center"
        style={
          gameZoneLayouts
            ? {
                position: 'absolute',
                left: gameZoneLayouts.game.x,
                top: gameZoneLayouts.game.y,
                width: gameZoneLayouts.game.w,
                height: gameZoneLayouts.game.h,
              }
            : { gridArea: 'game' }
        }
        data-testid="game-area"
      >
        {/* Grid with calculated size - gridScale applied via CSS transform for proper centering */}
        {/* Double-tap to pause */}
        <div
          role="button"
          tabIndex={-1}
          className="relative z-10 pointer-events-auto"
          style={
            {
              width: layout.gridSize,
              height: layout.gridSize,
              transform: gridScale !== 1.0 ? `scale(${gridScale})` : undefined,
              transformOrigin: gridScale !== 1.0 ? 'top center' : 'center',
              ['--nd-stimulus-visibility']: stimulusHostVisibility,
            } as CSSProperties
          }
          data-nd-sync-host="nback-stimulus"
          onDoubleClick={() => {
            if (isPlaying && !isPaused) {
              dispatch({ type: 'PAUSE' });
            }
          }}
        >
          <Grid
            activePosition={
              effectiveModalities.includes('position') || needsGridPosition
                ? (trial?.position ?? null)
                : null
            }
            activePositions={activePositions}
            multiMode={activePositions && activePositions.size > 1 ? multiMode : undefined}
            activeVisValues={activeVisValues}
            activeStimulusShape={
              (effectiveModalities.includes('position') || needsGridPosition) &&
              effectiveModalities.includes('image')
                ? (gridStimulus?.shape ?? null)
                : null
            }
            activeStimulusText={
              effectiveModalities.includes('position') || needsGridPosition
                ? (gridStimulus?.text ?? null)
                : null
            }
            centerStimulusShape={
              !effectiveModalities.includes('position') &&
              !needsGridPosition &&
              effectiveModalities.includes('image')
                ? (gridStimulus?.shape ?? null)
                : null
            }
            centerStimulusText={
              !effectiveModalities.includes('position') && !needsGridPosition
                ? (gridStimulus?.text ?? null)
                : null
            }
            showStimulus={renderStimulusLayers}
            stimulusStyle={
              effectiveModalities.includes('color') &&
              (stimulusStyle === 'stringart' || stimulusStyle === 'custom')
                ? 'full'
                : stimulusStyle
            }
            color={
              effectiveModalities.includes('color')
                ? resolveModalityColor(trial?.color, colorModalityTheme)
                : effectiveModalities.includes('image') ||
                    effectiveModalities.includes('arithmetic') ||
                    effectiveModalities.includes('visvis') ||
                    effectiveModalities.includes('visaudio') ||
                    effectiveModalities.includes('audiovis')
                  ? (trial?.color ?? resolveThemeColor(stimulusColor, colorModalityTheme))
                  : resolveThemeColor(stimulusColor, colorModalityTheme)
            }
            customImageUrl={customImageUrl ?? undefined}
            stringArtPoints={stringArtPoints}
            gridStyle={tempoGridStyle}
            paused={isPaused}
            showPlayButton={phase === 'idle' && !message && isSystemReady && commandBus != null}
            onPlay={() => {
              haptic.impact('medium');
              if (!isSystemReady || commandBus == null) return;
              unlockSessionAudioFromGesture();
              dispatch({ type: 'START' });
            }}
            onResume={() => {
              playClickIfEnabled();
              haptic.impact('medium');
              if (!isSystemReady || commandBus == null) return;
              unlockSessionAudioFromGesture();
              dispatch({ type: 'RESUME' });
            }}
            className={`rounded-2xl w-full h-full transition-[opacity,transform] duration-150 ${
              showClassicGridFinalizingOverlay ? 'opacity-70' : ''
            }`}
          />
          {/* Audio-only overlay: blur the grid and show headphones icon */}
          {!effectiveModalities.some((m) => m.startsWith('position')) && !needsGridPosition && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-woven-bg/60 pointer-events-none">
              <HeadphonesIcon weight="duotone" className="size-12 text-woven-text-muted" />
              <span className="text-sm font-medium text-woven-text-muted">
                {t('game.audioMode', 'Audio mode')}
              </span>
            </div>
          )}
          {showClassicGridFinalizingOverlay && (
            <div className="absolute inset-0 z-30 rounded-2xl pointer-events-auto">
              {/* Avoid here: it can be extremely expensive and freeze UI on some GPUs/webviews */}
              <div className="absolute inset-0 rounded-2xl bg-woven-bg/85" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-woven-border bg-woven-surface px-4 py-2.5 shadow-sm">
                  <Spinner size={18} className="text-woven-text-muted" />
                  <span className="text-sm font-semibold text-woven-text leading-none">
                    {t('common.loading', 'Loading...')}
                  </span>
                  <span className="text-[11px] text-woven-text-muted leading-none">
                    {t('stats.report.loadingReport', 'Loading report...')}
                  </span>
                </div>
              </div>
            </div>
          )}
          {reportFailed && (
            <div className="absolute inset-x-4 bottom-4 z-30 rounded-xl border border-destructive/30 bg-background p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-destructive">
                {t('stats.report.errorLoading', 'Could not load report')}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {completionError?.message ??
                  t('stats.report.errorLoadingDetail', 'The pipeline is blocked or errored.')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========== ZONE CONTROLS ========== */}
      {/* Shown always in default mode; in per-button mode only for message/arithmetic */}
      <div
        ref={zoneControlsRef}
        className="flex flex-col items-center justify-end page-inset-bottom"
        style={
          gameButtonLayouts
            ? {
                // Per-button mode: hidden when no message, shown centered at bottom for message
                position: 'absolute',
                left: '50%',
                bottom: 80,
                transform: 'translateX(-50%)',
                zIndex: 10,
                visibility: message ? 'visible' : 'hidden',
              }
            : gameZoneLayouts
              ? {
                  position: 'absolute',
                  left: gameZoneLayouts.controls?.x ?? 0,
                  top: gameZoneLayouts.controls?.y ?? 0,
                  width: gameZoneLayouts.controls?.w ?? 300,
                  height: gameZoneLayouts.controls?.h ?? 200,
                }
              : { gridArea: 'controls' }
        }
      >
        {/* Message (end of block) */}
        {message ? (
          <div className="text-center text-muted-foreground text-sm max-w-[300px]">{message}</div>
        ) : (
          <div className="w-full flex flex-col items-center gap-4 pb-3 sm:pb-2">
            {effectiveModalities.includes('arithmetic') &&
              (phase === 'stimulus' || phase === 'waiting' || phase === 'paused') && (
                <ArithmeticKeypad
                  display={arithmeticInput?.display ?? '0'}
                  disabled={!isPlaying || isPaused}
                  labels={{
                    answer: t('game.arithmetic.answer', 'Answer'),
                    clear: t('game.arithmetic.clear', 'Clear'),
                    hint: t(
                      'game.arithmetic.hint',
                      "Clavier: 0–9 · '-' pour le signe · '.' pour décimal · Retour arrière pour effacer",
                    ),
                  }}
                  onInput={(key, inputMethod) => {
                    dispatch({
                      type: 'ARITHMETIC_INPUT',
                      key,
                      inputMethod,
                    });
                  }}
                  onPlayClick={playClickIfEnabled}
                />
              )}

            {/* GameControls: only shown when NOT using per-button layout */}
            {!gameButtonLayouts && (
              <GameControls
                data-testid="game-controls"
                controls={generatedControls}
                disabled={!isPlaying || isPaused}
                scale={controlsScale}
                onReorder={handleControlsReorder}
                // Response buttons should have a pronounced haptic so the user can keep eyes on the focus cross.
                onHaptic={() => haptic.impact('heavy')}
                width={layout.gridSize}
              />
            )}

            {!message && controlShortcutHint && (
              <p className="text-center text-xs text-muted-foreground/60 hidden lg:block">
                {controlShortcutHint}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ========== PER-BUTTON ABSOLUTE RENDERING ========== */}
      {/* When gameButtonLayouts is set, each button rendered at its absolute position */}
      {gameButtonLayouts &&
        !message &&
        generatedControls.map((ctrl) => {
          const btnRect = gameButtonLayouts[ctrl.id];
          if (!btnRect) return null;
          return (
            <div
              key={ctrl.id}
              style={{
                position: 'absolute',
                left: btnRect.x,
                top: btnRect.y,
                width: btnRect.w,
                height: btnRect.h,
                zIndex: 5,
              }}
            >
              <GameControls
                controls={[ctrl]}
                disabled={!isPlaying || isPaused}
                scale={controlsScale}
                onHaptic={() => haptic.impact('heavy')}
              />
            </div>
          );
        })}

      {/* Quit Confirmation Modal */}
      <GameQuitModal
        open={showQuitModal}
        labels={{
          title: t('game.quitModal.title'),
          message: t('game.quitModal.message'),
          cancel: t('common.cancel'),
          confirm: t('game.quitModal.confirm'),
          close: t('common.close'),
        }}
        onCancel={handleQuitCancel}
        onConfirm={handleQuitConfirm}
      />

      {/* Settings Overlay */}
      {showSettingsOverlay && (
        <GameSettingsOverlay
          buttonSoundsEnabled={buttonSoundsEnabled}
          feedbackSoundsEnabled={soundEnabled}
          hapticEnabled={hapticEnabled}
          countdownMode={gameCountdownMode}
          showProgressBar={gameShowProgressBar}
          showNLevel={gameShowNLevel}
          isDarkMode={isDark}
          themeToggleAriaLabel={
            isDark
              ? t('settings.visual.lightMode', 'Light mode')
              : t('settings.visual.darkMode', 'Dark mode')
          }
          // Guided mode and mirror mode are alpha-gated on /nback
          guidedMode={alphaEnabled ? effectiveGuidedMode : undefined}
          mirrorMode={alphaEnabled ? mirrorMode : undefined}
          gridScale={gridScale}
          controlsScale={controlsScale}
          stimulusStyle={stimulusStyle}
          stimulusColor={stimulusColor}
          hasCustomStimulusImage={Boolean(customImageUrl)}
          positionAudioButtonsInverted={positionAudioButtonsInverted}
          gridStyle={tempoGridStyle}
          onButtonSoundsEnabledChange={setButtonSoundsEnabled}
          onFeedbackSoundsEnabledChange={setSoundEnabled}
          onHapticEnabledChange={setHapticEnabled}
          onCountdownModeChange={setGameCountdownMode}
          onShowProgressBarChange={setGameShowProgressBar}
          onShowNLevelChange={setGameShowNLevel}
          onThemeToggle={() => setDarkMode(!isDark)}
          onGuidedModeChange={alphaEnabled ? setGuidedMode : undefined}
          onMirrorModeChange={alphaEnabled ? setMirrorMode : undefined}
          onStimulusStyleChange={setStimulusStyle}
          onStimulusColorChange={setStimulusColor}
          onGridScaleChange={setGridScale}
          onControlsScaleChange={setControlsScale}
          onPositionAudioButtonsInvertedChange={
            positionAudioButtonsInverted !== undefined
              ? handlePositionAudioButtonsInvertedChange
              : undefined
          }
          onGridStyleChange={setTempoGridStyle}
          onHaptic={triggerHaptic}
          onEditLayout={
            betaEnabled
              ? () => {
                  setShowSettingsOverlay(false);
                  setLayoutEditMode(true);
                }
              : undefined
          }
          onBugReport={() => {
            setShowSettingsOverlay(false);
            setIsBugReportOpen(true);
          }}
          onClose={() => setShowSettingsOverlay(false)}
        />
      )}

      <BugReportModal open={isBugReportOpen} onOpenChange={setIsBugReportOpen} />

      {/* Dev Panel + Bot - loaded only when admin enabled (avoids loading dev module in background) */}
      {adminEnabled && (
        <Suspense fallback={null}>
          <AdminGameToolsLazy
            phase={phase}
            trial={trial}
            trialIndex={trialIndex}
            totalTrials={totalTrials}
            nLevel={nLevel}
            dispatch={dispatch as (e: unknown) => void}
            activeModalities={effectiveModalities}
            selfPaced={selfPaced}
            devPanelOpen={devPanelOpen}
            setDevPanelOpen={setDevPanelOpen}
            initialBotConfig={initialBotConfig}
          />
        </Suspense>
      )}
    </div>
  );
}
