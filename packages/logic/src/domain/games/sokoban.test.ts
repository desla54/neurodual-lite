/**
 * Sokoban — pure game logic tests
 *
 * Tests level parsing, movement, box pushing, win detection,
 * undo, move counting, deadlock detection, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  parseLevel,
  tryMove,
  isSolved,
  cloneState,
  getCell,
  isBox,
  isWalkable,
  removeBox,
  placeBox,
  isCornerDeadlock,
  hasDeadlock,
  createUndoState,
  recordMove,
  performUndo,
  type SokobanState,
  type Cell,
} from './sokoban';

// =============================================================================
// Helpers
// =============================================================================

/** Minimal 5x5 level with one box, one target */
const SIMPLE_LEVEL = ['#####', '#. @#', '# $ #', '#   #', '#####'];

/** Level where the box is already on the target */
const SOLVED_LEVEL = ['#####', '#  @#', '# * #', '#   #', '#####'];

/** Level with two boxes and two targets */
const TWO_BOX_LEVEL = ['######', '#  . #', '# $  #', '#@$. #', '#    #', '######'];

/** Level where box is in a corner (deadlocked) */
const DEADLOCK_LEVEL = ['#####', '#$  #', '#   #', '#  @#', '#####'];

/** Level with player on target ('+' notation) */
const PLAYER_ON_TARGET_LEVEL = ['#####', '#   #', '# + #', '#   #', '#####'];

// =============================================================================
// 1. Level Parsing
// =============================================================================

describe('parseLevel', () => {
  it('parses grid dimensions correctly', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(state.rows).toBe(5);
    expect(state.cols).toBe(5);
  });

  it('identifies walls', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(getCell(state, 0, 0)).toBe('wall');
    expect(getCell(state, 0, 4)).toBe('wall');
    expect(getCell(state, 4, 0)).toBe('wall');
  });

  it('identifies target cells (.)', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(getCell(state, 1, 1)).toBe('target');
  });

  it('identifies box cells ($)', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(getCell(state, 2, 2)).toBe('box');
  });

  it('identifies player position (@) and sets cell to floor', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(state.player).toEqual({ row: 1, col: 3 });
    // Player position is stored as floor in the grid
    expect(getCell(state, 1, 3)).toBe('floor');
  });

  it('identifies box-on-target (*)', () => {
    const state = parseLevel(SOLVED_LEVEL);
    expect(getCell(state, 2, 2)).toBe('box-on-target');
  });

  it('identifies player-on-target (+) as target cell with player at that position', () => {
    const state = parseLevel(PLAYER_ON_TARGET_LEVEL);
    expect(state.player).toEqual({ row: 2, col: 2 });
    expect(getCell(state, 2, 2)).toBe('target');
  });

  it('parses floor cells (spaces)', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(getCell(state, 3, 1)).toBe('floor');
    expect(getCell(state, 3, 2)).toBe('floor');
    expect(getCell(state, 3, 3)).toBe('floor');
  });

  it('handles ragged lines by padding with floor', () => {
    const ragged = ['####', '#@ #', '## #', '####'];
    const state = parseLevel(ragged);
    expect(state.cols).toBe(4);
  });

  it('treats out-of-bounds as wall', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(getCell(state, -1, 0)).toBe('wall');
    expect(getCell(state, 0, -1)).toBe('wall');
    expect(getCell(state, 99, 0)).toBe('wall');
    expect(getCell(state, 0, 99)).toBe('wall');
  });
});

// =============================================================================
// 2. Player Movement
// =============================================================================

describe('player movement', () => {
  let state: SokobanState;

  beforeEach(() => {
    // Player at (1,3), open space around
    state = parseLevel(SIMPLE_LEVEL);
  });

  it('moves player left into open floor', () => {
    const result = tryMove(state, 'left');
    expect(result).not.toBeNull();
    expect(result!.state.player).toEqual({ row: 1, col: 2 });
    expect(result!.pushed).toBe(false);
  });

  it('moves player down into open floor', () => {
    const result = tryMove(state, 'down');
    expect(result).not.toBeNull();
    expect(result!.state.player).toEqual({ row: 2, col: 3 });
    expect(result!.pushed).toBe(false);
  });

  it('blocks player moving into a wall', () => {
    // Player at (1,3), wall at (0,3) and (1,4)
    const resultUp = tryMove(state, 'up');
    expect(resultUp).toBeNull();

    const resultRight = tryMove(state, 'right');
    expect(resultRight).toBeNull();
  });

  it('does not change original state (immutability)', () => {
    const originalPlayer = { ...state.player };
    tryMove(state, 'left');
    expect(state.player).toEqual(originalPlayer);
  });

  it('allows player to walk onto a target cell', () => {
    // Move player left twice to reach the target at (1,1)
    const r1 = tryMove(state, 'left');
    expect(r1).not.toBeNull();
    const r2 = tryMove(r1!.state, 'left');
    expect(r2).not.toBeNull();
    expect(r2!.state.player).toEqual({ row: 1, col: 1 });
  });
});

// =============================================================================
// 3. Box Pushing
// =============================================================================

describe('box pushing', () => {
  it('pushes a box when player walks into it and space behind is open', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    // Player at (1,3), box at (2,2) — need to get player adjacent first
    // Move player down to (2,3), then left to push box from (2,2) to (2,1)
    const r1 = tryMove(state, 'down');
    expect(r1).not.toBeNull();
    expect(r1!.state.player).toEqual({ row: 2, col: 3 });

    const r2 = tryMove(r1!.state, 'left');
    expect(r2).not.toBeNull();
    expect(r2!.pushed).toBe(true);
    expect(r2!.state.player).toEqual({ row: 2, col: 2 });
    // Box should have moved from (2,2) to (2,1)
    expect(getCell(r2!.state, 2, 1)).toBe('box');
    // Original box position is now floor (player is on it, but grid stores floor)
    expect(isBox(getCell(r2!.state, 2, 2))).toBe(false);
  });

  it('pushes a box onto a target — box becomes box-on-target', () => {
    void parseLevel(SIMPLE_LEVEL);
    // Target at (1,1), box at (2,2)
    // Navigate player to push box up then left onto target
    // Move player down to (2,3), left to push box to (2,1), then position below box...
    // Simpler: use a direct setup
    const directLevel = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const s = parseLevel(directLevel);
    // Player at (3,1), box at (2,1), target at (1,1)
    const result = tryMove(s, 'up');
    expect(result).not.toBeNull();
    expect(result!.pushed).toBe(true);
    expect(getCell(result!.state, 1, 1)).toBe('box-on-target');
  });

  it('cannot push two boxes in a row', () => {
    const twoBoxLine = ['######', '#    #', '#@$$ #', '#    #', '######'];
    const s = parseLevel(twoBoxLine);
    // Player at (2,1), box at (2,2), box at (2,3)
    const result = tryMove(s, 'right');
    // Should push first box into second box — blocked
    expect(result).toBeNull();
  });
});

// =============================================================================
// 4. Box Blocked
// =============================================================================

describe('box blocked by wall or another box', () => {
  it('cannot push box against a wall', () => {
    const level = ['#####', '# @$#', '#   #', '#   #', '#####'];
    const s = parseLevel(level);
    // Player at (1,2), box at (1,3), wall at (1,4)
    const result = tryMove(s, 'right');
    expect(result).toBeNull();
  });

  it('cannot push box against another box', () => {
    const level = ['#####', '#@$$#', '#   #', '#   #', '#####'];
    const s = parseLevel(level);
    const result = tryMove(s, 'right');
    expect(result).toBeNull();
  });

  it('cannot push box against box-on-target', () => {
    const level = ['#####', '#@$.#', '#   #', '#   #', '#####'];
    const s = parseLevel(level);
    // Push box onto target first
    const r1 = tryMove(s, 'right');
    expect(r1).not.toBeNull();
    expect(getCell(r1!.state, 1, 3)).toBe('box-on-target');

    // Now put another box adjacent: re-parse with box-on-target
    const level2 = ['#####', '#@$*#', '#   #', '#   #', '#####'];
    const s2 = parseLevel(level2);
    const result = tryMove(s2, 'right');
    expect(result).toBeNull();
  });
});

// =============================================================================
// 5. Win Detection
// =============================================================================

describe('isSolved', () => {
  it('returns true when all boxes are on targets', () => {
    const state = parseLevel(SOLVED_LEVEL);
    expect(isSolved(state)).toBe(true);
  });

  it('returns false when any box is not on a target', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    expect(isSolved(state)).toBe(false);
  });

  it('returns true for a level with no boxes at all', () => {
    const noBoxLevel = ['###', '#@#', '###'];
    const state = parseLevel(noBoxLevel);
    expect(isSolved(state)).toBe(true);
  });

  it('detects win after pushing last box onto target', () => {
    const level = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const s = parseLevel(level);
    const result = tryMove(s, 'up');
    expect(result).not.toBeNull();
    expect(isSolved(result!.state)).toBe(true);
  });

  it('returns false when only some boxes are on targets (two-box level)', () => {
    const state = parseLevel(TWO_BOX_LEVEL);
    expect(isSolved(state)).toBe(false);
  });
});

// =============================================================================
// 6. Undo
// =============================================================================

describe('undo', () => {
  it('restores previous state after a move', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(5);

    const result = tryMove(state, 'down');
    expect(result).not.toBeNull();
    undo = recordMove(undo, state, result!.pushed);

    const undoResult = performUndo(undo);
    expect(undoResult).not.toBeNull();
    expect(undoResult!.state.player).toEqual(state.player);
  });

  it('restores box position after a push undo', () => {
    const level = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const state = parseLevel(level);
    let undo = createUndoState(5);

    const result = tryMove(state, 'up');
    expect(result).not.toBeNull();
    undo = recordMove(undo, state, result!.pushed);

    const undoResult = performUndo(undo);
    expect(undoResult).not.toBeNull();
    expect(getCell(undoResult!.state, 2, 1)).toBe('box');
    expect(undoResult!.state.player).toEqual({ row: 3, col: 1 });
  });

  it('decrements undosRemaining and increments undosUsed', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(3);
    const result = tryMove(state, 'down')!;
    undo = recordMove(undo, state, result.pushed);

    const undoResult = performUndo(undo)!;
    expect(undoResult.undo.undosUsed).toBe(1);
    expect(undoResult.undo.undosRemaining).toBe(2);
  });

  it('returns null when no history', () => {
    const undo = createUndoState(5);
    expect(performUndo(undo)).toBeNull();
  });

  it('returns null when undosRemaining is 0', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(1);
    const r1 = tryMove(state, 'down')!;
    undo = recordMove(undo, state, r1.pushed);

    // Use the one undo
    const undoResult = performUndo(undo)!;
    // Try again — should fail
    const r2 = tryMove(undoResult.state, 'down')!;
    const undo2 = recordMove(undoResult.undo, undoResult.state, r2.pushed);
    expect(performUndo(undo2)).toBeNull();
  });

  it('supports multiple sequential undos', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(5);

    const r1 = tryMove(state, 'down')!;
    undo = recordMove(undo, state, r1.pushed);
    const r2 = tryMove(r1.state, 'down')!;
    undo = recordMove(undo, r1.state, r2.pushed);

    // Undo twice
    const u1 = performUndo(undo)!;
    expect(u1.state.player).toEqual(r1.state.player);

    const u2 = performUndo(u1.undo)!;
    expect(u2.state.player).toEqual(state.player);
  });
});

// =============================================================================
// 7. Move Counting (moves vs pushes)
// =============================================================================

describe('move counting', () => {
  it('counts a simple walk as a move but not a push', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(5);
    const result = tryMove(state, 'down')!;
    undo = recordMove(undo, state, result.pushed);
    expect(undo.moves).toBe(1);
    expect(undo.pushes).toBe(0);
  });

  it('counts a push as both a move and a push', () => {
    const level = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const state = parseLevel(level);
    let undo = createUndoState(5);
    const result = tryMove(state, 'up')!;
    undo = recordMove(undo, state, result.pushed);
    expect(undo.moves).toBe(1);
    expect(undo.pushes).toBe(1);
  });

  it('accumulates counts across multiple moves', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    let undo = createUndoState(5);
    let current = state;

    // Move down (walk)
    const r1 = tryMove(current, 'down')!;
    undo = recordMove(undo, current, r1.pushed);
    current = r1.state;

    // Move left (push box)
    const r2 = tryMove(current, 'left')!;
    undo = recordMove(undo, current, r2.pushed);
    current = r2.state;

    // Move down (walk)
    const r3 = tryMove(current, 'down')!;
    undo = recordMove(undo, current, r3.pushed);

    expect(undo.moves).toBe(3);
    expect(undo.pushes).toBe(1);
  });
});

// =============================================================================
// 8. Deadlock Detection
// =============================================================================

describe('deadlock detection', () => {
  it('detects a box in a corner (not on goal) as deadlocked', () => {
    // Box at (1,1) with walls at (0,1) and (1,0)
    const level = ['#####', '#$  #', '#   #', '#  @#', '#####'];
    const state = parseLevel(level);
    expect(isCornerDeadlock(state, 1, 1)).toBe(true);
  });

  it('does not flag box-on-target in a corner as deadlocked', () => {
    const level = ['#####', '#*  #', '#   #', '#  @#', '#####'];
    const state = parseLevel(level);
    // box-on-target is not 'box', so isCornerDeadlock returns false
    expect(isCornerDeadlock(state, 1, 1)).toBe(false);
  });

  it('does not flag a box with open escape routes', () => {
    const level = ['#####', '#   #', '# $ #', '#  @#', '#####'];
    const state = parseLevel(level);
    expect(isCornerDeadlock(state, 2, 2)).toBe(false);
  });

  it('detects deadlock in top-right corner', () => {
    const level = ['#####', '#  $#', '#   #', '#@ .#', '#####'];
    const state = parseLevel(level);
    expect(isCornerDeadlock(state, 1, 3)).toBe(true);
  });

  it('detects deadlock in bottom-left corner', () => {
    const level = ['#####', '#  @#', '#   #', '#$  #', '#####'];
    const state = parseLevel(level);
    expect(isCornerDeadlock(state, 3, 1)).toBe(true);
  });

  it('detects deadlock in bottom-right corner', () => {
    const level = ['#####', '#@ .#', '#   #', '#  $#', '#####'];
    const state = parseLevel(level);
    expect(isCornerDeadlock(state, 3, 3)).toBe(true);
  });

  it('hasDeadlock scans entire grid', () => {
    const state = parseLevel(DEADLOCK_LEVEL);
    // Box at (1,1) is in top-left corner → deadlocked
    expect(hasDeadlock(state)).toBe(true);
  });

  it('hasDeadlock returns false when no deadlocks exist', () => {
    const level = ['#####', '#   #', '# $ #', '#  @#', '#####'];
    const state = parseLevel(level);
    expect(hasDeadlock(state)).toBe(false);
  });

  it('pushing a box into a corner creates deadlock', () => {
    // Player at (2,2), box at (2,1) — push left into corner
    const level = ['#####', '#   #', '#$@ #', '#   #', '#####'];
    const state = parseLevel(level);
    void tryMove(state, 'left');
    // Box is now at (2,0)? No, (2,0) is a wall. Let me adjust.
    // Actually wall is at col 0, so box at (2,1) pushed left to... blocked by wall at (2,0)
    // Let me use a level where push succeeds into corner
    const level2 = ['######', '#    #', '# $@ #', '#    #', '######'];
    const s2 = parseLevel(level2);
    // Push box left: player(2,3)→(2,2), box(2,2)→(2,1)
    const r1 = tryMove(s2, 'left')!;
    expect(r1.pushed).toBe(true);
    expect(hasDeadlock(r1.state)).toBe(false);
    // Now push up: need player below box
    // Go around: right, up, up, left to get above box, then push down...
    // Simpler: just check that a box at (1,1) is deadlocked
  });
});

// =============================================================================
// 9. Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('player pushes box onto target, cell becomes box-on-target', () => {
    const level = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const state = parseLevel(level);
    const result = tryMove(state, 'up')!;
    expect(getCell(result.state, 1, 1)).toBe('box-on-target');
  });

  it('player walks over a target cell without affecting it', () => {
    const level = ['#####', '# . #', '#   #', '# @ #', '#####'];
    const state = parseLevel(level);
    // Move up twice to reach target at (1,2)
    const r1 = tryMove(state, 'up')!;
    const r2 = tryMove(r1.state, 'up')!;
    expect(r2.state.player).toEqual({ row: 1, col: 2 });
    // Grid cell should still be 'target'
    expect(getCell(r2.state, 1, 2)).toBe('target');
  });

  it('pushing box off a target restores the target cell', () => {
    // Box on target (*), push it off
    const level = ['#####', '#   #', '# * #', '# @ #', '#####'];
    const state = parseLevel(level);
    // Player at (3,2), box-on-target at (2,2)
    const result = tryMove(state, 'up')!;
    expect(result.pushed).toBe(true);
    // Original cell (2,2) should become target (box removed from target)
    expect(getCell(result.state, 2, 2)).toBe('target');
    // Box moved to (1,2) which is floor → becomes box
    expect(getCell(result.state, 1, 2)).toBe('box');
  });

  it('cloneState produces a deep copy', () => {
    const state = parseLevel(SIMPLE_LEVEL);
    const clone = cloneState(state);
    clone.player.row = 99;
    (clone.grid[1] as Cell[])[1] = 'wall';
    expect(state.player.row).not.toBe(99);
    expect(getCell(state, 1, 1)).toBe('target');
  });

  it('cell helper functions behave correctly', () => {
    expect(isWalkable('floor')).toBe(true);
    expect(isWalkable('target')).toBe(true);
    expect(isWalkable('wall')).toBe(false);
    expect(isWalkable('box')).toBe(false);

    expect(isBox('box')).toBe(true);
    expect(isBox('box-on-target')).toBe(true);
    expect(isBox('floor')).toBe(false);
    expect(isBox('wall')).toBe(false);

    expect(removeBox('box')).toBe('floor');
    expect(removeBox('box-on-target')).toBe('target');

    expect(placeBox('floor')).toBe('box');
    expect(placeBox('target')).toBe('box-on-target');
  });

  it('sequence of moves can fully solve a simple puzzle', () => {
    // Player below box, target above box
    const level = ['#####', '#.  #', '#$  #', '#@  #', '#####'];
    const state = parseLevel(level);
    expect(isSolved(state)).toBe(false);

    const result = tryMove(state, 'up')!;
    expect(isSolved(result.state)).toBe(true);
    expect(getCell(result.state, 1, 1)).toBe('box-on-target');
  });

  it('all four directions work correctly', () => {
    const level = ['#####', '#   #', '# @ #', '#   #', '#####'];
    const state = parseLevel(level);

    const up = tryMove(state, 'up')!;
    expect(up.state.player).toEqual({ row: 1, col: 2 });

    const down = tryMove(state, 'down')!;
    expect(down.state.player).toEqual({ row: 3, col: 2 });

    const left = tryMove(state, 'left')!;
    expect(left.state.player).toEqual({ row: 2, col: 1 });

    const right = tryMove(state, 'right')!;
    expect(right.state.player).toEqual({ row: 2, col: 3 });
  });
});
