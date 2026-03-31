// @ts-nocheck
/**
 * Towers (Skyscrapers) puzzle generator — faithful port of Simon Tatham's towers.c
 *
 * Ports the following C algorithms:
 *   - Maxflow (Edmonds-Karp) from maxflow.c
 *   - latin_generate() from latin.c (maxflow-based latin square generation)
 *   - Full latin constraint solver from latin.c
 *   - Towers-specific solver heuristics (solver_easy, solver_hard) from towers.c
 *   - Puzzle generation with difficulty filtering from towers.c new_game_desc()
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 */

// =============================================================================
// Public API
// =============================================================================

export interface TowersPuzzle {
  /** Grid side length (e.g. 4, 5, 6). */
  size: number;
  /** The player grid (0 = empty, 1-N = pre-filled digit). Row-major. */
  grid: number[];
  /** The unique solution (1-N digits, row-major). */
  solution: number[];
  /**
   * Clues around the edges. Each is 0 if no clue.
   * - top[c]: visibility looking down column c from the top
   * - bottom[c]: visibility looking up column c from the bottom
   * - left[r]: visibility looking right along row r from the left
   * - right[r]: visibility looking left along row r from the right
   */
  clues: {
    top: number[];
    bottom: number[];
    left: number[];
    right: number[];
  };
  /** Which cells are pre-filled (locked). */
  lockedCells: boolean[];
}

export function generateTowersPuzzle(n: number): TowersPuzzle {
  if (n < 3 || n > 9) {
    throw new RangeError('Size must be between 3 and 9');
  }
  return generateTowers(n);
}

// =============================================================================
// Maxflow — Edmonds-Karp algorithm (faithful port of maxflow.c)
// =============================================================================

function lessEdge(edges: Int32Array, i: number, j: number): boolean {
  return (
    edges[2 * i + 1] < edges[2 * j + 1] ||
    (edges[2 * i + 1] === edges[2 * j + 1] && edges[2 * i] < edges[2 * j])
  );
}

function maxflowSetupBackedges(ne: number, edges: Int32Array, backedges: Int32Array): void {
  for (let i = 0; i < ne; i++) backedges[i] = i;

  // Heapsort backedges by (dest, source) order
  let n = 0;
  while (n < ne) {
    n++;
    let i = n - 1;
    while (i > 0) {
      const p = ((i - 1) / 2) | 0;
      if (lessEdge(edges, backedges[p], backedges[i])) {
        const tmp = backedges[p];
        backedges[p] = backedges[i];
        backedges[i] = tmp;
        i = p;
      } else {
        break;
      }
    }
  }

  while (n > 0) {
    n--;
    const tmp = backedges[0];
    backedges[0] = backedges[n];
    backedges[n] = tmp;

    let i = 0;
    while (true) {
      const lc = 2 * i + 1;
      const rc = 2 * i + 2;

      if (lc >= n) break;

      if (rc >= n) {
        if (lessEdge(edges, backedges[i], backedges[lc])) {
          const t = backedges[i];
          backedges[i] = backedges[lc];
          backedges[lc] = t;
        }
        break;
      } else {
        if (
          lessEdge(edges, backedges[i], backedges[lc]) ||
          lessEdge(edges, backedges[i], backedges[rc])
        ) {
          if (lessEdge(edges, backedges[lc], backedges[rc])) {
            const t = backedges[i];
            backedges[i] = backedges[rc];
            backedges[rc] = t;
            i = rc;
          } else {
            const t = backedges[i];
            backedges[i] = backedges[lc];
            backedges[lc] = t;
            i = lc;
          }
        } else {
          break;
        }
      }
    }
  }
}

function maxflowWithScratch(
  nv: number,
  source: number,
  sink: number,
  ne: number,
  edges: Int32Array,
  backedges: Int32Array,
  capacity: Int32Array,
  flow: Int32Array,
): number {
  const todo = new Int32Array(nv);
  const prev = new Int32Array(nv);
  const firstedge = new Int32Array(nv);
  const firstbackedge = new Int32Array(nv);

  // Build firstedge index
  let j = 0;
  for (let i = 0; i < ne; i++) while (j <= edges[2 * i]) firstedge[j++] = i;
  while (j < nv) firstedge[j++] = ne;

  // Build firstbackedge index
  j = 0;
  for (let i = 0; i < ne; i++) while (j <= edges[2 * backedges[i] + 1]) firstbackedge[j++] = i;
  while (j < nv) firstbackedge[j++] = ne;

  // Start flow at zero
  for (let i = 0; i < ne; i++) flow[i] = 0;
  let totalflow = 0;

  // Repeatedly find augmenting paths via BFS
  while (true) {
    for (let i = 0; i < nv; i++) prev[i] = -1;

    let head = 0;
    let tail = 0;
    todo[tail++] = source;

    while (head < tail && prev[sink] <= 0) {
      const from = todo[head++];

      // Forward edges
      for (let i = firstedge[from]; i < ne && edges[2 * i] === from; i++) {
        const to = edges[2 * i + 1];
        if (to === source || prev[to] >= 0) continue;
        if (capacity[i] >= 0 && flow[i] >= capacity[i]) continue;
        prev[to] = 2 * i;
        todo[tail++] = to;
      }

      // Backward edges
      for (let i = firstbackedge[from]; i < ne && edges[2 * backedges[i] + 1] === from; i++) {
        const jj = backedges[i];
        const to = edges[2 * jj];
        if (to === source || prev[to] >= 0) continue;
        if (flow[jj] <= 0) continue;
        prev[to] = 2 * jj + 1;
        todo[tail++] = to;
      }
    }

    if (prev[sink] >= 0) {
      // Found augmenting path — find max flow along it
      let to = sink;
      let max = -1;
      while (to !== source) {
        const i = prev[to];
        const from = edges[i];
        let spare: number;
        if (i & 1) {
          spare = flow[(i / 2) | 0];
        } else if (capacity[(i / 2) | 0] >= 0) {
          spare = capacity[(i / 2) | 0] - flow[(i / 2) | 0];
        } else {
          spare = -1;
        }
        if (max < 0 || (spare >= 0 && spare < max)) max = spare;
        to = from;
      }

      // Adjust flow along path
      to = sink;
      while (to !== source) {
        const i = prev[to];
        const from = edges[i];
        if (i & 1) {
          flow[(i / 2) | 0] = flow[(i / 2) | 0] - max;
        } else {
          flow[(i / 2) | 0] = flow[(i / 2) | 0] + max;
        }
        to = from;
      }

      totalflow += max;
      continue;
    }

    // No augmenting path found — we're done
    return totalflow;
  }
}

// =============================================================================
// Latin square generation (faithful port of latin.c latin_generate)
// =============================================================================

function shuffle(arr: number[] | Int32Array, n: number): void {
  for (let i = n - 1; i > 0; i--) {
    const j = randomUpto(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function randomUpto(limit: number): number {
  return Math.floor(Math.random() * limit);
}

/**
 * Generate a random latin square of order o.
 *
 * Faithful port of latin_generate() from latin.c.
 * Uses the maxflow-based row extension theorem: any r x n latin rectangle
 * with r < n can always be extended to (r+1) x n.
 */
function latinGenerate(o: number): number[] {
  const sq = new Array<number>(o * o).fill(0);

  // Generate rows in random order to avoid directional bias
  const row = new Array<number>(o);
  const col = new Array<number>(o);
  const numinv = new Array<number>(o);
  const num = new Array<number>(o);
  for (let i = 0; i < o; i++) row[i] = i;
  shuffle(row, o);

  // Set up maxflow infrastructure
  const ne = o * o + 2 * o;
  const edges = new Int32Array(ne * 2);
  const backedges = new Int32Array(ne);
  const capacity = new Int32Array(ne);
  const flow = new Int32Array(ne);

  // Build edge array
  let ei = 0;
  // LHS vertex i -> RHS vertex j+o
  for (let i = 0; i < o; i++) {
    for (let j = 0; j < o; j++) {
      edges[ei * 2] = i;
      edges[ei * 2 + 1] = j + o;
      // capacity set per-row below
      ei++;
    }
  }
  // RHS vertex i+o -> sink (2o+1)
  for (let i = 0; i < o; i++) {
    edges[ei * 2] = i + o;
    edges[ei * 2 + 1] = o * 2 + 1;
    capacity[ei] = 1;
    ei++;
  }
  // source (2o) -> LHS vertex i
  for (let i = 0; i < o; i++) {
    edges[ei * 2] = o * 2;
    edges[ei * 2 + 1] = i;
    capacity[ei] = 1;
    ei++;
  }

  maxflowSetupBackedges(ne, edges, backedges);

  // Generate each row
  for (let i = 0; i < o; i++) {
    // Randomize column and digit permutations per row
    for (let j = 0; j < o; j++) col[j] = num[j] = j;
    shuffle(col, o);
    shuffle(num, o);
    for (let j = 0; j < o; j++) numinv[num[j]] = j;

    // Set capacities based on existing rows
    for (let j = 0; j < o * o; j++) capacity[j] = 1;
    for (let j = 0; j < i; j++) {
      for (let k = 0; k < o; k++) {
        const n = num[sq[row[j] * o + col[k]] - 1];
        capacity[k * o + n] = 0;
      }
    }

    // Run maxflow
    const f = maxflowWithScratch(o * 2 + 2, 2 * o, 2 * o + 1, ne, edges, backedges, capacity, flow);
    if (f !== o) throw new Error('maxflow failed — should not happen');

    // Extract the row from the flow
    for (let j = 0; j < o; j++) {
      let k = 0;
      for (; k < o; k++) {
        if (flow[j * o + k]) break;
      }
      sq[row[i] * o + col[j]] = numinv[k] + 1;
    }
  }

  return sq;
}

// =============================================================================
// Latin solver (faithful port of latin.c)
// =============================================================================

const DIFF_EASY = 0;
const DIFF_HARD = 1;
const DIFF_EXTREME = 2;
const DIFF_UNREASONABLE = 3;

const diff_impossible = 10;
const diff_ambiguous = 11;
const diff_unfinished = 12;

interface LatinSolver {
  o: number;
  cube: Uint8Array; // o^3: cube[x*o*o + y*o + (n-1)]
  grid: number[]; // o^2: grid[y*o+x]
  row: Uint8Array; // o^2: row[y*o+n-1] = true if n placed in row y
  col: Uint8Array; // o^2: col[x*o+n-1] = true if n placed in col x
}

function cubepos(solver: LatinSolver, x: number, y: number, n: number): number {
  return x * solver.o * solver.o + y * solver.o + (n - 1);
}

function getCube(solver: LatinSolver, x: number, y: number, n: number): number {
  return solver.cube[cubepos(solver, x, y, n)];
}

function setCube(solver: LatinSolver, x: number, y: number, n: number, val: number): void {
  solver.cube[cubepos(solver, x, y, n)] = val;
}

function latinSolverPlace(solver: LatinSolver, x: number, y: number, n: number): void {
  const o = solver.o;

  // Rule out all other numbers in this square
  for (let i = 1; i <= o; i++) if (i !== n) setCube(solver, x, y, i, 0);

  // Rule out this number in all other positions in the row
  for (let i = 0; i < o; i++) if (i !== y) setCube(solver, x, i, n, 0);

  // Rule out this number in all other positions in the column
  for (let i = 0; i < o; i++) if (i !== x) setCube(solver, i, y, n, 0);

  // Enter the number in the result grid
  solver.grid[y * o + x] = n;

  // Cross out from row/col lists
  solver.row[y * o + n - 1] = 1;
  solver.col[x * o + n - 1] = 1;
}

function latinSolverAlloc(grid: number[], o: number): LatinSolver {
  const solver: LatinSolver = {
    o,
    cube: new Uint8Array(o * o * o),
    grid,
    row: new Uint8Array(o * o),
    col: new Uint8Array(o * o),
  };

  solver.cube.fill(1); // TRUE = possible
  solver.row.fill(0);
  solver.col.fill(0);

  for (let x = 0; x < o; x++)
    for (let y = 0; y < o; y++)
      if (grid[y * o + x]) latinSolverPlace(solver, x, y, grid[y * o + x]);

  return solver;
}

/**
 * latin_solver_elim: if exactly one possibility remains in a line through
 * the cube, place it. Returns +1 progress, 0 nothing, -1 impossible.
 */
function latinSolverElim(solver: LatinSolver, start: number, step: number): number {
  const o = solver.o;
  let m = 0;
  let fpos = -1;

  for (let i = 0; i < o; i++) {
    if (solver.cube[start + i * step]) {
      fpos = start + i * step;
      m++;
    }
  }

  if (m === 1) {
    const n = 1 + (fpos % o);
    let yy = (fpos / o) | 0;
    const x = (yy / o) | 0;
    yy %= o;
    if (!solver.grid[yy * o + x]) {
      latinSolverPlace(solver, x, yy, n);
      return +1;
    }
  } else if (m === 0) {
    return -1;
  }

  return 0;
}

/**
 * latin_solver_diff_simple: row/column positional + numeric elimination.
 */
function latinSolverDiffSimple(solver: LatinSolver): number {
  const o = solver.o;
  let ret: number;

  // Row-wise positional elimination
  for (let y = 0; y < o; y++)
    for (let n = 1; n <= o; n++)
      if (!solver.row[y * o + n - 1]) {
        ret = latinSolverElim(solver, cubepos(solver, 0, y, n), o * o);
        if (ret !== 0) return ret;
      }

  // Column-wise positional elimination
  for (let x = 0; x < o; x++)
    for (let n = 1; n <= o; n++)
      if (!solver.col[x * o + n - 1]) {
        ret = latinSolverElim(solver, cubepos(solver, x, 0, n), o);
        if (ret !== 0) return ret;
      }

  // Numeric elimination
  for (let x = 0; x < o; x++)
    for (let y = 0; y < o; y++)
      if (!solver.grid[y * o + x]) {
        ret = latinSolverElim(solver, cubepos(solver, x, y, 1), 1);
        if (ret !== 0) return ret;
      }

  return 0;
}

/**
 * latin_solver_set: subset/superset elimination.
 */
function latinSolverSet(solver: LatinSolver, start: number, step1: number, step2: number): number {
  const o = solver.o;

  // Winnow: find rows with single 1 and remove them
  const origRow = new Uint8Array(o);
  const origCol = new Uint8Array(o);
  origRow.fill(1);
  origCol.fill(1);

  for (let i = 0; i < o; i++) {
    let count = 0;
    let first = -1;
    for (let j = 0; j < o; j++)
      if (solver.cube[start + i * step1 + j * step2]) {
        first = j;
        count++;
      }

    if (count === 0) return -1;
    if (count === 1) {
      origRow[i] = 0;
      origCol[first] = 0;
    }
  }

  // Convert to index lists
  const tmpRow: number[] = [];
  const tmpCol: number[] = [];
  for (let i = 0; i < o; i++) if (origRow[i]) tmpRow.push(i);
  for (let i = 0; i < o; i++) if (origCol[i]) tmpCol.push(i);
  const n = tmpRow.length;

  const rowidx = new Uint8Array(n);
  const colidx = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rowidx[i] = tmpRow[i];
    colidx[i] = tmpCol[i];
  }

  // Create smaller matrix
  const grid = new Uint8Array(n * o);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      grid[i * o + j] = solver.cube[start + rowidx[i] * step1 + colidx[j] * step2];

  // Search for rectangle of zeroes
  const set = new Uint8Array(n);
  set.fill(0);
  let count = 0;
  while (true) {
    if (count > 1 && count < n - 1) {
      let rows = 0;
      for (let i = 0; i < n; i++) {
        let ok = true;
        for (let j = 0; j < n; j++)
          if (set[j] && grid[i * o + j]) {
            ok = false;
            break;
          }
        if (ok) rows++;
      }

      if (rows > n - count) return -1;

      if (rows >= n - count) {
        let progress = false;

        for (let i = 0; i < n; i++) {
          let ok = true;
          for (let j = 0; j < n; j++)
            if (set[j] && grid[i * o + j]) {
              ok = false;
              break;
            }
          if (!ok) {
            for (let j = 0; j < n; j++)
              if (!set[j] && grid[i * o + j]) {
                const fpos = start + rowidx[i] * step1 + colidx[j] * step2;
                progress = true;
                solver.cube[fpos] = 0;
              }
          }
        }

        if (progress) return +1;
      }
    }

    // Binary increment of set[]
    let i = n;
    while (i > 0 && set[i - 1]) {
      set[--i] = 0;
      count--;
    }
    if (i > 0) {
      set[--i] = 1;
      count++;
    } else {
      break;
    }
  }

  return 0;
}

function latinSolverDiffSet(solver: LatinSolver, extreme: boolean): number {
  const o = solver.o;
  let ret: number;

  if (!extreme) {
    // Row-wise set elimination
    for (let y = 0; y < o; y++) {
      ret = latinSolverSet(solver, cubepos(solver, 0, y, 1), o * o, 1);
      if (ret !== 0) return ret;
    }
    // Column-wise set elimination
    for (let x = 0; x < o; x++) {
      ret = latinSolverSet(solver, cubepos(solver, x, 0, 1), o, 1);
      if (ret !== 0) return ret;
    }
  } else {
    // Row-vs-column set elimination on a single number
    for (let n = 1; n <= o; n++) {
      ret = latinSolverSet(solver, cubepos(solver, 0, 0, n), o * o, o);
      if (ret !== 0) return ret;
    }
  }
  return 0;
}

/**
 * Forcing chains (faithful port of latin_solver_forcing from latin.c).
 */
function latinSolverForcing(solver: LatinSolver): number {
  const o = solver.o;
  const numberArr = new Uint8Array(o * o);
  const neighbours = new Int32Array(2 * o);
  const bfsqueue = new Int32Array(o * o);

  for (let y = 0; y < o; y++)
    for (let x = 0; x < o; x++) {
      let count = 0;
      let t = 0;
      for (let n = 1; n <= o; n++)
        if (getCube(solver, x, y, n)) {
          count++;
          t += n;
        }
      if (count !== 2) continue;

      for (let n = 1; n <= o; n++)
        if (getCube(solver, x, y, n)) {
          const orign = n;

          numberArr.fill(o + 1);
          let head = 0;
          let tail = 0;
          bfsqueue[tail++] = y * o + x;
          numberArr[y * o + x] = t - n;

          while (head < tail) {
            let xx = bfsqueue[head++];
            const yy = (xx / o) | 0;
            xx %= o;

            const currn = numberArr[yy * o + xx];

            // Find neighbours
            let nneighbours = 0;
            for (let yt = 0; yt < o; yt++) neighbours[nneighbours++] = yt * o + xx;
            for (let xt = 0; xt < o; xt++) neighbours[nneighbours++] = yy * o + xt;

            for (let i = 0; i < nneighbours; i++) {
              const xt = neighbours[i] % o;
              const yt = (neighbours[i] / o) | 0;

              if (numberArr[yt * o + xt] <= o) continue;
              if (!getCube(solver, xt, yt, currn)) continue;
              if (xt === xx && yt === yy) continue;

              let cc = 0;
              let tt = 0;
              for (let nn = 1; nn <= o; nn++)
                if (getCube(solver, xt, yt, nn)) {
                  cc++;
                  tt += nn;
                }

              if (cc === 2) {
                bfsqueue[tail++] = yt * o + xt;
                numberArr[yt * o + xt] = tt - currn;
              }

              if (currn === orign && (xt === x || yt === y)) {
                setCube(solver, xt, yt, orign, 0);
                return 1;
              }
            }
          }
        }
    }

  return 0;
}

/**
 * latin_solver_recurse: try guessing values for the most constrained square.
 */
function latinSolverRecurse(solver: LatinSolver, maxdiff: number, clues: number[]): number {
  const o = solver.o;

  let best = -1;
  let bestcount = o + 1;

  for (let y = 0; y < o; y++)
    for (let x = 0; x < o; x++)
      if (!solver.grid[y * o + x]) {
        let count = 0;
        for (let n = 1; n <= o; n++) if (getCube(solver, x, y, n)) count++;
        if (count < bestcount) {
          bestcount = count;
          best = y * o + x;
        }
      }

  if (best === -1) return 0; // already complete

  const y = (best / o) | 0;
  const x = best % o;

  const list: number[] = [];
  for (let n = 1; n <= o; n++) if (getCube(solver, x, y, n)) list.push(n);

  const ingrid = solver.grid.slice();
  let diff = diff_impossible;

  for (const val of list) {
    const outgrid = ingrid.slice();
    outgrid[y * o + x] = val;

    const ret = towersSolver(o, clues, outgrid, maxdiff);

    if (diff === diff_impossible && ret !== diff_impossible)
      solver.grid.splice(0, o * o, ...outgrid);

    if (ret === diff_ambiguous) {
      diff = diff_ambiguous;
    } else if (ret !== diff_impossible) {
      if (diff === diff_impossible) diff = DIFF_UNREASONABLE;
      else diff = diff_ambiguous;
    }

    if (diff === diff_ambiguous) break;
  }

  if (diff === diff_impossible) return -1;
  else if (diff === diff_ambiguous) return 2;
  else return 1;
}

// =============================================================================
// Towers solver macros (faithful port of towers.c)
// =============================================================================

/**
 * STARTSTEP: given a clue index (0..4w-1), compute the start position
 * and step through the grid array.
 *
 * From towers.c:
 *   - clue 0..w-1: top, looking down columns
 *   - clue w..2w-1: bottom, looking up columns
 *   - clue 2w..3w-1: left, looking right along rows
 *   - clue 3w..4w-1: right, looking left along rows
 */
function startStep(index: number, w: number): { start: number; step: number } {
  if (index < w) {
    return { start: index, step: w };
  } else if (index < 2 * w) {
    return { start: (w - 1) * w + (index - w), step: -w };
  } else if (index < 3 * w) {
    return { start: w * (index - 2 * w), step: 1 };
  } else {
    return { start: w * (index - 3 * w) + (w - 1), step: -1 };
  }
}

/**
 * CSTARTSTEP: the "cube" version of STARTSTEP, rotated by 2w.
 * This maps the clue index to positions in the cube array.
 */
function cStartStep(index: number, w: number): { start: number; step: number } {
  return startStep((index + 2 * w) % (4 * w), w);
}

// =============================================================================
// Towers-specific solver heuristics (faithful port from towers.c)
// =============================================================================

interface TowersSolverCtx {
  w: number;
  diff: number;
  clues: number[];
  started: boolean;
  iscratch: number[]; // long (used as bitmask)
  dscratch: number[];
}

/**
 * solver_easy: straightforward towers-specific deductions.
 *
 * Faithful port of solver_easy() from towers.c.
 */
function solverEasy(solver: LatinSolver, ctx: TowersSolverCtx): number {
  const w = ctx.w;
  let ret = 0;

  if (!ctx.started) {
    ctx.started = true;
    /*
     * One-off loop to help get started: when a pair of facing
     * clues sum to w+1, it must mean that the row consists of
     * two increasing sequences back to back, so we can
     * immediately place the highest digit by knowing the
     * lengths of those two sequences.
     */
    for (let c = 0; c < 3 * w; c = c === w - 1 ? 2 * w : c + 1) {
      const c2 = c + w;

      if (ctx.clues[c] && ctx.clues[c2] && ctx.clues[c] + ctx.clues[c2] === w + 1) {
        const ss = startStep(c, w);
        const css = cStartStep(c, w);
        const pos = ss.start + (ctx.clues[c] - 1) * ss.step;
        const cpos = css.start + (ctx.clues[c] - 1) * css.step;
        if (solver.cube[cpos * w + w - 1]) {
          latinSolverPlace(solver, pos % w, (pos / w) | 0, w);
          ret = 1;
        } else {
          ret = -1;
        }
      }
    }

    if (ret) return ret;
  }

  /*
   * Go over every clue doing reasonably simple heuristic deductions.
   */
  for (let c = 0; c < 4 * w; c++) {
    const clue = ctx.clues[c];
    if (!clue) continue;
    const ss = startStep(c, w);
    const css = cStartStep(c, w);

    /* Find the location of each number in the row. */
    for (let i = 0; i < w; i++) ctx.dscratch[i] = w;
    for (let i = 0; i < w; i++)
      if (solver.grid[ss.start + i * ss.step])
        ctx.dscratch[solver.grid[ss.start + i * ss.step] - 1] = i;

    let n = 0;
    let _m = 0;
    let furthest = w;
    for (let i = w; i >= 1; i--) {
      if (ctx.dscratch[i - 1] === w) {
        break;
      } else if (ctx.dscratch[i - 1] < furthest) {
        furthest = ctx.dscratch[i - 1];
        _m = i;
        n++;
      }
    }

    if (clue === n + 1 && furthest > 1) {
      /*
       * We can already see an increasing sequence of the very
       * highest numbers, of length one less than that
       * specified in the clue. All of those numbers _must_ be
       * part of the clue sequence, so the number right next
       * to the clue must be the final one - i.e. it must be
       * bigger than any of the numbers between it and m. This
       * allows us to rule out small numbers in that square.
       */
      let j = furthest - 1; /* number of small numbers we can rule out */
      for (let i = 1; i <= w && j > 0; i++) {
        if (ctx.dscratch[i - 1] < w && ctx.dscratch[i - 1] >= furthest)
          continue; /* skip this number, it's elsewhere */
        j--;
        if (solver.cube[css.start * w + i - 1]) {
          solver.cube[css.start * w + i - 1] = 0;
          ret = 1;
        }
      }
    }

    if (ret) return ret;

    let ii = 0;
    for (n = w; n > 0; n--) {
      /*
       * The largest number cannot occur in the first (clue-1)
       * squares of the row, or else there wouldn't be space
       * for a sufficiently long increasing sequence which it
       * terminated. The second-largest number (not counting
       * any that are known to be on the far side of a larger
       * number and hence excluded from this sequence) cannot
       * occur in the first (clue-2) squares, similarly, and
       * so on.
       */

      if (ctx.dscratch[n - 1] < w) {
        let mm: number;
        for (mm = n + 1; mm < w; mm++) if (ctx.dscratch[mm] < ctx.dscratch[n - 1]) break;
        if (mm < w) continue; /* this number doesn't count */
      }

      for (let j = 0; j < clue - ii - 1; j++)
        if (solver.cube[(css.start + j * css.step) * w + n - 1]) {
          solver.cube[(css.start + j * css.step) * w + n - 1] = 0;
          ret = 1;
        }
      ii++;
    }
  }

  if (ret) return ret;

  return 0;
}

/**
 * solver_hard: exhaustive analysis of all valid permutations for each clue.
 *
 * Faithful port of solver_hard() from towers.c.
 */
function solverHard(solver: LatinSolver, ctx: TowersSolverCtx): number {
  const w = ctx.w;

  /*
   * Go over every clue analysing all possibilities.
   */
  for (let c = 0; c < 4 * w; c++) {
    const clue = ctx.clues[c];
    if (!clue) continue;
    const css = cStartStep(c, w);

    for (let i = 0; i < w; i++) ctx.iscratch[i] = 0;

    /*
     * Iterate through all valid permutations of digits for this
     * row/column, checking which ones match the clue.
     */
    let i = 0;
    ctx.dscratch[i] = 0;
    let best = 0;
    let n = 0;
    let bitmap = 0;

    while (true) {
      if (i < w) {
        /*
         * Find the next valid value for cell i.
         */
        const limit = n === clue ? best : w;
        const pos = css.start + css.step * i;
        let j: number;
        for (j = ctx.dscratch[i] + 1; j <= limit; j++) {
          if (bitmap & (1 << j)) continue; /* used this one already */
          if (!solver.cube[pos * w + j - 1]) continue; /* ruled out already */
          /* Found one. */
          break;
        }

        if (j > limit) {
          /* No valid values left; drop back. */
          i--;
          if (i < 0) break; /* overall iteration is finished */
          bitmap &= ~(1 << ctx.dscratch[i]);
          if (ctx.dscratch[i] === best) {
            n--;
            best = 0;
            for (let jj = 0; jj < i; jj++) if (best < ctx.dscratch[jj]) best = ctx.dscratch[jj];
          }
        } else {
          /* Got a valid value; store it and move on. */
          bitmap |= 1 << j;
          ctx.dscratch[i++] = j;
          if (j > best) {
            best = j;
            n++;
          }
          ctx.dscratch[i] = 0;
        }
      } else {
        if (n === clue) {
          for (let j = 0; j < w; j++) ctx.iscratch[j] |= 1 << ctx.dscratch[j];
        }
        i--;
        bitmap &= ~(1 << ctx.dscratch[i]);
        if (ctx.dscratch[i] === best) {
          n--;
          best = 0;
          for (let j = 0; j < i; j++) if (best < ctx.dscratch[j]) best = ctx.dscratch[j];
        }
      }
    }

    let ret = 0;

    for (i = 0; i < w; i++) {
      const pos = css.start + css.step * i;
      for (let j = 1; j <= w; j++) {
        if (solver.cube[pos * w + j - 1] && !(ctx.iscratch[i] & (1 << j))) {
          solver.cube[pos * w + j - 1] = 0;
          ret = 1;
        }
      }

      /*
       * Once we find one clue we can do something with in
       * this way, revert to trying easier deductions.
       */
      if (ret) return ret;
    }
  }

  return 0;
}

// =============================================================================
// Full towers solver (combines latin solver with towers heuristics)
// =============================================================================

/**
 * Towers solver — faithful port of solver() + latin_solver_top() from
 * towers.c and latin.c.
 *
 * Returns the difficulty level at which it was solved, or one of the
 * special values diff_impossible, diff_ambiguous, diff_unfinished.
 */
function towersSolver(w: number, clues: number[], soln: number[], maxdiff: number): number {
  const solver = latinSolverAlloc(soln, w);

  const ctx: TowersSolverCtx = {
    w,
    diff: maxdiff,
    clues,
    started: false,
    iscratch: new Array(w).fill(0),
    dscratch: new Array(w + 1).fill(0),
  };

  // User solvers array: [easy, hard, null (extreme), null (unreasonable)]
  const usersolvers: Array<((s: LatinSolver, c: TowersSolverCtx) => number) | null> = [
    solverEasy,
    solverHard,
    null,
    null,
  ];

  let diff = DIFF_EASY;

  // Main solving loop
  outer: while (true) {
    for (let i = 0; i <= maxdiff; i++) {
      let ret = 0;

      // User solver
      if (usersolvers[i]) {
        ret = usersolvers[i](solver, ctx);
      }

      // latin_solver_diff_simple at level DIFF_EASY
      if (ret === 0 && i === DIFF_EASY) {
        ret = latinSolverDiffSimple(solver);
      }

      // latin_solver_diff_set (non-extreme) at level DIFF_HARD
      if (ret === 0 && i === DIFF_HARD) {
        ret = latinSolverDiffSet(solver, false);
      }

      // latin_solver_diff_set (extreme) at level DIFF_EXTREME
      if (ret === 0 && i === DIFF_EXTREME) {
        ret = latinSolverDiffSet(solver, true);
      }

      // latin_solver_forcing at level DIFF_EXTREME
      if (ret === 0 && i === DIFF_EXTREME) {
        ret = latinSolverForcing(solver);
      }

      if (ret < 0) {
        return diff_impossible;
      } else if (ret > 0) {
        diff = Math.max(diff, i);
        continue outer;
      }
    }

    // No progress made in this iteration
    break;
  }

  // Last chance: recursion at DIFF_UNREASONABLE
  if (maxdiff === DIFF_UNREASONABLE) {
    const nsol = latinSolverRecurse(solver, DIFF_UNREASONABLE, clues);
    if (nsol < 0) return diff_impossible;
    else if (nsol === 1) diff = DIFF_UNREASONABLE;
    else if (nsol > 1) return diff_ambiguous;
    // nsol === 0: was already complete
  } else {
    // Check if grid is fully solved
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) if (!solver.grid[y * w + x]) return diff_unfinished;
  }

  return diff;
}

// =============================================================================
// Puzzle generation (faithful port of new_game_desc from towers.c)
// =============================================================================

function generateTowers(w: number): TowersPuzzle {
  const a = w * w;

  /*
   * Difficulty exceptions: from towers.c.
   * For small grids, cap the difficulty.
   */
  let diff = DIFF_EASY;
  // We generate Easy puzzles (always leave all clues) for the game.
  // For sizes <= 3, cap at DIFF_HARD.
  if (diff > DIFF_HARD && w <= 3) diff = DIFF_HARD;

  const cluesArr = new Array<number>(4 * w).fill(0);
  const soln = new Array<number>(a).fill(0);
  const soln2 = new Array<number>(a).fill(0);
  const order = new Array<number>(Math.max(4 * w, a)).fill(0);

  let grid: number[] | null = null;

  while (true) {
    /*
     * Construct a latin square to be the solution.
     */
    grid = latinGenerate(w);

    /*
     * Fill in the clues.
     */
    for (let i = 0; i < 4 * w; i++) {
      const ss = startStep(i, w);
      let k = 0;
      let best = 0;
      for (let j = 0; j < w; j++) {
        if (grid[ss.start + j * ss.step] > best) {
          best = grid[ss.start + j * ss.step];
          k++;
        }
      }
      cluesArr[i] = k;
    }

    /*
     * Remove the grid numbers and then the clues, one by one,
     * for as long as the game remains soluble at the given
     * difficulty.
     */
    for (let i = 0; i < a; i++) soln[i] = grid[i];

    if (diff === DIFF_EASY && w <= 5) {
      /*
       * Special case: for Easy-mode grids that are small
       * enough, it's nice to be able to find completely empty
       * grids.
       */
      for (let i = 0; i < a; i++) soln2[i] = 0;
      const ret = towersSolver(w, cluesArr, soln2, diff);
      if (ret > diff) continue;
    }

    /* Try removing grid numbers one by one */
    for (let i = 0; i < a; i++) order[i] = i;
    shuffle(order, a);
    for (let i = 0; i < a; i++) {
      const j = order[i];
      for (let k = 0; k < a; k++) soln2[k] = grid[k];
      soln2[j] = 0;
      const ret = towersSolver(w, cluesArr, soln2, diff);
      if (ret <= diff) grid[j] = 0;
    }

    if (diff > DIFF_EASY) {
      /* Also try removing clues for harder difficulties */
      for (let i = 0; i < 4 * w; i++) order[i] = i;
      shuffle(order, 4 * w);
      for (let i = 0; i < 4 * w; i++) {
        const j = order[i];
        const clue = cluesArr[j];
        for (let k = 0; k < a; k++) soln2[k] = grid[k];
        cluesArr[j] = 0;
        const ret = towersSolver(w, cluesArr, soln2, diff);
        if (ret > diff) cluesArr[j] = clue;
      }
    }

    /*
     * See if the game can be solved at the specified difficulty
     * level, but not at the one below.
     */
    for (let i = 0; i < a; i++) soln2[i] = grid[i];
    const ret = towersSolver(w, cluesArr, soln2, diff);
    if (ret !== diff) continue; /* go round again */

    /*
     * We've got a usable puzzle!
     */
    break;
  }

  // Build the public puzzle structure
  const playerGrid = new Array<number>(a);
  const lockedCells = new Array<boolean>(a);
  for (let i = 0; i < a; i++) {
    playerGrid[i] = grid?.[i];
    lockedCells[i] = grid?.[i] !== 0;
  }

  const topClues = new Array<number>(w);
  const bottomClues = new Array<number>(w);
  const leftClues = new Array<number>(w);
  const rightClues = new Array<number>(w);
  for (let i = 0; i < w; i++) {
    topClues[i] = cluesArr[i];
    bottomClues[i] = cluesArr[w + i];
    leftClues[i] = cluesArr[2 * w + i];
    rightClues[i] = cluesArr[3 * w + i];
  }

  return {
    size: w,
    grid: playerGrid,
    solution: soln,
    clues: {
      top: topClues,
      bottom: bottomClues,
      left: leftClues,
      right: rightClues,
    },
    lockedCells,
  };
}
