/**
 * Simple Stats Tab
 *
 * Displays simplified statistics for the current filter context.
 * Now spec-driven: uses getStatsSpec() to determine which sections to render.
 *
 * Before: Hardcoded conditionals (isGlobalView(), isTempoLikeMode(), etc.)
 * After: Spec declares sections, SimpleStatsSectionRenderer renders them.
 */

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pulse, Warning } from '@phosphor-icons/react';

import { getStatsSpec, type StatsFilters, type StatsMode } from '@neurodual/logic';
import { isGlobalView, resolveEffectiveJourneyMode } from '../helpers';
import type { ModeType, ModalityFilterSet, NLevelFilterSet } from '../filters/types';
import { useStatsAdapter } from '../../context/StatsContext';
import { SimpleStatsSectionRenderer, type SimpleStatsData } from '../simple-section-renderer';
import { useSessionSummariesCountQuery } from '../../queries';

// =============================================================================
// Types
// =============================================================================

export interface StatsViewProps {
  mode: ModeType;
  /** When mode === 'Journey': filter to a specific journeyId ('all' means all journeys) */
  journeyFilter?: string;
  modalities: ModalityFilterSet;
  startDate: Date | null;
  endDate: Date | null;
  nLevels: NLevelFilterSet;
  /** If true, show UPS sections (beta feature) */
  betaEnabled?: boolean;
  /** If true, reveal alpha-only aggregate sections */
  alphaEnabled?: boolean;
}

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

export function SimpleStatsTab({
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
  const [data, setData] = useState<SimpleStatsData | null>(null);

  // Subscribe to session history changes (cheap SQL signal) to trigger stats reload
  const { count: sessionCount } = useSessionSummariesCountQuery();

  const effectiveMode = resolveEffectiveJourneyMode(mode, journeyFilter);

  // Get spec for current mode
  const statsSpec = useMemo(() => getStatsSpec(effectiveMode), [effectiveMode]);

  // Load stats when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadStats() {
      try {
        const statsMode: StatsMode = effectiveMode as StatsMode;
        const filters: StatsFilters = {
          mode: statsMode,
          journeyId:
            mode === 'Journey' && journeyFilter && journeyFilter !== 'all' ? journeyFilter : null,
          modalities,
          startDate,
          endDate,
          nLevels,
        };

        const sections = statsSpec.simple.sections;
        const needs = {
          activity: sections.includes('ACTIVITY_KPIS'),
          performance: sections.includes('PERFORMANCE_KPIS'),
          modalityStats: sections.includes('MODALITY_TABLE'),
          timeSeries:
            sections.includes('SESSIONS_PER_DAY') ||
            sections.includes('EVOLUTION_ACCURACY') ||
            sections.includes('EVOLUTION_N_LEVEL') ||
            sections.includes('EVOLUTION_UPS') ||
            sections.includes('EVOLUTION_ERROR_RATE'),
          sessionScoreSeries: !isGlobalView(effectiveMode),
          modeScore: sections.includes('MODE_SCORE'),
          errorProfile: sections.includes('ERROR_PROFILE'),
          modeBreakdown: sections.includes('MODE_BREAKDOWN'),
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
          activityStats,
          performanceStats,
          modalityStats,
          timeSeries,
          sessionScoreSeries,
          modeScore,
          errorProfile,
          modeBreakdown,
          flowConfidence,
          recallConfidence,
        ] = await Promise.all([
          needs.activity ? statsAdapter.getActivityStats(filters) : Promise.resolve(null),
          needs.performance ? statsAdapter.getPerformanceStats(filters) : Promise.resolve(null),
          needs.modalityStats ? statsAdapter.getModalityStats(filters) : Promise.resolve([]),
          needs.timeSeries ? statsAdapter.getTimeSeries(filters) : Promise.resolve([]),
          needs.sessionScoreSeries
            ? (statsAdapter.getSessionScoreSeries?.(filters) ?? Promise.resolve([]))
            : Promise.resolve([]),
          needs.modeScore ? statsAdapter.getModeScore(filters) : Promise.resolve(null),
          needs.errorProfile ? statsAdapter.getErrorProfileStats(filters) : Promise.resolve(null),
          needs.modeBreakdown ? statsAdapter.getModeBreakdown(filters) : Promise.resolve([]),
          flowConfidencePromise,
          recallConfidencePromise,
        ]);

        if (cancelled) return;

        // Assemble data for renderer
        const statsData: SimpleStatsData = {
          activityStats: activityStats ?? null,
          performanceStats: performanceStats ?? null,
          errorProfile,
          modalityStats,
          timeSeries,
          sessionScoreSeries,
          modeBreakdown: modeBreakdown as ModeBreakdownWithUps[],
          modeScore,
          flowConfidence,
          recallConfidence,
        };

        setData(statsData);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[SimpleStatsTab] Failed to load stats:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    effectiveMode,
    journeyFilter,
    modalities,
    startDate,
    endDate,
    nLevels,
    statsAdapter,
    sessionCount,
  ]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
          <Pulse size={32} className="text-muted-foreground" />
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
  const emptyData: SimpleStatsData = {
    activityStats: {
      sessionsCount: 0,
      totalPlayTimeMs: 0,
      avgSessionDurationMs: 0,
      activeDays: 0,
    },
    performanceStats: null,
    errorProfile: null,
    modalityStats: [],
    timeSeries: [],
    sessionScoreSeries: [],
    modeBreakdown: [],
    modeScore: null,
    flowConfidence: null,
    recallConfidence: null,
  };

  // Spec-driven rendering (always show structure, even with empty data)
  return (
    <SimpleStatsSectionRenderer
      sections={statsSpec.simple.sections}
      data={data ?? emptyData}
      mode={effectiveMode}
      betaEnabled={betaEnabled}
      alphaEnabled={alphaEnabled}
    />
  );
}
