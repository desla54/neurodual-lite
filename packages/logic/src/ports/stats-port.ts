/**
 * Stats Port
 *
 * Interface for statistics queries.
 * Implemented by statsAdapter in infra/ package.
 */

// =============================================================================
// Types
// =============================================================================

export type StatsMode =
  | 'all'
  | 'DualTempo'
  | 'DualPlace'
  | 'DualMemo'
  | 'DualPick'
  | 'DualTrace'
  | 'DualnbackClassic'
  | 'BrainWorkshop'
  | 'Libre'
  | 'Journey';

/** Input method for timing stats filtering (matches USER_RESPONDED event values) */
export type StatsInputMethod = 'keyboard' | 'mouse' | 'touch';

export interface StatsFilters {
  /** Mode filter: 'all' or specific mode */
  mode: StatsMode;
  /**
   * Journey filter (only meaningful when mode === 'Journey').
   * When omitted/null, includes all journey sessions.
   */
  journeyId?: string | null;
  /** Modality filter: empty = all, otherwise exact match */
  modalities: Set<string>;
  /** Date range */
  startDate: Date | null;
  endDate: Date | null;
  /** N-level filter: empty = all, otherwise specific levels */
  nLevels: Set<number>;
  /** Input method filter (optional, used for timing stats) */
  inputMethod?: StatsInputMethod;
}

export interface ActivityStats {
  sessionsCount: number;
  totalPlayTimeMs: number;
  /** Average training time per active day in the filtered period. */
  avgSessionDurationMs: number;
  activeDays: number;
}

export interface PerformanceStats {
  currentNLevel: number;
  maxNLevel: number;
  unifiedAccuracy: number; // 0..1
  upsScore: number; // 0-100, weighted by actions
}

export interface ModalityStatsRow {
  modality: string;
  totalActions: number;
  unifiedAccuracy: number;
  avgResponseTimeMs: number | null;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
}

export interface TimeSeriesPoint {
  day: string; // ISO date string
  sessionsCount: number;
  totalDurationMs: number;
  unifiedAccuracy: number;
  /** Minimum session unified accuracy for the day (within current filters). */
  minUnifiedAccuracy: number | null;
  /** Maximum session unified accuracy for the day (within current filters). */
  maxUnifiedAccuracy: number | null;
  avgNLevel: number;
  /** Minimum session end level for the day (within current filters). */
  minNLevel: number;
  /** Maximum session end level for the day (within current filters). */
  maxNLevel: number;
  /** Minimum session error rate (0-100%) for the day (within current filters). */
  minErrorRatePercent: number | null;
  /** Maximum session error rate (0-100%) for the day (within current filters). */
  maxErrorRatePercent: number | null;
  upsScore: number; // 0-100, weighted by actions per day
  /** Minimum session UPS for the day (within current filters). */
  minUpsScore: number | null;
  /** Maximum session UPS for the day (within current filters). */
  maxUpsScore: number | null;
  /**
   * Jaeggi/BrainWorkshop specific: worst modality error rate (0-100%).
   *
   * **Calculation**: MAX((misses + falseAlarms) / total * 100) across all modalities.
   *
   * This metric follows the Jaeggi 2008 methodology where progression is based
   * on error count in the worst-performing modality.
   *
   * - Lower is better (unlike accuracy)
   * - Null for modes that don't use error-based scoring
   *
   * @see docs/references/jaeggi-2008/README.md
   */
  worstModalityErrorRate: number | null;
}

export interface SessionScorePoint {
  /** 1-based rank in filtered chronological session sequence */
  sessionIndex: number;
  /** Session timestamp (ISO) */
  createdAt: string;
  /** Mode-native score (same unit/range as modeScore for the mode) */
  score: number;
}

export interface ModeScoreStats {
  last: number | null;
  avg: number | null;
  best: number | null;
  /** Worst score in period (direction depends on mode: max for error-rate modes, min otherwise) */
  worst: number | null;
}

export interface ZoneStats {
  currentZone: number;
  medianZone: number;
  zoneProgress: number;
}

export interface DistributionStats {
  upsStdDev: number;
  upsPercentiles: { p25: number; p50: number; p75: number };
  durationPercentiles: { p25: number; p50: number; p75: number };
  upsBuckets: Array<{ min: number; max: number; count: number }>;
}

export interface ModeBreakdown {
  mode: string;
  sessionsCount: number;
  totalDurationMs: number;
  unifiedAccuracy: number;
  avgNLevel: number;
  maxNLevel: number;
  avgUps: number;
}

export interface FocusStats {
  focusLostCount: number;
  focusLostTotalMs: number;
  /** Average focus lost per session (only for aggregated stats, not single session reports) */
  avgFocusLostPerSession?: number;
}

export interface TimingStats {
  avgResponseTimeMs: number | null;
  medianResponseTimeMs: number | null;
  /**
   * Median response time for responses classified as "during stimulus window".
   * Note: classification is currently derived from machine phase, not actual visual visibility.
   */
  medianResponseTimeDuringStimulusMs: number | null;
  /**
   * Median response time for responses classified as "after stimulus window".
   * Note: classification is currently derived from machine phase, not actual visual visibility.
   */
  medianResponseTimeAfterStimulusMs: number | null;
  /**
   * Median response time after stimulus *offset* (hide) when timestamps are available.
   * Computed from capturedAtMs - stimulusHiddenAtMs (event-level only).
   */
  medianResponseTimeAfterStimulusOffsetMs: number | null;
  /** Minimum response time (fastest) */
  minResponseTimeMs: number | null;
  /** Maximum response time (slowest) */
  maxResponseTimeMs: number | null;
  /** 25th percentile (faster quartile boundary) */
  p25ResponseTimeMs: number | null;
  /** 75th percentile (slower quartile boundary) */
  p75ResponseTimeMs: number | null;
  avgISIMs: number | null;
  avgStimulusDurationMs: number | null;
  responsesDuringStimulus: number;
  responsesAfterStimulus: number;
  /** Total response count for this filter */
  responseCount: number;

  // -------------------------------------------------------------------------
  // Diagnostics (optional; advanced timing data quality)
  // -------------------------------------------------------------------------

  /** Count of responses where RT was recomputed from capturedAtMs - stimulusShownAtMs */
  computedRtCount?: number;
  /** p50 of processingLagMs from USER_RESPONDED */
  processingLagP50Ms?: number | null;
  /** p95 of processingLagMs from USER_RESPONDED */
  processingLagP95Ms?: number | null;
  /** Count of RESPONSE_FILTERED(reason=too_fast) under the current filters */
  filteredTooFastCount?: number;
  /** Count of RESPONSE_FILTERED(reason=touch_bounce) under the current filters */
  filteredTouchBounceCount?: number;
  /** Count of DUPLICATE_RESPONSE_DETECTED under the current filters */
  duplicateResponseCount?: number;
  /** p50 input→dispatch latency (INPUT_PIPELINE_LATENCY) */
  inputToDispatchP50Ms?: number | null;
  /** p95 input→dispatch latency (INPUT_PIPELINE_LATENCY) */
  inputToDispatchP95Ms?: number | null;
  /** p50 input→paint latency (INPUT_PIPELINE_LATENCY) */
  inputToPaintP50Ms?: number | null;
  /** p95 input→paint latency (INPUT_PIPELINE_LATENCY) */
  inputToPaintP95Ms?: number | null;
  /** p50 A/V drift: stimulusShownAtMs - audioSyncAtMs (TRIAL_PRESENTED) */
  avShowDriftP50Ms?: number | null;
  /** p95 A/V drift: stimulusShownAtMs - audioSyncAtMs (TRIAL_PRESENTED) */
  avShowDriftP95Ms?: number | null;
  /** p50 A/V drift: stimulusHiddenAtMs - audioEndedAtMs (TRIAL_PRESENTED) */
  avHideDriftP50Ms?: number | null;
  /** p95 A/V drift: stimulusHiddenAtMs - audioEndedAtMs (TRIAL_PRESENTED) */
  avHideDriftP95Ms?: number | null;
}

export interface ModalityTimingStats {
  modality: string;
  avgResponseTimeMs: number;
  medianResponseTimeMs: number | null;
  stdDevResponseTimeMs: number | null;
  count: number;
  /** During-stimulus subset (phase from event payload; may be missing on older data) */
  duringCount: number;
  avgDuringResponseTimeMs: number | null;
  stdDevDuringResponseTimeMs: number | null;
  /** True if count >= 5 and stdDev is available (reliable for CV calculation) */
  hasReliableData: boolean;
  /** True if count < 10 (results may be unstable) */
  isSmallSample: boolean;
}

/**
 * Post-Error Slowing (PES) stats per modality.
 * Measures metacognitive awareness by comparing RT after errors vs RT on hits.
 */
export interface PostErrorSlowingStats {
  modality: string;
  /** Average RT on hits (correct responses) */
  avgRtOnHitsMs: number;
  /** Number of hit trials included in avgRtOnHitsMs */
  hitTrialCount: number;
  /** Average RT on trials immediately after an error */
  avgRtAfterErrorMs: number | null;
  /** PES Ratio = avgRtAfterError / avgRtOnHits. > 1 means user slows down after error (good) */
  pesRatio: number | null;
  /** Number of post-error trials analyzed */
  postErrorTrialCount: number;
}

export interface ErrorProfileStats {
  /** Total error rate (0..1): (misses + FA) / actions */
  errorRate: number;
  /** Share of misses among errors (0..1): misses / (misses + FA) */
  missShare: number | null;
  /** Share of false alarms among errors (0..1): FA / (misses + FA) */
  faShare: number | null;
  /** Raw counts for display */
  totalHits: number;
  totalMisses: number;
  totalFalseAlarms: number;
  totalCorrectRejections: number;
}

export interface UPSStats {
  /** Weighted UPS score (0-100) */
  upsScore: number;
  /** Last session UPS */
  upsScoreLast: number | null;
  /** Best session UPS */
  upsScoreBest: number | null;
}

export interface PlaceConfidenceStats {
  confidenceScoreAvg: number | null;
  confidenceScoreLast: number | null;
  directnessRatioAvg: number | null;
  wrongSlotDwellMsTotal: number | null;
}

export interface MemoConfidenceStats {
  confidenceScoreAvg: number | null;
  confidenceScoreLast: number | null;
  fluencyScoreAvg: number | null;
  fluencyScoreLast: number | null;
  correctionsCountTotal: number | null;
}

// =============================================================================
// Port Interface
// =============================================================================

export interface StatsPort {
  getActivityStats(filters: StatsFilters): Promise<ActivityStats>;
  getPerformanceStats(filters: StatsFilters): Promise<PerformanceStats>;
  getModalityStats(filters: StatsFilters): Promise<ModalityStatsRow[]>;
  getTimeSeries(filters: StatsFilters): Promise<TimeSeriesPoint[]>;
  /**
   * Per-session score series (chronological, no daily averaging).
   * Optional for backward compatibility with older adapters/mocks.
   */
  getSessionScoreSeries?(filters: StatsFilters): Promise<SessionScorePoint[]>;
  getModeScore(filters: StatsFilters): Promise<ModeScoreStats>;
  getZoneStats(filters: StatsFilters): Promise<ZoneStats | null>;
  getDistributionStats(filters: StatsFilters): Promise<DistributionStats>;
  getModeBreakdown(filters: StatsFilters): Promise<ModeBreakdown[]>;
  getFocusStats(filters: StatsFilters): Promise<FocusStats>;
  getTimingStats(filters: StatsFilters): Promise<TimingStats>;
  getModalityTimingStats(filters: StatsFilters): Promise<ModalityTimingStats[]>;
  getPostErrorSlowingStats(filters: StatsFilters): Promise<PostErrorSlowingStats[]>;
  getErrorProfileStats(filters: StatsFilters): Promise<ErrorProfileStats>;
  getUPSStats(filters: StatsFilters): Promise<UPSStats>;
  getPlaceConfidenceStats(filters: StatsFilters): Promise<PlaceConfidenceStats>;
  getMemoConfidenceStats(filters: StatsFilters): Promise<MemoConfidenceStats>;
  /** Get available input methods from the data (for dynamic filtering) */
  getAvailableInputMethods(filters: StatsFilters): Promise<StatsInputMethod[]>;
}
