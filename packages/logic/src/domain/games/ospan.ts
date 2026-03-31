/**
 * Operation Span (OSPAN) — pure game logic.
 *
 * Turner & Engle (1989):
 * - Verify arithmetic equations (processing component)
 * - Memorize letters shown between equations (storage component)
 * - Recall letters in correct order at end of each set
 * - OSPAN absolute + partial credit scoring
 */

// =============================================================================
// Types
// =============================================================================

export interface OspanEquation {
  /** e.g. "3 + 5" */
  equation: string;
  /** e.g. "3 + 5 = 8" or "3 + 5 = 9" */
  display: string;
  /** true if the displayed answer is correct */
  correctAnswer: boolean;
}

export interface OspanSetResult {
  span: number;
  targetLetters: string[];
  recalledLetters: string[];
  recallCorrect: boolean;
  equationAccuracy: number;
  responseTimeMs: number;
}

export interface OspanSummary {
  totalSets: number;
  correctSets: number;
  /** 0-100 */
  accuracy: number;
  maxSpanReached: number;
  /** OSPAN absolute score: sum of set sizes for perfectly recalled sets */
  absoluteScore: number;
  /** OSPAN partial credit: sum of (correct items / set size) across all sets */
  partialCreditScore: number;
  /** Mean processing (equation) accuracy across all sets, 0-100 */
  processingAccuracy: number;
}

// =============================================================================
// Constants
// =============================================================================

export const LETTER_POOL = ['F', 'H', 'J', 'K', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'Y'] as const;

export const DEFAULT_START_SPAN = 3;
export const DEFAULT_MAX_SPAN = 7;
/** Processing accuracy threshold — below 85%, data is considered invalid (Unsworth et al. 2005) */
export const PROCESSING_ACCURACY_THRESHOLD = 85;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;

// =============================================================================
// Equation Generation
// =============================================================================

/**
 * Generate a math equation for the processing component.
 * Operands are [1..10], operators are + or -.
 * 50% chance of showing the wrong answer (off by 1).
 */
export function generateEquation(rng: () => number = Math.random): OspanEquation {
  const a = Math.floor(rng() * 10) + 1;
  const b = Math.floor(rng() * 10) + 1;
  const isAdd = rng() < 0.5;
  const op = isAdd ? '+' : '-';
  const correctResult = isAdd ? a + b : a - b;
  const showWrong = rng() < 0.5;
  const displayedResult = showWrong ? correctResult + (rng() < 0.5 ? 1 : -1) : correctResult;
  return {
    equation: `${a} ${op} ${b}`,
    display: `${a} ${op} ${b} = ${displayedResult}`,
    correctAnswer: !showWrong,
  };
}

/**
 * Check if the player's equation verification is correct.
 */
export function isEquationAnswerCorrect(equation: OspanEquation, playerAnswer: boolean): boolean {
  return playerAnswer === equation.correctAnswer;
}

// =============================================================================
// Letter Selection
// =============================================================================

/**
 * Select `span` unique letters from the pool using Fisher-Yates.
 */
export function selectLetters(
  span: number,
  pool: readonly string[] = LETTER_POOL,
  rng: () => number = Math.random,
): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
  }
  return shuffled.slice(0, span);
}

// =============================================================================
// Recall Scoring
// =============================================================================

/**
 * Check if recall is perfectly correct (all letters in exact order).
 */
export function isRecallCorrect(target: readonly string[], recalled: readonly string[]): boolean {
  if (target.length !== recalled.length) return false;
  return target.every((letter, i) => letter === recalled[i]);
}

/**
 * Count the number of letters recalled in the correct position.
 */
export function countCorrectPositions(
  target: readonly string[],
  recalled: readonly string[],
): number {
  let count = 0;
  for (let i = 0; i < Math.min(target.length, recalled.length); i++) {
    if (target[i] === recalled[i]) count++;
  }
  return count;
}

// =============================================================================
// OSPAN Scoring (Conway et al., 2005)
// =============================================================================

/**
 * OSPAN absolute score: sum of set sizes where recall was perfect.
 * Only sets with 100% correct recall contribute.
 */
export function computeAbsoluteScore(results: readonly OspanSetResult[]): number {
  return results.filter((r) => r.recallCorrect).reduce((sum, r) => sum + r.span, 0);
}

/**
 * OSPAN partial credit score (Unsworth et al. 2005):
 * Sum of items recalled in correct position across ALL sets.
 * This is a raw count, not a ratio.
 */
export function computePartialCreditScore(results: readonly OspanSetResult[]): number {
  let total = 0;
  for (const r of results) {
    total += countCorrectPositions(r.targetLetters, r.recalledLetters);
  }
  return total;
}

// =============================================================================
// Span Progression
// =============================================================================

/**
 * Determine the next span based on recall result and current state.
 * Returns null if the session should end.
 */
export function nextSpan(
  currentSpan: number,
  recallCorrect: boolean,
  consecutiveFailures: number,
  maxSpan: number = DEFAULT_MAX_SPAN,
  maxConsecutiveFailures: number = DEFAULT_MAX_CONSECUTIVE_FAILURES,
): number | null {
  const newFailures = recallCorrect ? 0 : consecutiveFailures + 1;
  if (newFailures >= maxConsecutiveFailures) return null;

  const next = recallCorrect ? currentSpan + 1 : currentSpan;
  if (next > maxSpan) return null;

  return next;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from set results.
 */
export function computeSummary(results: readonly OspanSetResult[]): OspanSummary {
  const totalSets = results.length;
  const correctSets = results.filter((r) => r.recallCorrect).length;
  const accuracy = totalSets > 0 ? Math.round((correctSets / totalSets) * 100) : 0;
  const maxSpanReached = results.reduce(
    (max, r) => (r.recallCorrect && r.span > max ? r.span : max),
    0,
  );

  const absoluteScore = computeAbsoluteScore(results);
  const partialCreditScore = computePartialCreditScore(results);

  const totalEquations = results.reduce((sum, r) => sum + (r.equationAccuracy >= 0 ? 1 : 0), 0);
  const processingAccuracy =
    totalEquations > 0
      ? Math.round(results.reduce((sum, r) => sum + r.equationAccuracy, 0) / totalEquations)
      : 0;

  return {
    totalSets,
    correctSets,
    accuracy,
    maxSpanReached,
    absoluteScore,
    partialCreditScore,
    processingAccuracy,
  };
}
