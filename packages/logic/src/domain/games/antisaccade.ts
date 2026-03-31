/**
 * Antisaccade Task — pure game logic extracted from the training page.
 *
 * Hallett (1978):
 * - Cue appears on one side of the screen
 * - Pro-saccade: target appears on SAME side as cue
 * - Anti-saccade: target appears on OPPOSITE side of cue
 * - Player reports the direction of a small arrow target
 * - Measures suppression of reflexive orienting
 *
 * Key metrics:
 * - Pro vs anti accuracy & RT
 * - Antisaccade cost (RT_anti - RT_pro)
 * - Corrective saccade rate (errors on anti trials)
 */

// =============================================================================
// Types
// =============================================================================

export type Side = 'left' | 'right';
export type TrialCondition = 'pro' | 'anti';
export type ArrowDir = 'left' | 'right';

export interface AntisaccadeTrial {
  condition: TrialCondition;
  cueSide: Side;
  arrowDir: ArrowDir;
}

export interface AntisaccadeTrialResult {
  trialIndex: number;
  condition: TrialCondition;
  cueSide: Side;
  targetSide: Side;
  arrowDir: ArrowDir;
  response: ArrowDir | null;
  correct: boolean;
  responseTimeMs: number;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate an array of antisaccade trials with 50% pro / 50% anti.
 * Uses Fisher-Yates shuffle for randomization.
 */
export function generateTrials(count: number, rng: () => number = Math.random): AntisaccadeTrial[] {
  const conditions: TrialCondition[] = [];
  for (let i = 0; i < count; i++) {
    conditions.push(i < Math.floor(count / 2) ? 'pro' : 'anti');
  }

  // Fisher-Yates shuffle
  for (let i = conditions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = conditions[i];
    conditions[i] = conditions[j] as TrialCondition;
    conditions[j] = tmp as TrialCondition;
  }

  return conditions.map((condition) => ({
    condition,
    cueSide: rng() < 0.5 ? 'left' : 'right',
    arrowDir: rng() < 0.5 ? 'left' : 'right',
  }));
}

// =============================================================================
// Target Side
// =============================================================================

/**
 * Determine which side the target appears on.
 * - Pro-saccade: SAME side as cue
 * - Anti-saccade: OPPOSITE side of cue
 */
export function getTargetSide(condition: TrialCondition, cueSide: Side): Side {
  if (condition === 'pro') return cueSide;
  return cueSide === 'left' ? 'right' : 'left';
}

// =============================================================================
// Response Evaluation
// =============================================================================

/**
 * Check if the response matches the arrow direction.
 * A null response (timeout) is always incorrect.
 */
export function isCorrectResponse(arrowDir: ArrowDir, response: ArrowDir | null): boolean {
  if (response === null) return false;
  return response === arrowDir;
}

/**
 * Build a full trial result from a trial definition and response.
 */
export function evaluateTrial(
  trial: AntisaccadeTrial,
  trialIndex: number,
  response: ArrowDir | null,
  responseTimeMs: number,
): AntisaccadeTrialResult {
  const targetSide = getTargetSide(trial.condition, trial.cueSide);
  const correct = isCorrectResponse(trial.arrowDir, response);
  return {
    trialIndex,
    condition: trial.condition,
    cueSide: trial.cueSide,
    targetSide,
    arrowDir: trial.arrowDir,
    response,
    correct,
    responseTimeMs,
  };
}

// =============================================================================
// Summary
// =============================================================================

export interface AntisaccadeSummary {
  totalTrials: number;
  correctTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Pro-saccade accuracy (0-100) */
  proAccuracy: number;
  /** Anti-saccade accuracy (0-100) */
  antiAccuracy: number;
  /** Mean RT for correct pro trials (ms) */
  meanProRt: number;
  /** Mean RT for correct anti trials (ms) */
  meanAntiRt: number;
  /** Antisaccade cost: meanAntiRt - meanProRt (ms) */
  antisaccadeCost: number;
  /** Error rate on anti trials (0-100) — corrective saccade proxy */
  antiErrorRate: number;
  /** Error rate on pro trials (0-100) */
  proErrorRate: number;
  /** Number of timeout trials */
  timeoutCount: number;
  proTrialCount: number;
  antiTrialCount: number;
}

/** Compute mean of an array; returns 0 for empty arrays. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: AntisaccadeTrialResult[]): AntisaccadeSummary {
  const proResults = results.filter((r) => r.condition === 'pro');
  const antiResults = results.filter((r) => r.condition === 'anti');

  const proCorrect = proResults.filter((r) => r.correct);
  const antiCorrect = antiResults.filter((r) => r.correct);
  const correctTrials = proCorrect.length + antiCorrect.length;

  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;
  const proAccuracy =
    proResults.length > 0 ? Math.round((proCorrect.length / proResults.length) * 100) : 0;
  const antiAccuracy =
    antiResults.length > 0 ? Math.round((antiCorrect.length / antiResults.length) * 100) : 0;

  // RTs for correct trials that had a response (not timeout)
  const proRts = proCorrect.filter((r) => r.response !== null).map((r) => r.responseTimeMs);
  const antiRts = antiCorrect.filter((r) => r.response !== null).map((r) => r.responseTimeMs);

  const meanProRt = Math.round(mean(proRts));
  const meanAntiRt = Math.round(mean(antiRts));
  const antisaccadeCost = meanAntiRt - meanProRt;

  const proErrors = proResults.filter((r) => !r.correct).length;
  const antiErrors = antiResults.filter((r) => !r.correct).length;
  const proErrorRate =
    proResults.length > 0 ? Math.round((proErrors / proResults.length) * 100) : 0;
  const antiErrorRate =
    antiResults.length > 0 ? Math.round((antiErrors / antiResults.length) * 100) : 0;

  const timeoutCount = results.filter((r) => r.response === null).length;

  return {
    totalTrials: results.length,
    correctTrials,
    accuracy,
    proAccuracy,
    antiAccuracy,
    meanProRt,
    meanAntiRt,
    antisaccadeCost,
    antiErrorRate,
    proErrorRate,
    timeoutCount,
    proTrialCount: proResults.length,
    antiTrialCount: antiResults.length,
  };
}
