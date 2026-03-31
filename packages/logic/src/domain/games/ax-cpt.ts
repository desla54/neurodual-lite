/**
 * AX-CPT (AX Continuous Performance Task) — pure game logic extracted from the training page.
 *
 * Braver et al. (2001):
 * - Context-dependent response task (cue-probe)
 * - Cue: Letter A (target context) or B (non-target, random letter except A/X)
 * - Probe: Letter X (target probe) or Y (non-target, random letter except A/X)
 * - AX = target (~70%), AY (~10%), BX (~10%), BY (~10%)
 * - Respond "target" for AX only, "nontarget" for all others
 *
 * Key metrics:
 * - d'-context = z(AX hit rate) - z(BX false alarm rate)
 * - PBI (Proactive Behavioral Index) = (AY errors - BX errors) / (AY errors + BX errors)
 */

// =============================================================================
// Types
// =============================================================================

export type TrialType = 'AX' | 'AY' | 'BX' | 'BY';

export interface AxCptTrial {
  type: TrialType;
  cueLetter: string;
  probeLetter: string;
  isTarget: boolean; // Only AX is target
}

export interface AxCptTrialResult {
  trial: AxCptTrial;
  correct: boolean;
  responseTimeMs: number;
  responded: boolean;
  answer: 'target' | 'nontarget' | null;
}

export interface AxCptMetrics {
  axAccuracy: number;
  ayErrorRate: number;
  bxFalseAlarmRate: number;
  byAccuracy: number;
  dPrimeContext: number;
}

export interface AxCptSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  meanRt: number;
  metrics: AxCptMetrics;
}

// =============================================================================
// Constants
// =============================================================================

export const B_LETTERS = [
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'K',
  'L',
  'M',
  'N',
  'P',
  'R',
  'S',
  'T',
] as const;

export const Y_LETTERS = ['Y', 'Z', 'W', 'V', 'U', 'Q', 'J', 'I', 'O'] as const;

export const RESPONSE_TIMEOUT_MS = 1300;

// =============================================================================
// Trial Generation
// =============================================================================

function randomPick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/**
 * Generate AX-CPT trials with the canonical 70/10/10/10 distribution.
 * Trials are shuffled.
 */
export function generateTrials(count: number, rng: () => number = Math.random): AxCptTrial[] {
  const trials: AxCptTrial[] = [];

  const axCount = Math.round(count * 0.7);
  const ayCount = Math.round(count * 0.1);
  const bxCount = Math.round(count * 0.1);
  const byCount = count - axCount - ayCount - bxCount;

  for (let i = 0; i < axCount; i++) {
    trials.push({ type: 'AX', cueLetter: 'A', probeLetter: 'X', isTarget: true });
  }
  for (let i = 0; i < ayCount; i++) {
    trials.push({
      type: 'AY',
      cueLetter: 'A',
      probeLetter: randomPick(Y_LETTERS, rng),
      isTarget: false,
    });
  }
  for (let i = 0; i < bxCount; i++) {
    trials.push({
      type: 'BX',
      cueLetter: randomPick(B_LETTERS, rng),
      probeLetter: 'X',
      isTarget: false,
    });
  }
  for (let i = 0; i < byCount; i++) {
    trials.push({
      type: 'BY',
      cueLetter: randomPick(B_LETTERS, rng),
      probeLetter: randomPick(Y_LETTERS, rng),
      isTarget: false,
    });
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trials[i], trials[j]] = [trials[j] as AxCptTrial, trials[i] as AxCptTrial];
  }

  return trials;
}

// =============================================================================
// Response Evaluation
// =============================================================================

/**
 * Evaluate a response to an AX-CPT trial.
 * - AX trials: "target" is correct
 * - All others: "nontarget" is correct
 * - No response (null): correct only if non-target (inhibition success)
 */
export function evaluateResponse(
  trial: AxCptTrial,
  answer: 'target' | 'nontarget' | null,
  rt: number,
): AxCptTrialResult {
  const responded = answer !== null;

  let correct: boolean;
  if (!responded) {
    // No response: correct for non-targets (withholding), incorrect for targets (miss)
    correct = !trial.isTarget;
  } else {
    correct = (answer === 'target') === trial.isTarget;
  }

  return {
    trial,
    correct,
    responseTimeMs: responded ? rt : RESPONSE_TIMEOUT_MS,
    responded,
    answer,
  };
}

// =============================================================================
// z-Score (Beasley-Springer-Moro approximation of inverse normal CDF)
// =============================================================================

/**
 * Approximate inverse normal CDF (probit function) using Peter Acklam's
 * rational approximation. Used for d-prime calculations.
 *
 * Note: the original training page contained a bug (1-based array indexing
 * with leading zeros) that produced incorrect z-scores. This version uses
 * the standard scalar form with correct coefficient ordering.
 */
export function zScore(p: number): number {
  // Coefficients for rational approximation
  const a1 = -3.969683028665376e1,
    a2 = 2.209460984245205e2,
    a3 = -2.759285104469687e2,
    a4 = 1.38357751867269e2,
    a5 = -3.066479806614716e1,
    a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1,
    b2 = 1.615858368580409e2,
    b3 = -1.556989798598866e2,
    b4 = 6.680131188771972e1,
    b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3,
    c2 = -3.223964580411365e-1,
    c3 = -2.400758277161838,
    c4 = -2.549732539343734,
    c5 = 4.374664141464968,
    c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3,
    d2 = 3.224671290700398e-1,
    d3 = 2.445134137142996,
    d4 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
    ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
  );
}

// =============================================================================
// Metrics
// =============================================================================

/**
 * Clamp a value to [0.01, 0.99] to avoid infinite z-scores.
 */
export function clampRate(v: number): number {
  return Math.min(0.99, Math.max(0.01, v));
}

/**
 * Compute AX-CPT cognitive control metrics from trial results.
 *
 * - axAccuracy: % correct on AX trials (hit rate)
 * - ayErrorRate: % errors on AY trials (context-inappropriate responding)
 * - bxFalseAlarmRate: % errors on BX trials (probe-driven false alarms)
 * - byAccuracy: % correct on BY trials (correct rejections)
 * - dPrimeContext: z(AX hit rate) - z(BX false alarm rate)
 */
export function computeMetrics(results: AxCptTrialResult[]): AxCptMetrics {
  const byType = (type: TrialType) => results.filter((r) => r.trial.type === type);

  const axTrials = byType('AX');
  const ayTrials = byType('AY');
  const bxTrials = byType('BX');
  const byTrials = byType('BY');

  const rate = (correct: number, total: number) =>
    total > 0 ? Math.round((correct / total) * 100) : 0;

  const axAccuracy = rate(axTrials.filter((r) => r.correct).length, axTrials.length);
  const ayErrorRate = rate(ayTrials.filter((r) => !r.correct).length, ayTrials.length);
  const bxFalseAlarmRate = rate(bxTrials.filter((r) => !r.correct).length, bxTrials.length);
  const byAccuracy = rate(byTrials.filter((r) => r.correct).length, byTrials.length);

  // d'-context
  const hitRate =
    axTrials.length > 0 ? axTrials.filter((r) => r.correct).length / axTrials.length : 0.5;
  const faRate =
    bxTrials.length > 0 ? bxTrials.filter((r) => !r.correct).length / bxTrials.length : 0.5;

  const dPrimeContext = zScore(clampRate(hitRate)) - zScore(clampRate(faRate));

  return {
    axAccuracy,
    ayErrorRate,
    bxFalseAlarmRate,
    byAccuracy,
    dPrimeContext: Math.round(dPrimeContext * 100) / 100,
  };
}

/**
 * Compute PBI (Proactive Behavioral Index).
 * PBI = (AY errors - BX errors) / (AY errors + BX errors)
 * Range: -1 (purely reactive) to +1 (purely proactive)
 * Returns null if both error counts are 0.
 */
export function computePBI(results: AxCptTrialResult[]): number | null {
  const ayErrors = results.filter((r) => r.trial.type === 'AY' && !r.correct).length;
  const bxErrors = results.filter((r) => r.trial.type === 'BX' && !r.correct).length;

  if (ayErrors + bxErrors === 0) return null;
  return Math.round(((ayErrors - bxErrors) / (ayErrors + bxErrors)) * 100) / 100;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute full session summary.
 */
export function computeSummary(results: AxCptTrialResult[]): AxCptSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;
  const respondedResults = results.filter((r) => r.responded);
  const meanRt =
    respondedResults.length > 0
      ? Math.round(
          respondedResults.reduce((s, r) => s + r.responseTimeMs, 0) / respondedResults.length,
        )
      : 0;

  return {
    totalTrials: results.length,
    correctTrials,
    accuracy,
    meanRt,
    metrics: computeMetrics(results),
  };
}
