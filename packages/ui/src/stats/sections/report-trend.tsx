/**
 * ReportTrend - Historical trend section (RECENT_TREND)
 *
 * Compares the current native mode score against recent sessions of the same mode.
 */

import { ChartBar, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SessionEndReportModel } from '@neurodual/logic';
import type { ReportLabels } from './types';
import {
  formatTrendScore,
  getHistoryTrendScore,
  getTrendDirection,
  resolveTrendMetricContext,
} from './report-trend-score';
import { useRecentSessionsForTrendQuery } from '../../queries/history';
import { CustomTooltip } from '../charts';

// =============================================================================
// Types
// =============================================================================

export interface ReportTrendProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

const MIN_REQUIRED_SESSIONS = 3;

// =============================================================================
// Component
// =============================================================================

export function ReportTrend({ data, labels }: ReportTrendProps): ReactNode {
  const { t } = useTranslation();
  const { sessions, isPending } = useRecentSessionsForTrendQuery({
    gameMode: data.gameMode,
    referenceCreatedAt: data.createdAt,
    excludeSessionId: data.sessionId,
    limit: 5,
  });

  const trend = useMemo(() => {
    const metric = resolveTrendMetricContext(data);
    const reportScore = metric.score;
    const recentPrevious = sessions
      .map((session) => getHistoryTrendScore(session, metric.strategy))
      .filter((score): score is number => score !== null && Number.isFinite(score));

    const series = [reportScore, ...recentPrevious];
    const previousScores = series.slice(1);
    if (previousScores.length < MIN_REQUIRED_SESSIONS - 1) {
      return {
        ready: false,
        reportScore,
        previousAverage: null,
        direction: 'stable' as const,
        series,
        unit: metric.unit,
      };
    }

    const previousAverage =
      previousScores.reduce((sum, value) => sum + value, 0) / previousScores.length;
    const direction = getTrendDirection(
      reportScore,
      previousAverage,
      metric.lowerIsBetter,
      metric.stableDeltaThreshold,
    );

    return {
      ready: true,
      reportScore,
      previousAverage,
      direction,
      series,
      unit: metric.unit,
    };
  }, [data.gameMode, data.modeScore.unit, data.modeScore.value, sessions]);

  const scoreSeries = trend.series.slice().reverse();
  const chartData = useMemo(() => {
    const currentLabel = t('stats.unifiedReport.trendCurrent', 'Current');
    const total = scoreSeries.length;

    return scoreSeries.map((score, index) => {
      const isCurrent = index === total - 1;
      const sessionsAgo = total - 1 - index;
      const tooltipLabel = isCurrent ? currentLabel : `Session -${sessionsAgo}`;

      return {
        key: `session-${index}`,
        score:
          trend.unit === '%'
            ? Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0))
            : score,
        tickLabel: isCurrent ? currentLabel : `-${sessionsAgo}`,
        tooltipLabel,
      };
    });
  }, [scoreSeries, t, trend.unit]);
  const tickLabels = useMemo(
    () => new Map(chartData.map((point) => [point.key, point.tickLabel])),
    [chartData],
  );
  const tooltipLabels = useMemo(
    () => new Map(chartData.map((point) => [point.key, point.tooltipLabel])),
    [chartData],
  );
  const currentPoint = chartData.at(-1);
  const yDomain = useMemo(() => {
    if (trend.unit === '%') {
      return [0, 100] as const;
    }

    const scores = chartData.map((point) => point.score).filter((score) => Number.isFinite(score));
    if (scores.length === 0) return [0, 1] as const;

    const min = Math.min(...scores);
    const max = Math.max(...scores);

    if (Math.abs(max - min) <= Number.EPSILON) {
      const pad = trend.unit === "d'" ? 0.5 : 2;
      return [min - pad, max + pad] as const;
    }

    const pad = (max - min) * 0.15;
    return [min - pad, max + pad] as const;
  }, [chartData, trend.unit]);
  const formatYAxisTick = useMemo(() => {
    if (trend.unit === '%') {
      return (value: number) => `${Math.round(value)}%`;
    }
    if (trend.unit === "d'") {
      return (value: number) => value.toFixed(1);
    }
    return (value: number) => `${Math.round(value)}`;
  }, [trend.unit]);
  const directionConfig = {
    improving: {
      icon: TrendUp,
      text: labels.trendImproving ?? t('stats.unifiedReport.trendImproving', 'Improving'),
      color: 'text-woven-correct',
    },
    stable: {
      icon: Minus,
      text: labels.trendStable ?? t('stats.unifiedReport.trendStable', 'Stable'),
      color: 'text-woven-focus',
    },
    declining: {
      icon: TrendDown,
      text: labels.trendDeclining ?? t('stats.unifiedReport.trendDeclining', 'Declining'),
      color: 'text-woven-incorrect',
    },
  };
  const config = directionConfig[trend.direction];
  const DirectionIcon = config.icon;

  return (
    <div className="w-full py-3 px-4 bg-white dark:bg-white/[0.05] rounded-xl border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ChartBar size={16} weight="duotone" className="opacity-60" />
          <span className="text-xs font-medium">
            {labels.trend ?? t('stats.unifiedReport.trend', 'Trend')}
          </span>
        </div>
        {trend.ready && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${config.color}`}>
            <DirectionIcon size={14} weight="bold" />
            <span>{config.text}</span>
          </div>
        )}
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground/70">{t('common.loading', 'Loading...')}</p>
      ) : !trend.ready ? (
        <p className="text-xs text-muted-foreground/70">
          {(
            labels.trendNotEnoughSessions ??
            t(
              'stats.unifiedReport.trendNotEnoughSessions',
              'Play {{count}} more session(s) to see your progress',
            )
          ).replace('{{count}}', String(Math.max(1, MIN_REQUIRED_SESSIONS - trend.series.length)))}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md bg-white dark:bg-white/[0.05] border border-border/40 p-2">
              <p className="text-muted-foreground">
                {t('stats.unifiedReport.trendCurrent', 'Actuelle')}
              </p>
              <p className="text-foreground font-bold tabular-nums">
                {formatTrendScore(trend.reportScore, trend.unit)}
              </p>
            </div>
            <div className="rounded-md bg-white dark:bg-white/[0.05] border border-border/40 p-2">
              <p className="text-muted-foreground">
                {t('stats.unifiedReport.trendPrevious', 'Previous')}
              </p>
              <p className="text-foreground font-bold tabular-nums">
                {formatTrendScore(trend.previousAverage ?? 0, trend.unit)}
              </p>
            </div>
          </div>

          <div className="rounded-md bg-white dark:bg-white/[0.05] border border-border/40 p-2">
            <div
              className="h-32 w-full"
              role="img"
              aria-label={t('stats.unifiedReport.trend', 'Trend')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  accessibilityLayer={false}
                  data={chartData}
                  margin={{ top: 14, right: 12, left: 6, bottom: 18 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    opacity={0.45}
                  />
                  <XAxis
                    dataKey="key"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                    interval="preserveStartEnd"
                    minTickGap={30}
                    tickMargin={6}
                    padding={{ left: 8, right: 8 }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value: string) => tickLabels.get(value) ?? ''}
                  />
                  <YAxis
                    width={34}
                    domain={yDomain}
                    ticks={trend.unit === '%' ? [0, 25, 50, 75, 100] : undefined}
                    tickCount={trend.unit === '%' ? undefined : 4}
                    padding={{ top: 8, bottom: 8 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    allowDataOverflow={trend.unit === '%'}
                    tickFormatter={formatYAxisTick}
                  />
                  <Tooltip
                    cursor={false}
                    content={
                      <CustomTooltip
                        valueFormatter={(value) => formatTrendScore(Number(value), trend.unit)}
                        labelFormatter={(label) => tooltipLabels.get(label) ?? label}
                      />
                    }
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="score"
                    name={labels.trend ?? t('stats.unifiedReport.trend', 'Trend')}
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2.25}
                    dot={{
                      r: 3,
                      fill: 'hsl(var(--muted-foreground))',
                      fillOpacity: 0.6,
                      strokeWidth: 0,
                    }}
                    activeDot={{ r: 4.5, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                  />
                  {currentPoint && (
                    <ReferenceDot
                      x={currentPoint.key}
                      y={currentPoint.score}
                      r={4.5}
                      fill="hsl(var(--foreground))"
                      stroke="hsl(var(--background))"
                      strokeWidth={1.25}
                      ifOverflow="extendDomain"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/80">
              {t('stats.unifiedReport.trendSource', {
                count: chartData.length,
                defaultValue: 'Based on your latest {{count}} sessions in the same mode',
              })}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
