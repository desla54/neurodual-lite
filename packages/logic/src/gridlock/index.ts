import { SeededRandom } from '../domain/random';

export { GRIDLOCK_PUZZLES, PUZZLES_BY_DIFFICULTY } from './puzzles';
export type { GridlockPuzzle, GridlockDifficulty } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOARD_SIZE = 6;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const TARGET_PIECE_ID = 'A';
const EXIT_COL = BOARD_SIZE - 1;
const EMPTY_CELL = 'o';
const WALL_CELL = 'x';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { GridlockPuzzle, GridlockDifficulty } from './types';

export type GridlockOrientation = 'H' | 'V';

export interface GridlockPiece {
  id: string;
  row: number;
  col: number;
  length: 2 | 3;
  orientation: GridlockOrientation;
  isTarget: boolean;
}

export interface GridlockBoard {
  pieces: GridlockPiece[];
  walls: ReadonlySet<number>;
  size: 6;
}

export interface GridlockMove {
  pieceId: string;
  delta: number;
}

export type GridlockChallengeType = 'classic' | 'precision' | 'memory' | 'timed';

/** Session variant — 'mixed' follows the profile schedule, others force a single challenge type. */
export type GridlockSessionVariant = 'mixed' | GridlockChallengeType;

/** Assistance level — scales hint/undo/reset budgets. */
export type GridlockAssistance = 'generous' | 'balanced' | 'strict';

/** Preview duration override. 'auto' uses the challenge-based formula. */
export type GridlockPreviewMode = 'auto' | 'off' | 'short' | 'medium' | 'long';

/** Difficulty lock — 'auto' follows the profile schedule. */
export type GridlockDifficultyLock = 'auto' | GridlockDifficulty;

export interface GridlockPuzzleConfig {
  puzzle: GridlockPuzzle;
  challenge: GridlockChallengeType;
  previewMs: number;
  goalVisibleDuringPlay: boolean;
  hintBudget: number;
  undoBudget: number;
  resetBudget: number;
  moveBudget: number;
}

export type GridlockProfileId = 'rookie' | 'standard' | 'expert';

export interface GridlockTrainingProfile {
  id: GridlockProfileId;
  label: string;
  description: string;
  puzzleCount: number;
  difficultySchedule: readonly GridlockDifficulty[];
  challengeSchedule: readonly GridlockChallengeType[];
}

export interface GridlockTrainingSession {
  id: string;
  profile: GridlockTrainingProfile;
  puzzles: GridlockPuzzleConfig[];
}

export interface GridlockAttempt {
  optimalMoves: number;
  playerMoves: number;
  totalTimeMs: number;
  planningTimeMs: number;
  hintsUsed: number;
  undosUsed: number;
  resetsUsed: number;
  solved: boolean;
  challenge: GridlockChallengeType;
}

export interface GridlockEvaluation {
  extraMoves: number;
  efficiencyPercent: number;
  pacePercent: number;
  planningPercent: number;
  controlPercent: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  rating: 'optimal' | 'strong' | 'solid' | 'recovery';
}

export interface GridlockSessionSummary {
  puzzleCount: number;
  solvedCount: number;
  optimalCount: number;
  accuracyPercent: number;
  masteryScore: number;
  avgMoves: number;
  avgPlanningTimeMs: number;
  avgTotalTimeMs: number;
  avgEfficiencyPercent: number;
  totalExtraMoves: number;
  totalHintsUsed: number;
  totalUndosUsed: number;
  totalResetsUsed: number;
  totalStars: number;
  maxStars: number;
}

// ---------------------------------------------------------------------------
// Profile Definitions
// ---------------------------------------------------------------------------

const PROFILE_DEFINITIONS = {
  rookie: {
    id: 'rookie',
    label: 'Rookie',
    description: 'Gentle progression with generous budgets and longer previews.',
    difficultySchedule: [
      'beginner',
      'beginner',
      'beginner',
      'beginner',
      'easy',
      'easy',
      'easy',
      'easy',
      'medium',
      'medium',
      'medium',
      'medium',
    ],
    challengeSchedule: [
      'classic',
      'classic',
      'classic',
      'classic',
      'classic',
      'classic',
      'precision',
      'classic',
      'classic',
      'classic',
      'precision',
      'classic',
    ],
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Progressive block with precision, memory and timed rounds.',
    difficultySchedule: [
      'beginner',
      'beginner',
      'easy',
      'easy',
      'easy',
      'medium',
      'medium',
      'medium',
      'hard',
      'hard',
      'hard',
      'hard',
    ],
    challengeSchedule: [
      'classic',
      'classic',
      'classic',
      'precision',
      'classic',
      'classic',
      'precision',
      'memory',
      'classic',
      'precision',
      'memory',
      'timed',
    ],
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    description: 'High-load session with harder starts, less assistance and tighter budgets.',
    difficultySchedule: [
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
      'hard',
      'hard',
      'expert',
      'expert',
      'expert',
      'expert',
      'expert',
    ],
    challengeSchedule: [
      'classic',
      'precision',
      'precision',
      'memory',
      'precision',
      'memory',
      'timed',
      'precision',
      'memory',
      'timed',
      'timed',
      'timed',
    ],
  },
} as const satisfies Record<GridlockProfileId, Omit<GridlockTrainingProfile, 'puzzleCount'>>;

export const GRIDLOCK_TRAINING_PROFILES = {
  rookie: {
    ...PROFILE_DEFINITIONS.rookie,
    puzzleCount: PROFILE_DEFINITIONS.rookie.difficultySchedule.length,
  },
  standard: {
    ...PROFILE_DEFINITIONS.standard,
    puzzleCount: PROFILE_DEFINITIONS.standard.difficultySchedule.length,
  },
  expert: {
    ...PROFILE_DEFINITIONS.expert,
    puzzleCount: PROFILE_DEFINITIONS.expert.difficultySchedule.length,
  },
} satisfies Record<GridlockProfileId, GridlockTrainingProfile>;

// ---------------------------------------------------------------------------
// Profile selection from nLevel
// ---------------------------------------------------------------------------

export function getGridlockProfileForLevel(nLevel: number): GridlockProfileId {
  if (nLevel <= 2) return 'rookie';
  if (nLevel <= 4) return 'standard';
  return 'expert';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Board Operations
// ---------------------------------------------------------------------------

export function parseBoard(boardStr: string): GridlockBoard {
  if (boardStr.length !== BOARD_CELLS) {
    throw new Error(`Board string must be ${BOARD_CELLS} characters, got ${boardStr.length}`);
  }

  const seen = new Map<string, { rows: number[]; cols: number[] }>();
  const walls = new Set<number>();

  for (let i = 0; i < BOARD_CELLS; i++) {
    const ch = boardStr[i] as string;
    if (ch === WALL_CELL) {
      walls.add(i);
      continue;
    }
    if (ch === EMPTY_CELL) {
      continue;
    }
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    const entry = seen.get(ch);
    if (entry) {
      entry.rows.push(row);
      entry.cols.push(col);
    } else {
      seen.set(ch, { rows: [row], cols: [col] });
    }
  }

  const pieces: GridlockPiece[] = [];

  for (const [id, { rows, cols }] of seen) {
    // Only cars (2) and trucks (3) are valid Gridlock pieces.
    // Skip single-cell pieces — treat them as static obstacles.
    if (rows.length < 2 || rows.length > 3) {
      continue;
    }
    const length = rows.length as 2 | 3;
    const minRow = Math.min(...rows);
    const minCol = Math.min(...cols);
    const rowSpan = Math.max(...rows) - minRow + 1;
    const colSpan = Math.max(...cols) - minCol + 1;

    let orientation: GridlockOrientation;
    if (colSpan === length && rowSpan === 1) {
      orientation = 'H';
    } else if (rowSpan === length && colSpan === 1) {
      orientation = 'V';
    } else {
      throw new Error(`Piece '${id}' has inconsistent shape`);
    }

    pieces.push({
      id,
      row: minRow,
      col: minCol,
      length,
      orientation,
      isTarget: id === TARGET_PIECE_ID,
    });
  }

  pieces.sort((a, b) => a.id.localeCompare(b.id));

  return { pieces, walls, size: BOARD_SIZE as 6 };
}

export function buildGrid(board: GridlockBoard): string[][] {
  const grid: string[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => EMPTY_CELL),
  );

  for (const wallIdx of board.walls) {
    const r = Math.floor(wallIdx / BOARD_SIZE);
    const c = wallIdx % BOARD_SIZE;
    (grid[r] as string[])[c] = WALL_CELL;
  }

  for (const piece of board.pieces) {
    for (let offset = 0; offset < piece.length; offset++) {
      const r = piece.orientation === 'V' ? piece.row + offset : piece.row;
      const c = piece.orientation === 'H' ? piece.col + offset : piece.col;
      (grid[r] as string[])[c] = piece.id;
    }
  }

  return grid;
}

export function serializeBoard(board: GridlockBoard): string {
  const grid = buildGrid(board);
  let result = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      result += (grid[r] as string[])[c];
    }
  }
  return result;
}

export function cloneBoard(board: GridlockBoard): GridlockBoard {
  return {
    pieces: board.pieces.map((p) => ({ ...p })),
    walls: board.walls,
    size: BOARD_SIZE as 6,
  };
}

// ---------------------------------------------------------------------------
// Move Operations
// ---------------------------------------------------------------------------

export function listValidMoves(board: GridlockBoard): GridlockMove[] {
  const grid = buildGrid(board);
  const moves: GridlockMove[] = [];

  for (const piece of board.pieces) {
    if (piece.orientation === 'H') {
      // Slide left
      for (let delta = -1; piece.col + delta >= 0; delta--) {
        if ((grid[piece.row] as string[])[piece.col + delta] !== EMPTY_CELL) {
          break;
        }
        moves.push({ pieceId: piece.id, delta });
      }
      // Slide right
      for (let delta = 1; piece.col + piece.length - 1 + delta <= EXIT_COL; delta++) {
        if ((grid[piece.row] as string[])[piece.col + piece.length - 1 + delta] !== EMPTY_CELL) {
          break;
        }
        moves.push({ pieceId: piece.id, delta });
      }
    } else {
      // Slide up
      for (let delta = -1; piece.row + delta >= 0; delta--) {
        if ((grid[piece.row + delta] as string[])[piece.col] !== EMPTY_CELL) {
          break;
        }
        moves.push({ pieceId: piece.id, delta });
      }
      // Slide down
      for (let delta = 1; piece.row + piece.length - 1 + delta <= EXIT_COL; delta++) {
        if ((grid[piece.row + piece.length - 1 + delta] as string[])[piece.col] !== EMPTY_CELL) {
          break;
        }
        moves.push({ pieceId: piece.id, delta });
      }
    }
  }

  return moves;
}

export function applyMove(board: GridlockBoard, move: GridlockMove): GridlockBoard | null {
  const piece = board.pieces.find((p) => p.id === move.pieceId);
  if (!piece || move.delta === 0) {
    return null;
  }

  const grid = buildGrid(board);
  const step = move.delta > 0 ? 1 : -1;

  // Validate every cell along the path
  for (let d = step; d !== move.delta + step; d += step) {
    if (piece.orientation === 'H') {
      const checkCol = d > 0 ? piece.col + piece.length - 1 + d : piece.col + d;
      if (checkCol < 0 || checkCol >= BOARD_SIZE) {
        return null;
      }
      if ((grid[piece.row] as string[])[checkCol] !== EMPTY_CELL) {
        return null;
      }
    } else {
      const checkRow = d > 0 ? piece.row + piece.length - 1 + d : piece.row + d;
      if (checkRow < 0 || checkRow >= BOARD_SIZE) {
        return null;
      }
      if ((grid[checkRow] as string[])[piece.col] !== EMPTY_CELL) {
        return null;
      }
    }
  }

  const next = cloneBoard(board);
  const movedPiece = next.pieces.find((p) => p.id === move.pieceId);
  if (!movedPiece) {
    return null;
  }

  if (piece.orientation === 'H') {
    movedPiece.col += move.delta;
  } else {
    movedPiece.row += move.delta;
  }

  return next;
}

export function isWon(board: GridlockBoard): boolean {
  const target = board.pieces.find((p) => p.isTarget);
  if (!target) {
    return false;
  }
  return target.col + target.length - 1 >= EXIT_COL;
}

// ---------------------------------------------------------------------------
// Solver (BFS with compact state encoding)
// ---------------------------------------------------------------------------

function encodeState(board: GridlockBoard): string {
  // Sort pieces by ID and concatenate their variable coordinate.
  // Orientation is fixed per piece, so we only need the sliding coordinate.
  const parts: string[] = [];
  const sorted = [...board.pieces].sort((a, b) => a.id.localeCompare(b.id));
  for (const piece of sorted) {
    const coord = piece.orientation === 'H' ? piece.col : piece.row;
    parts.push(`${piece.id}${coord}`);
  }
  return parts.join('');
}

export function solve(board: GridlockBoard): GridlockMove[] | null {
  if (isWon(board)) {
    return [];
  }

  const startState = encodeState(board);
  const visited = new Set<string>([startState]);
  const queue: Array<{ board: GridlockBoard; moves: GridlockMove[] }> = [{ board, moves: [] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const validMoves = listValidMoves(current.board);

    for (const move of validMoves) {
      const nextBoard = applyMove(current.board, move);
      if (!nextBoard) {
        continue;
      }

      if (isWon(nextBoard)) {
        return [...current.moves, move];
      }

      const state = encodeState(nextBoard);
      if (visited.has(state)) {
        continue;
      }
      visited.add(state);
      queue.push({ board: nextBoard, moves: [...current.moves, move] });
    }
  }

  return null;
}

export function getHintMove(board: GridlockBoard): GridlockMove | null {
  const solution = solve(board);
  return solution?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

export function getDifficulty(optimalMoves: number): GridlockDifficulty {
  if (optimalMoves <= 7) {
    return 'beginner';
  }
  if (optimalMoves <= 14) {
    return 'easy';
  }
  if (optimalMoves <= 22) {
    return 'medium';
  }
  if (optimalMoves <= 35) {
    return 'hard';
  }
  return 'expert';
}

// ---------------------------------------------------------------------------
// Challenge Config Builder
// ---------------------------------------------------------------------------

const ASSISTANCE_MULTIPLIERS: Record<GridlockAssistance, number> = {
  generous: 1.5,
  balanced: 1.0,
  strict: 0.5,
};

const PREVIEW_OVERRIDE_MS: Record<Exclude<GridlockPreviewMode, 'auto'>, number> = {
  off: 0,
  short: 1500,
  medium: 3000,
  long: 6000,
};

export function buildChallengeConfig(
  challenge: GridlockChallengeType,
  optimalMoves: number,
  overrides?: { assistance?: GridlockAssistance; previewMode?: GridlockPreviewMode },
): Omit<GridlockPuzzleConfig, 'puzzle' | 'challenge'> {
  const mult = ASSISTANCE_MULTIPLIERS[overrides?.assistance ?? 'balanced'];

  let base: Omit<GridlockPuzzleConfig, 'puzzle' | 'challenge'>;
  switch (challenge) {
    case 'classic':
      base = {
        previewMs: 2000 + optimalMoves * 150,
        goalVisibleDuringPlay: true,
        hintBudget: 2,
        undoBudget: 3,
        resetBudget: 2,
        moveBudget: optimalMoves + Math.max(4, Math.ceil(optimalMoves * 0.5)),
      };
      break;
    case 'precision':
      base = {
        previewMs: 1800 + optimalMoves * 120,
        goalVisibleDuringPlay: true,
        hintBudget: 1,
        undoBudget: 1,
        resetBudget: 1,
        moveBudget: optimalMoves + 1,
      };
      break;
    case 'memory':
      base = {
        previewMs: 3000 + optimalMoves * 200,
        goalVisibleDuringPlay: false,
        hintBudget: 1,
        undoBudget: 2,
        resetBudget: 1,
        moveBudget: optimalMoves + Math.max(3, Math.ceil(optimalMoves * 0.4)),
      };
      break;
    case 'timed':
      base = {
        previewMs: 1500 + optimalMoves * 100,
        goalVisibleDuringPlay: true,
        hintBudget: 0,
        undoBudget: 1,
        resetBudget: 0,
        moveBudget: optimalMoves + Math.max(3, Math.ceil(optimalMoves * 0.3)),
      };
      break;
  }

  // Apply assistance multiplier to budgets
  if (mult !== 1.0) {
    base.hintBudget = Math.round(base.hintBudget * mult);
    base.undoBudget = Math.round(base.undoBudget * mult);
    base.resetBudget = Math.round(base.resetBudget * mult);
    base.moveBudget =
      optimalMoves + Math.max(1, Math.round((base.moveBudget - optimalMoves) * mult));
  }

  // Apply preview override
  const previewMode = overrides?.previewMode ?? 'auto';
  if (previewMode !== 'auto') {
    base.previewMs = PREVIEW_OVERRIDE_MS[previewMode];
  }

  return base;
}

// ---------------------------------------------------------------------------
// Training Session Builder
// ---------------------------------------------------------------------------

export function buildGridlockTrainingSession(opts: {
  seed: string;
  profileId?: GridlockProfileId;
  puzzleDb: GridlockPuzzle[];
  /** Override puzzle count (default = profile's puzzleCount). */
  puzzleCount?: number;
  /** Force a single challenge type instead of the profile's mixed schedule. */
  sessionVariant?: GridlockSessionVariant;
  /** Lock all puzzles to a specific difficulty tier. */
  difficultyLock?: GridlockDifficultyLock;
  /** Scale hint/undo/reset budgets. */
  assistance?: GridlockAssistance;
  /** Override preview duration. */
  previewMode?: GridlockPreviewMode;
}): GridlockTrainingSession {
  const profile = GRIDLOCK_TRAINING_PROFILES[opts.profileId ?? 'standard'];
  const rng = new SeededRandom(`gridlock:${profile.id}:${opts.seed}`);
  const puzzleCount = opts.puzzleCount ?? profile.puzzleCount;

  // Group puzzle database by difficulty, filtering out malformed boards
  const byDifficulty = new Map<GridlockDifficulty, GridlockPuzzle[]>();
  for (const puzzle of opts.puzzleDb) {
    // Quick validation: 'A' must appear exactly 2 times (horizontal car)
    const aCount = [...puzzle.boardStr].filter((ch) => ch === 'A').length;
    if (aCount !== 2) continue;
    const bucket = byDifficulty.get(puzzle.difficulty) ?? [];
    bucket.push(puzzle);
    byDifficulty.set(puzzle.difficulty, bucket);
  }

  const usedBoardStrs = new Set<string>();
  const forcedChallenge =
    opts.sessionVariant && opts.sessionVariant !== 'mixed' ? opts.sessionVariant : null;
  const lockedDifficulty =
    opts.difficultyLock && opts.difficultyLock !== 'auto' ? opts.difficultyLock : null;

  const puzzles = Array.from({ length: puzzleCount }, (_, index) => {
    const difficulty =
      lockedDifficulty ??
      profile.difficultySchedule[index % profile.difficultySchedule.length] ??
      'medium';
    const challenge =
      forcedChallenge ??
      profile.challengeSchedule[index % profile.challengeSchedule.length] ??
      'classic';

    const candidates = (byDifficulty.get(difficulty) ?? []).filter(
      (p) => !usedBoardStrs.has(p.boardStr),
    );

    // Fall back to any puzzle at this difficulty if all are used
    const pool = candidates.length > 0 ? candidates : (byDifficulty.get(difficulty) ?? []);
    if (pool.length === 0) {
      throw new Error(`No Gridlock puzzle available for difficulty '${difficulty}'`);
    }

    const puzzle = rng.choice(pool);
    usedBoardStrs.add(puzzle.boardStr);

    const config = buildChallengeConfig(challenge, puzzle.optimalMoves, {
      assistance: opts.assistance,
      previewMode: opts.previewMode,
    });

    return {
      puzzle,
      challenge,
      ...config,
    } satisfies GridlockPuzzleConfig;
  });

  return {
    id: `gridlock:${profile.id}:${opts.seed}`,
    profile,
    puzzles,
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateGridlockPuzzle(attempt: GridlockAttempt): GridlockEvaluation {
  const extraMoves = Math.max(0, attempt.playerMoves - attempt.optimalMoves);
  const efficiencyPercent = attempt.solved
    ? Math.round((attempt.optimalMoves / Math.max(attempt.playerMoves, attempt.optimalMoves)) * 100)
    : 0;

  const paceBudgetMs =
    2500 +
    attempt.optimalMoves * 2200 +
    (attempt.challenge === 'memory' ? 2000 : 0) +
    (attempt.challenge === 'timed' ? 800 : 0);
  const pacePercent = attempt.solved
    ? clamp(Math.round((paceBudgetMs / Math.max(attempt.totalTimeMs, 700)) * 100), 25, 100)
    : 0;

  const planningBudgetMs =
    1000 +
    attempt.optimalMoves * 700 +
    (attempt.challenge === 'memory' ? 1400 : 0) +
    (attempt.challenge === 'timed' ? 300 : 0);
  const planningPercent = attempt.solved
    ? clamp(Math.round((planningBudgetMs / Math.max(attempt.planningTimeMs, 300)) * 100), 25, 100)
    : 0;

  const controlPenalty =
    extraMoves * 7 + attempt.undosUsed * 5 + attempt.resetsUsed * 12 + attempt.hintsUsed * 14;
  const controlPercent = attempt.solved ? clamp(100 - controlPenalty, 0, 100) : 0;

  const score = attempt.solved
    ? clamp(
        Math.round(
          efficiencyPercent * 0.45 +
            pacePercent * 0.2 +
            controlPercent * 0.25 +
            planningPercent * 0.1,
        ),
        0,
        100,
      )
    : 0;

  let stars: 0 | 1 | 2 | 3 = 0;
  if (attempt.solved) {
    stars = 1;
  }
  if (attempt.solved && score >= 70) {
    stars = 2;
  }
  if (attempt.solved && extraMoves === 0 && attempt.hintsUsed === 0 && attempt.resetsUsed === 0) {
    stars = 3;
  }

  const rating = !attempt.solved
    ? 'recovery'
    : extraMoves === 0 && controlPercent >= 90
      ? 'optimal'
      : score >= 80
        ? 'strong'
        : score >= 60
          ? 'solid'
          : 'recovery';

  return {
    extraMoves,
    efficiencyPercent,
    pacePercent,
    planningPercent,
    controlPercent,
    score,
    stars,
    rating,
  };
}

// ---------------------------------------------------------------------------
// Session Summary
// ---------------------------------------------------------------------------

export function summarizeGridlockSession(
  attempts: readonly GridlockAttempt[],
): GridlockSessionSummary {
  if (attempts.length === 0) {
    return {
      puzzleCount: 0,
      solvedCount: 0,
      optimalCount: 0,
      accuracyPercent: 0,
      masteryScore: 0,
      avgMoves: 0,
      avgPlanningTimeMs: 0,
      avgTotalTimeMs: 0,
      avgEfficiencyPercent: 0,
      totalExtraMoves: 0,
      totalHintsUsed: 0,
      totalUndosUsed: 0,
      totalResetsUsed: 0,
      totalStars: 0,
      maxStars: 0,
    };
  }

  const evaluations = attempts.map((attempt) => evaluateGridlockPuzzle(attempt));
  const solvedCount = attempts.filter((attempt) => attempt.solved).length;
  const optimalCount = evaluations.filter((evaluation) => evaluation.extraMoves === 0).length;
  const totalMoves = attempts.reduce((sum, attempt) => sum + attempt.playerMoves, 0);
  const totalPlanningTimeMs = attempts.reduce((sum, attempt) => sum + attempt.planningTimeMs, 0);
  const totalTimeMs = attempts.reduce((sum, attempt) => sum + attempt.totalTimeMs, 0);
  const totalEfficiency = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.efficiencyPercent,
    0,
  );
  const totalScore = evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0);
  const totalExtraMoves = evaluations.reduce((sum, evaluation) => sum + evaluation.extraMoves, 0);
  const totalHintsUsed = attempts.reduce((sum, attempt) => sum + attempt.hintsUsed, 0);
  const totalUndosUsed = attempts.reduce((sum, attempt) => sum + attempt.undosUsed, 0);
  const totalResetsUsed = attempts.reduce((sum, attempt) => sum + attempt.resetsUsed, 0);
  const totalStars = evaluations.reduce((sum, evaluation) => sum + evaluation.stars, 0);

  return {
    puzzleCount: attempts.length,
    solvedCount,
    optimalCount,
    accuracyPercent: Math.round((optimalCount / attempts.length) * 100),
    masteryScore: Math.round(totalScore / attempts.length),
    avgMoves: Math.round((totalMoves / attempts.length) * 10) / 10,
    avgPlanningTimeMs: Math.round(totalPlanningTimeMs / attempts.length),
    avgTotalTimeMs: Math.round(totalTimeMs / attempts.length),
    avgEfficiencyPercent: Math.round(totalEfficiency / attempts.length),
    totalExtraMoves,
    totalHintsUsed,
    totalUndosUsed,
    totalResetsUsed,
    totalStars,
    maxStars: attempts.length * 3,
  };
}
