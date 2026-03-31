/**
 * PAL (Paired Associates Learning) — pure game logic.
 *
 * de Rover et al. (2011):
 * - Study phase: colored shapes shown at grid positions one by one
 * - Test phase: a shape is shown, player must tap its correct grid position
 * - Multiple rounds with increasing pair count
 * - Measures visuospatial associative memory
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_TOTAL_ROUNDS = 4;
export const DEFAULT_PAIRS_PER_ROUND = [3, 4, 5, 6] as const;
export const GRID_SIZE = 9; // 3x3 grid, positions 0-8

export const SHAPES = [
  { name: 'circle', color: '#EF4444', label: 'Red' },
  { name: 'circle', color: '#3B82F6', label: 'Blue' },
  { name: 'circle', color: '#22C55E', label: 'Green' },
  { name: 'circle', color: '#EAB308', label: 'Yellow' },
  { name: 'circle', color: '#A855F7', label: 'Purple' },
  { name: 'circle', color: '#F97316', label: 'Orange' },
  { name: 'circle', color: '#EC4899', label: 'Pink' },
  { name: 'circle', color: '#06B6D4', label: 'Cyan' },
  { name: 'circle', color: '#84CC16', label: 'Lime' },
] as const;

// =============================================================================
// Types
// =============================================================================

export interface PalPair {
  shape: string;
  color: string;
  label: string;
  position: number;
}

export interface PalTrial {
  shape: string;
  color: string;
  label: string;
  correctPosition: number;
  round: number;
}

export interface TrialResult {
  trial: PalTrial;
  selectedPosition: number | null;
  correct: boolean;
  rt: number;
}

export interface RoundState {
  round: number;
  pairs: PalPair[];
  testOrder: PalTrial[];
  testIndex: number;
}

export interface SessionState {
  round: number;
  trialIndex: number;
  finished: boolean;
}

// =============================================================================
// Pair Generation
// =============================================================================

/**
 * Shuffle an array using Fisher-Yates.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Generate round pairs: assign unique shapes to unique grid positions.
 */
export function generateRoundPairs(pairCount: number, rng: () => number = Math.random): PalPair[] {
  const positions = shuffle(
    Array.from({ length: GRID_SIZE }, (_, i) => i),
    rng,
  ).slice(0, pairCount);

  const shapes = shuffle(SHAPES, rng).slice(0, pairCount);

  return positions.map((pos, i) => ({
    shape: shapes[i]!.name,
    color: shapes[i]!.color,
    label: shapes[i]!.label,
    position: pos,
  }));
}

/**
 * Create a shuffled test order from pairs for a given round.
 */
export function createTestOrder(
  pairs: PalPair[],
  round: number,
  rng: () => number = Math.random,
): PalTrial[] {
  return shuffle(pairs, rng).map((p) => ({
    shape: p.shape,
    color: p.color,
    label: p.label,
    correctPosition: p.position,
    round,
  }));
}

// =============================================================================
// Trial Evaluation
// =============================================================================

/**
 * Evaluate a single test trial: is the selected position correct?
 */
export function evaluateTrial(trial: PalTrial, selectedPosition: number): boolean {
  return selectedPosition === trial.correctPosition;
}

// =============================================================================
// Session State Machine
// =============================================================================

/**
 * Create initial session state.
 */
export function createInitialState(): SessionState {
  return { round: 0, trialIndex: 0, finished: false };
}

/**
 * Advance session state after a trial response.
 * Returns the new state (immutable).
 */
export function advanceState(
  state: SessionState,
  currentRoundTrialCount: number,
  currentTestIndex: number,
  pairsPerRound: readonly number[] = DEFAULT_PAIRS_PER_ROUND,
): SessionState {
  if (state.finished) return state;

  const newTrialIndex = state.trialIndex + 1;
  const isLastTrialInRound = currentTestIndex + 1 >= currentRoundTrialCount;

  if (!isLastTrialInRound) {
    return { round: state.round, trialIndex: newTrialIndex, finished: false };
  }

  // Round complete — move to next round
  const nextRound = state.round + 1;
  if (nextRound >= pairsPerRound.length) {
    return { round: state.round, trialIndex: newTrialIndex, finished: true };
  }

  return { round: nextRound, trialIndex: newTrialIndex, finished: false };
}

// =============================================================================
// Summary
// =============================================================================

export interface PalSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  totalErrors: number;
  pairsLearned: number;
  maxSetSize: number;
  avgCorrectRt: number;
  roundAccuracies: number[];
}

/**
 * Compute a summary from trial results.
 */
export function computeSummary(
  results: TrialResult[],
  pairsPerRound: readonly number[] = DEFAULT_PAIRS_PER_ROUND,
): PalSummary {
  const total = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const totalErrors = total - correctTrials;
  const accuracy = total > 0 ? Math.round((correctTrials / total) * 100) : 0;

  const correctRts = results.filter((r) => r.correct).map((r) => r.rt);
  const avgCorrectRt =
    correctRts.length > 0
      ? Math.round(correctRts.reduce((a, b) => a + b, 0) / correctRts.length)
      : 0;

  // Pairs learned: unique pairs answered correctly
  const pairsLearned = new Set(
    results.filter((r) => r.correct).map((r) => `${r.trial.round}:${r.trial.correctPosition}`),
  ).size;

  // Max set size: highest round where at least one trial was correct
  const roundsWithCorrect = [
    ...new Set(results.filter((r) => r.correct).map((r) => r.trial.round)),
  ];
  const maxSetSize =
    roundsWithCorrect.length > 0 ? (pairsPerRound[Math.max(...roundsWithCorrect)] ?? 0) : 0;

  // Per-round accuracies
  const roundAccuracies = pairsPerRound.map((_, rIdx) => {
    const roundResults = results.filter((r) => r.trial.round === rIdx);
    const roundCorrect = roundResults.filter((r) => r.correct).length;
    return roundResults.length > 0 ? Math.round((roundCorrect / roundResults.length) * 100) : 0;
  });

  return {
    totalTrials: total,
    correctTrials,
    accuracy,
    totalErrors,
    pairsLearned,
    maxSetSize,
    avgCorrectRt,
    roundAccuracies,
  };
}
