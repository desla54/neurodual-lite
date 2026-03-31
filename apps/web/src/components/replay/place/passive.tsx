/**
 * Passive Flow Replay View
 * Read-only visualization of a flow session with timeline slots
 */

import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type PlaceReplayData,
  projectPlaceSnapshot,
  getPlaceInFlightDragsAtTime,
} from '@neurodual/logic';
import { Grid, PlaceDropZone } from '@neurodual/ui';
import { MiniGrid, MiniLetter, AnimatedCard } from '../shared/mini-components';

interface PlaceReplayViewProps {
  replayData: PlaceReplayData;
  currentTimeMs: number;
}

export function PlaceReplayView({ replayData, currentTimeMs }: PlaceReplayViewProps) {
  const { t } = useTranslation();
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Get active modalities from session config
  const activeModalities = replayData.config.activeModalities;
  const hasPosition = activeModalities.includes('position');
  const hasAudio = activeModalities.includes('audio');

  // Project snapshot at current time
  const snapshot = useMemo(
    () => projectPlaceSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Get in-flight drags for animation
  const inFlightDrags = useMemo(
    () => getPlaceInFlightDragsAtTime(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  // Determine grid position based on phase
  const gridPosition = useMemo(() => {
    if (snapshot.phase === 'stimulus' && snapshot.stimulus) {
      return snapshot.stimulus.position;
    }
    return null;
  }, [snapshot.phase, snapshot.stimulus]);

  // Build timeline slots
  const nLevel = snapshot.nLevel;
  const windowSize = Math.min(snapshot.trialIndex + 1, nLevel + 1);
  const slots = Array.from({ length: windowSize }, (_, i) => i);
  const pastSlots = slots.filter((s) => s > 0).sort((a, b) => b - a);

  // Get placed content for a slot - reconstruct from history
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

  const showStimulus = snapshot.phase === 'stimulus';

  // Get unplaced proposals that are NOT currently being dragged
  const unplacedProposals = useMemo(() => {
    if (snapshot.phase !== 'placement') return [];
    const placedIds = new Set(snapshot.placedProposals.keys());
    const inFlightIds = new Set(inFlightDrags.map((d) => d.proposalId));
    return snapshot.proposals.filter((p) => !placedIds.has(p.id) && !inFlightIds.has(p.id));
  }, [snapshot.phase, snapshot.proposals, snapshot.placedProposals, inFlightDrags]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* HUD */}
      <div className="shrink-0 flex flex-col items-center pt-2">
        <div
          className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
          data-testid="flow-replay-hud"
        >
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase">
            N-{nLevel}
          </div>
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text flex items-center gap-1">
            {String(snapshot.trialIndex + 1).padStart(2, '0')}
            <span className="text-woven-text-muted"> / </span>
            {String(snapshot.totalTrials).padStart(2, '0')}
          </div>
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
            {Math.round(snapshot.stats.accuracy * 100)}%
          </div>
        </div>

        {/* Timeline rows */}
        <div className="w-full flex flex-col gap-2 mt-3">
          {hasPosition && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end">
              <div className="flex items-end gap-2 justify-self-end">
                <span className="text-3xs font-bold text-visual uppercase tracking-wide whitespace-nowrap mb-4">
                  {t('common.position')}
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
                          disabled
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
                    disabled
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
                  {t('common.audio')}
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
                          disabled
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
                    disabled
                  />
                </div>
              </div>
              <div />
            </div>
          )}
        </div>
      </div>

      {/* Grid area */}
      <div
        ref={gridContainerRef}
        className="flex-1 flex flex-col items-center justify-center min-h-0 p-2 overflow-visible relative"
      >
        <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[440px]">
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
                  <div
                    key={proposal.id}
                    className={`
                      w-14 h-14 rounded-xl shadow-md flex items-center justify-center
                      ${proposal.type === 'position' ? 'bg-blue-50 border-2 border-visual' : proposal.type === 'audio' ? 'bg-green-50 border-2 border-audio' : 'bg-violet-50 border-2 border-violet-400'}
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {inFlightDrags.map((drag) => (
          <AnimatedCard key={drag.proposalId} drag={drag} />
        ))}
      </div>
    </div>
  );
}
