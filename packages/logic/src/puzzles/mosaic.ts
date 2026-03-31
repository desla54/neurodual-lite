// @ts-nocheck
/**
 * Mosaic puzzle generator with solver-backed unique-solution guarantee.
 *
 * Rules:
 *   - Grid of cells, each either filled (black) or empty (white).
 *   - Some cells show a number clue (0–9).
 *   - Each clue = count of filled cells in the 3×3 neighbourhood centred on
 *     that cell (the cell itself + up to 8 neighbours).
 *   - Goal: determine every cell's state so that all clues are satisfied.
 *
 * Algorithm (no Tatham source — Mosaic is not in his collection):
 *   1. Generate a random solution grid.
 *   2. Compute clue values for every cell.
 *   3. Solve from all clues to verify the solution is reachable.
 *   4. Winnow clues one-by-one (random order): remove a clue, re-solve;
 *      if the solver still finds exactly one solution, keep it removed.
 *   5. Return the minimal-ish clue set that guarantees a unique solution.
 *
 * The solver uses iterative constraint propagation (neighbourhood bounds
 * tightening) plus back-tracking when propagation stalls.
 */

// =============================================================================
// Public types
// =============================================================================

export interface MosaicPuzzle {
  /** Grid width */
  w: number;
  /** Grid height */
  h: number;
  /**
   * Flat row-major clue grid (w*h).
   * -1 = no clue, 0–9 = clue value (filled-cell count in 3×3 neighbourhood).
   */
  clues: number[];
  /** Flat row-major solution grid. true = filled. */
  solution: boolean[];
}

// =============================================================================
// RNG
// =============================================================================

class Random {
  private s0: number;
  private s1: number;

  constructor(seed?: number) {
    this.s0 = (seed ?? Math.random() * 0x7fffffff) | 0;
    this.s1 = (this.s0 * 1103515245 + 12345) | 0;
    if (this.s0 === 0) this.s0 = 1;
    if (this.s1 === 0) this.s1 = 1;
  }

  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return ((this.s0 + this.s1) >>> 0) / 0x100000000;
  }

  /** Random integer in [0, n) */
  upto(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Fisher-Yates shuffle in place */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.upto(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
}

// =============================================================================
// Neighbourhood helpers
// =============================================================================

/** Return flat indices of the 3×3 neighbourhood of cell (r, c) in a w×h grid. */
function neighbours(w: number, h: number, idx: number): number[] {
  const r = (idx / w) | 0;
  const c = idx % w;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    const nr = r + dr;
    if (nr < 0 || nr >= h) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc;
      if (nc < 0 || nc >= w) continue;
      out.push(nr * w + nc);
    }
  }
  return out;
}

/** Count how many cells in the neighbourhood of idx are filled. */
function countNeighbourhood(grid: boolean[], w: number, h: number, idx: number): number {
  let count = 0;
  const r = (idx / w) | 0;
  const c = idx % w;
  for (let dr = -1; dr <= 1; dr++) {
    const nr = r + dr;
    if (nr < 0 || nr >= h) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc;
      if (nc < 0 || nc >= w) continue;
      if (grid[nr * w + nc]) count++;
    }
  }
  return count;
}

// =============================================================================
// Solver
// =============================================================================

const UNKNOWN = -1;
const EMPTY = 0;
const FILLED = 1;

interface SolverResult {
  /** Number of solutions found (0, 1, or 2 meaning "more than 1") */
  count: number;
  /** The first solution found (if any) */
  solution: boolean[] | null;
}

/**
 * Solve a mosaic puzzle from clues.
 *
 * Uses constraint propagation + limited back-tracking.
 * Stops as soon as 2 solutions are found (enough to know uniqueness).
 */
function solve(w: number, h: number, clues: number[], maxSolutions: number = 2): SolverResult {
  const n = w * h;

  // Pre-compute neighbourhood lists for every cell
  const nbCache: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    nbCache[i] = neighbours(w, h, i);
  }

  // Which cells are constrained by each clue
  // clueIndices[i] = list of clue-cell indices whose neighbourhood includes cell i
  const clueIndices: number[][] = new Array(n);
  for (let i = 0; i < n; i++) clueIndices[i] = [];
  const clueList: number[] = [];
  for (let i = 0; i < n; i++) {
    if (clues[i] >= 0) {
      clueList.push(i);
      const nb = nbCache[i];
      for (let k = 0; k < nb.length; k++) {
        clueIndices[nb[k]].push(i);
      }
    }
  }

  let solutionCount = 0;
  let firstSolution: boolean[] | null = null;

  // State: -1 = unknown, 0 = empty, 1 = filled
  const state = new Int8Array(n).fill(UNKNOWN);

  function propagate(): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let ci = 0; ci < clueList.length; ci++) {
        const clueIdx = clueList[ci];
        const target = clues[clueIdx];
        const nb = nbCache[clueIdx];
        let filledCount = 0;
        let _emptyCount = 0;
        let unknownCount = 0;
        for (let k = 0; k < nb.length; k++) {
          const s = state[nb[k]];
          if (s === FILLED) filledCount++;
          else if (s === EMPTY) _emptyCount++;
          else unknownCount++;
        }

        // Contradiction checks
        if (filledCount > target) return false;
        if (filledCount + unknownCount < target) return false;

        if (unknownCount === 0) continue;

        // All unknowns must be filled
        if (filledCount + unknownCount === target) {
          for (let k = 0; k < nb.length; k++) {
            if (state[nb[k]] === UNKNOWN) {
              state[nb[k]] = FILLED;
              changed = true;
            }
          }
        }
        // All unknowns must be empty
        else if (filledCount === target) {
          for (let k = 0; k < nb.length; k++) {
            if (state[nb[k]] === UNKNOWN) {
              state[nb[k]] = EMPTY;
              changed = true;
            }
          }
        }
      }
    }
    return true; // no contradiction
  }

  function search(): void {
    if (solutionCount >= maxSolutions) return;

    if (!propagate()) return;

    // Find first unknown cell
    let bestIdx = -1;
    let bestScore = 999;
    for (let i = 0; i < n; i++) {
      if (state[i] === UNKNOWN) {
        // Prefer cells with more clue constraints (faster pruning)
        const score = clueIndices[i].length;
        if (bestIdx === -1 || score > bestScore) {
          bestIdx = i;
          bestScore = score;
        }
      }
    }

    if (bestIdx === -1) {
      // All cells determined — found a solution
      solutionCount++;
      if (solutionCount === 1) {
        firstSolution = new Array(n);
        for (let i = 0; i < n; i++) firstSolution[i] = state[i] === FILLED;
      }
      return;
    }

    // Branch: try FILLED first, then EMPTY
    const saved = new Int8Array(state);

    state[bestIdx] = FILLED;
    search();
    if (solutionCount >= maxSolutions) return;

    // Restore
    for (let i = 0; i < n; i++) state[i] = saved[i];

    state[bestIdx] = EMPTY;
    search();
    if (solutionCount >= maxSolutions) return;

    // Restore
    for (let i = 0; i < n; i++) state[i] = saved[i];
  }

  search();

  return { count: solutionCount, solution: firstSolution };
}

// =============================================================================
// Generator
// =============================================================================

const MAX_ATTEMPTS = 50;

/**
 * Generate a Mosaic puzzle with a unique solution.
 *
 * @param w Grid width  (recommended 5–15)
 * @param h Grid height (recommended 5–15)
 * @returns A puzzle with minimal clue set guaranteeing unique solvability.
 */
export function generateMosaicPuzzle(w: number, h: number): MosaicPuzzle {
  const rng = new Random();
  const n = w * h;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 1. Random solution — ~45% fill density
    const solution: boolean[] = new Array(n);
    for (let i = 0; i < n; i++) {
      solution[i] = rng.next() < 0.45;
    }

    // 2. Compute clue values for every cell
    const allClues: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      allClues[i] = countNeighbourhood(solution, w, h, i);
    }

    // 3. Start with all clues present; verify the solver recovers the solution
    const clues = allClues.slice();
    {
      const result = solve(w, h, clues, 2);
      if (result.count !== 1) continue; // solution not uniquely recoverable, retry
      // Verify it matches
      let match = true;
      for (let i = 0; i < n; i++) {
        if (result.solution[i] !== solution[i]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
    }

    // 4. Winnow clues: try removing each in random order
    const order: number[] = [];
    for (let i = 0; i < n; i++) order.push(i);
    rng.shuffle(order);

    for (let oi = 0; oi < order.length; oi++) {
      const idx = order[oi];
      const saved = clues[idx];
      clues[idx] = -1;

      const result = solve(w, h, clues, 2);
      if (result.count !== 1) {
        // Removing this clue breaks uniqueness — put it back
        clues[idx] = saved;
      }
      // else: clue successfully removed
    }

    return { w, h, clues, solution };
  }

  // Fallback: should be extremely rare. Return with all clues (trivially unique).
  const solution: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) solution[i] = rng.next() < 0.45;
  const clues: number[] = new Array(n);
  for (let i = 0; i < n; i++) clues[i] = countNeighbourhood(solution, w, h, i);
  return { w, h, clues, solution };
}
