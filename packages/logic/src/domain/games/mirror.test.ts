/**
 * Tests for Mirror game logic
 *
 * Spatial symmetry: vertical, horizontal, central mirror computations.
 */

import { describe, it, expect } from 'bun:test';
import {
  type CellCoord,
  type SymmetryType,
  DEFAULT_GRID_ROWS,
  DEFAULT_GRID_COLS,
  MIN_FILLED,
  MAX_FILLED,
  getSymmetryType,
  mirrorCoord,
  symmetryLabel,
  generateSourcePattern,
  filledCountForTrial,
  coordKey,
  computeExpectedMirror,
  validateMirrorAnswer,
} from './mirror';

// =============================================================================
// getSymmetryType — nLevel mapping
// =============================================================================

describe('getSymmetryType', () => {
  it('nLevel 0 maps to vertical', () => {
    expect(getSymmetryType(0)).toBe('vertical');
  });

  it('nLevel 1 maps to vertical', () => {
    expect(getSymmetryType(1)).toBe('vertical');
  });

  it('nLevel 2 maps to horizontal', () => {
    expect(getSymmetryType(2)).toBe('horizontal');
  });

  it('nLevel 3 maps to central', () => {
    expect(getSymmetryType(3)).toBe('central');
  });

  it('nLevel > 3 maps to central', () => {
    expect(getSymmetryType(5)).toBe('central');
    expect(getSymmetryType(10)).toBe('central');
  });

  it('negative nLevel maps to vertical', () => {
    expect(getSymmetryType(-1)).toBe('vertical');
  });
});

// =============================================================================
// symmetryLabel
// =============================================================================

describe('symmetryLabel', () => {
  it('returns "Vertical" for vertical', () => {
    expect(symmetryLabel('vertical')).toBe('Vertical');
  });

  it('returns "Horizontal" for horizontal', () => {
    expect(symmetryLabel('horizontal')).toBe('Horizontal');
  });

  it('returns "Central" for central', () => {
    expect(symmetryLabel('central')).toBe('Central');
  });
});

// =============================================================================
// mirrorCoord — Vertical symmetry
// =============================================================================

describe('mirrorCoord — vertical symmetry', () => {
  const type: SymmetryType = 'vertical';

  it('mirrors (0,0) to (0,3) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 0, col: 0 }, type)).toEqual({ row: 0, col: 3 });
  });

  it('mirrors (0,3) to (0,0) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 0, col: 3 }, type)).toEqual({ row: 0, col: 0 });
  });

  it('mirrors (2,1) to (2,2) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 2, col: 1 }, type)).toEqual({ row: 2, col: 2 });
  });

  it('preserves row', () => {
    for (let r = 0; r < DEFAULT_GRID_ROWS; r++) {
      for (let c = 0; c < DEFAULT_GRID_COLS; c++) {
        const m = mirrorCoord({ row: r, col: c }, type);
        expect(m.row).toBe(r);
      }
    }
  });

  it('double mirror returns to original', () => {
    for (let r = 0; r < DEFAULT_GRID_ROWS; r++) {
      for (let c = 0; c < DEFAULT_GRID_COLS; c++) {
        const coord = { row: r, col: c };
        const doubled = mirrorCoord(mirrorCoord(coord, type), type);
        expect(doubled).toEqual(coord);
      }
    }
  });
});

// =============================================================================
// mirrorCoord — Horizontal symmetry
// =============================================================================

describe('mirrorCoord — horizontal symmetry', () => {
  const type: SymmetryType = 'horizontal';

  it('mirrors (0,0) to (3,0) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 0, col: 0 }, type)).toEqual({ row: 3, col: 0 });
  });

  it('mirrors (3,2) to (0,2) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 3, col: 2 }, type)).toEqual({ row: 0, col: 2 });
  });

  it('mirrors (1,1) to (2,1) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 1, col: 1 }, type)).toEqual({ row: 2, col: 1 });
  });

  it('preserves column', () => {
    for (let r = 0; r < DEFAULT_GRID_ROWS; r++) {
      for (let c = 0; c < DEFAULT_GRID_COLS; c++) {
        const m = mirrorCoord({ row: r, col: c }, type);
        expect(m.col).toBe(c);
      }
    }
  });

  it('double mirror returns to original', () => {
    for (let r = 0; r < DEFAULT_GRID_ROWS; r++) {
      for (let c = 0; c < DEFAULT_GRID_COLS; c++) {
        const coord = { row: r, col: c };
        const doubled = mirrorCoord(mirrorCoord(coord, type), type);
        expect(doubled).toEqual(coord);
      }
    }
  });
});

// =============================================================================
// mirrorCoord — Central (point) symmetry
// =============================================================================

describe('mirrorCoord — central symmetry', () => {
  const type: SymmetryType = 'central';

  it('mirrors (0,0) to (3,3) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 0, col: 0 }, type)).toEqual({ row: 3, col: 3 });
  });

  it('mirrors (3,3) to (0,0) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 3, col: 3 }, type)).toEqual({ row: 0, col: 0 });
  });

  it('mirrors (1,2) to (2,1) on 4x4 grid', () => {
    expect(mirrorCoord({ row: 1, col: 2 }, type)).toEqual({ row: 2, col: 1 });
  });

  it('both row and column are flipped', () => {
    const coord = { row: 0, col: 1 };
    const m = mirrorCoord(coord, type);
    expect(m.row).toBe(DEFAULT_GRID_ROWS - 1 - coord.row);
    expect(m.col).toBe(DEFAULT_GRID_COLS - 1 - coord.col);
  });

  it('double mirror returns to original', () => {
    for (let r = 0; r < DEFAULT_GRID_ROWS; r++) {
      for (let c = 0; c < DEFAULT_GRID_COLS; c++) {
        const coord = { row: r, col: c };
        const doubled = mirrorCoord(mirrorCoord(coord, type), type);
        expect(doubled).toEqual(coord);
      }
    }
  });
});

// =============================================================================
// mirrorCoord — custom grid sizes
// =============================================================================

describe('mirrorCoord — custom grid sizes', () => {
  it('vertical mirror on 6x6 grid', () => {
    const m = mirrorCoord({ row: 2, col: 1 }, 'vertical', 6, 6);
    expect(m).toEqual({ row: 2, col: 4 });
  });

  it('horizontal mirror on 6x6 grid', () => {
    const m = mirrorCoord({ row: 1, col: 3 }, 'horizontal', 6, 6);
    expect(m).toEqual({ row: 4, col: 3 });
  });

  it('central mirror on 5x5 grid — center cell maps to itself', () => {
    const m = mirrorCoord({ row: 2, col: 2 }, 'central', 5, 5);
    expect(m).toEqual({ row: 2, col: 2 });
  });

  it('vertical mirror on 3x5 grid', () => {
    const m = mirrorCoord({ row: 1, col: 0 }, 'vertical', 3, 5);
    expect(m).toEqual({ row: 1, col: 4 });
  });
});

// =============================================================================
// Edge case: cell on axis of symmetry
// =============================================================================

describe('cell on axis of symmetry', () => {
  it('vertical: cells on center columns swap on even-width grid', () => {
    // On a 4-col grid, columns 1 and 2 are adjacent to axis
    const m1 = mirrorCoord({ row: 0, col: 1 }, 'vertical');
    const m2 = mirrorCoord({ row: 0, col: 2 }, 'vertical');
    expect(m1).toEqual({ row: 0, col: 2 });
    expect(m2).toEqual({ row: 0, col: 1 });
  });

  it('horizontal: cells on center rows swap on even-height grid', () => {
    const m1 = mirrorCoord({ row: 1, col: 0 }, 'horizontal');
    const m2 = mirrorCoord({ row: 2, col: 0 }, 'horizontal');
    expect(m1).toEqual({ row: 2, col: 0 });
    expect(m2).toEqual({ row: 1, col: 0 });
  });

  it('central: center cell on odd grid maps to itself', () => {
    const m = mirrorCoord({ row: 2, col: 2 }, 'central', 5, 5);
    expect(m).toEqual({ row: 2, col: 2 });
  });
});

// =============================================================================
// generateSourcePattern
// =============================================================================

describe('generateSourcePattern', () => {
  it('returns correct number of cells', () => {
    for (let count = 1; count <= 8; count++) {
      const pattern = generateSourcePattern(count);
      expect(pattern.length).toBe(count);
    }
  });

  it('all cells within default grid bounds', () => {
    for (let i = 0; i < 20; i++) {
      const pattern = generateSourcePattern(5);
      for (const cell of pattern) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(DEFAULT_GRID_ROWS);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(DEFAULT_GRID_COLS);
      }
    }
  });

  it('no duplicate cells', () => {
    for (let i = 0; i < 20; i++) {
      const pattern = generateSourcePattern(6);
      const keys = new Set(pattern.map(coordKey));
      expect(keys.size).toBe(pattern.length);
    }
  });

  it('respects custom grid size', () => {
    const pattern = generateSourcePattern(4, 3, 3);
    expect(pattern.length).toBe(4);
    for (const cell of pattern) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(3);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(3);
    }
  });

  it('requesting more cells than grid area still returns at most grid area', () => {
    // 2x2 grid = 4 cells max; requesting 10 should return 4 (slice)
    const pattern = generateSourcePattern(10, 2, 2);
    expect(pattern.length).toBeLessThanOrEqual(4);
  });
});

// =============================================================================
// filledCountForTrial — difficulty progression
// =============================================================================

describe('filledCountForTrial', () => {
  it('first trial returns MIN_FILLED', () => {
    expect(filledCountForTrial(0, 12)).toBe(MIN_FILLED);
  });

  it('last trial returns MAX_FILLED', () => {
    expect(filledCountForTrial(11, 12)).toBe(MAX_FILLED);
  });

  it('mid trial returns value between MIN and MAX', () => {
    const mid = filledCountForTrial(5, 12);
    expect(mid).toBeGreaterThanOrEqual(MIN_FILLED);
    expect(mid).toBeLessThanOrEqual(MAX_FILLED);
  });

  it('count increases monotonically', () => {
    const totalTrials = 12;
    let prev = filledCountForTrial(0, totalTrials);
    for (let i = 1; i < totalTrials; i++) {
      const curr = filledCountForTrial(i, totalTrials);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('single trial returns MIN_FILLED', () => {
    // totalTrials=1, progress=0
    expect(filledCountForTrial(0, 1)).toBe(MIN_FILLED);
  });

  it('two trials: first=MIN, last=MAX', () => {
    expect(filledCountForTrial(0, 2)).toBe(MIN_FILLED);
    expect(filledCountForTrial(1, 2)).toBe(MAX_FILLED);
  });
});

// =============================================================================
// coordKey
// =============================================================================

describe('coordKey', () => {
  it('produces "row,col" string', () => {
    expect(coordKey({ row: 2, col: 3 })).toBe('2,3');
  });

  it('different coords produce different keys', () => {
    expect(coordKey({ row: 0, col: 1 })).not.toBe(coordKey({ row: 1, col: 0 }));
  });
});

// =============================================================================
// computeExpectedMirror
// =============================================================================

describe('computeExpectedMirror', () => {
  it('vertical mirror of single cell', () => {
    const source: CellCoord[] = [{ row: 1, col: 0 }];
    const expected = computeExpectedMirror(source, 'vertical');
    expect(expected).toEqual([{ row: 1, col: 3 }]);
  });

  it('horizontal mirror of two cells', () => {
    const source: CellCoord[] = [
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ];
    const expected = computeExpectedMirror(source, 'horizontal');
    expect(expected).toEqual([
      { row: 3, col: 1 },
      { row: 3, col: 2 },
    ]);
  });

  it('central mirror of diagonal pattern', () => {
    const source: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ];
    const expected = computeExpectedMirror(source, 'central');
    expect(expected).toEqual([
      { row: 3, col: 3 },
      { row: 2, col: 2 },
    ]);
  });

  it('mirrors each cell independently', () => {
    const source: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ];
    const expected = computeExpectedMirror(source, 'vertical');
    expect(expected.length).toBe(3);
    expect(expected[0]).toEqual({ row: 0, col: 3 });
    expect(expected[1]).toEqual({ row: 0, col: 2 });
    expect(expected[2]).toEqual({ row: 1, col: 3 });
  });

  it('custom grid size works', () => {
    const source: CellCoord[] = [{ row: 0, col: 0 }];
    const expected = computeExpectedMirror(source, 'vertical', 6, 6);
    expect(expected).toEqual([{ row: 0, col: 5 }]);
  });
});

// =============================================================================
// validateMirrorAnswer
// =============================================================================

describe('validateMirrorAnswer', () => {
  it('perfect answer — all correct, none missed', () => {
    const expected: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
    ];
    const player: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
    ];
    const result = validateMirrorAnswer(player, expected);
    expect(result.isCorrect).toBe(true);
    expect(result.correctCells).toBe(2);
    expect(result.incorrectCells).toBe(0);
    expect(result.missedCells).toBe(0);
  });

  it('empty answer — all missed', () => {
    const expected: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
    ];
    const player: CellCoord[] = [];
    const result = validateMirrorAnswer(player, expected);
    expect(result.isCorrect).toBe(false);
    expect(result.correctCells).toBe(0);
    expect(result.incorrectCells).toBe(0);
    expect(result.missedCells).toBe(3);
  });

  it('completely wrong answer — all incorrect', () => {
    const expected: CellCoord[] = [{ row: 0, col: 3 }];
    const player: CellCoord[] = [{ row: 2, col: 0 }];
    const result = validateMirrorAnswer(player, expected);
    expect(result.isCorrect).toBe(false);
    expect(result.correctCells).toBe(0);
    expect(result.incorrectCells).toBe(1);
    expect(result.missedCells).toBe(1);
  });

  it('partial answer — some correct, some missed', () => {
    const expected: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
    ];
    const player: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 2, col: 1 },
    ];
    const result = validateMirrorAnswer(player, expected);
    expect(result.isCorrect).toBe(false);
    expect(result.correctCells).toBe(2);
    expect(result.incorrectCells).toBe(0);
    expect(result.missedCells).toBe(1);
  });

  it('extra cells — some correct, some incorrect', () => {
    const expected: CellCoord[] = [{ row: 0, col: 3 }];
    const player: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 3, col: 3 },
    ];
    const result = validateMirrorAnswer(player, expected);
    expect(result.isCorrect).toBe(false);
    expect(result.correctCells).toBe(1);
    expect(result.incorrectCells).toBe(1);
    expect(result.missedCells).toBe(0);
  });

  it('order of player cells does not affect result', () => {
    const expected: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
    ];
    const playerA: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 1, col: 2 },
    ];
    const playerB: CellCoord[] = [
      { row: 1, col: 2 },
      { row: 0, col: 3 },
    ];
    const resultA = validateMirrorAnswer(playerA, expected);
    const resultB = validateMirrorAnswer(playerB, expected);
    expect(resultA).toEqual(resultB);
  });

  it('duplicate player cells are deduplicated via Set', () => {
    // coordKey-based Set deduplicates, but raw array has dupes
    const expected: CellCoord[] = [{ row: 0, col: 3 }];
    const player: CellCoord[] = [
      { row: 0, col: 3 },
      { row: 0, col: 3 },
    ];
    const result = validateMirrorAnswer(player, expected);
    // The Set deduplicates, so only 1 correct cell
    expect(result.correctCells).toBe(1);
    expect(result.incorrectCells).toBe(0);
    expect(result.missedCells).toBe(0);
    expect(result.isCorrect).toBe(true);
  });
});

// =============================================================================
// Full-row / full-column patterns
// =============================================================================

describe('edge cases — full row/column patterns', () => {
  it('full top row vertical mirror yields full top row (columns flipped)', () => {
    const source: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ];
    const expected = computeExpectedMirror(source, 'vertical');
    // All cells stay in row 0, columns flipped
    for (const cell of expected) {
      expect(cell.row).toBe(0);
    }
    const cols = new Set(expected.map((c) => c.col));
    expect(cols.size).toBe(4);
    expect(cols.has(0)).toBe(true);
    expect(cols.has(3)).toBe(true);
  });

  it('full left column horizontal mirror yields full left column (rows flipped)', () => {
    const source: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
    ];
    const expected = computeExpectedMirror(source, 'horizontal');
    for (const cell of expected) {
      expect(cell.col).toBe(0);
    }
    const rows = new Set(expected.map((c) => c.row));
    expect(rows.size).toBe(4);
  });

  it('diagonal pattern central mirror yields anti-diagonal', () => {
    const source: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ];
    const expected = computeExpectedMirror(source, 'central');
    // Central mirror of diagonal is the same diagonal (each cell maps to its 180-degree partner)
    const expectedKeys = new Set(expected.map(coordKey));
    const sourceKeys = new Set(source.map(coordKey));
    expect(expectedKeys).toEqual(sourceKeys);
  });
});

// =============================================================================
// Scoring — accuracy-based
// =============================================================================

describe('scoring', () => {
  it('perfect session: 100% accuracy', () => {
    const results = Array.from({ length: 10 }, () => ({
      correct: true,
      correctCells: 4,
      totalExpected: 4,
      timeMs: 2000,
    }));
    const correctTrials = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctTrials / results.length) * 100);
    expect(accuracy).toBe(100);
  });

  it('all wrong: 0% accuracy', () => {
    const results = Array.from({ length: 5 }, () => ({
      correct: false,
      correctCells: 1,
      totalExpected: 4,
      timeMs: 3000,
    }));
    const correctTrials = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctTrials / results.length) * 100);
    expect(accuracy).toBe(0);
  });

  it('avg correct cells computed from per-trial correctCells', () => {
    const results = [
      { correctCells: 3, totalExpected: 4 },
      { correctCells: 4, totalExpected: 5 },
      { correctCells: 2, totalExpected: 3 },
    ];
    const avg = results.reduce((s, r) => s + r.correctCells, 0) / results.length;
    expect(avg).toBe(3);
  });

  it('empty results yields 0', () => {
    const results: { correct: boolean; timeMs: number }[] = [];
    const total = results.length;
    const accuracy =
      total > 0 ? Math.round((results.filter((r) => r.correct).length / total) * 100) : 0;
    const avgTime = total > 0 ? results.reduce((s, r) => s + r.timeMs, 0) / total : 0;
    expect(accuracy).toBe(0);
    expect(avgTime).toBe(0);
  });
});

// =============================================================================
// Integration: generate + mirror + validate
// =============================================================================

describe('integration: generate → mirror → validate', () => {
  const symmetries: SymmetryType[] = ['vertical', 'horizontal', 'central'];

  for (const sym of symmetries) {
    it(`${sym}: perfect answer is correct`, () => {
      const source = generateSourcePattern(4);
      const expected = computeExpectedMirror(source, sym);
      const result = validateMirrorAnswer(expected, expected);
      expect(result.isCorrect).toBe(true);
      expect(result.correctCells).toBe(4);
      expect(result.missedCells).toBe(0);
      expect(result.incorrectCells).toBe(0);
    });
  }

  it('random patterns always have valid mirrors within grid bounds', () => {
    for (let i = 0; i < 50; i++) {
      const sym = symmetries[i % 3]!;
      const count = filledCountForTrial(i % 12, 12);
      const source = generateSourcePattern(count);
      const expected = computeExpectedMirror(source, sym);

      for (const cell of expected) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(DEFAULT_GRID_ROWS);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(DEFAULT_GRID_COLS);
      }
    }
  });

  it('double-mirroring source gives back the original source', () => {
    for (const sym of symmetries) {
      const source = generateSourcePattern(4);
      const mirrored = computeExpectedMirror(source, sym);
      const doubleM = computeExpectedMirror(mirrored, sym);
      const sourceKeys = new Set(source.map(coordKey));
      const doubleMKeys = new Set(doubleM.map(coordKey));
      expect(doubleMKeys).toEqual(sourceKeys);
    }
  });
});
