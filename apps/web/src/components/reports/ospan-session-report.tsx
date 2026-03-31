import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { SessionEndReportModel, OspanDetails, OspanSetDetail } from '@neurodual/logic';
import { PROCESSING_ACCURACY_THRESHOLD } from '@neurodual/logic';
import { ArrowClockwise, ChartBar, House, ListChecks } from '@phosphor-icons/react';
import { cn, Disclosure, Hatching } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';

interface OspanSetResultView {
  readonly span: number;
  readonly letters: readonly string[];
  readonly recalled: readonly string[];
  readonly recallCorrect: boolean;
  readonly equationAccuracy?: number;
  readonly responseTimeMs?: number;
}

interface OspanSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  // Direct data (from training page, takes precedence over report)
  readonly absoluteScore?: number;
  readonly maxSpan?: number;
  readonly totalSets?: number;
  readonly correctSets?: number;
  readonly processingAccuracy?: number;
  readonly recallAccuracy?: number;
  readonly results?: readonly OspanSetResultView[];
  readonly interrupted?: boolean;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

export function OspanSessionReport({
  report,
  absoluteScore,
  maxSpan,
  totalSets,
  correctSets,
  processingAccuracy,
  recallAccuracy,
  results,
  interrupted = false,
  onPlayAgain,
  onBackToHome,
}: OspanSessionReportProps): ReactNode {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Resolve set results from report turns or direct props
  // ---------------------------------------------------------------------------
  const resolvedResults = useMemo<OspanSetResultView[]>(() => {
    if (results) return [...results];

    const reportTurns = report?.turns ?? [];
    return reportTurns
      .filter(
        (
          turn,
        ): turn is NonNullable<SessionEndReportModel['turns']>[number] & {
          detail: OspanSetDetail;
        } => turn.detail.kind === 'ospan-set',
      )
      .map((turn) => ({
        span: turn.detail.span,
        letters: turn.detail.letters,
        recalled: turn.detail.recalled,
        recallCorrect: turn.detail.recallCorrect,
        equationAccuracy: turn.detail.equationAccuracy,
        responseTimeMs: turn.detail.responseTimeMs,
      }));
  }, [report?.turns, results]);

  // ---------------------------------------------------------------------------
  // Resolve aggregate stats from direct props or report
  // ---------------------------------------------------------------------------
  const ospanDetails =
    report?.modeDetails?.kind === 'ospan' ? (report.modeDetails as OspanDetails) : undefined;

  const resolvedAbsoluteScore =
    absoluteScore ??
    ospanDetails?.absoluteScore ??
    (typeof report?.modeScore.value === 'number' ? Math.round(report.modeScore.value) : 0);

  const resolvedMaxSpan =
    maxSpan ??
    ospanDetails?.maxSpan ??
    resolvedResults.reduce((max, r) => (r.recallCorrect && r.span > max ? r.span : max), 0);

  const resolvedTotalSets = totalSets ?? resolvedResults.length;

  const resolvedCorrectSets = correctSets ?? resolvedResults.filter((r) => r.recallCorrect).length;

  const resolvedProcessingAccuracy = (() => {
    if (typeof processingAccuracy === 'number') return processingAccuracy;
    if (ospanDetails) return ospanDetails.processingAccuracy;
    if (resolvedResults.length === 0) return 0;
    // Compute from individual set equation accuracies
    const withEq = resolvedResults.filter((r) => typeof r.equationAccuracy === 'number');
    if (withEq.length === 0) return 0;
    return Math.round(
      withEq.reduce((sum, r) => sum + (r.equationAccuracy ?? 0), 0) / withEq.length,
    );
  })();

  const resolvedRecallAccuracy = (() => {
    if (typeof recallAccuracy === 'number') return recallAccuracy;
    if (ospanDetails) return ospanDetails.recallAccuracy;
    if (resolvedTotalSets === 0) return 0;
    return Math.round((resolvedCorrectSets / resolvedTotalSets) * 100);
  })();

  const resolvedInterrupted = interrupted || report?.reason === 'abandoned';

  // ---------------------------------------------------------------------------
  // Derived: score color & longest streak
  // ---------------------------------------------------------------------------
  const scoreColor =
    resolvedRecallAccuracy >= 80
      ? 'text-emerald-500'
      : resolvedRecallAccuracy >= 50
        ? 'text-amber-500'
        : 'text-red-500';

  const longestStreak = useMemo(() => {
    let max = 0;
    let cur = 0;
    for (const r of resolvedResults) {
      cur = r.recallCorrect ? cur + 1 : 0;
      if (cur > max) max = cur;
    }
    return max;
  }, [resolvedResults]);

  const processingThreshold = PROCESSING_ACCURACY_THRESHOLD;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="ospan-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="ospan-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          {/* ═══ ZONE 1: HERO ═══ */}
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {resolvedInterrupted
                ? t('game.cogTask.sessionInterrupted')
                : t('settings.gameMode.ospan', 'Operation Span')}
              {'\u00A0'}
              <span className="inline-flex align-middle -translate-y-px items-center px-3 py-1.5 rounded-lg text-sm font-bold leading-none tabular-nums tracking-wide whitespace-nowrap bg-muted/80 backdrop-blur-lg border border-border/60 shadow-sm text-foreground">
                {t('game.cogTask.span')} {resolvedMaxSpan}
              </span>
            </h2>
            <Hatching id="ospan-report-hero-hatch" className="mt-2 text-foreground/70" />
          </div>

          {resolvedTotalSets > 0 && (
            <>
              {/* ═══ ZONE 2: SCORE CARD ═══ */}
              <div className="px-2 mt-4 p-1">
                <div className="flex items-stretch">
                  {/* Primary: Absolute Score */}
                  <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('game.cogTask.score')}
                    </p>
                    <span
                      className={cn(
                        'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                        scoreColor,
                      )}
                    >
                      {resolvedAbsoluteScore}
                    </span>
                  </div>

                  <Hatching
                    id="ospan-report-score-divider"
                    orientation="vertical"
                    className="text-foreground/70"
                  />

                  {/* Secondary: Max Span */}
                  <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('game.cogTask.maxSpan')}
                    </p>
                    <span className="nd-secondary-metric-value text-foreground">
                      {resolvedMaxSpan}
                    </span>
                  </div>
                </div>
              </div>

              {/* Processing accuracy warning */}
              {resolvedProcessingAccuracy < processingThreshold && (
                <div className="px-2 mt-2">
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-center">
                    <p className="text-xs font-medium text-amber-500">
                      {t(
                        'game.cogTask.ospan.processingWarning',
                        `Equation accuracy below ${processingThreshold}% — results may not reflect true working memory capacity`,
                      )}
                    </p>
                  </div>
                </div>
              )}
              <Hatching id="ospan-report-score-hatch" className="mt-3 text-foreground/70" />

              {/* ═══ ZONE 3: STATS ROW ═══ */}
              <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('game.cogTask.sets')}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {resolvedTotalSets}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('game.cogTask.correct')}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-emerald-500">
                    {resolvedCorrectSets}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('game.cogTask.equations')}
                  </p>
                  <p
                    className={cn(
                      'text-lg font-bold tabular-nums',
                      resolvedProcessingAccuracy < processingThreshold
                        ? 'text-amber-500'
                        : 'text-foreground',
                    )}
                  >
                    {resolvedProcessingAccuracy}%
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('game.cogTask.recall')}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {resolvedRecallAccuracy}%
                  </p>
                </div>
              </div>

              <Hatching id="ospan-report-stats-hatch" className="mt-4 text-foreground/70" />

              {/* ═══ ZONE 4: ACCORDIONS ═══ */}
              <div className="px-2 py-4 space-y-2">
                {/* Performance accordion */}
                <Disclosure
                  title={t('game.cogTask.performance')}
                  icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
                  render={() => (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-muted-foreground">
                          {t('game.cogTask.score')}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-primary">
                          {resolvedAbsoluteScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-muted-foreground">
                          {t('game.cogTask.maxSpanReached')}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-primary">
                          {resolvedMaxSpan}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-muted-foreground">
                          {t('game.cogTask.equationAccuracy')}
                        </span>
                        <span
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            resolvedProcessingAccuracy < processingThreshold
                              ? 'text-amber-500'
                              : 'text-foreground',
                          )}
                        >
                          {resolvedProcessingAccuracy}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-muted-foreground">
                          {t('game.cogTask.longestStreak')}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {longestStreak} {t('game.cogTask.sets').toLowerCase()}
                        </span>
                      </div>
                    </div>
                  )}
                />

                {/* Set detail accordion */}
                <Disclosure
                  title={t('game.cogTask.setDetail')}
                  icon={<ListChecks size={18} weight="duotone" className="text-muted-foreground" />}
                  render={() => (
                    <div className="space-y-1.5">
                      {resolvedResults.length > 0 ? (
                        resolvedResults.map((r, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-2"
                          >
                            <span className="text-xs font-bold text-muted-foreground w-5 text-right tabular-nums">
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium text-foreground flex-1">
                              {t('game.cogTask.span')} {r.span}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {r.recalled.join('')}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                r.recallCorrect
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : 'bg-red-500/15 text-red-500',
                              )}
                            >
                              {r.recallCorrect ? 'OK' : 'FAIL'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm px-3 py-3 text-sm text-muted-foreground">
                          {t(
                            'report.ospan.noDetailedSets',
                            'Detailed set history is unavailable for this session.',
                          )}
                        </div>
                      )}
                    </div>
                  )}
                />
              </div>
            </>
          )}

          {resolvedTotalSets === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('game.cogTask.noSets')}
            </div>
          )}

          {/* ═══ ZONE 5: ACTIONS ═══ */}
          <Hatching id="ospan-report-actions-hatch" className="text-foreground/70" />
          <div className="px-2 py-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-soft-colored transition-all active:scale-[0.98]"
              >
                <ArrowClockwise size={18} weight="bold" />
                <span className="min-w-0 text-center">{t('game.cogTask.restart')}</span>
              </button>
              <button
                type="button"
                onClick={onBackToHome}
                aria-label={t('common.home', 'Home')}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
              >
                <House size={18} />
              </button>
            </div>
          </div>
        </div>
        <Hatching
          id="ospan-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="ospan-report-bottom" className="text-foreground/70" />
    </div>
  );
}
