import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface CorsiSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly CorsiTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly maxSpan?: number;
  readonly avgRtMs?: number;
  readonly interrupted?: boolean;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface CorsiTrialView {
  readonly index: number;
  readonly span: number;
  readonly sequence: readonly number[];
  readonly recalled: readonly number[];
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly firstErrorIndex?: number;
}

type CorsiTurnDetail = Extract<
  NonNullable<SessionEndReportModel['turns']>[number]['detail'],
  { kind: 'corsi-trial' }
>;

function formatBlocks(values: readonly number[]): string {
  return values.map((value) => value + 1).join(' ');
}

export function CorsiSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  maxSpan,
  avgRtMs,
  interrupted = false,
  onPlayAgain,
  onBackToHome,
}: CorsiSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<CorsiTrialView[]>(() => {
    if (trials) return [...trials];

    const reportTurns = report?.turns ?? [];

    return reportTurns
      .filter(
        (
          turn,
        ): turn is NonNullable<SessionEndReportModel['turns']>[number] & {
          detail: CorsiTurnDetail;
        } => turn.kind === 'corsi-trial' && turn.detail.kind === 'corsi-trial',
      )
      .map((turn) => ({
        index: turn.index,
        span: turn.detail.span,
        sequence: turn.detail.sequence,
        recalled: turn.detail.recalled,
        correct: turn.detail.correct,
        responseTimeMs: turn.detail.responseTimeMs,
        firstErrorIndex: turn.detail.firstErrorIndex,
      }));
  }, [report?.turns, trials]);

  const resolvedAccuracy = (() => {
    if (typeof accuracy === 'number') return accuracy;
    if (report) return Math.round((report.unifiedAccuracy ?? 0) * 100);
    if (resolvedTrials.length === 0) return 0;
    return Math.round(
      (resolvedTrials.filter((trial) => trial.correct).length / resolvedTrials.length) * 100,
    );
  })();
  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((trial) => trial.correct).length;
  const resolvedMaxSpan =
    maxSpan ??
    (typeof report?.modeScore.value === 'number'
      ? Math.round(report.modeScore.value)
      : undefined) ??
    resolvedTrials.reduce((currentMax, trial) => {
      return trial.correct && trial.span > currentMax ? trial.span : currentMax;
    }, 0);
  const resolvedAvgRtMs =
    avgRtMs ??
    (resolvedTrials.length > 0
      ? Math.round(
          resolvedTrials.reduce((sum, trial) => sum + trial.responseTimeMs, 0) /
            resolvedTrials.length,
        )
      : 0);
  const totalErrors = Math.max(0, resolvedTotalTrials - resolvedCorrectTrials);
  const longestStreak = useMemo(() => {
    let maxStreak = 0;
    let currentStreak = 0;

    for (const trial of resolvedTrials) {
      currentStreak = trial.correct ? currentStreak + 1 : 0;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    }

    return maxStreak;
  }, [resolvedTrials]);

  const scoreColor =
    resolvedAccuracy >= 80
      ? 'text-woven-correct'
      : resolvedAccuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  const spanStats = useMemo(() => {
    const bySpan = new Map<
      number,
      {
        total: number;
        correct: number;
        avgRtMs: number;
      }
    >();

    for (const trial of resolvedTrials) {
      const current = bySpan.get(trial.span) ?? { total: 0, correct: 0, avgRtMs: 0 };
      current.total += 1;
      current.correct += trial.correct ? 1 : 0;
      current.avgRtMs += trial.responseTimeMs;
      bySpan.set(trial.span, current);
    }

    return [...bySpan.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([span, stats]) => ({
        span,
        total: stats.total,
        correct: stats.correct,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        avgRtMs: stats.total > 0 ? Math.round(stats.avgRtMs / stats.total) : 0,
      }));
  }, [resolvedTrials]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="corsi-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="corsi-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {interrupted ? t('game.cogTask.sessionInterrupted') : 'Corsi Block'}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {interrupted
                ? t('report.corsi.interrupted', 'Interrupted session')
                : t('report.corsi.spatialSpan', 'Spatial span')}
            </p>
            <Hatching id="corsi-report-hero" className="mt-2 text-foreground/70" />
          </div>

          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.maxSpan')}
                </p>
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                    scoreColor,
                  )}
                >
                  {resolvedMaxSpan}
                </span>
              </div>
              <Hatching
                id="corsi-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.precision')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedAccuracy}
                  <span className="text-lg">%</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="corsi-report-score-hatch" className="mt-3 text-foreground/70" />

          <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.trials')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">
                {resolvedTotalTrials}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.correct')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">
                {resolvedCorrectTrials}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.errors')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-incorrect">{totalErrors}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.avgRt')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">{resolvedAvgRtMs}ms</p>
            </div>
          </div>
          <Hatching id="corsi-report-kpi-hatch" className="mt-4 text-foreground/70" />

          {resolvedTotalTrials === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-woven-text-muted">
              {t('game.cogTask.noTrials')}
            </div>
          ) : (
            <div className="px-2 py-4 space-y-2">
              <Disclosure
                title={t('report.corsi.performanceBySpan', 'Performance by span')}
                icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
                render={() => (
                  <div className="space-y-2">
                    {spanStats.length > 0 ? (
                      spanStats.map((spanStat) => (
                        <div
                          key={spanStat.span}
                          className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-2 rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-2"
                        >
                          <span className="text-sm font-bold text-primary">
                            {t('game.cogTask.span')} {spanStat.span}
                          </span>
                          <span className="text-xs text-woven-text-muted">
                            {spanStat.correct}/{spanStat.total}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-woven-text">
                            {spanStat.accuracy}%
                          </span>
                          <span className="text-xs tabular-nums text-woven-text-muted">
                            {spanStat.avgRtMs}ms
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-3 text-sm text-woven-text-muted">
                        {t(
                          'report.corsi.noDetailedTimeline',
                          'Detailed trial history is unavailable for this session.',
                        )}
                      </div>
                    )}
                  </div>
                )}
              />

              <Disclosure
                title={t('report.corsi.timeline', 'Timeline')}
                icon={<ListChecks size={18} weight="duotone" className="text-primary" />}
                render={() => (
                  <div className="space-y-2">
                    {resolvedTrials.length > 0 ? (
                      resolvedTrials.map((trial) => (
                        <div
                          key={trial.index}
                          className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-woven-text">
                              #{trial.index}
                            </span>
                            <span className="text-sm font-medium text-primary">
                              {t('game.cogTask.span')} {trial.span}
                            </span>
                            <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-woven-text-muted">
                              <Timer size={10} weight="bold" />
                              {Math.round(trial.responseTimeMs)}ms
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                                trial.correct
                                  ? 'bg-woven-correct/15 text-woven-correct'
                                  : 'bg-woven-incorrect/15 text-woven-incorrect',
                              )}
                            >
                              {trial.correct
                                ? t('report.corsi.correct', 'Correct')
                                : t('report.corsi.error', 'Error')}
                            </span>
                          </div>

                          <div className="mt-2 grid gap-1 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-woven-text-muted">
                                {t('report.corsi.sequence', 'Sequence')}
                              </span>
                              <span className="font-mono text-woven-text">
                                {formatBlocks(trial.sequence)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-woven-text-muted">
                                {t('report.corsi.recalled', 'Recalled')}
                              </span>
                              <span className="font-mono text-woven-text">
                                {formatBlocks(trial.recalled)}
                              </span>
                            </div>
                            {!trial.correct && (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-woven-text-muted">
                                  {t('report.corsi.firstMismatch', 'First mismatch')}
                                </span>
                                <span className="text-woven-incorrect">
                                  {typeof trial.firstErrorIndex === 'number'
                                    ? `#${trial.firstErrorIndex + 1}`
                                    : t('report.corsi.error', 'Error')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-3 text-sm text-woven-text-muted">
                        {t(
                          'report.corsi.noDetailedTimeline',
                          'Detailed trial history is unavailable for this session.',
                        )}
                      </div>
                    )}
                  </div>
                )}
              />
            </div>
          )}

          <Hatching id="corsi-report-actions-hatch" className="text-foreground/70" />
          <div className="px-2 py-6 flex flex-col items-center gap-3">
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-medium text-primary active:scale-95 transition-transform"
              >
                <ArrowClockwise size={16} />
                {t('game.cogTask.restart')}
              </button>
              <button
                type="button"
                onClick={onBackToHome}
                className="flex items-center justify-center gap-2 rounded-full border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-5 py-3 text-sm font-medium text-woven-text active:brightness-90 transition-transform"
              >
                <House size={16} />
                {t('game.cogTask.home')}
              </button>
            </div>

            <p className="text-xs text-woven-text-muted">
              {t('game.cogTask.longestStreak')} {longestStreak}
            </p>
          </div>
        </div>
        <Hatching
          id="corsi-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="corsi-report-bottom" className="text-foreground/70" />
    </div>
  );
}
