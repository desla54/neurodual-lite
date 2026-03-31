// @ts-nocheck
/**
 * Black Box puzzle — faithful port of Simon Tatham's blackbox.c
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=blackbox.c
 * License: MIT
 *
 * Terminology (from blackbox.c):
 *
 * The 'arena' is the inner area where the balls are placed. This is
 *   indexed from (0,0) to (w-1,h-1) but its offset in the grid is (1,1).
 *
 * The 'range' (firing range) is the bit around the edge where
 *   the lasers are fired from. This is indexed from 0 --> (2*(w+h) - 1),
 *   starting at the top left ((1,0) on the grid) and moving clockwise.
 *
 * The 'grid' is just the big array containing arena and range;
 *   locations (0,0), (0,w+1), (h+1,w+1) and (h+1,0) are unused.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BlackBoxPuzzle {
  /** Arena width */
  w: number;
  /** Arena height */
  h: number;
  /** Number of hidden balls */
  numBalls: number;
  /** Ball positions as [row, col] in arena coordinates (0-based) */
  balls: Array<[row: number, col: number]>;
  /**
   * Fire a laser from range index `entryNo` (0..nlasers-1).
   * Returns the result: LASER_HIT, LASER_REFLECT, or exit range index.
   */
  fireLaser: (entryNo: number) => number;
  /**
   * Fire a laser from an edge described as side + index.
   * Convenience wrapper around `fireLaser`.
   */
  fireLaserFromEdge: (side: 'top' | 'right' | 'bottom' | 'left', index: number) => LaserOutcome;
  /**
   * Check whether a set of guessed ball positions (arena coords)
   * is equivalent to the hidden solution — i.e. produces identical
   * laser results for every possible entry.
   */
  checkGuesses: (guesses: Array<[row: number, col: number]>) => boolean;
  /** Total number of laser entry/exit positions: 2*(w+h) */
  nlasers: number;
}

export interface LaserOutcome {
  type: 'hit' | 'reflect' | 'exit';
  /** For 'exit': which side the laser exited from */
  exitSide?: 'top' | 'right' | 'bottom' | 'left';
  /** For 'exit': index along that side (0-based) */
  exitIndex?: number;
}

// ---------------------------------------------------------------------------
// Constants (from blackbox.c)
// ---------------------------------------------------------------------------

const BALL_CORRECT = 0x01;
const BALL_GUESS = 0x02;

const LASER_REFLECT = 0x1000;
const LASER_HIT = 0x2000;
const LASER_EMPTY = ~0 >>> 0; // unsigned ~0

export { LASER_HIT, LASER_REFLECT };

// ---------------------------------------------------------------------------
// Directions (from blackbox.c)
// ---------------------------------------------------------------------------

/** specify numbers because they must match array indexes. */
const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;

const offsets: Array<{ x: number; y: number }> = [
  { x: 0, y: -1 }, // up
  { x: 1, y: 0 }, // right
  { x: 0, y: 1 }, // down
  { x: -1, y: 0 }, // left
];

// ---------------------------------------------------------------------------
// Internal game state (mirrors struct game_state)
// ---------------------------------------------------------------------------

interface GameState {
  w: number;
  h: number;
  nballs: number;
  nlasers: number;
  /** (w+2) x (h+2) grid, row-major */
  grid: Uint32Array;
  /** One per laser entry, stores exit info */
  exits: Uint32Array;
  laserno: number;
}

function GRID(s: GameState, x: number, y: number): number {
  return s.grid[y * (s.w + 2) + x];
}

function GRID_SET(s: GameState, x: number, y: number, val: number): void {
  s.grid[y * (s.w + 2) + x] = val;
}

// ---------------------------------------------------------------------------
// OFFSET macro — move (gx,gy) one step in direction o
// ---------------------------------------------------------------------------

function applyOffset(gx: number, gy: number, o: number): { gx: number; gy: number } {
  const off = ((o % 4) + 4) % 4;
  return { gx: gx + offsets[off].x, gy: gy + offsets[off].y };
}

// ---------------------------------------------------------------------------
// range2grid / grid2range — coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert a range number (0..nlasers-1) to grid coordinates and direction.
 * Faithful port of range2grid() from blackbox.c.
 */
function range2grid(
  state: GameState,
  rangeno: number,
): { x: number; y: number; direction: number } | null {
  if (rangeno < 0) return null;

  let r = rangeno;

  if (r < state.w) {
    // top row; from (1,0) to (w,0)
    return { x: r + 1, y: 0, direction: DIR_DOWN };
  }
  r -= state.w;

  if (r < state.h) {
    // RHS; from (w+1, 1) to (w+1, h)
    return { x: state.w + 1, y: r + 1, direction: DIR_LEFT };
  }
  r -= state.h;

  if (r < state.w) {
    // bottom row; from (1, h+1) to (w, h+1); counts backwards
    return { x: state.w - r, y: state.h + 1, direction: DIR_UP };
  }
  r -= state.w;

  if (r < state.h) {
    // LHS; from (0, 1) to (0, h); counts backwards
    return { x: 0, y: state.h - r, direction: DIR_RIGHT };
  }

  return null;
}

/**
 * Convert grid coordinates to a range number.
 * Faithful port of grid2range() from blackbox.c.
 */
function grid2range(state: GameState, x: number, y: number): number | null {
  const x1 = state.w + 1;
  const y1 = state.h + 1;

  if (x > 0 && x < x1 && y > 0 && y < y1) return null; // in arena
  if (x < 0 || x > x1 || y < 0 || y > y1) return null; // outside grid

  if ((x === 0 || x === x1) && (y === 0 || y === y1)) return null; // corner

  if (y === 0) {
    // top line
    return x - 1;
  } else if (x === x1) {
    // RHS
    return y - 1 + state.w;
  } else if (y === y1) {
    // Bottom [counts backwards]
    return state.w - x + state.w + state.h;
  } else {
    // LHS [counts backwards]
    return state.h - y + state.w + state.w + state.h;
  }
}

// ---------------------------------------------------------------------------
// isball — look for a ball in a given relative direction
// ---------------------------------------------------------------------------

const LOOK_LEFT = 0;
const LOOK_FORWARD = 1;
const LOOK_RIGHT = 2;

/**
 * Given a position and a direction, check whether we can see a ball in front
 * of us, or to our front-left or front-right.
 * Faithful port of isball() from blackbox.c.
 */
function isball(
  state: GameState,
  gx: number,
  gy: number,
  direction: number,
  lookwhere: number,
): boolean {
  // OFFSET(gx, gy, direction)
  let pos = applyOffset(gx, gy, direction);

  if (lookwhere === LOOK_LEFT) {
    pos = applyOffset(pos.gx, pos.gy, direction - 1);
  } else if (lookwhere === LOOK_RIGHT) {
    pos = applyOffset(pos.gx, pos.gy, direction + 1);
  }
  // LOOK_FORWARD: no extra offset

  // if we're off the grid (into the firing range) there's never a ball.
  if (pos.gx < 1 || pos.gy < 1 || pos.gx > state.w || pos.gy > state.h) return false;

  return (GRID(state, pos.gx, pos.gy) & BALL_CORRECT) !== 0;
}

// ---------------------------------------------------------------------------
// fire_laser_internal — trace a laser through the grid
// ---------------------------------------------------------------------------

/**
 * Core laser tracing. Returns LASER_HIT, LASER_REFLECT, or an exit range number.
 * Faithful port of fire_laser_internal() from blackbox.c.
 */
function fireLaserInternal(state: GameState, x: number, y: number, direction: number): number {
  const lno = grid2range(state, x, y);

  // Deal with strange initial reflection rules (that stop
  // you turning down the laser range).

  // Prioritise instant-hit over instant-reflection (matching C code).
  if (isball(state, x, y, direction, LOOK_FORWARD)) {
    return LASER_HIT;
  }

  if (isball(state, x, y, direction, LOOK_LEFT) || isball(state, x, y, direction, LOOK_RIGHT)) {
    return LASER_REFLECT;
  }

  // Move us onto the grid.
  let pos = applyOffset(x, y, direction);
  let cx = pos.gx;
  let cy = pos.gy;
  let dir = direction;

  while (true) {
    const exitno = grid2range(state, cx, cy);
    if (exitno !== null) {
      return lno === exitno ? LASER_REFLECT : exitno;
    }

    if (isball(state, cx, cy, dir, LOOK_FORWARD)) {
      // We're facing a ball; it's a hit.
      return LASER_HIT;
    }

    if (isball(state, cx, cy, dir, LOOK_LEFT)) {
      // Ball to our left; rotate clockwise.
      dir = (dir + 1) % 4;
      continue;
    }

    if (isball(state, cx, cy, dir, LOOK_RIGHT)) {
      // Ball to our right; rotate anti-clockwise.
      dir = (dir + 3) % 4;
      continue;
    }

    // No balls; move forwards.
    pos = applyOffset(cx, cy, dir);
    cx = pos.gx;
    cy = pos.gy;
  }
}

// ---------------------------------------------------------------------------
// laser_exit — public helper: compute exit for a given entry
// ---------------------------------------------------------------------------

/**
 * Compute where a laser fired from `entryNo` exits.
 * Faithful port of laser_exit() from blackbox.c.
 */
function laserExit(state: GameState, entryNo: number): number {
  const r = range2grid(state, entryNo);
  if (!r) throw new Error(`Invalid entry range: ${entryNo}`);
  return fireLaserInternal(state, r.x, r.y, r.direction);
}

// ---------------------------------------------------------------------------
// fire_laser — fire and record a laser (mutates state)
// ---------------------------------------------------------------------------

/**
 * Fire a laser and store its result in `state.exits` / `state.grid`.
 * Faithful port of fire_laser() from blackbox.c.
 */
function fireLaser(state: GameState, entryNo: number): void {
  const r = range2grid(state, entryNo);
  if (!r) return;

  const exitno = fireLaserInternal(state, r.x, r.y, r.direction);

  if (exitno === LASER_HIT || exitno === LASER_REFLECT) {
    GRID_SET(state, r.x, r.y, exitno);
    state.exits[entryNo] = exitno;
  } else {
    const newno = state.laserno++;
    const rExit = range2grid(state, exitno);
    if (!rExit) return;
    GRID_SET(state, r.x, r.y, newno);
    GRID_SET(state, rExit.x, rExit.y, newno);
    state.exits[entryNo] = exitno;
    state.exits[exitno] = entryNo;
  }
}

// ---------------------------------------------------------------------------
// dupState — duplicate state (mirrors dup_game)
// ---------------------------------------------------------------------------

function dupState(state: GameState): GameState {
  return {
    w: state.w,
    h: state.h,
    nballs: state.nballs,
    nlasers: state.nlasers,
    grid: new Uint32Array(state.grid),
    exits: new Uint32Array(state.exits),
    laserno: state.laserno,
  };
}

// ---------------------------------------------------------------------------
// createState — build a fresh game state with balls placed
// ---------------------------------------------------------------------------

function createState(
  w: number,
  h: number,
  ballPositions: Array<[row: number, col: number]>,
): GameState {
  const nlasers = 2 * (w + h);
  const grid = new Uint32Array((w + 2) * (h + 2));
  const exits = new Uint32Array(nlasers);
  exits.fill(LASER_EMPTY);

  const state: GameState = {
    w,
    h,
    nballs: ballPositions.length,
    nlasers,
    grid,
    exits,
    laserno: 1,
  };

  for (const [row, col] of ballPositions) {
    // Arena coords (row, col) map to grid coords (col+1, row+1)
    GRID_SET(state, col + 1, row + 1, BALL_CORRECT);
  }

  return state;
}

// ---------------------------------------------------------------------------
// checkGuessesEquivalent — faithful port of check_guesses (non-cagey path)
// ---------------------------------------------------------------------------

/**
 * Check whether the guessed ball positions produce identical laser results
 * for ALL possible lasers. This handles the case where >4 balls can have
 * multiple valid solutions.
 *
 * Faithful port of the non-cagey path of check_guesses() from blackbox.c.
 */
function checkGuessesEquivalent(
  state: GameState,
  guessPositions: Array<[row: number, col: number]>,
): boolean {
  // Build solution state from original
  const solution = dupState(state);

  // Clear out the lasers of solution
  for (let i = 0; i < solution.nlasers; i++) {
    const r = range2grid(solution, i);
    if (r) GRID_SET(solution, r.x, r.y, 0);
    solution.exits[i] = LASER_EMPTY;
  }

  // Build guesses state from solution (has same balls cleared of laser data)
  const guesses = dupState(solution);

  // Clear out BALL_CORRECT on guesses, make BALL_GUESS into BALL_CORRECT
  for (let x = 1; x <= state.w; x++) {
    for (let y = 1; y <= state.h; y++) {
      const val = GRID(guesses, x, y);
      let newVal = val & ~BALL_CORRECT;
      if (newVal & BALL_GUESS) newVal |= BALL_CORRECT;
      GRID_SET(guesses, x, y, newVal);
    }
  }

  // Place the guess balls
  // First clear all BALL_GUESS bits
  for (let x = 1; x <= state.w; x++) {
    for (let y = 1; y <= state.h; y++) {
      GRID_SET(guesses, x, y, GRID(guesses, x, y) & ~BALL_CORRECT);
    }
  }
  for (const [row, col] of guessPositions) {
    const gx = col + 1;
    const gy = row + 1;
    GRID_SET(guesses, gx, gy, GRID(guesses, gx, gy) | BALL_CORRECT);
  }

  // Fire all lasers on both states and compare
  for (let i = 0; i < solution.nlasers; i++) {
    if (solution.exits[i] === LASER_EMPTY) fireLaser(solution, i);
    if (guesses.exits[i] === LASER_EMPTY) fireLaser(guesses, i);
  }

  // Compare exits
  for (let i = 0; i < solution.nlasers; i++) {
    if (solution.exits[i] !== guesses.exits[i]) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// rangeToEdge / edgeToRange — user-friendly coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert a range number to a human-readable edge side + index.
 */
function rangeToEdge(
  state: GameState,
  rangeno: number,
): { side: 'top' | 'right' | 'bottom' | 'left'; index: number } | null {
  let r = rangeno;

  if (r < state.w) {
    return { side: 'top', index: r };
  }
  r -= state.w;

  if (r < state.h) {
    return { side: 'right', index: r };
  }
  r -= state.h;

  if (r < state.w) {
    // bottom counts backwards in range numbering
    return { side: 'bottom', index: state.w - 1 - r };
  }
  r -= state.w;

  if (r < state.h) {
    // left counts backwards in range numbering
    return { side: 'left', index: state.h - 1 - r };
  }

  return null;
}

/**
 * Convert an edge side + index to a range number.
 */
function edgeToRange(
  state: GameState,
  side: 'top' | 'right' | 'bottom' | 'left',
  index: number,
): number {
  switch (side) {
    case 'top':
      return index;
    case 'right':
      return state.w + index;
    case 'bottom':
      // bottom counts backwards
      return state.w + state.h + (state.w - 1 - index);
    case 'left':
      // left counts backwards
      return state.w + state.h + state.w + (state.h - 1 - index);
  }
}

// ---------------------------------------------------------------------------
// generateBlackBoxPuzzle — main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a Black Box puzzle with random ball placement.
 *
 * Faithful port of `new_game_desc()` from blackbox.c (ball placement),
 * plus the laser-firing and guess-checking logic.
 *
 * @param w Arena width
 * @param h Arena height
 * @param numBalls Number of balls to place
 */
export function generateBlackBoxPuzzle(w: number, h: number, numBalls: number): BlackBoxPuzzle {
  if (w < 2 || h < 2) throw new Error('Width and height must both be at least 2');
  if (numBalls >= w * h) throw new Error('Too many balls to fit in grid');

  // Place balls randomly (faithful to new_game_desc)
  const occupied = new Uint8Array(w * h);
  const ballPositions: Array<[number, number]> = [];

  for (let i = 0; i < numBalls; i++) {
    let x: number, y: number;
    do {
      x = Math.floor(Math.random() * w);
      y = Math.floor(Math.random() * h);
    } while (occupied[y * w + x]);
    occupied[y * w + x] = 1;
    ballPositions.push([y, x]); // [row, col]
  }

  const state = createState(w, h, ballPositions);
  const nlasers = state.nlasers;

  return {
    w,
    h,
    numBalls,
    balls: ballPositions,
    nlasers,

    fireLaser(entryNo: number): number {
      return laserExit(state, entryNo);
    },

    fireLaserFromEdge(side: 'top' | 'right' | 'bottom' | 'left', index: number): LaserOutcome {
      const rangeNo = edgeToRange(state, side, index);
      const result = laserExit(state, rangeNo);

      if (result === LASER_HIT) return { type: 'hit' };
      if (result === LASER_REFLECT) return { type: 'reflect' };

      // It's an exit — convert range number to edge side + index
      const exitEdge = rangeToEdge(state, result);
      if (!exitEdge) throw new Error(`Invalid exit range: ${result}`);

      // Check if exit equals entry — that's a reflect
      if (exitEdge.side === side && exitEdge.index === index) {
        return { type: 'reflect' };
      }

      return {
        type: 'exit',
        exitSide: exitEdge.side,
        exitIndex: exitEdge.index,
      };
    },

    checkGuesses(guesses: Array<[number, number]>): boolean {
      return checkGuessesEquivalent(state, guesses);
    },
  };
}
