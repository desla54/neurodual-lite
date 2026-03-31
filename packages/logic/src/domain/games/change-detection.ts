/**
 * Change Detection — pure game logic.
 *
 * Luck & Vogel (1997):
 * - Memory array of colored squares displayed briefly
 * - After a blank interval, test array appears
 * - On change trials, one square changes color
 * - Player reports "same" or "different"
 * - Capacity measured via Cowan's K formula:
 *   K = set_size * (hit_rate - false_alarm_rate)
 */

// =============================================================================
// Types
// =============================================================================

export interface ColorSquare {
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export interface ChangeDetectionTrial {
  readonly setSize: number;
  readonly changed: boolean;
  readonly display1: readonly ColorSquare[];
  readonly display2: readonly ColorSquare[];
  readonly changedIndex: number | null;
}

export interface ChangeDetectionTrialResult {
  readonly trial: ChangeDetectionTrial;
  readonly answer: 'same' | 'different' | null;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly responded: boolean;
}

export interface KCapacityBySetSize {
  readonly [setSize: string]: number;
}

export interface ChangeDetectionSummary {
  readonly totalTrials: number;
  readonly correctTrials: number;
  /** 0-100 */
  readonly accuracy: number;
  /** Mean RT across responded trials */
  readonly meanRtMs: number;
  /** Cowan's K for each set size */
  readonly kBySetSize: KCapacityBySetSize;
  /** Overall K (average across set sizes) */
  readonly overallK: number;
  /** Hit rate (correct "different" responses / total change trials) */
  readonly hitRate: number;
  /** False alarm rate (incorrect "different" responses / total same trials) */
  readonly falseAlarmRate: number;
  /** d-prime: z(hitRate) - z(falseAlarmRate) */
  readonly dPrime: number;
  readonly timeouts: number;
}

// =============================================================================
// Constants
// =============================================================================

export const AVAILABLE_COLORS: readonly string[] = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
];

export const DEFAULT_SET_SIZES: readonly number[] = [4, 6, 8];

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Pick `count` unique colors from the available palette.
 */
export function pickColors(count: number, rng: () => number = Math.random): string[] {
  const shuffled = [...AVAILABLE_COLORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
  }
  return shuffled.slice(0, count);
}

/**
 * Generate grid positions for `count` squares on a 4x3 grid.
 */
export function generateGridPositions(
  count: number,
  rng: () => number = Math.random,
): [number, number][] {
  const all: [number, number][] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      all.push([c, r]);
    }
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j] as [number, number], all[i] as [number, number]];
  }
  return all.slice(0, count);
}

/**
 * Generate a single trial with the given parameters.
 */
export function generateTrial(
  setSize: number,
  changed: boolean,
  rng: () => number = Math.random,
): ChangeDetectionTrial {
  const colors = pickColors(setSize, rng);
  const positions = generateGridPositions(setSize, rng);

  const display1: ColorSquare[] = positions.map(([x, y], idx) => ({
    x,
    y,
    color: colors[idx] as string,
  }));

  let display2: ColorSquare[];
  let changedIndex: number | null = null;

  if (changed) {
    changedIndex = Math.floor(rng() * setSize);
    display2 = display1.map((sq, idx) => {
      if (idx === changedIndex) {
        const otherColors = AVAILABLE_COLORS.filter((c) => c !== sq.color);
        return {
          ...sq,
          color: otherColors[Math.floor(rng() * otherColors.length)] as string,
        };
      }
      return { ...sq };
    });
  } else {
    display2 = display1.map((sq) => ({ ...sq }));
  }

  return { setSize, changed, display1, display2, changedIndex };
}

/**
 * Generate a balanced set of trials across set sizes and change/same conditions.
 */
export function generateTrials(
  count: number,
  setSizes: readonly number[] = DEFAULT_SET_SIZES,
  rng: () => number = Math.random,
): ChangeDetectionTrial[] {
  const trials: ChangeDetectionTrial[] = [];
  for (let i = 0; i < count; i++) {
    const setSize = setSizes[i % setSizes.length] as number;
    const changed = i % 2 === 0; // alternate same/different
    trials.push(generateTrial(setSize, changed, rng));
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trials[i], trials[j]] = [trials[j] as ChangeDetectionTrial, trials[i] as ChangeDetectionTrial];
  }
  return trials;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if a response is correct.
 * "different" is correct when the trial changed, "same" when it didn't.
 */
export function isCorrectResponse(
  trial: ChangeDetectionTrial,
  answer: 'same' | 'different',
): boolean {
  return (answer === 'different') === trial.changed;
}

// =============================================================================
// Cowan's K Computation
// =============================================================================

/**
 * Compute Cowan's K for a specific set size.
 * K = set_size * (hit_rate - false_alarm_rate), clamped to [0, set_size].
 *
 * hit_rate = proportion of change trials correctly identified as "different"
 * false_alarm_rate = proportion of same trials incorrectly identified as "different"
 */
export function computeK(setSize: number, hitRate: number, falseAlarmRate: number): number {
  const k = setSize * (hitRate - falseAlarmRate);
  return Math.round(Math.max(0, Math.min(setSize, k)) * 10) / 10;
}

/**
 * Compute hit rate and false alarm rate from trial results for a given set size.
 */
export function computeRatesForSetSize(
  results: readonly ChangeDetectionTrialResult[],
  setSize: number,
): { hitRate: number; falseAlarmRate: number } {
  const trialsForSize = results.filter((r) => r.trial.setSize === setSize);
  const changeTrials = trialsForSize.filter((r) => r.trial.changed);
  const sameTrials = trialsForSize.filter((r) => !r.trial.changed);

  const hitRate =
    changeTrials.length > 0
      ? changeTrials.filter((r) => r.correct).length / changeTrials.length
      : 0;

  const falseAlarmRate =
    sameTrials.length > 0 ? sameTrials.filter((r) => !r.correct).length / sameTrials.length : 0;

  return { hitRate, falseAlarmRate };
}

/**
 * Compute Cowan's K for each set size present in the results.
 */
export function computeKBySetSize(
  results: readonly ChangeDetectionTrialResult[],
  setSizes: readonly number[] = DEFAULT_SET_SIZES,
): KCapacityBySetSize {
  const metrics: Record<string, number> = {};
  for (const setSize of setSizes) {
    const { hitRate, falseAlarmRate } = computeRatesForSetSize(results, setSize);
    metrics[String(setSize)] = computeK(setSize, hitRate, falseAlarmRate);
  }
  return metrics;
}

// =============================================================================
// d-prime (signal detection)
// =============================================================================

/**
 * Compute the inverse of the standard normal CDF (probit / z-score).
 * Uses the rational approximation by Abramowitz and Stegun.
 */
function zScore(p: number): number {
  // Clamp to avoid infinity
  const clamped = Math.max(0.001, Math.min(0.999, p));
  const sign = clamped < 0.5 ? -1 : 1;
  const q = sign === -1 ? clamped : 1 - clamped;
  const t = Math.sqrt(-2 * Math.log(q));
  // Rational approximation constants
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return sign * z;
}

/**
 * Compute d-prime from hit rate and false alarm rate.
 * d' = z(hitRate) - z(falseAlarmRate)
 */
export function computeDPrime(hitRate: number, falseAlarmRate: number): number {
  return Math.round((zScore(hitRate) - zScore(falseAlarmRate)) * 100) / 100;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute full session summary from trial results.
 */
export function computeSummary(
  results: readonly ChangeDetectionTrialResult[],
  setSizes: readonly number[] = DEFAULT_SET_SIZES,
): ChangeDetectionSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;

  const respondedResults = results.filter((r) => r.responded);
  const meanRtMs =
    respondedResults.length > 0
      ? Math.round(
          respondedResults.reduce((s, r) => s + r.responseTimeMs, 0) / respondedResults.length,
        )
      : 0;

  const kBySetSize = computeKBySetSize(results, setSizes);

  const kValues = Object.values(kBySetSize);
  const overallK =
    kValues.length > 0
      ? Math.round((kValues.reduce((a, b) => a + b, 0) / kValues.length) * 10) / 10
      : 0;

  // Overall hit rate and false alarm rate
  const changeTrials = results.filter((r) => r.trial.changed);
  const sameTrials = results.filter((r) => !r.trial.changed);
  const hitRate =
    changeTrials.length > 0
      ? changeTrials.filter((r) => r.correct).length / changeTrials.length
      : 0;
  const falseAlarmRate =
    sameTrials.length > 0 ? sameTrials.filter((r) => !r.correct).length / sameTrials.length : 0;

  const dPrime = computeDPrime(hitRate, falseAlarmRate);

  return {
    totalTrials,
    correctTrials,
    accuracy,
    meanRtMs,
    kBySetSize,
    overallK,
    hitRate,
    falseAlarmRate,
    dPrime,
    timeouts: results.filter((r) => !r.responded).length,
  };
}
