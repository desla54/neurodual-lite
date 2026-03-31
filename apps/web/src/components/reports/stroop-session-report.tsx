import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { CognitiveTaskTrialDetail, SessionEndReportModel } from '@neurodual/logic';
import {
  ArrowClockwise,
  ChartBar,
  ChartLine,
  House,
  ListChecks,
  Timer,
} from '@phosphor-icons/react';
import { cn, Disclosure, Hatching, WOVEN_COLORS, resolveThemeColor } from '@neurodual/ui';
import { useSettingsStore } from '../../stores';
import { useTranslation } from 'react-i18next';

type StroopColorId = 'red' | 'blue' | 'green' | 'yellow';

interface StroopSessionReportProps {
  readonly report?: SessionEndReportModel | null;
  readonly trials?: readonly StroopTrialView[];
  readonly totalTrials?: number;
  readonly accuracy?: number;
  readonly avgRtMs?: number;
  readonly congruencyEffectMs?: number;
  readonly modeLabel?: string;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
}

interface StroopTrialView {
  readonly index: number;
  readonly word: string;
  readonly inkColor: StroopColorId;
  readonly wordColor: StroopColorId;
  readonly response: StroopColorId | null;
  readonly correct: boolean;
  readonly timedOut: boolean;
  readonly responseTimeMs: number;
  readonly congruent: boolean;
  readonly rule?: 'ink' | 'word';
  readonly wordTrap: boolean;
}

function buildStroopColorMeta(theme: 'woven' | 'vivid') {
  return (['red', 'blue', 'green', 'yellow'] as const).reduce(
    (acc, id) => {
      const resolved = resolveThemeColor(id, theme);
      acc[id] = { bg: WOVEN_COLORS[resolved].bg, text: WOVEN_COLORS[resolved].text };
      return acc;
    },
    {} as Record<StroopColorId, { bg: string; text: string }>,
  );
}

function isStroopColorId(value: unknown): value is StroopColorId {
  return value === 'red' || value === 'blue' || value === 'green' || value === 'yellow';
}

export function StroopSessionReport({
  report,
  trials,
  totalTrials,
  accuracy,
  avgRtMs,
  congruencyEffectMs,
  modeLabel,
  onPlayAgain,
  onBackToHome,
}: StroopSessionReportProps): ReactNode {
  const { t } = useTranslation();
  const colorModalityTheme = useSettingsStore((s) => s.ui.colorModalityTheme);
  const STROOP_COLOR_META = useMemo(
    () => buildStroopColorMeta(colorModalityTheme),
    [colorModalityTheme],
  );

  const resolvedTrials = useMemo<StroopTrialView[]>(() => {
    if (trials) {
      return [...trials];
    }

    const reportTurns = report?.turns ?? [];

    return reportTurns
      .filter(
        (turn): turn is NonNullable<SessionEndReportModel['turns']>[number] =>
          turn.kind === 'cognitive-task-trial' && turn.detail?.kind === 'cognitive-task-trial',
      )
      .map((turn) => {
        const detail = turn.detail as CognitiveTaskTrialDetail;
        const trialData = detail.trialData ?? {};
        const inkColor = isStroopColorId(trialData['inkColor']) ? trialData['inkColor'] : 'red';
        const wordColor = isStroopColorId(trialData['wordColor'])
          ? trialData['wordColor']
          : inkColor;
        const response = isStroopColorId(trialData['response']) ? trialData['response'] : null;
        const timedOut = trialData['timedOut'] === true;
        const congruent = detail.condition === 'congruent';
        const rule = trialData['rule'] === 'word' ? 'word' : 'ink';
        const word = t(`game.cogTask.stroop.${wordColor}Word`);

        return {
          index: turn.index,
          word,
          inkColor,
          wordColor,
          response,
          correct: detail.correct,
          timedOut,
          responseTimeMs: detail.responseTimeMs,
          congruent,
          rule,
          wordTrap:
            rule === 'ink' && !detail.correct && !timedOut && !congruent && response === wordColor,
        };
      });
  }, [report?.turns, t, trials]);

  const isFlexMode =
    report?.taskType === 'stroop-flex' || resolvedTrials.some((turn) => turn.rule === 'word');

  const colorStats = useMemo(() => {
    return (['red', 'blue', 'green', 'yellow'] as const).map((colorId) => {
      const matchingTurns = resolvedTrials.filter((turn) => turn.inkColor === colorId);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const errors = matchingTurns.filter((turn) => !turn.correct).length;
      const wordTrap = matchingTurns.filter((turn) => turn.wordTrap).length;
      const timedOut = matchingTurns.filter((turn) => turn.timedOut).length;

      return {
        id: colorId,
        label: t(`game.cogTask.stroop.${colorId}Label`),
        total: matchingTurns.length,
        correct,
        errors,
        wordTrap,
        timedOut,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
      };
    });
  }, [resolvedTrials, t]);

  const ruleStats = useMemo(() => {
    if (!isFlexMode) return [];

    return (['ink', 'word'] as const).map((rule) => {
      const matchingTurns = resolvedTrials.filter((turn) => (turn.rule ?? 'ink') === rule);
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
        id: rule,
        label:
          rule === 'ink'
            ? t('game.cogTask.stroopFlex.ruleInk')
            : t('game.cogTask.stroopFlex.ruleWord'),
        total: matchingTurns.length,
        correct,
        errors,
        timedOut,
        meanRt,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
      };
    });
  }, [isFlexMode, resolvedTrials, t]);

  const transitionStats = useMemo(() => {
    if (!isFlexMode) return null;

    const switchTurns: StroopTrialView[] = [];
    const repeatTurns: StroopTrialView[] = [];

    for (let index = 1; index < resolvedTrials.length; index++) {
      const current = resolvedTrials[index];
      const previous = resolvedTrials[index - 1];
      if (!current || !previous) continue;

      if ((current.rule ?? 'ink') === (previous.rule ?? 'ink')) {
        repeatTurns.push(current);
      } else {
        switchTurns.push(current);
      }
    }

    const meanCorrectRt = (turns: StroopTrialView[]) => {
      const valid = turns.filter((turn) => turn.correct && !turn.timedOut);
      if (valid.length === 0) return 0;
      return Math.round(
        valid.reduce((sum, turn) => sum + turn.responseTimeMs, 0) / Math.max(1, valid.length),
      );
    };

    const switchRt = meanCorrectRt(switchTurns);
    const repeatRt = meanCorrectRt(repeatTurns);

    return {
      switchTrials: switchTurns.length,
      repeatTrials: repeatTurns.length,
      switchRt,
      repeatRt,
      switchCost: switchRt > 0 && repeatRt > 0 ? switchRt - repeatRt : 0,
    };
  }, [isFlexMode, resolvedTrials]);

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
          resolvedTrials.reduce((sum, turn) => sum + turn.responseTimeMs, 0) /
            resolvedTrials.length,
        )
      : 0);
  const resolvedCongruencyEffect =
    congruencyEffectMs ??
    (typeof report?.taskMetrics?.['congruencyEffectMs'] === 'number'
      ? Math.round(report.taskMetrics['congruencyEffectMs'])
      : 0);
  const resolvedSwitchCost = transitionStats?.switchCost ?? 0;
  const resolvedTotalTrials = totalTrials ?? report?.trialsCount ?? resolvedTrials.length;
  const resolvedCorrectTrials =
    report?.totals.hits ?? resolvedTrials.filter((turn) => turn.correct).length;
  const totalErrors =
    report != null
      ? Math.max(0, report.totals.misses + (report.totals.falseAlarms ?? 0))
      : Math.max(0, resolvedTrials.length - resolvedCorrectTrials);

  return (
    <div className="w-full md:max-w-md lg:max-w-lg md:mx-auto">
      <Hatching id="stroop-report-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="stroop-report-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="min-w-0 flex-1">
          <div className="px-2 pt-4 pb-0 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-primary">
              {modeLabel ?? report?.gameModeLabel ?? t('settings.gameMode.stroop')}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.25em] text-woven-text-muted">
              {isFlexMode
                ? t('report.stroopFlex.ruleShifting', 'Rule shifting')
                : t('report.stroop.interferenceControl', 'Interference control')}
            </p>
            <Hatching id="stroop-report-hero" className="mt-2 text-foreground/70" />
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
                id="stroop-report-score-divider"
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
          <Hatching id="stroop-report-score-hatch" className="mt-3 text-foreground/70" />

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
                {isFlexMode
                  ? t('report.stroopFlex.switchCost', 'Switch cost')
                  : t('report.stroop.congruency', 'Congruency')}
              </p>
              <p className="text-lg font-bold tabular-nums text-rose-500">
                {isFlexMode ? resolvedSwitchCost : resolvedCongruencyEffect}ms
              </p>
            </div>
          </div>
          <Hatching id="stroop-report-kpi-hatch" className="mt-4 text-foreground/70" />

          <div className="px-2 py-4 space-y-2">
            {isFlexMode && (
              <Disclosure
                title={t('report.stroopFlex.performanceByRule', 'Performance by rule')}
                icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
                render={() => (
                  <div className="grid grid-cols-2 gap-2">
                    {ruleStats.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-woven-text">{rule.label}</span>
                          <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                            {rule.total}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                          <div className="flex items-center justify-between">
                            <span>{t('report.stroop.correct', 'Correct')}</span>
                            <span className="font-bold text-woven-correct">{rule.correct}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{t('report.stroop.error', 'Error')}</span>
                            <span className="font-bold text-woven-incorrect">{rule.errors}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{t('report.stroop.timeout', 'Timeout')}</span>
                            <span className="font-bold text-woven-text">{rule.timedOut}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{t('report.stroop.avgRt', 'Avg RT')}</span>
                            <span className="font-bold text-woven-text">{rule.meanRt}ms</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                            <span>{t('report.stroop.precision', 'Precision')}</span>
                            <span className="font-bold text-woven-text">{rule.accuracy}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {transitionStats && (
                      <div className="col-span-2 rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3">
                        <div className="grid grid-cols-2 gap-3 text-xs text-woven-text-muted sm:grid-cols-4">
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div>{t('report.stroopFlex.switchTrials', 'Switch trials')}</div>
                            <div className="mt-1 text-lg font-bold text-woven-text">
                              {transitionStats.switchTrials}
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div>{t('report.stroopFlex.repeatTrials', 'Repeat trials')}</div>
                            <div className="mt-1 text-lg font-bold text-woven-text">
                              {transitionStats.repeatTrials}
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div>{t('report.stroopFlex.switchRt', 'Switch RT')}</div>
                            <div className="mt-1 text-lg font-bold text-woven-text">
                              {transitionStats.switchRt}ms
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div>{t('report.stroopFlex.repeatRt', 'Repeat RT')}</div>
                            <div className="mt-1 text-lg font-bold text-woven-text">
                              {transitionStats.repeatRt}ms
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              />
            )}

            <Disclosure
              title={t('report.stroop.performanceByColor', 'Performance by color')}
              icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="grid grid-cols-2 gap-2">
                  {colorStats.map((color) => (
                    <div
                      key={color.id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface/80 backdrop-blur-lg shadow-sm p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-3 w-3 rounded-full shrink-0',
                            STROOP_COLOR_META[color.id].bg,
                          )}
                        />
                        <span className={cn('text-sm font-bold', STROOP_COLOR_META[color.id].text)}>
                          {color.label}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-woven-text-muted">
                          {color.total}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-woven-text-muted">
                        <div className="flex items-center justify-between">
                          <span>{t('report.stroop.correct', 'Correct')}</span>
                          <span className="font-bold text-woven-correct">{color.correct}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.stroop.errors', 'Errors')}</span>
                          <span className="font-bold text-woven-incorrect">{color.errors}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.stroop.wordTrap', 'Word trap')}</span>
                          <span className="font-bold text-woven-amber">{color.wordTrap}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t('report.stroop.timeouts', 'Timeouts')}</span>
                          <span className="font-bold text-woven-text">{color.timedOut}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-woven-border/60 pt-1.5">
                          <span>{t('report.stroop.precision', 'Precision')}</span>
                          <span className="font-bold text-woven-text">{color.accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />

            <Disclosure
              title={t('report.stroop.timeline', 'Timeline')}
              icon={<ListChecks size={18} weight="duotone" className="text-woven-text-muted" />}
              render={() => (
                <div className="relative pl-5">
                  <div className="absolute left-[9px] top-1 bottom-1 w-px bg-woven-border" />
                  <div className="space-y-3">
                    {resolvedTrials.map((turn) => {
                      const inkMeta = STROOP_COLOR_META[turn.inkColor];
                      const wordMeta = STROOP_COLOR_META[turn.wordColor];
                      const responseMeta = turn.response ? STROOP_COLOR_META[turn.response] : null;

                      return (
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
                                className={cn('text-lg font-black tracking-tight', inkMeta.text)}
                              >
                                {turn.word}
                              </span>
                              <span
                                className={cn(
                                  'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                  turn.congruent
                                    ? 'bg-woven-correct/12 text-woven-correct'
                                    : 'bg-woven-incorrect/12 text-woven-incorrect',
                                )}
                              >
                                {turn.congruent
                                  ? t('report.stroop.congruent', 'Congruent')
                                  : t('report.stroop.incongruent', 'Incongruent')}
                              </span>
                              {isFlexMode && (
                                <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                  {(turn.rule ?? 'ink') === 'word'
                                    ? t('game.cogTask.stroopFlex.ruleWord')
                                    : t('game.cogTask.stroopFlex.ruleInk')}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-woven-text-muted">
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.stroop.ink', 'Ink')}:{' '}
                                <span className={cn('font-semibold', inkMeta.text)}>
                                  {t(`game.cogTask.stroop.${turn.inkColor}Label`)}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                {t('report.stroop.word', 'Word')}:{' '}
                                <span className={cn('font-semibold', wordMeta.text)}>
                                  {t(`game.cogTask.stroop.${turn.wordColor}Label`)}
                                </span>
                              </span>
                              <span className="rounded-full bg-woven-bg px-2 py-1">
                                <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                                {Math.round(turn.responseTimeMs)}ms
                              </span>
                              {responseMeta ? (
                                <span className="rounded-full bg-woven-bg px-2 py-1">
                                  {t('report.stroop.response', 'Response')}:{' '}
                                  <span className={cn('font-semibold', responseMeta.text)}>
                                    {t(`game.cogTask.stroop.${turn.response}Label`)}
                                  </span>
                                </span>
                              ) : null}
                              {turn.wordTrap ? (
                                <span className="rounded-full bg-woven-amber/12 px-2 py-1 font-bold text-woven-amber">
                                  {t('report.stroop.pressedWord', 'Pressed the word')}
                                </span>
                              ) : null}
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
                                  ? t('report.stroop.timeout', 'Timeout')
                                  : turn.correct
                                    ? t('report.stroop.correct', 'Correct')
                                    : t('report.stroop.error', 'Error')}
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

          <Hatching id="stroop-report-actions-hatch" className="text-foreground/70" />
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
                onClick={() => {
                  window.location.hash = '#/stats';
                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
              >
                <ChartLine size={18} />
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
          id="stroop-report-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="stroop-report-bottom" className="text-foreground/70" />
    </div>
  );
}
