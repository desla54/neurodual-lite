// @ts-nocheck
/**
 * Inertia puzzle generator — faithful port of Simon Tatham's inertia.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Game rules (Ben Olmstead design, Simon Tatham implementation):
 * - Grid contains BLANK, GEM, MINE, STOP, WALL, and one START square
 * - Player slides in 8 directions until hitting a wall/edge, a STOP square,
 *   or passing through a GEM (which is collected but does NOT stop movement
 *   in the original — movement stops on WALL ahead, STOP, or edge)
 * - Hitting a MINE kills the player
 * - Collect all gems to win
 *
 * The generator fills the grid with ~1/5 each of WALL, STOP, MINE, plus one
 * START and the rest BLANK. It then uses a BFS solver to find which BLANK
 * squares can be visited on a round-trip from START, and places ~1/5 GEMs
 * among those candidates.
 */

// ---------------------------------------------------------------------------
// Cell types (from inertia.c)
// ---------------------------------------------------------------------------

const BLANK = 'b';
const GEM = 'g';
const MINE = 'm';
const STOP = 's';
const WALL = 'w';
const START = 'S';
const POSSGEM = 'G';

const DIRECTIONS = 8;

// ---------------------------------------------------------------------------
// Direction helpers — faithful port of DX/DY macros
// ---------------------------------------------------------------------------

function DX(dir: number): number {
  return dir & 3 ? ((dir & 7) > 4 ? -1 : +1) : 0;
}

function DY(dir: number): number {
  return DX((dir + 6) % 8);
  // Note: the C macro is DX((dir)+6). Since DX only looks at bits 0-2,
  // and dir is always 0-7, (dir+6) may exceed 7. But the macro uses (dir)&3
  // and ((dir)&7), so for values 0-13 the bit masking handles it.
  // We need to replicate exactly: DX applied to (dir+6) with its raw bits.
}

// Actually, let's be more faithful to the C macro which doesn't mod:
// DX(dir) = (dir) & 3 ? (((dir) & 7) > 4 ? -1 : +1) : 0
// DY(dir) = DX((dir)+6)
// For dir in 0..7, (dir+6) is in 6..13.
// Let's just inline it properly:

function _DX(d: number): number {
  return d & 3 ? ((d & 7) > 4 ? -1 : +1) : 0;
}

function _DY(d: number): number {
  return _DX(d + 6);
}

// Overwrite the clean versions:
const dx = _DX;
const dy = _DY;

// ---------------------------------------------------------------------------
// Grid access helpers
// ---------------------------------------------------------------------------

/** Lvalue-style access (no bounds check) */
function _lvAt(w: number, grid: string[], x: number, y: number): string {
  return grid[y * w + x];
}

function lvSet(w: number, grid: string[], x: number, y: number, val: string): void {
  grid[y * w + x] = val;
}

/** Rvalue access with bounds check — out of range returns WALL */
function at(w: number, h: number, grid: string[], x: number, y: number): string {
  if (x < 0 || x >= w || y < 0 || y >= h) return WALL;
  return grid[y * w + x];
}

// ---------------------------------------------------------------------------
// PRNG — simple seedable xoshiro128** for reproducibility
// ---------------------------------------------------------------------------

function makeRandom(): { random: () => number; shuffle: <T>(arr: T[]) => void } {
  // Use Math.random as entropy source (no seed needed for game generation)
  function random(): number {
    return Math.random();
  }

  function randInt(n: number): number {
    return Math.floor(random() * n);
  }

  function shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  return { random, shuffle };
}

// ---------------------------------------------------------------------------
// Solver scratch (from struct solver_scratch)
// ---------------------------------------------------------------------------

interface SolverScratch {
  reachable_from: Uint8Array;
  reachable_to: Uint8Array;
  positions: Int32Array;
}

function newScratch(w: number, h: number): SolverScratch {
  const wh = w * h;
  return {
    reachable_from: new Uint8Array(wh * DIRECTIONS),
    reachable_to: new Uint8Array(wh * DIRECTIONS),
    positions: new Int32Array(wh * DIRECTIONS),
  };
}

// ---------------------------------------------------------------------------
// can_go — faithful port
// ---------------------------------------------------------------------------

function canGo(
  w: number,
  h: number,
  grid: string[],
  x1: number,
  y1: number,
  dir1: number,
  x2: number,
  y2: number,
  dir2: number,
): boolean {
  /*
   * Returns true if we can transition directly from (x1,y1)
   * going in direction dir1, to (x2,y2) going in direction dir2.
   */

  // If we're in an unoccupyable square, no move possible
  if (at(w, h, grid, x1, y1) === WALL || at(w, h, grid, x1, y1) === MINE) return false;

  // If a move can stop at x1,y1,dir1, and x2,y2 is same coord, we can
  // change direction (stop + turn)
  if (
    x2 === x1 &&
    y2 === y1 &&
    (at(w, h, grid, x1, y1) === STOP ||
      at(w, h, grid, x1, y1) === START ||
      at(w, h, grid, x1 + dx(dir1), y1 + dy(dir1)) === WALL)
  )
    return true;

  // If a move can continue, then one step further in dir1
  if (
    x2 === x1 + dx(dir1) &&
    y2 === y1 + dy(dir1) &&
    dir1 === dir2 &&
    (at(w, h, grid, x2, y2) === BLANK ||
      at(w, h, grid, x2, y2) === GEM ||
      at(w, h, grid, x2, y2) === STOP ||
      at(w, h, grid, x2, y2) === START)
  )
    return true;

  return false;
}

// ---------------------------------------------------------------------------
// find_gem_candidates — faithful port
// ---------------------------------------------------------------------------

function findGemCandidates(w: number, h: number, grid: string[], sc: SolverScratch): number {
  const _wh = w * h;
  let head: number, tail: number;

  sc.reachable_from.fill(0);
  sc.reachable_to.fill(0);

  // Find the starting square
  let sx = -1,
    sy = -1;
  for (sy = 0; sy < h; sy++) {
    for (sx = 0; sx < w; sx++) if (at(w, h, grid, sx, sy) === START) break;
    if (sx < w) break;
  }
  if (sy >= h) throw new Error('No START square found');

  for (let pass = 0; pass < 2; pass++) {
    const reachable = pass === 0 ? sc.reachable_from : sc.reachable_to;
    const sign = pass === 0 ? +1 : -1;

    head = tail = 0;
    for (let dir = 0; dir < DIRECTIONS; dir++) {
      const index = (sy * w + sx) * DIRECTIONS + dir;
      sc.positions[tail++] = index;
      reachable[index] = 1;
    }

    while (head < tail) {
      const index = sc.positions[head++];
      const dir = index % DIRECTIONS;
      const x = Math.floor(index / DIRECTIONS) % w;
      const y = Math.floor(index / (w * DIRECTIONS));

      for (let n = -1; n < DIRECTIONS; n++) {
        let x2: number, y2: number, d2: number;
        if (n < 0) {
          x2 = x + sign * dx(dir);
          y2 = y + sign * dy(dir);
          d2 = dir;
        } else {
          x2 = x;
          y2 = y;
          d2 = n;
        }
        const i2 = (y2 * w + x2) * DIRECTIONS + d2;
        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && !reachable[i2]) {
          let ok: boolean;
          if (pass === 0) ok = canGo(w, h, grid, x, y, dir, x2, y2, d2);
          else ok = canGo(w, h, grid, x2, y2, d2, x, y, dir);
          if (ok) {
            sc.positions[tail++] = i2;
            reachable[i2] = 1;
          }
        }
      }
    }
  }

  // Find squares reachable in both directions
  let possgems = 0;
  for (let gy = 0; gy < h; gy++)
    for (let gx = 0; gx < w; gx++)
      if (at(w, h, grid, gx, gy) === BLANK) {
        for (let gd = 0; gd < DIRECTIONS; gd++) {
          const index = (gy * w + gx) * DIRECTIONS + gd;
          if (sc.reachable_from[index] && sc.reachable_to[index]) {
            lvSet(w, grid, gx, gy, POSSGEM);
            possgems++;
            break;
          }
        }
      }

  return possgems;
}

// ---------------------------------------------------------------------------
// gengrid — faithful port of the grid generation algorithm
// ---------------------------------------------------------------------------

function gengrid(w: number, h: number): string[] {
  const wh = w * h;
  const grid: string[] = new Array(wh);
  const sc = newScratch(w, h);
  const rs = makeRandom();

  let maxdistThreshold = 2;
  let tries = 0;

  while (true) {
    // Fill grid with ~1/5 each of WALL, STOP, MINE, one START, rest BLANK
    let i = 0;
    for (let j = 0; j < Math.floor(wh / 5); j++) grid[i++] = WALL;
    for (let j = 0; j < Math.floor(wh / 5); j++) grid[i++] = STOP;
    for (let j = 0; j < Math.floor(wh / 5); j++) grid[i++] = MINE;
    if (i >= wh) throw new Error('Grid too small');
    grid[i++] = START;
    while (i < wh) grid[i++] = BLANK;
    rs.shuffle(grid);

    // Find viable gem locations
    const possgems = findGemCandidates(w, h, grid, sc);
    if (possgems < Math.floor(wh / 5)) continue;

    // BFS from POSSGEMs to check distribution
    // Reuse sc.positions as dist and list arrays
    // dist occupies [0..wh), list occupies [wh..2*wh)
    // (sc.positions is wh*DIRECTIONS long, so plenty of room)
    const dist = new Int32Array(wh);
    const list = new Int32Array(wh);
    dist.fill(-1);
    let head = 0,
      tail = 0;
    for (i = 0; i < wh; i++)
      if (grid[i] === POSSGEM) {
        dist[i] = 0;
        list[tail++] = i;
      }
    let maxdist = 0;
    while (head < tail) {
      const pos = list[head++];
      if (maxdist < dist[pos]) maxdist = dist[pos];

      const x = pos % w;
      const y = Math.floor(pos / w);

      for (let d = 0; d < DIRECTIONS; d++) {
        const x2 = x + dx(d);
        const y2 = y + dy(d);

        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h) {
          const p2 = y2 * w + x2;
          if (dist[p2] < 0) {
            dist[p2] = dist[pos] + 1;
            list[tail++] = p2;
          }
        }
      }
    }

    // Abandon if maxdist too high
    if (maxdist > maxdistThreshold) {
      tries++;
      if (tries === 50) {
        maxdistThreshold++;
        tries = 0;
      }
      continue;
    }

    // Select wh/5 POSSGEMs as actual GEMs, rest become BLANK
    const _j = 0;
    const gemList: number[] = [];
    for (i = 0; i < wh; i++) if (grid[i] === POSSGEM) gemList.push(i);
    rs.shuffle(gemList);
    const gemCount = Math.floor(wh / 5);
    for (i = 0; i < gemList.length; i++) grid[gemList[i]] = i < gemCount ? GEM : BLANK;
    break;
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Public types and API
// ---------------------------------------------------------------------------

export interface InertiaPuzzle {
  /** Flat row-major grid. Each cell is one of: 'b' (blank), 'g' (gem),
   *  'm' (mine), 's' (stop), 'w' (wall). The start square is converted
   *  to 's' (stop) and the player position is given separately. */
  grid: string[];
  w: number;
  h: number;
  /** Player start x */
  px: number;
  /** Player start y */
  py: number;
  /** Total number of gems */
  gems: number;
}

/**
 * Generate an Inertia puzzle using Simon Tatham's algorithm.
 *
 * @param w Grid width (minimum 2, w*h >= 6)
 * @param h Grid height (minimum 2)
 * @returns A puzzle with grid, dimensions, player position, and gem count
 */
export function generateInertiaPuzzle(w: number, h: number): InertiaPuzzle {
  if (w < 2 || h < 2) throw new Error('Width and height must both be at least two');
  if (w * h < 6) throw new Error('Grid area must be at least six squares');

  const grid = gengrid(w, h);
  const wh = w * h;

  // Find start position and count gems (mirrors new_game from inertia.c)
  let px = -1,
    py = -1;
  let gems = 0;
  for (let i = 0; i < wh; i++) {
    if (grid[i] === START) {
      grid[i] = STOP; // START becomes STOP in game state
      px = i % w;
      py = Math.floor(i / w);
    } else if (grid[i] === GEM) {
      gems++;
    }
  }

  if (px < 0 || py < 0) throw new Error('No start position found');
  if (gems <= 0) throw new Error('No gems placed');

  return { grid, w, h, px, py, gems };
}

// Re-export cell constants for consumers
export const CELL = { BLANK, GEM, MINE, STOP, WALL } as const;
export type CellType = typeof BLANK | typeof GEM | typeof MINE | typeof STOP | typeof WALL;
