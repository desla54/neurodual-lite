/**
 * Task Switching — pure game logic.
 *
 * Rogers & Monsell (1995):
 * - Alternate between two classification rules using AABB pattern
 * - Task A: odd/even classification (left = even, right = odd)
 * - Task B: high/low classification (left = low, right = high)
 * - Switch trials: task changes from previous trial
 * - Repeat trials: same task as previous trial
 * - Switch cost = mean RT(switch) - mean RT(repeat)
 * - Mixing cost = mean RT(mixed block) - mean RT(pure block)
 */

// =============================================================================
// Types
// =============================================================================

export type TaskType = 'odd-even' | 'high-low';

export interface TaskSwitchingTrial {
  readonly trialIndex: number;
  readonly digit: number;
  readonly task: TaskType;
  readonly isSwitch: boolean;
}

export interface TaskSwitchingTrialResult {
  readonly trial: TaskSwitchingTrial;
  readonly response: 'left' | 'right' | null;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly timedOut: boolean;
}

export interface TaskSwitchingSummary {
  readonly totalTrials: number;
  readonly correctTrials: number;
  /** 0-100 */
  readonly accuracy: number;
  /** Mean RT across all non-timed-out trials */
  readonly meanRtMs: number;
  /** Mean RT for switch trials (non-timed-out) */
  readonly switchMeanRtMs: number;
  /** Mean RT for repeat trials (non-timed-out) */
  readonly repeatMeanRtMs: number;
  /** switchMeanRt - repeatMeanRt */
  readonly switchCostMs: number;
  readonly switchTrials: number;
  readonly repeatTrials: number;
  readonly switchCorrect: number;
  readonly repeatCorrect: number;
  readonly switchAccuracy: number;
  readonly repeatAccuracy: number;
  readonly timeouts: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Digits 1-9 excluding 5 (ambiguous for high/low) */
export const DIGITS: readonly number[] = [1, 2, 3, 4, 6, 7, 8, 9];

// =============================================================================
// Task Assignment — AABB Pattern
// =============================================================================

/**
 * Get the task type for a given trial index using AABB pattern.
 * Indices 0,1 = odd-even; 2,3 = high-low; 4,5 = odd-even; ...
 */
export function getTaskForTrial(index: number): TaskType {
  const block = Math.floor(index / 2) % 2;
  return block === 0 ? 'odd-even' : 'high-low';
}

/**
 * Determine if a trial is a switch trial (task changed from previous trial).
 * The first trial (index 0) is never a switch.
 */
export function isSwitchTrial(index: number): boolean {
  if (index === 0) return false;
  return getTaskForTrial(index) !== getTaskForTrial(index - 1);
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a random digit from the valid set (1-9 excluding 5).
 */
export function randomDigit(rng: () => number = Math.random): number {
  return DIGITS[Math.floor(rng() * DIGITS.length)] as number;
}

/**
 * Generate an array of trials with AABB task pattern.
 */
export function generateTrials(
  count: number,
  rng: () => number = Math.random,
): TaskSwitchingTrial[] {
  const trials: TaskSwitchingTrial[] = [];
  for (let i = 0; i < count; i++) {
    trials.push({
      trialIndex: i,
      digit: randomDigit(rng),
      task: getTaskForTrial(i),
      isSwitch: isSwitchTrial(i),
    });
  }
  return trials;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if a response is correct.
 * - odd-even: left = even, right = odd
 * - high-low: left = low (<5), right = high (>5)
 */
export function isCorrectResponse(
  digit: number,
  task: TaskType,
  response: 'left' | 'right',
): boolean {
  if (task === 'odd-even') {
    const isEven = digit % 2 === 0;
    return response === 'left' ? isEven : !isEven;
  }
  // high-low: >5 = high
  const isHigh = digit > 5;
  return response === 'left' ? !isHigh : isHigh;
}

/**
 * Get the correct response for a given digit and task.
 */
export function getCorrectResponse(digit: number, task: TaskType): 'left' | 'right' {
  if (task === 'odd-even') {
    return digit % 2 === 0 ? 'left' : 'right';
  }
  return digit > 5 ? 'right' : 'left';
}

// =============================================================================
// Summary Computation
// =============================================================================

/** Compute mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the switch cost: mean RT(switch correct, non-timeout) - mean RT(repeat correct, non-timeout).
 */
export function computeSwitchCost(results: readonly TaskSwitchingTrialResult[]): number {
  const switchRTs = results
    .filter((r) => r.trial.isSwitch && !r.timedOut && r.correct)
    .map((r) => r.responseTimeMs);
  const repeatRTs = results
    .filter((r) => !r.trial.isSwitch && !r.timedOut && r.correct)
    .map((r) => r.responseTimeMs);
  return Math.round(mean(switchRTs) - mean(repeatRTs));
}

/**
 * Compute full session summary from trial results.
 */
export function computeSummary(results: readonly TaskSwitchingTrialResult[]): TaskSwitchingSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;

  const validRts = results.filter((r) => !r.timedOut);
  const meanRtMs =
    validRts.length > 0
      ? Math.round(validRts.reduce((s, r) => s + r.responseTimeMs, 0) / validRts.length)
      : 0;

  const switchResults = results.filter((r) => r.trial.isSwitch);
  const repeatResults = results.filter((r) => !r.trial.isSwitch);

  const switchValidRts = switchResults.filter((r) => !r.timedOut);
  const repeatValidRts = repeatResults.filter((r) => !r.timedOut);

  const switchMeanRtMs =
    switchValidRts.length > 0
      ? Math.round(switchValidRts.reduce((s, r) => s + r.responseTimeMs, 0) / switchValidRts.length)
      : 0;

  const repeatMeanRtMs =
    repeatValidRts.length > 0
      ? Math.round(repeatValidRts.reduce((s, r) => s + r.responseTimeMs, 0) / repeatValidRts.length)
      : 0;

  const switchCostMs = computeSwitchCost(results);

  const switchCorrect = switchResults.filter((r) => r.correct).length;
  const repeatCorrect = repeatResults.filter((r) => r.correct).length;

  const switchAccuracy =
    switchResults.length > 0 ? Math.round((switchCorrect / switchResults.length) * 100) : 0;
  const repeatAccuracy =
    repeatResults.length > 0 ? Math.round((repeatCorrect / repeatResults.length) * 100) : 0;

  return {
    totalTrials,
    correctTrials,
    accuracy,
    meanRtMs,
    switchMeanRtMs,
    repeatMeanRtMs,
    switchCostMs,
    switchTrials: switchResults.length,
    repeatTrials: repeatResults.length,
    switchCorrect,
    repeatCorrect,
    switchAccuracy,
    repeatAccuracy,
    timeouts: results.filter((r) => r.timedOut).length,
  };
}
