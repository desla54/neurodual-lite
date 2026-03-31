// @ts-nocheck
/**
 * Tents puzzle generator — faithful port of Simon Tatham's tents.c
 *
 * Ports the following C algorithms:
 *   - Maxflow (Edmonds-Karp) from maxflow.c
 *   - tents_solve() solver from tents.c
 *   - new_game_desc() generator from tents.c (tent placement + maxflow tree matching)
 *   - Difficulty filtering (EASY / TRICKY) from tents.c
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 */

// =============================================================================
// Public API
// =============================================================================

export interface TentsPuzzle {
  /** Flat grid, row-major: 'B'=blank, 'T'=tree, 'E'=tent (solution). */
  grid: string[];
  /** Number of tents expected in each column (indices 0..w-1). */
  colClues: number[];
  /** Number of tents expected in each row (indices 0..h-1). */
  rowClues: number[];
  /** Width of the grid. */
  w: number;
  /** Height of the grid. */
  h: number;
  /** Flat solution grid, row-major: true = tent at this cell. */
  solution: boolean[];
  /** Tree positions as flat indices. */
  trees: number[];
  /** Tent positions as flat indices (the solution). */
  tents: number[];
}

/**
 * Generate a valid Tents puzzle of the given dimensions.
 *
 * Faithfully ports Simon Tatham's new_game_desc() from tents.c:
 *   1. Place tents randomly, ensuring no two are (even diagonally) adjacent.
 *   2. Use Edmonds-Karp maxflow to find a matching from tents to adjacent
 *      blank squares (tree placement).
 *   3. Verify unique solvability via the constraint solver.
 *   4. Retry until a valid puzzle is found.
 */
export function generateTentsPuzzle(w: number, h: number, difficulty?: number): TentsPuzzle {
  if (w < 4 || h < 4) {
    throw new RangeError('Width and height must both be at least 4');
  }
  return newGameDesc(w, h, difficulty);
}

// =============================================================================
// Cell types — matching tents.c enum { BLANK, TREE, TENT, NONTENT, MAGIC }
// =============================================================================

const BLANK = 0;
const TREE = 1;
const TENT = 2;
const NONTENT = 3;
const MAGIC = 4;

// =============================================================================
// Direction helpers — matching tents.c enum { N, U, L, R, D, MAXDIR }
// =============================================================================

const _N_DIR = 0; // "no direction" (unlinked)
const U = 1;
const L = 2;
const R = 3;
const D = 4;
const MAXDIR = 5;

function dx(d: number): number {
  return (d === R ? 1 : 0) - (d === L ? 1 : 0);
}
function dy(d: number): number {
  return (d === D ? 1 : 0) - (d === U ? 1 : 0);
}
/** Opposite direction: F(d) = U + D - d */
function F(d: number): number {
  return U + D - d;
}

// =============================================================================
// Difficulty levels — matching tents.c
// =============================================================================

const DIFF_EASY = 0;
const DIFF_TRICKY = 1;
const _DIFFCOUNT = 2;

// =============================================================================
// PRNG — simple seedless random (Math.random based)
// =============================================================================

function randint(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randint(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// =============================================================================
// Maxflow — Edmonds-Karp (faithful port of maxflow.c)
// =============================================================================

/**
 * Sort backedges by (destination vertex, source vertex) using heapsort.
 * Faithful port of maxflow_setup_backedges() from maxflow.c.
 */
function maxflowSetupBackedges(ne: number, edges: Int32Array, backedges: Int32Array): void {
  for (let i = 0; i < ne; i++) backedges[i] = i;

  // Comparison: sort by edges[2*i+1] (dest), then edges[2*i] (src)
  function less(a: number, b: number): boolean {
    const ad = edges[2 * a + 1]!;
    const bd = edges[2 * b + 1]!;
    if (ad !== bd) return ad < bd;
    return edges[2 * a]! < edges[2 * b]!;
  }

  // Phase 1: build max-heap
  let n = 0;
  while (n < ne) {
    n++;
    let i = n - 1;
    while (i > 0) {
      const p = ((i - 1) / 2) | 0;
      if (less(backedges[p]!, backedges[i]!)) {
        const tmp = backedges[p]!;
        backedges[p] = backedges[i]!;
        backedges[i] = tmp;
        i = p;
      } else {
        break;
      }
    }
  }

  // Phase 2: extract max repeatedly
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
        if (less(backedges[i]!, backedges[lc]!)) {
          const tmp2 = backedges[i]!;
          backedges[i] = backedges[lc]!;
          backedges[lc] = tmp2;
        }
        break;
      } else {
        if (less(backedges[i]!, backedges[lc]!) || less(backedges[i]!, backedges[rc]!)) {
          let swap: number;
          if (less(backedges[lc]!, backedges[rc]!)) {
            swap = rc;
          } else {
            swap = lc;
          }
          const tmp2 = backedges[i]!;
          backedges[i] = backedges[swap]!;
          backedges[swap] = tmp2;
          i = swap;
        } else {
          break;
        }
      }
    }
  }
}

/**
 * Edmonds-Karp max flow algorithm.
 * Faithful port of maxflow_with_scratch() + maxflow() from maxflow.c.
 *
 * Returns the total flow value.
 */
function maxflow(
  nv: number,
  source: number,
  sink: number,
  ne: number,
  edges: Int32Array,
  capacity: Int32Array,
  flow: Int32Array,
  cut: Int32Array | null,
): number {
  const backedges = new Int32Array(ne);
  maxflowSetupBackedges(ne, edges, backedges);

  const todo = new Int32Array(nv);
  const prev = new Int32Array(nv);
  const firstedge = new Int32Array(nv);
  const firstbackedge = new Int32Array(nv);

  // Build firstedge: index of the first edge from each node
  let j = 0;
  for (let i = 0; i < ne; i++) {
    while (j <= edges[2 * i]!) firstedge[j++] = i;
  }
  while (j < nv) firstedge[j++] = ne;

  // Build firstbackedge: index of the first back-edge to each node
  j = 0;
  for (let i = 0; i < ne; i++) {
    while (j <= edges[2 * backedges[i]! + 1]!) firstbackedge[j++] = i;
  }
  while (j < nv) firstbackedge[j++] = ne;

  // Start with zero flow
  for (let i = 0; i < ne; i++) flow[i] = 0;
  let totalflow = 0;

  // Repeatedly find augmenting paths via BFS
  while (true) {
    // Reset prev
    for (let i = 0; i < nv; i++) prev[i] = -1;

    // BFS
    let head = 0;
    let tail = 0;
    todo[tail++] = source;

    while (head < tail && prev[sink]! <= 0) {
      const from = todo[head++]!;

      // Forward edges from `from`
      for (let i = firstedge[from]!; i < ne && edges[2 * i]! === from; i++) {
        const to = edges[2 * i + 1]!;
        if (to === source || prev[to]! >= 0) continue;
        if (capacity[i]! >= 0 && flow[i]! >= capacity[i]!) continue;
        prev[to] = 2 * i;
        todo[tail++] = to;
      }

      // Backward edges into `from`
      for (let i = firstbackedge[from]!; i < ne; i++) {
        const jj = backedges[i]!;
        if (edges[2 * jj + 1]! !== from) break;
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
        const ii = prev[to]!;
        const from2 = edges[ii]!;
        let spare: number;
        if (ii & 1) {
          spare = flow[(ii / 2) | 0]!;
        } else if (capacity[(ii / 2) | 0]! >= 0) {
          spare = capacity[(ii / 2) | 0]! - flow[(ii / 2) | 0]!;
        } else {
          spare = -1;
        }
        if (max < 0 || (spare >= 0 && spare < max)) max = spare;
        to = from2;
      }

      // Adjust flow along the path
      to = sink;
      while (to !== source) {
        const ii = prev[to]!;
        const from2 = edges[ii]!;
        if (ii & 1) {
          flow[(ii / 2) | 0] -= max;
        } else {
          flow[(ii / 2) | 0] += max;
        }
        to = from2;
      }

      totalflow += max;
      continue;
    }

    // No augmenting path found — done
    if (cut) {
      for (let i = 0; i < nv; i++) {
        cut[i] = i === source || prev[i]! >= 0 ? 0 : 1;
      }
    }
    return totalflow;
  }
}

// =============================================================================
// Solver — faithful port of tents_solve() from tents.c
// =============================================================================

/**
 * Solver. Returns 0 for impossibility, 1 for success, 2 for ambiguity/failure.
 * Faithful port of tents_solve() from tents.c.
 */
function tentsSolve(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
  soln: Int8Array,
  diff: number,
): number {
  const links = new Int8Array(w * h); // all zeroes = N_DIR (unlinked)
  const locs = new Int32Array(Math.max(w, h));
  const place = new Int8Array(Math.max(w, h));
  const mrows = new Int8Array(3 * Math.max(w, h));
  const trows = new Int8Array(3 * Math.max(w, h));

  // Set up solution array
  for (let i = 0; i < w * h; i++) soln[i] = grid[i]!;

  // Main solver loop
  while (true) {
    let done_something = false;

    // ── Any tent with only one unattached adjacent tree → tie them ──
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x]! === TENT && !links[y * w + x]) {
          let linkd = 0;
          let d: number;

          for (d = 1; d < MAXDIR; d++) {
            const x2 = x + dx(d);
            const y2 = y + dy(d);
            if (
              x2 >= 0 &&
              x2 < w &&
              y2 >= 0 &&
              y2 < h &&
              soln[y2 * w + x2]! === TREE &&
              !links[y2 * w + x2]
            ) {
              if (linkd)
                break; // found more than one
              else linkd = d;
            }
          }

          if (d === MAXDIR && linkd === 0) {
            return 0; // tent cannot link to anything
          } else if (d === MAXDIR) {
            const x2 = x + dx(linkd);
            const y2 = y + dy(linkd);
            links[y * w + x] = linkd;
            links[y2 * w + x2] = F(linkd);
            done_something = true;
          }
        }
      }
    }

    if (done_something) continue;
    if (diff < 0) break; // don't do anything else

    // ── Mark blank square as NONTENT if not adjacent to any unmatched tree ──
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x]! === BLANK) {
          let can_be_tent = false;

          for (let d = 1; d < MAXDIR; d++) {
            const x2 = x + dx(d);
            const y2 = y + dy(d);
            if (
              x2 >= 0 &&
              x2 < w &&
              y2 >= 0 &&
              y2 < h &&
              soln[y2 * w + x2]! === TREE &&
              !links[y2 * w + x2]
            ) {
              can_be_tent = true;
            }
          }

          if (!can_be_tent) {
            soln[y * w + x] = NONTENT;
            done_something = true;
          }
        }
      }
    }

    if (done_something) continue;

    // ── Mark blank as NONTENT if (diagonally) adjacent to any tent ──
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x]! === BLANK) {
          let imposs = false;

          for (let ddy = -1; ddy <= 1; ddy++) {
            for (let ddx = -1; ddx <= 1; ddx++) {
              if (ddy || ddx) {
                const x2 = x + ddx;
                const y2 = y + ddy;
                if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h && soln[y2 * w + x2]! === TENT) {
                  imposs = true;
                }
              }
            }
          }

          if (imposs) {
            soln[y * w + x] = NONTENT;
            done_something = true;
          }
        }
      }
    }

    if (done_something) continue;

    // ── Tree with exactly one {unattached tent, BLANK} adjacent → place tent there ──
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (soln[y * w + x]! === TREE && !links[y * w + x]) {
          let linkd = 0;
          let linkd2 = 0;
          let nd = 0;

          for (let d = 1; d < MAXDIR; d++) {
            const x2 = x + dx(d);
            const y2 = y + dy(d);
            if (!(x2 >= 0 && x2 < w && y2 >= 0 && y2 < h)) continue;
            if (
              soln[y2 * w + x2]! === BLANK ||
              (soln[y2 * w + x2]! === TENT && !links[y2 * w + x2])
            ) {
              if (linkd) linkd2 = d;
              else linkd = d;
              nd++;
            }
          }

          if (nd === 0) {
            return 0; // tree cannot link to anything
          } else if (nd === 1) {
            const x2 = x + dx(linkd);
            const y2 = y + dy(linkd);
            soln[y2 * w + x2] = TENT;
            links[y * w + x] = linkd;
            links[y2 * w + x2] = F(linkd);
            done_something = true;
          } else if (nd === 2 && !!dx(linkd) !== !!dx(linkd2) && diff >= DIFF_TRICKY) {
            /*
             * Two possible places, diagonally separated rather than
             * on opposite sides of the tree: the square adjacent to
             * both must be a non-tent.
             */
            const x2 = x + dx(linkd) + dx(linkd2);
            const y2 = y + dy(linkd) + dy(linkd2);
            if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h) {
              if (soln[y2 * w + x2]! === BLANK) {
                soln[y2 * w + x2] = NONTENT;
                done_something = true;
              }
            }
          }
        }
      }
    }

    if (done_something) continue;

    // ── Row/column number deductions ──
    // For each row and column, enumerate all valid tent placements
    // and find invariant squares.
    for (let i = 0; i < w + h; i++) {
      let start: number, step: number, len: number, start1: number, start2: number;

      if (i < w) {
        // Column
        start = i;
        step = w;
        len = h;
        start1 = i > 0 ? start - 1 : -1;
        start2 = i + 1 < w ? start + 1 : -1;
      } else {
        // Row
        start = (i - w) * w;
        step = 1;
        len = w;
        start1 = i > w ? start - w : -1;
        start2 = i + 1 < w + h ? start + w : -1;
      }

      if (diff < DIFF_TRICKY) {
        // In Easy mode, don't look at effect on adjacent rows/cols
        start1 = start2 = -1;
      }

      let k = numbers[i]!;

      // Count free squares and existing tents
      let n = 0;
      for (let jj = 0; jj < len; jj++) {
        if (soln[start + jj * step]! === TENT) k--;
        else if (soln[start + jj * step]! === BLANK) locs[n++] = jj;
      }

      if (n === 0) continue;

      // Set up first combination: k TENTs followed by (n-k) NONTENTs
      for (let jj = 0; jj < n; jj++) place[jj] = jj < k ? TENT : NONTENT;

      // Initialize merge row as MAGIC
      for (let jj = 0; jj < 3 * len; jj++) mrows[jj] = MAGIC;

      // Iterate over all C(n,k) combinations
      while (true) {
        // Check validity: no two adjacent tents
        let valid = true;
        for (let jj = 0; jj + 1 < n; jj++) {
          if (place[jj]! === TENT && place[jj + 1]! === TENT && locs[jj + 1]! === locs[jj]! + 1) {
            valid = false;
            break;
          }
        }

        if (valid) {
          // Build trow for this combination
          for (let jj = 0; jj < len; jj++) trows[jj] = MAGIC;
          for (let jj = len; jj < 3 * len; jj++) trows[jj] = BLANK;

          for (let jj = 0; jj < n; jj++) {
            trows[locs[jj]!] = place[jj]!;
            if (place[jj]! === TENT) {
              for (let kk = locs[jj]! - 1; kk <= locs[jj]! + 1; kk++) {
                if (kk >= 0 && kk < len) {
                  trows[len + kk] = NONTENT;
                  trows[2 * len + kk] = NONTENT;
                }
              }
            }
          }

          // Merge into mrows
          for (let jj = 0; jj < 3 * len; jj++) {
            if (trows[jj]! === MAGIC) continue;
            if (mrows[jj]! === MAGIC || mrows[jj]! === trows[jj]!) {
              mrows[jj] = trows[jj]!;
            } else {
              mrows[jj] = BLANK;
            }
          }
        }

        // Next combination of k from n
        let p = 0;
        let jj: number;
        for (jj = n - 1; jj > 0; jj--) {
          if (place[jj]! === TENT) p++;
          if (place[jj]! === NONTENT && place[jj - 1]! === TENT) {
            place[jj - 1] = NONTENT;
            place[jj] = TENT;
            while (p--) place[++jj] = TENT;
            while (++jj < n) place[jj] = NONTENT;
            break;
          }
        }
        if (jj <= 0) break; // finished all combinations
      }

      // Check if no valid placement was found at all
      if (mrows[locs[0]!]! === MAGIC) return 0; // inconsistent

      // Apply any deductions from mrows
      for (let jj = 0; jj < len; jj++) {
        for (let whichrow = 0; whichrow < 3; whichrow++) {
          const moff = whichrow * len;
          const tstart = whichrow === 0 ? start : whichrow === 1 ? start1 : start2;
          if (
            tstart >= 0 &&
            mrows[moff + jj]! !== MAGIC &&
            mrows[moff + jj]! !== BLANK &&
            soln[tstart + jj * step]! === BLANK
          ) {
            soln[tstart + jj * step] = mrows[moff + jj]!;
            done_something = true;
          }
        }
      }
    }

    if (done_something) continue;

    break; // nothing more to do
  }

  // Check if solved
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (soln[y * w + x]! === BLANK) return 2;
      if (soln[y * w + x]! !== NONTENT && links[y * w + x]! === 0) return 2;
    }
  }

  return 1;
}

// =============================================================================
// Generator — faithful port of new_game_desc() from tents.c
// =============================================================================

function newGameDesc(w: number, h: number, difficulty?: number): TentsPuzzle {
  const ntrees = ((w * h) / 5) | 0;
  const grid = new Int8Array(w * h);
  const puzzle = new Int8Array(w * h);
  const numbers = new Int32Array(w + h);
  const soln = new Int8Array(w * h);
  const temp = new Int32Array(w * h);
  const maxedges = ntrees * 4 + w * h;
  const edges = new Int32Array(2 * maxedges);
  const capacity = new Int32Array(maxedges);
  const flow = new Int32Array(maxedges);

  const diff =
    difficulty != null ? Math.max(DIFF_EASY, Math.min(DIFF_TRICKY, difficulty)) : DIFF_EASY;
  // Downgrade difficulty for very small grids (matching C logic)
  const effectiveDiff = diff > DIFF_EASY && w <= 4 && h <= 4 ? DIFF_EASY : diff;

  while (true) {
    // Arrange grid squares into random order
    for (let i = 0; i < w * h; i++) temp[i] = i;
    shuffle(Array.from(temp).map((_, i) => i)); // need to shuffle temp in place
    // Actually shuffle temp directly:
    for (let i = w * h - 1; i > 0; i--) {
      const j = randint(i + 1);
      const tmp = temp[i]!;
      temp[i] = temp[j]!;
      temp[j] = tmp;
    }

    // Place tents: first ntrees entries in temp that don't make two tents adjacent
    for (let i = 0; i < w * h; i++) grid[i] = BLANK;
    let j = ntrees;
    for (let i = 0; i < w * h && j > 0; i++) {
      const x = temp[i]! % w;
      const y = (temp[i]! / w) | 0;
      let ok = true;

      for (let ddy = -1; ddy <= 1; ddy++) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          if (
            x + ddx >= 0 &&
            x + ddx < w &&
            y + ddy >= 0 &&
            y + ddy < h &&
            grid[(y + ddy) * w + (x + ddx)]! === TENT
          ) {
            ok = false;
          }
        }
      }

      if (ok) {
        grid[temp[i]!] = TENT;
        j--;
      }
    }
    if (j > 0) continue; // couldn't place all tents

    // Build graph edges for maxflow (tent-to-tree matching)
    let nedges = 0;
    for (let i = 0; i < w * h; i++) {
      if (grid[temp[i]!]! === TENT) {
        for (let jj = 0; jj < w * h; jj++) {
          if (grid[temp[jj]!]! !== TENT) {
            const xi = temp[i]! % w;
            const yi = (temp[i]! / w) | 0;
            const xj = temp[jj]! % w;
            const yj = (temp[jj]! / w) | 0;
            if (Math.abs(xi - xj) + Math.abs(yi - yj) === 1) {
              edges[nedges * 2] = i;
              edges[nedges * 2 + 1] = jj;
              capacity[nedges] = 1;
              nedges++;
            }
          }
        }
      } else {
        // Non-tent node → edge to sink (w*h)
        edges[nedges * 2] = i;
        edges[nedges * 2 + 1] = w * h;
        capacity[nedges] = 1;
        nedges++;
      }
    }

    // Source node (w*h+1) → every tent
    for (let i = 0; i < w * h; i++) {
      if (grid[temp[i]!]! === TENT) {
        edges[nedges * 2] = w * h + 1;
        edges[nedges * 2 + 1] = i;
        capacity[nedges] = 1;
        nedges++;
      }
    }

    // Run maxflow to place trees
    const flowResult = maxflow(w * h + 2, w * h + 1, w * h, nedges, edges, capacity, flow, null);

    if (flowResult < ntrees) continue; // couldn't place all trees

    // Read back tree positions from flow
    for (let i = 0; i < nedges; i++) {
      if (edges[2 * i]! < w * h && edges[2 * i + 1]! < w * h && flow[i]! > 0) {
        grid[temp[edges[2 * i + 1]!]!] = TREE;
      }
    }

    // Check every row and column has at least one tree or tent
    let empty = false;
    for (let i = 0; i < w; i++) {
      let found = false;
      for (let jj = 0; jj < h; jj++) {
        if (grid[jj * w + i]! !== BLANK) {
          found = true;
          break;
        }
      }
      if (!found) {
        empty = true;
        break;
      }
    }
    if (empty) continue;

    for (let jj = 0; jj < h; jj++) {
      let found = false;
      for (let i = 0; i < w; i++) {
        if (grid[jj * w + i]! !== BLANK) {
          found = true;
          break;
        }
      }
      if (!found) {
        empty = true;
        break;
      }
    }
    if (empty) continue;

    // Compute numbers round the edge
    for (let i = 0; i < w; i++) {
      let n = 0;
      for (let jj = 0; jj < h; jj++) {
        if (grid[jj * w + i]! === TENT) n++;
      }
      numbers[i] = n;
    }
    for (let i = 0; i < h; i++) {
      let n = 0;
      for (let jj = 0; jj < w; jj++) {
        if (grid[i * w + jj]! === TENT) n++;
      }
      numbers[w + i] = n;
    }

    // Build puzzle grid (trees only, rest blank)
    for (let i = 0; i < w * h; i++) {
      puzzle[i] = grid[i]! === TREE ? TREE : BLANK;
    }

    // Solve at diff-1 (should fail = 2) and diff (should succeed = 1)
    const result1 = tentsSolve(w, h, puzzle, numbers, soln, effectiveDiff - 1);
    const result2 = tentsSolve(w, h, puzzle, numbers, soln, effectiveDiff);

    if (result1 === 2 && result2 === 1) {
      // Valid puzzle found!
      break;
    }
    // Otherwise retry
  }

  // Build output
  const trees: number[] = [];
  const tentsOut: number[] = [];
  const solution: boolean[] = new Array(w * h).fill(false);
  const gridOut: string[] = new Array(w * h);
  const colClues: number[] = new Array(w);
  const rowClues: number[] = new Array(h);

  for (let i = 0; i < w * h; i++) {
    if (grid[i]! === TREE) {
      gridOut[i] = 'T';
      trees.push(i);
    } else if (grid[i]! === TENT) {
      gridOut[i] = 'B'; // present as blank to the player
      solution[i] = true;
      tentsOut.push(i);
    } else {
      gridOut[i] = 'B';
    }
  }

  for (let i = 0; i < w; i++) colClues[i] = numbers[i]!;
  for (let i = 0; i < h; i++) rowClues[i] = numbers[w + i]!;

  return {
    grid: gridOut,
    colClues,
    rowClues,
    w,
    h,
    solution,
    trees,
    tents: tentsOut,
  };
}
