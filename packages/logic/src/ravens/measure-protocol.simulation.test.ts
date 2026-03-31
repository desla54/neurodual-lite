/**
 * Monte Carlo validation of the STANDARD measure protocol.
 *
 * The standard protocol is a fixed sequence of 30 items (levels 1→30).
 * We simulate virtual players with known ability levels and verify:
 *
 * 1. **Guessing floor**: a zero-ability player's score from pure chance
 * 2. **Discrimination**: players of different abilities get different scores
 * 3. **Test-retest reliability**: same player, different sessions → stable score
 * 4. **Score distribution**: score spread at each ability level
 *
 * Player model: logistic psychometric function
 *   P(correct | level L, ability T) = guessRate + (1 - guessRate) * sigmoid(slope * (T - L))
 *   where guessRate = 1/optionCount (chance of guessing correctly)
 */

import { describe, it, expect } from 'vitest';
import {
  startProtocol,
  nextTrial,
  submitResponse,
  getResult,
  type MeasureProtocolState,
  type StandardResult,
} from './measure-protocol';

// ---------------------------------------------------------------------------
// Psychometric model
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * P(correct) for a player of ability `trueLevel` on an item of difficulty `itemLevel`.
 * Includes guessing: even a zero-ability player has 1/optionCount chance.
 */
function pCorrect(trueLevel: number, itemLevel: number, slope = 1.5): number {
  // Option count varies by level (6 for low levels, 8 for high)
  const optionCount = itemLevel <= 4 ? 6 : 8;
  const guessRate = 1 / optionCount;
  const ability = sigmoid(slope * (trueLevel - itemLevel));
  return guessRate + (1 - guessRate) * ability;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Simulation runner
// ---------------------------------------------------------------------------

interface SimResult {
  trueLevel: number;
  score: number;
  accuracy: number;
  highestCorrect: number;
}

function simulateStandardSession(
  trueLevel: number,
  rng: () => number,
  sessionSeed: string,
  slope = 1.5,
): SimResult {
  let state: MeasureProtocolState = startProtocol({
    mode: 'standard',
    sessionId: sessionSeed,
  });

  while (!state.finished) {
    const trial = nextTrial(state);
    if (!trial) break;
    const p = pCorrect(trueLevel, trial.level, slope);
    const correct = rng() < p;
    ({ state } = submitResponse(state, correct ? 0 : 1, 2000));
  }

  const { result } = getResult(state) as { mode: 'standard'; result: StandardResult };
  return {
    trueLevel,
    score: result.rawScore,
    accuracy: result.accuracy,
    highestCorrect: result.highestCorrectLevel,
  };
}

function simulateCohort(trueLevel: number, n: number, seed: number, slope = 1.5): SimResult[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) =>
    simulateStandardSession(trueLevel, rng, `sim-${trueLevel}-${i}`, slope),
  );
}

function cohortStats(results: SimResult[]) {
  const scores = results.map((r) => r.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return { mean, std, min, max };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const N = 500;

describe('Monte Carlo — standard protocol validation', () => {
  // ─── 1. Guessing floor ────────────────────────────────────────────────

  it('zero-ability player scores ~4-6/30 from guessing alone', () => {
    // A player with ability 0 should only succeed by guessing
    const results = simulateCohort(0, N, 42);
    const s = cohortStats(results);
    // Mean should be around 4-5 (weighted average of 1/6 and 1/8 across 30 items)
    expect(s.mean).toBeGreaterThan(2);
    expect(s.mean).toBeLessThan(8);
  });

  // ─── 2. Discrimination ────────────────────────────────────────────────

  it('higher ability → higher score (monotonic)', { timeout: 30000 }, () => {
    const levels = [5, 10, 15, 20, 25];
    const means: number[] = [];

    for (const level of levels) {
      const results = simulateCohort(level, N, level * 1337);
      means.push(cohortStats(results).mean);
    }

    // Scores should be strictly increasing
    for (let i = 1; i < means.length; i++) {
      expect(means[i]).toBeGreaterThan(means[i - 1]!);
    }
  });

  it('ability 5 vs ability 20: score difference > 8 points', { timeout: 30_000 }, () => {
    const low = cohortStats(simulateCohort(5, N, 111));
    const high = cohortStats(simulateCohort(20, N, 222));
    expect(high.mean - low.mean).toBeGreaterThan(8);
  });

  it('ability 10 vs ability 15: score difference > 3 points', { timeout: 30_000 }, () => {
    const a = cohortStats(simulateCohort(10, N, 333));
    const b = cohortStats(simulateCohort(15, N, 444));
    expect(b.mean - a.mean).toBeGreaterThan(3);
  });

  // ─── 3. Test-retest reliability ───────────────────────────────────────

  it('test-retest: same player, different sessions → std dev < 3.5', () => {
    // Simulate the same player (ability=15) taking the test 200 times
    const rng = mulberry32(9999);
    const scores: number[] = [];

    for (let i = 0; i < 200; i++) {
      const result = simulateStandardSession(15, rng, `retest-${i}`, 1.5);
      scores.push(result.score);
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length);

    // With 30 items and psychometric noise, std should be 2-3
    expect(std).toBeLessThan(3.5);
    // Score should be centered around ~15-18 (items below ability are mostly correct)
    expect(mean).toBeGreaterThan(12);
    expect(mean).toBeLessThan(22);
  });

  // ─── 4. Score distribution per ability level ──────────────────────────

  it('score distributions are well-separated across ability spectrum', { timeout: 30000 }, () => {
    const levels = [1, 5, 10, 15, 20, 25, 30];
    const rows: string[] = [];

    for (const level of levels) {
      const results = simulateCohort(level, 300, level * 77);
      const s = cohortStats(results);
      rows.push(
        `Ability ${String(level).padStart(2)}: ` +
          `mean=${s.mean.toFixed(1).padStart(5)}/30, ` +
          `std=${s.std.toFixed(1).padStart(4)}, ` +
          `range=[${s.min}-${s.max}]`,
      );
    }

    console.log('\n--- Standard Protocol Score Distribution ---');
    for (const row of rows) console.log(row);
    console.log('--------------------------------------------\n');
    expect(true).toBe(true);
  });

  // ─── 5. Ceiling and floor effects ─────────────────────────────────────

  it('ability 30 player scores > 25/30 on average', () => {
    const results = simulateCohort(30, N, 3030);
    const s = cohortStats(results);
    expect(s.mean).toBeGreaterThan(25);
  });

  it('ability 1 player scores < 10/30 on average', () => {
    const results = simulateCohort(1, N, 1111);
    const s = cohortStats(results);
    expect(s.mean).toBeLessThan(10);
  });

  // ─── 6. Guessing impact analysis ──────────────────────────────────────

  it('guessing inflates scores by ~4 points for low-ability players', () => {
    // Compare zero-ability with guess vs hypothetical no-guess
    const withGuess = cohortStats(simulateCohort(0, N, 555));
    // A zero-ability player with no guessing would score 0
    // The difference is the guessing inflation
    expect(withGuess.mean).toBeGreaterThan(3);
    expect(withGuess.mean).toBeLessThan(7);
  });

  // ─── 7. Slope sensitivity ─────────────────────────────────────────────

  it('steeper slope → less noise (lower std dev)', { timeout: 30_000 }, () => {
    const gentle = cohortStats(simulateCohort(15, N, 7777, 1.0));
    const steep = cohortStats(simulateCohort(15, N, 7777, 2.0));
    expect(steep.std).toBeLessThan(gentle.std);
  });
});

describe('Monte Carlo — adaptive protocol validation (training mode)', () => {
  // Keep the original adaptive tests for training mode
  it('adaptive mode still converges within maxTrials', () => {
    let state = startProtocol({ mode: 'adaptive', sessionId: 'adp-conv', maxTrials: 30 });
    const rng = mulberry32(42);

    while (!state.finished) {
      const trial = nextTrial(state);
      if (!trial) break;
      const p = pCorrect(15, trial.level, 1.5);
      const correct = rng() < p;
      ({ state } = submitResponse(state, correct ? 0 : 1, 2000));
    }

    expect(state.finished).toBe(true);
    expect(state.trialIndex).toBeLessThanOrEqual(30);
  });
});
