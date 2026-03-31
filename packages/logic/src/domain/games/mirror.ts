/**
 * Mirror — pure game logic
 *
 * Spatial symmetry task: reproduce the mirror image of a pattern.
 * Extracted from the training page for testability.
 */

// =============================================================================
// Types
// =============================================================================

export type SymmetryType = 'vertical' | 'horizontal' | 'central';

export interface CellCoord {
  row: number;
  col: number;
}

export interface MirrorTrialResult {
  correctCells: number;
  incorrectCells: number;
  missedCells: number;
  isCorrect: boolean;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_GRID_ROWS = 4;
export const DEFAULT_GRID_COLS = 4;
export const MIN_FILLED = 3;
export const MAX_FILLED = 6;

// =============================================================================
// Symmetry Helpers
// =============================================================================

/** Map nLevel to symmetry type */
export function getSymmetryType(nLevel: number): SymmetryType {
  if (nLevel <= 1) return 'vertical';
  if (nLevel === 2) return 'horizontal';
  return 'central';
}

/** Compute the mirror of a cell coordinate */
export function mirrorCoord(
  coord: CellCoord,
  type: SymmetryType,
  gridRows = DEFAULT_GRID_ROWS,
  gridCols = DEFAULT_GRID_COLS,
): CellCoord {
  switch (type) {
    case 'vertical':
      return { row: coord.row, col: gridCols - 1 - coord.col };
    case 'horizontal':
      return { row: gridRows - 1 - coord.row, col: coord.col };
    case 'central':
      return { row: gridRows - 1 - coord.row, col: gridCols - 1 - coord.col };
  }
}

/** Human-readable label for a symmetry type */
export function symmetryLabel(type: SymmetryType): string {
  switch (type) {
    case 'vertical':
      return 'Vertical';
    case 'horizontal':
      return 'Horizontal';
    case 'central':
      return 'Central';
  }
}

// =============================================================================
// Pattern Generation
// =============================================================================

/** Generate a random source pattern with `filledCount` cells on a grid */
export function generateSourcePattern(
  filledCount: number,
  gridRows = DEFAULT_GRID_ROWS,
  gridCols = DEFAULT_GRID_COLS,
): CellCoord[] {
  const allCells: CellCoord[] = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      allCells.push({ row: r, col: c });
    }
  }
  // Shuffle
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j] as CellCoord, allCells[i] as CellCoord];
  }
  return allCells.slice(0, filledCount);
}

/** How many cells to fill for this trial index */
export function filledCountForTrial(trialIndex: number, totalTrials: number): number {
  const progress = totalTrials > 1 ? trialIndex / (totalTrials - 1) : 0;
  return Math.round(MIN_FILLED + progress * (MAX_FILLED - MIN_FILLED));
}

// =============================================================================
// Coord utilities
// =============================================================================

export function coordKey(c: CellCoord): string {
  return `${c.row},${c.col}`;
}

/** Compute the expected mirror pattern from a source pattern */
export function computeExpectedMirror(
  sourcePattern: CellCoord[],
  symmetryType: SymmetryType,
  gridRows = DEFAULT_GRID_ROWS,
  gridCols = DEFAULT_GRID_COLS,
): CellCoord[] {
  return sourcePattern.map((c) => mirrorCoord(c, symmetryType, gridRows, gridCols));
}

// =============================================================================
// Validation
// =============================================================================

/** Validate a player's answer against the expected mirror pattern */
export function validateMirrorAnswer(
  playerCells: CellCoord[],
  expectedMirror: CellCoord[],
): MirrorTrialResult {
  const expectedSet = new Set(expectedMirror.map(coordKey));
  const playerSet = new Set(playerCells.map(coordKey));

  let correctCells = 0;
  let incorrectCells = 0;
  let missedCells = 0;

  for (const key of playerSet) {
    if (expectedSet.has(key)) {
      correctCells++;
    } else {
      incorrectCells++;
    }
  }
  for (const key of expectedSet) {
    if (!playerSet.has(key)) {
      missedCells++;
    }
  }

  return {
    correctCells,
    incorrectCells,
    missedCells,
    isCorrect: incorrectCells === 0 && missedCells === 0,
  };
}
