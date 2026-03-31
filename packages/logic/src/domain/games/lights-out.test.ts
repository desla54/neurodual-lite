import { describe, expect, it } from 'bun:test';
import {
  createEmptyGrid,
  toggleCell,
  isSolved,
  countLit,
  generatePuzzle,
  applyMoves,
  clampGridSize,
  gridSizeLabel,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
} from './lights-out';

// =============================================================================
// createEmptyGrid
// =============================================================================

describe('createEmptyGrid', () => {
  it('creates a grid of all OFF cells', () => {
    const g = createEmptyGrid(3);
    expect(g).toHaveLength(3);
    for (const row of g) {
      expect(row).toHaveLength(3);
      expect(row.every((c) => c === false)).toBe(true);
    }
  });

  it('handles various sizes', () => {
    for (const size of [2, 4, 5, 7]) {
      const g = createEmptyGrid(size);
      expect(g).toHaveLength(size);
      expect(g[0]).toHaveLength(size);
    }
  });
});

// =============================================================================
// toggleCell — Von Neumann neighbourhood
// =============================================================================

describe('toggleCell', () => {
  it('toggles center cell and its 4 neighbours on a 3x3 grid', () => {
    const g = createEmptyGrid(3);
    const result = toggleCell(g, 1, 1);
    // Center + up + down + left + right = 5 cells ON
    expect(countLit(result)).toBe(5);
    expect(result[1]![1]).toBe(true); // center
    expect(result[0]![1]).toBe(true); // up
    expect(result[2]![1]).toBe(true); // down
    expect(result[1]![0]).toBe(true); // left
    expect(result[1]![2]).toBe(true); // right
  });

  it('corner cell only toggles existing neighbours (top-left)', () => {
    const g = createEmptyGrid(3);
    const result = toggleCell(g, 0, 0);
    // (0,0), (1,0), (0,1) = 3 cells
    expect(countLit(result)).toBe(3);
    expect(result[0]![0]).toBe(true);
    expect(result[1]![0]).toBe(true);
    expect(result[0]![1]).toBe(true);
    // Diagonal should NOT be toggled
    expect(result[1]![1]).toBe(false);
  });

  it('corner cell: bottom-right on a 4x4', () => {
    const g = createEmptyGrid(4);
    const result = toggleCell(g, 3, 3);
    expect(countLit(result)).toBe(3);
    expect(result[3]![3]).toBe(true);
    expect(result[2]![3]).toBe(true);
    expect(result[3]![2]).toBe(true);
  });

  it('edge cell (top row, middle) toggles 4 cells', () => {
    const g = createEmptyGrid(5);
    const result = toggleCell(g, 0, 2);
    // (0,2), (1,2), (0,1), (0,3) — no up neighbour
    expect(countLit(result)).toBe(4);
  });

  it('does not mutate the original grid', () => {
    const g = createEmptyGrid(3);
    const result = toggleCell(g, 1, 1);
    // Original should still be all OFF
    expect(countLit(g)).toBe(0);
    expect(countLit(result)).toBe(5);
  });
});

// =============================================================================
// isSolved
// =============================================================================

describe('isSolved', () => {
  it('empty grid is solved', () => {
    expect(isSolved(createEmptyGrid(3))).toBe(true);
    expect(isSolved(createEmptyGrid(5))).toBe(true);
  });

  it('grid with any ON cell is not solved', () => {
    const g = createEmptyGrid(3);
    g[0]![0] = true;
    expect(isSolved(g)).toBe(false);
  });

  it('grid with all ON cells is not solved', () => {
    const g = Array.from({ length: 3 }, () => [true, true, true]);
    expect(isSolved(g)).toBe(false);
  });
});

// =============================================================================
// Double press — XOR / self-cancellation
// =============================================================================

describe('double press cancellation (XOR property)', () => {
  it('pressing the same cell twice returns to original state', () => {
    const g = createEmptyGrid(5);
    // Start from some non-trivial state
    let grid = toggleCell(g, 2, 2);
    grid = toggleCell(grid, 0, 0);

    // Snapshot
    const snapshot = grid.map((r) => [...r]);

    // Press (1,1) twice
    grid = toggleCell(grid, 1, 1);
    grid = toggleCell(grid, 1, 1);

    expect(grid).toEqual(snapshot);
  });

  it('applying the same move set twice restores the original grid', () => {
    const g = createEmptyGrid(4);
    const moves: [number, number][] = [
      [0, 0],
      [1, 2],
      [3, 3],
    ];
    const after = applyMoves(g, moves);
    expect(isSolved(after)).toBe(false);
    const restored = applyMoves(after, moves);
    expect(isSolved(restored)).toBe(true);
  });
});

// =============================================================================
// Puzzle generation & solvability
// =============================================================================

describe('generatePuzzle', () => {
  it('generates a non-trivial puzzle (at least one cell ON)', () => {
    for (const size of [3, 4, 5]) {
      const puzzle = generatePuzzle(size);
      expect(isSolved(puzzle)).toBe(false);
      expect(countLit(puzzle)).toBeGreaterThan(0);
    }
  });

  it('generated puzzle has correct dimensions', () => {
    for (const size of [2, 3, 4, 5]) {
      const puzzle = generatePuzzle(size);
      expect(puzzle).toHaveLength(size);
      for (const row of puzzle) {
        expect(row).toHaveLength(size);
      }
    }
  });

  it('puzzle is solvable (reverse generation guarantees this)', () => {
    // Since the puzzle was generated by applying toggles to an empty grid,
    // applying the same toggles should solve it.
    // We can't know which toggles were used (random), but we can verify
    // the fundamental property: any puzzle generated this way IS solvable.
    //
    // We test indirectly: brute-force solve for small grids (3x3 = 9 cells = 512 combos)
    for (let trial = 0; trial < 5; trial++) {
      const puzzle = generatePuzzle(3);
      const solved = bruteForceSolve3x3(puzzle);
      expect(solved).toBe(true);
    }
  });

  it('different calls produce different puzzles (with high probability)', () => {
    const puzzles = Array.from({ length: 10 }, () => generatePuzzle(4));
    const serialized = puzzles.map((p) => JSON.stringify(p));
    const unique = new Set(serialized);
    // With 10 random 4x4 puzzles, we expect at least 2 distinct ones
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('forces non-trivial puzzle when random clicks cancel out to solved state', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      // size=1 with deterministic random produces two identical clicks first
      // (state would be solved), then the safeguard flips one extra cell.
      const puzzle = generatePuzzle(1);
      expect(isSolved(puzzle)).toBe(false);
      expect(countLit(puzzle)).toBe(1);
    } finally {
      Math.random = originalRandom;
    }
  });
});

// =============================================================================
// Grid sizes
// =============================================================================

describe('grid sizes', () => {
  it('3x3, 5x5, 7x7 grids work correctly with toggleCell', () => {
    for (const size of [3, 5, 7]) {
      const g = createEmptyGrid(size);
      // Toggle center
      const mid = Math.floor(size / 2);
      const result = toggleCell(g, mid, mid);
      // Center cell should have all 4 neighbours inside the grid
      expect(result[mid]![mid]).toBe(true);
      expect(countLit(result)).toBe(5);
    }
  });

  it('clampGridSize respects bounds', () => {
    expect(clampGridSize(1)).toBe(MIN_GRID_SIZE);
    expect(clampGridSize(0)).toBe(MIN_GRID_SIZE);
    expect(clampGridSize(3)).toBe(3);
    expect(clampGridSize(10)).toBe(MAX_GRID_SIZE);
    expect(clampGridSize(2.7)).toBe(3);
  });

  it('gridSizeLabel formats correctly', () => {
    expect(gridSizeLabel(3)).toBe('3x3');
    expect(gridSizeLabel(5)).toBe('5x5');
  });
});

// =============================================================================
// Move counting
// =============================================================================

describe('move counting via applyMoves', () => {
  it('counts moves correctly (one move per call)', () => {
    const moves: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    expect(moves.length).toBe(3);

    let grid = createEmptyGrid(3);
    let moveCount = 0;
    for (const [r, c] of moves) {
      grid = toggleCell(grid, r, c);
      moveCount++;
    }
    expect(moveCount).toBe(3);
  });

  it('applyMoves applies all moves in order', () => {
    const grid = createEmptyGrid(3);
    // Single move at center
    const result = applyMoves(grid, [[1, 1]]);
    expect(countLit(result)).toBe(5);
  });
});

// =============================================================================
// Win detection
// =============================================================================

describe('win detection', () => {
  it('all cells OFF = win', () => {
    expect(isSolved(createEmptyGrid(3))).toBe(true);
    expect(isSolved(createEmptyGrid(5))).toBe(true);
  });

  it('single cell ON = not won', () => {
    const g = createEmptyGrid(4);
    g[2]![2] = true;
    expect(isSolved(g)).toBe(false);
  });

  it('solving a puzzle by reversing the generation clicks', () => {
    // Generate a puzzle by known clicks, then apply the same clicks to solve
    const size = 4;
    const clicks: [number, number][] = [
      [0, 1],
      [2, 3],
      [1, 1],
      [3, 0],
    ];
    let grid = createEmptyGrid(size);
    grid = applyMoves(grid, clicks);
    expect(isSolved(grid)).toBe(false);

    // Apply the same clicks again — XOR property means we get back to all-OFF
    grid = applyMoves(grid, clicks);
    expect(isSolved(grid)).toBe(true);
  });
});

// =============================================================================
// Helper: brute-force solver for 3x3 (used in solvability test)
// =============================================================================

function bruteForceSolve3x3(puzzle: boolean[][]): boolean {
  // Each cell can be pressed 0 or 1 times (pressing twice cancels out).
  // 3x3 = 9 cells = 2^9 = 512 combinations.
  const size = 3;
  for (let mask = 0; mask < 1 << (size * size); mask++) {
    let grid = puzzle.map((r) => [...r]);
    for (let bit = 0; bit < size * size; bit++) {
      if (mask & (1 << bit)) {
        const r = Math.floor(bit / size);
        const c = bit % size;
        grid = toggleCell(grid, r, c);
      }
    }
    if (isSolved(grid)) return true;
  }
  return false;
}
