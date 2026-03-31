/**
 * WCST (Wisconsin Card Sorting Test) — pure game logic.
 *
 * Grant & Berg (1948):
 * - Sort cards by hidden rule (color, shape, number)
 * - Rule changes after N consecutive correct sorts (default 6)
 * - Player must infer the new rule through feedback
 * - Measures cognitive flexibility, set-shifting, perseverative errors
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_RULE_CHANGE_THRESHOLD = 6;
export const DEFAULT_TOTAL_TRIALS = 64;

export const ALL_SHAPES = ['circle', 'star', 'triangle', 'cross'] as const;
export const ALL_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export const RULES = ['color', 'shape', 'number'] as const;

// =============================================================================
// Types
// =============================================================================

export type WcstShape = (typeof ALL_SHAPES)[number];
export type WcstColor = (typeof ALL_COLORS)[number];
export type WcstRule = (typeof RULES)[number];

export interface WcstCard {
  shape: WcstShape;
  color: WcstColor;
  count: number; // 1-4
}

export interface WcstTrialResult {
  trialIndex: number;
  testCard: WcstCard;
  chosenRef: number;
  correct: boolean;
  rule: WcstRule;
  perseverativeError: boolean;
  responseTimeMs: number;
}

export interface WcstSessionState {
  currentRule: WcstRule;
  previousRule: WcstRule | null;
  consecutiveCorrect: number;
  categoriesCompleted: number;
  trialIndex: number;
  results: WcstTrialResult[];
}

export interface WcstSummary {
  correctTrials: number;
  totalTrials: number;
  accuracy: number; // 0-100
  perseverativeErrors: number;
  totalErrors: number;
  categoriesCompleted: number;
  meanRtMs: number;
}

// =============================================================================
// Reference Cards (fixed, always the same 4)
// =============================================================================

export const REFERENCE_CARDS: readonly WcstCard[] = [
  { shape: 'circle', color: 'red', count: 1 },
  { shape: 'star', color: 'green', count: 2 },
  { shape: 'triangle', color: 'yellow', count: 3 },
  { shape: 'cross', color: 'blue', count: 4 },
];

// =============================================================================
// Card Generation
// =============================================================================

/**
 * Generate a random test card.
 * @param rng Optional random number generator (default: Math.random)
 */
export function generateTestCard(rng: () => number = Math.random): WcstCard {
  return {
    shape: ALL_SHAPES[Math.floor(rng() * ALL_SHAPES.length)] as WcstShape,
    color: ALL_COLORS[Math.floor(rng() * ALL_COLORS.length)] as WcstColor,
    count: Math.floor(rng() * 4) + 1,
  };
}

// =============================================================================
// Rule Matching
// =============================================================================

/**
 * Check if a test card matches a reference card by the given rule.
 */
export function matchesByRule(testCard: WcstCard, refCard: WcstCard, rule: WcstRule): boolean {
  switch (rule) {
    case 'color':
      return testCard.color === refCard.color;
    case 'shape':
      return testCard.shape === refCard.shape;
    case 'number':
      return testCard.count === refCard.count;
  }
}

/**
 * Determine which rules a test card matches a reference card on.
 */
export function getMatchingRules(testCard: WcstCard, refCard: WcstCard): WcstRule[] {
  return RULES.filter((rule) => matchesByRule(testCard, refCard, rule));
}

// =============================================================================
// Session Logic
// =============================================================================

/**
 * Create initial session state.
 */
export function createInitialState(): WcstSessionState {
  return {
    currentRule: 'color',
    previousRule: null,
    consecutiveCorrect: 0,
    categoriesCompleted: 0,
    trialIndex: 0,
    results: [],
  };
}

/**
 * Get the next rule after the current one (cycles through color -> shape -> number).
 */
export function getNextRule(currentRule: WcstRule): WcstRule {
  const idx = RULES.indexOf(currentRule);
  return RULES[(idx + 1) % RULES.length] as WcstRule;
}

/**
 * Process a card selection and return the updated state.
 */
export function processCardSelection(
  state: WcstSessionState,
  testCard: WcstCard,
  chosenRefIndex: number,
  responseTimeMs: number,
  ruleChangeThreshold: number = DEFAULT_RULE_CHANGE_THRESHOLD,
): WcstSessionState {
  const refCard = REFERENCE_CARDS[chosenRefIndex] as WcstCard;
  const correct = matchesByRule(testCard, refCard, state.currentRule);

  // Check for perseverative error: wrong answer, but matches the previous rule
  const perseverativeError =
    !correct && state.previousRule !== null && matchesByRule(testCard, refCard, state.previousRule);

  const result: WcstTrialResult = {
    trialIndex: state.trialIndex,
    testCard,
    chosenRef: chosenRefIndex,
    correct,
    rule: state.currentRule,
    perseverativeError,
    responseTimeMs,
  };

  const newConsecutive = correct ? state.consecutiveCorrect + 1 : 0;
  const ruleChange = newConsecutive >= ruleChangeThreshold;

  return {
    currentRule: ruleChange ? getNextRule(state.currentRule) : state.currentRule,
    previousRule: ruleChange ? state.currentRule : state.previousRule,
    consecutiveCorrect: ruleChange ? 0 : newConsecutive,
    categoriesCompleted: state.categoriesCompleted + (ruleChange ? 1 : 0),
    trialIndex: state.trialIndex + 1,
    results: [...state.results, result],
  };
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute summary statistics from trial results.
 */
export function computeSummary(
  results: WcstTrialResult[],
  categoriesCompleted: number,
): WcstSummary {
  const totalTrials = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = totalTrials > 0 ? Math.round((correctTrials / totalTrials) * 100) : 0;
  const perseverativeErrors = results.filter((r) => r.perseverativeError).length;
  const totalErrors = results.filter((r) => !r.correct).length;
  const meanRtMs =
    totalTrials > 0
      ? Math.round(results.reduce((s, r) => s + r.responseTimeMs, 0) / totalTrials)
      : 0;

  return {
    correctTrials,
    totalTrials,
    accuracy,
    perseverativeErrors,
    totalErrors,
    categoriesCompleted,
    meanRtMs,
  };
}
