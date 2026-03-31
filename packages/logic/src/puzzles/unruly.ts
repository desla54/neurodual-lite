/**
 * Unruly (Binairo/Takuzu) puzzle generator and solver
 *
 * Faithful port of Simon Tatham's unruly.c
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=unruly.c
 *
 * Cell values:
 *   EMPTY = 0, N_ONE = 1 (black), N_ZERO = 2 (white)
 *
 * Constraints:
 *   (1) No three consecutive same-value cells in any row or column
 *   (2) Each row has exactly w/2 blacks and w/2 whites
 *   (3) Each column has exactly h/2 blacks and h/2 whites
 */

// =============================================================================
// Types
// =============================================================================

export interface UnrulyPuzzle {
  /** Flat row-major grid. 0=unknown, 1=black, 2=white */
  grid: number[];
  w: number;
  h: number;
  /** The unique solution (flat row-major, all cells 1 or 2) */
  solution: number[];
}

// =============================================================================
// Constants — matching unruly.c enums
// =============================================================================

const EMPTY = 0;
const N_ONE = 1; // "black" in our UI
const N_ZERO = 2; // "white" in our UI
const BOGUS = 3;

/** Difficulty levels */
const DIFF_EASY = 0;
const DIFF_NORMAL = 1;
const DIFFCOUNT = 2;

// =============================================================================
// Scratch data — matching struct unruly_scratch
// =============================================================================

interface UnrulyScratch {
  onesRows: number[];
  onesCols: number[];
  zerosRows: number[];
  zerosCols: number[];
}

// =============================================================================
// PRNG — simple seedable RNG for shuffle reproducibility
// =============================================================================

function makeRng(): {
  randomUpto: (n: number) => number;
  shuffle: <T>(arr: T[]) => void;
} {
  return {
    randomUpto(n: number): number {
      return Math.floor(Math.random() * n);
    },
    shuffle<T>(arr: T[]): void {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]!;
        arr[i]! = arr[j]!;
        arr[j]! = tmp;
      }
    },
  };
}

// =============================================================================
// Solver — faithful port of unruly.c solver functions
// =============================================================================

/**
 * Port of unruly_solver_update_remaining.
 * Recomputes scratch counts from the grid.
 */
function solverUpdateRemaining(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
): void {
  scratch.onesRows.fill(0) as number[];
  scratch.onesCols.fill(0) as number[];
  scratch.zerosRows.fill(0) as number[];
  scratch.zerosCols.fill(0) as number[];

  for (let x = 0; x < w2; x++) {
    for (let y = 0; y < h2; y++) {
      const v = grid[y * w2 + x]!;
      if (v === N_ONE) {
        scratch.onesRows[y]!++;
        scratch.onesCols[x]!++;
      } else if (v === N_ZERO) {
        scratch.zerosRows[y]!++;
        scratch.zerosCols[x]!++;
      }
    }
  }
}

function newScratch(grid: number[], w2: number, h2: number): UnrulyScratch {
  const scratch: UnrulyScratch = {
    onesRows: new Array<number>(h2).fill(0) as number[],
    onesCols: new Array<number>(w2).fill(0) as number[],
    zerosRows: new Array<number>(h2).fill(0) as number[],
    zerosCols: new Array<number>(w2).fill(0) as number[],
  };
  solverUpdateRemaining(grid, w2, h2, scratch);
  return scratch;
}

/**
 * Port of unruly_solver_check_threes.
 *
 * Looks for two consecutive cells of type `check` with an adjacent empty cell,
 * and fills the empty cell with `block` (the opposite color).
 */
function solverCheckThrees(
  grid: number[],
  w2: number,
  h2: number,
  rowcount: number[],
  colcount: number[],
  horizontal: boolean,
  check: number,
  block: number,
): number {
  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;
  const sx = dx;
  const sy = dy;
  const ex = w2 - dx;
  const ey = h2 - dy;

  let ret = 0;

  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);

      if (grid[i1]! === check && grid[i2]! === check && grid[i3]! === EMPTY) {
        ret++;
        grid[i3]! = block;
        rowcount[(i3 / w2) | 0] = rowcount[(i3 / w2) | 0]! + 1;
        colcount[i3 % w2] = colcount[i3 % w2]! + 1;
      }
      if (grid[i1]! === check && grid[i2]! === EMPTY && grid[i3]! === check) {
        ret++;
        grid[i2]! = block;
        rowcount[(i2 / w2) | 0] = rowcount[(i2 / w2) | 0]! + 1;
        colcount[i2 % w2] = colcount[i2 % w2]! + 1;
      }
      if (grid[i1]! === EMPTY && grid[i2]! === check && grid[i3]! === check) {
        ret++;
        grid[i1]! = block;
        rowcount[(i1 / w2) | 0] = rowcount[(i1 / w2) | 0]! + 1;
        colcount[i1 % w2] = colcount[i1 % w2]! + 1;
      }
    }
  }

  return ret;
}

/**
 * Port of unruly_solver_check_all_threes
 */
function solverCheckAllThrees(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
): number {
  let ret = 0;
  ret += solverCheckThrees(grid, w2, h2, scratch.zerosRows, scratch.zerosCols, true, N_ONE, N_ZERO);
  ret += solverCheckThrees(grid, w2, h2, scratch.onesRows, scratch.onesCols, true, N_ZERO, N_ONE);
  ret += solverCheckThrees(
    grid,
    w2,
    h2,
    scratch.zerosRows,
    scratch.zerosCols,
    false,
    N_ONE,
    N_ZERO,
  );
  ret += solverCheckThrees(grid, w2, h2, scratch.onesRows, scratch.onesCols, false, N_ZERO, N_ONE);
  return ret;
}

/**
 * Port of unruly_solver_fill_row.
 * Fill every EMPTY cell in a row/column with `fill`.
 */
function solverFillRow(
  grid: number[],
  w2: number,
  h2: number,
  i: number,
  horizontal: boolean,
  rowcount: number[],
  colcount: number[],
  fill: number,
): number {
  let ret = 0;
  const len = horizontal ? w2 : h2;

  for (let j = 0; j < len; j++) {
    const p = horizontal ? i * w2 + j : j * w2 + i;

    if (grid[p]! === EMPTY) {
      ret++;
      grid[p]! = fill;
      rowcount[horizontal ? i : j] = rowcount[horizontal ? i : j]! + 1;
      colcount[horizontal ? j : i] = colcount[horizontal ? j : i]! + 1;
    }
  }

  return ret;
}

/**
 * Port of unruly_solver_check_complete_nums.
 * If a row/column already has its maximum of one color, fill remaining with the other.
 */
function solverCheckCompleteNums(
  grid: number[],
  w2: number,
  h2: number,
  complete: number[],
  horizontal: boolean,
  rowcount: number[],
  colcount: number[],
  fill: number,
): number {
  const count = horizontal ? h2 : w2;
  const target = (horizontal ? w2 : h2) / 2;
  const other = horizontal ? rowcount : colcount;

  let ret = 0;

  for (let i = 0; i < count; i++) {
    if (complete[i]! === target && other[i]! < target) {
      ret += solverFillRow(grid, w2, h2, i, horizontal, rowcount, colcount, fill);
    }
  }

  return ret;
}

/**
 * Port of unruly_solver_check_all_complete_nums
 */
function solverCheckAllCompleteNums(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
): number {
  let ret = 0;
  ret += solverCheckCompleteNums(
    grid,
    w2,
    h2,
    scratch.onesRows,
    true,
    scratch.zerosRows,
    scratch.zerosCols,
    N_ZERO,
  );
  ret += solverCheckCompleteNums(
    grid,
    w2,
    h2,
    scratch.onesCols,
    false,
    scratch.zerosRows,
    scratch.zerosCols,
    N_ZERO,
  );
  ret += solverCheckCompleteNums(
    grid,
    w2,
    h2,
    scratch.zerosRows,
    true,
    scratch.onesRows,
    scratch.onesCols,
    N_ONE,
  );
  ret += solverCheckCompleteNums(
    grid,
    w2,
    h2,
    scratch.zerosCols,
    false,
    scratch.onesRows,
    scratch.onesCols,
    N_ONE,
  );
  return ret;
}

/**
 * Port of unruly_solver_check_near_complete.
 *
 * This checks for a row with one Y remaining, then looks for positions
 * that could cause the remaining squares to make 3 X's in a row.
 */
function solverCheckNearComplete(
  grid: number[],
  w2: number,
  h2: number,
  complete: number[],
  horizontal: boolean,
  rowcount: number[],
  colcount: number[],
  fill: number,
): number {
  const w = w2 / 2;
  const h = h2 / 2;

  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;

  const sx = dx;
  const sy = dy;
  const ex = w2 - dx;
  const ey = h2 - dy;

  let ret = 0;

  for (let y = sy; y < ey; y++) {
    if (horizontal && (complete[y]! < w - 1 || rowcount[y]! > w - 2)) continue;

    for (let x = sx; x < ex; x++) {
      if (!horizontal && (complete[x]! < h - 1 || colcount[x]! > h - 2)) continue;

      const i = horizontal ? y : x;
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);

      if (grid[i1]! === fill && grid[i2]! === EMPTY && grid[i3]! === EMPTY) {
        grid[i2]! = BOGUS;
        grid[i3]! = BOGUS;
        ret += solverFillRow(grid, w2, h2, i, horizontal, rowcount, colcount, fill);
        grid[i2]! = EMPTY;
        grid[i3]! = EMPTY;
      } else if (grid[i1]! === EMPTY && grid[i2]! === fill && grid[i3]! === EMPTY) {
        grid[i1]! = BOGUS;
        grid[i3]! = BOGUS;
        ret += solverFillRow(grid, w2, h2, i, horizontal, rowcount, colcount, fill);
        grid[i1]! = EMPTY;
        grid[i3]! = EMPTY;
      } else if (grid[i1]! === EMPTY && grid[i2]! === EMPTY && grid[i3]! === fill) {
        grid[i1]! = BOGUS;
        grid[i2]! = BOGUS;
        ret += solverFillRow(grid, w2, h2, i, horizontal, rowcount, colcount, fill);
        grid[i1]! = EMPTY;
        grid[i2]! = EMPTY;
      } else if (grid[i1]! === EMPTY && grid[i2]! === EMPTY && grid[i3]! === EMPTY) {
        grid[i1]! = BOGUS;
        grid[i2]! = BOGUS;
        grid[i3]! = BOGUS;
        ret += solverFillRow(grid, w2, h2, i, horizontal, rowcount, colcount, fill);
        grid[i1]! = EMPTY;
        grid[i2]! = EMPTY;
        grid[i3]! = EMPTY;
      }
    }
  }

  return ret;
}

/**
 * Port of unruly_solver_check_all_near_complete
 */
function solverCheckAllNearComplete(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
): number {
  let ret = 0;
  ret += solverCheckNearComplete(
    grid,
    w2,
    h2,
    scratch.onesRows,
    true,
    scratch.zerosRows,
    scratch.zerosCols,
    N_ZERO,
  );
  ret += solverCheckNearComplete(
    grid,
    w2,
    h2,
    scratch.onesCols,
    false,
    scratch.zerosRows,
    scratch.zerosCols,
    N_ZERO,
  );
  ret += solverCheckNearComplete(
    grid,
    w2,
    h2,
    scratch.zerosRows,
    true,
    scratch.onesRows,
    scratch.onesCols,
    N_ONE,
  );
  ret += solverCheckNearComplete(
    grid,
    w2,
    h2,
    scratch.zerosCols,
    false,
    scratch.onesRows,
    scratch.onesCols,
    N_ONE,
  );
  return ret;
}

// =============================================================================
// Validation — faithful port
// =============================================================================

/**
 * Port of unruly_validate_rows.
 * Checks for any three consecutive same-value cells.
 * Returns the count of violations found.
 */
function validateRows(
  grid: number[],
  w2: number,
  h2: number,
  horizontal: boolean,
  check: number,
): number {
  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;

  const sx = dx;
  const sy = dy;
  const ex = w2 - dx;
  const ey = h2 - dy;

  let ret = 0;

  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);

      if (grid[i1]! === check && grid[i2]! === check && grid[i3]! === check) {
        ret++;
      }
    }
  }

  return ret;
}

/**
 * Port of unruly_validate_all_rows
 */
function validateAllRows(grid: number[], w2: number, h2: number): number {
  let errcount = 0;
  errcount += validateRows(grid, w2, h2, true, N_ONE);
  errcount += validateRows(grid, w2, h2, false, N_ONE);
  errcount += validateRows(grid, w2, h2, true, N_ZERO);
  errcount += validateRows(grid, w2, h2, false, N_ZERO);

  if (errcount) return -1;
  return 0;
}

/**
 * Port of unruly_validate_counts.
 * Returns 0 if all counts match, 1 if below, -1 if above.
 */
function validateCounts(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch | null,
): number {
  const w = w2 / 2;
  const h = h2 / 2;
  let below = false;
  let above = false;

  const sc = scratch ?? newScratch(grid, w2, h2);

  for (let i = 0; i < w2; i++) {
    if (sc.onesCols[i]! < h) below = true;
    if (sc.zerosCols[i]! < h) below = true;
    if (sc.onesCols[i]! > h) above = true;
    if (sc.zerosCols[i]! > h) above = true;
  }
  for (let i = 0; i < h2; i++) {
    if (sc.onesRows[i]! < w) below = true;
    if (sc.zerosRows[i]! < w) below = true;
    if (sc.onesRows[i]! > w) above = true;
    if (sc.zerosRows[i]! > w) above = true;
  }

  return above ? -1 : below ? 1 : 0;
}

// =============================================================================
// Main solver entry — port of unruly_solve_game
// =============================================================================

/**
 * Port of unruly_solve_game.
 * Runs the solver loop at the given difficulty.
 * Mutates `grid` in place.
 * Returns max difficulty used, or -1 if nothing was done.
 */
function solveGame(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
  diff: number,
): number {
  let maxdiff = -1;

  while (true) {
    let done = 0;

    // Check for impending 3's
    done += solverCheckAllThrees(grid, w2, h2, scratch);

    if (done) {
      if (maxdiff < DIFF_EASY) maxdiff = DIFF_EASY;
      continue;
    }

    // Check for completed rows
    done += solverCheckAllCompleteNums(grid, w2, h2, scratch);

    if (done) {
      if (maxdiff < DIFF_EASY) maxdiff = DIFF_EASY;
      continue;
    }

    // Normal techniques
    if (diff < DIFF_NORMAL) break;

    // Check for nearly completed rows
    done += solverCheckAllNearComplete(grid, w2, h2, scratch);

    if (done) {
      if (maxdiff < DIFF_NORMAL) maxdiff = DIFF_NORMAL;
      continue;
    }

    break;
  }
  return maxdiff;
}

// =============================================================================
// Generator — faithful port of unruly_fill_game + new_game_desc
// =============================================================================

/**
 * Port of unruly_fill_game.
 * Fills the grid by randomly placing cells and running the solver after each.
 * Returns true if a valid complete grid was produced.
 */
function fillGame(
  grid: number[],
  w2: number,
  h2: number,
  scratch: UnrulyScratch,
  rng: ReturnType<typeof makeRng>,
): boolean {
  const s = w2 * h2;

  // Generate random array of spaces
  const spaces: number[] = [];
  for (let i = 0; i < s; i++) spaces.push(i);
  rng.shuffle(spaces);

  // Construct a valid filled grid by repeatedly picking an unfilled
  // space and filling it, then calling the solver to fill in any
  // spaces forced by the change.
  for (let j = 0; j < s; j++) {
    const i = spaces[j]!;

    if (grid[i]! !== EMPTY) continue;

    if (rng.randomUpto(2)) {
      grid[i]! = N_ONE;
      scratch.onesRows[(i / w2) | 0] = scratch.onesRows[(i / w2) | 0]! + 1;
      scratch.onesCols[i % w2] = scratch.onesCols[i % w2]! + 1;
    } else {
      grid[i]! = N_ZERO;
      scratch.zerosRows[(i / w2) | 0] = scratch.zerosRows[(i / w2) | 0]! + 1;
      scratch.zerosCols[i % w2] = scratch.zerosCols[i % w2]! + 1;
    }

    solveGame(grid, w2, h2, scratch, DIFFCOUNT);
  }

  if (validateAllRows(grid, w2, h2) !== 0 || validateCounts(grid, w2, h2, scratch) !== 0) {
    return false;
  }

  return true;
}

/**
 * Port of new_game_desc — the complete generator.
 *
 * 1. Generate a valid filled grid (retry until success).
 * 2. Winnow clues: try removing each cell in random order, keeping
 *    it only if the solver can still find the solution.
 * 3. If difficulty > EASY, verify the puzzle isn't solvable at a
 *    lower difficulty (regenerate if it is).
 */
export function generateUnrulyPuzzle(w: number, h: number, diff = DIFF_NORMAL): UnrulyPuzzle {
  if (w % 2 !== 0 || h % 2 !== 0) throw new Error('Width and height must both be even');
  if (w < 6 || h < 6) throw new Error('Width and height must be at least 6');

  const w2 = w;
  const h2 = h;
  const s = w2 * h2;
  const rng = makeRng();

  while (true) {
    // --- Step 1: Generate a valid filled grid ---
    let grid: number[];
    let scratch: UnrulyScratch;

    while (true) {
      grid = new Array<number>(s).fill(EMPTY);
      scratch = newScratch(grid, w2, h2);
      if (fillGame(grid, w2, h2, scratch, rng)) break;
    }

    // Save the solution
    const solution = grid.slice();

    // --- Step 2: Winnow clues ---
    // Generate random array of spaces
    const spaces: number[] = [];
    for (let i = 0; i < s; i++) spaces.push(i);
    rng.shuffle(spaces);

    // Winnow the clues by starting from our filled grid, repeatedly
    // picking a filled space and emptying it, as long as the solver
    // reports that the puzzle can still be solved after doing so.
    for (let j = 0; j < s; j++) {
      const i = spaces[j]!;

      const c = grid[i]!;
      grid[i]! = EMPTY;

      const solverGrid = grid.slice();
      const solverScratch = newScratch(solverGrid, w2, h2);

      solveGame(solverGrid, w2, h2, solverScratch, diff);

      if (validateCounts(solverGrid, w2, h2, solverScratch) !== 0) {
        // Solver couldn't complete it — restore the clue
        grid[i]! = c;
      }
    }

    // --- Step 3: Difficulty check ---
    // See if the game has accidentally come out too easy.
    if (diff > 0) {
      const solverGrid = grid.slice();
      const solverScratch = newScratch(solverGrid, w2, h2);

      solveGame(solverGrid, w2, h2, solverScratch, diff - 1);

      const ok = validateCounts(solverGrid, w2, h2, solverScratch);

      if (!ok) {
        // Puzzle is solvable at a lower difficulty — regenerate
        continue;
      }
    }

    return { grid, w: w2, h: h2, solution };
  }
}

// =============================================================================
// Public solver API
// =============================================================================

/**
 * Solve an Unruly puzzle.
 * Returns the solved grid, or null if the solver cannot complete it.
 */
export function solveUnruly(grid: number[], w: number, h: number): number[] | null {
  const solved = grid.slice();
  const scratch = newScratch(solved, w, h);

  solveGame(solved, w, h, scratch, DIFFCOUNT);

  const result = validateCounts(solved, w, h, scratch);
  if (validateAllRows(solved, w, h) === -1) return null;
  if (result !== 0) return null;

  return solved;
}
