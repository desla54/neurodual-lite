/**
 * Simple Stats Section Renderer
 *
 * Maps semantic section IDs to React components.
 * The Spec defines WHAT to show, this renderer defines HOW.
 *
 * Pattern follows unified-session-report.tsx SectionRenderer.
 */

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowsOut,
  Barbell,
  Brain,
  Calendar,
  CalendarBlank,
  ChartLine,
  Check,
  Clock,
  Gauge,
  Medal,
  Sparkle,
  Trophy,
} from '@phosphor-icons/react';

import { ACCURACY_PASS_NORMALIZED, type SimpleStatsSectionId } from '@neurodual/logic';
import { Hatching, InfoSheet } from '../primitives';
import { ScrollableChart, FixedYAxis, PortalTooltip, FullscreenChartModal } from './charts';
import { useFullscreenChartHeight } from './charts/chart-fullscreen-context';
import {
  erfInv,
  getModalityIcon,
  isTempoLikeMode,
  isPlaceOrMemoMode,
  isGlobalView,
  getResponsiveTicks,
  downsampleEvenly,
} from './helpers';
import type { ModeType } from './filters/types';

// =============================================================================
// Types
// =============================================================================

export interface SimpleStatsData {
  activityStats: {
    sessionsCount: number;
    totalPlayTimeMs: number;
    // Average training time per active day (computed in stats adapter).
    avgSessionDurationMs: number;
    activeDays: number;
  } | null;
  performanceStats: {
    currentNLevel: number;
    maxNLevel: number;
    unifiedAccuracy: number;
    upsScore: number;
  } | null;
  errorProfile: {
    errorRate: number;
    missShare: number | null;
    faShare: number | null;
    totalHits: number;
    totalMisses: number;
    totalFalseAlarms: number;
    totalCorrectRejections: number;
  } | null;
  modalityStats: Array<{
    modality: string;
    totalActions: number;
    unifiedAccuracy: number;
    hits: number;
    misses: number;
    falseAlarms: number;
    correctRejections: number;
  }>;
  timeSeries: Array<{
    day: string;
    sessionsCount: number;
    totalDurationMs: number;
    unifiedAccuracy: number;
    minUnifiedAccuracy: number | null;
    maxUnifiedAccuracy: number | null;
    avgNLevel: number;
    minNLevel: number;
    maxNLevel: number;
    minErrorRatePercent: number | null;
    maxErrorRatePercent: number | null;
    upsScore: number;
    /**
     * Dual N-Back Classic/BrainWorkshop: session error rate (0-100%).
     * Lower is better. Null for modes that don't use error-based scoring.
     */
    worstModalityErrorRate: number | null;
  }>;
  sessionScoreSeries: Array<{
    sessionIndex: number;
    createdAt: string;
    score: number;
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
  modeScore: {
    last: number | null;
    avg: number | null;
    best: number | null;
    worst: number | null;
  } | null;
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
}

export interface SimpleStatsSectionRendererProps {
  sections: readonly SimpleStatsSectionId[];
  data: SimpleStatsData;
  mode: ModeType;
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
const SESSION_X_AXIS_POINT_PX = 44;
const LAST_FILLED_SCROLL_ALIGN = 0.75;
const CHART_EDGE_MARGIN = 8;
const Y_AXIS_WIDTH_COMPACT = 22;
const Y_AXIS_WIDTH_PERCENT = 26;
const Y_AXIS_WIDTH_SCORE = 30;

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
function ensureWeeklyData(timeSeries: SimpleStatsData['timeSeries']) {
  type OutPoint = {
    dateIso: string;
    fullDate: Date;
    original: SimpleStatsData['timeSeries'][number] | null;
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
        original: SimpleStatsData['timeSeries'][number];
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
      dateIso: currentDate.toISOString(), // Unique key for Recharts
      fullDate: new Date(currentDate), // For formatting
      original: originalPoint || null, // Raw data if exists
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return paddedData;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatModeScore(value: number | null, mode: ModeType): string {
  if (value === null) return '-';
  switch (mode) {
    case 'DualPlace':
    case 'DualMemo':
    case 'DualPick':
      return `${(value * 100).toFixed(0)}%`;
    case 'BrainWorkshop':
    case 'Journey':
      return `${value.toFixed(0)}%`;
    case 'DualnbackClassic':
      // Dual N-Back Classic shows error rate % (lower is better)
      return `${value.toFixed(0)}%`;
    default:
      return value.toFixed(2);
  }
}

// For Dual N-Back Classic, lower error rate is better - return appropriate color class
// Thresholds based on typical performance: <10% excellent, <20% good, >20% needs work
function getDualnbackClassicScoreColor(errorRate: number): string {
  if (errorRate < 10) return 'text-emerald-500'; // Excellent
  if (errorRate < 20) return 'text-amber-500'; // Good
  return 'text-pink-500'; // Needs improvement
}

// =============================================================================
// Section Render Functions
// =============================================================================

function renderActivityKPIs(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  const stats = data.activityStats ?? {
    sessionsCount: 0,
    totalPlayTimeMs: 0,
    avgSessionDurationMs: 0,
    activeDays: 0,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <Barbell size={16} />
          <span className="text-xs">{t('stats.simple.sessions')}</span>
          <InfoSheet iconSize={12}>{t('stats.tooltips.sessionsDesc')}</InfoSheet>
        </div>
        <p className="text-2xl font-bold">{stats.sessionsCount}</p>
      </div>
      <div className="bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <Clock size={16} />
          <span className="text-xs">{t('stats.simple.totalTime')}</span>
          <InfoSheet iconSize={12}>{t('stats.tooltips.totalTimeDesc')}</InfoSheet>
        </div>
        <p className="text-2xl font-bold">{formatDuration(stats.totalPlayTimeMs)}</p>
      </div>
      <div className="bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <Calendar size={16} />
          <span className="text-xs">{t('stats.simple.activeDays')}</span>
          <InfoSheet iconSize={12}>{t('stats.tooltips.activeDaysDesc')}</InfoSheet>
        </div>
        <p className="text-2xl font-bold">{stats.activeDays}</p>
      </div>
      <div className="bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <CalendarBlank size={16} />
          <span className="text-xs">{t('stats.simple.avgSession')}</span>
          <InfoSheet iconSize={12}>{t('stats.tooltips.avgSessionDesc')}</InfoSheet>
        </div>
        <p className="text-2xl font-bold">{formatDuration(stats.avgSessionDurationMs)}</p>
      </div>
    </div>
  );
}

function renderSessionsPerDay(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => ({
    dateIso: point.dateIso,
    fullDate: point.fullDate,
    // For sessions, we want 0 instead of null for gaps
    sessions: point.original ? point.original.sessionsCount : 0,
    isGap: point.original === null,
  }));

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  const minWidth = Math.max(300, chartData.length * 40);

  // Use existing data max for Y scale, or default to 4 if empty/low
  const maxSessionsInData = data.timeSeries.reduce((max, point) => {
    return Math.max(max, point.sessionsCount);
  }, 0);
  const maxSessions = Math.max(maxSessionsInData, 4);
  const sessionsTicks = [0, Math.ceil(maxSessions / 2), maxSessions];
  const sessionsYAxisWidth = Math.min(
    34,
    Math.max(Y_AXIS_WIDTH_COMPACT, String(maxSessions).length * 8 + 10),
  );

  function SessionsPerDayChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);

    function SessionsPerDayChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) => !p.isGap);
      const getInitialScrollLeft = useCallback(
        (el: HTMLDivElement) => {
          const points = Math.max(1, chartData.length);
          const pxPerPoint = el.scrollWidth / points;
          const targetX = (lastFilledIndex + 1) * pxPerPoint;
          return targetX - el.clientWidth * LAST_FILLED_SCROLL_ALIGN;
        },
        [chartData.length, lastFilledIndex],
      );

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={<FixedYAxis ticks={sessionsTicks} height={height} />}
          yAxisWidth={sessionsYAxisWidth}
          getInitialScrollLeft={getInitialScrollLeft}
        >
          <div ref={containerRef} className="relative">
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                accessibilityLayer={false}
                data={chartData}
                margin={{ top: 10, right: CHART_EDGE_MARGIN, left: CHART_EDGE_MARGIN, bottom: 5 }}
              >
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
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                />
                <YAxis hide domain={[0, maxSessions]} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      valueFormatter={(value) => `${value} ${t('stats.advanced.sessions')}`}
                      labelFormatter={() => t('stats.simple.sessionsPerDay')}
                    />
                  }
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="sessions"
                  fill="#688575"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  name={t('stats.advanced.sessions')}
                />
              </BarChart>
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
                {t('stats.simple.sessionsPerDay')}
              </span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.sessionsPerDayDesc')}</InfoSheet>
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
          <SessionsPerDayChartBody height={EVOLUTION_CHART_HEIGHT} />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.simple.sessionsPerDay')}
          closeAriaLabel={t('aria.close')}
        >
          <SessionsPerDayChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
        </FullscreenChartModal>
      </>
    );
  }

  return <SessionsPerDayChart />;
}

function renderPerformanceKPIs(
  data: SimpleStatsData,
  mode: ModeType,
  betaEnabled: boolean,
  t: (key: string) => string,
): ReactNode {
  const stats = data.performanceStats ?? {
    currentNLevel: 0,
    maxNLevel: 0,
    unifiedAccuracy: 0,
    upsScore: 0,
  };
  const globalView = isGlobalView(mode);
  const showUps = betaEnabled;
  const gridClass = globalView
    ? 'grid-cols-1'
    : showUps
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {!globalView && (
        <>
          <div className="bg-card/60 border border-border/40 rounded-xl p-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Brain size={16} />
              <span className="text-xs">{t('stats.simple.currentN')}</span>
              <InfoSheet iconSize={12}>{t('stats.tooltips.currentLevelDesc')}</InfoSheet>
            </div>
            <p className="text-3xl font-bold text-primary">{stats.currentNLevel}</p>
          </div>
          <div className="bg-card/60 border border-border/40 rounded-xl p-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Sparkle size={16} />
              <span className="text-xs">{t('stats.simple.maxN')}</span>
              <InfoSheet iconSize={12}>{t('stats.tooltips.maxNDesc')}</InfoSheet>
            </div>
            <p className="text-3xl font-bold">{stats.maxNLevel}</p>
          </div>
          <div className="bg-card/60 border border-border/40 rounded-xl p-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Check size={16} />
              <span className="text-xs">{t('stats.simple.accuracy')}</span>
              <InfoSheet iconSize={12}>{t('stats.tooltips.performanceDesc')}</InfoSheet>
            </div>
            <p className="text-3xl font-bold text-emerald-500">
              {(stats.unifiedAccuracy * 100).toFixed(0)}%
            </p>
          </div>
        </>
      )}
      <div className="bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <Medal size={16} />
          <span className="text-xs">{t('stats.simple.ups')}</span>
          <InfoSheet iconSize={12}>{t('stats.tooltips.upsDesc')}</InfoSheet>
        </div>
        <p
          className={`text-3xl font-bold ${showUps ? 'text-amber-500' : 'text-muted-foreground/50'}`}
        >
          {showUps ? stats.upsScore.toFixed(0) : '—'}
        </p>
      </div>
    </div>
  );
}

function renderModeScore(
  data: SimpleStatsData,
  mode: ModeType,
  t: (key: string) => string,
): ReactNode {
  // Mode guard: only show for specific modes, not global view
  if (isGlobalView(mode)) return null;

  const score = data.modeScore ?? { last: null, avg: null, best: null, worst: null };
  const isDualnbackClassic = mode === 'DualnbackClassic';

  // Dual N-Back Classic-specific design: error rate card (lower is better)
  // Minimalist design with left accent border
  if (isDualnbackClassic) {
    const avgColor =
      score.avg !== null ? getDualnbackClassicScoreColor(score.avg) : 'text-foreground';
    const bestColor =
      score.best !== null
        ? getDualnbackClassicScoreColor(score.best)
        : 'text-[hsl(var(--woven-correct))]';
    const worstColor =
      score.worst !== null ? getDualnbackClassicScoreColor(score.worst) : 'text-muted-foreground';

    // Determine accent border color based on average score (main metric)
    const accentBorderColor =
      score.avg !== null
        ? score.avg < 10
          ? 'border-l-emerald-500'
          : score.avg < 20
            ? 'border-l-amber-500'
            : 'border-l-pink-500'
        : 'border-l-border';

    return (
      <div
        className={`bg-card/60 border border-border/40 ${accentBorderColor} border-l-4 rounded-xl p-5 relative overflow-hidden shadow-sm`}
      >
        <div className="relative">
          {/* Header */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Gauge size={20} className="text-muted-foreground" weight="duotone" />
              <span className="text-sm font-semibold leading-tight">
                {t(`stats.modeScore.${mode}`)}
              </span>
              <InfoSheet iconSize={12}>{t('stats.tooltips.dualnbackClassicScoreDesc')}</InfoSheet>
            </div>

            <div
              className="bg-secondary/50 px-2 py-1 rounded-full min-h-6 max-w-full sm:max-w-[70%] shrink-0 overflow-hidden self-start sm:self-auto"
              title={t('stats.dualnbackClassic.errorRateFormula')}
            >
              <span className="text-3xs font-medium text-muted-foreground whitespace-normal sm:whitespace-nowrap overflow-hidden text-ellipsis block leading-tight">
                {t('stats.dualnbackClassic.errorRateFormula')}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:gap-6">
            {/* Main score - Massive */}
            <div>
              <p className={`text-5xl font-bold tracking-tighter ${avgColor}`}>
                {formatModeScore(score.avg, mode)}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-1 ml-1">
                {t('stats.simple.avg')}
              </p>
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-1 sm:justify-end sm:gap-4">
              <div className="min-w-0 rounded-lg bg-secondary/40 px-2 py-1.5 text-center sm:bg-transparent sm:p-0 sm:text-right">
                <p className="text-base font-semibold text-muted-foreground sm:text-lg">
                  {formatModeScore(score.last, mode)}
                </p>
                <p
                  className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight break-words sm:text-3xs sm:tracking-wider"
                  title={t('stats.simple.lastSession')}
                >
                  {t('stats.simple.lastSession')}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-secondary/40 px-2 py-1.5 text-center sm:bg-transparent sm:p-0 sm:text-right">
                <p className={`text-base font-bold sm:text-lg ${bestColor}`}>
                  {formatModeScore(score.best, mode)}
                </p>
                <p
                  className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight break-words sm:text-3xs sm:tracking-wider"
                  title={t('stats.simple.best')}
                >
                  {t('stats.simple.best')}
                </p>
              </div>
              <div className="min-w-0 rounded-lg bg-secondary/40 px-2 py-1.5 text-center sm:bg-transparent sm:p-0 sm:text-right">
                <p className={`text-base font-semibold sm:text-lg ${worstColor}`}>
                  {formatModeScore(score.worst, mode)}
                </p>
                <p
                  className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight break-words sm:text-3xs sm:tracking-wider"
                  title={t('stats.simple.worst')}
                >
                  {t('stats.simple.worst')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default design for other modes (d', accuracy, etc.)
  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Medal size={18} className="text-primary" />
        <span className="text-sm font-semibold text-primary">{t(`stats.modeScore.${mode}`)}</span>
        <InfoSheet iconSize={12}>{t('stats.tooltips.modeScoreDesc')}</InfoSheet>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-4xl font-bold text-primary">{formatModeScore(score.last, mode)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('stats.simple.lastSession')}</p>
        </div>
        <div className="flex-1 flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-muted-foreground">
              {formatModeScore(score.avg, mode)}
            </p>
            <p className="text-3xs text-muted-foreground">{t('stats.simple.avg')}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-emerald-500">{formatModeScore(score.best, mode)}</p>
            <p className="text-3xs text-muted-foreground">{t('stats.simple.best')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFlowConfidence(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  const conf = data.flowConfidence ?? {
    confidenceScoreLast: null,
    confidenceScoreAvg: null,
    directnessRatioAvg: null,
    wrongSlotDwellMsTotal: null,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkle size={16} className="text-amber-500" />
        <span className="text-sm font-medium">{t('stats.confidence.flowTitle')}</span>
        <InfoSheet iconSize={12}>{t('stats.tooltips.flowConfidenceDesc')}</InfoSheet>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-amber-500">
            {conf.confidenceScoreLast?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.last')}</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-muted-foreground">
            {conf.confidenceScoreAvg?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.avg')}</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-muted-foreground">
            {conf.directnessRatioAvg !== null
              ? `${(conf.directnessRatioAvg * 100).toFixed(0)}%`
              : '-'}
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.directness')}</p>
        </div>
      </div>
    </div>
  );
}

function renderRecallConfidence(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  const conf = data.recallConfidence ?? {
    confidenceScoreLast: null,
    confidenceScoreAvg: null,
    fluencyScoreLast: null,
    fluencyScoreAvg: null,
    correctionsCountTotal: null,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkle size={16} className="text-purple-500" />
        <span className="text-sm font-medium">{t('stats.confidence.recallTitle')}</span>
        <InfoSheet iconSize={12}>{t('stats.tooltips.recallConfidenceDesc')}</InfoSheet>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-purple-500">
            {conf.confidenceScoreLast?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.last')}</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-muted-foreground">
            {conf.confidenceScoreAvg?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.avg')}</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-muted-foreground">
            {conf.fluencyScoreLast?.toFixed(0) ?? '-'}%
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.fluency')}</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-muted-foreground">
            {conf.correctionsCountTotal ?? 0}
          </p>
          <p className="text-3xs text-muted-foreground">{t('stats.confidence.corrections')}</p>
        </div>
      </div>
    </div>
  );
}

function renderEvolutionSessionScore(
  data: SimpleStatsData,
  mode: ModeType,
  t: (key: string) => string,
): ReactNode {
  if (isGlobalView(mode)) return null;
  if (data.sessionScoreSeries.length === 0) return null;

  const isPercentMode =
    mode === 'DualPlace' ||
    mode === 'DualMemo' ||
    mode === 'DualPick' ||
    mode === 'DualnbackClassic' ||
    mode === 'BrainWorkshop' ||
    mode === 'Journey';

  const fullChartData = data.sessionScoreSeries.map((point) => ({
    sessionIndex: point.sessionIndex,
    scoreRaw: point.score,
    scoreForChart:
      mode === 'DualPlace' || mode === 'DualMemo' || mode === 'DualPick'
        ? point.score * 100
        : point.score,
  }));

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  const minWidth = Math.max(320, chartData.length * SESSION_X_AXIS_POINT_PX);

  const scoreValues = fullChartData.map((p) => p.scoreForChart);
  const rawMin = Math.min(...scoreValues);
  const rawMax = Math.max(...scoreValues);

  const [yMin, yMax] = isPercentMode
    ? ([0, 100] as const)
    : (() => {
        if (rawMin === rawMax) return [rawMin - 0.5, rawMax + 0.5] as const;
        const padding = Math.max((rawMax - rawMin) * 0.15, 0.2);
        return [rawMin - padding, rawMax + padding] as const;
      })();

  const dprimeMid = Number(((yMin + yMax) / 2).toFixed(1));
  const yTicks = isPercentMode
    ? [0, 50, 100]
    : [Number(yMin.toFixed(1)), dprimeMid, Number(yMax.toFixed(1))];
  const color = mode === 'DualnbackClassic' ? '#967B75' : '#5A8862';

  function EvolutionSessionScoreChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);

    function EvolutionSessionScoreChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={
            <FixedYAxis
              ticks={yTicks}
              height={height}
              tickFormatter={(v) => (isPercentMode ? `${Math.round(v)}%` : Number(v).toFixed(1))}
            />
          }
          yAxisWidth={Y_AXIS_WIDTH_SCORE}
        >
          <div ref={containerRef} className="relative">
            <ResponsiveContainer width="100%" height={height}>
              <LineChart
                accessibilityLayer={false}
                data={chartData}
                margin={{ top: 10, right: CHART_EDGE_MARGIN, left: CHART_EDGE_MARGIN, bottom: 5 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="sessionIndex"
                  interval={showAllXTicks ? 0 : 'preserveStartEnd'}
                  ticks={
                    showAllXTicks
                      ? chartData.map((point) => point.sessionIndex)
                      : getResponsiveTicks(chartData, 'sessionIndex', 6)
                  }
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)', opacity: 0.4 }}
                  minTickGap={showAllXTicks ? 0 : 30}
                  tickFormatter={(value) => `#${value}`}
                />
                <YAxis hide domain={[yMin, yMax]} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      valueFormatter={(value) =>
                        isPercentMode ? `${Math.round(Number(value))}%` : Number(value).toFixed(2)
                      }
                      labelFormatter={(label) => `${t('stats.simple.sessions')} #${label}`}
                    />
                  }
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="scoreForChart"
                  stroke={color}
                  strokeWidth={2}
                  dot={showAllXTicks ? { r: 2.5, fill: color } : false}
                  activeDot={{ r: 4.5, fill: color }}
                  name={t(`stats.modeScore.${mode}`)}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ScrollableChart>
      );
    }

    return (
      <>
        <div className="bg-card/60 border border-border/40 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {t(`stats.modeScore.${mode}`)} · {t('stats.simple.sessions')}
              </span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.modeScoreDesc')}</InfoSheet>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('aria.maximize')}
                onClick={() => setFullscreenOpen(true)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowsOut size={16} />
              </button>
            </div>
          </div>

          <EvolutionSessionScoreChartBody height={EVOLUTION_CHART_HEIGHT} />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={`${t(`stats.modeScore.${mode}`)} · ${t('stats.simple.sessions')}`}
          closeAriaLabel={t('aria.close')}
        >
          <EvolutionSessionScoreChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionSessionScoreChart />;
}

function renderEvolutionAccuracy(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => {
    const original = point.original;
    const minUnifiedAccuracy = original?.minUnifiedAccuracy;
    const maxUnifiedAccuracy = original?.maxUnifiedAccuracy;

    const minAccuracyPercent =
      typeof minUnifiedAccuracy === 'number' ? Math.round(minUnifiedAccuracy * 100) : null;
    const maxAccuracyPercent =
      typeof maxUnifiedAccuracy === 'number' ? Math.round(maxUnifiedAccuracy * 100) : null;

    return {
      dateIso: point.dateIso,
      accuracyPercent: original ? Math.round(original.unifiedAccuracy * 100) : null,
      minAccuracyPercent,
      maxAccuracyPercent,
      accuracyBandBase: minAccuracyPercent,
      accuracyBandRange:
        typeof minAccuracyPercent === 'number' && typeof maxAccuracyPercent === 'number'
          ? Math.max(0, maxAccuracyPercent - minAccuracyPercent)
          : null,
    };
  });

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  const minWidth = Math.max(300, chartData.length * 50);

  // Last valid value for header display
  const showDots = chartData.length <= 30;

  function EvolutionAccuracyChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);
    const [enabledSeries, setEnabledSeries] = useState({
      avg: true,
      min: false,
      max: false,
    });
    const showBand = enabledSeries.min && enabledSeries.max;
    const showAvgAsArea = enabledSeries.avg && !showBand;
    const showAvgAsLine = enabledSeries.avg && showBand;

    function toggleSeries(key: keyof typeof enabledSeries) {
      setEnabledSeries((prev) => {
        const enabledCount = Object.values(prev).filter(Boolean).length;
        const isDisablingLast = prev[key] === true && enabledCount === 1;
        if (isDisablingLast) return prev;
        return { ...prev, [key]: !prev[key] };
      });
    }

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

    function EvolutionAccuracyChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) => {
        if (enabledSeries.avg && p.accuracyPercent !== null) return true;
        if (enabledSeries.min && p.minAccuracyPercent !== null) return true;
        if (enabledSeries.max && p.maxAccuracyPercent !== null) return true;
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
      const gradientId = `accuracyGradient-${gradientSuffix}`;
      const bandGradientId = `accuracyBandGradient-${gradientSuffix}`;

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={<FixedYAxis ticks={[0, 50, 100]} height={height} tickFormatter={(v) => `${v}%`} />}
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
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5A8862" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#5A8862" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5A8862" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#5A8862" stopOpacity={0.02} />
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
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
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
                            entry.dataKey !== 'accuracyBandBase' &&
                            entry.dataKey !== 'accuracyBandRange',
                        )
                      }
                      valueFormatter={(value) => {
                        const next = Number(value);
                        return Number.isFinite(next) ? `${Math.round(next)}%` : '—';
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
                      dataKey="accuracyBandBase"
                      stackId="accuracyBand"
                      stroke="none"
                      fill="transparent"
                      connectNulls
                      name="bandBase"
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="accuracyBandRange"
                      stackId="accuracyBand"
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
                    dataKey="accuracyPercent"
                    stroke="#5A8862"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={showDots ? { r: 3, fill: '#5A8862' } : false}
                    activeDot={{ r: 5, fill: '#5A8862' }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {showAvgAsLine && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="accuracyPercent"
                    stroke="#5A8862"
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: '#5A8862' } : false}
                    activeDot={{ r: 5, fill: '#5A8862' }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {enabledSeries.min && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="minAccuracyPercent"
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
                    dataKey="maxAccuracyPercent"
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {t('stats.simple.accuracyTrend')}
              </span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.accuracyTrendDesc')}</InfoSheet>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('aria.maximize')}
                onClick={() => setFullscreenOpen(true)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowsOut size={16} />
              </button>
            </div>
          </div>
          <EvolutionAccuracyChartBody height={EVOLUTION_CHART_HEIGHT} />
          <SeriesToggleGroup ariaLabel={t('stats.simple.accuracyTrend')} options={toggleOptions} />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.simple.accuracyTrend')}
          closeAriaLabel={t('aria.close')}
          headerCenter={
            <SeriesToggleGroup
              ariaLabel={t('stats.simple.accuracyTrend')}
              options={toggleOptions}
              className=""
            />
          }
        >
          <EvolutionAccuracyChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionAccuracyChart />;
}

function renderEvolutionNLevel(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => {
    const original = point.original;
    const minNLevel = original?.minNLevel;
    const maxNLevel = original?.maxNLevel;

    return {
      dateIso: point.dateIso,
      avgNLevel: original ? original.avgNLevel : null,
      minNLevel: typeof minNLevel === 'number' && Number.isFinite(minNLevel) ? minNLevel : null,
      maxNLevel: typeof maxNLevel === 'number' && Number.isFinite(maxNLevel) ? maxNLevel : null,
      nLevelBandBase:
        typeof minNLevel === 'number' && Number.isFinite(minNLevel) ? minNLevel : null,
      nLevelBandRange:
        typeof minNLevel === 'number' &&
        Number.isFinite(minNLevel) &&
        typeof maxNLevel === 'number' &&
        Number.isFinite(maxNLevel)
          ? Math.max(0, maxNLevel - minNLevel)
          : null,
    };
  });

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  // Calculate N-Level domain based on actual data (include avg/min/max so axis is stable)
  const validLevels = fullChartData
    .flatMap((d) => [d.avgNLevel, d.minNLevel, d.maxNLevel])
    .filter((l): l is number => typeof l === 'number' && Number.isFinite(l));

  const maxN = Math.max(...validLevels, 3);
  const minN = Math.min(...validLevels, 1);
  const minWidth = Math.max(300, chartData.length * 50);
  const nMin = Math.floor(minN);
  const nMax = Math.ceil(maxN);
  const nRange = nMax - nMin + 1;
  const nTicks = Array.from({ length: nRange }, (_, i) => nMin + i);
  const nLevelHeight = Math.min(240, Math.max(EVOLUTION_CHART_HEIGHT, nRange * 30));
  const nLevelHeightFullscreen = Math.max(nLevelHeight, EVOLUTION_CHART_HEIGHT_FULLSCREEN);

  const showDots = chartData.length <= 30;

  function EvolutionNLevelChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);
    const [enabledSeries, setEnabledSeries] = useState({
      avg: true,
      min: false,
      max: false,
    });

    function toggleSeries(key: keyof typeof enabledSeries) {
      setEnabledSeries((prev) => {
        const currentlyEnabledCount = Object.values(prev).filter(Boolean).length;
        const isDisablingLast = prev[key] === true && currentlyEnabledCount === 1;
        if (isDisablingLast) return prev;
        return { ...prev, [key]: !prev[key] };
      });
    }

    const seriesDefinitions = [
      {
        key: 'avg',
        dataKey: 'avgNLevel',
        stroke: '#6B7880',
        name: t('stats.simple.avg'),
        enabled: enabledSeries.avg,
        label: t('stats.simple.avg'),
      },
      {
        key: 'min',
        dataKey: 'minNLevel',
        stroke: '#3B82F6',
        name: t('stats.advanced.min'),
        enabled: enabledSeries.min,
        label: t('stats.advanced.min'),
      },
      {
        key: 'max',
        dataKey: 'maxNLevel',
        stroke: '#F59E0B',
        name: t('stats.advanced.max'),
        enabled: enabledSeries.max,
        label: t('stats.advanced.max'),
      },
    ] as const;

    const activeSeries = seriesDefinitions.filter((s) => s.enabled);
    const showBand = enabledSeries.min && enabledSeries.max;

    function NLevelSeriesSelector({ className }: { className?: string }): ReactNode {
      return (
        <SeriesToggleGroup
          ariaLabel={t('stats.simple.nLevelTrend')}
          className={className}
          options={seriesDefinitions.map((option) => ({
            key: option.key,
            label: option.label,
            pressed: option.enabled,
            onToggle: () => toggleSeries(option.key),
          }))}
        />
      );
    }

    function EvolutionNLevelChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) =>
        activeSeries.some((series) => p[series.dataKey] !== null),
      );
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
      const bandGradientId = `nLevelBandGradient-${gradientSuffix}`;

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={<FixedYAxis ticks={nTicks} height={height} tickFormatter={(v) => `N${v}`} />}
          yAxisWidth={Y_AXIS_WIDTH_COMPACT}
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
                  <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6B7880" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#6B7880" stopOpacity={0.04} />
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
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                />
                <YAxis hide domain={[nMin, nMax]} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      payloadFilter={(payload) =>
                        payload.filter(
                          (entry) =>
                            entry.dataKey !== 'nLevelBandBase' &&
                            entry.dataKey !== 'nLevelBandRange',
                        )
                      }
                      valueFormatter={(value) =>
                        value === null || value === undefined
                          ? '—'
                          : `N-${Math.round(Number(value))}`
                      }
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
                      dataKey="nLevelBandBase"
                      stackId="nLevelBand"
                      stroke="none"
                      fill="transparent"
                      connectNulls
                      name="bandBase"
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="nLevelBandRange"
                      stackId="nLevelBand"
                      stroke="none"
                      fill={`url(#${bandGradientId})`}
                      connectNulls
                      name="bandRange"
                    />
                  </>
                )}
                {activeSeries.map((series) => (
                  <Line
                    key={series.key}
                    isAnimationActive={false}
                    type="monotone"
                    dataKey={series.dataKey}
                    stroke={series.stroke}
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: series.stroke } : false}
                    activeDot={{ r: 5, fill: series.stroke }}
                    connectNulls
                    name={series.name}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ScrollableChart>
      );
    }

    return (
      <>
        <div className="bg-card/60 border border-border/40 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{t('stats.simple.nLevelTrend')}</span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.nLevelTrendDesc')}</InfoSheet>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('aria.maximize')}
                onClick={() => setFullscreenOpen(true)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowsOut size={16} />
              </button>
            </div>
          </div>
          <EvolutionNLevelChartBody height={nLevelHeight} />
          <NLevelSeriesSelector />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.simple.nLevelTrend')}
          closeAriaLabel={t('aria.close')}
          headerCenter={<NLevelSeriesSelector className="" />}
        >
          <EvolutionNLevelChartBody height={nLevelHeightFullscreen} />
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionNLevelChart />;
}

function renderEvolutionUPS(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => ({
    dateIso: point.dateIso,
    upsRounded: point.original ? Math.round(point.original.upsScore) : null,
  }));

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  const minWidth = Math.max(300, chartData.length * 50);

  const showDots = chartData.length <= 30;

  function EvolutionUPSChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);

    function EvolutionUPSChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) => p.upsRounded !== null);
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
      const gradientId = `upsGradient-${gradientSuffix}`;

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
              <AreaChart
                accessibilityLayer={false}
                data={chartData}
                margin={{ top: 10, right: CHART_EDGE_MARGIN, left: CHART_EDGE_MARGIN, bottom: 5 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A88850" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#A88850" stopOpacity={0} />
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
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      valueFormatter={(value) => `${value}`}
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })
                      }
                    />
                  }
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="upsRounded"
                  stroke="#A88850"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={showDots ? { r: 3, fill: '#A88850' } : false}
                  activeDot={{ r: 5, fill: '#A88850' }}
                  connectNulls
                  name="UPS"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ScrollableChart>
      );
    }

    return (
      <>
        <div className="bg-card/60 border border-border/40 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{t('stats.simple.upsTrend')}</span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.upsDesc')}</InfoSheet>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('aria.maximize')}
                onClick={() => setFullscreenOpen(true)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowsOut size={16} />
              </button>
            </div>
          </div>
          <EvolutionUPSChartBody height={EVOLUTION_CHART_HEIGHT} />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.simple.upsTrend')}
          closeAriaLabel={t('aria.close')}
        >
          <EvolutionUPSChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionUPSChart />;
}

/**
 * Error Rate Evolution Chart for Dual N-Back Classic/BrainWorkshop modes.
 *
 * **Key difference from accuracy**: Lower is better (inverted color logic).
 *
 * Displays session error-rate trend over time for error-based modes.
 *
 * Color thresholds (percentage-based):
 * - Green (<10%): Excellent - minimal errors
 * - Amber (10-20%): Good - within acceptable range
 * - Pink (>20%): Needs improvement
 *
 * @see docs/references/jaeggi-2008/README.md for methodology
 */
function renderEvolutionErrorRate(data: SimpleStatsData, t: (key: string) => string): ReactNode {
  // Use helper to get weekly padded data
  const paddedSeries = ensureWeeklyData(data.timeSeries);

  const fullChartData = paddedSeries.map((point) => {
    const original = point.original;
    const avgErrorRate = original?.worstModalityErrorRate;
    const minErrorRate = original?.minErrorRatePercent;
    const maxErrorRate = original?.maxErrorRatePercent;

    const minErrorRatePercent =
      typeof minErrorRate === 'number' && Number.isFinite(minErrorRate)
        ? Math.round(minErrorRate)
        : null;
    const maxErrorRatePercent =
      typeof maxErrorRate === 'number' && Number.isFinite(maxErrorRate)
        ? Math.round(maxErrorRate)
        : null;

    return {
      dateIso: point.dateIso,
      errorRatePercent:
        typeof avgErrorRate === 'number' && Number.isFinite(avgErrorRate)
          ? Math.round(avgErrorRate)
          : null,
      minErrorRatePercent,
      maxErrorRatePercent,
      errorRateBandBase: minErrorRatePercent,
      errorRateBandRange:
        typeof minErrorRatePercent === 'number' && typeof maxErrorRatePercent === 'number'
          ? Math.max(0, maxErrorRatePercent - minErrorRatePercent)
          : null,
    };
  });

  const chartData = downsampleEvenly(fullChartData, MAX_CHART_POINTS);

  const minWidth = Math.max(300, chartData.length * 50);

  const showDots = chartData.length <= 30;

  function EvolutionErrorRateChart(): ReactNode {
    const [fullscreenOpen, setFullscreenOpen] = useState(false);
    const [enabledSeries, setEnabledSeries] = useState({
      avg: true,
      min: false,
      max: false,
    });
    const showBand = enabledSeries.min && enabledSeries.max;
    const showAvgAsArea = enabledSeries.avg && !showBand;
    const showAvgAsLine = enabledSeries.avg && showBand;

    function toggleSeries(key: keyof typeof enabledSeries) {
      setEnabledSeries((prev) => {
        const enabledCount = Object.values(prev).filter(Boolean).length;
        const isDisablingLast = prev[key] === true && enabledCount === 1;
        if (isDisablingLast) return prev;
        return { ...prev, [key]: !prev[key] };
      });
    }

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

    function EvolutionErrorRateChartBody({ height: heightProp }: { height: number }): ReactNode {
      const height = useFullscreenChartHeight(heightProp);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const showAllXTicks = chartData.length <= MAX_FULL_X_AXIS_TICKS;
      const lastFilledIndex = getLastFilledIndex(chartData, (p) => {
        if (enabledSeries.avg && p.errorRatePercent !== null) return true;
        if (enabledSeries.min && p.minErrorRatePercent !== null) return true;
        if (enabledSeries.max && p.maxErrorRatePercent !== null) return true;
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
      const gradientId = `errorRateGradient-${gradientSuffix}`;
      const bandGradientId = `errorRateBandGradient-${gradientSuffix}`;

      return (
        <ScrollableChart
          minWidth={minWidth}
          height={height}
          yAxis={<FixedYAxis ticks={[0, 25, 50]} height={height} tickFormatter={(v) => `${v}%`} />}
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
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#967B75" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#967B75" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#967B75" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#967B75" stopOpacity={0.02} />
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
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                />

                <YAxis hide domain={[0, 50]} />

                <Tooltip
                  cursor={false}
                  wrapperStyle={{ display: 'none' }}
                  content={
                    <PortalTooltip
                      containerRef={containerRef}
                      payloadFilter={(payload) =>
                        payload.filter(
                          (entry) =>
                            entry.dataKey !== 'errorRateBandBase' &&
                            entry.dataKey !== 'errorRateBandRange',
                        )
                      }
                      valueFormatter={(value) => {
                        const next = Number(value);
                        return Number.isFinite(next) ? `${Math.round(next)}%` : '—';
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
                      dataKey="errorRateBandBase"
                      stackId="errorRateBand"
                      stroke="none"
                      fill="transparent"
                      connectNulls
                      name="bandBase"
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="errorRateBandRange"
                      stackId="errorRateBand"
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
                    dataKey="errorRatePercent"
                    stroke="#967B75"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={showDots ? { r: 3, fill: '#967B75' } : false}
                    activeDot={{ r: 5, fill: '#967B75' }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {showAvgAsLine && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="errorRatePercent"
                    stroke="#967B75"
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: '#967B75' } : false}
                    activeDot={{ r: 5, fill: '#967B75' }}
                    connectNulls
                    name={t('stats.simple.avg')}
                  />
                )}
                {enabledSeries.min && (
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="minErrorRatePercent"
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
                    dataKey="maxErrorRatePercent"
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {t('stats.simple.errorRateTrend')}
              </span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.errorRateTrendDesc')}</InfoSheet>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('aria.maximize')}
                onClick={() => setFullscreenOpen(true)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowsOut size={16} />
              </button>
            </div>
          </div>

          <EvolutionErrorRateChartBody height={EVOLUTION_CHART_HEIGHT} />
          <SeriesToggleGroup ariaLabel={t('stats.simple.errorRateTrend')} options={toggleOptions} />
        </div>

        <FullscreenChartModal
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          title={t('stats.simple.errorRateTrend')}
          closeAriaLabel={t('aria.close')}
          headerCenter={
            <SeriesToggleGroup
              ariaLabel={t('stats.simple.errorRateTrend')}
              options={toggleOptions}
              className=""
            />
          }
        >
          <EvolutionErrorRateChartBody height={EVOLUTION_CHART_HEIGHT_FULLSCREEN} />
        </FullscreenChartModal>
      </>
    );
  }

  return <EvolutionErrorRateChart />;
}

function renderModeBreakdown(
  data: SimpleStatsData,
  betaEnabled: boolean,
  t: (key: string) => string,
): ReactNode {
  const breakdown = data.modeBreakdown;
  const maxDuration =
    breakdown.length > 0 ? Math.max(...breakdown.map((m) => m.totalDurationMs)) : 0;
  const upsColorClass = (ups: number) =>
    ups >= 80 ? 'text-emerald-500' : ups >= 50 ? 'text-amber-500' : 'text-pink-500';

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-medium">{t('stats.simple.modeBreakdown')}</h3>
        <InfoSheet iconSize={12}>{t('stats.tooltips.modeBreakdownDesc')}</InfoSheet>
      </div>
      <div className="space-y-3">
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 italic">-</p>
        ) : (
          breakdown
            .filter((m) => m.mode !== 'Other')
            .map((item) => (
              <div key={item.mode} className="flex items-center gap-3">
                <span className="w-24 text-sm truncate">
                  {t(`stats.mode.${item.mode.charAt(0).toLowerCase() + item.mode.slice(1)}`)}
                </span>
                <div className="flex-1 h-5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{
                      width: `${maxDuration > 0 ? (item.totalDurationMs / maxDuration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span
                  className={`text-sm font-medium w-8 text-right ${betaEnabled ? upsColorClass(item.avgUps) : 'text-muted-foreground/50'}`}
                >
                  {betaEnabled ? item.avgUps.toFixed(0) : '—'}
                </span>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {Math.round(item.totalDurationMs / 60000)}m
                </span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

/**
 * Modality Table Renderer
 *
 * Displays per-modality performance breakdown.
 *
 * **Mode-specific display**:
 * - **Dual N-Back Classic**: Error rate % (lower is better) - follows the 2008 classic protocol
 * - **Other tempo modes**: d' (sensitivity) + accuracy %
 * - **Flow/Recall**: Accuracy % only
 *
 * @see docs/references/jaeggi-2008/README.md for error-based scoring
 */
function renderModalityTable(
  data: SimpleStatsData,
  mode: ModeType,
  t: (key: string) => string,
): ReactNode {
  const modalityStats = data.modalityStats;
  // Dual N-Back Classic mode uses error rate instead of d'/accuracy
  const isDualnbackClassicMode = mode === 'DualnbackClassic';

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {isDualnbackClassicMode
            ? t('stats.simple.byModalityDualnbackClassic')
            : t('stats.simple.byModality')}
        </span>
        <InfoSheet iconSize={10}>
          {isDualnbackClassicMode
            ? t('stats.tooltips.byModalityDualnbackClassicDesc')
            : t('stats.tooltips.byModalityDesc')}
        </InfoSheet>
      </div>
      <div className="divide-y divide-border">
        {modalityStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 italic">-</p>
        ) : (
          modalityStats.map((stat) => {
            const totalSignals = stat.hits + stat.misses;
            const totalNoise = stat.falseAlarms + stat.correctRejections;

            // Dual N-Back Classic: error rate = (misses + falseAlarms) / (hits + misses + falseAlarms)
            // (CR excluded, aligned with computeWorstModalityErrorRate + stats SQL)
            const errors = stat.misses + stat.falseAlarms;
            const errorTotal = stat.hits + stat.misses + stat.falseAlarms;
            const errorRate = errorTotal > 0 ? (errors / errorTotal) * 100 : 0;

            // SDT metrics for non-Dual N-Back Classic tempo modes
            const hitRate = totalSignals > 0 ? stat.hits / totalSignals : 0;
            const faRateMod = totalNoise > 0 ? stat.falseAlarms / totalNoise : 0;
            const adjHitRate = Math.min(0.99, Math.max(0.01, hitRate));
            const adjFaRate = Math.min(0.99, Math.max(0.01, faRateMod));
            const zHit = Math.sqrt(2) * erfInv(2 * adjHitRate - 1);
            const zFa = Math.sqrt(2) * erfInv(2 * adjFaRate - 1);
            const dPrime = zHit - zFa;
            const hasSdtData = totalSignals > 0 && totalNoise > 0;

            // Dual N-Back Classic error rate color thresholds (lower is better)
            const getErrorRateColor = (rate: number) => {
              if (rate < 10) return 'text-emerald-500 font-medium';
              if (rate < 20) return 'text-amber-500 font-medium';
              return 'text-pink-500 font-medium';
            };

            return (
              <div key={stat.modality} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {getModalityIcon(stat.modality)}
                  <span className="capitalize">{t(`common.${stat.modality}`)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {isDualnbackClassicMode ? (
                    // Dual N-Back Classic: show error rate with down arrow (lower is better)
                    <div className="flex items-center gap-1">
                      <ArrowDown size={12} className={getErrorRateColor(errorRate)} weight="bold" />
                      <span className={getErrorRateColor(errorRate)}>{errorRate.toFixed(0)}%</span>
                    </div>
                  ) : (
                    // Other modes: d' + accuracy
                    <>
                      {!isGlobalView(mode) &&
                        isTempoLikeMode(mode) &&
                        hasSdtData &&
                        Number.isFinite(dPrime) && (
                          <span
                            className="text-muted-foreground"
                            title={t('report.dprimeSensitivity')}
                          >
                            d' {dPrime.toFixed(2)}
                          </span>
                        )}
                      <span
                        className={
                          stat.unifiedAccuracy >= ACCURACY_PASS_NORMALIZED
                            ? 'text-emerald-500 font-medium'
                            : stat.unifiedAccuracy >= 0.5
                              ? 'text-amber-500 font-medium'
                              : 'text-pink-500 font-medium'
                        }
                      >
                        {(stat.unifiedAccuracy * 100).toFixed(0)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function renderErrorProfile(
  data: SimpleStatsData,
  mode: ModeType,
  t: (key: string) => string,
): ReactNode {
  // Mode guard: only show for specific modes, not global view
  if (isGlobalView(mode)) return null;

  const ep = data.errorProfile ?? {
    errorRate: 0,
    missShare: null,
    faShare: null,
    totalHits: 0,
    totalMisses: 0,
    totalFalseAlarms: 0,
    totalCorrectRejections: 0,
  };

  return (
    <div className="bg-card/60 border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-1 mb-3">
        <span className="text-xs text-muted-foreground">{t('stats.simple.errorProfile')}</span>
        <InfoSheet iconSize={10}>{t('stats.tooltips.errorRateDesc')}</InfoSheet>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{t('stats.simple.errorRate')}</span>
          <span
            className={`text-lg font-bold ${
              ep.errorRate <= 0.2
                ? 'text-emerald-500'
                : ep.errorRate <= 0.4
                  ? 'text-amber-500'
                  : 'text-pink-500'
            }`}
          >
            {(ep.errorRate * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {ep.missShare !== null ? (
        <div className="space-y-3">
          <span className="text-xs text-muted-foreground">{t('stats.simple.errorStyle')}</span>

          <div className="h-4 rounded-full overflow-hidden flex bg-secondary">
            <div
              className="bg-orange-400 transition-all duration-300"
              style={{
                width: isPlaceOrMemoMode(mode) ? '100%' : `${ep.missShare * 100}%`,
              }}
              title={`${t('stats.simple.omissions')}: ${(ep.missShare * 100).toFixed(0)}%`}
            />
            {!isPlaceOrMemoMode(mode) && ep.faShare !== null && (
              <div
                className="bg-red-400 transition-all duration-300"
                style={{ width: `${ep.faShare * 100}%` }}
                title={`${t('stats.simple.falseAlarms')}: ${(ep.faShare * 100).toFixed(0)}%`}
              />
            )}
          </div>

          <div
            className={`flex text-xs ${isPlaceOrMemoMode(mode) ? 'justify-start' : 'justify-between'}`}
          >
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-orange-400" />
              <span className="text-muted-foreground">{t('stats.simple.omissions')}</span>
              <InfoSheet iconSize={10}>{t('stats.tooltips.omissionsDesc')}</InfoSheet>
              <span className="font-medium">
                {isPlaceOrMemoMode(mode) ? '100%' : `${(ep.missShare * 100).toFixed(0)}%`}
              </span>
            </div>
            {!isPlaceOrMemoMode(mode) && ep.faShare !== null && (
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                <span className="text-muted-foreground">{t('stats.simple.falseAlarms')}</span>
                <InfoSheet iconSize={10}>{t('stats.tooltips.falseAlarmsDesc')}</InfoSheet>
                <span className="font-medium">{(ep.faShare * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          {t('stats.simple.noErrors')}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

function renderSection(
  sectionId: SimpleStatsSectionId,
  data: SimpleStatsData,
  mode: ModeType,
  betaEnabled: boolean,
  t: (key: string) => string,
): ReactNode {
  switch (sectionId) {
    case 'ACTIVITY_KPIS':
      return renderActivityKPIs(data, t);

    case 'SESSIONS_PER_DAY':
      return renderSessionsPerDay(data, t);

    case 'PERFORMANCE_KPIS':
      return renderPerformanceKPIs(data, mode, betaEnabled, t);

    case 'MODE_SCORE':
      return renderModeScore(data, mode, t);

    case 'FLOW_CONFIDENCE':
      return renderFlowConfidence(data, t);

    case 'RECALL_CONFIDENCE':
      return renderRecallConfidence(data, t);

    case 'EVOLUTION_ACCURACY':
      return renderEvolutionAccuracy(data, t);

    case 'EVOLUTION_N_LEVEL':
      return renderEvolutionNLevel(data, t);

    case 'EVOLUTION_UPS':
      return renderEvolutionUPS(data, t);

    case 'EVOLUTION_ERROR_RATE':
      return renderEvolutionErrorRate(data, t);

    case 'MODE_BREAKDOWN':
      return renderModeBreakdown(data, betaEnabled, t);

    case 'MODALITY_TABLE':
      return renderModalityTable(data, mode, t);

    case 'ERROR_PROFILE':
      return renderErrorProfile(data, mode, t);

    default: {
      const _exhaustiveCheck: never = sectionId;
      console.warn(`[SimpleStatsSectionRenderer] Unknown section: ${_exhaustiveCheck}`);
      return null;
    }
  }
}

// =============================================================================
// Section Groups (3 volets)
// =============================================================================

const TIME_SECTIONS: readonly SimpleStatsSectionId[] = ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY'];

const PERFORMANCE_SECTIONS: readonly SimpleStatsSectionId[] = [
  'PERFORMANCE_KPIS',
  'MODE_SCORE',
  'FLOW_CONFIDENCE',
  'RECALL_CONFIDENCE',
  'MODALITY_TABLE',
  'ERROR_PROFILE',
  'MODE_BREAKDOWN',
];

const EVOLUTION_SECTIONS: readonly SimpleStatsSectionId[] = [
  'EVOLUTION_ACCURACY',
  'EVOLUTION_ERROR_RATE',
  'EVOLUTION_N_LEVEL',
  'EVOLUTION_UPS',
];

/**
 * Section Group Title
 * Left-aligned header with icon and spacing for clear visual hierarchy
 */
function SectionGroupTitle({ title, icon }: { title: string; icon: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-3 mb-3 sm:mb-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <span className="text-sm font-bold text-foreground uppercase tracking-widest">{title}</span>
    </div>
  );
}

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
          <ChartLine size={18} weight="duotone" />
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
 * Simple Stats Section Renderer
 *
 * Renders sections organized in 3 volets: Temps, Performance, Évolution.
 * Each section handles its own data guards (returns null if no data).
 */
export function SimpleStatsSectionRenderer({
  sections,
  data,
  mode,
  betaEnabled = false,
  alphaEnabled = false,
}: SimpleStatsSectionRendererProps): ReactNode {
  const { t } = useTranslation();
  const isAggregatePublicView = isGlobalView(mode) && !alphaEnabled;

  // UPS sections are beta-only
  const UPS_SECTIONS: readonly SimpleStatsSectionId[] = ['EVOLUTION_UPS'];
  const filteredSections = betaEnabled
    ? sections
    : sections.filter((s) => !UPS_SECTIONS.includes(s));

  // Filter active sections per group
  const activeTimeSections = filteredSections.filter((s) => TIME_SECTIONS.includes(s));
  const activePerformanceSections = filteredSections.filter((s) =>
    PERFORMANCE_SECTIONS.includes(s),
  );
  const activeEvolutionSections = filteredSections.filter((s) => EVOLUTION_SECTIONS.includes(s));

  // Render a group of sections
  const renderGroup = (sectionIds: readonly SimpleStatsSectionId[]): ReactNode[] => {
    return sectionIds
      .map((sectionId) => {
        const element = renderSection(sectionId, data, mode, betaEnabled, t);
        if (element === null) return null;
        return <div key={sectionId}>{element}</div>;
      })
      .filter(Boolean) as ReactNode[];
  };

  const timeContent = renderGroup(activeTimeSections);
  const performanceContent = renderGroup(activePerformanceSections);
  const evolutionContent = renderGroup(activeEvolutionSections);
  const sessionScoreEvolution = renderEvolutionSessionScore(data, mode, t);

  // Always show evolution section if it's in the active sections (structure visible even if empty)
  const showEvolution = activeEvolutionSections.length > 0;
  const showTime = timeContent.length > 0;
  const showPerformance = performanceContent.length > 0;
  const showPerformancePlaceholder = isAggregatePublicView && activePerformanceSections.length > 0;
  const showEvolutionPlaceholder = isAggregatePublicView && activeEvolutionSections.length > 0;

  return (
    <div className="space-y-2 pb-4">
      {/* TEMPS */}
      {showTime && (
        <>
          <SectionGroupTitle
            title={t('stats.groups.time')}
            icon={<Clock size={18} weight="duotone" />}
          />
          <div className="space-y-3 sm:space-y-4">{timeContent}</div>
        </>
      )}

      {/* PERFORMANCE */}
      {(showPerformance || showPerformancePlaceholder) && (
        <>
          {showTime && <CenteredGroupDivider id="stats-simple-divider-time-performance" />}
          <SectionGroupTitle
            title={t('stats.groups.performance')}
            icon={<Trophy size={18} weight="duotone" />}
          />
          <div className="space-y-3 sm:space-y-4">
            {showPerformancePlaceholder ? (
              <PlaceholderCard
                title={t(
                  'stats.placeholders.simplePerformanceTitle',
                  'Performance detaillee a venir',
                )}
                body={t(
                  'stats.placeholders.simplePerformanceBody',
                  'Les comparaisons tous modes confondus sont encore en preparation. Pour des statistiques deja fiables, utilisez le filtre Mode.',
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
            <CenteredGroupDivider id="stats-simple-divider-performance-evolution" />
          )}
          <SectionGroupTitle
            title={t('stats.groups.evolution')}
            icon={<ChartLine size={18} weight="duotone" />}
          />
          <div className="space-y-3 sm:space-y-4">
            {showEvolutionPlaceholder ? (
              <PlaceholderCard
                title={t('stats.placeholders.simpleEvolutionTitle', 'Evolution detaillee a venir')}
                body={t(
                  'stats.placeholders.simpleEvolutionBody',
                  'Les tendances globales par mode sont en cours de finalisation. Filtrez par mode pour afficher une evolution plus pertinente.',
                )}
              />
            ) : (
              <>
                {evolutionContent}
                {sessionScoreEvolution}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
