import { describe, expect, it } from 'bun:test';
import { DefaultTimelineGenerator } from './timeline-generator';
import type { TimelineGeneratorInput, PlacementOrderInput, HistoryItem } from './types';

describe('DefaultTimelineGenerator', () => {
  const generator = new DefaultTimelineGenerator();

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

  function resetIdCounter() {
    idCounter = 0;
  }

  describe('generate', () => {
    it('should create cards for each slot in separated mode', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
        { position: 3, sound: 'C' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 2,
        nLevel: 2, // Window size = min(3, 3) = 3
        activeModalities: ['position', 'audio'],
        timelineMode: 'separated',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 3 slots × 2 modalities = 6 cards
      expect(result.timelineCards).toHaveLength(6);

      const positionCards = result.timelineCards.filter((c) => c.type === 'position');
      const audioCards = result.timelineCards.filter((c) => c.type === 'audio');
      expect(positionCards).toHaveLength(3);
      expect(audioCards).toHaveLength(3);
    });

    it('should create unified cards in unified mode', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'unified',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 2 slots × 1 unified = 2 cards
      expect(result.timelineCards).toHaveLength(2);
      expect(result.timelineCards.every((c) => c.type === 'unified')).toBe(true);
    });

    it('should create proposals for each modality in separated mode', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'separated',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 2 slots × 2 modalities = 4 proposals (N, N-1 for each modality)
      expect(result.proposals).toHaveLength(4);

      const positionProposals = result.proposals.filter((p) => p.type === 'position');
      const audioProposals = result.proposals.filter((p) => p.type === 'audio');
      expect(positionProposals).toHaveLength(2);
      expect(audioProposals).toHaveLength(2);
    });

    it('should create unified proposals in unified mode', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'unified',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      // 2 unified proposals (N, N-1)
      expect(result.proposals).toHaveLength(2);
      expect(result.proposals.every((p) => p.type === 'unified')).toBe(true);
      expect(result.proposals.some((p) => p.label === 'N')).toBe(true);
      expect(result.proposals.some((p) => p.label === 'N-1')).toBe(true);
    });

    it('should include random distractors', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 1,
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        timelineMode: 'separated',
        distractorCount: 2,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      const distractorCards = result.timelineCards.filter((c) => c.isDistractor);
      expect(distractorCards.length).toBeGreaterThan(0);
      expect(distractorCards.every((c) => c.slot < 0)).toBe(true); // Negative slots for distractors
    });

    it('should include proactive distractors from outside window', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 0, sound: 'X' }, // Outside window
        { position: 1, sound: 'Y' }, // Outside window
        { position: 2, sound: 'C' }, // In window (N-1)
        { position: 3, sound: 'H' }, // In window (N)
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 3,
        nLevel: 1, // Window = 2 (N and N-1)
        activeModalities: ['position'],
        timelineMode: 'separated',
        distractorCount: 2,
        distractorSource: 'proactive',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      const distractorCards = result.timelineCards.filter((c) => c.isDistractor);
      expect(distractorCards).toHaveLength(2);
    });

    it('should produce deterministic results with same seed', () => {
      const history: HistoryItem[] = [{ position: 1, sound: 'C' }];

      // Use local counters to ensure determinism
      let counter1 = 0;
      let counter2 = 0;

      const input1: TimelineGeneratorInput = {
        history,
        trialIndex: 0,
        nLevel: 2,
        activeModalities: ['position'],
        timelineMode: 'separated',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: () => `id-${++counter1}`,
      };

      const input2: TimelineGeneratorInput = {
        history,
        trialIndex: 0,
        nLevel: 2,
        activeModalities: ['position'],
        timelineMode: 'separated',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: () => `id-${++counter2}`,
      };

      const result1 = generator.generate(input1);
      const result2 = generator.generate(input2);

      expect(result1.timelineCards).toEqual(result2.timelineCards);
      expect(result1.proposals).toEqual(result2.proposals);
    });

    it('should limit window size to trialIndex + 1', () => {
      resetIdCounter();
      const history: HistoryItem[] = [
        { position: 1, sound: 'C' },
        { position: 2, sound: 'H' },
      ];

      const input: TimelineGeneratorInput = {
        history,
        trialIndex: 0, // Only 1 trial seen
        nLevel: 5, // High n-level but limited by trials
        activeModalities: ['position'],
        timelineMode: 'separated',
        distractorCount: 0,
        distractorSource: 'random',
        rng: createDeterministicRng(42),
        generateId: createIdGenerator(),
      };

      const result = generator.generate(input);

      expect(result.timelineCards).toHaveLength(1);
      expect(result.proposals).toHaveLength(1);
    });
  });

  describe('generatePlacementOrder', () => {
    it('should return empty array for free mode', () => {
      const proposals = [
        { id: 'p1', label: 'N' as const, type: 'position' as const, correctSlot: 0 },
        { id: 'p2', label: 'N-1' as const, type: 'position' as const, correctSlot: 1 },
      ];

      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'free',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(0);
    });

    it('should sort by correctSlot descending for oldestFirst', () => {
      const proposals = [
        { id: 'p1', label: 'N' as const, type: 'position' as const, correctSlot: 0 },
        { id: 'p2', label: 'N-1' as const, type: 'position' as const, correctSlot: 1 },
        { id: 'p3', label: 'N-2' as const, type: 'position' as const, correctSlot: 2 },
      ];

      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'oldestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(3);
      expect(result[0]?.proposalId).toBe('p3'); // N-2 first (oldest)
      expect(result[1]?.proposalId).toBe('p2'); // N-1
      expect(result[2]?.proposalId).toBe('p1'); // N (newest)
    });

    it('should sort by correctSlot ascending for newestFirst', () => {
      const proposals = [
        { id: 'p1', label: 'N' as const, type: 'position' as const, correctSlot: 0 },
        { id: 'p2', label: 'N-1' as const, type: 'position' as const, correctSlot: 1 },
        { id: 'p3', label: 'N-2' as const, type: 'position' as const, correctSlot: 2 },
      ];

      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'newestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result).toHaveLength(3);
      expect(result[0]?.proposalId).toBe('p1'); // N first (newest)
      expect(result[1]?.proposalId).toBe('p2'); // N-1
      expect(result[2]?.proposalId).toBe('p3'); // N-2 (oldest)
    });

    it('should shuffle for random mode', () => {
      const proposals = [
        { id: 'p1', label: 'N' as const, type: 'position' as const, correctSlot: 0 },
        { id: 'p2', label: 'N-1' as const, type: 'position' as const, correctSlot: 1 },
        { id: 'p3', label: 'N-2' as const, type: 'position' as const, correctSlot: 2 },
      ];

      const input1: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'random',
        rng: createDeterministicRng(42),
      };

      const input2: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'random',
        rng: createDeterministicRng(12345),
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

    it('should include proposalType in targets', () => {
      const proposals = [{ id: 'p1', label: 'N' as const, type: 'audio' as const, correctSlot: 0 }];

      const input: PlacementOrderInput = {
        proposals,
        placementOrderMode: 'oldestFirst',
        rng: createDeterministicRng(42),
      };

      const result = generator.generatePlacementOrder(input);

      expect(result[0]?.proposalType).toBe('audio');
    });
  });
});
