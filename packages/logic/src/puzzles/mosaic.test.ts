import { describe, it, expect } from 'bun:test';
import { generateMosaicPuzzle } from './mosaic';

/**
 * Count filled cells in the 3x3 neighbourhood of (r, c).
 */
function countNeighbourhood(solution: boolean[], w: number, h: number, idx: number): number {
  const r = Math.floor(idx / w);
  const c = idx % w;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    const nr = r + dr;
    if (nr < 0 || nr >= h) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc;
      if (nc < 0 || nc >= w) continue;
      if (solution[nr * w + nc]) count++;
    }
  }
  return count;
}

describe('mosaic', () => {
  // -------------------------------------------------------------------------
  // Generator invariants
  // -------------------------------------------------------------------------

  describe('generateMosaicPuzzle', () => {
    it('returns correct dimensions', () => {
      const p = generateMosaicPuzzle(5, 5);
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.clues).toHaveLength(25);
      expect(p.solution).toHaveLength(25);
    });

    it('clues are -1 (no clue) or 0-9', () => {
      const p = generateMosaicPuzzle(5, 5);
      for (const c of p.clues) {
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThanOrEqual(9);
      }
    });

    it('solution contains only booleans', () => {
      const p = generateMosaicPuzzle(5, 5);
      for (const v of p.solution) {
        expect(typeof v).toBe('boolean');
      }
    });

    it('has some clues (not all -1)', () => {
      const p = generateMosaicPuzzle(5, 5);
      const clueCount = p.clues.filter((c) => c >= 0).length;
      expect(clueCount).toBeGreaterThan(0);
    });

    it('has some removed clues (winnowing happened)', () => {
      const p = generateMosaicPuzzle(5, 5);
      const noClueCount = p.clues.filter((c) => c === -1).length;
      expect(noClueCount).toBeGreaterThan(0);
    });

    it('each clue matches the neighbourhood count in the solution', () => {
      const p = generateMosaicPuzzle(6, 6);
      for (let i = 0; i < p.clues.length; i++) {
        if (p.clues[i]! >= 0) {
          const expected = countNeighbourhood(p.solution, p.w, p.h, i);
          expect(p.clues[i]).toBe(expected);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Clue value bounds
  // -------------------------------------------------------------------------

  describe('clue value bounds', () => {
    it('corner clues are at most 4 (corner has 4-cell neighbourhood)', () => {
      const p = generateMosaicPuzzle(5, 5);
      const corners = [0, p.w - 1, (p.h - 1) * p.w, p.h * p.w - 1];
      for (const idx of corners) {
        if (p.clues[idx]! >= 0) {
          expect(p.clues[idx]).toBeLessThanOrEqual(4);
        }
      }
    });

    it('edge clues are at most 6', () => {
      const p = generateMosaicPuzzle(5, 5);
      // Top edge (excluding corners)
      for (let x = 1; x < p.w - 1; x++) {
        if (p.clues[x]! >= 0) {
          expect(p.clues[x]).toBeLessThanOrEqual(6);
        }
      }
    });

    it('interior clues are at most 9', () => {
      const p = generateMosaicPuzzle(5, 5);
      for (let y = 1; y < p.h - 1; y++) {
        for (let x = 1; x < p.w - 1; x++) {
          const idx = y * p.w + x;
          if (p.clues[idx]! >= 0) {
            expect(p.clues[idx]).toBeLessThanOrEqual(9);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip: verify solution matches clues for multiple trials
  // -------------------------------------------------------------------------

  describe('round-trip', () => {
    it('generate and verify clue consistency (5 trials)', () => {
      for (let trial = 0; trial < 5; trial++) {
        const p = generateMosaicPuzzle(5, 5);
        for (let i = 0; i < p.w * p.h; i++) {
          if (p.clues[i]! >= 0) {
            const nbCount = countNeighbourhood(p.solution, p.w, p.h, i);
            expect(p.clues[i]).toBe(nbCount);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: small grids
  // -------------------------------------------------------------------------

  describe('small grids', () => {
    it('generates valid 3x3 puzzle', () => {
      const p = generateMosaicPuzzle(3, 3);
      expect(p.clues).toHaveLength(9);
      expect(p.solution).toHaveLength(9);
      // Verify clues
      for (let i = 0; i < 9; i++) {
        if (p.clues[i]! >= 0) {
          expect(p.clues[i]).toBe(countNeighbourhood(p.solution, p.w, p.h, i));
        }
      }
    });

    it('generates valid 2x2 puzzle', () => {
      const p = generateMosaicPuzzle(2, 2);
      expect(p.clues).toHaveLength(4);
      expect(p.solution).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------------------
  // Solution uniqueness: all clues should be consistent with exactly
  // one solution (we can't easily re-run the solver here, but we verify
  // structural correctness)
  // -------------------------------------------------------------------------

  describe('structural correctness', () => {
    it('neighbourhood size is correct for every cell', () => {
      const w = 5;
      const h = 5;
      const p = generateMosaicPuzzle(w, h);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          // Compute expected neighbourhood size
          const minR = Math.max(0, y - 1);
          const maxR = Math.min(h - 1, y + 1);
          const minC = Math.max(0, x - 1);
          const maxC = Math.min(w - 1, x + 1);
          const nbSize = (maxR - minR + 1) * (maxC - minC + 1);

          // The clue value cannot exceed the neighbourhood size
          if (p.clues[idx]! >= 0) {
            expect(p.clues[idx]).toBeLessThanOrEqual(nbSize);
            expect(p.clues[idx]).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });
});
