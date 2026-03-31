/**
 * PVT (Psychomotor Vigilance Test) — pure game logic.
 *
 * Dinges & Powell (1985):
 * - Wait for a stimulus at random intervals (2-10s foreperiod)
 * - React as fast as possible when counter appears
 * - False starts (response before stimulus) are penalized
 * - Key metrics: median RT, mean RT, fastest/slowest, lapse count
 */

// =============================================================================
// Constants
// =============================================================================

export const FOREPERIOD_MIN_MS = 2000;
export const FOREPERIOD_MAX_MS = 10000;
export const LAPSE_THRESHOLD_MS = 500;
export const DEFAULT_TOTAL_TRIALS = 10;

// =============================================================================
// Types
// =============================================================================

export interface PvtTrialResult {
  trialIndex: number;
  responseTimeMs: number;
  falseStart: boolean;
  lapse: boolean;
}

export interface PvtSummary {
  totalTrials: number;
  validTrials: number;
  medianRtMs: number;
  meanRtMs: number;
  fastestRtMs: number;
  slowestRtMs: number;
  lapseCount: number;
  falseStartCount: number;
}

// =============================================================================
// Foreperiod Generation
// =============================================================================

/**
 * Generate a random foreperiod (wait time before stimulus) in milliseconds.
 * @param rng Random number generator (default: Math.random)
 * @returns Duration in ms between FOREPERIOD_MIN_MS and FOREPERIOD_MAX_MS
 */
export function randomForeperiod(rng: () => number = Math.random): number {
  return FOREPERIOD_MIN_MS + rng() * (FOREPERIOD_MAX_MS - FOREPERIOD_MIN_MS);
}

// =============================================================================
// Classification
// =============================================================================

/**
 * Classify whether a response is a false start (response before stimulus).
 * In the actual game, false starts happen when the user taps during the waiting phase.
 * This function is a semantic helper for clarity.
 */
export function isFalseStart(respondedDuringWait: boolean): boolean {
  return respondedDuringWait;
}

/**
 * Classify whether a reaction time is a lapse (RT > 500ms).
 */
export function isLapse(responseTimeMs: number): boolean {
  return responseTimeMs > LAPSE_THRESHOLD_MS;
}

/**
 * Create a trial result for a valid response (stimulus was shown).
 */
export function createTrialResult(trialIndex: number, responseTimeMs: number): PvtTrialResult {
  return {
    trialIndex,
    responseTimeMs,
    falseStart: false,
    lapse: isLapse(responseTimeMs),
  };
}

/**
 * Create a trial result for a false start.
 */
export function createFalseStartResult(trialIndex: number): PvtTrialResult {
  return {
    trialIndex,
    responseTimeMs: 0,
    falseStart: true,
    lapse: false,
  };
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Compute median of a sorted array of numbers.
 */
export function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
  }
  return Math.round(sorted[mid] as number);
}

/**
 * Compute mean of an array of numbers.
 */
export function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Compute full PVT summary from trial results.
 */
export function computeSummary(results: PvtTrialResult[]): PvtSummary {
  const valid = results.filter((r) => !r.falseStart);
  const rts = valid.map((r) => r.responseTimeMs).sort((a, b) => a - b);

  return {
    totalTrials: results.length,
    validTrials: valid.length,
    medianRtMs: computeMedian(rts),
    meanRtMs: computeMean(rts),
    fastestRtMs: rts.length > 0 ? Math.round(rts[0] as number) : 0,
    slowestRtMs: rts.length > 0 ? Math.round(rts[rts.length - 1] as number) : 0,
    lapseCount: valid.filter((r) => r.lapse).length,
    falseStartCount: results.filter((r) => r.falseStart).length,
  };
}
