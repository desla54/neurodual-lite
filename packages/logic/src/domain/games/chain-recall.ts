/**
 * Chain Recall — pure game logic.
 *
 * "I went to the market and bought..." — memorize a growing chain of items.
 * - Start with a chain of `startLength` items drawn from a session word pool
 * - Player must recall all items in exact serial order
 * - On success: chain grows by 1 (new word appended)
 * - On failure: retry same chain; 2 consecutive failures at same length = session ends
 * - Session also ends when maxTrials or MAX_LENGTH is reached
 *
 * v2: Uses a ~300-word categorized pool with smart distractor selection.
 */

import {
  ALL_WORD_TEXTS,
  drawSessionPool,
  distractorCount as computeDistractorCount,
  pickSmartDistractors,
} from './chain-recall-words';

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_START_LENGTH = 2;
export const MAX_LENGTH = 20;
export const MAX_CONSECUTIVE_FAILURES = 2;
/** @deprecated Use `distractorCount(chainLength)` from chain-recall-words instead. */
export const DISTRACTOR_COUNT = 3;

/**
 * Default session pool size. Must be > MAX_LENGTH to ensure enough headroom
 * for distractors at all chain lengths.
 */
export const SESSION_POOL_SIZE = 50;

/**
 * @deprecated Use `ALL_WORD_TEXTS` from chain-recall-words for the full pool,
 * or `drawSessionPool()` for a per-session subset.
 */
export const WORD_POOL = ALL_WORD_TEXTS;

// =============================================================================
// Types
// =============================================================================

export interface RoundResult {
  roundIndex: number;
  chainLength: number;
  correct: boolean;
  responseTimeMs: number;
  chain: string[];
  playerInput: string[];
}

export interface ChainRecallState {
  chain: string[];
  sessionPool: string[];
  roundIndex: number;
  consecutiveFailures: number;
  maxChainReached: number;
  results: RoundResult[];
  finished: boolean;
  finishReason: 'completed' | null;
}

export interface ChainRecallConfig {
  startLength: number;
  maxTrials: number;
  /** @deprecated Ignored in v2. Use drawSessionPool() instead. */
  wordPool?: readonly string[];
}

// =============================================================================
// Helpers
// =============================================================================

export function shuffleArray<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled;
}

/**
 * Build an initial chain of `length` items, drawn without repetition from the pool.
 */
export function buildInitialChain(
  length: number,
  pool: readonly string[] = ALL_WORD_TEXTS,
  rng: () => number = Math.random,
): string[] {
  if (length > pool.length) {
    throw new Error(`Cannot build chain of ${length} from pool of ${pool.length}`);
  }
  return shuffleArray(pool, rng).slice(0, length);
}

/**
 * Pick `count` distractor words (words NOT in the chain) from the pool.
 */
export function pickDistractors(
  chain: readonly string[],
  count: number,
  pool: readonly string[] = ALL_WORD_TEXTS,
  rng: () => number = Math.random,
): string[] {
  const available = pool.filter((w) => !chain.includes(w));
  return shuffleArray(available, rng).slice(0, count);
}

/**
 * Build the recall grid options: chain items + distractors, shuffled.
 *
 * v2: distractor count scales with chain length (~1:1 ratio, min 3, max 12).
 * Uses smart distractor selection (same-category preference) when a session pool is provided.
 */
export function buildGridOptions(
  chain: readonly string[],
  distractorCountOverride?: number,
  pool: readonly string[] = ALL_WORD_TEXTS,
  rng: () => number = Math.random,
): string[] {
  const count = distractorCountOverride ?? computeDistractorCount(chain.length);
  const distractors = pickSmartDistractors(chain, count, pool, rng);
  return shuffleArray([...chain, ...distractors], rng);
}

// =============================================================================
// Recall Validation
// =============================================================================

/**
 * Validate player input against the chain (serial order match).
 */
export function validateRecall(chain: readonly string[], playerInput: readonly string[]): boolean {
  if (playerInput.length !== chain.length) return false;
  return playerInput.every((item, i) => item === chain[i]);
}

// =============================================================================
// State Machine
// =============================================================================

export function createInitialState(
  config: ChainRecallConfig,
  rng: () => number = Math.random,
): ChainRecallState {
  const sessionPool = drawSessionPool(SESSION_POOL_SIZE, rng);
  const chain = buildInitialChain(config.startLength, sessionPool, rng);
  return {
    chain,
    sessionPool,
    roundIndex: 0,
    consecutiveFailures: 0,
    maxChainReached: 0,
    results: [],
    finished: false,
    finishReason: null,
  };
}

/**
 * Grow the chain by one new word from the session pool.
 * If the session pool is exhausted, picks a random pool word.
 */
export function growChain(
  chain: readonly string[],
  pool: readonly string[] = ALL_WORD_TEXTS,
  rng: () => number = Math.random,
): string[] {
  const usedWords = new Set(chain);
  const available = pool.filter((w) => !usedWords.has(w));
  const newWord =
    available.length > 0
      ? (shuffleArray(available, rng)[0] as string)
      : (pool[Math.floor(rng() * pool.length)] as string);
  return [...chain, newWord];
}

/**
 * Submit a round recall and compute the next state.
 * Returns the updated state (immutable).
 */
export function submitRound(
  state: ChainRecallState,
  playerInput: readonly string[],
  responseTimeMs: number,
  config: ChainRecallConfig,
  rng: () => number = Math.random,
): ChainRecallState {
  if (state.finished) return state;

  const correct = validateRecall(state.chain, playerInput);

  const result: RoundResult = {
    roundIndex: state.roundIndex,
    chainLength: state.chain.length,
    correct,
    responseTimeMs,
    chain: [...state.chain],
    playerInput: [...playerInput],
  };

  const newResults = [...state.results, result];
  const newMaxChain = correct
    ? Math.max(state.maxChainReached, state.chain.length)
    : state.maxChainReached;
  const newConsecFailures = correct ? 0 : state.consecutiveFailures + 1;
  const newRoundIndex = state.roundIndex + 1;

  // Check termination conditions
  if (newRoundIndex >= config.maxTrials) {
    return {
      ...state,
      roundIndex: newRoundIndex,
      consecutiveFailures: newConsecFailures,
      maxChainReached: newMaxChain,
      results: newResults,
      finished: true,
      finishReason: 'completed',
    };
  }

  if (newConsecFailures >= MAX_CONSECUTIVE_FAILURES) {
    return {
      ...state,
      roundIndex: newRoundIndex,
      consecutiveFailures: newConsecFailures,
      maxChainReached: newMaxChain,
      results: newResults,
      finished: true,
      finishReason: 'completed',
    };
  }

  if (correct && state.chain.length >= MAX_LENGTH) {
    return {
      ...state,
      roundIndex: newRoundIndex,
      consecutiveFailures: newConsecFailures,
      maxChainReached: newMaxChain,
      results: newResults,
      finished: true,
      finishReason: 'completed',
    };
  }

  // Continue: grow or retry
  const nextChain = correct ? growChain(state.chain, state.sessionPool, rng) : [...state.chain];

  return {
    ...state,
    chain: nextChain,
    roundIndex: newRoundIndex,
    consecutiveFailures: newConsecFailures,
    maxChainReached: newMaxChain,
    results: newResults,
    finished: false,
    finishReason: null,
  };
}

// =============================================================================
// Scoring
// =============================================================================

export interface ChainRecallSummary {
  accuracy: number; // 0-100
  correctRounds: number;
  totalRounds: number;
  maxChainLength: number;
  meanRtMs: number;
}

export function computeSummary(results: readonly RoundResult[]): ChainRecallSummary {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const maxChain = Math.max(0, ...results.filter((r) => r.correct).map((r) => r.chainLength));
  const meanRtMs = total > 0 ? results.reduce((s, r) => s + r.responseTimeMs, 0) / total : 0;
  return {
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    correctRounds: correct,
    totalRounds: total,
    maxChainLength: maxChain,
    meanRtMs,
  };
}
