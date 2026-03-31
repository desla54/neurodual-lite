/**
 * DropValidator Plugin
 *
 * Validates drop attempts against history.
 *
 * Data in / Data out: Pure validation, no side effects.
 */

import type { DropValidator, DropValidatorInput, DropValidatorResult } from './types';

/**
 * Default DropValidator implementation.
 */
export class DefaultDropValidator implements DropValidator {
  validate(input: DropValidatorInput): DropValidatorResult {
    const { proposalId, targetSlot, proposals, placedProposals, history } = input;

    // Find the proposal
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return {
        isAccepted: false,
        isCorrect: false,
      };
    }

    // Check if already placed
    if (placedProposals.has(proposalId)) {
      return {
        isAccepted: false,
        isCorrect: false,
        proposal,
      };
    }

    // Validate content match
    const historyIndex = history.length - 1 - targetSlot;
    let correct = false;

    if (historyIndex >= 0) {
      const expectedItem = history[historyIndex];
      if (expectedItem) {
        if (proposal.type === 'unified') {
          correct =
            proposal.position === expectedItem.position && proposal.sound === expectedItem.sound;
        } else {
          const expectedValue =
            proposal.type === 'position' ? expectedItem.position : expectedItem.sound;
          correct = proposal.value === expectedValue;
        }
      }
    }

    return {
      isAccepted: true,
      isCorrect: correct,
      proposal,
    };
  }
}
