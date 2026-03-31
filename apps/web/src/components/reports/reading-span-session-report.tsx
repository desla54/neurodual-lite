import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

interface ReadingSpanSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly ReadingSpanSetView[];
  readonly totalSets?: number;
  readonly maxSpan?: number;
  readonly recallAccuracy?: number;
  readonly sentenceAccuracy?: number;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface ReadingSpanSetView {
  readonly index: number;
  readonly spanSize: number;
  readonly recallCorrect: boolean;
  readonly recalledWords: readonly string[];
  readonly expectedWords: readonly string[];
  readonly sentenceAccuracy: number;
  readonly sentenceResponses: readonly boolean[];
}

// =============================================================================
// Helpers
// =============================================================================

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function toBooleanArray(value: unknown): boolean[] {
  if (Array.isArray(value)) return value.filter((v): v is boolean => typeof v === 'boolean');
  return [];
}

// =============================================================================
// Component
// =============================================================================

export function ReadingSpanSessionReport({
  report,
  trials,
  totalSets,
  maxSpan,
  recallAccuracy,
  sentenceAccuracy,
  onPlayAgain,
  onBackToHome,
}: ReadingSpanSessionReportProps): ReactNode {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Resolve trials from either live data or historical report
  // ---------------------------------------------------------------------------

  const resolvedTrials = useMemo<ReadingSpanSetView[]>(() => {
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

        const spanSize = typeof trialData['spanSize'] === 'number' ? trialData['spanSize'] : 2;
        const recallCorrect = trialData['recallCorrect'] === true;
        const recalledWords = toStringArray(trialData['recalledWords']);
        const expectedWords = toStringArray(trialData['expectedWords']);
        const sentenceAcc =
          typeof trialData['sentenceAccuracy'] === 'number' ? trialData['sentenceAccuracy'] : 0;
        const sentenceResponses = toBooleanArray(trialData['sentenceResponses']);

        return {
          index: turn.index,
          spanSize,
          recallCorrect,
          recalledWords,
          expectedWords,
          sentenceAccuracy: sentenceAcc,
          sentenceResponses,
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
      : resolvedTrials.reduce((max, s) => (s.recallCorrect ? Math.max(max, s.spanSize) : max), 0));

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
          const correctSets = resolvedTrials.filter((s) => s.recallCorrect).length;
          return resolvedTrials.length > 0
            ? Math.round((correctSets / resolvedTrials.length) * 100)
            : 0;
        })());

  const resolvedSentenceAccuracy =
    sentenceAccuracy ??
    (typeof report?.taskMetrics?.['sentenceAccuracy'] === 'number'
      ? Math.round(report.taskMetrics['sentenceAccuracy'] as number)
      : (() => {
          const totalSent = resolvedTrials.reduce((s, set) => s + set.sentenceResponses.length, 0);
          const correctSent = resolvedTrials.reduce(
            (s, set) => s + set.sentenceResponses.filter(Boolean).length,
            0,
          );
          return totalSent > 0 ? Math.round((correctSent / totalSent) * 100) : 0;
        })());

  const resolvedTotalSets = totalSets ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectSets =
    report?.totals.hits ?? resolvedTrials.filter((s) => s.recallCorrect).length;

  // ---------------------------------------------------------------------------
  // Performance by span size
  // ---------------------------------------------------------------------------

  const spanSizeStats = useMemo(() => {
    const sizes = [...new Set(resolvedTrials.map((s) => s.spanSize))].sort((a, b) => a - b);
    return sizes.map((size) => {
      const matching = resolvedTrials.filter((s) => s.spanSize === size);
      const correct = matching.filter((s) => s.recallCorrect).length;
      const totalSent = matching.reduce((s, set) => s + set.sentenceResponses.length, 0);
      const correctSent = matching.reduce(
        (s, set) => s + set.sentenceResponses.filter(Boolean).length,
        0,
      );
      const wordRecallCorrect = matching.reduce((s, set) => {
        let c = 0;
        for (let i = 0; i < set.expectedWords.length; i++) {
          if (set.recalledWords[i] === set.expectedWords[i]) c++;
        }
        return s + c;
      }, 0);
      const totalWords = matching.reduce((s, set) => s + set.expectedWords.length, 0);

      return {
        size,
        total: matching.length,
        correct,
        wordRecallAccuracy: totalWords > 0 ? Math.round((wordRecallCorrect / totalWords) * 100) : 0,
        sentenceAccuracy: totalSent > 0 ? Math.round((correctSent / totalSent) * 100) : 0,
      };
    });
  }, [resolvedTrials]);

  // ---------------------------------------------------------------------------
  // Color for span size dot
  // ---------------------------------------------------------------------------

  const spanSizeColor = (size: number): string => {
    if (size <= 2) return 'bg-woven-correct';
    if (size <= 3) return 'bg-blue-400';
    if (size <= 5) return 'bg-violet-400';
    return 'bg-primary';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="rspan-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="rspan-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          {/* HERO */}
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {t('settings.gameMode.readingSpan', 'Reading Span')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {t('report.readingSpan.subtitle', 'Verbal working memory')}
            </p>
            <Hatching id="rspan-report-hero" className="mt-2 text-foreground/70" />
          </div>

          {/* SCORE CARD: Max Span (2/3) + Recall Accuracy (1/3) */}
          <div className="px-2 mt-4 p-1">
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('report.readingSpan.maxSpan', 'Max Span')}
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
                id="rspan-report-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />
              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                  {t('report.readingSpan.recallAcc', 'Recall Acc.')}
                </p>
                <span className="nd-secondary-metric-value text-woven-text">
                  {resolvedRecallAccuracy}
                  <span className="text-lg">%</span>
                </span>
              </div>
            </div>
          </div>
          <Hatching id="rspan-report-score-hatch" className="mt-3 text-foreground/70" />

          {/* KPI GRID: Sets, Correct Sets, Sentence Acc%, Max Span */}
          <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.readingSpan.sets', 'Sets')}
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
                {t('report.readingSpan.sentAcc', 'Sent Acc')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {resolvedSentenceAccuracy}%
              </p>
            </div>
            <div className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('report.readingSpan.maxSpan', 'Max Span')}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">{resolvedMaxSpan}</p>
            </div>
          </div>
          <Hatching id="rspan-report-kpi-hatch" className="mt-4 text-foreground/70" />

          {/* DISCLOSURES */}
          <div className="px-2 py-4 space-y-2">
            {/* Performance by span size */}
            <Disclosure
              title={t('report.readingSpan.performanceBySpan', 'Performance by span level')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {spanSizeStats.map((stat) => (
                    <div
                      key={stat.size}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('h-3 w-3 rounded-full shrink-0', spanSizeColor(stat.size))}
                        />
                        <span className="text-sm font-bold text-woven-text">
                          {t('report.readingSpan.span', 'Span')} {stat.size}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {stat.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.readingSpan.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{stat.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.readingSpan.failed', 'Failed')}</span>
                          <span className="font-bold text-woven-incorrect">
                            {stat.total - stat.correct}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.readingSpan.wordRecall', 'Word Recall')}</span>
                          <span className="font-bold text-woven-text">
                            {stat.wordRecallAccuracy}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.readingSpan.sentAcc', 'Sent Acc')}</span>
                          <span className="font-bold text-woven-text">
                            {stat.sentenceAccuracy}%
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
              title={t('report.readingSpan.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((set) => {
                      const sentCorrect = set.sentenceResponses.filter(Boolean).length;
                      const sentTotal = set.sentenceResponses.length;
                      const wordsMatch = set.expectedWords.reduce(
                        (c, word, i) => c + (set.recalledWords[i] === word ? 1 : 0),
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
                                {t('report.readingSpan.span', 'Span')} {set.spanSize}
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
                                  ? t('report.readingSpan.pass', 'Pass')
                                  : t('report.readingSpan.fail', 'Fail')}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.readingSpan.sentences', 'Sentences')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {sentCorrect}/{sentTotal}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.readingSpan.wordsRecalled', 'Words')}:{' '}
                                <span className="font-semibold text-primary">
                                  {wordsMatch}/{set.expectedWords.length}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.readingSpan.expected', 'Expected')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {set.expectedWords.join(', ')}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.readingSpan.recalled', 'Recalled')}:{' '}
                                <span className="font-semibold text-woven-text">
                                  {set.recalledWords.join(', ')}
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
                                  ? t('report.readingSpan.correct', 'Correct')
                                  : t('report.readingSpan.error', 'Error')}
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
          <Hatching id="rspan-report-actions-hatch" className="text-foreground/70" />
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
          id="rspan-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="rspan-report-bottom" className="text-foreground/70" />
    </div>
  );
}
