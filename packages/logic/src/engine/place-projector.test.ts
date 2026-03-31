import { describe, expect, it } from 'bun:test';
import { PlaceSessionProjector } from './place-projector';
import type { GameEvent, FlowDropAttemptedEvent, FlowTurnCompletedEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';

describe('PlaceSessionProjector', () => {
  describe('computeTurnResult', () => {
    it('should calculate correct and incorrect drops for a turn', () => {
      const drops: FlowDropAttemptedEvent[] = [
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 0,
          correct: true,
          proposalId: 'p1',
          proposalType: 'position',
          proposalValue: 1,
          targetSlot: 1,
          placementTimeMs: 1000,
          dropOrder: 1,
          timestamp: 100,
          occurredAtMs: 100,
          monotonicMs: 100,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 0,
          correct: false,
          proposalId: 'p2',
          proposalType: 'audio',
          proposalValue: 'A',
          targetSlot: 2,
          placementTimeMs: 1500,
          dropOrder: 2,
          timestamp: 200,
          occurredAtMs: 200,
          monotonicMs: 200,
        }),
      ];
      const turnCompleted: FlowTurnCompletedEvent = createMockEvent('FLOW_TURN_COMPLETED', {
        trialIndex: 0,
        turnDurationMs: 3000,
        timestamp: 3000,
        occurredAtMs: 3000,
        monotonicMs: 3000,
      });

      const result = PlaceSessionProjector.computeTurnResult(turnCompleted, drops);
      expect(result.totalDrops).toBe(2);
      expect(result.correctDrops).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.accuracy).toBe(0.5);
    });
  });

  describe('computeExtendedStats', () => {
    it('should aggregate stats across all turns and modalities', () => {
      const turnResults = [
        {
          trialIndex: 0,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 1.0,
          turnDurationMs: 2000,
          drops: [],
        },
        {
          trialIndex: 1,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.5,
          turnDurationMs: 3000,
          drops: [],
        },
      ];
      const allDrops: FlowDropAttemptedEvent[] = [
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'position',
          correct: true,
          placementTimeMs: 1000,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'position',
          correct: true,
          placementTimeMs: 1200,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'audio',
          correct: true,
          placementTimeMs: 800,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'audio',
          correct: false,
          placementTimeMs: 2000,
        }),
      ];

      const stats = PlaceSessionProjector.computeExtendedStats(
        turnResults,
        ['position', 'audio'],
        allDrops,
      );

      expect(stats.turnsCompleted).toBe(2);
      expect(stats.accuracy).toBe(0.75); // 3/4
      // @ts-expect-error test: nullable access
      expect(stats!.byModality!.position.accuracy).toBe(1.0);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality!.audio.accuracy).toBe(0.5);
      expect(stats.avgPlacementTimeMs).toBe(1250); // (1000+1200+800+2000)/4 = 5000/4
    });

    it('should calculate trends correctly', () => {
      const improvingTurns = [0.2, 0.4, 0.6, 0.8, 1.0].map((acc, i) => ({
        trialIndex: i,
        totalDrops: 1,
        correctDrops: 1,
        errorCount: 0,
        accuracy: acc,
        turnDurationMs: 1000,
        drops: [],
      }));
      const stats = PlaceSessionProjector.computeExtendedStats(improvingTurns, [], []);
      expect(stats.trend).toBe('improving');
    });
  });

  describe('project', () => {
    it('should project a complete Flow session', () => {
      const events: GameEvent[] = [
        createMockEvent('FLOW_SESSION_STARTED', {
          timestamp: 1000,
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 10,
            stimulusDurationMs: 2000,
            placementOrderMode: 'free',
          },
          occurredAtMs: 1000,
          monotonicMs: 1000,
        }),
        createMockEvent('FLOW_STIMULUS_SHOWN', {
          trialIndex: 0,
          position: 1,
          sound: 'C',
          stimulusDurationMs: 500,
          adaptiveZone: 5,
          timestamp: 2000,
          occurredAtMs: 2000,
          monotonicMs: 2000,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 0,
          correct: true,
          proposalType: 'position',
          placementTimeMs: 1000,
          timestamp: 3000,
        }),
        createMockEvent('FLOW_TURN_COMPLETED', {
          trialIndex: 0,
          turnDurationMs: 2000,
          timestamp: 4000,
        }),
        createMockEvent('FLOW_SESSION_ENDED', {
          reason: 'completed',
          totalTrials: 1,
          timestamp: 5000,
        }),
      ];

      const summary = PlaceSessionProjector.project(events);
      expect(summary).not.toBeNull();
      expect(summary?.score).toBe(100); // No errors
      expect(summary?.finalAdaptiveZone).toBe(5);
      expect(summary?.durationMs).toBe(4000);
    });

    it('should return null if session never started', () => {
      expect(PlaceSessionProjector.project([])).toBeNull();
    });

    it('should calculate duration based on last event if no end event', () => {
      const events: GameEvent[] = [
        createMockEvent('FLOW_SESSION_STARTED', {
          timestamp: 1000,
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 10,
            stimulusDurationMs: 2000,
            placementOrderMode: 'free',
          },
          occurredAtMs: 1000,
          monotonicMs: 1000,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 0,
          correct: true,
          proposalType: 'position',
          placementTimeMs: 1000,
          timestamp: 3000,
        }),
      ];
      const summary = PlaceSessionProjector.project(events);
      expect(summary?.durationMs).toBe(2000);
    });
  });

  describe('computeStatsUpToTurn', () => {
    it('should compute stats only up to specified turn index', () => {
      const events: GameEvent[] = [
        createMockEvent('FLOW_SESSION_STARTED', {
          timestamp: 1000,
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 10,
            stimulusDurationMs: 2000,
            placementOrderMode: 'free',
          },
          occurredAtMs: 1000,
          monotonicMs: 1000,
        }),
        // Turn 0: Correct
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 0,
          correct: true,
          proposalType: 'position',
          placementTimeMs: 1000,
          timestamp: 2000,
        }),
        createMockEvent('FLOW_TURN_COMPLETED', {
          trialIndex: 0,
          turnDurationMs: 1000,
          timestamp: 3000,
        }),
        // Turn 1: Incorrect
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          trialIndex: 1,
          correct: false,
          proposalType: 'position',
          placementTimeMs: 2000,
          timestamp: 4000,
        }),
        createMockEvent('FLOW_TURN_COMPLETED', {
          trialIndex: 1,
          turnDurationMs: 2000,
          timestamp: 5000,
        }),
      ];

      const stats0 = PlaceSessionProjector.computeStatsUpToTurn(events, 0);
      expect(stats0.accuracy).toBe(1.0);
      expect(stats0.turnsCompleted).toBe(1);

      const stats1 = PlaceSessionProjector.computeStatsUpToTurn(events, 1);
      expect(stats1.accuracy).toBe(0.5);
      expect(stats1.turnsCompleted).toBe(2);
    });

    it('should return empty stats if session not started', () => {
      const stats = PlaceSessionProjector.computeStatsUpToTurn([], 0);
      expect(stats.totalDrops).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('computeExtendedStats should handle empty turn results', () => {
      const stats = PlaceSessionProjector.computeExtendedStats([], ['position'], []);
      expect(stats.accuracy).toBe(0);
      expect(stats.avgTurnDurationMs).toBe(0);
    });

    it('computeExtendedStats should handle modalities with no drops', () => {
      const turnResults = [
        {
          trialIndex: 0,
          totalDrops: 0,
          correctDrops: 0,
          errorCount: 0,
          accuracy: 0,
          turnDurationMs: 1000,
          drops: [],
        },
      ];
      const stats = PlaceSessionProjector.computeExtendedStats(turnResults, ['audio'], []);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality!.audio.totalDrops).toBe(0);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality!.audio.accuracy).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('getPlacementTimings should group timings correctly', () => {
      const events: GameEvent[] = [
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'position',
          placementTimeMs: 1000,
          dropOrder: 1,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'audio',
          placementTimeMs: 2000,
          dropOrder: 1,
        }),
        createMockEvent('FLOW_DROP_ATTEMPTED', {
          proposalType: 'position',
          placementTimeMs: 1500,
          dropOrder: 2,
        }),
      ];

      const timings = PlaceSessionProjector.getPlacementTimings(events);
      expect(timings.byDropOrder[1]).toEqual([1000, 2000]);
      expect(timings.byModality.position).toEqual([1000, 1500]);
    });

    it('getAdaptiveZoneProgression should extract zone history', () => {
      const events: GameEvent[] = [
        createMockEvent('FLOW_STIMULUS_SHOWN', { trialIndex: 0, adaptiveZone: 3 }),
        createMockEvent('FLOW_STIMULUS_SHOWN', { trialIndex: 1, adaptiveZone: 4 }),
      ];

      const progression = PlaceSessionProjector.getAdaptiveZoneProgression(events);
      expect(progression).toHaveLength(2);
      expect(progression[0]!.zone).toBe(3);
      expect(progression[1]!.zone).toBe(4);
    });
  });
});
