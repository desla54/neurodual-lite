/**
 * Advanced Stats Section Renderer
 *
 * Maps semantic section IDs to React components for advanced stats.
 * The Spec defines WHAT to show, this renderer defines HOW.
 *
 * Pattern follows simple-section-renderer.tsx.
 */

import { memo, useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Medal,
  Sparkle,
  Timer,
  Pulse,
  Brain,
  Clock,
  Trophy,
  ChartLine,
  Keyboard,
  Mouse,
  HandTap,
  CaretDown,
  Check,
  ArrowsOut,
} from '@phosphor-icons/react';

import type { AdvancedStatsSectionId, StatsInputMethod } from '@neurodual/logic';
import {
  TEMPO_PES_THRESHOLDS,
  UPS_TIER_ADVANCED,
  UPS_TIER_NOVICE,
  SDTCalculator,
} from '@neurodual/logic';
import {
  BetaBadge,
  Hatching,
  InfoSheet,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../primitives';
import {
  CustomTooltip,
  FixedYAxis,
  FullscreenChartModal,
  PortalTooltip,
  ScrollableChart,
} from './charts';
import { useFullscreenChartHeight } from './charts/chart-fullscreen-context';
import {
  getModalityIcon,
  isGlobalView,
  isTempoLikeMode,
  getResponsiveTicks,
  downsampleEvenly,
} from './helpers';
import type { ModeType } from './filters/types';

// =============================================================================
// Types
// =============================================================================

export interface AdvancedStatsData {
  upsStats: {
    upsScore: number;
    upsScoreLast: number | null;
    upsScoreBest: number | null;
  } | null;
  modeScore: {
    last: number | null;
    avg: number | null;
    best: number | null;
  } | null;
  distributionStats: {
    upsStdDev: number;
    upsPercentiles: { p25: number; p50: number; p75: number };
    durationPercentiles: { p25: number; p50: number; p75: number };
    upsBuckets: Array<{ min: number; max: number; count: number }>;
  } | null;
  timingStats: {
    avgResponseTimeMs: number | null;
    medianResponseTimeMs: number | null;
    medianResponseTimeDuringStimulusMs: number | null;
    medianResponseTimeAfterStimulusMs: number | null;
    medianResponseTimeAfterStimulusOffsetMs: number | null;
    minResponseTimeMs: number | null;
    maxResponseTimeMs: number | null;
    p25ResponseTimeMs: number | null;
    p75ResponseTimeMs: number | null;
    avgISIMs: number | null;
    avgStimulusDurationMs: number | null;
    responsesDuringStimulus: number;
    responsesAfterStimulus: number;
    responseCount: number;
    computedRtCount?: number;
    processingLagP50Ms?: number | null;
    processingLagP95Ms?: number | null;
    filteredTooFastCount?: number;
    filteredTouchBounceCount?: number;
    duplicateResponseCount?: number;
    inputToDispatchP50Ms?: number | null;
    inputToDispatchP95Ms?: number | null;
    inputToPaintP50Ms?: number | null;
    inputToPaintP95Ms?: number | null;
    avShowDriftP50Ms?: number | null;
    avShowDriftP95Ms?: number | null;
    avHideDriftP50Ms?: number | null;
    avHideDriftP95Ms?: number | null;
  } | null;
  modalityTimingStats: Array<{
    modality: string;
    avgResponseTimeMs: number;
    medianResponseTimeMs: number | null;
    stdDevResponseTimeMs: number | null;
    count: number;
    duringCount: number;
    avgDuringResponseTimeMs: number | null;
    stdDevDuringResponseTimeMs: number | null;
    hasReliableData: boolean;
    isSmallSample: boolean;
  }>;
  postErrorSlowingStats: Array<{
    modality: string;
    avgRtOnHitsMs: number;
    hitTrialCount: number;
    avgRtAfterErrorMs: number | null;
    pesRatio: number | null;
    postErrorTrialCount: number;
  }>;
  modeBreakdown: Array<{
    mode: string;
    sessionsCount: number;
    totalDurationMs: number;
    unifiedAccuracy: number;
    avgNLevel: number;
    maxNLevel: number;
    avgUps: number;
  }>;
  modalityStats: Array<{
    modality: string;
    totalActions: number;
    unifiedAccuracy: number;
    hits: number;
    misses: number;
    falseAlarms: number;
    correctRejections: number;
  }>;
  flowConfidence: {
    confidenceScoreAvg: number | null;
    confidenceScoreLast: number | null;
    directnessRatioAvg: number | null;
    wrongSlotDwellMsTotal: number | null;
  } | null;
  recallConfidence: {
    confidenceScoreAvg: number | null;
    confidenceScoreLast: number | null;
    fluencyScoreAvg: number | null;
    fluencyScoreLast: number | null;
    correctionsCountTotal: number | null;
  } | null;
  // Time series for evolution charts
  timeSeries: Array<{
    day: string;
    upsScore: number;
    minUpsScore: number | null;
    maxUpsScore: number | null;
  }>;
}

export interface AdvancedStatsSectionRendererProps {
  sections: readonly AdvancedStatsSectionId[];
  data: AdvancedStatsData;
  mode: ModeType;
  /** Current input method filter for timing stats */
  inputMethod: StatsInputMethod;
  /** Callback when input method filter changes */
  onInputMethodChange?: (method: StatsInputMethod) => void;
  /** If true, show UPS sections (beta feature) */
  betaEnabled?: boolean;
  /** If true, reveal alpha-only aggregate sections */
  alphaEnabled?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

const MAX_CHART_POINTS = 400;
const EVOLUTION_CHART_HEIGHT = 160;
const EVOLUTION_CHART_HEIGHT_FULLSCREEN = 320;
const MAX_FULL_X_AXIS_TICKS = 120;
const LAST_FILLED_SCROLL_ALIGN = 0.75;
const CHART_EDGE_MARGIN = 8;
const Y_AXIS_WIDTH_PERCENT = 26;

type ReliabilityTier = 'low' | 'medium' | 'high';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function getReliabilityTier(n: number): ReliabilityTier {
  if (n < 20) return 'low';
  if (n < 60) return 'medium';
  return 'high';
}

function getReliabilityColor(tier: ReliabilityTier): string {
  if (tier === 'high') return 'bg-emerald-500';
  if (tier === 'medium') return 'bg-primary';
  return 'bg-amber-500';
}

function getReliabilityLabel(tier: ReliabilityTier, t: TranslateFn): string {
  switch (tier) {
    case 'high':
      return t('stats.advanced.reliabilityHigh');
    case 'medium':
      return t('stats.advanced.reliabilityMedium');
    case 'low':
      return t('stats.advanced.reliabilityLow');
  }
}

type SeriesToggleOption = {
  key: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
};

function SeriesToggleGroup({
  ariaLabel,
  options,
  className,
}: {
  ariaLabel: string;
  options: SeriesToggleOption[];
  className?: string;
}): ReactNode {
  return (
    <div className={`flex justify-center ${className ?? 'mt-3'}`}>
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 rounded-lg bg-secondary/60 p-1"
      >
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.pressed}
            onClick={option.onToggle}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              option.pressed
                ? 'bg-background/80 text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.pressed && <Check size={12} className="opacity-80" />}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function getLastFilledIndex<T>(data: readonly T[], isFilled: (point: T) => boolean): number {
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const point = data[i];
    if (point && isFilled(point)) return i;
  }
  return Math.max(0, data.length - 1);
}

/**
 * Ensures the time series covers at least the last 7 days ending today.
 * Fills gaps with null (or 0 for sessions) to maintain time axis continuity.
 */
function ensureWeeklyData(timeSeries: AdvancedStatsData['timeSeries']) {
  type OutPoint = {
    dateIso: string;
    fullDate: Date;
    original: AdvancedStatsData['timeSeries'][number] | null;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Default start is 6 days ago (to show full week including today)
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 6);

  const normalized = timeSeries
    .map((p) => {
      const d = new Date(p.day);
      const t = d.getTime();
      if (!Number.isFinite(t)) return null;
      d.setHours(0, 0, 0, 0);
      return { ts: d.getTime(), dateIso: d.toISOString(), fullDate: d, original: p };
    })
    .filter(
      (
        v,
      ): v is {
        ts: number;
        dateIso: string;
        fullDate: Date;
        original: AdvancedStatsData['timeSeries'][number];
      } => v !== null,
    )
    .sort((a, b) => a.ts - b.ts);

  // Deduplicate by day (keep last value for the day)
  const unique: typeof normalized = [];
  for (const p of normalized) {
    const last = unique[unique.length - 1];
    if (last && last.ts === p.ts) {
      unique[unique.length - 1] = p;
    } else {
      unique.push(p);
    }
  }

  let startDate = oneWeekAgo;
  const first = unique[0];
  if (first) {
    const firstDataDate = new Date(first.ts);
    if (firstDataDate < startDate) startDate = firstDataDate;
  }

  // Prevent massive arrays if the first date is e.g. 1970 or user has years of data.
  // Above 365 days (1 year), we don't pad every single day.
  const daysDiff = (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 365) {
    const mapped: OutPoint[] = unique.map((p) => ({
      dateIso: p.dateIso,
      fullDate: p.fullDate,
      original: p.original,
    }));

    // Add today if missing, so the chart always ends on today
    const last = mapped[mapped.length - 1];
    const lastDay = last ? last.fullDate.getTime() : 0;
    if (lastDay < today.getTime()) {
      mapped.push({
        dateIso: today.toISOString(),
        fullDate: today,
        original: null,
      });
    }
    return mapped;
  }

  const paddedData: OutPoint[] = [];
  const currentDate = new Date(startDate);

  // Map for fast lookup
  const dataMap = new Map(unique.map((p) => [p.ts, p.original] as const));

  while (currentDate <= today) {
    const time = currentDate.getTime();
    const originalPoint = dataMap.get(time);

    paddedData.push({
      dateIso: currentDate.toISOString(),
      fullDate: new Date(currentDate),
      original: originalPoint || null,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return paddedData;
}

function formatModeScore(value: number | null, mode: ModeType): string {
  if (value === null) return '-';
  switch (mode) {
    case 'DualPlace':
    case 'DualMemo':
      return `${(value * 100).toFixed(0)}%`;
    case 'BrainWorkshop':
    case 'Journey':
      return `${value.toFixed(0)}%`;
    case 'DualnbackClassic':
      return `${value.toFixed(0)}%`;
    default:
      return value.toFixed(2);
  }
}

const NOOP_INPUT_METHOD_CHANGE: (method: StatsInputMethod) => void = () => {};

// =============================================================================
// Section Render Functions
// =============================================================================

function renderUPSSummary(
  data: AdvancedStatsData,
  t: (key: string) => string,
  betaEnabled: boolean,
): ReactNode {
  const ups = data.upsStats ?? {
    upsScore: 0,
    upsScoreLast: null,
    upsScoreBest: null,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Medal size={18} className="text-amber-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.upsTitle')}
        </h3>
        <InfoSheet>{t('stats.tooltips.upsDesc')}</InfoSheet>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-3xl font-bold text-primary">
            {betaEnabled && ups.upsScoreLast !== null ? ups.upsScoreLast.toFixed(0) : '-'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.lastScore')}</p>
        </div>
        <div>
          <p className="text-3xl font-bold">{betaEnabled ? ups.upsScore.toFixed(0) : '-'}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.avgScore')}</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-emerald-500">
            {betaEnabled && ups.upsScoreBest !== null ? ups.upsScoreBest.toFixed(0) : '-'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.bestScore')}</p>
        </div>
      </div>
    </div>
  );
}

function renderModeScore(data: AdvancedStatsData, mode: ModeType, t: TranslateFn): ReactNode {
  // Mode guard: only show for specific modes, not global view
  if (isGlobalView(mode)) return null;

  const score = data.modeScore ?? { last: null, avg: null, best: null };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-6">
      <h3 className="text-xs font-medium text-muted-foreground mb-4">
        {t(`stats.modeScore.${mode}`)}
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold">{formatModeScore(score.last, mode)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.lastScore')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{formatModeScore(score.avg, mode)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.avgScore')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-500">{formatModeScore(score.best, mode)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.advanced.bestScore')}</p>
        </div>
      </div>
    </div>
  );
}

function renderFlowConfidence(data: AdvancedStatsData, mode: ModeType, t: TranslateFn): ReactNode {
  // Mode guard: only show for DualPlace mode
  if (mode !== 'DualPlace') return null;

  const conf = data.flowConfidence ?? {
    confidenceScoreLast: null,
    confidenceScoreAvg: null,
    directnessRatioAvg: null,
    wrongSlotDwellMsTotal: null,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkle size={18} className="text-amber-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.confidence.flowTitle')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.flowConfidenceDesc')}</InfoSheet>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-amber-500">
            {conf.confidenceScoreLast?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.last')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{conf.confidenceScoreAvg?.toFixed(0) ?? '-'}%</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.avg')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {conf.directnessRatioAvg !== null
              ? `${(conf.directnessRatioAvg * 100).toFixed(0)}%`
              : '-'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.directness')}</p>
          <InfoSheet iconSize={10}>{t('stats.tooltips.directnessDesc')}</InfoSheet>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {conf.wrongSlotDwellMsTotal !== null
              ? `${(conf.wrongSlotDwellMsTotal / 1000).toFixed(1)}s`
              : '-'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.hesitation')}</p>
          <InfoSheet iconSize={10}>{t('stats.tooltips.hesitationDesc')}</InfoSheet>
        </div>
      </div>
    </div>
  );
}

function renderRecallConfidence(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
): ReactNode {
  // Mode guard: only show for DualMemo mode
  if (mode !== 'DualMemo') return null;

  const conf = data.recallConfidence ?? {
    confidenceScoreLast: null,
    confidenceScoreAvg: null,
    fluencyScoreLast: null,
    fluencyScoreAvg: null,
    correctionsCountTotal: null,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkle size={18} className="text-purple-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.confidence.recallTitle')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.recallConfidenceDesc')}</InfoSheet>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-purple-500">
            {conf.confidenceScoreLast?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.last')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{conf.confidenceScoreAvg?.toFixed(0) ?? '-'}%</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.avg')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{conf.fluencyScoreLast?.toFixed(0) ?? '-'}%</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.fluency')}</p>
          <InfoSheet iconSize={10}>{t('stats.tooltips.fluencyDesc')}</InfoSheet>
        </div>
        <div>
          <p className="text-2xl font-bold">{conf.fluencyScoreAvg?.toFixed(0) ?? '-'}%</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.fluencyAvg')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{conf.correctionsCountTotal ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.confidence.corrections')}</p>
          <InfoSheet iconSize={10}>{t('stats.tooltips.correctionsDesc')}</InfoSheet>
        </div>
      </div>
    </div>
  );
}

function renderDistribution(
  data: AdvancedStatsData,
  t: TranslateFn,
  betaEnabled: boolean,
): ReactNode {
  const dist = data.distributionStats ?? {
    upsStdDev: 0,
    upsPercentiles: { p25: 0, p50: 0, p75: 0 },
    durationPercentiles: { p25: 0, p50: 0, p75: 0 },
    upsBuckets: [
      { min: 0, max: 20, count: 0 },
      { min: 20, max: 40, count: 0 },
      { min: 40, max: 60, count: 0 },
      { min: 60, max: 80, count: 0 },
      { min: 80, max: 100, count: 0 },
    ],
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-6">
      <h3 className="text-xs font-medium text-muted-foreground mb-4">
        {t('stats.advanced.upsDistribution')}
      </h3>

      {/* UPS Histogram */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {t('stats.advanced.upsDistributionLabel')}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {betaEnabled ? `σ = ${dist.upsStdDev.toFixed(1)}` : '-'}
            </span>
            <InfoSheet iconSize={12}>{t('stats.tooltips.upsStdDevDesc')}</InfoSheet>
          </div>
        </div>
        <div className="h-24">
          <ResponsiveContainer width="100%" height={96}>
            <BarChart
              accessibilityLayer={false}
              data={
                betaEnabled
                  ? dist.upsBuckets.map((bucket) => ({
                      range: `${bucket.min}-${bucket.max}`,
                      count: bucket.count,
                    }))
                  : dist.upsBuckets.map((bucket) => ({
                      range: `${bucket.min}-${bucket.max}`,
                      count: 0,
                    }))
              }
              margin={{ top: 5, right: 5, bottom: 20, left: 5 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.4}
              />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 9, fill: 'currentColor' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)', opacity: 0.4 }}
                className="text-muted-foreground"
              />
              <Tooltip
                cursor={false}
                content={
                  <CustomTooltip
                    valueFormatter={(value) => `${value} ${t('stats.advanced.sessions')}`}
                    labelFormatter={(label) => `UPS: ${label}`}
                  />
                }
              />
              <Bar
                isAnimationActive={false}
                dataKey="count"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                name={t('stats.advanced.sessions')}
              >
                {dist.upsBuckets.map((_, i) => (
                  <Cell key={i} fill={['#967B75', '#A68568', '#C8A878', '#7FAA8A', '#5A8862'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Percentiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-muted-foreground">
              {t('stats.advanced.upsPercentiles')}
            </span>
            <InfoSheet iconSize={12}>{t('stats.tooltips.percentilesDesc')}</InfoSheet>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="px-1.5 sm:px-2 py-1 bg-secondary rounded text-muted-foreground whitespace-nowrap">
              P25: {betaEnabled ? dist.upsPercentiles.p25.toFixed(0) : '-'}
            </span>
            <span className="px-1.5 sm:px-2 py-1 bg-primary/10 rounded text-primary font-medium whitespace-nowrap">
              P50: {betaEnabled ? dist.upsPercentiles.p50.toFixed(0) : '-'}
            </span>
            <span className="px-1.5 sm:px-2 py-1 bg-secondary rounded text-muted-foreground whitespace-nowrap">
              P75: {betaEnabled ? dist.upsPercentiles.p75.toFixed(0) : '-'}
            </span>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block mb-2">
            {t('stats.advanced.durationPercentiles')}
          </span>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <span className="px-1.5 sm:px-2 py-1 bg-secondary rounded text-muted-foreground whitespace-nowrap">
              {betaEnabled ? `${Math.round(dist.durationPercentiles.p25 / 60000)}m` : '-'}
            </span>
            <span className="px-1.5 sm:px-2 py-1 bg-primary/10 rounded text-primary font-medium whitespace-nowrap">
              {betaEnabled ? `${Math.round(dist.durationPercentiles.p50 / 60000)}m` : '-'}
            </span>
            <span className="px-1.5 sm:px-2 py-1 bg-secondary rounded text-muted-foreground whitespace-nowrap">
              {betaEnabled ? `${Math.round(dist.durationPercentiles.p75 / 60000)}m` : '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderTimingStats(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
  inputMethod?: StatsInputMethod,
): ReactNode {
  // Mode guard: only show for tempo-like modes, not global view
  if (isGlobalView(mode)) return null;
  if (!isTempoLikeMode(mode)) return null;

  const timing = data.timingStats ?? {
    avgResponseTimeMs: null,
    medianResponseTimeMs: null,
    medianResponseTimeDuringStimulusMs: null,
    medianResponseTimeAfterStimulusMs: null,
    medianResponseTimeAfterStimulusOffsetMs: null,
    minResponseTimeMs: null,
    maxResponseTimeMs: null,
    p25ResponseTimeMs: null,
    p75ResponseTimeMs: null,
    avgISIMs: null,
    avgStimulusDurationMs: null,
    responsesDuringStimulus: 0,
    responsesAfterStimulus: 0,
    responseCount: 0,
  };

  // Note: cursor travel only applies to mouse clicks.
  const isMouseInput = inputMethod === 'mouse';
  const tier = getReliabilityTier(timing.responseCount);
  const tierLabel = getReliabilityLabel(tier, t);
  const tierColor = getReliabilityColor(tier);

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Timer size={16} className="text-primary" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.responseTime')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.reactionTimeDesc')}</InfoSheet>
        <div className="ml-auto flex items-center gap-2 text-3xs text-muted-foreground">
          <span>{t('stats.advanced.sampleSize', { count: timing.responseCount })}</span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${tierColor}`} />
            <span>
              {t('stats.advanced.reliability')}: {tierLabel}
            </span>
          </span>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{t('stats.advanced.avgRT')}</span>
          <span className="font-medium">
            {timing.avgResponseTimeMs !== null ? `${timing.avgResponseTimeMs.toFixed(0)} ms` : '-'}
          </span>
        </div>
        {timing.medianResponseTimeMs !== null && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{t('stats.advanced.medianRT')}</span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.medianRTDesc')}</InfoSheet>
            </div>
            <span className="font-medium">{timing.medianResponseTimeMs.toFixed(0)} ms</span>
          </div>
        )}
        {(timing.medianResponseTimeDuringStimulusMs !== null ||
          timing.medianResponseTimeAfterStimulusMs !== null) && (
          <div className="pt-2 border-t border-border space-y-1">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-3xs">{t('stats.advanced.medianDuring')}</span>
              <span className="text-3xs">
                {timing.medianResponseTimeDuringStimulusMs !== null
                  ? `${timing.medianResponseTimeDuringStimulusMs.toFixed(0)} ms`
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-3xs">{t('stats.advanced.medianAfter')}</span>
              <span className="text-3xs">
                {timing.medianResponseTimeAfterStimulusMs !== null
                  ? `${timing.medianResponseTimeAfterStimulusMs.toFixed(0)} ms`
                  : '-'}
              </span>
            </div>
            <p className="text-3xs text-muted-foreground text-center">
              {t('stats.advanced.rtDefinitionNote')}
            </p>
          </div>
        )}
        {timing.minResponseTimeMs !== null && timing.maxResponseTimeMs !== null && (
          <div className="pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground block mb-2">
              {t('stats.advanced.rtDistribution')}
            </span>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-1.5 bg-secondary/50 rounded">
                <p className="font-medium">{Math.round(timing.minResponseTimeMs)}</p>
                <p className="text-3xs text-muted-foreground">{t('stats.advanced.min')}</p>
              </div>
              <div className="p-1.5 bg-secondary/50 rounded">
                <p className="font-medium">{Math.round(timing.p25ResponseTimeMs ?? 0)}</p>
                <p className="text-3xs text-muted-foreground">P25</p>
              </div>
              <div className="p-1.5 bg-secondary/50 rounded">
                <p className="font-medium">{Math.round(timing.p75ResponseTimeMs ?? 0)}</p>
                <p className="text-3xs text-muted-foreground">P75</p>
              </div>
              <div className="p-1.5 bg-secondary/50 rounded">
                <p className="font-medium">{Math.round(timing.maxResponseTimeMs)}</p>
                <p className="text-3xs text-muted-foreground">{t('stats.advanced.max')}</p>
              </div>
            </div>
          </div>
        )}
        {(timing.responsesDuringStimulus > 0 || timing.responsesAfterStimulus > 0) && (
          <div className="pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground block mb-2">
              {t('stats.advanced.responsePhase')}
            </span>
            {(() => {
              const total = timing.responsesDuringStimulus + timing.responsesAfterStimulus;
              const duringPct = total > 0 ? (timing.responsesDuringStimulus / total) * 100 : 0;
              const afterPct = total > 0 ? (timing.responsesAfterStimulus / total) * 100 : 0;
              return (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1 text-center p-2 bg-primary/10 rounded">
                      <p className="text-sm font-medium text-primary">{duringPct.toFixed(0)}%</p>
                      <p className="text-3xs text-muted-foreground">
                        {t('stats.advanced.duringStim')}
                      </p>
                    </div>
                    <div className="flex-1 text-center p-2 bg-secondary rounded">
                      <p className="text-sm font-medium">{afterPct.toFixed(0)}%</p>
                      <p className="text-3xs text-muted-foreground">
                        {t('stats.advanced.afterStim')}
                      </p>
                    </div>
                  </div>
                  <p className="text-3xs text-muted-foreground text-center mt-2">
                    {t('stats.advanced.phaseMachineNote')}
                  </p>
                </>
              );
            })()}
          </div>
        )}
        {(timing.avgISIMs !== null || timing.avgStimulusDurationMs !== null) && (
          <div className="pt-2 border-t border-border text-xs">
            {timing.avgISIMs !== null && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>ISI {t('stats.advanced.avg')}</span>
                <span>{timing.avgISIMs.toFixed(0)} ms</span>
              </div>
            )}
            {timing.avgStimulusDurationMs !== null && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('stats.advanced.stimulusDuration')}</span>
                <span>{timing.avgStimulusDurationMs.toFixed(0)} ms</span>
              </div>
            )}
          </div>
        )}
        {isMouseInput && (
          <div className="pt-2 border-t border-border">
            <p className="text-3xs text-amber-500/80 text-center flex items-center justify-center gap-1">
              <Mouse size={10} />
              {t('stats.advanced.rtAdjustedForCursor')}
            </p>
          </div>
        )}

        {(() => {
          const hasDiagnostics =
            timing.computedRtCount !== undefined ||
            timing.processingLagP50Ms !== undefined ||
            timing.filteredTooFastCount !== undefined ||
            timing.filteredTouchBounceCount !== undefined ||
            timing.duplicateResponseCount !== undefined ||
            timing.inputToDispatchP50Ms !== undefined ||
            timing.inputToPaintP50Ms !== undefined ||
            timing.avShowDriftP50Ms !== undefined ||
            timing.avHideDriftP50Ms !== undefined ||
            timing.medianResponseTimeAfterStimulusOffsetMs !== null;

          if (!hasDiagnostics) return null;

          const formatMs = (value: number | null | undefined, signed = false): string => {
            if (value === null || value === undefined || !Number.isFinite(value)) return '-';
            const rounded = Math.round(value);
            return signed && rounded > 0 ? `+${rounded} ms` : `${rounded} ms`;
          };

          const computedRtCount = timing.computedRtCount ?? 0;

          return (
            <details className="pt-2 border-t border-border text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                {t('stats.advanced.timingDiagnostics')}
              </summary>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.computedRtCoverage')}</span>
                  <span className="tabular-nums">
                    {computedRtCount}/{timing.responseCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.processingLag')}</span>
                  <span className="tabular-nums">
                    P50 {formatMs(timing.processingLagP50Ms)} · P95{' '}
                    {formatMs(timing.processingLagP95Ms)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.filteredTooFast')}</span>
                  <span className="tabular-nums">{timing.filteredTooFastCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.filteredTouchBounce')}</span>
                  <span className="tabular-nums">{timing.filteredTouchBounceCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.duplicateResponses')}</span>
                  <span className="tabular-nums">{timing.duplicateResponseCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.medianAfterOffset')}</span>
                  <span className="tabular-nums">
                    {formatMs(timing.medianResponseTimeAfterStimulusOffsetMs)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.uiPipelineLag')}</span>
                  <span className="tabular-nums">
                    {t('stats.advanced.uiPipelineDispatchShort')}: P50{' '}
                    {formatMs(timing.inputToDispatchP50Ms)} · P95{' '}
                    {formatMs(timing.inputToDispatchP95Ms)} ·{' '}
                    {t('stats.advanced.uiPipelinePaintShort')}: P50{' '}
                    {formatMs(timing.inputToPaintP50Ms)} · P95 {formatMs(timing.inputToPaintP95Ms)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{t('stats.advanced.avSyncDrift')}</span>
                  <span className="tabular-nums">
                    {t('stats.advanced.avSyncDriftShowShort')}: P50{' '}
                    {formatMs(timing.avShowDriftP50Ms, true)} · P95{' '}
                    {formatMs(timing.avShowDriftP95Ms, true)} ·{' '}
                    {t('stats.advanced.avSyncDriftHideShort')}: P50{' '}
                    {formatMs(timing.avHideDriftP50Ms, true)} · P95{' '}
                    {formatMs(timing.avHideDriftP95Ms, true)}
                  </span>
                </div>
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}

function renderModalityTiming(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
  inputMethod?: StatsInputMethod,
): ReactNode {
  // Mode guard: only show for tempo-like modes, not global view
  if (isGlobalView(mode)) return null;
  if (!isTempoLikeMode(mode)) return null;

  const stats = data.modalityTimingStats;

  const isMouseInput = inputMethod === 'mouse';
  const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
  const tier = getReliabilityTier(totalCount);
  const tierLabel = getReliabilityLabel(tier, t);
  const tierColor = getReliabilityColor(tier);

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Timer size={16} className="text-blue-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.rtByModality')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.rtByModalityDesc')}</InfoSheet>
        <div className="ml-auto flex items-center gap-2 text-3xs text-muted-foreground">
          <span>{t('stats.advanced.sampleSize', { count: totalCount })}</span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${tierColor}`} />
            <span>
              {t('stats.advanced.reliability')}: {tierLabel}
            </span>
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 italic">-</p>
        ) : (
          stats.map((stat) => (
            <div key={stat.modality} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {getModalityIcon(stat.modality)}
                <span className="capitalize">{t(`common.${stat.modality}`)}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="font-medium">{Math.round(stat.avgResponseTimeMs)} ms</span>
                {stat.medianResponseTimeMs !== null && (
                  <span className="text-xs text-muted-foreground">
                    (med: {Math.round(stat.medianResponseTimeMs)})
                  </span>
                )}
                <span className="text-3xs text-muted-foreground">
                  {t('stats.advanced.sampleSizeShort', { count: stat.count })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      {isMouseInput && stats.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-3xs text-amber-500/80 text-center flex items-center justify-center gap-1">
            <Mouse size={10} />
            {t('stats.advanced.rtAdjustedForCursor')}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compute Coefficient of Variation (CV) = (stdDev / mean) * 100
 * Returns null if stdDev or avgResponseTimeMs is null/zero
 */
function computeCV(avgMs: number, stdDevMs: number | null): number | null {
  if (stdDevMs === null || avgMs <= 0) return null;
  return (stdDevMs / avgMs) * 100;
}

/**
 * Get CV interpretation label
 * CV < 15%: Very consistent
 * CV 15-25%: Consistent
 * CV 25-35%: Moderate
 * CV > 35%: High variability
 */
function getCVColor(cv: number): string {
  if (cv < 15) return 'text-emerald-500';
  if (cv < 25) return 'text-primary';
  if (cv < 35) return 'text-amber-500';
  return 'text-pink-500';
}

function renderTimingVariability(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
  inputMethod?: StatsInputMethod,
): ReactNode {
  // Mode guard: only show for tempo-like modes, not global view
  if (isGlobalView(mode)) return null;
  if (!isTempoLikeMode(mode)) return null;

  const stats = data.modalityTimingStats;

  // Prefer "during stimulus" subset to avoid mixing onset/offset on legacy data.
  // Fallback: if the during-subset is too small, use all responses (event-level recompute already
  // prefers capturedAtMs - stimulusShownAtMs when available).
  const validDuringStats = stats.filter(
    (s) =>
      s.avgDuringResponseTimeMs !== null &&
      s.stdDevDuringResponseTimeMs !== null &&
      s.duringCount >= 5,
  );
  const validAllStats =
    validDuringStats.length > 0
      ? []
      : stats.filter(
          (s) => s.count >= 5 && s.stdDevResponseTimeMs !== null && s.avgResponseTimeMs > 0,
        );

  const isMouseInput = inputMethod === 'mouse';
  const totalCount =
    validDuringStats.length > 0
      ? validDuringStats.reduce((sum, s) => sum + s.duringCount, 0)
      : validAllStats.reduce((sum, s) => sum + s.count, 0);
  const tier = getReliabilityTier(totalCount);
  const tierLabel = getReliabilityLabel(tier, t);
  const tierColor = getReliabilityColor(tier);

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Pulse size={16} className="text-violet-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.rtVariability')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.rtVariabilityDesc')}</InfoSheet>
        <div className="ml-auto flex items-center gap-2 text-3xs text-muted-foreground">
          <span>{t('stats.advanced.sampleSize', { count: totalCount })}</span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${tierColor}`} />
            <span>
              {t('stats.advanced.reliability')}: {tierLabel}
            </span>
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {validDuringStats.length === 0 && validAllStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 italic">-</p>
        ) : (
          (validDuringStats.length > 0 ? validDuringStats : validAllStats).map((stat) => {
            const isDuring = validDuringStats.length > 0;
            const avgMs = isDuring ? (stat.avgDuringResponseTimeMs ?? 0) : stat.avgResponseTimeMs;
            const stdDevMs = isDuring ? stat.stdDevDuringResponseTimeMs : stat.stdDevResponseTimeMs;
            const sampleSize = isDuring ? stat.duringCount : stat.count;

            const cv = computeCV(avgMs, stdDevMs) ?? 0;

            return (
              <div key={stat.modality} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {getModalityIcon(stat.modality)}
                  <span className="capitalize">{t(`common.${stat.modality}`)}</span>
                  <span
                    className={`text-xxs ${sampleSize < 10 ? 'text-amber-500' : 'text-muted-foreground'}`}
                    title={sampleSize < 10 ? t('stats.advanced.smallSample') : undefined}
                  >
                    {t('stats.advanced.sampleSizeShort', { count: sampleSize })}
                  </span>
                  {!isDuring && (
                    <span className="text-xxs text-muted-foreground/70">{t('common.all')}</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${getCVColor(cv)}`}>{cv.toFixed(0)}%</span>
                  <span className="text-3xs text-muted-foreground">CV</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-border space-y-1">
        <p className="text-3xs text-muted-foreground text-center">{t('stats.advanced.cvLegend')}</p>
        <p className="text-3xs text-muted-foreground text-center">
          {t('stats.advanced.cvDuringOnlyNote')}
        </p>
        {isMouseInput && (
          <p className="text-3xs text-amber-500/80 text-center flex items-center justify-center gap-1">
            <Mouse size={10} />
            {t('stats.advanced.rtAdjustedForCursor')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Get color for PES ratio interpretation
 * > 1.10: Vigilant (green) - slows down significantly after error
 * 1.02 - 1.10: Adjusts (primary) - mild slowing
 * 0.98 - 1.02: Neutral (amber) - no change
 * < 0.98: Rushes (pink) - speeds up after error (bad)
 */
function getPESColor(ratio: number): string {
  if (ratio > 1.1) return 'text-emerald-500';
  if (ratio >= 1.02) return 'text-primary';
  if (ratio >= 0.98) return 'text-amber-500';
  return 'text-pink-500';
}

function getPESLabel(ratio: number, t: TranslateFn): string {
  if (ratio > 1.1) return t('stats.advanced.pesVigilant');
  if (ratio >= 1.02) return t('stats.advanced.pesAdjusts');
  if (ratio >= 0.98) return t('stats.advanced.pesNeutral');
  return t('stats.advanced.pesRushes');
}

function renderErrorAwareness(data: AdvancedStatsData, mode: ModeType, t: TranslateFn): ReactNode {
  // Mode guard: only show for tempo-like modes, not global view
  if (isGlobalView(mode)) return null;
  if (!isTempoLikeMode(mode)) return null;

  const stats = data.postErrorSlowingStats;

  // Check if user has 0 errors (perfect accuracy = excellent awareness)
  const totalErrors =
    data.modalityStats?.reduce((sum, m) => sum + m.misses + m.falseAlarms, 0) ?? 0;
  const hasPerfectAccuracy = totalErrors === 0 && (data.modalityStats?.length ?? 0) > 0;

  // Filter stats with valid PES data (need enough post-error pairs)
  const validStats = stats.filter(
    (s) => s.pesRatio !== null && s.postErrorTrialCount >= TEMPO_PES_THRESHOLDS.minPairs,
  );

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={16} className="text-teal-500" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.errorAwareness')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.errorAwarenessDesc')}</InfoSheet>
      </div>
      <div className="space-y-3">
        {hasPerfectAccuracy ? (
          // No errors = nothing to analyze for PES
          <div className="text-center py-4">
            <p className="text-lg font-medium text-emerald-500">
              {t('stats.advanced.pesNoErrors')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('stats.advanced.pesNoErrorsDesc')}
            </p>
          </div>
        ) : validStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 italic">-</p>
        ) : (
          validStats.map((stat) => (
            <div key={stat.modality} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {getModalityIcon(stat.modality)}
                <span className="capitalize">{t(`common.${stat.modality}`)}</span>
                <span className="text-xxs text-muted-foreground">
                  {t('stats.advanced.pesSample', {
                    hits: stat.hitTrialCount,
                    post: stat.postErrorTrialCount,
                  })}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${getPESColor(stat.pesRatio ?? 0)}`}>
                  {(stat.pesRatio ?? 0).toFixed(2)}×
                </span>
                <span className={`text-3xs ${getPESColor(stat.pesRatio ?? 0)}`}>
                  {getPESLabel(stat.pesRatio ?? 0, t)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      {!hasPerfectAccuracy && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-3xs text-muted-foreground text-center">
            {t('stats.advanced.pesLegend')}
          </p>
        </div>
      )}
    </div>
  );
}

function renderModeBreakdownTable(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
  betaEnabled: boolean,
): ReactNode {
  // Mode guard: only show for global view
  if (!isGlobalView(mode)) return null;

  const breakdown = data.modeBreakdown;

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.modeBreakdown')}
        </h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.modeBreakdownDesc')}</InfoSheet>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {t('stats.advanced.mode')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.sessions')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.time')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">UPS</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.avgN')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.maxN')}
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground italic">
                  -
                </td>
              </tr>
            ) : (
              breakdown
                .filter((m) => m.mode !== 'Other')
                .map((item) => (
                  <tr key={item.mode} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {t(`stats.mode.${item.mode.charAt(0).toLowerCase() + item.mode.slice(1)}`)}
                    </td>
                    <td className="px-3 py-2 text-right">{item.sessionsCount}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {Math.round(item.totalDurationMs / 60000)}m
                    </td>
                    <td className="px-3 py-2 text-right">
                      {betaEnabled ? (
                        <span
                          className={
                            item.avgUps >= UPS_TIER_ADVANCED
                              ? 'text-emerald-500'
                              : item.avgUps >= UPS_TIER_NOVICE
                                ? 'text-amber-500'
                                : 'text-pink-500'
                          }
                        >
                          {item.avgUps.toFixed(0)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{Math.round(item.avgNLevel)}</td>
                    <td className="px-3 py-2 text-right font-medium text-primary">
                      {item.maxNLevel}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderSDTModalityTable(
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
): ReactNode {
  // Mode guard: only show for tempo-like modes, not global view
  if (isGlobalView(mode)) return null;
  if (!isTempoLikeMode(mode)) return null;

  const modalityStats = data.modalityStats;

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('stats.advanced.sdtByModality')}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {t('stats.advanced.modality')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.hits')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                {t('stats.advanced.miss')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">FA</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">CR</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                <div className="flex items-center justify-end gap-1">
                  {t('stats.advanced.hitRate')}
                  <InfoSheet iconSize={10}>{t('stats.tooltips.hitRateDesc')}</InfoSheet>
                </div>
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                <div className="flex items-center justify-end gap-1">
                  {t('stats.advanced.faRate')}
                  <InfoSheet iconSize={10}>{t('stats.tooltips.faRateDesc')}</InfoSheet>
                </div>
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                <div className="flex items-center justify-end gap-1">
                  d'
                  <InfoSheet iconSize={10}>{t('stats.tooltips.dprimeDesc')}</InfoSheet>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {modalityStats.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground italic">
                  -
                </td>
              </tr>
            ) : (
              modalityStats.map((stat) => {
                const totalSignals = stat.hits + stat.misses;
                const totalNoise = stat.falseAlarms + stat.correctRejections;
                const hitRate = totalSignals > 0 ? stat.hits / totalSignals : 0;
                const faRate = totalNoise > 0 ? stat.falseAlarms / totalNoise : 0;
                // Use centralized SDTCalculator (Hautus correction, anti-gaming guards)
                const dPrime = SDTCalculator.calculateDPrime(
                  stat.hits,
                  stat.misses,
                  stat.falseAlarms,
                  stat.correctRejections,
                );

                return (
                  <tr key={stat.modality} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        {getModalityIcon(stat.modality)}
                        <span className="capitalize">{t(`common.${stat.modality}`)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-500">{stat.hits}</td>
                    <td className="px-3 py-2 text-right text-pink-500">{stat.misses}</td>
                    <td className="px-3 py-2 text-right text-orange-500">{stat.falseAlarms}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {stat.correctRejections}
                    </td>
                    <td className="px-3 py-2 text-right">{(hitRate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{(faRate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-medium text-primary">
                      {Number.isFinite(dPrime) ? dPrime.toFixed(2) : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Evolution Charts
// =============================================================================

function renderEvolutionUPS(
  data: AdvancedStatsData,
  t: TranslateFn,
  betaEnabled: boolean,
): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => {
    const original = point.original;
    const minUpsScore = original?.minUpsScore;
    const maxUpsScore = original?.maxUpsScore;

    const minUps =
      typeof minUpsScore === 'number' && Number.isFinite(minUpsScore) ? minUpsScore : null;
    const maxUps =
      typeof maxUpsScore === 'number' && Number.isFinite(maxUpsScore) ? maxUpsScore : null;

    return {
      dateIso: point.dateIso,
      upsScore: original ? original.upsScore : null,
      minUpsScore: minUps,
      maxUpsScore: maxUps,
      upsBandBase: minUps,
      upsBandRange:
        typeof minUps === 'number' && typeof maxUps === 'number'
          ? Math.max(0, maxUps - minUps)
          : null,
    };
  });

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);
  const minWidth = Math.max(300, chartData.length * 50);

  // Woven Ink amber: #A88850
  const AMBER_COLOR = '#A88850';

  const showDots = chartData.length <= 30;

  function EvolutionUPSChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);
    const [enabledSeries, setEnabledSeries] = useState({
      avg: true,
      min: false,
      max: false,
    });

    function toggleSeries(key: keyof typeof enabledSeries) {
      setEnabledSeries((prev) => {
        const enabledCount = Object.values(prev).filter(Boolean).length;
        const isDisablingLast = prev[key] === true && enabledCount === 1;
        if (isDisablingLast) return prev;
        return { ...prev, [key]: !prev[key] };
      });
    }

    const showBand = enabledSeries.min && enabledSeries.max;
    const showAvgAsArea = enabledSeries.avg && !showBand;
    const showAvgAsLine = enabledSeries.avg && showBand;

    const toggleOptions: SeriesToggleOption[] = [
      {
        key: 'avg',
        label: t('stats.simple.avg'),
        pressed: enabledSeries.avg,
        onToggle: () => toggleSeries('avg'),
      },
      {
        key: 'min',
        label: t('stats.advanced.min'),
        pressed: enabledSeries.min,
        onToggle: () => toggleSeries('min'),
      },
      {
        key: 'max',
        label: t('stats.advanced.max'),
        pressed: enabledSeries.max,
        onToggle: () => toggleSeries('max'),
      },
    ];

    function EvolutionUPSChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) => {
        if (enabledSeries.avg && p.upsScore !== null) return true;
        if (enabledSeries.min && p.minUpsScore !== null) return true;
        if (enabledSeries.max && p.maxUpsScore !== null) return true;
        return false;
      });
      const getInitialScrollLeft = useCallback(
        (el: HTMLDivElement) => {
          const points = Math.max(1, chartData.length);
          const pxPerPoint = el.scrollWidth / points;
          const targetX = (lastFilledIndex + 1) * pxPerPoint;
          return targetX - el.clientWidth * LAST_FILLED_SCROLL_ALIGN;
        },
        [chartData.length, lastFilledIndex],
      );

      const gradientSuffix = useId().replace(/:/g, '');
      const avgGradientId = `upsGradientAdv-${gradientSuffix}`;
      const bandGradientId = `upsBandGradientAdv-${gradientSuffix}`;

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={<FixedYAxis ticks={[0, 50, 100]} height={height} tickFormatter={(v) => `${v}`} />}
          yAxisWidth={Y_AXIS_WIDTH_PERCENT}
          getInitialScrollLeft={getInitialScrollLeft}
        >
          <div ref={containerRef} className="relative">
            <ResponsiveContainer width="100%" height={height}>
              <ComposedChart
                accessibilityLayer={false}
                data={chartData}
                margin={{ top: 10, right: CHART_EDGE_MARGIN, left: CHART_EDGE_MARGIN, bottom: 5 }}
              >
                <defs>
                  <linearGradient id={avgGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AMBER_COLOR} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={AMBER_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AMBER_COLOR} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={AMBER_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="dateIso"
                  interval={showAllXTicks ? 0 : 'preserveStartEnd'}
                  ticks={showAllXTicks ? undefined : getResponsiveTicks(chartData, 'dateIso', 5)}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)', opacity: 0.4 }}
                  minTickGap={showAllXTicks ? 0 : 30}
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                  }
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      payloadFilter={(payload) =>
                        payload.filter(
                          (entry) =>
                            entry.dataKey !== 'upsBandBase' && entry.dataKey !== 'upsBandRange',
                        )
                      }
                      valueFormatter={(value) => {
                        const next = Number(value);
                        return Number.isFinite(next) ? `${next.toFixed(0)}` : '—';
                      }}
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })
                      }
                    />
                  }
                />
                {showBand && (
                  <>
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="upsBandBase"
                      stackId="upsBand"
                      stroke="none"
                      fill="transparent"
                      connectNulls
                      name="bandBase"
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="upsBandRange"
                      stackId="upsBand"
                      stroke="none"
                      fill={`url(#${bandGradientId})`}
                      connectNulls
                      name="bandRange"
                    />
                  </>
                )}
                {showAvgAsArea && (
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="upsScore"
                    stroke={AMBER_COLOR}
                    strokeWidth={2}
                    fill={`url(#${avgGradientId})`}
                    dot={showDots ? { r: 3, fill: AMBER_COLOR } : false}
                    activeDot={{ r: 5, fill: AMBER_COLOR }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {showAvgAsLine && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="upsScore"
                    stroke={AMBER_COLOR}
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: AMBER_COLOR } : false}
                    activeDot={{ r: 5, fill: AMBER_COLOR }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {enabledSeries.min && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="minUpsScore"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: '#3B82F6' } : false}
                    activeDot={{ r: 5, fill: '#3B82F6' }}
                    connectNulls
                    name={t('stats.advanced.min')}
                  />
                )}
                {enabledSeries.max && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="maxUpsScore"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: '#F59E0B' } : false}
                    activeDot={{ r: 5, fill: '#F59E0B' }}
                    connectNulls
                    name={t('stats.advanced.max')}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ScrollableChart>
      );
    }

    return (
      <>
        <div className="bg-card/60 border border-border/40 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {t('stats.advanced.upsEvolution')}
              </span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.upsEvolutionDesc')}</InfoSheet>
            </div>
            <button
              type="button"
              aria-label={t('aria.maximize')}
              onClick={() => setFullscreenOpen(true)}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ArrowsOut size={18} />
            </button>
          </div>

          {betaEnabled ? (
            <>
              <EvolutionUPSChartBody height={EVOLUTION_CHART_HEIGHT} />
              <SeriesToggleGroup
                ariaLabel={t('stats.advanced.upsEvolution')}
                options={toggleOptions}
              />
            </>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">-</span>
            </div>
          )}
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.advanced.upsEvolution')}
          closeAriaLabel={t('aria.close')}
          headerCenter={
            betaEnabled ? (
              <SeriesToggleGroup
                ariaLabel={t('stats.advanced.upsEvolution')}
                options={toggleOptions}
                className=""
              />
            ) : undefined
          }
        >
          {betaEnabled ? (
            <EvolutionUPSChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
          ) : (
            <div className="h-40 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">-</span>
            </div>
          )}
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionUPSChart />;
}

// =============================================================================
// Main Renderer
// =============================================================================

function renderSection(
  sectionId: AdvancedStatsSectionId,
  data: AdvancedStatsData,
  mode: ModeType,
  t: TranslateFn,
  betaEnabled: boolean,
  inputMethod?: StatsInputMethod,
): ReactNode {
  switch (sectionId) {
    case 'UPS_SUMMARY':
      return renderUPSSummary(data, t, betaEnabled);

    case 'MODE_SCORE':
      return renderModeScore(data, mode, t);

    case 'FLOW_CONFIDENCE':
      return renderFlowConfidence(data, mode, t);

    case 'RECALL_CONFIDENCE':
      return renderRecallConfidence(data, mode, t);

    case 'DISTRIBUTION':
      return renderDistribution(data, t, betaEnabled);

    case 'TIMING_STATS':
      return renderTimingStats(data, mode, t, inputMethod);

    case 'TIMING_BY_MODALITY':
      return renderModalityTiming(data, mode, t, inputMethod);

    case 'TIMING_VARIABILITY':
      return renderTimingVariability(data, mode, t, inputMethod);

    case 'ERROR_AWARENESS':
      return renderErrorAwareness(data, mode, t);

    case 'MODE_BREAKDOWN_TABLE':
      return renderModeBreakdownTable(data, mode, t, betaEnabled);

    case 'SDT_MODALITY_TABLE':
      return renderSDTModalityTable(data, mode, t);

    case 'EVOLUTION_UPS':
      return renderEvolutionUPS(data, t, betaEnabled);

    default: {
      const _exhaustiveCheck: never = sectionId;
      console.warn(`[AdvancedStatsSectionRenderer] Unknown section: ${_exhaustiveCheck}`);
      return null;
    }
  }
}

// =============================================================================
// Section Groups (3 volets)
// =============================================================================

const TIME_SECTIONS: readonly AdvancedStatsSectionId[] = [
  'TIMING_STATS',
  'TIMING_BY_MODALITY',
  'TIMING_VARIABILITY',
  'ERROR_AWARENESS',
];

const PERFORMANCE_SECTIONS: readonly AdvancedStatsSectionId[] = [
  'UPS_SUMMARY',
  'MODE_SCORE',
  'FLOW_CONFIDENCE',
  'RECALL_CONFIDENCE',
  'SDT_MODALITY_TABLE',
  'DISTRIBUTION',
  'MODE_BREAKDOWN_TABLE',
];

const EVOLUTION_SECTIONS: readonly AdvancedStatsSectionId[] = ['EVOLUTION_UPS'];

/**
 * Section Group Title
 * Left-aligned header with icon and spacing for clear visual hierarchy
 */
const SectionGroupTitle = memo(function SectionGroupTitle({
  title,
  icon,
  badge,
}: {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 mb-3 sm:mb-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <span className="text-sm font-bold text-foreground uppercase tracking-widest">{title}</span>
      {badge}
    </div>
  );
});

function CenteredGroupDivider({ id }: { id: string }): ReactNode {
  return (
    <div className="flex justify-center my-5 sm:my-6">
      <div className="w-[20%] min-w-16 max-w-44">
        <Hatching id={id} size={4} className="text-foreground/70" />
      </div>
    </div>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Brain size={18} weight="duotone" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Input Method Filter for timing stats
 * Allows filtering timing data by input device type
 * Design matches other filters (ModalityFilter, etc.)
 */
interface InputMethodFilterProps {
  value: StatsInputMethod;
  onChange: (method: StatsInputMethod) => void;
  t: TranslateFn;
}

const INPUT_METHOD_OPTIONS: Array<{
  id: StatsInputMethod;
  labelKey: string;
  icon: typeof Keyboard;
  color: string;
}> = [
  {
    id: 'keyboard',
    labelKey: 'stats.inputMethod.keyboard',
    icon: Keyboard,
    color: 'text-blue-500',
  },
  { id: 'mouse', labelKey: 'stats.inputMethod.mouse', icon: Mouse, color: 'text-violet-500' },
  { id: 'touch', labelKey: 'stats.inputMethod.touch', icon: HandTap, color: 'text-amber-500' },
];

const InputMethodFilter = memo(function InputMethodFilter({
  value,
  onChange,
  t,
}: InputMethodFilterProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  // Get display label
  const getDisplayLabel = () => {
    const option = INPUT_METHOD_OPTIONS.find((o) => o.id === value);
    return option ? t(option.labelKey) : value;
  };

  // Get current icon
  const getCurrentIcon = () => {
    const option = INPUT_METHOD_OPTIONS.find((o) => o.id === value);
    if (option) {
      const Icon = option.icon;
      return <Icon size={16} className={option.color} />;
    }
    return <Timer size={16} className="text-muted-foreground" />;
  };

  return (
    <div className="flex-1 min-w-0">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-visual focus:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              {getCurrentIcon()}
              <span className="font-medium">{getDisplayLabel()}</span>
            </span>
            <CaretDown size={16} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <div className="space-y-1">
            {/* Input method options */}
            {INPUT_METHOD_OPTIONS.map((option) => {
              const isSelected = value === option.id;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <Icon size={16} className={option.color} />
                  <span>{t(option.labelKey)}</span>
                  {isSelected && <Check size={16} className="ml-auto text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

/**
 * Advanced Stats Section Renderer
 *
 * Renders sections organized in 3 volets: Temps, Performance, Évolution.
 * Each volet has a subtle title separator.
 * Each section handles its own data guards (returns null if no data).
 */
function AdvancedStatsSectionRendererInner({
  sections,
  data,
  mode,
  inputMethod,
  onInputMethodChange,
  betaEnabled = false,
  alphaEnabled = false,
}: AdvancedStatsSectionRendererProps): ReactNode {
  const { t } = useTranslation();
  const isAggregatePublicView = isGlobalView(mode) && !alphaEnabled;
  const showTimeBetaBadge = mode === 'DualnbackClassic' || mode === 'BrainWorkshop';

  // Filter active sections per group
  const activeTimeSections = useMemo(
    () => sections.filter((s) => TIME_SECTIONS.includes(s)),
    [sections],
  );
  const activePerformanceSections = useMemo(
    () => sections.filter((s) => PERFORMANCE_SECTIONS.includes(s)),
    [sections],
  );
  const activeEvolutionSections = useMemo(
    () => sections.filter((s) => EVOLUTION_SECTIONS.includes(s)),
    [sections],
  );

  // Render a group of sections
  const renderGroup = useCallback(
    (sectionIds: readonly AdvancedStatsSectionId[]): ReactNode[] => {
      return sectionIds
        .map((sectionId) => {
          const element = renderSection(sectionId, data, mode, t, betaEnabled, inputMethod);
          if (element === null) return null;
          return (
            <div key={sectionId} className="h-full">
              {element}
            </div>
          );
        })
        .filter(Boolean) as ReactNode[];
    },
    [data, mode, t, betaEnabled, inputMethod],
  );

  const timeContent = useMemo(
    () => renderGroup(activeTimeSections),
    [renderGroup, activeTimeSections],
  );
  const performanceContent = useMemo(
    () => renderGroup(activePerformanceSections),
    [renderGroup, activePerformanceSections],
  );
  const evolutionContent = useMemo(
    () => renderGroup(activeEvolutionSections),
    [renderGroup, activeEvolutionSections],
  );

  // Always show evolution section if it's in the active sections (structure visible even if empty)
  const showEvolution = activeEvolutionSections.length > 0;
  const showTime = timeContent.length > 0;
  const showPerformance = performanceContent.length > 0;
  const showPerformancePlaceholder = isAggregatePublicView && activePerformanceSections.length > 0;
  const showEvolutionPlaceholder = isAggregatePublicView && activeEvolutionSections.length > 0;

  // Handler with fallback for when onInputMethodChange is not provided
  const handleInputMethodChange = useMemo(
    () => onInputMethodChange ?? NOOP_INPUT_METHOD_CHANGE,
    [onInputMethodChange],
  );

  return (
    <div className="space-y-2 pb-4">
      {/* TEMPS */}
      {showTime && (
        <>
          <SectionGroupTitle
            title={t('stats.groups.time')}
            icon={<Clock size={18} weight="duotone" />}
            badge={showTimeBetaBadge ? <BetaBadge size="sm" /> : undefined}
          />
          {/* Input method filter above time cards */}
          <div className="mb-4">
            <span className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
              {t('stats.filters.title')}
            </span>
            <InputMethodFilter value={inputMethod} onChange={handleInputMethodChange} t={t} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{timeContent}</div>
        </>
      )}

      {/* PERFORMANCE */}
      {(showPerformance || showPerformancePlaceholder) && (
        <>
          {showTime && <CenteredGroupDivider id="stats-advanced-divider-time-performance" />}
          <SectionGroupTitle
            title={t('stats.groups.performance')}
            icon={<Trophy size={18} weight="duotone" />}
          />
          <div className="space-y-4">
            {showPerformancePlaceholder ? (
              <PlaceholderCard
                title={t(
                  'stats.placeholders.advancedPerformanceTitle',
                  'Analyse avancee globale a venir',
                )}
                body={t(
                  'stats.placeholders.advancedPerformanceBody',
                  'La synthese UPS, la distribution et la repartition par mode restent en alpha pour le moment. Pour une lecture deja aboutie, utilisez le filtre Mode.',
                )}
              />
            ) : (
              performanceContent
            )}
          </div>
        </>
      )}

      {/* ÉVOLUTION */}
      {(showEvolution || showEvolutionPlaceholder) && (
        <>
          {(showTime || showPerformance || showPerformancePlaceholder) && (
            <CenteredGroupDivider id="stats-advanced-divider-performance-evolution" />
          )}
          <SectionGroupTitle
            title={t('stats.groups.evolution')}
            icon={<ChartLine size={18} weight="duotone" />}
          />
          <div className="space-y-4">
            {showEvolutionPlaceholder ? (
              <PlaceholderCard
                title={t('stats.placeholders.advancedEvolutionTitle', 'Evolution avancee a venir')}
                body={t(
                  'stats.placeholders.advancedEvolutionBody',
                  'Les tendances globales tous modes confondus ne sont pas encore assez stables. Filtrez par mode pour une evolution deja exploitable.',
                )}
              />
            ) : (
              evolutionContent
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const AdvancedStatsSectionRenderer = memo(
  AdvancedStatsSectionRendererInner,
  (prev, next) => {
    if (
      prev.data !== next.data ||
      prev.mode !== next.mode ||
      prev.inputMethod !== next.inputMethod ||
      prev.onInputMethodChange !== next.onInputMethodChange ||
      prev.betaEnabled !== next.betaEnabled
    ) {
      return false;
    }
    if (prev.sections.length !== next.sections.length) {
      return false;
    }
    for (let index = 0; index < prev.sections.length; index += 1) {
      if (prev.sections[index] !== next.sections[index]) {
        return false;
      }
    }
    return true;
  },
);
