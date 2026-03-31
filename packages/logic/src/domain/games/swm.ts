/**
 * SWM (Spatial Working Memory) — pure game logic.
 *
 * Cambridge Neuropsychological Test (CANTAB) SWM variant:
 * - Grid of N boxes; a token is hidden under one
 * - Player opens boxes to find the hidden token
 * - A box that already contained a token never holds one again
 * - Within-search errors: reopening a box already checked in this round
 * - Between-search errors: reopening a box where a token was previously found
 * - Strategy score: how systematically the player searches (lower = better)
 */

// =============================================================================
// Types
// =============================================================================

export interface SwmRoundResult {
  readonly span: number;
  readonly withinSearchErrors: number;
  readonly betweenSearchErrors: number;
  readonly totalErrors: number;
  readonly searchesUsed: number;
  readonly correct: boolean;
  readonly roundTimeMs: number;
}

export interface SwmSessionSummary {
  readonly results: readonly SwmRoundResult[];
  readonly correctRounds: number;
  readonly totalRounds: number;
  /** 0-100 */
  readonly accuracy: number;
  readonly maxSpanReached: number;
  readonly totalWithinErrors: number;
  readonly totalBetweenErrors: number;
  readonly totalErrors: number;
  readonly avgRoundTimeMs: number;
  /** Strategy score: how many 4-box groups the player started from a different box.
   *  Lower = more systematic = better. Range: 0 to totalRounds. */
  readonly strategyScore: number;
}

// =============================================================================
// Token Position Generation
// =============================================================================

/**
 * Generate a valid token position for the current round.
 * Token can only be placed in a box that has NOT already been found.
 */
export function generateTokenPosition(
  numBoxes: number,
  foundPositions: readonly number[],
  rng: () => number = Math.random,
): number {
  const available: number[] = [];
  for (let i = 0; i < numBoxes; i++) {
    if (!foundPositions.includes(i)) {
      available.push(i);
    }
  }
  if (available.length === 0) return 0;
  return available[Math.floor(rng() * available.length)] as number;
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Classify a box-opening action.
 * Returns the error type (if any) for opening `position` given the current state.
 */
export function classifyBoxOpen(
  position: number,
  openedThisRound: readonly number[],
  foundPositions: readonly number[],
): 'within' | 'between' | 'ok' {
  if (foundPositions.includes(position)) return 'between';
  if (openedThisRound.includes(position)) return 'within';
  return 'ok';
}

// =============================================================================
// Round Evaluation
// =============================================================================

/**
 * Evaluate a completed round.
 * A round is correct only if zero errors were committed.
 */
export function evaluateRound(
  span: number,
  withinErrors: number,
  betweenErrors: number,
  searchesUsed: number,
  roundTimeMs: number,
): SwmRoundResult {
  const totalErrors = withinErrors + betweenErrors;
  return {
    span,
    withinSearchErrors: withinErrors,
    betweenSearchErrors: betweenErrors,
    totalErrors,
    searchesUsed,
    correct: totalErrors === 0,
    roundTimeMs,
  };
}

// =============================================================================
// Strategy Score
// =============================================================================

/**
 * Compute the strategy score from a sequence of first-box-opened per round.
 *
 * The strategy score measures how consistently the participant begins their
 * search from the same starting position. For each consecutive pair of rounds,
 * if the first box opened differs, the score increments by 1.
 *
 * Range: 0 (perfectly systematic) to max(0, rounds - 1) (random).
 */
export function computeStrategyScore(firstBoxPerRound: readonly number[]): number {
  if (firstBoxPerRound.length <= 1) return 0;
  let score = 0;
  for (let i = 1; i < firstBoxPerRound.length; i++) {
    if (firstBoxPerRound[i] !== firstBoxPerRound[i - 1]) {
      score++;
    }
  }
  return score;
}

// =============================================================================
// Span Progression
// =============================================================================

/**
 * Determine the next span after a round result.
 * Span increases after `requiredConsecutive` correct rounds in a row.
 */
export function computeNextSpan(
  currentSpan: number,
  maxSpan: number,
  consecutiveCorrect: number,
  roundCorrect: boolean,
  requiredConsecutive: number = 2,
): number {
  if (!roundCorrect) return currentSpan;
  const newConsecutive = consecutiveCorrect + 1;
  if (newConsecutive >= requiredConsecutive) {
    return Math.min(maxSpan, currentSpan + 1);
  }
  return currentSpan;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute a full session summary from round results.
 * `firstBoxPerRound` is required for strategy score calculation.
 */
export function computeSummary(
  results: readonly SwmRoundResult[],
  firstBoxPerRound: readonly number[] = [],
): SwmSessionSummary {
  const correctRounds = results.filter((r) => r.correct).length;
  const totalRounds = results.length;
  const accuracy = totalRounds > 0 ? Math.round((correctRounds / totalRounds) * 100) : 0;

  const correctResults = results.filter((r) => r.correct);
  const maxSpanReached =
    correctResults.length > 0 ? Math.max(...correctResults.map((r) => r.span)) : 0;

  const totalWithinErrors = results.reduce((s, r) => s + r.withinSearchErrors, 0);
  const totalBetweenErrors = results.reduce((s, r) => s + r.betweenSearchErrors, 0);
  const totalErrors = totalWithinErrors + totalBetweenErrors;

  const roundTimes = results.map((r) => r.roundTimeMs).filter((t) => t > 0);
  const avgRoundTimeMs =
    roundTimes.length > 0
      ? Math.round(roundTimes.reduce((a, b) => a + b, 0) / roundTimes.length)
      : 0;

  const strategyScore = computeStrategyScore(firstBoxPerRound);

  return {
    results,
    correctRounds,
    totalRounds,
    accuracy,
    maxSpanReached,
    totalWithinErrors,
    totalBetweenErrors,
    totalErrors,
    avgRoundTimeMs,
    strategyScore,
  };
}

// =============================================================================
// Session termination check
// =============================================================================

/**
 * Determine whether the session should end.
 */
export function shouldEndSession(
  roundIndex: number,
  maxTrials: number,
  consecutiveFailures: number,
  maxConsecutiveFailures: number,
): boolean {
  if (roundIndex + 1 >= maxTrials) return true;
  if (consecutiveFailures >= maxConsecutiveFailures) return true;
  return false;
}
