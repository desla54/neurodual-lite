/**
 * CPT (Continuous Performance Test) — pure game logic extracted from the training page.
 *
 * Rosvold et al. (1956):
 * - Single letters appear one at a time (A-Z)
 * - Player must TAP ONLY when they see the letter 'X' (target, ~10%)
 * - Measures sustained attention and vigilance
 * - Signal Detection Theory metrics: d-prime, hit rate, false alarm rate
 * - RT variability over time as sustained attention index
 */

// =============================================================================
// Constants
// =============================================================================

export const TARGET_LETTER = 'X';
export const TARGET_RATIO = 0.1;
export const NON_TARGET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'.split('');
export const DEFAULT_TOTAL_TRIALS = 50;

// =============================================================================
// Types
// =============================================================================

export type CptOutcome = 'hit' | 'miss' | 'false_alarm' | 'correct_rejection';

export interface CptTrial {
  letter: string;
  isTarget: boolean;
}

export interface CptTrialResult {
  trial: CptTrial;
  responded: boolean;
  rt: number;
  outcome: CptOutcome;
}

export interface CptSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for hit trials only, in ms */
  avgRT: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** 0-100 */
  hitRate: number;
  /** 0-100 */
  falseAlarmRate: number;
  targetCount: number;
  nonTargetCount: number;
  /** Signal detection sensitivity */
  dPrime: number;
  /** Coefficient of variation for hit RTs — sustained attention index */
  rtCoefficientOfVariation: number;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate CPT trials: ~10% targets ('X'), ~90% non-targets (A-Z except X).
 * Fisher-Yates shuffled.
 */
export function generateTrials(count: number, rng: () => number = Math.random): CptTrial[] {
  const targetCount = Math.round(count * TARGET_RATIO);
  const nonTargetCount = count - targetCount;
  const trials: CptTrial[] = [];

  for (let i = 0; i < targetCount; i++) {
    trials.push({ letter: TARGET_LETTER, isTarget: true });
  }
  for (let i = 0; i < nonTargetCount; i++) {
    const letter = NON_TARGET_LETTERS[Math.floor(rng() * NON_TARGET_LETTERS.length)] as string;
    trials.push({ letter, isTarget: false });
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = trials[i];
    const swapped = trials[j];
    if (!current || !swapped) continue;
    [trials[i], trials[j]] = [swapped, current];
  }

  return trials;
}

// =============================================================================
// Outcome Classification (SDT)
// =============================================================================

/**
 * Classify trial outcome using Signal Detection Theory categories.
 *
 * |              | Responded          | No Response         |
 * |:-------------|:-------------------|:--------------------|
 * | Target (X)   | Hit                | Miss                |
 * | Non-target   | False Alarm        | Correct Rejection   |
 */
export function getOutcome(isTarget: boolean, responded: boolean): CptOutcome {
  if (isTarget) return responded ? 'hit' : 'miss';
  return responded ? 'false_alarm' : 'correct_rejection';
}

/**
 * Check if an outcome counts as "correct".
 */
export function isCorrectOutcome(outcome: CptOutcome): boolean {
  return outcome === 'hit' || outcome === 'correct_rejection';
}

// =============================================================================
// d-prime Calculation
// =============================================================================

/** Probit function (inverse normal CDF approximation). */
function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    // biome-ignore lint/style/noNonNullAssertion: fixed-size coefficient arrays — indices always valid
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    // biome-ignore lint/style/noNonNullAssertion: fixed-size coefficient arrays — indices always valid
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  // biome-ignore lint/style/noNonNullAssertion: fixed-size coefficient arrays — indices always valid
  return -(
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/**
 * Compute d-prime from hit/miss/FA/CR counts.
 * Uses log-linear correction to avoid infinite z-scores.
 */
export function computeDPrime(
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections: number,
): number {
  const totalSignal = hits + misses;
  const totalNoise = falseAlarms + correctRejections;
  if (totalSignal === 0 || totalNoise === 0) return 0;

  let hitRate = (hits + 0.5) / (totalSignal + 1);
  let faRate = (falseAlarms + 0.5) / (totalNoise + 1);

  hitRate = Math.max(0.01, Math.min(0.99, hitRate));
  faRate = Math.max(0.01, Math.min(0.99, faRate));

  return probit(hitRate) - probit(faRate);
}

// =============================================================================
// RT Variability — Sustained Attention Index
// =============================================================================

/**
 * Compute coefficient of variation (CV = stdDev / mean) for an array of RTs.
 * Higher CV indicates more variable responding = worse sustained attention.
 * Returns 0 if fewer than 2 values.
 */
export function computeRtCoefficientOfVariation(rts: number[]): number {
  if (rts.length < 2) return 0;
  const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
  if (mean === 0) return 0;
  const variance = rts.reduce((sum, rt) => sum + (rt - mean) ** 2, 0) / rts.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Split RTs into blocks and compute per-block mean RT.
 * Useful for plotting sustained attention over time.
 */
export function computeBlockMeanRTs(rts: number[], blockSize: number): number[] {
  if (blockSize <= 0 || rts.length === 0) return [];
  const blocks: number[] = [];
  for (let i = 0; i < rts.length; i += blockSize) {
    const block = rts.slice(i, i + blockSize);
    blocks.push(Math.round(block.reduce((a, b) => a + b, 0) / block.length));
  }
  return blocks;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: CptTrialResult[]): CptSummary {
  const hits = results.filter((r) => r.outcome === 'hit').length;
  const misses = results.filter((r) => r.outcome === 'miss').length;
  const falseAlarms = results.filter((r) => r.outcome === 'false_alarm').length;
  const correctRejections = results.filter((r) => r.outcome === 'correct_rejection').length;

  const correctTrials = hits + correctRejections;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const targetTrials = results.filter((r) => r.trial.isTarget);
  const nonTargetTrials = results.filter((r) => !r.trial.isTarget);

  const hitRate = targetTrials.length > 0 ? Math.round((hits / targetTrials.length) * 100) : 0;
  const falseAlarmRate =
    nonTargetTrials.length > 0 ? Math.round((falseAlarms / nonTargetTrials.length) * 100) : 0;

  const hitRTs = results.filter((r) => r.outcome === 'hit' && r.rt > 0).map((r) => r.rt);
  const avgRT =
    hitRTs.length > 0 ? Math.round(hitRTs.reduce((a, b) => a + b, 0) / hitRTs.length) : 0;

  const dPrime = computeDPrime(hits, misses, falseAlarms, correctRejections);
  const rtCoefficientOfVariation = computeRtCoefficientOfVariation(hitRTs);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate,
    falseAlarmRate,
    targetCount: targetTrials.length,
    nonTargetCount: nonTargetTrials.length,
    dPrime,
    rtCoefficientOfVariation,
  };
}
