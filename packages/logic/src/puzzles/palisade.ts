// @ts-nocheck
/**
 * Palisade (Nikoli's "Five Cells") puzzle — faithful port of Simon Tatham's palisade.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Key structures ported:
 *   - DSF (Disjoint Set Forest) from dsf.c
 *   - divvy_rectangle() from divvy.c — partition grid into k-ominoes
 *   - solver() from palisade.c — constraint-based deduction solver
 *   - new_game_desc() — generation + clue minimization with solver verification
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PalisadePuzzle {
  /** Width of the grid */
  w: number;
  /** Height of the grid */
  h: number;
  /** Region size */
  k: number;
  /** Flat row-major clues: -1 = no clue, 0-4 = border count clue */
  clues: number[];
  /**
   * Flat row-major solution borders.
   * Each cell has bits: BORDER_U=1, BORDER_R=2, BORDER_D=4, BORDER_L=8
   */
  solutionBorders: number[];
}

// ---------------------------------------------------------------------------
// Constants (from palisade.c)
// ---------------------------------------------------------------------------

const EMPTY = ~0; // 0xFFFFFFFF, same as (signed char)~0

const BORDER_U = 1 << 0;
const BORDER_R = 1 << 1;
const BORDER_D = 1 << 2;
const BORDER_L = 1 << 3;
const BORDER_MASK = BORDER_U | BORDER_R | BORDER_D | BORDER_L;

function BORDER(i: number): number {
  return 1 << i;
}
function FLIP(i: number): number {
  return i ^ 2;
}
function DISABLED(border: number): number {
  return border << 4;
}

const dx = [0, +1, 0, -1];
const dy = [-1, 0, +1, 0];
const bitcount = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

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

function shuffleInt32(arr: Int32Array, len: number, rs: Random): void {
  for (let i = len - 1; i > 0; i--) {
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
//   bit 0: inverse flag (always 0 here)
//   bit 1: is_root flag (1 = root)
//   bits 2+: if root → size of tree; if not root → parent index

function dsf_new(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsf_init(dsf, size);
  return dsf;
}

function dsf_init(dsf: Int32Array, size: number): void {
  for (let i = 0; i < size; i++) dsf[i] = 6; // root, size=1: (1<<2)|(1<<1)
}

function dsf_canonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonical = index;

  // Path compression
  index = startIndex;
  while (index !== canonical) {
    const nextIndex = dsf[index] >> 2;
    const nextInverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonical << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return canonical;
}

function dsf_merge(dsf: Int32Array, v1_in: number, v2_in: number): void {
  let v1 = dsf_canonify(dsf, v1_in);
  let v2 = dsf_canonify(dsf, v2_in);

  if (v1 === v2) return;

  // Make smaller index the root (deterministic canonical element)
  if (v1 > v2) {
    const tmp = v1;
    v1 = v2;
    v2 = tmp;
  }

  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | 0; // inverse = 0
}

function dsf_size(dsf: Int32Array, index: number): number {
  return dsf[dsf_canonify(dsf, index)] >> 2;
}

function dsf_equivalent(dsf: Int32Array, i: number, j: number): boolean {
  return dsf_canonify(dsf, i) === dsf_canonify(dsf, j);
}

// ---------------------------------------------------------------------------
// divvy_rectangle — port of divvy.c
// ---------------------------------------------------------------------------
// Partition a w×h rectangle into n = wh/k regions of size k.
// Returns a DSF, or null on failure.

function addremcommon(
  w: number,
  h: number,
  x: number,
  y: number,
  own: Int32Array,
  val: number,
): boolean {
  const neighbours = new Int32Array(8);

  for (let dir = 0; dir < 8; dir++) {
    const ddx = (dir & 3) === 2 ? 0 : dir > 2 && dir < 6 ? +1 : -1;
    const ddy = (dir & 3) === 0 ? 0 : dir < 4 ? -1 : +1;
    const sx = x + ddx,
      sy = y + ddy;

    if (sx < 0 || sx >= w || sy < 0 || sy >= h) neighbours[dir] = -1;
    else neighbours[dir] = own[sy * w + sx];
  }

  // Check 4-adjacency
  if (
    neighbours[0] !== val &&
    neighbours[2] !== val &&
    neighbours[4] !== val &&
    neighbours[6] !== val
  )
    return false;

  let count = 0;
  for (let dir = 0; dir < 8; dir++) {
    const next = (dir + 1) & 7;
    const gotthis = neighbours[dir] === val ? 1 : 0;
    const gotnext = neighbours[next] === val ? 1 : 0;
    if (gotthis !== gotnext) count++;
  }

  return count === 2;
}

function divvy_internal(w: number, h: number, k: number, rs: Random): Int32Array | null {
  const wh = w * h;
  const n = (wh / k) | 0;

  const order = new Int32Array(wh);
  const tmp = new Int32Array(wh);
  const own = new Int32Array(wh);
  const sizes = new Int32Array(n);
  const queue = new Int32Array(n);
  const addable = new Int32Array(wh * 4);
  const removable = new Uint8Array(wh);

  // Random permutation of grid squares
  for (let i = 0; i < wh; i++) order[i] = i;
  shuffleInt32(order, wh, rs);

  // Choose starting squares
  for (let i = 0; i < wh; i++) own[i] = -1;
  for (let i = 0; i < n; i++) {
    own[order[i]] = i;
    sizes[i] = 1;
  }

  // Main loop: repeatedly expand an undersized omino
  while (true) {
    // Compute addable/removable
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yx = y * w + x;
        const curr = own[yx];

        if (curr < 0) {
          removable[yx] = 0;
        } else if (sizes[curr] === 1) {
          removable[yx] = 1;
        } else {
          removable[yx] = addremcommon(w, h, x, y, own, curr) ? 1 : 0;
        }

        for (let dir = 0; dir < 4; dir++) {
          const ddx = dir === 0 ? -1 : dir === 1 ? +1 : 0;
          const ddy = dir === 2 ? -1 : dir === 3 ? +1 : 0;
          const sx = x + ddx,
            sy = y + ddy;
          const syx = sy * w + sx;

          addable[yx * 4 + dir] = -1;

          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
          if (own[syx] < 0) continue;
          if (own[syx] === own[yx]) continue;
          if (!addremcommon(w, h, x, y, own, own[syx])) continue;

          addable[yx * 4 + dir] = own[syx];
        }
      }
    }

    // Find undersized ominoes
    let jcount = 0;
    for (let i = 0; i < n; i++) {
      if (sizes[i] < k) tmp[jcount++] = i;
    }
    if (jcount === 0) break; // all complete!

    let j = tmp[rs.next(jcount)];

    // BFS to find expansion path
    // tmp[2*i+0] = which omino we got to i from
    // tmp[2*i+1] = which square that omino stole from us
    for (let i = 0; i < n; i++) {
      tmp[2 * i] = -1;
      tmp[2 * i + 1] = -1;
    }
    let qhead = 0,
      qtail = 0;
    queue[qtail++] = j;
    tmp[2 * j] = -2;
    tmp[2 * j + 1] = -2;

    while (qhead < qtail) {
      j = queue[qhead];

      // Temporarily remove stolen square
      const tmpsq = tmp[2 * j + 1];
      if (tmpsq >= 0) {
        own[tmpsq] = -3;
      }

      // Try to find unclaimed square to expand into
      let foundI = -1;
      for (let ii = 0; ii < wh; ii++) {
        if (own[order[ii]] !== -1) continue;

        // Special case: size 1 and had square stolen → expand anywhere
        if (sizes[j] === 1 && tmpsq >= 0) {
          foundI = ii;
          break;
        }

        // Full addability test
        let dir: number;
        for (dir = 0; dir < 4; dir++) {
          if (addable[order[ii] * 4 + dir] === j) {
            if (!addremcommon(w, h, order[ii] % w, (order[ii] / w) | 0, own, j)) continue;
            break;
          }
        }
        if (dir === 4) continue;

        foundI = ii;
        break;
      }

      if (foundI >= 0) {
        let i = order[foundI];

        // Restore temporarily removed square
        if (tmpsq >= 0) own[tmpsq] = j;

        // Backtrack, moving squares between ominoes
        while (true) {
          own[i] = j;
          if (tmp[2 * j] === -2) break;
          i = tmp[2 * j + 1];
          j = tmp[2 * j];
        }

        sizes[j]++;
        break; // done with BFS
      }

      // Try to steal from unvisited ominoes
      for (let ii = 0; ii < wh; ii++) {
        const nj = own[order[ii]];
        if (nj < 0 || tmp[2 * nj] !== -1) continue;
        if (!removable[order[ii]]) continue;

        let dir: number;
        for (dir = 0; dir < 4; dir++) {
          if (addable[order[ii] * 4 + dir] === j) {
            if (!addremcommon(w, h, order[ii] % w, (order[ii] / w) | 0, own, j)) continue;

            queue[qtail++] = nj;
            tmp[2 * nj] = j;
            tmp[2 * nj + 1] = order[ii];
            break;
          }
        }
      }

      // Restore temporarily removed square
      if (tmpsq >= 0) own[tmpsq] = j;

      qhead++;
    }

    if (qhead === qtail) {
      // BFS failed — no way to expand
      return null;
    }
  }

  // Build output DSF
  const tmpMap = new Int32Array(n);
  for (let i = 0; i < wh; i++) {
    tmpMap[own[i]] = i;
  }
  const retdsf = dsf_new(wh);
  for (let i = 0; i < wh; i++) {
    dsf_merge(retdsf, i, tmpMap[own[i]]);
  }

  return retdsf;
}

function divvy_rectangle(w: number, h: number, k: number, rs: Random): Int32Array {
  let ret: Int32Array | null = null;
  let attempts = 0;
  do {
    ret = divvy_internal(w, h, k, rs);
    attempts++;
    if (attempts > 1000) {
      throw new Error(`divvy_rectangle failed after ${attempts} attempts`);
    }
  } while (!ret);
  return ret;
}

// ---------------------------------------------------------------------------
// Solver — port of palisade.c solver
// ---------------------------------------------------------------------------

const COMPUTE_J = -1;

interface SolverCtx {
  w: number;
  h: number;
  k: number;
  clues: Int32Array;
  borders: Uint8Array;
  dsf: Int32Array;
}

function solver_connect(ctx: SolverCtx, i: number, j: number): void {
  dsf_merge(ctx.dsf, i, j);
}

function solver_connected(ctx: SolverCtx, i: number, j: number, dir: number): boolean {
  if (j === COMPUTE_J) j = i + dx[dir] + ctx.w * dy[dir];
  if (j < 0 || j >= ctx.w * ctx.h) return false;
  return dsf_equivalent(ctx.dsf, i, j);
}

function solver_disconnected(ctx: SolverCtx, i: number, j: number, dir: number): boolean {
  if (j === COMPUTE_J) j = i + dx[dir] + ctx.w * dy[dir];
  // Check bounds — grid edges are always borders
  const x = i % ctx.w,
    y = (i / ctx.w) | 0;
  const nx = x + dx[dir],
    ny = y + dy[dir];
  if (nx < 0 || nx >= ctx.w || ny < 0 || ny >= ctx.h) return true;
  return (ctx.borders[i] & BORDER(dir)) !== 0;
}

function solver_disconnect(ctx: SolverCtx, i: number, j: number, dir: number): void {
  if (j === COMPUTE_J) j = i + dx[dir] + ctx.w * dy[dir];
  ctx.borders[i] |= BORDER(dir);
  ctx.borders[j] |= BORDER(FLIP(dir));
}

function solver_maybe(ctx: SolverCtx, i: number, j: number, dir: number): boolean {
  if (j === COMPUTE_J) j = i + dx[dir] + ctx.w * dy[dir];
  return !solver_disconnected(ctx, i, j, dir) && !solver_connected(ctx, i, j, dir);
}

function solver_connected_clues_versus_region_size(ctx: SolverCtx): void {
  const { w, h, k } = ctx;
  const wh = w * h;

  for (let i = 0; i < wh; i++) {
    if (ctx.clues[i] === EMPTY) continue;
    for (let dir = 0; dir < 4; dir++) {
      const j = i + dx[dir] + w * dy[dir];
      const x = i % w,
        y = (i / w) | 0;
      const nx = x + dx[dir],
        ny = y + dy[dir];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (solver_disconnected(ctx, i, j, dir)) continue;
      if (ctx.clues[j] === EMPTY) continue;
      if (
        8 - ctx.clues[i] - ctx.clues[j] > k ||
        (ctx.clues[i] === 3 && ctx.clues[j] === 3 && k !== 2)
      ) {
        solver_disconnect(ctx, i, j, dir);
      }
    }
  }
}

function solver_number_exhausted(ctx: SolverCtx): boolean {
  const { w, h } = ctx;
  const wh = w * h;
  let changed = false;

  for (let i = 0; i < wh; i++) {
    if (ctx.clues[i] === EMPTY) continue;

    if (bitcount[ctx.borders[i] & BORDER_MASK] === ctx.clues[i]) {
      for (let dir = 0; dir < 4; dir++) {
        const j = i + dx[dir] + w * dy[dir];
        if (!solver_maybe(ctx, i, j, dir)) continue;
        solver_connect(ctx, i, j);
        changed = true;
      }
      continue;
    }

    let off = 0;
    for (let dir = 0; dir < 4; dir++) {
      const j = i + dx[dir] + w * dy[dir];
      if (!solver_disconnected(ctx, i, j, dir) && solver_connected(ctx, i, j, dir)) ++off;
    }

    if (ctx.clues[i] === 4 - off) {
      for (let dir = 0; dir < 4; dir++) {
        const j = i + dx[dir] + w * dy[dir];
        if (!solver_maybe(ctx, i, j, dir)) continue;
        solver_disconnect(ctx, i, j, dir);
        changed = true;
      }
    }
  }

  return changed;
}

function solver_not_too_big(ctx: SolverCtx): boolean {
  const { w, h, k } = ctx;
  const wh = w * h;
  let changed = false;

  for (let i = 0; i < wh; i++) {
    const size = dsf_size(ctx.dsf, i);
    for (let dir = 0; dir < 4; dir++) {
      const j = i + dx[dir] + w * dy[dir];
      if (!solver_maybe(ctx, i, j, dir)) continue;
      if (size + dsf_size(ctx.dsf, j) <= k) continue;
      solver_disconnect(ctx, i, j, dir);
      changed = true;
    }
  }

  return changed;
}

function solver_not_too_small(ctx: SolverCtx): boolean {
  const { w, h, k } = ctx;
  const wh = w * h;
  let changed = false;

  const outs = new Int32Array(wh);
  outs.fill(-1);

  for (let i = 0; i < wh; i++) {
    const ci = dsf_canonify(ctx.dsf, i);
    if (dsf_size(ctx.dsf, ci) === k) continue;
    for (let dir = 0; dir < 4; dir++) {
      const j = i + dx[dir] + w * dy[dir];
      if (!solver_maybe(ctx, i, j, dir)) continue;
      if (outs[ci] === -1) outs[ci] = dsf_canonify(ctx.dsf, j);
      else if (outs[ci] !== dsf_canonify(ctx.dsf, j)) outs[ci] = -2;
    }
  }

  for (let i = 0; i < wh; i++) {
    const j = outs[i];
    if (i !== dsf_canonify(ctx.dsf, i)) continue;
    if (j < 0) continue;
    solver_connect(ctx, i, j);
    changed = true;
  }

  return changed;
}

function solver_no_dangling_edges(ctx: SolverCtx): boolean {
  const { w, h } = ctx;
  let changed = false;

  for (let r = 1; r < h; r++) {
    for (let c = 1; c < w; c++) {
      const i = r * w + c;
      const j = i - w - 1;
      let noline = 0;
      let e = -1,
        f = -1,
        de = -1,
        df = -1;

      // Align with BORDER_[U0 R1 D2 L3]
      const squares = [i, j, j, i]; // [0]=U→i, [1]=R→j, [2]=D→j, [3]=L→i

      for (let dir = 0; dir < 4; dir++) {
        if (!solver_connected(ctx, squares[dir], COMPUTE_J, dir)) {
          df = dir;
          f = squares[df];
          if (e === -1) {
            e = f;
            de = df;
          }
        } else {
          noline++;
        }
      }

      if (4 - noline === 1) {
        solver_disconnect(ctx, e, COMPUTE_J, de);
        changed = true;
        continue;
      }

      if (4 - noline !== 2) continue;

      if (ctx.borders[e] & BORDER(de)) {
        if (!(ctx.borders[f] & BORDER(df))) {
          solver_disconnect(ctx, f, COMPUTE_J, df);
          changed = true;
        }
      } else if (ctx.borders[f] & BORDER(df)) {
        solver_disconnect(ctx, e, COMPUTE_J, de);
        changed = true;
      }
    }
  }

  return changed;
}

function solver_equivalent_edges(ctx: SolverCtx): boolean {
  const { w, h } = ctx;
  const wh = w * h;
  let changed = false;

  for (let i = 0; i < wh; i++) {
    let n_on = 0,
      n_off = 0;
    if (ctx.clues[i] < 1 || ctx.clues[i] > 3) continue;

    if (ctx.clues[i] === 2) {
      for (let dirj = 0; dirj < 4; dirj++) {
        const j = i + dx[dirj] + w * dy[dirj];
        if (solver_disconnected(ctx, i, j, dirj)) n_on++;
        else if (solver_connected(ctx, i, j, dirj)) n_off++;
      }
    }

    for (let dirj = 0; dirj < 4; dirj++) {
      const j = i + dx[dirj] + w * dy[dirj];
      if (!solver_maybe(ctx, i, j, dirj)) continue;

      for (let dirk = dirj + 1; dirk < 4; dirk++) {
        const kk = i + dx[dirk] + w * dy[dirk];
        if (!solver_maybe(ctx, i, kk, dirk)) continue;
        // Check j and k are connected — need bounds check
        const xj = (i % w) + dx[dirj],
          yj = ((i / w) | 0) + dy[dirj];
        const xk = (i % w) + dx[dirk],
          yk = ((i / w) | 0) + dy[dirk];
        if (xj < 0 || xj >= w || yj < 0 || yj >= h) continue;
        if (xk < 0 || xk >= w || yk < 0 || yk >= h) continue;
        if (!dsf_equivalent(ctx.dsf, j, kk)) continue;

        if (n_on + 2 > ctx.clues[i]) {
          solver_connect(ctx, i, j);
          solver_connect(ctx, i, kk);
          changed = true;
        } else if (n_off + 2 > 4 - ctx.clues[i]) {
          solver_disconnect(ctx, i, j, dirj);
          solver_disconnect(ctx, i, kk, dirk);
          changed = true;
        }
      }
    }
  }

  return changed;
}

// build_dsf: build connected components along border lines
function build_dsf(
  w: number,
  h: number,
  border: Uint8Array,
  dsf: Int32Array,
  black: boolean,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x + 1 < w &&
        (black ? !(border[y * w + x] & BORDER_R) : (border[y * w + x] & DISABLED(BORDER_R)) !== 0)
      ) {
        dsf_merge(dsf, y * w + x, y * w + (x + 1));
      }
      if (
        y + 1 < h &&
        (black ? !(border[y * w + x] & BORDER_D) : (border[y * w + x] & DISABLED(BORDER_D)) !== 0)
      ) {
        dsf_merge(dsf, y * w + x, (y + 1) * w + x);
      }
    }
  }
}

function is_solved(
  w: number,
  h: number,
  k: number,
  clues: Int32Array,
  border: Uint8Array,
): boolean {
  const wh = w * h;
  const dsf = dsf_new(wh);

  build_dsf(w, h, border, dsf, true);

  // Check region sizes and clues
  for (let i = 0; i < wh; i++) {
    if (dsf_size(dsf, i) !== k) return false;
    if (clues[i] === EMPTY) continue;
    if (clues[i] !== bitcount[border[i] & BORDER_MASK]) return false;
  }

  // Check no stray borders
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x + 1 < w &&
        border[y * w + x] & BORDER_R &&
        dsf_equivalent(dsf, y * w + x, y * w + (x + 1))
      )
        return false;
      if (
        y + 1 < h &&
        border[y * w + x] & BORDER_D &&
        dsf_equivalent(dsf, y * w + x, (y + 1) * w + x)
      )
        return false;
    }
  }

  return true;
}

function solver(w: number, h: number, k: number, clues: Int32Array, borders: Uint8Array): boolean {
  const wh = w * h;
  const ctx: SolverCtx = {
    w,
    h,
    k,
    clues,
    borders,
    dsf: dsf_new(wh),
  };

  solver_connected_clues_versus_region_size(ctx);
  let changed: boolean;
  do {
    changed = false;
    changed = solver_number_exhausted(ctx) || changed;
    changed = solver_not_too_big(ctx) || changed;
    changed = solver_not_too_small(ctx) || changed;
    changed = solver_no_dangling_edges(ctx) || changed;
    changed = solver_equivalent_edges(ctx) || changed;
  } while (changed);

  return is_solved(w, h, k, clues, borders);
}

// ---------------------------------------------------------------------------
// Generator — port of new_game_desc from palisade.c
// ---------------------------------------------------------------------------

function init_borders(w: number, h: number, borders: Uint8Array): void {
  borders.fill(0);
  for (let c = 0; c < w; c++) {
    borders[c] |= BORDER_U;
    borders[w * h - 1 - c] |= BORDER_D;
  }
  for (let r = 0; r < h; r++) {
    borders[r * w] |= BORDER_L;
    borders[w * h - 1 - r * w] |= BORDER_R;
  }
}

function OUT_OF_BOUNDS(x: number, y: number, w: number, h: number): boolean {
  return x < 0 || x >= w || y < 0 || y >= h;
}

function generate(w: number, h: number, k: number, rs: Random): PalisadePuzzle {
  const wh = w * h;

  const numbers = new Int32Array(wh);
  const rim = new Uint8Array(wh);
  const scratchBorders = new Uint8Array(wh);
  const soln = new Uint8Array(wh);

  const shuf = new Int32Array(wh);
  for (let i = 0; i < wh; i++) shuf[i] = i;
  shuffleInt32(shuf, wh, rs);

  init_borders(w, h, rim);

  let dsfResult: Int32Array;

  // Generate until solver can solve it
  do {
    soln.fill(0);

    dsfResult = divvy_rectangle(w, h, k, rs);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        numbers[i] = 0;
        for (let dir = 0; dir < 4; dir++) {
          const rr = r + dy[dir],
            cc = c + dx[dir];
          const ii = rr * w + cc;
          if (OUT_OF_BOUNDS(cc, rr, w, h) || !dsf_equivalent(dsfResult, i, ii)) {
            numbers[i]++;
            soln[i] |= BORDER(dir);
          }
        }
      }
    }

    // Copy rim to scratch and try solving
    scratchBorders.set(rim);
  } while (!solver(w, h, k, numbers, scratchBorders));

  // Save full solution borders before clue stripping
  const solutionBorders = new Uint8Array(soln);

  // Strip unnecessary clues (randomized order)
  for (let i = 0; i < wh; i++) {
    const j = shuf[i];
    const copy = numbers[j];

    scratchBorders.set(rim);
    numbers[j] = EMPTY;
    if (!solver(w, h, k, numbers, scratchBorders)) {
      numbers[j] = copy; // can't remove this clue
    }
  }

  // Convert to output format
  const clues = new Array<number>(wh);
  for (let i = 0; i < wh; i++) {
    clues[i] = numbers[i] === EMPTY ? -1 : numbers[i];
  }

  const borders = new Array<number>(wh);
  for (let i = 0; i < wh; i++) {
    borders[i] = solutionBorders[i];
  }

  return { w, h, k, clues, solutionBorders: borders };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a valid Palisade puzzle.
 *
 * @param w Grid width
 * @param h Grid height
 * @param k Region size (must divide w*h)
 * @returns Puzzle with clues and solution borders
 */
export function generatePalisadePuzzle(w: number, h: number, k: number): PalisadePuzzle {
  // Validate params (from validate_params)
  if (k < 1) throw new Error('Region size must be at least one');
  if (w < 1) throw new Error('Width must be at least one');
  if (h < 1) throw new Error('Height must be at least one');
  if ((w * h) % k !== 0) throw new Error('Region size must divide grid area');
  if (k === w * h) throw new Error('Region size must be less than the grid area');
  if (k === 2 && w !== 1 && h !== 1)
    throw new Error("Region size can't be two unless width or height is one");

  const rs = new Random();
  return generate(w, h, k, rs);
}
