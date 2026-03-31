import { describe, expect, it } from 'bun:test';
import { DefaultSnapshotBuilder } from './snapshot-builder';
// @ts-expect-error test override
import type { SnapshotBuilderInput, FillCell } from './types';
import type { MemoSpec } from '../../../specs';
import type { Trial } from '../../../types/core';
import type { SlotPicks } from '../../../types/memo';

// Mock TrialGenerator
function createMockGenerator(totalTrials = 20, zone: number | null = null) {
  return {
    getTotalTrials: () => totalTrials,
    getZoneNumber: zone !== null ? () => zone : undefined,
    generateNext: () => null,
    getParams: () => ({ nLevel: 2, targetProbability: 0.25 }),
    reset: () => {},
  };
}

// Helper to create a minimal spec
function createMockSpec(): MemoSpec {
  // @ts-expect-error test override
  return {
    id: 'dual-memo',
    name: 'Dual Memo',
    modeType: 'memo',
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
      isi: 2000,
    },
    scoring: {
      type: 'accuracy',
      passThreshold: 0.8,
    },
    timing: {
      stimulusDurationMs: 2000,
      feedbackDurationMs: 1500,
      isi: 2000,
    },
    extensions: {},
  } as MemoSpec;
}

// Helper to create a trial
function createTrial(index: number): Trial {
  return {
    index,
    // @ts-expect-error test override
    position: index % 8,
    sound: 'C',
    // @ts-expect-error test override
    color: 'red',
    isBuffer: false,
    trialType: 'Non-Cible',
    isPositionTarget: false,
    isSoundTarget: false,
    isColorTarget: false,
  };
}

describe('DefaultSnapshotBuilder', () => {
  const builder = new DefaultSnapshotBuilder();

  describe('build', () => {
    it('should return correct structure for idle phase', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        phaseEnteredAt: 1000,
        trialIndex: 0,
        currentTrial: null,
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder: [],
        fillOrderIndex: 0,
        effectiveWindowDepth: 2,
        sessionEvents: [],
        trials: [],
        // @ts-expect-error test override
        generator: createMockGenerator(),
        spec: createMockSpec(),
        message: null,
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.phase).toBe('idle');
      expect(snapshot.phaseEnteredAt).toBe(1000);
      expect(snapshot.trialIndex).toBe(0);
      expect(snapshot.totalTrials).toBe(20);
      expect(snapshot.stimulus).toBe(null);
      expect(snapshot.recallPrompt).toBe(null);
      expect(snapshot.nLevel).toBe(2);
      expect(snapshot.activeModalities).toEqual(['position', 'audio']);
    });

    it('should include stimulus during stimulus phase', () => {
      const trial = createTrial(0);
      const input: SnapshotBuilderInput = {
        phase: 'stimulus',
        phaseEnteredAt: 2000,
        trialIndex: 0,
        currentTrial: trial,
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder: [],
        fillOrderIndex: 0,
        effectiveWindowDepth: 2,
        sessionEvents: [],
        trials: [trial],
        // @ts-expect-error test override
        generator: createMockGenerator(),
        spec: createMockSpec(),
        message: null,
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.phase).toBe('stimulus');
      expect(snapshot.stimulus).not.toBe(null);
      expect(snapshot.stimulus?.position).toBe(0);
      expect(snapshot.stimulus?.sound).toBe('C');
      expect(snapshot.stimulus?.color).toBe('red');
    });

    it('should include recallPrompt during recall phase', () => {
      const trial = createTrial(1);
      const fillOrder: FillCell[] = [
        { slot: 2, modality: 'position' },
        { slot: 2, modality: 'audio' },
        { slot: 1, modality: 'position' },
        { slot: 1, modality: 'audio' },
      ];

      const input: SnapshotBuilderInput = {
        phase: 'recall',
        phaseEnteredAt: 3000,
        trialIndex: 1,
        currentTrial: trial,
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0,
        effectiveWindowDepth: 2,
        sessionEvents: [],
        trials: [createTrial(0), trial],
        // @ts-expect-error test override
        generator: createMockGenerator(),
        spec: createMockSpec(),
        message: null,
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.phase).toBe('recall');
      expect(snapshot.recallPrompt).not.toBe(null);
      expect(snapshot.recallPrompt?.requiredWindowDepth).toBe(2);
      expect(snapshot.recallPrompt?.fillOrder).toEqual(fillOrder);
      expect(snapshot.recallPrompt?.activeCell).toEqual({ slot: 2, modality: 'position' });
    });

    it('should track picks correctly in recallPrompt', () => {
      const picks = new Map<number, SlotPicks>();
      picks.set(1, { position: 3, audio: 'K' });

      const input: SnapshotBuilderInput = {
        phase: 'recall',
        phaseEnteredAt: 3000,
        trialIndex: 0,
        currentTrial: createTrial(0),
        currentPicks: picks,
        correctionCounts: new Map([['1:position', 1]]),
        fillOrder: [{ slot: 1, modality: 'position' }],
        fillOrderIndex: 1,
        effectiveWindowDepth: 1,
        sessionEvents: [],
        trials: [createTrial(0)],
        // @ts-expect-error test override
        generator: createMockGenerator(),
        spec: createMockSpec(),
        message: null,
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.recallPrompt?.currentPicks.get(1)).toEqual({ position: 3, audio: 'K' });
      expect(snapshot.recallPrompt?.correctionCounts.get('1:position')).toBe(1);
    });

    it('should include adaptiveZone when available', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        phaseEnteredAt: 1000,
        trialIndex: 0,
        currentTrial: null,
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder: [],
        fillOrderIndex: 0,
        effectiveWindowDepth: 2,
        sessionEvents: [],
        trials: [],
        // @ts-expect-error test override
        generator: createMockGenerator(20, 15),
        spec: createMockSpec(),
        message: null,
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.adaptiveZone).toBe(15);
    });

    it('should include message when provided', () => {
      const input: SnapshotBuilderInput = {
        phase: 'idle',
        phaseEnteredAt: 1000,
        trialIndex: 0,
        currentTrial: null,
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder: [],
        fillOrderIndex: 0,
        effectiveWindowDepth: 2,
        sessionEvents: [],
        trials: [],
        // @ts-expect-error test override
        generator: createMockGenerator(),
        spec: createMockSpec(),
        message: 'Get ready!',
        finalSummary: null,
      };

      const snapshot = builder.build(input);

      expect(snapshot.message).toBe('Get ready!');
    });
  });
});
