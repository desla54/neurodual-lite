import { describe, expect, it } from 'bun:test';
import { DefaultSnapshotBuilder } from './snapshot-builder';
import type { SnapshotBuilderInput } from './types';
import type { PlaceProposal, PlaceRunningStats } from '../../../types/place';

describe('DefaultSnapshotBuilder', () => {
  const builder = new DefaultSnapshotBuilder();

  // Helper to create empty stats
  function createEmptyStats(): PlaceRunningStats {
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
      const proposals: PlaceProposal[] = [
        { id: 'p1', type: 'position', value: 3, correctSlot: 0 },
        { id: 'p2', type: 'audio', value: 'K', correctSlot: 0 },
      ];

      const placedProposals = new Map([['p1', 0]]);
      const history = [
        { position: 3, sound: 'K' },
        { position: 5, sound: 'L' },
      ];

      const input: SnapshotBuilderInput = {
        phase: 'placement',
        trialIndex: 1,
        totalTrials: 20,
        nLevel: 2,
        stimulus: { position: 5, sound: 'L' },
        proposals,
        placedProposals,
        currentTarget: { proposalId: 'p2', targetSlot: 0 },
        stats: createEmptyStats(),
        history,
        summary: null,
        adaptiveZone: 10,
      };

      const snapshot = builder.build(input);

      expect(snapshot.phase).toBe('placement');
      expect(snapshot.trialIndex).toBe(1);
      expect(snapshot.totalTrials).toBe(20);
      expect(snapshot.nLevel).toBe(2);
      expect(snapshot.stimulus).toEqual({ position: 5, sound: 'L' });
      expect(snapshot.proposals).toHaveLength(2);
      expect(snapshot.placedProposals.get('p1')).toBe(0);
      expect(snapshot.currentTarget).toEqual({ proposalId: 'p2', targetSlot: 0 });
      expect(snapshot.history).toHaveLength(2);
      expect(snapshot.adaptiveZone).toBe(10);
    });

    it('should create copies of arrays and maps', () => {
      const proposals: PlaceProposal[] = [{ id: 'p1', type: 'position', value: 3, correctSlot: 0 }];
      const placedProposals = new Map<string, number>();
      const history = [{ position: 3, sound: 'K' }];

      const input: SnapshotBuilderInput = {
        phase: 'idle',
        trialIndex: 0,
        totalTrials: 20,
        nLevel: 2,
        stimulus: null,
        proposals,
        placedProposals,
        currentTarget: null,
        stats: createEmptyStats(),
        history,
        summary: null,
        adaptiveZone: null,
      };

      const snapshot = builder.build(input);

      // Verify copies are independent
      expect(snapshot.proposals).not.toBe(proposals);
      expect(snapshot.placedProposals).not.toBe(placedProposals);
      expect(snapshot.history).not.toBe(history);
    });

    it('should handle null values correctly', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        trialIndex: 0,
        totalTrials: 20,
        nLevel: 2,
        stimulus: null,
        proposals: [],
        placedProposals: new Map(),
        currentTarget: null,
        stats: createEmptyStats(),
        history: [],
        summary: null,
        adaptiveZone: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.stimulus).toBe(null);
      expect(snapshot.currentTarget).toBe(null);
      expect(snapshot.summary).toBe(null);
      expect(snapshot.adaptiveZone).toBe(null);
    });

    it('should include stats correctly', () => {
      const stats: PlaceRunningStats = {
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
        nLevel: 2,
        stimulus: null,
        proposals: [],
        placedProposals: new Map(),
        currentTarget: null,
        stats,
        history: [],
        summary: null,
        adaptiveZone: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.stats).toEqual(stats);
    });
  });
});
