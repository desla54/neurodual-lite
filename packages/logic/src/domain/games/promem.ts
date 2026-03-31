/**
 * Prospective Memory (Event-Based) — pure game logic.
 *
 * Einstein & McDaniel (1990):
 * - Ongoing task: categorize words as "Living" or "Non-living"
 * - Prospective rule: when you see a RED word (PM cue), press STAR instead
 * - Measures event-based prospective memory + ongoing task performance
 * - Key metrics: PM hit rate, ongoing accuracy, PM cost (RT difference)
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_TOTAL_TRIALS = 40;
export const DEFAULT_PM_TARGET_COUNT = 6;
export const STIMULUS_TIMEOUT_MS = 2500;

export const LIVING_WORDS = [
  'tiger',
  'eagle',
  'flower',
  'dolphin',
  'mushroom',
  'spider',
  'whale',
  'cactus',
  'rabbit',
  'coral',
] as const;

export const NON_LIVING_WORDS = [
  'hammer',
  'bridge',
  'crystal',
  'volcano',
  'mirror',
  'anchor',
  'cloud',
  'diamond',
  'rocket',
  'candle',
] as const;

// =============================================================================
// Types
// =============================================================================

export type Response = 'living' | 'non-living' | 'star' | null;

export interface ProMemTrial {
  word: string;
  isLiving: boolean;
  isProspective: boolean;
  displayColor: 'red' | 'white';
}

export interface TrialResult {
  trial: ProMemTrial;
  response: Response;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate the full trial list for a session.
 *
 * PM targets are placed at random positions, avoiding the first 3 and last 2
 * trials to give the participant time to settle.
 */
export function generateTrials(
  count: number = DEFAULT_TOTAL_TRIALS,
  pmTargetCount: number = DEFAULT_PM_TARGET_COUNT,
  rng: () => number = Math.random,
): ProMemTrial[] {
  const trials: ProMemTrial[] = [];

  // Place PM targets at random indices, avoiding edges
  const minIdx = Math.min(3, count);
  const maxIdx = Math.max(minIdx, count - 2);
  const prospectiveIndices = new Set<number>();
  let attempts = 0;
  while (prospectiveIndices.size < pmTargetCount && attempts < 1000) {
    const idx = minIdx + Math.floor(rng() * (maxIdx - minIdx));
    prospectiveIndices.add(idx);
    attempts++;
  }

  for (let i = 0; i < count; i++) {
    const isProspective = prospectiveIndices.has(i);
    const isLiving = rng() < 0.5;
    const pool = isLiving ? LIVING_WORDS : NON_LIVING_WORDS;
    const word = pool[Math.floor(rng() * pool.length)]!;
    trials.push({
      word,
      isLiving,
      isProspective,
      displayColor: isProspective ? 'red' : 'white',
    });
  }

  return trials;
}

// =============================================================================
// Response Evaluation
// =============================================================================

/**
 * Evaluate whether the player's response is correct for a given trial.
 *
 * - Prospective trial: correct only if response === 'star'
 * - Ongoing trial: correct if 'living' matches isLiving
 * - No response (null / timeout): always incorrect
 */
export function evaluateResponse(trial: ProMemTrial, response: Response): boolean {
  if (trial.isProspective) return response === 'star';
  if (response === null) return false;
  if (response === 'star') return false; // star on non-PM trial is wrong
  return (response === 'living') === trial.isLiving;
}

// =============================================================================
// Summary
// =============================================================================

export interface ProMemSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  meanRt: number;

  // Ongoing task metrics
  ongoingTotal: number;
  ongoingCorrect: number;
  ongoingAccuracy: number;
  ongoingMeanRt: number;

  // Prospective memory metrics
  pmTotal: number;
  pmHits: number;
  pmMisses: number;
  pmHitRate: number;
  pmMeanRt: number;

  // PM cost = mean ongoing RT difference (PM-present blocks vs PM-absent blocks)
  // Simplified: just the RT difference between ongoing and PM correct trials
  pmCostMs: number;

  timedOut: number;
}

/**
 * Compute a session summary from trial results.
 */
export function computeSummary(results: TrialResult[]): ProMemSummary {
  const total = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = total > 0 ? Math.round((correctTrials / total) * 100) : 0;

  const validRts = results.filter((r) => !r.timedOut && r.rt > 0).map((r) => r.rt);
  const meanRt =
    validRts.length > 0 ? Math.round(validRts.reduce((a, b) => a + b, 0) / validRts.length) : 0;

  // Ongoing trials (non-prospective)
  const ongoingResults = results.filter((r) => !r.trial.isProspective);
  const ongoingCorrect = ongoingResults.filter((r) => r.correct).length;
  const ongoingTotal = ongoingResults.length;
  const ongoingAccuracy = ongoingTotal > 0 ? Math.round((ongoingCorrect / ongoingTotal) * 100) : 0;
  const ongoingRts = ongoingResults.filter((r) => !r.timedOut && r.rt > 0).map((r) => r.rt);
  const ongoingMeanRt =
    ongoingRts.length > 0
      ? Math.round(ongoingRts.reduce((a, b) => a + b, 0) / ongoingRts.length)
      : 0;

  // Prospective trials
  const pmResults = results.filter((r) => r.trial.isProspective);
  const pmTotal = pmResults.length;
  const pmHits = pmResults.filter((r) => r.response === 'star').length;
  const pmMisses = pmTotal - pmHits;
  const pmHitRate = pmTotal > 0 ? Math.round((pmHits / pmTotal) * 100) : 0;
  const pmRts = pmResults.filter((r) => r.response === 'star' && r.rt > 0).map((r) => r.rt);
  const pmMeanRt =
    pmRts.length > 0 ? Math.round(pmRts.reduce((a, b) => a + b, 0) / pmRts.length) : 0;

  // PM cost: RT difference (ongoing mean - PM mean); positive = PM slows ongoing
  const pmCostMs = ongoingMeanRt > 0 && pmMeanRt > 0 ? pmMeanRt - ongoingMeanRt : 0;

  const timedOut = results.filter((r) => r.timedOut).length;

  return {
    totalTrials: total,
    correctTrials,
    accuracy,
    meanRt,
    ongoingTotal,
    ongoingCorrect,
    ongoingAccuracy,
    ongoingMeanRt,
    pmTotal,
    pmHits,
    pmMisses,
    pmHitRate,
    pmMeanRt,
    pmCostMs,
    timedOut,
  };
}
