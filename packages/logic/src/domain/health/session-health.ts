/**
 * Session Health Metrics
 *
 * Computes reliability metrics for psychometric data quality assessment.
 * Used to flag sessions with potentially unreliable RT measurements.
 *
 * Factors considered:
 * - Processing lag (browser event → XState processing)
 * - Event loop lag at session start
 * - RT stability (coefficient of variation)
 * - Focus events (focus lost count and duration)
 * - Freezes and long tasks during session
 */

import type { GameEvent, ProcessingLagStats, SessionHealthMetrics } from '../../engine/events';
import {
  HEALTH_PROCESSING_LAG_WARNING_MS,
  HEALTH_PROCESSING_LAG_DEGRADED_MS,
  HEALTH_RT_CV_WARNING,
  HEALTH_RT_CV_DEGRADED,
  HEALTH_EVENTLOOP_LAG_WARNING_MS,
  HEALTH_EVENTLOOP_LAG_DEGRADED_MS,
  HEALTH_SCORE_HIGH,
  HEALTH_SCORE_MEDIUM,
  HEALTH_WEIGHT_PROCESSING_LAG,
  HEALTH_WEIGHT_EVENTLOOP_LAG,
  HEALTH_WEIGHT_RT_STABILITY,
  HEALTH_WEIGHT_FOCUS,
  HEALTH_WEIGHT_FREEZES,
} from '../../specs/thresholds';

// =============================================================================
// Input Types
// =============================================================================

export interface SessionHealthInput {
  /** All session events (for extracting USER_RESPONDED, FOCUS_LOST, etc.) */
  readonly sessionEvents: readonly GameEvent[];
  /** Event loop lag measured at session start (ms) */
  readonly eventLoopLagAtStart: number;
  /** Number of main thread freezes (>2s) during session */
  readonly freezeCount: number;
  /** Number of long tasks (>50ms) during session */
  readonly longTaskCount: number;
}

// =============================================================================
// Helper: Extract Processing Lag Stats
// =============================================================================

function extractProcessingLags(events: readonly GameEvent[]): number[] {
  const lags: number[] = [];

  for (const event of events) {
    if (event.type === 'USER_RESPONDED') {
      const processingLag = (event as { processingLagMs?: number }).processingLagMs;
      if (processingLag !== undefined && processingLag >= 0) {
        lags.push(processingLag);
      }
    }
  }

  return lags;
}

function computeProcessingLagStats(lags: readonly number[]): ProcessingLagStats {
  if (lags.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0 };
  }

  const sorted = [...lags].sort((a, b) => a - b);
  // We already checked lags.length > 0, so sorted[0] and sorted[length-1] are guaranteed
  const min = sorted[0] as number;
  const max = sorted[sorted.length - 1] as number;
  const avg = lags.reduce((sum, v) => sum + v, 0) / lags.length;

  // P95: 95th percentile
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[Math.min(p95Index, sorted.length - 1)] as number;

  return { min, max, avg, p95 };
}

// =============================================================================
// Helper: Extract RT Stability (Coefficient of Variation)
// =============================================================================

function extractReactionTimes(events: readonly GameEvent[]): number[] {
  const rts: number[] = [];

  for (const event of events) {
    if (event.type === 'USER_RESPONDED') {
      const rt = (event as { reactionTimeMs?: number }).reactionTimeMs;
      if (rt !== undefined && rt > 0) {
        rts.push(rt);
      }
    }
  }

  return rts;
}

function computeCoefficientOfVariation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0; // Not enough data
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return stdDev / mean;
}

// =============================================================================
// Helper: Extract Focus Metrics
// =============================================================================

interface FocusMetrics {
  focusLossCount: number;
  totalFocusLostMs: number;
}

function extractFocusMetrics(events: readonly GameEvent[]): FocusMetrics {
  let focusLossCount = 0;
  let totalFocusLostMs = 0;

  for (const event of events) {
    if (event.type === 'FOCUS_LOST') {
      focusLossCount++;
    } else if (event.type === 'FOCUS_REGAINED') {
      const duration = (event as { lostDurationMs?: number }).lostDurationMs;
      if (duration !== undefined && duration > 0) {
        totalFocusLostMs += duration;
      }
    }
  }

  return { focusLossCount, totalFocusLostMs };
}

// =============================================================================
// Score Component Calculators
// =============================================================================

/**
 * Compute score component for processing lag (0-100).
 * Lower lag = higher score.
 */
function scoreProcessingLag(stats: ProcessingLagStats): number {
  const { avg, p95 } = stats;

  // Use P95 for penalty (worse case matters more)
  const effectiveLag = Math.max(avg, p95 * 0.5);

  if (effectiveLag <= HEALTH_PROCESSING_LAG_WARNING_MS) {
    // Excellent: 0-10ms → 100-80
    return 100 - (effectiveLag / HEALTH_PROCESSING_LAG_WARNING_MS) * 20;
  } else if (effectiveLag <= HEALTH_PROCESSING_LAG_DEGRADED_MS) {
    // Warning: 10-50ms → 80-40
    const ratio =
      (effectiveLag - HEALTH_PROCESSING_LAG_WARNING_MS) /
      (HEALTH_PROCESSING_LAG_DEGRADED_MS - HEALTH_PROCESSING_LAG_WARNING_MS);
    return 80 - ratio * 40;
  } else {
    // Degraded: >50ms → 40-0
    const overDegraded = effectiveLag - HEALTH_PROCESSING_LAG_DEGRADED_MS;
    return Math.max(0, 40 - overDegraded * 0.5);
  }
}

/**
 * Compute score component for event loop lag (0-100).
 */
function scoreEventLoopLag(lagMs: number): number {
  if (lagMs <= HEALTH_EVENTLOOP_LAG_WARNING_MS) {
    // Excellent: 0-30ms → 100-80
    return 100 - (lagMs / HEALTH_EVENTLOOP_LAG_WARNING_MS) * 20;
  } else if (lagMs <= HEALTH_EVENTLOOP_LAG_DEGRADED_MS) {
    // Warning: 30-100ms → 80-40
    const ratio =
      (lagMs - HEALTH_EVENTLOOP_LAG_WARNING_MS) /
      (HEALTH_EVENTLOOP_LAG_DEGRADED_MS - HEALTH_EVENTLOOP_LAG_WARNING_MS);
    return 80 - ratio * 40;
  } else {
    // Degraded: >100ms → 40-0
    const overDegraded = lagMs - HEALTH_EVENTLOOP_LAG_DEGRADED_MS;
    return Math.max(0, 40 - overDegraded * 0.2);
  }
}

/**
 * Compute score component for RT stability (0-100).
 * Lower CV = higher score.
 */
function scoreRtStability(cv: number): number {
  if (cv <= HEALTH_RT_CV_WARNING) {
    // Excellent: 0-0.3 → 100-80
    return 100 - (cv / HEALTH_RT_CV_WARNING) * 20;
  } else if (cv <= HEALTH_RT_CV_DEGRADED) {
    // Warning: 0.3-0.5 → 80-50
    const ratio = (cv - HEALTH_RT_CV_WARNING) / (HEALTH_RT_CV_DEGRADED - HEALTH_RT_CV_WARNING);
    return 80 - ratio * 30;
  } else {
    // Degraded: >0.5 → 50-0
    const overDegraded = cv - HEALTH_RT_CV_DEGRADED;
    return Math.max(0, 50 - overDegraded * 100);
  }
}

/**
 * Compute score component for focus (0-100).
 */
function scoreFocus(metrics: FocusMetrics): number {
  const { focusLossCount, totalFocusLostMs } = metrics;

  // Penalize each focus loss
  const countPenalty = focusLossCount * 10;

  // Penalize long total duration (1% per second lost)
  const durationPenalty = totalFocusLostMs / 100;

  return Math.max(0, 100 - countPenalty - durationPenalty);
}

/**
 * Compute score component for freezes/long tasks (0-100).
 */
function scoreFreezes(freezeCount: number, longTaskCount: number): number {
  // Freezes are severe (20 points each)
  const freezePenalty = freezeCount * 20;

  // Long tasks are less severe (5 points each)
  const longTaskPenalty = longTaskCount * 5;

  return Math.max(0, 100 - freezePenalty - longTaskPenalty);
}

// =============================================================================
// Main Computation
// =============================================================================

/**
 * Compute session health metrics from events and runtime data.
 *
 * @param input Session events and runtime measurements
 * @returns Complete SessionHealthMetrics
 */
export function computeSessionHealthMetrics(input: SessionHealthInput): SessionHealthMetrics {
  const { sessionEvents, eventLoopLagAtStart, freezeCount, longTaskCount } = input;

  // Extract data from events
  const processingLags = extractProcessingLags(sessionEvents);
  const reactionTimes = extractReactionTimes(sessionEvents);
  const focusMetrics = extractFocusMetrics(sessionEvents);

  // Compute derived metrics
  const processingLag = computeProcessingLagStats(processingLags);
  const rtStabilityCV = computeCoefficientOfVariation(reactionTimes);

  // Compute score components (0-100 each)
  const processingScore = scoreProcessingLag(processingLag);
  const eventLoopScore = scoreEventLoopLag(eventLoopLagAtStart);
  const rtScore = scoreRtStability(rtStabilityCV);
  const focusScore = scoreFocus(focusMetrics);
  const freezeScore = scoreFreezes(freezeCount, longTaskCount);

  // Weighted average for final score
  const reliabilityScore = Math.round(
    processingScore * HEALTH_WEIGHT_PROCESSING_LAG +
      eventLoopScore * HEALTH_WEIGHT_EVENTLOOP_LAG +
      rtScore * HEALTH_WEIGHT_RT_STABILITY +
      focusScore * HEALTH_WEIGHT_FOCUS +
      freezeScore * HEALTH_WEIGHT_FREEZES,
  );

  // Derive quality flag
  const quality = deriveQualityFlag(reliabilityScore);

  return {
    processingLag,
    eventLoopLagAtStartMs: eventLoopLagAtStart,
    rtStabilityCV,
    focusLossCount: focusMetrics.focusLossCount,
    totalFocusLostMs: focusMetrics.totalFocusLostMs,
    freezeCount,
    longTaskCount,
    reliabilityScore,
    quality,
  };
}

/**
 * Derive quality flag from reliability score.
 */
export function deriveQualityFlag(score: number): 'high' | 'medium' | 'degraded' {
  if (score >= HEALTH_SCORE_HIGH) return 'high';
  if (score >= HEALTH_SCORE_MEDIUM) return 'medium';
  return 'degraded';
}

/**
 * Create empty/default health metrics (for abandoned sessions or errors).
 */
export function createEmptyHealthMetrics(): SessionHealthMetrics {
  return {
    processingLag: { min: 0, max: 0, avg: 0, p95: 0 },
    eventLoopLagAtStartMs: 0,
    rtStabilityCV: 0,
    focusLossCount: 0,
    totalFocusLostMs: 0,
    freezeCount: 0,
    longTaskCount: 0,
    reliabilityScore: 100,
    quality: 'high',
  };
}
