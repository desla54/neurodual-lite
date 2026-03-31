import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

interface PasatSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly PasatTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly fastestIsiMs?: number;
  readonly longestStreak?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface PasatTrialView {
  readonly index: number;
  readonly currentNumber: number;
  readonly previousNumber: number;
  readonly expectedSum: number;
  readonly response: number | null;
  readonly isi: number;
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

// =============================================================================
// Component
// =============================================================================

export function PasatSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  fastestIsiMs,
  longestStreak,
  onPlayAgain,
  onBackToHome,
}: PasatSessionReportProps): ReactNode {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Resolve trials from either live data or historical report
  // ---------------------------------------------------------------------------

  const resolvedTrials = useMemo<PasatTrialView[]>(() => {
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

        const currentNumber =
          typeof trialData['currentNumber'] === 'number' ? trialData['currentNumber'] : 0;
        const previousNumber =
          typeof trialData['previousNumber'] === 'number' ? trialData['previousNumber'] : 0;
        const expectedSum =
          typeof trialData['expectedSum'] === 'number' ? trialData['expectedSum'] : 0;
        const response = typeof trialData['response'] === 'number' ? trialData['response'] : null;
        const isi = typeof trialData['isi'] === 'number' ? trialData['isi'] : 0;

        return {
          index: turn.index,
          currentNumber,
          previousNumber,
          expectedSum,
          response,
          isi,
          correct: detail.correct,
          responseTimeMs: detail.responseTimeMs,
        };
      });
  }, [report?.turns, trials]);

  // ---------------------------------------------------------------------------
  // Compute metrics
  // ---------------------------------------------------------------------------

  const resolvedAccuracy =
    accuracy ??
    (report?.modeScore.unit === '%'
      ? Math.round(report.modeScore.value)
      : (() => {
          const correct = resolvedTrials.filter((t) => t.correct).length;
          return resolvedTrials.length > 0
            ? Math.round((correct / resolvedTrials.length) * 100)
            : 0;
        })());

  const scoreColor =
    resolvedAccuracy >= 80
      ? 'text-woven-correct'
      : resolvedAccuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  const resolvedFastestIsi =
    fastestIsiMs ??
    (typeof report?.taskMetrics?.['fastestIsiMs'] === 'number'
      ? report.taskMetrics['fastestIsiMs']
      : resolvedTrials.length > 0
        ? Math.min(...resolvedTrials.map((t) => t.isi))
        : 0);

  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((t) => t.correct).length;
  const totalErrors =
    report != null
      ? Math.max(0, report.totals.misses + (report.totals.falseAlarms ?? 0))
      : Math.max(0, resolvedTrials.length - resolvedCorrectTrials);

  const resolvedLongestStreak =
    longestStreak ??
    (typeof report?.taskMetrics?.['longestStreak'] === 'number'
      ? report.taskMetrics['longestStreak']
      : (() => {
          let max = 0;
          let cur = 0;
          for (const trial of resolvedTrials) {
            cur = trial.correct ? cur + 1 : 0;
            if (cur > max) max = cur;
          }
          return max;
        })());

  // ---------------------------------------------------------------------------
  // Performance by ISI level
  // ---------------------------------------------------------------------------

  const isiStats = useMemo(() => {
    const isiLevels = [...new Set(resolvedTrials.map((t) => t.isi))].sort((a, b) => a - b);
    return isiLevels.map((isi) => {
      const matching = resolvedTrials.filter((t) => t.isi === isi);
      const correct = matching.filter((t) => t.correct).length;
      const errors = matching.filter((t) => !t.correct).length;
      const validRts = matching.filter((t) => t.correct && t.response !== null);
      const meanRt =
        validRts.length > 0
          ? Math.round(validRts.reduce((sum, t) => sum + t.responseTimeMs, 0) / validRts.length)
          : 0;
      const acc = matching.length > 0 ? Math.round((correct / matching.length) * 100) : 0;

      return {
        isi,
        label: `${(isi / 1000).toFixed(1)}s`,
        total: matching.length,
        correct,
        errors,
        meanRt,
        accuracy: acc,
      };
    });
  }, [resolvedTrials]);

  // ---------------------------------------------------------------------------
  // Color for ISI level dot
  // ---------------------------------------------------------------------------

  const isiColor = (isi: number): string => {
    if (isi >= 3000) return 'bg-woven-correct';
    if (isi >= 2000) return 'bg-blue-400';
    if (isi >= 1500) return 'bg-violet-400';
    return 'bg-primary';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="pasat-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="pasat-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          {/* HERO */}
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.pasat', 'PASAT')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.pasat.subtitle', 'Processing speed')}
            </p>
            <Hatching id="pasat-report-hero" className="mt-2 text-foreground/70" />
          </div>

          {/* SCORE CARD: Accuracy % (2/3) + Fastest ISI (1/3) */}
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
                id="pasat-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('report.pasat.fastestIsi', 'Fastest ISI')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedFastestIsi > 0 ? `${(resolvedFastestIsi / 1000).toFixed(1)}` : '-'}
                  <span className="text-lg">s</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="pasat-report-score-hatch" className="mt-3 text-foreground/70" />

          {/* KPI GRID: Trials, Correct, Errors, Streak */}
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
                {t('report.pasat.streak', 'Streak')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">{resolvedLongestStreak}</p>
            </div>
          </div>
          <Hatching id="pasat-report-kpi-hatch" className="mt-4 text-foreground/70" />

          {/* DISCLOSURES */}
          <div className="px-2 py-4 space-y-2">
            {/* Performance by ISI level */}
            <Disclosure
              title={t('report.pasat.performanceByIsi', 'Performance by ISI level')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {isiStats.map((stat) => (
                    <div
                      key={stat.isi}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('h-3 w-3 rounded-full shrink-0', isiColor(stat.isi))} />
                        <span className="text-sm font-bold text-woven-text">ISI {stat.label}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {stat.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.pasat.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{stat.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.pasat.errors', 'Errors')}</span>
                          <span className="font-bold text-woven-incorrect">{stat.errors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.pasat.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{stat.meanRt}ms</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.pasat.precision', 'Precision')}</span>
                          <span className="font-bold text-woven-text">{stat.accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            {/* Timeline */}
            <Disclosure
              title={t('report.pasat.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((trial) => (
                      <div key={trial.index} className="relative">
                        <div
                          className={cn(
                            'absolute left-[-20px] top-5 h-4 w-4 rounded-full border-2 border-woven-bg',
                            trial.correct
                              ? 'bg-woven-correct'
                              : trial.response === null
                                ? 'bg-woven-text-muted'
                                : 'bg-woven-incorrect',
                          )}
                        />
                        <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                              {String(trial.index).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-bold text-woven-text">
                              {trial.previousNumber} + {trial.currentNumber} = {trial.expectedSum}
                            </span>
                            <span
                              className={cn(
                                'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                trial.correct
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {trial.correct
                                ? t('report.pasat.correct', 'Correct')
                                : t('report.pasat.wrong', 'Wrong')}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.pasat.number', 'Number')}:{' '}
                              <span className="font-semibold text-woven-text">
                                {trial.currentNumber}
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.pasat.response', 'Response')}:{' '}
                              <span className="font-semibold text-primary">
                                {trial.response !== null
                                  ? trial.response
                                  : t('report.pasat.timeout', 'Timeout')}
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              ISI:{' '}
                              <span className="font-semibold text-woven-text">
                                {(trial.isi / 1000).toFixed(1)}s
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                              {Math.round(trial.responseTimeMs)}ms
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-1 font-bold',
                                trial.correct
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : trial.response === null
                                    ? 'bg-woven-text/10 text-woven-text'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {trial.response === null
                                ? t('report.pasat.timeout', 'Timeout')
                                : trial.correct
                                  ? t('report.pasat.correct', 'Correct')
                                  : t('report.pasat.error', 'Error')}
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

          {/* ACTIONS */}
          <Hatching id="pasat-report-actions-hatch" className="text-foreground/70" />
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
          id="pasat-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="pasat-report-bottom" className="text-foreground/70" />
    </div>
  );
}
