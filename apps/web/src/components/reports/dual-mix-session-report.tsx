import type { ReactNode } from 'react';
import { House, ListChecks, PuzzlePiece, Repeat, Timer, Waveform } from '@phosphor-icons/react';
import { cn } from '@neurodual/ui';
import type { SessionEndReportModel } from '@neurodual/logic';
import { getPerformanceBand, type DualMixSummary } from '../../lib/dual-mix-session';

export interface DualMixSessionReportProps {
  readonly summary: DualMixSummary;
  readonly totalRounds: number;
  readonly nLevel: number;
  readonly includeGridlock: boolean;
  readonly report?: SessionEndReportModel | null;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onGoToStats?: (report: SessionEndReportModel) => void;
}

function MetricCard({
  icon,
  title,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-woven-text">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/50 text-lg">
          {icon}
        </span>
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
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
  strong = false,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-mono font-semibold text-foreground', strong && 'text-base')}>
        {value}
      </span>
    </div>
  );
}

export function DualMixSessionReport({
  summary,
  totalRounds,
  nLevel,
  includeGridlock,
  report,
  onPlayAgain,
  onBackToHome,
  onGoToStats,
}: DualMixSessionReportProps) {
  const overallBand = getPerformanceBand(summary.overallScore);
  const nbackBand = getPerformanceBand(summary.nbackAcc);
  const stroopBand = getPerformanceBand(summary.stroopAcc);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 md:px-6">
      <div className="rounded-[28px] border border-border/60 bg-gradient-to-b from-card to-card/80 p-5 shadow-[0_24px_80px_hsl(var(--foreground)/0.08)]">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
            Dual Mix
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Session report</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalRounds} rounds · N-{nLevel} · {includeGridlock ? '3 tasks' : '2 tasks'} ·{' '}
            {Math.round(summary.durationMs / 1000)}s
          </p>
          <div className="mt-4 inline-flex flex-col items-center rounded-2xl border border-border/50 bg-background/70 px-5 py-4">
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Overall
            </span>
            <span className={cn('mt-1 text-3xl font-black', overallBand.tone)}>
              {summary.overallScore}%
            </span>
            <span className={cn('text-sm font-semibold', overallBand.tone)}>{overallBand.label}</span>
          </div>
        </div>

        <div className={cn('mt-6 grid gap-4', includeGridlock ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
          <MetricCard icon={<Waveform weight="duotone" />} title="N-Back">
            <MetricRow label="Position" value={`${summary.nPosCorrect}/${summary.nTotal}`} />
            <MetricRow label="Audio" value={`${summary.nAudCorrect}/${summary.nTotal}`} />
            <MetricRow label="Combined" value={`${summary.nbackAcc}%`} strong />
            <p className={cn('mt-3 text-xs font-semibold', nbackBand.tone)}>{nbackBand.label}</p>
          </MetricCard>

          <MetricCard icon={<Repeat weight="duotone" />} title="Stroop Flex">
            <MetricRow label="Accuracy" value={`${summary.stroopAcc}%`} strong />
            <MetricRow label="Correct" value={`${summary.stroopCorrect}/${totalRounds}`} />
            <MetricRow label="Mean RT" value={`${summary.stroopAvgRT} ms`} />
            <p className={cn('mt-3 text-xs font-semibold', stroopBand.tone)}>{stroopBand.label}</p>
          </MetricCard>

          {includeGridlock && (
            <MetricCard icon={<PuzzlePiece weight="duotone" />} title="Gridlock">
              <MetricRow label="Moves" value={summary.gridlockMoves} />
              <MetricRow label="Solved" value={summary.gridlockSolved} />
              <MetricRow label="Session score" value={`${summary.gridlockScore ?? 0}%`} strong />
            </MetricCard>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border/50 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks size={18} weight="duotone" />
            Session integrity
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MetricRow label="Composite units" value={`${summary.correctUnits}/${summary.totalUnits}`} />
            <MetricRow label="Duration" value={`${Math.round(summary.durationMs / 1000)} s`} />
            <MetricRow label="Persisted" value={report ? 'Yes' : 'Saving...'} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-transform active:scale-95"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition-transform active:scale-95"
          >
            <House size={16} />
            Home
          </button>
          {report && onGoToStats && (
            <button
              type="button"
              onClick={() => onGoToStats(report)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition-transform active:scale-95"
            >
              <Timer size={16} />
              Stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
