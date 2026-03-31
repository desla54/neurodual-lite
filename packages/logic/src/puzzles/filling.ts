// @ts-nocheck
/**
 * Filling (Fillomino) puzzle algorithms — faithful port of Simon Tatham's filling.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * Copyright (C) 2007 Jonas Kölker.  License: MIT
 *
 * Key structures ported:
 *   - DSF (Disjoint Set Forest) from dsf.c
 *   - make_board(): random valid board generation via DSF merging
 *   - solver(): constraint-based solver (learn_blocked_expansion, learn_expand_or_one, learn_critical_square)
 *   - new_game_desc(): board generation + clue minimization with solver verification
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FillingPuzzle {
  /** Flat row-major board: 0 = empty (to fill), 1-9 = clue/value */
  board: number[];
  /** The full solution board */
  solution: number[];
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Constants (from filling.c)
// ---------------------------------------------------------------------------

const EMPTY = 0;

/** Directions: left, right, up, down */
const dx = [-1, 1, 0, 0];
const dy = [0, 0, -1, 1];

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
    // xorshift64*
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
  const dsf = new Int32Array(size);
  dsf_init(dsf, size);
  return dsf;
}

function dsf_canonify(dsf: Int32Array, index: number): number {
  const start_index = index;
  // Find root
  while ((dsf[index] & 2) === 0) {
    index = dsf[index] >> 2;
  }
  const canonical_index = index;
  // Path compression
  index = start_index;
  while (index !== canonical_index) {
    const nextindex = dsf[index] >> 2;
    dsf[index] = (canonical_index << 2) | 0; // no inverse
    index = nextindex;
  }
  return index;
}

function dsf_merge(dsf: Int32Array, v1: number, v2: number): void {
  v1 = dsf_canonify(dsf, v1);
  v2 = dsf_canonify(dsf, v2);
  if (v1 === v2) return;
  // Make smaller index the new root (deterministic canonical element)
  if (v1 > v2) {
    const tmp = v1;
    v1 = v2;
    v2 = tmp;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | 0;
}

function dsf_size(dsf: Int32Array, index: number): number {
  return dsf[dsf_canonify(dsf, index)] >> 2;
}

// ---------------------------------------------------------------------------
// Solver state — port of struct solver_state
// ---------------------------------------------------------------------------

interface SolverState {
  dsf: Int32Array;
  board: Int32Array;
  connected: Int32Array; // cyclic linked list for iterating CCs
  nempty: number;
}

// ---------------------------------------------------------------------------
// Shuffle — Fisher-Yates (replaces Tatham's shuffle())
// ---------------------------------------------------------------------------

function shuffle(arr: Int32Array, n: number, rs: Random): void {
  for (let i = n - 1; i > 0; i--) {
    const j = rs.next(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// rhofree — cycle detection for connected[] linked list (from filling.c)
// ---------------------------------------------------------------------------

function _rhofree(hop: Int32Array, start: number): boolean {
  let turtle = start;
  let rabbit = hop[start];
  while (rabbit !== turtle) {
    turtle = hop[turtle];
    rabbit = hop[hop[rabbit]];
  }
  do {
    rabbit = hop[rabbit];
    if (start === rabbit) return true;
  } while (rabbit !== turtle);
  return false;
}

// ---------------------------------------------------------------------------
// merge — merge two elements in dsf + connected list (from filling.c)
// ---------------------------------------------------------------------------

function merge(dsf: Int32Array, connected: Int32Array, a: number, b: number): void {
  a = dsf_canonify(dsf, a);
  b = dsf_canonify(dsf, b);
  if (a === b) return;
  dsf_merge(dsf, a, b);
  // Swap connected[a] and connected[b] to merge the two cyclic lists
  const c = connected[a];
  connected[a] = connected[b];
  connected[b] = c;
}

// ---------------------------------------------------------------------------
// expand — expand a region into an empty square (from filling.c)
// ---------------------------------------------------------------------------

function expand(s: SolverState, w: number, h: number, t: number, f: number): void {
  s.board[t] = s.board[f];
  for (let j = 0; j < 4; j++) {
    const x = (t % w) + dx[j];
    const y = Math.floor(t / w) + dy[j];
    const idx = w * y + x;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (s.board[idx] !== s.board[t]) continue;
    merge(s.dsf, s.connected, t, idx);
  }
  s.nempty--;
}

// ---------------------------------------------------------------------------
// flood_count + check_capacity — from filling.c
// ---------------------------------------------------------------------------

function clear_count(board: Int32Array, sz: number): void {
  for (let i = 0; i < sz; i++) {
    if (board[i] >= 0) continue;
    else if (board[i] === -sz)
      board[i] = EMPTY; // -SENTINEL
    else board[i] = -board[i];
  }
}

function flood_count(
  board: Int32Array,
  w: number,
  h: number,
  i: number,
  n: number,
  c: { val: number },
): void {
  const sz = w * h;
  if (board[i] === EMPTY)
    board[i] = -sz; // -SENTINEL
  else if (board[i] === n) board[i] = -board[i];
  else return;

  if (--c.val === 0) return;

  for (let k = 0; k < 4; k++) {
    const x = (i % w) + dx[k];
    const y = Math.floor(i / w) + dy[k];
    const idx = w * y + x;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    flood_count(board, w, h, idx, n, c);
    if (c.val === 0) return;
  }
}

function check_capacity(board: Int32Array, w: number, h: number, i: number): boolean {
  const n = { val: board[i] };
  flood_count(board, w, h, i, board[i], n);
  clear_count(board, w * h);
  return n.val === 0;
}

// ---------------------------------------------------------------------------
// expandsize — from filling.c
// ---------------------------------------------------------------------------

function expandsize(
  board: Int32Array,
  dsf: Int32Array,
  w: number,
  h: number,
  i: number,
  n: number,
): number {
  let nhits = 0;
  const hits = [0, 0, 0, 0];
  let size = 1;
  for (let j = 0; j < 4; j++) {
    const x = (i % w) + dx[j];
    const y = Math.floor(i / w) + dy[j];
    const idx = w * y + x;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (board[idx] !== n) continue;
    const root = dsf_canonify(dsf, idx);
    let m: number;
    for (m = 0; m < nhits && root !== hits[m]; m++);
    if (m < nhits) continue;
    size += dsf_size(dsf, root);
    hits[nhits++] = root;
  }
  return size;
}

// ---------------------------------------------------------------------------
// filled_square — from filling.c
// ---------------------------------------------------------------------------

function filled_square(s: SolverState, w: number, h: number, i: number): void {
  for (let j = 0; j < 4; j++) {
    const x = (i % w) + dx[j];
    const y = Math.floor(i / w) + dy[j];
    const idx = w * y + x;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (s.board[i] === s.board[idx]) merge(s.dsf, s.connected, i, idx);
  }
}

// ---------------------------------------------------------------------------
// init_solver_state — from filling.c
// ---------------------------------------------------------------------------

function init_solver_state(s: SolverState, w: number, h: number): void {
  const sz = w * h;
  s.nempty = 0;
  for (let i = 0; i < sz; i++) s.connected[i] = i;
  for (let i = 0; i < sz; i++) {
    if (s.board[i] === EMPTY) s.nempty++;
    else filled_square(s, w, h, i);
  }
}

// ---------------------------------------------------------------------------
// learn_expand_or_one — from filling.c
// ---------------------------------------------------------------------------

function _learn_expand_or_one(s: SolverState, w: number, h: number): boolean {
  const sz = w * h;
  let learn = false;

  for (let i = 0; i < sz; i++) {
    let one = true;

    if (s.board[i] !== EMPTY) continue;

    for (let j = 0; j < 4; j++) {
      const x = (i % w) + dx[j];
      const y = Math.floor(i / w) + dy[j];
      const idx = w * y + x;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (s.board[idx] === EMPTY) {
        one = false;
        continue;
      }
      if (
        one &&
        (s.board[idx] === 1 || s.board[idx] >= expandsize(s.board, s.dsf, w, h, i, s.board[idx]))
      ) {
        one = false;
      }
      s.board[i] = -sz; // -SENTINEL
      if (check_capacity(s.board, w, h, idx)) continue;
      s.board[i] = EMPTY; // restored by check_capacity's clear_count? No — we need to set it
      // Actually clear_count restores -SENTINEL → EMPTY, so board[i] is already EMPTY
      // But the C code has assert(s->board[i] == EMPTY) after check_capacity returns false.
      // check_capacity calls clear_count which sets -SENTINEL back to EMPTY. So board[i] is EMPTY.
      expand(s, w, h, i, idx);
      learn = true;
      break;
    }

    if (j === 4 && one) {
      s.board[i] = 1;
      s.nempty--;
      learn = true;
    }
  }
  return learn;
}

// The above has a scoping issue: `j` from the for loop is not accessible after
// the loop in TS (let scoping). Let me rewrite faithfully with proper scoping:

// Overwrite with correct version:
function learn_expand_or_one_fixed(s: SolverState, w: number, h: number): boolean {
  const sz = w * h;
  let learn = false;

  for (let i = 0; i < sz; i++) {
    let j: number;
    let one = true;

    if (s.board[i] !== EMPTY) continue;

    for (j = 0; j < 4; j++) {
      const x = (i % w) + dx[j];
      const y = Math.floor(i / w) + dy[j];
      const idx = w * y + x;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (s.board[idx] === EMPTY) {
        one = false;
        continue;
      }
      if (
        one &&
        (s.board[idx] === 1 || s.board[idx] >= expandsize(s.board, s.dsf, w, h, i, s.board[idx]))
      ) {
        one = false;
      }
      // Temporarily mark square as -SENTINEL to block it
      s.board[i] = -sz;
      if (check_capacity(s.board, w, h, idx)) {
        // check_capacity restored board[i] to EMPTY via clear_count
        continue;
      }
      // check_capacity restored board[i] to EMPTY via clear_count
      // Expand into this square
      expand(s, w, h, i, idx);
      learn = true;
      break;
    }

    if (j === 4 && one) {
      s.board[i] = 1;
      s.nempty--;
      learn = true;
    }
  }
  return learn;
}

// ---------------------------------------------------------------------------
// learn_blocked_expansion — from filling.c
// ---------------------------------------------------------------------------

function learn_blocked_expansion(s: SolverState, w: number, h: number): boolean {
  const sz = w * h;
  const SENTINEL = sz;
  let learn = false;

  for (let i = 0; i < sz; i++) {
    let exp = SENTINEL;

    if (s.board[i] === EMPTY) continue;
    const canon = dsf_canonify(s.dsf, i);
    if (i !== canon) continue;
    if (dsf_size(s.dsf, canon) === s.board[canon]) continue;

    // Iterate over squares in this CC using the connected list
    let j = i;
    let found_multiple = false;
    do {
      for (let k = 0; k < 4; k++) {
        const x = (j % w) + dx[k];
        const y = Math.floor(j / w) + dy[k];
        const idx = w * y + x;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        if (s.board[idx] !== EMPTY) continue;
        if (exp === idx) continue;

        const size = expandsize(s.board, s.dsf, w, h, idx, s.board[j]);
        if (size > s.board[j]) continue;
        if (exp !== SENTINEL) {
          found_multiple = true;
          break;
        }
        exp = idx;
      }
      if (found_multiple) break;
      j = s.connected[j];
    } while (j !== i);

    if (found_multiple) continue;
    if (exp === SENTINEL) continue;
    expand(s, w, h, exp, i);
    learn = true;
  }
  return learn;
}

// ---------------------------------------------------------------------------
// learn_critical_square — from filling.c
// ---------------------------------------------------------------------------

function learn_critical_square(s: SolverState, w: number, h: number): boolean {
  const sz = w * h;
  let learn = false;

  for (let i = 0; i < sz; i++) {
    if (s.board[i] === EMPTY) continue;
    if (i !== dsf_canonify(s.dsf, i)) continue;
    if (dsf_size(s.dsf, i) === s.board[i]) continue;

    for (let j = 0; j < sz; j++) {
      if (s.board[j] !== EMPTY) continue;
      s.board[j] = -sz; // -SENTINEL
      if (check_capacity(s.board, w, h, i)) continue;
      // board[j] was restored to EMPTY by clear_count
      s.nempty--;
      s.board[j] = s.board[i];
      filled_square(s, w, h, j);
      learn = true;
    }
  }
  return learn;
}

// ---------------------------------------------------------------------------
// solver — from filling.c
// ---------------------------------------------------------------------------

function solver(orig: Int32Array, w: number, h: number): { solved: boolean; board: Int32Array } {
  const sz = w * h;

  const ss: SolverState = {
    board: new Int32Array(orig),
    dsf: snew_dsf(sz),
    connected: new Int32Array(sz),
    nempty: 0,
  };

  init_solver_state(ss, w, h);

  do {
    if (learn_blocked_expansion(ss, w, h)) continue;
    if (learn_expand_or_one_fixed(ss, w, h)) continue;
    if (learn_critical_square(ss, w, h)) continue;
    break;
  } while (ss.nempty > 0);

  return { solved: ss.nempty === 0, board: ss.board };
}

// ---------------------------------------------------------------------------
// make_board — from filling.c
// Generate a random valid fillomino solution board using DSF merging.
// ---------------------------------------------------------------------------

function make_board(board: Int32Array, w: number, h: number, rs: Random): void {
  const sz = w * h;

  // w=h=2 is a special case which requires a number > max(w, h)
  const maxsize = Math.min(Math.max(Math.max(w, h), 3), 9);

  const dsf = snew_dsf(sz);

  // Abuse board as a shuffled list of indices {0, ..., sz-1}
  for (let i = 0; i < sz; i++) board[i] = i;

  for (;;) {
    shuffle(board, sz, rs);
    dsf_init(dsf, sz);

    let change: boolean;
    let retry = false;
    do {
      change = false;
      for (let i = 0; i < sz; i++) {
        let a = sz; // SENTINEL
        let b = sz;
        let c = sz;
        const aa = dsf_canonify(dsf, board[i]);
        let cc = sz;

        for (let j = 0; j < 4; j++) {
          const x = (board[i] % w) + dx[j];
          const y = Math.floor(board[i] / w) + dy[j];
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          const bb = dsf_canonify(dsf, w * y + x);
          if (aa === bb) continue;
          if (dsf_size(dsf, aa) === dsf_size(dsf, bb)) {
            a = aa;
            b = bb;
            c = cc;
          } else if (cc === sz) {
            c = cc = bb;
          }
        }
        if (a !== sz) {
          a = dsf_canonify(dsf, a);
          dsf_merge(dsf, a, c === sz ? b : c);
          if (dsf_size(dsf, a) > maxsize) {
            retry = true;
            break;
          }
          change = true;
        }
      }
      if (retry) break;
    } while (change);

    if (retry) continue;

    // Fill board with region sizes
    for (let i = 0; i < sz; i++) board[i] = dsf_size(dsf, i);
    return;
  }
}

// ---------------------------------------------------------------------------
// make_dsf — build DSF from a filled board (from filling.c)
// ---------------------------------------------------------------------------

function make_dsf(board: Int32Array, w: number, h: number): Int32Array {
  const sz = w * h;
  const dsf = snew_dsf(sz);
  for (let i = 0; i < sz; i++) {
    for (let j = 0; j < 4; j++) {
      const x = (i % w) + dx[j];
      const y = Math.floor(i / w) + dy[j];
      const k = w * y + x;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (board[i] === board[k]) dsf_merge(dsf, i, k);
    }
  }
  return dsf;
}

// ---------------------------------------------------------------------------
// minimize_clue_set — from filling.c
// Remove clues one at a time; keep if solver can still solve without it.
// ---------------------------------------------------------------------------

function minimize_clue_set(board: Int32Array, w: number, h: number, randomize: Int32Array): void {
  const sz = w * h;
  const board_cp = new Int32Array(board);

  for (let i = 0; i < sz; i++) {
    if (board[randomize[i]] === EMPTY) continue;
    board[randomize[i]] = EMPTY;
    if (!solver(board, w, h).solved) {
      board[randomize[i]] = board_cp[randomize[i]];
    }
  }
}

// ---------------------------------------------------------------------------
// new_game_desc — from filling.c
// Generate board, sort clue removal order (largest values first),
// minimize clue set.
// ---------------------------------------------------------------------------

function new_game_desc(
  w: number,
  h: number,
  rs: Random,
): { clues: Int32Array; solution: Int32Array } {
  const sz = w * h;
  const board = new Int32Array(sz);
  const randomize = new Int32Array(sz);

  for (let i = 0; i < sz; i++) {
    board[i] = EMPTY;
    randomize[i] = i;
  }

  make_board(board, w, h, rs);
  const solution = new Int32Array(board);

  // Sort randomize by board value descending (larger values removed first)
  // This is the qsort(randomize, sz, sizeof(int), compare) from filling.c
  // where compare sorts by g_board[b] - g_board[a] (descending by board value)
  const indices = Array.from(randomize);
  indices.sort((a, b) => board[b] - board[a]);
  for (let i = 0; i < sz; i++) randomize[i] = indices[i];

  minimize_clue_set(board, w, h, randomize);

  return { clues: board, solution };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Filling (Fillomino) puzzle.
 *
 * @param w - grid width
 * @param h - grid height
 * @returns puzzle with clue board (0 = empty) and solution
 */
export function generateFillingPuzzle(w: number, h: number): FillingPuzzle {
  const rs = new Random();
  const { clues, solution } = new_game_desc(w, h, rs);

  return {
    board: Array.from(clues),
    solution: Array.from(solution),
    w,
    h,
  };
}

/**
 * Validate a completed board: every connected component of value N has exactly N cells.
 * Port of the check in execute_move from filling.c.
 */
export function validateFillingBoard(board: number[], w: number, h: number): boolean {
  const sz = w * h;
  const b = new Int32Array(board);
  const dsf = make_dsf(b, w, h);
  for (let i = 0; i < sz; i++) {
    if (b[i] !== dsf_size(dsf, i)) return false;
  }
  return true;
}

/**
 * Solve a filling puzzle. Returns the solved board or null if unsolvable.
 */
export function solveFillingPuzzle(clues: number[], w: number, h: number): number[] | null {
  const result = solver(new Int32Array(clues), w, h);
  if (!result.solved) return null;
  return Array.from(result.board);
}
