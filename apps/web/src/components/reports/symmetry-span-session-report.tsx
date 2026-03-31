import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

interface SymmetrySpanSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly SymmetrySpanSetView[];
  readonly totalSets?: number;
  readonly maxSpan?: number;
  readonly recallAccuracy?: number;
  readonly processingAccuracy?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface SymmetrySpanSetView {
  readonly index: number;
  readonly setSize: number;
  readonly recallCorrect: boolean;
  readonly recalledPositions: readonly number[];
  readonly expectedPositions: readonly number[];
  readonly symmetryAccuracy: number;
  readonly symmetryResponses: readonly boolean[];
}

// =============================================================================
// Helpers
// =============================================================================

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((v): v is number => typeof v === 'number');
  return [];
}

function toBooleanArray(value: unknown): boolean[] {
  if (Array.isArray(value)) return value.filter((v): v is boolean => typeof v === 'boolean');
  return [];
}

// =============================================================================
// Component
// =============================================================================

export function SymmetrySpanSessionReport({
  report,
  trials,
  totalSets,
  maxSpan,
  recallAccuracy,
  processingAccuracy,
  onPlayAgain,
  onBackToHome,
}: SymmetrySpanSessionReportProps): ReactNode {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Resolve trials from either live data or historical report
  // ---------------------------------------------------------------------------

  const resolvedTrials = useMemo<SymmetrySpanSetView[]>(() => {
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

        const setSize = typeof trialData['setSize'] === 'number' ? trialData['setSize'] : 2;
        const recallCorrect = trialData['recallCorrect'] === true;
        const recalledPositions = toNumberArray(trialData['recalledPositions']);
        const expectedPositions = toNumberArray(trialData['expectedPositions']);
        const symmetryAccuracy =
          typeof trialData['symmetryAccuracy'] === 'number' ? trialData['symmetryAccuracy'] : 0;
        const symmetryResponses = toBooleanArray(trialData['symmetryResponses']);

        return {
          index: turn.index,
          setSize,
          recallCorrect,
          recalledPositions,
          expectedPositions,
          symmetryAccuracy,
          symmetryResponses,
        };
      });
  }, [report?.turns, trials]);

  // ---------------------------------------------------------------------------
  // Compute metrics
  // ---------------------------------------------------------------------------

  const resolvedMaxSpan =
    maxSpan ??
    (typeof report?.taskMetrics?.['maxSpan'] === 'number'
      ? report.taskMetrics['maxSpan']
      : resolvedTrials.reduce((max, s) => (s.recallCorrect ? Math.max(max, s.setSize) : max), 0));

  const spanColor =
    resolvedMaxSpan >= 5
      ? 'text-woven-correct'
      : resolvedMaxSpan >= 3
        ? 'text-woven-amber'
        : 'text-woven-incorrect';

  const resolvedRecallAccuracy =
    recallAccuracy ??
    (report?.modeScore.unit === '%'
      ? Math.round(report.modeScore.value)
      : (() => {
          const totalPos = resolvedTrials.reduce((s, set) => s + set.expectedPositions.length, 0);
          const correctPos = resolvedTrials.reduce((s, set) => {
            let c = 0;
            for (let i = 0; i < set.expectedPositions.length; i++) {
              if (set.recalledPositions[i] === set.expectedPositions[i]) c++;
            }
            return s + c;
          }, 0);
          return totalPos > 0 ? Math.round((correctPos / totalPos) * 100) : 0;
        })());

  const resolvedProcessingAccuracy =
    processingAccuracy ??
    (typeof report?.taskMetrics?.['processingAccuracy'] === 'number'
      ? Math.round(report.taskMetrics['processingAccuracy'] as number)
      : (() => {
          const totalSym = resolvedTrials.reduce((s, set) => s + set.symmetryResponses.length, 0);
          const correctSym = resolvedTrials.reduce(
            (s, set) => s + set.symmetryResponses.filter(Boolean).length,
            0,
          );
          return totalSym > 0 ? Math.round((correctSym / totalSym) * 100) : 0;
        })());

  const resolvedTotalSets = totalSets ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectSets =
    report?.totals.hits ?? resolvedTrials.filter((s) => s.recallCorrect).length;

  // ---------------------------------------------------------------------------
  // Performance by set size
  // ---------------------------------------------------------------------------

  const setSizeStats = useMemo(() => {
    const sizes = [...new Set(resolvedTrials.map((s) => s.setSize))].sort((a, b) => a - b);
    return sizes.map((size) => {
      const matching = resolvedTrials.filter((s) => s.setSize === size);
      const correct = matching.filter((s) => s.recallCorrect).length;
      const totalPos = matching.reduce((s, set) => s + set.expectedPositions.length, 0);
      const correctPos = matching.reduce((s, set) => {
        let c = 0;
        for (let i = 0; i < set.expectedPositions.length; i++) {
          if (set.recalledPositions[i] === set.expectedPositions[i]) c++;
        }
        return s + c;
      }, 0);
      const totalSym = matching.reduce((s, set) => s + set.symmetryResponses.length, 0);
      const correctSym = matching.reduce(
        (s, set) => s + set.symmetryResponses.filter(Boolean).length,
        0,
      );

      return {
        size,
        total: matching.length,
        correct,
        recallAccuracy: totalPos > 0 ? Math.round((correctPos / totalPos) * 100) : 0,
        processingAccuracy: totalSym > 0 ? Math.round((correctSym / totalSym) * 100) : 0,
      };
    });
  }, [resolvedTrials]);

  // ---------------------------------------------------------------------------
  // Color for set size dot
  // ---------------------------------------------------------------------------

  const setSizeColor = (size: number): string => {
    if (size <= 2) return 'bg-woven-correct';
    if (size <= 3) return 'bg-blue-400';
    if (size <= 4) return 'bg-violet-400';
    return 'bg-primary';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="symspan-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="symspan-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          {/* HERO */}
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.symmetrySpan', 'Symmetry Span')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.symmetrySpan.subtitle', 'Complex working memory')}
            </p>
            <Hatching id="symspan-report-hero" className="mt-2 text-foreground/70" />
          </div>

          {/* SCORE CARD: Max Span (2/3) + Recall Accuracy (1/3) */}
          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('report.symmetrySpan.maxSpan', 'Max Span')}
                </p>
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                    spanColor,
                  )}
                >
                  {resolvedMaxSpan}
                </span>
              </div>
              <Hatching
                id="symspan-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('report.symmetrySpan.recallAcc', 'Recall Acc.')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedRecallAccuracy}
                  <span className="text-lg">%</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="symspan-report-score-hatch" className="mt-3 text-foreground/70" />

          {/* KPI GRID: Sets, Correct Sets, Processing Acc%, Max Span */}
          <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.symmetrySpan.sets', 'Sets')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-text">{resolvedTotalSets}</p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.cogTask.correct')}
              </p>
              <p className="text-lg font-bold tabular-nums text-woven-correct">
                {resolvedCorrectSets}
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.symmetrySpan.procAcc', 'Sym Acc')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {resolvedProcessingAccuracy}%
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.symmetrySpan.maxSpan', 'Max Span')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">{resolvedMaxSpan}</p>
            </div>
          </div>
          <Hatching id="symspan-report-kpi-hatch" className="mt-4 text-foreground/70" />

          {/* DISCLOSURES */}
          <div className="px-2 py-4 space-y-2">
            {/* Performance by set size */}
            <Disclosure
              title={t('report.symmetrySpan.performanceBySetSize', 'Performance by set size')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {setSizeStats.map((stat) => (
                    <div
                      key={stat.size}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('h-3 w-3 rounded-full shrink-0', setSizeColor(stat.size))}
                        />
                        <span className="text-sm font-bold text-woven-text">
                          {t('report.symmetrySpan.setSize', 'Set')} {stat.size}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {stat.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.symmetrySpan.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{stat.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.symmetrySpan.failed', 'Failed')}</span>
                          <span className="font-bold text-woven-incorrect">
                            {stat.total - stat.correct}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.symmetrySpan.recallAcc', 'Recall Acc.')}</span>
                          <span className="font-bold text-woven-text">{stat.recallAccuracy}%</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.symmetrySpan.procAcc', 'Sym Acc')}</span>
                          <span className="font-bold text-woven-text">
                            {stat.processingAccuracy}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            {/* Timeline */}
            <Disclosure
              title={t('report.symmetrySpan.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((set) => {
                      const symCorrect = set.symmetryResponses.filter(Boolean).length;
                      const symTotal = set.symmetryResponses.length;
                      const posMatch = set.expectedPositions.reduce(
                        (c, pos, i) => c + (set.recalledPositions[i] === pos ? 1 : 0),
                        0,
                      );

                      return (
                        <div key={set.index} className="relative">
                          <div
                            className={cn(
                              'absolute left-[-20px] top-5 h-4 w-4 rounded-full border-2 border-woven-bg',
                              set.recallCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect',
                            )}
                          />
                          <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                                {String(set.index).padStart(2, '0')}
                              </span>
                              <span className="text-sm font-bold text-woven-text">
                                {t('report.symmetrySpan.setSize', 'Set')} {set.setSize}
                              </span>
                              <span
                                className={cn(
                                  'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                  set.recallCorrect
                                    ? 'bg-woven-correct/12 text-woven-correct'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                                )}
                              >
                                {set.recallCorrect
                                  ? t('report.symmetrySpan.pass', 'Pass')
                                  : t('report.symmetrySpan.fail', 'Fail')}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.symmetrySpan.symmetry', 'Symmetry')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {symCorrect}/{symTotal}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.symmetrySpan.recall', 'Recall')}:{' '}
                                <span className="font-semibold text-primary">
                                  {posMatch}/{set.expectedPositions.length}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.symmetrySpan.positions', 'Positions')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  [{set.expectedPositions.join(', ')}]
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.symmetrySpan.recalled', 'Recalled')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  [{set.recalledPositions.join(', ')}]
                                </span>
                              </span>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-1 font-bold',
                                  set.recallCorrect
                                    ? 'bg-woven-correct/12 text-woven-correct'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                                )}
                              >
                                {set.recallCorrect
                                  ? t('report.symmetrySpan.correct', 'Correct')
                                  : t('report.symmetrySpan.error', 'Error')}
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

          {/* ACTIONS */}
          <Hatching id="symspan-report-actions-hatch" className="text-foreground/70" />
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
          id="symspan-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="symspan-report-bottom" className="text-foreground/70" />
    </div>
  );
}
