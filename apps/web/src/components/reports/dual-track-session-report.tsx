import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  analyzeTrackReplay,
  buildDualTrackJourneyDisplay,
  computeProgressionIndicatorModel,
  getModalityColor,
  getModalityFamily,
  getModalityLabelInfo,
  isHexColor,
  projectTrackReplaySnapshot,
} from '@neurodual/logic';
import type { SessionEndReportModel, TrackDetails, TrackTurnDetail } from '@neurodual/logic';
import {
  ArrowClockwise,
  ChartBar,
  ChartLine,
  House,
  ListChecks,
  Play,
  Timer,
  Eye,
} from '@phosphor-icons/react';
import { cn, Disclosure, Hatching, InfoSheet, SubCard } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface DualTrackSessionReportProps {
  readonly report: SessionEndReportModel;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onGoToStats?: () => void;
  readonly onGoToReplay?: () => void;
  readonly onGoToJourneyStage?: (stageId: number, nLevel: number) => void;
  readonly hideRestartAction?: boolean;
}

interface TrackTurnView {
  readonly index: number;
  readonly verdict: 'correct' | 'partial' | 'incorrect' | 'no-action' | 'skipped';
  readonly correctCount: number;
  readonly targetCount: number;
  readonly falseAlarms: number;
  readonly misses: number;
  readonly responseTimeMs: number;
  readonly crowdingEvents: number;
  readonly minInterObjectDistancePx?: number;
  readonly targetIndices: readonly number[];
  readonly selectedIndices: readonly number[];
  readonly trialSeed?: string;
  readonly arenaWidthPx?: number;
  readonly arenaHeightPx?: number;
  readonly initialObjects?: TrackTurnDetail['initialObjects'];
}

function toPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  if ((value ?? 0) <= 1) return Math.round((value ?? 0) * 100);
  return Math.round(value ?? 0);
}

function formatObjectIndex(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function createTrackNumberFormatters(language: string) {
  const integer = new Intl.NumberFormat(language, {
    maximumFractionDigits: 0,
  });
  const decimal = new Intl.NumberFormat(language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return {
    integer: (value: number | null | undefined) =>
      typeof value === 'number' && Number.isFinite(value) ? integer.format(Math.round(value)) : '—',
    decimal: (value: number | null | undefined) =>
      typeof value === 'number' && Number.isFinite(value) ? decimal.format(value) : '—',
  };
}

interface TrackTrialInspectorProps {
  readonly turn: TrackTurnView;
  readonly trackingDurationMs: number;
  readonly crowdingThresholdPx?: number;
}

function TrackTrialInspector({
  turn,
  trackingDurationMs,
  crowdingThresholdPx,
}: TrackTrialInspectorProps): ReactNode {
  const { t, i18n } = useTranslation();
  const [timeMs, setTimeMs] = useState(0);
  const { integer } = useMemo(() => createTrackNumberFormatters(i18n.language), [i18n.language]);
  const canInspect =
    typeof turn.arenaWidthPx === 'number' &&
    typeof turn.arenaHeightPx === 'number' &&
    Array.isArray(turn.initialObjects) &&
    turn.initialObjects.length > 0 &&
    typeof crowdingThresholdPx === 'number' &&
    crowdingThresholdPx > 0 &&
    trackingDurationMs > 0;

  const analysis = useMemo(() => {
    if (!canInspect) return null;
    return analyzeTrackReplay({
      arenaWidthPx: turn.arenaWidthPx as number,
      arenaHeightPx: turn.arenaHeightPx as number,
      trackingDurationMs,
      crowdingThresholdPx: crowdingThresholdPx as number,
      initialObjects: turn.initialObjects ?? [],
    });
  }, [
    canInspect,
    crowdingThresholdPx,
    trackingDurationMs,
    turn.arenaHeightPx,
    turn.arenaWidthPx,
    turn.initialObjects,
  ]);

  const snapshot = useMemo(() => {
    if (!canInspect) return null;
    return projectTrackReplaySnapshot(
      {
        arenaWidthPx: turn.arenaWidthPx as number,
        arenaHeightPx: turn.arenaHeightPx as number,
        trackingDurationMs,
        crowdingThresholdPx: crowdingThresholdPx as number,
        initialObjects: turn.initialObjects ?? [],
      },
      timeMs,
    );
  }, [
    canInspect,
    crowdingThresholdPx,
    timeMs,
    trackingDurationMs,
    turn.arenaHeightPx,
    turn.arenaWidthPx,
    turn.initialObjects,
  ]);

  if (!canInspect || !analysis || !snapshot) return null;

  const viewWidth = 260;
  const viewHeight = 170;
  const scaleX = viewWidth / Math.max(1, turn.arenaWidthPx ?? viewWidth);
  const scaleY = viewHeight / Math.max(1, turn.arenaHeightPx ?? viewHeight);

  return (
    <div className="mt-3 rounded-xl border border-woven-border/60 bg-woven-bg/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
            {t('report.dualTrack.inspector', 'MOT inspector')}
          </div>
          <div className="text-xs text-woven-text-muted">
            {turn.trialSeed
              ? t('report.dualTrack.seedValue', 'Seed {{value}}', {
                  value: turn.trialSeed.slice(0, 8),
                })
              : t('report.dualTrack.replayReady', 'Replay-ready trial')}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
            {t('report.dualTrack.time', 'Time')}
          </div>
          <div className="text-sm font-bold text-woven-text">
            {t('report.dualTrack.msValue', '{{value}} ms', { value: integer(timeMs) })}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-woven-border/50 bg-woven-surface/70 p-2">
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-auto w-full">
          <rect
            x="0"
            y="0"
            width={viewWidth}
            height={viewHeight}
            rx="16"
            fill="rgba(148, 163, 184, 0.06)"
          />
          {snapshot.crowdedPairs.map(([a, b]) => {
            const first = snapshot.objects[a];
            const second = snapshot.objects[b];
            if (!first || !second) return null;
            return (
              <line
                key={`pair-${a}-${b}`}
                x1={first.x * scaleX}
                y1={first.y * scaleY}
                x2={second.x * scaleX}
                y2={second.y * scaleY}
                stroke="rgba(245, 158, 11, 0.75)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            );
          })}
          {snapshot.objects.map((object, index) => {
            const isTarget = turn.targetIndices.includes(index);
            const isSelected = turn.selectedIndices.includes(index);
            const isCrowded = snapshot.crowdedObjectIds.includes(index);
            const fill = isSelected
              ? isTarget
                ? 'rgba(34, 197, 94, 0.8)'
                : 'rgba(248, 113, 113, 0.85)'
              : 'rgba(148, 163, 184, 0.72)';
            const stroke = isTarget ? 'rgba(34, 197, 94, 0.95)' : 'rgba(226, 232, 240, 0.8)';
            return (
              <g key={`obj-${index}`}>
                <circle
                  cx={object.x * scaleX}
                  cy={object.y * scaleY}
                  r={isCrowded ? 9 : 7}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCrowded ? 2.5 : 1.5}
                />
                <text
                  x={object.x * scaleX}
                  y={object.y * scaleY + 3}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="700"
                  fill="white"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <input
        type="range"
        min={0}
        max={trackingDurationMs}
        step={Math.max(16, Math.round(trackingDurationMs / 100))}
        value={timeMs}
        onChange={(event) => setTimeMs(Number(event.currentTarget.value))}
        className="mt-3 w-full accent-cyan-500"
      />

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-woven-text-muted">
        <div className="rounded-lg bg-woven-surface/80 px-2.5 py-2">
          {t('report.dualTrack.episodes', 'Episodes')}:{' '}
          <span className="font-bold text-woven-text">{integer(analysis.episodeCount)}</span>
        </div>
        <div className="rounded-lg bg-woven-surface/80 px-2.5 py-2">
          {t('report.dualTrack.timeCrowded', 'Time crowded')}:{' '}
          <span className="font-bold text-woven-text">
            {t('report.dualTrack.msValue', '{{value}} ms', {
              value: integer(analysis.timeUnderCrowdingThresholdMs),
            })}
          </span>
        </div>
        <div className="rounded-lg bg-woven-surface/80 px-2.5 py-2">
          {t('report.dualTrack.peakPairs', 'Peak pairs')}:{' '}
          <span className="font-bold text-woven-text">{integer(analysis.peakPairCount)}</span>
        </div>
        <div className="rounded-lg bg-woven-surface/80 px-2.5 py-2">
          {t('report.dualTrack.minDistanceShort', 'Min dist')}:{' '}
          <span className="font-bold text-woven-text">
            {t('report.dualTrack.pxValue', '{{value}} px', {
              value: integer(analysis.minDistancePx),
            })}
          </span>
        </div>
      </div>

      {analysis.episodes.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {analysis.episodes.slice(0, 3).map((episode, index) => (
            <div
              key={`episode-${index}`}
              className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-2 text-[11px] text-woven-text-muted"
            >
              {t(
                'report.dualTrack.episodeSummary',
                'Episode {{index}}: {{start}}-{{end}} ms · {{duration}} ms · min {{distance}} px',
                {
                  index: integer(index + 1),
                  start: integer(episode.startMs),
                  end: integer(episode.endMs),
                  duration: integer(episode.durationMs),
                  distance: integer(episode.minDistancePx),
                },
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DualTrackSessionReport({
  report,
  onPlayAgain,
  onBackToHome,
  onGoToStats,
  onGoToReplay,
  onGoToJourneyStage,
  hideRestartAction = false,
}: DualTrackSessionReportProps): ReactNode {
  const { t, i18n } = useTranslation();
  const { integer, decimal } = useMemo(
    () => createTrackNumberFormatters(i18n.language),
    [i18n.language],
  );
  const modeDetails =
    report.modeDetails?.kind === 'track' ? (report.modeDetails as TrackDetails) : null;

  const turns = useMemo<TrackTurnView[]>(() => {
    return (report.turns ?? [])
      .filter(
        (turn): turn is NonNullable<SessionEndReportModel['turns']>[number] =>
          turn.kind === 'track-trial' && turn.detail?.kind === 'track-trial',
      )
      .map((turn) => {
        const detail = turn.detail as TrackTurnDetail;
        return {
          index: turn.index,
          verdict: turn.verdict,
          correctCount: detail.correctCount,
          targetCount: detail.targetCount,
          falseAlarms: detail.falseAlarms,
          misses: detail.misses,
          responseTimeMs: detail.responseTimeMs ?? turn.durationMs ?? 0,
          crowdingEvents: detail.crowdingEvents ?? 0,
          minInterObjectDistancePx: detail.minInterObjectDistancePx,
          targetIndices: detail.targetIndices,
          selectedIndices: detail.selectedIndices,
          trialSeed: detail.trialSeed,
          arenaWidthPx: detail.arenaWidthPx,
          arenaHeightPx: detail.arenaHeightPx,
          initialObjects: detail.initialObjects,
        };
      });
  }, [report.turns]);

  const accuracy = report.modeScore.unit === '%' ? Math.round(report.modeScore.value) : 0;
  const avgRtMs =
    modeDetails?.avgResponseTimeMs ??
    (turns.length > 0
      ? Math.round(turns.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / turns.length)
      : 0);
  const perfectRounds =
    modeDetails?.perfectRounds ??
    turns.filter((turn) => turn.correctCount === turn.targetCount).length;
  const selectionPrecision = toPercent(modeDetails?.selectionPrecision);
  const selectionQuality = toPercent(modeDetails?.selectionQuality);
  const totalObjects = modeDetails?.totalObjects ?? 0;
  const targetCount = modeDetails?.targetCount ?? report.nLevel ?? 0;
  const trackingDurationMs = modeDetails?.trackingDurationMs ?? 0;
  const speedPxPerSec = modeDetails?.speedPxPerSec ?? 0;
  const crowdingThresholdPx = modeDetails?.crowdingThresholdPx;
  const totalCrowdingEvents =
    modeDetails?.totalCrowdingEvents ?? turns.reduce((sum, turn) => sum + turn.crowdingEvents, 0);
  const minInterObjectDistancePx =
    modeDetails?.minInterObjectDistancePx ??
    turns.reduce<number | undefined>((minValue, turn) => {
      if (!Number.isFinite(turn.minInterObjectDistancePx)) return minValue;
      if (minValue === undefined) return turn.minInterObjectDistancePx;
      return Math.min(minValue, turn.minInterObjectDistancePx ?? minValue);
    }, undefined);
  const masteryTargetCountStage = modeDetails?.masteryTargetCountStage;
  const masteryDifficultyTier = modeDetails?.masteryDifficultyTier;
  const masteryTierCount = modeDetails?.masteryTierCount;
  const masteryStageProgressPct = modeDetails?.masteryStageProgressPct;
  const highestCompletedTargetCount = modeDetails?.highestCompletedTargetCount;
  const promotedTargetCount = modeDetails?.promotedTargetCount;
  const nextTargetCountStage = modeDetails?.nextTargetCountStage;
  const nextDifficultyTier = modeDetails?.nextDifficultyTier;
  const performanceBand = modeDetails?.performanceBand;
  const isCalibrationSession = report.gameModeLabel.toLowerCase().includes('calibration');
  const nextJourneyStageId =
    report.journeyContext?.nextPlayableStage ??
    report.journeyContext?.stageId ??
    report.journeyStageId;
  const nextJourneyNLevel = report.journeyContext?.nLevel ?? report.nLevel;
  const handleNextJourneyAction =
    typeof nextJourneyStageId === 'number' && onGoToJourneyStage
      ? () => onGoToJourneyStage(nextJourneyStageId, nextJourneyNLevel)
      : undefined;
  const hasNextJourneyAction = Boolean(handleNextJourneyAction);
  const progressionModel = computeProgressionIndicatorModel(report);
  const journeyProgressionModel = progressionModel?.scope === 'journey' ? progressionModel : null;
  const isJourneySession =
    report.playContext === 'journey' ||
    typeof report.journeyId === 'string' ||
    typeof report.journeyStageId === 'number' ||
    journeyProgressionModel !== null;
  const effectiveJourneyDisplay = isJourneySession
    ? (journeyProgressionModel?.dualTrackJourneyDisplay ??
      buildDualTrackJourneyDisplay(modeDetails))
    : null;
  const isJourneyRegression = effectiveJourneyDisplay?.tierDirection === 'down';
  const journeyTintClass = isJourneyRegression
    ? 'bg-woven-incorrect/[0.12]'
    : 'bg-woven-correct/[0.12]';
  const journeyAccentClass = isJourneyRegression ? 'text-woven-incorrect' : 'text-woven-correct';
  const journeyBarClass = isJourneyRegression ? 'bg-woven-incorrect' : 'bg-woven-correct';
  const currentJourneyTargetCount = masteryTargetCountStage ?? targetCount;
  const nextJourneyTargetCount = nextTargetCountStage ?? currentJourneyTargetCount;
  const currentJourneyTier = effectiveJourneyDisplay
    ? effectiveJourneyDisplay.tierInPhase + 1
    : null;
  const nextJourneyTier = effectiveJourneyDisplay
    ? typeof nextDifficultyTier === 'number'
      ? (nextDifficultyTier % effectiveJourneyDisplay.tiersPerPhase) + 1
      : effectiveJourneyDisplay.promotedTargetCount
        ? 1
        : currentJourneyTier
    : null;
  const journeyPhaseLabel = effectiveJourneyDisplay
    ? effectiveJourneyDisplay.phaseIdentityMode === 'classic'
      ? t('report.dualTrack.phaseTracking', 'Tracking')
      : effectiveJourneyDisplay.phaseIdentityMode === 'audio'
        ? t('report.dualTrack.phaseAudio', 'Tracking + Audio')
        : effectiveJourneyDisplay.phaseIdentityMode === 'color'
          ? t('report.dualTrack.phaseColor', 'Tracking + Couleur')
          : t('report.dualTrack.phaseCombined', 'Tracking + Audio + Couleur')
    : null;
  const remainingJourneyTiers =
    effectiveJourneyDisplay && currentJourneyTier
      ? Math.max(0, effectiveJourneyDisplay.tiersPerPhase - currentJourneyTier)
      : null;
  const remainingAfterNextJourneyTier =
    effectiveJourneyDisplay && nextJourneyTier
      ? Math.max(0, effectiveJourneyDisplay.tiersPerPhase - nextJourneyTier)
      : null;
  const phaseProgressPct =
    effectiveJourneyDisplay && currentJourneyTier
      ? Math.round((currentJourneyTier / effectiveJourneyDisplay.tiersPerPhase) * 100)
      : null;
  const journeyStatusLabel = effectiveJourneyDisplay
    ? effectiveJourneyDisplay.promotedTargetCount
      ? t('report.dualTrack.trackPromoted', 'Niveau suivant débloqué !')
      : isJourneyRegression
        ? t('report.dualTrack.journeyRegression', 'Régression')
        : t('report.dualTrack.journeyProgress', 'Progression')
    : null;
  const tierHelpText = t(
    'report.dualTrack.tierHelp',
    'T = palier de difficulté interne du parcours. Plus le chiffre monte, plus le suivi devient exigeant à ce niveau de cibles.',
  );
  const currentTierHelpText =
    effectiveJourneyDisplay && currentJourneyTier && remainingJourneyTiers !== null
      ? t(
          'report.dualTrack.tierHelpCurrent',
          'T = palier de difficulté interne. Vous êtes actuellement à T{{current}} sur {{total}}. Il reste {{remaining}} palier(s) avant le prochain niveau de cibles.',
          {
            current: currentJourneyTier,
            total: effectiveJourneyDisplay.tiersPerPhase,
            remaining: remainingJourneyTiers,
          },
        )
      : tierHelpText;
  const nextTierHelpText =
    effectiveJourneyDisplay && nextJourneyTier && remainingAfterNextJourneyTier !== null
      ? effectiveJourneyDisplay.promotedTargetCount
        ? t(
            'report.dualTrack.tierHelpReset',
            'Le niveau de cibles suivant vient d être débloqué. Vous repartez sur T{{current}} sur {{total}}, avec {{remaining}} paliers avant le niveau de cibles d après.',
            {
              current: nextJourneyTier,
              total: effectiveJourneyDisplay.tiersPerPhase,
              remaining: remainingAfterNextJourneyTier,
            },
          )
        : t(
            'report.dualTrack.tierHelpNext',
            'Le prochain palier visible sera T{{current}} sur {{total}}. Après celui-ci, il restera {{remaining}} palier(s) avant le prochain niveau de cibles.',
            {
              current: nextJourneyTier,
              total: effectiveJourneyDisplay.tiersPerPhase,
              remaining: remainingAfterNextJourneyTier,
            },
          )
      : tierHelpText;

  const accuracyColor =
    accuracy >= 80
      ? 'text-woven-correct'
      : accuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  return (
    <div className="w-full md:max-w-lg lg:max-w-xl md:mx-auto">
      <Hatching id="dual-track-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="dual-track-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {isCalibrationSession ? report.gameModeLabel : 'Dual Track'}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {isCalibrationSession
                ? t('report.dualTrack.calibrationLabel', 'Level calibration')
                : t('report.dualTrack.trackingControl', 'Tracking control')}
            </p>
            <Hatching id="dual-track-report-hero" className="mt-2 text-foreground/70" />
          </div>

          {isCalibrationSession ? (
            <div className="px-2 mt-4">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-3 py-3 text-sm text-woven-text-muted">
                {t(
                  'report.dualTrack.calibrationDescription',
                  'This session calibrated your starting level before the first journey stage.',
                )}
              </div>
            </div>
          ) : null}

          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.precision')}
                </p>
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                    accuracyColor,
                  )}
                >
                  {accuracy}%
                </span>
              </div>
              <Hatching
                id="dual-track-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.avgRt')}
                </p>
                <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-3xl font-black tabular-nums leading-none text-woven-text sm:text-4xl">
                  {integer(avgRtMs)}
                  <span className="ml-1 text-sm font-semibold tracking-normal text-woven-text-muted sm:text-base">
                    ms
                  </span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="dual-track-report-score-hatch" className="mt-3 text-foreground/70" />

          <div className="px-2 mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.dualTrack.rounds', 'Rounds')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">
                {integer(report.trialsCount)}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.dualTrack.flawless', 'Flawless')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">
                {integer(perfectRounds)}/{integer(report.trialsCount)}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.dualTrack.targets', 'Targets')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">
                {targetCount}/{totalObjects}
              </p>
            </div>
          </div>
          {effectiveJourneyDisplay ? (
            <>
              <div
                data-testid="dual-track-report-journey-card"
                className={cn(
                  '-mx-2 mt-4 overflow-hidden rounded-2xl px-[1px] py-[1px]',
                  journeyTintClass,
                )}
              >
                <div className="px-4 py-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3 text-left">
                      <div>
                        <p className="text-lg font-black tracking-tight text-foreground">
                          {t('report.dualTrack.journeyTitle', 'Parcours Dual Track')}
                        </p>
                      </div>
                      {journeyStatusLabel ? (
                        <p className={cn('text-sm font-bold', journeyAccentClass)}>
                          {journeyStatusLabel}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-woven-text-muted">
                      <div className="rounded-lg bg-woven-bg px-3 py-2">
                        <p className="font-bold uppercase tracking-wide text-woven-text-muted">
                          {t('report.dualTrack.currentTargetLevel', 'Niveau actuel de cible')}
                        </p>
                        <p className="mt-1 text-sm font-black text-woven-text">
                          {t('report.dualTrack.targetsCountLabel', '{{count}} cibles', {
                            count: currentJourneyTargetCount,
                          })}
                        </p>
                        {currentJourneyTier && journeyPhaseLabel ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {journeyPhaseLabel} ·{' '}
                            <span className="inline-flex items-center gap-1 align-middle">
                              {t('report.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                                current: currentJourneyTier,
                                total: effectiveJourneyDisplay.tiersPerPhase,
                              })}
                              <InfoSheet
                                iconSize={10}
                                triggerClassName="text-muted-foreground/70 hover:text-primary"
                              >
                                {currentTierHelpText}
                              </InfoSheet>
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-lg bg-woven-bg px-3 py-2">
                        <p className="font-bold uppercase tracking-wide text-woven-text-muted">
                          {t('report.dualTrack.nextTargetLevel', 'Prochain niveau de cible')}
                        </p>
                        <p className="mt-1 text-sm font-black text-woven-text">
                          {t('report.dualTrack.targetsCountLabel', '{{count}} cibles', {
                            count: nextJourneyTargetCount,
                          })}
                        </p>
                        {nextJourneyTier ? (
                          <p
                            className="mt-1 text-[11px] text-muted-foreground"
                            data-testid="dual-track-report-next-tier"
                          >
                            <span className="inline-flex items-center gap-1 align-middle">
                              {effectiveJourneyDisplay.promotedTargetCount
                                ? t(
                                    'report.dualTrack.nextTierReset',
                                    'Nouveau cycle · T{{current}}/{{total}}',
                                    {
                                      current: nextJourneyTier,
                                      total: effectiveJourneyDisplay.tiersPerPhase,
                                    },
                                  )
                                : t(
                                    'report.dualTrack.nextTierValue',
                                    'Palier suivant · T{{current}}/{{total}}',
                                    {
                                      current: nextJourneyTier,
                                      total: effectiveJourneyDisplay.tiersPerPhase,
                                    },
                                  )}
                              <InfoSheet
                                iconSize={10}
                                triggerClassName="text-muted-foreground/70 hover:text-primary"
                              >
                                {nextTierHelpText}
                              </InfoSheet>
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t(
                            'report.dualTrack.currentLevelProgress',
                            'Progression dans le niveau actuel',
                          )}
                        </span>
                        <span className="tabular-nums">
                          {Math.round(effectiveJourneyDisplay.stageProgressPct)}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-500',
                            journeyBarClass,
                          )}
                          style={{ width: `${effectiveJourneyDisplay.stageProgressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <Hatching id="dual-track-report-progression-hatch" className="text-foreground/70" />
            </>
          ) : null}

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.dualTrack.tierProgression', 'Progression vers le palier suivant')}
              icon={<ChartLine size={18} weight="duotone" className="text-cyan-500" />}
              render={() => (
                <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                  {effectiveJourneyDisplay && currentJourneyTier && nextJourneyTier ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                            {t(
                              'report.dualTrack.phaseProgress',
                              'Avancement dans le niveau actuel',
                            )}
                          </p>
                          <p className="text-lg font-black text-woven-text">
                            {t('report.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                              current: currentJourneyTier,
                              total: effectiveJourneyDisplay.tiersPerPhase,
                            })}
                          </p>
                        </div>
                        {phaseProgressPct !== null ? (
                          <span className="text-2xl font-black tabular-nums text-cyan-500">
                            {integer(phaseProgressPct)}%
                          </span>
                        ) : null}
                      </div>

                      {phaseProgressPct !== null ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-woven-bg">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-[width] duration-500"
                            style={{ width: `${phaseProgressPct}%` }}
                          />
                        </div>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>
                            {t('report.dualTrack.currentTier', 'Palier actuel dans ce niveau')}
                          </span>
                          <span className="inline-flex items-center gap-1 font-bold text-woven-text">
                            {t('report.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                              current: currentJourneyTier,
                              total: effectiveJourneyDisplay.tiersPerPhase,
                            })}
                            <InfoSheet
                              iconSize={10}
                              triggerClassName="text-muted-foreground/70 hover:text-primary"
                            >
                              {currentTierHelpText}
                            </InfoSheet>
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>
                            {t('report.dualTrack.nextTier', 'Palier suivant dans ce niveau')}
                          </span>
                          <span className="inline-flex items-center gap-1 font-bold text-woven-text">
                            {t('report.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                              current: nextJourneyTier,
                              total: effectiveJourneyDisplay.tiersPerPhase,
                            })}
                            <InfoSheet
                              iconSize={10}
                              triggerClassName="text-muted-foreground/70 hover:text-primary"
                            >
                              {nextTierHelpText}
                            </InfoSheet>
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>
                            {t(
                              'report.dualTrack.tiersRemaining',
                              'Paliers restants avant le prochain niveau de cibles',
                            )}
                          </span>
                          <span className="font-bold text-woven-text">
                            {remainingJourneyTiers ?? '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>
                            {t('report.dualTrack.nextTargetLevel', 'Prochain niveau de cibles')}
                          </span>
                          <span className="font-bold text-woven-text">
                            {t('report.dualTrack.targetsCountLabel', '{{count}} targets', {
                              count: nextJourneyTargetCount,
                            })}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                            {t(
                              'report.dualTrack.currentStage',
                              'Niveau actuel de cibles dans le parcours',
                            )}
                          </p>
                          <p className="text-lg font-black text-woven-text">
                            {t('report.dualTrack.targetsCountLabel', '{{count}} targets', {
                              count: masteryTargetCountStage ?? targetCount,
                            })}
                          </p>
                        </div>
                        {typeof masteryStageProgressPct === 'number' ? (
                          <span className="text-2xl font-black tabular-nums text-cyan-500">
                            {integer(masteryStageProgressPct)}%
                          </span>
                        ) : null}
                      </div>

                      {typeof masteryStageProgressPct === 'number' ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-woven-bg">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-[width] duration-500"
                            style={{ width: `${Math.round(masteryStageProgressPct)}%` }}
                          />
                        </div>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>{t('report.dualTrack.currentTier', 'Current tier')}</span>
                          <span className="inline-flex items-center gap-1 font-bold text-woven-text">
                            {typeof masteryDifficultyTier === 'number' && masteryTierCount
                              ? t('report.dualTrack.tierValue', 'T{{current}}/{{total}}', {
                                  current: integer(masteryDifficultyTier + 1),
                                  total: integer(masteryTierCount),
                                })
                              : '—'}
                            {typeof masteryDifficultyTier === 'number' && masteryTierCount ? (
                              <InfoSheet
                                iconSize={10}
                                triggerClassName="text-muted-foreground/70 hover:text-primary"
                              >
                                {currentTierHelpText}
                              </InfoSheet>
                            ) : null}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>{t('report.dualTrack.bestCompleted', 'Best completed')}</span>
                          <span className="font-bold text-woven-text">
                            {highestCompletedTargetCount
                              ? t('report.dualTrack.targetsCountLabel', '{{count}} targets', {
                                  count: highestCompletedTargetCount,
                                })
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>{t('report.dualTrack.performanceBand', 'Rating')}</span>
                          <span
                            className={cn(
                              'font-bold',
                              performanceBand === 'mastery'
                                ? 'text-woven-correct'
                                : performanceBand === 'solid'
                                  ? 'text-cyan-500'
                                  : performanceBand === 'building'
                                    ? 'text-woven-amber'
                                    : performanceBand === 'struggling'
                                      ? 'text-woven-incorrect'
                                      : 'text-woven-text',
                            )}
                          >
                            {performanceBand
                              ? t(`report.dualTrack.band.${performanceBand}`, performanceBand)
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-woven-bg px-2.5 py-2">
                          <span>{t('report.dualTrack.nextStage', 'Next stage')}</span>
                          <span className="font-bold text-woven-text">
                            {nextTargetCountStage
                              ? t('report.dualTrack.targetsCountLabel', '{{count}} targets', {
                                  count: nextTargetCountStage,
                                })
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {promotedTargetCount ? (
                    <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                      {t(
                        'report.dualTrack.stageUnlocked',
                        'New target stage unlocked for the next session.',
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            />

            <Disclosure
              title={t('report.dualTrack.trackingProfile', 'Tracking profile')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                    <div className="space-y-1.5 text-xs text-woven-text-muted">
                      <div className="flex items-center justify-between">
                        <span>
                          {t('report.dualTrack.selectionPrecision', 'Selection precision')}
                        </span>
                        <span className="font-bold text-woven-text">{selectionPrecision}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.selectionQuality', 'Selection quality')}</span>
                        <span className="font-bold text-woven-text">{selectionQuality}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.trackingTime', 'Tracking time')}</span>
                        <span className="font-bold text-woven-text">
                          {t('report.dualTrack.secondsValue', '{{value}} s', {
                            value: decimal(trackingDurationMs / 1000),
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.speed', 'Speed')}</span>
                        <span className="font-bold text-woven-text">
                          {t('report.dualTrack.speedValue', '{{value}} px/s', {
                            value: integer(speedPxPerSec),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                    <div className="space-y-1.5 text-xs text-woven-text-muted">
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.motion', 'Motion')}</span>
                        <span className="font-bold text-woven-text">
                          {modeDetails?.motionComplexity ?? 'standard'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.crowdingEvents', 'Crowding events')}</span>
                        <span className="font-bold text-woven-text">
                          {integer(totalCrowdingEvents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.minDistance', 'Min distance')}</span>
                        <span className="font-bold text-woven-text">
                          {minInterObjectDistancePx
                            ? t('report.dualTrack.pxValue', '{{value}} px', {
                                value: integer(minInterObjectDistancePx),
                              })
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.dualTrack.avgRt', 'Avg RT')}</span>
                        <span className="font-bold text-woven-text">
                          {t('report.dualTrack.msValue', '{{value}} ms', {
                            value: integer(avgRtMs),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />

            {report.activeModalities.length > 1 && (
              <Disclosure
                title={t('report.dualTrack.modalityPerformance', 'Performance by modality')}
                icon={<Eye size={18} weight="duotone" className="text-primary" />}
                render={() => {
                  const modalities = report.activeModalities;
                  const gridClass =
                    modalities.length === 3 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2';

                  return (
                    <div className={gridClass}>
                      {modalities.map((modality) => {
                        const stats = report.byModality[modality];
                        if (!stats) return null;

                        const family = getModalityFamily(modality);
                        const labelInfo = getModalityLabelInfo(modality);
                        const label = t(`modality.${labelInfo.family}`, labelInfo.family);
                        const color = getModalityColor(modality);
                        const colorStyle = isHexColor(color) ? { color } : undefined;
                        const colorClass = isHexColor(color) ? '' : color;

                        const isBinding =
                          (family === 'color' || family === 'audio') && stats.falseAlarms === null;
                        const total = stats.hits + stats.misses;
                        const pct = total > 0 ? Math.round((stats.hits / total) * 100) : null;

                        return (
                          <SubCard key={modality} className="flex flex-col items-center gap-2 py-3">
                            <span
                              className={cn(
                                colorClass,
                                'text-[10px] font-bold uppercase tracking-widest',
                              )}
                              style={colorStyle}
                            >
                              {label}
                            </span>

                            {isBinding ? (
                              <>
                                <span className="font-mono text-lg font-bold text-woven-text">
                                  {stats.hits}
                                  <span className="text-woven-text-muted font-normal">
                                    /{total}
                                  </span>
                                </span>
                                {pct !== null && (
                                  <span
                                    className={cn(
                                      'text-xs font-semibold',
                                      pct >= 80
                                        ? 'text-woven-correct'
                                        : pct >= 50
                                          ? 'text-woven-amber'
                                          : 'text-woven-incorrect',
                                    )}
                                  >
                                    {pct}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="space-y-1 text-xs w-full px-2">
                                  <div className="flex justify-between">
                                    <span className="text-woven-text-muted">
                                      {t('stats.hits', 'Hits')}
                                    </span>
                                    <span className="font-bold font-mono text-woven-text">
                                      {stats.hits}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-woven-text-muted">
                                      {t('stats.misses', 'Misses')}
                                    </span>
                                    <span className="font-bold font-mono text-woven-text">
                                      {stats.misses}
                                    </span>
                                  </div>
                                  {stats.falseAlarms !== null && (
                                    <div className="flex justify-between">
                                      <span className="text-woven-text-muted">
                                        {t('stats.falseAlarms', 'FA')}
                                      </span>
                                      <span className="font-bold font-mono text-woven-text">
                                        {stats.falseAlarms}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {pct !== null && (
                                  <div className="pt-1 border-t border-woven-border/60 w-full px-2">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-woven-text-muted">
                                        {t('stats.accuracy', 'Accuracy')}
                                      </span>
                                      <span className="font-mono font-medium text-woven-text">
                                        {pct}%
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </SubCard>
                        );
                      })}
                    </div>
                  );
                }}
              />
            )}

            <Disclosure
              title={t('report.dualTrack.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {turns.map((turn) => (
                      <div key={turn.index} className="relative">
                        <div
                          className={cn(
                            'absolute left-[-20px] top-5 h-4 w-4 rounded-full border-2 border-woven-bg',
                            turn.verdict === 'correct'
                              ? 'bg-woven-correct'
                              : turn.verdict === 'partial'
                                ? 'bg-woven-amber'
                                : 'bg-woven-incorrect',
                          )}
                        />
                        <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                              {String(turn.index).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-bold text-woven-text">
                              {turn.correctCount}/{turn.targetCount}
                            </span>
                            <span
                              className={cn(
                                'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                turn.verdict === 'correct'
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : turn.verdict === 'partial'
                                    ? 'bg-woven-amber/12 text-woven-amber'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {turn.verdict === 'correct'
                                ? t('report.dualTrack.perfect', 'Perfect')
                                : turn.verdict === 'partial'
                                  ? t('report.dualTrack.partial', 'Partial')
                                  : t('report.dualTrack.error', 'Error')}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                              {t('report.dualTrack.msValue', '{{value}} ms', {
                                value: integer(turn.responseTimeMs),
                              })}
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.dualTrack.misses', 'Misses')}: {turn.misses}
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.dualTrack.falseAlarms', 'False alarms')}:{' '}
                              {turn.falseAlarms}
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.dualTrack.crowdingShort', 'Crowding')}:{' '}
                              {turn.crowdingEvents}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            <div>
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                                {t('report.dualTrack.targets', 'Targets')}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {turn.targetIndices.map((index) => (
                                  <span
                                    key={`target-${turn.index}-${index}`}
                                    className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary"
                                  >
                                    {formatObjectIndex(index)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-woven-text-muted">
                                {t('report.dualTrack.selected', 'Selected')}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {turn.selectedIndices.map((index) => {
                                  const isTarget = turn.targetIndices.includes(index);
                                  return (
                                    <span
                                      key={`selected-${turn.index}-${index}`}
                                      className={cn(
                                        'rounded-full px-2 py-1 text-[11px] font-bold',
                                        isTarget
                                          ? 'bg-woven-correct/12 text-woven-correct'
                                          : 'bg-woven-incorrect/12 text-woven-incorrect',
                                      )}
                                    >
                                      {formatObjectIndex(index)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <TrackTrialInspector
                            turn={turn}
                            trackingDurationMs={trackingDurationMs}
                            crowdingThresholdPx={crowdingThresholdPx}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
          </div>

          <Hatching id="dual-track-report-actions-hatch" className="text-foreground/70" />
          <div className="px-2 py-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {!hideRestartAction && isJourneySession && handleNextJourneyAction ? (
                  <button
                    type="button"
                    onClick={handleNextJourneyAction}
                    data-testid="dual-track-report-continue-journey"
                    className={cn(
                      'flex flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white shadow-soft-colored transition-all active:scale-[0.98]',
                      isJourneyRegression
                        ? 'bg-woven-incorrect hover:bg-woven-incorrect/90'
                        : 'bg-woven-correct hover:bg-woven-correct/90',
                    )}
                  >
                    <Play size={18} weight="bold" />
                    <span className="min-w-0 text-center">
                      {t('report.actions.continueJourney', 'Continuer le parcours')}
                    </span>
                  </button>
                ) : null}
                {!hideRestartAction && !isJourneySession && !hasNextJourneyAction ? (
                  <button
                    type="button"
                    onClick={onPlayAgain}
                    className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-soft-colored transition-all active:scale-[0.98]"
                  >
                    <ArrowClockwise size={18} weight="bold" />
                    <span className="min-w-0 text-center">{t('game.cogTask.restart')}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onBackToHome}
                  aria-label={t('common.home', 'Home')}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
                >
                  <House size={18} />
                </button>
              </div>

              {(onGoToStats || onGoToReplay) && (
                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
                  {onGoToStats ? (
                    <button
                      type="button"
                      onClick={onGoToStats}
                      aria-label={t('stats.title', 'Stats')}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
                    >
                      <ChartLine size={18} />
                    </button>
                  ) : null}
                  {onGoToReplay ? (
                    <button
                      type="button"
                      onClick={onGoToReplay}
                      aria-label={t('report.actions.replay', 'Replay')}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
                    >
                      <Play size={18} />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
        <Hatching
          id="dual-track-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="dual-track-report-bottom" className="text-foreground/70" />
    </div>
  );
}
