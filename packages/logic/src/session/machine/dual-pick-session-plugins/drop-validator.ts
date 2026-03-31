/**
 * DropValidator Plugin
 *
 * Validates drop attempts against history and placement rules.
 *
 * Data in / Data out: Pure validation, no side effects.
 */

import type { DropValidator, DropValidatorInput, DropValidatorResult } from './types';

/**
 * Default DropValidator implementation.
 */
export class DefaultDropValidator implements DropValidator {
  validate(input: DropValidatorInput): DropValidatorResult {
    const {
      proposalId,
      targetSlot,
      targetType,
      proposals,
      timelineCards,
      history,
      placementOrderMode,
      placementOrder,
      placementOrderIndex,
    } = input;

    // Find the proposal
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      return {
        isAccepted: false,
        isCorrect: false,
        rejectionReason: 'proposal_not_found',
      };
    }

    // In non-free mode, check if user is dragging the ACTIVE card
    if (placementOrderMode !== 'free') {
      const currentTarget = placementOrder[placementOrderIndex];
      if (!currentTarget || proposalId !== currentTarget.proposalId) {
        return {
          isAccepted: true, // Accepted but wrong (will count as error)
          isCorrect: false,
          rejectionReason: 'wrong_active_card',
          proposal,
        };
      }
    }

    // Check if this label was already placed
    const alreadyPlaced = timelineCards.some(
      (card) => card.type === proposal.type && card.placedLabel === proposal.label,
    );
    if (alreadyPlaced) {
      return {
        isAccepted: false,
        isCorrect: false,
        rejectionReason: 'already_placed',
        proposal,
      };
    }

    // Check if the target slot exists and accepts this type
    const targetCard = timelineCards.find(
      (card) => card.slot === targetSlot && card.type === targetType,
    );
    if (!targetCard || targetCard.placedLabel !== null) {
      return {
        isAccepted: false,
        isCorrect: false,
        rejectionReason: 'wrong_target',
        proposal,
      };
    }

    // Check if the proposal type matches the target type
    if (proposal.type !== targetType) {
      return {
        isAccepted: false,
        isCorrect: false,
        rejectionReason: 'type_mismatch',
        proposal,
        targetCard,
      };
    }

    // Reject drops on distractor cards
    if (targetCard.isDistractor) {
      return {
        isAccepted: true, // Accepted but wrong (will count as error)
        isCorrect: false,
        rejectionReason: 'distractor',
        proposal,
        targetCard,
      };
    }

    // Validate content match
    const labelHistoryIndex = history.length - 1 - proposal.correctSlot;
    const labelContent = history[labelHistoryIndex];

    let correct = false;
    if (targetType === 'unified') {
      correct =
        targetCard.position === labelContent?.position && targetCard.sound === labelContent?.sound;
    } else if (targetType === 'position') {
      correct = targetCard.position === labelContent?.position;
    } else {
      correct = targetCard.sound === labelContent?.sound;
    }

    return {
      isAccepted: true,
      isCorrect: correct,
      proposal,
      targetCard,
    };
  }
}
