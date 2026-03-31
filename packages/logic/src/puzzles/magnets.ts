// @ts-nocheck
/**
 * Magnets puzzle generator and solver
 *
 * Faithful port of Simon Tatham's magnets.c + laydomino.c
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=magnets.c
 *
 * Cell values: EMPTY/NEUTRAL = 0, POSITIVE = 1, NEGATIVE = 2
 *
 * Rules:
 *   - Grid is tiled with dominoes (2×1 tiles)
 *   - Each domino is either a magnet (+/−) or neutral (both halves empty)
 *   - Clue numbers on edges count + and − in each row/column
 *   - No two identical poles may be orthogonally adjacent
 */

// =============================================================================
// Public types
// =============================================================================

export interface MagnetsPuzzle {
  /** Grid width (columns) */
  w: number;
  /** Grid height (rows) */
  h: number;
  /**
   * Domino layout: flat array size w*h.
   * dominoes[i] = j means cell i is paired with cell j.
   * If dominoes[i] === i, it's a singleton (neutral, only when w*h is odd).
   */
  dominoes: number[];
  /** Row clues: size h, each { plus, minus } where -1 means "no clue" */
  rowClues: { plus: number; minus: number }[];
  /** Column clues: size w, each { plus, minus } where -1 means "no clue" */
  colClues: { plus: number; minus: number }[];
  /** The unique solution grid, flat row-major. 0=neutral, 1=positive, 2=negative */
  solution: number[];
}

// =============================================================================
// Constants — matching magnets.c enums
// =============================================================================

const EMPTY = 0;
const NEUTRAL = 0;
const POSITIVE = 1;
const NEGATIVE = 2;

const GS_ERROR = 1;
const GS_SET = 2;
const GS_NOTPOSITIVE = 4;
const GS_NOTNEGATIVE = 8;
const GS_NOTNEUTRAL = 16;
const GS_MARK = 32;

const GS_NOTMASK = GS_NOTPOSITIVE | GS_NOTNEGATIVE | GS_NOTNEUTRAL;

const DIFF_EASY = 0;
const DIFF_TRICKY = 1;
const DIFFCOUNT = 2;

const ROW = 0;
const COLUMN = 1;

const dx = [-1, 1, 0, 0];
const dy = [0, 0, -1, 1];

// =============================================================================
// Helpers
// =============================================================================

function OPPOSITE(x: number): number {
  return (x * 2) % 3; // 0→0, 1→2, 2→1
}

function NOTFLAG(w: number): number {
  return w === NEUTRAL
    ? GS_NOTNEUTRAL
    : w === POSITIVE
      ? GS_NOTPOSITIVE
      : w === NEGATIVE
        ? GS_NOTNEGATIVE
        : 0;
}

function INGRID(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < h;
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/** Shuffle portion of an array (in-place, first n elements of subset) */
function shuffleN(arr: number[], n: number): void {
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// =============================================================================
// Game state — internal representation matching magnets.c structs
// =============================================================================

interface GameState {
  w: number;
  h: number;
  wh: number;
  grid: number[]; // size wh — EMPTY/POSITIVE/NEGATIVE
  flags: number[]; // size wh — bitmask of GS_* flags
  numbered: boolean;
  dominoes: number[]; // size wh — domino partner indices
  rowcount: number[]; // size h*3 — [pos, neg, neutral] per row
  colcount: number[]; // size w*3 — [pos, neg, neutral] per column
}

interface RowCol {
  i: number;
  di: number;
  n: number;
  targets: number[]; // reference into rowcount or colcount
  targetsOffset: number; // offset into the targets array
}

function newState(w: number, h: number): GameState {
  const wh = w * h;
  const state: GameState = {
    w,
    h,
    wh,
    grid: new Array(wh).fill(EMPTY),
    flags: new Array(wh).fill(0),
    numbered: false,
    dominoes: new Array(wh),
    rowcount: new Array(h * 3).fill(0),
    colcount: new Array(w * 3).fill(0),
  };
  for (let i = 0; i < wh; i++) {
    state.dominoes[i] = i; // singleton by default
  }
  return state;
}

function _dupState(src: GameState): GameState {
  return {
    w: src.w,
    h: src.h,
    wh: src.wh,
    grid: src.grid.slice(),
    flags: src.flags.slice(),
    numbered: src.numbered,
    dominoes: src.dominoes, // shared, never mutated after layout
    rowcount: src.rowcount.slice(),
    colcount: src.colcount.slice(),
  };
}

function clearState(state: GameState): void {
  state.numbered = false;
  state.rowcount.fill(0);
  state.colcount.fill(0);
  for (let i = 0; i < state.wh; i++) {
    state.grid[i] = EMPTY;
    state.flags[i] = 0;
    state.dominoes[i] = i;
  }
}

// =============================================================================
// RowCol helpers — matching magnets.c mkrowcol / count_rowcol
// =============================================================================

function mkrowcol(state: GameState, num: number, roworcol: number): RowCol {
  if (roworcol === ROW) {
    return {
      i: num * state.w,
      di: 1,
      n: state.w,
      targets: state.rowcount,
      targetsOffset: num * 3,
    };
  }
  return {
    i: num,
    di: state.w,
    n: state.h,
    targets: state.colcount,
    targetsOffset: num * 3,
  };
}

function rcTarget(rc: RowCol, which: number): number {
  return rc.targets[rc.targetsOffset + which]!;
}

function _rcSetTarget(rc: RowCol, which: number, val: number): void {
  rc.targets[rc.targetsOffset + which] = val;
}

function POSSIBLE(state: GameState, i: number, which: number): boolean {
  return !(state.flags[i]! & NOTFLAG(which));
}

// =============================================================================
// Domino layout — faithful port of laydomino.c
// =============================================================================

function dominoLayout(w: number, h: number): number[] {
  const wh = w * h;
  const grid = new Array<number>(wh);
  const grid2 = new Array<number>(wh);
  const list = new Array<number>(2 * wh);

  // All singletons initially
  for (let i = 0; i < wh; i++) grid[i] = i;

  // Build list of possible domino placements
  // Vertical placement with top at i encoded as 2*i
  // Horizontal placement with left at i encoded as 2*i+1
  let k = 0;
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w; i++) list[k++] = 2 * (j * w + i);
  for (let j = 0; j < h; j++) for (let i = 0; i < w - 1; i++) list[k++] = 2 * (j * w + i) + 1;

  // Shuffle and place dominoes greedily
  shuffleN(list, k);
  for (let i = 0; i < k; i++) {
    const horiz = list[i]! % 2;
    const xy = Math.floor(list[i]! / 2);
    const xy2 = xy + (horiz ? 1 : w);

    if (grid[xy] === xy && grid[xy2] === xy2) {
      grid[xy] = xy2;
      grid[xy2] = xy;
    }
  }

  // BFS to fix remaining singletons
  while (true) {
    let singletonCount = 0;
    let startSingleton = -1;
    for (let j = 0; j < wh; j++) {
      if (grid[j] === j) {
        singletonCount++;
        startSingleton = j;
      }
    }
    if (singletonCount === wh % 2) break;

    // BFS from startSingleton
    for (let j = 0; j < wh; j++) grid2[j] = -1;
    grid2[startSingleton] = 0;

    let done = 0;
    let todo = 1;
    list[0] = startSingleton;
    let foundTarget = -1;

    while (done < todo) {
      const cur = list[done++]!;
      const x = cur % w;
      const y = Math.floor(cur / w);

      // Collect neighbors
      const d: number[] = [];
      if (x > 0) d.push(cur - 1);
      if (x + 1 < w) d.push(cur + 1);
      if (y > 0) d.push(cur - w);
      if (y + 1 < h) d.push(cur + w);

      shuffle(d);

      let found = false;
      for (let j = 0; j < d.length; j++) {
        const nk = d[j]!;
        if (grid[nk] === nk) {
          // Found another singleton
          grid2[nk] = cur;
          foundTarget = nk;
          found = true;
          break;
        }

        // Moving through a domino
        const m = grid[nk]!;
        if (grid2[m]! < 0 || grid2[m]! > grid2[cur]! + 1) {
          grid2[m] = grid2[cur]! + 1;
          grid2[nk] = cur;
          list[todo++] = m;
        }
      }

      if (found) break;
    }

    // Follow trail back, re-laying dominoes
    let ii = foundTarget;
    while (true) {
      const j = grid2[ii]!;
      const kk = grid[j]!;
      grid[ii] = j;
      grid[j] = ii;
      if (j === kk) break; // reached the other singleton
      ii = kk;
    }
  }

  return grid;
}

// =============================================================================
// Solver — faithful port of magnets.c solver
// =============================================================================

function solveClearflags(state: GameState): void {
  for (let i = 0; i < state.wh; i++) {
    state.flags[i]! &= ~GS_NOTMASK;
    if (state.dominoes[i] !== i) state.flags[i]! &= ~GS_SET;
  }
}

function solveUnflag(state: GameState, i: number, which: number): number {
  const ii = state.dominoes[i]!;
  if (ii === i) return 0;

  if (state.flags[i]! & GS_SET && state.grid[i] === which) return -1;
  if (state.flags[ii]! & GS_SET && state.grid[ii] === OPPOSITE(which)) return -1;

  let ret = 0;
  if (POSSIBLE(state, i, which)) {
    state.flags[i]! |= NOTFLAG(which);
    ret++;
  }
  if (POSSIBLE(state, ii, OPPOSITE(which))) {
    state.flags[ii]! |= NOTFLAG(OPPOSITE(which));
    ret++;
  }
  return ret;
}

function solveUnflagSurrounds(state: GameState, i: number, which: number): number {
  const x = i % state.w;
  const y = Math.floor(i / state.w);

  for (let j = 0; j < 4; j++) {
    const xx = x + dx[j]!;
    const yy = y + dy[j]!;
    if (!INGRID(state.w, state.h, xx, yy)) continue;

    const ii = yy * state.w + xx;
    if (solveUnflag(state, ii, which) < 0) return -1;
  }
  return 0;
}

function solveSet(state: GameState, i: number, which: number): number {
  const ii = state.dominoes[i]!;

  if (state.flags[i]! & GS_SET) {
    if (state.grid[i] === which) return 0;
    return -1;
  }
  if (state.flags[ii]! & GS_SET && state.grid[ii] !== OPPOSITE(which)) return -1;
  if (!POSSIBLE(state, i, which)) return -1;
  if (!POSSIBLE(state, ii, OPPOSITE(which))) return -1;

  if (which !== NEUTRAL) {
    if (solveUnflagSurrounds(state, i, which) < 0) return -1;
    if (solveUnflagSurrounds(state, ii, OPPOSITE(which)) < 0) return -1;
  }

  state.grid[i] = which;
  state.grid[ii] = OPPOSITE(which);
  state.flags[i]! |= GS_SET;
  state.flags[ii]! |= GS_SET;

  return 1;
}

function solveCounts(state: GameState, rc: RowCol, counts: number[], unset: number[] | null): void {
  counts[0] = counts[1] = counts[2] = counts[3] = 0;
  if (unset) unset[0] = unset[1] = unset[2] = unset[3] = 0;

  let ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) {
      counts[state.grid[ii]!]++;
    } else if (unset) {
      for (let which = 0; which <= 2; which++) {
        if (POSSIBLE(state, ii, which)) unset[which]++;
      }
    }
  }
}

function solveCheckfull(state: GameState, rc: RowCol, counts: number[]): number {
  const starti = rc.i;
  let didsth = 0;
  const unset = [0, 0, 0, 0];

  solveCounts(state, rc, counts, unset);

  for (let which = 0; which <= 2; which++) {
    const target = rcTarget(rc, which);
    if (target === -1) continue;
    if (target < counts[which]!) return -1;

    if (target === counts[which]!) {
      // Unflag all remaining cells for this colour
      let ii = starti;
      for (let j = 0; j < rc.n; j++, ii += rc.di) {
        if (state.flags[ii]! & GS_SET) continue;
        if (!POSSIBLE(state, ii, which)) continue;
        if (solveUnflag(state, ii, which) < 0) return -1;
        didsth = 1;
      }
    } else if (target - counts[which]! === unset[which]!) {
      // Set all remaining possible cells to this colour
      let ii = starti;
      for (let j = 0; j < rc.n; j++, ii += rc.di) {
        if (state.flags[ii]! & GS_SET) continue;
        if (!POSSIBLE(state, ii, which)) continue;
        if (solveSet(state, ii, which) < 0) return -1;
        didsth = 1;
      }
    }
  }
  return didsth;
}

function solveStartflags(state: GameState): number {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * state.w + x;
      if (state.dominoes[i] === i) continue;
      if (state.grid[i] !== NEUTRAL || state.flags[i]! & GS_SET) {
        if (solveSet(state, i, state.grid[i]!) < 0) return -1;
      }
    }
  }
  return 0;
}

type RowColFn = (state: GameState, rc: RowCol, counts: number[]) => number;

function solveRowcols(state: GameState, fn: RowColFn): number {
  let didsth = 0;
  const counts = [0, 0, 0, 0];

  for (let x = 0; x < state.w; x++) {
    const rc = mkrowcol(state, x, COLUMN);
    solveCounts(state, rc, counts, null);
    const ret = fn(state, rc, counts);
    if (ret < 0) return ret;
    didsth += ret;
  }
  for (let y = 0; y < state.h; y++) {
    const rc = mkrowcol(state, y, ROW);
    solveCounts(state, rc, counts, null);
    const ret = fn(state, rc, counts);
    if (ret < 0) return ret;
    didsth += ret;
  }
  return didsth;
}

function solveForce(state: GameState): number {
  let didsth = 0;
  for (let i = 0; i < state.wh; i++) {
    if (state.flags[i]! & GS_SET) continue;
    if (state.dominoes[i] === i) continue;

    const f = state.flags[i]! & GS_NOTMASK;
    let which = -1;
    if (f === (GS_NOTPOSITIVE | GS_NOTNEGATIVE)) which = NEUTRAL;
    if (f === (GS_NOTPOSITIVE | GS_NOTNEUTRAL)) which = NEGATIVE;
    if (f === (GS_NOTNEGATIVE | GS_NOTNEUTRAL)) which = POSITIVE;
    if (which !== -1) {
      if (solveSet(state, i, which) < 0) return -1;
      didsth = 1;
    }
  }
  return didsth;
}

function solveNeither(state: GameState): number {
  let didsth = 0;
  for (let i = 0; i < state.wh; i++) {
    if (state.flags[i]! & GS_SET) continue;
    const j = state.dominoes[i]!;
    if (i === j) continue;

    if (
      (state.flags[i]! & GS_NOTPOSITIVE && state.flags[j]! & GS_NOTPOSITIVE) ||
      (state.flags[i]! & GS_NOTNEGATIVE && state.flags[j]! & GS_NOTNEGATIVE)
    ) {
      if (solveSet(state, i, NEUTRAL) < 0) return -1;
      didsth = 1;
    }
  }
  return didsth;
}

function solveAdvancedfull(state: GameState, rc: RowCol, counts: number[]): number {
  let nfound = 0;
  let clearpos = 0;
  let clearneg = 0;
  let ret = 0;

  if (rcTarget(rc, POSITIVE) === -1 && rcTarget(rc, NEGATIVE) === -1) return 0;
  if (
    rcTarget(rc, POSITIVE) >= 0 &&
    counts[POSITIVE]! === rcTarget(rc, POSITIVE) &&
    rcTarget(rc, NEGATIVE) >= 0 &&
    counts[NEGATIVE]! === rcTarget(rc, NEGATIVE)
  )
    return 0;

  // Clear marks
  let ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) state.flags[ii]! &= ~GS_MARK;

  // Find dominoes entirely within row/col where both ends can only be +/-
  ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) continue;
    if (state.dominoes[ii] !== ii + rc.di) continue;

    if (
      (state.flags[ii]! & GS_NOTMASK) !== GS_NOTNEUTRAL ||
      (state.flags[ii + rc.di]! & GS_NOTMASK) !== GS_NOTNEUTRAL
    )
      continue;

    state.flags[ii]! |= GS_MARK;
    state.flags[ii + rc.di]! |= GS_MARK;
    nfound++;
  }
  if (nfound === 0) return 0;

  counts[POSITIVE]! += nfound;
  counts[NEGATIVE]! += nfound;

  if (rcTarget(rc, POSITIVE) >= 0 && counts[POSITIVE]! === rcTarget(rc, POSITIVE)) clearpos = 1;
  if (rcTarget(rc, NEGATIVE) >= 0 && counts[NEGATIVE]! === rcTarget(rc, NEGATIVE)) clearneg = 1;
  if (!clearpos && !clearneg) return 0;

  ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) continue;
    if (state.flags[ii]! & GS_MARK) continue;

    if (clearpos && !(state.flags[ii]! & GS_NOTPOSITIVE)) {
      if (solveUnflag(state, ii, POSITIVE) < 0) return -1;
      ret++;
    }
    if (clearneg && !(state.flags[ii]! & GS_NOTNEGATIVE)) {
      if (solveUnflag(state, ii, NEGATIVE) < 0) return -1;
      ret++;
    }
  }
  return ret;
}

function solveNonneutral(state: GameState, rc: RowCol, counts: number[]): number {
  if (rcTarget(rc, NEUTRAL) !== counts[NEUTRAL]! + 1) return 0;

  let ret = 0;
  let ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) continue;
    if (state.dominoes[ii] !== ii + rc.di) continue;

    if (!(state.flags[ii]! & GS_NOTNEUTRAL)) {
      if (solveUnflag(state, ii, NEUTRAL) < 0) return -1;
      ret++;
    }
  }
  return ret;
}

function solveOddlength(state: GameState, rc: RowCol, counts: number[]): number {
  // Need zero neutral cells still to find
  if (rcTarget(rc, NEUTRAL) !== counts[NEUTRAL]!) return 0;

  const tpos = rcTarget(rc, POSITIVE) - counts[POSITIVE]!;
  const tneg = rcTarget(rc, NEGATIVE) - counts[NEGATIVE]!;
  let extra: number;
  if (tpos === tneg + 1) extra = POSITIVE;
  else if (tneg === tpos + 1) extra = NEGATIVE;
  else return 0;

  let start = -1;
  let length = 0;
  let inempty = false;
  let startodd = -1;

  let ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) {
      if (inempty) {
        if (length % 2) {
          if (startodd !== -1) return 0; // two odd sections
          startodd = start;
        }
        inempty = false;
      }
    } else {
      if (inempty) {
        length++;
      } else {
        start = ii;
        length = 1;
        inempty = true;
      }
    }
  }
  if (inempty && length % 2) {
    if (startodd !== -1) return 0;
    startodd = start;
  }
  if (startodd !== -1) return solveSet(state, startodd, extra);
  return 0;
}

function solveCountdominoesNeutral(state: GameState, rc: RowCol, counts: number[]): number {
  if (rcTarget(rc, POSITIVE) === -1 && rcTarget(rc, NEGATIVE) === -1) return 0;

  let ndom = 0;
  let ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) continue;
    // Skip solo cells or second cell in domino
    if (state.dominoes[ii] === ii || state.dominoes[ii] === ii - rc.di) continue;
    ndom++;
  }

  let nonn = false;
  if (rcTarget(rc, POSITIVE) !== -1 && rcTarget(rc, POSITIVE) - counts[POSITIVE]! === ndom)
    nonn = true;
  if (rcTarget(rc, NEGATIVE) !== -1 && rcTarget(rc, NEGATIVE) - counts[NEGATIVE]! === ndom)
    nonn = true;
  if (!nonn) return 0;

  let ret = 0;
  ii = rc.i;
  for (let j = 0; j < rc.n; j++, ii += rc.di) {
    if (state.flags[ii]! & GS_SET) continue;
    if (!(state.flags[ii]! & GS_NOTNEUTRAL)) {
      if (solveUnflag(state, ii, NEUTRAL) < 0) return -1;
      ret++;
    }
  }
  return ret;
}

function solveDominoCount(state: GameState, rc: RowCol, i: number, which: number): number {
  if (state.dominoes[i] === i || state.dominoes[i] === i - rc.di) return 0;
  if (state.flags[i]! & GS_SET) return 0;

  let nposs = 0;
  if (POSSIBLE(state, i, which)) nposs++;
  if (state.dominoes[i] === i + rc.di) {
    if (POSSIBLE(state, i + rc.di, which)) nposs++;
  }
  return nposs;
}

function solveCountdominoesNonneutral(state: GameState, rc: RowCol, counts: number[]): number {
  let didsth = 0;

  for (let w = 0, which = POSITIVE; w < 2; which = OPPOSITE(which), w++) {
    if (rcTarget(rc, which) === -1) continue;

    let ndom = 0;
    let ii = rc.i;
    for (let j = 0; j < rc.n; j++, ii += rc.di) {
      if (solveDominoCount(state, rc, ii, which) > 0) ndom++;
    }

    if (rcTarget(rc, which) - counts[which]! !== ndom) continue;

    ii = rc.i;
    for (let j = 0; j < rc.n; j++, ii += rc.di) {
      if (solveDominoCount(state, rc, ii, which) === 1) {
        let toset: number;
        if (POSSIBLE(state, ii, which)) {
          toset = ii;
        } else {
          toset = ii + rc.di;
        }
        if (solveSet(state, toset, which) < 0) return -1;
        didsth++;
      }
    }
  }
  return didsth;
}

// =============================================================================
// Main solver loop — matching solve_state in magnets.c
// =============================================================================

function solveState(state: GameState, diff: number): number {
  solveClearflags(state);
  if (solveStartflags(state) < 0) return -1;

  while (true) {
    let ret: number;

    ret = solveForce(state);
    if (ret > 0) continue;
    if (ret < 0) return -1;

    ret = solveNeither(state);
    if (ret > 0) continue;
    if (ret < 0) return -1;

    ret = solveRowcols(state, solveCheckfull);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    ret = solveRowcols(state, solveOddlength);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    if (diff < DIFF_TRICKY) break;

    ret = solveRowcols(state, solveAdvancedfull);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    ret = solveRowcols(state, solveNonneutral);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    ret = solveRowcols(state, solveCountdominoesNeutral);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    ret = solveRowcols(state, solveCountdominoesNonneutral);
    if (ret < 0) return -1;
    if (ret > 0) continue;

    break;
  }

  return checkCompletion(state);
}

// =============================================================================
// Completion checker — matching check_completion in magnets.c
// =============================================================================

function checkCompletion(state: GameState): number {
  let wrong = 0;
  let incomplete = 0;
  const w = state.w;
  const h = state.h;

  // Check row and column counts for magnets
  for (let ww = 0, which = POSITIVE; ww < 2; which = OPPOSITE(which), ww++) {
    for (let i = 0; i < w; i++) {
      const rc = mkrowcol(state, i, COLUMN);
      const target = rcTarget(rc, which);
      if (target === -1) continue;
      const count = countRowcol(state, i, COLUMN, which);
      if (count < target) incomplete = 1;
      if (count > target) wrong = 1;
    }
    for (let i = 0; i < h; i++) {
      const rc = mkrowcol(state, i, ROW);
      const target = rcTarget(rc, which);
      if (target === -1) continue;
      const count = countRowcol(state, i, ROW, which);
      if (count < target) incomplete = 1;
      if (count > target) wrong = 1;
    }
  }

  // Check each domino is filled and no touching identical terminals
  for (let i = 0; i < state.wh; i++) state.flags[i]! &= ~GS_ERROR;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const idx = y * w + x;
      if (state.dominoes[idx] === idx) continue;
      if (!(state.flags[idx]! & GS_SET)) incomplete = 1;

      const which = state.grid[idx]!;
      if (which !== NEUTRAL) {
        const checks: [number, number][] = [
          [x, y - 1],
          [x, y + 1],
          [x - 1, y],
          [x + 1, y],
        ];
        for (const [xx, yy] of checks) {
          if (INGRID(w, h, xx, yy) && state.grid[yy * w + xx] === which) {
            wrong = 1;
          }
        }
      }
    }
  }
  return wrong ? -1 : incomplete ? 0 : 1;
}

function countRowcol(state: GameState, num: number, roworcol: number, which: number): number {
  const rc = mkrowcol(state, num, roworcol);
  let count = 0;
  let ii = rc.i;
  for (let i = 0; i < rc.n; i++, ii += rc.di) {
    if (which < 0) {
      if (state.grid[ii] === EMPTY && !(state.flags[ii]! & GS_SET)) count++;
    } else if (state.grid[ii] === which) count++;
  }
  return count;
}

// =============================================================================
// Unnumbered solver — for lay_dominoes
// =============================================================================

function solveUnnumbered(state: GameState): number {
  while (true) {
    let ret = solveForce(state);
    if (ret > 0) continue;
    if (ret < 0) return -1;

    ret = solveNeither(state);
    if (ret > 0) continue;
    if (ret < 0) return -1;

    break;
  }
  for (let i = 0; i < state.wh; i++) {
    if (!(state.flags[i]! & GS_SET)) return 0;
  }
  return 1;
}

// =============================================================================
// Domino laying — matching lay_dominoes in magnets.c
// =============================================================================

function layDominoes(state: GameState): number {
  const scratch = new Array<number>(state.wh);
  let ret = 0;
  let _nlaid = 0;

  for (let i = 0; i < state.wh; i++) {
    scratch[i] = i;
    state.grid[i] = EMPTY;
    state.flags[i] = state.dominoes[i] === i ? GS_SET : 0;
  }
  shuffle(scratch);

  const nInitialNeutral = state.wh > 100 ? 5 : Math.floor(state.wh / 10);

  for (let n = 0; n < state.wh; n++) {
    const i = scratch[n]!;
    if (state.flags[i]! & GS_SET) continue;

    if (n < nInitialNeutral) {
      ret = solveSet(state, i, NEUTRAL);
    } else {
      if (!(state.flags[i]! & GS_NOTPOSITIVE)) ret = solveSet(state, i, POSITIVE);
      else if (!(state.flags[i]! & GS_NOTNEGATIVE)) ret = solveSet(state, i, NEGATIVE);
      else ret = solveSet(state, i, NEUTRAL);
    }

    if (!ret) {
      ret = -1;
      break;
    }

    _nlaid++;
    ret = solveUnnumbered(state);
    if (ret !== 0) break;
  }

  return ret;
}

// =============================================================================
// Game generation — matching gen_game + new_game_desc in magnets.c
// =============================================================================

function genGame(state: GameState): void {
  clearState(state);
  state.dominoes = dominoLayout(state.w, state.h);

  let ret: number;
  do {
    ret = layDominoes(state);
  } while (ret === -1);

  // Compute row/col counts from the filled grid
  state.colcount.fill(0);
  state.rowcount.fill(0);
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const val = state.grid[y * state.w + x]!;
      state.colcount[x * 3 + val]++;
      state.rowcount[y * 3 + val]++;
    }
  }
  state.numbered = true;
}

function checkDifficulty(state: GameState, diff: number): boolean {
  const solutionGrid = state.grid.slice();

  // Clear grid for solving
  state.grid.fill(EMPTY);

  if (diff > DIFF_EASY) {
    // If solvable at easier difficulty, it's too easy
    if (solveState(state, diff - 1) > 0) {
      state.grid = solutionGrid;
      return false;
    }
  }

  // Must be solvable at requested difficulty
  state.grid.fill(EMPTY);
  if (solveState(state, diff) <= 0) {
    state.grid = solutionGrid;
    return false;
  }

  state.grid = solutionGrid;
  return true;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Magnets puzzle.
 *
 * @param w Grid width (columns). Must be >= 2.
 * @param h Grid height (rows). Must be >= 2. w*h should be even.
 * @param difficulty 0 = Easy, 1 = Tricky (default: 1)
 * @returns A complete MagnetsPuzzle with domino layout, clues, and solution.
 */
export function generateMagnetsPuzzle(
  w: number,
  h: number,
  difficulty: number = DIFF_TRICKY,
): MagnetsPuzzle {
  const diff = Math.max(0, Math.min(difficulty, DIFFCOUNT - 1));
  const state = newState(w, h);

  // Generation loop: gen_game + check_difficulty, retry until satisfactory
  let maxAttempts = 200;
  while (maxAttempts-- > 0) {
    genGame(state);

    // Save solution before difficulty check clears grid
    const solution = state.grid.slice();

    if (checkDifficulty(state, diff)) {
      // Restore solution
      state.grid = solution;

      // Build clues
      const rowClues: MagnetsPuzzle['rowClues'] = [];
      for (let y = 0; y < h; y++) {
        rowClues.push({
          plus: state.rowcount[y * 3 + POSITIVE]!,
          minus: state.rowcount[y * 3 + NEGATIVE]!,
        });
      }
      const colClues: MagnetsPuzzle['colClues'] = [];
      for (let x = 0; x < w; x++) {
        colClues.push({
          plus: state.colcount[x * 3 + POSITIVE]!,
          minus: state.colcount[x * 3 + NEGATIVE]!,
        });
      }

      return {
        w,
        h,
        dominoes: state.dominoes.slice(),
        rowClues,
        colClues,
        solution: solution,
      };
    }

    // Restore solution for next attempt
    state.grid = solution;
  }

  // Fallback: return last generated game regardless of difficulty
  const solution = state.grid.slice();
  const rowClues: MagnetsPuzzle['rowClues'] = [];
  for (let y = 0; y < h; y++) {
    rowClues.push({
      plus: state.rowcount[y * 3 + POSITIVE]!,
      minus: state.rowcount[y * 3 + NEGATIVE]!,
    });
  }
  const colClues: MagnetsPuzzle['colClues'] = [];
  for (let x = 0; x < w; x++) {
    colClues.push({
      plus: state.colcount[x * 3 + POSITIVE]!,
      minus: state.colcount[x * 3 + NEGATIVE]!,
    });
  }

  return {
    w,
    h,
    dominoes: state.dominoes.slice(),
    rowClues,
    colClues,
    solution,
  };
}
