import { describe, expect, it } from 'bun:test';
import { DefaultTurnOrchestrator } from './turn-orchestrator';
import type { TurnCompleteInput } from './types';
import type { PlaceProposal } from '../../../types/place';

describe('DefaultTurnOrchestrator', () => {
  const orchestrator = new DefaultTurnOrchestrator();

  describe('isAllProposalsPlaced', () => {
    it('should return true when all proposals are placed', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'position', value: 3, correctSlot: 0 },
        { id: 'p2', type: 'audio', value: 'K', correctSlot: 0 },
      ];

      const input: TurnCompleteInput = {
        proposals,
        placedProposals: new Map([
          ['p1', 0],
          ['p2', 0],
        ]),
      };

      expect(orchestrator.isAllProposalsPlaced(input)).toBe(true);
    });

    it('should return false when some proposals are not placed', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'position', value: 3, correctSlot: 0 },
        { id: 'p2', type: 'audio', value: 'K', correctSlot: 0 },
      ];

      const input: TurnCompleteInput = {
        proposals,
        placedProposals: new Map([['p1', 0]]),
      };

      expect(orchestrator.isAllProposalsPlaced(input)).toBe(false);
    });

    it('should return false when no proposals are placed', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];

      const input: TurnCompleteInput = {
        proposals,
        placedProposals: new Map(),
      };

      expect(orchestrator.isAllProposalsPlaced(input)).toBe(false);
    });

    it('should exclude distractors from count', () => {
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'position', value: 3, correctSlot: 0 },
        { id: 'p2', type: 'position', value: 5, correctSlot: -1, isDistractor: true },
      ];

      const input: TurnCompleteInput = {
        proposals,
        placedProposals: new Map([['p1', 0]]), // Only valid proposal placed
      };

      expect(orchestrator.isAllProposalsPlaced(input)).toBe(true);
    });

    it('should return true for empty proposals list', () => {
      const input: TurnCompleteInput = {
        proposals: [],
        placedProposals: new Map(),
      };

      expect(orchestrator.isAllProposalsPlaced(input)).toBe(true);
    });
  });
});
