import { describe, expect, it } from 'bun:test';
import { DefaultProposalGenerator } from './proposal-generator';
import type { ProposalGeneratorInput, PlacementOrderInput, HistoryItem } from './types';
import type { PlaceProposal } from '../../../types/place';

describe('DefaultProposalGenerator', () => {
  const generator = new DefaultProposalGenerator();

  // Deterministic RNG for testing
  function createDeterministicRng(seed: number): () => number {
    let current = seed;
    return () => {
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current / 0x7fffffff;
    };
  }

  // Simple ID generator
  let idCounter = 0;
  function createIdGenerator(): () => string {
    return () => `id-${++idCounter}`;
  }

  describe('generate', () => {
    it('should create proposals for each slot in window', () => {
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
        { position: 3, sound: 'C' },
      ];

      const input: ProposalGeneratorInput = {
        history,
        trialIndex: 2,
        nLevel: 2, // N=2, window size = min(3, 3) = 3
        activeModalities: ['position', 'audio'],
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 3 slots × 2 modalities = 6 proposals
      expect(result.proposals).toHaveLength(6);

      // Verify positions match history (reversed)
      const positionProposals = result.proposals.filter((p) => p.type === 'position');
      expect(positionProposals).toHaveLength(3);

      // Verify audio matches
      const audioProposals = result.proposals.filter((p) => p.type === 'audio');
      expect(audioProposals).toHaveLength(3);
    });

    it('should create unified proposals in unified mode', () => {
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: ProposalGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'unified',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 2 slots × 1 unified = 2 proposals
      expect(result.proposals).toHaveLength(2);
      expect(result.proposals.every((p) => p.type === 'unified')).toBe(true);
    });

    it('should limit window size to trialIndex + 1', () => {
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
        { position: 3, sound: 'C' },
      ];

      const input: ProposalGeneratorInput = {
        history,
        trialIndex: 1, // Only 2 trials seen
        nLevel: 5, // High n-level but limited by trials
        activeModalities: ['position'],
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // Window size = min(2, 6) = 2
      expect(result.proposals).toHaveLength(2);
    });

    it('should shuffle proposals', () => {
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
        { position: 3, sound: 'C' },
      ];

      const input1: ProposalGeneratorInput = {
        history,
        trialIndex: 2,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const input2: ProposalGeneratorInput = {
        ...input1,
        rng: createDeterministicRng(999), // Different seed
        generateId: createIdGenerator(),
      };

      const result1 = generator.generate(input1);
      const result2 = generator.generate(input2);

      // Different seeds should produce different orders
      const ids1 = result1.proposals.map((p) => p.id).join(',');
      const ids2 = result2.proposals.map((p) => p.id).join(',');
      expect(ids1).not.toEqual(ids2);
    });

    it('should produce deterministic results with same seed', () => {
      const history: HistoryItem[] = [{ position: 1, sound: 'C' }];

      // Use local counters to ensure determinism
      let counter1 = 0;
      let counter2 = 0;

      const input1: ProposalGeneratorInput = {
        history,
        trialIndex: 0,
        nLevel: 2,
        activeModalities: ['position'],
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: () => `id-${++counter1}`,
      };

      const input2: ProposalGeneratorInput = {
        history,
        trialIndex: 0,
        nLevel: 2,
        activeModalities: ['position'],
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: () => `id-${++counter2}`,
      };

      const result1 = generator.generate(input1);
      const result2 = generator.generate(input2);

      expect(result1.proposals.map((p) => p.id)).toEqual(result2.proposals.map((p) => p.id));
    });

    it('should handle single modality', () => {
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: ProposalGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['audio'], // Only audio
        timelineMode: 'separated',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      expect(result.proposals).toHaveLength(2);
      expect(result.proposals.every((p) => p.type === 'audio')).toBe(true);
    });
  });

  describe('generatePlacementOrder', () => {
    const proposals: PlaceProposal[] = [
      { id: 'p1', type: 'position', value: 1, correctSlot: 0 },
      { id: 'p2', type: 'position', value: 2, correctSlot: 1 },
      { id: 'p3', type: 'position', value: 3, correctSlot: 2 },
    ];

    it('should return empty array for free mode', () => {
      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'free',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(0);
    });

    it('should sort by targetSlot descending for oldestFirst', () => {
      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'oldestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(3);
      expect(result[0]?.targetSlot).toBe(2); // Oldest first
      expect(result[1]?.targetSlot).toBe(1);
      expect(result[2]?.targetSlot).toBe(0);
    });

    it('should sort by targetSlot ascending for newestFirst', () => {
      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'newestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(3);
      expect(result[0]?.targetSlot).toBe(0); // Newest first
      expect(result[1]?.targetSlot).toBe(1);
      expect(result[2]?.targetSlot).toBe(2);
    });

    it('should shuffle for random mode', () => {
      const input1: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'random',
        rng: createDeterministicRng(42),
      };

      const input2: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'random',
        rng: createDeterministicRng(12345), // Different seed
      };

      const result1 = generator.generatePlacementOrder(input1);
      const result2 = generator.generatePlacementOrder(input2);

      expect(result1).toHaveLength(3);
      expect(result2).toHaveLength(3);

      // All proposals should be included in both results
      const ids1 = new Set(result1.map((t) => t.proposalId));
      const ids2 = new Set(result2.map((t) => t.proposalId));
      expect(ids1.size).toBe(3);
      expect(ids2.size).toBe(3);
    });

    it('should exclude distractors from placement order', () => {
      const proposalsWithDistractor: PlaceProposal[] = [
        { id: 'p1', type: 'position', value: 1, correctSlot: 0 },
        { id: 'p2', type: 'position', value: 2, correctSlot: -1, isDistractor: true },
        { id: 'p3', type: 'position', value: 3, correctSlot: 1 },
      ];

      const input: PlacementOrderInput = {
        proposals: proposalsWithDistractor,
        placementOrderMode: 'oldestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(2); // Distractor excluded
      expect(result.every((t) => t.proposalId !== 'p2')).toBe(true);
    });
  });
});
