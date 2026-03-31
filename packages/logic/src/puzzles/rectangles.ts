// @ts-nocheck
/**
 * Rectangles (Shikaku) puzzle algorithms — faithful port of Simon Tatham's rect.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * Copyright (C) 2004-2024 Simon Tatham.  License: MIT
 *
 * Key structures ported:
 *   - enum_rects(): enumerate possible rectangle placements around a square
 *   - place_rect() / find_rect(): grid manipulation
 *   - new_game_desc(): full generation pipeline (random partition, singleton removal,
 *     grid expansion, solver-guided number placement)
 *   - rect_solver(): constraint-based solver for ensuring unique solutions
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RectanglesPuzzle {
  /** Flat row-major numbers grid: 0 = empty, >0 = area clue */
  numbers: number[];
  /** Flat row-major solution grid: each cell stores INDEX(top-left x,y) of its rectangle */
  solution: number[];
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// PRNG — simple xorshift128+ (replaces random_state)
// ---------------------------------------------------------------------------

class Random {
  private s0: number;
  private s1: number;

  constructor(seed?: number) {
    this.s0 = (seed ?? Math.random() * 0x7fffffff) | 0;
    this.s1 = (this.s0 * 1103515245 + 12345) | 0;
    if (this.s0 === 0) this.s0 = 1;
    if (this.s1 === 0) this.s1 = 1;
  }

  /** Returns integer in [0, n) */
  next(n: number): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >> 17;
    s1 ^= s0;
    s1 ^= s0 >> 26;
    this.s1 = s1;
    const v = ((this.s0 + this.s1) >>> 0) % n;
    return v;
  }
}

// ---------------------------------------------------------------------------
// Helper types (from rect.c structs)
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface RectList {
  rects: Rect[];
  n: number;
}

interface NumberData {
  area: number;
  npoints: number;
  points: Point[];
}

// ---------------------------------------------------------------------------
// Macros → helpers
// ---------------------------------------------------------------------------

function INDEX(w: number, x: number, y: number): number {
  return y * w + x;
}

// ---------------------------------------------------------------------------
// rect_solver — constraint-based solver (from rect.c)
// ---------------------------------------------------------------------------

function remove_rect_placement(
  w: number,
  h: number,
  rectpositions: RectList[],
  overlaps: Int32Array,
  rectnum: number,
  placement: number,
): void {
  const rp = rectpositions[rectnum];
  const r = rp.rects[placement];

  for (let yy = 0; yy < r.h; yy++) {
    const y = yy + r.y;
    for (let xx = 0; xx < r.w; xx++) {
      const x = xx + r.x;
      const idx = (rectnum * h + y) * w + x;
      if (overlaps[idx] > 0) overlaps[idx]--;
    }
  }

  // Swap-remove
  if (placement < rp.n - 1) {
    const t = rp.rects[rp.n - 1];
    rp.rects[rp.n - 1] = rp.rects[placement];
    rp.rects[placement] = t;
  }
  rp.n--;
}

function remove_number_placement(
  w: number,
  _h: number,
  number: NumberData,
  index: number,
  rectbyplace: Int32Array,
): void {
  rectbyplace[number.points[index].y * w + number.points[index].x] = -1;

  if (index < number.npoints - 1) {
    const t = number.points[number.npoints - 1];
    number.points[number.npoints - 1] = number.points[index];
    number.points[index] = t;
  }
  number.npoints--;
}

/**
 * Returns 0 for inconsistency, 1 for success, 2 for remaining uncertainty.
 */
function rect_solver(
  w: number,
  h: number,
  nrects: number,
  numbers: NumberData[],
  hedge: Uint8Array | null,
  vedge: Uint8Array | null,
  rs: Random | null,
): number {
  // Build candidate position lists for each rectangle
  const rectpositions: RectList[] = [];
  for (let i = 0; i < nrects; i++) {
    const area = numbers[i].area;

    // Bounding rectangle of candidate number placements
    let maxx = -1,
      maxy = -1,
      minx = w,
      miny = h;
    for (let j = 0; j < numbers[i].npoints; j++) {
      if (minx > numbers[i].points[j].x) minx = numbers[i].points[j].x;
      if (miny > numbers[i].points[j].y) miny = numbers[i].points[j].y;
      if (maxx < numbers[i].points[j].x) maxx = numbers[i].points[j].x;
      if (maxy < numbers[i].points[j].y) maxy = numbers[i].points[j].y;
    }

    const rlist: Rect[] = [];

    for (let rw = 1; rw <= area && rw <= w; rw++) {
      if (area % rw) continue;
      const rh = area / rw;
      if (rh > h) continue;

      for (let y = miny - rh + 1; y <= maxy; y++) {
        if (y < 0 || y + rh > h) continue;
        for (let x = minx - rw + 1; x <= maxx; x++) {
          if (x < 0 || x + rw > w) continue;

          // Check if any candidate number placement is inside this rectangle
          let found = false;
          for (let j = 0; j < numbers[i].npoints; j++) {
            if (
              numbers[i].points[j].x >= x &&
              numbers[i].points[j].x < x + rw &&
              numbers[i].points[j].y >= y &&
              numbers[i].points[j].y < y + rh
            ) {
              found = true;
              break;
            }
          }
          if (found) {
            rlist.push({ x, y, w: rw, h: rh });
          }
        }
      }
    }

    rectpositions.push({ rects: rlist, n: rlist.length });
  }

  // Build overlaps array: overlaps[(rectindex * h + y) * w + x]
  const overlaps = new Int32Array(nrects * w * h);
  for (let i = 0; i < nrects; i++) {
    for (let j = 0; j < rectpositions[i].n; j++) {
      const r = rectpositions[i].rects[j];
      for (let yy = 0; yy < r.h; yy++)
        for (let xx = 0; xx < r.w; xx++) overlaps[(i * h + yy + r.y) * w + xx + r.x]++;
    }
  }

  // rectbyplace: which rectangle has a candidate number at each square
  const rectbyplace = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < nrects; i++) {
    for (let j = 0; j < numbers[i].npoints; j++) {
      const x = numbers[i].points[j].x;
      const y = numbers[i].points[j].y;
      rectbyplace[y * w + x] = i;
    }
  }

  const workspace = new Int32Array(nrects);

  // Main deduction loop
  while (true) {
    let done_something = false;

    // Housekeeping: mark squares as known for rectangles with single number position
    for (let i = 0; i < nrects; i++) {
      if (numbers[i].npoints === 1) {
        const x = numbers[i].points[0].x;
        const y = numbers[i].points[0].y;
        if (overlaps[(i * h + y) * w + x] >= -1) {
          if (overlaps[(i * h + y) * w + x] <= 0) {
            return 0; // inconsistency
          }
          for (let j = 0; j < nrects; j++) overlaps[(j * h + y) * w + x] = -1;
          overlaps[(i * h + y) * w + x] = -2;
        }
      }
    }

    // Mark intersection of all placements as known
    for (let i = 0; i < nrects; i++) {
      let ominx = 0,
        ominy = 0,
        omaxx = w,
        omaxy = h;

      for (let j = 0; j < rectpositions[i].n; j++) {
        const r = rectpositions[i].rects[j];
        if (ominx < r.x) ominx = r.x;
        if (ominy < r.y) ominy = r.y;
        if (omaxx > r.x + r.w) omaxx = r.x + r.w;
        if (omaxy > r.y + r.h) omaxy = r.y + r.h;
      }

      for (let yy = ominy; yy < omaxy; yy++)
        for (let xx = ominx; xx < omaxx; xx++)
          if (overlaps[(i * h + yy) * w + xx] >= -1) {
            if (overlaps[(i * h + yy) * w + xx] <= 0) return 0;
            for (let j = 0; j < nrects; j++) overlaps[(j * h + yy) * w + xx] = -1;
            overlaps[(i * h + yy) * w + xx] = -2;
          }
    }

    // Rectangle-focused deduction
    for (let i = 0; i < nrects; i++) {
      for (let j = 0; j < rectpositions[i].n; j++) {
        let del = false;

        workspace.fill(0);

        const r = rectpositions[i].rects[j];
        for (let yy = 0; yy < r.h; yy++) {
          const y = yy + r.y;
          for (let xx = 0; xx < r.w; xx++) {
            const x = xx + r.x;

            if (overlaps[(i * h + y) * w + x] === -1) {
              del = true;
            }

            if (rectbyplace[y * w + x] !== -1) {
              workspace[rectbyplace[y * w + x]]++;
            }
          }
        }

        if (!del) {
          for (let k = 0; k < nrects; k++)
            if (k !== i && workspace[k] === numbers[k].npoints) {
              del = true;
              break;
            }

          if (!del && workspace[i] === 0) {
            del = true;
          }
        }

        if (del) {
          remove_rect_placement(w, h, rectpositions, overlaps, i, j);
          j--;
          done_something = true;
        }
      }
    }

    // Square-focused deduction
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (overlaps[y * w + x] < 0) continue; // known

        let n = 0;
        let idx = -1;
        for (let i = 0; i < nrects; i++)
          if (overlaps[(i * h + y) * w + x] > 0) {
            n++;
            idx = i;
          }

        if (n === 1) {
          for (let j = 0; j < rectpositions[idx].n; j++) {
            const r = rectpositions[idx].rects[j];
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
            remove_rect_placement(w, h, rectpositions, overlaps, idx, j);
            j--;
            done_something = true;
          }
        }
      }
    }

    if (done_something) continue;

    // Number placement winnowing (only with randomness)
    if (rs) {
      interface Rpn {
        rect: number;
        placement: number;
        number: number;
      }
      const rpns: Rpn[] = [];

      for (let i = 0; i < nrects; i++) {
        for (let j = 0; j < rectpositions[i].n; j++) {
          const r = rectpositions[i].rects[j];
          for (let yy = 0; yy < r.h; yy++) {
            const y = yy + r.y;
            for (let xx = 0; xx < r.w; xx++) {
              const x = xx + r.x;
              if (rectbyplace[y * w + x] >= 0 && rectbyplace[y * w + x] !== i) {
                rpns.push({ rect: i, placement: j, number: rectbyplace[y * w + x] });
              }
            }
          }
        }
      }

      if (rpns.length > 0) {
        const chosen = rpns[rs.next(rpns.length)];
        const i = chosen.rect;
        const k = chosen.number;
        const r = rectpositions[i].rects[chosen.placement];

        for (let m = 0; m < numbers[k].npoints; m++) {
          const x = numbers[k].points[m].x;
          const y = numbers[k].points[m].y;

          if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) {
            remove_number_placement(w, h, numbers[k], m, rectbyplace);
            m--;
            done_something = true;
          }
        }
      }
    }

    if (!done_something) break;
  }

  // Check results and place edges
  let ret = 1;
  for (let i = 0; i < nrects; i++) {
    if (rectpositions[i].n <= 0) {
      ret = 0;
    } else if (rectpositions[i].n > 1) {
      ret = 2;
    } else if (hedge && vedge) {
      const r = rectpositions[i].rects[0];
      for (let y = 0; y < r.h; y++) {
        if (r.x > 0) vedge[(r.y + y) * w + r.x] = 1;
        if (r.x + r.w < w) vedge[(r.y + y) * w + r.x + r.w] = 1;
      }
      for (let x = 0; x < r.w; x++) {
        if (r.y > 0) hedge[r.y * w + r.x + x] = 1;
        if (r.y + r.h < h) hedge[(r.y + r.h) * w + r.x + x] = 1;
      }
    }
  }

  return ret;
}

// ---------------------------------------------------------------------------
// Grid generation helpers (from rect.c)
// ---------------------------------------------------------------------------

/**
 * Enumerate rectangles covering (sx, sy) in grid.
 * If outRect is null, counts into outN.
 * If outRect is non-null, reads outN as index and writes that rectangle.
 */
function enum_rects(
  w: number,
  h: number,
  grid: Int32Array,
  outRect: Rect | null,
  outN: { value: number },
  sx: number,
  sy: number,
  scratch: Int32Array,
): void {
  let index = 0;

  // Maximum rectangle area is 1/6 of total grid size, min 2
  let maxarea = Math.floor((w * h) / 6);
  if (maxarea < 2) maxarea = 2;

  // Scan grid to find limits
  const top = 0; // offset into scratch
  const bottom = w; // offset into scratch

  for (let dy = -1; dy <= 1; dy += 2) {
    const arrayOff = dy === -1 ? top : bottom;
    for (let dx = -1; dx <= 1; dx += 2) {
      for (let x = sx; x >= 0 && x < w; x += dx) {
        scratch[arrayOff + x] = -2 * h * dy;
        for (let y = sy; y >= 0 && y < h; y += dy) {
          if (grid[y * w + x] === -1 && (x === sx || dy * y <= dy * scratch[arrayOff + x - dx]))
            scratch[arrayOff + x] = y;
          else break;
        }
      }
    }
  }

  // Find real max area available
  let realmaxarea = 0;
  for (let x = 0; x < w; x++) {
    const rh = scratch[bottom + x] - scratch[top + x] + 1;
    if (rh <= 0) continue;

    const dx = x > sx ? -1 : 1;
    let x2: number;
    for (x2 = x; x2 >= 0 && x2 < w; x2 += dx)
      if (scratch[bottom + x2] < scratch[bottom + x] || scratch[top + x2] > scratch[top + x]) break;

    const rw = Math.abs(x2 - x);
    if (realmaxarea < rw * rh) realmaxarea = rw * rh;
  }

  if (realmaxarea > maxarea) realmaxarea = maxarea;

  // Don't allow rectangles spanning full width/height (unless grid is tiny)
  let mw = w - 1;
  if (mw < 3) mw++;
  let mh = h - 1;
  if (mh < 3) mh++;

  for (let rw = 1; rw <= mw; rw++) {
    for (let rh = 1; rh <= mh; rh++) {
      if (rw * rh > realmaxarea) continue;
      if (rw * rh === 1) continue;

      for (let x = Math.max(sx - rw + 1, 0); x <= Math.min(sx, w - rw); x++) {
        for (let y = Math.max(sy - rh + 1, 0); y <= Math.min(sy, h - rh); y++) {
          if (
            scratch[top + x] <= y &&
            scratch[top + x + rw - 1] <= y &&
            scratch[bottom + x] >= y + rh - 1 &&
            scratch[bottom + x + rw - 1] >= y + rh - 1
          ) {
            if (outRect && index === outN.value) {
              outRect.x = x;
              outRect.y = y;
              outRect.w = rw;
              outRect.h = rh;
              return;
            }
            index++;
          }
        }
      }
    }
  }

  if (!outRect) outN.value = index;
}

function place_rect(w: number, grid: Int32Array, r: Rect): void {
  const idx = INDEX(w, r.x, r.y);
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) grid[y * w + x] = idx;
}

function find_rect(w: number, h: number, grid: Int32Array, x: number, y: number): Rect {
  const idx = grid[y * w + x];

  if (idx < 0) return { x, y, w: 1, h: 1 }; // singleton

  const ry = Math.floor(idx / w);
  const rx = idx % w;

  let rw = 1;
  while (rx + rw < w && grid[ry * w + rx + rw] === idx) rw++;
  let rh = 1;
  while (ry + rh < h && grid[(ry + rh) * w + rx] === idx) rh++;

  return { x: rx, y: ry, w: rw, h: rh };
}

// ---------------------------------------------------------------------------
// new_game_desc — full generation pipeline (from rect.c)
// ---------------------------------------------------------------------------

function new_game_desc(
  w: number,
  h: number,
  rs: Random,
  unique: boolean,
): { grid: Int32Array; numbers: Int32Array } {
  const expandfactor = 0.0;

  while (true) {
    // Smaller base grid
    let p2w = Math.floor(w / (1.0 + expandfactor));
    if (p2w < 2 && w >= 2) p2w = 2;
    let p2h = Math.floor(h / (1.0 + expandfactor));
    if (p2h < 2 && h >= 2) p2h = 2;

    let grid = new Int32Array(p2w * p2h).fill(-1);
    const scratch = new Int32Array(2 * p2w);

    let nsquares = p2w * p2h;

    // Place rectangles randomly
    while (nsquares > 0) {
      const square = rs.next(nsquares);

      // Find the square'th uncovered cell
      let sx = -1,
        sy = -1,
        count = square;
      for (let yy = 0; yy < p2h; yy++) {
        for (let xx = 0; xx < p2w; xx++) {
          if (grid[yy * p2w + xx] === -1) {
            if (count === 0) {
              sx = xx;
              sy = yy;
              break;
            }
            count--;
          }
        }
        if (sx >= 0) break;
      }

      // Count possible rectangles
      const nRef = { value: 0 };
      enum_rects(p2w, p2h, grid, null, nRef, sx, sy, scratch);

      if (nRef.value === 0) {
        // Singleton — mark as -2
        grid[sy * p2w + sx] = -2;
        nsquares--;
      } else {
        // Pick one at random
        const picked = { value: rs.next(nRef.value) };
        const r: Rect = { x: 0, y: 0, w: 0, h: 0 };
        enum_rects(p2w, p2h, grid, r, picked, sx, sy, scratch);
        place_rect(p2w, grid, r);
        nsquares -= r.w * r.h;
      }
    }

    // Deal with singleton spaces (-2 cells)
    for (let x = 0; x < p2w; x++) {
      for (let y = 0; y < p2h; y++) {
        if (grid[y * p2w + x] >= 0) continue;

        // Check in which directions we can extend the singleton
        const dirs: number[] = [];

        if (x < p2w - 1) {
          const r = find_rect(p2w, p2h, grid, x + 1, y);
          if ((r.w * r.h > 2 && (r.y === y || r.y + r.h - 1 === y)) || r.h === 1) dirs.push(1); // right
        }
        if (y > 0) {
          const r = find_rect(p2w, p2h, grid, x, y - 1);
          if ((r.w * r.h > 2 && (r.x === x || r.x + r.w - 1 === x)) || r.w === 1) dirs.push(2); // up
        }
        if (x > 0) {
          const r = find_rect(p2w, p2h, grid, x - 1, y);
          if ((r.w * r.h > 2 && (r.y === y || r.y + r.h - 1 === y)) || r.h === 1) dirs.push(4); // left
        }
        if (y < p2h - 1) {
          const r = find_rect(p2w, p2h, grid, x, y + 1);
          if ((r.w * r.h > 2 && (r.x === x || r.x + r.w - 1 === x)) || r.w === 1) dirs.push(8); // down
        }

        if (dirs.length > 0) {
          const dir = dirs[rs.next(dirs.length)];
          let r1: Rect;
          let r2: Rect;

          switch (dir) {
            case 1: {
              // right
              r1 = find_rect(p2w, p2h, grid, x + 1, y);
              r2 = { x, y, w: 1 + r1.w, h: 1 };
              if (r1.y === y) r1 = { ...r1, y: r1.y + 1, h: r1.h - 1 };
              else r1 = { ...r1, h: r1.h - 1 };
              break;
            }
            case 2: {
              // up
              r1 = find_rect(p2w, p2h, grid, x, y - 1);
              r2 = { x, y: r1.y, w: 1, h: 1 + r1.h };
              if (r1.x === x) r1 = { ...r1, x: r1.x + 1, w: r1.w - 1 };
              else r1 = { ...r1, w: r1.w - 1 };
              break;
            }
            case 4: {
              // left
              r1 = find_rect(p2w, p2h, grid, x - 1, y);
              r2 = { x: r1.x, y, w: 1 + r1.w, h: 1 };
              if (r1.y === y) r1 = { ...r1, y: r1.y + 1, h: r1.h - 1 };
              else r1 = { ...r1, h: r1.h - 1 };
              break;
            }
            case 8: {
              // down
              r1 = find_rect(p2w, p2h, grid, x, y + 1);
              r2 = { x, y, w: 1, h: 1 + r1.h };
              if (r1.x === x) r1 = { ...r1, x: r1.x + 1, w: r1.w - 1 };
              else r1 = { ...r1, w: r1.w - 1 };
              break;
            }
            default:
              throw new Error('invalid direction');
          }
          if (r1.h > 0 && r1.w > 0) place_rect(p2w, grid, r1);
          place_rect(p2w, grid, r2);
        } else {
          // 3x3 trick: replace surrounding area with a single 3x3
          const r: Rect = { x: x - 1, y: y - 1, w: 3, h: 3 };
          place_rect(p2w, grid, r);
        }
      }
    }

    // Expansion phase: extend grid to target size in two passes (vertical then horizontal via transpose)
    let curW = p2w;
    let curH = p2h;
    let targetW = w;
    let targetH = h;

    for (let pass = 0; pass < 2; pass++) {
      // Expand vertically from curH to targetH
      const grid2 = new Int32Array(curW * targetH);
      const expand = new Int32Array(curH - 1);
      const where = new Int32Array(curW);

      // Decide which horizontal edges to expand
      for (let ey = 0; ey < curH - 1; ey++) expand[ey] = 0;
      for (let ey = curH; ey < targetH; ey++) {
        expand[rs.next(curH - 1)]++;
      }

      // Perform the expansion
      let y2 = 0,
        y2last = 0;
      for (let cy = 0; cy < curH; cy++) {
        // Copy a single line
        for (let cx = 0; cx < curW; cx++) {
          const val = grid[cy * curW + cx];
          const valTopY = Math.floor(val / curW);
          if (
            valTopY === cy &&
            (y2 === 0 || Math.floor(grid2[(y2 - 1) * curW + cx] / curW) < y2last)
          ) {
            grid2[y2 * curW + cx] = INDEX(curW, val % curW, y2);
          } else {
            grid2[y2 * curW + cx] = grid2[(y2 - 1) * curW + cx];
          }
        }

        if (++y2 === targetH) break;
        y2last = y2;

        // Place edges in expansion rows
        let yx = -1;
        for (let cx = 0; cx < curW; cx++) {
          if (grid[cy * curW + cx] !== grid[(cy + 1) * curW + cx]) {
            // Horizontal edge needs placing
            if (
              cx === 0 ||
              (grid[cy * curW + cx - 1] !== grid[cy * curW + cx] &&
                grid[(cy + 1) * curW + cx - 1] !== grid[(cy + 1) * curW + cx])
            ) {
              yx = rs.next(expand[cy] + 1);
            }
            // else reuse previous yx
          } else {
            yx = -1;
          }
          where[cx] = yx;
        }

        for (let eyx = 0; eyx < expand[cy]; eyx++) {
          for (let cx = 0; cx < curW; cx++) {
            if (eyx === where[cx]) {
              let val = grid[(cy + 1) * curW + cx];
              val = val % curW;
              val = INDEX(curW, val, y2);
              grid2[y2 * curW + cx] = val;
            } else {
              grid2[y2 * curW + cx] = grid2[(y2 - 1) * curW + cx];
            }
          }
          y2++;
        }
      }

      // Transpose
      const newW = targetH;
      const newH = curW;
      grid = new Int32Array(newW * newH);
      for (let tx = 0; tx < newW; tx++) {
        for (let ty = 0; ty < newH; ty++) {
          const idx1 = INDEX(newW, tx, ty);
          const idx2 = INDEX(curW, ty, tx);
          let tmp = grid2[idx2];
          tmp = (tmp % curW) * newW + Math.floor(tmp / curW);
          grid[idx1] = tmp;
        }
      }

      // Swap dimensions for next pass
      curW = newW;
      curH = newH;
      const tmpT = targetW;
      targetW = targetH;
      targetH = tmpT;
    }

    // At this point curW === w and curH === h and grid is filled

    // Run the solver to narrow down number placements
    let nnumbers = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (grid[y * w + x] === INDEX(w, x, y)) nnumbers++;

    const nd: NumberData[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = INDEX(w, x, y);
        if (grid[y * w + x] === idx) {
          const r = find_rect(w, h, grid, x, y);
          const points: Point[] = [];
          for (let j = 0; j < r.h; j++)
            for (let k = 0; k < r.w; k++) points.push({ x: k + r.x, y: j + r.y });

          nd.push({ area: r.w * r.h, npoints: points.length, points });
        }
      }
    }

    let ret: number;
    if (unique) {
      ret = rect_solver(w, h, nnumbers, nd, null, null, rs);
    } else {
      ret = 1;
    }

    if (ret === 1) {
      // Place numbers according to solver's recommendations
      const numbers = new Int32Array(w * h);
      for (let i = 0; i < nnumbers; i++) {
        const pidx = rs.next(nd[i].npoints);
        const px = nd[i].points[pidx].x;
        const py = nd[i].points[pidx].y;
        numbers[py * w + px] = nd[i].area;
      }

      return { grid, numbers };
    }

    // Solver failed — retry
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Rectangles (Shikaku) puzzle using Simon Tatham's algorithm.
 *
 * @param w Grid width
 * @param h Grid height
 * @param seed Optional PRNG seed for reproducibility
 * @returns RectanglesPuzzle with numbers clue grid and solution grid
 */
export function generateRectanglesPuzzle(w: number, h: number, seed?: number): RectanglesPuzzle {
  const rs = new Random(seed);
  const { grid, numbers } = new_game_desc(w, h, rs, true);

  return {
    numbers: Array.from(numbers),
    solution: Array.from(grid),
    w,
    h,
  };
}
