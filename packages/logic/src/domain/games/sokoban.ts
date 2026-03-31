/**
 * Sokoban — pure game logic extracted from the training page.
 *
 * Classic box-pushing puzzle:
 * - Player moves on a grid, pushing boxes onto target positions
 * - Can only push (not pull), cannot push 2 boxes at once
 * - XSB level format parsing
 * - Deadlock detection (box in non-goal corner)
 */

// =============================================================================
// Types
// =============================================================================

/** Cell types in the Sokoban grid */
export type Cell =
  | 'wall'
  | 'floor'
  | 'target'
  | 'player'
  | 'player-on-target'
  | 'box'
  | 'box-on-target';

export interface Position {
  row: number;
  col: number;
}

export interface SokobanState {
  grid: Cell[][];
  player: Position;
  rows: number;
  cols: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveResult {
  state: SokobanState;
  pushed: boolean;
}

// =============================================================================
// Constants
// =============================================================================

export const DIR_DELTA: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

// =============================================================================
// Level Parsing
// =============================================================================

/**
 * Parse a level from XSB format lines.
 *
 * Level format:
 *   # = wall
 *   . = target
 *   $ = box
 *   @ = player
 *   * = box on target
 *   + = player on target
 *   (space) = floor
 */
export function parseLevel(lines: string[]): SokobanState {
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const grid: Cell[][] = [];
  let player: Position = { row: 0, col: 0 };

  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    const line = lines[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const ch = c < line.length ? line[c] : ' ';
      switch (ch) {
        case '#':
          row.push('wall');
          break;
        case '.':
          row.push('target');
          break;
        case '$':
          row.push('box');
          break;
        case '@':
          row.push('floor');
          player = { row: r, col: c };
          break;
        case '*':
          row.push('box-on-target');
          break;
        case '+':
          row.push('target');
          player = { row: r, col: c };
          break;
        default:
          row.push('floor');
          break;
      }
    }
    grid.push(row);
  }

  return { grid, player, rows, cols };
}

// =============================================================================
// State Helpers
// =============================================================================

export function cloneState(state: SokobanState): SokobanState {
  return {
    grid: state.grid.map((row) => [...row]),
    player: { ...state.player },
    rows: state.rows,
    cols: state.cols,
  };
}

export function getCell(state: SokobanState, r: number, c: number): Cell {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return 'wall';
  return (state.grid[r] as Cell[])[c] as Cell;
}

export function isWalkable(cell: Cell): boolean {
  return cell === 'floor' || cell === 'target';
}

export function isBox(cell: Cell): boolean {
  return cell === 'box' || cell === 'box-on-target';
}

export function removeBox(cell: Cell): Cell {
  return cell === 'box-on-target' ? 'target' : 'floor';
}

export function placeBox(cell: Cell): Cell {
  return cell === 'target' ? 'box-on-target' : 'box';
}

// =============================================================================
// Win Detection
// =============================================================================

/** Returns true when no bare 'box' cells remain (all boxes are on targets). */
export function isSolved(state: SokobanState): boolean {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if ((state.grid[r] as Cell[])[c] === 'box') return false;
    }
  }
  return true;
}

// =============================================================================
// Movement
// =============================================================================

/**
 * Attempt to move the player in `dir`.
 * Returns `null` if blocked; otherwise returns the new state and whether a push occurred.
 */
export function tryMove(state: SokobanState, dir: Direction): MoveResult | null {
  const [dr, dc] = DIR_DELTA[dir] as [number, number];
  const newR = state.player.row + dr;
  const newC = state.player.col + dc;
  const destCell = getCell(state, newR, newC);

  if (destCell === 'wall') return null;

  if (isBox(destCell)) {
    // Try to push box
    const behindR = newR + dr;
    const behindC = newC + dc;
    const behindCell = getCell(state, behindR, behindC);
    if (!isWalkable(behindCell)) return null;

    // Push is valid
    const next = cloneState(state);
    (next.grid[newR] as Cell[])[newC] = removeBox(destCell);
    (next.grid[behindR] as Cell[])[behindC] = placeBox(behindCell);
    next.player = { row: newR, col: newC };
    return { state: next, pushed: true };
  }

  if (isWalkable(destCell)) {
    const next = cloneState(state);
    next.player = { row: newR, col: newC };
    return { state: next, pushed: false };
  }

  return null;
}

// =============================================================================
// Deadlock Detection
// =============================================================================

/**
 * Check if a box at (r,c) is in a simple deadlock (corner deadlock).
 * A box is deadlocked if it's NOT on a target and is stuck in a corner
 * (wall on two adjacent sides that form a corner).
 */
export function isCornerDeadlock(state: SokobanState, r: number, c: number): boolean {
  const cell = getCell(state, r, c);
  // Only applies to bare boxes (not on target)
  if (cell !== 'box') return false;

  const up = getCell(state, r - 1, c) === 'wall';
  const down = getCell(state, r + 1, c) === 'wall';
  const left = getCell(state, r, c - 1) === 'wall';
  const right = getCell(state, r, c + 1) === 'wall';

  // Corner if blocked on two perpendicular sides
  return (up && left) || (up && right) || (down && left) || (down && right);
}

/**
 * Check if any box on the grid is in a corner deadlock.
 */
export function hasDeadlock(state: SokobanState): boolean {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (isCornerDeadlock(state, r, c)) return true;
    }
  }
  return false;
}

// =============================================================================
// Undo Support
// =============================================================================

export interface UndoState {
  history: SokobanState[];
  moves: number;
  pushes: number;
  undosUsed: number;
  undosRemaining: number;
}

export function createUndoState(maxUndos: number): UndoState {
  return { history: [], moves: 0, pushes: 0, undosUsed: 0, undosRemaining: maxUndos };
}

export function recordMove(undo: UndoState, prevState: SokobanState, pushed: boolean): UndoState {
  return {
    history: [...undo.history, prevState],
    moves: undo.moves + 1,
    pushes: undo.pushes + (pushed ? 1 : 0),
    undosUsed: undo.undosUsed,
    undosRemaining: undo.undosRemaining,
  };
}

export function performUndo(undo: UndoState): { state: SokobanState; undo: UndoState } | null {
  if (undo.history.length === 0 || undo.undosRemaining <= 0) return null;
  const prev = undo.history[undo.history.length - 1] as SokobanState;
  return {
    state: prev,
    undo: {
      history: undo.history.slice(0, -1),
      moves: Math.max(0, undo.moves - 1),
      pushes: undo.pushes, // we don't track push-undo separately
      undosUsed: undo.undosUsed + 1,
      undosRemaining: undo.undosRemaining - 1,
    },
  };
}
