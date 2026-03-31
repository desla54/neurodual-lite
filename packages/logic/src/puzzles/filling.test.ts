import { describe, it, expect } from 'bun:test';
import { generateFillingPuzzle, validateFillingBoard, solveFillingPuzzle } from './filling';

/**
 * Check that every connected component of value N has exactly N cells.
 * (Reimplementation for test verification, independent of validateFillingBoard.)
 */
function checkFillomino(board: number[], w: number, h: number): boolean {
  const n = w * h;
  const visited = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (visited[i] || board[i] === 0) continue;

    // BFS to find connected component of same value
    const val = board[i]!;
    const queue = [i];
    visited[i] = true;
    let size = 0;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      size++;
      const cx = cur % w;
      const cy = Math.floor(cur / w);

      for (const [ddx, ddy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = cx + ddx!;
        const ny = cy + ddy!;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (!visited[ni] && board[ni] === val) {
          visited[ni] = true;
          queue.push(ni);
        }
      }
    }

    if (size !== val) return false;
  }

  return true;
}

describe('filling', () => {
  // -------------------------------------------------------------------------
  // Generator invariants
  // -------------------------------------------------------------------------

  describe('generateFillingPuzzle', () => {
    it('returns correct dimensions', () => {
      const p = generateFillingPuzzle(4, 4);
      expect(p.w).toBe(4);
      expect(p.h).toBe(4);
      expect(p.board).toHaveLength(16);
      expect(p.solution).toHaveLength(16);
    });

    it('board values are in range [0, 9]', () => {
      const p = generateFillingPuzzle(5, 5);
      for (const v of p.board) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(9);
      }
    });

    it('solution values are in range [1, 9] (no empty cells)', () => {
      const p = generateFillingPuzzle(5, 5);
      for (const v of p.solution) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(9);
      }
    });

    it('board has some empty cells (clues were winnowed)', () => {
      const p = generateFillingPuzzle(5, 5);
      const emptyCount = p.board.filter((v) => v === 0).length;
      expect(emptyCount).toBeGreaterThan(0);
    });

    it('clues in board match corresponding solution values', () => {
      const p = generateFillingPuzzle(5, 5);
      for (let i = 0; i < p.board.length; i++) {
        if (p.board[i] !== 0) {
          expect(p.board[i]).toBe(p.solution[i]);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Solution validation
  // -------------------------------------------------------------------------

  describe('validateFillingBoard', () => {
    it('accepts a valid generated solution', () => {
      const p = generateFillingPuzzle(5, 5);
      expect(validateFillingBoard(p.solution, p.w, p.h)).toBe(true);
    });

    it('validates with independent checker', () => {
      const p = generateFillingPuzzle(5, 5);
      expect(checkFillomino(p.solution, p.w, p.h)).toBe(true);
    });

    it('rejects a board where region size does not match value', () => {
      // Simple 2x2 board: all 1s, but each 1 is connected to neighbors
      // [1, 1, 1, 1] → each "1" is part of a 4-cell component, size != 1
      expect(validateFillingBoard([1, 1, 1, 1], 2, 2)).toBe(false);
    });

    it('accepts a trivially correct board', () => {
      // [2, 2, 2, 2] as two separate 2-cell components
      // Top row: 2,2 (connected, size=2 ✓), Bottom row: 2,2 (connected, size=2 ✓)
      // But all 4 are connected → size=4 ≠ 2 → invalid
      expect(validateFillingBoard([2, 2, 2, 2], 2, 2)).toBe(false);

      // Correct: [1, 2, 2, 1]
      // (0,0)=1 alone ✓, (1,0)=2 connected to (1,1)=2? No, (1,0) and (0,1) are at positions 1 and 2
      // Layout: row0=[1,2], row1=[2,1]
      // Position 1 (0,1) has value 2, position 2 (1,0) has value 2
      // Are they connected? (0,1) neighbors: (0,0)=1, (1,1)=1 → not connected to (1,0)
      // (1,0) neighbors: (0,0)=1, (1,1)=1 → so position 1 and 2 are NOT connected
      // Each "2" is a singleton → size=1 ≠ 2 → invalid
      // Let's try: [2, 2, 1, 1] → row0=[2,2] connected, size=2 ✓; row1=[1,1] connected, size=2 ≠ 1
      // Try: [1, 1, 1, 1] with a different grid shape won't work for 2x2

      // Valid 3x1: [1, 2, 2]
      expect(validateFillingBoard([1, 2, 2], 3, 1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Solver
  // -------------------------------------------------------------------------

  describe('solveFillingPuzzle', () => {
    it('solves a generated puzzle to match the known solution', () => {
      const p = generateFillingPuzzle(4, 4);
      const solved = solveFillingPuzzle(p.board, p.w, p.h);
      expect(solved).not.toBeNull();
      expect(solved).toEqual(p.solution);
    });

    it('solved result passes validation', () => {
      const p = generateFillingPuzzle(5, 5);
      const solved = solveFillingPuzzle(p.board, p.w, p.h)!;
      expect(validateFillingBoard(solved, p.w, p.h)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip
  // -------------------------------------------------------------------------

  describe('round-trip', () => {
    it('generate → solve → validate (5 trials)', () => {
      for (let trial = 0; trial < 5; trial++) {
        const p = generateFillingPuzzle(4, 4);
        const solved = solveFillingPuzzle(p.board, p.w, p.h);
        expect(solved).not.toBeNull();
        expect(solved).toEqual(p.solution);
        expect(validateFillingBoard(solved!, p.w, p.h)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: smallest grid
  // -------------------------------------------------------------------------

  describe('small grids', () => {
    it('generates valid 3x3 puzzle', () => {
      const p = generateFillingPuzzle(3, 3);
      expect(p.board).toHaveLength(9);
      expect(validateFillingBoard(p.solution, p.w, p.h)).toBe(true);
    });

    it('generates valid 2x3 puzzle', () => {
      const p = generateFillingPuzzle(2, 3);
      expect(p.board).toHaveLength(6);
      expect(validateFillingBoard(p.solution, p.w, p.h)).toBe(true);
    });
  });
});
