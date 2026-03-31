/**
 * Tetris Mind — pure game logic
 *
 * Mental rotation of tetromino pieces to fit into a target hole.
 * Extracted from the training page for testability.
 */

// =============================================================================
// Types
// =============================================================================

/** A piece is a list of (row, col) cells on a mini-grid */
export type PieceCells = [number, number][];

export interface TrialData {
  /** The target hole (negative space) rendered on the larger grid */
  holeCells: PieceCells;
  /** Four candidate pieces */
  candidates: PieceCells[];
  /** Index of the correct candidate */
  correctIdx: number;
}

// =============================================================================
// Tetromino Definitions
// =============================================================================

/** Standard 7 tetrominoes defined as (row, col) arrays: I, O, T, S, Z, L, J */
export const TETROMINOES: readonly PieceCells[] = [
  // I
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  // O
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  // T
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
  ],
  // S
  [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ],
  // Z
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  // L
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
  ],
  // J
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
];

/** Name labels matching TETROMINOES index order */
export const TETROMINO_NAMES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'] as const;

// =============================================================================
// Transforms
// =============================================================================

/** Normalize cells so minimum row and column are 0, then sort for comparison */
export function normalizeCells(cells: PieceCells): PieceCells {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  const norm = cells.map(([r, c]) => [r - minR, c - minC] as [number, number]);
  norm.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return norm;
}

/** Rotate piece 90 degrees clockwise around origin */
export function rotateCW(cells: PieceCells): PieceCells {
  // (r, c) -> (c, -r) then normalize
  const rotated = cells.map(([r, c]) => [c, -r] as [number, number]);
  return normalizeCells(rotated);
}

/** Mirror piece horizontally (flip columns) */
export function mirrorH(cells: PieceCells): PieceCells {
  const maxC = Math.max(...cells.map(([, c]) => c));
  const mirrored = cells.map(([r, c]) => [r, maxC - c] as [number, number]);
  return normalizeCells(mirrored);
}

/** Check if two cell arrays represent the same shape */
export function sameCells(a: PieceCells, b: PieceCells): boolean {
  if (a.length !== b.length) return false;
  const na = normalizeCells([...a]);
  const nb = normalizeCells([...b]);
  return na.every(
    (cell, i) =>
      cell[0] === (nb[i] as (typeof nb)[number])[0] &&
      cell[1] === (nb[i] as (typeof nb)[number])[1],
  );
}

/** Get all unique rotations of a piece (up to 4) */
export function getAllRotations(cells: PieceCells): PieceCells[] {
  const rotations: PieceCells[] = [normalizeCells([...cells])];
  let current = cells;
  for (let i = 0; i < 3; i++) {
    current = rotateCW(current);
    const norm = normalizeCells([...current]);
    if (!rotations.some((r) => sameCells(r, norm))) {
      rotations.push(norm);
    }
  }
  return rotations;
}

/** Apply N clockwise rotations */
export function applyRotations(cells: PieceCells, count: number): PieceCells {
  let result = [...cells] as PieceCells;
  for (let i = 0; i < count; i++) {
    result = rotateCW(result);
  }
  return normalizeCells(result);
}

/** Get the bounding box size of a piece */
export function getBoundingBox(cells: PieceCells): { rows: number; cols: number } {
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  return { rows, cols };
}

// =============================================================================
// Trial Generation
// =============================================================================

export function generateTrial(nLevel: number): TrialData {
  // Pick a random base tetromino for the answer
  const baseIdx = Math.floor(Math.random() * TETROMINOES.length);
  const basePiece = TETROMINOES[baseIdx] as (typeof TETROMINOES)[number];

  // Determine rotation for the correct answer
  let rotationCount: number;
  if (nLevel === 1) {
    // 0 or 90 degrees only
    rotationCount = Math.random() < 0.5 ? 0 : 1;
  } else {
    // Any rotation (0/90/180/270)
    rotationCount = Math.floor(Math.random() * 4);
  }

  // The correct piece is the base rotated
  let correctPiece = applyRotations(basePiece, rotationCount);

  // At nLevel 3, optionally mirror the correct piece
  const useMirror = nLevel >= 3 && Math.random() < 0.5;
  if (useMirror) {
    correctPiece = mirrorH(correctPiece);
  }

  // The hole is the shape of the correct piece (same cells)
  const holeCells = normalizeCells([...correctPiece]);

  // Generate 3 distractors that do NOT match the hole
  const distractors: PieceCells[] = [];
  const allCorrectVariants = getAllRotations(correctPiece);
  // If mirror, also add mirrored rotations to "correct" set to avoid accidental matches
  if (nLevel >= 3) {
    const mirrored = mirrorH(correctPiece);
    for (const rot of getAllRotations(mirrored)) {
      if (!allCorrectVariants.some((v) => sameCells(v, rot))) {
        allCorrectVariants.push(rot);
      }
    }
  }

  // Build distractor pool from other tetrominoes + different rotations
  const distractorPool: PieceCells[] = [];
  for (let ti = 0; ti < TETROMINOES.length; ti++) {
    const piece = TETROMINOES[ti] as (typeof TETROMINOES)[number];
    const rotations = getAllRotations(piece);
    for (const rot of rotations) {
      if (!allCorrectVariants.some((v) => sameCells(v, rot))) {
        distractorPool.push(rot);
      }
    }
    // Also add mirror variants at nLevel 3
    if (nLevel >= 3) {
      const mirrored = mirrorH(piece);
      const mirrorRotations = getAllRotations(mirrored);
      for (const rot of mirrorRotations) {
        if (!allCorrectVariants.some((v) => sameCells(v, rot))) {
          distractorPool.push(rot);
        }
      }
    }
  }

  // Shuffle distractor pool
  for (let i = distractorPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractorPool[i], distractorPool[j]] = [
      distractorPool[j] as PieceCells,
      distractorPool[i] as PieceCells,
    ];
  }

  // Pick 3 unique distractors
  for (const candidate of distractorPool) {
    if (distractors.length >= 3) break;
    if (!distractors.some((d) => sameCells(d, candidate))) {
      distractors.push(candidate);
    }
  }

  // Fallback: if we don't have enough distractors, create rotated variants of random pieces
  while (distractors.length < 3) {
    const ri = Math.floor(Math.random() * TETROMINOES.length);
    const rr = Math.floor(Math.random() * 4);
    const fallback = applyRotations(TETROMINOES[ri] as (typeof TETROMINOES)[number], rr);
    if (
      !allCorrectVariants.some((v) => sameCells(v, fallback)) &&
      !distractors.some((d) => sameCells(d, fallback))
    ) {
      distractors.push(fallback);
    }
  }

  // Place correct piece at random position among 4 candidates
  const correctIdx = Math.floor(Math.random() * 4);
  const candidates: PieceCells[] = [...distractors];
  candidates.splice(correctIdx, 0, correctPiece);

  return { holeCells, candidates, correctIdx };
}
