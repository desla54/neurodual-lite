/**
 * Interactive Recall (Memo) Replay View
 * Correction mode for recall sessions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from '@phosphor-icons/react';
import {
  type GameEvent,
  type ReplaySession,
  type MemoReplayData,
  type RecoveredReplayState,
  projectMemoSnapshot,
} from '@neurodual/logic';
import {
  useInteractiveReplay,
  type InteractiveReplaySpeed,
  Grid,
  PlaceDropZone,
  Button,
  useReplayInteractifAdapter,
} from '@neurodual/ui';
import { useAppPorts } from '../../../providers';
import { MiniGrid, MiniLetter } from '../shared/mini-components';
import { ReplayUnifiedCompletionReport } from '../replay-unified-completion-report';

interface InteractiveMemoViewProps {
  session: ReplaySession;
  replayData: MemoReplayData;
  onComplete: () => void;
  onAbandon: () => void;
  /** Optional parent run events (for chained corrections) */
  parentEvents?: readonly GameEvent[];
  /** Optional parent run ID (for chained corrections) */
  parentRunId?: string | null;
  /** Optional recovered state for resuming after page refresh */
  recoveredState?: RecoveredReplayState;
}

export function InteractiveMemoView({
  session,
  replayData,
  onComplete,
  onAbandon,
  parentEvents,
  parentRunId,
  recoveredState,
}: InteractiveMemoViewProps) {
  const { t } = useTranslation();
  const [showReport, setShowReport] = useState(false);
  const [showReplayControls, setShowReplayControls] = useState(false);

  const { replayRecovery, createInteractiveReplayLifecycleAdapter } = useAppPorts();
  const adapter = useReplayInteractifAdapter();
  const lifecycleAdapter = useMemo(
    () => createInteractiveReplayLifecycleAdapter(),
    [createInteractiveReplayLifecycleAdapter],
  );

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
    abandon,
  } = useInteractiveReplay({
    adapter,
    sessionId: session.sessionId,
    sessionType: 'recall',
    parentEvents: parentEvents ?? session.events,
    activeModalities: replayData.config.activeModalities,
    parentRunId: parentRunId ?? null,
    totalDurationMs: replayData.totalDurationMs,
    lifecycleAdapter,
    onComplete: () => {
      setShowReport(true);
    },
  });

  // Start or recover the run on mount
  useEffect(() => {
    if (recoveredState) {
      recover(recoveredState);
    } else {
      start();
    }
  }, [start, recover, recoveredState]);

  const snapshot = useMemo(
    () => projectMemoSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Install recovery handlers (save snapshot on visibility change, beforeunload)
  useEffect(() => {
    if (status !== 'playing' && status !== 'paused') return;
    if (!run) return;

    const cleanup = replayRecovery.installReplayRecoveryHandlers(() => {
      return replayRecovery.createReplayRecoverySnapshot({
        runId: run.id,
        sessionId: session.sessionId,
        sessionType: 'recall',
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

  const gridPosition = useMemo(() => {
    if (snapshot.phase === 'stimulus' && snapshot.stimulus) {
      return snapshot.stimulus.position;
    }
    return null;
  }, [snapshot.phase, snapshot.stimulus]);

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

  const handleAbandon = useCallback(async () => {
    await abandon();
    onAbandon();
  }, [abandon, onAbandon]);

  const isFinished = status === 'awaitingCompletion' || status === 'finished';
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused' || status === 'ready';
  const showStimulus = snapshot.phase === 'stimulus';

  const nLevel = snapshot.nLevel;
  const requiredWindowDepth = snapshot.recallPrompt?.requiredWindowDepth ?? nLevel + 1;
  const allDistsToShow = Array.from({ length: nLevel + 1 }, (_, i) => i);
  const pastDists = allDistsToShow.filter((d) => d >= 1).sort((a, b) => b - a);

  const getPickContent = (dist: number, modality: 'position' | 'audio') => {
    if (snapshot.phase !== 'recall' || !snapshot.recallPrompt) return null;
    const slotIndex = dist + 1;
    const slotPicks = snapshot.recallPrompt.currentPicks.get(slotIndex);
    if (!slotPicks) return null;
    if (modality === 'position' && slotPicks.position !== undefined) {
      return <MiniGrid position={slotPicks.position} />;
    }
    if (modality === 'audio' && slotPicks.audio !== undefined) {
      return <MiniLetter letter={slotPicks.audio} />;
    }
    return null;
  };

  const isDistFilled = (dist: number, modality: 'position' | 'audio') => {
    if (snapshot.phase !== 'recall' || !snapshot.recallPrompt) return false;
    const slotIndex = dist + 1;
    const slotPicks = snapshot.recallPrompt.currentPicks.get(slotIndex);
    if (!slotPicks) return false;
    return modality === 'position'
      ? slotPicks.position !== undefined
      : slotPicks.audio !== undefined;
  };

  const isDistRequired = (dist: number) => {
    return dist < requiredWindowDepth;
  };

  // Note: Recall tap-to-correct would need a picker UI (grid/sound selector)
  // This is different from the tap-proposal → tap-slot pattern used in Flow/DualPick
  // For now, Recall remains display-only during interactive replay

  // CSS Grid layout style (matching passive.tsx pattern)
  const gridLayoutStyle = useMemo(
    () => ({
      display: 'grid' as const,
      gridTemplateRows: 'auto auto 1fr auto',
      gridTemplateAreas: '"header" "timeline" "grid" "controls"',
      gap: '8px',
      height: 'calc(100dvh - 4rem)',
      padding: '0 16px',
      paddingBottom: 'env(safe-area-inset-bottom, 16px)',
    }),
    [],
  );

  if (showReport && run) {
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
    <div className="relative overflow-hidden" style={gridLayoutStyle}>
      {/* HUD */}
      <div className="flex flex-col items-center pt-2" style={{ gridArea: 'header' }}>
        <div
          className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
          data-testid="memo-interactive-hud"
        >
          <div className="relative z-10 px-3 py-1.5 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-700">
            <Pencil size={12} className="inline mr-1" />
            {t('replay.correction', 'Correction')}
          </div>
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase">
            N-{nLevel}
          </div>
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text flex items-center gap-1">
            {String(snapshot.trialIndex + 1).padStart(2, '0')}
            <span className="text-woven-text-muted"> / </span>
            {String(snapshot.totalTrials).padStart(2, '0')}
          </div>
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={isFinished}
            className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-all border border-woven-border ${
              isPlaying ? 'bg-primary text-primary-foreground' : 'bg-woven-surface text-woven-text'
            } ${isFinished ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isPaused ? t('replay.play', 'Play') : t('replay.pause', 'Pause')}
          >
            {isPlaying ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="2" y="1" width="3" height="10" rx="1" />
                <rect x="7" y="1" width="3" height="10" rx="1" />
              </svg>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 1.5v9l7-4.5-7-4.5z" />
              </svg>
            )}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReplayControls(!showReplayControls)}
              className="relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
              title={t('replay.controls', 'Controls')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
            {showReplayControls && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-woven-surface border border-woven-border rounded-xl shadow-lg z-50 min-w-[200px]">
                <div className="mb-3">
                  <div className="text-xs font-medium text-woven-text-muted mb-2">
                    {t('replay.speed', 'Speed')}
                  </div>
                  <div className="flex gap-1">
                    {([0.5, 1] as InteractiveReplaySpeed[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`flex-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          speed === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-woven-cell-rest text-woven-text'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-xs font-medium text-woven-text-muted mb-2">
                    {Math.round(progress * 100)}%
                  </div>
                  <div className="h-2 bg-woven-cell-rest rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" size="sm" onClick={handleAbandon} className="w-full">
                    {t('replay.abandon', 'Quit')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="w-full max-w-[200px] h-[3px] mt-2 rounded-full overflow-hidden bg-woven-cell-rest">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Timeline (past dists) */}
      <div style={{ gridArea: 'timeline' }}>
        {snapshot.phase === 'recall' && pastDists.length > 0 && (
          <div className="flex justify-center gap-4">
            {pastDists.map((dist) => (
              <div key={dist} className={`flex gap-2 ${!isDistRequired(dist) ? 'opacity-40' : ''}`}>
                {replayData.config.activeModalities.includes('position') && (
                  <PlaceDropZone
                    slot={dist}
                    type="position"
                    label={`N-${dist}`}
                    filled={isDistFilled(dist, 'position')}
                    filledContent={getPickContent(dist, 'position')}
                    disabled
                  />
                )}
                {replayData.config.activeModalities.includes('audio') && (
                  <PlaceDropZone
                    slot={dist}
                    type="audio"
                    label={`N-${dist}`}
                    filled={isDistFilled(dist, 'audio')}
                    filledContent={getPickContent(dist, 'audio')}
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div
        className="flex items-center justify-center overflow-hidden select-none"
        style={{ gridArea: 'grid' }}
      >
        <div className="relative w-full max-w-[min(95vw,400px)] [@media(max-height:700px)]:max-w-[min(85vw,340px)]">
          <Grid
            activePosition={gridPosition}
            showStimulus={showStimulus}
            className="rounded-2xl w-full h-auto"
          />
        </div>
      </div>

      {/* Current slot (N) */}
      <div style={{ gridArea: 'controls' }}>
        {snapshot.phase === 'recall' && (
          <div className="flex justify-center gap-2 pb-safe">
            {replayData.config.activeModalities.includes('position') && (
              <PlaceDropZone
                slot={0}
                type="position"
                label="N"
                filled={isDistFilled(0, 'position')}
                filledContent={getPickContent(0, 'position')}
                disabled
              />
            )}
            {replayData.config.activeModalities.includes('audio') && (
              <PlaceDropZone
                slot={0}
                type="audio"
                label="N"
                filled={isDistFilled(0, 'audio')}
                filledContent={getPickContent(0, 'audio')}
                disabled
              />
            )}
          </div>
        )}
      </div>

      {showReplayControls && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowReplayControls(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowReplayControls(false)}
          role="button"
          tabIndex={0}
          aria-label={t('aria.closeControls')}
        />
      )}
    </div>
  );
}
