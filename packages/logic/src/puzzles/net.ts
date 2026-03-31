// @ts-nocheck
/**
 * Net puzzle generator and solver
 *
 * Faithful port of Simon Tatham's net.c + dsf.c + tree234.c
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=net.c
 *
 * Generates uniquely-solvable Net puzzles: a grid of tiles with pipe
 * segments where each tile can be rotated. Goal is to connect every tile
 * to the source with no loops.
 */

// =============================================================================
// Public types
// =============================================================================

export interface NetPuzzle {
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
  /** Source tile position: { x, y } */
  source: { x: number; y: number };
}

// =============================================================================
// Direction Constants — matching net.c
// =============================================================================

const R = 0x01;
const U = 0x02;
const L = 0x04;
const D = 0x08;
const LOCKED = 0x10;
const _ACTIVE = 0x20;

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

/** Rotate by n quarter-turns anticlockwise */
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

/** Offset with wrapping */
function OFFSETWH(x1: number, y1: number, dir: number, w: number, h: number): [number, number] {
  return [(x1 + w + XD(dir)) % w, (y1 + h + YD(dir)) % h];
}

// =============================================================================
// PRNG — matching puzzles.c random_state (Alea-like is fine for puzzle gen)
// =============================================================================

function random_upto(n: number): number {
  return Math.floor(Math.random() * n);
}

/** Fisher-Yates shuffle (matches puzzles.c shuffle) */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = random_upto(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// =============================================================================
// Disjoint Set Forest — faithful port of dsf.c
// =============================================================================

function dsf_init(size: number): Int32Array {
  const dsf = new Int32Array(size);
  for (let i = 0; i < size; i++) dsf[i] = 6; // root, size=1
  return dsf;
}

function edsf_canonify(dsf: Int32Array, index: number): { canonical: number; inverse: number } {
  const start_index = index;
  let inverse = 0;

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

  return { canonical: canonical_index, inverse };
}

function dsf_canonify(dsf: Int32Array, index: number): number {
  return edsf_canonify(dsf, index).canonical;
}

function dsf_merge(dsf: Int32Array, v1: number, v2: number): void {
  const r1 = edsf_canonify(dsf, v1);
  v1 = r1.canonical;
  let _inv = r1.inverse;
  const r2 = edsf_canonify(dsf, v2);
  v2 = r2.canonical;
  _inv ^= r2.inverse;

  if (v1 === v2) return;

  // Make smaller index the canonical element
  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | 0; // inverse=false for simple merge
}

function _dsf_size(dsf: Int32Array, index: number): number {
  return dsf[dsf_canonify(dsf, index)] >> 2;
}

// =============================================================================
// Tree234 — simplified port of tree234.c
//
// We only need: newtree234, add234, find234, del234, delpos234, count234,
// freetree234. For the Net generator, the tree stores {x, y, direction}
// objects sorted by xyd_cmp.
//
// Instead of porting the full 2-3-4 tree, we use a sorted array with
// binary search — functionally identical for the sizes involved in Net
// generation (max ~w*h*4 elements, typically <1000).
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

  /** Binary search: returns index where item is or should be inserted */
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
    if (found) return this.items[index]; // already exists
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

  index(i: number): Xyd | null {
    return i >= 0 && i < this.items.length ? this.items[i] : null;
  }
}

// =============================================================================
// Todo list — faithful port from net.c
// =============================================================================

class Todo {
  marked: Uint8Array;
  buffer: Int32Array;
  head: number;
  tail: number;
  buflen: number;

  constructor(maxsize: number) {
    this.marked = new Uint8Array(maxsize);
    this.buflen = maxsize + 1;
    this.buffer = new Int32Array(this.buflen);
    this.head = 0;
    this.tail = 0;
  }

  add(index: number): void {
    if (this.marked[index]) return;
    this.marked[index] = 1;
    this.buffer[this.tail++] = index;
    if (this.tail === this.buflen) this.tail = 0;
  }

  get(): number {
    if (this.head === this.tail) return -1;
    const ret = this.buffer[this.head++];
    if (this.head === this.buflen) this.head = 0;
    this.marked[ret] = 0;
    return ret;
  }
}

// =============================================================================
// Solver — faithful port of net_solver from net.c
// =============================================================================

function net_solver(
  w: number,
  h: number,
  tiles: Uint8Array,
  barriers: Uint8Array | null,
  wrapping: boolean,
): boolean {
  /*
   * tilestate stores possible orientations per tile.
   * Indexed as tilestate[(y*w+x)*4 + j], 255 = ruled out.
   */
  const tilestate = new Uint8Array(w * h * 4);
  let area = 0;
  for (let i = 0; i < w * h; i++) {
    tilestate[i * 4] = tiles[i] & 0x0f;
    for (let j = 1; j < 4; j++) {
      if (tilestate[i * 4 + j - 1] === 255 || A(tilestate[i * 4 + j - 1]) === tilestate[i * 4]) {
        tilestate[i * 4 + j] = 255;
      } else {
        tilestate[i * 4 + j] = A(tilestate[i * 4 + j - 1]);
      }
    }
    if (tiles[i] !== 0) area++;
  }

  /*
   * edgestate: 0=unknown, 1=open (connected), 2=closed.
   * Indexed as edgestate[(y*w+x)*5 + d] where d is 1,2,4,8.
   */
  const edgeLen = (w * h - 1) * 5 + 9;
  const edgestate = new Uint8Array(edgeLen);

  /*
   * deadends: tracks dead-end sizes.
   */
  const deadends = new Int32Array(edgeLen);
  for (let i = 0; i < edgeLen; i++) deadends[i] = area + 1;

  const equivalence = dsf_init(w * h);

  // Non-wrapping: close border edges
  if (!wrapping) {
    for (let i = 0; i < w; i++) {
      edgestate[i * 5 + 2] = 2; // top row, U
      edgestate[((h - 1) * w + i) * 5 + 8] = 2; // bottom row, D
    }
    for (let i = 0; i < h; i++) {
      edgestate[(i * w + w - 1) * 5 + 1] = 2; // right col, R
      edgestate[i * w * 5 + 4] = 2; // left col, L
    }
  }

  // Close barrier edges
  if (barriers) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let d = 1; d <= 8; d += d) {
          if (barriers[y * w + x] & d) {
            const [x2, y2] = OFFSETWH(x, y, d, w, h);
            edgestate[(y * w + x) * 5 + d] = 2;
            edgestate[(y2 * w + x2) * 5 + F(d)] = 2;
          }
        }
      }
    }
  }

  const todo = new Todo(w * h);

  let done_something = true;
  while (true) {
    let index = todo.get();
    if (index === -1) {
      if (!done_something) break;
      for (let i = 0; i < w * h; i++) todo.add(i);
      done_something = false;
      index = todo.get();
    }

    const y = Math.floor(index / w);
    const x = index % w;

    const ourclass = dsf_canonify(equivalence, y * w + x);
    const deadendmax = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    let i: number, j: number;
    for (i = j = 0; i < 4 && tilestate[(y * w + x) * 4 + i] !== 255; i++) {
      let valid = true;
      let nnondeadends = 0;
      let deadendtotal = 0;
      const nondeadends: number[] = [];
      const equiv: number[] = [ourclass];
      let nequiv = 1;
      const val = tilestate[(y * w + x) * 4 + i];

      for (let d = 1; d <= 8; d += d) {
        // Rule out orientation if it conflicts with known edges
        if (
          (edgestate[(y * w + x) * 5 + d] === 1 && !(val & d)) ||
          (edgestate[(y * w + x) * 5 + d] === 2 && val & d)
        ) {
          valid = false;
        }

        if (val & d) {
          // Dead-end statistics
          if (deadends[(y * w + x) * 5 + d] <= area) {
            deadendtotal += deadends[(y * w + x) * 5 + d];
          } else {
            nondeadends[nnondeadends++] = d;
          }

          // Loop avoidance
          if (edgestate[(y * w + x) * 5 + d] === 0) {
            const [x2, y2] = OFFSETWH(x, y, d, w, h);
            const c = dsf_canonify(equivalence, y2 * w + x2);
            let k: number;
            for (k = 0; k < nequiv; k++) {
              if (c === equiv[k]) break;
            }
            if (k === nequiv) {
              equiv[nequiv++] = c;
            } else {
              valid = false;
            }
          }
        }
      }

      if (nnondeadends === 0) {
        if (deadendtotal > 0 && deadendtotal + 1 < area) valid = false;
      } else if (nnondeadends === 1) {
        deadendtotal++;
        if (deadendmax[nondeadends[0]] < deadendtotal) {
          deadendmax[nondeadends[0]] = deadendtotal;
        }
      } else {
        for (let k = 0; k < nnondeadends; k++) {
          deadendmax[nondeadends[k]] = area + 1;
        }
      }

      if (valid) {
        tilestate[(y * w + x) * 4 + j++] = val;
      }
    }

    if (j === 0) return false; // contradiction

    if (j < i) {
      done_something = true;
      while (j < 4) tilestate[(y * w + x) * 4 + j++] = 255;
    }

    // Deduce edges
    {
      let a = 0x0f;
      let o = 0;
      for (let ii = 0; ii < 4 && tilestate[(y * w + x) * 4 + ii] !== 255; ii++) {
        a &= tilestate[(y * w + x) * 4 + ii];
        o |= tilestate[(y * w + x) * 4 + ii];
      }
      for (let d = 1; d <= 8; d += d) {
        if (edgestate[(y * w + x) * 5 + d] === 0) {
          const [x2, y2] = OFFSETWH(x, y, d, w, h);
          const d2 = F(d);
          if (a & d) {
            edgestate[(y * w + x) * 5 + d] = 1;
            edgestate[(y2 * w + x2) * 5 + d2] = 1;
            dsf_merge(equivalence, y * w + x, y2 * w + x2);
            done_something = true;
            todo.add(y2 * w + x2);
          } else if (!(o & d)) {
            edgestate[(y * w + x) * 5 + d] = 2;
            edgestate[(y2 * w + x2) * 5 + d2] = 2;
            done_something = true;
            todo.add(y2 * w + x2);
          }
        }
      }
    }

    // Dead-end propagation
    for (let d = 1; d <= 8; d += d) {
      const [x2, y2] = OFFSETWH(x, y, d, w, h);
      const d2 = F(d);
      if (deadendmax[d] > 0 && deadends[(y2 * w + x2) * 5 + d2] > deadendmax[d]) {
        deadends[(y2 * w + x2) * 5 + d2] = deadendmax[d];
        done_something = true;
        todo.add(y2 * w + x2);
      }
    }
  }

  // Mark completely determined tiles as locked
  let allDetermined = true;
  for (let i = 0; i < w * h; i++) {
    if (tilestate[i * 4 + 1] === 255) {
      tiles[i] = tilestate[i * 4] | LOCKED;
    } else {
      tiles[i] &= ~LOCKED;
      allDetermined = false;
    }
  }

  return allDetermined;
}

// =============================================================================
// Perturb — faithful port from net.c
// =============================================================================

function perturb(
  w: number,
  h: number,
  tiles: Uint8Array,
  wrapping: boolean,
  startx: number,
  starty: number,
  startd: number,
): void {
  let nperim = 0;
  const perimeter: Xyd[] = [];
  let x = startx;
  let y = starty;
  let d = startd;

  // Trace perimeter of ambiguous area
  do {
    perimeter.push({ x, y, direction: d });
    nperim++;

    // Try turning left (anticlockwise)
    const d2 = A(d);
    let [x2, y2] = OFFSETWH(x, y, d2, w, h);
    if (
      (!wrapping && (Math.abs(x2 - x) > 1 || Math.abs(y2 - y) > 1)) ||
      tiles[y2 * w + x2] & LOCKED
    ) {
      d = d2;
    } else {
      x = x2;
      y = y2;
      [x2, y2] = OFFSETWH(x, y, d, w, h);
      if (
        (wrapping || (Math.abs(x2 - x) <= 1 && Math.abs(y2 - y) <= 1)) &&
        !(tiles[y2 * w + x2] & LOCKED)
      ) {
        x = x2;
        y = y2;
        d = C(d);
      }
    }
  } while (x !== startx || y !== starty || d !== startd);

  // Search for a join we can make
  const perim2 = perimeter.slice();
  shuffle(perim2);

  let joinFound = false;
  let jx = 0,
    jy = 0,
    jd = 0;
  for (let i = 0; i < nperim; i++) {
    x = perim2[i].x;
    y = perim2[i].y;
    d = perim2[i].direction;

    const [x2, y2] = OFFSETWH(x, y, d, w, h);
    if (!wrapping && (Math.abs(x2 - x) > 1 || Math.abs(y2 - y) > 1)) continue;
    if (tiles[y * w + x] & d) continue;
    if (((tiles[y * w + x] | d) & 15) === 15) continue;
    if (((tiles[y2 * w + x2] | F(d)) & 15) === 15) continue;

    // Make the new link
    tiles[y * w + x] |= d;
    tiles[y2 * w + x2] |= F(d);
    jx = x;
    jy = y;
    jd = d;
    joinFound = true;
    break;
  }

  if (!joinFound) return;

  // Find the loop created by the new link using two parallel searches
  x = jx;
  y = jy;
  d = jd;

  interface LoopPos {
    x: number;
    y: number;
    direction: number;
  }

  const loop: Xyd[][] = [[], []];
  const looppos: LoopPos[] = [
    { x, y, direction: d },
    { x, y, direction: d },
  ];

  let _loopComplete = -1;

  outer: while (true) {
    for (let i = 0; i < 2; i++) {
      x = looppos[i].x;
      y = looppos[i].y;
      d = looppos[i].direction;

      const [x2, y2] = OFFSETWH(x, y, d, w, h);

      // Add/remove path segment
      if (
        loop[i].length > 0 &&
        loop[i][loop[i].length - 1].x === x2 &&
        loop[i][loop[i].length - 1].y === y2 &&
        loop[i][loop[i].length - 1].direction === F(d)
      ) {
        loop[i].pop();
      } else {
        loop[i].push({ x, y, direction: d });
      }

      d = F(d);
      for (let j = 0; j < 4; j++) {
        if (i === 0) d = A(d);
        else d = C(d);
        if (tiles[y2 * w + x2] & d) {
          looppos[i] = { x: x2, y: y2, direction: d };
          break;
        }
      }

      if (loop[i].length > 0) {
        if (
          looppos[i].x === loop[i][0].x &&
          looppos[i].y === loop[i][0].y &&
          looppos[i].direction === loop[i][0].direction
        ) {
          // Found loop; sever at random point (not the join point)
          const j = random_upto(loop[i].length - 1) + 1;
          const sx = loop[i][j].x;
          const sy = loop[i][j].y;
          const sd = loop[i][j].direction;
          const [sx2, sy2] = OFFSETWH(sx, sy, sd, w, h);
          tiles[sy * w + sx] &= ~sd;
          tiles[sy2 * w + sx2] &= ~F(sd);
          _loopComplete = i;
          break outer;
        }
      }
    }
  }

  // Lock the disputed section
  perimeter.sort((a, b) => xyd_cmp(a, b));
  let px = -1;
  let py = -1;
  for (let i = 0; i <= nperim; i++) {
    if (i === nperim || perimeter[i].x > px) {
      if (px !== -1) {
        while (py < h) {
          tiles[py * w + px] |= LOCKED;
          py++;
        }
        px = -1;
        py = -1;
      }
      if (i === nperim) break;
      px = perimeter[i].x;
      py = 0;
    }

    if (perimeter[i].direction === U) {
      px = perimeter[i].x;
      py = perimeter[i].y;
    } else if (perimeter[i].direction === D) {
      while (py <= perimeter[i].y) {
        tiles[py * w + px] |= LOCKED;
        py++;
      }
      px = -1;
      py = -1;
    }
  }
}

// =============================================================================
// Loop detection — faithful port of compute_loops_inner from net.c
// =============================================================================

function compute_loops_inner(
  w: number,
  h: number,
  _wrapping: boolean,
  tiles: Uint8Array,
  barriers: Uint8Array | null,
): Int32Array {
  const dsf = dsf_init(w * h * 8);

  // BEFORE/AFTER encode the clockwise/anticlockwise side of each edge
  function BEFORE(dir: number): number {
    return dir === R ? 7 : dir === U ? 1 : dir === L ? 3 : 5;
  }
  function AFTER(dir: number): number {
    return dir === R ? 0 : dir === U ? 2 : dir === L ? 4 : 6;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x];
      for (let dir = 1; dir < 0x10; dir <<= 1) {
        // Unify around face-centre vertex
        dsf_merge(dsf, (y * w + x) * 8 + AFTER(C(dir)), (y * w + x) * 8 + BEFORE(dir));

        if (tile & dir) {
          const [x1, y1] = OFFSETWH(x, y, dir, w, h);

          if ((barriers && barriers[y * w + x] & dir) || !(tiles[y1 * w + x1] & F(dir))) {
            // Stub edge
            dsf_merge(dsf, (y * w + x) * 8 + BEFORE(dir), (y * w + x) * 8 + AFTER(dir));
          } else {
            // Connected edge
            dsf_merge(dsf, (y * w + x) * 8 + BEFORE(dir), (y1 * w + x1) * 8 + AFTER(F(dir)));
            dsf_merge(dsf, (y * w + x) * 8 + AFTER(dir), (y1 * w + x1) * 8 + BEFORE(F(dir)));
          }
        } else {
          // Missing edge: unify both sides
          dsf_merge(dsf, (y * w + x) * 8 + BEFORE(dir), (y * w + x) * 8 + AFTER(dir));
        }
      }
    }
  }

  const loops = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x];
      let flags = 0;
      for (let dir = 1; dir < 0x10; dir <<= 1) {
        if (
          tile & dir &&
          dsf_canonify(dsf, (y * w + x) * 8 + BEFORE(dir)) !==
            dsf_canonify(dsf, (y * w + x) * 8 + AFTER(dir))
        ) {
          flags |= dir << 6;
        }
      }
      loops[y * w + x] = flags;
    }
  }

  return loops;
}

// =============================================================================
// Game generation — faithful port of new_game_desc from net.c
// =============================================================================

function generate_net(
  w: number,
  h: number,
  wrapping: boolean,
  unique: boolean,
): { tiles: Uint8Array; solution: Uint8Array; cx: number; cy: number } {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let tiles: Uint8Array;

  begin_generation: while (true) {
    tiles = new Uint8Array(w * h);

    // Build spanning tree from centre using sorted set
    const possibilities = new SortedSet();

    if (cx + 1 < w) possibilities.add({ x: cx, y: cy, direction: R });
    if (cy - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: U });
    if (cx - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: L });
    if (cy + 1 < h) possibilities.add({ x: cx, y: cy, direction: D });

    while (possibilities.count() > 0) {
      const i = random_upto(possibilities.count());
      const xyd = possibilities.delpos(i)!;
      const x1 = xyd.x;
      const y1 = xyd.y;
      const d1 = xyd.direction;

      const [x2, y2] = OFFSETWH(x1, y1, d1, w, h);
      const d2 = F(d1);

      // Make connection (target tile must be unused)
      tiles[y1 * w + x1] |= d1;
      if (tiles[y2 * w + x2] !== 0) continue; // safety check
      tiles[y2 * w + x2] |= d2;

      // If we created a T-piece, remove its last possibility
      if (COUNT(tiles[y1 * w + x1]) === 3) {
        const lastDir = 0x0f ^ tiles[y1 * w + x1];
        possibilities.del({ x: x1, y: y1, direction: lastDir });
      }

      // Remove all possibilities pointing at the newly-used tile
      for (let d = 1; d < 0x10; d <<= 1) {
        const [x3, y3] = OFFSETWH(x2, y2, d, w, h);
        const d3 = F(d);
        possibilities.del({ x: x3, y: y3, direction: d3 });
      }

      // Add new possibilities for moving out of the new tile
      for (let d = 1; d < 0x10; d <<= 1) {
        if (d === d2) continue;

        if (!wrapping) {
          if (d === U && y2 === 0) continue;
          if (d === D && y2 === h - 1) continue;
          if (d === L && x2 === 0) continue;
          if (d === R && x2 === w - 1) continue;
        }

        const [x3, y3] = OFFSETWH(x2, y2, d, w, h);
        if (tiles[y3 * w + x3]) continue; // would create a loop

        possibilities.add({ x: x2, y: y2, direction: d });
      }
    }

    if (unique) {
      let prevn = -1;

      // Run solver to check unique solubility
      const solverTiles = new Uint8Array(tiles);
      while (!net_solver(w, h, solverTiles, null, wrapping)) {
        let n = 0;

        // Find ambiguous sections and perturb them
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x + 1 < w && (solverTiles[y * w + x] ^ solverTiles[y * w + x + 1]) & LOCKED) {
              n++;
              if (solverTiles[y * w + x] & LOCKED) {
                perturb(w, h, solverTiles, wrapping, x + 1, y, L);
              } else {
                perturb(w, h, solverTiles, wrapping, x, y, R);
              }
            }
            if (y + 1 < h && (solverTiles[y * w + x] ^ solverTiles[(y + 1) * w + x]) & LOCKED) {
              n++;
              if (solverTiles[y * w + x] & LOCKED) {
                perturb(w, h, solverTiles, wrapping, x, y + 1, U);
              } else {
                perturb(w, h, solverTiles, wrapping, x, y, D);
              }
            }
          }
        }

        if (prevn !== -1 && prevn <= n) {
          continue begin_generation; // regenerate
        }
        prevn = n;
      }

      // Copy perturbed solution back (strip LOCKED bits)
      for (let i = 0; i < w * h; i++) {
        tiles[i] = solverTiles[i] & ~LOCKED;
      }
    }

    break; // generation successful
  }

  // Save solution
  const solution = new Uint8Array(tiles);

  // Shuffle the grid
  while (true) {
    let prev_loopsquares = w * h + 1;

    // Full shuffle
    shuffle_tiles: while (true) {
      for (let i = 0; i < w * h; i++) {
        const orig = tiles[i];
        const rot = random_upto(4);
        tiles[i] = ROT(orig, rot);
      }

      // Try to fix loops by reshuffling involved squares
      while (true) {
        const loops = compute_loops_inner(w, h, wrapping, tiles, null);
        let this_loopsquares = 0;
        for (let i = 0; i < w * h; i++) {
          if (loops[i]) {
            const orig = tiles[i];
            const rot = random_upto(4);
            tiles[i] = ROT(orig, rot);
            this_loopsquares++;
          }
        }
        if (this_loopsquares > prev_loopsquares) {
          continue shuffle_tiles; // restart full shuffle
        }
        if (this_loopsquares === 0) break;
        prev_loopsquares = this_loopsquares;
      }

      break;
    }

    // Check for mismatches (ensure not already solved)
    let mismatches = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x + 1 < w && (ROT(tiles[y * w + x], 2) ^ tiles[y * w + x + 1]) & L) {
          mismatches++;
        }
        if (y + 1 < h && (ROT(tiles[y * w + x], 2) ^ tiles[(y + 1) * w + x]) & U) {
          mismatches++;
        }
      }
    }

    if (mismatches > 0) break;
  }

  return { tiles, solution, cx, cy };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Net puzzle.
 *
 * @param w Grid width
 * @param h Grid height (defaults to w if omitted)
 * @returns A NetPuzzle with scrambled tiles, solution, and source position.
 */
export function generateNetPuzzle(w: number, h?: number): NetPuzzle {
  const width = w;
  const height = h ?? w;

  if (width <= 0 || height <= 0) {
    throw new Error('Width and height must both be greater than zero');
  }
  if (width <= 1 && height <= 1) {
    throw new Error('At least one of width and height must be greater than one');
  }

  const result = generate_net(width, height, false, true);

  return {
    w: width,
    h: height,
    tiles: Array.from(result.tiles),
    solution: Array.from(result.solution),
    source: { x: result.cx, y: result.cy },
  };
}
