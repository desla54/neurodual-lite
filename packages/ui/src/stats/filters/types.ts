/**
 * Stats Filters - Shared types
 */

export type {
  ModalityFilterSet,
  NLevelFilterSet,
  ModeType,
  JourneyFilterType,
  FreeModeFilterType,
} from '@neurodual/logic';

/** Date range preset */
export type DateRangeOption = 'all' | 'today' | 'week' | 'month' | 'custom';

/** Custom date range */
export interface CustomDateRange {
  startDate: Date | null;
  endDate: Date | null;
}
