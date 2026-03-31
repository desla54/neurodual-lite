/**
 * ActiveTrainingPage - Entraînement actif (Recall)
 *
 * Utilise la machine XState `memoSessionMachine` via le hook `useMemoSessionMachine`.
 * L'UI est pure présentation - toute la logique métier est dans la machine XState.
 */

import type {
  Sound,
  AlgorithmId,
  CreateRecoverySnapshotParams,
  MemoSessionConfig,
  SessionEndReportModel,
} from '@neurodual/logic';
import {
  browserClock,
  cryptoRandom,
  GameConfig,
  gameModeRegistry,
  getBlockConfigFromSpec,
  SOUNDS,
  generateId,
  getStageDefinition,
  generateContextualMessageData,
  createDefaultMemoPlugins,
  SequenceTrialGenerator,
  createDualMemoAlgorithm,
  createAdaptiveControllerAlgorithm,
  createMetaLearningAlgorithm,
  SDT_DPRIME_PASS,
  TIMING_ISI_PAUSE_SECONDS,
  type ModeSpec,
  type ModalityId as LogicModalityId,
  type MemoSessionMachineInput,
  type MemoSpec,
} from '@neurodual/logic';
import { useAppPorts } from '../providers';
import {
  Button,
  CanvasWeave,
  Card,
  getTrialBorderColorForNLevel,
  Grid,
  type SessionCompletionResultWithLevel,
  Spinner,
  UnifiedSessionReport,
  useJourneyConfigSafe,
  useJourneyStateWithContext,
  useMemoSessionMachine,
  useSessionCompletion,
  useEffectiveUserId,
} from '@neurodual/ui';
import { GameSettingsOverlay } from '../components/game';
import { GearSixIcon, HouseIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useSearchParams, useNavigationType } from 'react-router';
import { useCloudSyncActions } from '../components/cloud-sync-provider';
import { useAdapters, useCommandBus, useIsReady, usePersistence } from '../providers';
import { useSettingsStore } from '../stores/settings-store';
import { useShallow } from 'zustand/react/shallow';
import { useViewportScale } from '../hooks/use-viewport-scale';
import { useHapticTrigger } from '../hooks/use-haptic';
import { useStatsSharing } from '../hooks/use-stats-sharing';
import { useBetaScoringEnabled } from '../hooks/use-beta-features';
import { useJourneyActivation } from '../hooks/use-journey-activation';
import { useJourneyStageRedirect } from '../hooks/use-journey-stage-redirect';
import { useEnterCommitHotkey } from '../hooks/use-enter-commit-hotkey';
import { usePendingAutoStart } from '../hooks/use-pending-auto-start';
import { useRecallLocalPicksSync } from '../hooks/use-recall-local-picks-sync';
import { useSessionRecoveryLoader } from '../hooks/use-session-recovery-loader';
import { useSessionRecoverySnapshot } from '../hooks/use-session-recovery-snapshot';
import { useSessionWakeLock } from '../hooks/use-session-wake-lock';
import { useStartedSession } from '../hooks/use-session-state';
import { useStableReportReset } from '../hooks/use-stable-report-reset';
import { useUnifiedReportLabels } from '../hooks/use-unified-report-labels';
import { finalizeSession, useFinishedSession } from '../hooks/use-session-finalizer';
import { translateContextualMessage } from '../utils/contextual-message';
import { logger } from '../lib';
import { getJourneyAnalyticsProps, buildReportActionPayload } from '../lib/analytics-journey-props';
import { getStatsPresetForReport } from '../lib/stats-preset';
import { useAnalytics } from '../hooks/use-analytics';
import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';

// =============================================================================
// TYPES
// =============================================================================

const isAlgorithmId = (value?: string): value is AlgorithmId =>
  value === 'adaptive' || value === 'meta-learning' || value === 'jitter-adaptive';

type ModalityId = 'position' | 'audio';

interface PositionItem {
  position: number;
}

interface AudioItem {
  letter: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7];

// =============================================================================
// COMPONENTS
// =============================================================================

function MiniGrid({ position }: { position: number }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm p-1.5 lg:p-2 border border-woven-border/30">
      <div className="grid grid-cols-3 gap-[1px] w-8 h-8 [@media(max-height:700px)]:w-7 [@media(max-height:700px)]:h-7 lg:w-10 lg:h-10">
        {GRID_MAP.map((logicPos, idx) => {
          if (logicPos === null) {
            return (
              <div
                key="center"
                className="relative flex items-center justify-center bg-transparent"
              >
                <div className="absolute w-1/2 h-[1px] bg-woven-border" />
                <div className="absolute h-1/2 w-[1px] bg-woven-border" />
              </div>
            );
          }
          const isActive = logicPos === position;
          return (
            <div
              key={idx}
              className={`rounded-sm ${isActive ? 'bg-visual' : 'bg-woven-cell-rest'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniLetter({ letter }: { letter: string }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm border border-woven-border/30 w-10 h-10 [@media(max-height:700px)]:w-9 [@media(max-height:700px)]:h-9 lg:w-12 lg:h-12 flex items-center justify-center">
      <span className="font-bold text-audio text-lg lg:text-xl">{letter}</span>
    </div>
  );
}

function PositionTimelineSlot({
  item,
  label,
  highlight,
  feedback,
  disabled,
  onClick,
  borderColorClass,
  correctionCount,
}: {
  item: PositionItem | null;
  label: string;
  highlight?: boolean;
  feedback?: 'correct' | 'wrong' | null;
  disabled?: boolean;
  onClick?: () => void;
  /** Optional border color class for trial color coding (e.g., 'border-red-500') */
  borderColorClass?: string;
  /** Number of corrections made on this cell (max 3) */
  correctionCount?: number;
}) {
  // Convert border-xxx-500 to bg-xxx-500 for the color indicator
  const indicatorBgClass = borderColorClass?.replace('border-', 'bg-');
  const maxCorrectionsReached = correctionCount !== undefined && correctionCount >= 3;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center disabled:opacity-60"
    >
      <div className="text-3xs lg:text-xs font-bold text-visual uppercase mb-1">{label}</div>
      <div
        className={`relative w-12 h-12 [@media(max-height:700px)]:w-11 [@media(max-height:700px)]:h-11 lg:w-16 lg:h-16 rounded-xl overflow-visible flex items-center justify-center ${
          item
            ? 'bg-woven-cell-rest border-2 border-woven-border shadow-sm'
            : 'bg-woven-surface border-2 border-dashed border-woven-border/50'
        } ${
          highlight ? 'shadow-md ring-2 ring-visual/70 ring-offset-2 ring-offset-background' : ''
        } ${
          feedback === 'correct'
            ? 'ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-background border-emerald-400 bg-emerald-50'
            : feedback === 'wrong'
              ? 'ring-2 ring-red-500/70 ring-offset-2 ring-offset-background border-red-400 bg-red-50'
              : ''
        }`}
      >
        {item && <MiniGrid position={item.position} />}
        {/* Badge when max corrections reached */}
        {maxCorrectionsReached && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xxs font-bold px-1 py-0.5 rounded shadow-sm">
            3/3
          </div>
        )}
      </div>
      {/* Color indicator bar under the slot */}
      {indicatorBgClass && <div className={`w-8 h-1 rounded-full mt-1.5 ${indicatorBgClass}`} />}
    </button>
  );
}

function AudioTimelineSlot({
  item,
  label,
  highlight,
  feedback,
  disabled,
  onClick,
  borderColorClass,
  correctionCount,
}: {
  item: AudioItem | null;
  label: string;
  highlight?: boolean;
  feedback?: 'correct' | 'wrong' | null;
  disabled?: boolean;
  onClick?: () => void;
  /** Optional border color class for trial color coding (e.g., 'border-red-500') */
  borderColorClass?: string;
  /** Number of corrections made on this cell (max 3) */
  correctionCount?: number;
}) {
  // Determine border class: feedback > default
  const getBorderClass = () => {
    if (feedback === 'correct') return 'border-emerald-400';
    if (feedback === 'wrong') return 'border-red-400';
    if (item) return 'border-woven-border';
    return 'border-woven-border/50';
  };

  // Convert border-xxx-500 to bg-xxx-500 for the color indicator
  const indicatorBgClass = borderColorClass?.replace('border-', 'bg-');
  const maxCorrectionsReached = correctionCount !== undefined && correctionCount >= 3;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center disabled:opacity-60"
    >
      <div className="text-3xs lg:text-xs font-bold text-audio uppercase mb-1">{label}</div>
      <div
        className={`relative w-12 h-12 [@media(max-height:700px)]:w-11 [@media(max-height:700px)]:h-11 lg:w-16 lg:h-16 rounded-xl overflow-visible flex items-center justify-center border-2 ${
          item ? 'bg-woven-cell-rest shadow-sm' : 'bg-woven-surface border-dashed'
        } ${getBorderClass()} ${
          highlight ? 'shadow-md ring-2 ring-audio/70 ring-offset-2 ring-offset-background' : ''
        } ${
          feedback === 'correct'
            ? 'ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-background bg-emerald-50'
            : feedback === 'wrong'
              ? 'ring-2 ring-red-500/70 ring-offset-2 ring-offset-background bg-red-50'
              : ''
        }`}
      >
        {item && <MiniLetter letter={item.letter} />}
        {/* Badge when max corrections reached */}
        {maxCorrectionsReached && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xxs font-bold px-1 py-0.5 rounded shadow-sm">
            3/3
          </div>
        )}
      </div>
      {/* Color indicator bar under the slot */}
      {indicatorBgClass && <div className={`w-8 h-1 rounded-full mt-1.5 ${indicatorBgClass}`} />}
    </button>
  );
}

function PositionPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected?: number;
  onSelect: (pos: number, inputMethod?: 'mouse' | 'touch') => void;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const handleSelect = (logicPos: number, e: React.PointerEvent) => {
    const inputMethod = e.pointerType === 'touch' ? 'touch' : 'mouse';
    onSelect(logicPos, inputMethod);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl p-4 w-[280px]">
        <div className="text-sm font-semibold mb-3">
          {t('memo.positionPicker.title', 'Choose the cell')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, gridIdx) => {
            if (gridIdx === 4) return <div key="center" />;
            const logicPos = gridIdx > 4 ? gridIdx - 1 : gridIdx;
            const isSelected = selected === logicPos;
            return (
              <button
                key={gridIdx}
                type="button"
                onPointerDown={(e) => handleSelect(logicPos, e)}
                className={`aspect-square rounded-xl border-2 ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-secondary'
                }`}
              />
            );
          })}
        </div>
        <Button onClick={onClose} variant="ghost" className="w-full mt-3">
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
}

function AudioPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected?: Sound;
  onSelect: (sound: Sound, inputMethod?: 'mouse' | 'touch') => void;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const handleSelect = (sound: Sound, e: React.PointerEvent) => {
    const inputMethod = e.pointerType === 'touch' ? 'touch' : 'mouse';
    onSelect(sound, inputMethod);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl p-4 w-[280px]">
        <div className="text-sm font-semibold mb-3">
          {t('memo.audioPicker.title', 'Choose the letter')}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SOUNDS.map((sound) => {
            const isSelected = selected === sound;
            return (
              <button
                key={sound}
                type="button"
                onPointerDown={(e) => handleSelect(sound, e)}
                className={`py-2 rounded-lg border-2 text-sm font-bold ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-secondary'
                }`}
              >
                {sound}
              </button>
            );
          })}
        </div>
        <Button onClick={onClose} variant="ghost" className="w-full mt-3">
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convertit dist (0 = N, 1 = N-1) vers slotIndex (1 = N, 2 = N-1)
 */
function distToSlotIndex(dist: number): number {
  return dist + 1;
}

// =============================================================================
// MAIN
// =============================================================================

export function DualMemoTrainingPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { scale, shouldScale } = useViewportScale();
  const triggerHaptic = useHapticTrigger();
  const { algorithmState: algorithmStateAdapter } = useAdapters();
  const persistence = usePersistence();
  const commandBus = useCommandBus();
  const isSystemReady = useIsReady();
  const { audio, wakeLock, platformInfo, sessionRecovery, diagnostics } = useAppPorts();
  // Always use Supabase user ID if authenticated, otherwise use local odalisqueId.
  // This ensures sessions are associated with the authenticated user's identity
  // and can be found when querying by user_id (regardless of cloud sync status).
  const userId = useEffectiveUserId();
  const { syncEventsAndProgression } = useCloudSyncActions();
  const { shareStats } = useStatsSharing();
  const betaEnabled = useBetaScoringEnabled();
  const statsSharedRef = useRef<string | null>(null);
  const stableReportRef = useRef<{ sessionId: string; report: SessionEndReportModel } | null>(null);
  const unifiedReportLabels = useUnifiedReportLabels();
  const { track } = useAnalytics();
  const sessionCompletionAnalyticsRef = useRef<{
    nLevel: number;
    modalities: readonly ModalityId[];
    playContext: 'journey' | 'free';
  }>({
    nLevel: 0,
    modalities: [],
    playContext: 'free',
  });

  const handleSessionCompletion = useCallback(
    (completion: SessionCompletionResultWithLevel) => {
      sessionRecovery.clearRecoverySnapshot();
      const analytics = sessionCompletionAnalyticsRef.current;
      track('session_completed', {
        session_id: completion.report.sessionId,
        mode: 'dual-memo',
        n_level: analytics.nLevel,
        modalities: analytics.modalities,
        duration_ms: completion.report.durationMs,
        ups: completion.ups?.score ?? 0,
        passed: completion.passed,
        next_level: completion.nextLevel,
        level_change: completion.nextLevel - analytics.nLevel,
        xp_earned: completion.xpBreakdown?.total ?? 0,
        badges_earned: completion.newBadges?.length ?? 0,
        leveled_up: completion.leveledUp,
        play_context: analytics.playContext,
        ...getJourneyAnalyticsProps(completion.report),
      });
    },
    [sessionRecovery, track],
  );

  const canStart = isSystemReady && commandBus != null;

  // ==========================================================================
  // Session Recovery
  // ==========================================================================

  const { recoveredState } = useSessionRecoveryLoader({
    searchParams,
    setSearchParams,
    sessionRecovery,
    persistence,
  });

  // Session completion hook (scoring, XP, progression, report)
  const { complete, result: completionResult } = useSessionCompletion({
    syncToCloud: syncEventsAndProgression,
    onComplete: handleSessionCompletion,
  });

  // SPEC-FIRST: Read journey context from location.state
  const journeyContext = location.state as
    | {
        journeyStageId?: number;
        journeyId?: string;
        journeyTargetLevel?: number;
        journeyStartLevel?: number;
      }
    | undefined;
  const journeyConfigForGame = useJourneyConfigSafe();
  const activeJourneyIdFromStore = useSettingsStore((s) => s.ui.activeJourneyId);
  const activateJourney = useSettingsStore((s) => s.activateJourney);
  const setStatsTab = useSettingsStore((s) => s.setStatsTab);
  const setStatsMode = useSettingsStore((s) => s.setStatsMode);
  const setStatsJourneyFilter = useSettingsStore((s) => s.setStatsJourneyFilter);
  const journeyStageId = journeyContext?.journeyStageId;
  const journeyId = journeyContext?.journeyId ?? journeyConfigForGame?.journeyId;
  const playMode: 'journey' | 'free' = typeof journeyStageId === 'number' ? 'journey' : 'free';
  if (playMode === 'journey' && typeof journeyId !== 'string') {
    throw new Error('[DualMemoTrainingPage] journeyId is required when playMode="journey"');
  }

  // Mode settings for dual-memo (this page is specifically for dual-memo)
  const modeSettings = useSettingsStore((s) => s.modes['dual-memo']);
  const buttonSoundsEnabled = useSettingsStore((s) => s.ui.buttonSoundsEnabled);
  const setButtonSoundsEnabled = useSettingsStore((s) => s.setButtonSoundsEnabled);
  const soundEnabled = useSettingsStore((s) => s.ui.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);

  // Get active journey for simulator mode detection
  const activeJourneyId = journeyId ?? journeyConfigForGame?.journeyId ?? activeJourneyIdFromStore;
  const activeJourney = useSettingsStore(
    useShallow(
      (
        s,
      ):
        | {
            name: string;
            nameKey?: string;
            gameMode?: string;
            startLevel: number;
            targetLevel: number;
          }
        | undefined => {
        const journey = s.savedJourneys.find((j) => j.id === activeJourneyId);
        return journey
          ? {
              name: journey.name,
              nameKey: journey.nameKey,
              gameMode: journey.gameMode,
              startLevel: journey.startLevel,
              targetLevel: journey.targetLevel,
            }
          : undefined;
      },
    ),
  );

  useJourneyActivation({
    journeyId,
    activeJourneyId: activeJourneyIdFromStore,
    activateJourney,
  });
  const journeyTargetLevel =
    journeyContext?.journeyTargetLevel ??
    activeJourney?.targetLevel ??
    journeyConfigForGame?.targetLevel ??
    5;
  const journeyStartLevel =
    journeyContext?.journeyStartLevel ??
    activeJourney?.startLevel ??
    journeyConfigForGame?.startLevel ??
    1;
  const isSimulatorJourney = !!(activeJourney?.gameMode ?? journeyConfigForGame?.gameMode);

  // Extract nLevel from journey stage if in journey context
  let journeyNLevel: number | undefined;
  if (journeyStageId) {
    const stageDef = getStageDefinition(
      journeyStageId,
      journeyTargetLevel,
      journeyStartLevel,
      isSimulatorJourney,
    );
    journeyNLevel = stageDef?.nLevel;
  }
  const resolvedMode = useMemo(() => {
    const effectiveSettings = journeyNLevel
      ? { ...modeSettings, nLevel: journeyNLevel }
      : (modeSettings ?? {});
    return gameModeRegistry.resolveWithSettings('dual-memo', effectiveSettings);
  }, [modeSettings, journeyNLevel]);

  const config = useMemo(
    () => new GameConfig(getBlockConfigFromSpec(resolvedMode.spec)),
    [resolvedMode.spec],
  );
  const algorithmId = isAlgorithmId(resolvedMode.algorithmName)
    ? resolvedMode.algorithmName
    : undefined;

  // Session seed (used for restarting with fresh trials)
  const [runSeed, setRunSeed] = useState(() => generateId());
  const [isPaused, setIsPaused] = useState(false);
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const desiredTotalTrials = config.trialsCount;

  const nLevel = config.nLevel;
  const activeModalities = config.activeModalities as ModalityId[];
  sessionCompletionAnalyticsRef.current = {
    nLevel,
    modalities: activeModalities,
    playContext: playMode === 'journey' ? 'journey' : 'free',
  };

  // Get journey state to determine initialLureProbability
  // After a good first session (95%+), inject more lures to prevent artificial level progression
  const { state: journeyState } = useJourneyStateWithContext();

  const initialLureProbability = useMemo(() => {
    if (!journeyStageId) return 0.15; // Default for non-journey mode

    const stageProgress = journeyState.stages.find((s) => s.stageId === journeyStageId);
    const bestScore = stageProgress?.bestScore ?? null;

    // If user already passed with 95%+, make the next session harder
    if (bestScore !== null && bestScore >= 95) {
      logger.debug('[Journey] High bestScore, increasing difficulty', {
        stageId: journeyStageId,
        bestScore,
        initialLureProbability: 0.3,
      });
      return 0.3; // Harder: more lures
    }

    return 0.15; // Default
  }, [journeyStageId, journeyState.stages]);

  // Create RecallSession config
  // SPEC-FIRST: Derive all config from resolved spec extensions
  const isJourneyMode = journeyStageId !== undefined;

  // Recall extensions - resolveWithSettings() garantit que les valeurs existent
  const recallSpec = resolvedMode.spec as ModeSpec & {
    extensions: {
      feedbackMode: 'none' | 'on-commit';
      feedbackDurationMs: number;
      fillOrderMode: 'sequential' | 'random';
      trialColorCoding: boolean;
      progressiveWindow: {
        enabled: boolean;
        initialDepth: number;
        expansionThreshold: number;
        contractionThreshold: number;
        observationWindows: number;
        cooldownWindows: number;
      };
      disableWindowAdaptation: boolean;
      initialLureProbability: number;
    };
  };
  // Pas de fallbacks - les specs définissent les valeurs
  const fillOrderMode = recallSpec.extensions.fillOrderMode;
  const trialColorCoding = recallSpec.extensions.trialColorCoding;

  const sessionConfig = useMemo<MemoSessionConfig>(
    () => ({
      nLevel,
      activeModalities,
      trialsCount: desiredTotalTrials,
      stimulusDurationSeconds: config.stimulusDurationSeconds,
      targetProbability: config.targetProbability,
      lureProbability: config.lureProbability,
      // From spec extensions (merged with user settings) - pas de fallbacks
      feedbackMode: recallSpec.extensions.feedbackMode,
      feedbackDurationMs: recallSpec.extensions.feedbackDurationMs,
      scoringVersion: '1.0.0', // Internal version, not in spec
      fillOrderMode,
      // Journey overrides have priority over spec
      disableWindowAdaptation: isJourneyMode ? true : recallSpec.extensions.disableWindowAdaptation,
      initialLureProbability: isJourneyMode
        ? initialLureProbability
        : recallSpec.extensions.initialLureProbability,
      progressiveWindow: recallSpec.extensions.progressiveWindow,
    }),
    [
      nLevel,
      activeModalities,
      desiredTotalTrials,
      config.stimulusDurationSeconds,
      fillOrderMode,
      isJourneyMode,
      initialLureProbability,
      recallSpec.extensions,
    ],
  );

  // Machine input - recreated when config or seed changes
  // runSeed change → new machine instance (restart flow, trials generated on-demand)
  const machineInput = useMemo<MemoSessionMachineInput>(() => {
    diagnostics.setWatchdogContext('ActiveTrainingPage.createMachineInput');
    // runSeed is used to trigger recreation (not passed directly)
    void runSeed;

    const recallSpec = resolvedMode.spec as MemoSpec;

    // Create BlockConfig from spec (same logic as old RecallSession)
    const blockConfig = {
      nLevel: recallSpec.defaults.nLevel,
      generator: 'Sequence' as const,
      activeModalities: [...recallSpec.defaults.activeModalities],
      trialsCount: recallSpec.defaults.trialsCount,
      targetProbability: recallSpec.generation.targetProbability,
      lureProbability:
        recallSpec.extensions.initialLureProbability ?? recallSpec.generation.lureProbability,
      intervalSeconds: recallSpec.timing.stimulusDurationMs / 1000 + TIMING_ISI_PAUSE_SECONDS,
      stimulusDurationSeconds: recallSpec.timing.stimulusDurationMs / 1000,
    };

    // Create algorithm based on algorithmId
    const algorithmConfig = {
      initialNLevel: recallSpec.defaults.nLevel,
      initialTargetProbability: recallSpec.generation.targetProbability,
      initialStimulusDurationMs: recallSpec.timing.stimulusDurationMs,
      targetDPrime: SDT_DPRIME_PASS,
      mode: 'memo' as const,
    };
    const algorithm =
      algorithmId === 'meta-learning'
        ? createMetaLearningAlgorithm(algorithmConfig)
        : algorithmId === 'adaptive'
          ? createAdaptiveControllerAlgorithm(algorithmConfig)
          : createDualMemoAlgorithm(algorithmConfig);

    // Create generator
    const generator = new SequenceTrialGenerator({
      blockConfig,
      algorithm,
      totalTrials: recallSpec.defaults.trialsCount,
      gameMode: 'memo',
    });

    // Create plugins
    const plugins = createDefaultMemoPlugins({
      spec: recallSpec,
      platformInfo,
    });

    // Generate session ID (use recovered sessionId if available)
    const sessionId = recoveredState?.sessionId ?? generateId();

    diagnostics.clearWatchdogContext();
    return {
      sessionId,
      userId,
      spec: recallSpec,
      audio,
      clock: browserClock,
      random: cryptoRandom,
      generator,
      playMode,
      journeyStageId: playMode === 'journey' ? journeyStageId : undefined,
      journeyId: playMode === 'journey' ? journeyId : undefined,
      journeyStartLevel: playMode === 'journey' ? journeyStartLevel : undefined,
      journeyTargetLevel: playMode === 'journey' ? journeyTargetLevel : undefined,
      journeyGameMode:
        playMode === 'journey'
          ? (activeJourney?.gameMode ?? journeyConfigForGame?.gameMode)
          : undefined,
      journeyName: playMode === 'journey' ? (activeJourney?.name ?? 'Parcours') : undefined,
      algorithmStatePort: algorithmStateAdapter,
      plugins,
      commandBus: commandBus ?? undefined,
    };
  }, [
    runSeed,
    playMode,
    journeyStageId,
    journeyId,
    journeyStartLevel,
    journeyTargetLevel,
    activeJourney?.gameMode,
    activeJourney?.name,
    journeyConfigForGame?.gameMode,
    algorithmId,
    userId,
    resolvedMode.spec,
    commandBus,
    recoveredState?.sessionId,
    diagnostics,
    platformInfo,
    audio,
  ]);

  // Subscribe to session updates via XState hook
  const { snapshot, send, actorRef } = useMemoSessionMachine(machineInput);

  // Local UI state
  const [activePick, setActivePick] = useState<{ dist: number; modality: ModalityId } | null>(null);
  const [localPicks, setLocalPicks] = useState<
    Record<number, { position?: number; audio?: Sound }>
  >({});

  useRecallLocalPicksSync({
    recallPrompt: snapshot.recallPrompt,
    phase: snapshot.phase,
    trialIndex: snapshot.trialIndex,
    nLevel: snapshot.nLevel,
    activeModalities,
    setLocalPicks,
  });

  const phase = snapshot.phase;
  const trialIndex = snapshot.trialIndex;
  const safeTotalTrials = Math.max(0, snapshot.totalTrials);
  const clampedTrialIndex =
    safeTotalTrials > 0 ? Math.min(Math.max(trialIndex, 0), safeTotalTrials - 1) : 0;
  const displayedTrial = safeTotalTrials > 0 ? clampedTrialIndex + 1 : 0;

  useSessionWakeLock({
    phase,
    wakeLock,
  });
  useStartedSession({
    phase,
    sessionId: snapshot.summary?.sessionId ?? machineInput.sessionId,
    onStarted: (sessionId) => {
      track('session_started', {
        session_id: sessionId,
        mode: 'dual-memo',
        n_level: sessionConfig.nLevel,
        modalities: activeModalities,
        play_context: playMode === 'journey' ? 'journey' : 'free',
        journey_id: journeyId ?? undefined,
      });
    },
  });

  useStableReportReset({
    phase,
    onReset: () => {
      stableReportRef.current = null;
    },
  });

  // Window logic - use session's required depth for progressive window
  const sessionRequiredDepth = snapshot.recallPrompt?.requiredWindowDepth ?? 1;
  const requiredDists = Array.from({ length: sessionRequiredDepth }, (_, i) => i);
  const allDistsToShow = Array.from({ length: nLevel + 1 }, (_, i) => i);
  const pastDists = allDistsToShow.filter((d) => d >= 1).sort((a, b) => b - a);

  // Debug: calculate UI's version of isWindowComplete to detect divergence with session
  // The actual button uses canCommit from session (snapshot.recallPrompt.isComplete)
  const _isWindowCompleteDebug = useMemo(() => {
    const missingSlots: { dist: number; reason: string }[] = [];
    const result = requiredDists.every((dist) => {
      const pick = localPicks[dist];
      if (!pick) {
        missingSlots.push({ dist, reason: 'no pick object' });
        return false;
      }
      if (activeModalities.includes('position') && pick.position === undefined) {
        missingSlots.push({ dist, reason: 'position undefined' });
        return false;
      }
      if (activeModalities.includes('audio') && pick.audio === undefined) {
        missingSlots.push({ dist, reason: 'audio undefined' });
        return false;
      }
      return true;
    });
    // DEBUG: Log window completion status
    if (phase === 'recall') {
      const sessionIsComplete = snapshot.recallPrompt?.isComplete ?? false;
      logger.debug('[DEBUG isWindowComplete]', {
        phase,
        trialIndex,
        nLevel,
        sessionRequiredDepth,
        requiredDists,
        localPicksKeys: Object.keys(localPicks),
        localPicks,
        activeModalities,
        missingSlots,
        uiIsComplete: result,
        sessionIsComplete,
        DIVERGENCE: result !== sessionIsComplete ? '⚠️ MISMATCH!' : 'OK',
      });
    }
    return result;
  }, [
    requiredDists,
    activeModalities,
    localPicks,
    phase,
    trialIndex,
    sessionRequiredDepth,
    nLevel,
    snapshot.recallPrompt,
  ]);
  // Suppress unused variable warning - this is intentional debug code
  void _isWindowCompleteDebug;

  const [pendingAutoStart, setPendingAutoStart] = useState(false);
  usePendingAutoStart({
    pendingAutoStart: pendingAutoStart && canStart,
    phase,
    dispatch: send,
    startEvent: { type: 'START' },
    setPendingAutoStart,
  });

  // Start handler - initializes audio then starts session
  const handleStart = useCallback(async () => {
    if (!canStart) return;
    // Init audio on user gesture (required by browsers)
    await audio.init();
    send({ type: 'START' });
  }, [send, audio, canStart]);

  // Restart handler - creates new seed triggering new trials → new session
  const restart = useCallback(() => {
    const newSeed = generateId();
    setRunSeed(newSeed);
    setPendingAutoStart(true);
    setLocalPicks({});
    setActivePick(null);
    stableReportRef.current = null;
  }, []);

  // Handle pick
  const handlePick = useCallback(
    (
      dist: number,
      modality: ModalityId,
      value: number | Sound,
      inputMethod?: 'mouse' | 'touch',
    ) => {
      const slotIndex = distToSlotIndex(dist);
      // Create pick object based on modality type (discriminated union)
      const pick =
        modality === 'position'
          ? { modality: 'position' as const, value: value as number }
          : { modality: 'audio' as const, value: value as Sound };
      send({
        type: 'PICK',
        slotIndex,
        pick,
        inputMethod,
      });

      // Update local state immediately for responsive UI
      setLocalPicks((prev) => ({
        ...prev,
        [dist]: {
          ...prev[dist],
          [modality]: value,
        },
      }));
      setActivePick(null);
    },
    [send],
  );

  // Use session's isComplete as the authoritative source for button state
  // This avoids divergence between UI's localPicks and session's currentPicks
  const canCommit = snapshot.recallPrompt?.isComplete ?? false;

  // Handle commit
  const handleCommit = useCallback(() => {
    if (!canCommit) return;
    send({ type: 'COMMIT' });
  }, [send, canCommit]);

  useEnterCommitHotkey({
    phase,
    activePhase: 'recall',
    onCommit: handleCommit,
  });

  // Immediate feedback computation (UI-only)
  // Uses generated trials from machine context (trial-by-trial generation)
  const feedbackFor = (dist: number, modality: ModalityId): 'correct' | 'wrong' | null => {
    if (phase !== 'recall') return null;
    if (!requiredDists.includes(dist)) return null;

    const generatedTrials = actorRef.getSnapshot().context.trials;
    const targetTrialIdx = trialIndex - dist;
    if (targetTrialIdx < 0 || targetTrialIdx >= generatedTrials.length) return null;

    const trial = generatedTrials[targetTrialIdx];
    const pick = localPicks[dist];
    if (!trial || !pick) return null;

    if (modality === 'position') {
      if (pick.position === undefined) return null;
      return pick.position === trial.position ? 'correct' : 'wrong';
    }

    if (pick.audio === undefined) return null;
    return pick.audio === trial.sound ? 'correct' : 'wrong';
  };

  const posItemAt = (dist: number): PositionItem | null => {
    const pick = localPicks[dist];
    return pick?.position === undefined ? null : { position: pick.position };
  };

  const audioItemAt = (dist: number): AudioItem | null => {
    const pick = localPicks[dist];
    return pick?.audio === undefined ? null : { letter: pick.audio };
  };

  // Get correction count for a cell (dist, modality)
  const getCorrectionCount = (dist: number, modality: ModalityId): number => {
    const slotIndex = dist + 1; // Convert dist to slotIndex
    const key = `${slotIndex}:${modality}`;
    return snapshot.recallPrompt?.correctionCounts.get(key) ?? 0;
  };

  const canPickDist = (dist: number, modality: ModalityId) => {
    if (phase !== 'recall') return false;
    if (dist > trialIndex) return false;

    // Check if cell is already filled (correction allowed if under limit)
    const pick = localPicks[dist];
    const isFilled =
      modality === 'position' ? pick?.position !== undefined : pick?.audio !== undefined;
    if (isFilled) {
      // Check correction limit (max 3 per cell)
      return getCorrectionCount(dist, modality) < 3;
    }

    // Utiliser la cellule active du snapshot (ordre de remplissage cellule par cellule)
    const activeCell = snapshot.recallPrompt?.activeCell;
    if (!activeCell) {
      // Toutes les cellules sont remplies, on ne peut plus picker
      return false;
    }

    // Convertir slotIndex (1-based) vers dist (0-based)
    // slot 1 = dist 0 (N), slot 2 = dist 1 (N-1), etc.
    // En mode random, on vérifie aussi que la modalité est la bonne
    return activeCell.slot - 1 === dist && activeCell.modality === modality;
  };

  // Vérifie si une cellule spécifique (slot + modalité) est active (pour highlight visuel)
  const isCellActive = (dist: number, modality: ModalityId): boolean => {
    if (phase !== 'recall') return false;
    const activeCell = snapshot.recallPrompt?.activeCell;
    if (!activeCell) return false;
    // En mode random fill order, on vérifie slot ET modalité
    return activeCell.slot - 1 === dist && activeCell.modality === modality;
  };

  // Center item (stimulus display)
  const centerItem =
    phase === 'stimulus' && snapshot.stimulus
      ? { turn: trialIndex, letter: snapshot.stimulus.sound, position: snapshot.stimulus.position }
      : null;

  const sessionRecoveryEnabled = useSettingsStore((s) => s.ui.sessionRecoveryEnabled);
  const recoverySnapshotParams = useMemo<CreateRecoverySnapshotParams>(
    () => ({
      sessionId: machineInput.sessionId,
      modeId: 'active-training',
      config: {
        nLevel: sessionConfig.nLevel,
        activeModalities: [...sessionConfig.activeModalities],
        trialsCount: sessionConfig.trialsCount,
        targetProbability: 0.33,
        lureProbability: 0.1,
        generator: 'Aleatoire',
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
      },
      trialIndex,
      totalTrials: snapshot.totalTrials,
      nLevel: sessionConfig.nLevel,
    }),
    [machineInput.sessionId, sessionConfig, trialIndex, snapshot.totalTrials],
  );
  useSessionRecoverySnapshot({
    enabled: sessionRecoveryEnabled,
    phase,
    activePhases: ['stimulus', 'recall'],
    sessionRecovery,
    params: recoverySnapshotParams,
  });

  // Session Completion: scoring, XP, progression, report storage
  const abandonedCleanupSessionRef = useRef<string | null>(null);
  useFinishedSession({
    phase,
    summary: snapshot.summary,
    actorRef,
    extractSummary: (ctx: unknown) =>
      (ctx as { summary?: typeof snapshot.summary })?.summary ?? null,
    onFinishedSummary: async (summary) => {
      const correctionsCount =
        summary.windowConfidence?.reduce((sum, window) => sum + window.correctionCount, 0) ?? 0;
      const machineContext = actorRef.getSnapshot().context;

      await finalizeSession({
        summary,
        abandonedCleanupSessionRef,
        cleanupAbandonedSession: async (sessionId) => {
          await cleanupAbandonedSession(persistence, sessionId).catch(() => {});
        },
        buildCompletionInput: (finishedSummary) => ({
          mode: 'recall' as const,
          sessionId: finishedSummary.sessionId,
          events: machineContext.sessionEvents,
          trials: machineContext.trials,
          gameModeLabel: t('settings.gameMode.dualMemo'),
          activeModalities: activeModalities as readonly LogicModalityId[],
          confidenceScore: finishedSummary.avgConfidenceScore ?? undefined,
          fluencyScore: finishedSummary.fluencyScore,
          correctionsCount,
        }),
        complete,
      });
    },
  });

  useJourneyStageRedirect({
    shouldRedirect:
      navigationType === 'POP' &&
      Boolean(journeyState?.isActive) &&
      typeof journeyStageId === 'number' &&
      typeof journeyState?.currentStage === 'number' &&
      journeyStageId !== journeyState.currentStage &&
      phase === 'idle',
    navigate,
    path: '/dual-memo',
    journeyStageId: journeyState?.currentStage,
    journeyId: activeJourneyId ?? journeyId,
  });

  // Report (finished state)
  if (phase === 'finished') {
    const summary = snapshot.summary;
    if (!summary) {
      return null; // Should not happen, but type safety
    }

    // Wait for completion result (contains report with scoring, XP, etc.)
    if (!completionResult?.report) {
      return (
        <div className="h-[calc(100dvh-4rem)] flex items-center justify-center px-4">
          <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[500px]">
            <Grid
              activePosition={null}
              showStimulus={false}
              showPlayButton={false}
              className="rounded-2xl opacity-70"
            />
            <div className="absolute inset-0 rounded-2xl bg-background/80" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface/95 px-4 py-2.5 shadow-sm">
                <Spinner size={18} className="text-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {t('common.loading', 'Loading...')}
                </span>
                <span className="text-[11px] text-muted-foreground leading-none">
                  {t('stats.report.loadingReport', 'Loading report...')}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (stableReportRef.current?.sessionId !== summary.sessionId) {
      stableReportRef.current = { sessionId: summary.sessionId, report: completionResult.report };
    }
    const stableReport = stableReportRef.current.report;
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

    // Window results from summary
    const windowResults = summary.windowResults ?? [];

    return (
      <div className="game-report-scroll" data-testid="active-training-report">
        <div className="relative space-y-6 pt-0 pb-8 px-0 md:px-4 md:py-8 max-w-2xl mx-auto">
          <UnifiedSessionReport
            data={stableReport}
            message={contextMessage}
            labels={{
              ...unifiedReportLabels,
              modeScoreLabel: t(stableReport.modeScore.labelKey),
              modeScoreTooltip: stableReport.modeScore.tooltipKey
                ? t(stableReport.modeScore.tooltipKey)
                : undefined,
            }}
            onPlayAgain={() => {
              track('report_action_clicked', buildReportActionPayload(stableReport, 'play_again'));
              restart();
            }}
            onBackToHome={() => {
              track('report_action_clicked', buildReportActionPayload(stableReport, 'home'));
              navigate('/');
            }}
            onGoToStats={(report) => {
              track('report_action_clicked', buildReportActionPayload(report, 'go_to_stats'));
              const preset = getStatsPresetForReport(report);
              setStatsTab(preset.tab);
              setStatsMode(preset.mode);
              setStatsJourneyFilter(preset.journeyFilter);
              navigate('/stats');
            }}
            onReplay={() => navigate(`/replay/${summary.sessionId}`)}
            showFloatingCloseButton
            betaEnabled={betaEnabled}
          />

          <Card className="max-w-md mx-auto" padding="sm">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
              {t('game.cogTask.trialDetail')}
            </div>
            <div className="max-h-[280px] overflow-auto text-sm px-2">
              {windowResults.map((r) => (
                <div key={r.trialIndex} className="flex justify-between py-1">
                  <div>
                    {t('game.cogTask.dualMemo.trial')} {r.trialIndex + 1}
                  </div>
                  <div className="font-mono font-bold">
                    {r.correctCount}/{r.totalCount}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Style pour le scale desktop
  const scaleStyle = shouldScale
    ? {
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
      }
    : undefined;

  return (
    <div
      className="h-[calc(100dvh-4rem)] flex flex-col px-4 overflow-hidden"
      data-testid="active-training"
      style={scaleStyle}
    >
      {/* HEADER */}
      <div className="shrink-0 flex flex-col items-center pt-[clamp(0.25rem,2vh,0.75rem)]">
        <div className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 [@media(max-height:700px)]:p-1 [@media(max-height:700px)]:px-2 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden">
          <CanvasWeave lineCount={8} rounded="full" />
          <div className="relative z-10 h-9 px-2.5 [@media(max-height:700px)]:px-2 bg-woven-cell-rest rounded-full text-[13px] font-bold text-woven-text uppercase leading-none flex items-center justify-center">
            N-{nLevel}
          </div>
          <div className="relative z-10 h-9 px-2.5 [@media(max-height:700px)]:px-2 bg-woven-cell-rest rounded-full font-mono text-[16px] [@media(max-height:700px)]:text-[15px] font-bold tabular-nums tracking-tight text-woven-text leading-none flex items-center">
            {String(displayedTrial).padStart(2, '0')}
            <span className="text-woven-text-muted mx-0.5">/</span>
            {String(safeTotalTrials).padStart(2, '0')}
          </div>
          {snapshot.adaptiveZone !== null && (
            <div className="relative z-10 px-2 py-1 [@media(max-height:700px)]:px-1.5 bg-primary/10 rounded-full text-xs font-bold text-primary">
              Z{snapshot.adaptiveZone}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(10);
              setIsPaused(!isPaused);
            }}
            className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors border border-woven-border ${
              isPaused ? 'bg-woven-cell-rest text-woven-text' : 'bg-woven-surface text-woven-text'
            }`}
            title={isPaused ? t('game.hud.resume', 'Resume') : t('game.hud.pause', 'Pause')}
          >
            {isPaused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(10);
              setShowSettingsOverlay(true);
            }}
            className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors border border-woven-border bg-woven-surface text-woven-text"
            title={t('common.settings')}
          >
            <GearSixIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(10);
              const safeTotalTrials = Math.max(1, snapshot.totalTrials);
              track('session_abandoned', {
                session_id: machineInput.sessionId,
                mode: 'dual-memo',
                n_level: sessionConfig.nLevel,
                trials_completed: trialIndex,
                total_trials: snapshot.totalTrials,
                progress_pct: Math.round((trialIndex / safeTotalTrials) * 100),
                play_context: playMode === 'journey' ? 'journey' : 'free',
                journey_id: journeyId,
                stage_id: journeyStageId,
              });
              send({ type: 'STOP' });
              navigate('/');
            }}
            className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full border border-woven-border bg-woven-surface text-woven-text transition-colors"
            title={t('common.home')}
          >
            <HouseIcon size={16} />
          </button>
        </div>

        {/* TIMELINES - conditionnées aux modalités actives */}
        <div className="w-full flex flex-col items-center gap-[clamp(0.25rem,1.6vh,0.7rem)] mt-[clamp(0.2rem,1.2vh,0.5rem)]">
          {/* Position Timeline */}
          {activeModalities.includes('position') && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end pb-[clamp(0.2rem,1.2vh,0.75rem)] [@media(max-height:700px)]:pb-[clamp(0.15rem,1vh,0.6rem)]">
              <div /> {/* Spacer gauche */}
              <div className="flex items-center justify-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-4">
                {/* Passé */}
                <div className="flex flex-col items-center">
                  <div className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none">
                    {t('game.cogTask.past')}
                  </div>
                  <div className="flex items-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-3 bg-secondary/40 rounded-2xl px-2 py-1 lg:px-3 lg:py-2">
                    {pastDists.map((dist) => {
                      const slotTrialIndex = trialIndex - dist;
                      return (
                        <PositionTimelineSlot
                          key={`pos-${dist}`}
                          item={posItemAt(dist)}
                          label={`N-${dist}`}
                          disabled={!canPickDist(dist, 'position')}
                          onClick={() => setActivePick({ dist, modality: 'position' })}
                          feedback={feedbackFor(dist, 'position')}
                          highlight={isCellActive(dist, 'position')}
                          borderColorClass={
                            trialColorCoding && slotTrialIndex >= 0
                              ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                              : undefined
                          }
                          correctionCount={getCorrectionCount(dist, 'position')}
                        />
                      );
                    })}
                  </div>
                </div>
                {/* Présent */}
                <div className="flex flex-col items-center">
                  <div className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none">
                    {t('game.cogTask.present')}
                  </div>
                  <div className="flex items-center justify-center px-2 py-1 lg:px-3 lg:py-2">
                    <PositionTimelineSlot
                      item={posItemAt(0)}
                      label="N"
                      disabled={!canPickDist(0, 'position')}
                      onClick={() => setActivePick({ dist: 0, modality: 'position' })}
                      feedback={feedbackFor(0, 'position')}
                      highlight={isCellActive(0, 'position')}
                      borderColorClass={
                        trialColorCoding
                          ? getTrialBorderColorForNLevel(trialIndex, nLevel)
                          : undefined
                      }
                      correctionCount={getCorrectionCount(0, 'position')}
                    />
                  </div>
                </div>
              </div>
              {/* Label Position à droite */}
              <div className="flex justify-start items-center pl-2 lg:pl-4 h-12 mb-1 lg:mb-2">
                <span className="text-3xs lg:text-xs font-bold text-visual uppercase tracking-wide">
                  {t('game.cogTask.dualMemo.position')}
                </span>
              </div>
            </div>
          )}

          {/* Audio Timeline */}
          {activeModalities.includes('audio') && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end pb-[clamp(0.2rem,1.2vh,0.5rem)] [@media(max-height:700px)]:pb-[clamp(0.15rem,1vh,0.4rem)] [@media(min-height:701px)]:pb-[clamp(0.35rem,1.8vh,0.9rem)]">
              <div /> {/* Spacer gauche */}
              <div className="flex items-center justify-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-4">
                {/* Passé */}
                <div className="flex flex-col items-center">
                  <div className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none">
                    {t('game.cogTask.past')}
                  </div>
                  <div className="flex items-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-3 bg-secondary/40 rounded-2xl px-2 py-1 lg:px-3 lg:py-2">
                    {pastDists.map((dist) => {
                      const slotTrialIndex = trialIndex - dist;
                      return (
                        <AudioTimelineSlot
                          key={`audio-${dist}`}
                          item={audioItemAt(dist)}
                          label={`N-${dist}`}
                          disabled={!canPickDist(dist, 'audio')}
                          onClick={() => setActivePick({ dist, modality: 'audio' })}
                          feedback={feedbackFor(dist, 'audio')}
                          highlight={isCellActive(dist, 'audio')}
                          borderColorClass={
                            trialColorCoding && slotTrialIndex >= 0
                              ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                              : undefined
                          }
                          correctionCount={getCorrectionCount(dist, 'audio')}
                        />
                      );
                    })}
                  </div>
                </div>
                {/* Présent */}
                <div className="flex flex-col items-center">
                  <div className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none">
                    {t('game.cogTask.present')}
                  </div>
                  <div className="flex items-center justify-center px-2 py-1 lg:px-3 lg:py-2">
                    <AudioTimelineSlot
                      item={audioItemAt(0)}
                      label="N"
                      disabled={!canPickDist(0, 'audio')}
                      onClick={() => setActivePick({ dist: 0, modality: 'audio' })}
                      feedback={feedbackFor(0, 'audio')}
                      highlight={isCellActive(0, 'audio')}
                      borderColorClass={
                        trialColorCoding
                          ? getTrialBorderColorForNLevel(trialIndex, nLevel)
                          : undefined
                      }
                      correctionCount={getCorrectionCount(0, 'audio')}
                    />
                  </div>
                </div>
              </div>
              {/* Label Audio à droite */}
              <div className="flex justify-start items-center pl-2 lg:pl-4 h-12 mb-1 lg:mb-2">
                <span className="text-3xs lg:text-xs font-bold text-audio uppercase tracking-wide">
                  {t('game.cogTask.dualMemo.audio')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER - grid avec taille responsive comme le tutoriel */}
      <div
        className="flex-1 flex flex-col items-center justify-center min-h-0 p-2 overflow-hidden"
        data-testid="game-area"
      >
        <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[500px]">
          <Grid
            activePosition={centerItem?.position ?? null}
            showStimulus={centerItem !== null && !isPaused}
            paused={isPaused}
            className="shadow-md rounded-2xl"
            borderColor={
              trialColorCoding ? getTrialBorderColorForNLevel(trialIndex, nLevel) : undefined
            }
          />
        </div>
      </div>

      {/* FOOTER - bouton proche de la grille sur desktop, zone pouce sur mobile */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-2 px-4 py-2 page-inset-bottom lg:py-4">
        {phase === 'idle' ? (
          <button
            type="button"
            onClick={handleStart}
            className="w-[160px] sm:w-[190px] md:w-[220px] lg:w-[250px] py-[clamp(0.5rem,2vh,1rem)] rounded-xl font-bold text-[clamp(0.875rem,2vh,1rem)] bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all"
          >
            {t('common.start', 'Start')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCommit}
            disabled={phase !== 'recall' || !canCommit}
            className="w-[160px] sm:w-[190px] md:w-[220px] lg:w-[250px] py-[clamp(0.5rem,2vh,1rem)] rounded-xl font-bold text-[clamp(0.875rem,2vh,1rem)] bg-surface text-primary shadow-soft transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-soft-lg hover:-translate-y-0.5 active:scale-[0.97] disabled:hover:shadow-soft disabled:hover:translate-y-0 disabled:active:scale-100"
          >
            {t('common.validate', 'Validate')}
          </button>
        )}
      </div>

      {/* Pickers */}
      {activePick && activePick.modality === 'position' && (
        <PositionPicker
          selected={localPicks[activePick.dist]?.position}
          onSelect={(pos, inputMethod) => handlePick(activePick.dist, 'position', pos, inputMethod)}
          onClose={() => setActivePick(null)}
        />
      )}
      {activePick && activePick.modality === 'audio' && (
        <AudioPicker
          selected={localPicks[activePick.dist]?.audio}
          onSelect={(sound, inputMethod) =>
            handlePick(activePick.dist, 'audio', sound, inputMethod)
          }
          onClose={() => setActivePick(null)}
        />
      )}

      {/* Settings Overlay */}
      {showSettingsOverlay && (
        <GameSettingsOverlay
          buttonSoundsEnabled={buttonSoundsEnabled}
          feedbackSoundsEnabled={soundEnabled}
          hapticEnabled={hapticEnabled}
          onButtonSoundsEnabledChange={setButtonSoundsEnabled}
          onFeedbackSoundsEnabledChange={setSoundEnabled}
          onHapticEnabledChange={setHapticEnabled}
          onHaptic={triggerHaptic}
          onClose={() => setShowSettingsOverlay(false)}
        />
      )}
    </div>
  );
}
