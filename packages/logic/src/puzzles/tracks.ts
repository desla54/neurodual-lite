// @ts-nocheck
/**
 * Tracks puzzle generator — faithful port of Simon Tatham's tracks.c
 *
 * "Lay tracks to enable the train to travel from village A to village B.
 * The numbers indicate how many sections of rail go in each row and column.
 * There are only straight rails and curved rails. The track cannot cross itself."
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=tracks.c
 */

// =============================================================================
// Public interface
// =============================================================================

export interface TracksPuzzle {
  /** Width of grid */
  w: number;
  /** Height of grid */
  h: number;
  /** Column clue numbers (length w) — how many track squares in each column */
  colClues: number[];
  /** Row clue numbers (length h) — how many track squares in each row */
  rowClues: number[];
  /** Row of the entrance station (left edge, row index) */
  rowStation: number;
  /** Column of the exit station (bottom edge, column index) */
  colStation: number;
  /**
   * Clue cells: array of { x, y, dirs } where dirs is a 4-bit mask (R=1,U=2,L=4,D=8)
   * indicating which two edges of this square have track.
   */
  clues: { x: number; y: number; dirs: number }[];
  /**
   * Full solution: w*h array of 4-bit direction masks.
   * 0 = no track; otherwise exactly 2 bits set indicating the track shape.
   */
  solution: number[];
}

// =============================================================================
// Direction constants — ported from tracks.c
// =============================================================================

const R = 1;
const U = 2;
const L = 4;
const D = 8;
const ALLDIR = 15;

const NDIRS = 4;
const DIRS_CONST = [U, D, L, R];

function DX(d: number): number {
  return (d === R ? 1 : 0) - (d === L ? 1 : 0);
}
function DY(d: number): number {
  return (d === D ? 1 : 0) - (d === U ? 1 : 0);
}

/** Flip direction (opposite) */
function _F(d: number): number {
  return ((d << 2) | (d >> 2)) & 0xf;
}

const NBITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

// =============================================================================
// Square flags — ported from tracks.c
// =============================================================================

const S_TRACK = 1;
const S_NOTRACK = 2;
const S_ERROR = 4;
const S_CLUE = 8;
const S_MARK = 16;

const S_TRACK_SHIFT = 16;
const S_NOTRACK_SHIFT = 20;

// Edge flags
const E_TRACK = 1;
const E_NOTRACK = 2;

// Difficulty levels
const DIFF_EASY = 0;
const DIFF_TRICKY = 1;
const _DIFFCOUNT = 2;

// =============================================================================
// PRNG — simple xorshift128 seeded from Math.random
// =============================================================================

class RandomState {
  private s: Uint32Array;

  constructor() {
    this.s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      this.s[i] = (Math.random() * 0xffffffff) >>> 0;
    }
    // Ensure non-zero state
    if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) {
      this.s[0] = 1;
    }
  }

  nextU32(): number {
    let t = this.s[3]!;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s[3] = this.s[2]!;
    this.s[2] = this.s[1]!;
    this.s[1] = this.s[0]!;
    const s0 = this.s[0]!;
    t ^= s0;
    t ^= s0 >>> 19;
    this.s[0] = t >>> 0;
    return t >>> 0;
  }

  upto(n: number): number {
    return this.nextU32() % n;
  }
}

function shuffle<T>(arr: T[], rs: RandomState): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rs.upto(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// =============================================================================
// DSF (Disjoint Set Forest) — faithful port of dsf.c
// =============================================================================

function dsfInit(dsf: Int32Array): void {
  for (let i = 0; i < dsf.length; i++) dsf[i] = 6;
}

function newDsf(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf);
  return dsf;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index]! & 2) === 0) {
    inverse ^= dsf[index]! & 1;
    index = dsf[index]! >> 2;
  }
  const canonicalIndex = index;

  // Path compression
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index]! >> 2;
    const nextInverse = inverse ^ (dsf[index]! & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return index;
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  v1 = dsfCanonify(dsf, v1);
  v2 = dsfCanonify(dsf, v2);

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] = (dsf[v1]! + ((dsf[v2]! >> 2) << 2)) | 0;
  dsf[v2] = (v1 << 2) | 0;
}

// =============================================================================
// Game state — ported from tracks.c
// =============================================================================

interface GameNumbers {
  numbers: Int32Array; // size w+h
  row_s: number; // station row (entrance, left edge)
  col_s: number; // station column (exit, bottom edge)
}

interface GameState {
  w: number;
  h: number;
  diff: number;
  single_ones: boolean;
  sflags: Uint32Array; // size w*h
  numbers: GameNumbers;
  num_errors: Int32Array; // size w+h
  completed: boolean;
  used_solve: boolean;
  impossible: boolean;
}

function INGRID(state: GameState, gx: number, gy: number): boolean {
  return gx >= 0 && gx < state.w && gy >= 0 && gy < state.h;
}

function S_E_DIRS(state: GameState, sx: number, sy: number, eflag: number): number {
  return (
    (state.sflags[sy * state.w + sx]! >> (eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT)) &
    ALLDIR
  );
}

function S_E_COUNT(state: GameState, sx: number, sy: number, eflag: number): number {
  return NBITS[S_E_DIRS(state, sx, sy, eflag)]!;
}

function S_E_FLAGS(state: GameState, sx: number, sy: number, d: number): number {
  const f = state.sflags[sy * state.w + sx]!;
  const t = f & (d << S_TRACK_SHIFT);
  const nt = f & (d << S_NOTRACK_SHIFT);
  return (t ? E_TRACK : 0) | (nt ? E_NOTRACK : 0);
}

interface AdjResult {
  ax: number;
  ay: number;
  ad: number;
}

function S_E_ADJ(state: GameState, sx: number, sy: number, d: number): AdjResult | null {
  if (d === L && sx > 0) return { ax: sx - 1, ay: sy, ad: R };
  if (d === R && sx < state.w - 1) return { ax: sx + 1, ay: sy, ad: L };
  if (d === U && sy > 0) return { ax: sx, ay: sy - 1, ad: D };
  if (d === D && sy < state.h - 1) return { ax: sx, ay: sy + 1, ad: U };
  return null;
}

function S_E_SET(state: GameState, sx: number, sy: number, d: number, eflag: number): void {
  const shift = eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  state.sflags[sy * state.w + sx] |= d << shift;

  const adj = S_E_ADJ(state, sx, sy, d);
  if (adj) {
    state.sflags[adj.ay * state.w + adj.ax] |= adj.ad << shift;
  }
}

function S_E_CLEAR(state: GameState, sx: number, sy: number, d: number, eflag: number): void {
  const shift = eflag === E_TRACK ? S_TRACK_SHIFT : S_NOTRACK_SHIFT;
  state.sflags[sy * state.w + sx] &= ~(d << shift);

  const adj = S_E_ADJ(state, sx, sy, d);
  if (adj) {
    state.sflags[adj.ay * state.w + adj.ax] &= ~(adj.ad << shift);
  }
}

function clearGame(state: GameState): void {
  state.sflags.fill(0);
  state.numbers.numbers.fill(0);
  state.numbers.col_s = -1;
  state.numbers.row_s = -1;
  state.num_errors.fill(0);
  state.completed = false;
  state.used_solve = false;
  state.impossible = false;
}

function blankGame(w: number, h: number, diff: number, single_ones: boolean): GameState {
  const state: GameState = {
    w,
    h,
    diff,
    single_ones,
    sflags: new Uint32Array(w * h),
    numbers: {
      numbers: new Int32Array(w + h),
      row_s: -1,
      col_s: -1,
    },
    num_errors: new Int32Array(w + h),
    completed: false,
    used_solve: false,
    impossible: false,
  };
  return state;
}

function copyGameFlags(src: GameState, dest: GameState): void {
  dest.sflags.set(src.sflags);
}

function dupGame(state: GameState): GameState {
  const ret: GameState = {
    w: state.w,
    h: state.h,
    diff: state.diff,
    single_ones: state.single_ones,
    sflags: new Uint32Array(state.sflags),
    numbers: state.numbers, // shared ref (like the C code's refcounted struct)
    num_errors: new Int32Array(state.num_errors),
    completed: state.completed,
    used_solve: state.used_solve,
    impossible: state.impossible,
  };
  return ret;
}

// =============================================================================
// Path laying — ported from tracks.c
// =============================================================================

function findDirection(state: GameState, rs: RandomState, x: number, y: number): number {
  const w = state.w;
  const h = state.h;
  const dirs = [...DIRS_CONST];
  shuffle(dirs, rs);

  for (let i = 0; i < NDIRS; i++) {
    const nx = x + DX(dirs[i]!);
    const ny = y + DY(dirs[i]!);
    if (nx >= 0 && nx < w && ny === h) {
      // off the bottom: finished the path
      return dirs[i]!;
    } else if (!INGRID(state, nx, ny)) {
      continue;
    } else if (S_E_COUNT(state, nx, ny, E_TRACK) > 0) {
      continue;
    }
    return dirs[i]!;
  }
  return 0;
}

function layPath(state: GameState, rs: RandomState): void {
  for (;;) {
    clearGame(state);

    // Pick random entry point on left edge
    state.numbers.row_s = rs.upto(state.h);
    let px = 0;
    let py = state.numbers.row_s;
    S_E_SET(state, px, py, L, E_TRACK);

    let stuck = false;
    while (INGRID(state, px, py)) {
      const d = findDirection(state, rs, px, py);
      if (d === 0) {
        stuck = true;
        break;
      }
      S_E_SET(state, px, py, d, E_TRACK);
      px += DX(d);
      py += DY(d);
    }
    if (stuck) continue;

    // Double-check we got to the right place
    if (px >= 0 && px < state.w && py === state.h) {
      state.numbers.col_s = px;
      return;
    }
    // Otherwise retry
  }
}

// =============================================================================
// Solver — ported from tracks.c
// =============================================================================

function solveSetSflag(state: GameState, x: number, y: number, f: number): number {
  const i = y * state.w + x;
  if (state.sflags[i]! & f) return 0;
  if (state.sflags[i]! & (f === S_TRACK ? S_NOTRACK : S_TRACK)) {
    state.impossible = true;
  }
  state.sflags[i] |= f;
  return 1;
}

function solveSetEflag(state: GameState, x: number, y: number, d: number, f: number): number {
  const sf = S_E_FLAGS(state, x, y, d);
  if (sf & f) return 0;
  if (sf & (f === E_TRACK ? E_NOTRACK : E_TRACK)) {
    state.impossible = true;
  }
  S_E_SET(state, x, y, d, f);
  return 1;
}

function solveUpdateFlags(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let did = 0;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      // If a square is NOTRACK, all four edges must be
      if (state.sflags[y * w + x]! & S_NOTRACK) {
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          did += solveSetEflag(state, x, y, d, E_NOTRACK);
        }
      }

      // If 3 or more edges around a square are NOTRACK, the square is
      if (S_E_COUNT(state, x, y, E_NOTRACK) >= 3) {
        did += solveSetSflag(state, x, y, S_NOTRACK);
      }

      // If any edge around a square is TRACK, the square is
      if (S_E_COUNT(state, x, y, E_TRACK) > 0) {
        did += solveSetSflag(state, x, y, S_TRACK);
      }

      // If a square is TRACK and 2 edges are NOTRACK, the other two must be TRACK
      if (
        state.sflags[y * w + x]! & S_TRACK &&
        S_E_COUNT(state, x, y, E_NOTRACK) === 2 &&
        S_E_COUNT(state, x, y, E_TRACK) < 2
      ) {
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(S_E_FLAGS(state, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += solveSetEflag(state, x, y, d, E_TRACK);
          }
        }
      }

      // If a square is TRACK and 2 edges are TRACK, the other two must be NOTRACK
      if (
        state.sflags[y * w + x]! & S_TRACK &&
        S_E_COUNT(state, x, y, E_TRACK) === 2 &&
        S_E_COUNT(state, x, y, E_NOTRACK) < 2
      ) {
        for (let i = 0; i < 4; i++) {
          const d = 1 << i;
          if (!(S_E_FLAGS(state, x, y, d) & (E_TRACK | E_NOTRACK))) {
            did += solveSetEflag(state, x, y, d, E_NOTRACK);
          }
        }
      }
    }
  }
  return did;
}

function solveCountCol(state: GameState, col: number, f: number): number {
  let c = 0;
  const w = state.w;
  const h = state.h;
  for (let n = 0, i = col; n < h; n++, i += w) {
    if (state.sflags[i]! & f) c++;
  }
  return c;
}

function solveCountRow(state: GameState, row: number, f: number): number {
  let c = 0;
  const w = state.w;
  for (let n = 0, i = w * row; n < w; n++, i++) {
    if (state.sflags[i]! & f) c++;
  }
  return c;
}

function solveCountCluesSub(
  state: GameState,
  si: number,
  id: number,
  n: number,
  target: number,
): number {
  const w = state.w;
  let ctrack = 0;
  let cnotrack = 0;
  let did = 0;

  for (let j = 0, i = si; j < n; j++, i += id) {
    if (state.sflags[i]! & S_TRACK) ctrack++;
    if (state.sflags[i]! & S_NOTRACK) cnotrack++;
  }
  if (ctrack === target) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(state.sflags[i]! & S_TRACK)) did += solveSetSflag(state, i % w, (i / w) | 0, S_NOTRACK);
    }
  }
  if (cnotrack === n - target) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(state.sflags[i]! & S_NOTRACK)) did += solveSetSflag(state, i % w, (i / w) | 0, S_TRACK);
    }
  }
  return did;
}

function solveCountClues(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let did = 0;

  for (let x = 0; x < w; x++) {
    const target = state.numbers.numbers[x]!;
    did += solveCountCluesSub(state, x, w, h, target);
  }
  for (let y = 0; y < h; y++) {
    const target = state.numbers.numbers[w + y]!;
    did += solveCountCluesSub(state, y * w, 1, w, target);
  }
  return did;
}

function solveCheckSingleSub(
  state: GameState,
  si: number,
  id: number,
  n: number,
  target: number,
  perpf: number,
): number {
  const w = state.w;
  let ctrack = 0;
  let nperp = 0;
  let n1edge = 0;
  let i1edge = 0;
  let did = 0;

  for (let j = 0, i = si; j < n; j++, i += id) {
    if (state.sflags[i]! & S_TRACK) ctrack++;
    const impossible = S_E_DIRS(state, i % w, (i / w) | 0, E_NOTRACK);
    if ((perpf & impossible) === 0) nperp++;
    if (S_E_COUNT(state, i % w, (i / w) | 0, E_TRACK) <= 1) {
      n1edge++;
      i1edge = i;
    }
  }
  if (ctrack !== target - 1) return 0;
  if (nperp > 0 || n1edge !== 1) return 0;

  const ox = i1edge % w;
  const oy = (i1edge / w) | 0;
  for (let j = 0, i = si; j < n; j++, i += id) {
    const x = i % w;
    const y = (i / w) | 0;
    if (Math.abs(ox - x) > 1 || Math.abs(oy - y) > 1) {
      if (!(state.sflags[i]! & S_TRACK)) did += solveSetSflag(state, x, y, S_NOTRACK);
    }
  }
  return did;
}

function solveCheckSingle(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let did = 0;

  for (let x = 0; x < w; x++) {
    const target = state.numbers.numbers[x]!;
    did += solveCheckSingleSub(state, x, w, h, target, R | L);
  }
  for (let y = 0; y < h; y++) {
    const target = state.numbers.numbers[w + y]!;
    did += solveCheckSingleSub(state, y * w, 1, w, target, U | D);
  }
  return did;
}

function solveCheckLooseSub(
  state: GameState,
  si: number,
  id: number,
  n: number,
  target: number,
  perpf: number,
): number {
  const w = state.w;
  const parf = ALLDIR & ~perpf;
  let nperp = 0;
  let nloose = 0;
  let e2count = 0;
  let did = 0;

  for (let j = 0, i = si; j < n; j++, i += id) {
    const fcount = S_E_COUNT(state, i % w, (i / w) | 0, E_TRACK);
    if (fcount === 2) e2count++;
    state.sflags[i] &= ~S_MARK;
    if (fcount === 1 && parf & S_E_DIRS(state, i % w, (i / w) | 0, E_TRACK)) {
      nloose++;
      state.sflags[i] |= S_MARK;
    }
    if (fcount !== 2 && !(perpf & S_E_DIRS(state, i % w, (i / w) | 0, E_NOTRACK))) nperp++;
  }

  if (nloose > target - e2count) {
    state.impossible = true;
  }
  if (nloose > 0 && nloose === target - e2count) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(state.sflags[i]! & S_MARK)) continue;
      if (j > 0 && state.sflags[i - id]! & S_MARK) continue;
      if (j < n - 1 && state.sflags[i + id]! & S_MARK) continue;

      for (let k = 0; k < 4; k++) {
        if (parf & (1 << k) && !(S_E_DIRS(state, i % w, (i / w) | 0, E_TRACK) & (1 << k))) {
          did += solveSetEflag(state, i % w, (i / w) | 0, 1 << k, E_NOTRACK);
        }
      }
    }
  }
  if (nloose === 1 && target - e2count === 2 && nperp === 0) {
    for (let j = 0, i = si; j < n; j++, i += id) {
      if (!(state.sflags[i]! & S_MARK)) continue;
      for (let k = 0; k < 4; k++) {
        if (parf & (1 << k)) did += solveSetEflag(state, i % w, (i / w) | 0, 1 << k, E_TRACK);
      }
    }
  }

  return did;
}

function solveCheckLooseEnds(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let did = 0;

  for (let x = 0; x < w; x++) {
    const target = state.numbers.numbers[x]!;
    did += solveCheckLooseSub(state, x, w, h, target, R | L);
  }
  for (let y = 0; y < h; y++) {
    const target = state.numbers.numbers[w + y]!;
    did += solveCheckLooseSub(state, y * w, 1, w, target, U | D);
  }
  return did;
}

function solveCheckLoopSub(
  state: GameState,
  x: number,
  y: number,
  dir: number,
  dsf: Int32Array,
  startc: number,
  endc: number,
): number {
  const w = state.w;
  const h = state.h;
  const i = y * w + x;
  const j = (y + DY(dir)) * w + (x + DX(dir));

  if (
    state.sflags[i]! & S_TRACK &&
    state.sflags[j]! & S_TRACK &&
    !(S_E_DIRS(state, x, y, E_TRACK) & dir) &&
    !(S_E_DIRS(state, x, y, E_NOTRACK) & dir)
  ) {
    const ic = dsfCanonify(dsf, i);
    const jc = dsfCanonify(dsf, j);
    if (ic === jc) {
      return solveSetEflag(state, x, y, dir, E_NOTRACK);
    }
    if ((ic === startc && jc === endc) || (ic === endc && jc === startc)) {
      // Check for disconnected track pieces
      for (let k = 0; k < w * h; k++) {
        if (
          state.sflags[k]! & S_TRACK &&
          dsfCanonify(dsf, k) !== startc &&
          dsfCanonify(dsf, k) !== endc
        ) {
          return solveSetEflag(state, x, y, dir, E_NOTRACK);
        }
      }
      // Check clue satisfaction
      let satisfied = true;
      for (let k = 0; k < w; k++) {
        const target = state.numbers.numbers[k]!;
        const ntracks = solveCountCol(state, k, S_TRACK);
        if (ntracks < target) satisfied = false;
      }
      for (let k = 0; k < h; k++) {
        const target = state.numbers.numbers[w + k]!;
        const ntracks = solveCountRow(state, k, S_TRACK);
        if (ntracks < target) satisfied = false;
      }
      if (!satisfied) {
        return solveSetEflag(state, x, y, dir, E_NOTRACK);
      }
    }
  }
  return 0;
}

function solveCheckLoop(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let did = 0;

  const dsf = newDsf(w * h);

  // Build connectivity
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (x < w - 1 && S_E_DIRS(state, x, y, E_TRACK) & R) {
        dsfMerge(dsf, i, y * w + (x + 1));
      }
      if (y < h - 1 && S_E_DIRS(state, x, y, E_TRACK) & D) {
        dsfMerge(dsf, i, (y + 1) * w + x);
      }
    }
  }

  const startc = dsfCanonify(dsf, state.numbers.row_s * w);
  const endc = dsfCanonify(dsf, (h - 1) * w + state.numbers.col_s);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (x < w - 1) did += solveCheckLoopSub(state, x, y, R, dsf, startc, endc);
      if (y < h - 1) did += solveCheckLoopSub(state, x, y, D, dsf, startc, endc);
    }
  }

  return did;
}

function solveDiscountEdge(state: GameState, x: number, y: number, d: number): void {
  if (S_E_DIRS(state, x, y, E_TRACK) & d) {
    return; // clue squares can have outer edges set
  }
  solveSetEflag(state, x, y, d, E_NOTRACK);
}

function tracksSolve(state: GameState, diff: number): number {
  const w = state.w;
  const h = state.h;
  state.impossible = false;

  // Set all outer border edges as no-track
  for (let x = 0; x < w; x++) {
    solveDiscountEdge(state, x, 0, U);
    solveDiscountEdge(state, x, h - 1, D);
  }
  for (let y = 0; y < h; y++) {
    solveDiscountEdge(state, 0, y, L);
    solveDiscountEdge(state, w - 1, y, R);
  }

  for (;;) {
    let didsth = 0;

    didsth += solveUpdateFlags(state);
    didsth += solveCountClues(state);
    didsth += solveCheckLoop(state);

    if (diff >= DIFF_TRICKY) {
      didsth += solveCheckSingle(state);
      didsth += solveCheckLooseEnds(state);
    }

    if (!didsth || state.impossible) break;
  }

  return state.impossible ? -1 : checkCompletion(state, false) ? 1 : 0;
}

// =============================================================================
// Completion check — ported from tracks.c
// =============================================================================

function dsfUpdateCompletion(
  state: GameState,
  loopclassRef: { value: number },
  ax: number,
  ay: number,
  dir: number,
  dsf: Int32Array,
): void {
  const w = state.w;
  if (!(S_E_DIRS(state, ax, ay, E_TRACK) & dir)) return;

  const bx = ax + DX(dir);
  const by = ay + DY(dir);
  if (!INGRID(state, bx, by)) return;

  const ai = ay * w + ax;
  const bi = by * w + bx;

  const ac = dsfCanonify(dsf, ai);
  const bc = dsfCanonify(dsf, bi);

  if (ac === bc) {
    loopclassRef.value = ac;
  } else {
    dsfMerge(dsf, ai, bi);
  }
}

function checkCompletion(state: GameState, mark: boolean): boolean {
  const w = state.w;
  const h = state.h;
  let ret = true;

  if (mark) {
    for (let i = 0; i < w + h; i++) state.num_errors[i] = 0;
    for (let i = 0; i < w * h; i++) {
      state.sflags[i] &= ~S_ERROR;
      if (S_E_COUNT(state, i % w, (i / w) | 0, E_TRACK) > 0) {
        if (S_E_COUNT(state, i % w, (i / w) | 0, E_TRACK) > 2) state.sflags[i] |= S_ERROR;
      }
    }
  }

  // Check columns
  for (let x = 0; x < w; x++) {
    const target = state.numbers.numbers[x]!;
    let ntrack = 0;
    let nnotrack = 0;
    for (let y = 0; y < h; y++) {
      if (S_E_COUNT(state, x, y, E_TRACK) > 0) ntrack++;
      if (state.sflags[y * w + x]! & S_NOTRACK) nnotrack++;
    }
    if (mark) {
      if (ntrack > target || nnotrack > h - target) {
        state.num_errors[x] = 1;
      }
    }
    if (ntrack !== target) ret = false;
  }

  // Check rows
  for (let y = 0; y < h; y++) {
    const target = state.numbers.numbers[w + y]!;
    let ntrack = 0;
    let nnotrack = 0;
    for (let x = 0; x < w; x++) {
      if (S_E_COUNT(state, x, y, E_TRACK) === 2) ntrack++;
      if (state.sflags[y * w + x]! & S_NOTRACK) nnotrack++;
    }
    if (mark) {
      if (ntrack > target || nnotrack > w - target) {
        state.num_errors[w + y] = 1;
      }
    }
    if (ntrack !== target) ret = false;
  }

  // Check for loops using DSF
  const dsf = newDsf(w * h);
  const loopclassRef = { value: -1 };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      dsfUpdateCompletion(state, loopclassRef, x, y, R, dsf);
      dsfUpdateCompletion(state, loopclassRef, x, y, D, dsf);
    }
  }

  if (loopclassRef.value !== -1) {
    ret = false;
  }

  if (mark) state.completed = ret;
  return ret;
}

// =============================================================================
// Clue setting — ported from tracks.c
// =============================================================================

function copyAndStrip(state: GameState, ret: GameState, flipcluei: number): GameState {
  const w = state.w;
  const h = state.h;

  copyGameFlags(state, ret);

  if (flipcluei !== -1) {
    ret.sflags[flipcluei] ^= S_CLUE;
  }

  for (let i = 0; i < w * h; i++) {
    if (!(ret.sflags[i]! & S_CLUE)) {
      ret.sflags[i] &= ~(S_TRACK | S_NOTRACK | S_ERROR | S_MARK);
      for (let j = 0; j < 4; j++) {
        const f = 1 << j;
        const xx = (i % w) + DX(f);
        const yy = ((i / w) | 0) + DY(f);
        if (!INGRID(state, xx, yy) || !(ret.sflags[yy * w + xx]! & S_CLUE)) {
          S_E_CLEAR(ret, i % w, (i / w) | 0, f, E_TRACK);
          S_E_CLEAR(ret, i % w, (i / w) | 0, f, E_NOTRACK);
        }
      }
    }
  }
  return ret;
}

function solveProgress(state: GameState): number {
  const w = state.w;
  const h = state.h;
  let progress = 0;

  for (let i = 0; i < w * h; i++) {
    if (state.sflags[i]! & S_TRACK) progress++;
    if (state.sflags[i]! & S_NOTRACK) progress++;
    progress += S_E_COUNT(state, i % w, (i / w) | 0, E_TRACK);
    progress += S_E_COUNT(state, i % w, (i / w) | 0, E_NOTRACK);
  }
  return progress;
}

function checkPhantomMoves(state: GameState): boolean {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * state.w + x;
      if (state.sflags[i]! & S_CLUE) continue;
      if (S_E_COUNT(state, x, y, E_TRACK) > 1) return true;
    }
  }
  return false;
}

function addClues(state: GameState, rs: RandomState, diff: number): number {
  const w = state.w;
  const h = state.h;
  const _ret = 0;

  const positions: number[] = [];
  const nedgesPreviousSolve = new Int32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (S_E_DIRS(state, i % w, (i / w) | 0, E_TRACK) !== 0) {
      positions.push(i);
    }
  }
  const npositions = positions.length;

  let scratch = dupGame(state);

  // Check if already soluble or too easy
  scratch = copyAndStrip(state, scratch, -1);
  if (diff > 0) {
    const sr = tracksSolve(scratch, diff - 1);
    if (sr > 0) return -1; // already too easy
  }
  const sr = tracksSolve(scratch, diff);
  if (sr > 0) return 1; // already soluble without extra clues

  let progress = solveProgress(scratch);

  // Lay clues until soluble
  shuffle(positions, rs);
  for (let pi = 0; pi < npositions; pi++) {
    const i = positions[pi]!;
    if (state.sflags[i]! & S_CLUE) continue;
    if (nedgesPreviousSolve[i]! === 2) continue;

    scratch = copyAndStrip(state, scratch, i);

    if (checkPhantomMoves(scratch)) continue;

    if (diff > 0) {
      if (tracksSolve(scratch, diff - 1) > 0) continue;
    }
    if (tracksSolve(scratch, diff) > 0) {
      state.sflags[i] |= S_CLUE;
      // goto strip_clues
      return stripClues(state, rs, diff, positions, npositions, scratch);
    }
    if (solveProgress(scratch) > progress) {
      progress = solveProgress(scratch);
      state.sflags[i] |= S_CLUE;

      for (let j = 0; j < w * h; j++) {
        nedgesPreviousSolve[j] = S_E_COUNT(scratch, j % w, (j / w) | 0, E_TRACK);
      }
    }
  }

  // Couldn't make it soluble
  return -1;
}

function stripClues(
  state: GameState,
  rs: RandomState,
  diff: number,
  positions: number[],
  npositions: number,
  scratch: GameState,
): number {
  const w = state.w;
  const h = state.h;

  shuffle(positions, rs);
  for (let pi = 0; pi < npositions; pi++) {
    const i = positions[pi]!;
    if (!(state.sflags[i]! & S_CLUE)) continue;
    // Don't strip entrance/exit clues
    if (i % w === 0 && ((i / w) | 0) === state.numbers.row_s) continue;
    if (((i / w) | 0) === h - 1 && i % w === state.numbers.col_s) continue;

    scratch = copyAndStrip(state, scratch, i);
    if (checkPhantomMoves(scratch)) continue;

    if (tracksSolve(scratch, diff) > 0) {
      state.sflags[i] &= ~S_CLUE;
    }
  }
  return 1;
}

// =============================================================================
// New game generation — ported from new_game_desc in tracks.c
// =============================================================================

function newGameState(w: number, h: number): GameState {
  const diff = w === 4 && h === 4 ? DIFF_EASY : DIFF_TRICKY;
  const single_ones = true;

  const state = blankGame(w, h, diff, single_ones);
  const rs = new RandomState();

  for (;;) {
    // Lay the random path
    layPath(state, rs);

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (S_E_COUNT(state, x, y, E_TRACK) > 0) {
          state.sflags[y * w + x] |= S_TRACK;
        }
        if ((x === 0 && y === state.numbers.row_s) || (y === h - 1 && x === state.numbers.col_s)) {
          state.sflags[y * w + x] |= S_CLUE;
        }
      }
    }

    // Update clue numbers
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (state.sflags[y * w + x]! & S_TRACK) {
          state.numbers.numbers[x]++;
          state.numbers.numbers[y + w]++;
        }
      }
    }

    // Check for boring 0-clue columns/rows
    let boring = false;
    for (let i = 0; i < w + h; i++) {
      if (state.numbers.numbers[i] === 0) {
        boring = true;
        break;
      }
    }
    if (boring) continue;

    // Disallow consecutive 1 clues
    if (single_ones) {
      let bad = false;
      let lastWasOne = true; // disallow 1 clue at entry point
      for (let i = 0; i < w + h; i++) {
        const isOne = state.numbers.numbers[i] === 1;
        if (isOne && lastWasOne) {
          bad = true;
          break;
        }
        lastWasOne = isOne;
      }
      if (!bad && state.numbers.numbers[w + h - 1] === 1) bad = true;
      if (bad) continue;
    }

    // Add clues to make soluble
    const ret = addClues(state, rs, diff);
    if (ret !== 1) continue;

    // We have a valid puzzle — extract the solution and clue data
    return state;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Tracks puzzle of the given dimensions.
 *
 * Uses Simon Tatham's algorithm: lay a random non-self-crossing path from
 * left edge to bottom edge, then iteratively add/strip clue squares until
 * the puzzle is uniquely solvable at TRICKY difficulty.
 *
 * @param w Grid width (min 4)
 * @param h Grid height (min 4)
 */
export function generateTracksPuzzle(w: number, h: number): TracksPuzzle {
  if (w < 4) w = 4;
  if (h < 4) h = 4;

  const state = newGameState(w, h);

  // Extract solution: for each cell, the 4-bit direction mask of track edges
  const solution = new Array(w * h);
  for (let i = 0; i < w * h; i++) {
    solution[i] = S_E_DIRS(state, i % w, (i / w) | 0, E_TRACK);
  }

  // Extract clues
  const clues: { x: number; y: number; dirs: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (state.sflags[i]! & S_CLUE) {
      const x = i % w;
      const y = (i / w) | 0;
      clues.push({
        x,
        y,
        dirs: S_E_DIRS(state, x, y, E_TRACK),
      });
    }
  }

  // Extract clue numbers
  const colClues: number[] = [];
  for (let x = 0; x < w; x++) colClues.push(state.numbers.numbers[x]!);
  const rowClues: number[] = [];
  for (let y = 0; y < h; y++) rowClues.push(state.numbers.numbers[w + y]!);

  return {
    w,
    h,
    colClues,
    rowClues,
    rowStation: state.numbers.row_s,
    colStation: state.numbers.col_s,
    clues,
    solution,
  };
}
