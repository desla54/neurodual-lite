/**
 * Flood puzzle algorithms — faithful port of Simon Tatham's flood.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * The flood-fill point is always (0, 0) (top-left corner).
 * Grid is stored as a flat row-major array of color indices.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FloodPuzzle {
  grid: number[]; // flat array, row-major
  w: number;
  h: number;
  colors: number;
  movelimit: number;
}

// ---------------------------------------------------------------------------
// Constants (from flood.c)
// ---------------------------------------------------------------------------

/** Fill point — top-left corner, matching C's FILLX/FILLY = 0 */
const FILLX = 0;
const FILLY = 0;

/**
 * Recursion depth for the solver.
 * From flood.c: "depth 3 was a noticeable improvement on 2,
 * but 4 only negligibly better than 3."
 */
const RECURSION_DEPTH = 3;

// ---------------------------------------------------------------------------
// Solver scratch space (mirrors struct solver_scratch)
// ---------------------------------------------------------------------------

interface SolverScratch {
  queue0: Int32Array;
  queue1: Int32Array;
  dist: Int32Array;
  grid: Int32Array;
  grid2: Int32Array;
  /** RECURSION_DEPTH grids, each wh elements */
  rgrids: Int32Array;
}

function newScratch(w: number, h: number): SolverScratch {
  const wh = w * h;
  return {
    queue0: new Int32Array(wh),
    queue1: new Int32Array(wh),
    dist: new Int32Array(wh),
    grid: new Int32Array(wh),
    grid2: new Int32Array(wh),
    rgrids: new Int32Array(wh * RECURSION_DEPTH),
  };
}

// ---------------------------------------------------------------------------
// search() — BFS distance computation
// ---------------------------------------------------------------------------

/**
 * Search a grid to find the most distant square(s).
 *
 * The BFS uses a two-queue trick: squares at the *same* flood-fill
 * distance from (x0,y0) share a queue, and the distance increments
 * each time the current queue is exhausted.
 *
 * Returns { dist, number, control }:
 *   dist    — maximum distance found
 *   number  — how many squares are at that maximum distance
 *   control — how many squares are at distance 0 (the controlled region)
 */
function search(
  w: number,
  h: number,
  grid: Int32Array,
  x0: number,
  y0: number,
  scratch: SolverScratch,
): { dist: number; number: number; control: number } {
  const wh = w * h;
  const distArr = scratch.dist;
  const q0 = scratch.queue0;
  const q1 = scratch.queue1;

  // Two queues addressed via qcurr flag
  const queues: [Int32Array, Int32Array] = [q0, q1];

  for (let i = 0; i < wh; i++) distArr[i] = -1;

  const startPos = y0 * w + x0;
  queues[0][0] = startPos;
  queues[1][0] = startPos;
  distArr[startPos] = 0;

  let currdist = 0;
  let qcurr = 0;
  let qtail = 0;
  let qhead = 1;
  let qnext = 1;
  let remaining = wh - 1;
  let control = 0;

  // Direction offsets: right, down, left, up (matching C's dir loop)
  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  while (true) {
    if (qtail === qhead) {
      // Switch queues
      if (currdist === 0) control = qhead;
      currdist++;
      qcurr ^= 1;
      qhead = qnext;
      qtail = 0;
      qnext = 0;
    } else if (remaining === 0 && qnext === 0) {
      break;
    } else {
      const pos = queues[qcurr]?.[qtail++]!;
      const y = (pos / w) | 0;
      const x = pos % w;

      for (let dir = 0; dir < 4; dir++) {
        const y1 = y + dy[dir]!;
        const x1 = x + dx[dir]!;
        if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
          const pos1 = y1 * w + x1;
          if (
            distArr[pos1] === -1 &&
            ((grid[pos1] === grid[pos] && distArr[pos] === currdist) ||
              (grid[pos1] !== grid[pos] && distArr[pos] === currdist - 1))
          ) {
            queues[qcurr]![qhead++] = pos1;
            queues[qcurr ^ 1]![qnext++] = pos1;
            distArr[pos1] = currdist;
            remaining--;
          }
        }
      }
    }
  }

  if (currdist === 0) control = qhead;

  return { dist: currdist, number: qhead, control };
}

// ---------------------------------------------------------------------------
// fill() — flood-fill with a new color (in-place)
// ---------------------------------------------------------------------------

/**
 * Enact a flood-fill move on a grid, starting from (x0, y0).
 * Modifies `grid` in place.
 */
function fill(
  w: number,
  h: number,
  grid: Int32Array,
  x0: number,
  y0: number,
  newColor: number,
  queue: Int32Array,
): void {
  const oldColor = grid[y0 * w + x0]!;
  if (oldColor === newColor) return;

  grid[y0 * w + x0] = newColor;
  queue[0] = y0 * w + x0;
  let qtail = 0;
  let qhead = 1;

  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  while (qtail < qhead) {
    const pos = queue[qtail++]!;
    const y = (pos / w) | 0;
    const x = pos % w;

    for (let dir = 0; dir < 4; dir++) {
      const y1 = y + dy[dir]!;
      const x1 = x + dx[dir]!;
      if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
        const pos1 = y1 * w + x1;
        if (grid[pos1] === oldColor) {
          grid[pos1] = newColor;
          queue[qhead++] = pos1;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// completed() — check if grid is all one color
// ---------------------------------------------------------------------------

function completed(w: number, h: number, grid: Int32Array): boolean {
  const wh = w * h;
  for (let i = 1; i < wh; i++) {
    if (grid[i] !== grid[0]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// choosemove_recurse() / choosemove() — recursive solver
// ---------------------------------------------------------------------------

/**
 * Try every possible move on a grid, and choose whichever one
 * reduces the result of search() by the most.
 *
 * Returns { move, bestdist, bestnumber, bestcontrol }.
 */
function choosemoveRecurse(
  w: number,
  h: number,
  grid: Int32Array,
  x0: number,
  y0: number,
  maxmove: number,
  scratch: SolverScratch,
  depth: number,
): { move: number; bestdist: number; bestnumber: number; bestcontrol: number } {
  const wh = w * h;
  const tmpgrid = scratch.rgrids.subarray(depth * wh, (depth + 1) * wh);

  let bestdist = wh + 1;
  let bestnumber = 0;
  let bestcontrol = 0;
  let bestmove = -1;

  for (let move = 0; move < maxmove; move++) {
    if (grid[y0 * w + x0] === move) continue;

    // Copy grid into tmpgrid
    tmpgrid.set(grid.subarray(0, wh));

    fill(w, h, tmpgrid, x0, y0, move, scratch.queue0);

    if (completed(w, h, tmpgrid)) {
      // A move that wins is immediately the best
      return { move, bestdist: -1, bestnumber: depth, bestcontrol: wh };
    }

    let dist: number;
    let number: number;
    let control: number;

    if (depth < RECURSION_DEPTH - 1) {
      const result = choosemoveRecurse(w, h, tmpgrid, x0, y0, maxmove, scratch, depth + 1);
      dist = result.bestdist;
      number = result.bestnumber;
      control = result.bestcontrol;
    } else {
      const result = search(w, h, tmpgrid, x0, y0, scratch);
      dist = result.dist;
      number = result.number;
      control = result.control;
    }

    if (
      dist < bestdist ||
      (dist === bestdist &&
        (number < bestnumber || (number === bestnumber && control > bestcontrol)))
    ) {
      bestdist = dist;
      bestnumber = number;
      bestcontrol = control;
      bestmove = move;
    }
  }

  return { move: bestmove, bestdist, bestnumber, bestcontrol };
}

function choosemove(
  w: number,
  h: number,
  grid: Int32Array,
  x0: number,
  y0: number,
  maxmove: number,
  scratch: SolverScratch,
): number {
  return choosemoveRecurse(w, h, grid, x0, y0, maxmove, scratch, 0).move;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a flood puzzle with a solver-computed move limit.
 *
 * Faithful port of new_game_desc() from flood.c:
 * 1. Generate a random grid
 * 2. Run the solver to count how many moves it needs
 * 3. Set movelimit = solver_moves + leniency
 */
export function generateFloodPuzzle(
  w: number,
  h: number,
  colors: number,
  leniency: number,
): FloodPuzzle {
  const wh = w * h;
  const scratch = newScratch(w, h);

  // Invent a random grid
  for (let i = 0; i < wh; i++) {
    scratch.grid[i] = Math.floor(Math.random() * colors);
  }

  // Run the solver, and count how many moves it uses
  scratch.grid2.set(scratch.grid.subarray(0, wh));
  let moves = 0;
  while (!completed(w, h, scratch.grid2)) {
    const move = choosemove(w, h, scratch.grid2, FILLX, FILLY, colors, scratch);
    fill(w, h, scratch.grid2, FILLX, FILLY, move, scratch.queue0);
    moves++;
  }

  // Adjust for difficulty
  const movelimit = moves + leniency;

  // Return the original grid (not the solved one)
  const grid = Array.from(scratch.grid.subarray(0, wh));

  return { grid, w, h, colors, movelimit };
}

/**
 * Flood-fill from (x0, y0) with newColor.
 * Returns a new grid array (does not mutate the input).
 */
export function floodFill(
  grid: number[],
  w: number,
  h: number,
  x0: number,
  y0: number,
  newColor: number,
): number[] {
  const wh = w * h;
  const buf = new Int32Array(wh);
  for (let i = 0; i < wh; i++) buf[i] = grid[i]!;
  const queue = new Int32Array(wh);
  fill(w, h, buf, x0, y0, newColor, queue);
  return Array.from(buf);
}

/**
 * Check if all cells in a flat grid are the same color.
 */
export function isCompleted(grid: number[]): boolean {
  for (let i = 1; i < grid.length; i++) {
    if (grid[i] !== grid[0]) return false;
  }
  return true;
}

/**
 * Run the solver on a grid and return the number of moves it needs.
 * This uses the same recursive depth-3 solver as puzzle generation.
 */
export function solveMoveCount(grid: number[], w: number, h: number, colors: number): number {
  const wh = w * h;
  const scratch = newScratch(w, h);
  const work = new Int32Array(wh);
  for (let i = 0; i < wh; i++) work[i] = grid[i]!;

  let moves = 0;
  while (!completed(w, h, work)) {
    const move = choosemove(w, h, work, FILLX, FILLY, colors, scratch);
    fill(w, h, work, FILLX, FILLY, move, scratch.queue0);
    moves++;
  }
  return moves;
}
