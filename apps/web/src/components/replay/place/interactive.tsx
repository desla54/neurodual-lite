/**
 * Interactive Flow Replay View
 * Correction mode for flow sessions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from '@phosphor-icons/react';
import {
  type GameEvent,
  type ReplaySession,
  type PlaceReplayData,
  type RecoveredReplayState,
  projectPlaceSnapshot,
  getPlaceInFlightDragsAtTime,
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
import { MiniGrid, MiniLetter, AnimatedCard } from '../shared/mini-components';
import { ReplayUnifiedCompletionReport } from '../replay-unified-completion-report';

interface InteractivePlaceViewProps {
  session: ReplaySession;
  replayData: PlaceReplayData;
  onComplete: () => void;
  onAbandon: () => void;
  /** Optional parent run events (for chained corrections) */
  parentEvents?: readonly GameEvent[];
  /** Optional parent run ID (for chained corrections) */
  parentRunId?: string | null;
  /** Optional recovered state for resuming after page refresh */
  recoveredState?: RecoveredReplayState;
}

export function InteractivePlaceView({
  session,
  replayData,
  onComplete,
  onAbandon,
  parentEvents,
  parentRunId,
  recoveredState,
}: InteractivePlaceViewProps) {
  const { t } = useTranslation();
  const [showReport, setShowReport] = useState(false);
  const [showReplayControls, setShowReplayControls] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<{
    id: string;
    type: 'position' | 'audio' | 'unified';
    value: number | string;
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
    flowDrop,
  } = useInteractiveReplay({
    adapter,
    sessionId: session.sessionId,
    sessionType: 'flow',
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
    () => projectPlaceSnapshot(replayData, currentTimeMs),
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
        sessionType: 'flow',
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
    () => getPlaceInFlightDragsAtTime(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  const activeModalities = replayData.config.activeModalities;
  const hasPosition = activeModalities.includes('position');
  const hasAudio = activeModalities.includes('audio');

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
    for (const [, placedSlot] of snapshot.placedProposals) {
      if (placedSlot === slot) {
        const historyIndex = snapshot.history.length - 1 - slot;
        if (historyIndex >= 0 && historyIndex < snapshot.history.length) {
          const historyItem = snapshot.history[historyIndex];
          if (historyItem) {
            if (type === 'position') {
              return <MiniGrid position={historyItem.position} />;
            }
            return <MiniLetter letter={historyItem.sound} />;
          }
        }
      }
    }
    return null;
  };

  const isSlotFilled = (slot: number, type: 'position' | 'audio') => {
    if (snapshot.phase === 'stimulus') return false;
    for (const [proposalId, placedSlot] of snapshot.placedProposals) {
      if (placedSlot === slot) {
        const proposal = snapshot.proposals.find((p) => p.id === proposalId);
        if (proposal && proposal.type === type) return true;
        const historyIndex = snapshot.history.length - 1 - slot;
        if (historyIndex >= 0 && historyIndex < snapshot.history.length) {
          return true;
        }
      }
    }
    return false;
  };

  const unplacedProposals = useMemo(() => {
    if (snapshot.phase !== 'placement') return [];
    const placedIds = new Set(snapshot.placedProposals.keys());
    const inFlightIds = new Set(inFlightDrags.map((d) => d.proposalId));
    return snapshot.proposals.filter((p) => !placedIds.has(p.id) && !inFlightIds.has(p.id));
  }, [snapshot.phase, snapshot.proposals, snapshot.placedProposals, inFlightDrags]);

  // Reset selection when phase changes
  useEffect(() => {
    if (snapshot.phase !== 'placement') {
      setSelectedProposal(null);
    }
  }, [snapshot.phase]);

  // Handle proposal selection
  const handleProposalClick = useCallback(
    (proposal: {
      id: string;
      type: 'position' | 'audio' | 'unified';
      value?: number | string;
      position?: number;
      sound?: string;
    }) => {
      const value = proposal.type === 'unified' ? (proposal.position ?? 0) : (proposal.value ?? 0);
      setSelectedProposal({ id: proposal.id, type: proposal.type, value });
    },
    [],
  );

  // Handle slot click (place selected proposal)
  const handleSlotClick = useCallback(
    (slot: number, slotType: 'position' | 'audio') => {
      if (!selectedProposal) return;

      // Only allow matching types or unified
      if (selectedProposal.type !== 'unified' && selectedProposal.type !== slotType) return;

      flowDrop(selectedProposal.id, selectedProposal.type, selectedProposal.value, slot);
      setSelectedProposal(null);
    },
    [selectedProposal, flowDrop],
  );

  // CSS Grid layout style (matching passive.tsx pattern)
  const gridLayoutStyle = useMemo(
    () => ({
      display: 'grid' as const,
      gridTemplateRows: 'auto auto 1fr',
      gridTemplateAreas: '"header" "timeline" "grid"',
      gap: '8px',
      height: 'calc(100dvh - 4rem)',
      padding: '0 8px',
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
          data-testid="flow-interactive-hud"
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

      {/* Timeline slots */}
      <div className="w-full flex flex-col gap-2 px-2" style={{ gridArea: 'timeline' }}>
        {hasPosition && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end">
            <div className="flex items-end gap-2 justify-self-end">
              <span className="text-3xs font-bold text-visual uppercase tracking-wide whitespace-nowrap mb-4">
                {t('game.modality.position', 'Position')}
              </span>
              {pastSlots.length > 0 && (
                <div className="flex flex-col items-center">
                  <div className="text-xxs font-bold text-muted-foreground/70 mb-1 uppercase">
                    {t('flow.past', 'Past')}
                  </div>
                  <div className="flex items-center gap-2 bg-secondary/40 rounded-2xl px-2 py-1">
                    {[...pastSlots].reverse().map((slot) => (
                      <PlaceDropZone
                        key={`pos-${slot}`}
                        slot={slot}
                        type="position"
                        label={`N-${slot}`}
                        filled={isSlotFilled(slot, 'position')}
                        filledContent={getPlacedContent(slot, 'position')}
                        disabled={snapshot.phase !== 'placement' || !selectedProposal}
                        onClick={() => handleSlotClick(slot, 'position')}
                        highlight={
                          !!selectedProposal &&
                          (selectedProposal.type === 'position' ||
                            selectedProposal.type === 'unified')
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xxs font-bold text-muted-foreground/70 mb-1 uppercase">
                {t('flow.present', 'Present')}
              </div>
              <div className="flex items-center justify-center px-2 py-1">
                <PlaceDropZone
                  slot={0}
                  type="position"
                  label="N"
                  filled={isSlotFilled(0, 'position')}
                  filledContent={getPlacedContent(0, 'position')}
                  disabled={snapshot.phase !== 'placement' || !selectedProposal}
                  onClick={() => handleSlotClick(0, 'position')}
                  highlight={
                    !!selectedProposal &&
                    (selectedProposal.type === 'position' || selectedProposal.type === 'unified')
                  }
                />
              </div>
            </div>
            <div />
          </div>
        )}

        {hasAudio && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end">
            <div className="flex items-end gap-2 justify-self-end">
              <span className="text-3xs font-bold text-audio uppercase tracking-wide whitespace-nowrap mb-4">
                {t('game.modality.audio', 'Audio')}
              </span>
              {pastSlots.length > 0 && (
                <div className="flex flex-col items-center">
                  <div className="text-xxs font-bold text-muted-foreground/70 mb-1 uppercase">
                    {t('flow.past', 'Past')}
                  </div>
                  <div className="flex items-center gap-2 bg-secondary/40 rounded-2xl px-2 py-1">
                    {[...pastSlots].reverse().map((slot) => (
                      <PlaceDropZone
                        key={`audio-${slot}`}
                        slot={slot}
                        type="audio"
                        label={`N-${slot}`}
                        filled={isSlotFilled(slot, 'audio')}
                        filledContent={getPlacedContent(slot, 'audio')}
                        disabled={snapshot.phase !== 'placement' || !selectedProposal}
                        onClick={() => handleSlotClick(slot, 'audio')}
                        highlight={
                          !!selectedProposal &&
                          (selectedProposal.type === 'audio' || selectedProposal.type === 'unified')
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xxs font-bold text-muted-foreground/70 mb-1 uppercase">
                {t('flow.present', 'Present')}
              </div>
              <div className="flex items-center justify-center px-2 py-1">
                <PlaceDropZone
                  slot={0}
                  type="audio"
                  label="N"
                  filled={isSlotFilled(0, 'audio')}
                  filledContent={getPlacedContent(0, 'audio')}
                  disabled={snapshot.phase !== 'placement' || !selectedProposal}
                  onClick={() => handleSlotClick(0, 'audio')}
                  highlight={
                    !!selectedProposal &&
                    (selectedProposal.type === 'audio' || selectedProposal.type === 'unified')
                  }
                />
              </div>
            </div>
            <div />
          </div>
        )}
      </div>

      {/* Grid area */}
      <div
        className="flex items-center justify-center overflow-visible select-none"
        style={{ gridArea: 'grid' }}
      >
        <div className="relative w-full max-w-[min(95vw,400px)] [@media(max-height:700px)]:max-w-[min(85vw,340px)]">
          <Grid
            activePosition={hasPosition ? gridPosition : null}
            showStimulus={hasPosition && showStimulus}
            hideCross={snapshot.phase === 'placement'}
            className="shadow-md rounded-2xl"
          />

          {(!hasPosition || snapshot.phase === 'placement') && (
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
                      w-14 h-14 rounded-xl shadow-md flex items-center justify-center cursor-pointer transition-all
                      ${proposal.type === 'position' ? 'bg-blue-50 border-2 border-visual' : proposal.type === 'audio' ? 'bg-green-50 border-2 border-audio' : 'bg-violet-50 border-2 border-violet-400'}
                      ${selectedProposal?.id === proposal.id ? 'ring-4 ring-primary scale-110' : 'hover:scale-105'}
                    `}
                  >
                    {proposal.type === 'position' ? (
                      <MiniGrid position={proposal.value as number} />
                    ) : proposal.type === 'audio' ? (
                      <span className="font-bold text-audio text-lg">{proposal.value}</span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <MiniGrid position={proposal.position} />
                        <span className="font-bold text-violet-600 text-xs">{proposal.sound}</span>
                      </div>
                    )}
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

          {inFlightDrags.map((drag) => (
            <AnimatedCard key={drag.proposalId} drag={drag} />
          ))}
        </div>
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
