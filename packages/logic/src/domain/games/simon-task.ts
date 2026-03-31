/**
 * Simon Task — pure game logic extracted from the training page.
 *
 * Simon & Rudell (1967):
 * - A colored circle (red or blue) appears on LEFT or RIGHT side
 * - Player responds by COLOR, ignoring position
 * - Congruent: color-side mapping matches (red-left, blue-right)
 * - Incongruent: color-side mapping conflicts (red-right, blue-left)
 * - Measures spatial conflict resolution / inhibition
 */

// =============================================================================
// Types
// =============================================================================

export type SimonColor = 'red' | 'blue';
export type Side = 'left' | 'right';

export interface SimonTrial {
  stimulusColor: SimonColor;
  stimulusSide: Side;
  congruent: boolean;
}

export interface SimonTrialResult {
  trial: SimonTrial;
  response: SimonColor | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

// =============================================================================
// Congruency Classification
// =============================================================================

/**
 * Determine if a color-side pair is congruent.
 * Congruent mapping: red = left, blue = right.
 */
export function isCongruent(color: SimonColor, side: Side): boolean {
  return (color === 'red' && side === 'left') || (color === 'blue' && side === 'right');
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * The 4 conditions equally distributed:
 * red-left (congruent), blue-right (congruent),
 * red-right (incongruent), blue-left (incongruent)
 */
export const CONDITIONS: readonly { color: SimonColor; side: Side }[] = [
  { color: 'red', side: 'left' },
  { color: 'blue', side: 'right' },
  { color: 'red', side: 'right' },
  { color: 'blue', side: 'left' },
] as const;

/**
 * Generate an array of trials with balanced conditions (25% each).
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrials(count: number, rng: () => number = Math.random): SimonTrial[] {
  const trials: SimonTrial[] = [];

  for (let i = 0; i < count; i++) {
    const cond = CONDITIONS[i % 4]!;
    trials.push({
      stimulusColor: cond.color,
      stimulusSide: cond.side,
      congruent: isCongruent(cond.color, cond.side),
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
 * Check if a response is correct. The correct answer is the STIMULUS COLOR
 * (not the position).
 */
export function isResponseCorrect(trial: SimonTrial, response: SimonColor): boolean {
  return response === trial.stimulusColor;
}

// =============================================================================
// Simon Effect
// =============================================================================

/** Compute mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the Simon effect: mean RT(incongruent correct) - mean RT(congruent correct).
 * Only considers non-timed-out, correct trials.
 */
export function computeSimonEffect(results: SimonTrialResult[]): number {
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

export interface SimonSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT across all non-timed-out trials, in ms */
  avgRT: number;
  /** Simon effect in ms (incongruent - congruent RT) */
  simonEffect: number;
  congruentCorrect: number;
  congruentTotal: number;
  incongruentCorrect: number;
  incongruentTotal: number;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: SimonTrialResult[]): SimonSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const rtsAll = results.filter((r) => !r.timedOut).map((r) => r.rt);
  const avgRT =
    rtsAll.length > 0 ? Math.round(rtsAll.reduce((a, b) => a + b, 0) / rtsAll.length) : 0;

  const simonEffect = Math.round(computeSimonEffect(results));

  const congruentTrials = results.filter((r) => r.trial.congruent);
  const incongruentTrials = results.filter((r) => !r.trial.congruent);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    simonEffect,
    congruentCorrect: congruentTrials.filter((r) => r.correct).length,
    congruentTotal: congruentTrials.length,
    incongruentCorrect: incongruentTrials.filter((r) => r.correct).length,
    incongruentTotal: incongruentTrials.length,
  };
}
