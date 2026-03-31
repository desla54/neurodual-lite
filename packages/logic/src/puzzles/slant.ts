/**
 * Slant puzzle generator — faithful port of Simon Tatham's slant.c
 *
 * Generates a grid of squares, each containing a \ or / diagonal, with
 * clue numbers at intersection points. The solution must have no loops.
 *
 * Convention (from slant.c):
 *   w, h = dimensions of the grid of squares
 *   W = w+1, H = h+1 = dimensions of the grid of points (intersections)
 *   Clues array: W*H, values 0-4 or -1 (no clue) at each intersection
 *   Solution array: w*h, -1 = backslash (\), +1 = forward slash (/)
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=slant.c
 */

// =============================================================================
// Public interface
// =============================================================================

export interface SlantPuzzle {
  /** (W+1)*(H+1) array of clue numbers at intersections, null = no clue */
  clues: (number | null)[];
  /** Width of grid in squares */
  w: number;
  /** Height of grid in squares */
  h: number;
  /** W*H array: 0 = backslash (\), 1 = forward slash (/) */
  solution: number[];
}

// =============================================================================
// Difficulty levels — ported from slant.c
// =============================================================================

const DIFF_EASY = 0;
const DIFF_HARD = 1;

// =============================================================================
// DSF (Disjoint Set Forest) — faithful port of dsf.c
//
// Each element stores:
//   bit 0: whether this element is inverse to its parent (not used for slant,
//          but kept for faithful port)
//   bit 1: whether this element is the root of its tree
//   bits 2+: if root, the size of the tree; otherwise, the parent index
//
// Initialized to 6 = (1 << 2) | (1 << 1) | 0
//   = size 1, is root, not inverse
// =============================================================================

function dsfInit(dsf: Int32Array): void {
  for (let i = 0; i < dsf.length; i++) dsf[i] = 6;
}

function newDsf(size: number): Int32Array {
  const dsf = new Int32Array(size);
  dsfInit(dsf);
  return dsf;
}

function dsfCanonify(dsf: Int32Array, index: number): number {
  const startIndex = index;
  let inverse = 0;

  // Find canonical element
  while ((dsf[index]! & 2) === 0) {
    inverse ^= dsf[index]! & 1;
    index = dsf[index]! >> 2;
  }
  const canonicalIndex = index;

  // Path compression: update every member to point directly at canonical
  index = startIndex;
  while (index !== canonicalIndex) {
    const nextIndex = dsf[index]! >> 2;
    const nextInverse = inverse ^ (dsf[index]! & 1);
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

  // Always make the smaller index the new canonical element
  if (v1 > v2) {
    const v3 = v1;
    v1 = v2;
    v2 = v3;
  }
  dsf[v1] = (dsf[v1]! + ((dsf[v2]! >> 2) << 2)) | 0;
  dsf[v2] = (v1 << 2) | 0;
}

// =============================================================================
// Solver scratch space — ported from slant.c struct solver_scratch
// =============================================================================

interface SolverScratch {
  /** DSF tracking connected sets of points */
  connected: Int32Array;
  /** Number of possible exits from each connected set */
  exits: Int32Array;
  /** Whether each connected set includes a border point */
  border: Uint8Array;
  /** DSF tracking squares known to slant in the same direction */
  equiv: Int32Array;
  /** Known slash values for equivalence classes */
  slashval: Int8Array;
  /** Possible v-shapes bitmap */
  vbitmap: Uint8Array;
  /** Reference to clues array (not owned) */
  clues: Int8Array;
}

function newScratch(w: number, h: number): SolverScratch {
  const W = w + 1;
  const H = h + 1;
  return {
    connected: new Int32Array(W * H),
    exits: new Int32Array(W * H),
    border: new Uint8Array(W * H),
    equiv: new Int32Array(w * h),
    slashval: new Int8Array(w * h),
    vbitmap: new Uint8Array(w * h),
    clues: new Int8Array(0), // set later
  };
}

// =============================================================================
// merge_vertices — ported from slant.c
// =============================================================================

function mergeVertices(
  connected: Int32Array,
  sc: SolverScratch | null,
  i: number,
  j: number,
): void {
  let exits = -1;
  let border = false;

  if (sc) {
    i = dsfCanonify(connected, i);
    j = dsfCanonify(connected, j);

    /*
     * We have used one possible exit from each of the two
     * classes. Thus, the viable exit count of the new class is
     * the sum of the old exit counts minus two.
     */
    exits = sc.exits[i]! + sc.exits[j]! - 2;
    border = !!(sc.border[i] || sc.border[j]);
  }

  dsfMerge(connected, i, j);

  if (sc) {
    i = dsfCanonify(connected, i);
    sc.exits[i] = exits;
    sc.border[i] = border ? 1 : 0;
  }
}

// =============================================================================
// decr_exits — ported from slant.c
// =============================================================================

function decrExits(sc: SolverScratch, i: number): void {
  if (sc.clues[i]! < 0) {
    i = dsfCanonify(sc.connected, i);
    sc.exits[i] = sc.exits[i]! - 1;
  }
}

// =============================================================================
// fill_square — ported from slant.c
//
// v: -1 = backslash, +1 = forward slash
// =============================================================================

function fillSquare(
  w: number,
  _h: number,
  x: number,
  y: number,
  v: number,
  soln: Int8Array,
  connected: Int32Array,
  sc: SolverScratch | null,
): void {
  const W = w + 1;

  if (soln[y * w + x] !== 0) {
    return; // already filled
  }

  soln[y * w + x] = v;

  if (sc) {
    const c = dsfCanonify(sc.equiv, y * w + x);
    sc.slashval[c] = v;
  }

  if (v < 0) {
    // Backslash: connects (x,y) to (x+1,y+1)
    mergeVertices(connected, sc, y * W + x, (y + 1) * W + (x + 1));
    if (sc) {
      decrExits(sc, y * W + (x + 1));
      decrExits(sc, (y + 1) * W + x);
    }
  } else {
    // Forward slash: connects (x+1,y) to (x,y+1)
    mergeVertices(connected, sc, y * W + (x + 1), (y + 1) * W + x);
    if (sc) {
      decrExits(sc, y * W + x);
      decrExits(sc, (y + 1) * W + (x + 1));
    }
  }
}

// =============================================================================
// vbitmap_clear — ported from slant.c
// =============================================================================

function vbitmapClear(
  w: number,
  _h: number,
  sc: SolverScratch,
  x: number,
  y: number,
  vbits: number,
): boolean {
  let doneSomething = false;

  for (let vbit = 1; vbit <= 8; vbit <<= 1) {
    if (vbits & sc.vbitmap[y * w + x]! & vbit) {
      doneSomething = true;
      sc.vbitmap[y * w + x] = sc.vbitmap[y * w + x]! & ~vbit;
    }
  }

  return doneSomething;
}

// =============================================================================
// slant_solve — ported from slant.c
//
// Returns 0 for impossibility, 1 for success, 2 for ambiguity/failure
// =============================================================================

function slantSolve(
  w: number,
  h: number,
  clues: Int8Array,
  soln: Int8Array,
  sc: SolverScratch,
  difficulty: number,
): number {
  const W = w + 1;
  const H = h + 1;
  let doneSomething: boolean;

  // Clear the output
  soln.fill(0);

  sc.clues = clues;

  // Establish DSFs
  dsfInit(sc.connected);
  dsfInit(sc.equiv);

  // Clear slashval
  sc.slashval.fill(0);

  // Set up vbitmap — initially all types of v are possible
  sc.vbitmap.fill(0xf);

  // Initialise exits and border arrays
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) {
        sc.border[y * W + x] = 1;
      } else {
        sc.border[y * W + x] = 0;
      }

      if (clues[y * W + x]! < 0) {
        sc.exits[y * W + x] = 4;
      } else {
        sc.exits[y * W + x] = clues[y * W + x]!;
      }
    }
  }

  // Repeatedly try to deduce something
  do {
    doneSomething = false;

    /*
     * Any clue point with the number of remaining lines equal
     * to zero or to the number of remaining undecided
     * neighbouring squares can be filled in completely.
     */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const neighbours: { pos: number; slash: number }[] = [];

        const c = clues[y * W + x]!;
        if (c < 0) continue;

        // List neighbouring squares
        if (x > 0 && y > 0) {
          neighbours.push({ pos: (y - 1) * w + (x - 1), slash: -1 });
        }
        if (x > 0 && y < h) {
          neighbours.push({ pos: y * w + (x - 1), slash: +1 });
        }
        if (x < w && y < h) {
          neighbours.push({ pos: y * w + x, slash: -1 });
        }
        if (x < w && y > 0) {
          neighbours.push({ pos: (y - 1) * w + x, slash: +1 });
        }

        const nneighbours = neighbours.length;

        /*
         * Count up the number of undecided neighbours, and
         * also the number of lines already present.
         */
        let nu = 0;
        let nl = c;
        let last = neighbours[nneighbours - 1]!.pos;
        let eq: number;
        if (soln[last]! === 0) {
          eq = dsfCanonify(sc.equiv, last);
        } else {
          eq = -1;
        }
        let meq = -1;
        let mj1 = -1;
        let mj2 = -1;

        for (let i = 0; i < nneighbours; i++) {
          const j = neighbours[i]!.pos;
          const s = neighbours[i]!.slash;
          if (soln[j]! === 0) {
            nu++;
            if (meq < 0 && difficulty > DIFF_EASY) {
              const eq2 = dsfCanonify(sc.equiv, j);
              if (eq === eq2 && last !== j) {
                meq = eq;
                mj1 = last;
                mj2 = j;
                nl--;
                nu -= 2;
              } else {
                eq = eq2;
              }
            }
          } else {
            eq = -1;
            if (soln[j]! === s) nl--;
          }
          last = j;
        }

        // Check the counts
        if (nl < 0 || nl > nu) {
          return 0; // impossible
        }

        if (nu > 0 && (nl === 0 || nl === nu)) {
          for (let i = 0; i < nneighbours; i++) {
            const j = neighbours[i]!.pos;
            const s = neighbours[i]!.slash;
            if (soln[j]! === 0 && j !== mj1 && j !== mj2) {
              fillSquare(w, h, j % w, (j / w) | 0, nl ? s : -s, soln, sc.connected, sc);
            }
          }
          doneSomething = true;
        } else if (nu === 2 && nl === 1 && difficulty > DIFF_EASY) {
          /*
           * If we have precisely two undecided squares
           * and precisely one line to place between
           * them, _and_ those squares are adjacent, then
           * we can mark them as equivalent.
           */
          let lastIdx = -1;
          let foundI = -1;
          for (let i = 0; i < nneighbours; i++) {
            const j = neighbours[i]!.pos;
            if (soln[j]! === 0 && j !== mj1 && j !== mj2) {
              if (lastIdx < 0) {
                lastIdx = i;
              } else if (lastIdx === i - 1 || (lastIdx === 0 && i === 3)) {
                foundI = i;
                break;
              }
            }
          }
          if (foundI >= 0 && lastIdx >= 0) {
            let emj1 = neighbours[lastIdx]!.pos;
            let emj2 = neighbours[foundI]!.pos;
            emj1 = dsfCanonify(sc.equiv, emj1);
            const sv1 = sc.slashval[emj1]!;
            emj2 = dsfCanonify(sc.equiv, emj2);
            const sv2 = sc.slashval[emj2]!;
            if (sv1 !== 0 && sv2 !== 0 && sv1 !== sv2) {
              return 0;
            }
            const sv = sv1 ? sv1 : sv2;
            dsfMerge(sc.equiv, emj1, emj2);
            emj1 = dsfCanonify(sc.equiv, emj1);
            sc.slashval[emj1] = sv;
          }
        }
      }
    }

    if (doneSomething) continue;

    /*
     * Failing that, apply the second condition: no square may be
     * filled in such a way as to form a loop. Also check slashval.
     */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let fs = false;
        let bs = false;

        if (soln[y * w + x]) continue; // already filled

        let v: number;
        if (difficulty > DIFF_EASY) {
          v = sc.slashval[dsfCanonify(sc.equiv, y * w + x)]!;
        } else {
          v = 0;
        }

        // Try to rule out backslash (connectivity between (x,y) and (x+1,y+1))
        let c1 = dsfCanonify(sc.connected, y * W + x);
        let c2 = dsfCanonify(sc.connected, (y + 1) * W + (x + 1));
        if (c1 === c2) {
          fs = true; // simple loop avoidance
        }
        if (
          difficulty > DIFF_EASY &&
          !sc.border[c1] &&
          !sc.border[c2] &&
          sc.exits[c1]! <= 1 &&
          sc.exits[c2]! <= 1
        ) {
          fs = true; // dead end avoidance
        }
        if (v === +1) {
          fs = true; // equivalence
        }

        // Try to rule out forward slash (connectivity between (x+1,y) and (x,y+1))
        c1 = dsfCanonify(sc.connected, y * W + (x + 1));
        c2 = dsfCanonify(sc.connected, (y + 1) * W + x);
        if (c1 === c2) {
          bs = true;
        }
        if (
          difficulty > DIFF_EASY &&
          !sc.border[c1] &&
          !sc.border[c2] &&
          sc.exits[c1]! <= 1 &&
          sc.exits[c2]! <= 1
        ) {
          bs = true;
        }
        if (v === -1) {
          bs = true;
        }

        if (fs && bs) {
          return 0; // impossible
        }

        if (fs) {
          fillSquare(w, h, x, y, +1, soln, sc.connected, sc);
          doneSomething = true;
        } else if (bs) {
          fillSquare(w, h, x, y, -1, soln, sc.connected, sc);
          doneSomething = true;
        }
      }
    }

    if (doneSomething) continue;

    /*
     * Now see what we can do with the vbitmap array.
     * All vbitmap deductions are disabled at Easy level.
     */
    if (difficulty <= DIFF_EASY) continue;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Any line already placed must rule out contradicting v-shapes
        const s = soln[y * w + x]!;
        if (s !== 0) {
          if (x > 0) {
            doneSomething = vbitmapClear(w, h, sc, x - 1, y, s < 0 ? 0x1 : 0x2) || doneSomething;
          }
          if (x + 1 < w) {
            doneSomething = vbitmapClear(w, h, sc, x, y, s < 0 ? 0x2 : 0x1) || doneSomething;
          }
          if (y > 0) {
            doneSomething = vbitmapClear(w, h, sc, x, y - 1, s < 0 ? 0x4 : 0x8) || doneSomething;
          }
          if (y + 1 < h) {
            doneSomething = vbitmapClear(w, h, sc, x, y, s < 0 ? 0x8 : 0x4) || doneSomething;
          }
        }

        // If both types of v are ruled out, mark as equivalent
        if (x + 1 < w && !(sc.vbitmap[y * w + x]! & 0x3)) {
          const n1 = y * w + x;
          const n2 = y * w + (x + 1);
          if (dsfCanonify(sc.equiv, n1) !== dsfCanonify(sc.equiv, n2)) {
            dsfMerge(sc.equiv, n1, n2);
            doneSomething = true;
          }
        }
        if (y + 1 < h && !(sc.vbitmap[y * w + x]! & 0xc)) {
          const n1 = y * w + x;
          const n2 = (y + 1) * w + x;
          if (dsfCanonify(sc.equiv, n1) !== dsfCanonify(sc.equiv, n2)) {
            dsfMerge(sc.equiv, n1, n2);
            doneSomething = true;
          }
        }

        // Remaining work only for non-edge clue points
        if (y === 0 || x === 0) continue;
        const c = clues[y * W + x]!;
        if (c < 0) continue;

        if (c === 1) {
          doneSomething = vbitmapClear(w, h, sc, x - 1, y - 1, 0x5) || doneSomething;
          doneSomething = vbitmapClear(w, h, sc, x - 1, y, 0x2) || doneSomething;
          doneSomething = vbitmapClear(w, h, sc, x, y - 1, 0x8) || doneSomething;
        } else if (c === 3) {
          doneSomething = vbitmapClear(w, h, sc, x - 1, y - 1, 0xa) || doneSomething;
          doneSomething = vbitmapClear(w, h, sc, x - 1, y, 0x1) || doneSomething;
          doneSomething = vbitmapClear(w, h, sc, x, y - 1, 0x4) || doneSomething;
        } else if (c === 2) {
          doneSomething =
            vbitmapClear(w, h, sc, x - 1, y - 1, (sc.vbitmap[y * w + (x - 1)]! & 0x3) ^ 0x3) ||
            doneSomething;
          doneSomething =
            vbitmapClear(w, h, sc, x - 1, y - 1, (sc.vbitmap[(y - 1) * w + x]! & 0xc) ^ 0xc) ||
            doneSomething;
          doneSomething =
            vbitmapClear(w, h, sc, x - 1, y, (sc.vbitmap[(y - 1) * w + (x - 1)]! & 0x3) ^ 0x3) ||
            doneSomething;
          doneSomething =
            vbitmapClear(w, h, sc, x, y - 1, (sc.vbitmap[(y - 1) * w + (x - 1)]! & 0xc) ^ 0xc) ||
            doneSomething;
        }
      }
    }
  } while (doneSomething);

  // Check if grid is full
  for (let i = 0; i < w * h; i++) {
    if (!soln[i]) return 2; // failed to converge
  }
  return 1; // success
}

// =============================================================================
// slant_generate — filled-grid generator, ported from slant.c
//
// Fills the grid with random diagonals avoiding loops.
// Never needs to backtrack (see proof in slant.c comments).
// =============================================================================

function slantGenerate(w: number, h: number, soln: Int8Array): void {
  const W = w + 1;
  const H = h + 1;

  soln.fill(0);

  const connected = newDsf(W * H);

  // Prepare random order of squares
  const indices = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) indices[i] = i;
  shuffle(indices);

  // Fill in each one in turn
  for (let i = 0; i < w * h; i++) {
    const y = (indices[i]! / w) | 0;
    const x = indices[i]! % w;

    const fs = dsfCanonify(connected, y * W + x) === dsfCanonify(connected, (y + 1) * W + (x + 1));
    const bs = dsfCanonify(connected, (y + 1) * W + x) === dsfCanonify(connected, y * W + (x + 1));

    // It's proven impossible for both fs and bs to be true
    const v = fs ? +1 : bs ? -1 : 2 * randomUpto(2) - 1;
    fillSquare(w, h, x, y, v, soln, connected, null);
  }
}

// =============================================================================
// new_game_desc — the main puzzle generation entry point, ported from slant.c
//
// 1. Generate a random solution grid with no loops
// 2. Compute all clues from the solution
// 3. Winnow clues: remove as many as possible while retaining solubility
// 4. For DIFF_HARD: verify the puzzle can't be solved at DIFF_EASY
// =============================================================================

function newGameDesc(w: number, h: number, diff: number): { clues: Int8Array; soln: Int8Array } {
  const W = w + 1;
  const H = h + 1;

  const soln = new Int8Array(w * h);
  const tmpsoln = new Int8Array(w * h);
  const clues = new Int8Array(W * H);
  const clueindices = new Int32Array(W * H);
  const sc = newScratch(w, h);

  let attempts = 0;
  do {
    attempts++;
    if (attempts > 200) {
      // Safety valve — relax to DIFF_EASY if we can't generate at target difficulty
      diff = DIFF_EASY;
    }

    // Create the filled grid
    slantGenerate(w, h, soln);

    // Fill in the complete set of clues
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0;

        if (x > 0 && y > 0 && soln[(y - 1) * w + (x - 1)] === -1) v++;
        if (x > 0 && y < h && soln[y * w + (x - 1)] === +1) v++;
        if (x < w && y > 0 && soln[(y - 1) * w + x] === +1) v++;
        if (x < w && y < h && soln[y * w + x] === -1) v++;

        clues[y * W + x] = v;
      }
    }

    // With all clues, the puzzle is trivially solvable
    // (assert not needed in production, but the C code asserts here)
    slantSolve(w, h, clues, tmpsoln, sc, DIFF_EASY);

    /*
     * Remove as many clues as possible while retaining solubility.
     *
     * In DIFF_HARD mode, prioritise removal of obvious starting points
     * (4s, 0s, border 2s and corner 1s) in a first pass.
     */
    for (let i = 0; i < W * H; i++) clueindices[i] = i;
    shuffle(clueindices);

    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < W * H; i++) {
        const y = (clueindices[i]! / W) | 0;
        const x = clueindices[i]! % W;
        const v = clues[y * W + x]!;

        // Identify which pass this point belongs in
        const xb = x === 0 || x === W - 1;
        const yb = y === 0 || y === H - 1;
        let pass: number;
        if (
          diff === DIFF_EASY ||
          v === 4 ||
          v === 0 ||
          (v === 2 && (xb || yb)) ||
          (v === 1 && xb && yb)
        ) {
          pass = 0;
        } else {
          pass = 1;
        }

        if (pass === j) {
          clues[y * W + x] = -1;
          if (slantSolve(w, h, clues, tmpsoln, sc, diff) !== 1) {
            clues[y * W + x] = v; // put it back
          }
        }
      }
    }

    /*
     * Verify that the grid is of _at least_ the requested difficulty
     * by running the solver one level down and verifying it can't manage it.
     */
  } while (diff > 0 && slantSolve(w, h, clues, tmpsoln, sc, diff - 1) <= 1);

  return { clues, soln };
}

// =============================================================================
// Random helpers
// =============================================================================

function randomUpto(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle(arr: Int32Array): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomUpto(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a Slant puzzle of the given dimensions.
 *
 * Uses DIFF_HARD by default for more interesting puzzles.
 * Falls back to DIFF_EASY if hard generation takes too many attempts.
 *
 * @param w - Width (number of squares)
 * @param h - Height (number of squares)
 * @returns A SlantPuzzle with clues, dimensions, and solution
 */
export function generateSlantPuzzle(w: number, h: number, difficulty?: number): SlantPuzzle {
  if (w < 2 || h < 2) {
    throw new Error('Width and height must both be at least 2');
  }

  const diff = difficulty != null ? (difficulty <= 0 ? DIFF_EASY : DIFF_HARD) : DIFF_HARD;
  const { clues: rawClues, soln: rawSoln } = newGameDesc(w, h, diff);

  const W = w + 1;
  const H = h + 1;

  // Convert internal representation to public interface:
  // clues: -1 → null, 0-4 → number
  // solution: -1 (backslash) → 0, +1 (forward slash) → 1
  const clues: (number | null)[] = new Array(W * H);
  for (let i = 0; i < W * H; i++) {
    clues[i] = rawClues[i]! < 0 ? null : rawClues[i]!;
  }

  const solution: number[] = new Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Internal: -1 = backslash, +1 = forward slash
    // Public: 0 = backslash, 1 = forward slash
    solution[i] = rawSoln[i]! < 0 ? 0 : 1;
  }

  return { clues, w, h, solution };
}
