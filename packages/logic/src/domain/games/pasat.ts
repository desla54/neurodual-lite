/**
 * PASAT (Paced Auditory Serial Addition Test) — pure game logic.
 *
 * Gronwall (1977):
 * - Single digits (1-9) presented one at a time
 * - Add each number to the PREVIOUS one and respond with the sum
 * - ISI (inter-stimulus interval) decreases every N consecutive correct
 * - Session ends after all trials or consecutive failures
 */

// =============================================================================
// Types
// =============================================================================

export interface PasatTrialResult {
  previousNumber: number;
  currentNumber: number;
  correctAnswer: number;
  playerAnswer: number | null;
  correct: boolean;
  responseTimeMs: number;
  isiMs: number;
}

export interface PasatSummary {
  totalTrials: number;
  correctTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Fastest ISI achieved during the session */
  fastestIsiMs: number;
  /** Mean response time for trials with a response */
  avgResponseTimeMs: number;
  /** Longest consecutive correct streak */
  longestStreak: number;
}

export interface PasatConfig {
  defaultIsiMs: number;
  minIsiMs: number;
  isiStepMs: number;
  isiSpeedupStreak: number;
  maxConsecutiveFailures: number;
  maxTrials: number;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_CONFIG: PasatConfig = {
  defaultIsiMs: 3000,
  minIsiMs: 1500,
  isiStepMs: 250,
  isiSpeedupStreak: 3,
  maxConsecutiveFailures: 3,
  maxTrials: 60,
};

export const MIN_DIGIT = 1;
export const MAX_DIGIT = 9;

// =============================================================================
// Number Generation
// =============================================================================

/**
 * Generate a random digit between 1 and 9.
 */
export function generateNumber(rng: () => number = Math.random): number {
  return Math.floor(rng() * MAX_DIGIT) + MIN_DIGIT;
}

/**
 * Compute the correct sum for a PASAT trial.
 */
export function computeCorrectAnswer(previous: number, current: number): number {
  return previous + current;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if the player's answer is correct.
 */
export function isAnswerCorrect(previous: number, current: number, playerAnswer: number): boolean {
  return playerAnswer === previous + current;
}

// =============================================================================
// ISI Adjustment
// =============================================================================

/**
 * Compute the next ISI based on consecutive correct count.
 * Decreases ISI by `isiStepMs` every `isiSpeedupStreak` consecutive correct.
 * Clamps to `minIsiMs`.
 */
export function computeNextIsi(
  currentIsi: number,
  wasCorrect: boolean,
  consecutiveCorrect: number,
  config: PasatConfig = DEFAULT_CONFIG,
): number {
  if (!wasCorrect) return currentIsi;
  const newStreak = consecutiveCorrect + 1;
  if (newStreak % config.isiSpeedupStreak === 0) {
    return Math.max(config.minIsiMs, currentIsi - config.isiStepMs);
  }
  return currentIsi;
}

// =============================================================================
// Session Continuation
// =============================================================================

/**
 * Determine if the session should continue after a trial.
 * Returns false if:
 * - max consecutive failures reached
 * - max trials reached
 */
export function shouldContinue(
  trialIndex: number,
  consecutiveFailures: number,
  config: PasatConfig = DEFAULT_CONFIG,
): boolean {
  if (consecutiveFailures >= config.maxConsecutiveFailures) return false;
  if (trialIndex + 1 >= config.maxTrials) return false;
  return true;
}

// =============================================================================
// Streak Calculation
// =============================================================================

/**
 * Compute the longest consecutive correct streak.
 */
export function computeLongestStreak(results: readonly PasatTrialResult[]): number {
  let max = 0;
  let current = 0;
  for (const r of results) {
    current = r.correct ? current + 1 : 0;
    if (current > max) max = current;
  }
  return max;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: readonly PasatTrialResult[]): PasatSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  const fastestIsiMs = results.length > 0 ? Math.min(...results.map((r) => r.isiMs)) : 0;

  const responseTimes = results.filter((r) => r.playerAnswer !== null).map((r) => r.responseTimeMs);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  const longestStreak = computeLongestStreak(results);

  return {
    totalTrials,
    correctTrials,
    accuracy,
    fastestIsiMs,
    avgResponseTimeMs,
    longestStreak,
  };
}
