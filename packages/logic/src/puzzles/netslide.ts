// @ts-nocheck
/**
 * Netslide puzzle generator
 *
 * Faithful port of Simon Tatham's netslide.c
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=netslide.c
 *
 * Generates Netslide puzzles: a grid of pipe tiles where you slide entire
 * rows and columns (instead of rotating individual tiles like in Net).
 * Goal: reconnect all tiles to the central source.
 *
 * The grid is generated as a spanning tree from the centre (no full crosses,
 * no loops), then shuffled by random row/column slides, with optional
 * barriers placed on non-connected edges.
 */

// =============================================================================
// Public types
// =============================================================================

export interface NetslidePuzzle {
  /** Grid width */
  w: number;
  /** Grid height */
  h: number;
  /**
   * Shuffled (scrambled) tile grid, flat row-major.
   * Each value is a 4-bit bitmask: R=1, U=2, L=4, D=8.
   */
  tiles: number[];
  /**
   * Solution tile grid, flat row-major.
   * Same encoding as tiles.
   */
  solution: number[];
  /**
   * Barrier grid, flat row-major.
   * Each value is a bitmask of directions where barriers exist.
   * Low nibble: R=1, U=2, L=4, D=8.
   * High nibble: corner flags RU=0x10, UL=0x20, LD=0x40, DR=0x80.
   */
  barriers: number[];
  /** Centre (source) tile position */
  cx: number;
  cy: number;
}

// =============================================================================
// Direction Constants — matching netslide.c
// =============================================================================

const R = 0x01;
const U = 0x02;
const L = 0x04;
const D = 0x08;
const ACTIVE = 0x20;

// Corner flags (go in barriers array) — used implicitly via bit shifts (dir << 4)
// Kept for documentation; values match netslide.c RU/UL/LD/DR.
// const RU = 0x10;
// const UL = 0x20;
// const LD = 0x40;
// const DR = 0x80;

/** Rotate anticlockwise */
function A(x: number): number {
  return ((x & 0x07) << 1) | ((x & 0x08) >> 3);
}

/** Rotate clockwise */
function C(x: number): number {
  return ((x & 0x0e) >> 1) | ((x & 0x01) << 3);
}

/** Flip 180 */
function F(x: number): number {
  return ((x & 0x0c) >> 2) | ((x & 0x03) << 2);
}

/** Rotate by n quarter-turns anticlockwise (kept for completeness with net.c) */
// biome-ignore lint/correctness/noUnusedVariables: faithfully ported from netslide.c
function ROT(x: number, n: number): number {
  const r = n & 3;
  if (r === 0) return x;
  if (r === 1) return A(x);
  if (r === 2) return F(x);
  return C(x);
}

/** X displacement for a direction */
function XD(x: number): number {
  return x === R ? +1 : x === L ? -1 : 0;
}

/** Y displacement for a direction */
function YD(x: number): number {
  return x === D ? +1 : x === U ? -1 : 0;
}

/** Bit count of low 4 bits */
function COUNT(x: number): number {
  return ((x & 0x08) >> 3) + ((x & 0x04) >> 2) + ((x & 0x02) >> 1) + (x & 0x01);
}

// =============================================================================
// PRNG — simple wrapper around Math.random
// =============================================================================

function random_upto(n: number): number {
  return Math.floor(Math.random() * n);
}

// =============================================================================
// Tree234 — sorted array with binary search (same approach as net.ts)
// =============================================================================

interface Xyd {
  x: number;
  y: number;
  direction: number;
}

function xyd_cmp(a: Xyd, b: Xyd): number {
  if (a.x < b.x) return -1;
  if (a.x > b.x) return +1;
  if (a.y < b.y) return -1;
  if (a.y > b.y) return +1;
  if (a.direction < b.direction) return -1;
  if (a.direction > b.direction) return +1;
  return 0;
}

class SortedSet {
  private items: Xyd[] = [];

  count(): number {
    return this.items.length;
  }

  private bsearch(item: Xyd): { found: boolean; index: number } {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const c = xyd_cmp(item, this.items[mid]);
      if (c === 0) return { found: true, index: mid };
      if (c < 0) hi = mid;
      else lo = mid + 1;
    }
    return { found: false, index: lo };
  }

  add(item: Xyd): Xyd {
    const { found, index } = this.bsearch(item);
    if (found) return this.items[index];
    this.items.splice(index, 0, item);
    return item;
  }

  find(item: Xyd): Xyd | null {
    const { found, index } = this.bsearch(item);
    return found ? this.items[index] : null;
  }

  del(item: Xyd): Xyd | null {
    const { found, index } = this.bsearch(item);
    if (!found) return null;
    return this.items.splice(index, 1)[0];
  }

  delpos(index: number): Xyd | null {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }
}

// =============================================================================
// Offset helper — matching netslide.c OFFSET macro
// =============================================================================

function OFFSET(x1: number, y1: number, dir: number, w: number, h: number): [number, number] {
  return [(x1 + w + XD(dir)) % w, (y1 + h + YD(dir)) % h];
}

// =============================================================================
// Slide helpers — faithful port of slide_row_int / slide_col_int
// =============================================================================

// biome-ignore lint/correctness/noUnusedFunctionParameters: h kept for API parity with netslide.c
function slide_row_int(w: number, h: number, tiles: Uint8Array, dir: number, row: number): void {
  let x = dir > 0 ? -1 : w;
  let tx = x + dir;
  let n = w - 1;
  const endtile = tiles[row * w + tx];
  do {
    x = tx;
    tx = (x + dir + w) % w;
    tiles[row * w + x] = tiles[row * w + tx];
  } while (--n > 0);
  tiles[row * w + tx] = endtile;
}

function slide_col_int(w: number, h: number, tiles: Uint8Array, dir: number, col: number): void {
  let y = dir > 0 ? -1 : h;
  let ty = y + dir;
  let n = h - 1;
  const endtile = tiles[ty * w + col];
  do {
    y = ty;
    ty = (y + dir + h) % h;
    tiles[y * w + col] = tiles[ty * w + col];
  } while (--n > 0);
  tiles[ty * w + col] = endtile;
}

// =============================================================================
// Compute active (reachable from centre) — faithful port of compute_active
// =============================================================================

function compute_active(
  w: number,
  h: number,
  cx: number,
  cy: number,
  tiles: Uint8Array,
  barriers: Uint8Array,
  _wrapping: boolean,
  moving_row: number,
  moving_col: number,
): Uint8Array {
  const active = new Uint8Array(w * h);
  const todo = new SortedSet();

  active[cy * w + cx] = ACTIVE;
  todo.add({ x: cx, y: cy, direction: 0 });

  for (let xyd = todo.delpos(0); xyd !== null; xyd = todo.delpos(0)) {
    const x1 = xyd.x;
    const y1 = xyd.y;

    for (let d1 = 1; d1 < 0x10; d1 <<= 1) {
      const [x2, y2] = OFFSET(x1, y1, d1, w, h);
      const d2 = F(d1);

      /*
       * If the next tile in this direction is connected to us,
       * and there isn't a barrier in the way, and it isn't
       * already marked active, and it's not in the moving row/col,
       * then mark it active and add to the examine list.
       */
      if (
        x2 !== moving_col &&
        y2 !== moving_row &&
        tiles[y1 * w + x1] & d1 &&
        tiles[y2 * w + x2] & d2 &&
        !(barriers[y1 * w + x1] & d1) &&
        !active[y2 * w + x2]
      ) {
        active[y2 * w + x2] = ACTIVE;
        todo.add({ x: x2, y: y2, direction: 0 });
      }
    }
  }

  return active;
}

// =============================================================================
// Game generation — faithful port of new_game_desc from netslide.c
// =============================================================================

function generate_netslide(
  w: number,
  h: number,
  wrapping: boolean,
  barrier_probability: number,
  movetarget: number,
): {
  tiles: Uint8Array;
  solution: Uint8Array;
  barriers: Uint8Array;
  cx: number;
  cy: number;
} {
  const tiles = new Uint8Array(w * h);
  const barriers = new Uint8Array(w * h);

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // -------------------------------------------------------------------------
  // Construct the unshuffled grid.
  //
  // Start at the centre point, repeatedly choose a random possibility
  // out of the available ways to extend a used square into an unused one.
  // After extending the third line out of a square, remove the fourth from
  // the possibilities list to avoid any full-cross squares.
  // -------------------------------------------------------------------------

  const possibilities = new SortedSet();

  if (cx + 1 < w) possibilities.add({ x: cx, y: cy, direction: R });
  if (cy - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: U });
  if (cx - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: L });
  if (cy + 1 < h) possibilities.add({ x: cx, y: cy, direction: D });

  while (possibilities.count() > 0) {
    /*
     * Extract a randomly chosen possibility from the list.
     */
    const i = random_upto(possibilities.count());
    const xyd = possibilities.delpos(i)!;
    const x1 = xyd.x;
    const y1 = xyd.y;
    const d1 = xyd.direction;

    const [x2, y2] = OFFSET(x1, y1, d1, w, h);
    const d2 = F(d1);

    /*
     * Make the connection. (We should be moving to an as yet
     * unused tile.)
     */
    tiles[y1 * w + x1] |= d1;
    if (tiles[y2 * w + x2] !== 0) continue; // safety: tile already used
    tiles[y2 * w + x2] |= d2;

    /*
     * If we have created a T-piece, remove its last
     * possibility.
     */
    if (COUNT(tiles[y1 * w + x1]) === 3) {
      const lastDir = 0x0f ^ tiles[y1 * w + x1];
      possibilities.del({ x: x1, y: y1, direction: lastDir });
    }

    /*
     * Remove all other possibilities that were pointing at the
     * tile we've just moved into.
     */
    for (let d = 1; d < 0x10; d <<= 1) {
      const [x3, y3] = OFFSET(x2, y2, d, w, h);
      const d3 = F(d);
      possibilities.del({ x: x3, y: y3, direction: d3 });
    }

    /*
     * Add new possibilities to the list for moving _out_ of
     * the tile we have just moved into.
     */
    for (let d = 1; d < 0x10; d <<= 1) {
      if (d === d2) continue; // we've got this one already

      if (!wrapping) {
        if (d === U && y2 === 0) continue;
        if (d === D && y2 === h - 1) continue;
        if (d === L && x2 === 0) continue;
        if (d === R && x2 === w - 1) continue;
      }

      const [x3, y3] = OFFSET(x2, y2, d, w, h);
      if (tiles[y3 * w + x3]) continue; // this would create a loop

      possibilities.add({ x: x2, y: y2, direction: d });
    }
  }

  // -------------------------------------------------------------------------
  // Compute list of possible barrier locations.
  // -------------------------------------------------------------------------

  const barriertree = new SortedSet();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(tiles[y * w + x] & R) && (wrapping || x < w - 1))
        barriertree.add({ x, y, direction: R });
      if (!(tiles[y * w + x] & D) && (wrapping || y < h - 1))
        barriertree.add({ x, y, direction: D });
    }
  }

  // -------------------------------------------------------------------------
  // Save the unshuffled grid as solution.
  // -------------------------------------------------------------------------

  const solution = new Uint8Array(tiles);

  // -------------------------------------------------------------------------
  // Shuffle the grid via random row/column slides.
  //
  // Faithfully ported from netslide.c: avoids moves that directly undo the
  // previous one, or that repeat so often as to turn into fewer moves.
  // -------------------------------------------------------------------------

  {
    const cols = w - 1;
    const rows = h - 1;
    let moves = movetarget;
    if (!moves) moves = cols * rows * 2;
    let prevdir = -1;
    let prevrowcol = -1;
    let nrepeats = 0;

    for (let i = 0; i < moves; ) /* incremented conditionally */ {
      /* Choose a direction: 0,1,2,3 = up, right, down, left. */
      const dir = random_upto(4);
      let rowcol: number;

      if (dir % 2 === 0) {
        let col = random_upto(cols);
        if (col >= cx) col += 1; /* avoid centre */
        if (col === prevrowcol) {
          if (dir === 2 - prevdir) continue; /* undoes last move */
          else if (dir === prevdir && (nrepeats + 1) * 2 > h) continue; /* makes fewer moves */
        }
        slide_col_int(w, h, tiles, 1 - dir, col);
        rowcol = col;
      } else {
        let row = random_upto(rows);
        if (row >= cy) row += 1; /* avoid centre */
        if (row === prevrowcol) {
          if (dir === 4 - prevdir) continue; /* undoes last move */
          else if (dir === prevdir && (nrepeats + 1) * 2 > w) continue; /* makes fewer moves */
        }
        slide_row_int(w, h, tiles, 2 - dir, row);
        rowcol = row;
      }

      if (dir === prevdir && rowcol === prevrowcol) nrepeats++;
      else nrepeats = 1;

      prevdir = dir;
      prevrowcol = rowcol;
      i++; /* if we got here, the move was accepted */
    }
  }

  // -------------------------------------------------------------------------
  // Choose barrier locations.
  //
  // Done _after_ shuffling so that changing the barrier rate with the same
  // seed gives the same shuffled grid with only different barriers.
  // -------------------------------------------------------------------------

  let nbarriers = Math.floor(barrier_probability * barriertree.count());
  if (nbarriers < 0) nbarriers = 0;
  if (nbarriers > barriertree.count()) nbarriers = barriertree.count();

  while (nbarriers > 0) {
    const i = random_upto(barriertree.count());
    const xyd = barriertree.delpos(i)!;

    const x1 = xyd.x;
    const y1 = xyd.y;
    const d1 = xyd.direction;

    const [x2, y2] = OFFSET(x1, y1, d1, w, h);
    const d2 = F(d1);

    barriers[y1 * w + x1] |= d1;
    barriers[y2 * w + x2] |= d2;

    nbarriers--;
  }

  // -------------------------------------------------------------------------
  // Set up border barriers if non-wrapping.
  // (From new_game in netslide.c)
  // -------------------------------------------------------------------------

  if (!wrapping) {
    for (let x = 0; x < w; x++) {
      barriers[0 * w + x] |= U;
      barriers[(h - 1) * w + x] |= D;
    }
    for (let y = 0; y < h; y++) {
      barriers[y * w + 0] |= L;
      barriers[y * w + (w - 1)] |= R;
    }
  }

  // -------------------------------------------------------------------------
  // Set up barrier corner flags (for pretty drawing).
  // (From new_game in netslide.c)
  // -------------------------------------------------------------------------

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let dir = 1; dir < 0x10; dir <<= 1) {
        const dir2 = A(dir);

        if (!(barriers[y * w + x] & dir)) continue;

        let corner = false;

        if (barriers[y * w + x] & dir2) corner = true;

        const x1 = x + XD(dir);
        const y1 = y + YD(dir);
        if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h && barriers[y1 * w + x1] & dir2) corner = true;

        const x2 = x + XD(dir2);
        const y2 = y + YD(dir2);
        if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && barriers[y2 * w + x2] & dir) corner = true;

        if (corner) {
          barriers[y * w + x] |= dir << 4;
          if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) barriers[y1 * w + x1] |= A(dir) << 4;
          if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h) barriers[y2 * w + x2] |= C(dir) << 4;
          const x3 = x + XD(dir) + XD(dir2);
          const y3 = y + YD(dir) + YD(dir2);
          if (x3 >= 0 && x3 < w && y3 >= 0 && y3 < h) barriers[y3 * w + x3] |= F(dir) << 4;
        }
      }
    }
  }

  return { tiles, solution, barriers, cx, cy };
}

// =============================================================================
// Public helpers — slide and check completion (for UI use)
// =============================================================================

/**
 * Slide a row left (dir=-1) or right (dir=+1).
 * Mutates the tiles array in place.
 */
export function slideRow(tiles: number[], w: number, h: number, dir: number, row: number): void {
  const buf = new Uint8Array(tiles);
  slide_row_int(w, h, buf, dir, row);
  for (let i = 0; i < w * h; i++) tiles[i] = buf[i];
}

/**
 * Slide a column up (dir=-1) or down (dir=+1).
 * Mutates the tiles array in place.
 */
export function slideCol(tiles: number[], w: number, h: number, dir: number, col: number): void {
  const buf = new Uint8Array(tiles);
  slide_col_int(w, h, buf, dir, col);
  for (let i = 0; i < w * h; i++) tiles[i] = buf[i];
}

/**
 * Compute which tiles are reachable from the centre (active/connected).
 * Returns an array of booleans, flat row-major.
 */
export function computeActive(
  w: number,
  h: number,
  cx: number,
  cy: number,
  tiles: number[],
  barriers: number[],
  wrapping: boolean,
): boolean[] {
  const tilesBuf = new Uint8Array(tiles);
  const barriersBuf = new Uint8Array(barriers);
  const active = compute_active(w, h, cx, cy, tilesBuf, barriersBuf, wrapping, -1, -1);
  const result: boolean[] = new Array(w * h);
  for (let i = 0; i < w * h; i++) result[i] = active[i] !== 0;
  return result;
}

/**
 * Check if all tiles are connected (puzzle is solved).
 */
export function isComplete(
  w: number,
  h: number,
  cx: number,
  cy: number,
  tiles: number[],
  barriers: number[],
  wrapping: boolean,
): boolean {
  const active = computeActive(w, h, cx, cy, tiles, barriers, wrapping);
  return active.every((v) => v);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Netslide puzzle.
 *
 * @param w Grid width (must be > 1)
 * @param h Grid height (must be > 1, defaults to w if omitted)
 * @param options Optional: wrapping (default false), barrierProbability (0-1, default 1.0)
 * @returns A NetslidePuzzle with scrambled tiles, solution, barriers, and centre position.
 */
export function generateNetslidePuzzle(
  w: number,
  h?: number,
  options?: {
    wrapping?: boolean;
    barrierProbability?: number;
    movetarget?: number;
  },
): NetslidePuzzle {
  const width = w;
  const height = h ?? w;
  const wrapping = options?.wrapping ?? false;
  const barrier_probability = options?.barrierProbability ?? 1.0;
  const movetarget = options?.movetarget ?? 0;

  if (width <= 1 || height <= 1) {
    throw new Error('Width and height must both be greater than one');
  }

  const result = generate_netslide(width, height, wrapping, barrier_probability, movetarget);

  return {
    w: width,
    h: height,
    tiles: Array.from(result.tiles),
    solution: Array.from(result.solution),
    barriers: Array.from(result.barriers),
    cx: result.cx,
    cy: result.cy,
  };
}
