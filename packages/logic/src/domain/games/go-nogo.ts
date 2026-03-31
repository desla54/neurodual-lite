/**
 * Go/No-Go Task — pure game logic extracted from the training page.
 *
 * Classic motor inhibition task:
 * - Green circle = GO (tap)
 * - Red circle = NO-GO (withhold response)
 * - 75% go / 25% no-go creates prepotent response tendency
 * - Measures: hits, misses, false alarms, correct rejections
 * - d-prime quantifies discriminability
 */

// =============================================================================
// Constants
// =============================================================================

export const GO_PROBABILITY = 0.75;
const GO_LEADIN_TRIALS = 4;
const MAX_NOGO_STREAK = 2;

// =============================================================================
// Types
// =============================================================================

export type TrialType = 'go' | 'nogo';
export type Outcome = 'hit' | 'miss' | 'false_alarm' | 'correct_rejection';

export interface GoNoGoTrial {
  trialType: TrialType;
}

export interface GoNoGoTrialResult {
  trial: GoNoGoTrial;
  responded: boolean;
  rt: number | null;
  outcome: Outcome;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate an array of trials with 75% go / 25% no-go ratio.
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrials(count: number, rng: () => number = Math.random): GoNoGoTrial[] {
  if (count <= 0) return [];

  const goCount = Math.round(count * GO_PROBABILITY);
  const nogoCount = count - goCount;
  const leadinGo = Math.min(GO_LEADIN_TRIALS, count, goCount);
  let remainingGo = goCount - leadinGo;
  let remainingNogo = nogoCount;
  let nogoStreak = 0;

  const sequence: TrialType[] = [];
  for (let i = 0; i < leadinGo; i++) {
    sequence.push('go');
  }

  for (let i = leadinGo; i < count; i++) {
    const slotsLeft = count - i;
    const mustUseNogo = remainingNogo > 0 && remainingGo === 0;
    const canUseNogo = remainingNogo > 0 && nogoStreak < MAX_NOGO_STREAK;
    const baseNogoProbability = slotsLeft > 0 ? remainingNogo / slotsLeft : 0;
    const chooseNogo = mustUseNogo || (canUseNogo && rng() < baseNogoProbability);

    if (chooseNogo && remainingNogo > 0) {
      sequence.push('nogo');
      remainingNogo -= 1;
      nogoStreak += 1;
      continue;
    }

    sequence.push('go');
    if (remainingGo > 0) {
      remainingGo -= 1;
    }
    nogoStreak = 0;
  }

  return sequence.map((trialType) => ({ trialType }));
}

// =============================================================================
// Outcome Classification (SDT)
// =============================================================================

/**
 * Classify trial outcome using Signal Detection Theory categories.
 *
 * |              | Responded | No Response      |
 * |:-------------|:----------|:-----------------|
 * | Go trial     | Hit       | Miss             |
 * | No-Go trial  | False Alarm | Correct Rejection |
 */
export function getOutcome(trialType: TrialType, responded: boolean): Outcome {
  if (trialType === 'go') return responded ? 'hit' : 'miss';
  return responded ? 'false_alarm' : 'correct_rejection';
}

/**
 * Check if an outcome counts as "correct".
 */
export function isCorrectOutcome(outcome: Outcome): boolean {
  return outcome === 'hit' || outcome === 'correct_rejection';
}

// =============================================================================
// d-prime Calculation
// =============================================================================

/** Probit function (inverse normal CDF approximation via Beasley-Springer-Moro). */
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
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/**
 * Compute d-prime from hit rate and false alarm rate.
 * Uses probit (z-transform) approximation.
 * Applies log-linear correction when rates are 0 or 1.
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

  // Log-linear correction to avoid infinite z-scores
  let hitRate = (hits + 0.5) / (totalSignal + 1);
  let faRate = (falseAlarms + 0.5) / (totalNoise + 1);

  // Clamp
  hitRate = Math.max(0.01, Math.min(0.99, hitRate));
  faRate = Math.max(0.01, Math.min(0.99, faRate));

  return probit(hitRate) - probit(faRate);
}

// =============================================================================
// Summary
// =============================================================================

export interface GoNoGoSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT across hit trials only, in ms */
  avgRT: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** 0-100 */
  hitRate: number;
  /** 0-100 */
  falseAlarmRate: number;
  goCount: number;
  nogoCount: number;
  /** Signal detection sensitivity */
  dPrime: number;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: GoNoGoTrialResult[]): GoNoGoSummary {
  const hits = results.filter((r) => r.outcome === 'hit').length;
  const misses = results.filter((r) => r.outcome === 'miss').length;
  const falseAlarms = results.filter((r) => r.outcome === 'false_alarm').length;
  const correctRejections = results.filter((r) => r.outcome === 'correct_rejection').length;
  const correctTrials = hits + correctRejections;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const goTrials = results.filter((r) => r.trial.trialType === 'go');
  const nogoTrials = results.filter((r) => r.trial.trialType === 'nogo');
  const hitRate = goTrials.length > 0 ? Math.round((hits / goTrials.length) * 100) : 0;
  const falseAlarmRate =
    nogoTrials.length > 0 ? Math.round((falseAlarms / nogoTrials.length) * 100) : 0;

  const hitRTs = results
    .filter((r) => r.outcome === 'hit' && r.rt != null)
    .map((r) => r.rt as number);
  const avgRT =
    hitRTs.length > 0 ? Math.round(hitRTs.reduce((a, b) => a + b, 0) / hitRTs.length) : 0;

  const dPrime = computeDPrime(hits, misses, falseAlarms, correctRejections);

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
    goCount: goTrials.length,
    nogoCount: nogoTrials.length,
    dPrime,
  };
}
