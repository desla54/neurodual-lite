/**
 * Untangle puzzle generator — faithful port of Simon Tatham's untangle.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Generates a planar graph (guaranteed crossing-free layout), then shuffles
 * the node positions onto a circle to create crossings. The player must drag
 * nodes back to a crossing-free arrangement.
 *
 * Algorithm:
 * 1. Choose n points on a grid (size ~sqrt(n * POINTDENSITY))
 * 2. Greedily add edges: pick lowest-degree vertex, try nearest neighbours,
 *    skip if it would exceed MAXDEGREE or cross an existing edge/point
 * 3. Place nodes on a circle, shuffle the mapping until at least one crossing
 *    exists, producing the puzzle's starting layout
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UntanglePuzzle {
  /** Node positions (shuffled — the puzzle start state) */
  nodes: { x: number; y: number }[];
  /** Edges as index pairs [a, b] where a < b */
  edges: [number, number][];
  /** The original crossing-free layout (solution) */
  solutionNodes?: { x: number; y: number }[];
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const UNTANGLE_PRESETS = {
  easy: { n: 6 },
  medium: { n: 10 },
  hard: { n: 15 },
} as const;

// ---------------------------------------------------------------------------
// Constants (matching C source)
// ---------------------------------------------------------------------------

const POINTDENSITY = 3;
const MAXDEGREE = 4;

function coordLimit(n: number): number {
  return Math.floor(Math.sqrt(n * POINTDENSITY));
}

// ---------------------------------------------------------------------------
// Point with rational coordinates (x/d, y/d)
// ---------------------------------------------------------------------------

interface RPoint {
  x: number;
  y: number;
  d: number;
}

// ---------------------------------------------------------------------------
// Segment intersection test
//
// Port of Tatham's cross(). Uses JavaScript doubles (53-bit mantissa) instead
// of the C code's manual 64-bit ints. The coordinate values are small enough
// (grid size ~sqrt(n*3), denominator 64 for circle points) that products fit
// well within 53-bit precision.
// ---------------------------------------------------------------------------

function dotprod(a: number, b: number, p: number, q: number): number {
  return a * b + p * q;
}

function sign(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

/**
 * Returns true if segments (a1,a2) and (b1,b2) intersect (including endpoint
 * touches and collinear overlaps).
 */
function cross(a1: RPoint, a2: RPoint, b1: RPoint, b2: RPoint): boolean {
  // Vector b1-a1
  let b1x = b1.x * a1.d - a1.x * b1.d;
  let b1y = b1.y * a1.d - a1.y * b1.d;
  // Vector b2-a1
  let b2x = b2.x * a1.d - a1.x * b2.d;
  let b2y = b2.y * a1.d - a1.y * b2.d;
  // Perpendicular to a2-a1
  let px = a1.y * a2.d - a2.y * a1.d;
  let py = a2.x * a1.d - a1.x * a2.d;

  // Dot products of (b1-a1) and (b2-a1) with the perpendicular
  let d1 = dotprod(b1x, px, b1y, py);
  let d2 = dotprod(b2x, px, b2y, py);

  // Same non-zero sign → no crossing
  if ((sign(d1) > 0 && sign(d2) > 0) || (sign(d1) < 0 && sign(d2) < 0)) {
    return false;
  }

  // Collinear case
  if (sign(d1) === 0 && sign(d2) === 0) {
    // Vector a2-a1
    px = a2.x * a1.d - a1.x * a2.d;
    py = a2.y * a1.d - a1.y * a2.d;
    d1 = dotprod(b1x, px, b1y, py);
    d2 = dotprod(b2x, px, b2y, py);
    if (sign(d1) < 0 && sign(d2) < 0) return false;
    const d3 = dotprod(px, px, py, py);
    if (d1 > d3 && d2 > d3) return false;
  }

  // Now check the other way: a1,a2 on opposite sides of b1-b2
  b1x = a1.x * b1.d - b1.x * a1.d;
  b1y = a1.y * b1.d - b1.y * a1.d;
  b2x = a2.x * b1.d - b1.x * a2.d;
  b2y = a2.y * b1.d - b1.y * a2.d;
  px = b1.y * b2.d - b2.y * b1.d;
  py = b2.x * b1.d - b1.x * b2.d;
  d1 = dotprod(b1x, px, b1y, py);
  d2 = dotprod(b2x, px, b2y, py);
  if ((sign(d1) > 0 && sign(d2) > 0) || (sign(d1) < 0 && sign(d2) < 0)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sorted edge set (simple array-based replacement for tree234)
// ---------------------------------------------------------------------------

interface Edge {
  a: number;
  b: number;
}

function edgeCmp(a: Edge, b: Edge): number {
  if (a.a !== b.a) return a.a - b.a;
  return a.b - b.b;
}

class EdgeSet {
  private readonly items: Edge[] = [];

  add(a: number, b: number): void {
    const e: Edge = { a: Math.min(a, b), b: Math.max(a, b) };
    // Binary-search insert
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (edgeCmp(this.items[mid]!, e) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, e);
  }

  has(a: number, b: number): boolean {
    const e: Edge = { a: Math.min(a, b), b: Math.max(a, b) };
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const c = edgeCmp(this.items[mid]!, e);
      if (c === 0) return true;
      if (c < 0) lo = mid + 1;
      else hi = mid;
    }
    return false;
  }

  get(i: number): Edge | undefined {
    return this.items[i];
  }

  get length(): number {
    return this.items.length;
  }

  toArray(): Edge[] {
    return this.items;
  }
}

// ---------------------------------------------------------------------------
// Vertex priority queue (sorted by degree then index)
// ---------------------------------------------------------------------------

interface Vertex {
  param: number; // degree
  vindex: number;
}

function vertCmp(a: Vertex, b: Vertex): number {
  if (a.param !== b.param) return a.param - b.param;
  return a.vindex - b.vindex;
}

class VertexSet {
  private items: Vertex[] = [];

  add(v: Vertex): void {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (vertCmp(this.items[mid]!, v) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, v);
  }

  remove(v: Vertex): void {
    // Find by identity
    const idx = this.items.indexOf(v);
    if (idx >= 0) this.items.splice(idx, 1);
  }

  get(i: number): Vertex | undefined {
    return this.items[i];
  }

  get length(): number {
    return this.items.length;
  }
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle
// ---------------------------------------------------------------------------

function shuffleNumbers(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// Circle layout (port of make_circle)
// ---------------------------------------------------------------------------

function makeCircle(n: number, w: number): RPoint[] {
  const d = 64; // PREFERRED_TILESIZE
  const c = (d * w) / 2;
  const r = (d * w * 3) / 7;
  const pts: RPoint[] = [];

  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n;
    const x = r * Math.sin(angle);
    const y = -r * Math.cos(angle);
    pts.push({
      x: Math.round(c + x),
      y: Math.round(c + y),
      d,
    });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Core generation (port of new_game_desc)
// ---------------------------------------------------------------------------

function generateGraph(n: number): {
  pts: RPoint[];
  edges: EdgeSet;
} {
  const w = coordLimit(n);

  // Choose n distinct grid positions
  const totalCells = w * w;
  const cells: number[] = [];
  for (let i = 0; i < totalCells; i++) cells.push(i);
  shuffleNumbers(cells);

  const pts: RPoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: cells[i]! % w,
      y: Math.floor(cells[i]! / w),
      d: 1,
    });
  }

  // Build sorted vertex set (by degree, then index)
  const vs: Vertex[] = [];
  const vertices = new VertexSet();
  for (let i = 0; i < n; i++) {
    const v: Vertex = { param: 0, vindex: i };
    vs.push(v);
    vertices.add(v);
  }

  const edges = new EdgeSet();
  const vlist: Vertex[] = [];

  // Greedy edge addition
  while (true) {
    let added = false;

    for (let i = 0; i < n; i++) {
      const v = vertices.get(i);
      if (!v) break;
      const j = v.vindex;
      if (v.param >= MAXDEGREE) break;

      // Collect candidate endpoints sorted by distance
      vlist.length = 0;
      for (let k = i + 1; k < n; k++) {
        const kv = vertices.get(k);
        if (!kv) break;
        const ki = kv.vindex;
        if (kv.param >= MAXDEGREE || edges.has(ki, j)) continue;

        const dx = pts[ki]!.x - pts[j]!.x;
        const dy = pts[ki]!.y - pts[j]!.y;
        vlist.push({ vindex: ki, param: dx * dx + dy * dy });
      }

      vlist.sort(vertCmp);

      let foundEdge = false;
      for (let k = 0; k < vlist.length; k++) {
        const ki = vlist[k]!.vindex;

        // Check if edge passes through any other point
        let blocked = false;
        for (let p = 0; p < n; p++) {
          if (p !== ki && p !== j && cross(pts[ki]!, pts[j]!, pts[p]!, pts[p]!)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        // Check if edge crosses any existing edge
        let crossesExisting = false;
        for (let p = 0; p < edges.length; p++) {
          const e = edges.get(p)!;
          if (e.a !== ki && e.a !== j && e.b !== ki && e.b !== j) {
            if (cross(pts[ki]!, pts[j]!, pts[e.a]!, pts[e.b]!)) {
              crossesExisting = true;
              break;
            }
          }
        }
        if (crossesExisting) continue;

        // Add edge, update degrees
        edges.add(j, ki);
        added = true;
        vertices.remove(vs[j]!);
        vs[j]!.param++;
        vertices.add(vs[j]!);
        vertices.remove(vs[ki]!);
        vs[ki]!.param++;
        vertices.add(vs[ki]!);
        foundEdge = true;
        break;
      }

      if (foundEdge) break;
    }

    if (!added) break;
  }

  return { pts, edges };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a random Untangle puzzle.
 *
 * @param n - Number of nodes (minimum 4)
 * @returns A puzzle with shuffled node positions and edges
 */
export function generateUntangle(n: number): UntanglePuzzle {
  if (n < 4) {
    throw new Error('Number of points must be at least 4');
  }

  const w = coordLimit(n);
  const { pts: solutionPts, edges } = generateGraph(n);

  // Build circle layout for the shuffled presentation
  const circlePts = makeCircle(n, w);

  // Create a permutation and shuffle until at least one crossing exists
  const perm: number[] = [];
  for (let i = 0; i < n; i++) perm.push(i);

  const edgeArr = edges.toArray();
  let hasCrossing = false;
  let attempts = 0;
  const maxAttempts = 1000;

  while (!hasCrossing && attempts < maxAttempts) {
    shuffleNumbers(perm);
    attempts++;

    // Check if any pair of edges crosses under this permutation
    for (let i = 0; i < edgeArr.length && !hasCrossing; i++) {
      const e1 = edgeArr[i]!;
      for (let j = i + 1; j < edgeArr.length; j++) {
        const e2 = edgeArr[j]!;
        // Skip edges that share an endpoint
        if (e2.a === e1.a || e2.a === e1.b || e2.b === e1.a || e2.b === e1.b) {
          continue;
        }
        if (
          cross(
            circlePts[perm[e1.a]!]!,
            circlePts[perm[e1.b]!]!,
            circlePts[perm[e2.a]!]!,
            circlePts[perm[e2.b]!]!,
          )
        ) {
          hasCrossing = true;
          break;
        }
      }
    }
  }

  // Build the shuffled node positions (what the player sees)
  const nodes: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cp = circlePts[perm[i]!]!;
    nodes.push({ x: cp.x / cp.d, y: cp.y / cp.d });
  }

  // Remap edges through the permutation so indices match the shuffled nodes
  const resultEdges: [number, number][] = [];
  for (const e of edgeArr) {
    const a = Math.min(perm[e.a]!, perm[e.b]!);
    const b = Math.max(perm[e.a]!, perm[e.b]!);
    resultEdges.push([a, b]);
  }
  // Sort for deterministic output
  resultEdges.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));

  // Build solution node positions
  const solutionNodes: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    // The solution for shuffled node perm[i] is the original position of point i
    // But we need to index by the shuffled node index.
    // shuffled node index perm[i] came from original point i
    // So solutionNodes[perm[i]] = solutionPts[i]
    const sp = solutionPts[i]!;
    const idx = perm[i]!;
    // We'll fill a sparse array and compact after
    solutionNodes[idx] = { x: sp.x / sp.d + 0.5, y: sp.y / sp.d + 0.5 };
  }

  return { nodes, edges: resultEdges, solutionNodes };
}
