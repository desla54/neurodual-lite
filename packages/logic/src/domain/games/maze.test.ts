import { describe, it, expect } from 'bun:test';
import {
  type Maze,
  type MazeResult,
  generateMaze,
  createGrid,
  bfsShortestPath,
  hasValidPath,
  validateMove,
  computePathEfficiency,
  computeSummary,
} from './maze';

// =============================================================================
// Helpers
// =============================================================================

/** Deterministic seeded RNG for reproducible tests. */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function makeMazeResult(overrides: Partial<MazeResult> = {}): MazeResult {
  return {
    gridSize: 5,
    steps: 10,
    optimalSteps: 8,
    timeMs: 5000,
    completed: true,
    ...overrides,
  };
}

// =============================================================================
// 1. Grid creation
// =============================================================================

describe('Maze — Grid creation', () => {
  it('creates grid with correct dimensions', () => {
    const grid = createGrid(5, 7);
    expect(grid).toHaveLength(5);
    for (const row of grid) {
      expect(row).toHaveLength(7);
    }
  });

  it('all cells start with all walls and unvisited', () => {
    const grid = createGrid(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = grid[r]![c]!;
        expect(cell.walls).toEqual({
          top: true,
          right: true,
          bottom: true,
          left: true,
        });
        expect(cell.visited).toBe(false);
        expect(cell.row).toBe(r);
        expect(cell.col).toBe(c);
      }
    }
  });
});

// =============================================================================
// 2. Maze generation
// =============================================================================

describe('Maze — Generation', () => {
  it('generates a maze with correct dimensions', () => {
    const maze = generateMaze(5, 5);
    expect(maze.rows).toBe(5);
    expect(maze.cols).toBe(5);
    expect(maze.grid).toHaveLength(5);
    expect(maze.grid[0]).toHaveLength(5);
  });

  it('throws for mazes smaller than 2x2', () => {
    expect(() => generateMaze(1, 5)).toThrow('Maze must be at least 2x2');
    expect(() => generateMaze(5, 1)).toThrow('Maze must be at least 2x2');
    expect(() => generateMaze(1, 1)).toThrow('Maze must be at least 2x2');
  });

  it('marks all cells as visited after generation', () => {
    const maze = generateMaze(5, 5);
    for (const row of maze.grid) {
      for (const cell of row) {
        expect(cell.visited).toBe(true);
      }
    }
  });

  it('produces a perfect maze (all cells reachable, no loops)', () => {
    // A perfect maze with R*C cells has exactly R*C - 1 passages
    const maze = generateMaze(5, 5);
    let passages = 0;
    for (const row of maze.grid) {
      for (const cell of row) {
        // Count passages going right and down to avoid double-counting
        if (!cell.walls.right) passages++;
        if (!cell.walls.bottom) passages++;
      }
    }
    expect(passages).toBe(5 * 5 - 1);
  });

  it('generates different mazes with different RNG seeds', () => {
    const maze1 = generateMaze(5, 5, seededRng(42));
    const maze2 = generateMaze(5, 5, seededRng(99));

    // Compare wall structures — they should differ
    const walls1 = maze1.grid.flatMap((row) => row.map((c) => JSON.stringify(c.walls)));
    const walls2 = maze2.grid.flatMap((row) => row.map((c) => JSON.stringify(c.walls)));
    expect(walls1).not.toEqual(walls2);
  });

  it('produces reproducible mazes with same seed', () => {
    const maze1 = generateMaze(5, 5, seededRng(42));
    const maze2 = generateMaze(5, 5, seededRng(42));

    const walls1 = maze1.grid.flatMap((row) => row.map((c) => JSON.stringify(c.walls)));
    const walls2 = maze2.grid.flatMap((row) => row.map((c) => JSON.stringify(c.walls)));
    expect(walls1).toEqual(walls2);
  });

  it('computes a positive optimal path length', () => {
    const maze = generateMaze(5, 5);
    expect(maze.optimalPath).toBeGreaterThanOrEqual(8); // 5+5-2 = 8 minimum
  });

  it('works for rectangular (non-square) mazes', () => {
    const maze = generateMaze(3, 7);
    expect(maze.rows).toBe(3);
    expect(maze.cols).toBe(7);
    expect(hasValidPath(maze)).toBe(true);
  });
});

// =============================================================================
// 3. Path validation
// =============================================================================

describe('Maze — Path validation', () => {
  it('generated mazes always have a valid path', () => {
    for (let i = 0; i < 10; i++) {
      const maze = generateMaze(5, 5);
      expect(hasValidPath(maze)).toBe(true);
    }
  });

  it('larger mazes also have valid paths', () => {
    for (const size of [7, 9]) {
      const maze = generateMaze(size, size);
      expect(hasValidPath(maze)).toBe(true);
    }
  });

  it('returns false for a grid with all walls intact', () => {
    const grid = createGrid(3, 3);
    // Mark all as visited so it looks like a maze but has no passages
    for (const row of grid) {
      for (const cell of row) {
        cell.visited = true;
      }
    }
    const fakeMaze: Maze = { rows: 3, cols: 3, grid, optimalPath: 0 };
    expect(hasValidPath(fakeMaze)).toBe(false);
  });
});

// =============================================================================
// 4. BFS shortest path
// =============================================================================

describe('Maze — BFS shortest path', () => {
  it('optimal path is at least rows + cols - 2', () => {
    const maze = generateMaze(5, 5);
    expect(maze.optimalPath).toBeGreaterThanOrEqual(5 + 5 - 2);
  });

  it('optimal path matches BFS result', () => {
    const maze = generateMaze(7, 7);
    const bfs = bfsShortestPath(maze.grid, maze.rows, maze.cols);
    expect(maze.optimalPath).toBe(bfs);
  });
});

// =============================================================================
// 5. Move validation
// =============================================================================

describe('Maze — Move validation', () => {
  it('rejects moves out of bounds (top-left corner up)', () => {
    const maze = generateMaze(5, 5);
    const result = validateMove(maze, { row: 0, col: 0 }, 'up');
    expect(result.valid).toBe(false);
    expect(result.wallHit).toBe(false);
    expect(result.position).toEqual({ row: 0, col: 0 });
  });

  it('rejects moves out of bounds (bottom-right corner down)', () => {
    const maze = generateMaze(5, 5);
    const result = validateMove(maze, { row: 4, col: 4 }, 'down');
    expect(result.valid).toBe(false);
    expect(result.wallHit).toBe(false);
  });

  it('rejects moves into a wall', () => {
    // Create a grid where all walls are intact
    const grid = createGrid(3, 3);
    for (const row of grid) {
      for (const cell of row) {
        cell.visited = true;
      }
    }
    const maze: Maze = { rows: 3, cols: 3, grid, optimalPath: 4 };

    const result = validateMove(maze, { row: 1, col: 1 }, 'up');
    expect(result.valid).toBe(false);
    expect(result.wallHit).toBe(true);
    expect(result.position).toEqual({ row: 1, col: 1 });
  });

  it('accepts valid moves through open passages', () => {
    const maze = generateMaze(5, 5, seededRng(42));
    // The start cell (0,0) must have at least one open passage
    const startCell = maze.grid[0]![0]!;
    let foundValidMove = false;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const result = validateMove(maze, { row: 0, col: 0 }, dir);
      if (result.valid) {
        foundValidMove = true;
        expect(result.position).not.toEqual({ row: 0, col: 0 });
      }
    }
    expect(foundValidMove).toBe(true);
  });

  it('detects reaching the goal', () => {
    const maze = generateMaze(3, 3, seededRng(42));
    // Walk to the cell adjacent to goal and find the move that reaches it
    // We test by trying to move into (2,2) from an adjacent cell
    const goalCell = maze.grid[2]![2]!;

    // Check if top wall is open
    if (!goalCell.walls.top) {
      const result = validateMove(maze, { row: 1, col: 2 }, 'down');
      if (result.valid) {
        expect(result.reachedGoal).toBe(true);
      }
    }
    // Check if left wall is open
    if (!goalCell.walls.left) {
      const result = validateMove(maze, { row: 2, col: 1 }, 'right');
      if (result.valid) {
        expect(result.reachedGoal).toBe(true);
      }
    }
  });

  it('non-goal moves have reachedGoal = false', () => {
    const maze = generateMaze(5, 5, seededRng(42));
    const startCell = maze.grid[0]![0]!;
    for (const dir of ['down', 'right'] as const) {
      const result = validateMove(maze, { row: 0, col: 0 }, dir);
      if (result.valid) {
        expect(result.reachedGoal).toBe(false);
      }
    }
  });
});

// =============================================================================
// 6. Path efficiency
// =============================================================================

describe('Maze — Path efficiency', () => {
  it('returns 1 for optimal path', () => {
    expect(computePathEfficiency(8, 8)).toBe(1);
  });

  it('returns 0.5 when taking twice the optimal steps', () => {
    expect(computePathEfficiency(16, 8)).toBe(0.5);
  });

  it('returns 1 for edge case (0 optimal steps)', () => {
    expect(computePathEfficiency(5, 0)).toBe(1);
  });

  it('returns 1 for edge case (0 actual steps)', () => {
    expect(computePathEfficiency(0, 8)).toBe(1);
  });

  it('caps at 1 (cannot exceed 100% efficiency)', () => {
    // This would be impossible in practice but tests the guard
    expect(computePathEfficiency(5, 10)).toBe(1);
  });
});

// =============================================================================
// 7. Summary computation
// =============================================================================

describe('Maze — Summary', () => {
  it('handles empty results', () => {
    const summary = computeSummary([], 0);
    expect(summary.completedMazes).toBe(0);
    expect(summary.totalMazes).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgEfficiency).toBe(0);
  });

  it('computes accuracy from completed mazes', () => {
    const results = [
      makeMazeResult({ completed: true }),
      makeMazeResult({ completed: true }),
      makeMazeResult({ completed: false }),
      makeMazeResult({ completed: true }),
    ];
    const summary = computeSummary(results, 5);
    expect(summary.completedMazes).toBe(3);
    expect(summary.totalMazes).toBe(4);
    expect(summary.accuracy).toBe(0.75);
    expect(summary.accuracyPct).toBe(75);
  });

  it('computes average efficiency', () => {
    const results = [
      makeMazeResult({ steps: 10, optimalSteps: 8 }),
      makeMazeResult({ steps: 20, optimalSteps: 12 }),
    ];
    // total steps = 30, total optimal = 20
    // efficiency = 20/30 * 100 = 67
    const summary = computeSummary(results, 0);
    expect(summary.avgEfficiency).toBe(67);
    expect(summary.totalSteps).toBe(30);
    expect(summary.totalOptimal).toBe(20);
  });

  it('computes average time', () => {
    const results = [makeMazeResult({ timeMs: 4000 }), makeMazeResult({ timeMs: 6000 })];
    const summary = computeSummary(results, 0);
    expect(summary.avgTime).toBe(5000);
  });

  it('tracks total wall hits', () => {
    const results = [makeMazeResult()];
    const summary = computeSummary(results, 12);
    expect(summary.totalWallHits).toBe(12);
  });

  it('100% accuracy when all mazes completed', () => {
    const results = [makeMazeResult({ completed: true }), makeMazeResult({ completed: true })];
    const summary = computeSummary(results, 0);
    expect(summary.accuracyPct).toBe(100);
  });

  it('0% accuracy when no mazes completed', () => {
    const results = [makeMazeResult({ completed: false }), makeMazeResult({ completed: false })];
    const summary = computeSummary(results, 0);
    expect(summary.accuracyPct).toBe(0);
  });
});
