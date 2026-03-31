import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

type Direction = 'left' | 'right';

interface StopSignalSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly StopSignalTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly ssrtMs?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface StopSignalTrialView {
  readonly index: number;
  readonly direction: Direction;
  readonly isStopTrial: boolean;
  readonly ssd: number | null;
  readonly responded: boolean;
  readonly response: Direction | null;
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

function isDirection(value: unknown): value is Direction {
  return value === 'left' || value === 'right';
}

export function StopSignalSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  ssrtMs,
  onPlayAgain,
  onBackToHome,
}: StopSignalSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<StopSignalTrialView[]>(() => {
    if (trials) return [...trials];

    const reportTurns = report?.turns ?? [];

    return reportTurns
      .filter(
        (turn): turn is NonNullable<SessionEndReportModel['turns']>[number] =>
          turn.kind === 'cognitive-task-trial' && turn.detail?.kind === 'cognitive-task-trial',
      )
      .map((turn) => {
        const detail = turn.detail as CognitiveTaskTrialDetail;
        const trialData = detail.trialData ?? {};
        const direction = isDirection(trialData['direction']) ? trialData['direction'] : 'right';
        const isStopTrial =
          trialData['isStopTrial'] === true ||
          detail.condition === 'stop' ||
          trialData['trialType'] === 'stop';
        const ssd = typeof trialData['ssd'] === 'number' ? trialData['ssd'] : null;
        const responded = trialData['responded'] === true;
        const response = isDirection(trialData['responseDirection'])
          ? trialData['responseDirection']
          : isDirection(trialData['response'])
            ? trialData['response']
            : null;

        return {
          index: turn.index,
          direction,
          isStopTrial,
          ssd,
          responded,
          response,
          correct: detail.correct,
          responseTimeMs: detail.responseTimeMs,
        };
      });
  }, [report?.turns, trials]);

  const resolvedAccuracy =
    accuracy ?? (report?.modeScore.unit === '%' ? Math.round(report.modeScore.value) : 0);
  const scoreColor =
    resolvedAccuracy >= 80
      ? 'text-woven-correct'
      : resolvedAccuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';
  const computedSsrt = useMemo(() => {
    const goCorrect = resolvedTrials.filter((t) => !t.isStopTrial && t.correct && t.responded);
    const meanGoRt =
      goCorrect.length > 0
        ? goCorrect.reduce((sum, t) => sum + t.responseTimeMs, 0) / goCorrect.length
        : 0;
    const successfulStops = resolvedTrials.filter(
      (t) => t.isStopTrial && t.correct && t.ssd != null,
    );
    const meanSsd =
      successfulStops.length > 0
        ? successfulStops.reduce((sum, t) => sum + (t.ssd ?? 0), 0) / successfulStops.length
        : 0;
    return meanGoRt > 0 && meanSsd > 0 ? Math.round(Math.max(0, meanGoRt - meanSsd)) : 0;
  }, [resolvedTrials]);
  const metricSsrt =
    typeof report?.taskMetrics?.['ssrt'] === 'number'
      ? Math.round(report.taskMetrics['ssrt'])
      : null;
  const metricSsrtValid =
    typeof report?.taskMetrics?.['ssrtValid'] === 'boolean'
      ? report.taskMetrics['ssrtValid']
      : null;
  const resolvedSsrt = ssrtMs ?? metricSsrt ?? computedSsrt;
  const ssrtDisplayValue = metricSsrtValid === false || resolvedSsrt <= 0 ? null : resolvedSsrt;
  const ssrtInsight =
    ssrtDisplayValue == null
      ? t(
          'game.cogTask.stopSignal.ssrtNegativeNote',
          'SSRT is negative (mean SSD > mean GO RT) — result unreliable with current trial count.',
        )
      : `${t('game.cogTask.stopSignal.ssrtFull', 'SSRT (Stop Signal RT)')}: ${t(
          'game.cogTask.stopSignal.meanGoRt',
          'Mean GO reaction time',
        )} - ${t('game.cogTask.stopSignal.ssdMean', 'Mean SSD (successful stops)')}`;

  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((t) => t.correct).length;
  const totalErrors = Math.max(0, resolvedTotalTrials - resolvedCorrectTrials);

  const conditionStats = useMemo(() => {
    const goTrials = resolvedTrials.filter((t) => !t.isStopTrial);
    const stopTrials = resolvedTrials.filter((t) => t.isStopTrial);

    const goCorrect = goTrials.filter((t) => t.correct).length;
    const goErrors = goTrials.filter((t) => !t.correct && t.responded).length;
    const goTimeouts = goTrials.filter((t) => !t.correct && !t.responded).length;
    const goRespondedRts = goTrials.filter((t) => t.responded && t.correct);
    const goMeanRt =
      goRespondedRts.length > 0
        ? Math.round(
            goRespondedRts.reduce((sum, t) => sum + t.responseTimeMs, 0) / goRespondedRts.length,
          )
        : 0;

    const stopSuccessful = stopTrials.filter((t) => t.correct).length;
    const stopFailed = stopTrials.filter((t) => !t.correct).length;
    const stopSsds = stopTrials.filter((t) => t.correct && t.ssd != null);
    const avgSsd =
      stopSsds.length > 0
        ? Math.round(stopSsds.reduce((sum, t) => sum + (t.ssd ?? 0), 0) / stopSsds.length)
        : 0;

    return {
      go: {
        total: goTrials.length,
        correct: goCorrect,
        errors: goErrors,
        timeouts: goTimeouts,
        meanRt: goMeanRt,
        accuracy: goTrials.length > 0 ? Math.round((goCorrect / goTrials.length) * 100) : 0,
      },
      stop: {
        total: stopTrials.length,
        successful: stopSuccessful,
        failed: stopFailed,
        avgSsd,
        accuracy:
          stopTrials.length > 0 ? Math.round((stopSuccessful / stopTrials.length) * 100) : 0,
      },
    };
  }, [resolvedTrials]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="stopsignal-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="stopsignal-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.stopSignal', 'Stop-Signal')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.stopSignal.responseInhibition', 'Response inhibition')}
            </p>
            <Hatching id="stopsignal-report-hero" className="mt-2 text-foreground/70" />
          </div>

          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.precision')}
                </p>
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                    scoreColor,
                  )}
                >
                  {resolvedAccuracy}%
                </span>
              </div>
              <Hatching
                id="stopsignal-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  SSRT
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {ssrtDisplayValue != null ? ssrtDisplayValue : 'N/A'}
                  {ssrtDisplayValue != null && <span className="text-lg">ms</span>}
                </span>
              </div>
            </div>
          </div>
          <p className="px-3 mt-2 text-center text-xs text-woven-text-muted">{ssrtInsight}</p>
          <Hatching id="stopsignal-report-score-hatch" className="mt-3 text-foreground/70" />

          <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.trials')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">
                {resolvedTotalTrials}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.correct')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">
                {resolvedCorrectTrials}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.errors')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-incorrect">{totalErrors}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">SSRT</p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {ssrtDisplayValue != null ? `${ssrtDisplayValue}ms` : 'N/A'}
              </p>
            </div>
          </div>
          <Hatching id="stopsignal-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.stopSignal.performanceByCondition', 'Performance by condition')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {/* Go trials card */}
                  <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0 bg-woven-correct" />
                      <span className="text-sm font-bold text-woven-text">
                        {t('report.stopSignal.goTrials', 'Go trials')}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                        {conditionStats.go.total}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.correct', 'Correct')}</span>
                        <span className="font-bold text-woven-correct">
                          {conditionStats.go.correct}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.errors', 'Errors')}</span>
                        <span className="font-bold text-woven-incorrect">
                          {conditionStats.go.errors}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.timeouts', 'Timeouts')}</span>
                        <span className="font-bold text-woven-text">
                          {conditionStats.go.timeouts}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.avgRt', 'Avg RT')}</span>
                        <span className="font-bold text-woven-text">
                          {conditionStats.go.meanRt}ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                        <span>{t('report.stopSignal.precision', 'Precision')}</span>
                        <span className="font-bold text-woven-text">
                          {conditionStats.go.accuracy}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stop trials card */}
                  <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0 bg-woven-incorrect" />
                      <span className="text-sm font-bold text-woven-text">
                        {t('report.stopSignal.stopTrials', 'Stop trials')}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                        {conditionStats.stop.total}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                      <div className="flex items-center justify-between">
                        <span>
                          {t('report.stopSignal.successfulInhibitions', 'Successful inhibitions')}
                        </span>
                        <span className="font-bold text-woven-correct">
                          {conditionStats.stop.successful}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.failedStops', 'Failed stops')}</span>
                        <span className="font-bold text-woven-incorrect">
                          {conditionStats.stop.failed}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('report.stopSignal.avgSsd', 'Avg SSD')}</span>
                        <span className="font-bold text-woven-text">
                          {conditionStats.stop.avgSsd}ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                        <span>{t('report.stopSignal.precision', 'Precision')}</span>
                        <span className="font-bold text-woven-text">
                          {conditionStats.stop.accuracy}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />

            <Disclosure
              title={t('report.stopSignal.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((turn) => (
                      <div key={turn.index} className="relative">
                        <div
                          className={cn(
                            'absolute left-[-20px] top-5 h-4 w-4 rounded-full border-2 border-woven-bg',
                            turn.correct ? 'bg-woven-correct' : 'bg-woven-incorrect',
                          )}
                        />
                        <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                              {String(turn.index).padStart(2, '0')}
                            </span>
                            <span className="text-lg font-bold text-woven-text">
                              {turn.direction === 'left' ? '\u2190' : '\u2192'}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                turn.isStopTrial
                                  ? 'bg-woven-incorrect/12 text-woven-incorrect'
                                  : 'bg-woven-correct/12 text-woven-correct',
                              )}
                            >
                              {turn.isStopTrial ? 'STOP' : 'GO'}
                            </span>
                            {turn.isStopTrial && turn.ssd != null && (
                              <span className="text-[10px] tabular-nums text-woven-text-muted">
                                SSD: {Math.round(turn.ssd)}ms
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.stopSignal.direction', 'Direction')}:{' '}
                              <span className="font-semibold text-woven-text">
                                {turn.direction === 'left'
                                  ? t('game.cogTask.left')
                                  : t('game.cogTask.right')}
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.stopSignal.response', 'Response')}:{' '}
                              <span className="font-semibold text-woven-text">
                                {turn.responded
                                  ? turn.response === 'left'
                                    ? t('game.cogTask.left')
                                    : t('game.cogTask.right')
                                  : t('report.stopSignal.withheld', 'Withheld')}
                              </span>
                            </span>
                            {turn.responded && (
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                                {Math.round(turn.responseTimeMs)}ms
                              </span>
                            )}
                            <span
                              className={cn(
                                'rounded-full px-2 py-1 font-bold',
                                turn.correct
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {turn.correct
                                ? turn.isStopTrial
                                  ? t('report.stopSignal.inhibited', 'Inhibited')
                                  : t('report.stopSignal.correct', 'Correct')
                                : turn.isStopTrial
                                  ? t('report.stopSignal.failedStop', 'Failed Stop')
                                  : t('report.stopSignal.error', 'Error')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
          </div>

          <Hatching id="stopsignal-report-actions-hatch" className="text-foreground/70" />
          <div className="px-2 py-6">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-soft-colored transition-all active:scale-[0.98]"
              >
                <ArrowClockwise size={18} weight="bold" />
                <span>{t('game.cogTask.restart')}</span>
              </button>
              <button
                type="button"
                onClick={onBackToHome}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
              >
                <House size={18} />
              </button>
            </div>
          </div>
        </div>
        <Hatching
          id="stopsignal-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="stopsignal-report-bottom" className="text-foreground/70" />
    </div>
  );
}
