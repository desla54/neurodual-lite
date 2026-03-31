import { describe, expect, it, beforeEach } from 'bun:test';
import {
  generateBoard,
  getGridConfig,
  createBoardState,
  flipCard,
  isBoardComplete,
  computeBoardAccuracy,
  computeSessionAccuracy,
  GRID_CONFIGS,
  type BoardState,
  type CardData,
} from './memory-match';

// =============================================================================
// Grid configuration
// =============================================================================

describe('getGridConfig', () => {
  it('returns 2x3 (3 pairs) for nLevel 1', () => {
    const cfg = getGridConfig(1);
    expect(cfg).toEqual({ rows: 2, cols: 3, pairs: 3 });
  });

  it('returns 3x4 (6 pairs) for nLevel 2', () => {
    const cfg = getGridConfig(2);
    expect(cfg).toEqual({ rows: 3, cols: 4, pairs: 6 });
  });

  it('returns 4x4 (8 pairs) for nLevel 3', () => {
    const cfg = getGridConfig(3);
    expect(cfg).toEqual({ rows: 4, cols: 4, pairs: 8 });
  });

  it('returns 4x5 (10 pairs) for nLevel 4+', () => {
    expect(getGridConfig(4)).toEqual({ rows: 4, cols: 5, pairs: 10 });
    expect(getGridConfig(10)).toEqual({ rows: 4, cols: 5, pairs: 10 });
  });

  it('clamps nLevel <= 0 to the smallest config', () => {
    expect(getGridConfig(0)).toEqual(GRID_CONFIGS[0]);
    expect(getGridConfig(-5)).toEqual(GRID_CONFIGS[0]);
  });
});

// =============================================================================
// Board generation
// =============================================================================

describe('generateBoard', () => {
  it('generates correct number of cards (2 per pair)', () => {
    expect(generateBoard(3)).toHaveLength(6);
    expect(generateBoard(6)).toHaveLength(12);
    expect(generateBoard(8)).toHaveLength(16);
    expect(generateBoard(10)).toHaveLength(20);
  });

  it('every pairId appears exactly twice', () => {
    const cards = generateBoard(8);
    const counts = new Map<number, number>();
    for (const c of cards) {
      counts.set(c.pairId, (counts.get(c.pairId) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(2);
    }
    expect(counts.size).toBe(8);
  });

  it('paired cards share the same shapeIndex and colorIndex', () => {
    const cards = generateBoard(10);
    const byPair = new Map<number, CardData[]>();
    for (const c of cards) {
      const arr = byPair.get(c.pairId) ?? [];
      arr.push(c);
      byPair.set(c.pairId, arr);
    }
    for (const [, pair] of byPair) {
      expect(pair).toHaveLength(2);
      expect(pair[0]!.shapeIndex).toBe(pair[1]!.shapeIndex);
      expect(pair[0]!.colorIndex).toBe(pair[1]!.colorIndex);
    }
  });

  it('all card ids are unique', () => {
    const cards = generateBoard(10);
    const ids = new Set(cards.map((c) => c.id));
    expect(ids.size).toBe(cards.length);
  });

  it('shuffles cards (not all in pair-order)', () => {
    // Run multiple times — at least one should be shuffled
    let foundShuffled = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const cards = generateBoard(8);
      const inOrder = cards.every((c, i) => {
        if (i % 2 === 0) return true;
        return cards[i - 1]!.pairId === c.pairId;
      });
      if (!inOrder) {
        foundShuffled = true;
        break;
      }
    }
    expect(foundShuffled).toBe(true);
  });

  it('handles single pair', () => {
    const cards = generateBoard(1);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.pairId).toBe(cards[1]!.pairId);
  });
});

// =============================================================================
// Difficulty scaling
// =============================================================================

describe('difficulty scaling', () => {
  it('higher nLevels produce more pairs', () => {
    const pairs1 = getGridConfig(1).pairs;
    const pairs2 = getGridConfig(2).pairs;
    const pairs3 = getGridConfig(3).pairs;
    const pairs4 = getGridConfig(4).pairs;
    expect(pairs1).toBeLessThan(pairs2);
    expect(pairs2).toBeLessThan(pairs3);
    expect(pairs3).toBeLessThan(pairs4);
  });

  it('grid dimensions match expected card count', () => {
    for (const cfg of GRID_CONFIGS) {
      expect(cfg.rows * cfg.cols).toBe(cfg.pairs * 2);
    }
  });
});

// =============================================================================
// Card flipping & match detection
// =============================================================================

describe('flipCard', () => {
  let state: BoardState;
  const PAIRS = 3;

  beforeEach(() => {
    state = createBoardState(PAIRS);
  });

  it('flipping the first card returns first_flip', () => {
    const result = flipCard(state, 0, PAIRS);
    expect(result.type).toBe('first_flip');
    if (result.type === 'first_flip') {
      expect(result.state.flippedIndices).toEqual([0]);
      expect(result.state.flipCount).toBe(1);
    }
  });

  it('flipping the same card twice is ignored', () => {
    const r1 = flipCard(state, 0, PAIRS);
    expect(r1.type).toBe('first_flip');
    const r2 = flipCard((r1 as { state: BoardState }).state, 0, PAIRS);
    expect(r2.type).toBe('ignored');
  });

  it('two cards with same pairId = match', () => {
    // Find two cards that share a pairId
    const cards = state.cards;
    const firstIdx = 0;
    const firstCard = cards[firstIdx]!;
    const secondIdx = cards.findIndex((c, i) => i !== firstIdx && c.pairId === firstCard.pairId);
    expect(secondIdx).toBeGreaterThan(-1);

    const r1 = flipCard(state, firstIdx, PAIRS);
    expect(r1.type).toBe('first_flip');
    const r2 = flipCard((r1 as { state: BoardState }).state, secondIdx, PAIRS);
    expect(r2.type).toBe('match');
    if (r2.type === 'match') {
      expect(r2.state.pairsFound).toBe(1);
      expect(r2.state.matchedPairIds.has(firstCard.pairId)).toBe(true);
    }
  });

  it('two cards with different pairId = no_match', () => {
    const cards = state.cards;
    const firstIdx = 0;
    const firstCard = cards[firstIdx]!;
    const secondIdx = cards.findIndex((c, i) => i !== firstIdx && c.pairId !== firstCard.pairId);
    expect(secondIdx).toBeGreaterThan(-1);

    const r1 = flipCard(state, firstIdx, PAIRS);
    const r2 = flipCard((r1 as { state: BoardState }).state, secondIdx, PAIRS);
    expect(r2.type).toBe('no_match');
    if (r2.type === 'no_match') {
      expect(r2.state.pairsFound).toBe(0);
      expect(r2.state.flipCount).toBe(2);
    }
  });

  it('flipping an already-matched card is ignored', () => {
    const cards = state.cards;
    const firstIdx = 0;
    const firstCard = cards[firstIdx]!;
    const secondIdx = cards.findIndex((c, i) => i !== firstIdx && c.pairId === firstCard.pairId);

    const r1 = flipCard(state, firstIdx, PAIRS);
    const r2 = flipCard((r1 as { state: BoardState }).state, secondIdx, PAIRS);
    expect(r2.type).toBe('match');

    // Unlock after match (simulate timeout clearing lock)
    const afterMatch = {
      ...(r2 as { state: BoardState }).state,
      isLocked: false,
      flippedIndices: [] as number[],
    };

    // Try flipping the matched card again
    const r3 = flipCard(afterMatch, firstIdx, PAIRS);
    expect(r3.type).toBe('ignored');
  });

  it('flipping while locked is ignored', () => {
    const locked: BoardState = { ...state, isLocked: true };
    const result = flipCard(locked, 0, PAIRS);
    expect(result.type).toBe('ignored');
  });

  it('flipping a third card while two are already flipped is ignored', () => {
    const r1 = flipCard(state, 0, PAIRS);
    // After no_match, isLocked=true so it would be ignored anyway.
    // Simulate: manually set flippedIndices to 2 without lock (edge case)
    const twoFlipped: BoardState = {
      ...(r1 as { state: BoardState }).state,
      flippedIndices: [0, 1],
      isLocked: false,
    };
    const r3 = flipCard(twoFlipped, 2, PAIRS);
    expect(r3.type).toBe('ignored');
  });

  it('invalid card index is ignored', () => {
    const result = flipCard(state, 999, PAIRS);
    expect(result.type).toBe('ignored');
  });
});

// =============================================================================
// Game completion
// =============================================================================

describe('game completion', () => {
  it('finding all pairs completes the board', () => {
    const PAIRS = 3;
    let s = createBoardState(PAIRS);
    const cards = s.cards;

    // Build a map of pairId -> indices for efficient lookup
    const pairMap = new Map<number, number[]>();
    for (let i = 0; i < cards.length; i++) {
      const arr = pairMap.get(cards[i]!.pairId) ?? [];
      arr.push(i);
      pairMap.set(cards[i]!.pairId, arr);
    }

    for (const [, indices] of pairMap) {
      const [a, b] = indices as [number, number];
      const r1 = flipCard(s, a, PAIRS);
      expect(r1.type).toBe('first_flip');
      const r2 = flipCard((r1 as { state: BoardState }).state, b, PAIRS);
      expect(r2.type).toBe('match');
      // Simulate unlock for next pair
      s = { ...(r2 as { state: BoardState }).state, isLocked: false, flippedIndices: [] };
    }

    expect(isBoardComplete(s, PAIRS)).toBe(true);
    expect(s.pairsFound).toBe(PAIRS);
  });

  it('partial matches do not complete the board', () => {
    const PAIRS = 6;
    const s = createBoardState(PAIRS);
    // Just find one pair
    const cards = s.cards;
    const firstIdx = 0;
    const secondIdx = cards.findIndex(
      (c, i) => i !== firstIdx && c.pairId === cards[firstIdx]!.pairId,
    );

    const r1 = flipCard(s, firstIdx, PAIRS);
    const r2 = flipCard((r1 as { state: BoardState }).state, secondIdx, PAIRS);
    expect(r2.type).toBe('match');
    if (r2.type === 'match') {
      expect(r2.complete).toBe(false);
      expect(isBoardComplete(r2.state, PAIRS)).toBe(false);
    }
  });

  it('last match returns complete=true', () => {
    const PAIRS = 2;
    let s = createBoardState(PAIRS);
    const cards = s.cards;
    const pairMap = new Map<number, number[]>();
    for (let i = 0; i < cards.length; i++) {
      const arr = pairMap.get(cards[i]!.pairId) ?? [];
      arr.push(i);
      pairMap.set(cards[i]!.pairId, arr);
    }

    const entries = [...pairMap.entries()];
    // Match first pair
    {
      const [, [a, b]] = entries[0] as [number, [number, number]];
      const r1 = flipCard(s, a, PAIRS);
      const r2 = flipCard((r1 as { state: BoardState }).state, b, PAIRS);
      expect(r2.type).toBe('match');
      if (r2.type === 'match') expect(r2.complete).toBe(false);
      s = { ...(r2 as { state: BoardState }).state, isLocked: false, flippedIndices: [] };
    }
    // Match second pair
    {
      const [, [a, b]] = entries[1] as [number, [number, number]];
      const r1 = flipCard(s, a, PAIRS);
      const r2 = flipCard((r1 as { state: BoardState }).state, b, PAIRS);
      expect(r2.type).toBe('match');
      if (r2.type === 'match') expect(r2.complete).toBe(true);
    }
  });
});

// =============================================================================
// Scoring
// =============================================================================

describe('computeBoardAccuracy', () => {
  it('returns 0 when no flips', () => {
    expect(computeBoardAccuracy(0, 0)).toBe(0);
  });

  it('perfect play: N pairs in 2N flips = 1.0', () => {
    expect(computeBoardAccuracy(6, 12)).toBe(1);
    expect(computeBoardAccuracy(3, 6)).toBe(1);
  });

  it('imperfect play: more flips = lower accuracy', () => {
    // 6 pairs in 20 flips = 6 / 10 = 0.6
    expect(computeBoardAccuracy(6, 20)).toBeCloseTo(0.6);
  });

  it('caps at 1.0 even with unusual inputs', () => {
    // More pairs than flip-pairs shouldn't happen, but guard anyway
    expect(computeBoardAccuracy(10, 4)).toBe(1);
  });
});

describe('computeSessionAccuracy', () => {
  it('returns 0 for empty boards', () => {
    expect(computeSessionAccuracy([])).toBe(0);
  });

  it('averages board accuracies', () => {
    expect(computeSessionAccuracy([1, 0.5, 0.5])).toBeCloseTo(0.6667, 3);
  });

  it('single board returns that accuracy', () => {
    expect(computeSessionAccuracy([0.8])).toBeCloseTo(0.8);
  });
});
