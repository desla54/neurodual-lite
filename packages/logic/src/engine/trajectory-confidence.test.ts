import { describe, expect, test } from 'bun:test';
import type { TrajectoryPoint } from '../types/trajectory';
import {
  computeTrajectoryConfidence,
  computeSlotShoppingPenalty,
  computeWrongDwellPenalty,
  computeDirectnessRatioFromPoints,
  type SlotEnter,
} from './trajectory-confidence';

// =============================================================================
// Test Helpers - Trajectory Generators
// =============================================================================

/** Create a perfectly straight horizontal line */
function makeStraightLine(count: number, durationMs: number): TrajectoryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i / (count - 1),
    y: 0,
    t: Math.round((durationMs / (count - 1)) * i),
  }));
}

/** Create a straight diagonal line */
function makeDiagonalLine(count: number, durationMs: number): TrajectoryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i / (count - 1),
    y: i / (count - 1),
    t: Math.round((durationMs / (count - 1)) * i),
  }));
}

/** Create a trajectory with a backtrack (goes back then forward) */
function makeBacktrackTrajectory(): TrajectoryPoint[] {
  return [
    { x: 0, y: 0, t: 0 },
    { x: 0.2, y: 0, t: 50 },
    { x: 0.4, y: 0, t: 100 },
    { x: 0.3, y: 0, t: 150 }, // backtrack start
    { x: 0.2, y: 0, t: 200 }, // backtrack continues
    { x: 0.3, y: 0, t: 250 },
    { x: 0.5, y: 0, t: 300 },
    { x: 0.7, y: 0, t: 350 },
    { x: 0.9, y: 0, t: 400 },
    { x: 1.0, y: 0, t: 450 },
  ];
}

/** Create a trajectory with a pause in the middle */
function makePauseTrajectory(): TrajectoryPoint[] {
  return [
    { x: 0, y: 0, t: 0 },
    { x: 0.2, y: 0, t: 50 },
    { x: 0.4, y: 0, t: 100 },
    { x: 0.5, y: 0, t: 150 },
    // Pause: 200ms of no movement
    { x: 0.5, y: 0, t: 200 },
    { x: 0.5, y: 0, t: 250 },
    { x: 0.5, y: 0, t: 300 },
    { x: 0.5, y: 0, t: 350 },
    // Resume
    { x: 0.7, y: 0, t: 400 },
    { x: 0.9, y: 0, t: 450 },
    { x: 1.0, y: 0, t: 500 },
  ];
}

/** Create a zigzag trajectory (high deviation) */
function makeZigzagTrajectory(): TrajectoryPoint[] {
  return [
    { x: 0, y: 0, t: 0 },
    { x: 0.2, y: 0.15, t: 50 },
    { x: 0.3, y: -0.1, t: 100 },
    { x: 0.4, y: 0.2, t: 150 },
    { x: 0.5, y: -0.15, t: 200 },
    { x: 0.6, y: 0.1, t: 250 },
    { x: 0.7, y: -0.05, t: 300 },
    { x: 0.8, y: 0.1, t: 350 },
    { x: 0.9, y: 0, t: 400 },
    { x: 1.0, y: 0, t: 450 },
  ];
}

/** Create a very hesitant trajectory (backtrack + pause + zigzag) */
function makeVeryHesitantTrajectory(): TrajectoryPoint[] {
  return [
    { x: 0, y: 0, t: 0 },
    { x: 0.1, y: 0.05, t: 50 },
    { x: 0.2, y: 0.1, t: 100 },
    { x: 0.15, y: 0.08, t: 150 }, // slight backtrack
    { x: 0.1, y: 0.05, t: 200 }, // more backtrack
    { x: 0.1, y: 0.05, t: 250 }, // pause
    { x: 0.1, y: 0.05, t: 300 }, // pause
    { x: 0.1, y: 0.05, t: 350 }, // pause
    { x: 0.2, y: 0.15, t: 400 },
    { x: 0.4, y: -0.1, t: 450 }, // deviation
    { x: 0.6, y: 0.2, t: 500 }, // deviation
    { x: 0.8, y: 0, t: 550 },
    { x: 1.0, y: 0.1, t: 600 },
  ];
}

// =============================================================================
// Core Algorithm Tests
// =============================================================================

describe('computeTrajectoryConfidence', () => {
  describe('basic functionality', () => {
    test('returns null when fewer than 6 points', () => {
      const points = makeStraightLine(5, 200);
      const result = computeTrajectoryConfidence({ points, directDistancePx: 200 });
      expect(result).toBeNull();
    });

    test('returns null when direct distance is too small', () => {
      const points = makeStraightLine(10, 500);
      const result = computeTrajectoryConfidence({ points, directDistancePx: 5 });
      expect(result).toBeNull();
    });

    test('returns a score between 0 and 100', () => {
      const points = makeStraightLine(10, 500);
      const result = computeTrajectoryConfidence({ points, directDistancePx: 200 });
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0);
      expect(result!.score).toBeLessThanOrEqual(100);
    });
  });

  describe('confident trajectories (high scores)', () => {
    test('straight horizontal line scores > 90', () => {
      const points = makeStraightLine(11, 500);
      const result = computeTrajectoryConfidence({ points, directDistancePx: 200 });
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(90);
    });

    test('straight diagonal line scores > 90', () => {
      const points = makeDiagonalLine(11, 500);
      const result = computeTrajectoryConfidence({ points, directDistancePx: 200 });
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(90);
    });

    test('fast straight drag scores higher than slow straight drag', () => {
      const fast = computeTrajectoryConfidence({
        points: makeStraightLine(11, 300),
        directDistancePx: 200,
      });
      const slow = computeTrajectoryConfidence({
        points: makeStraightLine(11, 800),
        directDistancePx: 200,
      });
      // Both should be high, but scores should be similar (speed doesn't penalize)
      expect(fast).not.toBeNull();
      expect(slow).not.toBeNull();
      expect(fast!.score).toBeGreaterThan(85);
      expect(slow!.score).toBeGreaterThan(85);
    });
  });

  describe('hesitant trajectories (low scores)', () => {
    test('backtrack trajectory scores lower than straight', () => {
      const straight = computeTrajectoryConfidence({
        points: makeStraightLine(10, 450),
        directDistancePx: 200,
      });
      const backtrack = computeTrajectoryConfidence({
        points: makeBacktrackTrajectory(),
        directDistancePx: 200,
      });
      expect(straight).not.toBeNull();
      expect(backtrack).not.toBeNull();
      expect(backtrack!.score).toBeLessThan(straight!.score);
    });

    test('pause trajectory scores lower than straight', () => {
      const straight = computeTrajectoryConfidence({
        points: makeStraightLine(11, 500),
        directDistancePx: 200,
      });
      const pause = computeTrajectoryConfidence({
        points: makePauseTrajectory(),
        directDistancePx: 200,
      });
      expect(straight).not.toBeNull();
      expect(pause).not.toBeNull();
      expect(pause!.score).toBeLessThan(straight!.score);
    });

    test('zigzag trajectory scores lower than straight', () => {
      const straight = computeTrajectoryConfidence({
        points: makeStraightLine(10, 450),
        directDistancePx: 200,
      });
      const zigzag = computeTrajectoryConfidence({
        points: makeZigzagTrajectory(),
        directDistancePx: 200,
      });
      expect(straight).not.toBeNull();
      expect(zigzag).not.toBeNull();
      expect(zigzag!.score).toBeLessThan(straight!.score);
    });

    test('very hesitant trajectory scores < 50', () => {
      const result = computeTrajectoryConfidence({
        points: makeVeryHesitantTrajectory(),
        directDistancePx: 200,
      });
      expect(result).not.toBeNull();
      expect(result!.score).toBeLessThan(50);
    });
  });

  describe('discrimination power', () => {
    test('confident vs hesitant gap is at least 40 points', () => {
      const confident = computeTrajectoryConfidence({
        points: makeStraightLine(11, 500),
        directDistancePx: 200,
      });
      const hesitant = computeTrajectoryConfidence({
        points: makeVeryHesitantTrajectory(),
        directDistancePx: 200,
      });
      expect(confident).not.toBeNull();
      expect(hesitant).not.toBeNull();
      const gap = confident!.score - hesitant!.score;
      expect(gap).toBeGreaterThan(40);
    });
  });
});

// =============================================================================
// Slot Shopping Penalty Tests
// =============================================================================

describe('computeSlotShoppingPenalty', () => {
  test('returns 0 when no slot enters', () => {
    expect(computeSlotShoppingPenalty(undefined, 0, 'position')).toBe(0);
    expect(computeSlotShoppingPenalty([], 0, 'position')).toBe(0);
  });

  test('returns 0 when only visiting the final slot', () => {
    const enters: SlotEnter[] = [
      { slot: 2, type: 'position', atMs: 0 },
      { slot: 2, type: 'position', atMs: 100 },
    ];
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(0);
  });

  test('penalizes visiting one wrong slot (15 points)', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'position', atMs: 0 },
      { slot: 2, type: 'position', atMs: 100 },
    ];
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(15);
  });

  test('penalizes visiting two wrong slots (30 points)', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'position', atMs: 0 },
      { slot: 1, type: 'position', atMs: 100 },
      { slot: 2, type: 'position', atMs: 200 },
    ];
    // 2 wrong slots = 30, plus 1 extra slot change = 10
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(40);
  });

  test('penalizes back-and-forth slot changes', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'position', atMs: 0 },
      { slot: 1, type: 'position', atMs: 100 },
      { slot: 0, type: 'position', atMs: 200 }, // back
      { slot: 1, type: 'position', atMs: 300 }, // forth
      { slot: 2, type: 'position', atMs: 400 }, // final
    ];
    // 2 wrong slots = 30, 4 slot changes (beyond 1) = 30
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(60);
  });

  test('ignores slots of different type', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'audio', atMs: 0 }, // different type - ignored
      { slot: 1, type: 'audio', atMs: 100 }, // different type - ignored
      { slot: 2, type: 'position', atMs: 200 }, // correct type, final slot
    ];
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(0);
  });

  test('only counts relevant type slots', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'position', atMs: 0 }, // wrong slot, same type
      { slot: 1, type: 'audio', atMs: 100 }, // different type - ignored
      { slot: 2, type: 'position', atMs: 200 }, // final slot
    ];
    // Only 1 wrong position slot = 15
    expect(computeSlotShoppingPenalty(enters, 2, 'position')).toBe(15);
  });

  test('caps penalty at 70', () => {
    const enters: SlotEnter[] = [
      { slot: 0, type: 'position', atMs: 0 },
      { slot: 1, type: 'position', atMs: 50 },
      { slot: 2, type: 'position', atMs: 100 },
      { slot: 0, type: 'position', atMs: 150 },
      { slot: 1, type: 'position', atMs: 200 },
      { slot: 2, type: 'position', atMs: 250 },
      { slot: 0, type: 'position', atMs: 300 },
      { slot: 3, type: 'position', atMs: 350 }, // final
    ];
    // Many wrong slots and changes, but capped at 70
    expect(computeSlotShoppingPenalty(enters, 3, 'position')).toBe(70);
  });
});

// =============================================================================
// Wrong Dwell Penalty Tests
// =============================================================================

describe('computeWrongDwellPenalty', () => {
  test('returns 0 for dwell <= 150ms', () => {
    expect(computeWrongDwellPenalty(0)).toBe(0);
    expect(computeWrongDwellPenalty(100)).toBe(0);
    expect(computeWrongDwellPenalty(150)).toBe(0);
  });

  test('returns proportional penalty for dwell > 150ms', () => {
    // 300ms dwell = (300-150)/300 * 20 = 10
    expect(computeWrongDwellPenalty(300)).toBeCloseTo(10, 1);
  });

  test('caps penalty at 20', () => {
    expect(computeWrongDwellPenalty(1000)).toBe(20);
    expect(computeWrongDwellPenalty(5000)).toBe(20);
  });
});

// =============================================================================
// Directness Ratio Tests
// =============================================================================

describe('computeDirectnessRatioFromPoints', () => {
  test('returns 1 for a straight line', () => {
    const points = makeStraightLine(10, 500);
    const ratio = computeDirectnessRatioFromPoints(points);
    expect(ratio).toBeCloseTo(1, 2);
  });

  test('returns < 1 for a zigzag path', () => {
    const points = makeZigzagTrajectory();
    const ratio = computeDirectnessRatioFromPoints(points);
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(0.4); // zigzag paths are quite inefficient
  });

  test('returns lower ratio for backtrack trajectory', () => {
    const straight = computeDirectnessRatioFromPoints(makeStraightLine(10, 450));
    const backtrack = computeDirectnessRatioFromPoints(makeBacktrackTrajectory());
    expect(backtrack).toBeLessThan(straight);
  });
});

// =============================================================================
// Integration with Slot Shopping
// =============================================================================

describe('trajectory confidence with slot shopping', () => {
  test('slot shopping significantly reduces score', () => {
    const points = makeStraightLine(11, 500);

    const noShopping = computeTrajectoryConfidence({
      points,
      directDistancePx: 200,
      slotEnters: [{ slot: 2, type: 'position', atMs: 0 }],
      finalSlot: 2,
      proposalType: 'position',
    });

    const withShopping = computeTrajectoryConfidence({
      points,
      directDistancePx: 200,
      slotEnters: [
        { slot: 0, type: 'position', atMs: 0 },
        { slot: 1, type: 'position', atMs: 100 },
        { slot: 2, type: 'position', atMs: 200 },
      ],
      finalSlot: 2,
      proposalType: 'position',
    });

    expect(noShopping).not.toBeNull();
    expect(withShopping).not.toBeNull();
    // Shopping penalty should reduce score by at least 30 points
    expect(noShopping!.score - withShopping!.score).toBeGreaterThan(30);
  });

  test('passing through other-type slots does not penalize', () => {
    const points = makeStraightLine(11, 500);

    const result = computeTrajectoryConfidence({
      points,
      directDistancePx: 200,
      slotEnters: [
        { slot: 0, type: 'audio', atMs: 0 }, // other type
        { slot: 1, type: 'audio', atMs: 100 }, // other type
        { slot: 2, type: 'position', atMs: 200 }, // correct type, final
      ],
      finalSlot: 2,
      proposalType: 'position',
    });

    expect(result).not.toBeNull();
    // Should still be high - no penalty for passing through audio slots
    expect(result!.score).toBeGreaterThan(90);
  });
});
