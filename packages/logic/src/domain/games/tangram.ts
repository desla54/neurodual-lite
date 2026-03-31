/**
 * Tangram — pure game logic extracted from the training page.
 *
 * Arrange polyomino pieces on a grid to match a target silhouette.
 * - Pieces defined by relative cell offsets
 * - Rotation (90-degree CW increments) with bounding box recalculation
 * - Placement validation (bounds + overlap)
 * - Solution checking (exact target coverage, no gaps, no overlaps)
 */

// =============================================================================
// Types
// =============================================================================

export const GRID_SIZE = 8;

/** A piece is defined by relative cell offsets from (0,0) */
export interface PieceDef {
  name: string;
  cells: [number, number][];
}

export interface PlacedPiece {
  paletteIdx: number;
  origin: [number, number];
  rotation: number;
  absoluteCells: [number, number][];
}

// =============================================================================
// Piece Catalog
// =============================================================================

export const PIECES: PieceDef[] = [
  {
    name: 'Domino',
    cells: [
      [0, 0],
      [0, 1],
    ],
  },
  {
    name: 'Tri-I',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: 'Tri-L',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    name: 'Tet-I',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    name: 'Tet-T',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
  },
  {
    name: 'Tet-L',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
  },
  {
    name: 'Tet-S',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    name: 'Pent-P',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
    ],
  },
];

// =============================================================================
// Cell Key
// =============================================================================

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

// =============================================================================
// Rotation
// =============================================================================

/** Rotate a piece 90 degrees clockwise: (r, c) -> (c, -r), then normalize to (0,0) origin */
export function rotateCells(cells: [number, number][]): [number, number][] {
  const rotated = cells.map(([r, c]) => [c, -r] as [number, number]);
  const minR = Math.min(...rotated.map(([r]) => r));
  const minC = Math.min(...rotated.map(([, c]) => c));
  return rotated.map(([r, c]) => [r - minR, c - minC] as [number, number]);
}

/** Apply N rotations (0-3) to piece cells */
export function applyRotation(cells: [number, number][], rotation: number): [number, number][] {
  let result = cells;
  for (let i = 0; i < rotation % 4; i++) {
    result = rotateCells(result);
  }
  return result;
}

// =============================================================================
// Bounding Box
// =============================================================================

/** Get bounding box of cells (both dimensions are 1-based sizes) */
export function getBounds(cells: [number, number][]): { rows: number; cols: number } {
  const maxR = Math.max(...cells.map(([r]) => r));
  const maxC = Math.max(...cells.map(([, c]) => c));
  return { rows: maxR + 1, cols: maxC + 1 };
}

// =============================================================================
// Placement Validation
// =============================================================================

/** Check whether all absolute cells are within the grid bounds */
export function isWithinBounds(
  absoluteCells: [number, number][],
  gridSize: number = GRID_SIZE,
): boolean {
  return absoluteCells.every(([r, c]) => r >= 0 && r < gridSize && c >= 0 && c < gridSize);
}

/** Check whether any cells in `absoluteCells` overlap with `occupied` */
export function hasOverlap(absoluteCells: [number, number][], occupied: Set<string>): boolean {
  return absoluteCells.some(([r, c]) => occupied.has(cellKey(r, c)));
}

/**
 * Compute absolute cells for a piece placed at `origin` with a given `rotation`.
 */
export function computeAbsoluteCells(
  pieceCells: [number, number][],
  rotation: number,
  origin: [number, number],
): [number, number][] {
  const rotated = applyRotation(pieceCells, rotation);
  return rotated.map(([r, c]) => [origin[0] + r, origin[1] + c] as [number, number]);
}

/**
 * Validate a piece placement: within bounds and no overlap.
 * Returns `true` if the placement is valid.
 */
export function isValidPlacement(
  absoluteCells: [number, number][],
  occupied: Set<string>,
  gridSize: number = GRID_SIZE,
): boolean {
  return isWithinBounds(absoluteCells, gridSize) && !hasOverlap(absoluteCells, occupied);
}

// =============================================================================
// Solution Validation
// =============================================================================

/**
 * Build the set of occupied cell keys from placed pieces.
 */
export function buildOccupiedSet(placements: PlacedPiece[]): Set<string> {
  const s = new Set<string>();
  for (const p of placements) {
    for (const [r, c] of p.absoluteCells) {
      s.add(cellKey(r, c));
    }
  }
  return s;
}

/**
 * Check if placed pieces have any overlapping cells.
 * Returns true if there are overlaps.
 */
export function hasPlacementOverlaps(placements: PlacedPiece[]): boolean {
  const seen = new Set<string>();
  for (const p of placements) {
    for (const [r, c] of p.absoluteCells) {
      const k = cellKey(r, c);
      if (seen.has(k)) return true;
      seen.add(k);
    }
  }
  return false;
}

/**
 * Check if the placed pieces exactly cover the target silhouette.
 *
 * Conditions:
 * 1. Total cell count matches target size
 * 2. Every target cell is covered
 * 3. No overlaps among placed pieces
 */
export function isSolved(placements: PlacedPiece[], target: Set<string>): boolean {
  if (hasPlacementOverlaps(placements)) return false;
  const placed = buildOccupiedSet(placements);
  if (placed.size !== target.size) return false;
  for (const k of target) {
    if (!placed.has(k)) return false;
  }
  return true;
}

// =============================================================================
// Piece Pool by Level
// =============================================================================

export function getPiecePool(nLevel: number): {
  count: number;
  maxCellSize: number;
  minCellSize: number;
} {
  switch (nLevel) {
    case 1:
      return { count: 3, maxCellSize: 3, minCellSize: 2 };
    case 2:
      return { count: 5, maxCellSize: 4, minCellSize: 2 };
    default:
      return { count: 6, maxCellSize: 5, minCellSize: 3 };
  }
}

/**
 * Filter pieces eligible for a given nLevel.
 */
export function getEligiblePieces(nLevel: number): PieceDef[] {
  const pool = getPiecePool(nLevel);
  return PIECES.filter(
    (p) => p.cells.length >= pool.minCellSize && p.cells.length <= pool.maxCellSize,
  );
}
