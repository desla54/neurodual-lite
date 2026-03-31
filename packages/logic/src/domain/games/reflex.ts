/**
 * Reflex — pure game logic extracted from the training page.
 *
 * Go/No-Go task: stimuli appear at random grid positions.
 * - GREEN circle = TARGET -> tap it (go)
 * - RED circle = LURE -> do NOT tap (no-go)
 * - 70% targets, 30% lures
 * - Stimulus duration adapts based on accuracy
 */

// =============================================================================
// Constants
// =============================================================================

export const INITIAL_STIMULUS_MS = 1500;
export const MIN_STIMULUS_MS = 800;
export const TARGET_PROBABILITY = 0.7;
export const GRID_SIZE = 3;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// =============================================================================
// Types
// =============================================================================

export type StimulusType = 'target' | 'lure';
export type Outcome = 'hit' | 'miss' | 'false_alarm' | 'correct_rejection';

export interface ReflexTrial {
  stimulusType: StimulusType;
  /** Grid position index 0..8 */
  gridPosition: number;
}

export interface TrialResult {
  trial: ReflexTrial;
  responded: boolean;
  rt: number | null;
  outcome: Outcome;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate an array of trials with the correct target/lure ratio.
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrials(count: number, rng: () => number = Math.random): ReflexTrial[] {
  const targetCount = Math.round(count * TARGET_PROBABILITY);
  const lureCount = count - targetCount;
  const trials: ReflexTrial[] = [];

  for (let i = 0; i < targetCount; i++) {
    trials.push({
      stimulusType: 'target',
      gridPosition: Math.floor(rng() * TOTAL_CELLS),
    });
  }
  for (let i = 0; i < lureCount; i++) {
    trials.push({
      stimulusType: 'lure',
      gridPosition: Math.floor(rng() * TOTAL_CELLS),
    });
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

/**
 * Classify outcome using Signal Detection Theory categories.
 */
export function getOutcome(stimulusType: StimulusType, responded: boolean): Outcome {
  if (stimulusType === 'target') return responded ? 'hit' : 'miss';
  return responded ? 'false_alarm' : 'correct_rejection';
}

/**
 * Compute adaptive stimulus duration based on performance.
 * Starts at INITIAL_STIMULUS_MS, decreases toward MIN_STIMULUS_MS
 * as accuracy improves (linearly from 50% to 100%).
 */
export function getStimulusDuration(hitCount: number, totalResponded: number): number {
  if (totalResponded < 3) return INITIAL_STIMULUS_MS;
  const accuracy = hitCount / totalResponded;
  const t = Math.max(0, Math.min(1, (accuracy - 0.5) * 2));
  return Math.round(INITIAL_STIMULUS_MS - t * (INITIAL_STIMULUS_MS - MIN_STIMULUS_MS));
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

/** Probit function (inverse normal CDF approximation via Beasley-Springer-Moro). */
function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Beasley-Springer-Moro algorithm
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
 * Compute session summary from trial results.
 */
export function computeSummary(results: TrialResult[]) {
  const hits = results.filter((r) => r.outcome === 'hit').length;
  const misses = results.filter((r) => r.outcome === 'miss').length;
  const falseAlarms = results.filter((r) => r.outcome === 'false_alarm').length;
  const correctRejections = results.filter((r) => r.outcome === 'correct_rejection').length;
  const correctTrials = hits + correctRejections;
  const accuracy = results.length > 0 ? correctTrials / results.length : 0;

  const hitRTs = results
    .filter((r) => r.outcome === 'hit' && r.rt != null)
    .map((r) => r.rt as number);
  const avgRT = hitRTs.length > 0 ? hitRTs.reduce((a, b) => a + b, 0) / hitRTs.length : 0;

  const dPrime = computeDPrime(hits, misses, falseAlarms, correctRejections);

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    correctTrials,
    accuracy,
    avgRT,
    dPrime,
    totalTrials: results.length,
  };
}
