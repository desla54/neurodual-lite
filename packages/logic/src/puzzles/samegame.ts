/**
 * Same Game puzzle generator — faithful port of Simon Tatham's samegame.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * The guaranteed-soluble generator works BACKWARDS: it starts with an
 * almost-empty grid (2 or 3 squares of one colour) and repeatedly inserts
 * domino-shaped regions of a valid colour, checking that:
 *   - no inserted square is adjacent to an existing square of the same colour
 *   - removing the inserted region (and applying gravity + column collapse)
 *     would exactly reproduce the previous grid state
 *   - no odd-sized unreachable sub-areas are created
 *
 * This guarantees the final grid can be fully cleared by reversing the
 * insertion steps.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SameGamePuzzle {
  /** Flat row-major grid. Values are colour indices 0..colors-1. */
  grid: Uint8Array;
  w: number;
  h: number;
  colors: number;
  /** Maximum possible score (using (n-2)^2 scoring). */
  score: number;
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const SAMEGAME_PRESETS = {
  easy: { w: 5, h: 5, colors: 3, soluble: true },
  medium: { w: 10, h: 5, colors: 3, soluble: true },
  hard: { w: 15, h: 10, colors: 4, soluble: true },
} as const;

// ---------------------------------------------------------------------------
// Scoring (matches Tatham's default scoresub=2: (n-2)^2)
// ---------------------------------------------------------------------------

function npoints(nsel: number, scoresub: number): number {
  const d = nsel - scoresub;
  return d > 0 ? d * d : 0;
}

// ---------------------------------------------------------------------------
// Guaranteed-soluble grid generator (port of gen_grid)
// ---------------------------------------------------------------------------

/**
 * Internal grid uses 1-based colours (1..nc). 0 means empty.
 * `tc` (= nc+1) is a temporary "just-placed" marker colour.
 */
function genGrid(w: number, h: number, nc: number, grid: Int32Array): void {
  const wh = w * h;
  const tc = nc + 1;

  // list is used for insertion-point enumeration and BFS
  const list = new Int32Array(wh + w);
  const grid2 = new Int32Array(wh);

  // Outer retry loop: if we get stuck with empty squares, restart
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Start with 2 or 3 squares (depending on parity) of a random colour
    grid.fill(0);
    const startCount = 2 + (wh % 2);
    const c0 = 1 + Math.floor(Math.random() * nc);

    if (startCount <= w) {
      // Place horizontally along the bottom row
      for (let i = 0; i < startCount; i++) {
        grid[(h - 1) * w + i] = c0;
      }
    } else {
      // Place vertically along the left column
      for (let i = 0; i < startCount; i++) {
        grid[(h - 1 - i) * w] = c0;
      }
    }

    // Repeatedly insert a two-square blob (domino)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let n = 0;

      // Build list of insertion points.
      // y*w+x for within-column insertions; h*w+x for new-column insertions.

      if (grid[wh - 1] === 0) {
        // The rightmost column slot is empty => we can insert new columns
        for (let i = 0; i < w; i++) {
          list[n++] = wh + i; // encoded as h*w + x
          if (grid[(h - 1) * w + i] === 0) break;
        }
      }

      // Look for insertion points within existing columns
      for (let i = 0; i < w; i++) {
        if (grid[(h - 1) * w + i] === 0) break; // no more columns
        if (grid[i] !== 0) continue; // column is full

        for (let j = h; j-- > 0; ) {
          list[n++] = j * w + i;
          if (grid[j * w + i] === 0) break; // column exhausted
        }
      }

      if (n === 0) break; // grid is full, we're done

      // Try insertion points in random order
      let placed = false;
      while (n-- > 0) {
        const pick = Math.floor(Math.random() * (n + 1));
        const pos = list[pick]!;
        list[pick] = list[n]!;

        const x = pos % w;
        let y = (pos / w) | 0;

        // Copy grid to grid2 for tentative modification
        grid2.set(grid);

        if (y === h) {
          // Insert a new column at position x: shift columns right
          for (let i = w - 1; i > x; i--) {
            for (let j = 0; j < h; j++) {
              grid2[j * w + i] = grid2[j * w + (i - 1)]!;
            }
          }
          // Clear the new column
          for (let j = 0; j < h; j++) {
            grid2[j * w + x] = 0;
          }
          y--; // so first square goes into the grid, not below it
        }

        // Insert a square within column x at position y:
        // shift everything above y up by one
        for (let i = 0; i + 1 <= y; i++) {
          grid2[i * w + x] = grid2[(i + 1) * w + x]!;
        }

        // Pick colour: must not match any neighbour
        const wrongcol: number[] = [];
        if (x > 0) wrongcol.push(grid2[y * w + (x - 1)]!);
        if (x + 1 < w) wrongcol.push(grid2[y * w + (x + 1)]!);
        if (y > 0) wrongcol.push(grid2[(y - 1) * w + x]!);
        if (y + 1 < h) wrongcol.push(grid2[(y + 1) * w + x]!);

        // Deduplicate and sort, keeping only valid colours (>0)
        const unique = [...new Set(wrongcol)].filter((v) => v > 0 && v <= nc).sort((a, b) => a - b);
        const nwrong = unique.length;

        if (nwrong === nc) continue; // no valid colour

        // Pick a colour skipping over the wrong ones
        let c = 1 + Math.floor(Math.random() * (nc - nwrong));
        for (let i = 0; i < nwrong; i++) {
          if (c >= unique[i]!) c++;
          else break;
        }

        // Tentatively place as tc (temporary colour)
        grid2[y * w + x] = tc;

        // Try extending in one of three directions: left (-1), right (+1), up (0)
        const dirs: number[] = [];

        // Left
        if (
          x > 0 &&
          grid2[y * w + (x - 1)] !== c &&
          grid2[x - 1] === 0 &&
          (y + 1 >= h || grid2[(y + 1) * w + (x - 1)] !== c) &&
          (y + 1 >= h || grid2[(y + 1) * w + (x - 1)] !== 0) &&
          (x <= 1 || grid2[y * w + (x - 2)] !== c)
        ) {
          dirs.push(-1);
        }

        // Right
        if (
          x + 1 < w &&
          grid2[y * w + (x + 1)] !== c &&
          grid2[x + 1] === 0 &&
          (y + 1 >= h || grid2[(y + 1) * w + (x + 1)] !== c) &&
          (y + 1 >= h || grid2[(y + 1) * w + (x + 1)] !== 0) &&
          (x + 2 >= w || grid2[y * w + (x + 2)] !== c)
        ) {
          dirs.push(1);
        }

        // Up (added twice for probability balance with horizontal)
        if (
          y > 0 &&
          grid2[x] === 0 &&
          (x <= 0 || grid2[(y - 1) * w + (x - 1)] !== c) &&
          (x + 1 >= w || grid2[(y - 1) * w + (x + 1)] !== c)
        ) {
          dirs.push(0);
          dirs.push(0);
        }

        if (dirs.length === 0) continue;

        const dir = dirs[Math.floor(Math.random() * dirs.length)]!;

        if (dir === 0) {
          // Up: insert within the same column at y-1
          // Shift everything above (y-1) up by one
          for (let i = 0; i + 1 <= y - 1; i++) {
            grid2[i * w + x] = grid2[(i + 1) * w + x]!;
          }
          grid2[(y - 1) * w + x] = tc;
        } else {
          // Left or right: insert in column (x+dir) at position y
          for (let i = 0; i + 1 <= y; i++) {
            grid2[i * w + x + dir] = grid2[(i + 1) * w + x + dir]!;
          }
          grid2[y * w + x + dir] = tc;
        }

        // Check for odd-sized sub-areas (would make completion impossible)
        {
          let nerrs = 0;
          let nfix = 0;
          let k = 0;
          for (let i = 0; i < w; i++) {
            if (grid2[(h - 1) * w + i] === 0) {
              if (h % 2) nfix++;
              continue;
            }
            let j = 0;
            while (j < h && grid2[j * w + i] === 0) j++;
            if (j === 0) {
              // End of previous sub-area
              if (k % 2) nerrs++;
              k = 0;
            } else {
              k += j;
            }
          }
          if (k % 2) nerrs++;
          if (nerrs > nfix) continue;
        }

        // Verify the move: removing tc squares from grid2 must yield grid
        {
          let ok = true;
          let fillstart = -1;
          let ntc = 0;

          for (let x2 = 0, x1 = 0; x2 < w; x2++) {
            let usedcol = false;

            for (let y1 = h - 1, y2 = h - 1; y2 >= 0; y2--) {
              if (grid2[y2 * w + x2] === tc) {
                ntc++;
                if (fillstart === -1) fillstart = y2 * w + x2;
                // Check no tc square is adjacent to colour c
                if (
                  (y2 + 1 < h && grid2[(y2 + 1) * w + x2] === c) ||
                  (y2 - 1 >= 0 && grid2[(y2 - 1) * w + x2] === c) ||
                  (x2 + 1 < w && grid2[y2 * w + x2 + 1] === c) ||
                  (x2 - 1 >= 0 && grid2[y2 * w + x2 - 1] === c)
                ) {
                  ok = false;
                }
                continue;
              }
              if (grid2[y2 * w + x2] === 0) break;
              usedcol = true;
              if (grid2[y2 * w + x2] !== grid[y1 * w + x1]) {
                ok = false;
              }
              y1--;
            }

            if (!ok) break;
            if (usedcol) x1++;
          }

          if (!ok) continue;

          // BFS to fill tc squares with colour c and verify connectivity
          {
            let qi = 0;
            let qj = 0;
            list[qi++] = fillstart;
            while (qj < qi) {
              const k = list[qj]!;
              const kx = k % w;
              const ky = (k / w) | 0;
              qj++;

              grid2[k] = c;

              if (kx > 0 && grid2[k - 1] === tc) list[qi++] = k - 1;
              if (kx + 1 < w && grid2[k + 1] === tc) list[qi++] = k + 1;
              if (ky > 0 && grid2[k - w] === tc) list[qi++] = k - w;
              if (ky + 1 < h && grid2[k + w] === tc) list[qi++] = k + w;
            }

            // All tc squares must be connected
            if (qj !== ntc) continue;
          }
        }

        // Move is valid — commit it
        grid.set(grid2);
        placed = true;
        break;
      }

      if (!placed) break; // exhausted all insertion points
    }

    // Check if grid is fully filled
    let ok = true;
    for (let i = 0; i < wh; i++) {
      if (grid[i] === 0) {
        ok = false;
        break;
      }
    }
    if (ok) break; // success
    // Otherwise retry
  }
}

// ---------------------------------------------------------------------------
// Random (non-guaranteed-soluble) grid generator (port of gen_grid_random)
// ---------------------------------------------------------------------------

function genGridRandom(w: number, h: number, nc: number, grid: Int32Array): void {
  const n = w * h;
  grid.fill(0);

  // Ensure at least 2 of every colour
  for (let c = 1; c <= nc; c++) {
    for (let j = 0; j < 2; j++) {
      let i: number;
      do {
        i = Math.floor(Math.random() * n);
      } while (grid[i] !== 0);
      grid[i] = c;
    }
  }

  // Fill the rest randomly
  for (let i = 0; i < n; i++) {
    if (grid[i] === 0) {
      grid[i] = Math.floor(Math.random() * nc) + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Score calculation: simulate optimal play (greedy) to compute max score
// ---------------------------------------------------------------------------

/**
 * Simulate the game greedily to estimate the max achievable score.
 * For soluble grids, the generator's implicit solution uses the minimum
 * score (all moves are 2-square removes), so the "max" returned here
 * is based on that known solution: each step removes exactly 2 squares
 * at (2-2)^2 = 0 points — meaning the perfect score for the generator's
 * intended solution is 0. We instead compute the score by simulating
 * greedy play (always pick the largest connected region).
 */
function computeMaxScore(w: number, h: number, tiles: Int32Array, scoresub: number): number {
  const wh = w * h;
  const grid = new Int32Array(wh);
  grid.set(tiles);

  const visited = new Uint8Array(wh);
  const queue = new Int32Array(wh);
  let totalScore = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Find all connected regions
    visited.fill(0);
    let bestStart = -1;
    let bestSize = 0;

    for (let i = 0; i < wh; i++) {
      if (grid[i] === 0 || visited[i]) continue;

      const col = grid[i]!;
      let qi = 0;
      let qj = 0;
      queue[qi++] = i;
      visited[i] = 1;

      while (qj < qi) {
        const k = queue[qj++]!;
        const kx = k % w;
        const ky = (k / w) | 0;

        if (kx > 0 && !visited[k - 1] && grid[k - 1] === col) {
          visited[k - 1] = 1;
          queue[qi++] = k - 1;
        }
        if (kx + 1 < w && !visited[k + 1] && grid[k + 1] === col) {
          visited[k + 1] = 1;
          queue[qi++] = k + 1;
        }
        if (ky > 0 && !visited[k - w] && grid[k - w] === col) {
          visited[k - w] = 1;
          queue[qi++] = k - w;
        }
        if (ky + 1 < h && !visited[k + w] && grid[k + w] === col) {
          visited[k + w] = 1;
          queue[qi++] = k + w;
        }
      }

      const regionSize = qi;
      if (regionSize >= 2 && regionSize > bestSize) {
        bestSize = regionSize;
        bestStart = i;
      }
    }

    if (bestStart < 0) break; // no more removable regions

    // Remove the best region
    visited.fill(0);
    let qi = 0;
    let qj = 0;
    const col = grid[bestStart]!;
    queue[qi++] = bestStart;
    visited[bestStart] = 1;

    while (qj < qi) {
      const k = queue[qj++]!;
      const kx = k % w;
      const ky = (k / w) | 0;
      grid[k] = 0;

      if (kx > 0 && !visited[k - 1] && grid[k - 1] === col) {
        visited[k - 1] = 1;
        queue[qi++] = k - 1;
      }
      if (kx + 1 < w && !visited[k + 1] && grid[k + 1] === col) {
        visited[k + 1] = 1;
        queue[qi++] = k + 1;
      }
      if (ky > 0 && !visited[k - w] && grid[k - w] === col) {
        visited[k - w] = 1;
        queue[qi++] = k - w;
      }
      if (ky + 1 < h && !visited[k + w] && grid[k + w] === col) {
        visited[k + w] = 1;
        queue[qi++] = k + w;
      }
    }

    totalScore += npoints(qi, scoresub);

    // Apply gravity: tiles fall down within each column
    for (let x = 0; x < w; x++) {
      let writeY = h - 1;
      for (let y = h - 1; y >= 0; y--) {
        if (grid[y * w + x] !== 0) {
          grid[writeY * w + x] = grid[y * w + x]!;
          if (writeY !== y) grid[y * w + x] = 0;
          writeY--;
        }
      }
      // Clear remaining top cells
      for (let y = writeY; y >= 0; y--) {
        grid[y * w + x] = 0;
      }
    }

    // Collapse empty columns to the left
    let writeX = 0;
    for (let x = 0; x < w; x++) {
      if (grid[(h - 1) * w + x] !== 0) {
        if (writeX !== x) {
          for (let y = 0; y < h; y++) {
            grid[y * w + writeX] = grid[y * w + x]!;
            grid[y * w + x] = 0;
          }
        }
        writeX++;
      }
    }
  }

  return totalScore;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Same Game puzzle.
 *
 * @param w       - Grid width (>= 1)
 * @param h       - Grid height (>= 1)
 * @param colors  - Number of distinct colours (>= 3 for soluble, >= 2 otherwise)
 * @param soluble - If true, use the guaranteed-soluble backwards generator
 */
export function generateSameGame(
  w: number,
  h: number,
  colors: number,
  soluble: boolean,
): SameGamePuzzle {
  if (w < 1 || h < 1) {
    throw new Error('Width and height must both be positive');
  }
  if (soluble && colors < 3) {
    throw new Error('Soluble mode requires at least 3 colours');
  }
  if (!soluble && colors < 2) {
    throw new Error('At least 2 colours are required');
  }
  if (w * h <= 1) {
    throw new Error('Grid area must be greater than 1');
  }

  const wh = w * h;
  const tiles = new Int32Array(wh);

  if (soluble) {
    genGrid(w, h, colors, tiles);
  } else {
    genGridRandom(w, h, colors, tiles);
  }

  // Convert from 1-based (internal) to 0-based (public) colour indices
  const grid = new Uint8Array(wh);
  for (let i = 0; i < wh; i++) {
    grid[i] = tiles[i]! - 1;
  }

  const score = computeMaxScore(w, h, tiles, 2);

  return { grid, w, h, colors, score };
}
