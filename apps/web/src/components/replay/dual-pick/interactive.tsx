/**
 * Interactive DualPick (Dual Pick) Replay View
 * Correction mode for dual-pick sessions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from '@phosphor-icons/react';
import {
  type GameEvent,
  type ReplaySession,
  type DualPickReplayData,
  type RecoveredReplayState,
  projectDualPickSnapshot,
  getDualPickInFlightDragsAtTime,
} from '@neurodual/logic';
import {
  useInteractiveReplay,
  type InteractiveReplaySpeed,
  Grid,
  PlaceDropZone,
  Button,
  CanvasWeave,
  useReplayInteractifAdapter,
} from '@neurodual/ui';
import { useAppPorts } from '../../../providers';
import { ReplayUnifiedCompletionReport } from '../replay-unified-completion-report';

interface InteractiveDualPickViewProps {
  session: ReplaySession;
  replayData: DualPickReplayData;
  onComplete: () => void;
  onAbandon: () => void;
  /** Optional parent run events (for chained corrections) */
  parentEvents?: readonly GameEvent[];
  /** Optional parent run ID (for chained corrections) */
  parentRunId?: string | null;
  /** Optional recovered state for resuming after page refresh */
  recoveredState?: RecoveredReplayState;
}

export function InteractiveDualPickView({
  session,
  replayData,
  onComplete,
  onAbandon,
  parentEvents,
  parentRunId,
  recoveredState,
}: InteractiveDualPickViewProps) {
  const { t } = useTranslation();
  const [showReport, setShowReport] = useState(false);
  const [showReplayControls, setShowReplayControls] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<{
    id: string;
    label: string;
  } | null>(null);

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
    dualPickDrop,
  } = useInteractiveReplay({
    adapter,
    sessionId: session.sessionId,
    sessionType: 'dual-pick',
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
    () => projectDualPickSnapshot(replayData, currentTimeMs),
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
        sessionType: 'dual-pick',
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

  const inFlightDrags = useMemo(
    () => getDualPickInFlightDragsAtTime(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

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
  const windowSize = Math.min(snapshot.trialIndex + 1, nLevel + 1);
  const slots = Array.from({ length: windowSize }, (_, i) => i);
  const pastSlots = slots.filter((s) => s > 0).sort((a, b) => b - a);

  const getPlacedContent = (slot: number, type: 'position' | 'audio') => {
    if (snapshot.phase === 'stimulus') return null;
    const card = snapshot.timelineCards.find((c) => c.slot === slot && c.type === type);
    if (card?.placedLabel) {
      return <span className="text-xs font-bold text-woven-text">{card.placedLabel}</span>;
    }
    return null;
  };

  const isSlotFilled = (slot: number, type: 'position' | 'audio') => {
    if (snapshot.phase === 'stimulus') return false;
    return snapshot.timelineCards.some(
      (c) => c.slot === slot && c.type === type && c.placedLabel !== null,
    );
  };

  const unplacedProposals = useMemo(() => {
    if (snapshot.phase !== 'placement') return [];
    const inFlightIds = new Set(inFlightDrags.map((d) => d.proposalId));
    return snapshot.proposals.filter((p) => !inFlightIds.has(p.id));
  }, [snapshot.phase, snapshot.proposals, inFlightDrags]);

  // Reset selection when phase changes
  useEffect(() => {
    if (snapshot.phase !== 'placement') {
      setSelectedProposal(null);
    }
  }, [snapshot.phase]);

  // Handle proposal selection
  const handleProposalClick = useCallback((proposal: { id: string; label: string }) => {
    setSelectedProposal({ id: proposal.id, label: proposal.label });
  }, []);

  // Handle slot click (place selected proposal)
  const handleSlotClick = useCallback(
    (slot: number) => {
      if (!selectedProposal) return;
      dualPickDrop(selectedProposal.id, selectedProposal.label, slot);
      setSelectedProposal(null);
    },
    [selectedProposal, dualPickDrop],
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
    <div className="flex flex-col h-full gap-2">
      {/* HUD */}
      <div className="shrink-0 flex flex-col items-center pt-2">
        <div
          className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
          data-testid="dual-pick-interactive-hud"
        >
          <CanvasWeave lineCount={8} rounded="full" />
          <div className="relative z-10 h-10 px-3 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-700 flex items-center">
            <Pencil size={12} className="inline mr-1" />
            {t('replay.correction', 'Correction')}
          </div>
          <div className="relative z-10 h-10 px-3 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase flex items-center">
            N-{nLevel}
          </div>
          <div className="relative z-10 h-10 px-3 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text flex items-center gap-1">
            {String(snapshot.trialIndex + 1).padStart(2, '0')}
            <span className="text-woven-text-muted"> / </span>
            {String(snapshot.totalTrials).padStart(2, '0')}
          </div>
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={isFinished}
            className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border ${
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
              className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border bg-woven-surface text-woven-text"
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

      {/* Timeline (past slots) */}
      {pastSlots.length > 0 && (
        <div className="shrink-0 flex justify-center gap-4 pt-2">
          {pastSlots.map((slot) => (
            <div key={slot} className="flex gap-2">
              {snapshot.activeModalities.includes('position') && (
                <PlaceDropZone
                  slot={slot}
                  type="position"
                  label={`N-${slot}`}
                  filled={isSlotFilled(slot, 'position')}
                  filledContent={getPlacedContent(slot, 'position')}
                  disabled={snapshot.phase !== 'placement' || !selectedProposal}
                  onClick={() => handleSlotClick(slot)}
                  highlight={!!selectedProposal}
                />
              )}
              {snapshot.activeModalities.includes('audio') && (
                <PlaceDropZone
                  slot={slot}
                  type="audio"
                  label={`N-${slot}`}
                  filled={isSlotFilled(slot, 'audio')}
                  filledContent={getPlacedContent(slot, 'audio')}
                  disabled={snapshot.phase !== 'placement' || !selectedProposal}
                  onClick={() => handleSlotClick(slot)}
                  highlight={!!selectedProposal}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 p-2 overflow-visible relative">
        <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[440px]">
          <Grid
            activePosition={gridPosition}
            showStimulus={showStimulus}
            hideCross={snapshot.phase === 'placement'}
            className="shadow-md rounded-2xl"
          />

          {snapshot.phase === 'placement' && (
            <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-md rounded-2xl pointer-events-none" />
          )}

          {snapshot.phase === 'placement' && unplacedProposals.length > 0 && (
            <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-4">
              <div className="flex flex-wrap justify-center gap-3 items-center p-4 max-w-[280px]">
                {unplacedProposals.map((proposal) => (
                  <button
                    key={proposal.id}
                    type="button"
                    onClick={() => handleProposalClick(proposal)}
                    className={`
                      w-12 h-12 rounded-xl shadow-md flex items-center justify-center cursor-pointer transition-all
                      bg-violet-50 border-2 border-violet-400
                      ${selectedProposal?.id === proposal.id ? 'ring-4 ring-primary scale-110' : 'hover:scale-105'}
                    `}
                  >
                    <span className="font-bold text-violet-700 text-sm">{proposal.label}</span>
                  </button>
                ))}
              </div>
              {selectedProposal && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  {t('replay.tapSlotToPlace', 'Tap a slot to place')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Current slot (N) */}
      <div className="shrink-0 flex justify-center gap-2 pb-2">
        {snapshot.activeModalities.includes('position') && (
          <PlaceDropZone
            slot={0}
            type="position"
            label="N"
            filled={isSlotFilled(0, 'position')}
            filledContent={getPlacedContent(0, 'position')}
            disabled={snapshot.phase !== 'placement' || !selectedProposal}
            onClick={() => handleSlotClick(0)}
            highlight={!!selectedProposal}
          />
        )}
        {snapshot.activeModalities.includes('audio') && (
          <PlaceDropZone
            slot={0}
            type="audio"
            label="N"
            filled={isSlotFilled(0, 'audio')}
            filledContent={getPlacedContent(0, 'audio')}
            disabled={snapshot.phase !== 'placement' || !selectedProposal}
            onClick={() => handleSlotClick(0)}
            highlight={!!selectedProposal}
          />
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
