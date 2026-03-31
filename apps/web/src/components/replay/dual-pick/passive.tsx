/**
 * Passive DualPick (Dual Pick) Replay View
 * Read-only visualization of a dual-pick session
 */

import { useMemo } from 'react';
import {
  type DualPickReplayData,
  projectDualPickSnapshot,
  getDualPickInFlightDragsAtTime,
} from '@neurodual/logic';
import { Grid, PlaceDropZone, CanvasWeave } from '@neurodual/ui';
import { AnimatedCard } from '../shared/mini-components';

interface DualPickReplayViewProps {
  replayData: DualPickReplayData;
  currentTimeMs: number;
}

export function DualPickReplayView({ replayData, currentTimeMs }: DualPickReplayViewProps) {
  const snapshot = useMemo(
    () => projectDualPickSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

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

  const showStimulus = snapshot.phase === 'stimulus';

  const unplacedProposals = useMemo(() => {
    if (snapshot.phase !== 'placement') return [];
    const inFlightIds = new Set(inFlightDrags.map((d) => d.proposalId));
    return snapshot.proposals.filter((p) => !inFlightIds.has(p.id));
  }, [snapshot.phase, snapshot.proposals, inFlightDrags]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* HUD */}
      <div className="shrink-0 flex flex-col items-center pt-2">
        <div
          className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
          data-testid="dual-pick-replay-hud"
        >
          <CanvasWeave lineCount={8} rounded="full" />
          <div className="relative z-10 h-10 px-3 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase flex items-center">
            N-{nLevel}
          </div>
          <div className="relative z-10 h-10 px-3 rounded-full bg-woven-cell-rest font-mono text-sm font-bold text-woven-text flex items-center gap-1">
            {String(snapshot.trialIndex + 1).padStart(2, '0')}
            <span className="text-woven-text-muted"> / </span>
            {String(snapshot.totalTrials).padStart(2, '0')}
          </div>
          <div className="relative z-10 h-10 px-3 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center">
            {Math.round(snapshot.stats.accuracy * 100)}%
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="shrink-0 pt-4">
        {pastSlots.length > 0 && (
          <div className="flex justify-center gap-4 mb-2">
            {pastSlots.map((slot) => (
              <div key={slot} className="flex gap-2">
                {snapshot.activeModalities.includes('position') && (
                  <PlaceDropZone
                    slot={slot}
                    type="position"
                    label={`N-${slot}`}
                    filled={isSlotFilled(slot, 'position')}
                    filledContent={getPlacedContent(slot, 'position')}
                    disabled
                  />
                )}
                {snapshot.activeModalities.includes('audio') && (
                  <PlaceDropZone
                    slot={slot}
                    type="audio"
                    label={`N-${slot}`}
                    filled={isSlotFilled(slot, 'audio')}
                    filledContent={getPlacedContent(slot, 'audio')}
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-center gap-2">
          {snapshot.activeModalities.includes('position') && (
            <PlaceDropZone
              slot={0}
              type="position"
              label="N"
              filled={isSlotFilled(0, 'position')}
              filledContent={getPlacedContent(0, 'position')}
              disabled
            />
          )}
          {snapshot.activeModalities.includes('audio') && (
            <PlaceDropZone
              slot={0}
              type="audio"
              label="N"
              filled={isSlotFilled(0, 'audio')}
              filledContent={getPlacedContent(0, 'audio')}
              disabled
            />
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <Grid activePosition={gridPosition} showStimulus={showStimulus} />
      </div>

      {/* Proposals */}
      {snapshot.phase === 'placement' && (
        <div className="shrink-0 pb-6">
          <div className="flex justify-center gap-3 flex-wrap">
            {unplacedProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-woven-border bg-woven-surface flex items-center justify-center opacity-60"
              >
                <span className="text-sm font-bold text-woven-text">{proposal.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-flight drags */}
      {inFlightDrags.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {inFlightDrags.map((drag) => (
            <AnimatedCard key={drag.proposalId} drag={drag} />
          ))}
        </div>
      )}
    </div>
  );
}
