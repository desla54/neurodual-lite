/**
 * Passive Recall (Memo) Replay View
 * Read-only visualization of a recall session
 */

import { useMemo } from 'react';
import { type MemoReplayData, projectMemoSnapshot } from '@neurodual/logic';
import { Grid, PlaceDropZone } from '@neurodual/ui';
import { MiniGrid, MiniLetter } from '../shared/mini-components';

interface MemoReplayViewProps {
  replayData: MemoReplayData;
  currentTimeMs: number;
}

export function MemoReplayView({ replayData, currentTimeMs }: MemoReplayViewProps) {
  const snapshot = useMemo(
    () => projectMemoSnapshot(replayData, currentTimeMs),
    [replayData, currentTimeMs],
  );

  const gridPosition = useMemo(() => {
    if (snapshot.phase === 'stimulus' && snapshot.stimulus) {
      return snapshot.stimulus.position;
    }
    return null;
  }, [snapshot.phase, snapshot.stimulus]);

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

  const showStimulus = snapshot.phase === 'stimulus';

  return (
    <div className="h-full flex flex-col px-4 overflow-hidden">
      {/* HUD */}
      <div className="shrink-0 flex flex-col items-center pt-4 lg:pt-2">
        <div
          className="relative flex items-center gap-2 bg-woven-surface p-2 px-3 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] border border-woven-border overflow-hidden"
          data-testid="memo-replay-hud"
        >
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-visual/10 text-visual text-xs font-bold uppercase">
            N-{snapshot.nLevel}
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
      </div>

      {/* Timeline (past dists) */}
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

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center">
        <Grid activePosition={gridPosition} showStimulus={showStimulus} />
      </div>

      {/* Current slot (N) */}
      {snapshot.phase === 'recall' && (
        <div className="flex justify-center gap-2">
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
  );
}
