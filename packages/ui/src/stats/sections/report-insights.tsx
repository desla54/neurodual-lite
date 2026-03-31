/**
 * ReportInsights - Generic spec-driven metrics section
 *
 * Displays mode-specific insights based on spec.insightMetrics.
 * The spec defines WHICH metrics to display, the UI renders them generically.
 *
 * Metrics are extracted from modeDetails based on the InsightMetricId.
 * Special sections (slotAccuracy, recentAccuracies) are rendered separately.
 */

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { SessionEndReportModel, MemoDetails, ModeSpecificDetails } from '@neurodual/logic';
import { getModeDisplaySpec, type InsightMetricId } from '@neurodual/logic';
import type { ReportLabels, ModeColors } from './types';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

export interface ReportInsightsProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
  readonly modeColors: ModeColors;
}

// ModeDetails is the union of all possible mode details from the report
// We use ModeSpecificDetails which includes all mode types
type ModeDetails = NonNullable<ModeSpecificDetails>;

interface MetricConfig {
  readonly getValue: (details: ModeDetails) => number | undefined;
  readonly format: (value: number) => string;
  readonly getLabelKey: (labels: ReportLabels) => string | undefined;
  readonly isMono?: boolean;
}

// =============================================================================
// Metric Configuration Registry
// =============================================================================

/**
 * Maps InsightMetricId to extraction and formatting logic.
 * Each metric knows how to extract its value from any ModeDetails.
 */
const METRIC_CONFIGS: Record<InsightMetricId, MetricConfig> = {
  confidence: {
    getValue: (d) => ('confidenceScore' in d ? d.confidenceScore : undefined),
    format: (v) => `${Math.round(v)}%`,
    getLabelKey: (labels) => labels.confidenceScore,
  },
  directness: {
    getValue: (d) => ('directnessRatio' in d ? d.directnessRatio : undefined),
    format: (v) => `${Math.round(v * 100)}%`,
    getLabelKey: (labels) => labels.directnessRatio,
  },
  placementTime: {
    getValue: (d) => ('avgPlacementTimeMs' in d ? d.avgPlacementTimeMs : undefined),
    format: (v) => `${Math.round(v)}ms`,
    getLabelKey: (labels) => labels.placementTime,
    isMono: true,
  },
  wrongSlotDwell: {
    getValue: (d) => ('wrongSlotDwellMs' in d ? d.wrongSlotDwellMs : undefined),
    format: (v) => `${Math.round(v)}ms`,
    getLabelKey: (labels) => labels.wrongSlotDwell,
    isMono: true,
  },
  fluency: {
    getValue: (d) => ('fluencyScore' in d ? (d as MemoDetails).fluencyScore : undefined),
    format: (v) => `${Math.round(v)}%`,
    getLabelKey: (labels) => labels.fluencyScore,
  },
  corrections: {
    getValue: (d) => ('correctionsCount' in d ? (d as MemoDetails).correctionsCount : undefined),
    format: (v) => `${v}`,
    getLabelKey: (labels) => labels.corrections,
  },
  responseTime: {
    getValue: (d) => ('avgResponseTimeMs' in d ? d.avgResponseTimeMs : undefined),
    format: (v) => `${Math.round(v)}ms`,
    getLabelKey: (labels) => labels.reactionTime,
    isMono: true,
  },
  writingAccuracy: {
    getValue: (d) => ('writingAccuracy' in d ? d.writingAccuracy : undefined),
    format: (v) => `${Math.round(v * 100)}%`,
    getLabelKey: (labels) => labels.writingAccuracy,
  },
  // Special metrics handled separately (not as simple cards)
  slotAccuracy: {
    getValue: () => undefined, // Rendered as special section
    format: () => '',
    getLabelKey: () => undefined,
  },
  recentAccuracies: {
    getValue: () => undefined, // Rendered as special section
    format: () => '',
    getLabelKey: () => undefined,
  },
};

// =============================================================================
// Generic Components
// =============================================================================

interface InsightMetricCardProps {
  readonly value: string;
  readonly label: string;
  readonly modeColors: ModeColors;
  readonly isMono?: boolean;
  readonly colSpan?: 1 | 2;
}

function InsightMetricCard({
  value,
  label,
  modeColors,
  isMono = false,
  colSpan = 1,
}: InsightMetricCardProps): ReactNode {
  return (
    <div
      className={cn(
        'p-2 bg-background/60 dark:bg-background/30 rounded-lg border border-border/50',
        colSpan === 2 && 'col-span-2',
      )}
    >
      <div className={cn('text-lg font-bold', isMono && 'font-mono', modeColors.text)}>{value}</div>
      <div className={cn('text-xs', modeColors.textLight)}>{label}</div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ReportInsights({ data, labels, modeColors }: ReportInsightsProps): ReactNode {
  const details = data.modeDetails;
  if (!details) return null;

  // Get insight metrics from spec
  const displaySpec = getModeDisplaySpec(data.gameMode, data.taskType);
  const insightMetrics = displaySpec.insightMetrics ?? [];

  if (insightMetrics.length === 0) return null;

  // Filter out special metrics that need custom rendering
  const standardMetrics = insightMetrics.filter(
    (m) => m !== 'slotAccuracy' && m !== 'recentAccuracies',
  );
  const hasSlotAccuracy = insightMetrics.includes('slotAccuracy');
  const hasRecentAccuracies = insightMetrics.includes('recentAccuracies');

  // Check if we have any data to display
  const hasAnyMetric = standardMetrics.some((metricId) => {
    const config = METRIC_CONFIGS[metricId];
    return config.getValue(details) !== undefined;
  });
  const hasMemoSlotData = hasSlotAccuracy && 'bySlotIndex' in details && details.bySlotIndex;
  const hasMemoRecentData =
    hasRecentAccuracies && 'recentAccuracies' in details && details.recentAccuracies?.length;

  if (!hasAnyMetric && !hasMemoSlotData && !hasMemoRecentData) return null;

  return (
    <div className={cn('w-full p-4 rounded-xl border', modeColors.bg, modeColors.border)}>
      <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-3', modeColors.text)}>
        {labels.modeInsights}
      </h3>

      {/* Standard metric cards */}
      <div className="grid grid-cols-2 gap-3">
        {standardMetrics.map((metricId) => {
          const config = METRIC_CONFIGS[metricId];
          const value = config.getValue(details);
          if (value === undefined) return null;

          const label = config.getLabelKey(labels);
          if (!label) return null;

          return (
            <InsightMetricCard
              key={metricId}
              value={config.format(value)}
              label={label}
              modeColors={modeColors}
              isMono={config.isMono}
            />
          );
        })}

        {/* Trend (special case for memo) */}
        {'trend' in details && details.trend && (
          <TrendCard trend={details.trend} labels={labels} modeColors={modeColors} />
        )}
      </div>

      {/* Slot accuracy breakdown (memo-specific) */}
      {hasMemoSlotData && (
        <SlotAccuracySection
          bySlotIndex={(details as MemoDetails).bySlotIndex ?? {}}
          labels={labels}
          modeColors={modeColors}
        />
      )}

      {/* Recent accuracies mini chart (memo-specific) */}
      {hasMemoRecentData && (
        <RecentAccuraciesSection
          recentAccuracies={(details as MemoDetails).recentAccuracies ?? []}
          labels={labels}
          modeColors={modeColors}
        />
      )}
    </div>
  );
}

// =============================================================================
// Special Sections (Memo-specific)
// =============================================================================

interface TrendCardProps {
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly labels: ReportLabels;
  readonly modeColors: ModeColors;
}

function TrendCard({ trend, labels, modeColors }: TrendCardProps): ReactNode {
  const getTrendLabel = (t: 'improving' | 'stable' | 'declining') => {
    switch (t) {
      case 'improving':
        return labels.trendImproving;
      case 'stable':
        return labels.trendStable;
      case 'declining':
        return labels.trendDeclining;
    }
  };

  const getTrendColor = (t: 'improving' | 'stable' | 'declining') => {
    switch (t) {
      case 'improving':
        return 'text-emerald-600';
      case 'stable':
        return 'text-muted-foreground';
      case 'declining':
        return 'text-orange-600';
    }
  };

  return (
    <div className="p-2 bg-background/60 dark:bg-background/30 rounded-lg border border-border/50 col-span-2">
      <div className={cn('text-lg font-bold', getTrendColor(trend))}>{getTrendLabel(trend)}</div>
      <div className={cn('text-xs', modeColors.textLight)}>{labels.trend}</div>
    </div>
  );
}

interface SlotAccuracySectionProps {
  readonly bySlotIndex: Record<number, { accuracy: number; count: number }>;
  readonly labels: ReportLabels;
  readonly modeColors: ModeColors;
}

function SlotAccuracySection({
  bySlotIndex,
  labels,
  modeColors,
}: SlotAccuracySectionProps): ReactNode {
  const { t } = useTranslation();
  if (Object.keys(bySlotIndex).length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className={cn('text-xs font-medium mb-2', modeColors.textLight)}>
        {labels.slotAccuracy ?? t('stats.unifiedReport.insights.slotAccuracy', 'Accuracy by slot')}
      </div>
      <div className="flex gap-2">
        {Object.entries(bySlotIndex)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([slot, slotData]) => (
            <div
              key={slot}
              className="flex-1 p-2 bg-background/60 dark:bg-background/30 rounded-lg border border-border/50 text-center"
            >
              <div className={cn('text-sm font-bold', modeColors.text)}>
                {Math.round(slotData.accuracy * 100)}%
              </div>
              <div className={cn('text-xs', modeColors.textLight)}>N-{slot}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

interface RecentAccuraciesSectionProps {
  readonly recentAccuracies: readonly number[];
  readonly labels: ReportLabels;
  readonly modeColors: ModeColors;
}

function RecentAccuraciesSection({
  recentAccuracies,
  labels,
  modeColors,
}: RecentAccuraciesSectionProps): ReactNode {
  const { t } = useTranslation();
  if (recentAccuracies.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className={cn('text-xs font-medium mb-2', modeColors.textLight)}>
        {labels.recentAccuracies ??
          t('stats.unifiedReport.insights.recentAccuracies', 'Latest windows')}
      </div>
      <div className="flex items-end gap-1 h-8">
        {recentAccuracies.map((acc, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-blue-300"
            style={{ height: `${Math.max(10, acc * 100)}%` }}
            title={`${Math.round(acc * 100)}%`}
          />
        ))}
      </div>
    </div>
  );
}
