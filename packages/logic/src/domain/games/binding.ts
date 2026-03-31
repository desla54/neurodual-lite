/**
 * Feature Binding Task — pure game logic extracted from the training page.
 *
 * Luck & Vogel (1997), Wheeler & Treisman (2002):
 * - Study: show N colored shapes simultaneously
 * - Retention: blank screen
 * - Test: show N shapes again — SAME set or binding change (color swap)
 * - Player responds SAME or DIFFERENT
 * - Measures visual working memory for feature bindings
 * - Cowan's K quantifies capacity
 */

// =============================================================================
// Constants
// =============================================================================

export const SHAPES: ShapeName[] = ['circle', 'square', 'triangle'];
export const COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7'];
export const DEFAULT_SET_SIZE = 3;
export const DEFAULT_TOTAL_TRIALS = 24;

// =============================================================================
// Types
// =============================================================================

export type ShapeName = 'circle' | 'square' | 'triangle';

export interface ShapeItem {
  shape: ShapeName;
  color: string;
}

export interface BindingTrial {
  studyItems: ShapeItem[];
  testItems: ShapeItem[];
  isChanged: boolean;
}

export type BindingResponse = 'same' | 'different';

export interface BindingTrialResult {
  trial: BindingTrial;
  response: BindingResponse | null;
  correct: boolean;
  rt: number;
}

export interface BindingSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT across all responded trials, in ms */
  avgRT: number;
  /** Accuracy on "changed" trials (binding swap detection) — 0-100 */
  bindingAccuracy: number;
  /** Accuracy on "same" trials — 0-100 */
  sameAccuracy: number;
  changedCount: number;
  sameCount: number;
  changedCorrect: number;
  sameCorrect: number;
  /** Cowan's K — estimated number of items held in VWM */
  cowansK: number;
}

// =============================================================================
// Shuffle Utility
// =============================================================================

/**
 * Fisher-Yates shuffle. Returns a new array.
 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

// =============================================================================
// Study Array Generation
// =============================================================================

/**
 * Generate a study array of `setSize` items with unique shapes and colors.
 */
export function generateStudyItems(
  setSize: number = DEFAULT_SET_SIZE,
  rng: () => number = Math.random,
): ShapeItem[] {
  const shapes = shuffle([...SHAPES], rng).slice(0, setSize);
  const colors = shuffle([...COLORS], rng).slice(0, setSize);
  return shapes.map((s, i) => ({ shape: s, color: colors[i] as string }));
}

// =============================================================================
// Change Generation
// =============================================================================

/**
 * Create the test array for a "changed" trial by swapping colors between two items.
 * This is a binding change — the same colors and shapes are present,
 * but the mapping between them changes.
 */
export function applyBindingChange(
  studyItems: ShapeItem[],
  rng: () => number = Math.random,
): ShapeItem[] {
  if (studyItems.length < 2) return studyItems.map((item) => ({ ...item }));

  const testItems = studyItems.map((item) => ({ ...item }));
  const idx1 = Math.floor(rng() * testItems.length);
  let idx2 = Math.floor(rng() * (testItems.length - 1));
  if (idx2 >= idx1) idx2++;

  const item1 = testItems[idx1] as ShapeItem;
  const item2 = testItems[idx2] as ShapeItem;
  const tmpColor = item1.color;
  item1.color = item2.color;
  item2.color = tmpColor;

  return testItems;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate binding trials: half "same", half "changed" (color swap).
 * Fisher-Yates shuffled.
 */
export function generateTrials(
  count: number,
  setSize: number = DEFAULT_SET_SIZE,
  rng: () => number = Math.random,
): BindingTrial[] {
  const trials: BindingTrial[] = [];
  const half = Math.floor(count / 2);

  for (let i = 0; i < count; i++) {
    const studyItems = generateStudyItems(setSize, rng);
    const isChanged = i >= half;

    if (!isChanged) {
      trials.push({
        studyItems,
        testItems: studyItems.map((item) => ({ ...item })),
        isChanged: false,
      });
    } else {
      trials.push({
        studyItems,
        testItems: applyBindingChange(studyItems, rng),
        isChanged: true,
      });
    }
  }

  return shuffle(trials, rng);
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if the player's response is correct for the given trial.
 */
export function isCorrectResponse(trial: BindingTrial, response: BindingResponse): boolean {
  const expected: BindingResponse = trial.isChanged ? 'different' : 'same';
  return response === expected;
}

// =============================================================================
// Cowan's K
// =============================================================================

/**
 * Compute Cowan's K: estimated number of items held in visual working memory.
 *
 * K = setSize * (hitRate - falseAlarmRate)
 *
 * Where:
 * - hitRate = P(respond "different" | changed trial)
 * - falseAlarmRate = P(respond "different" | same trial)
 *
 * K is clamped to [0, setSize].
 */
export function computeCowansK(hitRate: number, falseAlarmRate: number, setSize: number): number {
  const k = setSize * (hitRate - falseAlarmRate);
  return Math.max(0, Math.min(setSize, k));
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(
  results: BindingTrialResult[],
  setSize: number = DEFAULT_SET_SIZE,
): BindingSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const rts = results.filter((r) => r.rt > 0).map((r) => r.rt);
  const avgRT = rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const changedTrials = results.filter((r) => r.trial.isChanged);
  const sameTrials = results.filter((r) => !r.trial.isChanged);
  const changedCorrect = changedTrials.filter((r) => r.correct).length;
  const sameCorrect = sameTrials.filter((r) => r.correct).length;

  const bindingAccuracy =
    changedTrials.length > 0 ? Math.round((changedCorrect / changedTrials.length) * 100) : 0;
  const sameAccuracy =
    sameTrials.length > 0 ? Math.round((sameCorrect / sameTrials.length) * 100) : 0;

  // For Cowan's K: hitRate = P("different" | changed), faRate = P("different" | same)
  const hitRate = changedTrials.length > 0 ? changedCorrect / changedTrials.length : 0;
  const falseAlarmRate =
    sameTrials.length > 0 ? (sameTrials.length - sameCorrect) / sameTrials.length : 0;
  const cowansK = computeCowansK(hitRate, falseAlarmRate, setSize);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    bindingAccuracy,
    sameAccuracy,
    changedCount: changedTrials.length,
    sameCount: sameTrials.length,
    changedCorrect,
    sameCorrect,
    cowansK: Math.round(cowansK * 100) / 100,
  };
}
