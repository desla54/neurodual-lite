/**
 * Lights Out — pure game logic extracted from the training page.
 *
 * Grid of cells (ON / OFF). Clicking a cell toggles it and its 4 Von Neumann
 * neighbours. Goal: turn all cells OFF.
 * Puzzles are generated solvable by starting from all-OFF and applying random
 * clicks (reverse generation).
 */

// =============================================================================
// Grid helpers
// =============================================================================

/** Create a size x size grid of all OFF (false) cells. */
export function createEmptyGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => false));
}

/** Toggle cell (row, col) and its 4 Von Neumann neighbours. Returns a new grid. */
export function toggleCell(grid: boolean[][], row: number, col: number): boolean[][] {
  const size = grid.length;
  const newGrid = grid.map((r) => [...r]);
  const targets: [number, number][] = [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];
  for (const [r, c] of targets) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      (newGrid[r] as boolean[])[c] = !(newGrid[r] as boolean[])[c];
    }
  }
  return newGrid;
}

/** Check if all cells are OFF. */
export function isSolved(grid: boolean[][]): boolean {
  return grid.every((row) => row.every((cell) => !cell));
}

/** Count the number of ON cells. */
export function countLit(grid: boolean[][]): number {
  return grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

// =============================================================================
// Puzzle generation
// =============================================================================

const MIN_RANDOM_CLICKS_FACTOR = 2;
const MAX_RANDOM_CLICKS_FACTOR = 4;

/**
 * Generate a solvable puzzle by starting from all-OFF and applying random clicks.
 * This guarantees solvability because each click is its own inverse.
 */
export function generatePuzzle(size: number): boolean[][] {
  let grid = createEmptyGrid(size);
  const numClicks =
    size * MIN_RANDOM_CLICKS_FACTOR +
    Math.floor(Math.random() * size * (MAX_RANDOM_CLICKS_FACTOR - MIN_RANDOM_CLICKS_FACTOR));

  for (let i = 0; i < numClicks; i++) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    grid = toggleCell(grid, r, c);
  }

  // Ensure at least one cell is ON (avoid trivial puzzle)
  if (isSolved(grid)) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    grid = toggleCell(grid, r, c);
  }

  return grid;
}

/**
 * Apply a sequence of moves to a grid. Returns the resulting grid.
 * Useful for verifying solvability or replaying.
 */
export function applyMoves(grid: boolean[][], moves: [number, number][]): boolean[][] {
  let result = grid;
  for (const [r, c] of moves) {
    result = toggleCell(result, r, c);
  }
  return result;
}

// =============================================================================
// Grid size helpers
// =============================================================================

export const MIN_GRID_SIZE = 2;
export const MAX_GRID_SIZE = 5;

export function clampGridSize(size: number): number {
  return Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, Math.round(size)));
}

export function gridSizeLabel(size: number): string {
  return `${size}x${size}`;
}
