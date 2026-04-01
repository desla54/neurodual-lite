/**
 * Advanced Stats Tab
 *
 * Displays detailed advanced statistics.
 * Now spec-driven: uses getStatsSpec() to determine which sections to render.
 *
 * Before: Hardcoded conditionals (isGlobalView(), isTempoLikeMode(), etc.)
 * After: Spec declares sections, AdvancedStatsSectionRenderer renders them.
 */

import type { ReactNode } from 'react';
import { useEffect, useEffectEvent, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Warning, Brain, HourglassHigh } from '@phosphor-icons/react';

import {
  getStatsSpec,
  type StatsFilters,
  type StatsMode,
  type StatsInputMethod,
} from '@neurodual/logic';
import { useStatsAdapter } from '../../context/StatsContext';
import { AdvancedStatsSectionRenderer, type AdvancedStatsData } from '../advanced-section-renderer';
import type { StatsViewProps } from './simple-stats-tab';
import { useSessionSummariesCountQuery } from '../../queries';
import { resolveEffectiveJourneyMode } from '../helpers';

// =============================================================================
// Types
// =============================================================================

/** Extended ModeBreakdown with avgUps (matches infra implementation) */
interface ModeBreakdownWithUps {
  mode: string;
  sessionsCount: number;
  totalDurationMs: number;
  unifiedAccuracy: number;
  avgNLevel: number;
  maxNLevel: number;
  avgUps: number;
}

// =============================================================================
// Component
// =============================================================================

export function AdvancedStatsTab({
  mode,
  journeyFilter,
  modalities,
  startDate,
  endDate,
  nLevels,
  betaEnabled = false,
  alphaEnabled = false,
}: StatsViewProps): ReactNode {
  const { t } = useTranslation();
  const statsAdapter = useStatsAdapter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdvancedStatsData | null>(null);
  // Default to keyboard to avoid mixing incompatible input methods.
  const [inputMethod, setInputMethod] = useState<StatsInputMethod>('keyboard');
  const requestIdRef = useRef(0);
  const lastObservedSessionCountRef = useRef<number | null>(null);
  const didAutoPickInputMethodRef = useRef(false);
  const lastAutoPickKeyRef = useRef<string | null>(null);

  // Subscribe to session history changes (cheap SQL signal) to trigger stats reload
  const { count: sessionCount, isPending: isSessionCountPending } = useSessionSummariesCountQuery();

  const effectiveMode = resolveEffectiveJourneyMode(mode, journeyFilter);

  // Get spec for current mode
  const statsSpec = useMemo(() => getStatsSpec(effectiveMode), [effectiveMode]);

  // Build base filters (without inputMethod)
  const getBaseFilters = useCallback((): StatsFilters => {
    const statsMode: StatsMode = effectiveMode as StatsMode;
    return {
      mode: statsMode,
      journeyId:
        mode === 'Journey' && journeyFilter && journeyFilter !== 'all' ? journeyFilter : null,
      modalities,
      startDate,
      endDate,
      nLevels,
    };
  }, [mode, effectiveMode, journeyFilter, modalities, startDate, endDate, nLevels]);

  const baseFiltersKey = useMemo(() => {
    const f = getBaseFilters();
    return JSON.stringify({
      mode: f.mode,
      journeyId: f.journeyId ?? null,
      modalities: [...f.modalities].sort(),
      startDate: f.startDate ? f.startDate.toISOString() : null,
      endDate: f.endDate ? f.endDate.toISOString() : null,
      nLevels: [...f.nLevels].sort(),
    });
  }, [getBaseFilters]);

  const loadStats = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const filters = getBaseFilters();
      const timingFilters = { ...filters, inputMethod };

      const sections = statsSpec.advanced.sections;
      const needs = {
        upsStats: sections.includes('UPS_SUMMARY'),
        modeScore: sections.includes('MODE_SCORE'),
        distribution: sections.includes('DISTRIBUTION'),
        modeBreakdown: sections.includes('MODE_BREAKDOWN_TABLE'),
        timingStats: sections.includes('TIMING_STATS'),
        modalityTiming:
          sections.includes('TIMING_BY_MODALITY') || sections.includes('TIMING_VARIABILITY'),
        postErrorSlowing: sections.includes('ERROR_AWARENESS'),
        modalityStats:
          sections.includes('SDT_MODALITY_TABLE') || sections.includes('ERROR_AWARENESS'),
        timeSeries: sections.includes('EVOLUTION_UPS'),
        flowConfidence: sections.includes('FLOW_CONFIDENCE') && effectiveMode === 'DualPlace',
        recallConfidence: sections.includes('RECALL_CONFIDENCE') && effectiveMode === 'DualMemo',
      };

      const flowConfidencePromise = needs.flowConfidence
        ? statsAdapter.getPlaceConfidenceStats(filters)
        : Promise.resolve(null);
      const recallConfidencePromise = needs.recallConfidence
        ? statsAdapter.getMemoConfidenceStats(filters)
        : Promise.resolve(null);

      const [
        upsStats,
        modeScore,
        modalityStats,
        distributionStats,
        modeBreakdown,
        modalityTimingStats,
        postErrorSlowingStats,
        timingStats,
        timeSeries,
        flowConfidence,
        recallConfidence,
      ] = await Promise.all([
        needs.upsStats ? statsAdapter.getUPSStats(filters) : Promise.resolve(null),
        needs.modeScore ? statsAdapter.getModeScore(filters) : Promise.resolve(null),
        needs.modalityStats ? statsAdapter.getModalityStats(filters) : Promise.resolve([]),
        needs.distribution ? statsAdapter.getDistributionStats(filters) : Promise.resolve(null),
        needs.modeBreakdown ? statsAdapter.getModeBreakdown(filters) : Promise.resolve([]),
        needs.modalityTiming
          ? statsAdapter.getModalityTimingStats(timingFilters)
          : Promise.resolve([]),
        needs.postErrorSlowing
          ? statsAdapter.getPostErrorSlowingStats(timingFilters)
          : Promise.resolve([]),
        needs.timingStats ? statsAdapter.getTimingStats(timingFilters) : Promise.resolve(null),
        needs.timeSeries ? statsAdapter.getTimeSeries(filters) : Promise.resolve([]),
        flowConfidencePromise,
        recallConfidencePromise,
      ]);

      // Ignore stale responses from a previous request
      if (requestId !== requestIdRef.current) return;

      // Assemble data for renderer
      const statsData: AdvancedStatsData = {
        upsStats,
        modeScore,
        distributionStats,
        timingStats,
        modalityTimingStats,
        postErrorSlowingStats,
        modeBreakdown: modeBreakdown as ModeBreakdownWithUps[],
        modalityStats,
        flowConfidence,
        recallConfidence,
        timeSeries,
      };

      setData(statsData);
      setLoading(false);
    } catch (err) {
      // Ignore stale errors from a previous request
      if (requestId !== requestIdRef.current) return;
      console.error('[AdvancedStatsTab] Failed to load stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [effectiveMode, getBaseFilters, inputMethod, statsAdapter, statsSpec.advanced.sections]);

  // Load main stats when filters change
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Reset auto-pick when base filters change
  useEffect(() => {
    if (lastAutoPickKeyRef.current === baseFiltersKey) return;
    lastAutoPickKeyRef.current = baseFiltersKey;
    didAutoPickInputMethodRef.current = false;
  }, [baseFiltersKey]);

  // Stabilize loadStats reference for the session-count watcher so it doesn't
  // re-fire when filter-driven deps of loadStats change (the main effect handles that).
  const refreshStats = useEffectEvent(() => {
    void loadStats();
  });

  // Reactive refresh on history updates.
  // Ignore initial query hydration and only refresh on real count changes afterwards.
  useEffect(() => {
    if (isSessionCountPending) return;

    if (lastObservedSessionCountRef.current === null) {
      lastObservedSessionCountRef.current = sessionCount;
      return;
    }

    if (lastObservedSessionCountRef.current === sessionCount) return;
    lastObservedSessionCountRef.current = sessionCount;

    refreshStats();
  }, [sessionCount, isSessionCountPending]);

  // Auto-pick inputMethod when the default 'keyboard' yields no timing data.
  // This prevents the "I played with mouse but see no stats" failure mode.
  useEffect(() => {
    if (didAutoPickInputMethodRef.current) return;
    if (inputMethod !== 'keyboard') return;

    const hasTiming =
      statsSpec.advanced.sections.includes('TIMING_STATS') ||
      statsSpec.advanced.sections.includes('TIMING_BY_MODALITY') ||
      statsSpec.advanced.sections.includes('TIMING_VARIABILITY') ||
      statsSpec.advanced.sections.includes('ERROR_AWARENESS');
    if (!hasTiming) return;

    const responseCount = data?.timingStats?.responseCount ?? 0;
    if (responseCount > 0) {
      didAutoPickInputMethodRef.current = true;
      return;
    }

    let cancelled = false;
    const run = async () => {
      const filters = getBaseFilters();
      const [mouse, touch] = await Promise.all([
        statsAdapter.getTimingStats({ ...filters, inputMethod: 'mouse' }),
        statsAdapter.getTimingStats({ ...filters, inputMethod: 'touch' }),
      ]);

      if (cancelled) return;

      const best = [
        { method: 'mouse' as const, count: mouse.responseCount },
        { method: 'touch' as const, count: touch.responseCount },
      ].sort((a, b) => b.count - a.count)[0];

      didAutoPickInputMethodRef.current = true;
      if (best && best.count > 0) {
        setInputMethod(best.method);
      }
    };

    void run().catch((err) => {
      console.warn('[AdvancedStatsTab] auto-pick inputMethod failed:', err);
      didAutoPickInputMethodRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [
    baseFiltersKey,
    data?.timingStats?.responseCount,
    getBaseFilters,
    inputMethod,
    statsAdapter,
    statsSpec.advanced.sections,
  ]);

  // Handler for input method change
  const handleInputMethodChange = useCallback((newMethod: StatsInputMethod) => {
    setInputMethod(newMethod);
  }, []);

  // Coming soon placeholder for modes without detailed stats yet
  const COMING_SOON_MODES = new Set(['StroopFlex', 'Ospan', 'Gridlock']);
  if (COMING_SOON_MODES.has(effectiveMode)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <HourglassHigh size={32} weight="duotone" className="text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {t('stats.placeholders.comingSoonTitle', 'Statistics coming soon')}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t(
              'stats.placeholders.comingSoonBody',
              'Detailed statistics for this mode are being developed. In the meantime, your sessions are recorded in the history tab.',
            )}
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
          <Brain size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
          <Warning size={32} className="text-destructive" />
        </div>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // Default empty data structure (when no sessions exist)
  const emptyData: AdvancedStatsData = {
    upsStats: null,
    modeScore: null,
    distributionStats: null,
    timingStats: null,
    modalityTimingStats: [],
    postErrorSlowingStats: [],
    modeBreakdown: [],
    modalityStats: [],
    flowConfidence: null,
    recallConfidence: null,
    timeSeries: [],
  };

  // Spec-driven rendering (always show structure, even with empty data)
  return (
    <AdvancedStatsSectionRenderer
      sections={statsSpec.advanced.sections}
      data={data ?? emptyData}
      mode={effectiveMode}
      inputMethod={inputMethod}
      onInputMethodChange={handleInputMethodChange}
      betaEnabled={betaEnabled}
      alphaEnabled={alphaEnabled}
    />
  );
}
