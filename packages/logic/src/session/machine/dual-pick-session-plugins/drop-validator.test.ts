import { describe, expect, it } from 'bun:test';
import { DefaultDropValidator } from './drop-validator';
import type { DropValidatorInput } from './types';
import type {
  DualPickProposal,
  DualPickTimelineCard,
  DualPickPlacementTarget,
} from '../../../types/dual-pick';

describe('DefaultDropValidator', () => {
  const validator = new DefaultDropValidator();

  // Helper to create timeline cards
  function createTimelineCards(cards: Partial<DualPickTimelineCard>[]): DualPickTimelineCard[] {
    return cards.map((c, i) => ({
      slot: c.slot ?? i,
      type: c.type ?? 'position',
      position: c.position,
      sound: c.sound,
      placedLabel: c.placedLabel ?? null,
      isDistractor: c.isDistractor,
      distractorId: c.distractorId,
    }));
  }

  describe('validate', () => {
    it('should reject when proposal not found', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'nonexistent',
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'position', position: 3 }]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.rejectionReason).toBe('proposal_not_found');
    });

    it('should reject with wrong_active_card in guided mode', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
        { id: 'p2', label: 'N-1', type: 'position', correctSlot: 1 },
      ];

      const placementOrder: DualPickPlacementTarget[] = [
        { proposalId: 'p2', proposalType: 'position' }, // p2 is the active card
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1', // Trying to place p1 when p2 is active
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([
          { slot: 0, type: 'position', position: 3 },
          { slot: 1, type: 'position', position: 5 },
        ]),
        history: [
          { position: 5, sound: 'H' },
          { position: 3, sound: 'C' },
        ],
        placementOrderMode: 'oldestFirst',
        placementOrder,
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true); // Accepted but wrong
      expect(result.isCorrect).toBe(false);
      expect(result.rejectionReason).toBe('wrong_active_card');
    });

    it('should allow any order in free mode', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'position', position: 3 }]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should reject when label already placed', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([
          { slot: 0, type: 'position', position: 3, placedLabel: 'N' }, // Already has N label
        ]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.rejectionReason).toBe('already_placed');
    });

    it('should reject when target slot not found', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 5, // Non-existent slot
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'position', position: 3 }]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.rejectionReason).toBe('wrong_target');
    });

    it('should reject when type mismatch', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'audio', // Mismatched type
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'audio', sound: 'C' }]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.rejectionReason).toBe('type_mismatch');
    });

    it('should handle distractor card (accepted but incorrect)', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: -1,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([
          { slot: 0, type: 'position', position: 3 },
          { slot: -1, type: 'position', position: 7, isDistractor: true },
        ]),
        history: [{ position: 3, sound: 'C' }],
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
      expect(result.rejectionReason).toBe('distractor');
    });

    it('should validate content match for position type', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'position', position: 3 }]),
        history: [{ position: 3, sound: 'C' }], // Position matches
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should validate content match for audio type', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'audio', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'audio',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'audio', sound: 'K' }]),
        history: [{ position: 3, sound: 'K' }], // Sound matches
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should validate content match for unified type', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'unified', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'unified',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'unified', position: 5, sound: 'H' }]),
        history: [{ position: 5, sound: 'H' }], // Both match
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should mark incorrect when position content mismatches', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        targetType: 'position',
        proposals,
        timelineCards: createTimelineCards([{ slot: 0, type: 'position', position: 3 }]),
        history: [{ position: 7, sound: 'C' }], // Different position
        placementOrderMode: 'free',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
    });
  });
});
