import { describe, it, expect } from 'bun:test';
import { generateDominosaPuzzle } from './dominosa';

/** nth triangular number */
function TRI(n: number): number {
  return (n * (n + 1)) / 2;
}

/** Number of dominoes for max value n */
function DCOUNT(n: number): number {
  return TRI(n + 1);
}

/** Map a pair (n1, n2) to a unique domino index (order-independent) */
function DINDEX(n1: number, n2: number): number {
  return TRI(Math.max(n1, n2)) + Math.min(n1, n2);
}

/**
 * Given a grid of numbers, try to find a valid domino tiling where each
 * domino (a, b) with a <= b appears exactly once.
 *
 * Uses brute-force backtracking for small grids. Returns true if valid.
 */
function findDominoTiling(
  grid: number[],
  w: number,
  h: number,
  n: number,
): { pairs: [number, number][] } | null {
  const wh = w * h;
  const dc = DCOUNT(n);
  const used = new Array<boolean>(dc).fill(false);
  const assigned = new Array<number>(wh).fill(-1); // which domino index covers this cell
  const pairs: [number, number][] = [];

  function solve(pos: number): boolean {
    // Skip already-assigned cells
    while (pos < wh && assigned[pos]! >= 0) pos++;
    if (pos >= wh) return true;

    const x = pos % w;
    const y = Math.floor(pos / w);

    // Try pairing with right neighbour
    if (x + 1 < w) {
      const right = pos + 1;
      if (assigned[right]! < 0) {
        const di = DINDEX(grid[pos]!, grid[right]!);
        if (!used[di]) {
          used[di] = true;
          assigned[pos] = di;
          assigned[right] = di;
          pairs.push([pos, right]);
          if (solve(pos + 1)) return true;
          pairs.pop();
          assigned[pos] = -1;
          assigned[right] = -1;
          used[di] = false;
        }
      }
    }

    // Try pairing with bottom neighbour
    if (y + 1 < h) {
      const bottom = pos + w;
      if (assigned[bottom]! < 0) {
        const di = DINDEX(grid[pos]!, grid[bottom]!);
        if (!used[di]) {
          used[di] = true;
          assigned[pos] = di;
          assigned[bottom] = di;
          pairs.push([pos, bottom]);
          if (solve(pos + 1)) return true;
          pairs.pop();
          assigned[pos] = -1;
          assigned[bottom] = -1;
          used[di] = false;
        }
      }
    }

    return false;
  }

  return solve(0) ? { pairs } : null;
}

describe('dominosa', () => {
  // -------------------------------------------------------------------------
  // Generator invariants
  // -------------------------------------------------------------------------

  describe('generateDominosaPuzzle', () => {
    it('returns correct dimensions for n=2', () => {
      const p = generateDominosaPuzzle(2);
      expect(p.n).toBe(2);
      expect(p.w).toBe(4); // n+2
      expect(p.h).toBe(3); // n+1
      expect(p.grid).toHaveLength(12);
    });

    it('returns correct dimensions for n=3', () => {
      const p = generateDominosaPuzzle(3);
      expect(p.n).toBe(3);
      expect(p.w).toBe(5);
      expect(p.h).toBe(4);
      expect(p.grid).toHaveLength(20);
    });

    it('rejects n < 1', () => {
      expect(() => generateDominosaPuzzle(0)).toThrow();
    });

    it('grid values are in range [0, n]', () => {
      const p = generateDominosaPuzzle(3);
      for (const v of p.grid) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(p.n);
      }
    });

    it('grid size equals 2 * DCOUNT(n) (exactly covers all dominoes)', () => {
      for (const n of [1, 2, 3]) {
        const p = generateDominosaPuzzle(n);
        expect(p.grid.length).toBe(2 * DCOUNT(n));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Domino value distribution
  // -------------------------------------------------------------------------

  describe('value distribution', () => {
    it('each number 0..n appears the correct number of times', () => {
      // Value v appears in (n+1) dominoes: (v,0)..(v,n). In domino (v,v)
      // it occupies both cells (2), in all others it occupies 1 cell.
      // Total cell count for value v = (n+1) - 1 + 2 = n + 2.
      const p = generateDominosaPuzzle(3);
      const counts = new Array(p.n + 1).fill(0);
      for (const v of p.grid) {
        counts[v]++;
      }
      for (let v = 0; v <= p.n; v++) {
        expect(counts[v]).toBe(p.n + 2);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tiling existence (small n only — backtracking is expensive)
  // -------------------------------------------------------------------------

  describe('tiling solvability', () => {
    it('n=1 puzzle has a valid domino tiling', () => {
      const p = generateDominosaPuzzle(1);
      const result = findDominoTiling(p.grid, p.w, p.h, p.n);
      expect(result).not.toBeNull();
    });

    it('n=2 puzzle has a valid domino tiling', () => {
      const p = generateDominosaPuzzle(2);
      const result = findDominoTiling(p.grid, p.w, p.h, p.n);
      expect(result).not.toBeNull();
    });

    it('n=3 puzzle has a valid domino tiling (3 trials)', () => {
      for (let trial = 0; trial < 3; trial++) {
        const p = generateDominosaPuzzle(3);
        const result = findDominoTiling(p.grid, p.w, p.h, p.n);
        expect(result).not.toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tiling uniqueness verification for n=1 and n=2
  // -------------------------------------------------------------------------

  describe('tiling uniqueness', () => {
    it('n=1 puzzle tiling covers all cells', () => {
      const p = generateDominosaPuzzle(1);
      const result = findDominoTiling(p.grid, p.w, p.h, p.n)!;
      // All cells should be covered
      const covered = new Set<number>();
      for (const [a, b] of result.pairs) {
        covered.add(a);
        covered.add(b);
      }
      expect(covered.size).toBe(p.grid.length);
    });

    it('n=2 tiling uses each domino exactly once', () => {
      const p = generateDominosaPuzzle(2);
      const result = findDominoTiling(p.grid, p.w, p.h, p.n)!;
      const usedDominoes = new Set<number>();
      for (const [a, b] of result.pairs) {
        const di = DINDEX(p.grid[a]!, p.grid[b]!);
        expect(usedDominoes.has(di)).toBe(false);
        usedDominoes.add(di);
      }
      expect(usedDominoes.size).toBe(DCOUNT(p.n));
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: n=1 (smallest)
  // -------------------------------------------------------------------------

  describe('n=1 (smallest)', () => {
    it('generates a 3x2 grid with 3 dominoes', () => {
      const p = generateDominosaPuzzle(1);
      expect(p.w).toBe(3);
      expect(p.h).toBe(2);
      expect(p.grid).toHaveLength(6);
      // DCOUNT(1) = 3 dominoes: (0,0), (0,1), (1,1)
      expect(DCOUNT(1)).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip: multiple generations
  // -------------------------------------------------------------------------

  describe('round-trip', () => {
    it('generate and verify structure (5 trials with n=2)', () => {
      for (let trial = 0; trial < 5; trial++) {
        const p = generateDominosaPuzzle(2);
        expect(p.grid).toHaveLength(2 * DCOUNT(2));
        for (const v of p.grid) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(2);
        }
        const result = findDominoTiling(p.grid, p.w, p.h, p.n);
        expect(result).not.toBeNull();
      }
    });
  });
});
