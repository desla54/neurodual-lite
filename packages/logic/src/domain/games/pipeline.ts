/**
 * Pipeline puzzle — pure game logic extracted from the training page.
 *
 * Spatial planning puzzle:
 * - Grid with a source (0,0) and destination (size-1, size-1)
 * - Pipe pieces with connections on [top, right, bottom, left]
 * - Player rotates pieces 90 degrees clockwise to form a connected path
 */

// =============================================================================
// Types
// =============================================================================

/** Pipe connections: [top, right, bottom, left] */
export type Connections = [boolean, boolean, boolean, boolean];

export type PipeType = 'straight' | 'corner' | 't-junction' | 'cross' | 'empty';

export interface PipeCell {
  type: PipeType;
  /** Current rotation (0, 1, 2, 3) — each step = 90 degrees clockwise */
  rotation: number;
  isSource: boolean;
  isDestination: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Base connections for each pipe type at rotation 0 */
export const BASE_CONNECTIONS: Record<PipeType, Connections> = {
  straight: [true, false, true, false], // vertical: top-bottom
  corner: [true, true, false, false], // top-right
  't-junction': [true, true, false, true], // top, right, left (no bottom)
  cross: [true, true, true, true],
  empty: [false, false, false, false],
};

/** Direction offsets: [top, right, bottom, left] → [dr, dc] */
export const DIR_OFFSETS: [number, number][] = [
  [-1, 0], // top
  [0, 1], // right
  [1, 0], // bottom
  [0, -1], // left
];

/** Opposite direction index */
export const OPPOSITE = [2, 3, 0, 1] as const;

// =============================================================================
// Core Functions
// =============================================================================

/** Get the actual connections for a pipe cell after rotation */
export function getConnections(cell: PipeCell): Connections {
  const base = BASE_CONNECTIONS[cell.type];
  const r = ((cell.rotation % 4) + 4) % 4;
  const result: Connections = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    result[(i + r) % 4] = base[i] as (typeof base)[number];
  }
  return result;
}

/** Rotate a pipe cell 90 degrees clockwise, returns a new cell */
export function rotatePipe(cell: PipeCell): PipeCell {
  return { ...cell, rotation: (cell.rotation + 1) % 4 };
}

/** Get direction from (r1,c1) to (r2,c2): 0=top, 1=right, 2=bottom, 3=left, -1=invalid */
export function getDirection(r1: number, c1: number, r2: number, c2: number): number {
  if (r2 < r1) return 0;
  if (c2 > c1) return 1;
  if (r2 > r1) return 2;
  if (c2 < c1) return 3;
  return -1;
}

/** Find the pipe type and rotation that produces the given connections */
export function findPipeForConnections(target: Connections): { type: PipeType; rotation: number } {
  const count = target.filter(Boolean).length;

  if (count === 0) return { type: 'empty', rotation: 0 };
  if (count === 4) return { type: 'cross', rotation: 0 };

  const types: PipeType[] =
    count === 2 ? ['straight', 'corner'] : count === 3 ? ['t-junction'] : ['straight'];

  for (const type of types) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const cell: PipeCell = { type, rotation, isSource: false, isDestination: false };
      const conns = getConnections(cell);
      if (conns.every((v, i) => v === target[i])) {
        return { type, rotation };
      }
    }
  }

  return { type: 'straight', rotation: 0 };
}

/** Grid size derived from nLevel: nLevel 1 → 5x5, nLevel 2 → 6x6, nLevel 3 → 7x7 */
export function gridSizeForLevel(nLevel: number): number {
  return nLevel + 4;
}

// =============================================================================
// Connectivity Check (BFS)
// =============================================================================

/** Check connectivity from source (0,0). Returns set of connected cell keys and whether destination is reached. */
export function findConnectedPath(grid: PipeCell[][]): {
  connected: Set<string>;
  reachesDestination: boolean;
} {
  const size = grid.length;
  const connected = new Set<string>();
  const queue: [number, number][] = [[0, 0]];
  connected.add('0,0');

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const [r, c] = entry;
    const cell = (grid[r] as PipeCell[])[c] as PipeCell;
    const conns = getConnections(cell);

    for (let dir = 0; dir < 4; dir++) {
      if (!conns[dir]) continue;

      const [dr, dc] = DIR_OFFSETS[dir] as [number, number];
      const nr = r + dr;
      const nc = c + dc;

      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (connected.has(`${nr},${nc}`)) continue;

      const neighbor = (grid[nr] as PipeCell[])[nc] as PipeCell;
      const neighborConns = getConnections(neighbor);
      if (neighborConns[OPPOSITE[dir] as number]) {
        connected.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }

  const dest = `${size - 1},${size - 1}`;
  return { connected, reachesDestination: connected.has(dest) };
}

// =============================================================================
// Path Generation
// =============================================================================

/** Fallback: simple L-shaped path */
export function generateSimplePath(size: number): [number, number][] {
  const path: [number, number][] = [];
  if (Math.random() < 0.5) {
    for (let c = 0; c < size; c++) path.push([0, c]);
    for (let r = 1; r < size; r++) path.push([r, size - 1]);
  } else {
    for (let r = 0; r < size; r++) path.push([r, 0]);
    for (let c = 1; c < size; c++) path.push([size - 1, c]);
  }
  return path;
}

/** Generate a path from (0,0) to (size-1, size-1) using biased random walk */
export function generatePath(size: number): [number, number][] {
  const visited = new Set<string>();
  const path: [number, number][] = [[0, 0]];
  visited.add('0,0');

  let [cr, cc] = [0, 0];
  const target = [size - 1, size - 1];
  const maxAttempts = 1000;
  let attempts = 0;

  while (cr !== target[0] || cc !== target[1]) {
    attempts++;
    if (attempts > maxAttempts) {
      return generateSimplePath(size);
    }

    const moves: [number, number][] = [];
    for (const [dr, dc] of DIR_OFFSETS) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited.has(`${nr},${nc}`)) {
        moves.push([nr, nc]);
      }
    }

    if (moves.length === 0) {
      path.pop();
      if (path.length === 0) return generateSimplePath(size);
      const prev = path[path.length - 1] as [number, number];
      cr = prev[0];
      cc = prev[1];
      continue;
    }

    moves.sort((a, b) => {
      const distA = Math.abs(a[0] - (target[0] as number)) + Math.abs(a[1] - (target[1] as number));
      const distB = Math.abs(b[0] - (target[0] as number)) + Math.abs(b[1] - (target[1] as number));
      return distA - distB;
    });

    const pick = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * moves.length);
    const [nr, nc] = moves[pick] as [number, number];
    path.push([nr, nc]);
    visited.add(`${nr},${nc}`);
    cr = nr;
    cc = nc;
  }

  return path;
}

// =============================================================================
// Puzzle Generation
// =============================================================================

/**
 * Generate a valid puzzle:
 * 1. Create a random walk path from source to destination
 * 2. Place correct pipe pieces along the path
 * 3. Fill remaining cells with random pipe pieces
 * 4. Randomly rotate ALL pieces to create the puzzle
 *
 * Returns { grid, solutionGrid, path }.
 * - solutionGrid has the correct rotations before scrambling
 * - path is the ordered list of cells forming the intended route
 *
 * Note: path endpoint cells (source/dest) have only 1 path neighbor, so
 * `findPipeForConnections` may assign them a pipe type with an extra opening
 * (e.g. straight instead of dead-end). The game relies on visual solving,
 * not on a deterministic solution grid.
 */
export function generatePuzzle(size: number): {
  grid: PipeCell[][];
  solutionGrid: PipeCell[][];
  path: [number, number][];
} {
  const grid: PipeCell[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ({
      type: 'empty' as const,
      rotation: 0,
      isSource: r === 0 && c === 0,
      isDestination: r === size - 1 && c === size - 1,
    })),
  );

  const path = generatePath(size);

  for (let i = 0; i < path.length; i++) {
    const [r, c] = path[i] as [number, number];
    const prev = i > 0 ? (path[i - 1] as [number, number]) : null;
    const next = i < path.length - 1 ? (path[i + 1] as [number, number]) : null;

    const connections: Connections = [false, false, false, false];
    if (prev) {
      const dir = getDirection(r, c, prev[0], prev[1]);
      if (dir !== -1) connections[dir] = true;
    }
    if (next) {
      const dir = getDirection(r, c, next[0], next[1]);
      if (dir !== -1) connections[dir] = true;
    }

    const { type, rotation } = findPipeForConnections(connections);
    (grid[r] as PipeCell[])[c] = {
      type,
      rotation,
      isSource: r === 0 && c === 0,
      isDestination: r === size - 1 && c === size - 1,
    };
  }

  const pipeTypes: PipeType[] = ['straight', 'corner', 't-junction', 'cross'];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((grid[r] as PipeCell[])[c]?.type === 'empty') {
        const type = pipeTypes[Math.floor(Math.random() * pipeTypes.length)] as PipeType;
        (grid[r] as PipeCell[])[c] = {
          type,
          rotation: Math.floor(Math.random() * 4),
          isSource: false,
          isDestination: false,
        };
      }
    }
  }

  // Deep-copy the solution before scrambling
  const solutionGrid: PipeCell[][] = grid.map((row) => row.map((cell) => ({ ...cell })));

  // Scramble all pieces
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = (grid[r] as PipeCell[])[c] as PipeCell;
      if (cell.type !== 'cross') {
        cell.rotation = Math.floor(Math.random() * 4);
      }
    }
  }

  return { grid, solutionGrid, path };
}

/**
 * Build a grid from the solution (unscrambled rotations).
 * Useful for testing that the solution grid itself is valid.
 */
export function isGridFullyConnected(grid: PipeCell[][]): boolean {
  return findConnectedPath(grid).reachesDestination;
}
