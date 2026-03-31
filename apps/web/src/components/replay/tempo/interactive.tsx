/**
 * Interactive Tempo Replay View
 * Correction mode for tempo (N-Back) sessions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GearSix,
  House,
  Pause,
  Pencil,
  Play,
  Timer,
  SpeakerHigh,
  SpeakerSlash,
  X,
} from '@phosphor-icons/react';
import {
  type ReplaySession,
  type GameEvent,
  type ModalityId,
  type TempoReplayData,
  type RecoveredReplayState,
  projectTempoSnapshot,
  getActiveResponsesAtTime,
} from '@neurodual/logic';
import {
  useInteractiveReplay,
  type InteractiveReplaySpeed,
  Grid,
  GameControls,
  type GameControlItem,
  CanvasWeave,
  TimelineCard,
  Button,
} from '@neurodual/ui';
import { useGameLayout } from '../../../hooks/use-game-layout';
import { useFocusTimelineOverlay } from './use-focus-timeline-overlay';
import { useHapticTrigger } from '../../../hooks/use-haptic';
import { useSettingsStore } from '../../../stores/settings-store';
import { ReplayUnifiedCompletionReport } from '../replay-unified-completion-report';
import { useAppPorts } from '../../../providers';
import { useReplayInteractifAdapter } from '@neurodual/ui';

interface InteractiveTempoViewProps {
  session: ReplaySession;
  replayData: TempoReplayData;
  onComplete: () => void;
  onAbandon: () => void;
  /** Optional parent run events (for chained corrections) */
  parentEvents?: readonly GameEvent[];
  /** Optional parent run ID (for chained corrections) */
  parentRunId?: string | null;
  /** Optional recovered state for resuming after page refresh */
  recoveredState?: RecoveredReplayState;
}

export function InteractiveTempoView({
  session,
  replayData,
  onComplete,
  onAbandon,
  parentEvents,
  parentRunId,
  recoveredState,
}: InteractiveTempoViewProps) {
  const tempoGridStyle = useSettingsStore((s) => s.ui.tempoGridStyle);
  const setTempoGridStyle = useSettingsStore((s) => s.setTempoGridStyle);
  const gridScale = useSettingsStore((s) => s.ui.gridScale);
  const controlsScale = useSettingsStore((s) => s.ui.controlsScale);
  const setGridScale = useSettingsStore((s) => s.setGridScale);
  const setControlsScale = useSettingsStore((s) => s.setControlsScale);
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const triggerHaptic = useHapticTrigger();
  // State for showing completion report
  const [showReport, setShowReport] = useState(false);
  // Countdown state: 0 = no countdown, 1 = "3", 2 = "3, 2", 3 = "3, 2, 1"
  const [countdownStep, setCountdownStep] = useState(0);
  // Settings overlay state
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showTrialsRemaining, setShowTrialsRemaining] = useState(false);
  const [showNLevel, setShowNLevel] = useState(true);
  const [showProgressBar, setShowProgressBar] = useState(true);
  const [filledTimelineSlotKeys, setFilledTimelineSlotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // Quit confirmation modal state
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const { t } = useTranslation();
  const { audio, replayRecovery, createInteractiveReplayLifecycleAdapter } = useAppPorts();
  const adapter = useReplayInteractifAdapter();

  // Use game layout for consistent sizing with main game
  // Reduce gridPadding since correction mode has no countdown/instructions
  const layout = useGameLayout({
    showTimeline: false,
    showProgressBar,
    controlsCount: replayData.config.activeModalities.length,
    gridPadding: 16, // Minimal padding (default is 48 for game mode)
    controlsScale,
  });
  const gridRenderSize = useMemo(
    () => (layout.isMobile ? Math.min(layout.gridSize, layout.availableWidth) : layout.gridSize),
    [layout.isMobile, layout.gridSize, layout.availableWidth],
  );
  const safeMobileScaleLimit = useMemo(() => {
    if (!layout.isMobile) return Number.POSITIVE_INFINITY;
    if (gridRenderSize <= 0) return 1;
    const limit = layout.availableWidth / gridRenderSize;
    return Number.isFinite(limit) && limit > 0 ? limit : 1;
  }, [layout.isMobile, layout.availableWidth, gridRenderSize]);
  const effectiveGridScale = Math.min(gridScale, safeMobileScaleLimit);
  const effectiveControlsScale = Math.min(controlsScale, safeMobileScaleLimit);
  // Create lifecycle adapter for XState machine
  const lifecycleAdapter = useMemo(
    () => createInteractiveReplayLifecycleAdapter(),
    [createInteractiveReplayLifecycleAdapter],
  );

  // Interactive replay hook
  const {
    status,
    run,
    currentTimeMs,
    progress,
    speed,
    start,
    recover,
    togglePlayPause,
    setSpeed,
    respond,
    abandon,
    hasRespondedForModality,
    wasParentFalseAlarm,
  } = useInteractiveReplay({
    adapter,
    sessionId: session.sessionId,
    sessionType: 'tempo',
    parentEvents: parentEvents ?? session.events,
    activeModalities: replayData.config.activeModalities,
    parentRunId: parentRunId ?? null,
    totalDurationMs: replayData.totalDurationMs,
    audioAdapter: audio,
    lifecycleAdapter,
    onComplete: () => {
      setShowReport(true);
    },
  });

  // Project snapshot at current time (moved up for use in recovery handlers)
  const snapshot = useMemo(
    () => projectTempoSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Start or recover the run on mount
  useEffect(() => {
    if (recoveredState) {
      recover(recoveredState);
    } else {
      start();
    }
  }, [start, recover, recoveredState]);

  // Install recovery handlers (save snapshot on visibility change, beforeunload)
  useEffect(() => {
    if (status !== 'playing' && status !== 'paused') return;
    if (!run) return;

    const cleanup = replayRecovery.installReplayRecoveryHandlers(() => {
      return replayRecovery.createReplayRecoverySnapshot({
        runId: run.id,
        sessionId: session.sessionId,
        sessionType: 'tempo',
        parentRunId: run.parentRunId,
        currentTimeMs,
        currentTrialIndex: snapshot.trialIndex,
        speed,
      });
    });

    return cleanup;
  }, [status, run, session.sessionId, currentTimeMs, snapshot.trialIndex, speed, replayRecovery]);

  // Clear recovery snapshot on completion
  useEffect(() => {
    if (status === 'finished') {
      replayRecovery.clearReplayRecoverySnapshot();
    }
  }, [status, replayRecovery]);

  // Audio playback - play sound when entering stimulus phase of a new trial
  const lastPlayedTrialRef = useRef<number>(-1);
  useEffect(() => {
    if (
      status === 'playing' &&
      snapshot.phase === 'stimulus' &&
      snapshot.trial &&
      snapshot.trialIndex !== lastPlayedTrialRef.current
    ) {
      lastPlayedTrialRef.current = snapshot.trialIndex;
      // Play the trial's sound (if sound is enabled)
      if (
        soundEnabled &&
        snapshot.trial.sound &&
        replayData.config.activeModalities.includes('audio')
      ) {
        audio.play(snapshot.trial.sound);
      }
    }
  }, [
    status,
    snapshot.phase,
    snapshot.trial,
    snapshot.trialIndex,
    replayData.config.activeModalities,
    soundEnabled,
    audio,
  ]);

  // Initialize audio service for replay
  useEffect(() => {
    audio.init().catch(console.error);
  }, [audio]);

  // Get active responses at current time (from parent session)
  const parentActiveResponses = useMemo(
    () => getActiveResponsesAtTime(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Build controls array for GameControls - INTERACTIVE!
  const controls: GameControlItem[] = useMemo(() => {
    return replayData.config.activeModalities.map((modality) => {
      const parentActive = parentActiveResponses.has(modality);
      const isFalseAlarm = wasParentFalseAlarm(modality);
      const userResponded = hasRespondedForModality(modality);
      const isActive = (parentActive && !isFalseAlarm) || userResponded;

      return {
        id: modality,
        label: t(`game.controls.${modality}`),
        shortcut: modality === 'position' ? 'A' : modality === 'audio' ? 'L' : 'K',
        active: isActive,
        onClick: () => respond(modality),
        color: modality === 'position' ? 'visual' : modality === 'audio' ? 'audio' : 'accent',
      };
    }) as GameControlItem[];
  }, [
    replayData.config.activeModalities,
    parentActiveResponses,
    wasParentFalseAlarm,
    hasRespondedForModality,
    respond,
    t,
  ]);

  // Grid position
  const gridPosition = useMemo(() => {
    if (snapshot.phase === 'stimulus' && snapshot.trial) {
      return snapshot.trial.position;
    }
    return null;
  }, [snapshot.phase, snapshot.trial]);

  // Handle actions from report
  const handleReplayAgain = useCallback(() => {
    window.location.reload();
  }, []);

  const handleCorrectAgain = useCallback(() => {
    setShowReport(false);
    start();
  }, [start]);

  const handleBackToHome = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Handle abandon
  const handleAbandon = useCallback(async () => {
    await abandon();
    onAbandon();
  }, [abandon, onAbandon]);

  // State flags
  const isAwaitingValidation = status === 'awaitingCompletion';
  const isCompleted = status === 'finished';
  const isFinished = isAwaitingValidation || isCompleted;
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const showStimulus = snapshot.phase === 'stimulus';
  const isCountingDown = countdownStep > 0;

  const {
    showOverlay: showFocusTimelineOverlay,
    open: openFocusTimelineOverlay,
    close: closeFocusTimelineOverlay,
    resume: resumeFromFocusTimelineOverlay,
    ignoreCloseUntilRef: focusOverlayIgnoreCloseUntilRef,
  } = useFocusTimelineOverlay({
    status,
    isFinished,
    togglePlayPause,
    isCountingDown,
  });

  const enableFocusCross = status === 'playing' || status === 'paused' || showFocusTimelineOverlay;

  const timelineSlots = useMemo(() => {
    const cardsCount = Math.max(1, snapshot.nLevel + 1);
    const currentIndex = snapshot.trialHistory.length - 1;
    const distances = Array.from({ length: cardsCount }, (_, idx) => cardsCount - 1 - idx);

    return distances.map((dist) => {
      const trialIndex = currentIndex - dist;
      const trial = trialIndex >= 0 ? snapshot.trialHistory[trialIndex] : null;
      const label = dist === 0 ? 'N' : `N-${dist}`;
      return {
        key: `${label}-${trialIndex}`,
        label,
        trial,
        isCurrent: dist === 0,
        borderColorKey: 'slate' as const,
      };
    });
  }, [snapshot.nLevel, snapshot.trialHistory]);
  const pastTimelineSlots = useMemo(
    () => timelineSlots.filter((slot) => !slot.isCurrent),
    [timelineSlots],
  );
  const currentTimelineSlot = useMemo(
    () => timelineSlots.find((slot) => slot.isCurrent) ?? null,
    [timelineSlots],
  );

  // Reset active-recall fills when starting a new correction run.
  useEffect(() => {
    setFilledTimelineSlotKeys(new Set());
  }, [run?.id]);

  // Keep only visible slot keys when timeline window slides.
  useEffect(() => {
    setFilledTimelineSlotKeys((prev) => {
      const validKeys = new Set(timelineSlots.map((slot) => slot.key));
      const next = new Set<string>();
      for (const key of prev) {
        if (validKeys.has(key)) next.add(key);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [timelineSlots]);

  const fillTimelineSlot = useCallback((slotKey: string) => {
    setFilledTimelineSlotKeys((prev) => {
      if (prev.has(slotKey)) return prev;
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });
  }, []);

  const fillAllTimelineSlots = useCallback(() => {
    setFilledTimelineSlotKeys(
      new Set(timelineSlots.filter((slot) => slot.trial != null).map((slot) => slot.key)),
    );
  }, [timelineSlots]);

  // Handle play with countdown
  const handlePlay = useCallback(() => {
    if (isPlaying || isCountingDown) return;
    setCountdownStep(1);
  }, [isPlaying, isCountingDown]);

  // Countdown effect
  useEffect(() => {
    if (countdownStep === 0) return;

    if (countdownStep < 4) {
      const timer = setTimeout(() => {
        setCountdownStep((s) => s + 1);
      }, 800);
      return () => clearTimeout(timer);
    }
    // Countdown finished, start playing
    setCountdownStep(0);
    togglePlayPause();
  }, [countdownStep, togglePlayPause]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showFocusTimelineOverlay) {
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          if (!isFinished && !isCountingDown) {
            resumeFromFocusTimelineOverlay();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeFocusTimelineOverlay();
        }
        return;
      }

      // Space toggles play/pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!isFinished && !isCountingDown) {
          togglePlayPause();
        }
        return;
      }

      // Modality shortcuts only when playing
      if (status !== 'playing') return;

      const modalityMap: Record<string, ModalityId> = {
        a: 'position',
        l: 'audio',
        k: 'color',
      };
      const modality = modalityMap[e.key.toLowerCase()];
      if (modality && replayData.config.activeModalities.includes(modality)) {
        respond(modality);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    status,
    respond,
    replayData.config.activeModalities,
    isFinished,
    isCountingDown,
    togglePlayPause,
    showFocusTimelineOverlay,
    closeFocusTimelineOverlay,
    resumeFromFocusTimelineOverlay,
  ]);

  // CSS Grid layout style (matching passive.tsx pattern)
  const gridLayoutStyle = useMemo(
    () => ({
      display: 'grid' as const,
      // Match main game behavior on desktop: fixed game row keeps controls near the grid.
      gridTemplateRows: layout.isMobile ? 'auto 1fr auto' : `auto ${layout.gameAreaHeight}px auto`,
      gridTemplateAreas: '"header" "grid" "controls"',
      gap: '8px',
      height: 'calc(100dvh - 4rem)',
      padding: '0 16px',
      paddingBottom: 'env(safe-area-inset-bottom, 16px)',
    }),
    [layout.isMobile, layout.gameAreaHeight],
  );

  // Show completion report after validation
  if ((showReport || isCompleted) && run) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <ReplayUnifiedCompletionReport
          session={session}
          run={run}
          onPlayAgain={handleCorrectAgain}
          onBackToHome={handleBackToHome}
          onReplay={handleReplayAgain}
          onCorrect={run.depth < 3 ? handleCorrectAgain : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden"
      style={gridLayoutStyle}
      data-testid="interactive-replay-page"
    >
      {/* HUD */}
      <div
        className="flex flex-col items-center pt-4 lg:pt-2 [@media(max-width:639px)]:absolute [@media(max-width:639px)]:top-0 [@media(max-width:639px)]:left-0 [@media(max-width:639px)]:right-0 [@media(max-width:639px)]:z-10"
        style={{ gridArea: 'header' }}
      >
        <div className="inline-flex flex-col items-center">
          <div
            className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
            data-testid="replay-hud"
          >
            <CanvasWeave lineCount={8} rounded="full" />
            {/* Badge Correction - icon only on mobile */}
            <div className="relative z-10 h-10 px-2 sm:px-3 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-700 flex items-center gap-1">
              <Pencil size={12} />
              <span className="hidden sm:inline">{t('replay.correction', 'Correction')}</span>
            </div>

            {showNLevel && (
              <div className="relative z-10 h-10 px-3 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase flex items-center">
                N-{snapshot.nLevel}
              </div>
            )}

            {/* Trial Counter / Trials Remaining (toggle on tap) */}
            <button
              type="button"
              onClick={() => setShowTrialsRemaining((prev) => !prev)}
              className="relative z-10 h-10 px-3 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text flex items-center gap-1 cursor-pointer transition-colors hover:bg-woven-cell-rest/80"
              title={t('replay.hud.toggleCounterDisplay', 'Toggle counter display')}
            >
              <Timer size={12} weight="bold" className="text-woven-text-muted" />
              {showTrialsRemaining ? (
                <span>{Math.max(0, snapshot.totalTrials - snapshot.trialIndex - 1)}</span>
              ) : (
                <>
                  {String(snapshot.trialIndex + 1).padStart(2, '0')}
                  <span className="text-woven-text-muted"> / </span>
                  {String(snapshot.totalTrials).padStart(2, '0')}
                </>
              )}
            </button>

            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={isFinished}
              className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border ${
                isPlaying
                  ? 'bg-woven-surface text-woven-text'
                  : 'bg-woven-cell-rest text-woven-text'
              } ${isFinished ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isPlaying ? t('replay.pause', 'Pause') : t('replay.play', 'Play')}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setShowSettingsOverlay(true)}
              className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
              title={t('game.settings.title', 'Settings')}
            >
              <GearSix size={16} />
              <span className="absolute -bottom-0.5 -right-0.5 text-xxs font-bold bg-woven-surface rounded px-0.5">
                {speed}×
              </span>
            </button>

            {/* Quit Button */}
            <button
              type="button"
              onClick={() => setShowQuitConfirm(true)}
              className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
              title={t('replay.abandon', 'Quit')}
            >
              <House size={16} />
            </button>
          </div>

          {showProgressBar && (
            <div className="w-[calc(100%-2.5rem)] h-1 mt-2 rounded-full overflow-hidden bg-woven-cell-rest">
              <div
                className="h-full transition-all duration-100 ease-out"
                style={{ width: `${progress * 100}%` }}
              >
                <svg className="w-full h-full" aria-hidden="true">
                  <defs>
                    <pattern
                      id="interactive-progress-hatch"
                      width="7"
                      height="4"
                      patternUnits="userSpaceOnUse"
                    >
                      <line
                        x1="1.2"
                        y1="0"
                        x2="1.2"
                        y2="4"
                        className="stroke-woven-text"
                        strokeWidth="0.75"
                        opacity="0.3"
                      />
                      <line
                        x1="3.5"
                        y1="0"
                        x2="3.5"
                        y2="4"
                        className="stroke-woven-text"
                        strokeWidth="0.75"
                        opacity="0.3"
                      />
                      <line
                        x1="5.8"
                        y1="0"
                        x2="5.8"
                        y2="4"
                        className="stroke-woven-text"
                        strokeWidth="0.75"
                        opacity="0.7"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#interactive-progress-hatch)" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div
        className="flex flex-col items-center justify-center overflow-hidden select-none h-full [@media(max-width:639px)]:absolute [@media(max-width:639px)]:inset-0"
        style={{ gridArea: 'grid' }}
      >
        {/* Countdown / Pause status - always above grid */}
        <div className="h-6 flex items-center justify-center mb-2">
          {status === 'paused' && !isCountingDown ? (
            <p className="text-sm text-muted-foreground">{t('game.status.paused', 'Paused')}</p>
          ) : isCountingDown ? (
            <p className="text-sm text-muted-foreground animate-in fade-in duration-200">
              {t('game.starting.getReady', 'Get ready...')}{' '}
              {countdownStep === 1 ? '3' : countdownStep === 2 ? '3, 2' : '3, 2, 1'}
            </p>
          ) : null}
        </div>

        {/* Grid container */}
        <div
          className="relative"
          style={{
            width: gridRenderSize,
            height: gridRenderSize,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: effectiveGridScale !== 1.0 ? `scale(${effectiveGridScale})` : undefined,
              transformOrigin: 'center',
            }}
          >
            <Grid
              activePosition={showStimulus ? gridPosition : null}
              gridStyle={tempoGridStyle}
              onFocusCrossPress={enableFocusCross ? openFocusTimelineOverlay : undefined}
              focusCrossAriaLabel={
                enableFocusCross
                  ? t('replay.focusTimeline.open', 'Afficher la timeline')
                  : undefined
              }
              className={`rounded-2xl w-full h-full transition-all duration-300 ${isAwaitingValidation ? 'blur-[2px] opacity-70' : ''}`}
              paused={isPaused}
              showPlayButton={!isPlaying && !isFinished && !isCountingDown}
              onPlay={handlePlay}
            />
          </div>

          {showFocusTimelineOverlay && (
            <div
              className="absolute inset-0 z-[120] rounded-2xl border border-woven-border bg-woven-surface/95 shadow-[0_10px_30px_hsl(var(--woven-border)/0.25)] flex flex-col"
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (Date.now() < focusOverlayIgnoreCloseUntilRef.current) return;
                e.preventDefault();
                closeFocusTimelineOverlay();
              }}
              onKeyDown={(e) => e.key === 'Escape' && closeFocusTimelineOverlay()}
              role="button"
              tabIndex={0}
              aria-label={t('replay.focusTimeline.close', 'Close timeline')}
            >
              <div
                className="shrink-0 border-b border-woven-border px-3 sm:px-4 py-2.5 sm:py-3"
                role="dialog"
                aria-modal="false"
                aria-label={t('replay.focusTimeline.title', 'Timeline N-back')}
              >
                <div className="grid grid-cols-[auto_1fr_2rem] items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      fillAllTimelineSlots();
                    }}
                    className="h-8 px-2.5 rounded-full border border-woven-border bg-woven-surface text-[10px] font-semibold uppercase tracking-wide text-woven-text transition-colors hover:bg-woven-cell-rest"
                  >
                    {t('replay.focusTimeline.fillAll', 'Tout remplir')}
                  </button>
                  <h3 className="text-sm font-semibold text-woven-text text-center">
                    {t('replay.focusTimeline.title', 'Timeline N-back')}
                  </h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      closeFocusTimelineOverlay();
                    }}
                    className="h-8 w-8 rounded-full border border-woven-border bg-woven-surface text-woven-text flex items-center justify-center transition-colors hover:bg-woven-cell-rest"
                    aria-label={t('common.close', 'Close')}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-x-auto overscroll-x-contain px-2 py-3 sm:py-4 flex items-center">
                <div className="min-w-max mx-auto">
                  <div className="flex items-end gap-4 sm:gap-5">
                    <div className="grid gap-2 justify-items-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-woven-text-muted">
                        {t('tutorial.timeline.past', 'Past')}
                      </span>
                      <div className="flex items-end gap-2 sm:gap-3 rounded-2xl border border-woven-border bg-woven-cell-rest/35 px-2 sm:px-3 pt-4 min-[360px]:pt-5 sm:pt-6 pb-2 sm:pb-3">
                        {pastTimelineSlots.map((slot) => {
                          const isFilled = filledTimelineSlotKeys.has(slot.key);
                          const canFill = Boolean(slot.trial);
                          return (
                            <button
                              key={slot.key}
                              type="button"
                              onClick={() => canFill && fillTimelineSlot(slot.key)}
                              disabled={!canFill}
                              className="rounded-xl transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-default"
                              aria-label={t('replay.focusTimeline.fillCard', 'Remplir la carte')}
                            >
                              <TimelineCard
                                label={slot.label}
                                isCurrent={slot.isCurrent}
                                borderColorKey={slot.borderColorKey}
                                neutralStyle
                                disableCurrentAccent
                                emptyDashed={false}
                                sound={isFilled ? slot.trial?.sound : undefined}
                                position={isFilled ? slot.trial?.position : undefined}
                                color={isFilled ? slot.trial?.color : undefined}
                                isEmpty={!slot.trial || !isFilled}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {currentTimelineSlot && (
                      <div className="grid gap-2 justify-items-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-visual/80">
                          {t('tutorial.timeline.present', 'Present')}
                        </span>
                        <div className="rounded-2xl border border-woven-border bg-woven-surface px-2 sm:px-3 pt-4 min-[360px]:pt-5 sm:pt-6 pb-2 sm:pb-3">
                          {(() => {
                            const isFilled = filledTimelineSlotKeys.has(currentTimelineSlot.key);
                            const canFill = Boolean(currentTimelineSlot.trial);
                            return (
                              <button
                                type="button"
                                onClick={() => canFill && fillTimelineSlot(currentTimelineSlot.key)}
                                disabled={!canFill}
                                className="rounded-xl transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-default"
                                aria-label={t('replay.focusTimeline.fillCard', 'Remplir la carte')}
                              >
                                <TimelineCard
                                  key={currentTimelineSlot.key}
                                  label={currentTimelineSlot.label}
                                  isCurrent
                                  borderColorKey={currentTimelineSlot.borderColorKey}
                                  neutralStyle
                                  disableCurrentAccent
                                  emptyDashed={false}
                                  sound={isFilled ? currentTimelineSlot.trial?.sound : undefined}
                                  position={
                                    isFilled ? currentTimelineSlot.trial?.position : undefined
                                  }
                                  color={isFilled ? currentTimelineSlot.trial?.color : undefined}
                                  isEmpty={!currentTimelineSlot.trial || !isFilled}
                                />
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div
        className="w-full flex flex-col items-center justify-center gap-3 pb-4 lg:pb-2 [@media(max-width:639px)]:absolute [@media(max-width:639px)]:bottom-0 [@media(max-width:639px)]:left-0 [@media(max-width:639px)]:right-0 [@media(max-width:639px)]:z-10 [@media(max-width:639px)]:pb-safe"
        style={{ gridArea: 'controls' }}
      >
        {/* Mobile Controls */}
        <div
          className="lg:hidden"
          style={{ width: gridRenderSize, maxWidth: 'calc(100vw - 2rem)' }}
        >
          <GameControls
            controls={controls}
            disabled={!isPlaying || isFinished}
            width={gridRenderSize}
            scale={effectiveControlsScale}
            onHaptic={triggerHaptic}
          />
        </div>
        <div className="hidden lg:block" style={{ width: gridRenderSize }}>
          <GameControls
            controls={controls}
            disabled={!isPlaying || isFinished}
            width={gridRenderSize}
            scale={effectiveControlsScale}
            onHaptic={triggerHaptic}
          />
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettingsOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
            onClick={() => setShowSettingsOverlay(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowSettingsOverlay(false)}
            aria-label={t('common.close', 'Close')}
          />

          {/* Menu */}
          <div className="relative bg-woven-surface border border-woven-border rounded-2xl shadow-xl p-4 min-w-[280px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-woven-text uppercase tracking-wide">
                {t('flow.settings.title', 'Affichage')}
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsOverlay(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-woven-cell-rest text-woven-text-muted transition-colors"
                aria-label={t('common.close', 'Close')}
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm text-woven-text">{t('replay.speed', 'Speed')}</span>
                <div className="flex gap-2">
                  {([0.5, 1, 2] as InteractiveReplaySpeed[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        speed === s
                          ? 'bg-woven-text text-woven-bg'
                          : 'bg-woven-cell-rest text-woven-text hover:bg-woven-cell-rest/80'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-woven-border pt-3 space-y-2">
                <span className="text-sm text-woven-text">
                  {t('replay.hud.counterDisplay', 'Counter display')}
                </span>
                <div className="flex items-center gap-1 bg-woven-cell-rest rounded-full p-1">
                  <button
                    type="button"
                    onClick={() => setShowTrialsRemaining(false)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      !showTrialsRemaining
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text'
                    }`}
                  >
                    {t('replay.hud.counterMode.progress', 'Progress')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTrialsRemaining(true)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      showTrialsRemaining
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text'
                    }`}
                  >
                    {t('replay.hud.counterMode.remaining', 'Restants')}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm text-woven-text">
                  {t('trace.settings.gridStyle', 'Style de grille')}
                </span>
                <div className="flex items-center gap-1 bg-woven-cell-rest rounded-full p-1">
                  <button
                    type="button"
                    onClick={() => setTempoGridStyle('trace')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      tempoGridStyle === 'trace'
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text'
                    }`}
                  >
                    {t('trace.settings.gridStyleTrace', 'Trace')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempoGridStyle('classic')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      tempoGridStyle === 'classic'
                        ? 'bg-woven-text text-woven-bg'
                        : 'text-woven-text-muted hover:text-woven-text'
                    }`}
                  >
                    {t('trace.settings.gridStyleClassic', 'Classique')}
                  </button>
                </div>
              </div>

              <div className="border-t border-woven-border pt-3 space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-woven-text">
                    {t('settings.mode.showNLevel', 'Badge N-Level')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showNLevel}
                    onClick={() => setShowNLevel((prev) => !prev)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      showNLevel ? 'bg-woven-text' : 'bg-woven-cell-rest'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform ${
                        showNLevel ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-woven-text">
                    {t('settings.mode.showProgressBar', 'Progress bar')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showProgressBar}
                    onClick={() => setShowProgressBar((prev) => !prev)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      showProgressBar ? 'bg-woven-text' : 'bg-woven-cell-rest'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform ${
                        showProgressBar ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm text-woven-text">
                    {soundEnabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
                    {t('settings.sound.enabled', 'Sound enabled')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEnabled}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      soundEnabled ? 'bg-woven-text' : 'bg-woven-cell-rest'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform ${
                        soundEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-woven-text">
                    {t('settings.accessibility.hapticEnabled', 'Retour haptique')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hapticEnabled}
                    onClick={() => setHapticEnabled(!hapticEnabled)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      hapticEnabled ? 'bg-woven-text' : 'bg-woven-cell-rest'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-woven-bg shadow transition-transform ${
                        hapticEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              </div>

              <div className="border-t border-woven-border pt-3 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-woven-text">
                      {t('settings.visual.gridScale', 'Grille')}
                    </span>
                    <span className="text-xs text-woven-text-muted font-mono">
                      {Math.round(gridScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={130}
                    step={5}
                    value={Math.round(gridScale * 100)}
                    onChange={(e) => setGridScale(Number(e.target.value) / 100)}
                    className="w-full h-1.5 bg-woven-cell-rest rounded-full appearance-none cursor-pointer accent-woven-text"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-woven-text">
                      {t('settings.visual.controlsScale', 'Boutons')}
                    </span>
                    <span className="text-xs text-woven-text-muted font-mono">
                      {Math.round(controlsScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={130}
                    step={5}
                    value={Math.round(controlsScale * 100)}
                    onChange={(e) => setControlsScale(Number(e.target.value) / 100)}
                    className="w-full h-1.5 bg-woven-cell-rest rounded-full appearance-none cursor-pointer accent-woven-text"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quit Confirmation Modal */}
      {showQuitConfirm && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center safe-overlay-padding">
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('common.close', 'Close')}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
            onClick={() => setShowQuitConfirm(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowQuitConfirm(false)}
          />

          {/* Modal */}
          <div className="relative bg-woven-surface border border-woven-border rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold text-woven-text mb-2">
              {t('game.quitModal.title', 'Quit session?')}
            </h2>
            <p className="text-sm text-woven-text-muted mb-6">
              {t('game.quitModal.message', 'Your progress will not be saved.')}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowQuitConfirm(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <button
                type="button"
                onClick={handleAbandon}
                className="px-4 py-2 bg-woven-incorrect hover:opacity-90 text-white font-medium rounded-lg transition-opacity"
              >
                {t('game.quitModal.confirm', 'Quit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
