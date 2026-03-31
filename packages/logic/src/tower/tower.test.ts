import { describe, expect, test } from 'bun:test';

import {
  TOWER_MAX_DISTANCE,
  TOWER_STATE_COUNT,
  applyTowerMove,
  buildTowerTrainingSession,
  evaluateTowerPuzzle,
  generateTowerPuzzle,
  getTowerHintMove,
  isTowerPegsEqual,
  listTowerValidMoves,
  serializeTowerPegs,
  solveTowerPuzzle,
  summarizeTowerSession,
} from './index';

describe('Tower catalog', () => {
  test('enumerates the full 3-ball state space', () => {
    expect(TOWER_STATE_COUNT).toBe(36);
    expect(TOWER_MAX_DISTANCE).toBe(8);
  });

  test('lists legal top-disc moves only', () => {
    const moves = listTowerValidMoves([['red', 'blue'], ['green'], []]);
    const serialized = moves.map((move) => `${move.disc}:${move.fromPeg}->${move.toPeg}`).sort();

    expect(serialized).toEqual(['blue:0->1', 'blue:0->2', 'green:1->0', 'green:1->2']);
  });
});

describe('Tower solver', () => {
  test('finds the shortest path for a known 2-move puzzle', () => {
    const solution = solveTowerPuzzle(
      [['red', 'blue', 'green'], [], []],
      [['red'], ['blue'], ['green']],
    );

    expect(solution).not.toBeNull();
    expect(solution?.optimalMoves).toBe(2);
    expect(solution?.moves).toHaveLength(2);
  });

  test('hint move matches the first step of the optimal solution', () => {
    const start = [['red', 'blue', 'green'], [], []] as const;
    const target = [['red'], ['blue'], ['green']] as const;
    const solution = solveTowerPuzzle(
      [[...start[0]], [...start[1]], [...start[2]]],
      [[...target[0]], [...target[1]], [...target[2]]],
    );
    const hint = getTowerHintMove(
      [[...start[0]], [...start[1]], [...start[2]]],
      [[...target[0]], [...target[1]], [...target[2]]],
    );

    expect(hint).toEqual(solution?.moves[0] ?? null);
  });

  test('applies a move without mutating the source state', () => {
    const initial = [['red', 'blue'], ['green'], []] as const;
    const next = applyTowerMove([[...initial[0]], [...initial[1]], [...initial[2]]], {
      fromPeg: 0,
      toPeg: 2,
    });

    expect(initial).toEqual([['red', 'blue'], ['green'], []]);
    expect(next).toEqual([['red'], ['green'], ['blue']]);
  });
});

describe('Tower generation', () => {
  test('creates deterministic exact-distance puzzles', () => {
    const puzzleA = generateTowerPuzzle({ seed: 'tower-seed', exactMoves: 6 });
    const puzzleB = generateTowerPuzzle({ seed: 'tower-seed', exactMoves: 6 });

    expect(serializeTowerPegs(puzzleA.start)).toBe(serializeTowerPegs(puzzleB.start));
    expect(serializeTowerPegs(puzzleA.target)).toBe(serializeTowerPegs(puzzleB.target));
    expect(puzzleA.optimalMoves).toBe(6);
    expect(puzzleB.optimalMoves).toBe(6);
  });

  test('builds a progressive standard session with unique puzzle pairs', () => {
    const session = buildTowerTrainingSession({
      seed: 'session-seed',
      profileId: 'standard',
    });

    expect(session.profile.puzzleCount).toBe(12);
    expect(session.puzzles).toHaveLength(12);
    expect(session.puzzles[0]?.optimalMoves).toBe(2);
    expect(session.puzzles[session.puzzles.length - 1]?.optimalMoves).toBe(7);
    expect(session.puzzles.some((puzzle) => puzzle.challenge === 'memory')).toBe(true);
    expect(session.puzzles.some((puzzle) => puzzle.challenge === 'expert')).toBe(true);

    const pairKeys = new Set(
      session.puzzles.map((puzzle) => `${puzzle.startKey}->${puzzle.targetKey}`),
    );
    expect(pairKeys.size).toBe(session.puzzles.length);
  });

  test('supports explicit challenge mode and custom puzzle count', () => {
    const session = buildTowerTrainingSession({
      seed: 'memory-seed',
      profileId: 'rookie',
      puzzleCount: 8,
      challengeMode: 'memory',
    });

    expect(session.puzzles).toHaveLength(8);
    expect(session.puzzles.every((puzzle) => puzzle.challenge === 'memory')).toBe(true);
    expect(session.puzzles.every((puzzle) => puzzle.goalVisibleDuringPlay === false)).toBe(true);
  });

  test('supports 4 and 5 element sessions', { timeout: 30_000 }, () => {
    const session4 = buildTowerTrainingSession({
      seed: 'tower-4',
      discCount: 4,
      challengeMode: 'classic',
    });
    const session5 = buildTowerTrainingSession({
      seed: 'tower-5',
      discCount: 5,
      challengeMode: 'classic',
      puzzleCount: 12,
    });

    expect(session4.puzzles[0]?.discCount).toBe(4);
    expect(session4.puzzles.some((puzzle) => puzzle.optimalMoves >= 9)).toBe(true);
    expect(session5.puzzles).toHaveLength(12);
    expect(session5.puzzles[0]?.discCount).toBe(5);
    expect(session5.puzzles.some((puzzle) => puzzle.optimalMoves >= 11)).toBe(true);
  });
});

describe('Tower scoring', () => {
  test('rewards clean optimal play more than assisted play', () => {
    const clean = evaluateTowerPuzzle({
      optimalMoves: 5,
      moves: 5,
      totalTimeMs: 12000,
      planningTimeMs: 2500,
      invalidMoves: 0,
      undosUsed: 0,
      resetsUsed: 0,
      hintsUsed: 0,
      peeksUsed: 0,
      solved: true,
      challenge: 'precision',
    });
    const assisted = evaluateTowerPuzzle({
      optimalMoves: 5,
      moves: 7,
      totalTimeMs: 18000,
      planningTimeMs: 5000,
      invalidMoves: 2,
      undosUsed: 1,
      resetsUsed: 1,
      hintsUsed: 1,
      peeksUsed: 1,
      solved: true,
      challenge: 'memory',
    });

    expect(clean.score).toBeGreaterThan(assisted.score);
    expect(clean.stars).toBe(3);
    expect(assisted.stars).toBeGreaterThanOrEqual(1);
  });

  test('summarizes multiple attempts consistently', () => {
    const summary = summarizeTowerSession([
      {
        optimalMoves: 4,
        moves: 4,
        totalTimeMs: 9000,
        planningTimeMs: 1800,
        invalidMoves: 0,
        undosUsed: 0,
        resetsUsed: 0,
        hintsUsed: 0,
        peeksUsed: 0,
        solved: true,
        challenge: 'classic',
      },
      {
        optimalMoves: 6,
        moves: 8,
        totalTimeMs: 22000,
        planningTimeMs: 5200,
        invalidMoves: 1,
        undosUsed: 1,
        resetsUsed: 0,
        hintsUsed: 1,
        peeksUsed: 0,
        solved: true,
        challenge: 'memory',
      },
    ]);

    expect(summary.puzzleCount).toBe(2);
    expect(summary.optimalCount).toBe(1);
    expect(summary.totalExtraMoves).toBe(2);
    expect(summary.totalHintsUsed).toBe(1);
    expect(summary.totalStars).toBeGreaterThan(0);
  });

  test('state equality helper compares peg order and contents', () => {
    expect(isTowerPegsEqual([['red'], ['blue'], ['green']], [['red'], ['blue'], ['green']])).toBe(
      true,
    );
    expect(isTowerPegsEqual([['red'], ['blue'], ['green']], [['blue'], ['red'], ['green']])).toBe(
      false,
    );
  });
});
