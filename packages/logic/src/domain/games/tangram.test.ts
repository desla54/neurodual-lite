/**
 * Tangram — pure game logic tests
 *
 * Tests piece definitions, rotation, collision detection,
 * placement validation, solution validation, piece generation,
 * drag offset, and edge cases.
 */

import { describe, it, expect } from 'bun:test';
import {
  PIECES,
  GRID_SIZE,
  rotateCells,
  applyRotation,
  getBounds,
  cellKey,
  isWithinBounds,
  hasOverlap,
  computeAbsoluteCells,
  isValidPlacement,
  buildOccupiedSet,
  hasPlacementOverlaps,
  isSolved,
  getPiecePool,
  getEligiblePieces,
  type PlacedPiece,
} from './tangram';

// =============================================================================
// Helpers
// =============================================================================

// =============================================================================
// 1. Piece Definitions
// =============================================================================

describe('piece definitions', () => {
  it('has 8 pieces in the catalog', () => {
    expect(PIECES.length).toBe(8);
  });

  it('every piece has a non-empty name', () => {
    for (const p of PIECES) {
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('every piece has at least 2 cells', () => {
    for (const p of PIECES) {
      expect(p.cells.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('piece sizes range from 2 to 5 cells', () => {
    const sizes = PIECES.map((p) => p.cells.length);
    expect(Math.min(...sizes)).toBe(2);
    expect(Math.max(...sizes)).toBe(5);
  });

  it('pieces have cells starting at (0,0) origin', () => {
    for (const p of PIECES) {
      const minR = Math.min(...p.cells.map(([r]) => r));
      const minC = Math.min(...p.cells.map(([, c]) => c));
      expect(minR).toBe(0);
      expect(minC).toBe(0);
    }
  });

  it('Domino is a 1x2 piece', () => {
    const domino = PIECES.find((p) => p.name === 'Domino')!;
    expect(domino.cells).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('Tet-T is a T-shaped tetromino', () => {
    const tetT = PIECES.find((p) => p.name === 'Tet-T')!;
    expect(tetT.cells.length).toBe(4);
    const bounds = getBounds(tetT.cells);
    expect(bounds).toEqual({ rows: 2, cols: 3 });
  });

  it('Pent-P has 5 cells (pentomino)', () => {
    const pentP = PIECES.find((p) => p.name === 'Pent-P')!;
    expect(pentP.cells.length).toBe(5);
  });

  it('no piece has duplicate cells', () => {
    for (const p of PIECES) {
      const keys = p.cells.map(([r, c]) => cellKey(r, c));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

// =============================================================================
// 2. Rotation
// =============================================================================

describe('rotation', () => {
  it('rotates a horizontal domino to vertical', () => {
    const domino: [number, number][] = [
      [0, 0],
      [0, 1],
    ];
    const rotated = rotateCells(domino);
    const bounds = getBounds(rotated);
    expect(bounds).toEqual({ rows: 2, cols: 1 });
    expect(rotated.length).toBe(2);
  });

  it('four rotations return to original shape', () => {
    for (const piece of PIECES) {
      const r4 = applyRotation(piece.cells, 4);
      // Normalize both for comparison
      const original = [...piece.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const rotated = [...r4].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(rotated).toEqual(original);
    }
  });

  it('rotation preserves cell count', () => {
    for (const piece of PIECES) {
      for (let r = 0; r < 4; r++) {
        const rotated = applyRotation(piece.cells, r);
        expect(rotated.length).toBe(piece.cells.length);
      }
    }
  });

  it('rotated cells are normalized to (0,0) origin', () => {
    for (const piece of PIECES) {
      for (let r = 0; r < 4; r++) {
        const rotated = applyRotation(piece.cells, r);
        const minR = Math.min(...rotated.map(([row]) => row));
        const minC = Math.min(...rotated.map(([, col]) => col));
        expect(minR).toBe(0);
        expect(minC).toBe(0);
      }
    }
  });

  it('rotation 0 returns identical cells', () => {
    for (const piece of PIECES) {
      const r0 = applyRotation(piece.cells, 0);
      expect(r0).toEqual(piece.cells);
    }
  });

  it('Tri-I (horizontal line) becomes vertical after 1 rotation', () => {
    const triI = PIECES.find((p) => p.name === 'Tri-I')!;
    const rotated = applyRotation(triI.cells, 1);
    const bounds = getBounds(rotated);
    expect(bounds).toEqual({ rows: 3, cols: 1 });
  });

  it('Tet-I bounding box swaps dimensions on rotation', () => {
    const tetI = PIECES.find((p) => p.name === 'Tet-I')!;
    const b0 = getBounds(applyRotation(tetI.cells, 0));
    const b1 = getBounds(applyRotation(tetI.cells, 1));
    expect(b0).toEqual({ rows: 1, cols: 4 });
    expect(b1).toEqual({ rows: 4, cols: 1 });
  });

  it('rotated cells have no duplicates', () => {
    for (const piece of PIECES) {
      for (let r = 0; r < 4; r++) {
        const rotated = applyRotation(piece.cells, r);
        const keys = rotated.map(([row, col]) => cellKey(row, col));
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});

// =============================================================================
// 3. Collision Detection
// =============================================================================

describe('collision detection', () => {
  it('detects overlap when cells share a position', () => {
    const occupied = new Set<string>([cellKey(2, 3), cellKey(2, 4)]);
    const cells: [number, number][] = [
      [2, 3],
      [2, 4],
    ];
    expect(hasOverlap(cells, occupied)).toBe(true);
  });

  it('detects partial overlap', () => {
    const occupied = new Set<string>([cellKey(0, 0)]);
    const cells: [number, number][] = [
      [0, 0],
      [0, 1],
    ];
    expect(hasOverlap(cells, occupied)).toBe(true);
  });

  it('returns false when no cells overlap', () => {
    const occupied = new Set<string>([cellKey(0, 0), cellKey(0, 1)]);
    const cells: [number, number][] = [
      [1, 0],
      [1, 1],
    ];
    expect(hasOverlap(cells, occupied)).toBe(false);
  });

  it('returns false when occupied set is empty', () => {
    const occupied = new Set<string>();
    const cells: [number, number][] = [
      [3, 3],
      [3, 4],
    ];
    expect(hasOverlap(cells, occupied)).toBe(false);
  });
});

// =============================================================================
// 4. Placement Validation
// =============================================================================

describe('placement validation', () => {
  it('accepts piece fully within grid', () => {
    const cells: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    expect(isWithinBounds(cells)).toBe(true);
  });

  it('rejects piece extending below grid', () => {
    const cells: [number, number][] = [
      [7, 0],
      [8, 0],
    ];
    expect(isWithinBounds(cells)).toBe(false);
  });

  it('rejects piece extending right of grid', () => {
    const cells: [number, number][] = [
      [0, 7],
      [0, 8],
    ];
    expect(isWithinBounds(cells)).toBe(false);
  });

  it('rejects piece with negative coordinates', () => {
    const cells: [number, number][] = [
      [-1, 0],
      [0, 0],
    ];
    expect(isWithinBounds(cells)).toBe(false);
  });

  it('accepts piece at bottom-right corner of grid', () => {
    const cells: [number, number][] = [
      [6, 6],
      [6, 7],
      [7, 6],
      [7, 7],
    ];
    expect(isWithinBounds(cells)).toBe(true);
  });

  it('isValidPlacement checks both bounds and overlap', () => {
    const occupied = new Set<string>([cellKey(0, 0)]);
    // Overlapping
    const cells1: [number, number][] = [[0, 0]];
    expect(isValidPlacement(cells1, occupied)).toBe(false);
    // Out of bounds
    const cells2: [number, number][] = [[8, 0]];
    expect(isValidPlacement(cells2, new Set())).toBe(false);
    // Valid
    const cells3: [number, number][] = [[1, 1]];
    expect(isValidPlacement(cells3, occupied)).toBe(true);
  });

  it('computeAbsoluteCells applies rotation and offset', () => {
    const domino: [number, number][] = [
      [0, 0],
      [0, 1],
    ];
    // No rotation, origin at (3,4)
    const abs = computeAbsoluteCells(domino, 0, [3, 4]);
    expect(abs).toEqual([
      [3, 4],
      [3, 5],
    ]);
  });

  it('computeAbsoluteCells with rotation', () => {
    const domino: [number, number][] = [
      [0, 0],
      [0, 1],
    ];
    // 1 rotation makes it vertical, origin at (2, 2)
    const abs = computeAbsoluteCells(domino, 1, [2, 2]);
    // After rotation: [[0,0],[1,0]], offset by (2,2) → [[2,2],[3,2]]
    expect(abs).toEqual([
      [2, 2],
      [3, 2],
    ]);
  });
});

// =============================================================================
// 5. Solution Validation
// =============================================================================

describe('solution validation', () => {
  it('correctly solves when placed cells exactly match target', () => {
    const target = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(1, 0)]);
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        paletteIdx: 1,
        origin: [1, 0],
        rotation: 0,
        absoluteCells: [[1, 0]],
      },
    ];
    expect(isSolved(placements, target)).toBe(true);
  });

  it('fails when placed cells do not cover all target cells', () => {
    const target = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(1, 0)]);
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
    ];
    expect(isSolved(placements, target)).toBe(false);
  });

  it('fails when placed cells extend beyond target', () => {
    const target = new Set([cellKey(0, 0), cellKey(0, 1)]);
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
          [1, 0],
        ],
      },
    ];
    expect(isSolved(placements, target)).toBe(false);
  });

  it('fails when pieces overlap each other', () => {
    const target = new Set([cellKey(0, 0), cellKey(0, 1)]);
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        paletteIdx: 1,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [[0, 0]],
      },
    ];
    expect(isSolved(placements, target)).toBe(false);
  });

  it('empty placements do not solve a non-empty target', () => {
    const target = new Set([cellKey(0, 0)]);
    expect(isSolved([], target)).toBe(false);
  });

  it('empty placements solve an empty target', () => {
    const target = new Set<string>();
    expect(isSolved([], target)).toBe(true);
  });
});

// =============================================================================
// 6. Piece Generation / Pool
// =============================================================================

describe('piece generation', () => {
  it('nLevel 1 pool uses 2-3 cell pieces', () => {
    const pool = getPiecePool(1);
    expect(pool.minCellSize).toBe(2);
    expect(pool.maxCellSize).toBe(3);
    expect(pool.count).toBe(3);
  });

  it('nLevel 2 pool uses 2-4 cell pieces', () => {
    const pool = getPiecePool(2);
    expect(pool.minCellSize).toBe(2);
    expect(pool.maxCellSize).toBe(4);
    expect(pool.count).toBe(5);
  });

  it('nLevel 3 pool uses 3-5 cell pieces', () => {
    const pool = getPiecePool(3);
    expect(pool.minCellSize).toBe(3);
    expect(pool.maxCellSize).toBe(5);
    expect(pool.count).toBe(6);
  });

  it('getEligiblePieces returns only pieces within size range', () => {
    const eligible1 = getEligiblePieces(1);
    for (const p of eligible1) {
      expect(p.cells.length).toBeGreaterThanOrEqual(2);
      expect(p.cells.length).toBeLessThanOrEqual(3);
    }
  });

  it('getEligiblePieces for nLevel 1 includes Domino and Tri-* but not Tet-*', () => {
    const eligible = getEligiblePieces(1);
    const names = eligible.map((p) => p.name);
    expect(names).toContain('Domino');
    expect(names).toContain('Tri-I');
    expect(names).toContain('Tri-L');
    expect(names).not.toContain('Tet-I');
    expect(names).not.toContain('Pent-P');
  });

  it('getEligiblePieces for nLevel 3 includes Pent-P but not Domino', () => {
    const eligible = getEligiblePieces(3);
    const names = eligible.map((p) => p.name);
    expect(names).toContain('Pent-P');
    expect(names).not.toContain('Domino');
  });

  it('every nLevel produces at least 1 eligible piece', () => {
    for (let n = 1; n <= 3; n++) {
      const eligible = getEligiblePieces(n);
      expect(eligible.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// 7. Drag Offset / Absolute Cell Computation
// =============================================================================

describe('drag offset / absolute cells', () => {
  it('computeAbsoluteCells preserves piece shape relative to origin', () => {
    const triL = PIECES.find((p) => p.name === 'Tri-L')!;
    const abs = computeAbsoluteCells(triL.cells, 0, [3, 5]);
    expect(abs).toEqual([
      [3, 5],
      [4, 5],
      [4, 6],
    ]);
  });

  it('different origins produce different absolute positions', () => {
    const domino = PIECES.find((p) => p.name === 'Domino')!;
    const abs1 = computeAbsoluteCells(domino.cells, 0, [0, 0]);
    const abs2 = computeAbsoluteCells(domino.cells, 0, [4, 4]);
    expect(abs1).not.toEqual(abs2);
    expect(abs2).toEqual([
      [4, 4],
      [4, 5],
    ]);
  });

  it('origin shift is additive', () => {
    const cells: [number, number][] = [[0, 0]];
    const abs = computeAbsoluteCells(cells, 0, [5, 7]);
    expect(abs).toEqual([[5, 7]]);
  });

  it('rotation + origin produce correct combined result for Tet-L', () => {
    const tetL = PIECES.find((p) => p.name === 'Tet-L')!;
    // Rotation 1 of Tet-L: [[0,0],[1,0],[2,0],[2,1]] → rotate CW
    // (r,c) → (c,-r) → (0,0),(0,-1),(0,-2),(1,-2) → normalize → (0,2),(0,1),(0,0),(1,0)
    const rotated = applyRotation(tetL.cells, 1);
    const abs = computeAbsoluteCells(tetL.cells, 1, [2, 1]);
    // Each absolute cell = origin + rotated offset
    for (let i = 0; i < rotated.length; i++) {
      expect(abs[i]![0]).toBe(2 + rotated[i]![0]);
      expect(abs[i]![1]).toBe(1 + rotated[i]![1]);
    }
  });
});

// =============================================================================
// 8. Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('piece placed at (0,0) with no rotation stays at top-left', () => {
    const domino = PIECES.find((p) => p.name === 'Domino')!;
    const abs = computeAbsoluteCells(domino.cells, 0, [0, 0]);
    expect(abs).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(isWithinBounds(abs)).toBe(true);
  });

  it('piece at grid boundary is valid', () => {
    // Domino at row 7, cols 6-7 (bottom-right edge)
    const abs: [number, number][] = [
      [7, 6],
      [7, 7],
    ];
    expect(isWithinBounds(abs)).toBe(true);
  });

  it('piece one cell beyond grid is invalid', () => {
    const abs: [number, number][] = [
      [7, 7],
      [7, 8],
    ];
    expect(isWithinBounds(abs)).toBe(false);
  });

  it('rotating a piece at edge may push it out of bounds', () => {
    const tetI = PIECES.find((p) => p.name === 'Tet-I')!;
    // Horizontal Tet-I at (0,5): cells at (0,5),(0,6),(0,7),(0,8) — out of bounds at col 8
    const abs = computeAbsoluteCells(tetI.cells, 0, [0, 5]);
    expect(isWithinBounds(abs)).toBe(false);
    // Rotated (vertical) at same origin: cells at (0,5),(1,5),(2,5),(3,5) — valid
    const absRotated = computeAbsoluteCells(tetI.cells, 1, [0, 5]);
    expect(isWithinBounds(absRotated)).toBe(true);
  });

  it('buildOccupiedSet aggregates all cells from multiple placements', () => {
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        paletteIdx: 1,
        origin: [2, 2],
        rotation: 0,
        absoluteCells: [
          [2, 2],
          [2, 3],
          [3, 2],
        ],
      },
    ];
    const occ = buildOccupiedSet(placements);
    expect(occ.size).toBe(5);
    expect(occ.has(cellKey(0, 0))).toBe(true);
    expect(occ.has(cellKey(2, 3))).toBe(true);
    expect(occ.has(cellKey(1, 1))).toBe(false);
  });

  it('hasPlacementOverlaps detects when two placements share a cell', () => {
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        paletteIdx: 1,
        origin: [0, 1],
        rotation: 0,
        absoluteCells: [
          [0, 1],
          [0, 2],
        ],
      },
    ];
    expect(hasPlacementOverlaps(placements)).toBe(true);
  });

  it('hasPlacementOverlaps returns false for non-overlapping placements', () => {
    const placements: PlacedPiece[] = [
      {
        paletteIdx: 0,
        origin: [0, 0],
        rotation: 0,
        absoluteCells: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        paletteIdx: 1,
        origin: [1, 0],
        rotation: 0,
        absoluteCells: [
          [1, 0],
          [1, 1],
        ],
      },
    ];
    expect(hasPlacementOverlaps(placements)).toBe(false);
  });

  it('cellKey produces unique keys for distinct coordinates', () => {
    expect(cellKey(0, 0)).not.toBe(cellKey(0, 1));
    expect(cellKey(1, 2)).toBe('1,2');
    expect(cellKey(0, 12)).not.toBe(cellKey(0, 1)); // no ambiguity with string concat
  });

  it('GRID_SIZE is 8', () => {
    expect(GRID_SIZE).toBe(8);
  });
});
