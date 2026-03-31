import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface VisualSearchSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly VisualSearchTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly avgRtMs?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface VisualSearchTrialView {
  readonly index: number;
  readonly setSize: number;
  readonly targetPresent: boolean;
  readonly response: 'present' | 'absent' | null;
  readonly correct: boolean;
  readonly timedOut: boolean;
  readonly responseTimeMs: number;
}

export function VisualSearchSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  onPlayAgain,
  onBackToHome,
}: VisualSearchSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<VisualSearchTrialView[]>(() => {
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
        const setSize = typeof trialData['setSize'] === 'number' ? trialData['setSize'] : 8;
        const targetPresent = trialData['targetPresent'] === true;
        const rawAnswer = trialData['answer'];
        const response =
          rawAnswer === 'present' || rawAnswer === 'absent'
            ? (rawAnswer as 'present' | 'absent')
            : null;
        const timedOut = trialData['responded'] === false || trialData['timedOut'] === true;

        return {
          index: turn.index,
          setSize,
          targetPresent,
          response,
          correct: detail.correct,
          timedOut,
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
  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((turn) => turn.correct).length;
  const totalErrors =
    report != null
      ? Math.max(0, report.totals.misses + (report.totals.falseAlarms ?? 0))
      : resolvedTrials.filter((turn) => !turn.correct && !turn.timedOut).length;
  const totalTimeouts = resolvedTrials.filter((turn) => turn.timedOut).length;

  const resolvedAvgRtMs =
    avgRtMs ??
    (() => {
      const validTrials = resolvedTrials.filter((turn) => !turn.timedOut);
      return validTrials.length > 0
        ? Math.round(
            validTrials.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / validTrials.length,
          )
        : 0;
    })();

  const SET_SIZES = [8, 12, 16] as const;

  const setSizeStats = useMemo(() => {
    return SET_SIZES.map((size) => {
      const matchingTurns = resolvedTrials.filter((turn) => turn.setSize === size);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const validRts = matchingTurns.filter((turn) => turn.correct && !turn.timedOut);
      const meanRt =
        validRts.length > 0
          ? Math.round(
              validRts.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / validRts.length,
            )
          : 0;

      return {
        size,
        total: matchingTurns.length,
        correct,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
        meanRt,
      };
    });
  }, [resolvedTrials]);

  const presenceStats = useMemo(() => {
    return [true, false].map((targetPresent) => {
      const matchingTurns = resolvedTrials.filter((turn) => turn.targetPresent === targetPresent);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const errors = matchingTurns.filter((turn) => !turn.correct && !turn.timedOut).length;
      const timedOut = matchingTurns.filter((turn) => turn.timedOut).length;
      const validRts = matchingTurns.filter((turn) => turn.correct && !turn.timedOut);
      const meanRt =
        validRts.length > 0
          ? Math.round(
              validRts.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / validRts.length,
            )
          : 0;

      return {
        id: targetPresent ? 'present' : 'absent',
        label: targetPresent
          ? t('report.visualSearch.present', 'Present')
          : t('report.visualSearch.absent', 'Absent'),
        total: matchingTurns.length,
        correct,
        errors,
        timedOut,
        meanRt,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
      };
    });
  }, [resolvedTrials, t]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="visual-search-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="visual-search-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('report.visualSearch.title', 'Visual Search')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.visualSearch.subtitle', 'Attentional efficiency')}
            </p>
            <Hatching id="visual-search-report-hero" className="mt-2 text-foreground/70" />
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
                id="visual-search-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.avgRt')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedAvgRtMs}
                  <span className="text-lg">ms</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="visual-search-report-score-hatch" className="mt-3 text-foreground/70" />

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
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.visualSearch.timeouts', 'Timeouts')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">{totalTimeouts}</p>
            </div>
          </div>
          <Hatching id="visual-search-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.visualSearch.performanceBySetSize', 'Performance by set size')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-3 gap-2">
                  {setSizeStats.map((stat) => (
                    <div
                      key={stat.size}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2.5 w-2.5 rounded-full shrink-0',
                            stat.accuracy >= 80
                              ? 'bg-woven-correct'
                              : stat.accuracy >= 50
                                ? 'bg-amber-400'
                                : 'bg-woven-incorrect',
                          )}
                        />
                        <span className="text-sm font-bold text-woven-text">
                          {t('report.visualSearch.setSize', 'Set')} {stat.size}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {stat.total}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.accuracy', 'Accuracy')}</span>
                          <span className="font-bold text-woven-text">{stat.accuracy}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{stat.meanRt}ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t(
                'report.visualSearch.performanceByPresence',
                'Performance by target presence',
              )}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {presenceStats.map((condition) => (
                    <div
                      key={condition.id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-3 w-3 rounded-full shrink-0',
                            condition.id === 'present' ? 'bg-woven-correct' : 'bg-primary',
                          )}
                        />
                        <span className="text-sm font-bold text-woven-text">{condition.label}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {condition.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{condition.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.error', 'Error')}</span>
                          <span className="font-bold text-woven-incorrect">{condition.errors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.timeout', 'Timeout')}</span>
                          <span className="font-bold text-woven-text">{condition.timedOut}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.visualSearch.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{condition.meanRt}ms</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.visualSearch.precision', 'Precision')}</span>
                          <span className="font-bold text-woven-text">{condition.accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t('report.visualSearch.timeline', 'Timeline')}
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
                            turn.correct
                              ? 'bg-woven-correct'
                              : turn.timedOut
                                ? 'bg-woven-text-muted'
                                : 'bg-woven-incorrect',
                          )}
                        />
                        <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                              {String(turn.index).padStart(2, '0')}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                'bg-teal-500/12 text-teal-500',
                              )}
                            >
                              {t('report.visualSearch.setSize', 'Set')} {turn.setSize}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                turn.targetPresent
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : 'bg-primary/12 text-primary',
                              )}
                            >
                              {turn.targetPresent
                                ? t('report.visualSearch.present', 'Present')
                                : t('report.visualSearch.absent', 'Absent')}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            {turn.response ? (
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.visualSearch.response', 'Response')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {turn.response === 'present'
                                    ? t('report.visualSearch.present', 'Present')
                                    : t('report.visualSearch.absent', 'Absent')}
                                </span>
                              </span>
                            ) : null}
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                              {Math.round(turn.responseTimeMs)}ms
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-1 font-bold',
                                turn.correct
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : turn.timedOut
                                    ? 'bg-woven-text/10 text-woven-text'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {turn.timedOut
                                ? t('report.visualSearch.timeout', 'Timeout')
                                : turn.correct
                                  ? t('report.visualSearch.correct', 'Correct')
                                  : t('report.visualSearch.error', 'Error')}
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

          <Hatching id="visual-search-report-actions-hatch" className="text-foreground/70" />
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
          id="visual-search-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="visual-search-report-bottom" className="text-foreground/70" />
    </div>
  );
}
