/**
 * Tests for Chain Recall game logic (v2 — categorized word pool).
 */

import { describe, it, expect } from 'bun:test';
import {
  buildInitialChain,
  buildGridOptions,
  validateRecall,
  createInitialState,
  submitRound,
  growChain,
  computeSummary,
  shuffleArray,
  WORD_POOL,
  MAX_LENGTH,
  MAX_CONSECUTIVE_FAILURES,
  SESSION_POOL_SIZE,
  type ChainRecallConfig,
  type ChainRecallState,
  type RoundResult,
} from './chain-recall';
import {
  ALL_WORD_TEXTS,
  FULL_WORD_POOL,
  drawSessionPool,
  distractorCount,
  pickSmartDistractors,
  WORD_CATEGORIES,
} from './chain-recall-words';

// Deterministic RNG for reproducible tests
function makeSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const defaultConfig: ChainRecallConfig = {
  startLength: 2,
  maxTrials: 15,
};

// Helper to build a test state with a session pool
function makeState(overrides: Partial<ChainRecallState> = {}): ChainRecallState {
  const rng = makeSeededRng(42);
  const pool = drawSessionPool(SESSION_POOL_SIZE, rng);
  return {
    chain: overrides.chain ?? pool.slice(0, 2),
    sessionPool: overrides.sessionPool ?? pool,
    roundIndex: 0,
    consecutiveFailures: 0,
    maxChainReached: 0,
    results: [],
    finished: false,
    finishReason: null,
    ...overrides,
  };
}

// =============================================================================
// Word pool
// =============================================================================

describe('word pool', () => {
  it('has at least 250 unique words', () => {
    expect(ALL_WORD_TEXTS.length).toBeGreaterThanOrEqual(250);
  });

  it('has at least 10 semantic categories', () => {
    const categories = new Set(FULL_WORD_POOL.map((w) => w.category));
    expect(categories.size).toBeGreaterThanOrEqual(10);
  });

  it('all words are lowercase and trimmed', () => {
    for (const word of ALL_WORD_TEXTS) {
      expect(word).toBe(word.toLowerCase().trim());
    }
  });

  it('ALL_WORD_TEXTS has no duplicates', () => {
    expect(new Set(ALL_WORD_TEXTS).size).toBe(ALL_WORD_TEXTS.length);
  });

  it('WORD_CATEGORIES maps every word text', () => {
    for (const word of ALL_WORD_TEXTS) {
      expect(WORD_CATEGORIES.has(word)).toBe(true);
    }
  });
});

// =============================================================================
// Session pool
// =============================================================================

describe('drawSessionPool', () => {
  it('returns the requested number of words', () => {
    const pool = drawSessionPool(50);
    expect(pool).toHaveLength(50);
  });

  it('has no duplicates', () => {
    const pool = drawSessionPool(50);
    expect(new Set(pool).size).toBe(50);
  });

  it('spreads across categories (at least 8 for a pool of 50)', () => {
    const rng = makeSeededRng(1);
    const pool = drawSessionPool(50, rng);
    const cats = new Set<string>();
    for (const word of pool) {
      const wordCats = WORD_CATEGORIES.get(word);
      if (wordCats) {
        for (const c of wordCats) cats.add(c);
      }
    }
    expect(cats.size).toBeGreaterThanOrEqual(8);
  });

  it('deterministic with seeded rng', () => {
    const a = drawSessionPool(50, makeSeededRng(42));
    const b = drawSessionPool(50, makeSeededRng(42));
    expect(a).toEqual(b);
  });

  it('different seeds produce different pools', () => {
    const a = drawSessionPool(50, makeSeededRng(1));
    const b = drawSessionPool(50, makeSeededRng(2));
    expect(a).not.toEqual(b);
  });
});

// =============================================================================
// Distractor count scaling
// =============================================================================

describe('distractorCount', () => {
  it('returns at least 3 for short chains', () => {
    expect(distractorCount(1)).toBe(3);
    expect(distractorCount(2)).toBe(3);
    expect(distractorCount(3)).toBe(3);
  });

  it('scales 1:1 for medium chains', () => {
    expect(distractorCount(5)).toBe(5);
    expect(distractorCount(8)).toBe(8);
  });

  it('caps at 12 for long chains', () => {
    expect(distractorCount(15)).toBe(12);
    expect(distractorCount(20)).toBe(12);
  });
});

// =============================================================================
// Smart distractors
// =============================================================================

describe('pickSmartDistractors', () => {
  it('returns the requested count', () => {
    const pool = drawSessionPool(50, makeSeededRng(1));
    const chain = pool.slice(0, 3);
    const distractors = pickSmartDistractors(chain, 5, pool);
    expect(distractors).toHaveLength(5);
  });

  it('distractors do not overlap with chain', () => {
    const pool = drawSessionPool(50, makeSeededRng(1));
    const chain = pool.slice(0, 5);
    const distractors = pickSmartDistractors(chain, 10, pool);
    for (const d of distractors) {
      expect(chain).not.toContain(d);
    }
  });

  it('prefers same-category words when available', () => {
    const rng = makeSeededRng(42);
    const pool = drawSessionPool(50, rng);
    // Pick a chain word and check its category
    const chain = [pool[0]!];
    const chainCats = WORD_CATEGORIES.get(chain[0]!)!;
    const distractors = pickSmartDistractors(chain, 10, pool, makeSeededRng(1));

    // At least some distractors should share a category with the chain
    const sameCatCount = distractors.filter((d) => {
      const dCats = WORD_CATEGORIES.get(d);
      if (!dCats) return false;
      for (const c of dCats) {
        if (chainCats.has(c)) return true;
      }
      return false;
    }).length;
    // With a pool of 50 spread across 15 categories, we should get at least 1 same-cat
    expect(sameCatCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Chain generation
// =============================================================================

describe('buildInitialChain', () => {
  it('produces a chain of the requested length', () => {
    const chain = buildInitialChain(5);
    expect(chain).toHaveLength(5);
  });

  it('all items are from the word pool', () => {
    const chain = buildInitialChain(8);
    for (const word of chain) {
      expect(ALL_WORD_TEXTS).toContain(word);
    }
  });

  it('produces non-repeating items', () => {
    const chain = buildInitialChain(10);
    const unique = new Set(chain);
    expect(unique.size).toBe(chain.length);
  });

  it('deterministic with seeded rng', () => {
    const a = buildInitialChain(5, ALL_WORD_TEXTS, makeSeededRng(42));
    const b = buildInitialChain(5, ALL_WORD_TEXTS, makeSeededRng(42));
    expect(a).toEqual(b);
  });

  it('different seeds produce different chains', () => {
    const a = buildInitialChain(5, ALL_WORD_TEXTS, makeSeededRng(1));
    const b = buildInitialChain(5, ALL_WORD_TEXTS, makeSeededRng(2));
    expect(a).not.toEqual(b);
  });
});

// =============================================================================
// Grid options
// =============================================================================

describe('buildGridOptions', () => {
  it('contains all chain items plus scaling distractors', () => {
    const pool = drawSessionPool(50, makeSeededRng(1));
    const chain = pool.slice(0, 5);
    const grid = buildGridOptions(chain, undefined, pool);
    // distractorCount(5) = 5, so grid should have 10
    expect(grid).toHaveLength(10);
    for (const word of chain) {
      expect(grid).toContain(word);
    }
  });

  it('supports explicit distractor count override', () => {
    const pool = drawSessionPool(50, makeSeededRng(1));
    const chain = pool.slice(0, 3);
    const grid = buildGridOptions(chain, 7, pool);
    expect(grid).toHaveLength(10); // 3 + 7
  });
});

// =============================================================================
// Serial recall validation
// =============================================================================

describe('validateRecall', () => {
  it('returns true for exact match in order', () => {
    expect(validateRecall(['pomme', 'chat', 'soleil'], ['pomme', 'chat', 'soleil'])).toBe(true);
  });

  it('returns false for wrong order', () => {
    expect(validateRecall(['pomme', 'chat', 'soleil'], ['chat', 'pomme', 'soleil'])).toBe(false);
  });

  it('returns false for missing items', () => {
    expect(validateRecall(['pomme', 'chat', 'soleil'], ['pomme', 'chat'])).toBe(false);
  });

  it('returns false for extra items', () => {
    expect(validateRecall(['pomme', 'chat'], ['pomme', 'chat', 'soleil'])).toBe(false);
  });

  it('returns true for empty chain with empty input', () => {
    expect(validateRecall([], [])).toBe(true);
  });
});

// =============================================================================
// Span progression
// =============================================================================

describe('span progression', () => {
  it('starts at the configured start length', () => {
    const rng = makeSeededRng(42);
    const state = createInitialState({ ...defaultConfig, startLength: 3 }, rng);
    expect(state.chain).toHaveLength(3);
  });

  it('creates a session pool', () => {
    const rng = makeSeededRng(42);
    const state = createInitialState(defaultConfig, rng);
    expect(state.sessionPool.length).toBe(SESSION_POOL_SIZE);
    expect(new Set(state.sessionPool).size).toBe(SESSION_POOL_SIZE);
  });

  it('chain grows by 1 on correct recall', () => {
    const state = makeState();
    const next = submitRound(state, [...state.chain], 1000, defaultConfig);
    expect(next.chain).toHaveLength(3);
  });

  it('chain stays same length on failure (retry)', () => {
    const state = makeState({ chain: ['pomme', 'chat', 'soleil'] });
    const next = submitRound(state, ['chat', 'pomme', 'soleil'], 1000, defaultConfig);
    expect(next.chain).toHaveLength(3);
    expect(next.finished).toBe(false);
  });

  it('new word added is from the session pool and not in existing chain', () => {
    const state = makeState();
    const grown = growChain(state.chain, state.sessionPool);
    expect(grown).toHaveLength(3);
    expect(state.sessionPool).toContain(grown[2]);
    expect(new Set(grown).size).toBe(3);
  });
});

// =============================================================================
// Stopping rule
// =============================================================================

describe('stopping rule', () => {
  it('session ends after 2 consecutive failures at same span', () => {
    let state = makeState({
      chain: ['pomme', 'chat', 'soleil'],
      maxChainReached: 2,
    });

    // First failure
    state = submitRound(state, ['wrong', 'order', 'here'], 1000, defaultConfig);
    expect(state.finished).toBe(false);
    expect(state.consecutiveFailures).toBe(1);

    // Second consecutive failure
    state = submitRound(state, ['still', 'wrong', 'order'], 1000, defaultConfig);
    expect(state.finished).toBe(true);
    expect(state.finishReason).toBe('completed');
  });

  it('consecutive failures reset to 0 on success', () => {
    const rng = makeSeededRng(99);
    const pool = drawSessionPool(50, rng);
    const chain = pool.slice(0, 2);
    let state = makeState({ chain, sessionPool: pool, consecutiveFailures: 1 });

    state = submitRound(state, [...chain], 1000, defaultConfig);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.finished).toBe(false);
  });

  it('session ends when maxTrials reached', () => {
    const config: ChainRecallConfig = { ...defaultConfig, maxTrials: 1 };
    const state = makeState();

    const next = submitRound(state, [...state.chain], 1000, config);
    expect(next.finished).toBe(true);
    expect(next.finishReason).toBe('completed');
  });

  it('session ends when MAX_LENGTH is reached and recalled correctly', () => {
    const rng = makeSeededRng(42);
    const pool = drawSessionPool(SESSION_POOL_SIZE, rng);
    const longChain = pool.slice(0, MAX_LENGTH);
    let state = makeState({
      chain: longChain,
      sessionPool: pool,
      maxChainReached: MAX_LENGTH - 1,
    });

    state = submitRound(state, [...longChain], 1000, defaultConfig);
    expect(state.finished).toBe(true);
    expect(state.maxChainReached).toBe(MAX_LENGTH);
  });

  it('does not end on failure at MAX_LENGTH (first failure)', () => {
    const rng = makeSeededRng(42);
    const pool = drawSessionPool(SESSION_POOL_SIZE, rng);
    const longChain = pool.slice(0, MAX_LENGTH);
    let state = makeState({
      chain: longChain,
      sessionPool: pool,
      maxChainReached: MAX_LENGTH - 1,
    });

    const wrongInput = [...longChain].reverse();
    state = submitRound(state, wrongInput, 1000, defaultConfig);
    expect(state.finished).toBe(false);
    expect(state.consecutiveFailures).toBe(1);
  });
});

// =============================================================================
// Max span tracking
// =============================================================================

describe('max span tracking', () => {
  it('tracks highest span successfully recalled', () => {
    let state = makeState();

    // Succeed at span 2
    state = submitRound(state, [...state.chain], 1000, defaultConfig);
    expect(state.maxChainReached).toBe(2);

    // Succeed at span 3
    state = submitRound(state, [...state.chain], 1000, defaultConfig);
    expect(state.maxChainReached).toBe(3);
  });

  it('does not update max chain on failure', () => {
    let state = makeState({
      chain: ['pomme', 'chat', 'soleil'],
      maxChainReached: 2,
    });

    state = submitRound(state, ['wrong', 'order', 'here'], 1000, defaultConfig);
    expect(state.maxChainReached).toBe(2);
  });

  it('maxChainReached never decreases', () => {
    let state = makeState({ maxChainReached: 5 });

    // Succeed at span 2 — max should stay 5
    state = submitRound(state, [...state.chain], 1000, defaultConfig);
    expect(state.maxChainReached).toBe(5);
  });
});

// =============================================================================
// Scoring / Summary
// =============================================================================

describe('computeSummary', () => {
  it('computes accuracy as percentage', () => {
    const results: RoundResult[] = [
      {
        roundIndex: 0,
        chainLength: 2,
        correct: true,
        responseTimeMs: 1000,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 1,
        chainLength: 3,
        correct: true,
        responseTimeMs: 1500,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 2,
        chainLength: 4,
        correct: false,
        responseTimeMs: 2000,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 3,
        chainLength: 4,
        correct: false,
        responseTimeMs: 2500,
        chain: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(50);
    expect(summary.correctRounds).toBe(2);
    expect(summary.totalRounds).toBe(4);
  });

  it('maxChainLength is the highest correct chain', () => {
    const results: RoundResult[] = [
      {
        roundIndex: 0,
        chainLength: 2,
        correct: true,
        responseTimeMs: 1000,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 1,
        chainLength: 3,
        correct: true,
        responseTimeMs: 1000,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 2,
        chainLength: 4,
        correct: false,
        responseTimeMs: 1000,
        chain: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.maxChainLength).toBe(3);
  });

  it('mean RT is averaged over all rounds', () => {
    const results: RoundResult[] = [
      {
        roundIndex: 0,
        chainLength: 2,
        correct: true,
        responseTimeMs: 1000,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 1,
        chainLength: 3,
        correct: false,
        responseTimeMs: 3000,
        chain: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.meanRtMs).toBe(2000);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.correctRounds).toBe(0);
    expect(summary.totalRounds).toBe(0);
    expect(summary.maxChainLength).toBe(0);
    expect(summary.meanRtMs).toBe(0);
  });

  it('all correct gives 100% accuracy', () => {
    const results: RoundResult[] = [
      {
        roundIndex: 0,
        chainLength: 2,
        correct: true,
        responseTimeMs: 500,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 1,
        chainLength: 3,
        correct: true,
        responseTimeMs: 600,
        chain: [],
        playerInput: [],
      },
      {
        roundIndex: 2,
        chainLength: 4,
        correct: true,
        responseTimeMs: 700,
        chain: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('edge cases', () => {
  it('span 1 is trivially valid if allowed', () => {
    const chain = buildInitialChain(1);
    expect(chain).toHaveLength(1);
    expect(validateRecall(chain, [chain[0]!])).toBe(true);
  });

  it('shuffleArray does not mutate the original', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it('submitting to a finished state is a no-op', () => {
    const state = makeState({ finished: true, finishReason: 'completed' });
    const next = submitRound(state, [...state.chain], 1000, defaultConfig);
    expect(next).toBe(state);
  });

  it('full session simulation: start at 2, succeed twice, fail twice, ends', () => {
    const rng = makeSeededRng(99);
    let state = createInitialState(defaultConfig, rng);

    // Round 1: correct at span 2
    state = submitRound(state, [...state.chain], 800, defaultConfig, makeSeededRng(10));
    expect(state.finished).toBe(false);
    expect(state.chain).toHaveLength(3);
    expect(state.maxChainReached).toBe(2);

    // Round 2: correct at span 3
    state = submitRound(state, [...state.chain], 1200, defaultConfig, makeSeededRng(11));
    expect(state.finished).toBe(false);
    expect(state.chain).toHaveLength(4);
    expect(state.maxChainReached).toBe(3);

    // Round 3: fail at span 4
    state = submitRound(state, ['wrong', 'wrong', 'wrong', 'wrong'], 2000, defaultConfig);
    expect(state.finished).toBe(false);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.chain).toHaveLength(4); // retry same

    // Round 4: fail again at span 4 => session ends
    state = submitRound(state, ['still', 'wrong', 'nope', 'bad'], 2500, defaultConfig);
    expect(state.finished).toBe(true);
    expect(state.finishReason).toBe('completed');
    expect(state.maxChainReached).toBe(3);
    expect(state.results).toHaveLength(4);

    const summary = computeSummary(state.results);
    expect(summary.correctRounds).toBe(2);
    expect(summary.totalRounds).toBe(4);
    expect(summary.maxChainLength).toBe(3);
    expect(summary.accuracy).toBe(50);
  });

  it('MAX_CONSECUTIVE_FAILURES is 2', () => {
    expect(MAX_CONSECUTIVE_FAILURES).toBe(2);
  });

  it('MAX_LENGTH is 20', () => {
    expect(MAX_LENGTH).toBe(20);
  });

  it('WORD_POOL is ALL_WORD_TEXTS (backward compat)', () => {
    expect(WORD_POOL).toBe(ALL_WORD_TEXTS);
  });
});
