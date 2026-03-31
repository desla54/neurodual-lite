// @ts-nocheck
/**
 * Loopy (Slitherlink) puzzle generator — faithful port of Simon Tatham's
 * loopy.c, loopgen.c and dsf.c
 *
 * Generates a square grid puzzle where the player must draw a single closed
 * loop along cell edges. Numbers 0-4 in cells indicate how many of that
 * cell's edges are part of the loop.
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git
 * (c) Mike Pinna 2005-2006, Lambros Lambrou 2008, Simon Tatham
 *
 * Convention (from loopy.c / grid.c):
 *   w, h = number of square faces (cells) in each direction
 *   Dots: (w+1)*(h+1) vertices
 *   Edges: computed via Euler's formula: num_faces + num_dots - 1
 *   Clues: w*h, values 0-4 or -1 (no clue)
 */

// =============================================================================
// Public interface
// =============================================================================

export interface LoopyPuzzle {
  /** w*h flat array of clue numbers, -1 = no clue shown */
  clues: number[];
  /** Width of grid in cells */
  w: number;
  /** Height of grid in cells */
  h: number;
  /** Flat array of edge states for the solution: 1 = YES (part of loop), 0 = NO */
  solution: number[];
  /** Total number of edges */
  numEdges: number;
  /** Total number of dots (vertices) */
  numDots: number;
  /**
   * Edge endpoint info: for each edge index, [dot1, dot2, face1, face2].
   * face1/face2 are face indices, or -1 for the infinite (outer) face.
   */
  edges: [number, number, number, number][];
}

/**
 * Generate a Loopy (Slitherlink) puzzle.
 *
 * @param w - Width in cells (minimum 3)
 * @param h - Height in cells (minimum 3)
 * @param diff - Difficulty: 0=easy, 1=normal, 2=tricky, 3=hard (default 0)
 * @returns A LoopyPuzzle with clues and solution
 */
export function generateLoopyPuzzle(w: number, h: number, diff = 0): LoopyPuzzle {
  if (w < 3) w = 3;
  if (h < 3) h = 3;
  if (diff < 0) diff = 0;
  if (diff > DIFF_HARD) diff = DIFF_HARD;

  const g = gridNewSquare(w, h);

  // Keep trying until we get a valid puzzle at the right difficulty
  for (let _attempts = 0; ; _attempts++) {
    // Generate a random loop and fill all clues
    const state = newGameState(g);
    const solutionLines = addFullClues(state, g);

    // Verify uniquely solvable at requested difficulty
    if (!gameHasUniqueSoln(state, g, diff)) continue;

    // Remove clues while maintaining unique solvability
    const reduced = removeClues(state, g, diff);

    // If diff > 0, reject if solvable at lower difficulty
    if (diff > 0 && gameHasUniqueSoln(reduced, g, diff - 1)) continue;

    // Keep the original generator output as the reference solution.
    const solution = Array.from(solutionLines, (line) => (line === LINE_YES ? 1 : 0));

    // Build edge info for the UI
    const edgeInfo: [number, number, number, number][] = new Array(g.numEdges);
    for (let i = 0; i < g.numEdges; i++) {
      edgeInfo[i] = [g.edgeDot1[i], g.edgeDot2[i], g.edgeFace1[i], g.edgeFace2[i]];
    }

    return {
      clues: Array.from(reduced.clues),
      w,
      h,
      solution,
      numEdges: g.numEdges,
      numDots: g.numDots,
      edges: edgeInfo,
    };
  }
}

// =============================================================================
// Difficulty levels — from loopy.c
// =============================================================================

const DIFF_EASY = 0;
const DIFF_NORMAL = 1;
const DIFF_TRICKY = 2;
const DIFF_HARD = 3;
const DIFF_MAX = 4;

// =============================================================================
// Line states — from loopy.c
// =============================================================================

const LINE_YES = 0;
const LINE_UNKNOWN = 1;
const LINE_NO = 2;

function OPP(s: number): number {
  return 2 - s;
}

// =============================================================================
// Face colours — from loopgen.h
// =============================================================================

const FACE_WHITE = 0;
const FACE_GREY = 1;
const FACE_BLACK = 2;

// =============================================================================
// DSF (Disjoint Set Forest) — faithful port of dsf.c
// =============================================================================

function dsfInit(dsf: Int32Array): void {
  for (let i = 0; i < dsf.length; i++) dsf[i] = 6;
}

function newDsf(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf);
  return dsf;
}

function edsfCanonify(dsf: Int32Array, index: number, inverseOut?: { v: number }): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonicalIndex = index;

  if (inverseOut) inverseOut.v = inverse;

  // Path compression
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index] >> 2;
    const nextInverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return canonicalIndex;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  return edsfCanonify(dsf, index);
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  edsfMerge(dsf, v1, v2, 0);
}

function _dsfSize(dsf: Int32Array, index: number): number {
  return dsf[dsfCanonify(dsf, index)] >> 2;
}

function edsfMerge(dsf: Int32Array, v1: number, v2: number, inverse: number): void {
  const i1: { v: number } = { v: 0 };
  const i2: { v: number } = { v: 0 };

  v1 = edsfCanonify(dsf, v1, i1);
  inverse ^= i1.v;
  v2 = edsfCanonify(dsf, v2, i2);
  inverse ^= i2.v;

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | (inverse ? 1 : 0);
}

// =============================================================================
// PRNG — simple xorshift128 for deterministic generation
// =============================================================================

class RandomState {
  private s: Uint32Array;

  constructor(seed?: number) {
    this.s = new Uint32Array(4);
    const s = seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.s[0] = s;
    this.s[1] = s ^ 0xdeadbeef;
    this.s[2] = s ^ 0x12345678;
    this.s[3] = s ^ 0x87654321;
    // Warm up
    for (let i = 0; i < 20; i++) this.next();
  }

  next(): number {
    let t = this.s[3];
    const s = this.s[0];
    this.s[3] = this.s[2];
    this.s[2] = this.s[1];
    this.s[1] = s;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s[0] = t ^ s ^ (s >>> 19);
    return this.s[0] >>> 0;
  }

  /** Random integer in [0, n) */
  upto(n: number): number {
    return this.next() % n;
  }

  /** Random 31 bits */
  bits31(): number {
    return this.next() >>> 1;
  }
}

// =============================================================================
// Square Grid — simplified from grid.c grid_new_square + grid_make_consistent
// =============================================================================

interface SquareGrid {
  numFaces: number;
  numEdges: number;
  numDots: number;
  w: number;
  h: number;

  // Face data (index by face)
  faceOrder: Int32Array; // always 4 for square grid
  faceEdges: Int32Array[]; // faceEdges[face] = [e0, e1, e2, e3]
  faceDots: Int32Array[]; // faceDots[face] = [d0, d1, d2, d3]

  // Edge data (index by edge)
  edgeDot1: Int32Array;
  edgeDot2: Int32Array;
  edgeFace1: Int32Array; // -1 for infinite face
  edgeFace2: Int32Array; // -1 for infinite face

  // Dot data (index by dot)
  dotOrder: Int32Array;
  dotEdges: Int32Array[]; // dotEdges[dot] = list of edge indices
  dotFaces: Int32Array[]; // dotFaces[dot] = list of face indices (-1 for infinite)

  // Dot coordinates (for reference, not strictly needed for generation)
  dotX: Int32Array;
  dotY: Int32Array;
}

function gridNewSquare(w: number, h: number): SquareGrid {
  const numFaces = w * h;
  const numDots = (w + 1) * (h + 1);
  // Euler's formula for planar graph: F + V = E + 2
  // But we don't count the infinite face, so: numFaces + numDots - 1 = numEdges
  const numEdges = numFaces + numDots - 1;

  // Dot indices: dot at position (x, y) has index y * (w+1) + x
  // where x in [0, w], y in [0, h]
  function dotIndex(x: number, y: number): number {
    return y * (w + 1) + x;
  }

  // Face index: face at (x, y) has index y * w + x
  // where x in [0, w-1], y in [0, h-1]

  const dotX = new Int32Array(numDots);
  const dotY = new Int32Array(numDots);
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const d = dotIndex(x, y);
      dotX[d] = x;
      dotY[d] = y;
    }
  }

  // Build faces: each face (fx, fy) has dots going clockwise:
  //   dot0 = (fx, fy), dot1 = (fx+1, fy), dot2 = (fx+1, fy+1), dot3 = (fx, fy+1)
  const faceOrder = new Int32Array(numFaces).fill(4);
  const faceDots: Int32Array[] = new Array(numFaces);
  for (let fy = 0; fy < h; fy++) {
    for (let fx = 0; fx < w; fx++) {
      const fi = fy * w + fx;
      faceDots[fi] = new Int32Array([
        dotIndex(fx, fy),
        dotIndex(fx + 1, fy),
        dotIndex(fx + 1, fy + 1),
        dotIndex(fx, fy + 1),
      ]);
    }
  }

  // Build edges using the same approach as grid_make_consistent:
  // Iterate over faces, for each consecutive pair of dots create an edge.
  // Use a map to detect shared edges.
  const edgeMap = new Map<string, number>();
  const edgeDot1 = new Int32Array(numEdges);
  const edgeDot2 = new Int32Array(numEdges);
  const edgeFace1 = new Int32Array(numEdges);
  const edgeFace2 = new Int32Array(numEdges);
  edgeFace1.fill(-1);
  edgeFace2.fill(-1);

  let nextEdge = 0;

  function edgeKey(d1: number, d2: number): string {
    return d1 < d2 ? `${d1},${d2}` : `${d2},${d1}`;
  }

  for (let fi = 0; fi < numFaces; fi++) {
    const dots = faceDots[fi];
    for (let j = 0; j < 4; j++) {
      const j2 = (j + 1) % 4;
      const d1 = dots[j];
      const d2 = dots[j2];
      const key = edgeKey(d1, d2);
      const existing = edgeMap.get(key);
      if (existing !== undefined) {
        // Edge already exists, fill in face2
        edgeFace2[existing] = fi;
      } else {
        const ei = nextEdge++;
        edgeDot1[ei] = d1;
        edgeDot2[ei] = d2;
        edgeFace1[ei] = fi;
        edgeFace2[ei] = -1;
        edgeMap.set(key, ei);
      }
    }
  }

  // Build face edge lists (same labelling as grid.c: edgeK joins dotK and dot{K+1})
  const faceEdges: Int32Array[] = new Array(numFaces);
  for (let fi = 0; fi < numFaces; fi++) {
    faceEdges[fi] = new Int32Array(4);
    const dots = faceDots[fi];
    for (let j = 0; j < 4; j++) {
      const j2 = (j + 1) % 4;
      const key = edgeKey(dots[j], dots[j2]);
      faceEdges[fi][j] = edgeMap.get(key)!;
    }
  }

  // Build dot edge and face lists
  // First pass: count edges per dot
  const dotOrderArr = new Int32Array(numDots);
  for (let ei = 0; ei < numEdges; ei++) {
    dotOrderArr[edgeDot1[ei]]++;
    dotOrderArr[edgeDot2[ei]]++;
  }

  // Allocate dot edge/face arrays
  const dotEdges: Int32Array[] = new Array(numDots);
  const dotFaces: Int32Array[] = new Array(numDots);
  const _dotEdgeCount = new Int32Array(numDots); // current fill position

  for (let di = 0; di < numDots; di++) {
    dotEdges[di] = new Int32Array(dotOrderArr[di]);
    dotFaces[di] = new Int32Array(dotOrderArr[di]).fill(-1);
  }

  // For the square grid, we can build the dot's edge list in clockwise order
  // by going around each dot systematically.
  // A dot at position (x, y) can have up to 4 edges:
  //   - Up:    vertical edge to (x, y-1) if y > 0
  //   - Right: horizontal edge to (x+1, y) if x < w
  //   - Down:  vertical edge to (x, y+1) if y < h
  //   - Left:  horizontal edge to (x-1, y) if x > 0
  // Going clockwise, and the faces between them.

  // Build clockwise ordered edge/face lists for each dot
  for (let dy = 0; dy <= h; dy++) {
    for (let dx = 0; dx <= w; dx++) {
      const di = dotIndex(dx, dy);
      // Collect edges around this dot in clockwise order
      // Clockwise: up, right, down, left
      const edgeList: number[] = [];
      const faceList: number[] = [];

      // For a square grid, going clockwise around dot (dx, dy):
      // edge to (dx, dy-1) - up
      // face (dx, dy-1) - upper-right = face at (dx, dy-1) if valid
      // edge to (dx+1, dy) - right
      // face (dx, dy) - lower-right = face at (dx, dy) if valid
      // edge to (dx, dy+1) - down
      // face (dx-1, dy) - lower-left = face at (dx-1, dy) if valid
      // edge to (dx-1, dy) - left
      // face (dx-1, dy-1) - upper-left = face at (dx-1, dy-1) if valid

      // Up edge: connects (dx, dy) to (dx, dy-1)
      if (dy > 0) {
        const otherDot = dotIndex(dx, dy - 1);
        const key = edgeKey(di, otherDot);
        edgeList.push(edgeMap.get(key)!);
        // Face between up and right: face at (dx, dy-1) if dx < w
        if (dx < w) faceList.push(dy > 0 ? (dy - 1) * w + dx : -1);
        else faceList.push(-1);
      }

      // Right edge: connects (dx, dy) to (dx+1, dy)
      if (dx < w) {
        const otherDot = dotIndex(dx + 1, dy);
        const key = edgeKey(di, otherDot);
        edgeList.push(edgeMap.get(key)!);
        // Face between right and down: face at (dx, dy) if dy < h
        if (dy < h) faceList.push(dy * w + dx);
        else faceList.push(-1);
      }

      // Down edge: connects (dx, dy) to (dx, dy+1)
      if (dy < h) {
        const otherDot = dotIndex(dx, dy + 1);
        const key = edgeKey(di, otherDot);
        edgeList.push(edgeMap.get(key)!);
        // Face between down and left: face at (dx-1, dy) if dx > 0
        if (dx > 0) faceList.push(dy * w + (dx - 1));
        else faceList.push(-1);
      }

      // Left edge: connects (dx, dy) to (dx-1, dy)
      if (dx > 0) {
        const otherDot = dotIndex(dx - 1, dy);
        const key = edgeKey(di, otherDot);
        edgeList.push(edgeMap.get(key)!);
        // Face between left and up: face at (dx-1, dy-1) if dy > 0
        if (dy > 0) faceList.push((dy - 1) * w + (dx - 1));
        else faceList.push(-1);
      }

      dotOrderArr[di] = edgeList.length;
      dotEdges[di] = new Int32Array(edgeList);
      dotFaces[di] = new Int32Array(faceList);
    }
  }

  return {
    numFaces,
    numEdges,
    numDots,
    w,
    h,
    faceOrder,
    faceEdges,
    faceDots,
    edgeDot1,
    edgeDot2,
    edgeFace1,
    edgeFace2,
    dotOrder: dotOrderArr,
    dotEdges,
    dotFaces,
    dotX,
    dotY,
  };
}

// =============================================================================
// Game State — from loopy.c struct game_state
// =============================================================================

interface GameState {
  clues: Int8Array; // num_faces, -1 = no clue
  lines: Int8Array; // num_edges, LINE_YES/LINE_UNKNOWN/LINE_NO
}

function newGameState(g: SquareGrid): GameState {
  return {
    clues: new Int8Array(g.numFaces).fill(-1),
    lines: new Int8Array(g.numEdges).fill(LINE_UNKNOWN),
  };
}

function dupGameState(s: GameState): GameState {
  return {
    clues: new Int8Array(s.clues),
    lines: new Int8Array(s.lines),
  };
}

// =============================================================================
// Loop Generation — faithful port of loopgen.c generate_loop()
//
// The algorithm colours faces WHITE or BLACK. The boundary between WHITE
// and BLACK regions becomes the loop. We start with all faces GREY, colour
// one face WHITE (the infinite exterior is implicitly BLACK), then
// iteratively grow both regions while maintaining topological validity.
// =============================================================================

function faceColour(board: Int8Array, faceIndex: number): number {
  return faceIndex < 0 ? FACE_BLACK : board[faceIndex];
}

/**
 * Check if colouring face_index with 'colour' is legal.
 * Port of can_colour_face() from loopgen.c.
 */
function canColourFace(
  g: SquareGrid,
  board: Int8Array,
  faceIndex: number,
  colour: number,
): boolean {
  if (board[faceIndex] === colour) return false;

  // Must be adjacent to a face of the same colour
  let foundSameNeighbour = false;
  const fEdges = g.faceEdges[faceIndex];
  const order = g.faceOrder[faceIndex];
  for (let i = 0; i < order; i++) {
    const ei = fEdges[i];
    const f1 = g.edgeFace1[ei];
    const f2 = g.edgeFace2[ei];
    const neighbour = f1 === faceIndex ? f2 : f1;
    if (faceColour(board, neighbour) === colour) {
      foundSameNeighbour = true;
      break;
    }
  }
  if (!foundSameNeighbour) return false;

  const faceDots = g.faceDots[faceIndex];
  let i = 0;
  let j = 0;
  let currentFace = g.dotFaces[faceDots[0]][0];
  if (currentFace === faceIndex) {
    j = 1;
    currentFace = g.dotFaces[faceDots[0]][1];
  }

  let transitions = 0;
  let currentState = faceColour(board, currentFace) === colour ? 1 : 0;
  let startingDot = -1;
  let startingFace = -2;

  while (true) {
    while (true) {
      j++;
      if (j === g.dotOrder[faceDots[i]]) j = 0;

      if (g.dotFaces[faceDots[i]][j] === faceIndex) {
        i++;
        if (i === order) i = 0;

        const nextDot = faceDots[i];
        const nextDotFaces = g.dotFaces[nextDot];
        for (j = 0; j < g.dotOrder[nextDot]; j++) {
          if (nextDotFaces[j] === currentFace) break;
        }
        if (j === g.dotOrder[nextDot]) {
          throw new Error('Invalid square grid topology while checking face colourability');
        }
      } else {
        break;
      }
    }

    currentFace = g.dotFaces[faceDots[i]][j];
    const s = faceColour(board, currentFace) === colour ? 1 : 0;
    if (startingDot < 0) {
      startingDot = faceDots[i];
      startingFace = currentFace;
      currentState = s;
    } else {
      if (s !== currentState) {
        transitions++;
        currentState = s;
        if (transitions > 2) return false;
      }
      if (faceDots[i] === startingDot && currentFace === startingFace) break;
    }
  }

  return transitions === 2;
}

/**
 * Count neighbours of a face with a given colour.
 * Port of face_num_neighbours() from loopgen.c.
 */
function faceNumNeighbours(
  g: SquareGrid,
  board: Int8Array,
  faceIndex: number,
  colour: number,
): number {
  let count = 0;
  const fEdges = g.faceEdges[faceIndex];
  for (let i = 0; i < 4; i++) {
    const ei = fEdges[i];
    const f1 = g.edgeFace1[ei];
    const f2 = g.edgeFace2[ei];
    const neighbour = f1 === faceIndex ? f2 : f1;
    if (faceColour(board, neighbour) === colour) count++;
  }
  return count;
}

/**
 * Score for face selection — higher score = fewer same-coloured neighbours
 * = more "loopy". Port of face_score() from loopgen.c.
 */
function faceScore(g: SquareGrid, board: Int8Array, faceIndex: number, colour: number): number {
  return -faceNumNeighbours(g, board, faceIndex, colour);
}

/**
 * Generate a random closed loop on the grid.
 * Faithful port of generate_loop() from loopgen.c.
 */
function generateLoop(g: SquareGrid, board: Int8Array, rs: RandomState): void {
  const numFaces = g.numFaces;

  board.fill(FACE_GREY);

  // Assign random tiebreak values to each face
  const faceRandoms = new Uint32Array(numFaces);
  for (let i = 0; i < numFaces; i++) {
    faceRandoms[i] = rs.bits31();
  }

  // Colour a random face WHITE. The infinite face is implicitly BLACK.
  const startFace = rs.upto(numFaces);
  board[startFace] = FACE_WHITE;

  // Maintain sorted lists of lightable (can go WHITE) and darkable (can go BLACK) faces.
  // Using arrays sorted by score (descending) + random tiebreak.
  // Each entry: { index, score, random }

  interface FaceEntry {
    index: number;
    score: number;
    random: number;
  }

  function compareFaceEntries(a: FaceEntry, b: FaceEntry): number {
    if (b.score !== a.score) return b.score - a.score;
    if (a.random !== b.random) return a.random < b.random ? -1 : 1;
    return a.index - b.index;
  }

  let lightable: FaceEntry[] = [];
  let darkable: FaceEntry[] = [];

  // Initialize lists
  for (let i = 0; i < numFaces; i++) {
    if (board[i] !== FACE_GREY) continue;
    if (canColourFace(g, board, i, FACE_WHITE)) {
      lightable.push({
        index: i,
        score: faceScore(g, board, i, FACE_WHITE),
        random: faceRandoms[i],
      });
    }
    if (canColourFace(g, board, i, FACE_BLACK)) {
      darkable.push({
        index: i,
        score: faceScore(g, board, i, FACE_BLACK),
        random: faceRandoms[i],
      });
    }
  }

  lightable.sort(compareFaceEntries);
  darkable.sort(compareFaceEntries);

  // Colour faces one at a time
  while (lightable.length > 0 || darkable.length > 0) {
    if (lightable.length === 0 && darkable.length === 0) break;
    if (lightable.length === 0 || darkable.length === 0) {
      throw new Error('Loop generator stalled before colouring every face');
    }

    // Choose a colour
    const colour = rs.upto(2) ? FACE_WHITE : FACE_BLACK;
    const list = colour === FACE_WHITE ? lightable : darkable;

    // Pick the best face (highest score, first in sorted list)
    const best = list[0];
    const fi = best.index;
    board[fi] = colour;

    // Remove this face from both lists
    lightable = lightable.filter((e) => e.index !== fi);
    darkable = darkable.filter((e) => e.index !== fi);

    // Update neighbors: for each face touching the newly coloured face
    // (through corners), recalculate scores
    const touchedFaces = new Set<number>();
    const _curFaceEdges = g.faceEdges[fi];
    const curFaceDots = g.faceDots[fi];

    // All faces sharing a dot with this face
    for (let i = 0; i < 4; i++) {
      const dot = curFaceDots[i];
      const dFaces = g.dotFaces[dot];
      for (let j = 0; j < g.dotOrder[dot]; j++) {
        const nf = dFaces[j];
        if (nf < 0 || nf === fi) continue;
        if (board[nf] !== FACE_GREY) continue;
        touchedFaces.add(nf);
      }
    }

    for (const nf of touchedFaces) {
      // Remove from both lists
      lightable = lightable.filter((e) => e.index !== nf);
      darkable = darkable.filter((e) => e.index !== nf);

      // Re-add if still colourable
      if (canColourFace(g, board, nf, FACE_WHITE)) {
        lightable.push({
          index: nf,
          score: faceScore(g, board, nf, FACE_WHITE),
          random: faceRandoms[nf],
        });
      }
      if (canColourFace(g, board, nf, FACE_BLACK)) {
        darkable.push({
          index: nf,
          score: faceScore(g, board, nf, FACE_BLACK),
          random: faceRandoms[nf],
        });
      }
    }

    // Re-sort after modifications
    lightable.sort(compareFaceEntries);
    darkable.sort(compareFaceEntries);
  }

  // Post-processing: flip faces to increase loopiness.
  // Shuffled face list
  const faceList = new Array(numFaces);
  for (let i = 0; i < numFaces; i++) faceList[i] = i;
  shuffle(faceList, rs);

  // Normal passes: flip faces with exactly 1 opposite-coloured neighbour
  let doRandomPass = false;
  while (true) {
    let flipped = false;

    for (let i = 0; i < numFaces; i++) {
      const j = faceList[i];
      const opp = board[j] === FACE_WHITE ? FACE_BLACK : FACE_WHITE;
      if (canColourFace(g, board, j, opp)) {
        if (doRandomPass) {
          if (rs.upto(10) === 0) board[j] = opp;
        } else {
          if (faceNumNeighbours(g, board, j, opp) === 1) {
            board[j] = opp;
            flipped = true;
          }
        }
      }
    }

    if (doRandomPass) break;
    if (!flipped) doRandomPass = true;
  }
}

function shuffle<T>(arr: T[], rs: RandomState): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rs.upto(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// =============================================================================
// Clue generation — from loopy.c add_full_clues()
// =============================================================================

function addFullClues(state: GameState, g: SquareGrid): Int8Array {
  const rs = new RandomState();
  const board = new Int8Array(g.numFaces);
  const solution = new Int8Array(g.numEdges);

  generateLoop(g, board, rs);

  // Fill clues: for each face, count edges that border WHITE/BLACK transition
  state.clues.fill(0);
  state.lines.fill(LINE_UNKNOWN);
  for (let i = 0; i < g.numEdges; i++) {
    const f1 = g.edgeFace1[i];
    const f2 = g.edgeFace2[i];
    const c1 = faceColour(board, f1);
    const c2 = faceColour(board, f2);
    if (c1 === FACE_GREY || c2 === FACE_GREY) {
      throw new Error('Loop generator left grey faces behind');
    }
    if (c1 !== c2) {
      if (f1 >= 0) state.clues[f1]++;
      if (f2 >= 0) state.clues[f2]++;
      solution[i] = LINE_YES;
    } else {
      solution[i] = LINE_NO;
    }
  }

  return solution;
}

// =============================================================================
// Solver State — from loopy.c struct solver_state
// =============================================================================

const SOLVER_SOLVED = 0;
const SOLVER_MISTAKE = 1;
const SOLVER_AMBIGUOUS = 2;
const SOLVER_INCOMPLETE = 3;

interface SolverState {
  state: GameState;
  solverStatus: number;
  looplen: Int32Array;
  diff: number;

  dotYesCount: Int8Array;
  dotNoCount: Int8Array;
  faceYesCount: Int8Array;
  faceNoCount: Int8Array;
  dotSolved: Uint8Array;
  faceSolved: Uint8Array;
  dotdsf: Int32Array;

  dlines: Int8Array | null; // 2*numEdges
  linedsf: Int32Array | null; // numEdges
}

function newSolverState(state: GameState, g: SquareGrid, diff: number): SolverState {
  const numDots = g.numDots;
  const numFaces = g.numFaces;
  const numEdges = g.numEdges;

  const looplen = new Int32Array(numDots).fill(1);

  const ss: SolverState = {
    state: dupGameState(state),
    solverStatus: SOLVER_INCOMPLETE,
    looplen,
    diff,
    dotYesCount: new Int8Array(numDots),
    dotNoCount: new Int8Array(numDots),
    faceYesCount: new Int8Array(numFaces),
    faceNoCount: new Int8Array(numFaces),
    dotSolved: new Uint8Array(numDots),
    faceSolved: new Uint8Array(numFaces),
    dotdsf: newDsf(numDots),
    dlines: diff >= DIFF_NORMAL ? new Int8Array(2 * numEdges) : null,
    linedsf: diff >= DIFF_HARD ? newDsf(numEdges) : null,
  };

  return ss;
}

function dupSolverState(sstate: SolverState, g: SquareGrid): SolverState {
  const _numDots = g.numDots;
  const _numFaces = g.numFaces;
  const _numEdges = g.numEdges;

  return {
    state: dupGameState(sstate.state),
    solverStatus: sstate.solverStatus,
    looplen: new Int32Array(sstate.looplen),
    diff: sstate.diff,
    dotYesCount: new Int8Array(sstate.dotYesCount),
    dotNoCount: new Int8Array(sstate.dotNoCount),
    faceYesCount: new Int8Array(sstate.faceYesCount),
    faceNoCount: new Int8Array(sstate.faceNoCount),
    dotSolved: new Uint8Array(sstate.dotSolved),
    faceSolved: new Uint8Array(sstate.faceSolved),
    dotdsf: new Int32Array(sstate.dotdsf),
    dlines: sstate.dlines ? new Int8Array(sstate.dlines) : null,
    linedsf: sstate.linedsf ? new Int32Array(sstate.linedsf) : null,
  };
}

// =============================================================================
// Solver utility functions — from loopy.c
// =============================================================================

function solverSetLine(sstate: SolverState, g: SquareGrid, i: number, lineNew: number): boolean {
  const state = sstate.state;
  if (state.lines[i] === lineNew) return false;
  state.lines[i] = lineNew;

  const d1 = g.edgeDot1[i];
  const d2 = g.edgeDot2[i];
  const f1 = g.edgeFace1[i];
  const f2 = g.edgeFace2[i];

  if (lineNew === LINE_YES) {
    sstate.dotYesCount[d1]++;
    sstate.dotYesCount[d2]++;
    if (f1 >= 0) sstate.faceYesCount[f1]++;
    if (f2 >= 0) sstate.faceYesCount[f2]++;
  } else {
    sstate.dotNoCount[d1]++;
    sstate.dotNoCount[d2]++;
    if (f1 >= 0) sstate.faceNoCount[f1]++;
    if (f2 >= 0) sstate.faceNoCount[f2]++;
  }

  return true;
}

function mergeDots(sstate: SolverState, g: SquareGrid, edgeIndex: number): boolean {
  let i = g.edgeDot1[edgeIndex];
  let j = g.edgeDot2[edgeIndex];

  i = dsfCanonify(sstate.dotdsf, i);
  j = dsfCanonify(sstate.dotdsf, j);

  if (i === j) return true; // Already connected = would form loop

  const len = sstate.looplen[i] + sstate.looplen[j];
  dsfMerge(sstate.dotdsf, i, j);
  const canon = dsfCanonify(sstate.dotdsf, i);
  sstate.looplen[canon] = len;
  return false;
}

function mergeLines(sstate: SolverState, i: number, j: number, inverse: number): boolean {
  const inv1: { v: number } = { v: 0 };
  const inv2: { v: number } = { v: 0 };

  i = edsfCanonify(sstate.linedsf!, i, inv1);
  inverse ^= inv1.v;
  j = edsfCanonify(sstate.linedsf!, j, inv2);
  inverse ^= inv2.v;

  edsfMerge(sstate.linedsf!, i, j, inverse);
  return i !== j;
}

function dotSetall(
  sstate: SolverState,
  g: SquareGrid,
  dot: number,
  oldType: number,
  newType: number,
): boolean {
  if (oldType === newType) return false;
  let retval = false;
  const dEdges = g.dotEdges[dot];
  for (let i = 0; i < g.dotOrder[dot]; i++) {
    const lineIndex = dEdges[i];
    if (sstate.state.lines[lineIndex] === oldType) {
      solverSetLine(sstate, g, lineIndex, newType);
      retval = true;
    }
  }
  return retval;
}

function faceSetall(
  sstate: SolverState,
  g: SquareGrid,
  face: number,
  oldType: number,
  newType: number,
): boolean {
  if (oldType === newType) return false;
  let retval = false;
  const fEdges = g.faceEdges[face];
  for (let i = 0; i < 4; i++) {
    const lineIndex = fEdges[i];
    if (sstate.state.lines[lineIndex] === oldType) {
      solverSetLine(sstate, g, lineIndex, newType);
      retval = true;
    }
  }
  return retval;
}

// =============================================================================
// DLine helpers — from loopy.c
// =============================================================================

function BIT_SET(field: number, bit: number): boolean {
  return (field & (1 << bit)) !== 0;
}

function SET_BIT(arr: Int8Array, index: number, bit: number): boolean {
  if (BIT_SET(arr[index], bit)) return false;
  arr[index] |= 1 << bit;
  return true;
}

function isAtleastone(dlines: Int8Array, index: number): boolean {
  return BIT_SET(dlines[index], 0);
}

function setAtleastone(dlines: Int8Array, index: number): boolean {
  return SET_BIT(dlines, index, 0);
}

function isAtmostone(dlines: Int8Array, index: number): boolean {
  return BIT_SET(dlines[index], 1);
}

function setAtmostone(dlines: Int8Array, index: number): boolean {
  return SET_BIT(dlines, index, 1);
}

/**
 * Get dline index from a dot and edge position.
 * A dline is a pair of adjacent edges around a dot, going clockwise.
 * dline_index = 2 * edgeIndex + (edge.dot1 == dot ? 1 : 0)
 */
function dlineIndexFromDot(g: SquareGrid, dot: number, edgePosInDot: number): number {
  const ei = g.dotEdges[dot][edgePosInDot];
  return 2 * ei + (g.edgeDot1[ei] === dot ? 1 : 0);
}

/**
 * Get dline index from a face and edge position.
 * Port of dline_index_from_face from loopy.c.
 */
function dlineIndexFromFace(g: SquareGrid, face: number, edgePosInFace: number): number {
  const ei = g.faceEdges[face][edgePosInFace];
  const dot = g.faceDots[face][edgePosInFace];
  return 2 * ei + (g.edgeDot1[ei] === dot ? 1 : 0);
}

function findUnknowns(
  state: GameState,
  edgeList: Int32Array,
  count: number,
  edgeCount: number,
): number[] {
  const result: number[] = [];
  let c = 0;
  let idx = 0;
  while (c < count && idx < edgeCount) {
    if (state.lines[edgeList[idx]] === LINE_UNKNOWN) {
      result.push(edgeList[idx]);
      c++;
    }
    idx++;
  }
  return result;
}

// =============================================================================
// Solver: trivial_deductions — from loopy.c
// =============================================================================

function trivialDeductions(sstate: SolverState, g: SquareGrid): number {
  const state = sstate.state;
  let diff = DIFF_MAX;

  // Per-face deductions
  for (let i = 0; i < g.numFaces; i++) {
    if (sstate.faceSolved[i]) continue;

    const currentYes = sstate.faceYesCount[i];
    const currentNo = sstate.faceNoCount[i];

    if (currentYes + currentNo === 4) {
      sstate.faceSolved[i] = 1;
      continue;
    }

    if (state.clues[i] < 0) continue;
    const clue = state.clues[i];

    if (clue < currentYes) {
      sstate.solverStatus = SOLVER_MISTAKE;
      return DIFF_EASY;
    }
    if (clue === currentYes) {
      if (faceSetall(sstate, g, i, LINE_UNKNOWN, LINE_NO)) diff = Math.min(diff, DIFF_EASY);
      sstate.faceSolved[i] = 1;
      continue;
    }

    if (4 - clue < currentNo) {
      sstate.solverStatus = SOLVER_MISTAKE;
      return DIFF_EASY;
    }
    if (4 - clue === currentNo) {
      if (faceSetall(sstate, g, i, LINE_UNKNOWN, LINE_YES)) diff = Math.min(diff, DIFF_EASY);
      sstate.faceSolved[i] = 1;
      continue;
    }

    // Refinement: if we're one YES short of the clue, and there are
    // more than 2 unknowns, look for adjacent unknown pairs where
    // one dot has a YES coming from outside
    if (4 - clue === currentNo + 1 && 4 - currentYes - currentNo > 2) {
      const fEdges = g.faceEdges[i];
      let found = false;
      let foundE1 = -1;
      let foundE2 = -1;

      for (let j = 0; j < 4 && !found; j++) {
        const e1 = fEdges[j];
        const e2 = fEdges[(j + 1) % 4];

        // Find the shared dot
        let d: number;
        if (g.edgeDot1[e1] === g.edgeDot1[e2] || g.edgeDot1[e1] === g.edgeDot2[e2]) {
          d = g.edgeDot1[e1];
        } else {
          d = g.edgeDot2[e1];
        }

        if (state.lines[e1] === LINE_UNKNOWN && state.lines[e2] === LINE_UNKNOWN) {
          // Check if dot d has any YES edge from outside
          const dEdges = g.dotEdges[d];
          for (let k = 0; k < g.dotOrder[d]; k++) {
            if (state.lines[dEdges[k]] === LINE_YES) {
              found = true;
              foundE1 = e1;
              foundE2 = e2;
              break;
            }
          }
        }
      }

      if (found) {
        // Set all other unknowns around this face to YES
        for (let j = 0; j < 4; j++) {
          const e = fEdges[j];
          if (state.lines[e] === LINE_UNKNOWN && e !== foundE1 && e !== foundE2) {
            solverSetLine(sstate, g, e, LINE_YES);
            diff = Math.min(diff, DIFF_EASY);
          }
        }
      }
    }
  }

  // Per-dot deductions
  for (let i = 0; i < g.numDots; i++) {
    if (sstate.dotSolved[i]) continue;

    const yes = sstate.dotYesCount[i];
    const no = sstate.dotNoCount[i];
    const unknown = g.dotOrder[i] - yes - no;

    if (yes === 0) {
      if (unknown === 0) {
        sstate.dotSolved[i] = 1;
      } else if (unknown === 1) {
        dotSetall(sstate, g, i, LINE_UNKNOWN, LINE_NO);
        diff = Math.min(diff, DIFF_EASY);
        sstate.dotSolved[i] = 1;
      }
    } else if (yes === 1) {
      if (unknown === 0) {
        sstate.solverStatus = SOLVER_MISTAKE;
        return DIFF_EASY;
      } else if (unknown === 1) {
        dotSetall(sstate, g, i, LINE_UNKNOWN, LINE_YES);
        diff = Math.min(diff, DIFF_EASY);
      }
    } else if (yes === 2) {
      if (unknown > 0) {
        dotSetall(sstate, g, i, LINE_UNKNOWN, LINE_NO);
        diff = Math.min(diff, DIFF_EASY);
      }
      sstate.dotSolved[i] = 1;
    } else {
      sstate.solverStatus = SOLVER_MISTAKE;
      return DIFF_EASY;
    }
  }

  return diff;
}

// =============================================================================
// Solver: dline_deductions — from loopy.c
// =============================================================================

const _MAX_FACE_SIZE = 12;

function dlineDeductions(sstate: SolverState, g: SquareGrid): number {
  const state = sstate.state;
  const dlines = sstate.dlines!;
  let diff = DIFF_MAX;

  // Face deductions using min/max matrices
  for (let i = 0; i < g.numFaces; i++) {
    const N = 4; // square grid
    const clue = state.clues[i];
    if (sstate.faceSolved[i]) continue;
    if (clue < 0) continue;

    const fEdges = g.faceEdges[i];
    const maxs: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    const mins: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

    // Calculate (j, j+1) and (j, j+2) entries
    for (let j = 0; j < N; j++) {
      const edgeIndex = fEdges[j];
      const line1 = state.lines[edgeIndex];
      let k = (j + 1) % N;

      maxs[j][k] = line1 === LINE_NO ? 0 : 1;
      mins[j][k] = line1 === LINE_YES ? 1 : 0;

      // (j, j+2) entries
      const dlineIdx = dlineIndexFromFace(g, i, k);
      const edgeIndex2 = fEdges[k];
      const line2 = state.lines[edgeIndex2];
      k = (k + 1) % N;

      let tmp = 2;
      if (line1 === LINE_NO) tmp--;
      if (line2 === LINE_NO) tmp--;
      if (tmp === 2 && isAtmostone(dlines, dlineIdx)) tmp = 1;
      maxs[j][k] = tmp;

      tmp = 0;
      if (line1 === LINE_YES) tmp++;
      if (line2 === LINE_YES) tmp++;
      if (tmp === 0 && isAtleastone(dlines, dlineIdx)) tmp = 1;
      mins[j][k] = tmp;
    }

    // Calculate (j, j+m) for m in [3, N-1]
    for (let m = 3; m < N; m++) {
      for (let j = 0; j < N; j++) {
        const k = (j + m) % N;
        const u = (j + 1) % N;
        const v = (j + 2) % N;
        maxs[j][k] = maxs[j][u] + maxs[u][k];
        mins[j][k] = mins[j][u] + mins[u][k];
        const tmpMax = maxs[j][v] + maxs[v][k];
        maxs[j][k] = Math.min(maxs[j][k], tmpMax);
        const tmpMin = mins[j][v] + mins[v][k];
        mins[j][k] = Math.max(mins[j][k], tmpMin);
      }
    }

    // Make deductions
    for (let j = 0; j < N; j++) {
      const lineIndex = fEdges[j];
      if (state.lines[lineIndex] !== LINE_UNKNOWN) continue;

      let k = (j + 1) % N;

      if (mins[k][j] > clue) {
        sstate.solverStatus = SOLVER_MISTAKE;
        return DIFF_EASY;
      }
      if (mins[k][j] === clue) {
        solverSetLine(sstate, g, lineIndex, LINE_NO);
        diff = Math.min(diff, DIFF_EASY);
      }
      if (maxs[k][j] < clue - 1) {
        sstate.solverStatus = SOLVER_MISTAKE;
        return DIFF_EASY;
      }
      if (maxs[k][j] === clue - 1) {
        solverSetLine(sstate, g, lineIndex, LINE_YES);
        diff = Math.min(diff, DIFF_EASY);
      }

      // Tricky-level dline deductions
      if (sstate.diff >= DIFF_TRICKY) {
        const e2 = fEdges[k];
        if (state.lines[e2] !== LINE_UNKNOWN) continue;

        const dlineIdx = dlineIndexFromFace(g, i, k);
        k = (k + 1) % N;

        if (mins[k][j] > clue - 2) {
          if (setAtmostone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        }
        if (maxs[k][j] < clue) {
          if (setAtleastone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        }
      }
    }
  }

  if (diff < DIFF_NORMAL) return diff;

  // Dot deductions
  for (let i = 0; i < g.numDots; i++) {
    const N = g.dotOrder[i];
    if (sstate.dotSolved[i]) continue;

    const yes = sstate.dotYesCount[i];
    const no = sstate.dotNoCount[i];
    const unknown = N - yes - no;
    const dEdges = g.dotEdges[i];

    for (let j = 0; j < N; j++) {
      const k = (j + 1) % N;
      const dlineIdx = dlineIndexFromDot(g, i, j);
      const line1Index = dEdges[j];
      const line2Index = dEdges[k];
      const line1 = state.lines[line1Index];
      const line2 = state.lines[line2Index];

      // Infer dline state from line state
      if (line1 === LINE_NO || line2 === LINE_NO) {
        if (setAtmostone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
      }
      if (line1 === LINE_YES || line2 === LINE_YES) {
        if (setAtleastone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
      }

      // Infer line state from dline state
      if (isAtmostone(dlines, dlineIdx)) {
        if (line1 === LINE_YES && line2 === LINE_UNKNOWN) {
          solverSetLine(sstate, g, line2Index, LINE_NO);
          diff = Math.min(diff, DIFF_EASY);
        }
        if (line2 === LINE_YES && line1 === LINE_UNKNOWN) {
          solverSetLine(sstate, g, line1Index, LINE_NO);
          diff = Math.min(diff, DIFF_EASY);
        }
      }
      if (isAtleastone(dlines, dlineIdx)) {
        if (line1 === LINE_NO && line2 === LINE_UNKNOWN) {
          solverSetLine(sstate, g, line2Index, LINE_YES);
          diff = Math.min(diff, DIFF_EASY);
        }
        if (line2 === LINE_NO && line1 === LINE_UNKNOWN) {
          solverSetLine(sstate, g, line1Index, LINE_YES);
          diff = Math.min(diff, DIFF_EASY);
        }
      }

      // Deductions that depend on numbers of lines
      if (line1 !== LINE_UNKNOWN || line2 !== LINE_UNKNOWN) continue;

      if (yes === 0 && unknown === 2) {
        if (isAtmostone(dlines, dlineIdx)) {
          solverSetLine(sstate, g, line1Index, LINE_NO);
          solverSetLine(sstate, g, line2Index, LINE_NO);
          diff = Math.min(diff, DIFF_EASY);
        }
        if (isAtleastone(dlines, dlineIdx)) {
          solverSetLine(sstate, g, line1Index, LINE_YES);
          solverSetLine(sstate, g, line2Index, LINE_YES);
          diff = Math.min(diff, DIFF_EASY);
        }
      }
      if (yes === 1) {
        if (setAtmostone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        if (unknown === 2) {
          if (setAtleastone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        }
      }

      // Tricky-level: propagation along diagonal chains
      if (sstate.diff >= DIFF_TRICKY) {
        if (isAtleastone(dlines, dlineIdx)) {
          for (let opp = 0; opp < N; opp++) {
            if (opp === j || opp === (j + 1) % N || opp === (j - 1 + N) % N) continue;
            if (j === 0 && opp === N - 1) continue;
            if (j === N - 1 && opp === 0) continue;
            const oppDlineIdx = dlineIndexFromDot(g, i, opp);
            if (setAtmostone(dlines, oppDlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
          }
          if (yes === 0 && isAtmostone(dlines, dlineIdx)) {
            if (unknown === 3) {
              for (let opp = 0; opp < N; opp++) {
                if (opp === j || opp === k) continue;
                const oppIndex = dEdges[opp];
                if (state.lines[oppIndex] === LINE_UNKNOWN) {
                  solverSetLine(sstate, g, oppIndex, LINE_YES);
                  diff = Math.min(diff, DIFF_EASY);
                }
              }
            } else if (unknown === 4) {
              // dline_set_opp_atleastone
              for (let opp = 0; opp < N; opp++) {
                if (opp === j || opp === j + 1 || opp === j - 1) continue;
                if (opp === 0 && j === N - 1) continue;
                if (opp === N - 1 && j === 0) continue;
                const opp2 = (opp + 1) % N;
                if (state.lines[dEdges[opp]] !== LINE_UNKNOWN) continue;
                if (state.lines[dEdges[opp2]] !== LINE_UNKNOWN) continue;
                const oppDlineIdx = dlineIndexFromDot(g, i, opp);
                if (setAtleastone(dlines, oppDlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
                break;
              }
            }
          }
        }
      }
    }
  }

  return diff;
}

// =============================================================================
// Solver: linedsf_deductions — from loopy.c
// =============================================================================

function faceSetallIdentical(
  sstate: SolverState,
  g: SquareGrid,
  faceIndex: number,
  lineNew: number,
): boolean {
  const state = sstate.state;
  const fEdges = g.faceEdges[faceIndex];
  let retval = false;

  for (let i = 0; i < 4; i++) {
    const line1Index = fEdges[i];
    if (state.lines[line1Index] !== LINE_UNKNOWN) continue;
    for (let j = i + 1; j < 4; j++) {
      const line2Index = fEdges[j];
      if (state.lines[line2Index] !== LINE_UNKNOWN) continue;

      const inv1: { v: number } = { v: 0 };
      const inv2: { v: number } = { v: 0 };
      const can1 = edsfCanonify(sstate.linedsf!, line1Index, inv1);
      const can2 = edsfCanonify(sstate.linedsf!, line2Index, inv2);
      if (can1 === can2 && inv1.v === inv2.v) {
        solverSetLine(sstate, g, line1Index, lineNew);
        solverSetLine(sstate, g, line2Index, lineNew);
        retval = true;
      }
    }
  }
  return retval;
}

function parityDeductions(
  sstate: SolverState,
  g: SquareGrid,
  edgeList: Int32Array,
  edgeCount: number,
  totalParity: number,
  unknownCount: number,
): number {
  const state = sstate.state;
  let diff = DIFF_MAX;

  if (unknownCount === 2) {
    const e = findUnknowns(state, edgeList, 2, edgeCount);
    if (mergeLines(sstate, e[0], e[1], totalParity)) diff = Math.min(diff, DIFF_HARD);
  } else if (unknownCount === 3) {
    const e = findUnknowns(state, edgeList, 3, edgeCount);
    const inv: { v: number }[] = [{ v: 0 }, { v: 0 }, { v: 0 }];
    const can = [
      edsfCanonify(sstate.linedsf!, e[0], inv[0]),
      edsfCanonify(sstate.linedsf!, e[1], inv[1]),
      edsfCanonify(sstate.linedsf!, e[2], inv[2]),
    ];
    if (can[0] === can[1]) {
      if (solverSetLine(sstate, g, e[2], totalParity ^ inv[0].v ^ inv[1].v ? LINE_YES : LINE_NO))
        diff = Math.min(diff, DIFF_EASY);
    }
    if (can[0] === can[2]) {
      if (solverSetLine(sstate, g, e[1], totalParity ^ inv[0].v ^ inv[2].v ? LINE_YES : LINE_NO))
        diff = Math.min(diff, DIFF_EASY);
    }
    if (can[1] === can[2]) {
      if (solverSetLine(sstate, g, e[0], totalParity ^ inv[1].v ^ inv[2].v ? LINE_YES : LINE_NO))
        diff = Math.min(diff, DIFF_EASY);
    }
  } else if (unknownCount === 4) {
    const e = findUnknowns(state, edgeList, 4, edgeCount);
    const inv: { v: number }[] = [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }];
    const can = [
      edsfCanonify(sstate.linedsf!, e[0], inv[0]),
      edsfCanonify(sstate.linedsf!, e[1], inv[1]),
      edsfCanonify(sstate.linedsf!, e[2], inv[2]),
      edsfCanonify(sstate.linedsf!, e[3], inv[3]),
    ];
    if (can[0] === can[1]) {
      if (mergeLines(sstate, e[2], e[3], totalParity ^ inv[0].v ^ inv[1].v))
        diff = Math.min(diff, DIFF_HARD);
    } else if (can[0] === can[2]) {
      if (mergeLines(sstate, e[1], e[3], totalParity ^ inv[0].v ^ inv[2].v))
        diff = Math.min(diff, DIFF_HARD);
    } else if (can[0] === can[3]) {
      if (mergeLines(sstate, e[1], e[2], totalParity ^ inv[0].v ^ inv[3].v))
        diff = Math.min(diff, DIFF_HARD);
    } else if (can[1] === can[2]) {
      if (mergeLines(sstate, e[0], e[3], totalParity ^ inv[1].v ^ inv[2].v))
        diff = Math.min(diff, DIFF_HARD);
    } else if (can[1] === can[3]) {
      if (mergeLines(sstate, e[0], e[2], totalParity ^ inv[1].v ^ inv[3].v))
        diff = Math.min(diff, DIFF_HARD);
    } else if (can[2] === can[3]) {
      if (mergeLines(sstate, e[0], e[1], totalParity ^ inv[2].v ^ inv[3].v))
        diff = Math.min(diff, DIFF_HARD);
    }
  }
  return diff;
}

function linedsfDeductions(sstate: SolverState, g: SquareGrid): number {
  const state = sstate.state;
  const dlines = sstate.dlines!;
  let diff = DIFF_MAX;

  // Face deductions
  for (let i = 0; i < g.numFaces; i++) {
    if (sstate.faceSolved[i]) continue;
    const clue = state.clues[i];
    if (clue < 0) continue;

    const N = 4;
    const yes = sstate.faceYesCount[i];
    if (yes + 1 === clue) {
      if (faceSetallIdentical(sstate, g, i, LINE_NO)) diff = Math.min(diff, DIFF_EASY);
    }
    const no = sstate.faceNoCount[i];
    if (no + 1 === N - clue) {
      if (faceSetallIdentical(sstate, g, i, LINE_YES)) diff = Math.min(diff, DIFF_EASY);
    }

    const yesReloaded = sstate.faceYesCount[i];
    const unknown = N - no - yesReloaded;

    const diffTmp = parityDeductions(
      sstate,
      g,
      g.faceEdges[i],
      4,
      (clue - yesReloaded) % 2,
      unknown,
    );
    diff = Math.min(diff, diffTmp);
  }

  // Dot deductions
  for (let i = 0; i < g.numDots; i++) {
    const N = g.dotOrder[i];
    const dEdges = g.dotEdges[i];

    for (let j = 0; j < N; j++) {
      const dlineIdx = dlineIndexFromDot(g, i, j);
      const j2 = (j + 1) % N;
      const line1Index = dEdges[j];
      const line2Index = dEdges[j2];

      if (state.lines[line1Index] !== LINE_UNKNOWN) continue;
      if (state.lines[line2Index] !== LINE_UNKNOWN) continue;

      // Infer dline flags from linedsf
      const inv1: { v: number } = { v: 0 };
      const inv2: { v: number } = { v: 0 };
      const can1 = edsfCanonify(sstate.linedsf!, line1Index, inv1);
      const can2 = edsfCanonify(sstate.linedsf!, line2Index, inv2);

      if (can1 === can2 && inv1.v !== inv2.v) {
        if (setAtmostone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        if (setAtleastone(dlines, dlineIdx)) diff = Math.min(diff, DIFF_NORMAL);
        continue;
      }

      // Infer linedsf from dline flags
      if (isAtmostone(dlines, dlineIdx) && isAtleastone(dlines, dlineIdx)) {
        if (mergeLines(sstate, line1Index, line2Index, 1)) diff = Math.min(diff, DIFF_HARD);
      }
    }

    // Parity deductions
    const yes = sstate.dotYesCount[i];
    const no = sstate.dotNoCount[i];
    const unknown = N - yes - no;
    const diffTmp = parityDeductions(sstate, g, dEdges, N, yes % 2, unknown);
    diff = Math.min(diff, diffTmp);
  }

  // Edge dsf deductions: propagate known line states
  for (let i = 0; i < g.numEdges; i++) {
    const inv: { v: number } = { v: 0 };
    const can = edsfCanonify(sstate.linedsf!, i, inv);
    if (can === i) continue;

    let s = sstate.state.lines[can];
    if (s !== LINE_UNKNOWN) {
      if (solverSetLine(sstate, g, i, inv.v ? OPP(s) : s)) diff = Math.min(diff, DIFF_EASY);
    } else {
      s = sstate.state.lines[i];
      if (s !== LINE_UNKNOWN) {
        if (solverSetLine(sstate, g, can, inv.v ? OPP(s) : s)) diff = Math.min(diff, DIFF_EASY);
      }
    }
  }

  return diff;
}

// =============================================================================
// Solver: loop_deductions — from loopy.c
// =============================================================================

function loopDeductions(sstate: SolverState, g: SquareGrid): number {
  const state = sstate.state;
  let edgecount = 0;
  let clues = 0;
  let satclues = 0;
  let sm1clues = 0;
  let shortestChainlen = g.numDots;
  let loopFound = false;
  let progress = false;

  // Update dot DSF for all YES edges
  for (let i = 0; i < g.numEdges; i++) {
    if (state.lines[i] === LINE_YES) {
      loopFound = mergeDots(sstate, g, i) || loopFound;
      edgecount++;
    }
  }

  // Count clues and their satisfaction
  for (let i = 0; i < g.numFaces; i++) {
    const c = state.clues[i];
    if (c >= 0) {
      const o = sstate.faceYesCount[i];
      if (o === c) satclues++;
      else if (o === c - 1) sm1clues++;
      clues++;
    }
  }

  for (let i = 0; i < g.numDots; i++) {
    const dc = sstate.looplen[dsfCanonify(sstate.dotdsf, i)];
    if (dc > 1) shortestChainlen = Math.min(shortestChainlen, dc);
  }

  if (satclues === clues && shortestChainlen === edgecount) {
    sstate.solverStatus = SOLVER_SOLVED;
    return DIFF_EASY;
  }

  // Look for LINE_UNKNOWN edges that would close a loop
  for (let i = 0; i < g.numEdges; i++) {
    if (state.lines[i] !== LINE_UNKNOWN) continue;

    const d1 = g.edgeDot1[i];
    const d2 = g.edgeDot2[i];
    const eqclass = dsfCanonify(sstate.dotdsf, d1);
    if (eqclass !== dsfCanonify(sstate.dotdsf, d2)) continue;

    // This edge would form a loop
    let val = LINE_NO;

    if (sstate.looplen[eqclass] === edgecount + 1) {
      // Would include all current YES edges + this one
      let sm1Nearby = 0;
      const f1 = g.edgeFace1[i];
      const f2 = g.edgeFace2[i];
      if (f1 >= 0) {
        const c = state.clues[f1];
        if (c >= 0 && sstate.faceYesCount[f1] === c - 1) sm1Nearby++;
      }
      if (f2 >= 0) {
        const c = state.clues[f2];
        if (c >= 0 && sstate.faceYesCount[f2] === c - 1) sm1Nearby++;
      }
      if (sm1clues === sm1Nearby && sm1clues + satclues === clues) {
        val = LINE_YES;
      }
    }

    solverSetLine(sstate, g, i, val);
    progress = true;
    if (val === LINE_YES) {
      sstate.solverStatus = SOLVER_AMBIGUOUS;
      return DIFF_EASY;
    }
  }

  return progress ? DIFF_EASY : DIFF_MAX;
}

// =============================================================================
// Solver: solve_game_rec — from loopy.c
// =============================================================================

// Solver function table, matching SOLVERLIST in loopy.c
const solverFns: ((ss: SolverState, g: SquareGrid) => number)[] = [
  trivialDeductions, // DIFF_EASY
  dlineDeductions, // DIFF_NORMAL
  linedsfDeductions, // DIFF_HARD
  loopDeductions, // DIFF_EASY
];
const solverDiffs = [DIFF_EASY, DIFF_NORMAL, DIFF_HARD, DIFF_EASY];

function solveGameRec(sstateStart: SolverState, g: SquareGrid): SolverState {
  const sstate = dupSolverState(sstateStart, g);

  let i = 0;
  let thresholdDiff = 0;
  let thresholdIndex = 0;

  while (i < solverFns.length) {
    if (sstate.solverStatus === SOLVER_MISTAKE) return sstate;
    if (sstate.solverStatus === SOLVER_SOLVED || sstate.solverStatus === SOLVER_AMBIGUOUS) {
      break;
    }

    if ((solverDiffs[i] >= thresholdDiff || i >= thresholdIndex) && solverDiffs[i] <= sstate.diff) {
      const nextDiff = solverFns[i](sstate, g);
      if (nextDiff !== DIFF_MAX) {
        thresholdDiff = nextDiff;
        thresholdIndex = i;
        i = 0;
        continue;
      }
    }
    i++;
  }

  if (sstate.solverStatus === SOLVER_SOLVED || sstate.solverStatus === SOLVER_AMBIGUOUS) {
    // Set all remaining unknowns to NO
    for (let j = 0; j < g.numEdges; j++) {
      if (sstate.state.lines[j] === LINE_UNKNOWN) {
        sstate.state.lines[j] = LINE_NO;
      }
    }
  }

  return sstate;
}

// =============================================================================
// Puzzle generation helpers — from loopy.c
// =============================================================================

function gameHasUniqueSoln(state: GameState, g: SquareGrid, diff: number): boolean {
  const sstate = newSolverState(state, g, diff);
  const sstateNew = solveGameRec(sstate, g);
  return sstateNew.solverStatus === SOLVER_SOLVED;
}

function removeClues(state: GameState, g: SquareGrid, diff: number): GameState {
  const numFaces = g.numFaces;
  const rs = new RandomState();

  // Shuffled list of face indices
  const faceList = new Array(numFaces);
  for (let i = 0; i < numFaces; i++) faceList[i] = i;
  shuffle(faceList, rs);

  let ret = dupGameState(state);

  for (let n = 0; n < numFaces; n++) {
    const saved = dupGameState(ret);
    ret.clues[faceList[n]] = -1;

    if (!gameHasUniqueSoln(ret, g, diff)) {
      ret = saved;
    }
  }

  return ret;
}

function _solveForSolution(state: GameState, g: SquareGrid): GameState {
  const sstate = newSolverState(state, g, DIFF_MAX);
  const solved = solveGameRec(sstate, g);
  return solved.state;
}
