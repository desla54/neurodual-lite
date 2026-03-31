/**
 * Nonogram (Picross) puzzle — pure game logic extracted from the training page.
 *
 * Logic puzzle:
 * - Grid with numeric clues on each row and column
 * - Three cell states: empty (0), filled (1), marked-empty (2)
 * - Goal: fill cells to match the hidden solution pattern
 */

// =============================================================================
// Types
// =============================================================================

/** Cell states: 0 = empty, 1 = filled, 2 = marked-empty */
export type CellState = 0 | 1 | 2;

export interface GridConfig {
  rows: number;
  cols: number;
}

// =============================================================================
// Constants
// =============================================================================

export const GRID_CONFIGS: Record<number, GridConfig> = {
  1: { rows: 5, cols: 5 },
  2: { rows: 7, cols: 7 },
  3: { rows: 10, cols: 10 },
};

export const FILL_RATE_MIN = 0.4;
export const FILL_RATE_MAX = 0.6;

// =============================================================================
// Clue Generation
// =============================================================================

/** Compute run-length clues for a single boolean row/column */
export function computeLineClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let count = 0;
  for (const cell of line) {
    if (cell) {
      count++;
    } else if (count > 0) {
      clues.push(count);
      count = 0;
    }
  }
  if (count > 0) clues.push(count);
  return clues.length > 0 ? clues : [0];
}

/** Compute row clues from a solution grid */
export function computeRowClues(solution: boolean[][]): number[][] {
  return solution.map((row) => computeLineClues(row));
}

/** Compute column clues from a solution grid */
export function computeColClues(solution: boolean[][]): number[][] {
  const rows = solution.length;
  const cols = (solution[0] ?? []).length;
  const clues: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: boolean[] = [];
    for (let r = 0; r < rows; r++) {
      col.push(solution[r]?.[c] ?? false);
    }
    clues.push(computeLineClues(col));
  }
  return clues;
}

// =============================================================================
// Solution Validation
// =============================================================================

/** Check if the player grid exactly matches the solution */
export function checkSolution(playerGrid: CellState[][], solution: boolean[][]): boolean {
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < (solution[0] ?? []).length; c++) {
      const isFilled = playerGrid[r]?.[c] === 1;
      if (isFilled !== (solution[r]?.[c] ?? false)) return false;
    }
  }
  return true;
}

/** Count the number of incorrect cells in the player grid vs solution */
export function countErrors(playerGrid: CellState[][], solution: boolean[][]): number {
  let errors = 0;
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < (solution[0] ?? []).length; c++) {
      const isFilled = playerGrid[r]?.[c] === 1;
      const shouldBeFilled = solution[r]?.[c] ?? false;
      if (isFilled !== shouldBeFilled) errors++;
    }
  }
  return errors;
}

// =============================================================================
// Cell State
// =============================================================================

/** Cycle cell state: empty(0) -> filled(1) -> marked-empty(2) -> empty(0) */
export function cycleCellState(current: CellState): CellState {
  return ((current + 1) % 3) as CellState;
}

// =============================================================================
// Grid Helpers
// =============================================================================

/** Create an empty player grid filled with 0s */
export function createEmptyPlayerGrid(rows: number, cols: number): CellState[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0 as CellState));
}

/** Generate a random boolean solution grid with ~40-60% fill rate */
export function generateSolution(rows: number, cols: number): boolean[][] {
  const fillRate = FILL_RATE_MIN + Math.random() * (FILL_RATE_MAX - FILL_RATE_MIN);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() < fillRate),
  );
}

// =============================================================================
// Row/Column Validation
// =============================================================================

/** Check if a single player row matches its expected clues */
export function validateLine(playerLine: CellState[], expectedClues: number[]): boolean {
  const filledLine = playerLine.map((c) => c === 1);
  const actualClues = computeLineClues(filledLine);
  if (actualClues.length !== expectedClues.length) return false;
  return actualClues.every((v, i) => v === expectedClues[i]);
}

// =============================================================================
// Scoring
// =============================================================================

export interface NonogramScore {
  /** Base score out of 100 */
  baseScore: number;
  /** Penalty per error */
  errorPenalty: number;
  /** Time bonus (faster = higher) */
  timeBonus: number;
  /** Final score (clamped to 0-100) */
  finalScore: number;
}

/**
 * Compute a score for a nonogram puzzle.
 * - Base score: 100
 * - Error penalty: -5 per error
 * - Time bonus: +10 if under 30s, +5 if under 60s (for 5x5)
 *   Thresholds scale with grid area.
 */
export function computeScore(
  errors: number,
  timeMs: number,
  rows: number,
  cols: number,
): NonogramScore {
  const baseScore = 100;
  const errorPenalty = errors * 5;

  const area = rows * cols;
  // Scale time thresholds: 30s per 25 cells (5x5 baseline)
  const fastThresholdMs = (area / 25) * 30_000;
  const mediumThresholdMs = (area / 25) * 60_000;

  let timeBonus = 0;
  if (timeMs < fastThresholdMs) {
    timeBonus = 10;
  } else if (timeMs < mediumThresholdMs) {
    timeBonus = 5;
  }

  const finalScore = Math.max(0, Math.min(100, baseScore - errorPenalty + timeBonus));
  return { baseScore, errorPenalty, timeBonus, finalScore };
}
