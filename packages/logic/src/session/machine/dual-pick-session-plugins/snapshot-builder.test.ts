import { describe, expect, it } from 'bun:test';
import { DefaultSnapshotBuilder } from './snapshot-builder';
import type { SnapshotBuilderInput } from './types';
import type {
  DualPickProposal,
  DualPickTimelineCard,
  DualPickRunningStats,
  DualPickPlacementTarget,
} from '../../../types/dual-pick';

describe('DefaultSnapshotBuilder', () => {
  const builder = new DefaultSnapshotBuilder();

  // Helper to create empty stats
  function createEmptyStats(): DualPickRunningStats {
    return {
      turnsCompleted: 0,
      totalDrops: 0,
      correctDrops: 0,
      errorCount: 0,
      accuracy: 0,
    };
  }

  describe('build', () => {
    it('should return correct structure with all fields', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
        { id: 'p2', label: 'N-1', type: 'audio', correctSlot: 1 },
      ];

      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: null },
        { slot: 0, type: 'audio', sound: 'K', placedLabel: null },
        { slot: 1, type: 'position', position: 5, placedLabel: null },
        { slot: 1, type: 'audio', sound: 'L', placedLabel: null },
      ];

      const history = [
        { position: 5, sound: 'L' },
        { position: 3, sound: 'K' },
      ];

      const currentTarget: DualPickPlacementTarget = {
        proposalId: 'p1',
        proposalType: 'position',
      };

      const input: SnapshotBuilderInput = {
        phase: 'placement',
        trialIndex: 1,
        totalTrials: 20,
        stimulus: { position: 3, sound: 'K' },
        proposals,
        timelineCards,
        stats: createEmptyStats(),
        nLevel: 2,
        summary: null,
        history,
        activeModalities: ['position', 'audio'],
        currentTarget,
      };

      const snapshot = builder.build(input);

      expect(snapshot.phase).toBe('placement');
      expect(snapshot.trialIndex).toBe(1);
      expect(snapshot.totalTrials).toBe(20);
      expect(snapshot.stimulus).toEqual({ position: 3, sound: 'K' });
      expect(snapshot.proposals).toHaveLength(2);
      expect(snapshot.timelineCards).toHaveLength(4);
      expect(snapshot.nLevel).toBe(2);
      expect(snapshot.history).toHaveLength(2);
      expect(snapshot.activeModalities).toEqual(['position', 'audio']);
      expect(snapshot.currentTarget).toEqual(currentTarget);
    });

    it('should create copies of arrays', () => {
      const proposals: DualPickProposal[] = [
        { id: 'p1', label: 'N', type: 'position', correctSlot: 0 },
      ];
      const timelineCards: DualPickTimelineCard[] = [
        { slot: 0, type: 'position', position: 3, placedLabel: null },
      ];
      const history = [{ position: 3, sound: 'K' }];

      const input: SnapshotBuilderInput = {
        phase: 'idle',
        trialIndex: 0,
        totalTrials: 20,
        stimulus: null,
        proposals,
        timelineCards,
        stats: createEmptyStats(),
        nLevel: 2,
        summary: null,
        history,
        activeModalities: ['position', 'audio'],
        currentTarget: null,
      };

      const snapshot = builder.build(input);

      // Verify copies are independent
      expect(snapshot.proposals).not.toBe(proposals);
      expect(snapshot.timelineCards).not.toBe(timelineCards);
      expect(snapshot.history).not.toBe(history);
    });

    it('should handle null values correctly', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        trialIndex: 0,
        totalTrials: 20,
        stimulus: null,
        proposals: [],
        timelineCards: [],
        stats: createEmptyStats(),
        nLevel: 2,
        summary: null,
        history: [],
        activeModalities: ['position', 'audio'],
        currentTarget: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.stimulus).toBe(null);
      expect(snapshot.currentTarget).toBe(null);
      expect(snapshot.summary).toBe(null);
    });

    it('should include stats correctly', () => {
      const stats: DualPickRunningStats = {
        turnsCompleted: 5,
        totalDrops: 10,
        correctDrops: 8,
        errorCount: 2,
        accuracy: 0.8,
      };

      const input: SnapshotBuilderInput = {
        phase: 'placement',
        trialIndex: 5,
        totalTrials: 20,
        stimulus: null,
        proposals: [],
        timelineCards: [],
        stats,
        nLevel: 2,
        summary: null,
        history: [],
        activeModalities: ['position', 'audio'],
        currentTarget: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.stats).toEqual(stats);
    });

    it('should cast activeModalities correctly', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        trialIndex: 0,
        totalTrials: 20,
        stimulus: null,
        proposals: [],
        timelineCards: [],
        stats: createEmptyStats(),
        nLevel: 2,
        summary: null,
        history: [],
        activeModalities: ['position'], // Single modality
        currentTarget: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.activeModalities).toEqual(['position']);
    });
  });
});
