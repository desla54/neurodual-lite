/**
 * Gridlock shared types — extracted to break the index.ts <-> puzzles.ts cycle.
 */

export type GridlockDifficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export interface GridlockPuzzle {
  boardStr: string;
  optimalMoves: number;
  difficulty: GridlockDifficulty;
}
