import { describe, it, expect } from 'bun:test';
import { generateUnrulyPuzzle, solveUnruly } from './unruly';

// Cell constants matching unruly.ts internals
const EMPTY = 0;
const N_ONE = 1; // black
const N_ZERO = 2; // white

/**
 * Check that no three consecutive same-value cells exist in any row or column.
 */
function hasNoThreeConsecutive(grid: number[], w: number, h: number): boolean {
  // Check rows
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 2; x++) {
      const a = grid[y * w + x]!;
      const b = grid[y * w + x + 1]!;
      const c = grid[y * w + x + 2]!;
      if (a !== EMPTY && a === b && b === c) return false;
    }
  }
  // Check columns
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h - 2; y++) {
      const a = grid[y * w + x]!;
      const b = grid[(y + 1) * w + x]!;
      const c = grid[(y + 2) * w + x]!;
      if (a !== EMPTY && a === b && b === c) return false;
    }
  }
  return true;
}

/**
 * Check each row and column has exactly w/2 of each value.
 */
function hasBalancedCounts(grid: number[], w: number, h: number): boolean {
  const halfW = w / 2;
  const halfH = h / 2;

  for (let y = 0; y < h; y++) {
    let ones = 0;
    let zeros = 0;
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === N_ONE) ones++;
      if (grid[y * w + x] === N_ZERO) zeros++;
    }
    if (ones !== halfW || zeros !== halfW) return false;
  }

  for (let x = 0; x < w; x++) {
    let ones = 0;
    let zeros = 0;
    for (let y = 0; y < h; y++) {
      if (grid[y * w + x] === N_ONE) ones++;
      if (grid[y * w + x] === N_ZERO) zeros++;
    }
    if (ones !== halfH || zeros !== halfH) return false;
  }

  return true;
}

describe('unruly', () => {
  // -------------------------------------------------------------------------
  // Generator invariants
  // -------------------------------------------------------------------------

  describe('generateUnrulyPuzzle', () => {
    it('returns correct dimensions', () => {
      const p = generateUnrulyPuzzle(6, 6);
      expect(p.w).toBe(6);
      expect(p.h).toBe(6);
      expect(p.grid).toHaveLength(36);
      expect(p.solution).toHaveLength(36);
    });

    it('rejects odd dimensions', () => {
      expect(() => generateUnrulyPuzzle(5, 6)).toThrow();
      expect(() => generateUnrulyPuzzle(6, 5)).toThrow();
    });

    it('rejects dimensions below 6', () => {
      expect(() => generateUnrulyPuzzle(4, 4)).toThrow();
    });

    it('grid contains only EMPTY, N_ONE, N_ZERO', () => {
      const p = generateUnrulyPuzzle(6, 6);
      for (const v of p.grid) {
        expect([EMPTY, N_ONE, N_ZERO]).toContain(v);
      }
    });

    it('grid has some empty cells (clues were winnowed)', () => {
      const p = generateUnrulyPuzzle(6, 6);
      const emptyCount = p.grid.filter((v) => v === EMPTY).length;
      expect(emptyCount).toBeGreaterThan(0);
    });

    it('solution satisfies no-three-consecutive constraint', () => {
      const p = generateUnrulyPuzzle(6, 6);
      expect(hasNoThreeConsecutive(p.solution, p.w, p.h)).toBe(true);
    });

    it('solution has balanced row/column counts', () => {
      const p = generateUnrulyPuzzle(6, 6);
      expect(hasBalancedCounts(p.solution, p.w, p.h)).toBe(true);
    });

    it('solution is fully filled (no empty cells)', () => {
      const p = generateUnrulyPuzzle(6, 6);
      for (const v of p.solution) {
        expect(v).not.toBe(EMPTY);
      }
    });

    it('grid clues are consistent with solution', () => {
      const p = generateUnrulyPuzzle(6, 6);
      for (let i = 0; i < p.grid.length; i++) {
        if (p.grid[i] !== EMPTY) {
          expect(p.grid[i]).toBe(p.solution[i]);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Solver
  // -------------------------------------------------------------------------

  describe('solveUnruly', () => {
    it('solves a generated puzzle to match the known solution', () => {
      const p = generateUnrulyPuzzle(6, 6);
      const solved = solveUnruly(p.grid, p.w, p.h);
      expect(solved).not.toBeNull();
      expect(solved).toEqual(p.solution);
    });

    it('solved result satisfies all constraints', () => {
      const p = generateUnrulyPuzzle(6, 6);
      const solved = solveUnruly(p.grid, p.w, p.h)!;
      expect(hasNoThreeConsecutive(solved, p.w, p.h)).toBe(true);
      expect(hasBalancedCounts(solved, p.w, p.h)).toBe(true);
    });

    it('returns null for an invalid puzzle (contradictory clues)', () => {
      // Three consecutive blacks in row 0 — unsolvable
      const grid = new Array(36).fill(EMPTY);
      grid[0] = N_ONE;
      grid[1] = N_ONE;
      grid[2] = N_ONE;
      const result = solveUnruly(grid, 6, 6);
      expect(result).toBeNull();
    });

    it('handles already-solved grid', () => {
      const p = generateUnrulyPuzzle(6, 6);
      const solved = solveUnruly(p.solution, p.w, p.h);
      expect(solved).toEqual(p.solution);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip (multiple trials)
  // -------------------------------------------------------------------------

  describe('round-trip', () => {
    it('generate → solve → validate (5 trials)', () => {
      for (let trial = 0; trial < 5; trial++) {
        const p = generateUnrulyPuzzle(6, 6);
        const solved = solveUnruly(p.grid, p.w, p.h);
        expect(solved).not.toBeNull();
        expect(solved).toEqual(p.solution);
      }
    });
  });
});
