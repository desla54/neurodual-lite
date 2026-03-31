/**
 * Twiddle puzzle generator — faithful port of Simon Tatham's twiddle.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * The puzzle is a grid of numbered tiles. The player solves it by rotating
 * n x n blocks of tiles (clockwise or counter-clockwise) until the numbers
 * are in increasing order. The generator starts from a solved grid and
 * applies many random rotations to shuffle it.
 *
 * When `orientable` is true, each tile also carries a 2-bit orientation
 * (0-3 representing up/left/down/right). The puzzle is only solved when
 * all tiles are in order AND all orientations are 0 (upright).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TwiddlePuzzle {
  /** Flat grid, row-major. Each value is `tileNumber * 4 + orientation`. */
  grid: number[];
  w: number;
  h: number;
  /** Rotation block size (typically 2) */
  n: number;
  /** Whether tile orientation matters for solving */
  orientable: boolean;
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const TWIDDLE_PRESETS = {
  easy: { w: 3, h: 3, n: 2, orientable: false },
  medium: { w: 4, h: 4, n: 2, orientable: false },
  hard: { w: 4, h: 4, n: 2, orientable: true },
} as const;

// ---------------------------------------------------------------------------
// Core rotation (port of do_rotate)
// ---------------------------------------------------------------------------

/**
 * Rotate an n x n sub-block of the grid in place.
 *
 * @param grid - Flat grid array (tile values encoded as `number * 4 + orientation`)
 * @param w - Grid width
 * @param _h - Grid height (unused but kept for API symmetry)
 * @param n - Block size
 * @param orientable - Whether orientation bits should be updated
 * @param x - Top-left x of the rotation region
 * @param y - Top-left y of the rotation region
 * @param dir - Rotation direction: 1 = CW, -1 = CCW, 2 = 180. Masked to 0-3.
 */
function doRotate(
  grid: number[],
  w: number,
  _h: number,
  n: number,
  orientable: boolean,
  x: number,
  y: number,
  dir: number,
): void {
  dir = ((dir % 4) + 4) % 4;
  if (dir === 0) return;

  const offset = y * w + x;

  /*
   * Loop over about one quarter of the rotated region and permute each
   * element with its rotational coset. For odd n, the centre element
   * never moves (handled separately for orientation).
   */
  for (let i = 0; i < (((n + 1) / 2) | 0); i++) {
    for (let j = 0; j < ((n / 2) | 0); j++) {
      const p = [
        j * w + i,
        i * w + (n - j - 1),
        (n - j - 1) * w + (n - i - 1),
        (n - i - 1) * w + j,
      ];

      const g = [
        grid[offset + p[0]!]!,
        grid[offset + p[1]!]!,
        grid[offset + p[2]!]!,
        grid[offset + p[3]!]!,
      ];

      for (let k = 0; k < 4; k++) {
        let v = g[(k + dir) & 3]!;
        if (orientable) {
          // Alter orientation: replace low 2 bits with (orientation + dir) mod 4
          v = (v & ~3) | ((v + dir) & 3);
        }
        grid[offset + p[k]!] = v;
      }
    }
  }

  // Handle centre square orientation for odd n
  if (orientable && n & 1) {
    const centreIdx = offset + ((n / 2) | 0) * (w + 1);
    let v = grid[centreIdx]!;
    v = (v & ~3) | ((v + dir) & 3);
    grid[centreIdx] = v;
  }
}

// ---------------------------------------------------------------------------
// Completion check (port of grid_complete)
// ---------------------------------------------------------------------------

function gridComplete(grid: number[], wh: number, orientable: boolean): boolean {
  for (let i = 1; i < wh; i++) {
    if (grid[i]! < grid[i - 1]!) return false;
  }
  if (orientable) {
    for (let i = 0; i < wh; i++) {
      if (grid[i]! & 3) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a random Twiddle puzzle.
 *
 * @param w - Grid width (must be >= n)
 * @param h - Grid height (must be >= n)
 * @param n - Rotation block size (must be >= 2)
 * @param orientable - Whether tile orientation matters (default false)
 */
export function generateTwiddle(
  w: number,
  h: number,
  n: number,
  orientable = false,
): TwiddlePuzzle {
  if (n < 2) throw new Error('Rotation block size must be at least 2');
  if (w < n) throw new Error('Width must be at least the rotation block size');
  if (h < n) throw new Error('Height must be at least the rotation block size');

  const wh = w * h;

  // Set up a solved grid: tile i has value (i + 1) * 4, orientation 0
  const grid: number[] = new Array(wh);
  for (let i = 0; i < wh; i++) {
    grid[i] = (i + 1) * 4;
  }

  // Number of shuffle moves — matches Tatham's formula with a random +0/+1
  // to avoid parity issues
  const totalMoves = w * h * n * n * 2 + randomInt(2);

  // Width/height of the space of valid rotation origins
  const rw = w - n + 1;
  const rh = h - n + 1;

  /*
   * Shuffle by applying random rotations, with Tatham's anti-inversion
   * heuristic: track recent rotations at each position and reject moves
   * that would undo or over-repeat a previous rotation.
   */
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const prevmoves = new Int32Array(rw * rh); // zero-initialised

    for (let i = 0; i < totalMoves; i++) {
      let x: number;
      let y: number;
      let r: number;

      // Pick a random rotation that doesn't trivially undo recent work
      // eslint-disable-next-line no-constant-condition
      while (true) {
        x = randomInt(rw);
        y = randomInt(rh);
        r = 2 * randomInt(2) - 1; // +1 or -1

        const oldTotal = prevmoves[y * rw + x]!;
        const newTotal = oldTotal + r;

        // Special case: if the entire grid IS the rotation block,
        // there is no way to avoid repeats — accept anything.
        if (w === n && h === n) break;

        // Reject if this undoes previous work (|newTotal| < |oldTotal|)
        // or over-repeats (|newTotal| > 2, i.e. 3 same-direction = 1 inverse)
        if (Math.abs(newTotal) >= Math.abs(oldTotal) && Math.abs(newTotal) <= 2) {
          break;
        }
      }

      doRotate(grid, w, h, n, orientable, x!, y!, r!);

      // Log the move
      prevmoves[y! * rw + x!]! += r!;

      // Zero overlapping positions (any whose top-left differs by < n in both axes)
      for (let dy = -(n - 1); dy <= n - 1; dy++) {
        if (y! + dy < 0 || y! + dy >= rh) continue;
        for (let dx = -(n - 1); dx <= n - 1; dx++) {
          if (x! + dx < 0 || x! + dx >= rw) continue;
          if (dx === 0 && dy === 0) continue;
          prevmoves[(y! + dy) * rw + (x! + dx)] = 0;
        }
      }
    }

    // Ensure the result is NOT already solved (extremely unlikely but possible)
    if (!gridComplete(grid, wh, orientable)) break;
  }

  return { grid, w, h, n, orientable };
}
