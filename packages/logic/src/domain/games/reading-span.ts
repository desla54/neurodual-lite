/**
 * Reading Span — pure game logic.
 *
 * Daneman & Carpenter (1980):
 * - Read sentences and judge true/false (processing component)
 * - Remember target words shown after each sentence (storage component)
 * - Recall all target words in correct order at end of each set
 * - Set size increases on success, session ends after consecutive failures
 */

// =============================================================================
// Types
// =============================================================================

export interface ReadingSpanSentence {
  text: string;
  correct: boolean;
}

export interface ReadingSpanSetResult {
  setIndex: number;
  span: number;
  sentenceCorrect: boolean[];
  targetWords: string[];
  recalledWords: string[];
  recallCorrect: boolean;
  responseTimeMs: number;
}

export interface ReadingSpanSummary {
  totalSets: number;
  correctSets: number;
  /** 0-100 */
  accuracy: number;
  maxSpanReached: number;
  /** Mean sentence judgment accuracy across all sets, 0-100 */
  sentenceAccuracy: number;
  /** Absolute score: sum of span sizes for perfectly recalled sets */
  absoluteScore: number;
  /** Partial credit: mean proportion of correct word positions across sets, 0-1 */
  partialCreditScore: number;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_START_SPAN = 2;
export const DEFAULT_MAX_SPAN = 7;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;
export const DEFAULT_MAX_TRIALS = 14;
export const WORD_DISPLAY_MS = 1500;

// =============================================================================
// Sentence Judgment
// =============================================================================

/**
 * Check if the player's judgment of a sentence was correct.
 */
export function isSentenceJudgmentCorrect(
  sentence: ReadingSpanSentence,
  playerJudgedTrue: boolean,
): boolean {
  return playerJudgedTrue === sentence.correct;
}

// =============================================================================
// Word Recall
// =============================================================================

/**
 * Check if recall is perfectly correct (all words in exact order).
 */
export function isRecallCorrect(target: readonly string[], recalled: readonly string[]): boolean {
  if (target.length !== recalled.length) return false;
  return target.every((word, i) => word === recalled[i]);
}

/**
 * Count the number of words recalled in the correct position.
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

/**
 * Pick `count` random items from `arr`, excluding items in `exclude`.
 * Uses Fisher-Yates on the available items.
 */
export function pickRandom<T>(
  arr: readonly T[],
  count: number,
  exclude: readonly T[] = [],
  rng: () => number = Math.random,
): T[] {
  const available = arr.filter((x) => !exclude.includes(x));
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled.slice(0, count);
}

// =============================================================================
// Span Progression
// =============================================================================

/**
 * Determine the next span after a set completes.
 * Returns null if the session should end.
 */
export function nextSpan(
  currentSpan: number,
  recallCorrect: boolean,
  consecutiveFailures: number,
  setIndex: number,
  maxSpan: number = DEFAULT_MAX_SPAN,
  maxConsecutiveFailures: number = DEFAULT_MAX_CONSECUTIVE_FAILURES,
  maxTrials: number = DEFAULT_MAX_TRIALS,
): number | null {
  const newFailures = recallCorrect ? 0 : consecutiveFailures + 1;
  if (newFailures >= maxConsecutiveFailures) return null;

  if (currentSpan >= maxSpan) return null;

  if (setIndex + 1 >= maxTrials) return null;

  return recallCorrect ? Math.min(currentSpan + 1, maxSpan) : currentSpan;
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Absolute score: sum of span sizes for perfectly recalled sets.
 */
export function computeAbsoluteScore(results: readonly ReadingSpanSetResult[]): number {
  return results.filter((r) => r.recallCorrect).reduce((sum, r) => sum + r.span, 0);
}

/**
 * Partial credit score: mean proportion of correct word positions across sets (0-1).
 */
export function computePartialCreditScore(results: readonly ReadingSpanSetResult[]): number {
  if (results.length === 0) return 0;
  let total = 0;
  for (const r of results) {
    const correct = countCorrectPositions(r.targetWords, r.recalledWords);
    total += r.span > 0 ? correct / r.span : 0;
  }
  return Math.round((total / results.length) * 100) / 100;
}

/**
 * Compute the mean sentence judgment accuracy across all sets (0-100).
 */
export function computeSentenceAccuracy(results: readonly ReadingSpanSetResult[]): number {
  const totalJudgments = results.reduce((s, r) => s + r.sentenceCorrect.length, 0);
  if (totalJudgments === 0) return 0;
  const correctJudgments = results.reduce(
    (s, r) => s + r.sentenceCorrect.filter(Boolean).length,
    0,
  );
  return Math.round((correctJudgments / totalJudgments) * 100);
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from set results.
 */
export function computeSummary(results: readonly ReadingSpanSetResult[]): ReadingSpanSummary {
  const totalSets = results.length;
  const correctSets = results.filter((r) => r.recallCorrect).length;
  const accuracy = totalSets > 0 ? Math.round((correctSets / totalSets) * 100) : 0;
  const maxSpanReached = results.reduce(
    (max, r) => (r.recallCorrect && r.span > max ? r.span : max),
    0,
  );

  return {
    totalSets,
    correctSets,
    accuracy,
    maxSpanReached,
    sentenceAccuracy: computeSentenceAccuracy(results),
    absoluteScore: computeAbsoluteScore(results),
    partialCreditScore: computePartialCreditScore(results),
  };
}
