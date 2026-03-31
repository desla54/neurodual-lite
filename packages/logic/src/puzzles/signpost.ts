// @ts-nocheck
/**
 * Signpost (Arrow Path) puzzle algorithms — faithful port of Simon Tatham's signpost.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * Copyright (C) 2004-2014 Simon Tatham.  License: MIT
 *
 * Key structures ported:
 *   - DSF (Disjoint Set Forest) from dsf.c
 *   - new_game_fill(): random Hamiltonian-path generation via head/tail expansion
 *   - solve_state() / solve_single(): constraint-based solver
 *   - new_game_strip(): clue minimization with solver verification
 *   - new_game_desc(): full generation pipeline
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SignpostPuzzle {
  w: number;
  h: number;
  /** Direction enum per cell (0=N,1=NE,2=E,...7=NW), flat row-major, length w*h */
  dirs: number[];
  /** Numbers per cell: 0 = blank, 1..n = clue, length w*h */
  nums: number[];
  /** Which cells are immutable clues */
  immutable: boolean[];
  /** The solved board: nums[i] = solution number for cell i */
  solution: number[];
}

// ---------------------------------------------------------------------------
// Constants (from signpost.c)
// ---------------------------------------------------------------------------

const _DIR_N = 0;
const _DIR_NE = 1;
const _DIR_E = 2;
const _DIR_SE = 3;
const _DIR_S = 4;
const _DIR_SW = 5;
const _DIR_W = 6;
const _DIR_NW = 7;
const DIR_MAX = 8;

const dxs = [0, 1, 1, 1, 0, -1, -1, -1];
const dys = [-1, -1, 0, 1, 1, 1, 0, -1];

function DIR_OPPOSITE(d: number): number {
  return (d + 4) % 8;
}

const FLAG_IMMUTABLE = 1;

// ---------------------------------------------------------------------------
// PRNG — simple xorshift128+ (replaces random_state)
// ---------------------------------------------------------------------------

class Random {
  private s0: number;
  private s1: number;

  constructor(seed?: number) {
    this.s0 = (seed ?? Math.random() * 0x7fffffff) | 0;
    this.s1 = (this.s0 * 1103515245 + 12345) | 0;
    if (this.s0 === 0) this.s0 = 1;
    if (this.s1 === 0) this.s1 = 1;
  }

  /** Returns integer in [0, n) */
  next(n: number): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >> 17;
    s1 ^= s0;
    s1 ^= s0 >> 26;
    this.s1 = s1;
    const v = ((this.s0 + this.s1) >>> 0) % n;
    return v;
  }
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle(arr: number[], rs: Random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rs.next(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// DSF (Disjoint Set Forest) — port of dsf.c
// ---------------------------------------------------------------------------
// Each element stores:
//   bit 0: inverse flag (unused here, always 0)
//   bit 1: is_root flag (1 = root)
//   bits 2+: if root → size of tree; if not root → parent index

function dsf_init(dsf: Int32Array, size: number): void {
  for (let i = 0; i < size; i++) dsf[i] = 6; // (1 << 2) | (1 << 1) = root, size=1
}

function snew_dsf(size: number): Int32Array {
  const ret = new Int32Array(size);
  dsf_init(ret, size);
  return ret;
}

function dsf_canonify(dsf: Int32Array, index: number): number {
  const start_index = index;
  let inverse = 0;

  // Find canonical element
  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonical_index = index;

  // Path compression
  index = start_index;
  while (index !== canonical_index) {
    const nextindex = dsf[index] >> 2;
    const nextinverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonical_index << 2) | inverse;
    inverse = nextinverse;
    index = nextindex;
  }

  return index;
}

function dsf_merge(dsf: Int32Array, v1: number, v2: number): void {
  v1 = dsf_canonify(dsf, v1);
  v2 = dsf_canonify(dsf, v2);

  if (v1 === v2) return;

  // Make smaller index the new root
  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | 0;
}

function dsf_size(dsf: Int32Array, index: number): number {
  return dsf[dsf_canonify(dsf, index)] >> 2;
}

// ---------------------------------------------------------------------------
// Game state — port of struct game_state
// ---------------------------------------------------------------------------

interface GameState {
  w: number;
  h: number;
  n: number;
  completed: number;
  used_solve: number;
  impossible: number;
  dirs: Int32Array; // direction enums, size n
  nums: Int32Array; // numbers, size n
  flags: Uint32Array; // flags, size n
  next: Int32Array; // links to other cell indexes, size n (-1 absent)
  prev: Int32Array; // links to other cell indexes, size n (-1 absent)
  dsf: Int32Array; // connects regions with a dsf
  numsi: Int32Array; // for each number, which index is it in? (-1 absent)
}

// ---------------------------------------------------------------------------
// Generally useful functions — port of signpost.c
// ---------------------------------------------------------------------------

function ISREALNUM(state: GameState, num: number): boolean {
  return num > 0 && num <= state.n;
}

function INGRID(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.w && y >= 0 && y < state.h;
}

function whichdir(fromx: number, fromy: number, tox: number, toy: number): number {
  let dx = tox - fromx;
  let dy = toy - fromy;

  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return -1;

  if (dx) dx = dx / Math.abs(dx);
  if (dy) dy = dy / Math.abs(dy);

  for (let i = 0; i < DIR_MAX; i++) {
    if (dx === dxs[i] && dy === dys[i]) return i;
  }
  return -1;
}

function whichdiri(state: GameState, fromi: number, toi: number): number {
  const w = state.w;
  return whichdir(fromi % w, (fromi / w) | 0, toi % w, (toi / w) | 0);
}

function ispointing(
  state: GameState,
  fromx: number,
  fromy: number,
  tox: number,
  toy: number,
): number {
  const w = state.w;
  const dir = state.dirs[fromy * w + fromx];

  if (fromx === tox && fromy === toy) return 0;
  if (state.nums[fromy * w + fromx] === state.n) return 0;

  while (true) {
    if (!INGRID(state, fromx, fromy)) return 0;
    if (fromx === tox && fromy === toy) return 1;
    fromx += dxs[dir];
    fromy += dys[dir];
  }
}

function ispointingi(state: GameState, fromi: number, toi: number): number {
  const w = state.w;
  return ispointing(state, fromi % w, (fromi / w) | 0, toi % w, (toi / w) | 0);
}

function move_couldfit(state: GameState, num: number, d: number, x: number, y: number): number {
  const i = y * state.w + x;

  let n: number, gap: number;
  for (n = num + d, gap = 0; ISREALNUM(state, n) && state.numsi[n] === -1; n += d, gap++) {
    /* empty */
  }

  if (gap === 0) {
    const cn = state.nums[i];
    return cn === num + d ? 0 : 1;
  }
  if (state.prev[i] === -1 && state.next[i] === -1) return 1;

  const sz = dsf_size(state.dsf, i);
  return sz > gap ? 0 : 1;
}

function isvalidmove(
  state: GameState,
  clever: number,
  fromx: number,
  fromy: number,
  tox: number,
  toy: number,
): number {
  const w = state.w;
  const from = fromy * w + fromx;
  const to = toy * w + tox;

  if (!INGRID(state, fromx, fromy) || !INGRID(state, tox, toy)) return 0;

  if (!ispointing(state, fromx, fromy, tox, toy)) return 0;

  const nfrom = state.nums[from];
  const nto = state.nums[to];

  if (
    (nfrom === state.n && state.flags[from] & FLAG_IMMUTABLE) ||
    (nto === 1 && state.flags[to] & FLAG_IMMUTABLE)
  )
    return 0;

  if (dsf_canonify(state.dsf, from) === dsf_canonify(state.dsf, to)) return 0;

  if (ISREALNUM(state, nfrom) && ISREALNUM(state, nto)) {
    if (nfrom !== nto - 1) return 0;
  } else if (clever && ISREALNUM(state, nfrom)) {
    if (!move_couldfit(state, nfrom, +1, tox, toy)) return 0;
  } else if (clever && ISREALNUM(state, nto)) {
    if (!move_couldfit(state, nto, -1, fromx, fromy)) return 0;
  }

  return 1;
}

function makelink(state: GameState, from: number, to: number): void {
  if (state.next[from] !== -1) state.prev[state.next[from]] = -1;
  state.next[from] = to;

  if (state.prev[to] !== -1) state.next[state.prev[to]] = -1;
  state.prev[to] = from;
}

// ---------------------------------------------------------------------------
// Game state creation — port of blank_game / dup_game / etc.
// ---------------------------------------------------------------------------

function blank_game_into(state: GameState): void {
  state.dirs.fill(0);
  state.nums.fill(0);
  state.flags.fill(0);
  state.next.fill(-1);
  state.prev.fill(-1);
  state.numsi.fill(-1);
}

function blank_game(w: number, h: number): GameState {
  const n = w * h;
  const state: GameState = {
    w,
    h,
    n,
    completed: 0,
    used_solve: 0,
    impossible: 0,
    dirs: new Int32Array(n),
    nums: new Int32Array(n),
    flags: new Uint32Array(n),
    next: new Int32Array(n),
    prev: new Int32Array(n),
    dsf: snew_dsf(n),
    numsi: new Int32Array(n + 1),
  };
  blank_game_into(state);
  return state;
}

function dup_game_to(to: GameState, from: GameState): void {
  to.completed = from.completed;
  to.used_solve = from.used_solve;
  to.impossible = from.impossible;

  to.dirs.set(from.dirs);
  to.flags.set(from.flags);
  to.nums.set(from.nums);
  to.next.set(from.next);
  to.prev.set(from.prev);
  to.dsf.set(from.dsf);
  to.numsi.set(from.numsi);
}

function dup_game(state: GameState): GameState {
  const ret = blank_game(state.w, state.h);
  dup_game_to(ret, state);
  return ret;
}

// ---------------------------------------------------------------------------
// strip_nums, connect_numbers, update_numbers
// ---------------------------------------------------------------------------

function strip_nums(state: GameState): void {
  for (let i = 0; i < state.n; i++) {
    if (!(state.flags[i] & FLAG_IMMUTABLE)) state.nums[i] = 0;
  }
  state.next.fill(-1);
  state.prev.fill(-1);
  state.numsi.fill(-1);
  dsf_init(state.dsf, state.n);
}

function connect_numbers(state: GameState): void {
  dsf_init(state.dsf, state.n);
  for (let i = 0; i < state.n; i++) {
    if (state.next[i] !== -1) {
      const di = dsf_canonify(state.dsf, i);
      const dni = dsf_canonify(state.dsf, state.next[i]);
      if (di === dni) {
        state.impossible = 1;
      }
      dsf_merge(state.dsf, di, dni);
    }
  }
}

// ---------------------------------------------------------------------------
// head_number, update_numbers — port of the region numbering logic
// ---------------------------------------------------------------------------

interface HeadMeta {
  i: number;
  sz: number;
  start: number;
  preference: number;
}

function COLOUR(state: GameState, a: number): number {
  return (a / (state.n + 1)) | 0;
}

function START(state: GameState, c: number): number {
  return c * (state.n + 1);
}

function head_number(state: GameState, i: number, head: HeadMeta): void {
  let off = 0,
    j = i;

  head.i = i;
  head.sz = dsf_size(state.dsf, i);
  head.preference = 0;

  // Search through chain for real immutable numbers
  while (j !== -1) {
    if (state.flags[j] & FLAG_IMMUTABLE) {
      const ss = state.nums[j] - off;
      if (!head.preference) {
        head.start = ss;
        head.preference = 1;
      } else if (head.start !== ss) {
        state.impossible = 1;
      }
    }
    off++;
    j = state.next[j];
  }
  if (head.preference) return;

  if (state.nums[i] === 0 && state.nums[state.next[i]] > state.n) {
    head.start = START(state, COLOUR(state, state.nums[state.next[i]]));
    head.preference = 1;
  } else if (state.nums[i] <= state.n) {
    head.start = 0;
    head.preference = 0;
  } else {
    const c = COLOUR(state, state.nums[i]);
    let n = 1;
    const sz = dsf_size(state.dsf, i);
    j = i;
    while (state.next[j] !== -1) {
      j = state.next[j];
      if (state.nums[j] === 0 && state.next[j] === -1) {
        head.start = START(state, c);
        head.preference = 1;
        return;
      }
      if (COLOUR(state, state.nums[j]) === c) {
        n++;
      } else {
        const start_alternate = START(state, COLOUR(state, state.nums[j]));
        if (n < sz - n) {
          head.start = start_alternate;
          head.preference = 1;
        } else {
          head.start = START(state, c);
          head.preference = 1;
        }
        return;
      }
    }
    if (c === 0) {
      head.start = 0;
      head.preference = 0;
    } else {
      head.start = START(state, c);
      head.preference = 1;
    }
  }
}

function compare_heads(ha: HeadMeta, hb: HeadMeta): number {
  if (ha.preference && !hb.preference) return -1;
  if (hb.preference && !ha.preference) return 1;
  if (ha.start < hb.start) return -1;
  if (ha.start > hb.start) return 1;
  if (ha.sz > hb.sz) return -1;
  if (ha.sz < hb.sz) return 1;
  if (ha.i > hb.i) return -1;
  if (ha.i < hb.i) return 1;
  return 0;
}

function lowest_start(state: GameState, heads: HeadMeta[], nheads: number): number {
  for (let c = 1; c < state.n; c++) {
    let used = false;
    for (let nn = 0; nn < nheads; nn++) {
      if (COLOUR(state, heads[nn].start) === c) {
        used = true;
        break;
      }
    }
    if (!used) return c;
  }
  return 0;
}

function update_numbers(state: GameState): void {
  for (let nn = 0; nn < state.n; nn++) state.numsi[nn] = -1;

  for (let i = 0; i < state.n; i++) {
    if (state.flags[i] & FLAG_IMMUTABLE) {
      state.numsi[state.nums[i]] = i;
    } else if (state.prev[i] === -1 && state.next[i] === -1) {
      state.nums[i] = 0;
    }
  }
  connect_numbers(state);

  // Construct array of heads of all current regions
  const heads: HeadMeta[] = [];
  let nheads = 0;
  for (let i = 0; i < state.n; i++) {
    if (state.prev[i] !== -1 || state.next[i] === -1) continue;
    const h: HeadMeta = { i: 0, sz: 0, start: 0, preference: 0 };
    head_number(state, i, h);
    heads[nheads++] = h;
  }

  heads.sort(compare_heads);

  // Remove duplicate-coloured regions
  for (let nn = nheads - 1; nn >= 0; nn--) {
    if (nn !== 0 && heads[nn].start === heads[nn - 1].start) {
      heads[nn].start = START(state, lowest_start(state, heads, nheads));
      heads[nn].preference = -1;
    } else if (!heads[nn].preference) {
      heads[nn].start = START(state, lowest_start(state, heads, nheads));
    }
  }

  for (let nn = 0; nn < nheads; nn++) {
    let nnum = heads[nn].start;
    let j = heads[nn].i;
    while (j !== -1) {
      if (!(state.flags[j] & FLAG_IMMUTABLE)) {
        if (nnum > 0 && nnum <= state.n) state.numsi[nnum] = j;
        state.nums[j] = nnum;
      }
      nnum++;
      j = state.next[j];
    }
  }
}

// ---------------------------------------------------------------------------
// check_completion
// ---------------------------------------------------------------------------

function check_completion(state: GameState, mark_errors: number): number {
  let error = 0;
  let complete = 1;

  if (mark_errors) {
    for (let j = 0; j < state.n; j++) state.flags[j] &= ~2; // ~FLAG_ERROR
  }

  // Search for repeated numbers
  for (let j = 0; j < state.n; j++) {
    if (state.nums[j] > 0 && state.nums[j] <= state.n) {
      for (let k = j + 1; k < state.n; k++) {
        if (state.nums[k] === state.nums[j]) {
          error = 1;
        }
      }
    }
  }

  // Check consecutive numbers point correctly
  for (let nn = 1; nn < state.n; nn++) {
    if (state.numsi[nn] === -1 || state.numsi[nn + 1] === -1) {
      complete = 0;
    } else if (!ispointingi(state, state.numsi[nn], state.numsi[nn + 1])) {
      error = 1;
    } else {
      if (mark_errors) makelink(state, state.numsi[nn], state.numsi[nn + 1]);
    }
  }

  // Search for numbers < 0 or 0-with-links
  for (let nn = 1; nn < state.n; nn++) {
    if (
      state.nums[nn] < 0 ||
      (state.nums[nn] === 0 && (state.next[nn] !== -1 || state.prev[nn] !== -1))
    ) {
      error = 1;
    }
  }

  if (error) return 0;
  return complete;
}

// ---------------------------------------------------------------------------
// Game generation — port of cell_adj, new_game_fill
// ---------------------------------------------------------------------------

function cell_adj(state: GameState, i: number, ai: Int32Array, ad: Int32Array): number {
  let n = 0;
  const w = state.w,
    h = state.h;
  const sx = i % w,
    sy = (i / w) | 0;

  for (let a = 0; a < DIR_MAX; a++) {
    let x = sx,
      y = sy;
    const dx = dxs[a],
      dy = dys[a];
    while (true) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const newi = y * w + x;
      if (state.nums[newi] === 0) {
        ai[n] = newi;
        ad[n] = a;
        n++;
      }
    }
  }
  return n;
}

function new_game_fill(state: GameState, rs: Random, headi: number, taili: number): number {
  let nfilled: number, an: number, j: number;
  const aidx = new Int32Array(state.n);
  const adir = new Int32Array(state.n);

  state.nums.fill(0);
  state.nums[headi] = 1;
  state.nums[taili] = state.n;
  state.dirs[taili] = 0;
  nfilled = 2;

  while (nfilled < state.n) {
    // Expand from headi
    an = cell_adj(state, headi, aidx, adir);
    do {
      if (an === 0) return 0;
      j = rs.next(an);
      state.dirs[headi] = adir[j];
      state.nums[aidx[j]] = state.nums[headi] + 1;
      nfilled++;
      headi = aidx[j];
      an = cell_adj(state, headi, aidx, adir);
    } while (an === 1);

    // Expand to taili
    an = cell_adj(state, taili, aidx, adir);
    do {
      if (an === 0) return 0;
      j = rs.next(an);
      state.dirs[aidx[j]] = DIR_OPPOSITE(adir[j]);
      state.nums[aidx[j]] = state.nums[taili] - 1;
      nfilled++;
      taili = aidx[j];
      an = cell_adj(state, taili, aidx, adir);
    } while (an === 1);
  }

  // Connect headi to taili
  state.dirs[headi] = whichdiri(state, headi, taili);
  if (state.dirs[headi] !== -1) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Solver — port of solve_single, solve_state
// ---------------------------------------------------------------------------

function solve_single(state: GameState, copy: GameState, from: Int32Array): number {
  let nlinks = 0;
  const w = state.w;

  from.fill(-1);

  for (let i = 0; i < state.n; i++) {
    if (state.next[i] !== -1) continue;
    if (state.nums[i] === state.n) continue;

    const d = state.dirs[i];
    let poss = -1;
    const sx = i % w,
      sy = (i / w) | 0;
    let x = sx,
      y = sy;

    while (true) {
      x += dxs[d];
      y += dys[d];
      if (!INGRID(state, x, y)) break;
      if (!isvalidmove(state, 1, sx, sy, x, y)) continue;

      const j = y * w + x;
      if (state.prev[j] !== -1) continue;

      if (
        state.nums[i] > 0 &&
        state.nums[j] > 0 &&
        state.nums[i] <= state.n &&
        state.nums[j] <= state.n &&
        state.nums[j] === state.nums[i] + 1
      ) {
        poss = j;
        from[j] = i;
        break;
      }

      poss = poss === -1 ? j : -2;
      from[j] = from[j] === -1 ? i : -2;
    }

    if (poss === -2) {
      // multiple possible
    } else if (poss === -1) {
      copy.impossible = 1;
      return -1;
    } else {
      makelink(copy, i, poss);
      nlinks++;
    }
  }

  for (let i = 0; i < state.n; i++) {
    if (state.prev[i] !== -1) continue;
    if (state.nums[i] === 1) continue;

    if (from[i] === -1) {
      copy.impossible = 1;
      return -1;
    } else if (from[i] === -2) {
      // multiple possible
    } else {
      makelink(copy, from[i], i);
      nlinks++;
    }
  }

  return nlinks;
}

function solve_state(state: GameState): number {
  const copy = dup_game(state);
  const scratch = new Int32Array(state.n);

  while (true) {
    update_numbers(state);

    if (solve_single(state, copy, scratch)) {
      dup_game_to(state, copy);
      if (state.impossible) break;
      else continue;
    }
    break;
  }

  update_numbers(state);
  const ret = state.impossible ? -1 : check_completion(state, 0);
  return ret;
}

// ---------------------------------------------------------------------------
// new_game_strip — clue minimization
// ---------------------------------------------------------------------------

function new_game_strip(state: GameState, rs: Random): number {
  const copy = dup_game(state);

  strip_nums(copy);

  if (solve_state(copy) > 0) {
    return 1;
  }

  const scratch = new Int32Array(state.n);
  for (let i = 0; i < state.n; i++) scratch[i] = i;
  shuffle(scratch, rs);

  // Add numbers in random order until solvable
  for (let i = 0; i < state.n; i++) {
    const j = scratch[i];
    if (copy.nums[j] > 0 && copy.nums[j] <= state.n) continue;
    copy.nums[j] = state.nums[j];
    copy.flags[j] |= FLAG_IMMUTABLE;
    state.flags[j] |= FLAG_IMMUTABLE;
    strip_nums(copy);
    if (solve_state(copy) > 0) {
      // Now try removing numbers
      for (let ii = 0; ii < state.n; ii++) {
        const jj = scratch[ii];
        if (
          state.flags[jj] & FLAG_IMMUTABLE &&
          state.nums[jj] !== 1 &&
          state.nums[jj] !== state.n
        ) {
          state.flags[jj] &= ~FLAG_IMMUTABLE;
          dup_game_to(copy, state);
          strip_nums(copy);
          if (solve_state(copy) > 0) {
            // OK, leave it removed
          } else {
            copy.nums[jj] = state.nums[jj];
            state.flags[jj] |= FLAG_IMMUTABLE;
          }
        }
      }
      return 1;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// new_game_desc — main generation pipeline
// ---------------------------------------------------------------------------

function new_game_desc(w: number, h: number, force_corner_start: number, rs: Random): GameState {
  const state = blank_game(w, h);
  let headi: number, taili: number;

  // Retry loop: keep generating until we get a valid puzzle
  // Safety limit to avoid infinite loops
  for (let attempts = 0; attempts < 10000; attempts++) {
    blank_game_into(state);

    // Keep trying until fill succeeds
    let filled = false;
    for (let fillAttempts = 0; fillAttempts < 1000; fillAttempts++) {
      if (force_corner_start) {
        headi = 0;
        taili = state.n - 1;
      } else {
        do {
          headi = rs.next(state.n);
          taili = rs.next(state.n);
        } while (headi === taili);
      }
      if (new_game_fill(state, rs, headi, taili)) {
        filled = true;
        break;
      }
      blank_game_into(state);
    }
    if (!filled) continue;

    state.flags[headi] |= FLAG_IMMUTABLE;
    state.flags[taili] |= FLAG_IMMUTABLE;

    // Save the full solution before stripping
    const solution = new Int32Array(state.nums);

    if (!new_game_strip(state, rs)) {
      continue;
    }

    // Verify solvability
    strip_nums(state);
    const tosolve = dup_game(state);
    if (solve_state(tosolve) > 0) {
      // Restore solution nums onto state for output
      state._solution = solution;
      return state;
    }
  }

  // Should not reach here with reasonable grid sizes,
  // but return whatever we have as fallback
  return state;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Signpost puzzle of the given dimensions.
 *
 * @param w Grid width (columns)
 * @param h Grid height (rows)
 * @returns A SignpostPuzzle with dirs, nums (clues), immutable flags, and solution
 */
export function generateSignpostPuzzle(w: number, h: number): SignpostPuzzle {
  if (w < 2 || h < 2) throw new Error('Width and height must both be at least 2');
  if (w === 2 && h === 2) throw new Error('Width and height cannot both be 2');

  const rs = new Random();
  const state = new_game_desc(w, h, 1, rs);
  const n = w * h;

  const dirs: number[] = Array.from(state.dirs);
  const nums: number[] = new Array(n);
  const immutable: boolean[] = new Array(n);
  const solution: number[] = Array.from(state._solution ?? state.nums);

  for (let i = 0; i < n; i++) {
    immutable[i] = !!(state.flags[i] & FLAG_IMMUTABLE);
    nums[i] = immutable[i] ? solution[i] : 0;
  }

  return { w, h, dirs, nums, immutable, solution };
}
