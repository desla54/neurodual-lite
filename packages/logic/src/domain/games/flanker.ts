/**
 * Flanker Task — pure game logic extracted from the training page.
 *
 * Eriksen Flanker Task (Eriksen & Eriksen, 1974):
 * - 5 arrows in a row; central arrow is the target
 * - Congruent (>>>>>) or incongruent (>><>>)
 * - Player indicates CENTRAL arrow direction (left or right)
 * - Measures attentional inhibition / conflict monitoring
 */

// =============================================================================
// Types
// =============================================================================

export type Direction = 'left' | 'right';

export interface FlankerTrial {
  targetDirection: Direction;
  flankerDirection: Direction;
  congruent: boolean;
  /** Array of 5 directions: [flanker, flanker, target, flanker, flanker] */
  display: Direction[];
}

export interface FlankerTrialResult {
  trial: FlankerTrial;
  response: Direction | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * The 4 possible conditions in equal proportion:
 * congruent-left, congruent-right, incongruent-left, incongruent-right
 */
export const CONDITIONS: readonly { target: Direction; flanker: Direction }[] = [
  { target: 'left', flanker: 'left' },
  { target: 'right', flanker: 'right' },
  { target: 'left', flanker: 'right' },
  { target: 'right', flanker: 'left' },
] as const;

/**
 * Build the 5-arrow display array from target and flanker directions.
 * Layout: [flanker, flanker, TARGET, flanker, flanker]
 */
export function buildDisplay(targetDirection: Direction, flankerDirection: Direction): Direction[] {
  return [flankerDirection, flankerDirection, targetDirection, flankerDirection, flankerDirection];
}

/**
 * Generate an array of trials with balanced conditions (25% each).
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrials(count: number, rng: () => number = Math.random): FlankerTrial[] {
  const trials: FlankerTrial[] = [];

  for (let i = 0; i < count; i++) {
    const cond = CONDITIONS[i % 4]!;
    trials.push({
      targetDirection: cond.target,
      flankerDirection: cond.flanker,
      congruent: cond.target === cond.flanker,
      display: buildDisplay(cond.target, cond.flanker),
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

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if a response is correct. The correct answer is always the
 * direction of the CENTER arrow (index 2).
 */
export function isResponseCorrect(trial: FlankerTrial, response: Direction): boolean {
  return response === trial.targetDirection;
}

// =============================================================================
// Congruency Effect
// =============================================================================

/** Compute mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the congruency effect: mean RT(incongruent correct) - mean RT(congruent correct).
 * Only considers non-timed-out, correct trials.
 */
export function computeCongruencyEffect(results: FlankerTrialResult[]): number {
  const congruentRTs = results
    .filter((r) => r.trial.congruent && !r.timedOut && r.correct)
    .map((r) => r.rt);
  const incongruentRTs = results
    .filter((r) => !r.trial.congruent && !r.timedOut && r.correct)
    .map((r) => r.rt);
  return mean(incongruentRTs) - mean(congruentRTs);
}

// =============================================================================
// Summary
// =============================================================================

export interface FlankerSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT across all non-timed-out trials, in ms */
  avgRT: number;
  /** Congruency effect in ms (incongruent - congruent RT) */
  congruencyEffect: number;
  congruentCorrect: number;
  congruentTotal: number;
  incongruentCorrect: number;
  incongruentTotal: number;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: FlankerTrialResult[]): FlankerSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const rtsAll = results.filter((r) => !r.timedOut).map((r) => r.rt);
  const avgRT =
    rtsAll.length > 0 ? Math.round(rtsAll.reduce((a, b) => a + b, 0) / rtsAll.length) : 0;

  const congruencyEffect = Math.round(computeCongruencyEffect(results));

  const congruentTrials = results.filter((r) => r.trial.congruent);
  const incongruentTrials = results.filter((r) => !r.trial.congruent);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    congruencyEffect,
    congruentCorrect: congruentTrials.filter((r) => r.correct).length,
    congruentTotal: congruentTrials.length,
    incongruentCorrect: incongruentTrials.filter((r) => r.correct).length,
    incongruentTotal: incongruentTrials.length,
  };
}
