/**
 * Stats exports
 *
 * Types are re-exported from @neurodual/logic (Single Source of Truth).
 */

// Re-export types from logic (SSOT)
export type {
  StatsFilters,
  StatsInputMethod,
  StatsMode,
  ActivityStats,
  PerformanceStats,
  ModalityStatsRow,
  TimeSeriesPoint,
  SessionScorePoint,
  ModeScoreStats,
  ZoneStats,
  DistributionStats,
  ModeBreakdown,
  FocusStats,
  StatsTimingStats as TimingStats,
  ModalityTimingStats,
  PostErrorSlowingStats,
  PlaceConfidenceStats,
  MemoConfidenceStats,
  ErrorProfileStats,
  UPSStats,
} from '@neurodual/logic';
