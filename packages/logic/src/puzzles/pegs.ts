/**
 * Peg Solitaire puzzle generator -- faithful port of Simon Tatham's pegs.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Generates puzzles by working BACKWARDS from a single peg. It starts with
 * one peg in the centre and repeatedly makes random reverse moves ("un-jumps")
 * to create valid starting positions. This guarantees solvability.
 *
 * For the fixed board types (cross/octagon), the standard layout is used with
 * a carefully chosen starting hole (octagon requires specific hole positions
 * to be soluble -- see the parity proof in the C source).
 */

// ---------------------------------------------------------------------------
// Cell constants
// ---------------------------------------------------------------------------

/** Empty hole a peg can jump into */
export const HOLE = 0;
/** A peg */
export const PEG = 1;
/** Blocked / obstacle / not part of the board */
export const BLOCKED = 2;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PegsPuzzle {
  /** Flat row-major grid: 0 = hole, 1 = peg, 2 = blocked/invalid */
  grid: Uint8Array;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const PEGS_PRESETS = {
  easy: { w: 7, h: 7, type: 'cross' as const },
  medium: { w: 7, h: 7, type: 'octagon' as const },
  hard: { w: 9, h: 9, type: 'random' as const },
} as const;

// ---------------------------------------------------------------------------
// Move structure for the generation tree
// ---------------------------------------------------------------------------

interface Move {
  x: number;
  y: number;
  dx: number;
  dy: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Sorted array as a stand-in for Tatham's tree234
//
// The C code uses two balanced trees (by-move and by-cost) for O(log n)
// insert/delete/lookup. For the board sizes we deal with (up to ~9x9), a
// simple sorted array with binary search is fast enough and much simpler.
// ---------------------------------------------------------------------------

function moveKey(m: Move): string {
  return `${m.y},${m.x},${m.dy},${m.dx}`;
}

class MoveSet {
  private byMove = new Map<string, Move>();
  private byCost: Move[] = [];
  private costDirty = false;

  private rebuildCost(): void {
    if (!this.costDirty) return;
    this.byCost = Array.from(this.byMove.values());
    this.byCost.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      if (a.dy !== b.dy) return a.dy - b.dy;
      return a.dx - b.dx;
    });
    this.costDirty = false;
  }

  find(m: Move): Move | undefined {
    return this.byMove.get(moveKey(m));
  }

  add(m: Move): void {
    const key = moveKey(m);
    this.byMove.set(key, { ...m });
    this.costDirty = true;
  }

  remove(m: Move): Move | undefined {
    const key = moveKey(m);
    const existing = this.byMove.get(key);
    if (existing) {
      this.byMove.delete(key);
      this.costDirty = true;
    }
    return existing;
  }

  /** Count of moves with cost <= maxCost */
  countUpTo(maxCost: number): number {
    this.rebuildCost();
    let count = 0;
    for (const m of this.byCost) {
      if (m.cost > maxCost) break;
      count++;
    }
    return count;
  }

  /** Get the move at the given index in cost-sorted order */
  getAt(index: number): Move {
    this.rebuildCost();
    return this.byCost[index]!;
  }

  get size(): number {
    return this.byMove.size;
  }
}

// ---------------------------------------------------------------------------
// update_moves -- port of the C function
//
// For a given cell (x,y), enumerate all 12 possible reverse moves that
// include that cell (3 positions x 4 directions). Add valid ones to the
// move set, remove invalid ones, and correct costs.
// ---------------------------------------------------------------------------

function updateMoves(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  moves: MoveSet,
): void {
  for (let dir = 0; dir < 4; dir++) {
    let dx: number;
    let dy: number;

    if (dir & 1) {
      dx = 0;
      dy = dir - 2; // dir=1 -> dy=-1, dir=3 -> dy=1
    } else {
      dy = 0;
      dx = dir - 1; // dir=0 -> dx=-1, dir=2 -> dx=1
    }

    for (let pos = 0; pos < 3; pos++) {
      const move: Move = {
        dx,
        dy,
        x: x - pos * dx,
        y: y - pos * dy,
        cost: 0,
      };

      // Check bounds for start
      if (move.x < 0 || move.x >= w || move.y < 0 || move.y >= h) continue;
      // Check bounds for end
      if (
        move.x + 2 * move.dx < 0 ||
        move.x + 2 * move.dx >= w ||
        move.y + 2 * move.dy < 0 ||
        move.y + 2 * move.dy >= h
      )
        continue;

      const v1 = grid[move.y * w + move.x]!;
      const v2 = grid[(move.y + move.dy) * w + (move.x + move.dx)]!;
      const v3 = grid[(move.y + 2 * move.dy) * w + (move.x + 2 * move.dx)]!;

      if (v1 === PEG && v2 !== PEG && v3 !== PEG) {
        // Valid reverse move
        move.cost = (v2 === BLOCKED ? 1 : 0) + (v3 === BLOCKED ? 1 : 0);

        const existing = moves.find(move);
        if (existing && existing.cost !== move.cost) {
          // Remove old version with wrong cost
          moves.remove(move);
          moves.add(move);
        } else if (!existing) {
          moves.add(move);
        }
      } else {
        // Invalid move -- remove if present
        moves.remove(move);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// pegs_genmoves -- the core backward-generation loop
//
// Starting from a grid with a single peg, repeatedly pick random reverse
// moves (un-jumps). A reverse move takes a peg at (x,y) and creates two
// new pegs at (x+dx,y+dy) and (x+2dx,y+2dy), turning the original into
// a hole. Prefers zero-cost moves (reusing existing board space) over
// moves that expand into BLOCKED territory.
// ---------------------------------------------------------------------------

function pegsGenMoves(grid: Uint8Array, w: number, h: number): void {
  const moves = new MoveSet();

  // Seed the move set with all valid moves from the initial single peg
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === PEG) {
        updateMoves(grid, w, h, x, y, moves);
      }
    }
  }

  let nmoves = 0;

  while (true) {
    // After filling at least half the grid, stop accepting cost-2 moves
    const maxCost = nmoves < (w * h) / 2 ? 2 : 1;

    let limit = 0;
    let foundCost = -1;

    for (let cost = 0; cost <= maxCost; cost++) {
      const count = moves.countUpTo(cost);
      if (count > 0) {
        limit = count;
        foundCost = cost;
        break;
      }
    }

    if (foundCost < 0) break; // No moves available

    // Pick a random move among those with the lowest available cost
    const index = Math.floor(Math.random() * limit);
    const move = moves.getAt(index);

    // Execute the reverse move:
    // - Original peg becomes a hole
    // - Two new pegs appear ahead of it
    grid[move.y * w + move.x] = HOLE;
    grid[(move.y + move.dy) * w + (move.x + move.dx)] = PEG;
    grid[(move.y + 2 * move.dy) * w + (move.x + 2 * move.dx)] = PEG;

    // Update available moves for the three affected cells
    for (let i = 0; i <= 2; i++) {
      const tx = move.x + i * move.dx;
      const ty = move.y + i * move.dy;
      updateMoves(grid, w, h, tx, ty, moves);
    }

    nmoves++;
  }
}

// ---------------------------------------------------------------------------
// pegs_generate -- wrapper that retries until the board touches all four edges
// ---------------------------------------------------------------------------

function pegsGenerate(grid: Uint8Array, w: number, h: number): void {
  while (true) {
    // Fill with BLOCKED, place a single peg in the centre
    grid.fill(BLOCKED);
    grid[(h >> 1) * w + (w >> 1)] = PEG;

    pegsGenMoves(grid, w, h);

    // Check the board touches all four edges
    let extremes = 0;
    for (let y = 0; y < h; y++) {
      if (grid[y * w] !== BLOCKED) extremes |= 1;
      if (grid[y * w + w - 1] !== BLOCKED) extremes |= 2;
    }
    for (let x = 0; x < w; x++) {
      if (grid[x] !== BLOCKED) extremes |= 4;
      if (grid[(h - 1) * w + x] !== BLOCKED) extremes |= 8;
    }

    if (extremes === 15) break;
  }
}

// ---------------------------------------------------------------------------
// Fixed board layouts (cross and octagon)
// ---------------------------------------------------------------------------

function generateCrossBoard(grid: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.abs(x - (w >> 1));
      const cy = Math.abs(y - (h >> 1));
      let v: number;
      if (cx === 0 && cy === 0) {
        v = HOLE; // centre starts empty
      } else if (cx > 1 && cy > 1) {
        v = BLOCKED;
      } else {
        v = PEG;
      }
      grid[y * w + x] = v;
    }
  }
}

function generateOctagonBoard(grid: Uint8Array, w: number, h: number): void {
  const maxDim = Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.abs(x - (w >> 1));
      const cy = Math.abs(y - (h >> 1));
      grid[y * w + x] = cx + cy > 1 + (maxDim >> 1) ? BLOCKED : PEG;
    }
  }

  // The European (octagon) layout is insoluble with a centre hole.
  // Pick from one of the three equivalence classes of valid starting holes.
  // See the parity proof in pegs.c for details.
  const cls = Math.floor(Math.random() * 3);
  switch (cls) {
    case 0: {
      // Remove a random corner piece
      let dx = Math.floor(Math.random() * 2) * 2 - 1; // +1 or -1
      let dy = Math.floor(Math.random() * 2) * 2 - 1;
      if (Math.random() < 0.5) {
        dy *= 3;
      } else {
        dx *= 3;
      }
      grid[(3 + dy) * w + (3 + dx)] = HOLE;
      break;
    }
    case 1: {
      // Remove a random piece two from the centre
      const dx2 = 2 * (Math.floor(Math.random() * 2) * 2 - 1);
      let ddx = dx2;
      let ddy = 0;
      if (Math.random() >= 0.5) {
        ddy = ddx;
        ddx = 0;
      }
      grid[(3 + ddy) * w + (3 + ddx)] = HOLE;
      break;
    }
    default: {
      // Remove a random piece one from the centre
      const dx1 = Math.floor(Math.random() * 2) * 2 - 1;
      let ddx = dx1;
      let ddy = 0;
      if (Math.random() >= 0.5) {
        ddy = ddx;
        ddx = 0;
      }
      grid[(3 + ddy) * w + (3 + ddx)] = HOLE;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Peg Solitaire puzzle.
 *
 * Board types:
 * - `'cross'` -- English solitaire (7x7 only, centre hole)
 * - `'octagon'` -- European solitaire (7x7 only, random valid hole)
 * - `'random'` -- random board shape generated by backward un-jumping
 *
 * @param w - Grid width (must be > 3; cross/octagon require 7)
 * @param h - Grid height (must be > 3; cross/octagon require 7)
 * @param type - Board type (defaults to 'cross')
 */
export function generatePegs(
  w: number,
  h: number,
  type: 'cross' | 'octagon' | 'random' = 'cross',
): PegsPuzzle {
  if (w <= 3 || h <= 3) {
    throw new Error('Width and height must both be greater than three');
  }

  if ((type === 'cross' || type === 'octagon') && (w !== 7 || h !== 7)) {
    throw new Error('Cross and octagon board types are only supported at 7x7');
  }

  const grid = new Uint8Array(w * h);

  switch (type) {
    case 'cross':
      generateCrossBoard(grid, w, h);
      break;
    case 'octagon':
      generateOctagonBoard(grid, w, h);
      break;
    case 'random':
      pegsGenerate(grid, w, h);
      break;
  }

  return { grid, w, h };
}
