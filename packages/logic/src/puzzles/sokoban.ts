/**
 * Sokoban puzzle generator — faithful port of Simon Tatham's sokoban.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Generates puzzles by working BACKWARDS (pulling barrels from targets),
 * which guarantees solvability. The algorithm:
 *
 * 1. Start with a grid of INITIAL cells surrounded by WALLs
 * 2. Place the player randomly
 * 3. Loop making inverse moves (pulls) using BFS with a min-heap
 *    - Enumerate all valid barrel-pulls
 *    - BFS from player position to find reachable pull sites
 *    - Pick a random pull, carve the path, execute the inverse move
 * 4. At the end, convert remaining INITIAL squares to WALL
 */

// ---------------------------------------------------------------------------
// Cell constants
// ---------------------------------------------------------------------------

export const WALL = 0;
export const SPACE = 1;
export const TARGET = 2;
export const BARREL = 3;
export const BARRELTARGET = 4;
export const PLAYER = 5;
export const PLAYERTARGET = 6;

/** Internal-only cell used during generation */
const INITIAL = 7;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SokobanPuzzle {
  grid: Uint8Array; // flat array, row-major
  w: number;
  h: number;
  px: number; // player x
  py: number; // player y
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const SOKOBAN_PRESETS = {
  easy: { w: 7, h: 6, moves: 15 },
  medium: { w: 9, h: 8, moves: 40 },
  hard: { w: 12, h: 10, moves: 80 },
} as const;

// ---------------------------------------------------------------------------
// Direction helpers (matching C's DX/DY macros)
// ---------------------------------------------------------------------------

// d=0: left, d=1: up, d=2: right, d=3: down
const DX = [-1, 0, 1, 0] as const;
const DY = [0, -1, 0, 1] as const;

// ---------------------------------------------------------------------------
// Pull structure
// ---------------------------------------------------------------------------

interface Pull {
  /** Barrel origin x */
  ox: number;
  /** Barrel origin y */
  oy: number;
  /** Player destination x (where barrel moves to = where player was) */
  nx: number;
  /** Player destination y */
  ny: number;
  /** Cost score for this pull */
  score: number;
}

// ---------------------------------------------------------------------------
// Min-heap helpers (on an index array, keyed by dist[])
// ---------------------------------------------------------------------------

function heapSiftDown(heap: Int32Array, dist: Int32Array, size: number, i: number): void {
  while (true) {
    const lc = 2 * i + 1;
    const rc = 2 * i + 2;

    if (lc >= size) break;

    if (rc >= size) {
      // Only left child
      if (dist[heap[lc]!]! < dist[heap[i]!]!) {
        const tmp = heap[i]!;
        heap[i] = heap[lc]!;
        heap[lc] = tmp;
      }
      break;
    }

    // Two children
    if (dist[heap[i]!]! > dist[heap[lc]!]! || dist[heap[i]!]! > dist[heap[rc]!]!) {
      // Pick the smaller child
      if (dist[heap[lc]!]! > dist[heap[rc]!]!) {
        const tmp = heap[i]!;
        heap[i] = heap[rc]!;
        heap[rc] = tmp;
        i = rc;
      } else {
        const tmp = heap[i]!;
        heap[i] = heap[lc]!;
        heap[lc] = tmp;
        i = lc;
      }
    } else {
      break;
    }
  }
}

function heapSiftUp(heap: Int32Array, dist: Int32Array, i: number): void {
  while (i > 0) {
    const p = ((i - 1) / 2) | 0;
    if (dist[heap[p]!]! > dist[heap[i]!]!) {
      const tmp = heap[p]!;
      heap[p] = heap[i]!;
      heap[i] = tmp;
      i = p;
    } else {
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Core generation (port of sokoban_generate)
// ---------------------------------------------------------------------------

function sokobanGenerate(
  w: number,
  h: number,
  grid: Uint8Array,
  moves: number,
): { px: number; py: number } {
  const wh = w * h;

  const dist = new Int32Array(wh);
  const prev = new Int32Array(wh);
  const heap = new Int32Array(wh);

  // Pre-allocate pulls array (max 4 per cell)
  const pulls: Pull[] = [];

  // Configure initial grid: WALL border, INITIAL interior
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      grid[y * w + x] = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? WALL : INITIAL;
    }
  }

  // Place the player randomly in the interior
  const interiorSize = (w - 2) * (h - 2);
  const playerIdx = Math.floor(Math.random() * interiorSize);
  let px = 1 + (playerIdx % (w - 2));
  let py = 1 + ((playerIdx / (w - 2)) | 0);
  grid[py * w + px] = SPACE;

  // Main generation loop: each iteration tries to make one barrel-pull
  let movesLeft = moves;
  while (movesLeft-- >= 0) {
    // ---------------------------------------------------------------
    // 1. Enumerate all viable barrel-pulls
    // ---------------------------------------------------------------
    pulls.length = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let d = 0; d < 4; d++) {
          const dx = DX[d]!;
          const dy = DY[d]!;
          const nx = x + dx;
          const ny = y + dy;
          const npx = nx + dx;
          const npy = ny + dy;
          let score = 0;

          // (npx, npy) must be in bounds
          if (npx < 0 || npx >= w || npy < 0 || npy >= h) continue;

          // (x,y) must be a barrel or convertible to one
          const cellXY = grid[y * w + x]!;
          if (cellXY === BARREL || cellXY === BARRELTARGET) {
            // ok
          } else if (cellXY === INITIAL) {
            score += 10; // new_barrel_score
          } else {
            continue;
          }

          // (nx,ny) must be a space or convertible to one
          const cellNXNY = grid[ny * w + nx]!;
          if (cellNXNY === SPACE || cellNXNY === TARGET) {
            // ok
          } else if (cellNXNY === INITIAL) {
            score += 3; // new_space_score
          } else {
            continue;
          }

          // (npx,npy) must also be a space or convertible to one
          const cellNPXNPY = grid[npy * w + npx]!;
          if (cellNPXNPY === SPACE || cellNPXNPY === TARGET) {
            // ok
          } else if (cellNPXNPY === INITIAL) {
            score += 3; // new_space_score
          } else {
            continue;
          }

          pulls.push({ ox: x, oy: y, nx, ny, score });
        }
      }
    }

    if (pulls.length === 0) break;

    // ---------------------------------------------------------------
    // 2. BFS from player position using a min-heap (Dijkstra-like)
    //    Distance = number of INITIAL squares carved through
    // ---------------------------------------------------------------
    for (let i = 0; i < wh; i++) {
      dist[i] = -1;
      prev[i] = -1;
    }

    heap[0] = py * w + px;
    let heapsize = 1;
    dist[py * w + px] = 0;

    while (heapsize > 0) {
      // Extract min from heap
      const minPos: number = heap[0]!;
      const hx: number = minPos % w;
      const hy: number = (minPos / w) | 0;

      heapsize--;
      heap[0] = heap[heapsize]!;
      if (heapsize > 0) {
        heapSiftDown(heap, dist, heapsize, 0);
      }

      // Try all 4 directions
      for (let d = 0; d < 4; d++) {
        const nx: number = hx + DX[d]!;
        const ny: number = hy + DY[d]!;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

        const nPos = ny * w + nx;
        const cellN = grid[nPos]!;
        if (cellN !== SPACE && cellN !== TARGET && cellN !== INITIAL) continue;

        if (dist[nPos] === -1) {
          dist[nPos] = dist[hy * w + hx]! + (cellN === INITIAL ? 1 : 0);
          prev[nPos] = hy * w + hx;

          // Insert into heap and sift up
          heap[heapsize] = nPos;
          heapsize++;
          heapSiftUp(heap, dist, heapsize - 1);
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. Filter pulls by reachability and adjust scores
    // ---------------------------------------------------------------
    let j = 0;
    for (let i = 0; i < pulls.length; i++) {
      const pull = pulls[i]!;
      const pos = pull.ny * w + pull.nx;

      if (dist[pos]! < 0) continue; // unreachable

      // Check the nasty special case: barrel origin is on the path
      // to the pull site. If (ox,oy) is the prev of (nx,ny), the
      // INITIAL square can't be both BARRELTARGET and path-SPACE.
      if (prev[pos] === pull.oy * w + pull.ox) continue;

      pull.score += dist[pos]! * 3; // new_space_score per step
      pulls[j++] = pull;
    }
    pulls.length = j;

    if (pulls.length === 0) break;

    // ---------------------------------------------------------------
    // 4. Choose a random pull and execute it
    // ---------------------------------------------------------------
    const chosen = pulls[Math.floor(Math.random() * pulls.length)]!;

    // Carve the path from (nx,ny) back to player position
    {
      let cx = chosen.nx;
      let cy = chosen.ny;
      while (prev[cy * w + cx]! >= 0) {
        if (grid[cy * w + cx] === INITIAL) {
          grid[cy * w + cx] = SPACE;
        }
        const p: number = prev[cy * w + cx]!;
        cy = (p / w) | 0;
        cx = p % w;
      }
    }

    // Player's new position after the pull: opposite side of barrel from (nx,ny)
    const newPx = 2 * chosen.nx - chosen.ox;
    const newPy = 2 * chosen.ny - chosen.oy;

    if (grid[newPy * w + newPx] === INITIAL) {
      grid[newPy * w + newPx] = SPACE;
    }

    // Place barrel at (nx,ny)
    if (grid[chosen.ny * w + chosen.nx] === TARGET) {
      grid[chosen.ny * w + chosen.nx] = BARRELTARGET;
    } else {
      grid[chosen.ny * w + chosen.nx] = BARREL;
    }

    // Original barrel position becomes TARGET or SPACE
    if (grid[chosen.oy * w + chosen.ox] === BARREL) {
      grid[chosen.oy * w + chosen.ox] = SPACE;
    } else {
      // Was INITIAL (new barrel) or BARRELTARGET → becomes TARGET
      grid[chosen.oy * w + chosen.ox] = TARGET;
    }

    px = newPx;
    py = newPy;
  }

  // Place the player
  if (grid[py * w + px] === TARGET) {
    grid[py * w + px] = PLAYERTARGET;
  } else {
    grid[py * w + px] = PLAYER;
  }

  // Convert remaining INITIAL squares to WALL
  for (let i = 0; i < wh; i++) {
    if (grid[i] === INITIAL) {
      grid[i] = WALL;
    }
  }

  return { px, py };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a random Sokoban puzzle.
 *
 * @param w - Grid width (minimum 4)
 * @param h - Grid height (minimum 4)
 * @param moves - Number of inverse moves to attempt (defaults to w*h)
 */
export function generateSokoban(w: number, h: number, moves?: number): SokobanPuzzle {
  if (w < 4 || h < 4) {
    throw new Error('Width and height must both be at least 4');
  }

  const grid = new Uint8Array(w * h);
  const actualMoves = moves ?? w * h;
  const { px, py } = sokobanGenerate(w, h, grid, actualMoves);

  return { grid, w, h, px, py };
}

/**
 * Generate a Sokoban puzzle and return it in XSB format lines.
 *
 * XSB characters:
 *   # = wall
 *   (space) = floor
 *   . = target
 *   $ = barrel
 *   * = barrel on target
 *   @ = player
 *   + = player on target
 */
export function generateSokobanXSB(w: number, h: number, moves?: number): string[] {
  const puzzle = generateSokoban(w, h, moves);
  const lines: string[] = [];

  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const cell = puzzle.grid[y * w + x]!;
      switch (cell) {
        case WALL:
          line += '#';
          break;
        case SPACE:
          line += ' ';
          break;
        case TARGET:
          line += '.';
          break;
        case BARREL:
          line += '$';
          break;
        case BARRELTARGET:
          line += '*';
          break;
        case PLAYER:
          line += '@';
          break;
        case PLAYERTARGET:
          line += '+';
          break;
        default:
          line += '?';
          break;
      }
    }
    lines.push(line);
  }

  return lines;
}
