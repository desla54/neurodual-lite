/**
 * Spot the Diff — pure game logic extracted from the training page.
 *
 * Visual comparison task:
 * - Two grids side by side; the right grid has 2-4 cells that differ
 * - Player taps differing cells on the right grid
 * - Time limit per round: 30 seconds
 * - Score based on diffs found, incorrect taps, and time
 */

// =============================================================================
// Constants
// =============================================================================

export const TIME_LIMIT_MS = 30_000;

export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star'] as const;
export type Shape = (typeof SHAPES)[number];

export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
export type CellColor = (typeof COLORS)[number];

// =============================================================================
// Types
// =============================================================================

export interface CellContent {
  shape: Shape;
  color: CellColor;
}

export interface LevelConfig {
  gridSize: number;
  diffCount: number;
}

export interface TrialResult {
  trialIndex: number;
  gridSize: number;
  diffCount: number;
  foundCount: number;
  wrongTaps: number;
  timeMs: number;
  accuracy: number;
}

export interface SpotDiffTrialState {
  baseGrid: CellContent[][];
  diffGrid: CellContent[][];
  diffPositions: Set<string>;
  selectedCells: Set<string>;
  wrongTapCount: number;
  allFound: boolean;
  timedOut: boolean;
}

export type CellTapResult =
  | { type: 'already_selected' }
  | { type: 'correct'; allFound: boolean }
  | { type: 'incorrect' }
  | { type: 'deselected' };

// =============================================================================
// Level Config
// =============================================================================

export function getLevelConfig(nLevel: number): LevelConfig {
  if (nLevel <= 1) return { gridSize: 4, diffCount: 2 };
  if (nLevel === 2) return { gridSize: 5, diffCount: 3 };
  return { gridSize: 5, diffCount: 4 };
}

// =============================================================================
// Grid Generation
// =============================================================================

export function randomShape(rng: () => number = Math.random): Shape {
  return SHAPES[Math.floor(rng() * SHAPES.length)] as Shape;
}

export function randomColor(rng: () => number = Math.random): CellColor {
  return COLORS[Math.floor(rng() * COLORS.length)] as CellColor;
}

export function generateBaseGrid(size: number, rng: () => number = Math.random): CellContent[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      shape: randomShape(rng),
      color: randomColor(rng),
    })),
  );
}

/**
 * Pick `count` unique random cell positions from a grid of given size.
 */
export function pickRandomPositions(
  size: number,
  count: number,
  rng: () => number = Math.random,
): Array<[number, number]> {
  const all: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      all.push([r, c]);
    }
  }
  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j] as [number, number], all[i] as [number, number]];
  }
  return all.slice(0, count);
}

/**
 * Create the modified grid by changing `diffCount` cells.
 * Each diff is either a shape change or a color change (50/50).
 */
export function generateDiffGrid(
  base: CellContent[][],
  diffCount: number,
  rng: () => number = Math.random,
): { diffGrid: CellContent[][]; diffPositions: Set<string> } {
  const size = base.length;
  const diffGrid = base.map((row) => row.map((cell) => ({ ...cell })));
  const positions = pickRandomPositions(size, diffCount, rng);
  const diffPositions = new Set<string>();

  for (const [r, c] of positions) {
    const original = (base[r] as CellContent[])[c] as CellContent;
    diffPositions.add(`${r},${c}`);

    if (rng() < 0.5) {
      // Change shape
      let newShape: Shape;
      do {
        newShape = randomShape(rng);
      } while (newShape === original.shape);
      (diffGrid[r] as CellContent[])[c] = { shape: newShape, color: original.color };
    } else {
      // Change color
      let newColor: CellColor;
      do {
        newColor = randomColor(rng);
      } while (newColor === original.color);
      (diffGrid[r] as CellContent[])[c] = { shape: original.shape, color: newColor };
    }
  }

  return { diffGrid, diffPositions };
}

// =============================================================================
// Trial State Machine
// =============================================================================

export function createTrialState(
  gridSize: number,
  diffCount: number,
  rng: () => number = Math.random,
): SpotDiffTrialState {
  const baseGrid = generateBaseGrid(gridSize, rng);
  const { diffGrid, diffPositions } = generateDiffGrid(baseGrid, diffCount, rng);
  return {
    baseGrid,
    diffGrid,
    diffPositions,
    selectedCells: new Set(),
    wrongTapCount: 0,
    allFound: false,
    timedOut: false,
  };
}

/**
 * Handle a cell tap on the target (right) grid.
 * Returns a result describing what happened and a new state.
 */
export function tapCell(
  state: SpotDiffTrialState,
  row: number,
  col: number,
): { result: CellTapResult; state: SpotDiffTrialState } {
  const key = `${row},${col}`;

  // Already selected? Deselect it.
  if (state.selectedCells.has(key)) {
    const newSelected = new Set(state.selectedCells);
    newSelected.delete(key);
    return {
      result: { type: 'deselected' },
      state: { ...state, selectedCells: newSelected },
    };
  }

  // Is it a difference?
  if (state.diffPositions.has(key)) {
    const newSelected = new Set(state.selectedCells);
    newSelected.add(key);
    const allFound = newSelected.size === state.diffPositions.size;
    return {
      result: { type: 'correct', allFound },
      state: { ...state, selectedCells: newSelected, allFound },
    };
  }

  // Wrong tap
  return {
    result: { type: 'incorrect' },
    state: { ...state, wrongTapCount: state.wrongTapCount + 1 },
  };
}

/**
 * Mark the trial as timed out.
 */
export function timeoutTrial(state: SpotDiffTrialState): SpotDiffTrialState {
  return { ...state, timedOut: true };
}

/**
 * Build a TrialResult from the trial state.
 */
export function buildTrialResult(
  state: SpotDiffTrialState,
  trialIndex: number,
  timeMs: number,
): TrialResult {
  const foundCount = state.selectedCells.size;
  const diffCount = state.diffPositions.size;
  return {
    trialIndex,
    gridSize: state.baseGrid.length,
    diffCount,
    foundCount,
    wrongTaps: state.wrongTapCount,
    timeMs,
    accuracy: diffCount > 0 ? foundCount / diffCount : 0,
  };
}

// =============================================================================
// Completion Detection
// =============================================================================

/**
 * Compute which diffs were found and which were missed.
 */
export function computeFeedback(state: SpotDiffTrialState): {
  foundSet: Set<string>;
  missedSet: Set<string>;
} {
  const foundSet = new Set(state.selectedCells);
  const missedSet = new Set<string>();
  for (const key of state.diffPositions) {
    if (!state.selectedCells.has(key)) {
      missedSet.add(key);
    }
  }
  return { foundSet, missedSet };
}

// =============================================================================
// Session Scoring
// =============================================================================

export interface SpotDiffSessionSummary {
  accuracy: number; // 0-100
  perfectRounds: number;
  totalTrials: number;
  totalFound: number;
  totalDiffs: number;
  avgTimeMs: number;
}

export function computeSessionSummary(results: readonly TrialResult[]): SpotDiffSessionSummary {
  const total = results.length;
  const totalDiffs = results.reduce((s, r) => s + r.diffCount, 0);
  const totalFound = results.reduce((s, r) => s + r.foundCount, 0);
  const perfectRounds = results.filter((r) => r.foundCount === r.diffCount).length;
  const avgTimeMs = total > 0 ? Math.round(results.reduce((s, r) => s + r.timeMs, 0) / total) : 0;
  return {
    accuracy: totalDiffs > 0 ? Math.round((totalFound / totalDiffs) * 100) : 0,
    perfectRounds,
    totalTrials: total,
    totalFound,
    totalDiffs,
    avgTimeMs,
  };
}
