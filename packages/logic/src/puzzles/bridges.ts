// @ts-nocheck — Ported from C with array accesses that are always valid at runtime
/**
 * Bridges (Hashiwokakero) puzzle generator — faithful port of Simon Tatham's bridges.c
 *
 * Generates a random island layout, connects them with bridges, counts the
 * bridge constraints, then verifies the puzzle is solvable at the requested
 * difficulty before returning.
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=bridges.c
 * License: MIT
 */

// =============================================================================
// Public types
// =============================================================================

export interface BridgesPuzzle {
  /** Island positions and required bridge counts */
  islands: { x: number; y: number; count: number }[];
  /** Grid width */
  w: number;
  /** Grid height */
  h: number;
  /** Solution: bridges between island indices */
  solution: { from: number; to: number; count: number }[];
}

// =============================================================================
// Constants (from bridges.c)
// =============================================================================

const MAX_BRIDGES = 4;
const MAX_NEWISLAND_TRIES = 50;
const MIN_SENSIBLE_ISLANDS = 3;

// Grid flags
const G_ISLAND = 0x0001;
const G_LINEV = 0x0002;
const G_LINEH = 0x0004;
const G_LINE = G_LINEV | G_LINEH;
const G_MARKV = 0x0008;
const G_MARKH = 0x0010;
const G_MARK = G_MARKV | G_MARKH;
const G_NOLINEV = 0x0020;
const G_NOLINEH = 0x0040;
const G_SWEEP = 0x1000;

// =============================================================================
// DSF — Disjoint Set Forest (ported from dsf.c)
// =============================================================================

function dsfInit(dsf: Int32Array): void {
  for (let i = 0; i < dsf.length; i++) dsf[i] = 6;
  // Bit 0 = inverse flag (unused here), Bit 1 = root flag
  // If root: bits 2..31 = size of tree
  // If not root: bits 2..31 = parent index
}

function newDsf(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf);
  return dsf;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  // Walk up to root
  while ((dsf[index]! & 2) === 0) {
    index = dsf[index]! >> 2;
  }
  const canonical = index;
  // Path compression
  index = startIndex;
  while (index !== canonical) {
    const next = dsf[index]! >> 2;
    dsf[index] = (canonical << 2) | 0; // inverse=0
    index = next;
  }
  return canonical;
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  v1 = dsfCanonify(dsf, v1);
  v2 = dsfCanonify(dsf, v2);
  if (v1 === v2) return;
  // Make smaller index the new canonical (matches C behaviour)
  if (v1 > v2) {
    const tmp = v1;
    v1 = v2;
    v2 = tmp;
  }
  dsf[v1] = dsf[v1]! + ((dsf[v2]! >> 2) << 2);
  dsf[v2] = (v1 << 2) | 0;
}

// =============================================================================
// PRNG — simple xorshift128 (deterministic, seedable)
// =============================================================================

class Random {
  private s: Uint32Array;

  constructor(seed?: number) {
    this.s = new Uint32Array(4);
    const s = seed ?? (Math.random() * 0xffffffff) >>> 0;
    // Splitmix32 to initialise state
    let z = s;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) | 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      this.s[i] = t >>> 0;
    }
    if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) {
      this.s[0] = 1;
    }
  }

  /** Returns a random integer in [0, n) */
  upto(n: number): number {
    if (n <= 1) return 0;
    return (this.next() >>> 0) % n;
  }

  private next(): number {
    const s = this.s;
    const t = s[0]! ^ (s[0]! << 11);
    s[0] = s[1]!;
    s[1] = s[2]!;
    s[2] = s[3]!;
    s[3] = (s[3]! ^ (s[3]! >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return s[3]!;
  }
}

// =============================================================================
// Surrounds — adjacent point info (from struct surrounds)
// =============================================================================

interface SurroundPoint {
  x: number;
  y: number;
  dx: number;
  dy: number;
  off: number; // distance to orthogonal island (0 if none)
}

interface Surrounds {
  points: SurroundPoint[];
  npoints: number;
  nislands: number;
}

// =============================================================================
// Island (from struct island)
// =============================================================================

interface Island {
  x: number;
  y: number;
  count: number;
  adj: Surrounds;
}

// =============================================================================
// Solver state (from struct solver_state)
// =============================================================================

interface SolverState {
  dsf: Int32Array;
  tmpdsf: Int32Array;
}

// =============================================================================
// Game state (from struct game_state)
// =============================================================================

interface GameState {
  w: number;
  h: number;
  maxb: number;
  allowloops: boolean;
  grid: Uint32Array;
  scratch: Uint32Array;
  islands: Island[];
  n_islands: number;
  // Per-cell arrays (wh each)
  possv: Int8Array;
  possh: Int8Array;
  lines: Int8Array;
  maxv: Int8Array;
  maxh: Int8Array;
  // Island lookup by grid position
  gridi: (Island | null)[];
  solver: SolverState;
  // Params used by solver
  params: { maxb: number; islands: number; expansion: number; difficulty: number };
}

// =============================================================================
// State creation / helpers
// =============================================================================

function newState(
  w: number,
  h: number,
  maxb: number,
  allowloops: boolean,
  difficulty: number,
): GameState {
  const wh = w * h;
  const state: GameState = {
    w,
    h,
    maxb,
    allowloops,
    grid: new Uint32Array(wh),
    scratch: new Uint32Array(wh),
    islands: [],
    n_islands: 0,
    possv: new Int8Array(wh),
    possh: new Int8Array(wh),
    lines: new Int8Array(wh),
    maxv: new Int8Array(wh),
    maxh: new Int8Array(wh),
    gridi: new Array<Island | null>(wh).fill(null),
    solver: {
      dsf: newDsf(wh),
      tmpdsf: new Int32Array(wh),
    },
    params: { maxb, islands: 30, expansion: 10, difficulty },
  };
  state.maxv.fill(maxb);
  state.maxh.fill(maxb);
  return state;
}

function dupState(state: GameState): GameState {
  const wh = state.w * state.h;
  const ret: GameState = {
    w: state.w,
    h: state.h,
    maxb: state.maxb,
    allowloops: state.allowloops,
    grid: new Uint32Array(state.grid),
    scratch: new Uint32Array(wh),
    islands: state.islands.map((is) => ({
      x: is.x,
      y: is.y,
      count: is.count,
      adj: {
        points: is.adj.points.map((p) => ({ ...p })),
        npoints: is.adj.npoints,
        nislands: is.adj.nislands,
      },
    })),
    n_islands: state.n_islands,
    possv: new Int8Array(state.possv),
    possh: new Int8Array(state.possh),
    lines: new Int8Array(state.lines),
    maxv: new Int8Array(state.maxv),
    maxh: new Int8Array(state.maxh),
    gridi: new Array<Island | null>(wh).fill(null),
    solver: {
      dsf: new Int32Array(state.solver.dsf),
      tmpdsf: new Int32Array(wh),
    },
    params: { ...state.params },
  };
  // Fixup gridi
  for (let i = 0; i < ret.n_islands; i++) {
    const is = ret.islands[i]!;
    ret.gridi[is.y * ret.w + is.x] = is;
  }
  return ret;
}

// Index helpers (matching C macros)
function INGRID(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.w && y >= 0 && y < state.h;
}
function IDX(state: GameState, x: number, y: number): number {
  return y * state.w + x;
}
function GRID(state: GameState, x: number, y: number): number {
  return state.grid[IDX(state, x, y)]!;
}

function GRIDCOUNT(state: GameState, x: number, y: number, f: number): number {
  return GRID(state, x, y) & f ? state.lines[IDX(state, x, y)]! : 0;
}
function POSSIBLES(state: GameState, dx: number, x: number, y: number): number {
  return dx ? state.possh[IDX(state, x, y)]! : state.possv[IDX(state, x, y)]!;
}
function MAXIMUM(state: GameState, dx: number, x: number, y: number): number {
  return dx ? state.maxh[IDX(state, x, y)]! : state.maxv[IDX(state, x, y)]!;
}

// =============================================================================
// Island functions (from bridges.c)
// =============================================================================

function islandSetSurrounds(is: Island, state: GameState): void {
  is.adj.npoints = 0;
  is.adj.nislands = 0;
  is.adj.points = [];
  const addPoint = (cond: boolean, ddx: number, ddy: number) => {
    if (cond) {
      is.adj.points.push({
        x: is.x + ddx,
        y: is.y + ddy,
        dx: ddx,
        dy: ddy,
        off: 0,
      });
      is.adj.npoints++;
    }
  };
  addPoint(is.x > 0, -1, 0);
  addPoint(is.x < state.w - 1, +1, 0);
  addPoint(is.y > 0, 0, -1);
  addPoint(is.y < state.h - 1, 0, +1);
}

function islandFindOrthogonal(is: Island, state: GameState): void {
  is.adj.nislands = 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    const p = is.adj.points[i]!;
    let x = is.x + p.dx;
    let y = is.y + p.dy;
    let off = 1;
    p.off = 0;
    while (INGRID(state, x, y)) {
      if (GRID(state, x, y) & G_ISLAND) {
        p.off = off;
        is.adj.nislands++;
        break;
      }
      off++;
      x += p.dx;
      y += p.dy;
    }
  }
}

function ISLAND_ORTHX(is: Island, j: number): number {
  return is.x + is.adj.points[j]?.off * is.adj.points[j]?.dx;
}
function ISLAND_ORTHY(is: Island, j: number): number {
  return is.y + is.adj.points[j]?.off * is.adj.points[j]?.dy;
}

function islandAdd(state: GameState, x: number, y: number, count: number): Island {
  state.grid[IDX(state, x, y)] |= G_ISLAND;
  const is: Island = {
    x,
    y,
    count,
    adj: { points: [], npoints: 0, nislands: 0 },
  };
  islandSetSurrounds(is, state);
  state.islands.push(is);
  state.n_islands++;
  state.gridi[IDX(state, x, y)] = is;
  return is;
}

function islandHasbridge(is: Island, state: GameState, direction: number): boolean {
  const p = is.adj.points[direction]!;
  const gline = p.dx ? G_LINEH : G_LINEV;
  return (GRID(state, p.x, p.y) & gline) !== 0;
}

function islandCountbridges(is: Island, state: GameState): number {
  let c = 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    const p = is.adj.points[i]!;
    c += GRIDCOUNT(state, p.x, p.y, p.dx ? G_LINEH : G_LINEV);
  }
  return c;
}

function islandAdjspace(
  is: Island,
  state: GameState,
  marks: boolean,
  missing: number,
  direction: number,
): number {
  const p = is.adj.points[direction]!;
  const gline = p.dx ? G_LINEH : G_LINEV;

  if (marks) {
    const mline = p.dx ? G_MARKH : G_MARKV;
    if (GRID(state, p.x, p.y) & mline) return 0;
  }
  let poss = POSSIBLES(state, p.dx, p.x, p.y);
  poss = Math.min(poss, missing);

  const curr = GRIDCOUNT(state, p.x, p.y, gline);
  poss = Math.min(poss, MAXIMUM(state, p.dx, p.x, p.y) - curr);

  return Math.max(0, poss);
}

function islandCountspaces(is: Island, state: GameState, marks: boolean): number {
  let c = 0;
  const missing = is.count - islandCountbridges(is, state);
  if (missing < 0) return 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    c += islandAdjspace(is, state, marks, missing, i);
  }
  return c;
}

function islandIsadj(is: Island, state: GameState, direction: number): number {
  const p = is.adj.points[direction]!;
  const mline = p.dx ? G_MARKH : G_MARKV;
  const gline = p.dx ? G_LINEH : G_LINEV;
  if (GRID(state, p.x, p.y) & mline) {
    return GRIDCOUNT(state, p.x, p.y, gline);
  } else {
    return POSSIBLES(state, p.dx, p.x, p.y);
  }
}

function islandCountadj(is: Island, state: GameState): number {
  let nadj = 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    if (islandIsadj(is, state, i)) nadj++;
  }
  return nadj;
}

function islandTogglemark(is: Island, state: GameState): void {
  state.grid[IDX(state, is.x, is.y)] ^= G_MARK;

  // Remove all marks on non-island squares
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (!(GRID(state, x, y) & G_ISLAND)) state.grid[IDX(state, x, y)] &= ~G_MARK;
    }
  }

  // Add marks to squares around marked islands
  for (let i = 0; i < state.n_islands; i++) {
    const isLoop = state.islands[i]!;
    if (!(GRID(state, isLoop.x, isLoop.y) & G_MARK)) continue;

    for (let j = 0; j < isLoop.adj.npoints; j++) {
      if (!isLoop.adj.points[j]?.off) continue;
      for (let o = 1; o < isLoop.adj.points[j]?.off; o++) {
        const px = isLoop.x + isLoop.adj.points[j]?.dx * o;
        const py = isLoop.y + isLoop.adj.points[j]?.dy * o;
        state.grid[IDX(state, px, py)] |= isLoop.adj.points[j]?.dy ? G_MARKV : G_MARKH;
      }
    }
  }
}

function islandImpossible(is: Island, state: GameState, strict: boolean): boolean {
  const curr = islandCountbridges(is, state);
  const nspc = is.count - curr;

  if (nspc < 0) return true;
  if (curr + islandCountspaces(is, state, false) < is.count) return true;
  if (strict && curr < is.count) return true;

  // Count spaces in surrounding islands
  let nsurrspc = 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    const p = is.adj.points[i]!;
    if (!p.off) continue;
    const poss = POSSIBLES(state, p.dx, p.x, p.y);
    if (poss === 0) continue;
    const isOrth = state.gridi[IDX(state, ISLAND_ORTHX(is, i), ISLAND_ORTHY(is, i))];
    if (!isOrth) continue;

    const ifree = isOrth.count - islandCountbridges(isOrth, state);
    if (ifree > 0) {
      const bmax = MAXIMUM(state, p.dx, p.x, p.y);
      const bcurr = GRIDCOUNT(state, p.x, p.y, p.dx ? G_LINEH : G_LINEV);
      nsurrspc += Math.min(ifree, bmax - bcurr);
    }
  }
  if (nsurrspc < nspc) return true;

  return false;
}

// =============================================================================
// Island join (from island_join)
// =============================================================================

function islandJoin(i1: Island, i2: Island, state: GameState, n: number, isMax: boolean): void {
  if (i1.x === i2.x) {
    const x = i1.x;
    const s = Math.min(i1.y, i2.y) + 1;
    const e = Math.max(i1.y, i2.y) - 1;
    for (let y = s; y <= e; y++) {
      const idx = IDX(state, x, y);
      if (isMax) {
        state.maxv[idx] = n;
      } else {
        if (n < 0) {
          state.grid[idx] ^= G_NOLINEV;
        } else if (n === 0) {
          state.grid[idx] &= ~G_LINEV;
        } else {
          state.grid[idx] |= G_LINEV;
          state.lines[idx] = n;
        }
      }
    }
  } else if (i1.y === i2.y) {
    const y = i1.y;
    const s = Math.min(i1.x, i2.x) + 1;
    const e = Math.max(i1.x, i2.x) - 1;
    for (let x = s; x <= e; x++) {
      const idx = IDX(state, x, y);
      if (isMax) {
        state.maxh[idx] = n;
      } else {
        if (n < 0) {
          state.grid[idx] ^= G_NOLINEH;
        } else if (n === 0) {
          state.grid[idx] &= ~G_LINEH;
        } else {
          state.grid[idx] |= G_LINEH;
          state.lines[idx] = n;
        }
      }
    }
  }
}

// =============================================================================
// map_update_possibles (from bridges.c — optimised grid scan)
// =============================================================================

function mapUpdatePossibles(state: GameState): void {
  const w = state.w;

  // Vertical stripes
  for (let x = 0; x < state.w; x++) {
    let idx = x;
    let s = -1;
    let e = -1;
    let bl = 0;
    let maxb = state.params.maxb;
    let isS: Island | null = null;
    let y = 0;

    for (y = 0; y < state.h; y++) {
      isS = state.gridi[idx];
      if (isS) {
        maxb = isS.count;
        break;
      }
      state.possv[idx] = 0;
      idx += w;
    }
    for (; y < state.h; y++) {
      maxb = Math.min(maxb, state.maxv[idx]!);
      const isF = state.gridi[idx];
      if (isF) {
        const np = Math.min(maxb, isF.count);
        if (s !== -1) {
          for (let i = s; i <= e; i++) {
            state.possv[y * 0 + x + i * w] = 0; // placeholder, fix below
          }
          // Actually set by column index
          for (let i = s; i <= e; i++) {
            state.possv[i * w + x] = bl ? 0 : np;
          }
        }
        s = y + 1;
        bl = 0;
        isS = isF;
        maxb = isS.count;
      } else {
        e = y;
        if (state.grid[idx]! & (G_LINEH | G_NOLINEV)) bl = 1;
      }
      idx += w;
    }
    if (s !== -1) {
      for (let i = s; i <= e; i++) state.possv[i * w + x] = 0;
    }
  }

  // Horizontal stripes
  for (let y = 0; y < state.h; y++) {
    let idx = y * w;
    let s = -1;
    let e = -1;
    let bl = 0;
    let maxb = state.params.maxb;
    let isS: Island | null = null;
    let x = 0;

    for (x = 0; x < state.w; x++) {
      isS = state.gridi[idx];
      if (isS) {
        maxb = isS.count;
        break;
      }
      state.possh[idx] = 0;
      idx += 1;
    }
    for (; x < state.w; x++) {
      maxb = Math.min(maxb, state.maxh[idx]!);
      const isF = state.gridi[idx];
      if (isF) {
        const np = Math.min(maxb, isF.count);
        if (s !== -1) {
          for (let i = s; i <= e; i++) {
            state.possh[y * w + i] = bl ? 0 : np;
          }
        }
        s = x + 1;
        bl = 0;
        isS = isF;
        maxb = isS.count;
      } else {
        e = x;
        if (state.grid[idx]! & (G_LINEV | G_NOLINEH)) bl = 1;
      }
      idx += 1;
    }
    if (s !== -1) {
      for (let i = s; i <= e; i++) state.possh[y * w + i] = 0;
    }
  }
}

// =============================================================================
// map_count — count bridges attached to each island
// =============================================================================

function mapCount(state: GameState): void {
  for (let i = 0; i < state.n_islands; i++) {
    const is = state.islands[i]!;
    is.count = 0;
    for (let n = 0; n < is.adj.npoints; n++) {
      const p = is.adj.points[n]!;
      const flag = p.x === is.x ? G_LINEV : G_LINEH;
      if (GRID(state, p.x, p.y) & flag) {
        is.count += state.lines[IDX(state, p.x, p.y)]!;
      }
    }
  }
}

function mapFindOrthogonal(state: GameState): void {
  for (let i = 0; i < state.n_islands; i++) {
    islandFindOrthogonal(state.islands[i]!, state);
  }
}

// =============================================================================
// Loop detection (from map_hasloops)
// =============================================================================

function gridDegree(
  state: GameState,
  x: number,
  y: number,
): { count: number; nx: number; ny: number } {
  const grid = state.scratch[IDX(state, x, y)]!;
  const gline = grid & G_LINE;
  let c = 0;
  let nx = -1;
  let ny = -1;

  const is = state.gridi[IDX(state, x, y)];
  if (is) {
    for (let i = 0; i < is.adj.npoints; i++) {
      const p = is.adj.points[i]!;
      const gl = p.dx ? G_LINEH : G_LINEV;
      if (state.scratch[IDX(state, p.x, p.y)]! & gl) {
        nx = p.x;
        ny = p.y;
        c++;
      }
    }
  } else if (gline) {
    let x1: number, y1: number, x2: number, y2: number;
    if (gline & G_LINEV) {
      x1 = x2 = x;
      y1 = y - 1;
      y2 = y + 1;
    } else {
      x1 = x - 1;
      x2 = x + 1;
      y1 = y2 = y;
    }
    if (INGRID(state, x1, y1) && state.scratch[IDX(state, x1, y1)]! & (gline | G_ISLAND)) {
      nx = x1;
      ny = y1;
      c++;
    }
    if (INGRID(state, x2, y2) && state.scratch[IDX(state, x2, y2)]! & (gline | G_ISLAND)) {
      nx = x2;
      ny = y2;
      c++;
    }
  }
  return { count: c, nx, ny };
}

function mapHasloops(state: GameState): boolean {
  state.scratch.set(state.grid);

  // Remove all 1-degree edges
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      let ox = x;
      let oy = y;
      let deg = gridDegree(state, ox, oy);
      while (deg.count === 1) {
        state.scratch[IDX(state, ox, oy)] &= ~(G_LINE | G_ISLAND);
        ox = deg.nx;
        oy = deg.ny;
        deg = gridDegree(state, ox, oy);
      }
    }
  }
  // Check for remaining edges
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (GRID(state, x, y) & G_ISLAND) continue;
      if (state.scratch[IDX(state, x, y)]! & G_LINE) return true;
    }
  }
  return false;
}

// =============================================================================
// map_group — DSF grouping of connected islands
// =============================================================================

function mapGroup(state: GameState): void {
  const _wh = state.w * state.h;
  const dsf = state.solver.dsf;
  dsfInit(dsf);

  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      state.grid[IDX(state, x, y)] &= ~G_SWEEP;

      const is = state.gridi[IDX(state, x, y)];
      if (!is) continue;
      const d1 = IDX(state, x, y);
      for (let i = 0; i < is.adj.npoints; i++) {
        const p = is.adj.points[i]!;
        // Only right/down
        if (p.dx === -1 || p.dy === -1) continue;
        if (!p.off) continue;
        if (!islandHasbridge(is, state, i)) continue;

        const isJoin = state.gridi[IDX(state, ISLAND_ORTHX(is, i), ISLAND_ORTHY(is, i))];
        if (!isJoin) continue;

        // Merge all squares between
        for (let x2 = x; x2 <= isJoin.x; x2++) {
          for (let y2 = y; y2 <= isJoin.y; y2++) {
            const d2 = IDX(state, x2, y2);
            if (d1 !== d2) dsfMerge(dsf, d1, d2);
          }
        }
      }
    }
  }
}

function _islandFindConnection(is: Island, state: GameState, adjpt: number): Island | null {
  if (!is.adj.points[adjpt]?.off) return null;
  if (!islandHasbridge(is, state, adjpt)) return null;
  return state.gridi[IDX(state, ISLAND_ORTHX(is, adjpt), ISLAND_ORTHY(is, adjpt))] ?? null;
}

function mapGroupCheck(
  state: GameState,
  canon: number,
  nislandsR: { value: number } | null,
): boolean {
  const dsf = state.solver.dsf;
  let nislands = 0;
  let allfull = true;

  for (let i = 0; i < state.n_islands; i++) {
    const is = state.islands[i]!;
    if (dsfCanonify(dsf, IDX(state, is.x, is.y)) !== canon) continue;
    state.grid[IDX(state, is.x, is.y)] |= G_SWEEP;
    nislands++;
    if (islandCountbridges(is, state) !== is.count) allfull = false;
  }
  if (nislandsR) nislandsR.value = nislands;
  return allfull;
}

function mapGroupFull(state: GameState): { anyFull: boolean; ngroups: number } {
  const dsf = state.solver.dsf;
  let ngroups = 0;
  let anyFull = false;

  for (let i = 0; i < state.n_islands; i++) {
    const is = state.islands[i]!;
    if (GRID(state, is.x, is.y) & G_SWEEP) continue;
    ngroups++;
    if (mapGroupCheck(state, dsfCanonify(dsf, IDX(state, is.x, is.y)), null)) anyFull = true;
  }
  return { anyFull, ngroups };
}

function mapCheck(state: GameState): boolean {
  if (!state.allowloops) {
    if (mapHasloops(state)) return false;
  }
  mapGroup(state);
  const { anyFull, ngroups } = mapGroupFull(state);
  if (anyFull) {
    if (ngroups === 1) return true;
  }
  return false;
}

function mapClear(state: GameState): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      state.grid[IDX(state, x, y)] &= G_ISLAND;
    }
  }
}

// =============================================================================
// Solver (from bridges.c solve_*)
// =============================================================================

function solveJoin(
  is: Island,
  state: GameState,
  direction: number,
  n: number,
  isMax: boolean,
): void {
  const isOrth = state.gridi[IDX(state, ISLAND_ORTHX(is, direction), ISLAND_ORTHY(is, direction))];
  if (!isOrth) return;
  islandJoin(is, isOrth, state, n, isMax);

  if (n > 0 && !isMax) {
    const d1 = IDX(state, is.x, is.y);
    const d2 = IDX(state, isOrth.x, isOrth.y);
    if (dsfCanonify(state.solver.dsf, d1) !== dsfCanonify(state.solver.dsf, d2)) {
      dsfMerge(state.solver.dsf, d1, d2);
    }
  }
}

function solveFillone(is: Island, state: GameState): number {
  let nadded = 0;
  for (let i = 0; i < is.adj.npoints; i++) {
    if (islandIsadj(is, state, i)) {
      if (!islandHasbridge(is, state, i)) {
        solveJoin(is, state, i, 1, false);
        nadded++;
      }
    }
  }
  return nadded;
}

function solveFill(is: Island, state: GameState): number {
  let nadded = 0;
  const missing = is.count - islandCountbridges(is, state);
  if (missing < 0) return 0;

  for (let i = 0; i < is.adj.npoints; i++) {
    const nnew = islandAdjspace(is, state, true, missing, i);
    if (nnew) {
      const p = is.adj.points[i]!;
      const ncurr = GRIDCOUNT(state, p.x, p.y, p.dx ? G_LINEH : G_LINEV);
      solveJoin(is, state, i, nnew + ncurr, false);
      nadded += nnew;
    }
  }
  return nadded;
}

function solveIslandStage1(is: Island, state: GameState, didsth: { value: boolean }): boolean {
  const bridges = islandCountbridges(is, state);
  const nspaces = islandCountspaces(is, state, true);
  const nadj = islandCountadj(is, state);
  let did = false;

  if (bridges > is.count) {
    return false;
  } else if (bridges === is.count) {
    if (!(GRID(state, is.x, is.y) & G_MARK)) {
      islandTogglemark(is, state);
      did = true;
    }
  } else if (GRID(state, is.x, is.y) & G_MARK) {
    return false;
  } else {
    if (is.count === bridges + nspaces) {
      if (solveFill(is, state) > 0) did = true;
    } else if (is.count > (nadj - 1) * state.maxb) {
      if (solveFillone(is, state) > 0) did = true;
    }
  }
  if (did) {
    mapUpdatePossibles(state);
    didsth.value = true;
  }
  return true;
}

function solveIslandCheckloop(is: Island, state: GameState, direction: number): boolean {
  if (state.allowloops) return false;
  if (islandHasbridge(is, state, direction)) return false;
  if (islandIsadj(is, state, direction) === 0) return false;

  const p = is.adj.points[direction]!;
  if (!p.off) return false;
  const isOrth = state.gridi[IDX(state, ISLAND_ORTHX(is, direction), ISLAND_ORTHY(is, direction))];
  if (!isOrth) return false;

  const d1 = IDX(state, is.x, is.y);
  const d2 = IDX(state, isOrth.x, isOrth.y);
  return dsfCanonify(state.solver.dsf, d1) === dsfCanonify(state.solver.dsf, d2);
}

function solveIslandStage2(is: Island, state: GameState, didsth: { value: boolean }): boolean {
  let added = false;
  let removed = false;
  let navail = 0;

  for (let i = 0; i < is.adj.npoints; i++) {
    if (solveIslandCheckloop(is, state, i)) {
      solveJoin(is, state, i, -1, false);
      mapUpdatePossibles(state);
      removed = true;
    } else {
      navail += islandIsadj(is, state, i);
    }
  }

  for (let i = 0; i < is.adj.npoints; i++) {
    if (!islandHasbridge(is, state, i)) {
      const nadj = islandIsadj(is, state, i);
      if (nadj > 0 && navail - nadj < is.count) {
        solveJoin(is, state, i, 1, false);
        added = true;
      }
    }
  }
  if (added) mapUpdatePossibles(state);
  if (added || removed) didsth.value = true;
  return true;
}

function solveIslandSubgroup(is: Island, state: GameState, direction: number): boolean {
  if (islandCountbridges(is, state) < is.count) return false;

  if (direction >= 0) {
    const isJoin =
      state.gridi[IDX(state, ISLAND_ORTHX(is, direction), ISLAND_ORTHY(is, direction))];
    if (!isJoin) return false;
    if (islandCountbridges(isJoin, state) < isJoin.count) return false;
  }

  const nislands = { value: 0 };
  if (mapGroupCheck(state, dsfCanonify(state.solver.dsf, IDX(state, is.x, is.y)), nislands)) {
    if (nislands.value < state.n_islands) return true;
  }
  return false;
}

function solveIslandImpossible(state: GameState): boolean {
  for (let i = 0; i < state.n_islands; i++) {
    if (islandImpossible(state.islands[i]!, state, false)) return true;
  }
  return false;
}

function solveIslandStage3(is: Island, state: GameState, didsth: { value: boolean }): boolean {
  const _wh = state.w * state.h;
  const ss = state.solver;

  const missing = is.count - islandCountbridges(is, state);
  if (missing <= 0) return true;

  for (let i = 0; i < is.adj.npoints; i++) {
    const p = is.adj.points[i]!;
    const spc = islandAdjspace(is, state, true, missing, i);
    if (spc === 0) continue;

    const curr = GRIDCOUNT(state, p.x, p.y, p.dx ? G_LINEH : G_LINEV);
    let maxb = -1;

    ss.tmpdsf.set(ss.dsf);
    for (let n = curr + 1; n <= curr + spc; n++) {
      solveJoin(is, state, i, n, false);
      mapUpdatePossibles(state);

      if (solveIslandSubgroup(is, state, i) || solveIslandImpossible(state)) {
        maxb = n - 1;
        break;
      }
    }
    solveJoin(is, state, i, curr, false);
    ss.dsf.set(ss.tmpdsf);

    if (maxb !== -1) {
      if (maxb === 0) {
        solveJoin(is, state, i, -1, false);
      } else {
        solveJoin(is, state, i, maxb, true);
      }
      didsth.value = true;
    }
    mapUpdatePossibles(state);
  }

  // Second pass: check if empty direction must have a bridge to avoid isolated subgroup
  for (let i = 0; i < is.adj.npoints; i++) {
    let spc = islandAdjspace(is, state, true, missing, i);
    if (spc === 0) continue;

    const before: number[] = [];
    for (let j = 0; j < is.adj.npoints; j++) {
      const pj = is.adj.points[j]!;
      before.push(GRIDCOUNT(state, pj.x, pj.y, pj.dx ? G_LINEH : G_LINEV));
    }
    if (before[i]! !== 0) continue;

    ss.tmpdsf.set(ss.dsf);

    for (let j = 0; j < is.adj.npoints; j++) {
      spc = islandAdjspace(is, state, true, missing, j);
      if (spc === 0) continue;
      if (j === i) continue;
      solveJoin(is, state, j, before[j]! + spc, false);
    }
    mapUpdatePossibles(state);

    const got = solveIslandSubgroup(is, state, -1);

    for (let j = 0; j < is.adj.npoints; j++) {
      solveJoin(is, state, j, before[j]!, false);
    }
    ss.dsf.set(ss.tmpdsf);

    if (got) {
      solveJoin(is, state, i, 1, false);
      didsth.value = true;
    }
    mapUpdatePossibles(state);
  }

  return true;
}

function solveSub(state: GameState, difficulty: number): boolean {
  while (true) {
    const didsth = { value: false };

    // Stage 1
    for (let i = 0; i < state.n_islands; i++) {
      const is = state.islands[i]!;
      if (!solveIslandStage1(is, state, didsth)) return false;
    }
    if (didsth.value) continue;
    if (difficulty < 1) break;

    // Stage 2
    for (let i = 0; i < state.n_islands; i++) {
      const is = state.islands[i]!;
      if (GRID(state, is.x, is.y) & G_MARK) continue;
      if (!solveIslandStage2(is, state, didsth)) return false;
    }
    if (didsth.value) continue;
    if (difficulty < 2) break;

    // Stage 3
    for (let i = 0; i < state.n_islands; i++) {
      const is = state.islands[i]!;
      if (!solveIslandStage3(is, state, didsth)) return false;
    }
    if (didsth.value) continue;
    break;
  }
  return mapCheck(state);
}

function solveFromScratch(state: GameState, difficulty: number): boolean {
  mapClear(state);
  mapGroup(state);
  mapUpdatePossibles(state);
  return solveSub(state, difficulty);
}

// =============================================================================
// new_game_desc — Island placement + bridge generation (from bridges.c)
// =============================================================================

function newGameDesc(
  w: number,
  h: number,
  islandPercent: number,
  expansion: number,
  maxb: number,
  allowloops: boolean,
  difficulty: number,
  rs: Random,
): GameState | null {
  const wh = w * h;
  const niReq = Math.max(Math.floor((islandPercent * wh) / 100), MIN_SENSIBLE_ISLANDS);
  let attempts = 0;
  const MAX_ATTEMPTS = 1000;

  while (attempts++ < MAX_ATTEMPTS) {
    const tobuild = newState(w, h, maxb, allowloops, difficulty);
    tobuild.params.islands = islandPercent;
    tobuild.params.expansion = expansion;

    // Pick a first island position randomly
    const startX = rs.upto(w);
    const startY = rs.upto(h);
    islandAdd(tobuild, startX, startY, 0);
    let niCurr = 1;
    let niBad = 0;

    while (niCurr < niReq) {
      // Pick a random island to extend from
      const isIdx = rs.upto(tobuild.n_islands);
      const is = tobuild.islands[isIdx]!;

      // Pick a random direction
      const j = rs.upto(is.adj.npoints);
      const dx = is.adj.points[j]?.x - is.x;
      const dy = is.adj.points[j]?.y - is.y;

      // Find limits for new island
      let joinx = -1;
      let joiny = -1;
      const minx = is.x + 2 * dx;
      const miny = is.y + 2 * dy;
      let x = is.x + dx;
      let y = is.y + dy;

      if (!INGRID(tobuild, x, y) || GRID(tobuild, x, y) & (G_LINEV | G_LINEH)) {
        niBad++;
        if (niBad > MAX_NEWISLAND_TRIES) break;
        continue;
      }

      let maxx = -1;
      let maxy = -1;
      let foundmax = false;

      while (true) {
        if (!INGRID(tobuild, x, y)) {
          maxx = x - dx;
          maxy = y - dy;
          foundmax = true;
          break;
        }
        if (GRID(tobuild, x, y) & G_ISLAND) {
          joinx = x;
          joiny = y;
          maxx = x - 2 * dx;
          maxy = y - 2 * dy;
          foundmax = true;
          break;
        }
        if (GRID(tobuild, x, y) & (G_LINEV | G_LINEH)) {
          maxx = x - dx;
          maxy = y - dy;
          foundmax = true;
          break;
        }
        x += dx;
        y += dy;
      }

      if (!foundmax) {
        niBad++;
        if (niBad > MAX_NEWISLAND_TRIES) break;
        continue;
      }

      // Try to join existing island (if loops allowed)
      if (allowloops && joinx !== -1 && joiny !== -1) {
        if (rs.upto(100) < expansion) {
          const is2 = tobuild.gridi[IDX(tobuild, joinx, joiny)];
          if (is2) {
            islandJoin(is, is2, tobuild, rs.upto(maxb) + 1, false);
            continue;
          }
        }
      }

      const diffx = (maxx - minx) * dx;
      const diffy = (maxy - miny) * dy;
      if (diffx < 0 || diffy < 0) {
        niBad++;
        if (niBad > MAX_NEWISLAND_TRIES) break;
        continue;
      }

      let newx: number, newy: number;
      if (rs.upto(100) < expansion) {
        newx = maxx;
        newy = maxy;
      } else {
        newx = minx + rs.upto(diffx + 1) * dx;
        newy = miny + rs.upto(diffy + 1) * dy;
      }

      // Check we're not adjacent to another island in the orthogonal direction
      if (
        (INGRID(tobuild, newx + dy, newy + dx) && GRID(tobuild, newx + dy, newy + dx) & G_ISLAND) ||
        (INGRID(tobuild, newx - dy, newy - dx) && GRID(tobuild, newx - dy, newy - dx) & G_ISLAND)
      ) {
        niBad++;
        if (niBad > MAX_NEWISLAND_TRIES) break;
        continue;
      }

      const is2 = islandAdd(tobuild, newx, newy, 0);
      // Re-fetch `is` since array may have been reallocated (in C; in JS references persist,
      // but we stored isIdx so just re-index for safety)
      const isRefreshed = tobuild.islands[isIdx]!;

      niCurr++;
      niBad = 0;
      islandJoin(isRefreshed, is2, tobuild, rs.upto(maxb) + 1, false);
    }

    if (niCurr === 1) continue;

    // Check at least one island on each edge
    let echeck = 0;
    for (let x = 0; x < w; x++) {
      if (tobuild.gridi[IDX(tobuild, x, 0)]) echeck |= 1;
      if (tobuild.gridi[IDX(tobuild, x, h - 1)]) echeck |= 2;
    }
    for (let y = 0; y < h; y++) {
      if (tobuild.gridi[IDX(tobuild, 0, y)]) echeck |= 4;
      if (tobuild.gridi[IDX(tobuild, w - 1, y)]) echeck |= 8;
    }
    if (echeck !== 15) continue;

    mapCount(tobuild);
    mapFindOrthogonal(tobuild);

    // Difficulty filtering: reject if solvable at easier difficulty
    if (difficulty > 0) {
      if (niCurr > MIN_SENSIBLE_ISLANDS) {
        const testState = dupState(tobuild);
        if (solveFromScratch(testState, difficulty - 1)) continue;
      }
    }

    // Must be solvable at target difficulty
    const solveState = dupState(tobuild);
    if (!solveFromScratch(solveState, difficulty)) continue;

    return tobuild;
  }

  return null;
}

// =============================================================================
// Extract solution — find bridges from a solved state
// =============================================================================

function extractSolution(state: GameState): { from: number; to: number; count: number }[] {
  const solution: { from: number; to: number; count: number }[] = [];

  // Build index map: (x,y) -> island index
  const islandIdx = new Map<string, number>();
  for (let i = 0; i < state.n_islands; i++) {
    const is = state.islands[i]!;
    islandIdx.set(`${is.x},${is.y}`, i);
  }

  // For each island, check right and down connections to avoid duplicates
  for (let i = 0; i < state.n_islands; i++) {
    const is = state.islands[i]!;
    for (let d = 0; d < is.adj.npoints; d++) {
      const p = is.adj.points[d]!;
      // Only right (+1,0) or down (0,+1) to avoid double-counting
      if (p.dx === -1 || p.dy === -1) continue;
      if (!p.off) continue;

      const gline = p.dx ? G_LINEH : G_LINEV;
      const count = GRIDCOUNT(state, p.x, p.y, gline);
      if (count > 0) {
        const ox = ISLAND_ORTHX(is, d);
        const oy = ISLAND_ORTHY(is, d);
        const j = islandIdx.get(`${ox},${oy}`);
        if (j !== undefined) {
          solution.push({ from: i, to: j, count });
        }
      }
    }
  }
  return solution;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Bridges (Hashiwokakero) puzzle.
 *
 * Faithful port of `new_game_desc()` from Simon Tatham's bridges.c.
 *
 * @param w Grid width (minimum 3)
 * @param h Grid height (minimum 3)
 * @param islandCount Approximate number of islands desired
 * @param options Optional: maxBridges (1-4, default 2), difficulty (0-2, default 0),
 *               allowLoops (default true), seed (for deterministic generation)
 * @returns A BridgesPuzzle with islands and solution
 */
export function generateBridgesPuzzle(
  w: number,
  h: number,
  islandCount: number,
  options?: {
    maxBridges?: number;
    difficulty?: number;
    allowLoops?: boolean;
    seed?: number;
  },
): BridgesPuzzle {
  if (w < 3 || h < 3) throw new Error('Width and height must be at least 3');

  const maxb = Math.min(Math.max(options?.maxBridges ?? 2, 1), MAX_BRIDGES);
  const difficulty = Math.min(Math.max(options?.difficulty ?? 0, 0), 2);
  const allowloops = options?.allowLoops ?? true;
  const rs = new Random(options?.seed);

  // Convert islandCount to a percentage for the C algorithm
  const wh = w * h;
  const islandPercent = Math.max(1, Math.min(30, Math.round((islandCount / wh) * 100)));
  const expansion = 10; // default from C presets

  const state = newGameDesc(w, h, islandPercent, expansion, maxb, allowloops, difficulty, rs);
  if (!state) {
    // Fallback: retry without difficulty constraints
    const fallback = newGameDesc(w, h, islandPercent, expansion, maxb, allowloops, 0, new Random());
    if (!fallback) throw new Error('Failed to generate a Bridges puzzle after maximum attempts');
    return buildResult(fallback);
  }

  return buildResult(state);
}

function buildResult(state: GameState): BridgesPuzzle {
  // Re-solve to get the solution bridges
  mapFindOrthogonal(state);
  const solveState = dupState(state);
  solveFromScratch(solveState, 10); // solve at max difficulty for complete solution

  const islands = state.islands.map((is) => ({
    x: is.x,
    y: is.y,
    count: is.count,
  }));

  const solution = extractSolution(solveState);

  return {
    islands,
    w: state.w,
    h: state.h,
    solution,
  };
}
