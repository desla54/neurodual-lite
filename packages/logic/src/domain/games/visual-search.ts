/**
 * Visual Search — pure game logic.
 *
 * Treisman & Gelade (1980):
 * - Find a target (red circle) among distractors (blue circles + red diamonds)
 * - Conditions: target present (50%) vs absent (50%), set sizes 8/12/16
 * - Conjunction search: target shares one feature with each distractor type
 * - Key metrics: accuracy, RT by condition, search slope
 */

// =============================================================================
// Constants
// =============================================================================

export const SET_SIZES = [8, 12, 16] as const;
export const DEFAULT_TOTAL_TRIALS = 96;
export const POSITION_MARGIN_PCT = 8;
export const MIN_DISTANCE_PCT = 14;

// =============================================================================
// Types
// =============================================================================

export type ItemShape = 'circle' | 'diamond';
export type ItemColor = 'red' | 'blue';

export interface SearchItem {
  shape: ItemShape;
  color: ItemColor;
  x: number; // percentage position (0-100)
  y: number;
  isTarget: boolean;
}

export interface SearchTrial {
  targetPresent: boolean;
  setSize: number;
  items: SearchItem[];
}

export interface SearchTrialResult {
  trial: SearchTrial;
  correct: boolean;
  responseTimeMs: number;
  responded: boolean;
  answer: 'present' | 'absent' | null;
}

export interface SearchSummary {
  correctTrials: number;
  totalTrials: number;
  accuracy: number; // 0-100
  meanRtMs: number;
}

// =============================================================================
// Position Generation
// =============================================================================

/**
 * Generate non-overlapping positions (as percentages) for items in the search display.
 * @param count Number of items
 * @param minDist Minimum distance between items (percentage units)
 * @param margin Margin from edges (percentage units)
 * @param rng Random number generator
 */
export function generatePositions(
  count: number,
  minDist: number = MIN_DISTANCE_PCT,
  margin: number = POSITION_MARGIN_PCT,
  rng: () => number = Math.random,
): [number, number][] {
  const positions: [number, number][] = [];
  const maxAttempts = 100;

  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    let attempts = 0;
    do {
      x = margin + rng() * (100 - 2 * margin);
      y = margin + rng() * (100 - 2 * margin);
      attempts++;
    } while (
      attempts < maxAttempts &&
      positions.some(([px, py]) => Math.hypot(x - px, y - py) < minDist)
    );
    positions.push([x, y]);
  }
  return positions;
}

// =============================================================================
// Display Generation
// =============================================================================

/**
 * Generate a distractor item (blue circle or red diamond).
 */
export function generateDistractor(
  x: number,
  y: number,
  rng: () => number = Math.random,
): SearchItem {
  const isBlueCircle = rng() < 0.5;
  return {
    shape: isBlueCircle ? 'circle' : 'diamond',
    color: isBlueCircle ? 'blue' : 'red',
    x,
    y,
    isTarget: false,
  };
}

/**
 * Generate search items for a single trial.
 * Target = red circle. Distractors = blue circles + red diamonds.
 */
export function generateSearchItems(
  targetPresent: boolean,
  setSize: number,
  rng: () => number = Math.random,
): SearchItem[] {
  const items: SearchItem[] = [];
  const positions = generatePositions(setSize, undefined, undefined, rng);

  if (targetPresent) {
    // First position is the target (red circle)
    const [tx, ty] = positions[0] as [number, number];
    items.push({ shape: 'circle', color: 'red', x: tx, y: ty, isTarget: true });

    // Remaining positions are distractors
    for (let i = 1; i < setSize; i++) {
      const [x, y] = positions[i] as [number, number];
      items.push(generateDistractor(x, y, rng));
    }
  } else {
    // All distractors, no target
    for (let i = 0; i < setSize; i++) {
      const [x, y] = positions[i] as [number, number];
      items.push(generateDistractor(x, y, rng));
    }
  }

  return items;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a balanced set of trials with 50/50 present/absent and
 * even distribution across set sizes.
 */
export function generateTrials(
  count: number = DEFAULT_TOTAL_TRIALS,
  rng: () => number = Math.random,
): SearchTrial[] {
  const trials: SearchTrial[] = [];

  for (let i = 0; i < count; i++) {
    const targetPresent = i % 2 === 0;
    const setSize = SET_SIZES[i % SET_SIZES.length] as number;
    trials.push({
      targetPresent,
      setSize,
      items: generateSearchItems(targetPresent, setSize, rng),
    });
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trials[i], trials[j]] = [trials[j] as SearchTrial, trials[i] as SearchTrial];
  }

  return trials;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if a response is correct.
 * @param answer The user's answer ('present' or 'absent')
 * @param targetPresent Whether the target was actually present
 */
export function isCorrectResponse(answer: 'present' | 'absent', targetPresent: boolean): boolean {
  return (answer === 'present') === targetPresent;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute summary statistics from trial results.
 */
export function computeSummary(results: SearchTrialResult[]): SearchSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  const respondedResults = results.filter((r) => r.responded);
  const meanRtMs =
    respondedResults.length > 0
      ? Math.round(
          respondedResults.reduce((s, r) => s + r.responseTimeMs, 0) / respondedResults.length,
        )
      : 0;

  return { correctTrials, totalTrials, accuracy, meanRtMs };
}

/**
 * Check if a display contains a target (red circle).
 */
export function displayContainsTarget(items: SearchItem[]): boolean {
  return items.some((item) => item.isTarget);
}

/**
 * Check if a display contains a red circle (regardless of isTarget flag).
 */
export function displayHasRedCircle(items: SearchItem[]): boolean {
  return items.some((item) => item.shape === 'circle' && item.color === 'red');
}
