/**
 * PlacementEvaluator - Evaluation logic for Flow/DualPick modes
 *
 * Centralizes the placement correctness evaluation that was previously
 * duplicated in flow-placement-state.ts and dual-pick-placement-state.ts.
 *
 * This is a stateless helper, not a full Judge implementation.
 * The sessions track statistics; this just provides the evaluation logic.
 */

import type { PlaceProposal } from '../types/place';

// =============================================================================
// Types
// =============================================================================

/**
 * An item from the history at a specific slot
 */
export interface HistoryItem {
  readonly position: number;
  readonly sound: string;
}

/**
 * Result of evaluating a placement
 */
export interface PlacementEvaluation {
  /** Is the placement correct? */
  readonly isCorrect: boolean;
  /** Why was it incorrect (if applicable)? */
  readonly reason?:
    | 'distractor' // Placed a distractor (always wrong)
    | 'wrong-slot' // Correct value but wrong slot
    | 'wrong-value' // Wrong value for this slot
    | 'no-history' // No history at this slot index
    | 'wrong-binding'; // Unified mode: one value matches but not both
  /** Per-modality breakdown for unified mode */
  readonly byModality?: {
    readonly position: boolean;
    readonly audio: boolean;
  };
}

// =============================================================================
// Evaluator Functions
// =============================================================================

/**
 * Evaluate if a proposal placement is correct.
 *
 * @param proposal - The proposal being placed
 * @param targetSlot - The slot index (0 = N, 1 = N-1, etc.)
 * @param history - The session history (oldest first)
 * @returns Evaluation result with correctness and reason
 */
export function evaluatePlacement(
  proposal: PlaceProposal,
  targetSlot: number,
  history: readonly HistoryItem[],
): PlacementEvaluation {
  // Distractors are always incorrect
  if (proposal.isDistractor) {
    return {
      isCorrect: false,
      reason: 'distractor',
    };
  }

  // Calculate the history index for this slot
  // Slot 0 = N (most recent), Slot 1 = N-1, etc.
  const historyIndex = history.length - 1 - targetSlot;

  // No history at this slot
  if (historyIndex < 0 || historyIndex >= history.length) {
    return {
      isCorrect: false,
      reason: 'no-history',
    };
  }

  const expectedItem = history[historyIndex];
  if (!expectedItem) {
    return {
      isCorrect: false,
      reason: 'no-history',
    };
  }

  // Unified mode: BOTH position and sound must match
  if (proposal.type === 'unified') {
    const positionCorrect = proposal.position === expectedItem.position;
    const audioCorrect = proposal.sound === expectedItem.sound;
    const isCorrect = positionCorrect && audioCorrect;

    return {
      isCorrect,
      reason: isCorrect ? undefined : 'wrong-binding',
      byModality: {
        position: positionCorrect,
        audio: audioCorrect,
      },
    };
  }

  // Single modality mode
  const expectedValue = proposal.type === 'position' ? expectedItem.position : expectedItem.sound;
  const isCorrect = proposal.value === expectedValue;

  return {
    isCorrect,
    reason: isCorrect ? undefined : 'wrong-value',
  };
}

/**
 * Find the correct slot for a proposal value in the history.
 * Returns null if the value is not found.
 *
 * @param proposal - The proposal to find
 * @param history - The session history
 * @returns The correct slot index, or null if not found
 */
export function findCorrectSlot(
  proposal: PlaceProposal,
  history: readonly HistoryItem[],
): number | null {
  if (proposal.isDistractor) {
    return null; // Distractors have no correct slot
  }

  for (let slot = 0; slot < history.length; slot++) {
    const historyIndex = history.length - 1 - slot;
    const expectedItem = history[historyIndex];
    if (!expectedItem) continue;

    if (proposal.type === 'unified') {
      // Both must match
      if (proposal.position === expectedItem.position && proposal.sound === expectedItem.sound) {
        return slot;
      }
    } else {
      const expectedValue =
        proposal.type === 'position' ? expectedItem.position : expectedItem.sound;
      if (proposal.value === expectedValue) {
        return slot;
      }
    }
  }

  return null;
}
