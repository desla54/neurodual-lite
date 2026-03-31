/**
 * Keen (KenKen) puzzle generator — faithful port of Simon Tatham's keen.c
 *
 * Ports the following C algorithms:
 *   - DSF (disjoint set forest) from dsf.c
 *   - Maxflow (Edmonds-Karp) from maxflow.c
 *   - latin_generate() from latin.c (maxflow-based latin square generation)
 *   - Cage generation from keen.c new_game_desc()
 *   - Full constraint solver from keen.c + latin.c
 *   - Difficulty filtering / winnowing from keen.c new_game_desc()
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 */

// =============================================================================
// Public API
// =============================================================================

export interface KeenPuzzle {
  /** Player grid (0 = empty, 1-N = digit). */
  grid: number[];
  /** Grid side length (e.g. 4, 5, 6). */
  size: number;
  /** Cage definitions. */
  cages: { cells: number[]; op: string; target: number }[];
  /** The unique solution (1-N digits, row-major). */
  solution: number[];
}

export function generateKeenPuzzle(size: number): KeenPuzzle {
  if (size < 3 || size > 9) {
    throw new RangeError('Size must be between 3 and 9');
  }
  return generateKeen(size);
}

// =============================================================================
// DSF — Disjoint Set Forest (faithful port of dsf.c)
// =============================================================================

/**
 * DSF element encoding (from dsf.c):
 *   bit 0:  inverse flag (for edsf; always 0 for plain dsf)
 *   bit 1:  is-root flag
 *   bits 2+: if root, size of tree; else, parent index
 *
 * dsf_init sets every element to 6 = (1 << 2) | (1 << 1) | 0
 *   meaning: root, size=1, not inverse.
 */
function dsfInit(dsf: Int32Array, size: number): void {
  for (let i = 0; i < size; i++) dsf[i] = 6;
}

function dsfNew(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf, size);
  return dsf;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  let inverse = 0;

  // Walk up the tree to find root
  while ((dsf[index]! & 2) === 0) {
    inverse ^= dsf[index]! & 1;
    index = dsf[index]! >> 2;
  }
  const canonicalIndex = index;

  // Path compression: update every node to point directly at root
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index]! >> 2;
    const nextInverse = inverse ^ (dsf[index]! & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return canonicalIndex;
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  // edsf_merge with inverse=0
  const i1Arr = [0];
  const i2Arr = [0];
  v1 = edsfCanonify(dsf, v1, i1Arr);
  let inv = i1Arr[0]!;
  v2 = edsfCanonify(dsf, v2, i2Arr);
  inv ^= i2Arr[0]!;

  if (v1 === v2) return;

  // Always make the smaller index the canonical element
  // "Keen depends critically on this property" — dsf.c
  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] = dsf[v1]! + ((dsf[v2]! >> 2) << 2);
  dsf[v2] = (v1 << 2) | (inv ? 1 : 0);
}

function edsfCanonify(dsf: Int32Array, index: number, inverseReturn: number[]): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index]! & 2) === 0) {
    inverse ^= dsf[index]! & 1;
    index = dsf[index]! >> 2;
  }
  const canonicalIndex = index;
  inverseReturn[0] = inverse;

  // Path compression
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index]! >> 2;
    const nextInverse = inverse ^ (dsf[index]! & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return canonicalIndex;
}

function dsfSize(dsf: Int32Array, index: number): number {
  return dsf[dsfCanonify(dsf, index)]! >> 2;
}

// =============================================================================
// Maxflow — Edmonds-Karp algorithm (faithful port of maxflow.c)
// =============================================================================

function maxflowSetupBackedges(ne: number, edges: Int32Array, backedges: Int32Array): void {
  for (let i = 0; i < ne; i++) backedges[i] = i;

  // Heapsort backedges by (dest, source) order
  let n = 0;
  while (n < ne) {
    n++;
    let i = n - 1;
    while (i > 0) {
      const p = ((i - 1) / 2) | 0;
      if (lessEdge(edges, backedges[p]!, backedges[i]!)) {
        const tmp = backedges[p]!;
        backedges[p] = backedges[i]!;
        backedges[i] = tmp;
        i = p;
      } else {
        break;
      }
    }
  }

  while (n > 0) {
    n--;
    const tmp = backedges[0]!;
    backedges[0] = backedges[n]!;
    backedges[n] = tmp;

    let i = 0;
    while (true) {
      const lc = 2 * i + 1;
      const rc = 2 * i + 2;

      if (lc >= n) break;

      if (rc >= n) {
        if (lessEdge(edges, backedges[i]!, backedges[lc]!)) {
          const t = backedges[i]!;
          backedges[i] = backedges[lc]!;
          backedges[lc] = t;
        }
        break;
      } else {
        if (
          lessEdge(edges, backedges[i]!, backedges[lc]!) ||
          lessEdge(edges, backedges[i]!, backedges[rc]!)
        ) {
          if (lessEdge(edges, backedges[lc]!, backedges[rc]!)) {
            const t = backedges[i]!;
            backedges[i] = backedges[rc]!;
            backedges[rc] = t;
            i = rc;
          } else {
            const t = backedges[i]!;
            backedges[i] = backedges[lc]!;
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

function lessEdge(edges: Int32Array, i: number, j: number): boolean {
  return (
    edges[2 * i + 1]! < edges[2 * j + 1]! ||
    (edges[2 * i + 1]! === edges[2 * j + 1]! && edges[2 * i]! < edges[2 * j]!)
  );
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
  for (let i = 0; i < ne; i++) while (j <= edges[2 * i]!) firstedge[j++] = i;
  while (j < nv) firstedge[j++] = ne;

  // Build firstbackedge index
  j = 0;
  for (let i = 0; i < ne; i++) while (j <= edges[2 * backedges[i]! + 1]!) firstbackedge[j++] = i;
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

    while (head < tail && prev[sink]! <= 0) {
      const from = todo[head++]!;

      // Forward edges
      for (let i = firstedge[from]!; i < ne && edges[2 * i]! === from; i++) {
        const to = edges[2 * i + 1]!;
        if (to === source || prev[to]! >= 0) continue;
        if (capacity[i]! >= 0 && flow[i]! >= capacity[i]!) continue;
        prev[to] = 2 * i;
        todo[tail++] = to;
      }

      // Backward edges
      for (let i = firstbackedge[from]!; i < ne && edges[2 * backedges[i]! + 1]! === from; i++) {
        const jj = backedges[i]!;
        const to = edges[2 * jj]!;
        if (to === source || prev[to]! >= 0) continue;
        if (flow[jj]! <= 0) continue;
        prev[to] = 2 * jj + 1;
        todo[tail++] = to;
      }
    }

    if (prev[sink]! >= 0) {
      // Found augmenting path — find max flow along it
      let to = sink;
      let max = -1;
      while (to !== source) {
        const i = prev[to]!;
        const from = edges[i]!;
        let spare: number;
        if (i & 1) {
          spare = flow[(i / 2) | 0]!;
        } else if (capacity[(i / 2) | 0]! >= 0) {
          spare = capacity[(i / 2) | 0]! - flow[(i / 2) | 0]!;
        } else {
          spare = -1;
        }
        if (max < 0 || (spare >= 0 && spare < max)) max = spare;
        to = from;
      }

      // Adjust flow along path
      to = sink;
      while (to !== source) {
        const i = prev[to]!;
        const from = edges[i]!;
        if (i & 1) {
          flow[(i / 2) | 0] = flow[(i / 2) | 0]! - max;
        } else {
          flow[(i / 2) | 0] = flow[(i / 2) | 0]! + max;
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

/**
 * Fisher-Yates shuffle (replaces Tatham's shuffle()).
 */
function shuffle(arr: number[] | Int32Array, n: number): void {
  for (let i = n - 1; i > 0; i--) {
    const j = randomUpto(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/**
 * Random integer in [0, limit).
 */
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
    for (let j = 0; j < o; j++) numinv[num[j]!] = j;

    // Set capacities based on existing rows
    for (let j = 0; j < o * o; j++) capacity[j] = 1;
    for (let j = 0; j < i; j++) {
      for (let k = 0; k < o; k++) {
        const n = num[sq[row[j]! * o + col[k]!]! - 1]!;
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
        if (flow[j * o + k]!) break;
      }
      sq[row[i]! * o + col[j]!] = numinv[k]! + 1;
    }
  }

  return sq;
}

// =============================================================================
// Solver constants (from keen.c and latin.h)
// =============================================================================

const DIFF_EASY = 0;
const DIFF_NORMAL = 1;
const DIFF_HARD = 2;
const DIFF_EXTREME = 3;
const DIFF_UNREASONABLE = 4;

const diff_impossible = 10;
const diff_ambiguous = 11;
const diff_unfinished = 12;

// Clue operations (from keen.c)
const C_ADD = 0x00000000;
const C_MUL = 0x20000000;
const C_SUB = 0x40000000;
const C_DIV = 0x60000000;
const CMASK = 0x60000000;

const MAXBLK = 6;

// =============================================================================
// Latin solver (faithful port of latin.c)
// =============================================================================

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
  return solver.cube[cubepos(solver, x, y, n)]!;
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
      if (grid[y * o + x]!) latinSolverPlace(solver, x, y, grid[y * o + x]!);

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
    if (solver.cube[start + i * step]!) {
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
  const grid = new Uint8Array(o * o);
  const rowidx = new Uint8Array(o);
  const colidx = new Uint8Array(o);
  const set = new Uint8Array(o);

  // Winnow: find rows with single 1 and remove them
  rowidx.fill(1);
  colidx.fill(1);
  for (let i = 0; i < o; i++) {
    let count = 0;
    let first = -1;
    for (let j = 0; j < o; j++)
      if (solver.cube[start + i * step1 + j * step2]!) {
        first = j;
        count++;
      }

    if (count === 0) return -1;
    if (count === 1) {
      rowidx[i] = 0;
      colidx[first] = 0;
    }
  }

  // Convert rowidx/colidx from booleans to index lists
  let n = 0;
  for (let i = 0, j = 0; i < o; i++) if (rowidx[i]) rowidx[j++] = i;
  for (let i = 0; i < o; i++) if (rowidx[i]) n++;
  // Recount properly
  n = 0;
  {
    const tmpRow: number[] = [];
    const tmpCol: number[] = [];
    for (let i = 0; i < o; i++) if (rowidx[i]) tmpRow.push(i);
    // Reset and rebuild
    const origRow = new Uint8Array(o);
    const origCol = new Uint8Array(o);
    origRow.fill(1);
    origCol.fill(1);
    for (let i = 0; i < o; i++) {
      let count = 0;
      let first = -1;
      for (let j = 0; j < o; j++)
        if (solver.cube[start + i * step1 + j * step2]!) {
          first = j;
          count++;
        }
      if (count === 1) {
        origRow[i] = 0;
        origCol[first] = 0;
      }
    }
    tmpRow.length = 0;
    tmpCol.length = 0;
    for (let i = 0; i < o; i++) if (origRow[i]) tmpRow.push(i);
    for (let i = 0; i < o; i++) if (origCol[i]) tmpCol.push(i);
    n = tmpRow.length;

    for (let i = 0; i < n; i++) {
      rowidx[i] = tmpRow[i]!;
      colidx[i] = tmpCol[i]!;
    }
  }

  // Create smaller matrix
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      grid[i * o + j] = solver.cube[start + rowidx[i]! * step1 + colidx[j]! * step2]!;

  // Search for rectangle of zeroes
  set.fill(0);
  let count = 0;
  while (true) {
    if (count > 1 && count < n - 1) {
      let rows = 0;
      for (let i = 0; i < n; i++) {
        let ok = true;
        for (let j = 0; j < n; j++)
          if (set[j] && grid[i * o + j]!) {
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
            if (set[j] && grid[i * o + j]!) {
              ok = false;
              break;
            }
          if (!ok) {
            for (let j = 0; j < n; j++)
              if (!set[j] && grid[i * o + j]!) {
                const fpos = start + rowidx[i]! * step1 + colidx[j]! * step2;
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
    while (i > 0 && set[i - 1]!) {
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
  const number = new Uint8Array(o * o);
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

          number.fill(o + 1);
          let head = 0;
          let tail = 0;
          bfsqueue[tail++] = y * o + x;
          number[y * o + x] = t - n;

          while (head < tail) {
            let xx = bfsqueue[head++]!;
            const yy = (xx / o) | 0;
            xx %= o;

            const currn = number[yy * o + xx]!;

            // Find neighbours
            let nneighbours = 0;
            for (let yt = 0; yt < o; yt++) neighbours[nneighbours++] = yt * o + xx;
            for (let xt = 0; xt < o; xt++) neighbours[nneighbours++] = yy * o + xt;

            for (let i = 0; i < nneighbours; i++) {
              const xt = neighbours[i]! % o;
              const yt = (neighbours[i]! / o) | 0;

              if (number[yt * o + xt]! <= o) continue;
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
                number[yt * o + xt] = tt - currn;
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

// =============================================================================
// Keen solver context (faithful port of keen.c solver)
// =============================================================================

interface KeenSolverCtx {
  w: number;
  diff: number;
  nboxes: number;
  boxes: number[]; // box start indices + trailing sentinel
  boxlist: number[]; // flattened list of cells per box (transposed)
  whichbox: number[]; // cell -> box index
  clues: number[];
  soln: number[];
  dscratch: number[];
  iscratch: number[];
}

function solverClueCandidate(ctx: KeenSolverCtx, diff: number, box: number): void {
  const w = ctx.w;
  const n = ctx.boxes[box + 1]! - ctx.boxes[box]!;

  if (diff === DIFF_EASY) {
    let mask = 0;
    for (let j = 0; j < n; j++) mask |= 1 << ctx.dscratch[j]!;
    for (let j = 0; j < n; j++) ctx.iscratch[j] = ctx.iscratch[j]! | mask;
  } else if (diff === DIFF_NORMAL) {
    for (let j = 0; j < n; j++) ctx.iscratch[j] = ctx.iscratch[j]! | (1 << ctx.dscratch[j]!);
  } else if (diff === DIFF_HARD) {
    const sq = ctx.boxlist;
    const boxStart = ctx.boxes[box]!;

    for (let j = 0; j < 2 * w; j++) ctx.iscratch[2 * w + j] = 0;
    for (let j = 0; j < n; j++) {
      const cellIdx = sq[boxStart + j]!;
      const x = (cellIdx / w) | 0;
      const y = cellIdx % w;
      ctx.iscratch[2 * w + x] = ctx.iscratch[2 * w + x]! | (1 << ctx.dscratch[j]!);
      ctx.iscratch[3 * w + y] = ctx.iscratch[3 * w + y]! | (1 << ctx.dscratch[j]!);
    }
    for (let j = 0; j < 2 * w; j++) ctx.iscratch[j] = ctx.iscratch[j]! & ctx.iscratch[2 * w + j]!;
  }
}

function solverCommon(solver: LatinSolver, ctx: KeenSolverCtx, diff: number): number {
  const w = ctx.w;
  let ret = 0;

  for (let box = 0; box < ctx.nboxes; box++) {
    const boxStart = ctx.boxes[box]!;
    const sq = ctx.boxlist;
    const n = ctx.boxes[box + 1]! - ctx.boxes[box]!;
    const value = ctx.clues[box]! & ~CMASK;
    const op = ctx.clues[box]! & CMASK;

    if (diff === DIFF_HARD) {
      for (let i = 0; i < n; i++) ctx.iscratch[i] = (1 << (w + 1)) - (1 << 1);
    } else {
      for (let i = 0; i < n; i++) ctx.iscratch[i] = 0;
    }

    switch (op) {
      case C_SUB:
      case C_DIV:
        for (let i = 1; i <= w; i++) {
          const j = op === C_SUB ? i + value : i * value;
          if (j > w) break;

          if (
            solver.cube[sq[boxStart]! * w + i - 1]! &&
            solver.cube[sq[boxStart + 1]! * w + j - 1]!
          ) {
            ctx.dscratch[0] = i;
            ctx.dscratch[1] = j;
            solverClueCandidate(ctx, diff, box);
          }

          if (
            solver.cube[sq[boxStart]! * w + j - 1]! &&
            solver.cube[sq[boxStart + 1]! * w + i - 1]!
          ) {
            ctx.dscratch[0] = j;
            ctx.dscratch[1] = i;
            solverClueCandidate(ctx, diff, box);
          }
        }
        break;

      case C_ADD:
      case C_MUL: {
        let i = 0;
        ctx.dscratch[i] = 0;
        let total = value; // start with the identity

        while (true) {
          if (i < n) {
            let j: number;
            for (j = ctx.dscratch[i]! + 1; j <= w; j++) {
              if (op === C_ADD ? total < j : total % j !== 0) continue;
              if (!solver.cube[sq[boxStart + i]! * w + j - 1]!) continue;
              let k: number;
              for (k = 0; k < i; k++)
                if (
                  ctx.dscratch[k] === j &&
                  (sq[boxStart + k]! % w === sq[boxStart + i]! % w ||
                    ((sq[boxStart + k]! / w) | 0) === ((sq[boxStart + i]! / w) | 0))
                )
                  break;
              if (k < i) continue;
              break;
            }

            if (j > w) {
              i--;
              if (i < 0) break;
              if (op === C_ADD) total += ctx.dscratch[i]!;
              else total *= ctx.dscratch[i]!;
            } else {
              ctx.dscratch[i++] = j;
              if (op === C_ADD) total -= j;
              else total = (total / j) | 0;
              ctx.dscratch[i] = 0;
            }
          } else {
            if (total === (op === C_ADD ? 0 : 1)) solverClueCandidate(ctx, diff, box);
            i--;
            if (op === C_ADD) total += ctx.dscratch[i]!;
            else total *= ctx.dscratch[i]!;
          }
        }
        break;
      }
    }

    if (diff < DIFF_HARD) {
      for (let i = 0; i < n; i++)
        for (let j = 1; j <= w; j++) {
          if (solver.cube[sq[boxStart + i]! * w + j - 1]! && !(ctx.iscratch[i]! & (1 << j))) {
            solver.cube[sq[boxStart + i]! * w + j - 1] = 0;
            ret = 1;
          }
        }
    } else {
      for (let i = 0; i < 2 * w; i++) {
        const start = i < w ? i * w : i - w;
        const step = i < w ? 1 : w;
        for (let j = 1; j <= w; j++)
          if (ctx.iscratch[i]! & (1 << j)) {
            for (let k = 0; k < w; k++) {
              const pos = start + k * step;
              if (ctx.whichbox[pos] !== box && solver.cube[pos * w + j - 1]!) {
                solver.cube[pos * w + j - 1] = 0;
                ret = 1;
              }
            }
          }
      }

      if (ret) return ret;
    }
  }

  return ret;
}

function solverEasy(solver: LatinSolver, ctx: KeenSolverCtx): number {
  if (ctx.diff > DIFF_EASY) return 0;
  return solverCommon(solver, ctx, DIFF_EASY);
}

function solverNormal(solver: LatinSolver, ctx: KeenSolverCtx): number {
  return solverCommon(solver, ctx, DIFF_NORMAL);
}

function solverHard(solver: LatinSolver, ctx: KeenSolverCtx): number {
  return solverCommon(solver, ctx, DIFF_HARD);
}

type UserSolverFn = ((solver: LatinSolver, ctx: KeenSolverCtx) => number) | null;

const keenSolvers: UserSolverFn[] = [
  solverEasy,
  solverNormal,
  solverHard,
  null, // EXTREME — no keen-specific solver, uses latin_solver set logic
  null, // UNREASONABLE — no keen-specific solver, uses recursion
];

// =============================================================================
// Full latin solver loop (faithful port of latin_solver_top + recurse)
// =============================================================================

function latinSolverRecurse(
  solver: LatinSolver,
  diffSimple: number,
  diffSet0: number,
  diffSet1: number,
  diffForcing: number,
  diffRecursive: number,
  ctx: KeenSolverCtx,
): number {
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

  for (let i = 0; i < list.length; i++) {
    const outgrid = ingrid.slice();
    outgrid[y * o + x] = list[i]!;

    const subsolver = latinSolverAlloc(outgrid, o);
    const ret = latinSolverTop(
      subsolver,
      diffRecursive,
      diffSimple,
      diffSet0,
      diffSet1,
      diffForcing,
      diffRecursive,
      ctx,
    );

    if (diff === diff_impossible && ret !== diff_impossible) {
      for (let k = 0; k < o * o; k++) solver.grid[k] = outgrid[k]!;
    }

    if (ret === diff_ambiguous) {
      diff = diff_ambiguous;
    } else if (ret === diff_impossible) {
      // do nothing
    } else {
      if (diff === diff_impossible) diff = diffRecursive;
      else diff = diff_ambiguous;
    }

    if (diff === diff_ambiguous) break;
  }

  if (diff === diff_impossible) return -1;
  if (diff === diff_ambiguous) return 2;
  return 1;
}

function latinSolverTop(
  solver: LatinSolver,
  maxdiff: number,
  diffSimple: number,
  diffSet0: number,
  diffSet1: number,
  diffForcing: number,
  diffRecursive: number,
  ctx: KeenSolverCtx,
): number {
  let diff = diffSimple;

  outer: while (true) {
    for (let i = 0; i <= maxdiff; i++) {
      let ret = 0;

      // User solvers
      if (i < keenSolvers.length && keenSolvers[i]) {
        ret = keenSolvers[i]!(solver, ctx);
      }

      if (ret === 0 && i === diffSimple) ret = latinSolverDiffSimple(solver);
      if (ret === 0 && i === diffSet0) ret = latinSolverDiffSet(solver, false);
      if (ret === 0 && i === diffSet1) ret = latinSolverDiffSet(solver, true);
      if (ret === 0 && i === diffForcing) ret = latinSolverForcing(solver);

      if (ret < 0) {
        diff = diff_impossible;
        return diff;
      } else if (ret > 0) {
        diff = Math.max(diff, i);
        continue outer;
      }
    }

    break;
  }

  // Last chance: recursion
  if (maxdiff === diffRecursive) {
    const nsol = latinSolverRecurse(
      solver,
      diffSimple,
      diffSet0,
      diffSet1,
      diffForcing,
      diffRecursive,
      ctx,
    );
    if (nsol < 0) diff = diff_impossible;
    else if (nsol === 1) diff = diffRecursive;
    else if (nsol > 1) diff = diff_ambiguous;
  } else {
    const o = solver.o;
    for (let y = 0; y < o; y++)
      for (let x = 0; x < o; x++) if (!solver.grid[y * o + x]) diff = diff_unfinished;
  }

  return diff;
}

/**
 * Top-level solver entry point (keen.c solver()).
 */
function keenSolve(
  w: number,
  dsf: Int32Array,
  clues: number[],
  soln: number[],
  maxdiff: number,
): number {
  const a = w * w;

  // Build solver context — transform dsf-formatted clues
  // Also transpose x,y because cube array puts x first
  let nboxes = 0;
  for (let i = 0; i < a; i++) if (dsfCanonify(dsf, i) === i) nboxes++;

  const boxlist: number[] = new Array(a).fill(0);
  const boxes: number[] = new Array(nboxes + 1).fill(0);
  const clueArr: number[] = new Array(nboxes).fill(0);
  const whichbox: number[] = new Array(a).fill(0);

  let n = 0;
  let m = 0;
  for (let i = 0; i < a; i++) {
    if (dsfCanonify(dsf, i) === i) {
      clueArr[n] = clues[i]!;
      boxes[n] = m;
      for (let j = 0; j < a; j++) {
        if (dsfCanonify(dsf, j) === i) {
          boxlist[m] = (j % w) * w + ((j / w) | 0); // transpose
          whichbox[boxlist[m]!] = n;
          m++;
        }
      }
      n++;
    }
  }
  boxes[n] = m;

  const ctx: KeenSolverCtx = {
    w,
    diff: maxdiff,
    nboxes,
    boxes,
    boxlist,
    whichbox,
    clues: clueArr,
    soln,
    dscratch: new Array(a + 1).fill(0),
    iscratch: new Array(Math.max(a + 1, 4 * w)).fill(0),
  };

  // Fill soln with zeros, then call the latin solver
  for (let i = 0; i < a; i++) soln[i] = 0;

  const solver = latinSolverAlloc(soln, w);
  const ret = latinSolverTop(
    solver,
    maxdiff,
    DIFF_EASY,
    DIFF_HARD,
    DIFF_EXTREME,
    DIFF_EXTREME,
    DIFF_UNREASONABLE,
    ctx,
  );

  return ret;
}

// =============================================================================
// Puzzle generation (faithful port of keen.c new_game_desc)
// =============================================================================

function generateKeen(size: number): KeenPuzzle {
  const w = size;
  const a = w * w;
  let diff = DIFF_NORMAL;

  // Difficulty exception from keen.c
  if (w === 3 && diff > DIFF_NORMAL) diff = DIFF_NORMAL;

  const order = new Array<number>(a);
  const revorder = new Array<number>(a);
  const singletons = new Array<number>(a);
  const dsf = dsfNew(a);
  const clues = new Array<number>(a).fill(0);
  const cluevals = new Array<number>(a).fill(0);
  const soln = new Array<number>(a).fill(0);

  let grid: number[];
  let attempts = 0;
  const MAX_ATTEMPTS = 1000;

  while (true) {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      // Safety valve — fall back to EASY difficulty
      diff = DIFF_EASY;
      attempts = 0;
    }

    // 1. Generate a latin square
    grid = latinGenerate(w);

    // 2. Divide grid into blocks (cages)
    for (let i = 0; i < a; i++) order[i] = i;
    shuffle(order, a);
    for (let i = 0; i < a; i++) revorder[order[i]!] = i;

    for (let i = 0; i < a; i++) singletons[i] = 1;

    dsfInit(dsf, a);

    // Place dominoes
    for (let i = 0; i < a; i++) {
      if (singletons[i]) {
        let best = -1;
        const x = i % w;
        const y = (i / w) | 0;

        if (x > 0 && singletons[i - 1] && (best === -1 || revorder[i - 1]! < revorder[best]!))
          best = i - 1;
        if (x + 1 < w && singletons[i + 1] && (best === -1 || revorder[i + 1]! < revorder[best]!))
          best = i + 1;
        if (y > 0 && singletons[i - w] && (best === -1 || revorder[i - w]! < revorder[best]!))
          best = i - w;
        if (y + 1 < w && singletons[i + w] && (best === -1 || revorder[i + w]! < revorder[best]!))
          best = i + w;

        // Place domino with probability 3/4
        if (best >= 0 && randomUpto(4)) {
          singletons[i] = 0;
          singletons[best] = 0;
          dsfMerge(dsf, i, best);
        }
      }
    }

    // Fold in singletons
    for (let i = 0; i < a; i++) {
      if (singletons[i]) {
        let best = -1;
        const x = i % w;
        const y = (i / w) | 0;

        if (
          x > 0 &&
          dsfSize(dsf, i - 1) < MAXBLK &&
          (best === -1 || revorder[i - 1]! < revorder[best]!)
        )
          best = i - 1;
        if (
          x + 1 < w &&
          dsfSize(dsf, i + 1) < MAXBLK &&
          (best === -1 || revorder[i + 1]! < revorder[best]!)
        )
          best = i + 1;
        if (
          y > 0 &&
          dsfSize(dsf, i - w) < MAXBLK &&
          (best === -1 || revorder[i - w]! < revorder[best]!)
        )
          best = i - w;
        if (
          y + 1 < w &&
          dsfSize(dsf, i + w) < MAXBLK &&
          (best === -1 || revorder[i + w]! < revorder[best]!)
        )
          best = i + w;

        if (best >= 0) {
          singletons[i] = 0;
          singletons[best] = 0;
          dsfMerge(dsf, i, best);
        }
      }
    }

    // Check for remaining singletons
    let hasSingleton = false;
    for (let i = 0; i < a; i++) {
      if (singletons[i]) {
        hasSingleton = true;
        break;
      }
    }
    if (hasSingleton) continue;

    // 3. Decide clue types for each block
    const F_ADD = 0x01;
    const F_SUB = 0x02;
    const F_MUL = 0x04;
    const F_DIV = 0x08;
    const BAD_SHIFT = 4;

    for (let i = 0; i < a; i++) {
      singletons[i] = 0;
      const j = dsfCanonify(dsf, i);
      const k = dsfSize(dsf, j);
      if (j === i && k > 2) {
        singletons[j] = singletons[j]! | F_ADD | F_MUL;
      } else if (j !== i && k === 2) {
        const p0 = grid[j]!;
        const q0 = grid[i]!;
        const p = Math.max(p0, q0);
        const q = Math.min(p0, q0);

        // Addition
        const vAdd = p + q;
        if (vAdd > 4 && vAdd < 2 * w - 2) singletons[j] = singletons[j]! | F_ADD;
        else singletons[j] = singletons[j]! | (F_ADD << BAD_SHIFT);

        // Multiplication
        const vMul = p * q;
        let mulOptions = 0;
        for (let kk = 1; kk <= w; kk++)
          if (vMul % kk === 0 && vMul / kk <= w && vMul / kk !== kk) mulOptions++;
        if (mulOptions <= 2 && diff > DIFF_NORMAL)
          singletons[j] = singletons[j]! | (F_MUL << BAD_SHIFT);
        else singletons[j] = singletons[j]! | F_MUL;

        // Subtraction
        const vSub = p - q;
        if (vSub < w - 1) singletons[j] = singletons[j]! | F_SUB;

        // Division
        if (p % q === 0 && 2 * (p / q) <= w) singletons[j] = singletons[j]! | F_DIV;
      }
    }

    // Choose clues, trying to balance types
    shuffle(order, a);
    for (let i = 0; i < a; i++) clues[i] = 0;

    while (true) {
      let doneSomething = false;

      for (let k = 0; k < 4; k++) {
        let clue: number;
        let good: number;
        switch (k) {
          case 0:
            clue = C_DIV;
            good = F_DIV;
            break;
          case 1:
            clue = C_SUB;
            good = F_SUB;
            break;
          case 2:
            clue = C_MUL;
            good = F_MUL;
            break;
          default:
            clue = C_ADD;
            good = F_ADD;
            break;
        }

        let found = false;
        for (let i = 0; i < a; i++) {
          const j = order[i]!;
          if (singletons[j]! & good) {
            clues[j] = clue;
            singletons[j] = 0;
            found = true;
            break;
          }
        }
        if (!found) {
          // Try bad candidates
          const bad = good << BAD_SHIFT;
          for (let i = 0; i < a; i++) {
            const j = order[i]!;
            if (singletons[j]! & bad) {
              clues[j] = clue;
              singletons[j] = 0;
              found = true;
              break;
            }
          }
        }
        if (found) doneSomething = true;
      }

      if (!doneSomething) break;
    }

    // 4. Calculate clue values
    for (let i = 0; i < a; i++) cluevals[i] = 0;
    for (let i = 0; i < a; i++) {
      const j = dsfCanonify(dsf, i);
      if (j === i) {
        cluevals[j] = grid[i]!;
      } else {
        switch (clues[j]) {
          case C_ADD:
            cluevals[j] = cluevals[j]! + grid[i]!;
            break;
          case C_MUL:
            cluevals[j] = cluevals[j]! * grid[i]!;
            break;
          case C_SUB:
            cluevals[j] = Math.abs(cluevals[j]! - grid[i]!);
            break;
          case C_DIV: {
            const d1 = cluevals[j]!;
            const d2 = grid[i]!;
            if (d1 === 0 || d2 === 0) cluevals[j] = 0;
            else cluevals[j] = ((d2 / d1) | 0) + ((d1 / d2) | 0);
            break;
          }
        }
      }
    }

    // Combine clue values into clues array
    for (let i = 0; i < a; i++) {
      const j = dsfCanonify(dsf, i);
      if (j === i) {
        clues[j] = clues[j]! | cluevals[j]!;
      }
    }

    // 5. Check solvability at the right difficulty
    if (diff > 0) {
      for (let i = 0; i < a; i++) soln[i] = 0;
      const ret = keenSolve(w, dsf, clues, soln, diff - 1);
      if (ret <= diff - 1) continue;
    }
    for (let i = 0; i < a; i++) soln[i] = 0;
    const ret = keenSolve(w, dsf, clues, soln, diff);
    if (ret !== diff) continue;

    // We have a usable puzzle!
    break;
  }

  // Build the output cages
  const cages: { cells: number[]; op: string; target: number }[] = [];
  for (let i = 0; i < a; i++) {
    if (dsfCanonify(dsf, i) === i) {
      const cells: number[] = [];
      for (let j = 0; j < a; j++) {
        if (dsfCanonify(dsf, j) === i) cells.push(j);
      }

      let op: string;
      switch (clues[i]! & CMASK) {
        case C_ADD:
          op = '+';
          break;
        case C_SUB:
          op = '-';
          break;
        case C_MUL:
          op = 'x';
          break;
        case C_DIV:
          op = '/';
          break;
        default:
          op = '+';
      }

      const target = clues[i]! & ~CMASK;
      cages.push({ cells, op, target });
    }
  }

  return {
    grid: new Array(a).fill(0),
    size: w,
    cages,
    solution: grid!,
  };
}
