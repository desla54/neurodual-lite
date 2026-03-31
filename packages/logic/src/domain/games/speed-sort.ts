/**
 * Speed Sort — pure game logic extracted from the training page.
 *
 * Card-sorting game testing cognitive flexibility (WCST-inspired):
 * - Cards have properties: color, shape, number
 * - Player sorts each card into the correct bin based on the CURRENT rule
 * - Rule changes after 5-8 correct sorts (3-5 at nLevel 3)
 * - nLevel 1: 2 rules (color, shape); nLevel 2+: 3 rules (color, shape, number)
 */

// =============================================================================
// Constants
// =============================================================================

export const STIMULUS_TIMEOUT_MS = 3000;
export const RULE_SWITCH_MIN = 5;
export const RULE_SWITCH_MAX = 8;
export const DEFAULT_TOTAL_TRIALS = 30;

export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export const SHAPES = ['circle', 'square', 'triangle', 'star'] as const;
export const NUMBERS = [1, 2, 3, 4] as const;

// =============================================================================
// Types
// =============================================================================

export type CardColor = (typeof COLORS)[number];
export type CardShape = (typeof SHAPES)[number];
export type CardNumber = (typeof NUMBERS)[number];
export type SortRule = 'color' | 'shape' | 'number';

export interface Card {
  color: CardColor;
  shape: CardShape;
  number: CardNumber;
}

export interface TrialResult {
  trialIndex: number;
  card: Card;
  rule: SortRule;
  correct: boolean;
  responseTimeMs: number;
  timedOut: boolean;
  isRuleSwitch: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a random card.
 */
export function generateCard(rng: () => number = Math.random): Card {
  return {
    color: COLORS[Math.floor(rng() * COLORS.length)] as CardColor,
    shape: SHAPES[Math.floor(rng() * SHAPES.length)] as CardShape,
    number: NUMBERS[Math.floor(rng() * NUMBERS.length)] as CardNumber,
  };
}

/**
 * Get the available rules based on nLevel.
 * nLevel 1: color, shape
 * nLevel 2+: color, shape, number
 */
export function getAvailableRules(nLevel: number): SortRule[] {
  if (nLevel <= 1) return ['color', 'shape'];
  return ['color', 'shape', 'number'];
}

/**
 * Pick a new rule different from the current one.
 */
export function pickNewRule(
  currentRule: SortRule,
  availableRules: SortRule[],
  rng: () => number = Math.random,
): SortRule {
  const candidates = availableRules.filter((r) => r !== currentRule);
  return candidates[Math.floor(rng() * candidates.length)] as SortRule;
}

/**
 * Get the bin labels for a given rule.
 */
export function getBinsForRule(rule: SortRule): string[] {
  switch (rule) {
    case 'color':
      return [...COLORS];
    case 'shape':
      return [...SHAPES];
    case 'number':
      return NUMBERS.map(String);
  }
}

/**
 * Get the correct bin index for a card given a rule.
 */
export function getCorrectBin(card: Card, rule: SortRule): number {
  switch (rule) {
    case 'color':
      return COLORS.indexOf(card.color);
    case 'shape':
      return SHAPES.indexOf(card.shape);
    case 'number':
      return NUMBERS.indexOf(card.number);
  }
}

/**
 * Determine the number of correct sorts until the next rule switch.
 * nLevel 3: 3-5; otherwise: 5-8.
 */
export function nextSwitchCount(nLevel: number, rng: () => number = Math.random): number {
  const min = nLevel >= 3 ? 3 : RULE_SWITCH_MIN;
  const max = nLevel >= 3 ? 5 : RULE_SWITCH_MAX;
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Validate a response: check if the chosen bin matches the correct bin for the current rule.
 */
export function validateResponse(card: Card, rule: SortRule, binIndex: number): boolean {
  return binIndex === getCorrectBin(card, rule);
}

/**
 * Detect if a wrong answer is a perseverative error
 * (i.e. the answer would have been correct under the previous rule).
 */
export function isPerseverativeError(
  card: Card,
  currentRule: SortRule,
  previousRule: SortRule,
  chosenBin: number,
): boolean {
  if (currentRule === previousRule) return false;
  const correctUnderCurrent = getCorrectBin(card, currentRule);
  const correctUnderPrevious = getCorrectBin(card, previousRule);
  return chosenBin !== correctUnderCurrent && chosenBin === correctUnderPrevious;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: TrialResult[]) {
  const total = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = total > 0 ? correctTrials / total : 0;

  const validRts = results.filter((r) => !r.timedOut);
  const meanRtMs =
    validRts.length > 0 ? validRts.reduce((s, r) => s + r.responseTimeMs, 0) / validRts.length : 0;

  const switchTrials = results.filter((r) => r.isRuleSwitch);
  const switchCorrect = switchTrials.filter((r) => r.correct).length;
  const switchAccuracy = switchTrials.length > 0 ? switchCorrect / switchTrials.length : 0;

  const nonSwitchTrials = results.filter((r) => !r.isRuleSwitch);
  const nonSwitchCorrect = nonSwitchTrials.filter((r) => r.correct).length;

  const switchRts = switchTrials.filter((r) => !r.timedOut);
  const nonSwitchRts = nonSwitchTrials.filter((r) => !r.timedOut);
  const meanSwitchRt =
    switchRts.length > 0
      ? switchRts.reduce((s, r) => s + r.responseTimeMs, 0) / switchRts.length
      : 0;
  const meanNonSwitchRt =
    nonSwitchRts.length > 0
      ? nonSwitchRts.reduce((s, r) => s + r.responseTimeMs, 0) / nonSwitchRts.length
      : 0;
  // Switch cost is only meaningful when both switch and non-switch trials exist
  const switchCostMs =
    switchRts.length > 0 && nonSwitchRts.length > 0 ? meanSwitchRt - meanNonSwitchRt : 0;

  const timeouts = results.filter((r) => r.timedOut).length;

  return {
    total,
    correctTrials,
    accuracy,
    meanRtMs,
    switchTrials: switchTrials.length,
    switchCorrect,
    switchAccuracy,
    nonSwitchCorrect,
    switchCostMs,
    timeouts,
  };
}
