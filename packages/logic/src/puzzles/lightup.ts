// @ts-nocheck — Faithful port from C with array accesses that are always valid at runtime
/**
 * Light Up (Akari) puzzle generator — faithful port of Simon Tatham's lightup.c
 *
 * Place light bulbs on a grid so that:
 *   - Every non-black cell is illuminated (bulbs shine in 4 directions until hitting a wall/edge)
 *   - No two bulbs see each other
 *   - Numbered black cells have exactly that many adjacent bulbs
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=lightup.c
 * License: MIT
 */

// =============================================================================
// Public types
// =============================================================================

export interface LightUpPuzzle {
  /** Grid width */
  w: number;
  /** Grid height */
  h: number;
  /**
   * Flat row-major grid (w*h).
   * -1 = black (no number), 0-4 = black with number, 5 = empty white cell
   */
  grid: number[];
  /**
   * Solution: flat row-major, true = light here
   */
  solution: boolean[];
}

/** Cell values in the public grid */
export const CELL_EMPTY = 5;
export const CELL_BLACK = -1;
// 0..4 = numbered black cells

// =============================================================================
// Constants — matching lightup.c
// =============================================================================

const F_BLACK = 1;
const F_NUMBERED = 2;
const F_NUMBERUSED = 4;
const F_IMPOSSIBLE = 8;
const F_LIGHT = 16;
const F_MARK = 32;

const SYMM_NONE = 0;
const SYMM_REF2 = 1;
const SYMM_ROT2 = 2;
const SYMM_REF4 = 3;
const SYMM_ROT4 = 4;

const DIFFCOUNT = 2;

const F_SOLVE_FORCEUNIQUE = 1;
const F_SOLVE_DISCOUNTSETS = 2;
const F_SOLVE_ALLOWRECURSE = 4;

const MAXRECURSE = 5;
const MAX_GRIDGEN_TRIES = 20;

// =============================================================================
// RNG
// =============================================================================

function randomUpto(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// =============================================================================
// Combinatorics — faithful port of combi.c
// =============================================================================

interface CombiCtx {
  r: number;
  n: number;
  total: number;
  nleft: number;
  a: number[];
}

function factx(x: number, y: number): number {
  let acc = 1;
  for (let i = y; i <= x; i++) acc *= i;
  return acc;
}

function newCombi(r: number, n: number): CombiCtx {
  const nfr = factx(n, r + 1);
  const nrf = factx(n - r, 1);
  const total = Math.floor(nfr / nrf);
  const a = new Array(r);
  for (let i = 0; i < r; i++) a[i] = i;
  return { r, n, total, nleft: total, a };
}

function nextCombi(combi: CombiCtx): boolean {
  const { r, n, a } = combi;
  if (combi.nleft === combi.total) {
    combi.nleft--;
    return true;
  }
  if (combi.nleft <= 0) return false;

  let i = r - 1;
  while (a[i] === n - r + i) i--;
  a[i] += 1;
  for (let j = i + 1; j < r; j++) a[j] = a[i] + j - i;

  combi.nleft--;
  return true;
}

// =============================================================================
// Game state — matching struct game_state
// =============================================================================

interface GameState {
  w: number;
  h: number;
  nlights: number;
  lights: number[]; // For black: number constraint. For white: lit count.
  flags: number[]; // size w*h
}

function GRID(gs: GameState, grid: 'lights' | 'flags', x: number, y: number): number {
  return gs[grid][y * gs.w + x];
}

function SETGRID(gs: GameState, grid: 'lights' | 'flags', x: number, y: number, val: number): void {
  gs[grid][y * gs.w + x] = val;
}

function ORGRID(gs: GameState, grid: 'lights' | 'flags', x: number, y: number, val: number): void {
  gs[grid][y * gs.w + x] |= val;
}

function ANDGRID(gs: GameState, grid: 'lights' | 'flags', x: number, y: number, val: number): void {
  gs[grid][y * gs.w + x] &= val;
}

function ADDGRID(gs: GameState, grid: 'lights' | 'flags', x: number, y: number, val: number): void {
  gs[grid][y * gs.w + x] += val;
}

// =============================================================================
// Surrounds — matching struct surrounds
// =============================================================================

interface SurroundPoint {
  x: number;
  y: number;
  f: number;
}

interface Surrounds {
  points: SurroundPoint[];
  npoints: number;
}

function getSurrounds(state: GameState, ox: number, oy: number): Surrounds {
  const s: Surrounds = { points: [], npoints: 0 };
  if (ox > 0) {
    s.points[s.npoints] = { x: ox - 1, y: oy, f: 0 };
    s.npoints++;
  }
  if (ox < state.w - 1) {
    s.points[s.npoints] = { x: ox + 1, y: oy, f: 0 };
    s.npoints++;
  }
  if (oy > 0) {
    s.points[s.npoints] = { x: ox, y: oy - 1, f: 0 };
    s.npoints++;
  }
  if (oy < state.h - 1) {
    s.points[s.npoints] = { x: ox, y: oy + 1, f: 0 };
    s.npoints++;
  }
  return s;
}

// =============================================================================
// ll_data — light list data
// =============================================================================

interface LLData {
  ox: number;
  oy: number;
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
  includeOrigin: boolean;
}

/** Execute callback for each cell that would be lit by a light at (ox,oy) */
function forEachLit(lld: LLData, cb: (lx: number, ly: number) => void): void {
  // Horizontal sweep
  const ly1 = lld.oy;
  for (let lx = lld.minx; lx <= lld.maxx; lx++) {
    if (lx === lld.ox) continue;
    cb(lx, ly1);
  }
  // Vertical sweep
  const lx1 = lld.ox;
  for (let ly = lld.miny; ly <= lld.maxy; ly++) {
    if (!lld.includeOrigin && ly === lld.oy) continue;
    cb(lx1, ly);
  }
}

// =============================================================================
// State construction helpers
// =============================================================================

function newState(w: number, h: number): GameState {
  const n = w * h;
  return {
    w,
    h,
    nlights: 0,
    lights: new Array(n).fill(0),
    flags: new Array(n).fill(0),
  };
}

function dupGame(state: GameState): GameState {
  return {
    w: state.w,
    h: state.h,
    nlights: state.nlights,
    lights: state.lights.slice(),
    flags: state.flags.slice(),
  };
}

// =============================================================================
// Completion test routines
// =============================================================================

function gridLit(state: GameState): boolean {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (GRID(state, 'flags', x, y) & F_BLACK) continue;
      if (GRID(state, 'lights', x, y) === 0) return false;
    }
  }
  return true;
}

function gridOverlap(state: GameState): boolean {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (!(GRID(state, 'flags', x, y) & F_LIGHT)) continue;
      if (GRID(state, 'lights', x, y) > 1) return true;
    }
  }
  return false;
}

function numberCorrect(state: GameState, x: number, y: number): boolean {
  const s = getSurrounds(state, x, y);
  let n = 0;
  const lights = GRID(state, 'lights', x, y);
  for (let i = 0; i < s.npoints; i++) {
    if (GRID(state, 'flags', s.points[i].x, s.points[i].y) & F_LIGHT) n++;
  }
  return n === lights;
}

function gridAddsup(state: GameState): boolean {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (!(GRID(state, 'flags', x, y) & F_NUMBERED)) continue;
      if (!numberCorrect(state, x, y)) return false;
    }
  }
  return true;
}

function gridCorrect(state: GameState): boolean {
  return gridLit(state) && !gridOverlap(state) && gridAddsup(state);
}

// =============================================================================
// Board setup — blacks, lights, numbers
// =============================================================================

function cleanBoard(state: GameState, leaveBlacks: boolean): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (leaveBlacks) ANDGRID(state, 'flags', x, y, F_BLACK);
      else SETGRID(state, 'flags', x, y, 0);
      SETGRID(state, 'lights', x, y, 0);
    }
  }
  state.nlights = 0;
}

function setBlacks(state: GameState, w: number, h: number, blackpc: number, symm: number): void {
  let degree = 0,
    rotate = 0;
  const wodd = w % 2 ? 1 : 0;
  const hodd = h % 2 ? 1 : 0;

  switch (symm) {
    case SYMM_NONE:
      degree = 1;
      rotate = 0;
      break;
    case SYMM_ROT2:
      degree = 2;
      rotate = 1;
      break;
    case SYMM_REF2:
      degree = 2;
      rotate = 0;
      break;
    case SYMM_ROT4:
      degree = 4;
      rotate = 1;
      break;
    case SYMM_REF4:
      degree = 4;
      rotate = 0;
      break;
  }

  let rw: number, rh: number;
  if (degree === 4) {
    rw = Math.floor(w / 2);
    rh = Math.floor(h / 2);
    if (!rotate) rw += wodd;
    rh += hodd;
  } else if (degree === 2) {
    rw = w;
    rh = Math.floor(h / 2);
    rh += hodd;
  } else {
    rw = w;
    rh = h;
  }

  cleanBoard(state, false);
  const nblack = Math.floor((rw * rh * blackpc) / 100);
  for (let i = 0; i < nblack; i++) {
    let x: number, y: number;
    do {
      x = randomUpto(rw);
      y = randomUpto(rh);
    } while (GRID(state, 'flags', x, y) & F_BLACK);
    ORGRID(state, 'flags', x, y, F_BLACK);
  }

  if (symm === SYMM_NONE) return;

  const xs = [0, 0, 0, 0];
  const ys = [0, 0, 0, 0];

  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      if (degree === 4) {
        xs[0] = x;
        ys[0] = y;
        xs[1] = w - 1 - (rotate ? y : x);
        ys[1] = rotate ? x : y;
        xs[2] = rotate ? w - 1 - x : x;
        ys[2] = h - 1 - y;
        xs[3] = rotate ? y : w - 1 - x;
        ys[3] = h - 1 - (rotate ? x : y);
      } else {
        xs[0] = x;
        ys[0] = y;
        xs[1] = rotate ? w - 1 - x : x;
        ys[1] = h - 1 - y;
      }
      for (let i = 1; i < degree; i++) {
        SETGRID(state, 'flags', xs[i], ys[i], GRID(state, 'flags', xs[0], ys[0]));
      }
    }
  }

  // SYMM_ROT4 misses the middle square; fix that here.
  if (degree === 4 && rotate && wodd && randomUpto(100) <= blackpc) {
    ORGRID(state, 'flags', Math.floor(w / 2) + wodd - 1, Math.floor(h / 2) + hodd - 1, F_BLACK);
  }
}

// =============================================================================
// Light list — list_lights
// =============================================================================

function listLights(state: GameState, ox: number, oy: number, origin: boolean): LLData {
  const lld: LLData = {
    ox,
    oy,
    minx: ox,
    maxx: ox,
    miny: oy,
    maxy: oy,
    includeOrigin: origin,
  };

  let y = oy;
  for (let x = ox - 1; x >= 0; x--) {
    if (GRID(state, 'flags', x, y) & F_BLACK) break;
    if (x < lld.minx) lld.minx = x;
  }
  for (let x = ox + 1; x < state.w; x++) {
    if (GRID(state, 'flags', x, y) & F_BLACK) break;
    if (x > lld.maxx) lld.maxx = x;
  }

  const x = ox;
  for (y = oy - 1; y >= 0; y--) {
    if (GRID(state, 'flags', x, y) & F_BLACK) break;
    if (y < lld.miny) lld.miny = y;
  }
  for (y = oy + 1; y < state.h; y++) {
    if (GRID(state, 'flags', x, y) & F_BLACK) break;
    if (y > lld.maxy) lld.maxy = y;
  }

  return lld;
}

// =============================================================================
// set_light / check_dark
// =============================================================================

function setLight(state: GameState, ox: number, oy: number, on: boolean): void {
  let diff = 0;
  if (!on && GRID(state, 'flags', ox, oy) & F_LIGHT) {
    diff = -1;
    ANDGRID(state, 'flags', ox, oy, ~F_LIGHT);
    state.nlights--;
  } else if (on && !(GRID(state, 'flags', ox, oy) & F_LIGHT)) {
    diff = 1;
    ORGRID(state, 'flags', ox, oy, F_LIGHT);
    state.nlights++;
  }
  if (diff !== 0) {
    const lld = listLights(state, ox, oy, true);
    forEachLit(lld, (lx, ly) => {
      ADDGRID(state, 'lights', lx, ly, diff);
    });
  }
}

function checkDark(state: GameState, x: number, y: number): boolean {
  const lld = listLights(state, x, y, true);
  let dark = false;
  forEachLit(lld, (lx, ly) => {
    if (GRID(state, 'lights', lx, ly) === 1) dark = true;
  });
  return dark;
}

// =============================================================================
// place_lights — fill grid then remove redundant lights
// =============================================================================

function placeLights(state: GameState): void {
  const wh = state.w * state.h;
  const numindices: number[] = [];
  for (let i = 0; i < wh; i++) numindices[i] = i;
  shuffle(numindices);

  // Place a light on all non-black squares.
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      ANDGRID(state, 'flags', x, y, ~F_MARK);
      if (GRID(state, 'flags', x, y) & F_BLACK) continue;
      setLight(state, x, y, true);
    }
  }

  for (let i = 0; i < wh; i++) {
    const y = Math.floor(numindices[i] / state.w);
    const x = numindices[i] % state.w;
    if (!(GRID(state, 'flags', x, y) & F_LIGHT)) continue;
    if (GRID(state, 'flags', x, y) & F_MARK) continue;
    const lld = listLights(state, x, y, false);

    // If we're not lighting any lights ourself, don't remove anything.
    let n = 0;
    forEachLit(lld, (lx, ly) => {
      if (GRID(state, 'flags', lx, ly) & F_LIGHT) n++;
    });
    if (n === 0) continue; // [1]

    // Check whether removing lights we're lighting would cause anything to go dark.
    n = 0;
    forEachLit(lld, (lx, ly) => {
      if (GRID(state, 'flags', lx, ly) & F_LIGHT) {
        if (checkDark(state, lx, ly)) n++;
      }
    });
    if (n === 0) {
      // No, it wouldn't, so we can remove them all.
      forEachLit(lld, (lx, ly) => {
        setLight(state, lx, ly, false);
      });
      ORGRID(state, 'flags', x, y, F_MARK);
    }

    if (!gridOverlap(state)) return;
  }
}

// =============================================================================
// place_numbers — label all black squares with adjacent light counts
// =============================================================================

function placeNumbers(state: GameState): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (!(GRID(state, 'flags', x, y) & F_BLACK)) continue;
      const s = getSurrounds(state, x, y);
      let n = 0;
      for (let i = 0; i < s.npoints; i++) {
        if (GRID(state, 'flags', s.points[i].x, s.points[i].y) & F_LIGHT) n++;
      }
      ORGRID(state, 'flags', x, y, F_NUMBERED);
      SETGRID(state, 'lights', x, y, n);
    }
  }
}

// =============================================================================
// Solver helpers
// =============================================================================

function couldPlaceLight(flags: number, lights: number): boolean {
  if (flags & (F_BLACK | F_IMPOSSIBLE)) return false;
  return lights === 0;
}

function couldPlaceLightXY(state: GameState, x: number, y: number): boolean {
  return couldPlaceLight(GRID(state, 'flags', x, y), GRID(state, 'lights', x, y));
}

function trySolveLight(
  state: GameState,
  ox: number,
  oy: number,
  flags: number,
  lights: number,
): boolean {
  if (lights > 0) return false;
  if (flags & F_BLACK) return false;

  const lld = listLights(state, ox, oy, true);
  let sx = 0,
    sy = 0,
    n = 0;
  forEachLit(lld, (lx, ly) => {
    if (GRID(state, 'flags', lx, ly) & F_IMPOSSIBLE) return;
    if (GRID(state, 'lights', lx, ly) > 0) return;
    sx = lx;
    sy = ly;
    n++;
  });
  if (n === 1) {
    setLight(state, sx, sy, true);
    return true;
  }
  return false;
}

function trySolveNumber(
  state: GameState,
  nx: number,
  ny: number,
  nflags: number,
  nlightsVal: number,
): boolean {
  if (!(nflags & F_NUMBERED)) return false;
  let nl = nlightsVal;
  const s = getSurrounds(state, nx, ny);
  let ns = s.npoints;
  let ret = false;

  for (let i = 0; i < s.npoints; i++) {
    const x = s.points[i].x,
      y = s.points[i].y;
    const fl = GRID(state, 'flags', x, y);
    const li = GRID(state, 'lights', x, y);
    if (fl & F_LIGHT) {
      nl--;
      ns--;
      s.points[i].f |= F_MARK;
    } else if (!couldPlaceLight(fl, li)) {
      ns--;
      s.points[i].f |= F_MARK;
    }
  }
  if (ns === 0) return false;
  if (nl === 0) {
    ORGRID(state, 'flags', nx, ny, F_NUMBERUSED);
    for (let i = 0; i < s.npoints; i++) {
      if (!(s.points[i].f & F_MARK)) {
        ORGRID(state, 'flags', s.points[i].x, s.points[i].y, F_IMPOSSIBLE);
        ret = true;
      }
    }
  } else if (nl === ns) {
    ORGRID(state, 'flags', nx, ny, F_NUMBERUSED);
    for (let i = 0; i < s.npoints; i++) {
      if (!(s.points[i].f & F_MARK)) {
        setLight(state, s.points[i].x, s.points[i].y, true);
        ret = true;
      }
    }
  }
  return ret;
}

// =============================================================================
// Set-reduction solver (discount_*) — the "tricky" difficulty technique
// =============================================================================

interface SetScratch {
  x: number;
  y: number;
  n: number;
}

type TrlCb = (state: GameState, dx: number, dy: number, scratch: SetScratch[], n: number) => void;

function tryRuleOut(
  state: GameState,
  x: number,
  y: number,
  scratch: SetScratch[],
  n: number,
  cb: TrlCb,
): void {
  // Anything that would light (x,y)
  const lld = listLights(state, x, y, false);
  forEachLit(lld, (lx, ly) => {
    if (couldPlaceLightXY(state, lx, ly)) cb(state, lx, ly, scratch, n);
  });

  // Any empty space next to a clue square adjacent to (x,y) that only has one light left.
  const s = getSurrounds(state, x, y);
  for (let i = 0; i < s.npoints; i++) {
    if (!(GRID(state, 'flags', s.points[i].x, s.points[i].y) & F_NUMBERED)) continue;
    const ss = getSurrounds(state, s.points[i].x, s.points[i].y);
    let currLights = 0;
    for (let j = 0; j < ss.npoints; j++) {
      if (GRID(state, 'flags', ss.points[j].x, ss.points[j].y) & F_LIGHT) currLights++;
    }
    const totLights = GRID(state, 'lights', s.points[i].x, s.points[i].y);
    if (currLights + 1 === totLights) {
      for (let j = 0; j < ss.npoints; j++) {
        const lx = ss.points[j].x,
          ly = ss.points[j].y;
        if (lx === x && ly === y) continue;
        if (couldPlaceLightXY(state, lx, ly)) cb(state, lx, ly, scratch, n);
      }
    }
  }
}

function trlCallbackSearch(
  _state: GameState,
  dx: number,
  dy: number,
  scratch: SetScratch[],
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    if (dx === scratch[i].x && dy === scratch[i].y) {
      scratch[i].n = 1;
      return;
    }
  }
}

function discountSet(state: GameState, scratch: SetScratch[], n: number): boolean {
  if (n === 0) return false;

  // Count how many squares would rule out each element
  for (let i = 0; i < n; i++) {
    scratch[i].n = 0;
    tryRuleOut(state, scratch[i].x, scratch[i].y, scratch, n, (_st, _dx, _dy, _sc, _n) => {
      scratch[i].n++;
    });
  }

  // Find the element with the smallest count
  let besti = -1,
    bestn = state.w + state.h;
  for (let i = 0; i < n; i++) {
    if (scratch[i].n < bestn) {
      bestn = scratch[i].n;
      besti = i;
    }
  }

  // Try to discount using the best element
  let didsth = false;
  tryRuleOut(state, scratch[besti].x, scratch[besti].y, scratch, n, (st, dx, dy, sc, sn) => {
    if (GRID(st, 'flags', dx, dy) & F_IMPOSSIBLE) return;
    // Check whether a light at (dx,dy) rules out everything in scratch
    for (let i = 0; i < sn; i++) sc[i].n = 0;
    tryRuleOut(st, dx, dy, sc, sn, trlCallbackSearch);
    for (let i = 0; i < sn; i++) {
      if (sc[i].n === 0) return;
    }
    ORGRID(st, 'flags', dx, dy, F_IMPOSSIBLE);
    didsth = true;
  });

  return didsth;
}

function discountUnlit(state: GameState, x: number, y: number, scratch: SetScratch[]): boolean {
  let n = 0;
  const lld = listLights(state, x, y, true);
  forEachLit(lld, (lx, ly) => {
    if (couldPlaceLightXY(state, lx, ly)) {
      scratch[n] = { x: lx, y: ly, n: 0 };
      n++;
    }
  });
  return discountSet(state, scratch, n);
}

function discountClue(state: GameState, x: number, y: number, scratch: SetScratch[]): boolean {
  let m = GRID(state, 'lights', x, y);
  if (m === 0) return false;

  const s = getSurrounds(state, x, y);
  const sempty: SurroundPoint[] = [];

  for (let i = 0; i < s.npoints; i++) {
    const lx = s.points[i].x,
      ly = s.points[i].y;
    const fl = GRID(state, 'flags', lx, ly);
    const li = GRID(state, 'lights', lx, ly);
    if (fl & F_LIGHT) m--;
    if (couldPlaceLight(fl, li)) {
      sempty.push({ x: lx, y: ly, f: 0 });
    }
  }

  const n = sempty.length;
  if (n === 0) return false;
  if (m < 0 || m > n) return false;

  let didsth = false;
  const combi = newCombi(n - m + 1, n);
  while (nextCombi(combi)) {
    const slen = combi.r;
    for (let i = 0; i < slen; i++) {
      scratch[i] = { x: sempty[combi.a[i]].x, y: sempty[combi.a[i]].y, n: 0 };
    }
    if (discountSet(state, scratch, slen)) didsth = true;
  }

  return didsth;
}

// =============================================================================
// Solver — solve_sub / dosolve
// =============================================================================

function flagsFromDifficulty(difficulty: number): number {
  let sflags = F_SOLVE_FORCEUNIQUE;
  if (difficulty >= 1) sflags |= F_SOLVE_DISCOUNTSETS;
  if (difficulty >= 2) sflags |= F_SOLVE_ALLOWRECURSE;
  return sflags;
}

function solveSub(
  state: GameState,
  solveFlags: number,
  depth: number,
  maxdepth: { val: number },
): number {
  if (maxdepth.val < depth) maxdepth.val = depth;
  const maxrecurse = solveFlags & F_SOLVE_ALLOWRECURSE ? MAXRECURSE : 0;

  while (true) {
    if (gridOverlap(state)) return 0;
    if (gridCorrect(state)) return 1;

    let ncanplace = 0;
    let didstuff = false;

    for (let x = 0; x < state.w; x++) {
      for (let y = 0; y < state.h; y++) {
        const flags = GRID(state, 'flags', x, y);
        const lights = GRID(state, 'lights', x, y);
        if (couldPlaceLight(flags, lights)) ncanplace++;
        if (trySolveLight(state, x, y, flags, lights)) didstuff = true;
        if (trySolveNumber(state, x, y, flags, lights)) didstuff = true;
      }
    }
    if (didstuff) continue;
    if (!ncanplace) return 0;

    if (solveFlags & F_SOLVE_DISCOUNTSETS) {
      const sscratch: SetScratch[] = new Array(state.w + state.h);
      let reduced = false;
      for (let x = 0; x < state.w && !reduced; x++) {
        for (let y = 0; y < state.h && !reduced; y++) {
          const flags = GRID(state, 'flags', x, y);
          const lights = GRID(state, 'lights', x, y);
          if (!(flags & F_BLACK) && lights === 0) {
            if (discountUnlit(state, x, y, sscratch)) {
              didstuff = true;
              reduced = true;
            }
          } else if (flags & F_NUMBERED) {
            if (discountClue(state, x, y, sscratch)) {
              didstuff = true;
              reduced = true;
            }
          }
        }
      }
    }
    if (didstuff) continue;

    // Must guess — recursion
    if (depth >= maxrecurse) return -1;

    // Pick the square that would light the most unlit squares.
    let bestn = 0,
      bestx = -1,
      besty = -1;
    for (let x = 0; x < state.w; x++) {
      for (let y = 0; y < state.h; y++) {
        const flags = GRID(state, 'flags', x, y);
        const lights = GRID(state, 'lights', x, y);
        if (!couldPlaceLight(flags, lights)) continue;
        let n = 0;
        const lld = listLights(state, x, y, true);
        forEachLit(lld, (lx, ly) => {
          if (GRID(state, 'lights', lx, ly) === 0) n++;
        });
        if (n > bestn) {
          bestn = n;
          bestx = x;
          besty = y;
        }
      }
    }
    if (bestn === 0 || bestx < 0) return 0;

    // Try (bestx,besty) as IMPOSSIBLE, then as LIGHT
    const scopy = dupGame(state);

    ORGRID(state, 'flags', bestx, besty, F_IMPOSSIBLE);
    const selfSoluble = solveSub(state, solveFlags, depth + 1, maxdepth);

    if (!(solveFlags & F_SOLVE_FORCEUNIQUE) && selfSoluble > 0) {
      return selfSoluble;
    }

    setLight(scopy, bestx, besty, true);
    const copySoluble = solveSub(scopy, solveFlags, depth + 1, maxdepth);

    if (solveFlags & F_SOLVE_FORCEUNIQUE && (copySoluble < 0 || selfSoluble < 0)) {
      return -1;
    } else if (copySoluble <= 0) {
      return selfSoluble;
    } else if (selfSoluble <= 0) {
      // Copy solved; copy its state into ours
      state.lights = scopy.lights.slice();
      state.flags = scopy.flags.slice();
      return copySoluble;
    } else {
      return copySoluble + selfSoluble;
    }
  }
}

function dosolve(state: GameState, solveFlags: number, maxdepth: { val: number } | null): number {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      ANDGRID(state, 'flags', x, y, ~F_NUMBERUSED);
    }
  }
  const md = maxdepth ?? { val: 0 };
  return solveSub(state, solveFlags, 0, md);
}

// =============================================================================
// strip_unused_nums / unplace_lights / puzzle_is_good
// =============================================================================

function stripUnusedNums(state: GameState): number {
  let n = 0;
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (GRID(state, 'flags', x, y) & F_NUMBERED && !(GRID(state, 'flags', x, y) & F_NUMBERUSED)) {
        ANDGRID(state, 'flags', x, y, ~F_NUMBERED);
        SETGRID(state, 'lights', x, y, 0);
        n++;
      }
    }
  }
  return n;
}

function unplaceLights(state: GameState): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      if (GRID(state, 'flags', x, y) & F_LIGHT) setLight(state, x, y, false);
      ANDGRID(state, 'flags', x, y, ~F_IMPOSSIBLE);
      ANDGRID(state, 'flags', x, y, ~F_NUMBERUSED);
    }
  }
}

function puzzleIsGood(state: GameState, difficulty: number): boolean {
  const sflags = flagsFromDifficulty(difficulty);
  unplaceLights(state);
  const mdepth = { val: 0 };
  const nsol = dosolve(state, sflags, mdepth);
  // If we wanted an easy puzzle, make sure we didn't need recursion.
  if (!(sflags & F_SOLVE_ALLOWRECURSE) && mdepth.val > 0) return false;
  return nsol === 1;
}

// =============================================================================
// new_game_desc — the main generation loop
// =============================================================================

function newGameDesc(
  w: number,
  h: number,
  blackpc: number,
  symm: number,
  difficulty: number,
): GameState {
  let bpc = blackpc;
  const wh = w * h;
  const numindices: number[] = [];
  for (let j = 0; j < wh; j++) numindices[j] = j;
  shuffle(numindices);

  while (true) {
    for (let i = 0; i < MAX_GRIDGEN_TRIES; i++) {
      const news = newState(w, h);
      setBlacks(news, w, h, bpc, symm);
      placeLights(news);
      placeNumbers(news);

      if (!puzzleIsGood(news, difficulty)) continue;

      // Try stripping unused numbers
      const copys = dupGame(news);
      stripUnusedNums(copys);
      let best: GameState;
      if (puzzleIsGood(copys, difficulty)) {
        best = copys;
      } else {
        best = news;
      }

      // Remove numbers one-by-one in random order
      for (let j = 0; j < wh; j++) {
        const y = Math.floor(numindices[j] / w);
        const x = numindices[j] % w;
        if (!(GRID(best, 'flags', x, y) & F_NUMBERED)) continue;
        const num = GRID(best, 'lights', x, y);
        SETGRID(best, 'lights', x, y, 0);
        ANDGRID(best, 'flags', x, y, ~F_NUMBERED);
        if (!puzzleIsGood(best, difficulty)) {
          SETGRID(best, 'lights', x, y, num);
          ORGRID(best, 'flags', x, y, F_NUMBERED);
        }
      }

      // For difficulty>0, check we can't solve with a simpler solver
      if (difficulty > 0) {
        if (puzzleIsGood(best, difficulty - 1)) continue;
      }

      return best;
    }
    // Ramp up black percentage
    if (bpc < 90) bpc += 5;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Light Up puzzle.
 *
 * @param w Grid width (minimum 5)
 * @param h Grid height (minimum 5)
 * @param difficulty 0=easy, 1=tricky, 2=hard (default 0)
 * @returns A LightUpPuzzle with grid and solution
 */
export function generateLightUpPuzzle(w: number, h: number, difficulty = 0): LightUpPuzzle {
  if (w < 2) w = 2;
  if (h < 2) h = 2;
  if (difficulty < 0) difficulty = 0;
  if (difficulty > DIFFCOUNT) difficulty = DIFFCOUNT;

  // Choose symmetry: use ROT4 for square, ROT2 for non-square
  const symm = w === h ? SYMM_ROT4 : SYMM_ROT2;
  const blackpc = 20;

  const state = newGameDesc(w, h, blackpc, symm, difficulty);

  // Extract the solution by solving the generated puzzle
  const solveCopy = dupGame(state);
  unplaceLights(solveCopy);
  const sflags = F_SOLVE_ALLOWRECURSE | F_SOLVE_DISCOUNTSETS;
  dosolve(solveCopy, sflags, null);

  // Build public grid and solution
  const grid: number[] = new Array(w * h);
  const solution: boolean[] = new Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const flags = GRID(state, 'flags', x, y);
      if (flags & F_BLACK) {
        if (flags & F_NUMBERED) {
          grid[idx] = GRID(state, 'lights', x, y); // 0-4
        } else {
          grid[idx] = CELL_BLACK; // -1
        }
      } else {
        grid[idx] = CELL_EMPTY; // 5
      }
      solution[idx] = !!(GRID(solveCopy, 'flags', x, y) & F_LIGHT);
    }
  }

  return { w, h, grid, solution };
}
