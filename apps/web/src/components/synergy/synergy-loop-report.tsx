import { useMemo, type ReactNode } from 'react';
import { Brain, Eye, ClockCountdown, Lightning } from '@phosphor-icons/react';
import { Button, Disclosure, Hatching, ReportHero, ReportPerformance } from '@neurodual/ui';
import type { ContextualMessage } from '@neurodual/logic';
import { useTranslation } from 'react-i18next';
import { buildSynergyLoopViewModel } from '../../lib/synergy-loop-report';
import { useUnifiedReportLabels } from '../../hooks/use-unified-report-labels';
import type { SynergyConfig, SynergySessionResult } from '../../stores/synergy-store';
import { SynergyRoundChart } from './synergy-round-chart';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function buildSynergyMessage(
  totalScore: number,
  avgTrackScore: number,
  avgNbackScore: number,
  totalLoops: number,
  completedLoops: number,
  t: (key: string, fallback: string, values?: Record<string, unknown>) => string,
): ContextualMessage {
  const scoreGap = Math.abs(avgTrackScore - avgNbackScore);
  const strongerMode =
    avgTrackScore > avgNbackScore
      ? t('home.synergy.dualTrackTitle', 'Dual Track')
      : t('home.synergy.nbackTitle', 'N-Back');

  const headline =
    totalScore >= 85
      ? t('home.synergy.reportHeadlineExcellent', 'Very strong Synergy loop')
      : totalScore >= 70
        ? t('home.synergy.reportHeadlineGood', 'Solid Synergy loop')
        : totalScore >= 55
          ? t('home.synergy.reportHeadlineAverage', 'Loop completed, still uneven')
          : t('home.synergy.reportHeadlineLow', 'Loop finished, foundation to reinforce');

  const subline =
    scoreGap <= 6
      ? t(
          'home.synergy.reportSublineBalanced',
          'The two tasks stayed well aligned across {{count}} completed rounds.',
          { count: completedLoops || totalLoops },
        )
      : t(
          'home.synergy.reportSublineImbalanced',
          '{{mode}} stayed ahead. The next loop should focus on reducing the gap.',
          { mode: strongerMode },
        );

  const insight = t('home.synergy.reportInsight', 'Average loop score: {{score}}%.', {
    score: Math.round(totalScore),
  });

  return { level: 'good', headline, subline, insight };
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}): ReactNode {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 p-3 text-center backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-center text-muted-foreground">{icon}</div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function SynergyLoopReport({
  config,
  sessionResults,
  onRestart,
}: {
  config: SynergyConfig;
  sessionResults: readonly SynergySessionResult[];
  onRestart: () => void;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const labels = useUnifiedReportLabels();
  const viewModel = useMemo(
    () => buildSynergyLoopViewModel(sessionResults, config),
    [config, sessionResults],
  );

  if (!viewModel.report) {
    return (
      <div className="relative px-4 py-6">
        <p className="mb-4 text-center text-sm font-semibold text-foreground">
          {t('home.synergyComplete', 'Complete!')}
        </p>
        <div className="mb-5 flex justify-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl">
              <Eye size={20} weight="duotone" className="text-[hsl(var(--woven-blue))]" />
            </div>
            <span className="text-lg font-black tabular-nums">{viewModel.avgTrackScore}%</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-xl">
              <Brain size={20} weight="duotone" className="text-[hsl(var(--woven-cyan))]" />
            </div>
            <span className="text-lg font-black tabular-nums">{viewModel.avgNbackScore}%</span>
          </div>
        </div>
        <SynergyRoundChart
          data={viewModel.roundChartData}
          trackLabel={t('home.synergy.dualTrackTitle', 'Dual Track')}
          nbackLabel={t('home.synergy.nbackTitle', 'N-Back')}
          roundLabel={t('home.synergy.roundLabel', 'R')}
        />
        <div className="mt-5 flex justify-center">
          <Button size="lg" className="rounded-full px-8" onClick={onRestart}>
            {t('home.synergyRestart', 'Restart')}
          </Button>
        </div>
      </div>
    );
  }

  const report = viewModel.report;
  const message = buildSynergyMessage(
    report.ups.score,
    viewModel.avgTrackScore,
    viewModel.avgNbackScore,
    config.totalLoops,
    viewModel.completedLoops,
    (key, fallback, values) => t(key, { defaultValue: fallback, ...(values ?? {}) }),
  );
  const progressTone = report.ups.score >= 80 ? 'up' : report.ups.score >= 65 ? 'stay' : 'down';

  return (
    <div className="relative px-4 py-6">
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('home.modeSelector.synergy', 'Synergy')}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            {t('home.synergy.loopReportTitle', 'Loop report')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'home.synergy.loopReportDescription',
              '{{count}} completed rounds, one final report.',
              { count: viewModel.completedLoops || config.totalLoops },
            )}
          </p>
        </div>

        <ReportHero
          data={report}
          message={message}
          labels={{
            ...labels,
            modeScoreLabel: t('home.synergy.loopScore', 'Loop score'),
            modeScoreTooltip: t(
              'home.synergy.loopScoreTooltip',
              'Average unified score across all Dual Track and N-Back steps in this loop.',
            ),
          }}
          onBackToHome={() => {}}
          showTitle={false}
          progressTone={progressTone}
          showMobileCloseButton={false}
        />

        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            icon={<Eye size={18} weight="duotone" className="text-[hsl(var(--woven-blue))]" />}
            label={t('home.synergy.dualTrackTitle', 'Dual Track')}
            value={`${viewModel.avgTrackScore}%`}
          />
          <SummaryCard
            icon={<Brain size={18} weight="duotone" className="text-[hsl(var(--woven-cyan))]" />}
            label={t('home.synergy.nbackTitle', 'N-Back')}
            value={`${viewModel.avgNbackScore}%`}
          />
          <SummaryCard
            icon={<ClockCountdown size={18} weight="duotone" />}
            label={t('home.synergy.totalDuration', 'Duration')}
            value={formatDuration(report.durationMs)}
          />
          <SummaryCard
            icon={<Lightning size={18} weight="duotone" />}
            label={t('home.synergy.totalXp', 'XP')}
            value={String(viewModel.totalXp)}
          />
        </div>

        <Hatching id="synergy-loop-report-hatch" className="text-foreground/70" />

        <ReportPerformance data={report} labels={labels} />

        <Disclosure
          title={t('home.synergy.roundByRound', 'Round by round')}
          lazy={false}
          defaultOpen
        >
          <div className="space-y-4 px-1 pb-1">
            <SynergyRoundChart
              data={viewModel.roundChartData}
              trackLabel={t('home.synergy.dualTrackTitle', 'Dual Track')}
              nbackLabel={t('home.synergy.nbackTitle', 'N-Back')}
              roundLabel={t('home.synergy.roundLabel', 'R')}
            />
            <div className="space-y-2">
              {viewModel.stepSummaries.map((step, index) => (
                <div
                  key={step.key}
                  className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/70 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {step.modeLabel}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {t('home.synergy.stepIndex', 'Step {{index}}', { index: index + 1 })}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      N-{step.nLevel}
                      {step.createdAt
                        ? ` · ${new Date(step.createdAt).toLocaleString(i18n.language)}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-lg font-black tabular-nums text-foreground">
                    {step.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Disclosure>

        <div className="flex justify-center">
          <Button size="lg" className="rounded-full px-8" onClick={onRestart}>
            {t('home.synergyRestart', 'Restart')}
          </Button>
        </div>
      </div>
    </div>
  );
}
