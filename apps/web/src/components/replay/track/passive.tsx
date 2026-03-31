import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowCounterClockwise, House, Pause, Play } from '@phosphor-icons/react';
import {
  type TrackReplayData,
  type TrackReplayTrialData,
  projectTrackReplaySnapshot,
  projectTrackSnapshot,
} from '@neurodual/logic';
import { Button, CanvasWeave, useReplayState } from '@neurodual/ui';

interface TrackReplayViewProps {
  replayData: TrackReplayData;
  currentTimeMs: number;
}

const TRACK_IDENTITY_REPLAY_COLORS = {
  red: 'rgba(248, 113, 113, 0.88)',
  green: 'rgba(74, 222, 128, 0.88)',
  blue: 'rgba(96, 165, 250, 0.88)',
  yellow: 'rgba(250, 204, 21, 0.9)',
  purple: 'rgba(192, 132, 252, 0.88)',
} as const;

type TrackReplayIdentityColorId = keyof typeof TRACK_IDENTITY_REPLAY_COLORS;

function getTrackReplayIdentityColor(colorId: TrackReplayIdentityColorId): string {
  return TRACK_IDENTITY_REPLAY_COLORS[colorId];
}

function findPromptColorForIndex(
  indices: readonly number[],
  identityPromptColorIds: TrackReplayTrialData['identityPromptColorIds'],
  targetIndex: number,
): string | null {
  if (!identityPromptColorIds || identityPromptColorIds.length === 0) return null;
  const promptIndex = indices.indexOf(targetIndex);
  if (promptIndex < 0) return null;
  const colorId = identityPromptColorIds[promptIndex];
  return colorId ? getTrackReplayIdentityColor(colorId) : null;
}

function findPromptLetterForIndex(
  indices: readonly number[],
  identityPromptLetters: TrackReplayTrialData['identityPromptLetters'],
  targetIndex: number,
): string | null {
  if (!identityPromptLetters || identityPromptLetters.length === 0) return null;
  const promptIndex = indices.indexOf(targetIndex);
  if (promptIndex < 0) return null;
  return identityPromptLetters[promptIndex] ?? null;
}

function renderBallColor(
  index: number,
  trial: TrackReplayTrialData,
  phase: 'idle' | 'highlight' | 'tracking' | 'selection' | 'finished',
): string {
  if (trial.identityPromptColorIds?.length) {
    if (phase === 'highlight') {
      return (
        findPromptColorForIndex(trial.targetIndices, trial.identityPromptColorIds, index) ??
        'rgba(148, 163, 184, 0.76)'
      );
    }

    if (phase === 'selection') {
      return (
        findPromptColorForIndex(trial.selectedIndices, trial.identityPromptColorIds, index) ??
        'rgba(148, 163, 184, 0.76)'
      );
    }
  }

  if (trial.identityPromptLetters?.length) {
    if (phase === 'highlight') {
      return findPromptLetterForIndex(trial.targetIndices, trial.identityPromptLetters, index)
        ? 'rgba(15, 23, 42, 0.9)'
        : 'rgba(148, 163, 184, 0.76)';
    }

    if (phase === 'selection') {
      return findPromptLetterForIndex(trial.selectedIndices, trial.identityPromptLetters, index)
        ? 'rgba(8, 47, 73, 0.92)'
        : 'rgba(148, 163, 184, 0.76)';
    }
  }

  const isTarget = trial.targetIndices.includes(index);
  const isSelected = trial.selectedIndices.includes(index);
  if (isSelected && isTarget) return 'rgba(34, 197, 94, 0.85)';
  if (isSelected && !isTarget) return 'rgba(248, 113, 113, 0.85)';
  if (isTarget) return 'rgba(14, 165, 233, 0.8)';
  return 'rgba(148, 163, 184, 0.76)';
}

function renderBallLabel(
  index: number,
  _trial: TrackReplayTrialData,
  _phase: 'idle' | 'highlight' | 'tracking' | 'selection' | 'finished',
): string {
  return `${index + 1}`;
}

function createReplayNumberFormatters(language: string) {
  const integer = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  return {
    integer: (value: number | null | undefined) =>
      typeof value === 'number' && Number.isFinite(value) ? integer.format(Math.round(value)) : '—',
  };
}

export function TrackReplayView({ replayData, currentTimeMs }: TrackReplayViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, togglePlayPause, seek, progress } = useReplayState();
  const { integer } = useMemo(() => createReplayNumberFormatters(i18n.language), [i18n.language]);
  const isPlaying = status === 'playing';
  const snapshot = useMemo(
    () => projectTrackSnapshot(replayData, currentTimeMs),
    [currentTimeMs, replayData],
  );
  const trial = snapshot.currentTrial;
  const replaySnapshot = useMemo(() => {
    if (!trial) return null;
    return projectTrackReplaySnapshot(
      {
        arenaWidthPx: trial.arenaWidthPx,
        arenaHeightPx: trial.arenaHeightPx,
        trackingDurationMs: replayData.config.trackingDurationMs,
        crowdingThresholdPx: replayData.config.crowdingThresholdPx,
        initialObjects: trial.initialObjects,
      },
      snapshot.phase === 'tracking' || snapshot.phase === 'selection' ? snapshot.trackingTimeMs : 0,
    );
  }, [
    replayData.config.crowdingThresholdPx,
    replayData.config.trackingDurationMs,
    snapshot.phase,
    snapshot.trackingTimeMs,
    trial,
  ]);

  const arenaWidth = trial?.arenaWidthPx ?? 820;
  const arenaHeight = trial?.arenaHeightPx ?? 560;
  const viewWidth = 720;
  const viewHeight = 420;
  const scaleX = viewWidth / Math.max(1, arenaWidth);
  const scaleY = viewHeight / Math.max(1, arenaHeight);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.06),transparent_38%)]">
      <div className="shrink-0 px-4 pt-4">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 rounded-3xl border border-woven-border/60 bg-woven-surface/70 px-4 py-3 shadow-sm backdrop-blur-xl">
          <CanvasWeave lineCount={10} rounded="2xl" opacity={0.04} />
          <div className="relative z-10 rounded-full bg-cyan-500/12 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            {t('report.dualTrack.replayTitle', 'Dual Track Replay')}
          </div>
          <div className="relative z-10 rounded-full bg-woven-bg px-3 py-1.5 text-sm font-bold text-woven-text">
            {t('report.dualTrack.replayTrialCounter', 'Trial {{current}} / {{total}}', {
              current: integer((trial?.trialIndex ?? 0) + 1),
              total: integer(replayData.totalTrials),
            })}
          </div>
          <div className="relative z-10 rounded-full bg-woven-bg px-3 py-1.5 text-sm font-bold text-woven-text">
            {integer(snapshot.accuracy * 100)}%
          </div>
          <div className="relative z-10 ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={togglePlayPause}
              className="rounded-full"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => seek(0)} className="rounded-full">
              <ArrowCounterClockwise size={14} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/stats')}
              className="rounded-full"
            >
              <House size={14} />
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-3 w-full max-w-5xl">
          <input
            type="range"
            min={0}
            max={replayData.totalDurationMs}
            step={Math.max(16, Math.round(replayData.totalDurationMs / 200))}
            value={currentTimeMs}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            className="w-full accent-cyan-500"
          />
          <div className="mt-1 flex justify-between text-[11px] text-woven-text-muted">
            <span>{integer(progress * 100)}%</span>
            <span>{t(`report.dualTrack.replayPhase.${snapshot.phase}`, snapshot.phase)}</span>
            <span>
              {t('report.dualTrack.msValue', '{{value}} ms', { value: integer(currentTimeMs) })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4 pt-3">
        <div className="mx-auto grid h-full w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-0 rounded-[2rem] border border-woven-border/60 bg-woven-surface/55 p-4 shadow-sm backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-woven-text-muted">
              <span>{t('report.dualTrack.trackingProfile', 'Tracking profile')}</span>
              <span>
                {trial
                  ? `${integer(trial.targetCount)}/${integer(trial.totalObjects)}`
                  : t('common.loading', 'Loading')}
              </span>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-woven-border/50 bg-slate-950/[0.04]">
              <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-full w-full">
                <rect
                  x="0"
                  y="0"
                  width={viewWidth}
                  height={viewHeight}
                  fill="rgba(15, 23, 42, 0.04)"
                />
                {replaySnapshot?.crowdedPairs.map(([a, b]) => {
                  const first = replaySnapshot.objects[a];
                  const second = replaySnapshot.objects[b];
                  if (!first || !second) return null;
                  return (
                    <line
                      key={`pair-${a}-${b}`}
                      x1={first.x * scaleX}
                      y1={first.y * scaleY}
                      x2={second.x * scaleX}
                      y2={second.y * scaleY}
                      stroke="rgba(245, 158, 11, 0.8)"
                      strokeWidth="3"
                      strokeDasharray="6 4"
                    />
                  );
                })}
                {replaySnapshot?.objects.map((object, index) => {
                  if (!trial) return null;
                  const crowded = replaySnapshot.crowdedObjectIds.includes(index);
                  return (
                    <g key={`ball-${index}`}>
                      <circle
                        cx={object.x * scaleX}
                        cy={object.y * scaleY}
                        r={crowded ? 14 : 11}
                        fill={renderBallColor(index, trial, snapshot.phase)}
                        stroke={crowded ? 'rgba(245, 158, 11, 0.95)' : 'rgba(255,255,255,0.8)'}
                        strokeWidth={crowded ? 3 : 1.5}
                      />
                      <text
                        x={object.x * scaleX}
                        y={object.y * scaleY + 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="800"
                        fill="white"
                      >
                        {renderBallLabel(index, trial, snapshot.phase)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="space-y-3 overflow-auto rounded-[2rem] border border-woven-border/60 bg-woven-surface/55 p-4 shadow-sm backdrop-blur-xl">
            <div className="rounded-2xl bg-woven-bg px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                {t('report.dualTrack.replayPhaseLabel', 'Phase')}
              </div>
              <div className="mt-1 text-lg font-black capitalize text-woven-text">
                {t(`report.dualTrack.replayPhase.${snapshot.phase}`, snapshot.phase)}
              </div>
            </div>
            <div className="rounded-2xl bg-woven-bg px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                {t('report.dualTrack.seed', 'Seed')}
              </div>
              <div className="mt-1 break-all text-sm font-semibold text-woven-text">
                {trial?.trialSeed ?? '—'}
              </div>
            </div>
            <div className="rounded-2xl bg-woven-bg px-3 py-3 text-sm text-woven-text-muted">
              <div className="flex items-center justify-between">
                <span>{t('report.dualTrack.crowdingEvents', 'Crowding events')}</span>
                <span className="font-bold text-woven-text">
                  {integer(trial?.crowdingEvents ?? 0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>{t('report.dualTrack.minDistance', 'Min distance')}</span>
                <span className="font-bold text-woven-text">
                  {trial
                    ? t('report.dualTrack.pxValue', '{{value}} px', {
                        value: integer(trial.minInterObjectDistancePx),
                      })
                    : '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>{t('report.dualTrack.response', 'Response')}</span>
                <span className="font-bold text-woven-text">
                  {trial
                    ? t('report.dualTrack.msValue', '{{value}} ms', {
                        value: integer(trial.responseTimeMs),
                      })
                    : '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>{t('report.dualTrack.trackingTimeShort', 'Tracking')}</span>
                <span className="font-bold text-woven-text">
                  {t('report.dualTrack.msValue', '{{value}} ms', {
                    value: integer(snapshot.trackingTimeMs),
                  })}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-woven-bg px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                {t('stats.replay.targets')}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trial?.targetIndices.map((index) => {
                  const promptColor = findPromptColorForIndex(
                    trial.targetIndices,
                    trial.identityPromptColorIds,
                    index,
                  );
                  const promptLetter = findPromptLetterForIndex(
                    trial.targetIndices,
                    trial.identityPromptLetters,
                    index,
                  );

                  return (
                    <span
                      key={`target-${index}`}
                      className="rounded-full px-2 py-1 text-[11px] font-bold"
                      style={{
                        backgroundColor:
                          promptColor ??
                          (promptLetter ? 'rgba(15, 23, 42, 0.9)' : 'rgba(6, 182, 212, 0.12)'),
                        color: promptColor
                          ? 'rgba(15, 23, 42, 0.92)'
                          : promptLetter
                            ? 'rgba(248, 250, 252, 0.96)'
                            : 'rgb(14, 116, 144)',
                      }}
                    >
                      {promptLetter ? `${promptLetter} · ${index + 1}` : index + 1}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl bg-woven-bg px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                {t('stats.replay.selected')}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trial?.selectedIndices.map((index) => {
                  const promptColor = findPromptColorForIndex(
                    trial.selectedIndices,
                    trial.identityPromptColorIds,
                    index,
                  );
                  const promptLetter = findPromptLetterForIndex(
                    trial.selectedIndices,
                    trial.identityPromptLetters,
                    index,
                  );

                  return (
                    <span
                      key={`selected-${index}`}
                      className="rounded-full px-2 py-1 text-[11px] font-bold"
                      style={{
                        backgroundColor:
                          promptColor ??
                          (promptLetter ? 'rgba(8, 47, 73, 0.92)' : 'rgba(34, 197, 94, 0.12)'),
                        color: promptColor
                          ? 'rgba(15, 23, 42, 0.92)'
                          : promptLetter
                            ? 'rgba(248, 250, 252, 0.96)'
                            : 'rgb(4, 120, 87)',
                      }}
                    >
                      {promptLetter ? `${promptLetter} · ${index + 1}` : index + 1}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
