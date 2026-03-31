/**
 * Tests for Spot the Diff game logic.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getLevelConfig,
  generateBaseGrid,
  generateDiffGrid,
  pickRandomPositions,
  randomShape,
  randomColor,
  createTrialState,
  tapCell,
  timeoutTrial,
  buildTrialResult,
  computeFeedback,
  computeSessionSummary,
  SHAPES,
  COLORS,
  TIME_LIMIT_MS,
  type SpotDiffTrialState,
  type TrialResult,
} from './spot-diff';

// Deterministic RNG for reproducible tests
function makeSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// =============================================================================
// Level Config
// =============================================================================

describe('getLevelConfig', () => {
  it('level 1: 4x4 grid with 2 differences', () => {
    const config = getLevelConfig(1);
    expect(config.gridSize).toBe(4);
    expect(config.diffCount).toBe(2);
  });

  it('level 2: 5x5 grid with 3 differences', () => {
    const config = getLevelConfig(2);
    expect(config.gridSize).toBe(5);
    expect(config.diffCount).toBe(3);
  });

  it('level 3: 5x5 grid with 4 differences', () => {
    const config = getLevelConfig(3);
    expect(config.gridSize).toBe(5);
    expect(config.diffCount).toBe(4);
  });

  it('level 0 or below defaults to level 1', () => {
    expect(getLevelConfig(0)).toEqual({ gridSize: 4, diffCount: 2 });
    expect(getLevelConfig(-1)).toEqual({ gridSize: 4, diffCount: 2 });
  });

  it('level 4+ defaults to level 3 config', () => {
    expect(getLevelConfig(4)).toEqual({ gridSize: 5, diffCount: 4 });
    expect(getLevelConfig(10)).toEqual({ gridSize: 5, diffCount: 4 });
  });
});

// =============================================================================
// Grid Generation
// =============================================================================

describe('generateBaseGrid', () => {
  it('produces a grid of the correct size', () => {
    const grid = generateBaseGrid(4);
    expect(grid).toHaveLength(4);
    for (const row of grid) {
      expect(row).toHaveLength(4);
    }
  });

  it('all cells have valid shape and color', () => {
    const grid = generateBaseGrid(5);
    for (const row of grid) {
      for (const cell of row) {
        expect(SHAPES).toContain(cell.shape);
        expect(COLORS).toContain(cell.color);
      }
    }
  });

  it('deterministic with seeded rng', () => {
    const a = generateBaseGrid(4, makeSeededRng(42));
    const b = generateBaseGrid(4, makeSeededRng(42));
    expect(a).toEqual(b);
  });
});

describe('pickRandomPositions', () => {
  it('returns the correct number of positions', () => {
    const positions = pickRandomPositions(4, 3);
    expect(positions).toHaveLength(3);
  });

  it('all positions are within grid bounds', () => {
    const positions = pickRandomPositions(5, 10);
    for (const [r, c] of positions) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(5);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(5);
    }
  });

  it('all positions are unique', () => {
    const positions = pickRandomPositions(4, 8);
    const keys = positions.map(([r, c]) => `${r},${c}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns all positions if count equals grid size squared', () => {
    const positions = pickRandomPositions(3, 9);
    expect(positions).toHaveLength(9);
    expect(new Set(positions.map(([r, c]) => `${r},${c}`)).size).toBe(9);
  });
});

// =============================================================================
// Difference generation
// =============================================================================

describe('generateDiffGrid', () => {
  it('creates the correct number of differences', () => {
    const base = generateBaseGrid(4, makeSeededRng(10));
    const { diffPositions } = generateDiffGrid(base, 2, makeSeededRng(20));
    expect(diffPositions.size).toBe(2);
  });

  it('creates 3 differences for level 2', () => {
    const base = generateBaseGrid(5, makeSeededRng(10));
    const { diffPositions } = generateDiffGrid(base, 3, makeSeededRng(20));
    expect(diffPositions.size).toBe(3);
  });

  it('creates 4 differences for level 3', () => {
    const base = generateBaseGrid(5, makeSeededRng(10));
    const { diffPositions } = generateDiffGrid(base, 4, makeSeededRng(20));
    expect(diffPositions.size).toBe(4);
  });

  it('diff cells actually differ from base', () => {
    const rng = makeSeededRng(42);
    const base = generateBaseGrid(5, rng);
    const { diffGrid, diffPositions } = generateDiffGrid(base, 4, makeSeededRng(99));

    for (const key of diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const baseCell = base[r]![c]!;
      const diffCell = diffGrid[r]![c]!;
      // At least shape OR color must differ
      const shapeDiff = baseCell.shape !== diffCell.shape;
      const colorDiff = baseCell.color !== diffCell.color;
      expect(shapeDiff || colorDiff).toBe(true);
    }
  });

  it('non-diff cells are identical to base', () => {
    const base = generateBaseGrid(4, makeSeededRng(42));
    const { diffGrid, diffPositions } = generateDiffGrid(base, 2, makeSeededRng(99));

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!diffPositions.has(`${r},${c}`)) {
          expect(diffGrid[r]![c]).toEqual(base[r]![c]);
        }
      }
    }
  });

  it('difference types: each diff changes either shape or color, not both', () => {
    const rng = makeSeededRng(42);
    const base = generateBaseGrid(5, rng);
    const { diffGrid, diffPositions } = generateDiffGrid(base, 4, makeSeededRng(99));

    for (const key of diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const baseCell = base[r]![c]!;
      const diffCell = diffGrid[r]![c]!;
      const shapeDiff = baseCell.shape !== diffCell.shape;
      const colorDiff = baseCell.color !== diffCell.color;
      // Exactly one of shape or color changed (50/50 branch)
      expect(shapeDiff !== colorDiff).toBe(true);
    }
  });

  it('difference types: shape change preserves color', () => {
    // Run many trials to find at least one shape change
    const rng = makeSeededRng(10);
    const base = generateBaseGrid(5, rng);
    const { diffGrid, diffPositions } = generateDiffGrid(base, 4, makeSeededRng(20));

    let foundShapeChange = false;
    for (const key of diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const baseCell = base[r]![c]!;
      const diffCell = diffGrid[r]![c]!;
      if (baseCell.shape !== diffCell.shape) {
        expect(diffCell.color).toBe(baseCell.color);
        foundShapeChange = true;
      }
    }
    // With 4 diffs and 50/50 odds, at least one shape change is very likely
    expect(foundShapeChange).toBe(true);
  });

  it('difference types: color change preserves shape', () => {
    const rng = makeSeededRng(10);
    const base = generateBaseGrid(5, rng);
    const { diffGrid, diffPositions } = generateDiffGrid(base, 4, makeSeededRng(20));

    let foundColorChange = false;
    for (const key of diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const baseCell = base[r]![c]!;
      const diffCell = diffGrid[r]![c]!;
      if (baseCell.color !== diffCell.color) {
        expect(diffCell.shape).toBe(baseCell.shape);
        foundColorChange = true;
      }
    }
    expect(foundColorChange).toBe(true);
  });
});

// =============================================================================
// Hit detection
// =============================================================================

describe('tapCell — hit detection', () => {
  let state: SpotDiffTrialState;

  beforeEach(() => {
    state = createTrialState(4, 2, makeSeededRng(42));
  });

  it('tapping a diff cell returns correct', () => {
    const diffKey = [...state.diffPositions][0]!;
    const [r, c] = diffKey.split(',').map(Number) as [number, number];
    const { result } = tapCell(state, r, c);
    expect(result.type).toBe('correct');
  });

  it('tapping a diff cell adds it to selected', () => {
    const diffKey = [...state.diffPositions][0]!;
    const [r, c] = diffKey.split(',').map(Number) as [number, number];
    const { state: newState } = tapCell(state, r, c);
    expect(newState.selectedCells.has(diffKey)).toBe(true);
  });
});

// =============================================================================
// Miss detection
// =============================================================================

describe('tapCell — miss detection', () => {
  let state: SpotDiffTrialState;

  beforeEach(() => {
    state = createTrialState(4, 2, makeSeededRng(42));
  });

  it('tapping outside any diff returns incorrect', () => {
    // Find a cell that is NOT a diff
    let nonDiffKey: string | null = null;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!state.diffPositions.has(`${r},${c}`)) {
          nonDiffKey = `${r},${c}`;
          break;
        }
      }
      if (nonDiffKey) break;
    }
    expect(nonDiffKey).not.toBeNull();
    const [r, c] = nonDiffKey!.split(',').map(Number) as [number, number];
    const { result, state: newState } = tapCell(state, r, c);
    expect(result.type).toBe('incorrect');
    expect(newState.wrongTapCount).toBe(state.wrongTapCount + 1);
  });

  it('wrong tap count increments with each incorrect tap', () => {
    let current = state;
    const nonDiffPositions: [number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!current.diffPositions.has(`${r},${c}`)) {
          nonDiffPositions.push([r, c]);
        }
      }
    }
    // Tap 3 wrong cells
    for (let i = 0; i < 3 && i < nonDiffPositions.length; i++) {
      const [r, c] = nonDiffPositions[i]!;
      const { state: next } = tapCell(current, r, c);
      current = next;
    }
    expect(current.wrongTapCount).toBe(3);
  });
});

// =============================================================================
// Deselection
// =============================================================================

describe('tapCell — deselection', () => {
  it('tapping an already-selected cell deselects it', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const diffKey = [...state.diffPositions][0]!;
    const [r, c] = diffKey.split(',').map(Number) as [number, number];

    // Select it
    const { state: selected } = tapCell(state, r, c);
    expect(selected.selectedCells.has(diffKey)).toBe(true);

    // Deselect it
    const { result, state: deselected } = tapCell(selected, r, c);
    expect(result.type).toBe('deselected');
    expect(deselected.selectedCells.has(diffKey)).toBe(false);
  });
});

// =============================================================================
// Completion detection
// =============================================================================

describe('completion detection', () => {
  it('allFound is true when all diffs are selected', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));

    const diffs = [...state.diffPositions];
    // Tap first diff
    const [r1, c1] = diffs[0]!.split(',').map(Number) as [number, number];
    const { state: s1, result: res1 } = tapCell(state, r1, c1);
    expect(res1.type).toBe('correct');
    if (res1.type === 'correct') expect(res1.allFound).toBe(false);

    // Tap second diff
    const [r2, c2] = diffs[1]!.split(',').map(Number) as [number, number];
    const { state: s2, result: res2 } = tapCell(s1, r2, c2);
    expect(res2.type).toBe('correct');
    if (res2.type === 'correct') expect(res2.allFound).toBe(true);
    expect(s2.allFound).toBe(true);
  });

  it('allFound is false with partial selection', () => {
    let state = createTrialState(5, 4, makeSeededRng(42));

    const diffs = [...state.diffPositions];
    // Only tap 2 out of 4
    for (let i = 0; i < 2; i++) {
      const [r, c] = diffs[i]!.split(',').map(Number) as [number, number];
      const { state: next } = tapCell(state, r, c);
      state = next;
    }
    expect(state.allFound).toBe(false);
  });
});

// =============================================================================
// Time limit
// =============================================================================

describe('time limit', () => {
  it('TIME_LIMIT_MS is 30 seconds', () => {
    expect(TIME_LIMIT_MS).toBe(30_000);
  });

  it('timeoutTrial marks the state as timed out', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const timedOut = timeoutTrial(state);
    expect(timedOut.timedOut).toBe(true);
    // Original state unchanged
    expect(state.timedOut).toBe(false);
  });

  it('timeout with partial finds preserves selected cells', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const diffKey = [...state.diffPositions][0]!;
    const [r, c] = diffKey.split(',').map(Number) as [number, number];

    // Find one diff
    const { state: partial } = tapCell(state, r, c);
    expect(partial.selectedCells.size).toBe(1);

    // Timeout
    const timedOut = timeoutTrial(partial);
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.selectedCells.size).toBe(1);
  });
});

// =============================================================================
// Feedback computation
// =============================================================================

describe('computeFeedback', () => {
  it('identifies found and missed diffs correctly', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const diffs = [...state.diffPositions];

    // Find only the first diff
    const [r, c] = diffs[0]!.split(',').map(Number) as [number, number];
    const { state: partial } = tapCell(state, r, c);

    const feedback = computeFeedback(partial);
    expect(feedback.foundSet.size).toBe(1);
    expect(feedback.missedSet.size).toBe(1);
    expect(feedback.foundSet.has(diffs[0]!)).toBe(true);
    expect(feedback.missedSet.has(diffs[1]!)).toBe(true);
  });

  it('all found: missedSet is empty', () => {
    let state = createTrialState(4, 2, makeSeededRng(42));
    for (const key of state.diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const { state: next } = tapCell(state, r, c);
      state = next;
    }

    const feedback = computeFeedback(state);
    expect(feedback.foundSet.size).toBe(2);
    expect(feedback.missedSet.size).toBe(0);
  });

  it('none found: foundSet is empty', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const feedback = computeFeedback(state);
    expect(feedback.foundSet.size).toBe(0);
    expect(feedback.missedSet.size).toBe(2);
  });
});

// =============================================================================
// Build trial result
// =============================================================================

describe('buildTrialResult', () => {
  it('builds correct result from trial state', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    // Find one diff
    const diffKey = [...state.diffPositions][0]!;
    const [r, c] = diffKey.split(',').map(Number) as [number, number];
    const { state: partial } = tapCell(state, r, c);

    const result = buildTrialResult(partial, 3, 15000);
    expect(result.trialIndex).toBe(3);
    expect(result.gridSize).toBe(4);
    expect(result.diffCount).toBe(2);
    expect(result.foundCount).toBe(1);
    expect(result.timeMs).toBe(15000);
    expect(result.accuracy).toBe(0.5);
  });

  it('perfect trial has accuracy 1', () => {
    let state = createTrialState(4, 2, makeSeededRng(42));
    for (const key of state.diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const { state: next } = tapCell(state, r, c);
      state = next;
    }
    const result = buildTrialResult(state, 0, 5000);
    expect(result.accuracy).toBe(1);
    expect(result.foundCount).toBe(2);
  });

  it('zero found has accuracy 0', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const result = buildTrialResult(state, 0, 30000);
    expect(result.accuracy).toBe(0);
    expect(result.foundCount).toBe(0);
  });
});

// =============================================================================
// Session scoring
// =============================================================================

describe('computeSessionSummary', () => {
  it('computes accuracy as percentage of total diffs found', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        gridSize: 4,
        diffCount: 2,
        foundCount: 2,
        wrongTaps: 0,
        timeMs: 5000,
        accuracy: 1,
      },
      {
        trialIndex: 1,
        gridSize: 4,
        diffCount: 2,
        foundCount: 1,
        wrongTaps: 1,
        timeMs: 10000,
        accuracy: 0.5,
      },
    ];
    const summary = computeSessionSummary(results);
    expect(summary.accuracy).toBe(75); // 3/4 = 75%
    expect(summary.totalFound).toBe(3);
    expect(summary.totalDiffs).toBe(4);
  });

  it('perfectRounds counts only rounds where all diffs found', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        gridSize: 4,
        diffCount: 2,
        foundCount: 2,
        wrongTaps: 0,
        timeMs: 5000,
        accuracy: 1,
      },
      {
        trialIndex: 1,
        gridSize: 4,
        diffCount: 2,
        foundCount: 1,
        wrongTaps: 0,
        timeMs: 10000,
        accuracy: 0.5,
      },
      {
        trialIndex: 2,
        gridSize: 4,
        diffCount: 2,
        foundCount: 2,
        wrongTaps: 3,
        timeMs: 8000,
        accuracy: 1,
      },
    ];
    const summary = computeSessionSummary(results);
    expect(summary.perfectRounds).toBe(2);
  });

  it('avgTimeMs is the mean of all trial times', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        gridSize: 4,
        diffCount: 2,
        foundCount: 2,
        wrongTaps: 0,
        timeMs: 4000,
        accuracy: 1,
      },
      {
        trialIndex: 1,
        gridSize: 4,
        diffCount: 2,
        foundCount: 2,
        wrongTaps: 0,
        timeMs: 6000,
        accuracy: 1,
      },
    ];
    const summary = computeSessionSummary(results);
    expect(summary.avgTimeMs).toBe(5000);
  });

  it('handles empty results', () => {
    const summary = computeSessionSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.perfectRounds).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.totalFound).toBe(0);
    expect(summary.totalDiffs).toBe(0);
    expect(summary.avgTimeMs).toBe(0);
  });

  it('all perfect gives 100% accuracy', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        gridSize: 5,
        diffCount: 3,
        foundCount: 3,
        wrongTaps: 0,
        timeMs: 5000,
        accuracy: 1,
      },
      {
        trialIndex: 1,
        gridSize: 5,
        diffCount: 3,
        foundCount: 3,
        wrongTaps: 0,
        timeMs: 7000,
        accuracy: 1,
      },
      {
        trialIndex: 2,
        gridSize: 5,
        diffCount: 3,
        foundCount: 3,
        wrongTaps: 0,
        timeMs: 6000,
        accuracy: 1,
      },
    ];
    const summary = computeSessionSummary(results);
    expect(summary.accuracy).toBe(100);
    expect(summary.perfectRounds).toBe(3);
  });

  it('all missed gives 0% accuracy', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        gridSize: 4,
        diffCount: 2,
        foundCount: 0,
        wrongTaps: 5,
        timeMs: 30000,
        accuracy: 0,
      },
      {
        trialIndex: 1,
        gridSize: 4,
        diffCount: 2,
        foundCount: 0,
        wrongTaps: 3,
        timeMs: 30000,
        accuracy: 0,
      },
    ];
    const summary = computeSessionSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.perfectRounds).toBe(0);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('edge cases', () => {
  it('randomShape always returns a valid shape', () => {
    for (let i = 0; i < 100; i++) {
      expect(SHAPES).toContain(randomShape());
    }
  });

  it('randomColor always returns a valid color', () => {
    for (let i = 0; i < 100; i++) {
      expect(COLORS).toContain(randomColor());
    }
  });

  it('generateDiffGrid does not mutate the base grid', () => {
    const base = generateBaseGrid(4, makeSeededRng(42));
    const baseCopy = base.map((row) => row.map((cell) => ({ ...cell })));
    generateDiffGrid(base, 3, makeSeededRng(99));
    expect(base).toEqual(baseCopy);
  });

  it('finding all differences quickly produces correct result', () => {
    let state = createTrialState(4, 2, makeSeededRng(42));

    // Find all diffs immediately
    for (const key of state.diffPositions) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const { state: next } = tapCell(state, r, c);
      state = next;
    }

    const result = buildTrialResult(state, 0, 500); // very fast
    expect(result.foundCount).toBe(2);
    expect(result.accuracy).toBe(1);
    expect(result.timeMs).toBe(500);
  });

  it('timeout with zero finds', () => {
    const state = createTrialState(4, 2, makeSeededRng(42));
    const timedOut = timeoutTrial(state);
    const result = buildTrialResult(timedOut, 0, 30000);
    expect(result.foundCount).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.timeMs).toBe(30000);
  });

  it('timeout with partial finds preserves count', () => {
    let state = createTrialState(5, 4, makeSeededRng(42));
    // Find 2 out of 4
    const diffs = [...state.diffPositions];
    for (let i = 0; i < 2; i++) {
      const [r, c] = diffs[i]!.split(',').map(Number) as [number, number];
      const { state: next } = tapCell(state, r, c);
      state = next;
    }
    const timedOut = timeoutTrial(state);
    const result = buildTrialResult(timedOut, 0, 30000);
    expect(result.foundCount).toBe(2);
    expect(result.diffCount).toBe(4);
    expect(result.accuracy).toBe(0.5);
  });

  it('full session simulation with mixed results', () => {
    const results: TrialResult[] = [];

    // Round 1: perfect, fast
    results.push({
      trialIndex: 0,
      gridSize: 4,
      diffCount: 2,
      foundCount: 2,
      wrongTaps: 0,
      timeMs: 3000,
      accuracy: 1,
    });
    // Round 2: partial, with wrong taps
    results.push({
      trialIndex: 1,
      gridSize: 4,
      diffCount: 2,
      foundCount: 1,
      wrongTaps: 3,
      timeMs: 15000,
      accuracy: 0.5,
    });
    // Round 3: timeout, nothing found
    results.push({
      trialIndex: 2,
      gridSize: 4,
      diffCount: 2,
      foundCount: 0,
      wrongTaps: 5,
      timeMs: 30000,
      accuracy: 0,
    });
    // Round 4: perfect
    results.push({
      trialIndex: 3,
      gridSize: 4,
      diffCount: 2,
      foundCount: 2,
      wrongTaps: 1,
      timeMs: 8000,
      accuracy: 1,
    });

    const summary = computeSessionSummary(results);
    expect(summary.totalTrials).toBe(4);
    expect(summary.totalDiffs).toBe(8);
    expect(summary.totalFound).toBe(5);
    expect(summary.accuracy).toBe(63); // Math.round(5/8 * 100) = 63
    expect(summary.perfectRounds).toBe(2);
    expect(summary.avgTimeMs).toBe(14000); // (3000+15000+30000+8000)/4
  });
});
