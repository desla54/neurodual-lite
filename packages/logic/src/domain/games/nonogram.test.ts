import { describe, expect, it } from 'bun:test';
import {
  type CellState,
  GRID_CONFIGS,
  computeLineClues,
  computeRowClues,
  computeColClues,
  checkSolution,
  countErrors,
  cycleCellState,
  createEmptyPlayerGrid,
  generateSolution,
  validateLine,
  computeScore,
} from './nonogram';

// =============================================================================
// Helpers
// =============================================================================

/** Create a solution row from a string like "##.#." where # = filled */
function rowFromPattern(pattern: string): boolean[] {
  return [...pattern].map((c) => c === '#');
}

/** Create a full solution from an array of pattern strings */
function solutionFromPatterns(patterns: string[]): boolean[][] {
  return patterns.map(rowFromPattern);
}

/** Build a player grid from a solution (perfect answer) */
function perfectPlayerGrid(solution: boolean[][]): CellState[][] {
  return solution.map((row) => row.map((c) => (c ? 1 : 0) as CellState));
}

// =============================================================================
// Tests
// =============================================================================

describe('nonogram puzzle logic', () => {
  // ── Clue generation ───────────────────────────────────────────────────────

  describe('computeLineClues', () => {
    it('single group', () => {
      expect(computeLineClues([true, true, true, false, false])).toEqual([3]);
    });

    it('two groups', () => {
      expect(computeLineClues([true, true, false, true, false])).toEqual([2, 1]);
    });

    it('all filled', () => {
      expect(computeLineClues([true, true, true, true, true])).toEqual([5]);
    });

    it('empty row returns [0]', () => {
      expect(computeLineClues([false, false, false, false, false])).toEqual([0]);
    });

    it('alternating filled/empty', () => {
      expect(computeLineClues([true, false, true, false, true])).toEqual([1, 1, 1]);
    });

    it('single cell filled', () => {
      expect(computeLineClues([false, false, true, false, false])).toEqual([1]);
    });

    it('group at the end', () => {
      expect(computeLineClues([false, false, true, true, true])).toEqual([3]);
    });

    it('two groups separated by multiple gaps', () => {
      expect(computeLineClues([true, false, false, false, true])).toEqual([1, 1]);
    });

    it('empty single-cell row', () => {
      expect(computeLineClues([false])).toEqual([0]);
    });

    it('filled single-cell row', () => {
      expect(computeLineClues([true])).toEqual([1]);
    });
  });

  describe('computeRowClues', () => {
    it('produces correct clues for a 3x3 grid', () => {
      const solution = solutionFromPatterns(['##.', '.#.', '###']);
      const clues = computeRowClues(solution);
      expect(clues).toEqual([[2], [1], [3]]);
    });

    it('handles all-empty grid', () => {
      const solution = solutionFromPatterns(['...', '...', '...']);
      const clues = computeRowClues(solution);
      expect(clues).toEqual([[0], [0], [0]]);
    });
  });

  describe('computeColClues', () => {
    it('produces correct clues for a 3x3 grid', () => {
      const solution = solutionFromPatterns([
        '#.#', // col0: T, col1: F, col2: T
        '#.#', // col0: T, col1: F, col2: T
        '..#', // col0: F, col1: F, col2: T
      ]);
      const clues = computeColClues(solution);
      expect(clues).toEqual([[2], [0], [3]]);
    });

    it('handles alternating column', () => {
      const solution = solutionFromPatterns([
        '#', // col0: T
        '.', // col0: F
        '#', // col0: T
        '.', // col0: F
        '#', // col0: T
      ]);
      const clues = computeColClues(solution);
      expect(clues).toEqual([[1, 1, 1]]);
    });
  });

  // ── Solution validation ───────────────────────────────────────────────────

  describe('checkSolution', () => {
    it('returns true when player grid matches solution', () => {
      const solution = solutionFromPatterns(['##.', '.#.', '###']);
      const player = perfectPlayerGrid(solution);
      expect(checkSolution(player, solution)).toBe(true);
    });

    it('returns false when a single cell differs', () => {
      const solution = solutionFromPatterns(['##.', '.#.', '###']);
      const player = perfectPlayerGrid(solution);
      // Flip one cell
      player[0]![0] = 0;
      expect(checkSolution(player, solution)).toBe(false);
    });

    it('treats marked-empty (2) as not filled', () => {
      const solution = solutionFromPatterns(['#..', '...']);
      const player: CellState[][] = [
        [1, 2, 0], // marked-empty is treated as not-filled
        [0, 0, 2],
      ];
      expect(checkSolution(player, solution)).toBe(true);
    });

    it('player filling an empty cell is incorrect', () => {
      const solution = solutionFromPatterns(['#..']);
      const player: CellState[][] = [[1, 1, 0]]; // cell (0,1) should be empty
      expect(checkSolution(player, solution)).toBe(false);
    });
  });

  // ── Partial validation (single row/column) ───────────────────────────────

  describe('validateLine', () => {
    it('returns true for matching line', () => {
      expect(validateLine([1, 1, 0, 1, 0], [2, 1])).toBe(true);
    });

    it('returns false for mismatched line', () => {
      expect(validateLine([1, 0, 0, 1, 0], [2, 1])).toBe(false);
    });

    it('returns true for all-empty line with clue [0]', () => {
      expect(validateLine([0, 0, 0, 0, 0], [0])).toBe(true);
    });

    it('returns true for all-filled line with clue [n]', () => {
      expect(validateLine([1, 1, 1, 1, 1], [5])).toBe(true);
    });

    it('treats marked-empty (2) as not filled', () => {
      expect(validateLine([1, 2, 1, 0, 0], [1, 1])).toBe(true);
    });

    it('returns false when clue count differs', () => {
      expect(validateLine([1, 0, 1, 0, 1], [2, 1])).toBe(false);
    });
  });

  // ── Cell state cycling ────────────────────────────────────────────────────

  describe('cycleCellState', () => {
    it('cycles empty → filled → marked-empty → empty', () => {
      expect(cycleCellState(0)).toBe(1);
      expect(cycleCellState(1)).toBe(2);
      expect(cycleCellState(2)).toBe(0);
    });

    it('full cycle returns to original', () => {
      let state: CellState = 0;
      state = cycleCellState(state);
      state = cycleCellState(state);
      state = cycleCellState(state);
      expect(state).toBe(0);
    });
  });

  // ── Grid sizes ────────────────────────────────────────────────────────────

  describe('grid configs', () => {
    it('level 1 is 5x5', () => {
      expect(GRID_CONFIGS[1]).toEqual({ rows: 5, cols: 5 });
    });

    it('level 2 is 7x7', () => {
      expect(GRID_CONFIGS[2]).toEqual({ rows: 7, cols: 7 });
    });

    it('level 3 is 10x10', () => {
      expect(GRID_CONFIGS[3]).toEqual({ rows: 10, cols: 10 });
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('1x1 grid filled', () => {
      const solution: boolean[][] = [[true]];
      const clues = computeRowClues(solution);
      expect(clues).toEqual([[1]]);
      const player: CellState[][] = [[1]];
      expect(checkSolution(player, solution)).toBe(true);
    });

    it('1x1 grid empty', () => {
      const solution: boolean[][] = [[false]];
      const clues = computeRowClues(solution);
      expect(clues).toEqual([[0]]);
      const player: CellState[][] = [[0]];
      expect(checkSolution(player, solution)).toBe(true);
    });

    it('10x10 all-filled grid', () => {
      const solution = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => true));
      const rowClues = computeRowClues(solution);
      const colClues = computeColClues(solution);
      for (const clue of rowClues) {
        expect(clue).toEqual([10]);
      }
      for (const clue of colClues) {
        expect(clue).toEqual([10]);
      }
    });

    it('10x10 all-empty grid', () => {
      const solution = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => false));
      const rowClues = computeRowClues(solution);
      const colClues = computeColClues(solution);
      for (const clue of rowClues) {
        expect(clue).toEqual([0]);
      }
      for (const clue of colClues) {
        expect(clue).toEqual([0]);
      }
    });

    it('single-column grid', () => {
      const solution: boolean[][] = [[true], [false], [true], [true]];
      const rowClues = computeRowClues(solution);
      expect(rowClues).toEqual([[1], [0], [1], [1]]);
      const colClues = computeColClues(solution);
      expect(colClues).toEqual([[1, 2]]);
    });

    it('single-row grid', () => {
      const solution: boolean[][] = [[true, false, true, true]];
      const rowClues = computeRowClues(solution);
      expect(rowClues).toEqual([[1, 2]]);
      const colClues = computeColClues(solution);
      expect(colClues).toEqual([[1], [0], [1], [1]]);
    });
  });

  // ── Error counting ────────────────────────────────────────────────────────

  describe('countErrors', () => {
    it('returns 0 for perfect grid', () => {
      const solution = solutionFromPatterns(['##.', '.#.']);
      const player = perfectPlayerGrid(solution);
      expect(countErrors(player, solution)).toBe(0);
    });

    it('counts filled-when-should-be-empty', () => {
      const solution = solutionFromPatterns(['#..']);
      const player: CellState[][] = [[1, 1, 0]]; // cell (0,1) extra fill
      expect(countErrors(player, solution)).toBe(1);
    });

    it('counts empty-when-should-be-filled', () => {
      const solution = solutionFromPatterns(['##.']);
      const player: CellState[][] = [[1, 0, 0]]; // cell (0,1) missing
      expect(countErrors(player, solution)).toBe(1);
    });

    it('counts multiple errors', () => {
      const solution = solutionFromPatterns(['###', '...']);
      const player: CellState[][] = [
        [0, 0, 0], // 3 errors (should be filled)
        [1, 1, 1], // 3 errors (should be empty)
      ];
      expect(countErrors(player, solution)).toBe(6);
    });

    it('marked-empty on a filled cell is an error', () => {
      const solution = solutionFromPatterns(['#']);
      const player: CellState[][] = [[2]]; // marked-empty but should be filled
      expect(countErrors(player, solution)).toBe(1);
    });

    it('marked-empty on an empty cell is correct', () => {
      const solution = solutionFromPatterns(['.']);
      const player: CellState[][] = [[2]]; // marked-empty on empty is fine
      expect(countErrors(player, solution)).toBe(0);
    });
  });

  // ── Grid generation ───────────────────────────────────────────────────────

  describe('generateSolution', () => {
    it('produces grid of requested dimensions', () => {
      for (const [rows, cols] of [
        [5, 5],
        [7, 7],
        [10, 10],
      ] as const) {
        const solution = generateSolution(rows, cols);
        expect(solution.length).toBe(rows);
        for (const row of solution) {
          expect(row.length).toBe(cols);
        }
      }
    });

    it('fill rate is roughly between 40% and 60%', () => {
      // Run multiple times and check average
      const rates: number[] = [];
      for (let i = 0; i < 50; i++) {
        const solution = generateSolution(10, 10);
        const filled = solution.flat().filter(Boolean).length;
        rates.push(filled / 100);
      }
      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      expect(avgRate).toBeGreaterThan(0.35);
      expect(avgRate).toBeLessThan(0.65);
    });

    it('contains boolean values only', () => {
      const solution = generateSolution(5, 5);
      for (const row of solution) {
        for (const cell of row) {
          expect(typeof cell).toBe('boolean');
        }
      }
    });
  });

  describe('createEmptyPlayerGrid', () => {
    it('creates grid filled with zeros', () => {
      const grid = createEmptyPlayerGrid(5, 7);
      expect(grid.length).toBe(5);
      for (const row of grid) {
        expect(row.length).toBe(7);
        for (const cell of row) {
          expect(cell).toBe(0);
        }
      }
    });
  });

  // ── Scoring ───────────────────────────────────────────────────────────────

  describe('computeScore', () => {
    it('perfect 5x5 solve under 30s gives 110 (clamped to 100)', () => {
      const score = computeScore(0, 10_000, 5, 5);
      expect(score.baseScore).toBe(100);
      expect(score.errorPenalty).toBe(0);
      expect(score.timeBonus).toBe(10);
      expect(score.finalScore).toBe(100); // clamped
    });

    it('perfect 5x5 solve between 30s and 60s gives time bonus 5', () => {
      const score = computeScore(0, 45_000, 5, 5);
      expect(score.timeBonus).toBe(5);
      expect(score.finalScore).toBe(100); // 100 + 5 clamped to 100
    });

    it('perfect solve over 60s gives no time bonus', () => {
      const score = computeScore(0, 90_000, 5, 5);
      expect(score.timeBonus).toBe(0);
      expect(score.finalScore).toBe(100);
    });

    it('each error costs 5 points', () => {
      const score = computeScore(3, 90_000, 5, 5);
      expect(score.errorPenalty).toBe(15);
      expect(score.finalScore).toBe(85);
    });

    it('many errors clamp score to 0', () => {
      const score = computeScore(25, 90_000, 5, 5);
      expect(score.finalScore).toBe(0);
    });

    it('larger grid scales time thresholds', () => {
      // 10x10 = 100 cells, threshold = (100/25)*30s = 120s
      const fast = computeScore(0, 100_000, 10, 10); // under 120s
      expect(fast.timeBonus).toBe(10);

      const medium = computeScore(0, 180_000, 10, 10); // under 240s
      expect(medium.timeBonus).toBe(5);

      const slow = computeScore(0, 300_000, 10, 10); // over 240s
      expect(slow.timeBonus).toBe(0);
    });
  });

  // ── Round-trip: clues match solution ──────────────────────────────────────

  describe('clue round-trip consistency', () => {
    it('clues from generated solution validate perfectly', () => {
      for (let i = 0; i < 10; i++) {
        const solution = generateSolution(7, 7);
        const rowClues = computeRowClues(solution);
        const colClues = computeColClues(solution);
        const player = perfectPlayerGrid(solution);

        // Every row should validate against its clue
        for (let r = 0; r < 7; r++) {
          expect(validateLine(player[r]!, rowClues[r]!)).toBe(true);
        }

        // Every column should validate against its clue
        for (let c = 0; c < 7; c++) {
          const colLine: CellState[] = [];
          for (let r = 0; r < 7; r++) {
            colLine.push(player[r]![c]!);
          }
          expect(validateLine(colLine, colClues[c]!)).toBe(true);
        }

        // Full solution check
        expect(checkSolution(player, solution)).toBe(true);
      }
    });
  });
});
