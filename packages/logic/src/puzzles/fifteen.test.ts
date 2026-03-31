import { describe, it, expect } from 'bun:test';
import { generateFifteenPuzzle } from './fifteen';

/**
 * Count inversions in the tile array (ignoring the gap=0).
 * An inversion is a pair (a,b) where a appears before b but a > b.
 */
function countInversions(tiles: number[]): number {
  let inv = 0;
  const nonZero = tiles.filter((t) => t !== 0);
  for (let i = 0; i < nonZero.length; i++) {
    for (let j = i + 1; j < nonZero.length; j++) {
      if (nonZero[i]! > nonZero[j]!) inv++;
    }
  }
  return inv;
}

/**
 * Check if a fifteen puzzle is solvable.
 *
 * For an NxN puzzle with goal state [1,2,...,N*N-1,0]:
 *   - If N is odd: solvable iff inversion count is even
 *   - If N is even: solvable iff (inversions + row of gap from bottom) is even
 *
 * But Tatham's target is gap at bottom-right, which matches the standard rule.
 */
function isSolvable(tiles: number[], size: number): boolean {
  const inversions = countInversions(tiles);
  const gapIndex = tiles.indexOf(0);
  const gapRow = Math.floor(gapIndex / size);
  const gapFromBottom = size - 1 - gapRow;

  if (size % 2 === 1) {
    return inversions % 2 === 0;
  } else {
    return (inversions + gapFromBottom) % 2 === 0;
  }
}

describe('fifteen', () => {
  // -------------------------------------------------------------------------
  // Generator invariants
  // -------------------------------------------------------------------------

  describe('generateFifteenPuzzle', () => {
    it('returns correct size and tile count', () => {
      const p = generateFifteenPuzzle(4);
      expect(p.size).toBe(4);
      expect(p.tiles).toHaveLength(16);
    });

    it('rejects size < 2', () => {
      expect(() => generateFifteenPuzzle(1)).toThrow();
      expect(() => generateFifteenPuzzle(0)).toThrow();
    });

    it('tiles contain exactly one of each value 0..n-1', () => {
      for (const size of [2, 3, 4, 5]) {
        const p = generateFifteenPuzzle(size);
        const n = size * size;
        const sorted = [...p.tiles].sort((a, b) => a - b);
        const expected = Array.from({ length: n }, (_, i) => i);
        expect(sorted).toEqual(expected);
      }
    });

    it('contains exactly one gap (0)', () => {
      const p = generateFifteenPuzzle(4);
      const zeros = p.tiles.filter((t) => t === 0);
      expect(zeros).toHaveLength(1);
    });

    it('generated puzzle is solvable (parity check)', () => {
      for (let trial = 0; trial < 10; trial++) {
        const p = generateFifteenPuzzle(4);
        expect(isSolvable(p.tiles, p.size)).toBe(true);
      }
    });

    it('solvability holds for odd-sized grids', () => {
      for (let trial = 0; trial < 10; trial++) {
        const p = generateFifteenPuzzle(3);
        expect(isSolvable(p.tiles, p.size)).toBe(true);
      }
    });

    it('solvability holds for size 5', () => {
      for (let trial = 0; trial < 5; trial++) {
        const p = generateFifteenPuzzle(5);
        expect(isSolvable(p.tiles, p.size)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: smallest valid size
  // -------------------------------------------------------------------------

  describe('size=2 (smallest)', () => {
    it('generates a valid 2x2 puzzle', () => {
      const p = generateFifteenPuzzle(2);
      expect(p.size).toBe(2);
      expect(p.tiles).toHaveLength(4);
      const sorted = [...p.tiles].sort((a, b) => a - b);
      expect(sorted).toEqual([0, 1, 2, 3]);
    });

    it('2x2 puzzle is solvable', () => {
      for (let trial = 0; trial < 20; trial++) {
        const p = generateFifteenPuzzle(2);
        expect(isSolvable(p.tiles, p.size)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Puzzle is not trivially solved (tiles are shuffled)
  // -------------------------------------------------------------------------

  describe('non-triviality', () => {
    it('generated puzzle is not already in solved state (most of the time)', () => {
      // The solved state would be [1, 2, ..., n-1, 0]
      let alreadySolved = 0;
      for (let trial = 0; trial < 20; trial++) {
        const p = generateFifteenPuzzle(3);
        const n = p.size * p.size;
        const target = [...Array.from({ length: n - 1 }, (_, i) => i + 1), 0];
        if (p.tiles.every((t, i) => t === target[i])) alreadySolved++;
      }
      // It would be astronomically unlikely for many to be solved
      expect(alreadySolved).toBeLessThan(5);
    });
  });
});
