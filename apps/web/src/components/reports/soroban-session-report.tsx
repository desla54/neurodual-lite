import type { ReactNode } from 'react';
import { ArrowClockwise, House, ListChecks, Timer } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface SorobanSessionReportProps {
  readonly trials: readonly SorobanTrialView[];
  readonly totalTrials: number;
  readonly accuracy: number;
  readonly avgRtMs: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface SorobanTrialView {
  readonly index: number;
  readonly targetNumber: number;
  readonly playerAnswer: number;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly rodCount: number;
}

export type { SorobanSessionReportProps, SorobanTrialView };

export function SorobanSessionReport({
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  onPlayAgain,
  onBackToHome,
}: SorobanSessionReportProps): ReactNode {
  const { t } = useTranslation();

  const scoreColor =
    accuracy >= 80
      ? 'text-woven-correct'
      : accuracy >= 50
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  const correctCount = trials.filter((trial) => trial.correct).length;
  const errorCount = Math.max(0, trials.length - correctCount);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="soroban-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="soroban-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.soroban', 'Soroban')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.soroban.mentalArithmetic', 'Mental Arithmetic')}
            </p>
            <Hatching id="soroban-report-hero" className="mt-2 text-foreground/70" />
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
                  {accuracy}%
                </span>
              </div>
              <Hatching
                id="soroban-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('game.cogTask.avgRt')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {avgRtMs}
                  <span className="text-lg">ms</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="soroban-report-score-hatch" className="mt-3 text-foreground/70" />

          <div className="px-2 mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.trials')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">{totalTrials}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.correct')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">{correctCount}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.errors')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-incorrect">{errorCount}</p>
            </div>
          </div>
          <Hatching id="soroban-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            <Disclosure
              title={t('report.soroban.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {trials.map((trial) => (
                      <div key={trial.index} className="relative">
                        <div
                          className={cn(
                            'absolute left-[-20px] top-5 h-4 w-4 rounded-full border-2 border-woven-bg',
                            trial.correct ? 'bg-woven-correct' : 'bg-woven-incorrect',
                          )}
                        />
                        <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                              {String(trial.index).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-primary">
                              {trial.targetNumber}
                            </span>
                            <span
                              className={cn(
                                'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                trial.correct
                                  ? 'bg-woven-correct/12 text-woven-correct'
                                  : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {trial.correct ? t('game.cogTask.correct') : t('game.cogTask.errors')}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.soroban.target', 'Target')}:{' '}
                              <span className="font-semibold text-primary">
                                {trial.targetNumber}
                              </span>
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1">
                              {t('report.soroban.answer', 'Answer')}:{' '}
                              <span
                                className={cn(
                                  'font-semibold',
                                  trial.correct ? 'text-woven-correct' : 'text-woven-incorrect',
                                )}
                              >
                                {trial.playerAnswer}
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
                                  : 'bg-woven-incorrect/12 text-woven-incorrect',
                              )}
                            >
                              {trial.correct ? t('game.cogTask.correct') : t('game.cogTask.errors')}
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

          <Hatching id="soroban-report-actions-hatch" className="text-foreground/70" />
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
          id="soroban-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="soroban-report-bottom" className="text-foreground/70" />
    </div>
  );
}
