/**
 * Maze Navigation — pure game logic extracted from the training page.
 *
 * Planning / spatial navigation task:
 * - Navigate through procedurally generated mazes (DFS recursive backtracker)
 * - Path validation via BFS shortest path
 * - Move validation (wall checks, bounds checks)
 * - Scoring: time, step count, path efficiency (optimal / actual)
 */

// =============================================================================
// Types
// =============================================================================

export interface Walls {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface Cell {
  row: number;
  col: number;
  walls: Walls;
  visited: boolean;
}

export interface Maze {
  rows: number;
  cols: number;
  grid: Cell[][];
  optimalPath: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveResult {
  valid: boolean;
  /** New position after move (unchanged if invalid) */
  position: { row: number; col: number };
  /** True if move was blocked by a wall (not out of bounds) */
  wallHit: boolean;
  /** True if new position is the goal */
  reachedGoal: boolean;
}

export interface MazeResult {
  gridSize: number;
  steps: number;
  optimalSteps: number;
  timeMs: number;
  completed: boolean;
}

export interface MazeSummary {
  completedMazes: number;
  totalMazes: number;
  /** 0-100 — ratio of optimal steps to actual steps */
  avgEfficiency: number;
  /** Mean completion time in ms */
  avgTime: number;
  totalSteps: number;
  totalOptimal: number;
  totalWallHits: number;
  /** 0-1 — completed / total */
  accuracy: number;
  /** 0-100 */
  accuracyPct: number;
}

// =============================================================================
// Direction helpers
// =============================================================================

const WALL_MAP: Record<Direction, keyof Walls> = {
  up: 'top',
  down: 'bottom',
  left: 'left',
  right: 'right',
};

const DELTA_MAP: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

// =============================================================================
// Maze Generation (Recursive Backtracker / DFS)
// =============================================================================

/**
 * Create an empty grid of cells with all walls intact.
 */
export function createGrid(rows: number, cols: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      (grid[r] as Cell[])[c] = {
        row: r,
        col: c,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
      };
    }
  }
  return grid;
}

/**
 * Generate a perfect maze using DFS recursive backtracker.
 * Start = (0,0), Goal = (rows-1, cols-1).
 *
 * @param rows  Number of rows (must be >= 2)
 * @param cols  Number of columns (must be >= 2)
 * @param rng   Random number generator [0,1) — defaults to Math.random
 */
export function generateMaze(rows: number, cols: number, rng: () => number = Math.random): Maze {
  if (rows < 2 || cols < 2) {
    throw new Error('Maze must be at least 2x2');
  }

  const grid = createGrid(rows, cols);

  // DFS carve
  const stack: Cell[] = [];
  const start = grid[0]?.[0]!;
  start.visited = true;
  stack.push(start);

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const neighbors: Cell[] = [];
    const { row, col } = current;

    if (row > 0 && !grid[row - 1]?.[col]?.visited) neighbors.push(grid[row - 1]?.[col]!);
    if (row < rows - 1 && !grid[row + 1]?.[col]?.visited) neighbors.push(grid[row + 1]?.[col]!);
    if (col > 0 && !grid[row]?.[col - 1]?.visited) neighbors.push(grid[row]?.[col - 1]!);
    if (col < cols - 1 && !grid[row]?.[col + 1]?.visited) neighbors.push(grid[row]?.[col + 1]!);

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      const next = neighbors[Math.floor(rng() * neighbors.length)]!;
      // Remove wall between current and next
      if (next.row < current.row) {
        current.walls.top = false;
        next.walls.bottom = false;
      } else if (next.row > current.row) {
        current.walls.bottom = false;
        next.walls.top = false;
      } else if (next.col < current.col) {
        current.walls.left = false;
        next.walls.right = false;
      } else {
        current.walls.right = false;
        next.walls.left = false;
      }
      next.visited = true;
      stack.push(next);
    }
  }

  const optimalPath = bfsShortestPath(grid, rows, cols);

  return { rows, cols, grid, optimalPath };
}

// =============================================================================
// BFS Shortest Path
// =============================================================================

/**
 * Find the shortest path length from (0,0) to (rows-1, cols-1) using BFS.
 * Returns the number of steps (edges), not cells.
 */
export function bfsShortestPath(grid: Cell[][], rows: number, cols: number): number {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const queue: [number, number, number][] = [[0, 0, 0]];
  visited[0]![0] = true;

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const [r, c, dist] = entry;
    if (r === rows - 1 && c === cols - 1) return dist;

    const cell = grid[r]?.[c]!;
    const dirs: [number, number, keyof Walls][] = [
      [-1, 0, 'top'],
      [1, 0, 'bottom'],
      [0, -1, 'left'],
      [0, 1, 'right'],
    ];

    for (const [dr, dc, wall] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr]?.[nc] && !cell.walls[wall]) {
        visited[nr]![nc] = true;
        queue.push([nr, nc, dist + 1]);
      }
    }
  }

  return rows + cols - 2; // fallback (should never happen in a perfect maze)
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Check if there is a valid path from start to goal in the maze.
 * Uses BFS; returns true if goal is reachable.
 */
export function hasValidPath(maze: Maze): boolean {
  const { rows, cols, grid } = maze;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const queue: [number, number][] = [[0, 0]];
  visited[0]![0] = true;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (r === rows - 1 && c === cols - 1) return true;

    const cell = grid[r]?.[c]!;
    const dirs: [number, number, keyof Walls][] = [
      [-1, 0, 'top'],
      [1, 0, 'bottom'],
      [0, -1, 'left'],
      [0, 1, 'right'],
    ];

    for (const [dr, dc, wall] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr]?.[nc] && !cell.walls[wall]) {
        visited[nr]![nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return false;
}

// =============================================================================
// Move Validation
// =============================================================================

/**
 * Validate and execute a move from position in given direction.
 * Returns a MoveResult with validity, new position, wall info, and goal status.
 */
export function validateMove(
  maze: Maze,
  position: { row: number; col: number },
  direction: Direction,
): MoveResult {
  const { row, col } = position;
  const [dr, dc] = DELTA_MAP[direction];
  const nr = row + dr;
  const nc = col + dc;

  // Out of bounds
  if (nr < 0 || nr >= maze.rows || nc < 0 || nc >= maze.cols) {
    return { valid: false, position, wallHit: false, reachedGoal: false };
  }

  // Wall check
  const cell = maze.grid[row]?.[col]!;
  const wallKey = WALL_MAP[direction];
  if (cell.walls[wallKey]) {
    return { valid: false, position, wallHit: true, reachedGoal: false };
  }

  // Valid move
  const newPos = { row: nr, col: nc };
  const reachedGoal = nr === maze.rows - 1 && nc === maze.cols - 1;
  return { valid: true, position: newPos, wallHit: false, reachedGoal };
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Compute path efficiency: optimal steps / actual steps.
 * Returns a value in [0, 1] where 1 = perfect (took optimal path).
 * Returns 1 if optimalSteps is 0 (degenerate maze).
 */
export function computePathEfficiency(actualSteps: number, optimalSteps: number): number {
  if (optimalSteps <= 0 || actualSteps <= 0) return 1;
  return Math.min(1, optimalSteps / actualSteps);
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from an array of maze results.
 */
export function computeSummary(results: MazeResult[], totalWallHits: number): MazeSummary {
  if (results.length === 0) {
    return {
      completedMazes: 0,
      totalMazes: 0,
      avgEfficiency: 0,
      avgTime: 0,
      totalSteps: 0,
      totalOptimal: 0,
      totalWallHits,
      accuracy: 0,
      accuracyPct: 0,
    };
  }

  const completedMazes = results.filter((r) => r.completed).length;
  const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);
  const totalOptimal = results.reduce((sum, r) => sum + r.optimalSteps, 0);
  const avgEfficiency = totalSteps > 0 ? Math.round((totalOptimal / totalSteps) * 100) : 0;
  const times = results.map((r) => r.timeMs);
  const avgTime =
    times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  const accuracy = completedMazes / results.length;

  return {
    completedMazes,
    totalMazes: results.length,
    avgEfficiency,
    avgTime,
    totalSteps,
    totalOptimal,
    totalWallHits,
    accuracy,
    accuracyPct: Math.round(accuracy * 100),
  };
}
