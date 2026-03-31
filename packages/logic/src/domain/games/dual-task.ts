/**
 * Dual Task — pure game logic extracted from the training page.
 *
 * Divided attention paradigm:
 * - Task A: Classify number as ODD or EVEN
 * - Task B: Classify symbol as UP (^) or DOWN (v)
 * - Both presented simultaneously; player responds to both
 * - Measures dual-task cost (divided attention overhead)
 */

// =============================================================================
// Types
// =============================================================================

export type SymbolType = '^' | 'v';

export interface DualTrial {
  number: number;
  numberIsOdd: boolean;
  symbol: SymbolType;
  symbolIsUp: boolean;
}

export interface DualTrialResult {
  trial: DualTrial;
  responseA: 'odd' | 'even' | null; // number task
  responseB: 'up' | 'down' | null; // symbol task
  taskACorrect: boolean;
  taskBCorrect: boolean;
  bothCorrect: boolean;
  rt: number;
  timedOut: boolean;
}

export interface DualTaskSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 — % of trials where BOTH tasks correct */
  accuracy: number;
  /** Mean RT across non-timed-out trials */
  avgRT: number;
  /** 0-100 — Task A accuracy */
  task1Accuracy: number;
  /** 0-100 — Task B accuracy */
  task2Accuracy: number;
  taskACorrectCount: number;
  taskBCorrectCount: number;
  /**
   * Dual-task cost in ms.
   * Estimated as: dualTaskRt - mean(singleTask1Rt, singleTask2Rt)
   * where single-task baselines are estimated from the dual-task RT.
   */
  dualTaskCost: number;
  singleTask1Rt: number;
  singleTask2Rt: number;
  dualTaskRt: number;
}

// =============================================================================
// Constants
// =============================================================================

export const NUMBER_POOL = [2, 3, 4, 5, 6, 7, 8, 9] as const;
export const SYMBOL_POOL: readonly SymbolType[] = ['^', 'v'] as const;

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate an array of dual-task trials with random number-symbol pairings.
 */
export function generateTrials(count: number, rng: () => number = Math.random): DualTrial[] {
  const trials: DualTrial[] = [];

  for (let i = 0; i < count; i++) {
    const num = NUMBER_POOL[Math.floor(rng() * NUMBER_POOL.length)]!;
    const sym = SYMBOL_POOL[Math.floor(rng() * SYMBOL_POOL.length)]!;
    trials.push({
      number: num,
      numberIsOdd: num % 2 !== 0,
      symbol: sym,
      symbolIsUp: sym === '^',
    });
  }

  return trials;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if the number task response is correct.
 */
export function isTaskACorrect(trial: DualTrial, response: 'odd' | 'even' | null): boolean {
  if (response == null) return false;
  return (response === 'odd') === trial.numberIsOdd;
}

/**
 * Check if the symbol task response is correct.
 */
export function isTaskBCorrect(trial: DualTrial, response: 'up' | 'down' | null): boolean {
  if (response == null) return false;
  return (response === 'up') === trial.symbolIsUp;
}

/**
 * Build a full trial result from responses.
 */
export function buildTrialResult(
  trial: DualTrial,
  responseA: 'odd' | 'even' | null,
  responseB: 'up' | 'down' | null,
  rt: number,
  timedOut: boolean,
): DualTrialResult {
  const taskACorrect = isTaskACorrect(trial, responseA);
  const taskBCorrect = isTaskBCorrect(trial, responseB);
  return {
    trial,
    responseA,
    responseB,
    taskACorrect,
    taskBCorrect,
    bothCorrect: taskACorrect && taskBCorrect,
    rt,
    timedOut,
  };
}

// =============================================================================
// Dual-Task Cost
// =============================================================================

/**
 * Estimate single-task RT baselines from dual-task RT.
 * PRP literature suggests single-task is ~25-30% faster.
 */
export function estimateSingleTaskRTs(dualTaskRt: number): {
  singleTask1Rt: number;
  singleTask2Rt: number;
} {
  return {
    singleTask1Rt: Math.round(dualTaskRt * 0.7),
    singleTask2Rt: Math.round(dualTaskRt * 0.75),
  };
}

/**
 * Compute dual-task cost: difference between dual-task RT and mean of
 * estimated single-task RTs.
 */
export function computeDualTaskCost(dualTaskRt: number): number {
  if (dualTaskRt <= 0) return 0;
  const { singleTask1Rt, singleTask2Rt } = estimateSingleTaskRTs(dualTaskRt);
  return Math.round(dualTaskRt - (singleTask1Rt + singleTask2Rt) / 2);
}

/**
 * Compute dual-task cost from actual single-task and dual-task RTs.
 * More accurate when single-task baselines are measured separately.
 */
export function computeDualTaskCostFromBaselines(
  dualTaskRt: number,
  singleTask1Rt: number,
  singleTask2Rt: number,
): number {
  if (dualTaskRt <= 0) return 0;
  return Math.round(dualTaskRt - (singleTask1Rt + singleTask2Rt) / 2);
}

// =============================================================================
// Summary
// =============================================================================

/** Compute mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: DualTrialResult[]): DualTaskSummary {
  if (results.length === 0) {
    return {
      correctTrials: 0,
      totalTrials: 0,
      accuracy: 0,
      avgRT: 0,
      task1Accuracy: 0,
      task2Accuracy: 0,
      taskACorrectCount: 0,
      taskBCorrectCount: 0,
      dualTaskCost: 0,
      singleTask1Rt: 0,
      singleTask2Rt: 0,
      dualTaskRt: 0,
    };
  }

  const correctTrials = results.filter((r) => r.bothCorrect).length;
  const accuracy = Math.round((correctTrials / results.length) * 100);

  const taskACorrectCount = results.filter((r) => r.taskACorrect).length;
  const taskBCorrectCount = results.filter((r) => r.taskBCorrect).length;
  const task1Accuracy = Math.round((taskACorrectCount / results.length) * 100);
  const task2Accuracy = Math.round((taskBCorrectCount / results.length) * 100);

  const rtsAll = results.filter((r) => !r.timedOut).map((r) => r.rt);
  const avgRT = rtsAll.length > 0 ? Math.round(mean(rtsAll)) : 0;

  const dualTaskRt = avgRT;
  const { singleTask1Rt, singleTask2Rt } = estimateSingleTaskRTs(dualTaskRt);
  const dualTaskCost = computeDualTaskCost(dualTaskRt);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    task1Accuracy,
    task2Accuracy,
    taskACorrectCount,
    taskBCorrectCount,
    dualTaskCost,
    singleTask1Rt,
    singleTask2Rt,
    dualTaskRt,
  };
}
