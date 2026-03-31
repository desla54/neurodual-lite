// @ts-nocheck
/**
 * Range (Kurodoko / Kuromasu) puzzle generator — faithful port of Simon Tatham's range.c
 *
 * Ports the following C algorithms:
 *   - DSF (disjoint set forest) from dsf.c
 *   - Full solver from range.c (not_too_big, adjacency, connectedness, recursion)
 *   - Generation pipeline from range.c new_game_desc()
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 */

// =============================================================================
// Public API
// =============================================================================

export interface RangePuzzle {
  /** Flat grid, row-major, length w*h.
   *  - Positive number = clue (visibility count)
   *  - 0 = empty (no clue, not black)
   *  - BLACK (-2) in solution = black cell */
  grid: number[];
  /** Grid width. */
  w: number;
  /** Grid height. */
  h: number;
  /** The solution grid (same encoding: positive=clue, BLACK=black, EMPTY=unknown). */
  solution: number[];
}

/**
 * Generate a Range (Kurodoko) puzzle of size w x h.
 * Uses Simon Tatham's full generation + solver pipeline.
 */
export function generateRangePuzzle(w: number, h: number): RangePuzzle {
  if (w < 1 || h < 1) throw new RangeError('Width and height must be at least 1');
  if (w * h < 1) throw new RangeError('Size must be at least 1');
  if (w === 2 && h === 2) throw new RangeError("Can't create 2x2 puzzles");
  if (w === 1 && h === 2) throw new RangeError("Can't create 1x2 puzzles");
  if (w === 2 && h === 1) throw new RangeError("Can't create 2x1 puzzles");
  if (w === 1 && h === 1) throw new RangeError("Can't create 1x1 puzzles");
  return newGameDesc(w, h);
}

// =============================================================================
// Constants (from range.c)
// =============================================================================

const BLACK = -2;
const WHITE = -1;
const EMPTY = 0;

const dr = [+1, 0, -1, 0];
const dc = [0, +1, 0, -1];

const M_BLACK = 0;
const M_WHITE = 1;

const _DIFF_NOT_TOO_BIG = 0;
const _DIFF_ADJACENCY = 1;
const _DIFF_CONNECTEDNESS = 2;
const DIFF_RECURSION = 3;

// =============================================================================
// DSF — Disjoint Set Forest (faithful port of dsf.c)
// =============================================================================

function dsfInit(dsf: Int32Array, size: number): void {
  for (let i = 0; i < size; i++) dsf[i] = 6;
}

function _dsfNew(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf, size);
  return dsf;
}

function edsfCanonify(dsf: Int32Array, index: number, inverseReturn: number[] | null): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonicalIndex = index;

  if (inverseReturn) inverseReturn[0] = inverse;

  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index] >> 2;
    const nextInverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return canonicalIndex;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  return edsfCanonify(dsf, index, null);
}

function edsfMerge(dsf: Int32Array, v1: number, v2: number, inverse: number): void {
  const i1 = [0];
  const i2 = [0];
  v1 = edsfCanonify(dsf, v1, i1);
  inverse ^= i1[0];
  v2 = edsfCanonify(dsf, v2, i2);
  inverse ^= i2[0];

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | (inverse ? 1 : 0);
}

function _dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  edsfMerge(dsf, v1, v2, 0);
}

function _dsfSize(dsf: Int32Array, index: number): number {
  return dsf[dsfCanonify(dsf, index)] >> 2;
}

// =============================================================================
// PRNG — simple xoshiro128** for deterministic generation
// =============================================================================

function makeRandom(): {
  next(): number;
  nextRange(n: number): number;
  shuffle<T>(arr: T[]): void;
} {
  // Seed from Math.random
  let s0 = (Math.random() * 0xffffffff) >>> 0;
  let s1 = (Math.random() * 0xffffffff) >>> 0;
  let s2 = (Math.random() * 0xffffffff) >>> 0;
  let s3 = (Math.random() * 0xffffffff) >>> 0;

  function rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }

  function next(): number {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  }

  function nextRange(n: number): number {
    return (next() >>> 0) % n;
  }

  function shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = nextRange(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  return { next, nextRange, shuffle };
}

// =============================================================================
// Grid helpers (from range.c)
// =============================================================================

function idx(r: number, c: number, w: number): number {
  return r * w + c;
}

function outOfBounds(r: number, c: number, w: number, h: number): boolean {
  return r < 0 || r >= h || c < 0 || c >= w;
}

function MASK(n: number): number {
  return 1 << (n + 2);
}

// =============================================================================
// Solver types (from range.c)
// =============================================================================

interface Square {
  r: number;
  c: number;
}

interface Move {
  r: number;
  c: number;
  colour: number;
}

interface GameState {
  w: number;
  h: number;
  grid: Int8Array;
}

function dupState(state: GameState): GameState {
  return {
    w: state.w,
    h: state.h,
    grid: new Int8Array(state.grid),
  };
}

// =============================================================================
// Solver: runlength (from range.c)
// =============================================================================

function runlength(
  r: number,
  c: number,
  drr: number,
  dcc: number,
  state: GameState,
  colourmask: number,
): number {
  const w = state.w,
    h = state.h;
  let sz = 0;
  while (true) {
    const cell = idx(r, c, w);
    if (outOfBounds(r, c, w, h)) break;
    if (state.grid[cell] > 0) {
      if (!(colourmask & ~(MASK(BLACK) | MASK(WHITE) | MASK(EMPTY)))) break;
    } else if (!(MASK(state.grid[cell]) & colourmask)) break;
    ++sz;
    r += drr;
    c += dcc;
  }
  return sz;
}

// =============================================================================
// Solver: makemove (from range.c)
// =============================================================================

function solverMakemove(r: number, c: number, colour: number, state: GameState, buf: Move[]): void {
  if (outOfBounds(r, c, state.w, state.h)) return;
  const cell = idx(r, c, state.w);
  if (state.grid[cell] !== EMPTY) return;
  buf.push({ r, c, colour });
  state.grid[cell] = colour === M_BLACK ? BLACK : WHITE;
}

// =============================================================================
// Solver: find_clues (from range.c)
// =============================================================================

function findClues(state: GameState): Square[] {
  const clues: Square[] = [];
  let i = 0;
  for (let r = 0; r < state.h; ++r) {
    for (let c = 0; c < state.w; ++c, ++i) {
      if (state.grid[i] > 0) {
        clues.push({ r, c });
      }
    }
  }
  return clues;
}

// =============================================================================
// Solver: reasoning_adjacency (from range.c)
// =============================================================================

function solverReasoningAdjacency(
  state: GameState,
  _nclues: number,
  _clues: Square[],
  buf: Move[],
): Move[] | null {
  for (let r = 0; r < state.h; ++r) {
    for (let c = 0; c < state.w; ++c) {
      const cell = idx(r, c, state.w);
      if (state.grid[cell] !== BLACK) continue;
      for (let i = 0; i < 4; ++i) {
        solverMakemove(r + dr[i], c + dc[i], M_WHITE, state, buf);
      }
    }
  }
  return buf;
}

// =============================================================================
// Solver: reasoning_connectedness (from range.c) — biconnected components
// =============================================================================

const NOT_VISITED = -1;

function dfsBiconnectVisit(
  r: number,
  c: number,
  state: GameState,
  dfsParent: Int32Array, // packed [r, c] as two entries per cell
  dfsDepth: Int32Array,
  buf: Move[],
): number {
  const w = state.w,
    h = state.h;
  const i = idx(r, c, w);
  const mydepth = dfsDepth[i];
  let lowpoint = mydepth;
  let nchildren = 0;

  for (let j = 0; j < 4; ++j) {
    const rr = r + dr[j],
      cc = c + dc[j];
    const cell = idx(rr, cc, w);

    if (outOfBounds(rr, cc, w, h)) continue;
    if (state.grid[cell] === BLACK) continue;

    if (dfsParent[cell * 2] === NOT_VISITED) {
      dfsParent[cell * 2] = r;
      dfsParent[cell * 2 + 1] = c;
      dfsDepth[cell] = mydepth + 1;
      const childLowpoint = dfsBiconnectVisit(rr, cc, state, dfsParent, dfsDepth, buf);

      if (childLowpoint >= mydepth && mydepth > 0) {
        solverMakemove(r, c, M_WHITE, state, buf);
      }

      lowpoint = Math.min(lowpoint, childLowpoint);
      ++nchildren;
    } else if (rr !== dfsParent[i * 2] || cc !== dfsParent[i * 2 + 1]) {
      lowpoint = Math.min(lowpoint, dfsDepth[cell]);
    }
  }

  if (mydepth === 0 && nchildren >= 2) {
    solverMakemove(r, c, M_WHITE, state, buf);
  }

  return lowpoint;
}

function solverReasoningConnectedness(
  state: GameState,
  _nclues: number,
  _clues: Square[],
  buf: Move[],
): Move[] | null {
  const w = state.w,
    h = state.h,
    n = w * h;

  const dfsParent = new Int32Array(n * 2);
  const dfsDepth = new Int32Array(n);

  for (let i = 0; i < n; ++i) {
    dfsParent[i * 2] = NOT_VISITED;
    dfsDepth[i] = -n;
  }

  // Find first non-black cell
  let i = 0;
  while (i < n && state.grid[i] === BLACK) ++i;
  if (i >= n) return buf;

  dfsParent[i * 2] = Math.floor(i / w);
  dfsParent[i * 2 + 1] = i % w;
  dfsDepth[i] = 0;

  dfsBiconnectVisit(Math.floor(i / w), i % w, state, dfsParent, dfsDepth, buf);

  return buf;
}

// =============================================================================
// Solver: reasoning_not_too_big (from range.c)
// =============================================================================

function solverReasoningNotTooBig(
  state: GameState,
  nclues: number,
  clues: Square[],
  buf: Move[],
): Move[] | null {
  const w = state.w;
  const runmasks = [
    ~(MASK(BLACK) | MASK(EMPTY)),
    MASK(EMPTY),
    ~(MASK(BLACK) | MASK(EMPTY)),
    ~MASK(BLACK),
  ];
  const RUN_WHITE = 0,
    RUN_EMPTY = 1,
    RUN_BEYOND = 2,
    RUN_SPACE = 3;

  for (let i = 0; i < nclues; ++i) {
    const row = clues[i].r,
      col = clues[i].c;
    const clue = state.grid[idx(row, col, w)];
    const runlengths: number[][] = [new Array(4), new Array(4), new Array(4), new Array(4)];

    for (let j = 0; j < 4; ++j) {
      let r = row + dr[j],
        c = col + dc[j];
      runlengths[RUN_SPACE][j] = 0;
      for (let k = 0; k <= RUN_SPACE; ++k) {
        const l = runlength(r, c, dr[j], dc[j], state, runmasks[k]);
        if (k < RUN_SPACE) {
          runlengths[k][j] = l;
          r += dr[j] * l;
          c += dc[j] * l;
        }
        runlengths[RUN_SPACE][j] += l;
      }
    }

    let whites = 1;
    for (let j = 0; j < 4; ++j) whites += runlengths[RUN_WHITE][j];

    for (let j = 0; j < 4; ++j) {
      const delta = 1 + runlengths[RUN_WHITE][j];
      const r = row + delta * dr[j];
      const c = col + delta * dc[j];

      if (whites === clue) {
        solverMakemove(r, c, M_BLACK, state, buf);
        continue;
      }

      if (
        runlengths[RUN_EMPTY][j] === 1 &&
        whites + runlengths[RUN_EMPTY][j] + runlengths[RUN_BEYOND][j] > clue
      ) {
        solverMakemove(r, c, M_BLACK, state, buf);
        continue;
      }

      if (whites + runlengths[RUN_EMPTY][j] + runlengths[RUN_BEYOND][j] > clue) {
        runlengths[RUN_SPACE][j] = runlengths[RUN_WHITE][j] + runlengths[RUN_EMPTY][j] - 1;

        if (runlengths[RUN_EMPTY][j] === 1) {
          solverMakemove(r, c, M_BLACK, state, buf);
        }
      }
    }

    let space = 1;
    for (let j = 0; j < 4; ++j) space += runlengths[RUN_SPACE][j];
    for (let j = 0; j < 4; ++j) {
      let r = row + dr[j],
        c = col + dc[j];

      let k = space - runlengths[RUN_SPACE][j];
      if (k >= clue) continue;

      for (; k < clue; ++k, r += dr[j], c += dc[j]) {
        solverMakemove(r, c, M_WHITE, state, buf);
      }
    }
  }
  return buf;
}

// =============================================================================
// Solver: reasoning_recursion (from range.c)
// =============================================================================

function solverReasoningRecursion(
  state: GameState,
  nclues: number,
  clues: Square[],
  buf: Move[],
): Move[] | null {
  const w = state.w,
    n = w * state.h;

  for (let cell = 0; cell < n; ++cell) {
    const r = Math.floor(cell / w),
      c = cell % w;

    if (state.grid[cell] !== EMPTY) continue;

    for (let colour = M_BLACK; colour <= M_WHITE; ++colour) {
      const newstate = dupState(state);
      newstate.grid[cell] = colour === M_BLACK ? BLACK : WHITE;
      const recursiveResult = doSolve(newstate, nclues, clues, [], DIFF_RECURSION);
      if (recursiveResult === null) {
        solverMakemove(r, c, M_BLACK + M_WHITE - colour, state, buf);
        return buf;
      }
      // Check if fully solved
      let allFilled = true;
      for (let ii = 0; ii < n; ++ii) {
        if (newstate.grid[ii] === EMPTY) {
          allFilled = false;
          break;
        }
      }
      if (allFilled) return buf;
    }
  }
  return buf;
}

// =============================================================================
// Solver: do_solve (from range.c)
// =============================================================================

type ReasoningFn = (
  state: GameState,
  nclues: number,
  clues: Square[],
  buf: Move[],
) => Move[] | null;

const reasonings: ReasoningFn[] = [
  solverReasoningNotTooBig,
  solverReasoningAdjacency,
  solverReasoningConnectedness,
  solverReasoningRecursion,
];

function doSolve(
  state: GameState,
  nclues: number,
  clues: Square[],
  moveBuffer: Move[],
  difficulty: number,
): Move[] | null {
  let buf = moveBuffer;
  let oldbufLen: number;

  do {
    oldbufLen = buf.length;
    for (let i = 0; i < reasonings.length && i <= difficulty; ++i) {
      // only recurse if all else fails
      if (i === DIFF_RECURSION && buf.length > oldbufLen) continue;
      const result = reasonings[i](state, nclues, clues, buf);
      if (result === null) return null;
      buf = result;
    }
  } while (buf.length > oldbufLen);

  return buf;
}

// =============================================================================
// Solver: solve_internal (from range.c)
// =============================================================================

function solveInternal(state: GameState, diff: number): Move[] | null {
  const clues = findClues(state);
  const dup = dupState(state);
  const moves = doSolve(dup, clues.length, clues, [], diff);
  return moves;
}

// =============================================================================
// Generator: dfs_count_white (from range.c)
// =============================================================================

function dfsCountRec(grid: Int8Array, r: number, c: number, w: number, h: number): number {
  const cell = idx(r, c, w);
  if (outOfBounds(r, c, w, h)) return 0;
  if (grid[cell] !== WHITE) return 0;
  grid[cell] = EMPTY;
  return (
    1 +
    dfsCountRec(grid, r + 0, c + 1, w, h) +
    dfsCountRec(grid, r + 0, c - 1, w, h) +
    dfsCountRec(grid, r + 1, c + 0, w, h) +
    dfsCountRec(grid, r - 1, c + 0, w, h)
  );
}

function dfsCountWhite(state: GameState, cell: number): number {
  const w = state.w,
    h = state.h,
    n = w * h;
  const r = Math.floor(cell / w),
    c = cell % w;
  const k = dfsCountRec(state.grid, r, c, w, h);
  for (let i = 0; i < n; ++i) {
    if (state.grid[i] === EMPTY) state.grid[i] = WHITE;
  }
  return k;
}

// =============================================================================
// Generator: newdesc_choose_black_squares (from range.c)
// =============================================================================

function newdescChooseBlackSquares(state: GameState, shuffle1toN: number[]): void {
  const w = state.w,
    h = state.h,
    n = w * h;

  for (let k = 0; k < n; ++k) state.grid[k] = WHITE;

  const anyWhiteCell = shuffle1toN[n - 1];
  let nBlackCells = 0;

  for (let k = 0; k < Math.floor(n / 3); ++k) {
    const i = shuffle1toN[k];
    const c = i % w,
      r = Math.floor(i / w);

    let hasBlackNeighbour = false;
    for (let j = 0; j < 4; ++j) {
      const rr = r + dr[j],
        cc = c + dc[j];
      const cell = idx(rr, cc, w);
      if (outOfBounds(rr, cc, w, h)) continue;
      if (state.grid[cell] === BLACK) {
        hasBlackNeighbour = true;
        break;
      }
    }
    if (hasBlackNeighbour) continue;

    state.grid[i] = BLACK;
    ++nBlackCells;

    const j = dfsCountWhite(state, anyWhiteCell);
    if (j + nBlackCells < n) {
      state.grid[i] = WHITE;
      --nBlackCells;
    }
  }
}

// =============================================================================
// Generator: newdesc_compute_clues (from range.c)
// =============================================================================

function newdescComputeClues(state: GameState): void {
  const w = state.w,
    h = state.h;

  // Horizontal runs
  for (let r = 0; r < h; ++r) {
    let runSize = 0;
    for (let c = 0; c <= w; ++c) {
      if (c === w || state.grid[idx(r, c, w)] === BLACK) {
        for (let cc = c - runSize; cc < c; ++cc) {
          state.grid[idx(r, cc, w)] += runSize;
        }
        runSize = 0;
      } else {
        ++runSize;
      }
    }
  }

  // Vertical runs
  for (let c = 0; c < w; ++c) {
    let runSize = 0;
    for (let r = 0; r <= h; ++r) {
      if (r === h || state.grid[idx(r, c, w)] === BLACK) {
        for (let rr = r - runSize; rr < r; ++rr) {
          state.grid[idx(rr, c, w)] += runSize;
        }
        runSize = 0;
      } else {
        ++runSize;
      }
    }
  }
}

// =============================================================================
// Generator: newdesc_strip_clues (from range.c)
// =============================================================================

function newdescStripClues(state: GameState, shuffle1toN: number[]): number {
  const w = state.w,
    n = w * state.h;
  const rotate = (x: number) => n - 1 - x;

  // Partition shuffle_1toN into three groups:
  // [0, left): symmetric to black squares
  // [left, right): neither
  // [right, n): black squares
  let k = 0,
    left = 0,
    right = n;

  for (; ; ++k) {
    while (k < right && state.grid[shuffle1toN[k]] === BLACK) {
      --right;
      const tmp = shuffle1toN[right];
      shuffle1toN[right] = shuffle1toN[k];
      shuffle1toN[k] = tmp;
    }
    if (k >= right) break;
    if (state.grid[rotate(shuffle1toN[k])] === BLACK) {
      const tmp = shuffle1toN[k];
      shuffle1toN[k] = shuffle1toN[left];
      shuffle1toN[left] = tmp;
      ++left;
    }
  }

  // Remove clues in group 1 and group 3
  for (k = 0; k < left; ++k) {
    state.grid[shuffle1toN[k]] = EMPTY;
  }
  for (k = right; k < n; ++k) {
    state.grid[shuffle1toN[k]] = EMPTY;
  }

  let cluesRemoved = left - 0 + (n - right);

  // Check if solver can handle it
  const dupstate = dupState(state);
  const buf = solveInternal(dupstate, DIFF_RECURSION - 1);
  if (buf === null || buf.length < cluesRemoved) {
    return -1;
  }

  // Try removing pairs of clues
  for (k = left; k < right; ++k) {
    const i = shuffle1toN[k],
      j = rotate(i);
    const clue = state.grid[i],
      clueRot = state.grid[j];
    if (clue === BLACK) continue;
    state.grid[i] = EMPTY;
    state.grid[j] = EMPTY;
    const dupstate2 = dupState(state);
    const buf2 = solveInternal(dupstate2, DIFF_RECURSION - 1);
    cluesRemoved += 2 - (i === j ? 1 : 0);
    if (buf2 !== null && buf2.length === cluesRemoved) continue;
    // Restore clues
    state.grid[i] = clue;
    state.grid[j] = clueRot;
    cluesRemoved -= 2 - (i === j ? 1 : 0);
  }

  return cluesRemoved;
}

// =============================================================================
// Generator: encode game description (from range.c)
// =============================================================================

function _newdescEncodeGameDescription(area: number, grid: Int8Array): string {
  let desc = '';
  let run = 0;

  for (let i = 0; i <= area; i++) {
    const n = i < area ? grid[i] : -1;

    if (n === 0) {
      run++;
    } else {
      if (run > 0) {
        while (run > 0) {
          let c = 'a'.charCodeAt(0) - 1 + run;
          if (run > 26) c = 'z'.charCodeAt(0);
          desc += String.fromCharCode(c);
          run -= c - ('a'.charCodeAt(0) - 1);
        }
      } else {
        if (desc.length > 0 && n > 0) {
          desc += '_';
        }
      }
      if (n > 0) {
        desc += n.toString();
      }
      run = 0;
    }
  }
  return desc;
}

// =============================================================================
// Generator: new_game_desc (from range.c)
// =============================================================================

function newGameDesc(w: number, h: number): RangePuzzle {
  const n = w * h;
  const rs = makeRandom();

  const grid = new Int8Array(n);
  const shuffle1toN: number[] = new Array(n);

  const state: GameState = { w, h, grid };

  for (let i = 0; i < n; ++i) shuffle1toN[i] = i;

  let _attempts = 0;
  while (true) {
    _attempts++;
    rs.shuffle(shuffle1toN);
    newdescChooseBlackSquares(state, shuffle1toN);

    // Save solution before computing clues (clues overwrite WHITE values)
    const solutionGrid = new Int8Array(grid);

    newdescComputeClues(state);

    rs.shuffle(shuffle1toN);
    const cluesRemoved = newdescStripClues(state, shuffle1toN);

    if (cluesRemoved < 0) {
      // Restore and retry
      continue;
    }

    // Build result
    // The puzzle grid: positive = clue, 0 = empty (no clue given)
    const puzzleGrid = new Array<number>(n);
    const solArray = new Array<number>(n);
    for (let i = 0; i < n; ++i) {
      puzzleGrid[i] = grid[i] > 0 ? grid[i] : 0;
      solArray[i] = solutionGrid[i] === BLACK ? BLACK : solutionGrid[i];
    }

    return {
      grid: puzzleGrid,
      w,
      h,
      solution: solArray,
    };
  }
}
