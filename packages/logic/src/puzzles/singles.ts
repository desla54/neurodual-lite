// @ts-nocheck
/**
 * Singles (Hitori) puzzle generator — faithful port of Simon Tatham's singles.c
 *
 * Ports the following C algorithms:
 *   - DSF (disjoint set forest) from dsf.c
 *   - Maxflow (Edmonds-Karp) from maxflow.c
 *   - latin_generate() / latin_generate_rect() from latin.c
 *   - Full solver from singles.c (all deduction rules)
 *   - Generation pipeline from singles.c new_game_desc()
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 */

// =============================================================================
// Public API
// =============================================================================

export interface SinglesPuzzle {
  /** The puzzle grid (1-based numbers), row-major, length w*h. */
  nums: number[];
  /** Grid width. */
  w: number;
  /** Grid height. */
  h: number;
  /** The solution: true = cell must be blacked out, row-major. */
  solution: boolean[];
}

/**
 * Generate a Singles (Hitori) puzzle of size w x h.
 * Uses Simon Tatham's full generation + solver pipeline.
 */
export function generateSinglesPuzzle(w: number, h: number): SinglesPuzzle {
  if (w < 2 || h < 2) throw new RangeError('Width and height must be at least 2');
  if (w > 12 || h > 12) throw new RangeError('Maximum supported size is 12x12');
  return newGameDesc(w, h);
}

// =============================================================================
// Constants (from singles.c)
// =============================================================================

const F_BLACK = 0x1;
const F_CIRCLE = 0x2;
const F_ERROR = 0x4;
const F_SCRATCH = 0x8;

const DIFF_EASY = 0;
const DIFF_TRICKY = 1;
const _DIFF_MAX = 2;
const _DIFF_ANY = 3;

const BLACK = 0;
const CIRCLE = 1;

const CC_MARK_ERRORS = 1;
const CC_MUST_FILL = 2;

const MAXTRIES = 20;

/* top, right, bottom, left */
const dxs = [0, 1, 0, -1];
const dys = [-1, 0, 1, 0];

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

  // Path compression
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

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  const i1Arr = [0];
  const i2Arr = [0];
  v1 = edsfCanonify(dsf, v1, i1Arr);
  let inv = i1Arr[0];
  v2 = edsfCanonify(dsf, v2, i2Arr);
  inv ^= i2Arr[0];

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | (inv ? 1 : 0);
}

function dsfSize(dsf: Int32Array, index: number): number {
  return dsf[dsfCanonify(dsf, index)] >> 2;
}

// =============================================================================
// Maxflow — Edmonds-Karp (faithful port of maxflow.c, same as keen.ts)
// =============================================================================

function maxflowSetupBackedges(ne: number, edges: Int32Array, backedges: Int32Array): void {
  for (let i = 0; i < ne; i++) backedges[i] = i;

  // Heapsort backedges by (dest, source) order
  let n = 0;
  while (n < ne) {
    n++;
    let i = n - 1;
    while (i > 0) {
      const p = ((i - 1) / 2) | 0;
      if (lessEdge(edges, backedges[p], backedges[i])) {
        const tmp = backedges[p];
        backedges[p] = backedges[i];
        backedges[i] = tmp;
        i = p;
      } else break;
    }
  }

  while (n > 0) {
    n--;
    const tmp = backedges[0];
    backedges[0] = backedges[n];
    backedges[n] = tmp;

    let i = 0;
    while (true) {
      const lc = 2 * i + 1;
      const rc = 2 * i + 2;
      if (lc >= n) break;
      if (rc >= n) {
        if (lessEdge(edges, backedges[i], backedges[lc])) {
          const t = backedges[i];
          backedges[i] = backedges[lc];
          backedges[lc] = t;
        }
        break;
      } else {
        if (
          lessEdge(edges, backedges[i], backedges[lc]) ||
          lessEdge(edges, backedges[i], backedges[rc])
        ) {
          if (lessEdge(edges, backedges[lc], backedges[rc])) {
            const t = backedges[i];
            backedges[i] = backedges[rc];
            backedges[rc] = t;
            i = rc;
          } else {
            const t = backedges[i];
            backedges[i] = backedges[lc];
            backedges[lc] = t;
            i = lc;
          }
        } else break;
      }
    }
  }
}

function lessEdge(edges: Int32Array, i: number, j: number): boolean {
  return (
    edges[2 * i + 1] < edges[2 * j + 1] ||
    (edges[2 * i + 1] === edges[2 * j + 1] && edges[2 * i] < edges[2 * j])
  );
}

function maxflowWithScratch(
  nv: number,
  source: number,
  sink: number,
  ne: number,
  edges: Int32Array,
  backedges: Int32Array,
  capacity: Int32Array,
  flow: Int32Array,
): number {
  const todo = new Int32Array(nv);
  const prev = new Int32Array(nv);
  const firstedge = new Int32Array(nv);
  const firstbackedge = new Int32Array(nv);

  let j = 0;
  for (let i = 0; i < ne; i++) while (j <= edges[2 * i]) firstedge[j++] = i;
  while (j < nv) firstedge[j++] = ne;

  j = 0;
  for (let i = 0; i < ne; i++) while (j <= edges[2 * backedges[i] + 1]) firstbackedge[j++] = i;
  while (j < nv) firstbackedge[j++] = ne;

  for (let i = 0; i < ne; i++) flow[i] = 0;
  let totalflow = 0;

  while (true) {
    for (let i = 0; i < nv; i++) prev[i] = -1;

    let head = 0;
    let tail = 0;
    todo[tail++] = source;

    while (head < tail && prev[sink] <= 0) {
      const from = todo[head++];

      for (let i = firstedge[from]; i < ne && edges[2 * i] === from; i++) {
        const to = edges[2 * i + 1];
        if (to === source || prev[to] >= 0) continue;
        if (capacity[i] >= 0 && flow[i] >= capacity[i]) continue;
        prev[to] = 2 * i;
        todo[tail++] = to;
      }

      for (let i = firstbackedge[from]; i < ne && edges[2 * backedges[i] + 1] === from; i++) {
        const jj = backedges[i];
        const to = edges[2 * jj];
        if (to === source || prev[to] >= 0) continue;
        if (flow[jj] <= 0) continue;
        prev[to] = 2 * jj + 1;
        todo[tail++] = to;
      }
    }

    if (prev[sink] >= 0) {
      let to = sink;
      let max = -1;
      while (to !== source) {
        const i = prev[to];
        const from = edges[i];
        let spare: number;
        if (i & 1) {
          spare = flow[(i / 2) | 0];
        } else if (capacity[(i / 2) | 0] >= 0) {
          spare = capacity[(i / 2) | 0] - flow[(i / 2) | 0];
        } else {
          spare = -1;
        }
        if (max < 0 || (spare >= 0 && spare < max)) max = spare;
        to = from;
      }

      to = sink;
      while (to !== source) {
        const i = prev[to];
        const from = edges[i];
        if (i & 1) {
          flow[(i / 2) | 0] -= max;
        } else {
          flow[(i / 2) | 0] += max;
        }
        to = from;
      }

      totalflow += max;
      continue;
    }

    return totalflow;
  }
}

// =============================================================================
// PRNG helpers
// =============================================================================

function randomUpto(limit: number): number {
  return Math.floor(Math.random() * limit);
}

function shuffle(arr: number[] | Int32Array, n: number): void {
  for (let i = n - 1; i > 0; i--) {
    const j = randomUpto(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// =============================================================================
// Latin square generation (faithful port of latin.c)
// =============================================================================

function latinGenerate(o: number): number[] {
  const sq = new Array<number>(o * o).fill(0);

  const row = new Array<number>(o);
  const col = new Array<number>(o);
  const numinv = new Array<number>(o);
  const num = new Array<number>(o);
  for (let i = 0; i < o; i++) row[i] = i;
  shuffle(row, o);

  const ne = o * o + 2 * o;
  const edges = new Int32Array(ne * 2);
  const backedges = new Int32Array(ne);
  const capacity = new Int32Array(ne);
  const flow = new Int32Array(ne);

  let ei = 0;
  for (let i = 0; i < o; i++) {
    for (let j = 0; j < o; j++) {
      edges[ei * 2] = i;
      edges[ei * 2 + 1] = j + o;
      ei++;
    }
  }
  for (let i = 0; i < o; i++) {
    edges[ei * 2] = i + o;
    edges[ei * 2 + 1] = o * 2 + 1;
    capacity[ei] = 1;
    ei++;
  }
  for (let i = 0; i < o; i++) {
    edges[ei * 2] = o * 2;
    edges[ei * 2 + 1] = i;
    capacity[ei] = 1;
    ei++;
  }

  maxflowSetupBackedges(ne, edges, backedges);

  for (let i = 0; i < o; i++) {
    for (let j = 0; j < o; j++) col[j] = num[j] = j;
    shuffle(col, o);
    shuffle(num, o);
    for (let j = 0; j < o; j++) numinv[num[j]] = j;

    for (let j = 0; j < o * o; j++) capacity[j] = 1;
    for (let j = 0; j < i; j++) {
      for (let k = 0; k < o; k++) {
        const n = num[sq[row[j] * o + col[k]] - 1];
        capacity[k * o + n] = 0;
      }
    }

    const f = maxflowWithScratch(o * 2 + 2, 2 * o, 2 * o + 1, ne, edges, backedges, capacity, flow);
    if (f !== o) throw new Error('maxflow failed');

    for (let j = 0; j < o; j++) {
      let k = 0;
      for (; k < o; k++) {
        if (flow[j * o + k]) break;
      }
      sq[row[i] * o + col[j]] = numinv[k] + 1;
    }
  }

  return sq;
}

/**
 * Generate a latin rectangle of size w x h.
 * Faithful port of latin_generate_rect() from latin.c.
 */
function latinGenerateRect(w: number, h: number): number[] {
  const o = Math.max(w, h);
  const latin = latinGenerate(o);
  const rect = new Array<number>(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      rect[y * w + x] = latin[y * o + x];
    }
  }
  return rect;
}

// =============================================================================
// Game state (from singles.c)
// =============================================================================

interface GameState {
  w: number;
  h: number;
  n: number; // w * h
  o: number; // max(w, h)
  completed: number;
  used_solve: number;
  impossible: number;
  nums: number[]; // size w*h
  flags: Uint32Array; // size w*h
}

function blankGame(w: number, h: number): GameState {
  const n = w * h;
  return {
    w,
    h,
    n,
    o: Math.max(w, h),
    completed: 0,
    used_solve: 0,
    impossible: 0,
    nums: new Array<number>(n).fill(0),
    flags: new Uint32Array(n),
  };
}

function _dupGame(state: GameState): GameState {
  return {
    w: state.w,
    h: state.h,
    n: state.n,
    o: state.o,
    completed: state.completed,
    used_solve: state.used_solve,
    impossible: state.impossible,
    nums: state.nums.slice(),
    flags: new Uint32Array(state.flags),
  };
}

function inGrid(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.w && y >= 0 && y < state.h;
}

// =============================================================================
// DSF connectivity helpers (from singles.c)
// =============================================================================

function connectIfSame(state: GameState, dsf: Int32Array, i1: number, i2: number): void {
  if ((state.flags[i1] & F_BLACK) !== (state.flags[i2] & F_BLACK)) return;
  const c1 = dsfCanonify(dsf, i1);
  const c2 = dsfCanonify(dsf, i2);
  dsfMerge(dsf, c1, c2);
}

function connectDsf(state: GameState, dsf: Int32Array): void {
  dsfInit(dsf, state.n);
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * state.w + x;
      if (x < state.w - 1) connectIfSame(state, dsf, i, i + 1);
      if (y < state.h - 1) connectIfSame(state, dsf, i, i + state.w);
    }
  }
}

// =============================================================================
// Completion checking (from singles.c)
// =============================================================================

function checkRowcol(
  state: GameState,
  starti: number,
  di: number,
  sz: number,
  flags: number,
): number {
  let nerr = 0;
  for (let n = 0, i = starti; n < sz; n++, i += di) {
    if (state.flags[i] & F_BLACK) continue;
    for (let m = n + 1, j = i + di; m < sz; m++, j += di) {
      if (state.flags[j] & F_BLACK) continue;
      if (state.nums[i] !== state.nums[j]) continue;
      nerr++;
      if (!(flags & CC_MARK_ERRORS)) continue;
      if (state.flags[i] & F_CIRCLE && state.flags[j] & F_CIRCLE) {
        state.flags[i] |= F_ERROR;
        state.flags[j] |= F_ERROR;
      }
    }
  }
  return nerr;
}

function checkComplete(state: GameState, flags: number): number {
  const dsf = new Int32Array(state.n);
  let error = 0;
  const w = state.w;
  const h = state.h;

  if (flags & CC_MARK_ERRORS) {
    for (let i = 0; i < state.n; i++) state.flags[i] &= ~F_ERROR;
  }
  connectDsf(state, dsf);

  if (flags & CC_MUST_FILL) {
    for (let i = 0; i < state.n; i++) {
      if (!(state.flags[i] & F_BLACK) && !(state.flags[i] & F_CIRCLE)) error += 1;
    }
  }

  let nwhite = 0;
  for (let i = 0; i < state.n; i++) {
    if (state.flags[i] & F_BLACK) {
      if (dsfSize(dsf, i) > 1) {
        error += 1;
        if (flags & CC_MARK_ERRORS) state.flags[i] |= F_ERROR;
      }
    } else {
      nwhite += 1;
    }
  }

  for (let x = 0; x < w; x++) error += checkRowcol(state, x, w, h, flags);
  for (let y = 0; y < h; y++) error += checkRowcol(state, y * w, 1, w, flags);

  {
    let largest = 0;
    let canonical = -1;
    for (let i = 0; i < state.n; i++) {
      if (!(state.flags[i] & F_BLACK)) {
        const size = dsfSize(dsf, i);
        if (largest < size) {
          largest = size;
          canonical = i;
        }
      }
    }
    if (largest < nwhite) {
      for (let i = 0; i < state.n; i++) {
        if (!(state.flags[i] & F_BLACK) && dsfCanonify(dsf, i) !== canonical) {
          error += 1;
          if (flags & CC_MARK_ERRORS) state.flags[i] |= F_ERROR;
        }
      }
    }
  }

  return error > 0 ? 0 : 1;
}

// =============================================================================
// Solver (faithful port of singles.c solver)
// =============================================================================

interface SolverOp {
  x: number;
  y: number;
  op: number; // BLACK or CIRCLE
  desc: string;
}

interface SolverState {
  ops: SolverOp[];
  n_ops: number;
  scratch: Int32Array;
}

function solverStateNew(state: GameState): SolverState {
  return {
    ops: [],
    n_ops: 0,
    scratch: new Int32Array(state.n),
  };
}

function solverOpAdd(ss: SolverState, x: number, y: number, op: number, desc: string): void {
  ss.ops[ss.n_ops++] = { x, y, op, desc };
}

function solverOpCircle(state: GameState, ss: SolverState, x: number, y: number): void {
  if (!inGrid(state, x, y)) return;
  const i = y * state.w + x;
  if (state.flags[i] & F_BLACK) {
    state.impossible = 1;
    return;
  }
  if (!(state.flags[i] & F_CIRCLE)) {
    solverOpAdd(ss, x, y, CIRCLE, 'SB - adjacent to black square');
  }
}

function solverOpBlacken(
  state: GameState,
  ss: SolverState,
  x: number,
  y: number,
  num: number,
): void {
  if (!inGrid(state, x, y)) return;
  const i = y * state.w + x;
  if (state.nums[i] !== num) return;
  if (state.flags[i] & F_CIRCLE) {
    state.impossible = 1;
    return;
  }
  if (!(state.flags[i] & F_BLACK)) {
    solverOpAdd(ss, x, y, BLACK, 'SC - number on same row/col as circled');
  }
}

function solverOpsDo(state: GameState, ss: SolverState): number {
  let nextOp = 0;
  let n_ops = 0;

  while (nextOp < ss.n_ops) {
    const op = ss.ops[nextOp++];
    const i = op.y * state.w + op.x;

    if (op.op === BLACK) {
      if (state.flags[i] & F_CIRCLE) {
        state.impossible = 1;
        return n_ops;
      }
      if (!(state.flags[i] & F_BLACK)) {
        state.flags[i] |= F_BLACK;
        n_ops++;
        solverOpCircle(state, ss, op.x - 1, op.y);
        solverOpCircle(state, ss, op.x + 1, op.y);
        solverOpCircle(state, ss, op.x, op.y - 1);
        solverOpCircle(state, ss, op.x, op.y + 1);
      }
    } else {
      if (state.flags[i] & F_BLACK) {
        state.impossible = 1;
        return n_ops;
      }
      if (!(state.flags[i] & F_CIRCLE)) {
        state.flags[i] |= F_CIRCLE;
        n_ops++;
        for (let x = 0; x < state.w; x++) {
          if (x !== op.x) solverOpBlacken(state, ss, x, op.y, state.nums[i]);
        }
        for (let y = 0; y < state.h; y++) {
          if (y !== op.y) solverOpBlacken(state, ss, op.x, y, state.nums[i]);
        }
      }
    }
  }
  ss.n_ops = 0;
  return n_ops;
}

// --- solve_singlesep ---
function solveSinglesep(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * state.w + x;

      // Cell two to our right?
      const ir = i + 1;
      const irr = ir + 1;
      if (x < state.w - 2 && state.nums[i] === state.nums[irr] && !(state.flags[ir] & F_CIRCLE)) {
        solverOpAdd(ss, x + 1, y, CIRCLE, 'SP/ST - between identical nums');
      }

      // Cell two below us?
      const id = i + state.w;
      const idd = id + state.w;
      if (y < state.h - 2 && state.nums[i] === state.nums[idd] && !(state.flags[id] & F_CIRCLE)) {
        solverOpAdd(ss, x, y + 1, CIRCLE, 'SP/ST - between identical nums');
      }
    }
  }
  return ss.n_ops - n_ops;
}

// --- solve_doubles ---
function solveDoubles(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;
  let i = 0;
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++, i++) {
      if (state.flags[i] & F_BLACK) continue;

      let ii = i + 1;
      if (x < state.w - 1 && !(state.flags[ii] & F_BLACK) && state.nums[i] === state.nums[ii]) {
        for (let xy = 0; xy < state.w; xy++) {
          if (xy === x || xy === x + 1) continue;
          if (
            state.nums[y * state.w + xy] === state.nums[i] &&
            !(state.flags[y * state.w + xy] & F_BLACK)
          )
            solverOpAdd(ss, xy, y, BLACK, 'PI - same row as pair');
        }
      }

      ii = i + state.w;
      if (y < state.h - 1 && !(state.flags[ii] & F_BLACK) && state.nums[i] === state.nums[ii]) {
        for (let xy = 0; xy < state.h; xy++) {
          if (xy === y || xy === y + 1) continue;
          if (
            state.nums[xy * state.w + x] === state.nums[i] &&
            !(state.flags[xy * state.w + x] & F_BLACK)
          )
            solverOpAdd(ss, x, xy, BLACK, 'PI - same col as pair');
        }
      }
    }
  }
  return ss.n_ops - n_ops;
}

// --- solve_allblackbutone ---
function solveAllblackbutone(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;
  const dis = [-state.w, 1, state.w, -1];

  let i = 0;
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++, i++) {
      if (state.flags[i] & F_BLACK) continue;

      let ifree = -1;
      let skip = false;
      for (let d = 0; d < 4; d++) {
        const xd = x + dxs[d];
        const yd = y + dys[d];
        const id = i + dis[d];
        if (!inGrid(state, xd, yd)) continue;

        if (state.flags[id] & F_CIRCLE) {
          skip = true;
          break;
        }
        if (!(state.flags[id] & F_BLACK)) {
          if (ifree !== -1) {
            skip = true;
            break;
          }
          ifree = id;
        }
      }
      if (skip) continue;

      if (ifree !== -1) {
        solverOpAdd(
          ss,
          ifree % state.w,
          (ifree / state.w) | 0,
          CIRCLE,
          'CC/CE/QM: white cell with single non-black around it',
        );
      } else {
        state.impossible = 1;
        return 0;
      }
    }
  }
  return ss.n_ops - n_ops;
}

// --- solve_corner ---
function solveCorner(
  state: GameState,
  ss: SolverState,
  x: number,
  y: number,
  dx: number,
  dy: number,
): void {
  const is_ = new Array<number>(4);
  const ns = new Array<number>(4);
  const w = state.w;

  for (let yy = 0; yy < 2; yy++) {
    for (let xx = 0; xx < 2; xx++) {
      is_[yy * 2 + xx] = (y + dy * yy) * w + (x + dx * xx);
      ns[yy * 2 + xx] = state.nums[is_[yy * 2 + xx]];
    }
  }

  if (ns[0] === ns[1] && ns[0] === ns[2] && ns[0] === ns[3]) {
    solverOpAdd(ss, is_[0] % w, (is_[0] / w) | 0, BLACK, 'QC: corner with 4 matching');
    solverOpAdd(ss, is_[3] % w, (is_[3] / w) | 0, BLACK, 'QC: corner with 4 matching');
  } else if (ns[0] === ns[1] && ns[0] === ns[2]) {
    solverOpAdd(ss, is_[0] % w, (is_[0] / w) | 0, BLACK, 'TC: corner apex from 3 matching');
  } else if (ns[1] === ns[2] && ns[1] === ns[3]) {
    solverOpAdd(ss, is_[3] % w, (is_[3] / w) | 0, BLACK, 'TC: inside apex from 3 matching');
  } else if (ns[0] === ns[1] || ns[1] === ns[3]) {
    solverOpAdd(ss, is_[2] % w, (is_[2] / w) | 0, CIRCLE, 'DC: corner with 2 matching');
  } else if (ns[0] === ns[2] || ns[2] === ns[3]) {
    solverOpAdd(ss, is_[1] % w, (is_[1] / w) | 0, CIRCLE, 'DC: corner with 2 matching');
  }
}

function solveCorners(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;
  solveCorner(state, ss, 0, 0, 1, 1);
  solveCorner(state, ss, state.w - 1, 0, -1, 1);
  solveCorner(state, ss, state.w - 1, state.h - 1, -1, -1);
  solveCorner(state, ss, 0, state.h - 1, 1, -1);
  return ss.n_ops - n_ops;
}

// --- solve_offsetpair ---
function solveOffsetpairPair(
  state: GameState,
  ss: SolverState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const w = state.w;
  let ox: number, oy: number;

  if (x1 === x2) {
    ox = 1;
    oy = 0;
  } else {
    ox = 0;
    oy = 1;
  }

  const ax = x1 + ox;
  const ay = y1 + oy;
  if (!inGrid(state, ax, ay)) return;
  const an = state.nums[ay * w + ax];

  const dxArr = [x2 + ox + oy, x2 + ox - oy];
  const dyArr = [y2 + oy + ox, y2 + oy - ox];

  for (let d = 0; d < 2; d++) {
    if (inGrid(state, dxArr[d], dyArr[d]) && (dxArr[d] !== ax || dyArr[d] !== ay)) {
      const dn = state.nums[dyArr[d] * w + dxArr[d]];
      if (an === dn) {
        const xd = dxArr[d] - x2;
        const yd = dyArr[d] - y2;
        solverOpAdd(ss, x2 + xd, y2, CIRCLE, 'IP: next to offset-pair');
        solverOpAdd(ss, x2, y2 + yd, CIRCLE, 'IP: next to offset-pair');
      }
    }
  }
}

function solveOffsetpair(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;

  for (let x = 0; x < state.w - 1; x++) {
    for (let y = 0; y < state.h; y++) {
      const n1 = state.nums[y * state.w + x];
      for (let yy = y + 1; yy < state.h; yy++) {
        const n2 = state.nums[yy * state.w + x];
        if (n1 === n2) {
          solveOffsetpairPair(state, ss, x, y, x, yy);
          solveOffsetpairPair(state, ss, x, yy, x, y);
        }
      }
    }
  }
  for (let y = 0; y < state.h - 1; y++) {
    for (let x = 0; x < state.w; x++) {
      const n1 = state.nums[y * state.w + x];
      for (let xx = x + 1; xx < state.w; xx++) {
        const n2 = state.nums[y * state.w + xx];
        if (n1 === n2) {
          solveOffsetpairPair(state, ss, x, y, xx, y);
          solveOffsetpairPair(state, ss, xx, y, x, y);
        }
      }
    }
  }
  return ss.n_ops - n_ops;
}

// --- solve_hassinglewhiteregion ---
function solveHassinglewhiteregion(state: GameState, ss: SolverState): number {
  let nwhite = 0;
  let lwhite = -1;

  for (let i = 0; i < state.n; i++) {
    if (!(state.flags[i] & F_BLACK)) {
      nwhite++;
      lwhite = i;
    }
    state.flags[i] &= ~F_SCRATCH;
  }
  if (lwhite === -1) {
    state.impossible = 1;
    return 0;
  }

  for (let i = 0; i < state.n; i++) ss.scratch[i] = -1;
  ss.scratch[0] = lwhite;
  state.flags[lwhite] |= F_SCRATCH;
  let start = 0;
  let end = 1;
  let next = 1;

  while (start < end) {
    for (let a = start; a < end; a++) {
      const i = ss.scratch[a];
      for (let d = 0; d < 4; d++) {
        const x = (i % state.w) + dxs[d];
        const y = ((i / state.w) | 0) + dys[d];
        const j = y * state.w + x;
        if (!inGrid(state, x, y)) continue;
        if (state.flags[j] & (F_BLACK | F_SCRATCH)) continue;
        ss.scratch[next++] = j;
        state.flags[j] |= F_SCRATCH;
      }
    }
    start = end;
    end = next;
  }
  const szwhite = next;
  return szwhite === nwhite ? 1 : 0;
}

// --- solve_removesplits ---
function solveRemovesplitsCheck(state: GameState, ss: SolverState, x: number, y: number): void {
  if (!inGrid(state, x, y)) return;
  const i = y * state.w + x;
  if (state.flags[i] & F_CIRCLE || state.flags[i] & F_BLACK) return;

  state.flags[i] |= F_BLACK;
  const issingle = solveHassinglewhiteregion(state, ss);
  state.flags[i] &= ~F_BLACK;

  if (!issingle) solverOpAdd(ss, x, y, CIRCLE, 'MC: black square here would split white region');
}

function solveRemovesplits(state: GameState, ss: SolverState): number {
  const n_ops = ss.n_ops;

  if (!solveHassinglewhiteregion(state, ss)) {
    state.impossible = 1;
    return 0;
  }

  for (let i = 0; i < state.n; i++) {
    if (!(state.flags[i] & F_BLACK)) continue;
    const x = i % state.w;
    const y = (i / state.w) | 0;
    solveRemovesplitsCheck(state, ss, x - 1, y - 1);
    solveRemovesplitsCheck(state, ss, x + 1, y - 1);
    solveRemovesplitsCheck(state, ss, x + 1, y + 1);
    solveRemovesplitsCheck(state, ss, x - 1, y + 1);
  }
  return ss.n_ops - n_ops;
}

// --- solve_sneaky ---
function solveSneaky(state: GameState, ss: SolverState | null): number {
  let nunique = 0;

  for (let i = 0; i < state.n; i++) state.flags[i] &= ~F_SCRATCH;

  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * state.w + x;

      for (let xx = x; xx < state.w; xx++) {
        const ii = y * state.w + xx;
        if (i === ii) continue;
        if (state.nums[i] === state.nums[ii]) {
          state.flags[i] |= F_SCRATCH;
          state.flags[ii] |= F_SCRATCH;
        }
      }

      for (let yy = y; yy < state.h; yy++) {
        const ii = yy * state.w + x;
        if (i === ii) continue;
        if (state.nums[i] === state.nums[ii]) {
          state.flags[i] |= F_SCRATCH;
          state.flags[ii] |= F_SCRATCH;
        }
      }
    }
  }

  for (let i = 0; i < state.n; i++) {
    if (!(state.flags[i] & F_SCRATCH)) {
      if (ss)
        solverOpAdd(
          ss,
          i % state.w,
          (i / state.w) | 0,
          CIRCLE,
          'SNEAKY: only one of its number in row and col',
        );
      nunique += 1;
    } else {
      state.flags[i] &= ~F_SCRATCH;
    }
  }
  return nunique;
}

// --- solve_specific ---
function solveSpecific(state: GameState, diff: number, sneaky: number): number {
  const ss = solverStateNew(state);

  if (sneaky) solveSneaky(state, ss);

  solveSinglesep(state, ss);
  solveDoubles(state, ss);
  solveCorners(state, ss);

  if (diff >= DIFF_TRICKY) solveOffsetpair(state, ss);

  while (true) {
    if (ss.n_ops > 0) solverOpsDo(state, ss);
    if (state.impossible) break;

    if (solveAllblackbutone(state, ss) > 0) continue;
    if (state.impossible) break;

    if (diff >= DIFF_TRICKY) {
      if (solveRemovesplits(state, ss) > 0) continue;
      if (state.impossible) break;
    }

    break;
  }

  return state.impossible ? -1 : checkComplete(state, CC_MUST_FILL);
}

// =============================================================================
// Game generation (faithful port of singles.c new_game_desc)
// =============================================================================

function newGameIsGood(diff: number, state: GameState, tosolve: GameState): boolean {
  let sretEasy = 0;

  tosolve.nums = state.nums.slice();
  tosolve.flags = new Uint32Array(state.n);
  tosolve.completed = 0;
  tosolve.impossible = 0;

  const sret = solveSpecific(tosolve, diff, 0);
  if (diff > DIFF_EASY) {
    tosolve.flags = new Uint32Array(state.n);
    tosolve.completed = 0;
    tosolve.impossible = 0;
    sretEasy = solveSpecific(tosolve, diff - 1, 1);
  }

  return sret > 0 && sretEasy <= 0;
}

function bestBlackCol(
  state: GameState,
  scratch: number[],
  i_: number,
  rownums: number[],
  colnums: number[],
): number {
  const w = state.w;
  const x = i_ % w;
  const y = (i_ / w) | 0;
  const o = state.o;

  for (let i = 0; i < o; i++) scratch[i] = i;
  shuffle(scratch, o);

  // Prefer numbers that remove latin-square uniqueness
  for (let i = 0; i < o; i++) {
    const j = scratch[i] + 1;
    if (rownums[y * o + j - 1] === 1 && colnums[x * o + j - 1] === 1)
      return finishBestBlack(y, x, o, j, rownums, colnums);
  }

  // Then any number that isn't unique
  for (let i = 0; i < o; i++) {
    const j = scratch[i] + 1;
    if (rownums[y * o + j - 1] !== 0 || colnums[x * o + j - 1] !== 0)
      return finishBestBlack(y, x, o, j, rownums, colnums);
  }

  // Fallback (should not happen)
  return finishBestBlack(y, x, o, scratch[0] + 1, rownums, colnums);
}

function finishBestBlack(
  y: number,
  x: number,
  o: number,
  j: number,
  rownums: number[],
  colnums: number[],
): number {
  rownums[y * o + j - 1] += 1;
  colnums[x * o + j - 1] += 1;
  return j;
}

function newGameDesc(w: number, h: number): SinglesPuzzle {
  const diff = DIFF_TRICKY; // generate at tricky difficulty
  const n = w * h;
  const o = Math.max(w, h);
  const scratch = new Array<number>(n);
  const rownums = new Array<number>(h * o);
  const colnums = new Array<number>(w * o);

  // Outer generation loop — restart from scratch if impossible
  for (let genAttempt = 0; genAttempt < 1000; genAttempt++) {
    const state = blankGame(w, h);
    const tosolve = blankGame(w, h);
    const ss = solverStateNew(state);
    ss.n_ops = 0;

    // 1. Generate latin rectangle
    const latin = latinGenerateRect(w, h);
    for (let i = 0; i < n; i++) state.nums[i] = latin[i];

    // 2. Add black squares randomly, using solver hints
    for (let i = 0; i < n; i++) scratch[i] = i;
    shuffle(scratch, n);

    let impossible = false;
    for (let j = 0; j < n; j++) {
      const i = scratch[j];
      if (state.flags[i] & F_CIRCLE || state.flags[i] & F_BLACK) continue;

      solverOpAdd(ss, i % w, (i / w) | 0, BLACK, 'Generator: adding random black cell');
      solverOpsDo(state, ss);

      solveAllblackbutone(state, ss);
      solverOpsDo(state, ss);

      solveRemovesplits(state, ss);
      solverOpsDo(state, ss);

      if (state.impossible) {
        impossible = true;
        break;
      }
    }
    if (impossible) continue;

    // 3. Assign numbers under black squares
    rownums.fill(0);
    colnums.fill(0);
    for (let i = 0; i < n; i++) {
      if (state.flags[i] & F_BLACK) continue;
      const j = state.nums[i];
      const x = i % w;
      const y = (i / w) | 0;
      rownums[y * o + j - 1] += 1;
      colnums[x * o + j - 1] += 1;
    }

    // Save solution before randomising numbers
    const solutionFlags = new Uint32Array(state.flags);

    let found = false;
    for (let ntries = 0; ntries <= MAXTRIES; ntries++) {
      // Reset row/col nums for each retry
      if (ntries > 0) {
        rownums.fill(0);
        colnums.fill(0);
        for (let i = 0; i < n; i++) {
          if (solutionFlags[i] & F_BLACK) continue;
          const j = state.nums[i];
          const x = i % w;
          const y = (i / w) | 0;
          rownums[y * o + j - 1] += 1;
          colnums[x * o + j - 1] += 1;
        }
      }

      for (let i = 0; i < n; i++) {
        if (!(solutionFlags[i] & F_BLACK)) continue;
        state.nums[i] = bestBlackCol(state, scratch, i, rownums, colnums);
      }

      if (newGameIsGood(diff, state, tosolve)) {
        found = true;
        break;
      }
    }

    if (!found) continue;

    // Build the solution array
    const solution = new Array<boolean>(n);
    for (let i = 0; i < n; i++) {
      solution[i] = !!(solutionFlags[i] & F_BLACK);
    }

    return {
      nums: state.nums,
      w,
      h,
      solution,
    };
  }

  // Should not reach here, but fallback
  throw new Error('Failed to generate puzzle after 1000 attempts');
}
