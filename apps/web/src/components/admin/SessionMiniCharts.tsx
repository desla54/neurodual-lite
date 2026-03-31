/**
 * SessionMiniCharts - Inline mini-charts for session overview
 *
 * Features:
 * - RT over time sparkline
 * - Accuracy progress bar
 * - Response phase distribution (during/after)
 * - Input method distribution (keyboard/touch)
 */

import type { GameEvent } from '@neurodual/logic';
import { Card } from '@neurodual/ui';
import { Timer, Target, Clock, Keyboard } from '@phosphor-icons/react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

interface SessionMiniChartsProps {
  events: readonly GameEvent[];
}

interface ChartData {
  reactionTimes: number[];
  accuracy: { correct: number; total: number };
  responsePhases: { during: number; after: number };
  inputMethods: { keyboard: number; touch: number; other: number };
}

// =============================================================================
// Data Extraction
// =============================================================================

function extractChartData(events: readonly GameEvent[]): ChartData {
  const reactionTimes: number[] = [];
  let correct = 0;
  let total = 0;
  let duringPhase = 0;
  let afterPhase = 0;
  let keyboard = 0;
  let touch = 0;
  let other = 0;

  for (const event of events) {
    // Response events (various modes)
    if (
      event.type === 'USER_RESPONDED' ||
      event.type === 'FLOW_DROP_ATTEMPTED' ||
      event.type === 'RECALL_PICKED' ||
      event.type === 'DUAL_PICK_DROP_ATTEMPTED' ||
      event.type === 'TRACE_RESPONDED'
    ) {
      // Extract reaction time
      const rtKey = 'reactionTimeMs' in event ? 'reactionTimeMs' : 'placementTimeMs';
      const rt = (event as unknown as Record<string, unknown>)[rtKey];
      if (typeof rt === 'number' && rt > 0) {
        reactionTimes.push(rt);
      }

      // Extract correctness
      if ('correct' in event) {
        total++;
        if ((event as { correct: boolean }).correct) {
          correct++;
        }
      }

      // Extract response phase
      if ('responsePhase' in event) {
        const phase = (event as { responsePhase: string }).responsePhase;
        if (phase === 'during') duringPhase++;
        else if (phase === 'after') afterPhase++;
      }

      // Extract input method
      if ('inputMethod' in event) {
        const method = (event as { inputMethod: string }).inputMethod;
        if (method === 'keyboard') keyboard++;
        else if (method === 'touch' || method === 'pointer') touch++;
        else other++;
      }
    }
  }

  return {
    reactionTimes,
    accuracy: { correct, total },
    responsePhases: { during: duringPhase, after: afterPhase },
    inputMethods: { keyboard, touch, other },
  };
}

// =============================================================================
// Components
// =============================================================================

function Sparkline({
  data,
  color = 'accent',
  noDataLabel,
}: {
  data: number[];
  color?: string;
  noDataLabel: string;
}): ReactNode {
  if (data.length === 0) {
    return <div className="text-xs text-muted-foreground">{noDataLabel}</div>;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  // Normalize to 0-100%
  const normalized = data.map((v) => ((v - min) / range) * 100);

  // Sample if too many points (keep ~30 max)
  const sampled =
    normalized.length > 30
      ? normalized.filter((_, i) => i % Math.ceil(normalized.length / 30) === 0)
      : normalized;

  const barWidth = 100 / sampled.length;

  return (
    <div className="flex items-end h-8 gap-px">
      {sampled.map((height, idx) => (
        <div
          key={idx}
          className={`bg-${color} rounded-t-sm opacity-70 hover:opacity-100 transition-opacity`}
          style={{
            width: `${barWidth}%`,
            height: `${Math.max(height, 5)}%`,
            backgroundColor: `var(--${color}, hsl(var(--accent)))`,
          }}
        />
      ))}
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}): ReactNode {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {value}/{max} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function DistributionBar({
  segments,
  noDataLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  noDataLabel: string;
}): ReactNode {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) {
    return <div className="text-xs text-muted-foreground">{noDataLabel}</div>;
  }

  return (
    <div className="space-y-1">
      <div className="h-3 rounded-full overflow-hidden flex">
        {segments.map((segment, idx) => {
          const width = (segment.value / total) * 100;
          if (width === 0) return null;
          return (
            <div
              key={idx}
              className="h-full transition-all"
              style={{
                width: `${width}%`,
                backgroundColor: segment.color,
              }}
            />
          );
        })}
      </div>
      <div className="flex gap-3 text-3xs">
        {segments.map((segment, idx) => {
          if (segment.value === 0) return null;
          return (
            <div key={idx} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-muted-foreground">
                {segment.label}: {segment.value} ({((segment.value / total) * 100).toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="bg-surface/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SessionMiniCharts({ events }: SessionMiniChartsProps): ReactNode {
  const { t } = useTranslation();
  const noDataLabel = t('common.noData', 'No data');
  const data = useMemo(() => extractChartData(events), [events]);

  // Calculate averages
  const avgRT =
    data.reactionTimes.length > 0
      ? Math.round(data.reactionTimes.reduce((a, b) => a + b, 0) / data.reactionTimes.length)
      : 0;

  const hasData =
    data.reactionTimes.length > 0 ||
    data.accuracy.total > 0 ||
    data.responsePhases.during + data.responsePhases.after > 0 ||
    data.inputMethods.keyboard + data.inputMethods.touch + data.inputMethods.other > 0;

  if (!hasData) {
    return null;
  }

  return (
    <Card className="mb-4">
      <div className="text-sm font-semibold mb-3">
        {t('admin.analytics.title', 'Session analytics')}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* RT over time */}
        {data.reactionTimes.length > 0 && (
          <StatCard
            icon={<Timer size={14} />}
            title={t('admin.analytics.reactionTime', 'Reaction time')}
          >
            <Sparkline data={data.reactionTimes} noDataLabel={noDataLabel} />
            <div className="text-xs text-muted-foreground mt-1">
              {t('admin.analytics.avg', 'avg')}:{' '}
              <span className="font-mono text-white">{avgRT}ms</span>
              {' | '}
              {t('admin.analytics.min', 'min')}:{' '}
              <span className="font-mono">{Math.min(...data.reactionTimes)}ms</span>
              {' | '}
              {t('admin.analytics.max', 'max')}:{' '}
              <span className="font-mono">{Math.max(...data.reactionTimes)}ms</span>
            </div>
          </StatCard>
        )}

        {/* Accuracy */}
        {data.accuracy.total > 0 && (
          <StatCard icon={<Target size={14} />} title={t('admin.analytics.accuracy', 'Accuracy')}>
            <ProgressBar
              value={data.accuracy.correct}
              max={data.accuracy.total}
              color={
                data.accuracy.correct / data.accuracy.total >= 0.8
                  ? '#22c55e'
                  : data.accuracy.correct / data.accuracy.total >= 0.6
                    ? '#f59e0b'
                    : '#ef4444'
              }
              label={t('admin.analytics.correct', 'Correct')}
            />
          </StatCard>
        )}

        {/* Response Phase */}
        {data.responsePhases.during + data.responsePhases.after > 0 && (
          <StatCard
            icon={<Clock size={14} />}
            title={t('admin.analytics.responsePhase', 'Response phase')}
          >
            <DistributionBar
              segments={[
                {
                  label: t('admin.analytics.during', 'During'),
                  value: data.responsePhases.during,
                  color: '#22c55e',
                },
                {
                  label: t('admin.analytics.after', 'After'),
                  value: data.responsePhases.after,
                  color: '#3b82f6',
                },
              ]}
              noDataLabel={noDataLabel}
            />
          </StatCard>
        )}

        {/* Input Method */}
        {data.inputMethods.keyboard + data.inputMethods.touch + data.inputMethods.other > 0 && (
          <StatCard
            icon={<Keyboard size={14} />}
            title={t('admin.analytics.inputMethod', 'Input method')}
          >
            <DistributionBar
              segments={[
                {
                  label: t('admin.analytics.keyboard', 'Keyboard'),
                  value: data.inputMethods.keyboard,
                  color: '#8b5cf6',
                },
                {
                  label: t('admin.analytics.touch', 'Touch'),
                  value: data.inputMethods.touch,
                  color: '#ec4899',
                },
                {
                  label: t('admin.analytics.other', 'Other'),
                  value: data.inputMethods.other,
                  color: '#6b7280',
                },
              ]}
              noDataLabel={noDataLabel}
            />
          </StatCard>
        )}
      </div>
    </Card>
  );
}
