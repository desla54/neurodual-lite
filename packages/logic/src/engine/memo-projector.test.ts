import { describe, expect, it } from 'bun:test';
import { MemoSessionProjector } from './memo-projector';
import type { Trial } from '../domain';
import type { RecallPickedEvent, GameEvent } from './events';

describe('MemoSessionProjector', () => {
  const trials: Trial[] = [
    {
      index: 0,
      position: 1,
      // @ts-expect-error test override
      sound: 'A',
      // @ts-expect-error test override
      color: 'red',
      isBuffer: false,
      trialType: 'Non-Cible',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
    },
    {
      index: 1,
      position: 5,
      // @ts-expect-error test override
      sound: 'B',
      // @ts-expect-error test override
      color: 'blue',
      isBuffer: false,
      trialType: 'Non-Cible',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
    },
    {
      index: 2,
      position: 3,
      sound: 'C',
      // @ts-expect-error test override
      color: 'green',
      isBuffer: false,
      trialType: 'Non-Cible',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
    },
  ];

  describe('evaluatePicks', () => {
    it('should evaluate a correct pick correctly', () => {
      const picks: RecallPickedEvent[] = [
        {
          type: 'RECALL_PICKED',
          trialIndex: 2,
          slotIndex: 1, // Current trial (index 2)
          pick: { modality: 'position', value: 3 },
          id: '1',
          timestamp: 100,
          sessionId: 's1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 100,
          monotonicMs: 100,
        },
      ];

      const evaluated = MemoSessionProjector.evaluatePicks(picks, trials, 2);
      expect(evaluated).toHaveLength(1);
      expect(evaluated[0]!.correct).toBe(true);
      expect(evaluated[0]!.expected.value).toBe(3);
    });

    it('should evaluate an incorrect pick correctly', () => {
      const picks: RecallPickedEvent[] = [
        {
          type: 'RECALL_PICKED',
          trialIndex: 2,
          slotIndex: 2, // Previous trial (index 1)
          // @ts-expect-error test override
          pick: { modality: 'audio', value: 'Z' }, // Should be 'B'
          id: '1',
          timestamp: 100,
          sessionId: 's1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 100,
          monotonicMs: 100,
        },
      ];

      const evaluated = MemoSessionProjector.evaluatePicks(picks, trials, 2);
      expect(evaluated[0]!.correct).toBe(false);
      // @ts-expect-error test override
      expect(evaluated[0]!.expected.value).toBe('B');
    });

    it('should apply last-write-wins rule', () => {
      const picks: RecallPickedEvent[] = [
        {
          type: 'RECALL_PICKED',
          trialIndex: 2,
          slotIndex: 1,
          // @ts-expect-error test override
          pick: { modality: 'position', value: 9 }, // Wrong
          id: '1',
          timestamp: 100,
          sessionId: 's1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 100,
          monotonicMs: 100,
        },
        {
          type: 'RECALL_PICKED',
          trialIndex: 2,
          slotIndex: 1,
          pick: { modality: 'position', value: 3 }, // Right (last)
          id: '2',
          timestamp: 200,
          sessionId: 's1',
          eventId: 'e2',
          seq: 2,
          schemaVersion: 1,
          occurredAtMs: 200,
          monotonicMs: 200,
        },
      ];

      const evaluated = MemoSessionProjector.evaluatePicks(picks, trials, 2);
      expect(evaluated).toHaveLength(1);
      expect(evaluated[0]!.correct).toBe(true);
    });
  });

  describe('computeStats', () => {
    it('should aggregate statistics from window results', () => {
      const windowResults = [
        {
          trialIndex: 1,
          windowDepth: 1,
          correctCount: 1,
          totalCount: 1,
          accuracy: 1.0,
          recallDurationMs: 1000,
          picks: [
            {
              slotIndex: 1,
              modality: 'position' as const,
              correct: true,
              picked: { modality: 'position', value: 1 },
              expected: { modality: 'position', value: 1 },
            },
          ],
        },
        {
          trialIndex: 2,
          windowDepth: 1,
          correctCount: 0,
          totalCount: 1,
          accuracy: 0.0,
          recallDurationMs: 1000,
          picks: [
            {
              slotIndex: 1,
              modality: 'position' as const,
              correct: false,
              picked: { modality: 'position', value: 9 },
              expected: { modality: 'position', value: 3 },
            },
          ],
        },
      ];

      // @ts-expect-error test override
      const stats = MemoSessionProjector.computeStats(windowResults, ['position']);
      expect(stats.totalPicks).toBe(2);
      expect(stats.correctPicks).toBe(1);
      expect(stats.accuracy).toBe(0.5);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.accuracy).toBe(0.5);
    });

    it('should calculate improving trend correctly', () => {
      // Need 5 values for trend
      const accuracies = [0.2, 0.4, 0.6, 0.8, 1.0];
      const windowResults = accuracies.map((acc, i) => ({
        trialIndex: i,
        windowDepth: 1,
        correctCount: acc,
        totalCount: 1,
        accuracy: acc,
        recallDurationMs: 1000,
        picks: [],
      }));

      const stats = MemoSessionProjector.computeStats(windowResults, []);
      expect(stats.trend).toBe('improving');
    });

    it('should calculate declining trend correctly', () => {
      const accuracies = [1.0, 0.8, 0.6, 0.4, 0.2];
      const windowResults = accuracies.map((acc, i) => ({
        trialIndex: i,
        windowDepth: 1,
        correctCount: acc,
        totalCount: 1,
        accuracy: acc,
        recallDurationMs: 1000,
        picks: [],
      }));

      const stats = MemoSessionProjector.computeStats(windowResults, []);
      expect(stats.trend).toBe('declining');
    });
  });

  describe('project', () => {
    it('should project a complete session from events', () => {
      const events: GameEvent[] = [
        // @ts-expect-error test override
        {
          type: 'RECALL_SESSION_STARTED',
          sessionId: 's1',
          userId: 'u1',
          timestamp: 1000,
          config: { nLevel: 2, activeModalities: ['position'], trialsCount: 10 } as any,
          id: '1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 1000,
          monotonicMs: 1000,
          trialsSeed: 's',
          trialsHash: 'h',
          trialsCount: 10,
        },
        {
          type: 'RECALL_WINDOW_OPENED',
          trialIndex: 0,
          requiredWindowDepth: 1,
          sessionId: 's1',
          id: '2',
          timestamp: 2000,
          eventId: 'e2',
          seq: 2,
          schemaVersion: 1,
          occurredAtMs: 2000,
          monotonicMs: 2000,
        },
        {
          type: 'RECALL_PICKED',
          trialIndex: 0,
          slotIndex: 1,
          pick: { modality: 'position', value: 1 },
          sessionId: 's1',
          id: '3',
          timestamp: 3000,
          eventId: 'e3',
          seq: 3,
          schemaVersion: 1,
          occurredAtMs: 3000,
          monotonicMs: 3000,
        },
        {
          type: 'RECALL_WINDOW_COMMITTED',
          trialIndex: 0,
          recallDurationMs: 500,
          sessionId: 's1',
          id: '4',
          timestamp: 4000,
          eventId: 'e4',
          seq: 4,
          schemaVersion: 1,
          occurredAtMs: 4000,
          monotonicMs: 4000,
        },
        // @ts-expect-error test override
        {
          type: 'RECALL_SESSION_ENDED',
          reason: 'completed',
          totalTrials: 1,
          sessionId: 's1',
          id: '5',
          timestamp: 5000,
          eventId: 'e5',
          seq: 5,
          schemaVersion: 1,
          occurredAtMs: 5000,
          monotonicMs: 5000,
        },
      ];

      const summary = MemoSessionProjector.project(events, trials.slice(0, 1));
      expect(summary).not.toBeNull();
      expect(summary?.sessionId).toBe('s1');
      expect(summary?.windowResults).toHaveLength(1);
      // @ts-expect-error test: nullable access
      expect(summary?.windowResults[0].correctCount).toBe(1);
      expect(summary?.durationMs).toBe(4000); // 5000 - 1000
      expect(summary?.completed).toBe(true);
    });

    it('should return null if no session start event', () => {
      expect(MemoSessionProjector.project([], [])).toBeNull();
    });

    it('should calculate duration based on last event if no end event', () => {
      const events: GameEvent[] = [
        // @ts-expect-error test override
        {
          type: 'RECALL_SESSION_STARTED',
          sessionId: 's1',
          userId: 'u1',
          timestamp: 1000,
          config: { nLevel: 2, activeModalities: ['position'], trialsCount: 10 } as any,
          id: '1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 1000,
          monotonicMs: 1000,
          trialsSeed: 's',
          trialsHash: 'h',
          trialsCount: 10,
        },
        {
          type: 'RECALL_PICKED',
          trialIndex: 0,
          slotIndex: 1,
          pick: { modality: 'position', value: 1 },
          sessionId: 's1',
          id: '3',
          timestamp: 3000,
          eventId: 'e3',
          seq: 3,
          schemaVersion: 1,
          occurredAtMs: 3000,
          monotonicMs: 3000,
        },
      ];
      const summary = MemoSessionProjector.project(events, trials.slice(0, 1));
      expect(summary?.durationMs).toBe(2000); // 3000 - 1000
    });

    it('should return 0 duration if only start event exists', () => {
      const events: GameEvent[] = [
        // @ts-expect-error test override
        {
          type: 'RECALL_SESSION_STARTED',
          sessionId: 's1',
          userId: 'u1',
          timestamp: 1000,
          config: { nLevel: 2, activeModalities: ['position'], trialsCount: 10 } as any,
          id: '1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 1000,
          monotonicMs: 1000,
          trialsSeed: 's',
          trialsHash: 'h',
          trialsCount: 10,
        },
      ];
      const summary = MemoSessionProjector.project(events, trials.slice(0, 1));
      expect(summary?.durationMs).toBe(0);
    });
  });

  describe('computeStatsUpToWindow', () => {
    it('should compute stats only up to specified window index', () => {
      const events: GameEvent[] = [
        // @ts-expect-error test override
        {
          type: 'RECALL_SESSION_STARTED',
          sessionId: 's1',
          userId: 'u1',
          timestamp: 1000,
          config: { nLevel: 2, activeModalities: ['position'], trialsCount: 10 } as any,
          id: '1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 1000,
          monotonicMs: 1000,
          trialsSeed: 's',
          trialsHash: 'h',
          trialsCount: 10,
        },
        // Window 0: Correct
        {
          type: 'RECALL_PICKED',
          trialIndex: 0,
          slotIndex: 1,
          pick: { modality: 'position', value: 1 },
          sessionId: 's1',
          id: '2',
          timestamp: 2000,
          eventId: 'e2',
          seq: 2,
          schemaVersion: 1,
          occurredAtMs: 2000,
          monotonicMs: 2000,
        },
        {
          type: 'RECALL_WINDOW_COMMITTED',
          trialIndex: 0,
          recallDurationMs: 500,
          sessionId: 's1',
          id: '3',
          timestamp: 3000,
          eventId: 'e3',
          seq: 3,
          schemaVersion: 1,
          occurredAtMs: 3000,
          monotonicMs: 3000,
        },
        // Window 1: Incorrect
        {
          type: 'RECALL_PICKED',
          trialIndex: 1,
          slotIndex: 1,
          // @ts-expect-error test override
          pick: { modality: 'position', value: 9 },
          sessionId: 's1',
          id: '4',
          timestamp: 4000,
          eventId: 'e4',
          seq: 4,
          schemaVersion: 1,
          occurredAtMs: 4000,
          monotonicMs: 4000,
        },
        {
          type: 'RECALL_WINDOW_COMMITTED',
          trialIndex: 1,
          recallDurationMs: 500,
          sessionId: 's1',
          id: '5',
          timestamp: 5000,
          eventId: 'e5',
          seq: 5,
          schemaVersion: 1,
          occurredAtMs: 5000,
          monotonicMs: 5000,
        },
      ];

      // Up to window 0: accuracy should be 1.0
      const stats0 = MemoSessionProjector.computeStatsUpToWindow(events, trials, 0, ['position']);
      expect(stats0.accuracy).toBe(1.0);
      expect(stats0.windowsCompleted).toBe(1);

      // Up to window 1: accuracy should be 0.5
      const stats1 = MemoSessionProjector.computeStatsUpToWindow(events, trials, 1, ['position']);
      expect(stats1.accuracy).toBe(0.5);
      expect(stats1.windowsCompleted).toBe(2);
    });
  });

  describe('Edge cases and Errors', () => {
    it('should throw for unknown modality', () => {
      const picks: RecallPickedEvent[] = [
        {
          type: 'RECALL_PICKED',
          trialIndex: 0,
          slotIndex: 1,
          pick: { modality: 'unknown' as any, value: 3 },
          id: '1',
          timestamp: 100,
          sessionId: 's1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 100,
          monotonicMs: 100,
        },
      ];
      expect(() => MemoSessionProjector.evaluatePicks(picks, trials, 0)).toThrow(
        /Unknown modality/,
      );
    });

    it('should ignore picks with invalid target indices', () => {
      const picks: RecallPickedEvent[] = [
        {
          type: 'RECALL_PICKED',
          trialIndex: 0,
          slotIndex: 5, // 0 - (5-1) = -4 -> Out of bounds
          pick: { modality: 'position', value: 3 },
          id: '1',
          timestamp: 100,
          sessionId: 's1',
          eventId: 'e1',
          seq: 1,
          schemaVersion: 1,
          occurredAtMs: 100,
          monotonicMs: 100,
        },
      ];
      const evaluated = MemoSessionProjector.evaluatePicks(picks, trials, 0);
      expect(evaluated).toHaveLength(0);
    });
  });
});
