import { describe, expect, it } from 'bun:test';
import { DefaultDropValidator } from './drop-validator';
import type { DropValidatorInput, HistoryItem } from './types';
import type { PlaceProposal } from '../../../types/place';

describe('DefaultDropValidator', () => {
  const validator = new DefaultDropValidator();

  // Helper to create history items
  function createHistory(items: { position: number; sound: string }[]): HistoryItem[] {
    return items;
  }

  describe('validate', () => {
    it('should reject when proposal not found', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'nonexistent',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 3, sound: 'C' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.isCorrect).toBe(false);
    });

    it('should reject when proposal already placed', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map([['p1', 0]]), // Already placed
        history: createHistory([{ position: 3, sound: 'C' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(false);
      expect(result.proposal).toEqual(proposals[0]);
    });

    it('should accept and mark correct for position match', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0, // Slot 0 = most recent item (index = history.length - 1)
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 3, sound: 'C' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
      expect(result.proposal).toEqual(proposals[0]);
    });

    it('should accept and mark correct for sound match', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'audio', value: 'K', correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 3, sound: 'K' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should accept and mark correct for unified match', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'unified', position: 5, sound: 'H', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 5, sound: 'H' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should accept but mark incorrect for position mismatch', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 7, sound: 'C' }]), // Different position
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
    });

    it('should validate against correct history slot', () => {
      // History: [oldest, middle, newest]
      // Slot 0 = newest (index 2), Slot 1 = middle (index 1), Slot 2 = oldest (index 0)
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 5, correctSlot: 1 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 1, // Should match middle item
        proposals,
        placedProposals: new Map(),
        history: createHistory([
          { position: 1, sound: 'C' }, // index 0 = slot 2
          { position: 5, sound: 'H' }, // index 1 = slot 1
          { position: 9, sound: 'C' }, // index 2 = slot 0
        ]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(true);
    });

    it('should handle unified mismatch when position differs', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'unified', position: 3, sound: 'H', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 5, sound: 'H' }]), // Position differs
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
    });

    it('should handle unified mismatch when sound differs', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'unified', position: 5, sound: 'K', correctSlot: 0 },
      ];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 0,
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 5, sound: 'H' }]), // Sound differs
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
    });

    it('should handle target slot out of history bounds', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: DropValidatorInput = {
        proposalId: 'p1',
        targetSlot: 5, // Out of bounds
        proposals,
        placedProposals: new Map(),
        history: createHistory([{ position: 3, sound: 'C' }]),
      };

      const result = validator.validate(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrect).toBe(false);
    });
  });
});
