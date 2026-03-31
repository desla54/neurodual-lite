/**
 * Digit Span — pure game logic extracted from the training page.
 *
 * Wechsler (1955):
 * - Phase 1 (Forward): recall digits in SAME order
 * - Phase 2 (Backward): recall digits in REVERSE order
 * - Span increases on success, stays on failure
 * - Phase ends after 2 consecutive failures at same span, or span reaches max
 * - Measures phonological loop capacity (forward) and WM manipulation (backward)
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_START_SPAN = 3;
export const MAX_SPAN = 9;
export const MAX_CONSECUTIVE_FAILURES = 2;
export const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// =============================================================================
// Types
// =============================================================================

export type Phase = 'forward' | 'backward';

export interface TrialResult {
  trialIndex: number;
  phase: Phase;
  span: number;
  correct: boolean;
  responseTimeMs: number;
  sequence: number[];
  playerInput: number[];
}

export interface SpanState {
  phase: Phase;
  currentSpan: number;
  consecutiveFailures: number;
  maxForwardSpan: number;
  maxBackwardSpan: number;
  trialIndex: number;
  finished: boolean;
}

// =============================================================================
// Sequence Generation
// =============================================================================

/**
 * Generate a digit sequence of the given length.
 * No two consecutive digits are the same.
 * All digits are in range 0-9.
 */
export function generateDigitSequence(length: number, rng: () => number = Math.random): number[] {
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    let d: number;
    do {
      d = Math.floor(rng() * DIGITS.length);
    } while (seq.length > 0 && d === seq[seq.length - 1]);
    seq.push(d);
  }
  return seq;
}

// =============================================================================
// Recall Validation
// =============================================================================

/**
 * Validate forward recall: input must match sequence exactly.
 */
export function validateForwardRecall(sequence: number[], input: number[]): boolean {
  if (input.length !== sequence.length) return false;
  return input.every((d, i) => d === sequence[i]);
}

/**
 * Validate backward recall: input must match reversed sequence.
 */
export function validateBackwardRecall(sequence: number[], input: number[]): boolean {
  const reversed = [...sequence].reverse();
  if (input.length !== reversed.length) return false;
  return input.every((d, i) => d === reversed[i]);
}

/**
 * Validate recall for the given phase.
 */
export function validateRecall(phase: Phase, sequence: number[], input: number[]): boolean {
  return phase === 'backward'
    ? validateBackwardRecall(sequence, input)
    : validateForwardRecall(sequence, input);
}

// =============================================================================
// Span State Machine
// =============================================================================

/**
 * Create the initial span state.
 */
export function createInitialState(startSpan: number = DEFAULT_START_SPAN): SpanState {
  return {
    phase: 'forward',
    currentSpan: Math.max(2, Math.min(MAX_SPAN, startSpan)),
    consecutiveFailures: 0,
    maxForwardSpan: 0,
    maxBackwardSpan: 0,
    trialIndex: 0,
    finished: false,
  };
}

/**
 * Advance the span state after a trial.
 * Returns the new state (immutable).
 *
 * Rules:
 * - On success: consecutiveFailures resets to 0, span increases by 1 (up to MAX_SPAN)
 * - On failure: consecutiveFailures increments
 * - Phase ends when: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES OR span >= MAX_SPAN
 * - forward -> backward transition resets span to startSpan and failures to 0
 * - backward end -> finished
 */
export function advanceState(
  state: SpanState,
  correct: boolean,
  startSpan: number = DEFAULT_START_SPAN,
  maxTrials: number = Infinity,
): SpanState {
  if (state.finished) return state;

  const newTrialIndex = state.trialIndex + 1;
  const newConsecFailures = correct ? 0 : state.consecutiveFailures + 1;

  // Update max span if correct
  let maxFw = state.maxForwardSpan;
  let maxBw = state.maxBackwardSpan;
  if (correct) {
    if (state.phase === 'forward') {
      maxFw = Math.max(maxFw, state.currentSpan);
    } else {
      maxBw = Math.max(maxBw, state.currentSpan);
    }
  }

  // Check max trials
  if (newTrialIndex >= maxTrials) {
    return {
      phase: state.phase,
      currentSpan: state.currentSpan,
      consecutiveFailures: newConsecFailures,
      maxForwardSpan: maxFw,
      maxBackwardSpan: maxBw,
      trialIndex: newTrialIndex,
      finished: true,
    };
  }

  // Check phase end
  const phaseEnded = newConsecFailures >= MAX_CONSECUTIVE_FAILURES || state.currentSpan >= MAX_SPAN;

  if (phaseEnded && state.phase === 'forward') {
    // Transition to backward
    return {
      phase: 'backward',
      currentSpan: Math.max(2, Math.min(MAX_SPAN, startSpan)),
      consecutiveFailures: 0,
      maxForwardSpan: maxFw,
      maxBackwardSpan: maxBw,
      trialIndex: newTrialIndex,
      finished: false,
    };
  }

  if (phaseEnded && state.phase === 'backward') {
    // Session finished
    return {
      phase: 'backward',
      currentSpan: state.currentSpan,
      consecutiveFailures: newConsecFailures,
      maxForwardSpan: maxFw,
      maxBackwardSpan: maxBw,
      trialIndex: newTrialIndex,
      finished: true,
    };
  }

  // Continue same phase
  const nextSpan = correct ? Math.min(state.currentSpan + 1, MAX_SPAN) : state.currentSpan;

  return {
    phase: state.phase,
    currentSpan: nextSpan,
    consecutiveFailures: newConsecFailures,
    maxForwardSpan: maxFw,
    maxBackwardSpan: maxBw,
    trialIndex: newTrialIndex,
    finished: false,
  };
}

// =============================================================================
// Summary
// =============================================================================

export interface DigitSpanSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  maxForwardSpan: number;
  maxBackwardSpan: number;
}

/**
 * Compute a summary from trial results.
 */
export function computeSummary(results: TrialResult[]): DigitSpanSummary {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const fwCorrect = results.filter((r) => r.phase === 'forward' && r.correct);
  const bwCorrect = results.filter((r) => r.phase === 'backward' && r.correct);

  return {
    totalTrials: total,
    correctTrials: correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    maxForwardSpan: Math.max(0, ...fwCorrect.map((r) => r.span)),
    maxBackwardSpan: Math.max(0, ...bwCorrect.map((r) => r.span)),
  };
}
