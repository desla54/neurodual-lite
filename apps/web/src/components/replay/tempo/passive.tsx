/**
 * Passive Tempo Replay View
 * Read-only visualization of a tempo (N-Back) session
 *
 * Uses CSS Grid layout matching the game page structure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  ArrowCounterClockwise,
  House,
  Timer,
  Target,
  GearSix,
  X,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react';
import {
  type TempoReplayData,
  projectTempoSnapshot,
  getActiveResponsesAtTime,
} from '@neurodual/logic';
import {
  Grid,
  GameControls,
  type GameControlItem,
  useReplayState,
  type ReplaySpeed,
  Hatching,
  TimelineCard,
  Button,
  CanvasWeave,
} from '@neurodual/ui';
import { useGameLayout } from '../../../hooks/use-game-layout';
import { useFocusTimelineOverlay } from './use-focus-timeline-overlay';
import { useSettingsStore } from '../../../stores/settings-store';
import { useAppPorts } from '../../../providers';

interface TempoReplayViewProps {
  replayData: TempoReplayData;
  currentTimeMs: number;
}

export function TempoReplayView({ replayData, currentTimeMs }: TempoReplayViewProps) {
  const { audio } = useAppPorts();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tempoGridStyle = useSettingsStore((s) => s.ui.tempoGridStyle);
  const setTempoGridStyle = useSettingsStore((s) => s.setTempoGridStyle);
  const gridScale = useSettingsStore((s) => s.ui.gridScale);
  const controlsScale = useSettingsStore((s) => s.ui.controlsScale);
  const setGridScale = useSettingsStore((s) => s.setGridScale);
  const setControlsScale = useSettingsStore((s) => s.setControlsScale);
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);

  // Replay state from context
  const { status, speed, progress, togglePlayPause, setSpeed, seek, seekToProgress } =
    useReplayState();

  const isPlaying = status === 'playing';
  const isFinished = status === 'finished';

  // Use same responsive sizing strategy as interactive replay
  const layout = useGameLayout({
    showTimeline: false,
    showProgressBar: false,
    controlsCount: replayData.config.activeModalities.length,
    gridPadding: 16,
    controlsScale,
  });
  const gridRenderSize = useMemo(
    () =>
      layout.isMobile
        ? Math.min(layout.gridSize, layout.availableWidth)
        : Math.min(layout.gridSize, 400),
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

  // Settings state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showTrialsRemaining, setShowTrialsRemaining] = useState(false);
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const {
    showOverlay: showFocusTimelineOverlay,
    open: openFocusTimelineOverlay,
    close: closeFocusTimelineOverlay,
    resume: resumeFromFocusTimelineOverlay,
    setShowOverlay: setShowFocusTimelineOverlay,
    setWasPlaying: setWasPlayingBeforeFocusOverlay,
    ignoreCloseUntilRef: focusOverlayIgnoreCloseUntilRef,
  } = useFocusTimelineOverlay({
    status,
    isFinished,
    togglePlayPause,
  });

  // Project snapshot at current time
  const snapshot = useMemo(
    () => projectTempoSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Get active responses for button highlighting
  const activeResponses = useMemo(
    () => getActiveResponsesAtTime(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Compute hits/targets ratio at current time
  const hitsRatio = useMemo(() => {
    // Get all responses up to current time
    const responsesUpToNow = replayData.responses.filter((r) => r.timestampMs <= currentTimeMs);

    // Get completed trials (past their waiting phase)
    const completedTrialIndices = new Set<number>();
    for (const seg of replayData.timeline) {
      if (seg.phase === 'waiting' && seg.endMs <= currentTimeMs) {
        completedTrialIndices.add(seg.trialIndex);
      }
    }

    // Build response map per trial
    const responsesByTrial = new Map<number, Set<string>>();
    for (const r of responsesUpToNow) {
      if (!responsesByTrial.has(r.trialIndex)) {
        responsesByTrial.set(r.trialIndex, new Set());
      }
      responsesByTrial.get(r.trialIndex)?.add(r.modality);
    }

    let totalTargets = 0;
    let totalHits = 0;

    // Process completed trials
    for (const trialIdx of completedTrialIndices) {
      const trialSeg = replayData.timeline.find(
        (seg) => seg.phase === 'stimulus' && seg.trialIndex === trialIdx,
      );
      if (!trialSeg?.trial) continue;

      const trial = trialSeg.trial;
      const responses = responsesByTrial.get(trialIdx) ?? new Set();

      for (const modality of replayData.config.activeModalities) {
        const isTarget =
          modality === 'position'
            ? trial.isPositionTarget
            : modality === 'audio'
              ? trial.isSoundTarget
              : trial.isColorTarget;

        if (isTarget) {
          totalTargets++;
          if (responses.has(modality)) {
            totalHits++;
          }
        }
      }
    }

    return { hits: totalHits, targets: totalTargets };
  }, [replayData, currentTimeMs]);

  // Audio playback - play sound when entering stimulus phase
  const lastPlayedTrialRef = useMemo(() => ({ current: -1 }), []);
  useEffect(() => {
    if (
      isPlaying &&
      soundEnabled &&
      snapshot.phase === 'stimulus' &&
      snapshot.trial &&
      snapshot.trialIndex !== lastPlayedTrialRef.current
    ) {
      lastPlayedTrialRef.current = snapshot.trialIndex;
      if (snapshot.trial.sound && replayData.config.activeModalities.includes('audio')) {
        audio.play(snapshot.trial.sound);
      }
    }
  }, [
    isPlaying,
    soundEnabled,
    snapshot.phase,
    snapshot.trial,
    snapshot.trialIndex,
    replayData.config.activeModalities,
    lastPlayedTrialRef,
  ]);

  // Initialize audio
  useEffect(() => {
    audio.init().catch(console.error);
  }, [audio]);

  // Build controls array for GameControls (read-only)
  const controls: GameControlItem[] = useMemo(() => {
    return replayData.config.activeModalities.map((modality) => ({
      id: modality,
      label: t(`game.controls.${modality}`),
      shortcut: modality === 'position' ? 'A' : modality === 'audio' ? 'L' : 'K',
      active: activeResponses.has(modality),
      onClick: () => {},
      color: modality === 'position' ? 'visual' : modality === 'audio' ? 'audio' : 'accent',
    })) as GameControlItem[];
  }, [replayData.config.activeModalities, activeResponses, t]);

  // Determine grid position based on phase
  const gridPosition = useMemo(() => {
    if (snapshot.phase === 'stimulus' && snapshot.trial) {
      return snapshot.trial.position;
    }
    return null;
  }, [snapshot.phase, snapshot.trial]);

  const showStimulus = snapshot.phase === 'stimulus';

  // Quit modal state
  const [showQuitModal, setShowQuitModal] = useState(false);

  // Handlers
  const handleQuitClick = useCallback(() => {
    setShowQuitModal(true);
  }, []);

  const handleQuitConfirm = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleQuitCancel = useCallback(() => {
    setShowQuitModal(false);
  }, []);

  const handleRestart = useCallback(() => {
    setShowFocusTimelineOverlay(false);
    setWasPlayingBeforeFocusOverlay(false);
    // Reset to beginning and start playing
    seek(0);
    // Small delay to ensure seek completes before toggling play
    setTimeout(() => {
      if (status === 'finished' || status === 'paused') {
        togglePlayPause();
      }
    }, 50);
  }, [seek, status, togglePlayPause]);

  const cycleSpeed = useCallback(() => {
    const speeds: ReplaySpeed[] = [0.5, 1, 2];
    const currentIndex = speeds.indexOf(speed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setSpeed(speeds[nextIndex] ?? 1);
  }, [speed, setSpeed]);

  // Slider refs and drag state
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const activeSliderRef = useRef<HTMLDivElement | null>(null);

  // Calculate progress from client X position
  const getProgressFromX = useCallback((clientX: number) => {
    const ref = activeSliderRef.current;
    if (!ref) return 0;
    const rect = ref.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  // Handle mouse/touch drag
  const handleDragStart = useCallback(
    (clientX: number, sliderElement: HTMLDivElement | null) => {
      isDraggingRef.current = true;
      activeSliderRef.current = sliderElement;
      if (sliderElement) {
        const rect = sliderElement.getBoundingClientRect();
        const x = clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        seekToProgress(progress);
      }
    },
    [seekToProgress],
  );

  const handleDragMove = useCallback(
    (clientX: number) => {
      if (!isDraggingRef.current) return;
      seekToProgress(getProgressFromX(clientX));
    },
    [getProgressFromX, seekToProgress],
  );

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Mouse events
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleDragStart(e.clientX, e.currentTarget);
    },
    [handleDragStart],
  );

  // Touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      if (touch) handleDragStart(touch.clientX, e.currentTarget);
    },
    [handleDragStart],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleDragMove(touch.clientX);
    },
    [handleDragMove],
  );

  // Global mouse/touch listeners for drag
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const handleGlobalMouseUp = () => handleDragEnd();
    const handleGlobalTouchEnd = () => handleDragEnd();

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  // Keyboard shortcuts for replay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showFocusTimelineOverlay) {
        if (e.key === ' ' || e.code === 'Space' || e.key === 'k') {
          e.preventDefault();
          if (!isFinished) {
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

      if (e.key === ' ' || e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'r') {
        handleRestart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlayPause,
    handleRestart,
    showFocusTimelineOverlay,
    closeFocusTimelineOverlay,
    resumeFromFocusTimelineOverlay,
    isFinished,
  ]);

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

  // CSS Grid layout style (matching game.tsx pattern)
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

  return (
    <div
      className="relative overflow-hidden"
      style={gridLayoutStyle}
      data-testid="passive-replay-page"
    >
      {/* ========== HEADER ZONE ========== */}
      <div
        className="flex flex-col items-center pt-4 lg:pt-2 [@media(max-width:639px)]:absolute [@media(max-width:639px)]:top-0 [@media(max-width:639px)]:left-0 [@media(max-width:639px)]:right-0 [@media(max-width:639px)]:z-10"
        style={{ gridArea: 'header' }}
      >
        <div className="inline-flex flex-col items-center gap-3">
          {/* HUD 1 - Session info + Home */}
          <div
            className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
            data-testid="replay-hud"
          >
            <CanvasWeave lineCount={8} rounded="full" />
            {/* N-Level */}
            <div className="relative z-10 h-10 px-3 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase flex items-center">
              N-{snapshot.nLevel}
            </div>

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

            {/* Hits / Targets ratio */}
            <div className="relative z-10 h-10 px-3 rounded-full bg-woven-cell-rest font-mono text-sm text-woven-text flex items-center gap-1">
              <Target size={12} weight="bold" className="text-woven-text-muted" />
              <span className="text-primary font-bold">{hitsRatio.hits}</span>
              <span className="text-woven-text-muted">/</span>
              <span>{hitsRatio.targets}</span>
            </div>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setShowSettingsOverlay(true)}
              className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
              title={t('game.hud.settings', 'Settings')}
            >
              <GearSix size={16} />
            </button>

            {/* Home Button */}
            <button
              type="button"
              onClick={handleQuitClick}
              className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
              title={t('replay.home', 'Accueil')}
            >
              <House size={16} />
            </button>
          </div>

          {/* Timeline / Seekable progress bar - hatched design - Desktop only */}
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={t('replay.timeline', 'Timeline')}
            className="hidden [@media(min-width:640px)]:block relative w-full max-w-md py-2 cursor-grab active:cursor-grabbing select-none touch-none text-woven-text-muted group"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onKeyDown={(e) => {
              const step = 0.05;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                seekToProgress(Math.min(1, progress + step));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                seekToProgress(Math.max(0, progress - step));
              } else if (e.key === 'Home') {
                e.preventDefault();
                seekToProgress(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                seekToProgress(1);
              }
            }}
          >
            {/* Subtle gray background track */}
            <div className="w-full h-[3px] bg-woven-border/30 rounded-full" />
            {/* Hatched progress fill */}
            <div
              className="absolute top-1/2 -translate-y-1/2 left-0 h-[3px] overflow-hidden transition-all duration-100 ease-out"
              style={{ width: `${progress * 100}%` }}
            >
              <Hatching
                id="replay-timeline-desktop"
                orientation="horizontal"
                size={3}
                className="text-woven-text"
              />
            </div>
            {/* Cursor / Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-woven-text border-2 border-woven-surface shadow-sm transition-transform duration-100 group-hover:scale-125 group-active:scale-110"
              style={{ left: `calc(${progress * 100}% - 6px)` }}
            />
          </div>

          {/* HUD 2 - Player controls (under timeline) - Desktop only */}
          <div className="hidden [@media(min-width:640px)]:flex items-center gap-4">
            {/* Badge Replay */}
            <div className="px-3 py-1.5 rounded-full border border-blue-300 bg-sky-100 text-blue-900 text-xs font-extrabold uppercase tracking-wide shadow-sm">
              {t('replay.badge', 'Replay')}
            </div>

            {/* Play Button */}
            <button
              type="button"
              onClick={isFinished ? handleRestart : togglePlayPause}
              disabled={isPlaying}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border ${
                isPlaying
                  ? 'bg-woven-surface/50 text-woven-text/30'
                  : 'bg-woven-surface text-woven-text hover:bg-woven-cell-rest'
              }`}
              title={isFinished ? t('replay.restart', 'Restart') : t('replay.play', 'Play')}
            >
              {isFinished ? (
                <ArrowCounterClockwise size={24} weight="bold" />
              ) : (
                <Play size={24} weight="fill" />
              )}
            </button>

            {/* Pause Button */}
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!isPlaying}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border ${
                !isPlaying
                  ? 'bg-woven-surface/50 text-woven-text/30'
                  : 'bg-woven-surface text-woven-text hover:bg-woven-cell-rest'
              }`}
              title={t('replay.pause', 'Pause')}
            >
              <Pause size={24} weight="fill" />
            </button>

            {/* Speed Button */}
            <button
              type="button"
              onClick={cycleSpeed}
              className="w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text text-sm font-bold"
              title={t('replay.speed', 'Speed')}
            >
              {speed}×
            </button>
          </div>
        </div>
      </div>

      {/* ========== GRID ZONE ========== */}
      <div
        className="flex flex-col items-center justify-center overflow-hidden select-none h-full [@media(max-width:639px)]:absolute [@media(max-width:639px)]:inset-0"
        style={{ gridArea: 'grid' }}
      >
        <div
          className="flex flex-col items-center gap-3"
          style={{ width: gridRenderSize, maxWidth: 'calc(100vw - 2rem)' }}
        >
          {/* Grid with border container */}
          <div
            className="relative rounded-2xl border border-woven-border overflow-hidden"
            style={{ width: gridRenderSize, height: gridRenderSize }}
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
                onFocusCrossPress={openFocusTimelineOverlay}
                focusCrossAriaLabel={t('replay.focusTimeline.open', 'Afficher la timeline')}
                className={`rounded-2xl w-full h-full transition-all duration-300 ${isFinished ? 'blur-sm opacity-50' : ''}`}
              />
            </div>

            {/* End of replay overlay */}
            {isFinished && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-base [@media(min-width:400px)]:text-lg font-bold text-woven-text">
                  {t('replay.finished', 'Fin de la relecture')}
                </div>
              </div>
            )}

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
                  <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
                    <div className="h-8 w-8" aria-hidden="true" />
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
                  <div className="min-w-max mx-auto flex items-end gap-4 sm:gap-5">
                    <div className="grid gap-2 justify-items-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-woven-text-muted">
                        {t('tutorial.timeline.past', 'Past')}
                      </span>
                      <div className="flex items-end gap-2 sm:gap-3 rounded-2xl border border-woven-border bg-woven-cell-rest/35 px-2 sm:px-3 pt-4 min-[360px]:pt-5 sm:pt-6 pb-2 sm:pb-3">
                        {pastTimelineSlots.map((slot) => (
                          <TimelineCard
                            key={slot.key}
                            label={slot.label}
                            isCurrent={slot.isCurrent}
                            borderColorKey={slot.borderColorKey}
                            neutralStyle
                            disableCurrentAccent
                            emptyDashed={false}
                            sound={slot.trial?.sound}
                            position={slot.trial?.position}
                            color={slot.trial?.color}
                            isEmpty={!slot.trial}
                          />
                        ))}
                      </div>
                    </div>

                    {currentTimelineSlot && (
                      <div className="grid gap-2 justify-items-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-visual/80">
                          {t('tutorial.timeline.present', 'Present')}
                        </span>
                        <div className="rounded-2xl border border-woven-border bg-woven-surface px-2 sm:px-3 pt-4 min-[360px]:pt-5 sm:pt-6 pb-2 sm:pb-3">
                          <TimelineCard
                            key={currentTimelineSlot.key}
                            label={currentTimelineSlot.label}
                            isCurrent
                            borderColorKey={currentTimelineSlot.borderColorKey}
                            neutralStyle
                            disableCurrentAccent
                            emptyDashed={false}
                            sound={currentTimelineSlot.trial?.sound}
                            position={currentTimelineSlot.trial?.position}
                            color={currentTimelineSlot.trial?.color}
                            isEmpty={!currentTimelineSlot.trial}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline - Mobile only (relative to grid) */}
          <div
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={t('replay.timeline', 'Timeline')}
            className="[@media(min-width:640px)]:hidden w-full py-3 px-5 cursor-grab active:cursor-grabbing select-none touch-none text-woven-text-muted group"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onKeyDown={(e) => {
              const step = 0.05;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                seekToProgress(Math.min(1, progress + step));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                seekToProgress(Math.max(0, progress - step));
              } else if (e.key === 'Home') {
                e.preventDefault();
                seekToProgress(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                seekToProgress(1);
              }
            }}
          >
            <div className="relative w-full">
              <div className="w-full h-[3px] bg-woven-border/30 rounded-full" />
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 h-[3px] overflow-hidden transition-all duration-100 ease-out"
                style={{ width: `${progress * 100}%` }}
              >
                <Hatching
                  id="replay-timeline-mobile-grid"
                  orientation="horizontal"
                  size={3}
                  className="text-woven-text"
                />
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-woven-text border-2 border-woven-surface shadow-sm transition-transform duration-100 active:scale-110"
                style={{ left: `calc(${progress * 100}% - 8px)` }}
              />
            </div>
          </div>

          {/* HUD 2 - Player controls - Mobile only (relative to grid) */}
          <div className="[@media(min-width:640px)]:hidden w-full flex items-center justify-center gap-5">
            <div className="px-4 py-1.5 rounded-full border border-blue-300 bg-sky-100 text-blue-900 text-sm font-extrabold uppercase tracking-wide shadow-sm">
              {t('replay.badge', 'Replay')}
            </div>
            <button
              type="button"
              onClick={isFinished ? handleRestart : togglePlayPause}
              disabled={isPlaying}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border ${
                isPlaying
                  ? 'bg-woven-surface/50 text-woven-text/30'
                  : 'bg-woven-surface text-woven-text active:bg-woven-cell-rest'
              }`}
              title={isFinished ? t('replay.restart', 'Restart') : t('replay.play', 'Play')}
            >
              {isFinished ? (
                <ArrowCounterClockwise size={24} weight="bold" />
              ) : (
                <Play size={24} weight="fill" />
              )}
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              disabled={!isPlaying}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border ${
                !isPlaying
                  ? 'bg-woven-surface/50 text-woven-text/30'
                  : 'bg-woven-surface text-woven-text active:bg-woven-cell-rest'
              }`}
              title={t('replay.pause', 'Pause')}
            >
              <Pause size={24} weight="fill" />
            </button>
            <button
              type="button"
              onClick={cycleSpeed}
              className="w-12 h-12 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text text-sm font-bold"
              title={t('replay.speed', 'Speed')}
            >
              {speed}×
            </button>
          </div>
        </div>
      </div>

      {/* ========== CONTROLS ZONE ========== */}
      <div
        className="w-full flex flex-col items-center justify-center gap-3 pb-4 lg:pb-2 [@media(max-width:639px)]:absolute [@media(max-width:639px)]:bottom-0 [@media(max-width:639px)]:left-0 [@media(max-width:639px)]:right-0 [@media(max-width:639px)]:z-10 [@media(max-width:639px)]:pb-safe"
        style={{ gridArea: 'controls' }}
      >
        <div
          className="lg:hidden"
          style={{ width: gridRenderSize, maxWidth: 'calc(100vw - 2rem)' }}
        >
          <GameControls
            controls={controls}
            disabled
            width={gridRenderSize}
            scale={effectiveControlsScale}
          />
        </div>
        <div className="hidden lg:block" style={{ width: gridRenderSize }}>
          <GameControls
            controls={controls}
            disabled
            width={gridRenderSize}
            scale={effectiveControlsScale}
          />
        </div>
      </div>

      {/* Quit Confirmation Modal */}
      {showQuitModal && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center safe-overlay-padding">
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
            onClick={handleQuitCancel}
            onKeyDown={(e) => e.key === 'Escape' && handleQuitCancel()}
          />

          {/* Modal */}
          <div className="relative bg-woven-surface border border-woven-border rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold text-woven-text mb-2">
              {t('game.quitModal.title')}
            </h2>
            <p className="text-sm text-woven-text-muted mb-6">{t('game.quitModal.message')}</p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={handleQuitCancel}>
                {t('common.cancel')}
              </Button>
              <button
                type="button"
                onClick={handleQuitConfirm}
                className="px-4 py-2 bg-woven-incorrect hover:opacity-90 text-white font-medium rounded-lg transition-opacity"
              >
                {t('game.quitModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <span className="text-sm text-woven-text mb-2 block">
                  {t('replay.speed', 'Speed')}
                </span>
                <div className="flex gap-2">
                  {([0.5, 1, 2] as ReplaySpeed[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  <span className="flex items-center gap-2 text-sm text-woven-text">
                    {soundEnabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
                    {t('settings.sound.enabled', 'Sound on')}
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
    </div>
  );
}
