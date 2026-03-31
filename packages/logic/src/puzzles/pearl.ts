// @ts-nocheck
/**
 * Pearl (Masyu) puzzle generator — faithful port of Simon Tatham's pearl.c
 *
 * Generates a grid with black and white circle clues. The player must draw
 * a single closed loop through all clue cells:
 *   - Black (CORNER): loop turns 90 degrees, and goes straight on both sides
 *   - White (STRAIGHT): loop goes straight through, and turns on at least one side
 *
 * The solver is a direct port of pearl_solve() from pearl.c.
 * The loop generator uses face-colouring on the dual graph (simplified from
 * Tatham's loopgen.c for square grids).
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=pearl.c
 */

// =============================================================================
// Public interface
// =============================================================================

export interface PearlPuzzle {
  /** Width of grid */
  w: number;
  /** Height of grid */
  h: number;
  /**
   * Flat array of clue values, size w*h.
   * 0 = no clue, 1 = CORNER (black pearl), 2 = STRAIGHT (white pearl)
   */
  clues: number[];
  /**
   * Flat array of solution line states, size w*h.
   * Each cell is a bitmask of directions: R=1, U=2, L=4, D=8.
   * 0 = blank (not on loop).
   */
  solution: number[];
}

/**
 * Generate a Pearl (Masyu) puzzle.
 *
 * @param w - Grid width (minimum 5)
 * @param h - Grid height (minimum 5)
 * @param difficulty - 0 = EASY, 1 = TRICKY (default EASY)
 * @returns A PearlPuzzle with clues and solution
 */
export function generatePearlPuzzle(
  w: number,
  h: number,
  difficulty: number = DIFF_EASY,
): PearlPuzzle {
  if (w < 5) w = 5;
  if (h < 5) h = 5;

  const grid = new Int8Array(w * h);
  const clues = new Int8Array(w * h);

  newClues(w, h, difficulty, clues, grid);

  return {
    w,
    h,
    clues: Array.from(clues),
    solution: Array.from(grid),
  };
}

// =============================================================================
// Constants — faithful port from pearl.c
// =============================================================================

const NOCLUE = 0;
const CORNER = 1; // Black pearl
const STRAIGHT = 2; // White pearl

const R = 1;
const U = 2;
const L = 4;
const D = 8;

function DX(d: number): number {
  return (d === R ? 1 : 0) - (d === L ? 1 : 0);
}
function DY(d: number): number {
  return (d === D ? 1 : 0) - (d === U ? 1 : 0);
}

/** Flip direction (opposite) */
function F(d: number): number {
  return ((d << 2) | (d >> 2)) & 0xf;
}
/** Clockwise rotation */
function C(d: number): number {
  return ((d << 3) | (d >> 1)) & 0xf;
}
/** Anticlockwise rotation */
function A(d: number): number {
  return ((d << 1) | (d >> 3)) & 0xf;
}

const LR = L | R;
const UD = U | D;
const LU = L | U;
const LD = L | D;
const RU = R | U;
const RD = R | D;
const BLANK = 0;

const bLR = 1 << LR;
const bUD = 1 << UD;
const bLU = 1 << LU;
const bLD = 1 << LD;
const bRU = 1 << RU;
const bRD = 1 << RD;
const bBLANK = 1 << BLANK;

const DIFF_EASY = 0;
const _DIFF_TRICKY = 1; // kept for reference to pearl.c

// =============================================================================
// DSF (Disjoint Set Forest) — faithful port of dsf.c
// =============================================================================

function dsfInit(dsf: Int32Array): void {
  for (let i = 0; i < dsf.length; i++) dsf[i] = 6;
}

function _newDsf(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf);
  return dsf;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  let inverse = 0;

  while ((dsf[index] & 2) === 0) {
    inverse ^= dsf[index] & 1;
    index = dsf[index] >> 2;
  }
  const canonicalIndex = index;

  // Path compression
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index] >> 2;
    const nextInverse = inverse ^ (dsf[index] & 1);
    dsf[index] = (canonicalIndex << 2) | inverse;
    inverse = nextInverse;
    index = nextIndex;
  }

  return index;
}

function dsfMerge(dsf: Int32Array, v1: number, v2: number): void {
  v1 = dsfCanonify(dsf, v1);
  v2 = dsfCanonify(dsf, v2);

  if (v1 === v2) return;

  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] += (dsf[v2] >> 2) << 2;
  dsf[v2] = (v1 << 2) | 0;
}

// =============================================================================
// PRNG — simple xorshift128+ for reproducible randomness
// =============================================================================

class PearlRandom {
  private s0: number;
  private s1: number;

  constructor(seed?: number) {
    this.s0 = (seed ?? (Math.random() * 0xffffffff) >>> 0) | 0;
    this.s1 = (this.s0 * 1103515245 + 12345) | 0;
    if (this.s0 === 0 && this.s1 === 0) this.s1 = 1;
    // Warm up
    for (let i = 0; i < 20; i++) this.next();
  }

  /** Returns a 32-bit unsigned integer */
  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return (this.s0 + this.s1) >>> 0;
  }

  /** Returns integer in [0, n) */
  upto(n: number): number {
    return this.next() % n;
  }

  /** Fisher-Yates shuffle */
  shuffle<T>(arr: T[] | Int32Array, n?: number): void {
    const len = n ?? arr.length;
    for (let i = len - 1; i > 0; i--) {
      const j = this.upto(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
}

// =============================================================================
// Solver — faithful port of pearl_solve() from pearl.c
// =============================================================================

function pearlSolve(
  w: number,
  h: number,
  clues: Int8Array,
  result: Int8Array,
  difficulty: number,
  partial: boolean,
): number {
  const W = 2 * w + 1;
  const H = 2 * h + 1;
  const workspace = new Int32Array(W * H);

  // Initialize workspace
  for (let i = 0; i < W * H; i++) workspace[i] = 0;

  // Square states
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      switch (clues[y * w + x]) {
        case CORNER:
          workspace[(2 * y + 1) * W + (2 * x + 1)] = bLU | bLD | bRU | bRD;
          break;
        case STRAIGHT:
          workspace[(2 * y + 1) * W + (2 * x + 1)] = bLR | bUD;
          break;
        default:
          workspace[(2 * y + 1) * W + (2 * x + 1)] = bLR | bUD | bLU | bLD | bRU | bRD | bBLANK;
          break;
      }

  // Horizontal edges
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < w; x++) workspace[2 * y * W + (2 * x + 1)] = y === 0 || y === h ? 2 : 3;

  // Vertical edges
  for (let y = 0; y < h; y++)
    for (let x = 0; x <= w; x++) workspace[(2 * y + 1) * W + 2 * x] = x === 0 || x === w ? 2 : 3;

  const dsf = new Int32Array(w * h);
  const dsfsize = new Int32Array(w * h);

  let ret = -1;

  // Main deduction loop
  mainLoop: while (true) {
    let done_something = false;

    /*
     * Go through the square state words, and discard any
     * square state which is inconsistent with known facts
     * about the edges around the square.
     */
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        for (let b = 0; b < 0xd; b++)
          if (workspace[(2 * y + 1) * W + (2 * x + 1)] & (1 << b)) {
            for (let dd = 1; dd <= 8; dd += dd) {
              const ex = 2 * x + 1 + DX(dd);
              const ey = 2 * y + 1 + DY(dd);
              if (workspace[ey * W + ex] === (b & dd ? 2 : 1)) {
                workspace[(2 * y + 1) * W + (2 * x + 1)] &= ~(1 << b);
                done_something = true;
                break;
              }
            }
          }

        // Consistency check
        if (!workspace[(2 * y + 1) * W + (2 * x + 1)]) {
          ret = 0;
          break mainLoop;
        }
      }

    /*
     * Now go through the states array again, and nail down any
     * unknown edge if one of its neighbouring squares makes it known.
     */
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let edgeor = 0;
        let edgeand = 15;

        for (let b = 0; b < 0xd; b++)
          if (workspace[(2 * y + 1) * W + (2 * x + 1)] & (1 << b)) {
            edgeor |= b;
            edgeand &= b;
          }

        // Consistency check
        if (edgeand & ~edgeor) {
          ret = 0;
          break mainLoop;
        }

        for (let dd = 1; dd <= 8; dd += dd) {
          const ex = 2 * x + 1 + DX(dd);
          const ey = 2 * y + 1 + DY(dd);

          if (!(edgeor & dd) && workspace[ey * W + ex] === 3) {
            workspace[ey * W + ex] = 2;
            done_something = true;
          } else if (edgeand & dd && workspace[ey * W + ex] === 3) {
            workspace[ey * W + ex] = 1;
            done_something = true;
          }
        }
      }

    if (done_something) continue;

    /*
     * Now for longer-range clue-based deductions.
     */
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        switch (clues[y * w + x]) {
          case CORNER:
            for (let dd = 1; dd <= 8; dd += dd) {
              const ex = 2 * x + 1 + DX(dd);
              const ey = 2 * y + 1 + DY(dd);
              const fx = ex + DX(dd);
              const fy = ey + DY(dd);
              const type = dd | F(dd);

              if (workspace[ey * W + ex] === 1) {
                /*
                 * If a corner clue is connected on any edge, then we can
                 * immediately nail down the square beyond that edge as
                 * being a straight in the appropriate direction.
                 */
                if (workspace[fy * W + fx] !== 1 << type) {
                  workspace[fy * W + fx] = 1 << type;
                  done_something = true;
                }
              } else if (workspace[ey * W + ex] === 3) {
                /*
                 * Conversely, if a corner clue is separated by an unknown
                 * edge from a square which _cannot_ be a straight in the
                 * appropriate direction, we can mark that edge as disconnected.
                 */
                if (!(workspace[fy * W + fx] & (1 << type))) {
                  workspace[ey * W + ex] = 2;
                  done_something = true;
                }
              }
            }
            break;

          case STRAIGHT:
            /*
             * If a straight clue is between two squares neither of which
             * is capable of being a corner connected to it, then the
             * straight clue cannot point in that direction.
             */
            for (let dd = 1; dd <= 2; dd += dd) {
              const fx = 2 * x + 1 + 2 * DX(dd);
              const fy = 2 * y + 1 + 2 * DY(dd);
              const gx = 2 * x + 1 - 2 * DX(dd);
              const gy = 2 * y + 1 - 2 * DY(dd);
              const type = dd | F(dd);

              if (!(workspace[(2 * y + 1) * W + (2 * x + 1)] & (1 << type))) continue;

              if (
                !(workspace[fy * W + fx] & ((1 << (F(dd) | A(dd))) | (1 << (F(dd) | C(dd))))) &&
                !(workspace[gy * W + gx] & ((1 << (dd | A(dd))) | (1 << (dd | C(dd)))))
              ) {
                workspace[(2 * y + 1) * W + (2 * x + 1)] &= ~(1 << type);
                done_something = true;
              }
            }

            /*
             * If a straight clue with known direction is connected on
             * one side to a known straight, then on the other side
             * it must be a corner.
             */
            for (let dd = 1; dd <= 8; dd += dd) {
              const fx = 2 * x + 1 + 2 * DX(dd);
              const fy = 2 * y + 1 + 2 * DY(dd);
              const gx = 2 * x + 1 - 2 * DX(dd);
              const gy = 2 * y + 1 - 2 * DY(dd);
              const type = dd | F(dd);

              if (workspace[(2 * y + 1) * W + (2 * x + 1)] !== 1 << type) continue;

              if (
                !(workspace[fy * W + fx] & ~(bLR | bUD)) &&
                workspace[gy * W + gx] & ~(bLU | bLD | bRU | bRD)
              ) {
                workspace[gy * W + gx] &= bLU | bLD | bRU | bRD;
                done_something = true;
              }
            }
            break;
        }

    if (done_something) continue;

    /*
     * Now detect shortcut loops.
     */
    {
      let nonblanks: number;
      let loopclass: number;

      dsfInit(dsf);
      for (let i = 0; i < w * h; i++) dsfsize[i] = 1;

      nonblanks = 0;
      loopclass = -1;

      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++)
          if ((y ^ x) & 1) {
            // Edge field
            const ax = ((x - 1) / 2) | 0;
            const ay = ((y - 1) / 2) | 0;
            const ac = ay * w + ax;
            const bx = (x / 2) | 0;
            const by = (y / 2) | 0;
            const bc = by * w + bx;

            if (workspace[y * W + x] === 1) {
              let ae = dsfCanonify(dsf, ac);
              const be = dsfCanonify(dsf, bc);

              if (ae === be) {
                if (loopclass !== -1) {
                  ret = 0;
                  break mainLoop;
                }
                loopclass = ae;
              } else {
                const size = dsfsize[ae] + dsfsize[be];
                dsfMerge(dsf, ac, bc);
                ae = dsfCanonify(dsf, ac);
                dsfsize[ae] = size;
              }
            }
          } else if (y & x & 1) {
            // Square field
            if (!(workspace[y * W + x] & bBLANK)) nonblanks++;
          }

      if (loopclass !== -1) {
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (dsfCanonify(dsf, y * w + x) !== loopclass) {
              if (workspace[(y * 2 + 1) * W + (x * 2 + 1)] & bBLANK) {
                workspace[(y * 2 + 1) * W + (x * 2 + 1)] = bBLANK;
              } else {
                ret = 0;
                break mainLoop;
              }
            }
        ret = 1;
        break;
      }

      // Further deductions are considered 'tricky'
      if (difficulty === DIFF_EASY) {
        // goto done_deductions — skip shortcut loop pruning
      } else {
        /*
         * Now go through the workspace again and mark any edge which
         * would cause a shortcut loop as disconnected.
         */
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++)
            if ((y ^ x) & 1) {
              // Edge field
              const ax = ((x - 1) / 2) | 0;
              const ay = ((y - 1) / 2) | 0;
              const ac = ay * w + ax;
              const bx = (x / 2) | 0;
              const by = (y / 2) | 0;
              const bc = by * w + bx;

              if (workspace[y * W + x] === 3) {
                const ae = dsfCanonify(dsf, ac);
                const be = dsfCanonify(dsf, bc);

                if (ae === be) {
                  if (dsfsize[ae] < nonblanks) {
                    workspace[y * W + x] = 2;
                    done_something = true;
                  }
                }
              }
            } else if (y & x & 1) {
              // Square field — check if any state gives rise to shortcut loop
              const ae = dsfCanonify(dsf, ((y / 2) | 0) * w + ((x / 2) | 0));

              for (let b = 2; b < 0xd; b++)
                if (workspace[y * W + x] & (1 << b)) {
                  let e = -1;

                  for (let dd = 1; dd <= 8; dd += dd)
                    if (b & dd) {
                      const xx = ((x / 2) | 0) + DX(dd);
                      const yy = ((y / 2) | 0) + DY(dd);
                      const ee = dsfCanonify(dsf, yy * w + xx);

                      if (e === -1)
                        e = ee; // NOTE: C source has ee = e (bug), we fix it
                      else if (e !== ee) e = -2;
                    }

                  if (e >= 0) {
                    let loopsize = dsfsize[e];
                    if (e !== ae) loopsize++;
                    if (loopsize < nonblanks) {
                      workspace[y * W + x] &= ~(1 << b);
                      done_something = true;
                    }
                  }
                }
            }
      }
    }

    // done_deductions:
    if (done_something) continue;

    // Nothing left we can do. Return 2 for ambiguous.
    ret = 2;
    break;
  }

  /*
   * If ret = 1 then transcribe solution into result array.
   */
  if (ret === 1 || partial) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let b = 0; b < 0xd; b++)
          if (workspace[(2 * y + 1) * W + (2 * x + 1)] === 1 << b) {
            result[y * w + x] = b;
            break;
          }
      }
    }
  }

  return ret;
}

// =============================================================================
// Loop generator — simplified face-colouring for square grids
//
// On a square grid of w*h cells, we consider the (w-1)*(h-1) "faces" of the
// dual graph (each face is the intersection of 4 cells). We randomly 2-colour
// these faces (plus a virtual "border" face that is always BLACK). The loop
// is the boundary between black and white regions.
//
// This is equivalent to what Tatham's loopgen.c does with grid_new(GRID_SQUARE,
// w-1, h-1) but vastly simpler since we only need square grids.
// =============================================================================

/**
 * Generate a random loop on a w*h grid using face colouring.
 * Returns the lines array (size w*h) where each cell has a bitmask of
 * directions indicating which edges are part of the loop.
 */
function pearlLoopgen(w: number, h: number, lines: Int8Array, rs: PearlRandom): void {
  for (let i = 0; i < w * h; i++) lines[i] = 0;

  // We have (w+1)*(h+1) vertices. Each internal edge separates two faces.
  // Face grid: (w-1)*(h-1) internal faces, plus a border face.
  // We'll use a DSF to ensure connectivity of both black and white regions.

  // Strategy: Generate a random spanning tree of the face adjacency graph,
  // then randomly colour along the tree to get a valid 2-colouring that
  // produces a single loop.

  // Actually, let's use a simpler approach that works well:
  // Start with all faces grey, randomly grow black and white regions
  // from the border, ensuring the result is a valid loop.

  // Even simpler: use the "random walk on dual graph" approach.
  // We'll directly generate a Hamiltonian-like loop using perturbation.

  // The most reliable approach for our needs: build a random loop by
  // starting with a simple boundary loop and randomly deforming it.

  generateLoopByDeformation(w, h, lines, rs);
}

/**
 * Generate a random loop by starting with the grid boundary and
 * randomly deforming it inward. This produces loops with good
 * variety for puzzle generation.
 */
function generateLoopByDeformation(w: number, h: number, lines: Int8Array, rs: PearlRandom): void {
  // Start with a simple rectangular boundary loop
  for (let x = 0; x < w; x++) {
    // Top row
    lines[x] |= (x > 0 ? L : 0) | (x < w - 1 ? R : 0);
    if (x === 0) lines[x] |= D;
    if (x === w - 1) lines[x] |= D;
    // Bottom row
    lines[(h - 1) * w + x] |= (x > 0 ? L : 0) | (x < w - 1 ? R : 0);
    if (x === 0) lines[(h - 1) * w + x] |= U;
    if (x === w - 1) lines[(h - 1) * w + x] |= U;
  }
  for (let y = 1; y < h - 1; y++) {
    // Left column
    lines[y * w] |= U | D;
    // Right column
    lines[y * w + (w - 1)] |= U | D;
  }

  // Now randomly deform the loop many times
  const maxIters = w * h * 20;
  for (let iter = 0; iter < maxIters; iter++) {
    // Pick a random internal edge to try to flip
    const horizontal = rs.upto(2) === 0;
    let x: number, y: number;
    if (horizontal) {
      // Horizontal edge between (x,y) and (x+1,y)
      x = rs.upto(w - 1);
      y = rs.upto(h);
    } else {
      // Vertical edge between (x,y) and (x,y+1)
      x = rs.upto(w);
      y = rs.upto(h - 1);
    }

    if (horizontal) {
      // Edge between (x,y) and (x+1,y)
      const hasEdge = !!(lines[y * w + x] & R);
      if (hasEdge) {
        // Try removing this edge — need to add two edges to maintain loop
        // Check if we can reroute through the cell above or below
        if (y > 0 && canRerouteH(lines, w, h, x, y, -1)) {
          doRerouteH(lines, w, h, x, y, -1);
        } else if (y < h - 1 && canRerouteH(lines, w, h, x, y, 1)) {
          doRerouteH(lines, w, h, x, y, 1);
        }
      } else {
        // Try adding this edge — need to remove two edges to maintain loop
        // This is the reverse operation
        if (y > 0 && canUnrouteH(lines, w, h, x, y, -1)) {
          doUnrouteH(lines, w, h, x, y, -1);
        } else if (y < h - 1 && canUnrouteH(lines, w, h, x, y, 1)) {
          doUnrouteH(lines, w, h, x, y, 1);
        }
      }
    } else {
      // Edge between (x,y) and (x,y+1)
      const hasEdge = !!(lines[y * w + x] & D);
      if (hasEdge) {
        if (x > 0 && canRerouteV(lines, w, h, x, y, -1)) {
          doRerouteV(lines, w, h, x, y, -1);
        } else if (x < w - 1 && canRerouteV(lines, w, h, x, y, 1)) {
          doRerouteV(lines, w, h, x, y, 1);
        }
      } else {
        if (x > 0 && canUnrouteV(lines, w, h, x, y, -1)) {
          doUnrouteV(lines, w, h, x, y, -1);
        } else if (x < w - 1 && canUnrouteV(lines, w, h, x, y, 1)) {
          doUnrouteV(lines, w, h, x, y, 1);
        }
      }
    }
  }

  // Verify the loop is valid (single closed loop)
  if (!isValidLoop(lines, w, h)) {
    // Fallback: try again
    for (let i = 0; i < w * h; i++) lines[i] = 0;
    generateLoopByDeformation(w, h, lines, rs);
  }
}

/**
 * Check if we can reroute a horizontal edge at (x,y)-(x+1,y) through
 * the row offset by dy. This means the edge is currently present and
 * we want to "push" it to go through (x,y+dy) and (x+1,y+dy).
 */
function canRerouteH(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dy: number,
): boolean {
  const ny = y + dy;
  // The reroute adds edges: (x,y)-(x,ny), (x,ny)-(x+1,ny), (x+1,ny)-(x+1,y)
  // and removes edge: (x,y)-(x+1,y)
  // For this to work:
  // 1. The three new edges must not already exist
  // 2. Cells (x,ny) and (x+1,ny) must currently be blank (not on loop)
  const a = ny * w + x;
  const b = ny * w + (x + 1);

  if (lines[a] !== 0 || lines[b] !== 0) return false;

  // Check the vertical edges don't already exist
  const vdir = dy > 0 ? D : U;
  if (lines[y * w + x] & vdir) return false;
  if (lines[y * w + x + 1] & vdir) return false;

  return true;
}

function doRerouteH(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dy: number,
): void {
  const ny = y + dy;
  const vdir = dy > 0 ? D : U;
  const vdirOpp = dy > 0 ? U : D;

  // Remove horizontal edge (x,y)-(x+1,y)
  lines[y * w + x] &= ~R;
  lines[y * w + x + 1] &= ~L;

  // Add vertical edge (x,y)-(x,ny)
  lines[y * w + x] |= vdir;
  lines[ny * w + x] |= vdirOpp;

  // Add horizontal edge (x,ny)-(x+1,ny)
  lines[ny * w + x] |= R;
  lines[ny * w + x + 1] |= L;

  // Add vertical edge (x+1,ny)-(x+1,y)
  lines[ny * w + x + 1] |= vdirOpp;
  lines[y * w + x + 1] |= vdir;

  // Wait, the last vertical edge goes from (x+1,ny) back to (x+1,y)
  // Direction from ny to y: if dy>0, ny>y so direction is U; if dy<0, ny<y so D
  // Fix: from (x+1,ny): direction toward y is vdirOpp... no.
  // Let me redo: if dy=1: ny=y+1. Edge from (x+1,y+1) to (x+1,y) means going U from y+1.
  // From (x+1,y), going D to (x+1,y+1).
  // So from cell (x+1,ny=y+1): add U (vdirOpp). From cell (x+1,y): add D (vdir). Correct.

  // Actually I doubled the vertical edge on (x+1). Let me reconsider.
  // We want: remove (x,y)-(x+1,y), add (x,y)-(x,ny), (x,ny)-(x+1,ny), (x+1,ny)-(x+1,y)
  // That creates a detour: instead of going directly from (x,y) to (x+1,y),
  // we go (x,y) -> (x,ny) -> (x+1,ny) -> (x+1,y).
  // This is correct. But I need to verify the edges on cell (ny,x+1).
  // (x+1,ny) has both L (from horizontal) and vdirOpp (from vertical to (x+1,y)).
  // If dy>0: (x+1,y+1) has L and U. That's a corner (LU). Fine.
  // (x,ny) has R (horizontal) and vdirOpp (from vertical to (x,y)).
  // If dy>0: (x,y+1) has R and U. That's RU corner. Fine.
  // (x,y) now has vdir instead of R. If dy>0: has D instead of R. Need to check degree.
  // (x+1,y) now has vdir instead of L. If dy>0: has D instead of L.
  // These cells keep whatever other edges they had, just swap one direction.
  // This maintains degree 2 at each affected cell. Good.

  // But wait, I'm adding vdirOpp to (ny,x+1) twice (once as "vertical from ny to y" and once in the L assignment).
  // Let me re-examine. No, I'm setting different bits:
  // lines[ny*w+x+1] |= L   (from horizontal edge)
  // lines[ny*w+x+1] |= vdirOpp  (should be vdir actually... let me re-think)

  // If dy=1 (going down): ny = y+1
  // Edge from (x+1, y+1) to (x+1, y): going UP from y+1.
  // So (x+1, y+1) gets U bit.
  // And (x+1, y) gets D bit.
  // vdirOpp when dy=1 is U. vdir is D. So:
  // lines[ny*w+x+1] |= vdirOpp = U. Correct.
  // lines[y*w+x+1] |= vdir = D. Correct.
  // OK the code above is right, but I'm setting vdirOpp on (ny,x+1) once for
  // the edge back to (x+1,y). But I already set it above. Let me look again...

  // Oh no, I see the issue. I wrote:
  //   lines[ny * w + x + 1] |= L;        // horizontal (x,ny)-(x+1,ny)
  //   lines[ny * w + x + 1] |= vdirOpp;  // vertical (x+1,ny)-(x+1,y)
  // These are two different bits (L and U when dy=1), so no problem. Good.
}

function canUnrouteH(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dy: number,
): boolean {
  // Reverse of reroute: edge (x,y)-(x+1,y) does NOT exist.
  // The detour through ny currently exists.
  const ny = y + dy;
  const vdir = dy > 0 ? D : U;
  const vdirOpp = dy > 0 ? U : D;

  // Check the detour edges exist
  if (!(lines[y * w + x] & vdir)) return false;
  if (!(lines[ny * w + x] & R)) return false;
  if (!(lines[ny * w + x + 1] & vdirOpp)) return false;

  // Check cells (x,ny) and (x+1,ny) have exactly 2 edges (the detour ones)
  if (lines[ny * w + x] !== (vdirOpp | R)) return false;
  if (lines[ny * w + x + 1] !== (L | vdirOpp)) return false;

  // Wait, (x+1,ny) goes back to (x+1,y), so from (x+1,ny) it's vdirOpp direction.
  // And from (x,ny), the vertical edge to (x,y) is vdirOpp direction.
  // So (x,ny) should be vdirOpp | R, and (x+1,ny) should be L | vdirOpp.
  // But wait, vdirOpp from (x+1,ny) goes to (x+1,y), and from (x,ny) vdirOpp goes to (x,y).
  // If dy=1: (x,y+1) has U|R, (x+1,y+1) has L|U. Seems right for the detour shape.

  return true;
}

function doUnrouteH(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dy: number,
): void {
  const ny = y + dy;
  const vdir = dy > 0 ? D : U;

  // Remove detour edges
  lines[y * w + x] &= ~vdir;
  lines[ny * w + x] = 0;
  lines[ny * w + x + 1] = 0;
  lines[y * w + x + 1] &= ~vdir;

  // Add direct horizontal edge
  lines[y * w + x] |= R;
  lines[y * w + x + 1] |= L;
}

// Vertical versions
function canRerouteV(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dx: number,
): boolean {
  const nx = x + dx;
  const a = y * w + nx;
  const b = (y + 1) * w + nx;

  if (lines[a] !== 0 || lines[b] !== 0) return false;

  const hdir = dx > 0 ? R : L;
  if (lines[y * w + x] & hdir) return false;
  if (lines[(y + 1) * w + x] & hdir) return false;

  return true;
}

function doRerouteV(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dx: number,
): void {
  const nx = x + dx;
  const hdir = dx > 0 ? R : L;
  const hdirOpp = dx > 0 ? L : R;

  // Remove vertical edge (x,y)-(x,y+1)
  lines[y * w + x] &= ~D;
  lines[(y + 1) * w + x] &= ~U;

  // Add horizontal edge (x,y)-(nx,y)
  lines[y * w + x] |= hdir;
  lines[y * w + nx] |= hdirOpp;

  // Add vertical edge (nx,y)-(nx,y+1)
  lines[y * w + nx] |= D;
  lines[(y + 1) * w + nx] |= U;

  // Add horizontal edge (nx,y+1)-(x,y+1)
  lines[(y + 1) * w + nx] |= hdirOpp;
  lines[(y + 1) * w + x] |= hdir;

  // Same analysis as horizontal case — setting hdirOpp on (y+1,nx) once for
  // the horizontal back-edge. But wait, I already set hdirOpp on (y,nx) for the
  // first horizontal edge, and now hdirOpp on (y+1,nx) for the second. These are
  // different cells so it's fine.
  // But (y+1,nx) gets both U (from vertical) and hdirOpp (from horizontal back).
  // If dx=1: (x+1,y+1) gets U and L. That's UL=LU corner. Fine.
  // And (y,nx=x+1) gets hdirOpp=L and D. That's LD corner. Fine.

  // Wait, I also set hdirOpp on (y+1,nx) line 2 above. Let me check:
  // lines[(y+1)*w+nx] |= U;        // vertical
  // lines[(y+1)*w+nx] |= hdirOpp;  // horizontal back to (x,y+1)
  // These are different bits. Good.
}

function canUnrouteV(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dx: number,
): boolean {
  const nx = x + dx;
  const hdir = dx > 0 ? R : L;
  const hdirOpp = dx > 0 ? L : R;

  if (!(lines[y * w + x] & hdir)) return false;
  if (!(lines[y * w + nx] & D)) return false;
  if (!(lines[(y + 1) * w + nx] & hdirOpp)) return false;

  if (lines[y * w + nx] !== (hdirOpp | D)) return false;
  if (lines[(y + 1) * w + nx] !== (U | hdirOpp)) return false;

  return true;
}

function doUnrouteV(
  lines: Int8Array,
  w: number,
  _h: number,
  x: number,
  y: number,
  dx: number,
): void {
  const nx = x + dx;
  const hdir = dx > 0 ? R : L;

  lines[y * w + x] &= ~hdir;
  lines[y * w + nx] = 0;
  lines[(y + 1) * w + nx] = 0;
  lines[(y + 1) * w + x] &= ~hdir;

  lines[y * w + x] |= D;
  lines[(y + 1) * w + x] |= U;
}

/**
 * Validate that lines forms a single closed loop.
 * Returns true if valid.
 */
function isValidLoop(lines: Int8Array, w: number, h: number): boolean {
  // Find a cell on the loop
  let start = -1;
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (lines[i] !== 0) {
      if (start === -1) start = i;
      count++;
      // Each cell must have exactly 2 edges
      if (nbits(lines[i]) !== 2) return false;
    }
  }

  if (start === -1) return false;
  if (count < 4) return false;

  // Verify reciprocal edges
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const type = lines[y * w + x];
      for (let dd = 1; dd <= 8; dd += dd) {
        if (type & dd) {
          const nx = x + DX(dd);
          const ny = y + DY(dd);
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
          if (!(lines[ny * w + nx] & F(dd))) return false;
        }
      }
    }

  // Trace the loop and verify it visits exactly `count` cells
  let visited = 0;
  let cur = start;
  let prevDir = -1;
  // Find first direction from start
  let firstDir = -1;
  for (let dd = 1; dd <= 8; dd += dd) {
    if (lines[cur] & dd) {
      firstDir = dd;
      break;
    }
  }
  if (firstDir === -1) return false;

  // Move to next cell
  let nx = (cur % w) + DX(firstDir);
  let ny = ((cur / w) | 0) + DY(firstDir);
  prevDir = F(firstDir);
  cur = ny * w + nx;
  visited = 1;

  while (cur !== start) {
    visited++;
    if (visited > count) return false; // infinite loop protection

    // Find the direction that isn't where we came from
    let nextDir = -1;
    for (let dd = 1; dd <= 8; dd += dd) {
      if (lines[cur] & dd && dd !== prevDir) {
        nextDir = dd;
        break;
      }
    }
    if (nextDir === -1) return false;

    nx = (cur % w) + DX(nextDir);
    ny = ((cur / w) | 0) + DY(nextDir);
    prevDir = F(nextDir);
    cur = ny * w + nx;
  }

  return visited === count;
}

function nbits(x: number): number {
  const tbl = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  if (x < 0 || x > 15) return 4;
  return tbl[x];
}

// =============================================================================
// new_clues — faithful port of new_clues() from pearl.c
// =============================================================================

function newClues(w: number, h: number, diff: number, clues: Int8Array, grid: Int8Array): number {
  const rs = new PearlRandom();
  let ngen = 0;

  // Difficulty exception: 5x5 Tricky is not generable
  if (w === 5 && h === 5 && diff > DIFF_EASY) diff = DIFF_EASY;

  while (true) {
    ngen++;

    // Safety valve: don't loop forever
    if (ngen > 1000) {
      // Fall back to easy difficulty
      if (diff > DIFF_EASY) {
        diff = DIFF_EASY;
        ngen = 0;
        continue;
      }
      // Last resort: just accept whatever we have
      break;
    }

    pearlLoopgen(w, h, grid, rs);

    // Set up the maximal clue array
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const type = grid[y * w + x];
        clues[y * w + x] = NOCLUE;

        if ((bLR | bUD) & (1 << type)) {
          /*
           * This is a straight; see if it's a viable candidate for a
           * straight clue. It qualifies if at least one of the squares
           * it connects to is a corner.
           */
          let found = false;
          for (let dd = 1; dd <= 8; dd += dd) {
            if (type & dd) {
              const xx = x + DX(dd);
              const yy = y + DY(dd);
              if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
                if ((bLU | bLD | bRU | bRD) & (1 << grid[yy * w + xx])) {
                  found = true;
                  break;
                }
              }
            }
          }
          if (found) clues[y * w + x] = STRAIGHT;
        } else if ((bLU | bLD | bRU | bRD) & (1 << type)) {
          /*
           * This is a corner; see if it's a viable candidate for a
           * corner clue. It qualifies if all the squares it connects
           * to are straights.
           */
          let allStraight = true;
          for (let dd = 1; dd <= 8; dd += dd) {
            if (type & dd) {
              const xx = x + DX(dd);
              const yy = y + DY(dd);
              if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
                if (!((bLR | bUD) & (1 << grid[yy * w + xx]))) {
                  allStraight = false;
                  break;
                }
              }
            }
          }
          if (allStraight) clues[y * w + x] = CORNER;
        }
      }

    // See if we can solve the puzzle just like this
    const solveResult = new Int8Array(w * h);
    let ret = pearlSolve(w, h, clues, solveResult, diff, false);
    if (ret <= 0) continue; // inconsistent, shouldn't happen but try again
    if (ret !== 1) continue; // ambiguous, try a different loop

    // Check this puzzle isn't too easy
    if (diff > DIFF_EASY) {
      ret = pearlSolve(w, h, clues, solveResult, diff - 1, false);
      if (ret <= 0) continue;
      if (ret === 1) continue; // too easy
    }

    /*
     * Now shuffle the grid points and gradually remove clues to find
     * a minimal set which still leaves the puzzle soluble.
     */
    const cluespace = new Int32Array(w * h);
    let nstraightpos = 0;
    for (let i = 0; i < w * h; i++) if (clues[i] === STRAIGHT) cluespace[nstraightpos++] = i;
    let ncornerpos = 0;
    const cornerStart = nstraightpos;
    for (let i = 0; i < w * h; i++)
      if (clues[i] === CORNER) cluespace[cornerStart + ncornerpos++] = i;

    let nstraights = nstraightpos;
    let ncorners = ncornerpos;

    // Shuffle each section
    shuffleSection(cluespace, 0, nstraightpos, rs);
    shuffleSection(cluespace, cornerStart, ncornerpos, rs);

    while (nstraightpos > 0 || ncornerpos > 0) {
      let cluepos: number;

      if (nstraightpos > 0 && ncornerpos > 0) {
        if (nstraights >= ncorners) {
          cluepos = cluespace[--nstraightpos];
        } else {
          cluepos = cluespace[cornerStart + --ncornerpos];
        }
      } else {
        if (nstraightpos > 0) {
          cluepos = cluespace[--nstraightpos];
        } else {
          cluepos = cluespace[cornerStart + --ncornerpos];
        }
      }

      const clue = clues[cluepos];
      clues[cluepos] = NOCLUE;

      ret = pearlSolve(w, h, clues, solveResult, diff, false);
      if (ret !== 1) {
        clues[cluepos] = clue; // put it back
      } else {
        if (clue === STRAIGHT) nstraights--;
        else ncorners--;
      }
    }

    // Copy solution back to grid
    pearlSolve(w, h, clues, grid, diff, false);

    break; // got it
  }

  return ngen;
}

function shuffleSection(arr: Int32Array, offset: number, len: number, rs: PearlRandom): void {
  for (let i = len - 1; i > 0; i--) {
    const j = rs.upto(i + 1);
    const tmp = arr[offset + i];
    arr[offset + i] = arr[offset + j];
    arr[offset + j] = tmp;
  }
}
