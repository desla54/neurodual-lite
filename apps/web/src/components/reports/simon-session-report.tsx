import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

type Side = 'left' | 'right';
type SimonColor = 'red' | 'blue';

const COLOR_HEX: Record<SimonColor, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
};

interface SimonSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly SimonTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly avgRtMs?: number;
  readonly simonEffectMs?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface SimonTrialView {
  readonly index: number;
  readonly stimulusColor: SimonColor;
  readonly stimulusSide: Side;
  readonly correctSide: Side;
  readonly response: Side | null;
  readonly correct: boolean;
  readonly timedOut: boolean;
  readonly responseTimeMs: number;
  readonly congruent: boolean;
}

function isSide(value: unknown): value is Side {
  return value === 'left' || value === 'right';
}

function isSimonColor(value: unknown): value is SimonColor {
  return value === 'red' || value === 'blue';
}

function inferCorrectSide(color: SimonColor): Side {
  return color === 'red' ? 'left' : 'right';
}

function inferCongruent(color: SimonColor, side: Side): boolean {
  return (color === 'red' && side === 'left') || (color === 'blue' && side === 'right');
}

export function SimonSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  simonEffectMs,
  onPlayAgain,
  onBackToHome,
}: SimonSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<SimonTrialView[]>(() => {
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
        const stimulusColor = isSimonColor(trialData['stimulusColor'])
          ? trialData['stimulusColor']
          : 'red';
        const stimulusSide = isSide(trialData['stimulusSide']) ? trialData['stimulusSide'] : 'left';
        const correctSide = isSide(trialData['correctSide'])
          ? trialData['correctSide']
          : inferCorrectSide(stimulusColor);
        const congruent =
          detail.condition === 'congruent'
            ? true
            : detail.condition === 'incongruent'
              ? false
              : inferCongruent(stimulusColor, stimulusSide);
        const response = isSide(trialData['response']) ? trialData['response'] : null;
        const timedOut = trialData['timedOut'] === true;

        return {
          index: turn.index,
          stimulusColor,
          stimulusSide,
          correctSide,
          response,
          correct: detail.correct,
          timedOut,
          responseTimeMs: detail.responseTimeMs,
          congruent,
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
    (resolvedTrials.length > 0
      ? Math.round(
          resolvedTrials.filter((t) => !t.timedOut).reduce((sum, t) => sum + t.responseTimeMs, 0) /
            Math.max(1, resolvedTrials.filter((t) => !t.timedOut).length),
        )
      : 0);
  const resolvedSimonEffect =
    simonEffectMs ??
    (typeof report?.taskMetrics?.['simonEffectMs'] === 'number'
      ? Math.round(report.taskMetrics['simonEffectMs'])
      : (() => {
          const congruent = resolvedTrials.filter((t) => t.congruent && t.correct && !t.timedOut);
          const incongruent = resolvedTrials.filter(
            (t) => !t.congruent && t.correct && !t.timedOut,
          );
          const meanCongruent =
            congruent.length > 0
              ? congruent.reduce((sum, t) => sum + t.responseTimeMs, 0) / congruent.length
              : 0;
          const meanIncongruent =
            incongruent.length > 0
              ? incongruent.reduce((sum, t) => sum + t.responseTimeMs, 0) / incongruent.length
              : 0;
          return Math.round(meanIncongruent - meanCongruent);
        })());
  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((t) => t.correct).length;
  const totalErrors = Math.max(0, resolvedTotalTrials - resolvedCorrectTrials);

  const conditionStats = useMemo(() => {
    return [true, false].map((congruent) => {
      const matchingTrials = resolvedTrials.filter((t) => t.congruent === congruent);
      const correct = matchingTrials.filter((t) => t.correct).length;
      const errors = matchingTrials.filter((t) => !t.correct && !t.timedOut).length;
      const timedOut = matchingTrials.filter((t) => t.timedOut).length;
      const validRts = matchingTrials.filter((t) => t.correct && !t.timedOut);
      const meanRt =
        validRts.length > 0
          ? Math.round(validRts.reduce((sum, t) => sum + t.responseTimeMs, 0) / validRts.length)
          : 0;

      return {
        id: congruent ? 'congruent' : 'incongruent',
        label: congruent
          ? t('report.simon.congruent', 'Congruent')
          : t('report.simon.incongruent', 'Incongruent'),
        total: matchingTrials.length,
        correct,
        errors,
        timedOut,
        meanRt,
        accuracy:
          matchingTrials.length > 0 ? Math.round((correct / matchingTrials.length) * 100) : 0,
      };
    });
  }, [resolvedTrials, t]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="simon-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="simon-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.simon', 'Simon')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.simon.spatialInterference', 'Spatial interference')}
            </p>
            <Hatching id="simon-report-hero" className="mt-2 text-foreground/70" />
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
                id="simon-report-score-divider"
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
          <Hatching id="simon-report-score-hatch" className="mt-3 text-foreground/70" />

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
                {t('report.simon.simonEffect', 'Simon Effect')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">{resolvedSimonEffect}ms</p>
            </div>
          </div>
          <Hatching id="simon-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.simon.performanceByCondition', 'Performance by condition')}
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
                            condition.id === 'congruent' ? 'bg-woven-correct' : 'bg-primary',
                          )}
                        />
                        <span className="text-sm font-bold text-woven-text">{condition.label}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {condition.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.simon.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{condition.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.simon.error', 'Error')}</span>
                          <span className="font-bold text-woven-incorrect">{condition.errors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.simon.timeout', 'Timeout')}</span>
                          <span className="font-bold text-woven-text">{condition.timedOut}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.simon.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{condition.meanRt}ms</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.simon.precision', 'Precision')}</span>
                          <span className="font-bold text-woven-text">{condition.accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t('report.simon.timeline', 'Timeline')}
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
                              className="h-5 w-5 rounded-full shrink-0"
                              style={{ backgroundColor: COLOR_HEX[turn.stimulusColor] }}
                            />
                            <span className="text-xs text-woven-text-muted">
                              {turn.stimulusSide === 'left'
                                ? t('game.cogTask.left')
                                : t('game.cogTask.right')}
                            </span>
                            <span
                              className={cn(
                                'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                turn.congruent
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : 'bg-primary/12 text-primary',
                              )}
                            >
                              {turn.congruent
                                ? t('report.simon.congruent', 'Congruent')
                                : t('report.simon.incongruent', 'Incongruent')}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.simon.color', 'Color')}:{' '}
                              <span
                                className="font-semibold"
                                style={{ color: COLOR_HEX[turn.stimulusColor] }}
                              >
                                {turn.stimulusColor === 'red'
                                  ? t('game.cogTask.simon.red', 'Red')
                                  : t('game.cogTask.simon.blue', 'Blue')}
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.simon.position', 'Position')}:{' '}
                              <span className="font-semibold text-woven-text">
                                {turn.stimulusSide === 'left'
                                  ? t('game.cogTask.left')
                                  : t('game.cogTask.right')}
                              </span>
                            </span>
                            {turn.response ? (
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.simon.response', 'Response')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {turn.response === 'left'
                                    ? t('game.cogTask.left')
                                    : t('game.cogTask.right')}
                                </span>
                              </span>
                            ) : null}
                            {!turn.timedOut && (
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
                                  : turn.timedOut
                                    ? 'bg-woven-text/10 text-woven-text'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {turn.timedOut
                                ? t('report.simon.timeout', 'Timeout')
                                : turn.correct
                                  ? t('report.simon.correct', 'Correct')
                                  : t('report.simon.error', 'Error')}
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

          <Hatching id="simon-report-actions-hatch" className="text-foreground/70" />
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
          id="simon-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="simon-report-bottom" className="text-foreground/70" />
    </div>
  );
}
