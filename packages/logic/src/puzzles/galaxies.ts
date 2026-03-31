// @ts-nocheck
/**
 * Galaxies puzzle generator — faithful port of Simon Tatham's galaxies.c + dsf.c
 *
 * Grid is stored as size (2w-1) x (2h-1), holding edges as well as tiles
 * (and vertices at edge intersections). Any dot is positioned at one of
 * these grid points.
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=galaxies.c
 * License: MIT
 */

// =============================================================================
// Public types
// =============================================================================

export interface GalaxiesPuzzle {
  /** User-visible width */
  w: number;
  /** User-visible height */
  h: number;
  /** Dot positions in internal (2x+1) coordinates */
  dots: { x: number; y: number }[];
  /**
   * Solution edges: for every internal edge space, true = edge is set.
   * Encoded as a flat array indexed by (y * sx + x) where sx = 2*w+1, sy = 2*h+1.
   * Only edge-type spaces (where exactly one of x,y is even) are meaningful.
   */
  edges: boolean[];
  /** Internal grid width (2*w+1) */
  sx: number;
  /** Internal grid height (2*h+1) */
  sy: number;
}

// =============================================================================
// DSF (Disjoint Set Forest) — faithful port of dsf.c
// =============================================================================

/**
 * Bottom bit: whether element is opposite to parent (starts false).
 * Second bit: whether element is root of its tree.
 * If root: remaining 30 bits = number of elements in tree.
 * If not root: remaining 30 bits = parent index.
 */

function dsfInit(dsf: Int32Array, size: number): void {
  for (let i = 0; i < size; i++) dsf[i] = 6; // root, size=1: (1 << 2) | 2 = 6
}

function snewDsf(size: number): Int32Array {
  const ret = new Int32Array(size);
  dsfInit(ret, size);
  return ret;
}

function edsfCanonify(
  dsf: Int32Array,
  index: number,
  inverseReturn: { value: number } | null,
): number {
  const startIndex = index;
  let inverse = 0;

  // Find canonical element
  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonicalIndex = index;

  if (inverseReturn) inverseReturn.value = inverse;

  // Path compression
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextindex = dsf[index] >> 2;
    const nextinverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextinverse;
    index = nextindex;
  }

  return index;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  return edsfCanonify(dsf, index, null);
}

function edsfMerge(dsf: Int32Array, v1: number, v2: number, inverse: number): void {
  const i1 = { value: 0 };
  const i2 = { value: 0 };

  v1 = edsfCanonify(dsf, v1, i1);
  inverse ^= i1.value;
  v2 = edsfCanonify(dsf, v2, i2);
  inverse ^= i2.value;

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | (inverse ? 1 : 0);
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  edsfMerge(dsf, v1, v2, 0);
}

// =============================================================================
// Constants — faithful port of galaxies.c
// =============================================================================

const s_tile = 0;
const s_edge = 1;
const s_vertex = 2;

const F_DOT = 1;
const F_EDGE_SET = 2;
const F_TILE_ASSOC = 4;
const F_DOT_BLACK = 8;
const F_MARK = 16;
const F_REACHABLE = 32;
const _F_SCRATCH = 64;
const F_MULTIPLE = 128;

const DIFF_NORMAL = 0;
const DIFF_UNREASONABLE = 1;
const DIFF_IMPOSSIBLE = 2;
const DIFF_AMBIGUOUS = 3;
const DIFF_UNFINISHED = 4;

const IMPOSSIBLE_QUITS = 1;

const GP_DOTS = 1;
const _MAX_TOADD = 4;
const _MAX_OUTSIDE = 8;
const MAXTRIES = 50;
const MAXRECURSE = 5;

// =============================================================================
// Space / State types
// =============================================================================

interface Space {
  x: number;
  y: number;
  type: number; // s_tile | s_edge | s_vertex
  flags: number;
  dotx: number;
  doty: number;
  nassoc: number;
}

interface GameState {
  w: number;
  h: number;
  sx: number; // (2w+1)
  sy: number; // (2h+1)
  grid: Space[];
  ndots: number;
  dots: Space[];
}

// =============================================================================
// Random — simple seedable PRNG (matches Tatham's random_upto behavior)
// =============================================================================

/** Simple PRNG using Mulberry32 */
class RandomState {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? (Math.random() * 0xffffffff) >>> 0;
  }

  /** Returns integer in [0, n) */
  upto(n: number): number {
    if (n <= 1) return 0;
    // Mulberry32
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    return Math.floor(r * n);
  }
}

function shuffle<T>(arr: T[], n: number, rs: RandomState): void {
  for (let i = n - 1; i > 0; i--) {
    const j = rs.upto(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// =============================================================================
// Grid helpers — faithful port
// =============================================================================

function INGRID(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.sx && y < state.sy;
}

function _INUI(state: GameState, x: number, y: number): boolean {
  return x > 0 && y > 0 && x < state.sx - 1 && y < state.sy - 1;
}

function SPACE(state: GameState, x: number, y: number): Space {
  return state.grid[y * state.sx + x];
}

function IS_VERTICAL_EDGE(x: number): boolean {
  return x % 2 === 0;
}

// =============================================================================
// Game utility functions
// =============================================================================

function addDot(sp: Space): void {
  sp.flags |= F_DOT;
  sp.nassoc = 0;
}

function removeDot(sp: Space): void {
  sp.flags &= ~F_DOT;
}

function removeAssoc(state: GameState, tile: Space): void {
  if (tile.flags & F_TILE_ASSOC) {
    SPACE(state, tile.dotx, tile.doty).nassoc--;
    tile.flags &= ~F_TILE_ASSOC;
    tile.dotx = -1;
    tile.doty = -1;
  }
}

function addAssoc(state: GameState, tile: Space, dot: Space): void {
  removeAssoc(state, tile);
  tile.flags |= F_TILE_ASSOC;
  tile.dotx = dot.x;
  tile.doty = dot.y;
  dot.nassoc++;
}

function _sp2dot(state: GameState, x: number, y: number): Space | null {
  const sp = SPACE(state, x, y);
  if (!(sp.flags & F_TILE_ASSOC)) return null;
  return SPACE(state, sp.dotx, sp.doty);
}

function spaceOppositeDot(state: GameState, sp: Space, dot: Space): Space | null {
  const dx = sp.x - dot.x;
  const dy = sp.y - dot.y;
  const tx = dot.x - dx;
  const ty = dot.y - dy;
  if (!INGRID(state, tx, ty)) return null;
  return SPACE(state, tx, ty);
}

function tileOpposite(state: GameState, sp: Space): Space | null {
  const dot = SPACE(state, sp.dotx, sp.doty);
  return spaceOppositeDot(state, sp, dot);
}

function dotfortile(state: GameState, tile: Space, dot: Space): boolean {
  const tileOpp = spaceOppositeDot(state, tile, dot);
  if (!tileOpp) return false;
  if (tileOpp.flags & F_TILE_ASSOC && (tileOpp.dotx !== dot.x || tileOpp.doty !== dot.y))
    return false;
  return true;
}

function adjacencies(
  state: GameState,
  sp: Space,
  a1s: (Space | null)[],
  a2s: (Space | null)[],
): void {
  const dxs = [-1, 1, 0, 0];
  const dys = [0, 0, -1, 1];

  for (let n = 0; n < 4; n++) {
    let x = sp.x + dxs[n];
    let y = sp.y + dys[n];

    if (INGRID(state, x, y)) {
      a1s[n] = SPACE(state, x, y);
      x += dxs[n];
      y += dys[n];
      if (INGRID(state, x, y)) a2s[n] = SPACE(state, x, y);
      else a2s[n] = null;
    } else {
      a1s[n] = null;
      a2s[n] = null;
    }
  }
}

function tilesFromEdge(state: GameState, sp: Space, ts: (Space | null)[]): void {
  let xs0: number, ys0: number, xs1: number, ys1: number;
  if (IS_VERTICAL_EDGE(sp.x)) {
    xs0 = sp.x - 1;
    ys0 = sp.y;
    xs1 = sp.x + 1;
    ys1 = sp.y;
  } else {
    xs0 = sp.x;
    ys0 = sp.y - 1;
    xs1 = sp.x;
    ys1 = sp.y + 1;
  }
  ts[0] = INGRID(state, xs0, ys0) ? SPACE(state, xs0, ys0) : null;
  ts[1] = INGRID(state, xs1, ys1) ? SPACE(state, xs1, ys1) : null;
}

function outlineTileFordot(state: GameState, tile: Space, mark: boolean): boolean {
  const tadj: (Space | null)[] = [null, null, null, null];
  const eadj: (Space | null)[] = [null, null, null, null];
  let didsth = false;

  adjacencies(state, tile, eadj, tadj);
  for (let i = 0; i < 4; i++) {
    if (!eadj[i]) continue;

    const edge = eadj[i].flags & F_EDGE_SET ? 1 : 0;
    let same: number;
    if (tadj[i]) {
      if (!(tile.flags & F_TILE_ASSOC)) same = tadj[i].flags & F_TILE_ASSOC ? 0 : 1;
      else
        same =
          tadj[i].flags & F_TILE_ASSOC && tile.dotx === tadj[i].dotx && tile.doty === tadj[i].doty
            ? 1
            : 0;
    } else {
      same = 0;
    }

    if (!edge && !same) {
      if (mark) eadj[i].flags |= F_EDGE_SET;
      didsth = true;
    } else if (edge && same) {
      if (mark) eadj[i].flags &= ~F_EDGE_SET;
      didsth = true;
    }
  }
  return didsth;
}

// =============================================================================
// foreach_* iteration — faithful port
// =============================================================================

type SpaceCb = (state: GameState, sp: Space, ctx: any) => number;

function foreachSub(
  state: GameState,
  cb: SpaceCb,
  f: number,
  ctx: any,
  startx: number,
  starty: number,
): number {
  let progress = 0;
  let impossible = 0;

  for (let y = starty; y < state.sy; y += 2) {
    for (let x = startx; x < state.sx; x += 2) {
      const sp = SPACE(state, x, y);
      const ret = cb(state, sp, ctx);
      if (ret === -1) {
        if (f & IMPOSSIBLE_QUITS) return -1;
        impossible = -1;
      } else if (ret === 1) {
        progress = 1;
      }
    }
  }
  return impossible ? -1 : progress;
}

function foreachTile(state: GameState, cb: SpaceCb, f: number, ctx: any): number {
  return foreachSub(state, cb, f, ctx, 1, 1);
}

function foreachEdge(state: GameState, cb: SpaceCb, f: number, ctx: any): number {
  const ret1 = foreachSub(state, cb, f, ctx, 0, 1);
  const ret2 = foreachSub(state, cb, f, ctx, 1, 0);
  if (ret1 === -1 || ret2 === -1) return -1;
  return ret1 || ret2 ? 1 : 0;
}

// =============================================================================
// dot_is_possible — faithful port
// =============================================================================

function dotIsPossible(state: GameState, sp: Space, allowAssoc: boolean): boolean {
  let bx = 0;
  let by = 0;

  switch (sp.type) {
    case s_tile:
      bx = by = 1;
      break;
    case s_edge:
      if (IS_VERTICAL_EDGE(sp.x)) {
        bx = 2;
        by = 1;
      } else {
        bx = 1;
        by = 2;
      }
      break;
    case s_vertex:
      bx = by = 2;
      break;
  }

  for (let dx = -bx; dx <= bx; dx++) {
    for (let dy = -by; dy <= by; dy++) {
      if (!INGRID(state, sp.x + dx, sp.y + dy)) continue;
      const adj = SPACE(state, sp.x + dx, sp.y + dy);

      if (!allowAssoc && adj.flags & F_TILE_ASSOC) return false;

      if (dx !== 0 || dy !== 0) {
        if (adj.flags & F_DOT) return false;
      }

      if (Math.abs(dx) < bx && Math.abs(dy) < by && adj.flags & F_EDGE_SET) return false;
    }
  }
  return true;
}

// =============================================================================
// Game creation — faithful port
// =============================================================================

function blankGame(w: number, h: number): GameState {
  const sx = w * 2 + 1;
  const sy = h * 2 + 1;
  const grid: Space[] = new Array(sx * sy);

  for (let x = 0; x < sx; x++) {
    for (let y = 0; y < sy; y++) {
      const sp: Space = {
        x,
        y,
        type: s_tile,
        flags: 0,
        dotx: -1,
        doty: -1,
        nassoc: 0,
      };

      if (x % 2 === 0 && y % 2 === 0) {
        sp.type = s_vertex;
      } else if (x % 2 === 0 || y % 2 === 0) {
        sp.type = s_edge;
        if (x === 0 || y === 0 || x === sx - 1 || y === sy - 1) sp.flags |= F_EDGE_SET;
      } else {
        sp.type = s_tile;
      }

      grid[y * sx + x] = sp;
    }
  }

  return { w, h, sx, sy, grid, ndots: 0, dots: [] };
}

function gameUpdateDots(state: GameState): void {
  state.dots = [];
  for (let i = 0; i < state.grid.length; i++) {
    if (state.grid[i].flags & F_DOT) state.dots.push(state.grid[i]);
  }
  state.ndots = state.dots.length;
}

function clearGame(state: GameState, cleardots: boolean): void {
  for (let x = 1; x < state.sx - 1; x++) {
    for (let y = 1; y < state.sy - 1; y++) {
      if (cleardots) SPACE(state, x, y).flags = 0;
      else SPACE(state, x, y).flags &= F_DOT | F_DOT_BLACK;
    }
  }
  if (cleardots) gameUpdateDots(state);
}

function dupGame(state: GameState): GameState {
  const ret = blankGame(state.w, state.h);
  for (let i = 0; i < state.grid.length; i++) {
    const src = state.grid[i];
    const dst = ret.grid[i];
    dst.x = src.x;
    dst.y = src.y;
    dst.type = src.type;
    dst.flags = src.flags;
    dst.dotx = src.dotx;
    dst.doty = src.doty;
    dst.nassoc = src.nassoc;
  }
  gameUpdateDots(ret);
  return ret;
}

// =============================================================================
// movedot / dot_expand_or_move — faithful port
// =============================================================================

const MD_CHECK = 0;
const MD_MOVE = 1;

interface MoveDot {
  op: number;
  olddot: Space;
  newdot: Space;
}

function movedotCb(state: GameState, tile: Space, ctx: any): number {
  const md = ctx as MoveDot;

  if (!(tile.flags & F_TILE_ASSOC)) return 0;
  if (tile.dotx !== md.olddot.x || tile.doty !== md.olddot.y) return 0;

  const newopp = spaceOppositeDot(state, tile, md.newdot);

  switch (md.op) {
    case MD_CHECK:
      if (!newopp) return -1;
      if (newopp.flags & F_TILE_ASSOC) {
        if (newopp.dotx !== md.olddot.x || newopp.doty !== md.olddot.y) return -1;
      }
      break;
    case MD_MOVE:
      addAssoc(state, tile, md.newdot);
      addAssoc(state, newopp!, md.newdot);
      return 1;
  }
  return 0;
}

function dotExpandOrMove(state: GameState, dot: Space, toadd: Space[], nadd: number): boolean {
  // First try simple expansion
  for (let i = 0; i < nadd; i++) {
    const tileopp = spaceOppositeDot(state, toadd[i], dot);
    if (!tileopp) {
      // Can't expand — try move instead
      return dotExpandOrMoveInner(state, dot, toadd, nadd);
    }
    if (tileopp.flags & F_TILE_ASSOC) {
      return dotExpandOrMoveInner(state, dot, toadd, nadd);
    }
  }
  // All have valid empty opposites: expand
  for (let i = 0; i < nadd; i++) {
    const tileopp = spaceOppositeDot(state, toadd[i], dot)!;
    addAssoc(state, toadd[i], dot);
    addAssoc(state, tileopp, dot);
  }
  return true;
}

function dotExpandOrMoveInner(state: GameState, dot: Space, toadd: Space[], nadd: number): boolean {
  // Calculate centre of gravity for new dot
  const nnew = dot.nassoc + nadd;
  let cx = dot.x * dot.nassoc;
  let cy = dot.y * dot.nassoc;
  for (let i = 0; i < nadd; i++) {
    cx += toadd[i].x;
    cy += toadd[i].y;
  }
  if (cx % nnew !== 0 || cy % nnew !== 0) return false;
  cx = Math.floor(cx / nnew);
  cy = Math.floor(cy / nnew);

  // Check whether all spaces in old tile would have good opposite wrt new dot
  const md: MoveDot = {
    olddot: dot,
    newdot: SPACE(state, cx, cy),
    op: MD_CHECK,
  };
  let ret = foreachTile(state, movedotCb, IMPOSSIBLE_QUITS, md);
  if (ret === -1) return false;

  // Also check new spaces
  for (let i = 0; i < nadd; i++) {
    let tileopp = spaceOppositeDot(state, toadd[i], md.newdot);
    if (
      tileopp &&
      tileopp.flags & F_TILE_ASSOC &&
      (tileopp.dotx !== dot.x || tileopp.doty !== dot.y)
    ) {
      tileopp = null;
    }
    if (!tileopp) return false;
  }

  // Associate toadd with old dot first
  for (let i = 0; i < nadd; i++) {
    addAssoc(state, toadd[i], dot);
  }

  // Move the dot
  removeDot(dot);
  addDot(md.newdot);

  md.op = MD_MOVE;
  ret = foreachTile(state, movedotCb, 0, md);
  return true;
}

// =============================================================================
// generate_try_block — faithful port
// =============================================================================

function generateTryBlock(
  state: GameState,
  rs: RandomState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (!INGRID(state, x1, y1) || !INGRID(state, x2, y2)) return false;

  const maxsz = Math.floor(Math.sqrt(state.w * state.h)) * 2;
  const toadd: Space[] = [];

  // Build static list; bail if any space already associated
  for (let x = x1; x <= x2; x += 2) {
    for (let y = y1; y <= y2; y += 2) {
      const sp = SPACE(state, x, y);
      if (sp.flags & F_TILE_ASSOC) return false;
      toadd.push(sp);
    }
  }

  // Build list of outside spaces
  const outside: Space[] = [];
  for (let x = x1; x <= x2; x += 2) {
    if (INGRID(state, x, y1 - 2)) outside.push(SPACE(state, x, y1 - 2));
    if (INGRID(state, x, y2 + 2)) outside.push(SPACE(state, x, y2 + 2));
  }
  for (let y = y1; y <= y2; y += 2) {
    if (INGRID(state, x1 - 2, y)) outside.push(SPACE(state, x1 - 2, y));
    if (INGRID(state, x2 + 2, y)) outside.push(SPACE(state, x2 + 2, y));
  }
  shuffle(outside, outside.length, rs);

  for (let i = 0; i < outside.length; i++) {
    if (!(outside[i].flags & F_TILE_ASSOC)) continue;
    const dot = SPACE(state, outside[i].dotx, outside[i].doty);
    if (dot.nassoc >= maxsz) continue;
    if (dotExpandOrMove(state, dot, toadd, toadd.length)) return true;
  }
  return false;
}

// =============================================================================
// generate_pass — faithful port
// =============================================================================

function generatePass(
  state: GameState,
  rs: RandomState,
  scratch: number[],
  perc: number,
  flags: number,
): void {
  const sz = state.sx * state.sy;
  shuffle(scratch, sz, rs);

  const nspc = Math.floor((perc * sz) / 100);

  for (let i = 0; i < nspc; i++) {
    const sp = state.grid[scratch[i]];
    let x1 = sp.x;
    let y1 = sp.y;
    let x2 = sp.x;
    let y2 = sp.y;

    if (sp.type === s_edge) {
      if (IS_VERTICAL_EDGE(sp.x)) {
        x1--;
        x2++;
      } else {
        y1--;
        y2++;
      }
    }
    if (sp.type !== s_vertex) {
      if (generateTryBlock(state, rs, x1, y1, x2, y2)) continue;
    }

    if (!(flags & GP_DOTS)) continue;

    if (sp.type === s_edge && i % 2) continue;

    if (dotIsPossible(state, sp, false)) {
      addDot(sp);
      solverObviousDot(state, sp);
    }
  }
}

// =============================================================================
// Solver — faithful port
// =============================================================================

let solverRecurseDepth = 0;

interface SolverCtx {
  state: GameState;
  sz: number;
  scratch: Space[];
}

function newSolver(state: GameState): SolverCtx {
  return {
    state,
    sz: state.sx * state.sy,
    scratch: new Array(state.sx * state.sy),
  };
}

function solverAddAssoc(state: GameState, tile: Space, dx: number, dy: number): number {
  const dot = SPACE(state, dx, dy);
  const tileOpp = spaceOppositeDot(state, tile, dot);

  if (tile.flags & F_TILE_ASSOC) {
    if (tile.dotx !== dx || tile.doty !== dy) return -1;
    return 0;
  }
  if (!tileOpp) return -1;
  if (tileOpp.flags & F_TILE_ASSOC && (tileOpp.dotx !== dx || tileOpp.doty !== dy)) return -1;

  addAssoc(state, tile, dot);
  addAssoc(state, tileOpp, dot);
  return 1;
}

function solverObviousDot(state: GameState, dot: Space): number {
  let didsth = 0;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!INGRID(state, dot.x + dx, dot.y + dy)) continue;
      const tile = SPACE(state, dot.x + dx, dot.y + dy);
      if (tile.type === s_tile) {
        const ret = solverAddAssoc(state, tile, dot.x, dot.y);
        if (ret < 0) return -1;
        if (ret > 0) didsth = 1;
      }
    }
  }
  return didsth;
}

function solverObvious(state: GameState): number {
  let didsth = 0;
  for (let i = 0; i < state.ndots; i++) {
    const ret = solverObviousDot(state, state.dots[i]);
    if (ret < 0) return -1;
    if (ret > 0) didsth = 1;
  }
  return didsth;
}

function solverLinesOppositeCb(state: GameState, edge: Space, _ctx: any): number {
  let didsth = 0;
  const tiles: (Space | null)[] = [null, null];
  tilesFromEdge(state, edge, tiles);

  if (
    !(edge.flags & F_EDGE_SET) &&
    tiles[0] &&
    tiles[1] &&
    tiles[0].flags & F_TILE_ASSOC &&
    tiles[1].flags & F_TILE_ASSOC &&
    (tiles[0].dotx !== tiles[1].dotx || tiles[0].doty !== tiles[1].doty)
  ) {
    edge.flags |= F_EDGE_SET;
    didsth = 1;
  }

  if (!(edge.flags & F_EDGE_SET)) return didsth;

  for (let n = 0; n < 2; n++) {
    if (!tiles[n]) continue;
    if (!(tiles[n].flags & F_TILE_ASSOC)) continue;

    const tileOpp = tileOpposite(state, tiles[n]);
    if (!tileOpp) return -1;

    const dx = tiles[n].x - edge.x;
    const dy = tiles[n].y - edge.y;
    if (!INGRID(state, tileOpp.x + dx, tileOpp.y + dy)) continue;
    const edgeOpp = SPACE(state, tileOpp.x + dx, tileOpp.y + dy);
    if (!(edgeOpp.flags & F_EDGE_SET)) {
      edgeOpp.flags |= F_EDGE_SET;
      didsth = 1;
    }
  }
  return didsth;
}

function solverSpacesOneposs(state: GameState, tile: Space, _ctx: any): number {
  if (tile.flags & F_TILE_ASSOC) return 0;

  const edgeadj: (Space | null)[] = [null, null, null, null];
  const tileadj: (Space | null)[] = [null, null, null, null];
  adjacencies(state, tile, edgeadj, tileadj);

  let eset = 0;
  let dotx = -1;
  let doty = -1;

  for (let n = 0; n < 4; n++) {
    if (!edgeadj[n]) continue;
    if (edgeadj[n].flags & F_EDGE_SET) {
      eset++;
    } else {
      if (!tileadj[n]) continue;
      if (!(tileadj[n].flags & F_TILE_ASSOC)) return 0;
      if (dotx !== -1 && doty !== -1 && (tileadj[n].dotx !== dotx || tileadj[n].doty !== doty))
        return 0;
      dotx = tileadj[n].dotx;
      doty = tileadj[n].doty;
    }
  }
  if (eset === 4) return -1;
  if (dotx === -1 || doty === -1) return 0;

  const ret = solverAddAssoc(state, tile, dotx, doty);
  if (ret === -1) return -1;
  return ret !== 0 ? 1 : 0;
}

function solverExpandCheckdot(tile: Space, dot: Space): boolean {
  if (!(tile.flags & F_TILE_ASSOC)) return true;
  if (tile.dotx === dot.x && tile.doty === dot.y) return true;
  return false;
}

function solverExpandFromdot(state: GameState, dot: Space, sctx: SolverCtx): void {
  // Clear F_MARK on tiles only (optimized)
  for (let y = 1; y < state.sy; y += 2) {
    for (let x = 1; x < state.sx; x += 2) {
      SPACE(state, x, y).flags &= ~F_MARK;
    }
  }

  // Seed the list
  if (dot.type === s_tile) {
    sctx.scratch[0] = sctx.scratch[1] = dot;
  } else if (dot.type === s_edge) {
    const ts: (Space | null)[] = [null, null];
    tilesFromEdge(state, dot, ts);
    sctx.scratch[0] = ts[0]!;
    sctx.scratch[1] = ts[1]!;
  } else if (dot.type === s_vertex) {
    sctx.scratch[0] = SPACE(state, dot.x - 1, dot.y - 1);
    sctx.scratch[1] = SPACE(state, dot.x + 1, dot.y + 1);
  }

  sctx.scratch[0].flags |= F_MARK;
  sctx.scratch[1].flags |= F_MARK;

  let start = 0;
  let end = 2;
  let next = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (let i = start; i < end; i += 2) {
      const t1 = sctx.scratch[i];
      const edges: (Space | null)[] = [null, null, null, null];
      const tileadj: (Space | null)[] = [null, null, null, null];
      adjacencies(state, t1, edges, tileadj);

      for (let j = 0; j < 4; j++) {
        if (!edges[j]) continue;
        if (edges[j].flags & F_EDGE_SET) continue;
        if (!tileadj[j]) continue;
        if (tileadj[j].flags & F_MARK) continue;

        const tileadj2 = spaceOppositeDot(state, tileadj[j], dot);
        if (!tileadj2) {
          tileadj[j].flags |= F_MARK;
          continue;
        }

        if (solverExpandCheckdot(tileadj[j], dot) && solverExpandCheckdot(tileadj2, dot)) {
          sctx.scratch[next++] = tileadj[j];
          sctx.scratch[next++] = tileadj2;
        }
        tileadj[j].flags |= F_MARK;
        tileadj2.flags |= F_MARK;
      }
    }
    if (next > end) {
      start = end;
      end = next;
    } else {
      break;
    }
  }

  // Update main flags for expanded tiles
  for (let i = 0; i < end; i++) {
    if (sctx.scratch[i].flags & F_TILE_ASSOC) continue;
    if (sctx.scratch[i].flags & F_REACHABLE) {
      sctx.scratch[i].flags |= F_MULTIPLE;
    } else {
      sctx.scratch[i].flags |= F_REACHABLE;
      sctx.scratch[i].dotx = dot.x;
      sctx.scratch[i].doty = dot.y;
    }
  }
}

function solverExpandPostcb(state: GameState, tile: Space, _ctx: any): number {
  if (tile.flags & F_TILE_ASSOC) return 0;
  if (!(tile.flags & F_REACHABLE)) return -1;
  if (tile.flags & F_MULTIPLE) return 0;
  return solverAddAssoc(state, tile, tile.dotx, tile.doty);
}

function solverExpandDots(state: GameState, sctx: SolverCtx): number {
  for (let i = 0; i < sctx.sz; i++) state.grid[i].flags &= ~(F_REACHABLE | F_MULTIPLE);

  for (let i = 0; i < state.ndots; i++) solverExpandFromdot(state, state.dots[i], sctx);

  return foreachTile(state, solverExpandPostcb, IMPOSSIBLE_QUITS, sctx);
}

// =============================================================================
// check_complete — faithful port
// =============================================================================

function checkComplete(state: GameState): boolean {
  const w = state.w;
  const h = state.h;

  const dsf = snewDsf(w * h);

  // Build connected components from edges
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y + 1 < h && !(SPACE(state, 2 * x + 1, 2 * y + 2).flags & F_EDGE_SET))
        dsfMerge(dsf, y * w + x, (y + 1) * w + x);
      if (x + 1 < w && !(SPACE(state, 2 * x + 2, 2 * y + 1).flags & F_EDGE_SET))
        dsfMerge(dsf, y * w + x, y * w + (x + 1));
    }
  }

  // Find bounding boxes
  const sqdata: {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
    cx: number;
    cy: number;
    valid: boolean;
  }[] = new Array(w * h);

  for (let i = 0; i < w * h; i++) {
    sqdata[i] = {
      minx: w + 1,
      miny: h + 1,
      maxx: -1,
      maxy: -1,
      cx: 0,
      cy: 0,
      valid: false,
    };
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = dsfCanonify(dsf, y * w + x);
      if (sqdata[i].minx > x) sqdata[i].minx = x;
      if (sqdata[i].maxx < x) sqdata[i].maxx = x;
      if (sqdata[i].miny > y) sqdata[i].miny = y;
      if (sqdata[i].maxy < y) sqdata[i].maxy = y;
      sqdata[i].valid = true;
    }
  }

  // Check for centre of symmetry with dot
  for (let i = 0; i < w * h; i++) {
    if (!sqdata[i].valid) continue;
    sqdata[i].cx = sqdata[i].minx + sqdata[i].maxx + 1;
    sqdata[i].cy = sqdata[i].miny + sqdata[i].maxy + 1;
    const cx = sqdata[i].cx;
    const cy = sqdata[i].cy;
    if (!(SPACE(state, cx, cy).flags & F_DOT)) sqdata[i].valid = false;
    if (
      dsfCanonify(dsf, ((cy - 1) >> 1) * w + ((cx - 1) >> 1)) !== i ||
      dsfCanonify(dsf, (cy >> 1) * w + ((cx - 1) >> 1)) !== i ||
      dsfCanonify(dsf, ((cy - 1) >> 1) * w + (cx >> 1)) !== i ||
      dsfCanonify(dsf, (cy >> 1) * w + (cx >> 1)) !== i
    )
      sqdata[i].valid = false;
  }

  // Extraneous dots
  for (let y = 1; y < state.sy - 1; y++) {
    for (let x = 1; x < state.sx - 1; x++) {
      const sp = SPACE(state, x, y);
      if (sp.flags & F_DOT) {
        for (let cy = (y - 1) >> 1; cy <= y >> 1; cy++) {
          for (let cx = (x - 1) >> 1; cx <= x >> 1; cx++) {
            const i = dsfCanonify(dsf, cy * w + cx);
            if (x !== sqdata[i].cx || y !== sqdata[i].cy) sqdata[i].valid = false;
          }
        }
      }
      if (sp.flags & F_EDGE_SET) {
        const cx1 = (x - 1) >> 1;
        const cx2 = x >> 1;
        const cy1 = (y - 1) >> 1;
        const cy2 = y >> 1;
        const i = dsfCanonify(dsf, cy1 * w + cx1);
        if (i === dsfCanonify(dsf, cy2 * w + cx2)) sqdata[i].valid = false;
      }
    }
  }

  // Rotational symmetry
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = dsfCanonify(dsf, y * w + x);
      const x2 = sqdata[i].cx - 1 - x;
      const y2 = sqdata[i].cy - 1 - y;
      if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h || i !== dsfCanonify(dsf, y2 * w + x2))
        sqdata[i].valid = false;
    }
  }

  // Check all components valid
  for (let i = 0; i < w * h; i++) {
    const ci = dsfCanonify(dsf, i);
    if (!sqdata[ci].valid) return false;
  }
  return true;
}

// =============================================================================
// Solver recursion — faithful port
// =============================================================================

function solverRecurseCb(state: GameState, tile: Space, ctx: any): number {
  const rctx = ctx as { best: Space | null; bestn: number };

  if (tile.flags & F_TILE_ASSOC) return 0;

  let n = 0;
  for (let i = 0; i < state.ndots; i++) {
    if (dotfortile(state, tile, state.dots[i])) n++;
  }
  if (n > rctx.bestn) {
    rctx.bestn = n;
    rctx.best = tile;
  }
  return 0;
}

function solverRecurse(state: GameState, maxdiff: number): number {
  if (solverRecurseDepth >= MAXRECURSE) return DIFF_UNFINISHED;

  const rctx = { best: null as Space | null, bestn: 0 };
  foreachTile(state, solverRecurseCb, 0, rctx);
  if (rctx.bestn === 0) return DIFF_IMPOSSIBLE;

  const gsz = state.sx * state.sy;
  const ingrid: Space[] = state.grid.map((sp) => ({ ...sp }));
  let outgrid: Space[] | null = null;
  let diff = DIFF_IMPOSSIBLE;

  solverRecurseDepth++;

  for (let n = 0; n < state.ndots; n++) {
    // Restore grid
    for (let i = 0; i < gsz; i++) {
      const src = ingrid[i];
      const dst = state.grid[i];
      dst.flags = src.flags;
      dst.dotx = src.dotx;
      dst.doty = src.doty;
      dst.nassoc = src.nassoc;
    }
    gameUpdateDots(state);

    if (!dotfortile(state, rctx.best!, state.dots[n])) continue;

    solverAddAssoc(state, rctx.best!, state.dots[n].x, state.dots[n].y);

    const ret = solverState(state, maxdiff);

    if (diff === DIFF_IMPOSSIBLE && ret !== DIFF_IMPOSSIBLE) {
      outgrid = state.grid.map((sp) => ({ ...sp }));
    }

    if (ret === DIFF_AMBIGUOUS || ret === DIFF_UNFINISHED) diff = ret;
    else if (ret !== DIFF_IMPOSSIBLE) {
      if (diff === DIFF_IMPOSSIBLE) diff = DIFF_UNREASONABLE;
      else diff = DIFF_AMBIGUOUS;
    }

    if (diff === DIFF_AMBIGUOUS || diff === DIFF_UNFINISHED) break;
  }

  solverRecurseDepth--;

  if (outgrid) {
    for (let i = 0; i < gsz; i++) {
      const src = outgrid[i];
      const dst = state.grid[i];
      dst.flags = src.flags;
      dst.dotx = src.dotx;
      dst.doty = src.doty;
      dst.nassoc = src.nassoc;
    }
    gameUpdateDots(state);
  } else {
    // Restore from ingrid
    for (let i = 0; i < gsz; i++) {
      const src = ingrid[i];
      const dst = state.grid[i];
      dst.flags = src.flags;
      dst.dotx = src.dotx;
      dst.doty = src.doty;
      dst.nassoc = src.nassoc;
    }
    gameUpdateDots(state);
  }

  return diff;
}

function solverState(state: GameState, maxdiff: number): number {
  const sctx = newSolver(state);
  let diff = DIFF_NORMAL;
  let ret: number;

  ret = solverObvious(state);
  if (ret < 0) return DIFF_IMPOSSIBLE;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    ret = foreachEdge(state, solverLinesOppositeCb, IMPOSSIBLE_QUITS, sctx);
    if (ret < 0) return DIFF_IMPOSSIBLE;
    if (ret > 0) {
      diff = Math.max(diff, DIFF_NORMAL);
      continue;
    }

    ret = foreachTile(state, solverSpacesOneposs, IMPOSSIBLE_QUITS, sctx);
    if (ret < 0) return DIFF_IMPOSSIBLE;
    if (ret > 0) {
      diff = Math.max(diff, DIFF_NORMAL);
      continue;
    }

    ret = solverExpandDots(state, sctx);
    if (ret < 0) return DIFF_IMPOSSIBLE;
    if (ret > 0) {
      diff = Math.max(diff, DIFF_NORMAL);
      continue;
    }

    if (maxdiff <= DIFF_NORMAL) break;

    // No more deductions
    break;
  }

  if (checkComplete(state)) return diff;

  return maxdiff >= DIFF_UNREASONABLE ? solverRecurse(state, maxdiff) : DIFF_UNFINISHED;
}

// =============================================================================
// new_game_desc — faithful port (main generation entry)
// =============================================================================

function newGameDesc(w: number, h: number, rs: RandomState): GameState {
  const state = blankGame(w, h);
  const sz = state.sx * state.sy;
  const scratch: number[] = new Array(sz);
  for (let i = 0; i < sz; i++) scratch[i] = i;

  let ntries = 0;
  const targetDiff = DIFF_NORMAL;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    clearGame(state, true);
    ntries++;

    generatePass(state, rs, scratch, 100, GP_DOTS);
    gameUpdateDots(state);

    // Outline all tiles
    for (let i = 0; i < sz; i++) {
      if (state.grid[i].type === s_tile) outlineTileFordot(state, state.grid[i], true);
    }

    const cc = checkComplete(state);
    if (!cc) continue; // Should not happen but retry if so

    // Test solubility
    const copy = dupGame(state);
    clearGame(copy, false);
    const diff = solverState(copy, targetDiff);

    if (diff === DIFF_IMPOSSIBLE) continue;
    if (diff !== targetDiff) {
      if (diff > targetDiff || ntries < MAXTRIES) continue;
    }

    // Success — state has the full solution with edges
    return state;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Galaxies puzzle.
 *
 * @param w - User-visible grid width (e.g. 7)
 * @param h - User-visible grid height (e.g. 7)
 * @param seed - Optional PRNG seed for deterministic generation
 * @returns A GalaxiesPuzzle with dot positions and solution edges
 */
export function generateGalaxiesPuzzle(w: number, h: number, seed?: number): GalaxiesPuzzle {
  if (w < 3 || h < 3) throw new RangeError('Width and height must both be at least 3');

  const rs = new RandomState(seed);
  const state = newGameDesc(w, h, rs);

  // Extract dots
  const dots: { x: number; y: number }[] = [];
  for (const d of state.dots) {
    dots.push({ x: d.x, y: d.y });
  }

  // Extract edge flags
  const edges: boolean[] = new Array(state.sx * state.sy).fill(false);
  for (let i = 0; i < state.grid.length; i++) {
    if (state.grid[i].type === s_edge && state.grid[i].flags & F_EDGE_SET) {
      edges[i] = true;
    }
  }

  return { w, h, dots, edges, sx: state.sx, sy: state.sy };
}
