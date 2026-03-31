/**
 * Nonogram (pattern) puzzle generator — faithful port of Simon Tatham's pattern.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Generates nonogram puzzles with guaranteed unique solutions.
 * The solver works one row/column at a time, enumerating all valid
 * block placements and deducing cells that are the same in every
 * valid arrangement.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PatternPuzzle {
  /** Solution grid, row-major. 0 = empty, 1 = filled. */
  grid: Uint8Array;
  w: number;
  h: number;
  rowClues: number[][];
  colClues: number[][];
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const PATTERN_PRESETS = {
  easy: { w: 5, h: 5 },
  medium: { w: 10, h: 10 },
  hard: { w: 15, h: 15 },
} as const;

// ---------------------------------------------------------------------------
// Internal constants (from pattern.c)
// ---------------------------------------------------------------------------

const GRID_FULL = 1;
const GRID_EMPTY = 0;
const GRID_UNKNOWN = 2;

/** Solver cell states */
const UNKNOWN = 0;
const BLOCK = 1;
const DOT = 2;
const STILL_UNKNOWN = 3;

// ---------------------------------------------------------------------------
// Typed-array helpers — avoid non-null assertions on indexing
// ---------------------------------------------------------------------------

/** Read from a typed array (avoids biome noNonNullAssertion lint) */
function at(arr: { readonly [i: number]: number }, i: number): number {
  return arr[i] as number;
}

function atU8(arr: Uint8Array, i: number): number {
  return arr[i] as number;
}

// ---------------------------------------------------------------------------
// generate() — random grid with cellular automaton smoothing
// ---------------------------------------------------------------------------

/**
 * Generate a random bitmap grid, smoothed with one pass of a cellular
 * automaton (average of 3x3 neighbourhood), then thresholded at the median.
 */
function generate(w: number, h: number): Uint8Array {
  const wh = w * h;
  let fgrid = new Float64Array(wh);

  for (let i = 0; i < wh; i++) {
    fgrid[i] = Math.random();
  }

  // One step of cellular automaton: average of surrounding 3x3 cells
  const fgrid2 = new Float64Array(wh);
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      let n = 0;
      let sx = 0;
      for (let p = -1; p <= 1; p++) {
        for (let q = -1; q <= 1; q++) {
          if (i + p < 0 || i + p >= h || j + q < 0 || j + q >= w) continue;
          // Special case: if a dimension is 2, don't average across it
          if ((h === 2 && p !== 0) || (w === 2 && q !== 0)) continue;
          n++;
          sx += at(fgrid, (i + p) * w + (j + q));
        }
      }
      fgrid2[i * w + j] = sx / n;
    }
  }
  fgrid = fgrid2;

  // Find median threshold
  const sorted = new Float64Array(fgrid);
  sorted.sort();
  const threshold = at(sorted, (wh / 2) | 0);

  // Threshold to binary
  const retgrid = new Uint8Array(wh);
  for (let i = 0; i < wh; i++) {
    retgrid[i] = at(fgrid, i) >= threshold ? GRID_FULL : GRID_EMPTY;
  }

  return retgrid;
}

// ---------------------------------------------------------------------------
// computeRowData() — extract run-length clues from a line
// ---------------------------------------------------------------------------

/**
 * Compute clue data for a row or column.
 * `offset` is the starting index, `len` is the number of cells,
 * `step` is the stride. Returns array of run lengths, or null if
 * any cell is GRID_UNKNOWN.
 */
function computeRowData(
  grid: Uint8Array,
  offset: number,
  len: number,
  step: number,
): number[] | null {
  const ret: number[] = [];

  for (let i = 0; i < len; i++) {
    const cell = atU8(grid, offset + i * step);
    if (cell === GRID_FULL) {
      let runlen = 1;
      while (i + runlen < len && atU8(grid, offset + (i + runlen) * step) === GRID_FULL) {
        runlen++;
      }
      ret.push(runlen);
      i += runlen; // loop will i++ so we land on the cell after the run
      if (i < len && atU8(grid, offset + i * step) === GRID_UNKNOWN) return null;
    } else if (cell === GRID_UNKNOWN) {
      return null;
    }
  }

  return ret;
}

// ---------------------------------------------------------------------------
// Solver: do_recurse + do_row
// ---------------------------------------------------------------------------

/**
 * Recursively try all valid placements of blocks in a row/column.
 * Accumulates a bitwise-OR of all valid configurations into `deduced`.
 */
function doRecurse(
  known: Uint8Array,
  deduced: Uint8Array,
  row: Uint8Array,
  minposDone: Uint32Array,
  maxposDone: Uint32Array,
  minposOk: Uint32Array,
  maxposOk: Uint32Array,
  data: Int32Array,
  len: number,
  freespace: number,
  ndone: number,
  lowest: number,
): boolean {
  if (at(data, ndone) !== 0) {
    // Check memoisation
    if (lowest >= at(minposDone, ndone) && lowest <= at(maxposDone, ndone)) {
      if (lowest >= at(minposOk, ndone) && lowest <= at(maxposOk, ndone)) {
        for (let i = 0; i < lowest; i++) {
          deduced[i]! |= atU8(row, i);
        }
      }
      return lowest >= at(minposOk, ndone) && lowest <= at(maxposOk, ndone);
    }

    if (lowest < at(minposDone, ndone)) minposDone[ndone] = lowest;
    if (lowest > at(maxposDone, ndone)) maxposDone[ndone] = lowest;

    for (let i = 0; i <= freespace; i++) {
      let j = lowest;
      let valid = true;

      // Place i dots before this block
      for (let k = 0; k < i; k++) {
        if (atU8(known, j) === BLOCK) {
          valid = false;
          break;
        }
        row[j++] = DOT;
      }
      if (!valid) continue;

      // Place the block
      const blockLen = at(data, ndone);
      for (let k = 0; k < blockLen; k++) {
        if (atU8(known, j) === DOT) {
          valid = false;
          break;
        }
        row[j++] = BLOCK;
      }
      if (!valid) continue;

      // Mandatory trailing dot (if not at end)
      if (j < len) {
        if (atU8(known, j) === BLOCK) continue;
        row[j++] = DOT;
      }

      if (
        doRecurse(
          known,
          deduced,
          row,
          minposDone,
          maxposDone,
          minposOk,
          maxposOk,
          data,
          len,
          freespace - i,
          ndone + 1,
          j,
        )
      ) {
        if (lowest < at(minposOk, ndone)) minposOk[ndone] = lowest;
        if (lowest + i > at(maxposOk, ndone)) maxposOk[ndone] = lowest + i;
        if (lowest + i > at(maxposDone, ndone)) maxposDone[ndone] = lowest + i;
      }
    }

    return lowest >= at(minposOk, ndone) && lowest <= at(maxposOk, ndone);
  }

  // Base case: no more blocks — fill remaining with dots
  for (let i = lowest; i < len; i++) {
    if (atU8(known, i) === BLOCK) return false;
    row[i] = DOT;
  }
  for (let i = 0; i < len; i++) {
    deduced[i]! |= atU8(row, i);
  }
  return true;
}

/**
 * Process one row or column: enumerate valid placements and deduce cells.
 * Returns true if any cell was newly deduced.
 */
function doRow(
  workspace: Uint8Array,
  matrix: Uint8Array,
  offset: number,
  len: number,
  step: number,
  data: Int32Array,
  changed: Uint32Array,
  changedOffset: number,
  changedStep: number,
  max: number,
): boolean {
  const known = workspace.subarray(0, max);
  const deduced = workspace.subarray(max, max * 2);
  const row = workspace.subarray(max * 2, max * 3);
  const minposDone = new Uint32Array(max + 1);
  const maxposDone = new Uint32Array(max + 1);
  const minposOk = new Uint32Array(max + 1);
  const maxposOk = new Uint32Array(max + 1);

  // Count clue entries and compute freespace
  let rowlen = 0;
  let freespace = len + 1;
  while (at(data, rowlen) !== 0) {
    minposDone[rowlen] = len - 1;
    minposOk[rowlen] = len - 1;
    maxposDone[rowlen] = 0;
    maxposOk[rowlen] = 0;
    freespace -= at(data, rowlen) + 1;
    rowlen++;
  }

  // Copy known state
  for (let i = 0; i < len; i++) {
    known[i] = atU8(matrix, offset + i * step);
    deduced[i] = 0;
  }

  // Trim trailing dots from freespace calculation
  for (let i = len - 1; i >= 0 && atU8(known, i) === DOT; i--) {
    freespace--;
  }

  doRecurse(
    known,
    deduced,
    row,
    minposDone,
    maxposDone,
    minposOk,
    maxposOk,
    data,
    len,
    freespace,
    0,
    0,
  );

  let doneAny = false;
  for (let i = 0; i < len; i++) {
    const d = atU8(deduced, i);
    const k = atU8(known, i);
    if (d !== 0 && d !== STILL_UNKNOWN && k === UNKNOWN) {
      matrix[offset + i * step] = d;
      changed[changedOffset + i * changedStep]!++;
      doneAny = true;
    }
  }

  return doneAny;
}

// ---------------------------------------------------------------------------
// solve_puzzle() — iterative row/column solver
// ---------------------------------------------------------------------------

/** Helper: load clue data into a zero-terminated Int32Array */
function loadClues(
  solutionGrid: Uint8Array,
  offset: number,
  len: number,
  step: number,
  rowdata: Int32Array,
): void {
  const clues = computeRowData(solutionGrid, offset, len, step);
  let idx = 0;
  if (clues) {
    for (const c of clues) rowdata[idx++] = c;
  }
  rowdata[idx] = 0;
}

/**
 * Attempt to solve a nonogram from its solution grid (used only for
 * clue extraction). Returns true if the line solver can fully solve
 * the puzzle, guaranteeing a unique solution.
 */
function solvePuzzle(solutionGrid: Uint8Array, w: number, h: number): boolean {
  const max = Math.max(w, h);
  const wh = w * h;

  const matrix = new Uint8Array(wh); // starts all UNKNOWN (0)
  const workspace = new Uint8Array(max * 7);
  const changedH = new Uint32Array(max + 1);
  const changedW = new Uint32Array(max + 1);
  const rowdata = new Int32Array(max + 1);

  // Initial pass: estimate deducible cells per row
  for (let i = 0; i < h; i++) {
    loadClues(solutionGrid, i * w, w, 1, rowdata);
    let freespace = w + 1;
    for (let j = 0; at(rowdata, j) !== 0; j++) freespace -= at(rowdata, j) + 1;
    changedH[i] = 0;
    for (let j = 0; at(rowdata, j) !== 0; j++) {
      if (at(rowdata, j) > freespace) changedH[i]! += at(rowdata, j) - freespace;
    }
  }

  let maxH = 0;
  for (let i = 0; i < h; i++) {
    if (at(changedH, i) > maxH) maxH = at(changedH, i);
  }

  // Initial pass: estimate deducible cells per column
  for (let i = 0; i < w; i++) {
    loadClues(solutionGrid, i, h, w, rowdata);
    let freespace = h + 1;
    for (let j = 0; at(rowdata, j) !== 0; j++) freespace -= at(rowdata, j) + 1;
    changedW[i] = 0;
    for (let j = 0; at(rowdata, j) !== 0; j++) {
      if (at(rowdata, j) > freespace) changedW[i]! += at(rowdata, j) - freespace;
    }
  }

  let maxW = 0;
  for (let i = 0; i < w; i++) {
    if (at(changedW, i) > maxW) maxW = at(changedW, i);
  }

  // Main solver loop: process rows and columns by descending priority
  do {
    for (; maxH > 0 && maxH >= maxW; maxH--) {
      for (let i = 0; i < h; i++) {
        if (at(changedH, i) >= maxH) {
          loadClues(solutionGrid, i * w, w, 1, rowdata);
          doRow(workspace, matrix, i * w, w, 1, rowdata, changedW, 0, 1, max);
          changedH[i] = 0;
        }
      }
      maxW = 0;
      for (let i = 0; i < w; i++) {
        if (at(changedW, i) > maxW) maxW = at(changedW, i);
      }
    }

    for (; maxW > 0 && maxW >= maxH; maxW--) {
      for (let i = 0; i < w; i++) {
        if (at(changedW, i) >= maxW) {
          loadClues(solutionGrid, i, h, w, rowdata);
          doRow(workspace, matrix, i, h, w, rowdata, changedH, 0, 1, max);
          changedW[i] = 0;
        }
      }
      maxH = 0;
      for (let i = 0; i < h; i++) {
        if (at(changedH, i) > maxH) maxH = at(changedH, i);
      }
    }
  } while (maxH > 0 || maxW > 0);

  for (let i = 0; i < wh; i++) {
    if (matrix[i] === UNKNOWN) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// generate_soluble() — generate until uniquely solvable
// ---------------------------------------------------------------------------

function generateSoluble(w: number, h: number): Uint8Array {
  for (;;) {
    const grid = generate(w, h);

    // Reject trivial rows/columns (all-black or all-white) for dimensions > 2
    let ok = true;

    if (w > 2) {
      for (let i = 0; i < h; i++) {
        let colours = 0;
        for (let j = 0; j < w; j++) {
          colours |= grid[i * w + j] === GRID_FULL ? 2 : 1;
        }
        if (colours !== 3) {
          ok = false;
          break;
        }
      }
    }

    if (ok && h > 2) {
      for (let j = 0; j < w; j++) {
        let colours = 0;
        for (let i = 0; i < h; i++) {
          colours |= grid[i * w + j] === GRID_FULL ? 2 : 1;
        }
        if (colours !== 3) {
          ok = false;
          break;
        }
      }
    }

    if (!ok) continue;

    if (solvePuzzle(grid, w, h)) {
      return grid;
    }
  }
}

// ---------------------------------------------------------------------------
// extractClues() — compute row and column clues from a solved grid
// ---------------------------------------------------------------------------

function extractClues(
  grid: Uint8Array,
  w: number,
  h: number,
): { rowClues: number[][]; colClues: number[][] } {
  const rowClues: number[][] = [];
  for (let i = 0; i < h; i++) {
    const clues = computeRowData(grid, i * w, w, 1);
    rowClues.push(clues && clues.length > 0 ? clues : [0]);
  }

  const colClues: number[][] = [];
  for (let j = 0; j < w; j++) {
    const clues = computeRowData(grid, j, h, w);
    colClues.push(clues && clues.length > 0 ? clues : [0]);
  }

  return { rowClues, colClues };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a nonogram puzzle with a guaranteed unique solution.
 *
 * Faithful port of Simon Tatham's pattern.c:
 * 1. Generate a random grid smoothed by a cellular automaton
 * 2. Verify the line solver can fully solve it (unique solution)
 * 3. Repeat until a valid puzzle is found
 */
export function generatePattern(w: number, h: number): PatternPuzzle {
  const grid = generateSoluble(w, h);
  const { rowClues, colClues } = extractClues(grid, w, h);
  return { grid, w, h, rowClues, colClues };
}
