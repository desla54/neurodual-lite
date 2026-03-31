/**
 * Stats Components
 *
 * UI components for displaying session statistics, history, and progression.
 */

// Core stat components
export { AccuracyGauge, type AccuracyGaugeProps } from './accuracy-gauge';
export {
  SessionReport,
  type ModalityStats,
  type SessionReportData,
  type SessionReportLabels,
  type SessionReportProps,
} from './session-report';
export { StatCard, type StatCardProps } from './stat-card';
export {
  UnifiedSessionReport,
  type UnifiedSessionReportLabels,
  type UnifiedSessionReportProps,
} from './unified-session-report';

// Charts
export { ScrollableChart, type ScrollableChartProps } from './charts';
export { FixedYAxis, type FixedYAxisProps } from './charts';
export { CustomTooltip, type CustomTooltipProps } from './charts';

// Filters
export {
  ModalityFilter,
  type ModalityFilterProps,
  ModeSelector,
  type ModeSelectorProps,
  JourneySelector,
  type JourneySelectorProps,
  DateFilter,
  type DateFilterProps,
  NLevelSelector,
  type NLevelSelectorProps,
  FiltersDropdown,
  type FiltersDropdownProps,
  type ModalityFilterSet,
  type ModeType,
  type JourneyFilterType,
  type FreeModeFilterType,
  type DateRangeOption,
  type CustomDateRange,
  type NLevelFilterSet,
} from './filters';

// History
export {
  SessionCard,
  type SessionCardProps,
  DeleteConfirmModal,
  BulkDeleteModal,
  type DeleteConfirmModalProps,
  type BulkDeleteModalProps,
  HistoryView,
  type HistoryViewProps,
} from './history';

// Tabs
export {
  ProgressionTab,
  type ProgressionTabProps,
  SimpleStatsTab,
  AdvancedStatsTab,
  type StatsViewProps,
} from './tabs';

// Helpers
export {
  erfInv,
  getModalityIcon,
  formatDuration,
  isTempoLikeMode,
  isPlaceOrMemoMode,
  isGlobalView,
  getStartDateFromOption,
} from './helpers';

// Sections (atomic components for spec-driven reports)
export * from './sections';

// Run Stack (for sessions with correction runs)
export { RunStackCard, type RunStackCardProps, type RunStackCardLabels } from './run-stack-card';
export { projectReplayRunReportFromHistorySession } from './history/run-report-projection';
