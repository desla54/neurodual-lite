import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { SessionEndReportModel, TempoTrialDetail } from '@neurodual/logic';
import {
  ArrowClockwise,
  ChartLine,
  House,
  ListChecks,
  PuzzlePiece,
  Repeat,
  Timer,
  Waveform,
} from '@phosphor-icons/react';
import { cn, Disclosure, Hatching, WOVEN_COLORS, resolveThemeColor } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores';
import {
  getPerformanceBand,
  type DualMixSummary,
  type StroopResult,
} from '../../lib/dual-mix-session';

type StroopColorId = 'red' | 'blue' | 'green' | 'yellow';
type NbackOutcome = 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
type DualMixTempoTrialDetail = TempoTrialDetail & { readonly isBuffer?: boolean };

export interface DualMixSessionReportProps {
  readonly summary: DualMixSummary;
  readonly totalRounds: number;
  readonly nLevel: number;
  readonly includeGridlock: boolean;
  readonly report?: SessionEndReportModel | null;
  readonly stroopResults: readonly StroopResult[];
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onGoToStats?: (report: SessionEndReportModel) => void;
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

function scoreTone(score: number): string {
  if (score >= 80) return 'text-woven-correct';
  if (score >= 60) return 'text-woven-amber';
  return 'text-woven-incorrect';
}

function modalityAccuracy(stats?: SessionEndReportModel['byModality'][string]): number | null {
  if (!stats) return null;
  const total =
    (stats.hits ?? 0) +
    (stats.misses ?? 0) +
    (stats.falseAlarms ?? 0) +
    (stats.correctRejections ?? 0);
  if (total <= 0) return null;
  return Math.round((((stats.hits ?? 0) + (stats.correctRejections ?? 0)) / total) * 100);
}

function isStroopColorId(value: unknown): value is StroopColorId {
  return value === 'red' || value === 'blue' || value === 'green' || value === 'yellow';
}

function outcomeBadge(result: NbackOutcome, t: (key: string, fallback: string) => string): string {
  switch (result) {
    case 'hit':
      return t('stats.unifiedReport.correct', 'Correct');
    case 'miss':
      return t('stats.unifiedReport.misses', 'Miss');
    case 'false-alarm':
      return 'FA';
    default:
      return t('stats.unifiedReport.correctRejections', 'CR');
  }
}

function outcomeTone(result: NbackOutcome): string {
  switch (result) {
    case 'hit':
    case 'correct-rejection':
      return 'bg-woven-correct/10 text-woven-correct border-woven-correct/30';
    case 'miss':
    case 'false-alarm':
      return 'bg-woven-incorrect/10 text-woven-incorrect border-woven-incorrect/30';
  }
}

function parseGridlockMoves(subline?: string): number {
  const match = subline?.match(/Gridlock:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function SectionCard({
  title,
  icon,
  children,
  className,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-woven-border/60 bg-woven-surface p-4 shadow-sm',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-woven-bg text-woven-text">
          {icon}
        </span>
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-woven-text-muted">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function MetricRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-woven-text-muted">{label}</span>
      <span className={cn('text-sm font-mono font-semibold text-woven-text', tone)}>{value}</span>
    </div>
  );
}

export function DualMixSessionReport({
  summary,
  totalRounds,
  nLevel,
  includeGridlock,
  report,
  stroopResults,
  onPlayAgain,
  onBackToHome,
  onGoToStats,
}: DualMixSessionReportProps) {
  const { t } = useTranslation();
  const colorModalityTheme = useSettingsStore((s) => s.ui.colorModalityTheme);
  const colorMeta = useMemo(() => buildStroopColorMeta(colorModalityTheme), [colorModalityTheme]);

  const nbackBand = getPerformanceBand(summary.nbackAcc);
  const stroopBand = getPerformanceBand(summary.stroopAcc);
  const upsDisplay = '—';
  const scorableRounds = summary.nTotal;
  const warmupRounds = Math.max(0, totalRounds - scorableRounds);

  const dualMixTurns = useMemo(
    () =>
      (report?.turns ?? []).filter(
        (
          turn,
        ): turn is NonNullable<SessionEndReportModel['turns']>[number] & {
          detail: DualMixTempoTrialDetail;
        } => turn.detail.kind === 'tempo-trial',
      ),
    [report?.turns],
  );

  const nbackRounds = useMemo(
    () =>
      dualMixTurns.map((turn) => ({
        index: turn.index,
        isBuffer: turn.detail.isBuffer === true,
        position: (turn.detail.responses['position']?.result ??
          'correct-rejection') as NbackOutcome,
        audio: (turn.detail.responses['audio']?.result ?? 'correct-rejection') as NbackOutcome,
        positionRt: turn.detail.responses['position']?.reactionTimeMs ?? null,
        audioRt: turn.detail.responses['audio']?.reactionTimeMs ?? null,
        gridlockMoves: parseGridlockMoves(turn.subline),
      })),
    [dualMixTurns],
  );

  const positionStats = report?.byModality['position'];
  const audioStats = report?.byModality['audio'];
  const positionAccuracy = modalityAccuracy(positionStats);
  const audioAccuracy = modalityAccuracy(audioStats);

  const ruleStats = useMemo(() => {
    return (['ink', 'word'] as const).map((rule) => {
      const matchingTurns = stroopResults.filter((turn) => turn.trial.rule === rule);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const errors = matchingTurns.filter((turn) => !turn.correct && !turn.timedOut).length;
      const timedOut = matchingTurns.filter((turn) => turn.timedOut).length;
      const valid = matchingTurns.filter((turn) => turn.correct && !turn.timedOut);
      const meanRt =
        valid.length > 0
          ? Math.round(valid.reduce((sum, turn) => sum + turn.rt, 0) / valid.length)
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
  }, [stroopResults, t]);

  const colorStats = useMemo(() => {
    return (['red', 'blue', 'green', 'yellow'] as const).map((colorId) => {
      const matchingTurns = stroopResults.filter((turn) => turn.trial.inkColor === colorId);
      const correct = matchingTurns.filter((turn) => turn.correct).length;
      const errors = matchingTurns.filter((turn) => !turn.correct && !turn.timedOut).length;
      const timedOut = matchingTurns.filter((turn) => turn.timedOut).length;
      const wordTrap = matchingTurns.filter((turn) => {
        const response = turn.response;
        return (
          turn.trial.rule === 'ink' &&
          !turn.correct &&
          !turn.timedOut &&
          response != null &&
          response === turn.trial.wordColor
        );
      }).length;

      return {
        id: colorId,
        label: t(`game.cogTask.stroop.${colorId}Label`),
        total: matchingTurns.length,
        correct,
        errors,
        timedOut,
        wordTrap,
        accuracy: matchingTurns.length > 0 ? Math.round((correct / matchingTurns.length) * 100) : 0,
      };
    });
  }, [stroopResults, t]);

  const switchStats = useMemo(() => {
    const switchTurns: StroopResult[] = [];
    const repeatTurns: StroopResult[] = [];

    for (let index = 1; index < stroopResults.length; index++) {
      const current = stroopResults[index];
      const previous = stroopResults[index - 1];
      if (!current || !previous) continue;
      if (current.trial.rule === previous.trial.rule) repeatTurns.push(current);
      else switchTurns.push(current);
    }

    const meanRt = (turns: readonly StroopResult[]) => {
      const valid = turns.filter((turn) => turn.correct && !turn.timedOut);
      if (valid.length === 0) return 0;
      return Math.round(valid.reduce((sum, turn) => sum + turn.rt, 0) / valid.length);
    };

    const switchRt = meanRt(switchTurns);
    const repeatRt = meanRt(repeatTurns);

    return {
      switchTrials: switchTurns.length,
      repeatTrials: repeatTurns.length,
      switchRt,
      repeatRt,
      switchCost: switchRt > 0 && repeatRt > 0 ? switchRt - repeatRt : 0,
    };
  }, [stroopResults]);

  const gridlockRounds = useMemo(
    () => nbackRounds.filter((round) => round.gridlockMoves > 0),
    [nbackRounds],
  );

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <Hatching id="dual-mix-report-top" className="text-foreground/70" />
      <div className="rounded-[28px] border border-woven-border/60 bg-woven-bg/40 p-5 shadow-[0_24px_80px_hsl(var(--foreground)/0.08)]">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-woven-text-muted">
            Dual Mix
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-woven-text">
            {t('stats.report.sessionReport', 'Session report')}
          </h1>
          <p className="mt-2 text-sm text-woven-text-muted">
            {scorableRounds} {t('game.cogTask.trials', 'trials')} + {warmupRounds} warmup · N-
            {nLevel} ·{' '}
            {includeGridlock ? 'N-Back + Stroop Flex + Gridlock' : 'N-Back + Stroop Flex'} ·{' '}
            {Math.round(summary.durationMs / 1000)}s
          </p>
          <div className="mt-4 inline-flex flex-col items-center rounded-2xl border border-woven-border/60 bg-woven-surface px-6 py-4">
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-woven-text-muted">
              Overall
            </span>
            <span className="mt-1 text-4xl font-black text-woven-text-muted/70">{upsDisplay}</span>
            <span className="text-sm font-semibold text-woven-text-muted/70">{upsDisplay}</span>
          </div>
        </div>

        <div
          className={cn('mt-6 grid gap-4', includeGridlock ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}
        >
          <SectionCard title="N-Back Classic" icon={<Waveform weight="duotone" />}>
            <MetricRow
              label={t('common.modality.position', 'Position')}
              value={`${summary.nPosCorrect}/${summary.nTotal}`}
            />
            <MetricRow
              label={t('common.modality.audio', 'Audio')}
              value={`${summary.nAudCorrect}/${summary.nTotal}`}
            />
            <MetricRow
              label={t('report.modeScore.accuracy', 'Accuracy')}
              value={`${summary.nbackAcc}%`}
              tone={scoreTone(summary.nbackAcc)}
            />
            <MetricRow label="Warmup" value={warmupRounds} />
            <p className={cn('mt-3 text-xs font-semibold', nbackBand.tone)}>{nbackBand.label}</p>
          </SectionCard>

          <SectionCard title="Stroop Flex" icon={<Repeat weight="duotone" />}>
            <MetricRow
              label={t('report.modeScore.accuracy', 'Accuracy')}
              value={`${summary.stroopAcc}%`}
              tone={scoreTone(summary.stroopAcc)}
            />
            <MetricRow
              label={t('game.cogTask.correct', 'Correct')}
              value={`${summary.stroopCorrect}/${scorableRounds}`}
            />
            <MetricRow
              label={t('game.cogTask.avgRt', 'Mean RT')}
              value={`${summary.stroopAvgRT}ms`}
            />
            <MetricRow
              label={t('report.stroopFlex.switchCost', 'Switch cost')}
              value={`${switchStats.switchCost}ms`}
            />
            <p className={cn('mt-3 text-xs font-semibold', stroopBand.tone)}>{stroopBand.label}</p>
          </SectionCard>

          {includeGridlock && (
            <SectionCard title="Gridlock" icon={<PuzzlePiece weight="duotone" />}>
              <MetricRow
                label={t('game.cogTask.correct', 'Solved')}
                value={summary.gridlockSolved}
              />
              <MetricRow
                label={t('report.gridlock.moves', 'Moves')}
                value={summary.gridlockMoves}
              />
              <MetricRow label="Rounds used" value={gridlockRounds.length} />
              <MetricRow
                label={t('report.gridlock.score', 'Session score')}
                value={`${summary.gridlockScore ?? 0}%`}
                tone={scoreTone(summary.gridlockScore ?? 0)}
              />
            </SectionCard>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <Disclosure
            title="N-Back Classic"
            icon={<Waveform size={18} weight="duotone" className="text-primary" />}
            render={() => (
              <div className="space-y-4">
                <div className="rounded-2xl border border-woven-border/60 bg-woven-surface overflow-hidden">
                  <div className="flex items-stretch">
                    <div className="w-2/3 px-4 py-4 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                        {t('report.modeScore.accuracy', 'Accuracy')}
                      </p>
                      <span
                        className={cn(
                          'text-5xl sm:text-6xl font-black tabular-nums tracking-tight',
                          scoreTone(summary.nbackAcc),
                        )}
                      >
                        {summary.nbackAcc}%
                      </span>
                    </div>

                    <Hatching
                      id="dual-mix-nback-divider"
                      orientation="vertical"
                      className="text-foreground/70"
                    />

                    <div className="w-1/3 px-3 py-4 flex flex-col items-center justify-center text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                        N-Back
                      </p>
                      <span className="text-2xl font-black tabular-nums tracking-tight text-woven-text">
                        N-{nLevel}
                      </span>
                      <span className="mt-1 text-[11px] font-medium text-woven-text-muted">
                        {summary.nTotal} scored
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      id: 'position',
                      label: t('common.modality.position', 'Position'),
                      stats: positionStats,
                      accuracy: positionAccuracy,
                      surface: 'bg-visual/10',
                    },
                    {
                      id: 'audio',
                      label: t('common.modality.audio', 'Audio'),
                      stats: audioStats,
                      accuracy: audioAccuracy,
                      surface: 'bg-audio/10',
                    },
                  ].map(({ id, label, stats, accuracy, surface }) => (
                    <div
                      key={id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface overflow-hidden"
                    >
                      <div className={cn('px-3 py-2 border-b border-woven-border/60', surface)}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-woven-text">{label}</span>
                          <span
                            className={cn(
                              'text-sm font-bold',
                              scoreTone(accuracy ?? summary.nbackAcc),
                            )}
                          >
                            {accuracy !== null ? `${accuracy}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                              {t('stats.unifiedReport.hits', 'Hits')}
                            </div>
                            <div className="mt-1 text-lg font-bold tabular-nums text-woven-correct">
                              {stats?.hits ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                              {t('stats.unifiedReport.misses', 'Misses')}
                            </div>
                            <div className="mt-1 text-lg font-bold tabular-nums text-woven-incorrect">
                              {stats?.misses ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                              {t('stats.unifiedReport.falseAlarms', 'False alarms')}
                            </div>
                            <div className="mt-1 text-lg font-bold tabular-nums text-woven-incorrect">
                              {stats?.falseAlarms ?? 0}
                            </div>
                          </div>
                          <div className="rounded-lg bg-woven-bg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                              {t('stats.unifiedReport.correctRejections', 'Correct rejections')}
                            </div>
                            <div className="mt-1 text-lg font-bold tabular-nums text-woven-text">
                              {stats?.correctRejections ?? 0}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between rounded-lg border border-woven-border/50 px-3 py-2 text-xs">
                          <span className="font-medium text-woven-text-muted">
                            {t('game.cogTask.avgRt', 'Mean RT')}
                          </span>
                          <span className="font-mono font-semibold text-woven-text">
                            {stats?.avgRT != null ? `${Math.round(stats.avgRT)}ms` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {nbackRounds.map((round) => (
                    <div
                      key={round.index}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                          {String(round.index).padStart(2, '0')}
                        </span>
                        {round.isBuffer && (
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            Buffer
                          </span>
                        )}
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            outcomeTone(round.position),
                          )}
                        >
                          POS {outcomeBadge(round.position, t)}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            outcomeTone(round.audio),
                          )}
                        >
                          AUD {outcomeBadge(round.audio, t)}
                        </span>
                        {round.positionRt != null && (
                          <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                            RT {Math.round(round.positionRt)}ms
                          </span>
                        )}
                        {round.gridlockMoves > 0 && (
                          <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                            Gridlock {round.gridlockMoves}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          />

          <Disclosure
            title="Stroop Flex"
            icon={<Repeat size={18} weight="duotone" className="text-primary" />}
            render={() => (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {ruleStats.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-woven-text">{rule.label}</span>
                        <span className={cn('text-sm font-bold', scoreTone(rule.accuracy))}>
                          {rule.accuracy}%
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs text-woven-text-muted">
                        <MetricRow label={t('game.cogTask.trials', 'Trials')} value={rule.total} />
                        <MetricRow
                          label={t('game.cogTask.correct', 'Correct')}
                          value={rule.correct}
                        />
                        <MetricRow
                          label={t('report.stroop.errors', 'Errors')}
                          value={rule.errors}
                        />
                        <MetricRow
                          label={t('report.stroop.timeouts', 'Timeouts')}
                          value={rule.timedOut}
                        />
                        <MetricRow
                          label={t('game.cogTask.avgRt', 'Mean RT')}
                          value={`${rule.meanRt}ms`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {colorStats.map((color) => (
                    <div
                      key={color.id}
                      className="rounded-xl border border-woven-border/60 bg-woven-surface p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-3 w-3 rounded-full', colorMeta[color.id].bg)} />
                          <span className={cn('text-sm font-bold', colorMeta[color.id].text)}>
                            {color.label}
                          </span>
                        </div>
                        <span className={cn('text-sm font-bold', scoreTone(color.accuracy))}>
                          {color.accuracy}%
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs text-woven-text-muted">
                        <MetricRow label={t('game.cogTask.trials', 'Trials')} value={color.total} />
                        <MetricRow
                          label={t('game.cogTask.correct', 'Correct')}
                          value={color.correct}
                        />
                        <MetricRow
                          label={t('report.stroop.errors', 'Errors')}
                          value={color.errors}
                        />
                        <MetricRow
                          label={t('report.stroop.timeouts', 'Timeouts')}
                          value={color.timedOut}
                        />
                        <MetricRow
                          label={t('report.stroop.wordTrap', 'Word trap')}
                          value={color.wordTrap}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {stroopResults.map((turn, index) => {
                    const ink = isStroopColorId(turn.trial.inkColor) ? turn.trial.inkColor : 'red';
                    const word = isStroopColorId(turn.trial.wordColor) ? turn.trial.wordColor : ink;
                    const response =
                      turn.response && isStroopColorId(turn.response) ? turn.response : null;
                    return (
                      <div
                        key={`${ink}-${word}-${index}`}
                        className="rounded-xl border border-woven-border/60 bg-woven-surface px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold tabular-nums text-woven-text-muted">
                            {String(index + warmupRounds + 1).padStart(2, '0')}
                          </span>
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            {turn.trial.rule === 'word'
                              ? t('game.cogTask.stroopFlex.ruleWord')
                              : t('game.cogTask.stroopFlex.ruleInk')}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              turn.trial.congruent
                                ? 'bg-woven-correct/12 text-woven-correct'
                                : 'bg-woven-incorrect/12 text-woven-incorrect',
                            )}
                          >
                            {turn.trial.congruent
                              ? t('report.stroop.congruent', 'Congruent')
                              : t('report.stroop.incongruent', 'Incongruent')}
                          </span>
                          <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                            {t('report.stroop.ink', 'Ink')}:{' '}
                            <span className={colorMeta[ink].text}>
                              {t(`game.cogTask.stroop.${ink}Label`)}
                            </span>
                          </span>
                          <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                            {t('report.stroop.word', 'Word')}:{' '}
                            <span className={colorMeta[word].text}>
                              {t(`game.cogTask.stroop.${word}Label`)}
                            </span>
                          </span>
                          {response && (
                            <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                              {t('report.stroop.response', 'Response')}:{' '}
                              <span className={colorMeta[response].text}>
                                {t(`game.cogTask.stroop.${response}Label`)}
                              </span>
                            </span>
                          )}
                          <span className="rounded-full bg-woven-bg px-2 py-0.5 text-[10px] font-semibold text-woven-text-muted">
                            <Timer size={10} weight="bold" className="mr-1 inline-flex" />
                            {Math.round(turn.rt)}ms
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
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
                    );
                  })}
                </div>
              </div>
            )}
          />

          {includeGridlock && (
            <Disclosure
              title="Gridlock"
              icon={<PuzzlePiece size={18} weight="duotone" className="text-primary" />}
              render={() => (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-woven-border/60 bg-woven-surface p-3">
                      <div className="text-xs uppercase tracking-wide text-woven-text-muted">
                        Solved
                      </div>
                      <div className="mt-1 text-2xl font-black text-woven-text">
                        {summary.gridlockSolved}
                      </div>
                    </div>
                    <div className="rounded-xl border border-woven-border/60 bg-woven-surface p-3">
                      <div className="text-xs uppercase tracking-wide text-woven-text-muted">
                        Moves
                      </div>
                      <div className="mt-1 text-2xl font-black text-woven-text">
                        {summary.gridlockMoves}
                      </div>
                    </div>
                    <div className="rounded-xl border border-woven-border/60 bg-woven-surface p-3">
                      <div className="text-xs uppercase tracking-wide text-woven-text-muted">
                        Efficiency
                      </div>
                      <div
                        className={cn(
                          'mt-1 text-2xl font-black',
                          scoreTone(summary.gridlockScore ?? 0),
                        )}
                      >
                        {summary.gridlockScore ?? 0}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {gridlockRounds.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-woven-border/60 bg-woven-surface px-3 py-4 text-sm text-woven-text-muted">
                        {t('report.gridlock.noMoves', 'No Gridlock moves recorded.')}
                      </div>
                    ) : (
                      gridlockRounds.map((round) => (
                        <div
                          key={round.index}
                          className="rounded-xl border border-woven-border/60 bg-woven-surface px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-woven-text">
                              Round {String(round.index).padStart(2, '0')}
                            </span>
                            <span className="rounded-full bg-woven-bg px-2 py-1 text-xs font-semibold text-woven-text-muted">
                              {round.gridlockMoves} move{round.gridlockMoves > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            />
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-woven-border/60 bg-woven-surface p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-woven-text">
            <ListChecks size={18} weight="duotone" />
            Session integrity
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <MetricRow
              label="Composite units"
              value={`${summary.correctUnits}/${summary.totalUnits}`}
            />
            <MetricRow label="Warmup" value={warmupRounds} />
            <MetricRow label="Duration" value={`${Math.round(summary.durationMs / 1000)}s`} />
            <MetricRow label="Persisted" value={report ? 'Yes' : 'Saving...'} />
          </div>
        </div>

        <Hatching id="dual-mix-report-actions" className="mt-6 text-foreground/70" />
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-soft transition-all active:scale-[0.98]"
          >
            <ArrowClockwise size={18} weight="bold" />
            <span>{t('game.cogTask.restart')}</span>
          </button>
          {report && onGoToStats && (
            <button
              type="button"
              onClick={() => onGoToStats(report)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
            >
              <ChartLine size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onBackToHome}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
          >
            <House size={18} />
          </button>
        </div>
      </div>
      <Hatching id="dual-mix-report-bottom" className="text-foreground/70" />
    </div>
  );
}
