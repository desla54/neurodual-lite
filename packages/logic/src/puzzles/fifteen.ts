/**
 * Fifteen puzzle generator — faithful port of Simon Tatham's fifteen.c
 *
 * Uses the parity-check approach: generates a random permutation, then
 * swaps the last two tiles if the parity is wrong. This guarantees
 * solvability in O(n) time without random walks.
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=fifteen.c
 */

export interface FifteenPuzzle {
  /** Flat row-major array of tile values. 0 = empty gap. */
  tiles: number[];
  /** Grid side length (e.g. 4 for the classic 4x4). */
  size: number;
}

// ---------------------------------------------------------------------------
// Ported from fifteen.c — perm_parity()
// ---------------------------------------------------------------------------

/**
 * Compute the parity of a permutation (0 = even, 1 = odd).
 * Counts the number of inversions mod 2.
 *
 * Faithful port of:
 * ```c
 * static int perm_parity(int *perm, int n)
 * ```
 */
function permParity(perm: number[], n: number): number {
  let ret = 0;

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((perm[i] as number) > (perm[j] as number)) ret = ret ? 0 : 1;
    }
  }

  return ret;
}

// ---------------------------------------------------------------------------
// Ported from fifteen.c — new_game_desc()
// ---------------------------------------------------------------------------

/**
 * Generate a solvable fifteen-puzzle of the given side length.
 *
 * Faithful port of `new_game_desc()` from Tatham's fifteen.c.
 * The algorithm:
 *   1. Pick a random gap position.
 *   2. Fill remaining positions with a random permutation of 1..n-1,
 *      leaving the last two tiles unplaced.
 *   3. Compute the required parity from the gap's chessboard distance
 *      to the bottom-right corner and from n.
 *   4. Place the last two tiles in whichever order satisfies that parity.
 *
 * @param size — side length of the grid (e.g. 3, 4, 5). Must be >= 2.
 */
export function generateFifteenPuzzle(size: number): FifteenPuzzle {
  if (size < 2) throw new RangeError('Size must be at least 2');

  const w = size;
  const h = size;
  const n = w * h;

  const tiles: number[] = new Array<number>(n).fill(-1);
  const used: boolean[] = new Array<boolean>(n).fill(false);

  // --- Pick a random position for the gap (tile 0) ---
  const gap = Math.floor(Math.random() * n);
  tiles[gap] = 0;
  used[0] = true;

  // --- Place everything except the last two tiles ---
  let x = 0;
  for (let i = n - 1; i > 2; i--) {
    let k = Math.floor(Math.random() * i);

    let j = 0;
    for (; j < n; j++) {
      if (!used[j] && k-- === 0) break;
    }

    used[j] = true;

    while ((tiles[x] as number) >= 0) x++;
    tiles[x] = j;
  }

  // --- Find the last two empty locations ---
  while ((tiles[x] as number) >= 0) x++;
  const x1 = x;
  x++;
  while ((tiles[x] as number) >= 0) x++;
  const x2 = x;

  // --- Find the last two unused pieces ---
  let p1 = 0;
  for (let i = 0; i < n; i++) {
    if (!used[i]) {
      p1 = i;
      break;
    }
  }
  let p2 = 0;
  for (let i = p1 + 1; i < n; i++) {
    if (!used[i]) {
      p2 = i;
      break;
    }
  }

  // --- Determine the required parity ---
  // Tatham's comment:
  //   parity = XOR of:
  //     - chessboard parity of gap relative to bottom-right corner
  //     - parity of n (target is 1,...,n-1,0 which is a cyclic
  //       permutation, odd iff n is even)
  const gapX = gap % w;
  const gapY = Math.floor(gap / w);
  const parity = ((gapX - (w - 1)) ^ (gapY - (h - 1)) ^ (n + 1)) & 1;

  // --- Place the last two tiles, swapping if parity is wrong ---
  tiles[x1] = p1;
  tiles[x2] = p2;
  if (permParity(tiles, n) !== parity) {
    tiles[x1] = p2;
    tiles[x2] = p1;
  }

  return { tiles, size };
}
