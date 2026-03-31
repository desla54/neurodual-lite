import { describe, expect, it } from 'bun:test';
import { DefaultPlacementOrchestrator } from './placement-orchestrator';
import type { CurrentTargetInput, PlacementCompleteInput } from './types';
import type { DualPickPlacementTarget, DualPickTimelineCard } from '../../../types/dual-pick';

describe('DefaultPlacementOrchestrator', () => {
  const orchestrator = new DefaultPlacementOrchestrator();

  describe('getCurrentTarget', () => {
    it('should return null in free mode', () => {
      const input: CurrentTargetInput = {
        placementOrderMode: 'free',
        placementOrder: [{ proposalId: 'p1', proposalType: 'position' }],
        placementOrderIndex: 0,
      };

      expect(orchestrator.getCurrentTarget(input)).toBe(null);
    });

    it('should return current target in guided mode', () => {
      const placementOrder: DualPickPlacementTarget[] = [
        { proposalId: 'p1', proposalType: 'position' },
        { proposalId: 'p2', proposalType: 'audio' },
      ];

      const input: CurrentTargetInput = {
        placementOrderMode: 'oldestFirst',
        placementOrder,
        placementOrderIndex: 0,
      };

      expect(orchestrator.getCurrentTarget(input)).toEqual({
        proposalId: 'p1',
        proposalType: 'position',
      });
    });

    it('should return second target after first is placed', () => {
      const placementOrder: DualPickPlacementTarget[] = [
        { proposalId: 'p1', proposalType: 'position' },
        { proposalId: 'p2', proposalType: 'audio' },
      ];

      const input: CurrentTargetInput = {
        placementOrderMode: 'newestFirst',
        placementOrder,
        placementOrderIndex: 1,
      };

      expect(orchestrator.getCurrentTarget(input)).toEqual({
        proposalId: 'p2',
        proposalType: 'audio',
      });
    });

    it('should return null when index is past end', () => {
      const placementOrder: DualPickPlacementTarget[] = [
        { proposalId: 'p1', proposalType: 'position' },
      ];

      const input: CurrentTargetInput = {
        placementOrderMode: 'random',
        placementOrder,
        placementOrderIndex: 5, // Past end
      };

      expect(orchestrator.getCurrentTarget(input)).toBe(null);
    });

    it('should return null for empty placement order', () => {
      const input: CurrentTargetInput = {
        placementOrderMode: 'oldestFirst',
        placementOrder: [],
        placementOrderIndex: 0,
      };

      expect(orchestrator.getCurrentTarget(input)).toBe(null);
    });
  });

  describe('isAllLabelsPlaced', () => {
    it('should return true when all non-distractor cards have labels', () => {
      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: 'N' },
        { slot: 0, type: 'audio', sound: 'K', placedLabel: 'N' },
      ];

      const input: PlacementCompleteInput = { timelineCards };

      expect(orchestrator.isAllLabelsPlaced(input)).toBe(true);
    });

    it('should return false when some cards have no labels', () => {
      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: 'N' },
        { slot: 0, type: 'audio', sound: 'K', placedLabel: null },
      ];

      const input: PlacementCompleteInput = { timelineCards };

      expect(orchestrator.isAllLabelsPlaced(input)).toBe(false);
    });

    it('should exclude distractors from check', () => {
      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: 'N' },
        { slot: -1, type: 'position', position: 7, placedLabel: null, isDistractor: true },
      ];

      const input: PlacementCompleteInput = { timelineCards };

      expect(orchestrator.isAllLabelsPlaced(input)).toBe(true);
    });

    it('should return true for empty card list', () => {
      const input: PlacementCompleteInput = { timelineCards: [] };

      expect(orchestrator.isAllLabelsPlaced(input)).toBe(true);
    });

    it('should return false when no cards have labels', () => {
      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: null },
        { slot: 1, type: 'position', position: 5, placedLabel: null },
      ];

      const input: PlacementCompleteInput = { timelineCards };

      expect(orchestrator.isAllLabelsPlaced(input)).toBe(false);
    });
  });
});
