// @ts-nocheck
/**
 * Dominosa puzzle generator — faithful port of Simon Tatham's dominosa.c
 * and laydomino.c.
 *
 * Generates a grid of numbers where the player must partition cells into
 * dominoes such that each domino value (a,b) with a<=b appears exactly once.
 *
 * Grid dimensions: w = n+2, h = n+1 (where n = max domino face value).
 *
 * The generator:
 *  1. Lays out a random domino tiling via domino_layout_prealloc (from laydomino.c)
 *  2. Shuffles domino values onto the tiling
 *  3. Uses the solver to verify unique solvability
 *  4. Repeats if not uniquely solvable (with a 2x2 ambiguity avoidance heuristic)
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=dominosa.c
 *         https://git.tartarus.org/?p=simon/puzzles.git;a=blob;f=laydomino.c
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface DominosaPuzzle {
  /** Flat row-major number grid (h rows x w cols). */
  grid: number[];
  /** Grid width (n+2). */
  w: number;
  /** Grid height (n+1). */
  h: number;
  /** Max domino face value. */
  n: number;
}

// ---------------------------------------------------------------------------
// Macros ported as inline helpers
// ---------------------------------------------------------------------------

/** nth triangular number */
function TRI(n: number): number {
  return (n * (n + 1)) / 2;
}

/** Number of dominoes for max value n */
function DCOUNT(n: number): number {
  return TRI(n + 1);
}

/** Map a pair of numbers to a unique domino index */
function DINDEX(n1: number, n2: number): number {
  return TRI(Math.max(n1, n2)) + Math.min(n1, n2);
}

// ---------------------------------------------------------------------------
// PRNG helpers — Fisher-Yates shuffle on typed/plain arrays
// ---------------------------------------------------------------------------

function shuffleArray(arr: number[], n: number): void {
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Shuffle pairs: treat arr as n pairs of 2 elements each, shuffle the pairs.
 * Faithful port of: shuffle(list, k/2, 2*sizeof(*list), rs)
 */
function shufflePairs(arr: number[], nPairs: number): void {
  for (let i = nPairs - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap pair i with pair j
    let tmp = arr[i * 2];
    arr[i * 2] = arr[j * 2];
    arr[j * 2] = tmp;
    tmp = arr[i * 2 + 1];
    arr[i * 2 + 1] = arr[j * 2 + 1];
    arr[j * 2 + 1] = tmp;
  }
}

// ---------------------------------------------------------------------------
// Ported from laydomino.c — domino_layout_prealloc()
// ---------------------------------------------------------------------------

/**
 * Generate a random complete domino tiling of a w x h grid.
 *
 * Returns grid where grid[i] = j means squares i and j are paired.
 * If w*h is odd, one square will have grid[i] = i (singleton).
 *
 * Faithful port of domino_layout_prealloc() from laydomino.c.
 */
function dominoLayoutPrealloc(w: number, h: number): number[] {
  const wh = w * h;
  const grid = new Array<number>(wh);
  const grid2 = new Array<number>(wh);

  // Initially every square is a singleton
  for (let i = 0; i < wh; i++) grid[i] = i;

  // Build list of all possible domino placements.
  // Vertical placement with top at (x,y) is encoded as 2*(y*w+x).
  // Horizontal placement with left at (x,y) is encoded as 2*(y*w+x)+1.
  const listSize = 2 * wh - h - w;
  const list = new Array<number>(Math.max(listSize, wh));
  let k = 0;

  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w; i++) list[k++] = 2 * (j * w + i); // vertical

  for (let j = 0; j < h; j++) for (let i = 0; i < w - 1; i++) list[k++] = 2 * (j * w + i) + 1; // horizontal

  // Shuffle the list
  shuffleArray(list, k);

  // Place dominoes greedily
  for (let i = 0; i < k; i++) {
    const horiz = list[i] % 2;
    const xy = Math.floor(list[i] / 2);
    const xy2 = xy + (horiz ? 1 : w);

    if (grid[xy] === xy && grid[xy2] === xy2) {
      grid[xy] = xy2;
      grid[xy2] = xy;
    }
  }

  // Now handle remaining singletons via BFS path augmentation
  while (true) {
    // Find singletons
    let singletonCount = 0;
    let startSingleton = -1;
    for (let j = 0; j < wh; j++) {
      if (grid[j] === j) {
        singletonCount++;
        startSingleton = j;
      }
    }
    // If area is even: done when 0 singletons. If odd: done when 1.
    if (singletonCount === wh % 2) break;

    // BFS from startSingleton to find another singleton
    for (let j = 0; j < wh; j++) grid2[j] = -1;
    grid2[startSingleton] = 0;

    let done = 0;
    let todo = 1;
    list[0] = startSingleton;
    let targetSingleton = -1;

    while (done < todo) {
      const cur = list[done++];
      const x = cur % w;
      const y = Math.floor(cur / w);

      // Collect neighbours
      const d: number[] = [];
      if (x > 0) d.push(cur - 1);
      if (x + 1 < w) d.push(cur + 1);
      if (y > 0) d.push(cur - w);
      if (y + 1 < h) d.push(cur + w);

      // Shuffle neighbours to avoid directional bias
      shuffleArray(d, d.length);

      let found = false;
      for (let jj = 0; jj < d.length; jj++) {
        const neighbour = d[jj];
        if (grid[neighbour] === neighbour) {
          // Found another singleton
          grid2[neighbour] = cur;
          targetSingleton = neighbour;
          found = true;
          break;
        }

        // Move through domino
        const otherEnd = grid[neighbour];
        if (grid2[otherEnd] < 0 || grid2[otherEnd] > grid2[cur] + 1) {
          grid2[otherEnd] = grid2[cur] + 1;
          grid2[neighbour] = cur;
          list[todo++] = otherEnd;
        }
      }

      if (found) break;
    }

    // Follow trail back, re-laying dominoes
    let i = targetSingleton;
    while (true) {
      const j = grid2[i];
      const kk = grid[j];

      grid[i] = j;
      grid[j] = i;

      if (j === kk) break; // reached the other singleton
      i = kk;
    }
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Ported from dominosa.c — find_overlaps()
// ---------------------------------------------------------------------------

/**
 * Given a domino placement index, return all placement indices that overlap
 * with it (i.e. share a square). Returns the count and fills `set`.
 */
function findOverlaps(w: number, h: number, placement: number, set: number[]): number {
  let n = 0;
  let x = Math.floor(placement / 2);
  const y = Math.floor(x / w);
  x = x % w;

  if (placement & 1) {
    // Horizontal domino, indexed by its left end
    if (x > 0) set[n++] = placement - 2; // horizontal to left
    if (y > 0) set[n++] = placement - 2 * w - 1; // vertical above left
    if (y + 1 < h) set[n++] = placement - 1; // vertical below left
    if (x + 2 < w) set[n++] = placement + 2; // horizontal to right
    if (y > 0) set[n++] = placement - 2 * w + 2 - 1; // vertical above right
    if (y + 1 < h) set[n++] = placement + 2 - 1; // vertical below right
  } else {
    // Vertical domino, indexed by its top end
    if (y > 0) set[n++] = placement - 2 * w; // vertical above
    if (x > 0) set[n++] = placement - 2 + 1; // horizontal left of top
    if (x + 1 < w) set[n++] = placement + 1; // horizontal right of top
    if (y + 2 < h) set[n++] = placement + 2 * w; // vertical below
    if (x > 0) set[n++] = placement - 2 + 2 * w + 1; // horizontal left of bottom
    if (x + 1 < w) set[n++] = placement + 2 * w + 1; // horizontal right of bottom
  }

  return n;
}

// ---------------------------------------------------------------------------
// Ported from dominosa.c — solver()
// ---------------------------------------------------------------------------

/**
 * Constraint-propagation solver for Dominosa.
 *
 * Returns 0 (impossible), 1 (unique solution), or 2 (multiple solutions).
 *
 * If output is provided, fills it with:
 *   -1 = ruled out, 0 = uncertain, 1 = certain
 *
 * Faithful port of solver() from dominosa.c.
 */
function solver(w: number, h: number, n: number, grid: number[], output: number[] | null): number {
  const wh = w * h;
  const dc = DCOUNT(n);

  // placements[i]: linked list next pointer.
  // -3 = not valid, -2 = ruled out, -1 = end of list, >=0 = next index.
  const placements = new Array<number>(2 * wh);
  for (let i = 0; i < 2 * wh; i++) placements[i] = -3;

  // heads[di]: head of placement list for domino di.
  const heads = new Array<number>(dc);
  for (let i = 0; i < dc; i++) heads[i] = -1;

  // Set up initial placement lists by scanning the grid.
  // Vertical placements
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const di = DINDEX(grid[idx], grid[(y + 1) * w + x]);
      placements[idx * 2] = heads[di];
      heads[di] = idx * 2;
    }

  // Horizontal placements
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      const idx = y * w + x;
      const di = DINDEX(grid[idx], grid[y * w + (x + 1)]);
      placements[idx * 2 + 1] = heads[di];
      heads[di] = idx * 2 + 1;
    }

  // Main solver loop
  let ret: number;
  while (true) {
    let doneSomething = false;

    // Rule 1: For each domino, find placements overlapped by ALL its
    // possible positions. Those overlapped placements can be ruled out.
    for (let i = 0; i < dc; i++) {
      const permset = new Array<number>(6);
      let permlen = 0;

      if (heads[i] === -1) {
        // No placement for this domino — puzzle is impossible
        ret = 0;
        // Skip to output section
        if (output) {
          for (let ii = 0; ii < wh * 2; ii++) {
            if (placements[ii] === -2) output[ii] = -1;
            else if (placements[ii] !== -3) output[ii] = 0;
          }
        }
        return ret;
      }

      for (let j = heads[i]; j >= 0; j = placements[j]) {
        if (j === heads[i]) {
          permlen = findOverlaps(w, h, j, permset);
        } else {
          const tempset = new Array<number>(6);
          const templen = findOverlaps(w, h, j, tempset);

          // Set intersection
          let nn = 0;
          for (let m = 0; m < permlen; m++) {
            let found = false;
            for (let kk = 0; kk < templen; kk++) {
              if (tempset[kk] === permset[m]) {
                found = true;
                break;
              }
            }
            if (found) permset[nn++] = permset[m];
          }
          permlen = nn;
        }
      }

      for (let p = 0; p < permlen; p++) {
        const j = permset[p];
        if (placements[j] !== -2) {
          doneSomething = true;

          // Rule out this placement
          const p1 = Math.floor(j / 2);
          const p2 = j & 1 ? p1 + 1 : p1 + w;
          const di = DINDEX(grid[p1], grid[p2]);

          // Remove from domino di's list
          if (heads[di] === j) {
            heads[di] = placements[j];
          } else {
            let kk = heads[di];
            while (placements[kk] !== -1 && placements[kk] !== j) kk = placements[kk];
            placements[kk] = placements[j];
          }
          placements[j] = -2;
        }
      }
    }

    // Rule 2: For each square, if all viable placements involving it are
    // for the same domino, rule out other placements of that domino.
    for (let i = 0; i < wh; i++) {
      const sqList = new Array<number>(4);
      let sqLen = 0;

      const x = i % w;
      const y = Math.floor(i / w);

      if (x > 0) sqList[sqLen++] = 2 * (i - 1) + 1;
      if (x + 1 < w) sqList[sqLen++] = 2 * i + 1;
      if (y > 0) sqList[sqLen++] = 2 * (i - w);
      if (y + 1 < h) sqList[sqLen++] = 2 * i;

      // Filter to only still-viable placements
      let nn = 0;
      for (let kk = 0; kk < sqLen; kk++) {
        if (placements[sqList[kk]] >= -1) sqList[nn++] = sqList[kk];
      }

      let adi = -1;
      let allSame = true;

      for (let j = 0; j < nn; j++) {
        const kk = sqList[j];
        const p1 = Math.floor(kk / 2);
        const p2 = kk & 1 ? p1 + 1 : p1 + w;
        const di = DINDEX(grid[p1], grid[p2]);

        if (adi === -1) adi = di;
        if (adi !== di) {
          allSame = false;
          break;
        }
      }

      if (allSame && adi >= 0) {
        // Count current placements for domino adi
        let count = 0;
        for (let kk = heads[adi]; kk >= 0; kk = placements[kk]) count++;

        if (count > nn) {
          doneSomething = true;

          // Set all placements to impossible
          let kk = heads[adi];
          while (kk >= 0) {
            const tmp = placements[kk];
            placements[kk] = -2;
            kk = tmp;
          }

          // Set up new list from sqList
          heads[adi] = sqList[0];
          for (let kk = 0; kk < nn; kk++) {
            placements[sqList[kk]] = kk + 1 === nn ? -1 : sqList[kk + 1];
          }
        }
      }
    }

    if (!doneSomething) break;
  }

  // Determine result
  ret = 1;
  for (let i = 0; i < wh * 2; i++) {
    if (placements[i] === -2) {
      if (output) output[i] = -1; // ruled out
    } else if (placements[i] !== -3) {
      const p1 = Math.floor(i / 2);
      const p2 = i & 1 ? p1 + 1 : p1 + w;
      const di = DINDEX(grid[p1], grid[p2]);

      if (i === heads[di] && placements[i] === -1) {
        if (output) output[i] = 1; // certain
      } else {
        if (output) output[i] = 0; // uncertain
        ret = 2;
      }
    }
  }

  return ret;
}

// ---------------------------------------------------------------------------
// Ported from dominosa.c — new_game_desc()
// ---------------------------------------------------------------------------

/**
 * Generate a uniquely-solvable Dominosa puzzle.
 *
 * Faithful port of new_game_desc() from dominosa.c:
 *   1. Generate a random domino layout via domino_layout_prealloc
 *   2. Shuffle domino values onto the layout (with 2x2 ambiguity avoidance)
 *   3. Run solver to check for unique solution
 *   4. Repeat if not unique
 *
 * @param n — max face value on dominoes (e.g. 6 means 0..6)
 */
export function generateDominosaPuzzle(n: number): DominosaPuzzle {
  if (n < 1) throw new RangeError('n must be at least 1');

  const w = n + 2;
  const h = n + 1;
  const wh = w * h;

  let grid2: number[];

  do {
    // Step 1: Generate random domino tiling
    const grid = dominoLayoutPrealloc(w, h);

    // Step 2: Shuffle domino values and fill the grid
    grid2 = new Array<number>(wh);

    const list = new Array<number>(2 * DCOUNT(n));
    let k = 0;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= i; j++) {
        list[k++] = i;
        list[k++] = j;
      }

    // Shuffle the domino value pairs
    shufflePairs(list, k / 2);

    // Assign values to the tiling
    let j = 0;
    for (let i = 0; i < wh; i++) {
      if (grid[i] > i) {
        // This is the "first" end of a domino (grid[i] > i).
        // Optionally flip the domino to avoid 2x2 ambiguous sections.
        let flip = -1;

        const t1 = i;
        const t2 = grid[i];

        if (t2 === t1 + w) {
          // Vertical domino
          if (
            t1 % w > 0 && // not on left edge
            grid[t1 - 1] === t2 - 1 && // adjacent domino to the left
            (grid2[t1 - 1] === list[j] ||
              grid2[t1 - 1] === list[j + 1] ||
              grid2[t2 - 1] === list[j] ||
              grid2[t2 - 1] === list[j + 1])
          ) {
            if (grid2[t1 - 1] === list[j] || grid2[t2 - 1] === list[j + 1]) {
              flip = 0;
            } else {
              flip = 1;
            }
          }
        } else {
          // Horizontal domino
          if (
            Math.floor(t1 / w) > 0 && // not on top edge
            grid[t1 - w] === t2 - w && // adjacent domino above
            (grid2[t1 - w] === list[j] ||
              grid2[t1 - w] === list[j + 1] ||
              grid2[t2 - w] === list[j] ||
              grid2[t2 - w] === list[j + 1])
          ) {
            if (grid2[t1 - w] === list[j] || grid2[t2 - w] === list[j + 1]) {
              flip = 0;
            } else {
              flip = 1;
            }
          }
        }

        if (flip < 0) flip = Math.random() < 0.5 ? 0 : 1;

        grid2[i] = list[j + flip];
        grid2[grid[i]] = list[j + 1 - flip];
        j += 2;
      }
    }
  } while (solver(w, h, n, grid2, null) > 1);

  // Return as a 2D-friendly flat grid
  return { grid: grid2, w, h, n };
}
