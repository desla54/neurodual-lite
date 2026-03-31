// @ts-nocheck
/**
 * Flip puzzle — faithful port of Simon Tatham's flip.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Each click toggles an overlapping set of lights defined by a matrix.
 * Goal: turn all lights off (all zeros).
 *
 * Matrix types:
 *   CROSSES — classic "lights out" (Manhattan distance <= 1)
 *   RANDOM  — randomly grown connected regions per click square
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FlipPuzzle {
  /** Flat grid, row-major. 1 = lit (wrong), 0 = unlit (right). */
  grid: Uint8Array;
  /** Toggle matrix: matrix[i * wh + j] means clicking i toggles j. */
  matrix: Uint8Array;
  w: number;
  h: number;
  matrixType: 'crosses' | 'random';
}

export interface FlipSolution {
  /** Which squares to click (flat index). true = click this square. */
  clicks: boolean[];
  /** Total number of clicks in the solution. */
  length: number;
}

// ---------------------------------------------------------------------------
// Constants (from flip.c)
// ---------------------------------------------------------------------------

const _CROSSES = 0;
const _RANDOM = 1;

// ---------------------------------------------------------------------------
// PRNG — simple seedable xoshiro128** (we need random_upto)
// ---------------------------------------------------------------------------

function makePRNG(seed?: number) {
  // Seed from argument or Math.random
  let s0 = (seed ?? Math.random() * 0xffffffff) >>> 0;
  let s1 = (s0 * 1664525 + 1013904223) >>> 0;
  let s2 = (s1 * 1664525 + 1013904223) >>> 0;
  let s3 = (s2 * 1664525 + 1013904223) >>> 0;

  function rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }

  function next(): number {
    const result = (rotl((s1 * 5) >>> 0, 7) * 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  }

  /** Return uniform random int in [0, n) — mirrors random_upto */
  function random_upto(n: number): number {
    if (n <= 1) return 0;
    return next() % n;
  }

  return { random_upto };
}

// ---------------------------------------------------------------------------
// tree234 replacement — sorted array with custom comparator
// ---------------------------------------------------------------------------

interface Sq {
  cx: number;
  cy: number;
  x: number;
  y: number;
  coverage: number;
  ominosize: number;
}

type CmpFn = (a: Sq, b: Sq) => number;

function sortedInsert(arr: Sq[], sq: Sq, cmp: CmpFn): boolean {
  // Binary search for insertion point
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const c = cmp(arr[mid], sq);
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  // Check for duplicate (exact match at lo)
  if (lo < arr.length && cmp(arr[lo], sq) === 0) return false;
  arr.splice(lo, 0, sq);
  return true;
}

function sortedRemove(arr: Sq[], sq: Sq, cmp: CmpFn): boolean {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const c = cmp(arr[mid], sq);
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  if (lo < arr.length && cmp(arr[lo], sq) === 0) {
    arr.splice(lo, 1);
    return true;
  }
  return false;
}

function sortedFindGT(arr: Sq[], sq: Sq, cmp: CmpFn): Sq | null {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cmp(arr[mid], sq) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo < arr.length ? arr[lo] : null;
}

/**
 * Find the relative position of sq in the array, returning the index.
 * REL234_LT: find the largest element < sq, return its index.
 */
function sortedFindRelLT(arr: Sq[], sq: Sq, cmp: CmpFn): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cmp(arr[mid], sq) < 0) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first element >= sq, so lo-1 is the last element < sq
  return lo - 1;
}

// ---------------------------------------------------------------------------
// Compare functions (from flip.c)
// ---------------------------------------------------------------------------

function SORT(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return +1;
  return 0;
}

function sqcmp_pick(a: Sq, b: Sq): number {
  let r: number;
  r = SORT(a.coverage, b.coverage);
  if (r) return r;
  r = SORT(a.ominosize, b.ominosize);
  if (r) return r;
  r = SORT(a.cy, b.cy);
  if (r) return r;
  r = SORT(a.cx, b.cx);
  if (r) return r;
  r = SORT(a.y, b.y);
  if (r) return r;
  r = SORT(a.x, b.x);
  if (r) return r;
  return 0;
}

function sqcmp_cov(a: Sq, b: Sq): number {
  let r: number;
  r = SORT(a.coverage, b.coverage);
  if (r) return r;
  r = SORT(a.y, b.y);
  if (r) return r;
  r = SORT(a.x, b.x);
  if (r) return r;
  r = SORT(a.ominosize, b.ominosize);
  if (r) return r;
  r = SORT(a.cy, b.cy);
  if (r) return r;
  r = SORT(a.cx, b.cx);
  if (r) return r;
  return 0;
}

function sqcmp_osize(a: Sq, b: Sq): number {
  let r: number;
  r = SORT(a.ominosize, b.ominosize);
  if (r) return r;
  r = SORT(a.cy, b.cy);
  if (r) return r;
  r = SORT(a.cx, b.cx);
  if (r) return r;
  r = SORT(a.coverage, b.coverage);
  if (r) return r;
  r = SORT(a.y, b.y);
  if (r) return r;
  r = SORT(a.x, b.x);
  if (r) return r;
  return 0;
}

// ---------------------------------------------------------------------------
// addsq / addneighbours (from flip.c)
// ---------------------------------------------------------------------------

function addsq(
  pick: Sq[],
  cov: Sq[],
  osize: Sq[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  matrix: Uint8Array,
): void {
  const wh = w * h;

  if (x < 0 || x >= w || y < 0 || y >= h) return;
  if (Math.abs(x - cx) > 1 || Math.abs(y - cy) > 1) return;
  if (matrix[(cy * w + cx) * wh + y * w + x]) return;

  const sq: Sq = { cx, cy, x, y, coverage: 0, ominosize: 0 };
  for (let i = 0; i < wh; i++) {
    if (matrix[i * wh + y * w + x]) sq.coverage++;
    if (matrix[(cy * w + cx) * wh + i]) sq.ominosize++;
  }

  // Only add if not already present (check via pick tree)
  if (!sortedInsert(pick, sq, sqcmp_pick)) return;
  sortedInsert(cov, sq, sqcmp_cov);
  sortedInsert(osize, sq, sqcmp_osize);
}

function addneighbours(
  pick: Sq[],
  cov: Sq[],
  osize: Sq[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  matrix: Uint8Array,
): void {
  addsq(pick, cov, osize, w, h, cx, cy, x - 1, y, matrix);
  addsq(pick, cov, osize, w, h, cx, cy, x + 1, y, matrix);
  addsq(pick, cov, osize, w, h, cx, cy, x, y - 1, matrix);
  addsq(pick, cov, osize, w, h, cx, cy, x, y + 1, matrix);
}

// ---------------------------------------------------------------------------
// Matrix generation (from new_game_desc in flip.c)
// ---------------------------------------------------------------------------

function generateCrossesMatrix(w: number, h: number): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);
  for (let i = 0; i < wh; i++) {
    const ix = i % w;
    const iy = (i / w) | 0;
    for (let j = 0; j < wh; j++) {
      const jx = j % w;
      const jy = (j / w) | 0;
      if (Math.abs(jx - ix) + Math.abs(jy - iy) <= 1) matrix[i * wh + j] = 1;
    }
  }
  return matrix;
}

function generateRandomMatrix(w: number, h: number, rs: ReturnType<typeof makePRNG>): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);

  outer: while (true) {
    const pick: Sq[] = [];
    const cov: Sq[] = [];
    const osize: Sq[] = [];

    matrix.fill(0);
    // Identity: each click square toggles itself
    for (let i = 0; i < wh; i++) {
      matrix[i * wh + i] = 1;
    }

    // Add initial neighbours for each square
    for (let i = 0; i < wh; i++) {
      const ix = i % w;
      const iy = (i / w) | 0;
      addneighbours(pick, cov, osize, w, h, ix, iy, ix, iy, matrix);
    }

    /*
     * Repeatedly choose a square to add to the matrix.
     * Limit = same as total set bits in crosses matrix minus identity.
     * Centre squares already present => limit = 4*wh - 2*(w+h)
     */
    let limit = 4 * wh - 2 * (w + h);

    while (limit-- > 0) {
      if (pick.length === 0) break;

      /*
       * Find the lowest element in pick (index 0).
       * Then find the highest element with the same coverage+ominosize.
       */
      const sq0 = pick[0];
      // Create a sentinel with same coverage+ominosize but max coords
      const sqlocal: Sq = {
        coverage: sq0.coverage,
        ominosize: sq0.ominosize,
        cx: wh,
        cy: wh,
        x: wh,
        y: wh,
      };
      const k = sortedFindRelLT(pick, sqlocal, sqcmp_pick);
      // k is the index of the last element with same coverage+ominosize (or less)
      // Pick at random from [0, k]
      const pickIdx = rs.random_upto(k + 1);
      const sq = pick[pickIdx];

      // Remove from all three trees
      pick.splice(pickIdx, 1);
      sortedRemove(cov, sq, sqcmp_cov);
      sortedRemove(osize, sq, sqcmp_osize);

      // Add this square to the matrix
      matrix[(sq.cy * w + sq.cx) * wh + (sq.y * w + sq.x)] = 1;

      /*
       * Correct coverage: find all sq2 in cov with same coverage, x, y
       * and increment their coverage.
       */
      const covLocal: Sq = {
        coverage: sq.coverage,
        x: sq.x,
        y: sq.y,
        cx: -1,
        cy: -1,
        ominosize: -1,
      };
      while (true) {
        const sq2 = sortedFindGT(cov, covLocal, sqcmp_cov);
        if (sq2 === null || sq2.coverage !== sq.coverage || sq2.x !== sq.x || sq2.y !== sq.y) break;

        sortedRemove(pick, sq2, sqcmp_pick);
        sortedRemove(cov, sq2, sqcmp_cov);
        sortedRemove(osize, sq2, sqcmp_osize);
        sq2.coverage++;
        sortedInsert(pick, sq2, sqcmp_pick);
        sortedInsert(cov, sq2, sqcmp_cov);
        sortedInsert(osize, sq2, sqcmp_osize);
      }

      /*
       * Correct ominosize: find all sq2 in osize with same ominosize, cx, cy
       * and increment their ominosize.
       */
      const osizeLocal: Sq = {
        ominosize: sq.ominosize,
        cx: sq.cx,
        cy: sq.cy,
        x: -1,
        y: -1,
        coverage: -1,
      };
      while (true) {
        const sq2 = sortedFindGT(osize, osizeLocal, sqcmp_osize);
        if (sq2 === null || sq2.ominosize !== sq.ominosize || sq2.cx !== sq.cx || sq2.cy !== sq.cy)
          break;

        sortedRemove(pick, sq2, sqcmp_pick);
        sortedRemove(cov, sq2, sqcmp_cov);
        sortedRemove(osize, sq2, sqcmp_osize);
        sq2.ominosize++;
        sortedInsert(pick, sq2, sqcmp_pick);
        sortedInsert(cov, sq2, sqcmp_cov);
        sortedInsert(osize, sq2, sqcmp_osize);
      }

      // Add neighbours of the newly added matrix entry
      addneighbours(pick, cov, osize, w, h, sq.cx, sq.cy, sq.x, sq.y, matrix);
    }

    /*
     * Check no two matrix rows are identical.
     * If any pair matches, discard and retry.
     */
    for (let i = 0; i < wh; i++) {
      for (let j = i + 1; j < wh; j++) {
        let same = true;
        for (let k = 0; k < wh; k++) {
          if (matrix[i * wh + k] !== matrix[j * wh + k]) {
            same = false;
            break;
          }
        }
        if (same) continue outer;
      }
    }

    break; // matrix is valid
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// Grid generation (from new_game_desc in flip.c)
// ---------------------------------------------------------------------------

/**
 * Generate a random solvable initial grid by choosing a random input
 * vector and mapping through the matrix. This guarantees equiprobable
 * sampling from the image space of the matrix over GF(2).
 */
function generateGrid(
  w: number,
  h: number,
  matrix: Uint8Array,
  rs: ReturnType<typeof makePRNG>,
): Uint8Array {
  const wh = w * h;
  const grid = new Uint8Array(wh);

  while (true) {
    grid.fill(0);
    for (let i = 0; i < wh; i++) {
      const v = rs.random_upto(2);
      if (v) {
        for (let j = 0; j < wh; j++) grid[j] ^= matrix[i * wh + j];
      }
    }
    // Ensure not already solved (all zeros)
    let allZero = true;
    for (let i = 0; i < wh; i++) {
      if (grid[i]) {
        allZero = false;
        break;
      }
    }
    if (!allZero) break;
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Solver (from solve_game in flip.c)
// ---------------------------------------------------------------------------

function rowxor(eq: Uint8Array, r1off: number, r2off: number, len: number): void {
  for (let i = 0; i < len; i++) eq[r1off + i] ^= eq[r2off + i];
}

/**
 * Solve a flip puzzle using Gaussian elimination over GF(2).
 * Returns the shortest solution (fewest clicks), or null if insoluble.
 *
 * Faithfully ports solve_game() from flip.c.
 */
export function solveFlip(puzzle: FlipPuzzle): FlipSolution | null {
  const { w, h, matrix, grid } = puzzle;
  const wh = w * h;

  /*
   * Set up simultaneous equations. Each equation has wh coefficients + 1 value.
   * equations[i * (wh+1) + j] = matrix[j*wh + i]  (note the transpose!)
   * equations[i * (wh+1) + wh] = grid[i] & 1
   */
  const eqLen = wh + 1;
  const equations = new Uint8Array(eqLen * wh);
  for (let i = 0; i < wh; i++) {
    for (let j = 0; j < wh; j++) equations[i * eqLen + j] = matrix[j * wh + i];
    equations[i * eqLen + wh] = grid[i] & 1;
  }

  // Gaussian elimination over GF(2)
  let rowsdone = 0;
  let colsdone = 0;
  const und: number[] = [];

  while (rowsdone < wh) {
    // Find leftmost column with a 1 below rowsdone
    let foundCol = -1;
    let foundRow = -1;
    for (let ic = colsdone; ic < wh; ic++) {
      for (let jr = rowsdone; jr < wh; jr++) {
        if (equations[jr * eqLen + ic]) {
          foundCol = ic;
          foundRow = jr;
          break;
        }
      }
      if (foundRow >= 0) break;
      // Column has no pivot — mark as undetermined
      und.push(ic);
    }

    if (foundCol < 0) {
      // All remaining equations: check for 0 = 1 (insoluble)
      for (let jr = rowsdone; jr < wh; jr++) {
        if (equations[jr * eqLen + wh]) return null;
      }
      break;
    }

    // Swap pivot row up
    if (foundRow > rowsdone) rowxor(equations, rowsdone * eqLen, foundRow * eqLen, eqLen);

    // Eliminate column from all other rows below
    for (let jr = rowsdone + 1; jr < wh; jr++) {
      if (equations[jr * eqLen + foundCol]) rowxor(equations, jr * eqLen, rowsdone * eqLen, eqLen);
    }

    rowsdone++;
    colsdone = foundCol + 1;
  }

  /*
   * Enumerate all solutions (2^nund of them) and pick the shortest.
   */
  const solution = new Uint8Array(wh);
  let shortest = new Uint8Array(wh);
  let bestlen = wh + 1;

  while (true) {
    // Back-substitute to find solution for current undetermined values
    for (let j = rowsdone - 1; j >= 0; j--) {
      // Find leftmost set bit
      let pivotCol = -1;
      for (let ic = 0; ic < wh; ic++) {
        if (equations[j * eqLen + ic]) {
          pivotCol = ic;
          break;
        }
      }

      let v = equations[j * eqLen + wh];
      for (let k = pivotCol + 1; k < wh; k++) {
        if (equations[j * eqLen + k]) v ^= solution[k];
      }
      solution[pivotCol] = v;
    }

    // Count clicks
    let len = 0;
    for (let i = 0; i < wh; i++) if (solution[i]) len++;
    if (len < bestlen) {
      bestlen = len;
      shortest = new Uint8Array(solution);
    }

    // Increment binary counter over undetermined variables
    let carried = true;
    for (let i = 0; i < und.length; i++) {
      solution[und[i]] = solution[und[i]] ? 0 : 1;
      if (solution[und[i]]) {
        carried = false;
        break;
      }
    }
    if (carried) break; // wrapped around, enumerated all
  }

  const clicks: boolean[] = new Array(wh);
  for (let i = 0; i < wh; i++) clicks[i] = !!shortest[i];
  return { clicks, length: bestlen };
}

// ---------------------------------------------------------------------------
// Execute a move (from execute_move in flip.c)
// ---------------------------------------------------------------------------

/**
 * Apply a click at position (x, y) on the grid.
 * Mutates grid in place and returns whether the puzzle is now solved.
 */
export function executeFlipMove(
  grid: Uint8Array,
  matrix: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  const wh = w * h;
  const i = y * w + x;
  let done = true;
  for (let j = 0; j < wh; j++) {
    grid[j] ^= matrix[i * wh + j];
    if (grid[j] & 1) done = false;
  }
  return done;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateFlipOptions {
  /** 'crosses' (default) or 'random' */
  matrixType?: 'crosses' | 'random';
  /** Optional PRNG seed for reproducibility */
  seed?: number;
}

/**
 * Generate a Flip puzzle of size w x h.
 *
 * Faithfully ports new_game_desc() from Simon Tatham's flip.c.
 */
export function generateFlipPuzzle(
  w: number,
  h: number,
  options?: GenerateFlipOptions,
): FlipPuzzle {
  const matrixType = options?.matrixType ?? 'crosses';
  const rs = makePRNG(options?.seed);

  const matrix =
    matrixType === 'crosses' ? generateCrossesMatrix(w, h) : generateRandomMatrix(w, h, rs);

  const grid = generateGrid(w, h, matrix, rs);

  return { grid, matrix, w, h, matrixType };
}
