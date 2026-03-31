/**
 * Rhythm Tap — pure game logic extracted from the training page.
 *
 * Rhythm reproduction game:
 * - Phase 1 (LISTEN): A sequence of beats with specific intervals
 * - Phase 2 (REPRODUCE): Player taps to reproduce the same rhythm
 * - Scoring: Compare inter-tap intervals to original inter-beat intervals
 * - Tolerance: 150ms
 */

// =============================================================================
// Constants
// =============================================================================

export const TOLERANCE_MS = 150;
export const DEFAULT_TOTAL_TRIALS = 12;

/** Available interval durations in ms */
export const ALL_INTERVALS = [300, 450, 600, 800, 1000] as const;

// =============================================================================
// Types
// =============================================================================

export interface RhythmPattern {
  beatCount: number;
  intervals: number[];
}

export interface TrialResult {
  pattern: RhythmPattern;
  reproducedIntervals: number[];
  intervalAccuracies: number[];
  avgAccuracy: number;
  correct: boolean;
}

// =============================================================================
// Pattern Generation
// =============================================================================

/**
 * Generate a rhythm pattern based on nLevel.
 * nLevel 1: 3-4 beats, 2 interval types
 * nLevel 2: 4-5 beats, 3 interval types
 * nLevel 3: 5-6 beats, all 5 interval types
 */
export function generatePattern(nLevel: number, rng: () => number = Math.random): RhythmPattern {
  let minBeats: number;
  let maxBeats: number;
  let intervalTypeCount: number;

  if (nLevel >= 3) {
    minBeats = 5;
    maxBeats = 6;
    intervalTypeCount = ALL_INTERVALS.length;
  } else if (nLevel === 2) {
    minBeats = 4;
    maxBeats = 5;
    intervalTypeCount = 3;
  } else {
    minBeats = 3;
    maxBeats = 4;
    intervalTypeCount = 2;
  }

  const beatCount = minBeats + Math.floor(rng() * (maxBeats - minBeats + 1));
  const intervalCount = beatCount - 1;

  // Pick a subset of interval types (shuffle + slice)
  const shuffled: number[] = [...ALL_INTERVALS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const availableIntervals = shuffled.slice(0, intervalTypeCount);

  const intervals: number[] = [];
  for (let i = 0; i < intervalCount; i++) {
    intervals.push(availableIntervals[Math.floor(rng() * availableIntervals.length)]!);
  }

  return { beatCount, intervals };
}

/**
 * Generate all trial patterns for a session.
 */
export function generateAllTrials(
  count: number,
  nLevel: number,
  rng: () => number = Math.random,
): RhythmPattern[] {
  return Array.from({ length: count }, () => generatePattern(nLevel, rng));
}

/**
 * Compute accuracy for a single interval.
 * accuracy = max(0, 1 - |diff| / original)
 */
export function intervalAccuracy(original: number, reproduced: number): number {
  return Math.max(0, 1 - Math.abs(reproduced - original) / original);
}

/**
 * Evaluate a rhythm reproduction attempt.
 * Returns the trial result with per-interval accuracies and correctness.
 */
export function evaluateReproduction(pattern: RhythmPattern, tapTimestamps: number[]): TrialResult {
  // Compute reproduced intervals from tap timestamps
  const reproducedIntervals: number[] = [];
  for (let i = 1; i < tapTimestamps.length; i++) {
    reproducedIntervals.push((tapTimestamps[i] as number) - (tapTimestamps[i - 1] as number));
  }

  // Compute per-interval accuracy
  const targetIntervals = pattern.intervals;
  const accuracies: number[] = [];
  const comparisons = Math.min(targetIntervals.length, reproducedIntervals.length);
  for (let i = 0; i < comparisons; i++) {
    accuracies.push(
      intervalAccuracy(targetIntervals[i] as number, reproducedIntervals[i] as number),
    );
  }

  const avgAcc = comparisons > 0 ? accuracies.reduce((a, b) => a + b, 0) / comparisons : 0;

  // A trial is "correct" if all intervals are within tolerance
  const allWithinTolerance = targetIntervals.every((target, i) => {
    const reproduced = reproducedIntervals[i];
    return reproduced != null && Math.abs(reproduced - target) <= TOLERANCE_MS;
  });

  return {
    pattern,
    reproducedIntervals: reproducedIntervals.map(Math.round),
    intervalAccuracies: accuracies.map((a) => Math.round(a * 100)),
    avgAccuracy: Math.round(avgAcc * 100),
    correct: allWithinTolerance,
  };
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: TrialResult[]) {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? correctTrials / results.length : 0;
  const avgRhythmScore =
    results.length > 0 ? results.reduce((sum, r) => sum + r.avgAccuracy, 0) / results.length : 0;
  const bestTrial = results.length > 0 ? Math.max(...results.map((r) => r.avgAccuracy)) : 0;
  const worstTrial = results.length > 0 ? Math.min(...results.map((r) => r.avgAccuracy)) : 0;

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRhythmScore,
    bestTrial,
    worstTrial,
  };
}
