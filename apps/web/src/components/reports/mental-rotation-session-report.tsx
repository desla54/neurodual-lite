import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface MentalRotationSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly MentalRotationTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly avgRtMs?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface MentalRotationTrialView {
  readonly index: number;
  readonly rotationDeg: number;
  /** What the user selected: match (correct), mirror, distractor, or null (timeout) */
  readonly selectedType: 'match' | 'mirror' | 'distractor' | null;
  readonly correct: boolean;
  readonly timedOut: boolean;
  readonly responseTimeMs: number;
}

export function MentalRotationSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  onPlayAgain,
  onBackToHome,
}: MentalRotationSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const resolvedTrials = useMemo<MentalRotationTrialView[]>(() => {
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
        const rotationDeg =
          typeof trialData['rotationDeg'] === 'number' ? trialData['rotationDeg'] : 0;

        // New format: selectedType is 'match' | 'mirror' | 'distractor' | 'timeout'
        const rawSelectedType = trialData['selectedType'];
        // Legacy format: response is 'same' | 'mirror' | 'timeout', isMirror is boolean
        const rawResponse = trialData['response'];

        let selectedType: 'match' | 'mirror' | 'distractor' | null;
        let timedOut: boolean;

        if (
          rawSelectedType === 'match' ||
          rawSelectedType === 'mirror' ||
          rawSelectedType === 'distractor'
        ) {
          selectedType = rawSelectedType;
          timedOut = false;
        } else if (rawSelectedType === 'timeout') {
          selectedType = null;
          timedOut = true;
        } else if (rawResponse === 'timeout') {
          // Legacy format
          selectedType = null;
          timedOut = true;
        } else if (rawResponse === 'same') {
          selectedType = 'match';
          timedOut = false;
        } else if (rawResponse === 'mirror') {
          selectedType = 'mirror';
          timedOut = false;
        } else {
          selectedType = null;
          timedOut = trialData['timedOut'] === true;
        }

        return {
          index: turn.index,
          rotationDeg,
          selectedType,
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

  const ROTATION_ANGLES = [0, 60, 120, 180, 240, 300] as const;

  const angleStats = useMemo(() => {
    return ROTATION_ANGLES.map((angle) => {
      const matchingTurns = resolvedTrials.filter((turn) => turn.rotationDeg === angle);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const validRts = matchingTurns.filter((turn) => turn.correct && !turn.timedOut);
      const meanRt =
        validRts.length > 0
          ? Math.round(
              validRts.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / validRts.length,
            )
          : 0;

      return {
        angle,
        total: matchingTurns.length,
        correct,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
        meanRt,
      };
    });
  }, [resolvedTrials]);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="mental-rotation-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="mental-rotation-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('report.mentalRotation.title', 'Mental Rotation')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.mentalRotation.subtitle', 'Spatial reasoning')}
            </p>
            <Hatching id="mental-rotation-report-hero" className="mt-2 text-foreground/70" />
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
                id="mental-rotation-report-score-divider"
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
          <Hatching id="mental-rotation-report-score-hatch" className="mt-3 text-foreground/70" />

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
                {t('report.mentalRotation.timeouts', 'Timeouts')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">{totalTimeouts}</p>
            </div>
          </div>
          <Hatching id="mental-rotation-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.mentalRotation.performanceByAngle', 'Performance by rotation angle')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-3 gap-2">
                  {angleStats.map((stat) => (
                    <div
                      key={stat.angle}
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
                        <span className="text-sm font-bold text-woven-text">{stat.angle}°</span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {stat.total}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.mentalRotation.accuracy', 'Accuracy')}</span>
                          <span className="font-bold text-woven-text">{stat.accuracy}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.mentalRotation.avgRt', 'Avg RT')}</span>
                          <span className="font-bold text-woven-text">{stat.meanRt}ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t('report.mentalRotation.timeline', 'Timeline')}
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
                                'bg-amber-500/12 text-amber-400',
                              )}
                            >
                              {turn.rotationDeg}°
                            </span>
                            {turn.selectedType && (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                  turn.selectedType === 'match'
                                    ? 'bg-woven-correct/12 text-woven-correct'
                                    : turn.selectedType === 'mirror'
                                      ? 'bg-primary/12 text-primary'
                                      : 'bg-woven-text/12 text-woven-text-muted',
                                )}
                              >
                                {turn.selectedType === 'match'
                                  ? t('report.mentalRotation.same', 'Match')
                                  : turn.selectedType === 'mirror'
                                    ? t('report.mentalRotation.mirror', 'Mirror')
                                    : t('report.mentalRotation.distractor', 'Other')}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
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
                                ? t('report.mentalRotation.timeout', 'Timeout')
                                : turn.correct
                                  ? t('report.mentalRotation.correct', 'Correct')
                                  : t('report.mentalRotation.error', 'Error')}
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

          <Hatching id="mental-rotation-report-actions-hatch" className="text-foreground/70" />
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
          id="mental-rotation-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="mental-rotation-report-bottom" className="text-foreground/70" />
    </div>
  );
}
