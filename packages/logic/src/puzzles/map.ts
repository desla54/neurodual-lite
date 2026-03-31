/**
 * Map colouring puzzle generator — faithful port of Simon Tatham's map.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * The algorithm:
 * 1. Generates a planar map by growing regions from random seeds on a grid
 * 2. Converts the grid into an adjacency graph
 * 3. Four-colours the graph using recursive backtracking
 * 4. Strips clues one by one, verifying unique solvability via a constraint solver
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MapPuzzle {
  /** Total number of regions */
  regions: number;
  /** Pairs of adjacent region indices */
  adjacency: [number, number][];
  /** Colour per region (0..colours-1) */
  solution: number[];
  /** Pre-filled clues: region index -> colour */
  clues: Map<number, number>;
  /** Number of colours used */
  colours: number;
  /** Grid of region IDs (row-major, h rows x w cols) — useful for grid-based rendering */
  grid: number[][];
  /** Grid width */
  w: number;
  /** Grid height */
  h: number;
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const MAP_PRESETS = {
  easy: { w: 5, h: 5, regions: 10, colours: 4 },
  medium: { w: 8, h: 8, regions: 20, colours: 4 },
  hard: { w: 10, h: 10, regions: 30, colours: 4 },
} as const;

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const FOUR = 4;
const FIVE = FOUR + 1;

/** Weights for region-growth heuristic */
const WEIGHT_INCREASED = 2;
const WEIGHT_DECREASED = 4;
const WEIGHT_UNCHANGED = 3;

/** Solver difficulty levels */
const DIFF_EASY = 0;
const DIFF_NORMAL = 1;
const DIFF_HARD = 2;
const DIFF_RECURSE = 3;

// ---------------------------------------------------------------------------
// RNG helper
// ---------------------------------------------------------------------------

function randomUpto(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomUpto(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// Cumulative frequency table (Fenwick-tree-like structure from Tatham)
// ---------------------------------------------------------------------------

function cfInit(table: Int32Array): void {
  table.fill(0);
}

function cfAdd(table: Int32Array, _n: number, sym: number, count: number): void {
  let bit = 1;
  let s = sym;
  while (s !== 0) {
    if (s & bit) {
      table[s]! += count;
      s &= ~bit;
    }
    bit <<= 1;
  }
  table[0]! += count;
}

function cfClookup(table: Int32Array, n: number, sym: number): number {
  if (sym === 0) return 0;

  let count = table[0]!;
  let bit = 1;
  while (bit < n) bit <<= 1;
  let limit = n;

  while (bit > 0) {
    const index = ((sym + bit - 1) & ~(bit * 2 - 1)) + bit;
    if (index < limit) {
      count -= table[index]!;
      limit = index;
    }
    bit >>= 1;
  }
  return count;
}

function cfSlookup(table: Int32Array, n: number, sym: number): number {
  let count = table[sym]!;
  for (let bit = 1; sym + bit < n && !(sym & bit); bit <<= 1) {
    count -= table[sym + bit]!;
  }
  return count;
}

function cfWhichsym(table: Int32Array, n: number, count: number): number {
  let bit = 1;
  while (bit < n) bit <<= 1;

  let sym = 0;
  let top = table[0]!;

  while (bit > 0) {
    if (sym + bit < n) {
      if (count >= top - table[sym + bit]!) {
        sym += bit;
      } else {
        top -= table[sym + bit]!;
      }
    }
    bit >>= 1;
  }
  return sym;
}

// ---------------------------------------------------------------------------
// Map generation — grow regions from seeds
// ---------------------------------------------------------------------------

/**
 * Determine which region colours can extend into square (x,y).
 * If index < 0, returns total weight of all valid extensions.
 * If index >= 0, returns the colour selected by that weighted index.
 */
function extendOptions(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
  x: number,
  y: number,
  index: number,
): number {
  if (map[y * w + x]! >= 0) {
    return 0;
  }

  // Fetch the eight neighbours in order around the square
  const col = new Int32Array(8);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const idx = dy < 0 ? 6 - dx : dy > 0 ? 2 + dx : 2 * (1 + dx);
      if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
        col[idx] = map[(y + dy) * w + (x + dx)]!;
      } else {
        col[idx] = -1;
      }
    }
  }

  let total = 0;

  for (let c = 0; c < n; c++) {
    // Count orthogonal neighbours with colour c
    let neighbours = 0;
    for (let i = 0; i < 8; i += 2) {
      if (col[i] === c) neighbours++;
    }
    if (neighbours === 0) continue;

    // Check simply-connectedness: count runs of colour c around the 8 neighbours
    let runs = 0;
    for (let i = 0; i < 8; i++) {
      if (col[i] === c && col[(i + 1) & 7] !== c) runs++;
    }
    if (runs > 1) continue;

    // Weight based on perimeter effect
    const count =
      neighbours === 1 ? WEIGHT_INCREASED : neighbours === 2 ? WEIGHT_UNCHANGED : WEIGHT_DECREASED;

    total += count;
    if (index >= 0 && index < count) return c;
    index -= count;
  }

  return total;
}

function genmap(w: number, h: number, n: number, map: Int32Array): void {
  const wh = w * h;
  const tmp = new Int32Array(wh);

  // Clear map, set up tmp as list of grid indices
  map.fill(-1);
  for (let i = 0; i < wh; i++) tmp[i] = i;

  // Place region seeds
  let k = wh;
  for (let i = 0; i < n; i++) {
    const j = randomUpto(k);
    map[tmp[j]!] = i;
    tmp[j] = tmp[--k]!;
  }

  // Re-initialise tmp as cumulative frequency table
  cfInit(tmp);

  // Set up initial frequencies
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cfAdd(tmp, wh, y * w + x, extendOptions(w, h, n, map, x, y, -1));
    }
  }

  // Repeatedly extend a region into a random eligible square
  while (tmp[0]! > 0) {
    let rk = randomUpto(tmp[0]!);
    const sq = cfWhichsym(tmp, wh, rk);
    rk -= cfClookup(tmp, wh, sq);
    const x = sq % w;
    const y = (sq / w) | 0;
    const colour = extendOptions(w, h, n, map, x, y, rk);

    map[sq] = colour;

    // Re-scan the 3x3 neighbourhood
    for (let yy = Math.max(y - 1, 0); yy < Math.min(y + 2, h); yy++) {
      for (let xx = Math.max(x - 1, 0); xx < Math.min(x + 2, w); xx++) {
        cfAdd(
          tmp,
          wh,
          yy * w + xx,
          -cfSlookup(tmp, wh, yy * w + xx) + extendOptions(w, h, n, map, xx, yy, -1),
        );
      }
    }
  }

  // Normalise region labels into order
  const remap = new Int32Array(n).fill(-1);
  let nextLabel = 0;
  for (let i = 0; i < wh; i++) {
    if (remap[map[i]!]! < 0) {
      remap[map[i]!] = nextLabel++;
    }
    map[i] = remap[map[i]!]!;
  }
}

// ---------------------------------------------------------------------------
// Graph construction — convert grid map to sorted edge list
// ---------------------------------------------------------------------------

function gengraph(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
): { graph: Int32Array; ngraph: number } {
  // Build adjacency matrix (as a flat n*n boolean array)
  const adj = new Uint8Array(n * n);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = map[y * w + x]!;
      if (x + 1 < w) {
        const vx = map[y * w + (x + 1)]!;
        if (vx !== v) {
          adj[v * n + vx] = 1;
          adj[vx * n + v] = 1;
        }
      }
      if (y + 1 < h) {
        const vy = map[(y + 1) * w + x]!;
        if (vy !== v) {
          adj[v * n + vy] = 1;
          adj[vy * n + v] = 1;
        }
      }
    }
  }

  // Turn the matrix into a sorted list of encoded edges (i*n + j)
  let count = 0;
  for (let i = 0; i < n * n; i++) {
    if (adj[i]) count++;
  }

  const graph = new Int32Array(count);
  let j = 0;
  for (let i = 0; i < n * n; i++) {
    if (adj[i]) graph[j++] = i;
  }

  return { graph, ngraph: count };
}

// ---------------------------------------------------------------------------
// Graph helper functions
// ---------------------------------------------------------------------------

function graphEdgeIndex(
  graph: Int32Array,
  n: number,
  ngraph: number,
  i: number,
  j: number,
): number {
  const v = i * n + j;
  let bot = -1;
  let top = ngraph;
  while (top - bot > 1) {
    const mid = (top + bot) >> 1;
    if (graph[mid] === v) return mid;
    if (graph[mid]! < v) bot = mid;
    else top = mid;
  }
  return -1;
}

function graphAdjacent(
  graph: Int32Array,
  n: number,
  ngraph: number,
  i: number,
  j: number,
): boolean {
  return graphEdgeIndex(graph, n, ngraph, i, j) >= 0;
}

function graphVertexStart(graph: Int32Array, n: number, ngraph: number, i: number): number {
  const v = i * n;
  let bot = -1;
  let top = ngraph;
  while (top - bot > 1) {
    const mid = (top + bot) >> 1;
    if (graph[mid]! < v) bot = mid;
    else top = mid;
  }
  return top;
}

// ---------------------------------------------------------------------------
// Four-colouring via recursive backtracking
// ---------------------------------------------------------------------------

function fourcolourRecurse(
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  scratch: Int32Array,
): boolean {
  // Find uncoloured vertex with fewest free colours
  let nfree = FIVE;
  let nvert = 0;
  for (let i = 0; i < n; i++) {
    if (colouring[i]! < 0 && scratch[i * FIVE + FOUR]! <= nfree) {
      if (nfree > scratch[i * FIVE + FOUR]!) {
        nfree = scratch[i * FIVE + FOUR]!;
        nvert = 0;
      }
      nvert++;
    }
  }

  if (nvert === 0) return true; // all coloured

  // Pick a random vertex from the most-constrained set
  let pick = randomUpto(nvert);
  let chosen = -1;
  for (let i = 0; i < n; i++) {
    if (colouring[i]! < 0 && scratch[i * FIVE + FOUR] === nfree) {
      if (pick-- === 0) {
        chosen = i;
        break;
      }
    }
  }

  const start = graphVertexStart(graph, n, ngraph, chosen);

  // Collect available colours and shuffle
  const cs: number[] = [];
  for (let c = 0; c < FOUR; c++) {
    if (scratch[chosen * FIVE + c] === 0) cs.push(c);
  }
  shuffle(cs);

  for (let ci = cs.length - 1; ci >= 0; ci--) {
    const c = cs[ci]!;
    colouring[chosen] = c;

    // Update scratch: mark new colour constraint for each neighbour
    for (let j = start; j < ngraph && graph[j]! < n * (chosen + 1); j++) {
      const k = graph[j]! - chosen * n;
      if (scratch[k * FIVE + c] === 0) scratch[k * FIVE + FOUR]!--;
      scratch[k * FIVE + c]!++;
    }

    if (fourcolourRecurse(graph, n, ngraph, colouring, scratch)) return true;

    // Undo
    for (let j = start; j < ngraph && graph[j]! < n * (chosen + 1); j++) {
      const k = graph[j]! - chosen * n;
      scratch[k * FIVE + c]!--;
      if (scratch[k * FIVE + c] === 0) scratch[k * FIVE + FOUR]!++;
    }
    colouring[chosen] = -1;
  }

  return false;
}

function fourcolour(graph: Int32Array, n: number, ngraph: number, colouring: Int32Array): void {
  // scratch[i*FIVE + c] = number of neighbours of i with colour c
  // scratch[i*FIVE + FOUR] = number of free colours for i
  const scratch = new Int32Array(n * FIVE);
  for (let i = 0; i < n; i++) {
    scratch[i * FIVE + FOUR] = FOUR;
  }

  colouring.fill(-1);

  const ok = fourcolourRecurse(graph, n, ngraph, colouring, scratch);
  if (!ok) throw new Error('Four-colouring failed (should not happen)');
}

// ---------------------------------------------------------------------------
// Constraint solver
// ---------------------------------------------------------------------------

function bitcount(word: number): number {
  word = ((word & 0xa) >> 1) + (word & 0x5);
  word = ((word & 0xc) >> 2) + (word & 0x3);
  return word;
}

interface SolverScratch {
  possible: Uint8Array;
  graph: Int32Array;
  n: number;
  ngraph: number;
  bfsqueue: Int32Array;
  bfscolour: Int32Array;
  depth: number;
}

function newScratch(graph: Int32Array, n: number, ngraph: number): SolverScratch {
  return {
    possible: new Uint8Array(n),
    graph,
    n,
    ngraph,
    bfsqueue: new Int32Array(n),
    bfscolour: new Int32Array(n),
    depth: 0,
  };
}

function placeColour(
  sc: SolverScratch,
  colouring: Int32Array,
  index: number,
  colour: number,
): boolean {
  const { graph, n, ngraph } = sc;

  if (!(sc.possible[index]! & (1 << colour))) {
    return false;
  }

  sc.possible[index] = 1 << colour;
  colouring[index] = colour;

  // Rule out this colour from all neighbours
  for (
    let j = graphVertexStart(graph, n, ngraph, index);
    j < ngraph && graph[j]! < n * (index + 1);
    j++
  ) {
    const k = graph[j]! - index * n;
    sc.possible[k]! &= ~(1 << colour);
  }

  return true;
}

/**
 * Returns 0 for impossible, 1 for unique solution, 2 for ambiguous/too hard.
 */
function mapSolver(
  sc: SolverScratch,
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  difficulty: number,
): number {
  if (sc.depth === 0) {
    // Initialise
    for (let i = 0; i < n; i++) {
      sc.possible[i] = (1 << FOUR) - 1;
    }

    // Place initial clues
    for (let i = 0; i < n; i++) {
      if (colouring[i]! >= 0) {
        if (!placeColour(sc, colouring, i, colouring[i]!)) {
          return 0;
        }
      }
    }
  }

  // Main deduction loop
  while (true) {
    let doneSomething = false;

    if (difficulty < DIFF_EASY) break;

    // EASY: naked singles — find regions with only one possible colour
    for (let i = 0; i < n; i++) {
      if (colouring[i]! >= 0) continue;
      const p = sc.possible[i]!;

      if (p === 0) return 0; // impossible

      if ((p & (p - 1)) === 0) {
        // power of two = single possibility
        let c = 0;
        for (; c < FOUR; c++) {
          if (p === 1 << c) break;
        }
        placeColour(sc, colouring, i, c);
        doneSomething = true;
      }
    }

    if (doneSomething) continue;
    if (difficulty < DIFF_NORMAL) break;

    // NORMAL: pairs — adjacent regions sharing the same 2-colour set
    for (let gi = 0; gi < ngraph; gi++) {
      const j1 = (graph[gi]! / n) | 0;
      const j2 = graph[gi]! % n;

      if (j1 > j2) continue;
      if (colouring[j1]! >= 0 || colouring[j2]! >= 0) continue;
      if (sc.possible[j1] !== sc.possible[j2]) continue;

      const v = sc.possible[j1]!;
      // Check exactly two bits set
      let v2 = v & -v;
      v2 = v & ~v2;
      if (v2 === 0 || (v2 & (v2 - 1)) !== 0) continue;

      // Both j1 and j2 must use both colours; rule out from shared neighbours
      for (
        let jj = graphVertexStart(graph, n, ngraph, j1);
        jj < ngraph && graph[jj]! < n * (j1 + 1);
        jj++
      ) {
        const k = graph[jj]! - j1 * n;
        if (graphAdjacent(graph, n, ngraph, k, j2) && sc.possible[k]! & v) {
          sc.possible[k]! &= ~v;
          doneSomething = true;
        }
      }
    }

    if (doneSomething) continue;
    if (difficulty < DIFF_HARD) break;

    // HARD: forcing chains via BFS
    for (let i = 0; i < n; i++) {
      if (colouring[i]! >= 0 || bitcount(sc.possible[i]!) !== 2) continue;

      for (let c = 0; c < FOUR; c++) {
        if (!(sc.possible[i]! & (1 << c))) continue;

        const origc = 1 << c;

        sc.bfscolour.fill(-1);
        let head = 0;
        let tail = 0;
        sc.bfsqueue[tail++] = i;
        sc.bfscolour[i] = sc.possible[i]! & ~origc;

        while (head < tail) {
          const jj = sc.bfsqueue[head++]!;
          const currc = sc.bfscolour[jj]!;

          for (
            let gi = graphVertexStart(graph, n, ngraph, jj);
            gi < ngraph && graph[gi]! < n * (jj + 1);
            gi++
          ) {
            const k = graph[gi]! - jj * n;

            if (
              sc.bfscolour[k]! < 0 &&
              colouring[k]! < 0 &&
              bitcount(sc.possible[k]!) === 2 &&
              sc.possible[k]! & currc
            ) {
              sc.bfsqueue[tail++] = k;
              sc.bfscolour[k] = sc.possible[k]! & ~currc;
            }

            if (
              currc === origc &&
              graphAdjacent(graph, n, ngraph, k, i) &&
              sc.possible[k]! & currc
            ) {
              sc.possible[k]! &= ~origc;
              doneSomething = true;
            }
          }
        }
      }
    }

    if (!doneSomething) break;
  }

  // Check for complete solution
  let allDone = true;
  for (let i = 0; i < n; i++) {
    if (colouring[i]! < 0) {
      allDone = false;
      break;
    }
  }
  if (allDone) return 1;

  // Without recursion permission, give up
  if (difficulty < DIFF_RECURSE) return 2;

  // Recursive case: pick most-constrained uncoloured region
  let best = -1;
  let bestc = FIVE;
  for (let i = 0; i < n; i++) {
    if (colouring[i]! >= 0) continue;
    const bc = bitcount(sc.possible[i]!);
    if (bc < bestc) {
      best = i;
      bestc = bc;
    }
  }

  const rsc = newScratch(graph, n, ngraph);
  rsc.depth = sc.depth + 1;
  const origColouring = new Int32Array(colouring);
  const subColouring = new Int32Array(n);
  let weAlreadyGotOne = false;
  let ret = 0;

  for (let ci = 0; ci < FOUR; ci++) {
    if (!(sc.possible[best]! & (1 << ci))) continue;

    rsc.possible.set(sc.possible);
    subColouring.set(origColouring);

    placeColour(rsc, subColouring, best, ci);

    const subret = mapSolver(rsc, graph, n, ngraph, subColouring, difficulty);

    if (subret === 2 || (subret === 1 && weAlreadyGotOne)) {
      ret = 2;
      break;
    }

    if (subret === 1) {
      colouring.set(subColouring);
      weAlreadyGotOne = true;
      ret = 1;
    }
  }

  return ret;
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * Generate a map colouring puzzle.
 *
 * @param w - Grid width (minimum 2)
 * @param h - Grid height (minimum 2)
 * @param regions - Number of regions (minimum 5, maximum w*h)
 * @param colours - Number of colours (typically 4)
 */
export function generateMap(w: number, h: number, regions: number, colours: number): MapPuzzle {
  if (w < 2 || h < 2) throw new Error('Width and height must be at least 2');
  if (regions < 5) throw new Error('Must have at least 5 regions');
  if (regions > w * h) throw new Error('Too many regions to fit in grid');

  const n = regions;
  const wh = w * h;
  const map = new Int32Array(wh);

  // Solver difficulty — use DIFF_NORMAL for a nice balance of clue sparsity
  const diff = DIFF_NORMAL;

  // Main generation loop: retry until we get a solvable puzzle
  // that is not trivially solved (i.e. not already complete from clues alone)
  let mindiff = diff;
  let tries = 50;

  let graphData!: { graph: Int32Array; ngraph: number };
  let solutionColouring!: Int32Array;
  let clueColouring!: Int32Array;

  while (true) {
    // 1. Generate the region map
    genmap(w, h, n, map);

    // 2. Build adjacency graph
    graphData = gengraph(w, h, n, map);
    const { graph, ngraph } = graphData;

    // 3. Four-colour the map
    solutionColouring = new Int32Array(n);
    fourcolour(graph, n, ngraph, solutionColouring);

    // If we need fewer than 4 colours, remap (rare case)
    if (colours < FOUR) {
      // Remap colours 0..FOUR-1 into 0..colours-1
      // This may fail for some graphs; just retry
      let valid = true;
      for (let i = 0; i < n; i++) {
        if (solutionColouring[i]! >= colours) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
    }

    // 4. Strip clues while maintaining unique solvability
    clueColouring = new Int32Array(solutionColouring);

    // Count colour frequencies
    const cfreq = new Int32Array(FOUR);
    for (let i = 0; i < n; i++) {
      cfreq[solutionColouring[i]!]!++;
    }

    // Randomise removal order
    const regionOrder: number[] = [];
    for (let i = 0; i < n; i++) regionOrder.push(i);
    shuffle(regionOrder);

    for (let ri = 0; ri < n; ri++) {
      const j = regionOrder[ri]!;

      // Don't remove the last clue of any colour
      if (cfreq[clueColouring[j]!]! === 1) continue;

      // Try removing this clue
      const testColouring = new Int32Array(clueColouring);
      testColouring[j] = -1;

      const solveret = mapSolver(
        newScratch(graph, n, ngraph),
        graph,
        n,
        ngraph,
        testColouring,
        diff,
      );

      if (solveret === 1) {
        cfreq[clueColouring[j]!]!--;
        clueColouring[j] = -1;
      }
    }

    // 5. Verify the puzzle isn't trivially solvable (difficulty check)
    const checkColouring = new Int32Array(clueColouring);
    const checkResult = mapSolver(
      newScratch(graph, n, ngraph),
      graph,
      n,
      ngraph,
      checkColouring,
      mindiff - 1,
    );

    if (checkResult === 1) {
      // Too easy; relax difficulty if we've tried enough times
      if (mindiff > 0 && (n < 9 || n > (2 * wh) / 3)) {
        if (tries-- <= 0) mindiff = 0;
      }
      continue;
    }

    break;
  }

  // Build output
  const { graph, ngraph } = graphData;

  // Extract adjacency pairs (deduplicated: only i < j)
  const adjacency: [number, number][] = [];
  for (let gi = 0; gi < ngraph; gi++) {
    const i = (graph[gi]! / n) | 0;
    const j = graph[gi]! % n;
    if (i < j) {
      adjacency.push([i, j]);
    }
  }

  // Build solution array
  const solution: number[] = [];
  for (let i = 0; i < n; i++) {
    solution.push(solutionColouring[i]!);
  }

  // Build clues map
  const clues = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (clueColouring[i]! >= 0) {
      clues.set(i, clueColouring[i]!);
    }
  }

  // Build 2D grid (row-major) from flat map array
  const grid: number[][] = [];
  for (let r = 0; r < h; r++) {
    const row: number[] = [];
    for (let c = 0; c < w; c++) {
      row.push(map[r * w + c]!);
    }
    grid.push(row);
  }

  return {
    regions: n,
    adjacency,
    solution,
    clues,
    colours,
    grid,
    w,
    h,
  };
}
