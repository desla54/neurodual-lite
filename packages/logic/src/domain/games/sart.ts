/**
 * SART (Sustained Attention to Response Task) — pure game logic.
 *
 * Robertson et al. (1997):
 * - Digits 1-9 appear one at a time in varying font sizes
 * - Player must TAP for ALL digits EXCEPT the target digit (default: 3)
 * - Go probability ~89% (8 of 9 digits are go)
 * - Measures sustained attention and response inhibition
 *
 * Key metrics:
 * - Commission errors (false alarms on no-go / target digit)
 * - Omission errors (misses on go digits)
 * - RT variability (SDRT / coefficient of variation)
 * - d-prime for discriminability
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_NOGO_DIGIT = 3;
export const FONT_SIZES = [48, 60, 72, 84, 96, 108, 120] as const;

// =============================================================================
// Types
// =============================================================================

export type SartOutcome = 'hit' | 'miss' | 'false_alarm' | 'correct_rejection';

export interface SartTrial {
  digit: number;
  isNoGo: boolean;
  fontSize: number;
}

export interface SartTrialResult {
  trial: SartTrial;
  responded: boolean;
  rt: number;
  outcome: SartOutcome;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate SART trials in cycles of digits 1-9 (shuffled within each cycle).
 * Each cycle has exactly one no-go digit (default: 3).
 */
export function generateTrials(
  count: number,
  noGoDigit: number = DEFAULT_NOGO_DIGIT,
  rng: () => number = Math.random,
): SartTrial[] {
  const trials: SartTrial[] = [];
  const cycleCount = Math.ceil(count / 9);

  for (let cycle = 0; cycle < cycleCount; cycle++) {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Fisher-Yates shuffle
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = digits[i]!;
      digits[i] = digits[j]!;
      digits[j] = tmp;
    }
    for (const digit of digits) {
      if (trials.length >= count) break;
      trials.push({
        digit,
        isNoGo: digit === noGoDigit,
        fontSize: FONT_SIZES[Math.floor(rng() * FONT_SIZES.length)]!,
      });
    }
  }

  return trials.slice(0, count);
}

// =============================================================================
// Outcome Classification
// =============================================================================

/**
 * Classify SART trial outcome:
 * - Go trial (non-target): tap = hit, withhold = miss (omission error)
 * - No-go trial (target): tap = false alarm (commission error), withhold = correct rejection
 */
export function classifyOutcome(isNoGo: boolean, responded: boolean): SartOutcome {
  if (isNoGo) return responded ? 'false_alarm' : 'correct_rejection';
  return responded ? 'hit' : 'miss';
}

/**
 * Check if an outcome counts as correct.
 */
export function isCorrectOutcome(outcome: SartOutcome): boolean {
  return outcome === 'hit' || outcome === 'correct_rejection';
}

// =============================================================================
// RT Variability
// =============================================================================

/**
 * Compute standard deviation of response times.
 */
export function computeRtStdDev(rts: number[]): number {
  if (rts.length < 2) return 0;
  const m = rts.reduce((a, b) => a + b, 0) / rts.length;
  const variance = rts.reduce((sum, v) => sum + (v - m) ** 2, 0) / (rts.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute coefficient of variation (CV) = SDRT / meanRT.
 * Higher CV indicates more variable (less sustained) attention.
 */
export function computeRtCoefficientOfVariation(rts: number[]): number {
  if (rts.length < 2) return 0;
  const m = rts.reduce((a, b) => a + b, 0) / rts.length;
  if (m === 0) return 0;
  return computeRtStdDev(rts) / m;
}

// =============================================================================
// Summary
// =============================================================================

export interface SartSummary {
  totalTrials: number;
  correctTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for hit trials (ms) */
  avgRT: number;
  /** Standard deviation of hit RTs (ms) */
  rtStdDev: number;
  /** Coefficient of variation of hit RTs */
  rtCV: number;
  hits: number;
  /** Omission errors — failed to tap on go trials */
  misses: number;
  /** Commission errors — tapped on no-go (target) trials */
  falseAlarms: number;
  correctRejections: number;
  /** 0-100 */
  hitRate: number;
  /** 0-100 */
  falseAlarmRate: number;
  /** Alias for falseAlarms */
  commissionErrors: number;
  /** Alias for misses */
  omissionErrors: number;
  goCount: number;
  nogoCount: number;
}

/**
 * Compute session summary from SART trial results.
 */
export function computeSummary(results: SartTrialResult[]): SartSummary {
  const goResults = results.filter((r) => !r.trial.isNoGo);
  const nogoResults = results.filter((r) => r.trial.isNoGo);

  const hits = goResults.filter((r) => r.responded).length;
  const misses = goResults.filter((r) => !r.responded).length;
  const falseAlarms = nogoResults.filter((r) => r.responded).length;
  const correctRejections = nogoResults.filter((r) => !r.responded).length;

  const correctTrials = hits + correctRejections;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const hitRate = goResults.length > 0 ? Math.round((hits / goResults.length) * 100) : 0;
  const falseAlarmRate =
    nogoResults.length > 0 ? Math.round((falseAlarms / nogoResults.length) * 100) : 0;

  const hitRTs = goResults.filter((r) => r.responded && r.rt > 0).map((r) => r.rt);
  const avgRT =
    hitRTs.length > 0 ? Math.round(hitRTs.reduce((a, b) => a + b, 0) / hitRTs.length) : 0;

  const rtStdDev = Math.round(computeRtStdDev(hitRTs));
  const rtCV = Math.round(computeRtCoefficientOfVariation(hitRTs) * 100) / 100;

  return {
    totalTrials: results.length,
    correctTrials,
    accuracy,
    avgRT,
    rtStdDev,
    rtCV,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate,
    falseAlarmRate,
    commissionErrors: falseAlarms,
    omissionErrors: misses,
    goCount: goResults.length,
    nogoCount: nogoResults.length,
  };
}
