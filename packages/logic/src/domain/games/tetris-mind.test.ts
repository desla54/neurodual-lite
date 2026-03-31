/**
 * Tests for Tetris Mind game logic
 *
 * Mental rotation of tetromino pieces: rotations, mirrors, trial generation.
 */

import { describe, it, expect } from 'bun:test';
import {
  type PieceCells,
  TETROMINOES,
  TETROMINO_NAMES,
  normalizeCells,
  rotateCW,
  mirrorH,
  sameCells,
  getAllRotations,
  applyRotations,
  getBoundingBox,
  generateTrial,
} from './tetris-mind';

// =============================================================================
// Helpers
// =============================================================================

/** Count total cells in a piece */
function cellCount(cells: PieceCells): number {
  return cells.length;
}

/** Assert piece is normalized (min row/col = 0, sorted) */
function assertNormalized(cells: PieceCells): void {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  expect(minR).toBe(0);
  expect(minC).toBe(0);
  // Check sorted
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]!;
    const curr = cells[i]!;
    const cmp = prev[0] - curr[0] || prev[1] - curr[1];
    expect(cmp).toBeLessThan(0);
  }
}

// =============================================================================
// Tetromino Definitions
// =============================================================================

describe('Tetromino definitions', () => {
  it('has exactly 7 standard tetrominoes', () => {
    expect(TETROMINOES.length).toBe(7);
    expect(TETROMINO_NAMES.length).toBe(7);
  });

  it('each tetromino has exactly 4 cells', () => {
    for (let i = 0; i < TETROMINOES.length; i++) {
      expect(cellCount(TETROMINOES[i] as PieceCells)).toBe(4);
    }
  });

  it('all cells have non-negative coordinates', () => {
    for (const piece of TETROMINOES) {
      for (const [r, c] of piece) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('no two tetrominoes are the same shape', () => {
    for (let i = 0; i < TETROMINOES.length; i++) {
      for (let j = i + 1; j < TETROMINOES.length; j++) {
        expect(sameCells(TETROMINOES[i] as PieceCells, TETROMINOES[j] as PieceCells)).toBe(false);
      }
    }
  });

  it('I piece is a 1x4 horizontal line', () => {
    const I = TETROMINOES[0] as PieceCells;
    const bb = getBoundingBox(I);
    expect(bb.rows).toBe(1);
    expect(bb.cols).toBe(4);
  });

  it('O piece is a 2x2 square', () => {
    const O = TETROMINOES[1] as PieceCells;
    const bb = getBoundingBox(O);
    expect(bb.rows).toBe(2);
    expect(bb.cols).toBe(2);
  });

  it('T piece has correct shape', () => {
    const T = TETROMINOES[2] as PieceCells;
    const bb = getBoundingBox(T);
    expect(bb.rows).toBe(2);
    expect(bb.cols).toBe(3);
  });
});

// =============================================================================
// normalizeCells
// =============================================================================

describe('normalizeCells', () => {
  it('shifts cells to origin', () => {
    const cells: PieceCells = [
      [3, 5],
      [3, 6],
      [4, 5],
      [4, 6],
    ];
    const norm = normalizeCells(cells);
    assertNormalized(norm);
    expect(norm).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it('sorts cells by row then column', () => {
    const cells: PieceCells = [
      [1, 0],
      [0, 2],
      [0, 0],
      [0, 1],
    ];
    const norm = normalizeCells(cells);
    expect(norm[0]).toEqual([0, 0]);
    expect(norm[1]).toEqual([0, 1]);
    expect(norm[2]).toEqual([0, 2]);
    expect(norm[3]).toEqual([1, 0]);
  });

  it('handles negative coordinates', () => {
    const cells: PieceCells = [
      [-2, -3],
      [-2, -2],
      [-1, -3],
      [-1, -2],
    ];
    const norm = normalizeCells(cells);
    assertNormalized(norm);
  });

  it('already normalized cells remain unchanged', () => {
    const cells: PieceCells = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const norm = normalizeCells(cells);
    expect(norm).toEqual(cells);
  });
});

// =============================================================================
// Rotation transforms
// =============================================================================

describe('rotateCW', () => {
  it('rotates I piece from horizontal to vertical', () => {
    const I = TETROMINOES[0] as PieceCells; // horizontal: [[0,0],[0,1],[0,2],[0,3]]
    const rotated = rotateCW(I);
    const bb = getBoundingBox(rotated);
    // After 90 CW, I should become vertical: 4x1
    expect(bb.rows).toBe(4);
    expect(bb.cols).toBe(1);
    assertNormalized(rotated);
  });

  it('rotates T piece correctly', () => {
    const T = TETROMINOES[2] as PieceCells;
    const rotated = rotateCW(T);
    // T rotated 90 CW should still have 4 cells
    expect(cellCount(rotated)).toBe(4);
    assertNormalized(rotated);
    // Should not be the same as original T
    expect(sameCells(T, rotated)).toBe(false);
  });

  it('four rotations return to original', () => {
    for (const piece of TETROMINOES) {
      let current = [...piece] as PieceCells;
      for (let i = 0; i < 4; i++) {
        current = rotateCW(current);
      }
      expect(sameCells(current, piece as PieceCells)).toBe(true);
    }
  });

  it('preserves cell count after rotation', () => {
    for (const piece of TETROMINOES) {
      const rotated = rotateCW(piece as PieceCells);
      expect(cellCount(rotated)).toBe(cellCount(piece as PieceCells));
    }
  });

  it('result is always normalized', () => {
    for (const piece of TETROMINOES) {
      const rotated = rotateCW(piece as PieceCells);
      assertNormalized(rotated);
    }
  });
});

describe('O piece rotation invariance', () => {
  it('O piece looks the same after any rotation', () => {
    const O = TETROMINOES[1] as PieceCells;
    const rotations = getAllRotations(O);
    // O should have only 1 unique rotation
    expect(rotations.length).toBe(1);
  });
});

describe('I piece rotations', () => {
  it('I piece has exactly 2 unique rotations', () => {
    const I = TETROMINOES[0] as PieceCells;
    const rotations = getAllRotations(I);
    expect(rotations.length).toBe(2);
  });

  it('I piece rotations alternate between horizontal and vertical', () => {
    const I = TETROMINOES[0] as PieceCells;
    const r0 = normalizeCells([...I]);
    const r1 = rotateCW(I);
    const bb0 = getBoundingBox(r0);
    const bb1 = getBoundingBox(r1);
    // One should be 1x4, the other 4x1
    expect(bb0.rows * bb0.cols).toBe(4);
    expect(bb1.rows * bb1.cols).toBe(4);
    expect(bb0.rows).not.toBe(bb1.rows);
  });
});

describe('S/Z piece rotations', () => {
  it('S piece has exactly 2 unique rotations', () => {
    const S = TETROMINOES[3] as PieceCells;
    const rotations = getAllRotations(S);
    expect(rotations.length).toBe(2);
  });

  it('Z piece has exactly 2 unique rotations', () => {
    const Z = TETROMINOES[4] as PieceCells;
    const rotations = getAllRotations(Z);
    expect(rotations.length).toBe(2);
  });
});

describe('T/L/J piece rotations', () => {
  it('T piece has exactly 4 unique rotations', () => {
    const T = TETROMINOES[2] as PieceCells;
    const rotations = getAllRotations(T);
    expect(rotations.length).toBe(4);
  });

  it('L piece has exactly 4 unique rotations', () => {
    const L = TETROMINOES[5] as PieceCells;
    const rotations = getAllRotations(L);
    expect(rotations.length).toBe(4);
  });

  it('J piece has exactly 4 unique rotations', () => {
    const J = TETROMINOES[6] as PieceCells;
    const rotations = getAllRotations(J);
    expect(rotations.length).toBe(4);
  });
});

// =============================================================================
// applyRotations
// =============================================================================

describe('applyRotations', () => {
  it('0 rotations returns normalized original', () => {
    const T = TETROMINOES[2] as PieceCells;
    const result = applyRotations(T, 0);
    expect(sameCells(result, T)).toBe(true);
  });

  it('1 rotation equals single rotateCW', () => {
    const T = TETROMINOES[2] as PieceCells;
    const r1 = applyRotations(T, 1);
    const cw = rotateCW(T);
    expect(sameCells(r1, cw)).toBe(true);
  });

  it('4 rotations returns to original', () => {
    const L = TETROMINOES[5] as PieceCells;
    const r4 = applyRotations(L, 4);
    expect(sameCells(r4, L)).toBe(true);
  });

  it('result is always normalized', () => {
    const J = TETROMINOES[6] as PieceCells;
    for (let n = 0; n <= 4; n++) {
      const result = applyRotations(J, n);
      assertNormalized(result);
    }
  });
});

// =============================================================================
// Mirror transform
// =============================================================================

describe('mirrorH', () => {
  it('mirrors I piece horizontally (no change for horizontal I)', () => {
    const I = TETROMINOES[0] as PieceCells; // [[0,0],[0,1],[0,2],[0,3]]
    const mirrored = mirrorH(I);
    // Horizontal I mirrored is still horizontal I (symmetric)
    expect(sameCells(I, mirrored)).toBe(true);
  });

  it('mirrors O piece (no change, symmetric)', () => {
    const O = TETROMINOES[1] as PieceCells;
    const mirrored = mirrorH(O);
    expect(sameCells(O, mirrored)).toBe(true);
  });

  it('mirrors T piece (no change, symmetric)', () => {
    const T = TETROMINOES[2] as PieceCells;
    const mirrored = mirrorH(T);
    // T in its base orientation [[0,0],[0,1],[0,2],[1,1]] is symmetric
    expect(sameCells(T, mirrored)).toBe(true);
  });

  it('mirrors S piece to produce Z piece', () => {
    const S = TETROMINOES[3] as PieceCells;
    const Z = TETROMINOES[4] as PieceCells;
    const mirroredS = mirrorH(S);
    expect(sameCells(mirroredS, Z)).toBe(true);
  });

  it('mirrors Z piece to produce S piece', () => {
    const Z = TETROMINOES[4] as PieceCells;
    const S = TETROMINOES[3] as PieceCells;
    const mirroredZ = mirrorH(Z);
    expect(sameCells(mirroredZ, S)).toBe(true);
  });

  it('mirrors L piece to produce J piece', () => {
    const L = TETROMINOES[5] as PieceCells;
    const J = TETROMINOES[6] as PieceCells;
    const mirroredL = mirrorH(L);
    expect(sameCells(mirroredL, J)).toBe(true);
  });

  it('mirrors J piece to produce L piece', () => {
    const J = TETROMINOES[6] as PieceCells;
    const L = TETROMINOES[5] as PieceCells;
    const mirroredJ = mirrorH(J);
    expect(sameCells(mirroredJ, L)).toBe(true);
  });

  it('double mirror returns to original', () => {
    for (const piece of TETROMINOES) {
      const doubled = mirrorH(mirrorH(piece as PieceCells));
      expect(sameCells(doubled, piece as PieceCells)).toBe(true);
    }
  });

  it('preserves cell count', () => {
    for (const piece of TETROMINOES) {
      const mirrored = mirrorH(piece as PieceCells);
      expect(cellCount(mirrored)).toBe(cellCount(piece as PieceCells));
    }
  });

  it('result is always normalized', () => {
    for (const piece of TETROMINOES) {
      const mirrored = mirrorH(piece as PieceCells);
      assertNormalized(mirrored);
    }
  });
});

// =============================================================================
// sameCells
// =============================================================================

describe('sameCells', () => {
  it('identical pieces match', () => {
    const a: PieceCells = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    expect(sameCells(a, a)).toBe(true);
  });

  it('same shape at different positions match after normalization', () => {
    const a: PieceCells = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const b: PieceCells = [
      [5, 5],
      [5, 6],
      [6, 5],
      [6, 6],
    ];
    expect(sameCells(a, b)).toBe(true);
  });

  it('different shapes do not match', () => {
    const I = TETROMINOES[0] as PieceCells;
    const O = TETROMINOES[1] as PieceCells;
    expect(sameCells(I, O)).toBe(false);
  });

  it('different cell counts do not match', () => {
    const a: PieceCells = [
      [0, 0],
      [0, 1],
    ];
    const b: PieceCells = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    expect(sameCells(a, b)).toBe(false);
  });

  it('order of cells does not matter', () => {
    const a: PieceCells = [
      [1, 1],
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    const b: PieceCells = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    expect(sameCells(a, b)).toBe(true);
  });
});

// =============================================================================
// getAllRotations
// =============================================================================

describe('getAllRotations', () => {
  it('returns only unique rotations', () => {
    for (const piece of TETROMINOES) {
      const rotations = getAllRotations(piece as PieceCells);
      for (let i = 0; i < rotations.length; i++) {
        for (let j = i + 1; j < rotations.length; j++) {
          expect(sameCells(rotations[i]!, rotations[j]!)).toBe(false);
        }
      }
    }
  });

  it('each rotation has 4 cells', () => {
    for (const piece of TETROMINOES) {
      const rotations = getAllRotations(piece as PieceCells);
      for (const rot of rotations) {
        expect(cellCount(rot)).toBe(4);
      }
    }
  });

  it('first rotation is the normalized original', () => {
    for (const piece of TETROMINOES) {
      const rotations = getAllRotations(piece as PieceCells);
      expect(sameCells(rotations[0]!, piece as PieceCells)).toBe(true);
    }
  });
});

// =============================================================================
// getBoundingBox
// =============================================================================

describe('getBoundingBox', () => {
  it('I piece is 1x4', () => {
    expect(getBoundingBox(TETROMINOES[0] as PieceCells)).toEqual({ rows: 1, cols: 4 });
  });

  it('O piece is 2x2', () => {
    expect(getBoundingBox(TETROMINOES[1] as PieceCells)).toEqual({ rows: 2, cols: 2 });
  });

  it('T piece is 2x3', () => {
    expect(getBoundingBox(TETROMINOES[2] as PieceCells)).toEqual({ rows: 2, cols: 3 });
  });

  it('rotated I piece is 4x1', () => {
    const rotatedI = rotateCW(TETROMINOES[0] as PieceCells);
    expect(getBoundingBox(rotatedI)).toEqual({ rows: 4, cols: 1 });
  });
});

// =============================================================================
// Trial Generation
// =============================================================================

describe('generateTrial', () => {
  describe('common invariants', () => {
    it('returns exactly 4 candidates', () => {
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(1);
        expect(trial.candidates.length).toBe(4);
      }
    });

    it('correctIdx is within range [0,3]', () => {
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(1);
        expect(trial.correctIdx).toBeGreaterThanOrEqual(0);
        expect(trial.correctIdx).toBeLessThanOrEqual(3);
      }
    });

    it('correct candidate matches the hole shape', () => {
      for (let i = 0; i < 30; i++) {
        const trial = generateTrial(1);
        const correct = trial.candidates[trial.correctIdx]!;
        expect(sameCells(correct, trial.holeCells)).toBe(true);
      }
    });

    it('each candidate has exactly 4 cells', () => {
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(2);
        for (const candidate of trial.candidates) {
          expect(cellCount(candidate)).toBe(4);
        }
      }
    });

    it('distractors do not match the hole', () => {
      for (let i = 0; i < 30; i++) {
        const trial = generateTrial(2);
        for (let j = 0; j < trial.candidates.length; j++) {
          if (j !== trial.correctIdx) {
            // Distractors should NOT match the hole
            expect(sameCells(trial.candidates[j]!, trial.holeCells)).toBe(false);
          }
        }
      }
    });

    it('holeCells are normalized', () => {
      for (let i = 0; i < 10; i++) {
        const trial = generateTrial(1);
        assertNormalized(trial.holeCells);
      }
    });
  });

  describe('nLevel 1 — 0 or 90 degree rotation only', () => {
    it('correct piece is a rotation of some base tetromino', () => {
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(1);
        const correct = trial.candidates[trial.correctIdx]!;
        // Must match at least one rotation of at least one base tetromino
        let matchesAny = false;
        for (const base of TETROMINOES) {
          const rotations = getAllRotations(base as PieceCells);
          if (rotations.some((r) => sameCells(r, correct))) {
            matchesAny = true;
            break;
          }
        }
        expect(matchesAny).toBe(true);
      }
    });
  });

  describe('nLevel 2 — any rotation (0/90/180/270)', () => {
    it('generates valid trials', () => {
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(2);
        expect(trial.candidates.length).toBe(4);
        const correct = trial.candidates[trial.correctIdx]!;
        expect(sameCells(correct, trial.holeCells)).toBe(true);
      }
    });
  });

  describe('nLevel 3 — rotation + mirror flip', () => {
    it('generates valid trials with potential mirrors', () => {
      for (let i = 0; i < 30; i++) {
        const trial = generateTrial(3);
        expect(trial.candidates.length).toBe(4);
        const correct = trial.candidates[trial.correctIdx]!;
        expect(sameCells(correct, trial.holeCells)).toBe(true);
      }
    });

    it('correct piece is a rotation or mirror of some base tetromino', () => {
      for (let i = 0; i < 30; i++) {
        const trial = generateTrial(3);
        const correct = trial.candidates[trial.correctIdx]!;
        let matchesAny = false;
        for (const base of TETROMINOES) {
          const rotations = getAllRotations(base as PieceCells);
          const mirrorRotations = getAllRotations(mirrorH(base as PieceCells));
          const allVariants = [...rotations, ...mirrorRotations];
          if (allVariants.some((v) => sameCells(v, correct))) {
            matchesAny = true;
            break;
          }
        }
        expect(matchesAny).toBe(true);
      }
    });
  });
});

// =============================================================================
// Scoring (accuracy-based)
// =============================================================================

describe('scoring', () => {
  it('perfect accuracy when all correct', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      correct: true,
      responseTimeMs: 500 + i * 10,
    }));
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    expect(accuracy).toBe(100);
  });

  it('0% accuracy when all incorrect', () => {
    const results = Array.from({ length: 10 }, () => ({
      correct: false,
      responseTimeMs: 1000,
    }));
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    expect(accuracy).toBe(0);
  });

  it('50% accuracy when half correct', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      correct: i < 5,
      responseTimeMs: 800,
    }));
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctCount / results.length) * 100);
    expect(accuracy).toBe(50);
  });

  it('mean RT is average of all response times', () => {
    const results = [
      { correct: true, responseTimeMs: 200 },
      { correct: false, responseTimeMs: 400 },
      { correct: true, responseTimeMs: 600 },
    ];
    const meanRt = Math.round(results.reduce((s, r) => s + r.responseTimeMs, 0) / results.length);
    expect(meanRt).toBe(400);
  });

  it('empty results yields 0% accuracy and 0 mean RT', () => {
    const results: { correct: boolean; responseTimeMs: number }[] = [];
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
    const meanRt =
      results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.responseTimeMs, 0) / results.length)
        : 0;
    expect(accuracy).toBe(0);
    expect(meanRt).toBe(0);
  });
});
