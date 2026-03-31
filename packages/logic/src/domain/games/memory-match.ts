/**
 * Memory Match — pure game logic extracted from the training page.
 *
 * Classic card-matching: find all pairs by flipping two cards at a time.
 * Grid sizes scale with difficulty level.
 */

// =============================================================================
// Types
// =============================================================================

export interface CardData {
  id: number;
  pairId: number;
  shapeIndex: number;
  colorIndex: number;
}

export interface GridConfig {
  rows: number;
  cols: number;
  pairs: number;
}

export interface BoardState {
  cards: CardData[];
  flippedIndices: number[];
  matchedPairIds: Set<number>;
  flipCount: number;
  pairsFound: number;
  isLocked: boolean;
}

export type FlipResult =
  | { type: 'ignored' }
  | { type: 'first_flip'; state: BoardState }
  | { type: 'match'; state: BoardState; complete: boolean }
  | { type: 'no_match'; state: BoardState };

// =============================================================================
// Grid configs by nLevel
// =============================================================================

export const GRID_CONFIGS: readonly GridConfig[] = [
  { rows: 2, cols: 3, pairs: 3 }, // nLevel 1
  { rows: 3, cols: 4, pairs: 6 }, // nLevel 2
  { rows: 4, cols: 4, pairs: 8 }, // nLevel 3
  { rows: 4, cols: 5, pairs: 10 }, // nLevel 4+
] as const;

const SHAPE_COUNT = 6;
const COLOR_COUNT = 10;

export function getGridConfig(nLevel: number): GridConfig {
  if (nLevel <= 1) return GRID_CONFIGS[0]!;
  if (nLevel === 2) return GRID_CONFIGS[1]!;
  if (nLevel === 3) return GRID_CONFIGS[2]!;
  return GRID_CONFIGS[3]!;
}

// =============================================================================
// Board generation
// =============================================================================

export function generateBoard(pairs: number): CardData[] {
  const cards: CardData[] = [];
  for (let p = 0; p < pairs; p++) {
    const shapeIndex = p % SHAPE_COUNT;
    const colorIndex = p % COLOR_COUNT;
    cards.push({ id: p * 2, pairId: p, shapeIndex, colorIndex });
    cards.push({ id: p * 2 + 1, pairId: p, shapeIndex, colorIndex });
  }
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j] as CardData, cards[i] as CardData];
  }
  return cards;
}

// =============================================================================
// Board state helpers
// =============================================================================

export function createBoardState(pairs: number): BoardState {
  return {
    cards: generateBoard(pairs),
    flippedIndices: [],
    matchedPairIds: new Set(),
    flipCount: 0,
    pairsFound: 0,
    isLocked: false,
  };
}

export function isBoardComplete(state: BoardState, totalPairs: number): boolean {
  return state.pairsFound >= totalPairs;
}

/**
 * Attempt to flip a card. Returns a FlipResult describing what happened.
 *
 * Pure function — the returned state is a new object (no mutation).
 */
export function flipCard(state: BoardState, cardIndex: number, totalPairs: number): FlipResult {
  // Guard: locked, already matched, already flipped, too many flipped
  if (state.isLocked) return { type: 'ignored' };
  const card = state.cards[cardIndex];
  if (!card) return { type: 'ignored' };
  if (state.matchedPairIds.has(card.pairId)) return { type: 'ignored' };
  if (state.flippedIndices.includes(cardIndex)) return { type: 'ignored' };
  if (state.flippedIndices.length >= 2) return { type: 'ignored' };

  const newFlipped = [...state.flippedIndices, cardIndex];
  const newFlipCount = state.flipCount + 1;

  if (newFlipped.length === 1) {
    return {
      type: 'first_flip',
      state: { ...state, flippedIndices: newFlipped, flipCount: newFlipCount },
    };
  }

  // Two cards flipped — check for match
  const first = state.cards[newFlipped[0]!]!;
  const second = state.cards[newFlipped[1]!]!;

  if (first.pairId === second.pairId) {
    const newMatched = new Set(state.matchedPairIds);
    newMatched.add(first.pairId);
    const newPairsFound = state.pairsFound + 1;
    const newState: BoardState = {
      ...state,
      flippedIndices: newFlipped,
      matchedPairIds: newMatched,
      flipCount: newFlipCount,
      pairsFound: newPairsFound,
      isLocked: true,
    };
    return {
      type: 'match',
      state: newState,
      complete: newPairsFound >= totalPairs,
    };
  }

  return {
    type: 'no_match',
    state: {
      ...state,
      flippedIndices: newFlipped,
      flipCount: newFlipCount,
      isLocked: true,
    },
  };
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Board accuracy: ratio of pairs found to total flip-pairs attempted.
 * Perfect play on N pairs = 2N flips, so accuracy = pairs / (flips/2).
 */
export function computeBoardAccuracy(pairsFound: number, flipCount: number): number {
  if (flipCount === 0) return 0;
  return Math.min(1, pairsFound / (flipCount / 2));
}

/**
 * Session accuracy: average board accuracy across all boards.
 */
export function computeSessionAccuracy(boardAccuracies: number[]): number {
  if (boardAccuracies.length === 0) return 0;
  return boardAccuracies.reduce((s, a) => s + a, 0) / boardAccuracies.length;
}
