import { queryOptions, useQuery } from '@tanstack/react-query';
import type {
  ActivityStats,
  ModalityStatsRow,
  ModeScoreStats,
  PerformanceStats,
  StatsFilters,
  StatsPort,
  TimeSeriesPoint,
  ZoneStats,
} from '@neurodual/logic';
import { useStatsAdapter } from '../context/StatsContext';
import { queryKeys } from './keys';

export interface StatsData {
  activity: ActivityStats | null;
  performance: PerformanceStats | null;
  modalities: ModalityStatsRow[];
  timeSeries: TimeSeriesPoint[];
  modeScore: ModeScoreStats | null;
  zone: ZoneStats | null;
}

export const DEFAULT_STATS_DATA: StatsData = {
  activity: null,
  performance: null,
  modalities: [],
  timeSeries: [],
  modeScore: null,
  zone: null,
};

function normalizeModalities(modalities: StatsFilters['modalities']): readonly string[] {
  return [...modalities].sort();
}

export function createStatsFiltersSignature(filters: StatsFilters): string {
  return JSON.stringify({
    mode: filters.mode ?? null,
    modalities: normalizeModalities(filters.modalities),
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
  });
}

export function createStatsDataQueryOptions(
  filters: StatsFilters,
  statsAdapter: StatsPort,
  refreshKey = 0,
) {
  const signature = createStatsFiltersSignature(filters);
  return queryOptions({
    queryKey: queryKeys.stats.filtered(signature, refreshKey),
    queryFn: async () => {
      const [activity, performance, modalities, timeSeries, modeScore, zone] = await Promise.all([
        statsAdapter.getActivityStats(filters),
        statsAdapter.getPerformanceStats(filters),
        statsAdapter.getModalityStats(filters),
        statsAdapter.getTimeSeries(filters),
        statsAdapter.getModeScore(filters),
        statsAdapter.getZoneStats(filters),
      ]);

      return {
        activity,
        performance,
        modalities,
        timeSeries,
        modeScore,
        zone,
      };
    },
  });
}

export function useStatsDataQuery(filters: StatsFilters, refreshKey = 0) {
  const statsAdapter = useStatsAdapter();
  return useQuery(createStatsDataQueryOptions(filters, statsAdapter, refreshKey));
}
