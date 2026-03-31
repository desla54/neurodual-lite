import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface DigitSpanSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly maxForwardSpan?: number;
  readonly maxBackwardSpan?: number;
  readonly avgRtMs?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface DigitSpanTrialView {
  readonly index: number;
  readonly phase: 'forward' | 'backward';
  readonly span: number;
  readonly sequence: readonly number[];
  readonly playerInput: readonly number[];
  readonly correct: boolean;
  readonly responseTimeMs: number;
}

type DigitSpanTurn = NonNullable<SessionEndReportModel['turns']>[number] & {
  detail: Extract<
    NonNullable<SessionEndReportModel['turns']>[number]['detail'],
    { kind: 'cognitive-task-trial' }
  >;
};

function isDigitSpanPhase(value: unknown): value is DigitSpanTrialView['phase'] {
  return value === 'forward' || value === 'backward';
}

function getNumberArray(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function formatDigits(values: readonly number[]): string {
  return values.length > 0 ? values.join(' ') : '-';
}

export function DigitSpanSessionReport({
  report,
  totalTrials,
  accuracy,
  maxForwardSpan,
  maxBackwardSpan,
  avgRtMs,
  onPlayAgain,
  onBackToHome,
}: DigitSpanSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<DigitSpanTrialView[]>(() => {
    const reportTurns = report?.turns ?? [];

    return reportTurns
      .filter(
        (turn): turn is DigitSpanTurn =>
          turn.kind === 'cognitive-task-trial' && turn.detail.kind === 'cognitive-task-trial',
      )
      .map((turn) => {
        const detail = turn.detail;
        const phase = isDigitSpanPhase(detail.condition) ? detail.condition : 'forward';
        const trialData = detail.trialData ?? {};

        return {
          index: turn.index,
          phase,
          span:
            typeof trialData['span'] === 'number' && Number.isFinite(trialData['span'])
              ? Math.round(trialData['span'])
              : 0,
          sequence: getNumberArray(trialData['sequence']),
          playerInput: getNumberArray(trialData['playerInput']),
          correct: detail.correct,
          responseTimeMs: detail.responseTimeMs,
        };
      });
  }, [report?.turns]);

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
  const resolvedAvgRtMs =
    avgRtMs ??
    (resolvedTrials.length > 0
      ? Math.round(
          resolvedTrials.reduce((sum, trial) => sum + trial.responseTimeMs, 0) /
            resolvedTrials.length,
        )
      : 0);
  const resolvedMaxForwardSpan =
    maxForwardSpan ??
    (typeof report?.taskMetrics?.['maxForwardSpan'] === 'number'
      ? Math.round(report.taskMetrics['maxForwardSpan'])
      : undefined) ??
    resolvedTrials.reduce((currentMax, trial) => {
      return trial.phase === 'forward' && trial.correct && trial.span > currentMax
        ? trial.span
        : currentMax;
    }, 0);
  const resolvedMaxBackwardSpan =
    maxBackwardSpan ??
    (typeof report?.taskMetrics?.['maxBackwardSpan'] === 'number'
      ? Math.round(report.taskMetrics['maxBackwardSpan'])
      : undefined) ??
    resolvedTrials.reduce((currentMax, trial) => {
      return trial.phase === 'backward' && trial.correct && trial.span > currentMax
        ? trial.span
        : currentMax;
    }, 0);
  const totalErrors = Math.max(0, resolvedTotalTrials - resolvedCorrectTrials);

  const scoreColor =
    resolvedAccuracy >= 80
      ? 'text-woven-correct'
      : resolvedAccuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  const spanStats = useMemo(() => {
    const byKey = new Map<
      string,
      {
        phase: DigitSpanTrialView['phase'];
        span: number;
        total: number;
        correct: number;
        avgRtMs: number;
      }
    >();

    for (const trial of resolvedTrials) {
      const key = `${trial.phase}:${trial.span}`;
      const current = byKey.get(key) ?? {
        phase: trial.phase,
        span: trial.span,
        total: 0,
        correct: 0,
        avgRtMs: 0,
      };
      current.total += 1;
      current.correct += trial.correct ? 1 : 0;
      current.avgRtMs += trial.responseTimeMs;
      byKey.set(key, current);
    }

    return [...byKey.values()]
      .sort((left, right) => {
        if (left.phase !== right.phase) return left.phase === 'forward' ? -1 : 1;
        return left.span - right.span;
      })
      .map((stats) => ({
        ...stats,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        avgRtMs: stats.total > 0 ? Math.round(stats.avgRtMs / stats.total) : 0,
      }));
  }, [resolvedTrials]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="digit-span-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="digit-span-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('game.cogTask.digitSpan.heroTitle')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('settings.gameMode.digitSpanDesc')}
            </p>
            <Hatching id="digit-span-report-hero" className="mt-2 text-foreground/70" />
          </div>

          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-1/2 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.forward')}
                </p>
                <span
                  className={cn(
                    'text-5xl sm:text-6xl font-black tabular-nums tracking-tight',
                    scoreColor,
                  )}
                >
                  {resolvedMaxForwardSpan}
                </span>
              </div>
              <Hatching
                id="digit-span-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/2 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.backward')}
                </p>
                <span
                  className={cn(
                    'text-5xl sm:text-6xl font-black tabular-nums tracking-tight',
                    scoreColor,
                  )}
                >
                  {resolvedMaxBackwardSpan}
                </span>
              </div>
            </div>
          </div>
          <Hatching id="digit-span-report-score-hatch" className="mt-3 text-foreground/70" />

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
          <Hatching id="digit-span-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('game.cogTask.performance')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="space-y-2">
                  {spanStats.length > 0 ? (
                    spanStats.map((spanStat) => (
                      <div
                        key={`${spanStat.phase}-${spanStat.span}`}
                        className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-2 rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-2"
                      >
                        <span className="text-sm font-bold text-primary">
                          {spanStat.phase === 'forward'
                            ? t('game.cogTask.forward')
                            : t('game.cogTask.backward')}{' '}
                          {spanStat.span}
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
              title={t('game.cogTask.trialDetail')}
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
                          <span className="text-sm font-bold text-woven-text">#{trial.index}</span>
                          <span className="text-sm font-medium text-primary">
                            {trial.phase === 'forward'
                              ? t('game.cogTask.forward')
                              : t('game.cogTask.backward')}{' '}
                            {trial.span}
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
                              {formatDigits(trial.sequence)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-woven-text-muted">
                              {t('report.corsi.recalled', 'Recalled')}
                            </span>
                            <span className="font-mono text-woven-text">
                              {formatDigits(trial.playerInput)}
                            </span>
                          </div>
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

          <Hatching id="digit-span-report-actions-hatch" className="text-foreground/70" />
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
          </div>
        </div>
        <Hatching
          id="digit-span-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="digit-span-report-bottom" className="text-foreground/70" />
    </div>
  );
}
