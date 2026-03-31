import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  computeGoNoGoDPrime,
  type CognitiveTaskTrialDetail,
  type SessionEndReportModel,
} from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

type StimulusType = 'go' | 'nogo';

interface GoNoGoSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly GoNoGoTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly avgRtMs?: number;
  readonly dPrime?: number | null;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface GoNoGoTrialView {
  readonly index: number;
  readonly stimulusType: StimulusType;
  readonly responded: boolean;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly outcome: 'hit' | 'miss' | 'false_alarm' | 'correct_rejection';
}

function isStimulusType(value: unknown): value is StimulusType {
  return value === 'go' || value === 'nogo';
}

function inferOutcome(stimulusType: StimulusType, responded: boolean): GoNoGoTrialView['outcome'] {
  if (stimulusType === 'go') return responded ? 'hit' : 'miss';
  return responded ? 'false_alarm' : 'correct_rejection';
}

export function GoNoGoSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  dPrime,
  onPlayAgain,
  onBackToHome,
}: GoNoGoSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<GoNoGoTrialView[]>(() => {
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
        const stimulusType = isStimulusType(trialData['stimulusType'])
          ? trialData['stimulusType']
          : isStimulusType(trialData['trialType'])
            ? trialData['trialType']
            : 'go';
        const responded = trialData['responded'] === true;
        const outcome =
          trialData['outcome'] === 'hit' ||
          trialData['outcome'] === 'miss' ||
          trialData['outcome'] === 'false_alarm' ||
          trialData['outcome'] === 'correct_rejection'
            ? (trialData['outcome'] as GoNoGoTrialView['outcome'])
            : inferOutcome(stimulusType, responded);

        return {
          index: turn.index,
          stimulusType,
          responded,
          correct: detail.correct,
          responseTimeMs: detail.responseTimeMs,
          outcome,
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
  const resolvedAvgRtMs =
    avgRtMs ??
    (() => {
      const responded = resolvedTrials.filter((t) => t.responded && t.responseTimeMs > 0);
      return responded.length > 0
        ? Math.round(responded.reduce((sum, t) => sum + t.responseTimeMs, 0) / responded.length)
        : 0;
    })();
  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedHits = resolvedTrials.filter((t) => t.outcome === 'hit').length;
  const resolvedMisses = resolvedTrials.filter((t) => t.outcome === 'miss').length;
  const resolvedFalseAlarms = resolvedTrials.filter((t) => t.outcome === 'false_alarm').length;
  const resolvedCorrectRejections = resolvedTrials.filter(
    (t) => t.outcome === 'correct_rejection',
  ).length;
  const resolvedMeanRt = resolvedAvgRtMs;
  const resolvedDPrime = useMemo(() => {
    if (typeof dPrime === 'number' && Number.isFinite(dPrime)) return dPrime;
    const metricDPrime = report?.taskMetrics?.['dPrime'];
    if (typeof metricDPrime === 'number' && Number.isFinite(metricDPrime)) return metricDPrime;
    return computeGoNoGoDPrime(
      resolvedHits,
      resolvedMisses,
      resolvedFalseAlarms,
      resolvedCorrectRejections,
    );
  }, [
    dPrime,
    report?.taskMetrics,
    resolvedCorrectRejections,
    resolvedFalseAlarms,
    resolvedHits,
    resolvedMisses,
  ]);
  const dPrimeColor =
    resolvedDPrime >= 2
      ? 'text-woven-correct'
      : resolvedDPrime >= 1
        ? 'text-woven-amber'
        : 'text-woven-incorrect';
  const dPrimeInsight = t(
    'report.modeScore.dprimeTooltip',
    "Signal Detection Theory: d' >= 2.0 = good discrimination",
  );

  const conditionStats = useMemo(() => {
    const goTrials = resolvedTrials.filter((t) => t.stimulusType === 'go');
    const nogoTrials = resolvedTrials.filter((t) => t.stimulusType === 'nogo');

    const goHits = goTrials.filter((t) => t.outcome === 'hit').length;
    const goMisses = goTrials.filter((t) => t.outcome === 'miss').length;
    const goRespondedRts = goTrials.filter((t) => t.responded && t.responseTimeMs > 0);
    const goMeanRt =
      goRespondedRts.length > 0
        ? Math.round(
            goRespondedRts.reduce((sum, t) => sum + t.responseTimeMs, 0) / goRespondedRts.length,
          )
        : 0;

    const nogoCorrectRejections = nogoTrials.filter(
      (t) => t.outcome === 'correct_rejection',
    ).length;
    const nogoFalseAlarms = nogoTrials.filter((t) => t.outcome === 'false_alarm').length;
    const nogoRespondedRts = nogoTrials.filter((t) => t.responded && t.responseTimeMs > 0);
    const nogoMeanRt =
      nogoRespondedRts.length > 0
        ? Math.round(
            nogoRespondedRts.reduce((sum, t) => sum + t.responseTimeMs, 0) /
              nogoRespondedRts.length,
          )
        : 0;

    return [
      {
        id: 'go' as const,
        label: t('report.goNogo.go', 'Go'),
        total: goTrials.length,
        hits: goHits,
        misses: goMisses,
        meanRt: goMeanRt,
        accuracy: goTrials.length > 0 ? Math.round((goHits / goTrials.length) * 100) : 0,
      },
      {
        id: 'nogo' as const,
        label: t('report.goNogo.nogo', 'No-Go'),
        total: nogoTrials.length,
        correctRejections: nogoCorrectRejections,
        falseAlarms: nogoFalseAlarms,
        meanRt: nogoMeanRt,
        accuracy:
          nogoTrials.length > 0 ? Math.round((nogoCorrectRejections / nogoTrials.length) * 100) : 0,
      },
    ];
  }, [resolvedTrials, t]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="gonogo-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="gonogo-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.goNogo', 'Go / No-Go')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.goNogo.inhibitionControl', 'Inhibition control')}
            </p>
            <Hatching id="gonogo-report-hero" className="mt-2 text-foreground/70" />
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
                id="gonogo-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.avgRt')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedMeanRt}
                  <span className="text-lg">ms</span>
                </span>
              </div>
            </div>
          </div>
          <p className="px-3 mt-2 text-center text-xs text-woven-text-muted">{dPrimeInsight}</p>
          <Hatching id="gonogo-report-score-hatch" className="mt-3 text-foreground/70" />

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
                {t('game.cogTask.hits')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">{resolvedHits}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.falseAlarms')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-incorrect">
                {resolvedFalseAlarms}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                d{'\u2032'}
              </p>
              <p className={cn('text-lg font-bold tabular-nums', dPrimeColor)}>
                {resolvedDPrime.toFixed(2)}
              </p>
            </div>
          </div>
          <Hatching id="gonogo-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.goNogo.performanceByCondition', 'Performance by condition')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {conditionStats.map((condition) => (
                    <div
                      key={condition.id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-3 w-3 rounded-full shrink-0',
                            condition.id === 'go' ? 'bg-woven-correct' : 'bg-woven-incorrect',
                          )}
                        />
                        <span className="text-sm font-bold text-woven-text">{condition.label}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {condition.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        {condition.id === 'go' ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span>{t('report.goNogo.hits', 'Hits')}</span>
                              <span className="font-bold text-woven-correct">{condition.hits}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t('report.goNogo.misses', 'Misses')}</span>
                              <span className="font-bold text-woven-incorrect">
                                {condition.misses}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span>
                                {t('report.goNogo.correctRejections', 'Correct rejections')}
                              </span>
                              <span className="font-bold text-woven-correct">
                                {condition.correctRejections}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t('report.goNogo.falseAlarms', 'False alarms')}</span>
                              <span className="font-bold text-woven-incorrect">
                                {condition.falseAlarms}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between">
                          <span>{t('report.goNogo.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{condition.meanRt}ms</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.goNogo.precision', 'Precision')}</span>
                          <span className="font-bold text-woven-text">{condition.accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t('report.goNogo.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((turn) => {
                      const isGo = turn.stimulusType === 'go';

                      return (
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
                              <span
                                className={cn(
                                  'h-5 w-5 rounded-full shrink-0',
                                  isGo ? 'bg-emerald-500' : 'bg-red-500',
                                )}
                              />
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                  isGo
                                    ? 'bg-woven-correct/12 text-woven-correct'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                                )}
                              >
                                {isGo
                                  ? t('report.goNogo.go', 'Go')
                                  : t('report.goNogo.nogo', 'No-Go')}
                              </span>
                              <span className="ml-auto text-xs text-woven-text-muted">
                                {turn.responded
                                  ? t('report.goNogo.tapped', 'Tapped')
                                  : t('report.goNogo.withheld', 'Withheld')}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.goNogo.stimulus', 'Stimulus')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {isGo ? 'GO' : 'NOGO'}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.goNogo.response', 'Response')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {turn.responded
                                    ? t('report.goNogo.tap', 'Tap')
                                    : t('report.goNogo.withhold', 'Withhold')}
                                </span>
                              </span>
                              {turn.responded && turn.responseTimeMs > 0 && (
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
                                {turn.outcome === 'hit'
                                  ? t('report.goNogo.hit', 'Hit')
                                  : turn.outcome === 'miss'
                                    ? t('report.goNogo.miss', 'Miss')
                                    : turn.outcome === 'false_alarm'
                                      ? t('report.goNogo.falseAlarm', 'False Alarm')
                                      : t('report.goNogo.correctRejection', 'Correct Rejection')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            />
          </div>

          <Hatching id="gonogo-report-actions-hatch" className="text-foreground/70" />
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
          id="gonogo-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="gonogo-report-bottom" className="text-foreground/70" />
    </div>
  );
}
