import { describe, expect, it } from 'bun:test';
import { DualPickSessionProjector } from './dual-pick-projector';
import type { GameEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';

// =============================================================================
// Test Event Factories using createMockEvent
// =============================================================================

function createSessionStartedEvent(overrides?: Partial<GameEvent>): GameEvent {
  return createMockEvent('DUAL_PICK_SESSION_STARTED', {
    timestamp: 1000,
    sessionId: 's1',
    userId: 'u1',
    // @ts-expect-error test override
    config: {
      nLevel: 2,
      trialsCount: 10,
      activeModalities: ['position', 'audio'],
      placementOrderMode: 'free',
      stimulusDurationMs: 2000,
      distractorCount: 0,
    },
    ...overrides,
  });
}

function createStimulusShownEvent(trialIndex: number, timestamp: number): GameEvent {
  return createMockEvent('DUAL_PICK_STIMULUS_SHOWN', {
    timestamp,
    sessionId: 's1',
    trialIndex,
    // @ts-expect-error test override
    position: trialIndex % 8,
    sound: 'K',
    stimulusDurationMs: 2000,
  });
}

function createDropAttemptedEvent(
  trialIndex: number,
  correct: boolean,
  options?: {
    proposalType?: 'position' | 'audio';
    placementTimeMs?: number;
    isLastSlot?: boolean;
    targetSlot?: number;
  },
): GameEvent {
  return createMockEvent('DUAL_PICK_DROP_ATTEMPTED', {
    timestamp: 3000 + trialIndex * 1000,
    sessionId: 's1',
    trialIndex,
    proposalId: `p-${trialIndex}`,
    proposalType: options?.proposalType ?? 'position',
    proposalLabel: 'N',
    targetSlot: options?.targetSlot ?? 0,
    correct,
    placementTimeMs: options?.placementTimeMs ?? 500,
    dropOrder: 1,
    isLastSlot: options?.isLastSlot ?? false,
    mirror: false,
  });
}

function createTurnCompletedEvent(trialIndex: number, timestamp: number): GameEvent {
  return createMockEvent('DUAL_PICK_TURN_COMPLETED', {
    timestamp,
    sessionId: 's1',
    trialIndex,
    turnDurationMs: 2000,
  });
}

function createSessionEndedEvent(
  timestamp: number,
  reason: 'completed' | 'abandoned' = 'completed',
): GameEvent {
  return createMockEvent('DUAL_PICK_SESSION_ENDED', {
    timestamp,
    sessionId: 's1',
    reason,
    totalTrials: 10,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('DualPickSessionProjector', () => {
  describe('project', () => {
    it('should return null if no session started event', () => {
      const events: GameEvent[] = [];
      const result = DualPickSessionProjector.project(events);
      expect(result).toBeNull();
    });

    it('should project a minimal session', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('s1');
      expect(result?.nLevel).toBe(2);
      expect(result?.completed).toBe(true);
    });

    it('should compute correct stats for multiple turns', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        // Turn 0: 2 correct drops
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true, { proposalType: 'position' }),
        createDropAttemptedEvent(0, true, { proposalType: 'audio' }),
        createTurnCompletedEvent(0, 4000),
        // Turn 1: 1 correct, 1 error
        createStimulusShownEvent(1, 5000),
        createDropAttemptedEvent(1, true, { proposalType: 'position' }),
        createDropAttemptedEvent(1, false, { proposalType: 'audio' }),
        createTurnCompletedEvent(1, 7000),
        createSessionEndedEvent(8000),
      ];

      const result = DualPickSessionProjector.project(events);

      expect(result?.finalStats.totalDrops).toBe(4);
      expect(result?.finalStats.correctDrops).toBe(3);
      expect(result?.finalStats.errorCount).toBe(1);
      expect(result?.finalStats.accuracy).toBe(0.75);
    });

    it('should exclude last slot drops from stats', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true, { isLastSlot: false }),
        createDropAttemptedEvent(0, true, { isLastSlot: true }), // Should be excluded
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // Only 1 drop should be counted (the non-last-slot one)
      expect(result?.finalStats.totalDrops).toBe(1);
    });

    it('should compute duration correctly', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent({ timestamp: 1000 }),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(6000),
      ];

      const result = DualPickSessionProjector.project(events);

      expect(result?.durationMs).toBe(5000); // 6000 - 1000
    });

    it('should mark session as not completed when abandoned', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createSessionEndedEvent(3000, 'abandoned'),
      ];

      const result = DualPickSessionProjector.project(events);

      expect(result?.completed).toBe(false);
    });

    it('should compute by-modality stats', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true, { proposalType: 'position', placementTimeMs: 400 }),
        createDropAttemptedEvent(0, true, { proposalType: 'position', placementTimeMs: 600 }),
        createDropAttemptedEvent(0, false, { proposalType: 'audio', placementTimeMs: 800 }),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      expect(result?.extendedStats.byModality.position).toBeDefined();
      // @ts-expect-error test: nullable access
      expect(result?.extendedStats.byModality.position.totalDrops).toBe(2);
      // @ts-expect-error test: nullable access
      expect(result?.extendedStats.byModality.position.correctDrops).toBe(2);
      // @ts-expect-error test: nullable access
      expect(result?.extendedStats.byModality.position.avgPlacementTimeMs).toBe(500);

      expect(result?.extendedStats.byModality.audio).toBeDefined();
      // @ts-expect-error test: nullable access
      expect(result?.extendedStats.byModality.audio.totalDrops).toBe(1);
      // @ts-expect-error test: nullable access
      expect(result?.extendedStats.byModality.audio.errorCount).toBe(1);
    });
  });

  describe('computeTurnResult', () => {
    it('should compute turn result from drops', () => {
      const turnCompleted = createMockEvent('DUAL_PICK_TURN_COMPLETED', {
        trialIndex: 0,
        turnDurationMs: 2000,
      });

      const drops = [
        createDropAttemptedEvent(0, true),
        createDropAttemptedEvent(0, true),
        createDropAttemptedEvent(0, false),
      ];

      // @ts-expect-error test override
      const result = DualPickSessionProjector.computeTurnResult(turnCompleted, drops);

      expect(result.trialIndex).toBe(0);
      expect(result.totalDrops).toBe(3);
      expect(result.correctDrops).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.accuracy).toBeCloseTo(0.667, 2);
    });

    it('should only include drops from the same trial', () => {
      const turnCompleted = createMockEvent('DUAL_PICK_TURN_COMPLETED', {
        trialIndex: 1,
        turnDurationMs: 2000,
      });

      const drops = [
        createDropAttemptedEvent(0, true), // Different trial
        createDropAttemptedEvent(1, true),
        createDropAttemptedEvent(1, false),
      ];

      // @ts-expect-error test override
      const result = DualPickSessionProjector.computeTurnResult(turnCompleted, drops);

      expect(result.totalDrops).toBe(2);
    });
  });

  describe('computeExtendedStats', () => {
    it('should return empty stats for no turns', () => {
      const result = DualPickSessionProjector.computeExtendedStats([], ['position', 'audio'], []);

      expect(result.turnsCompleted).toBe(0);
      expect(result.totalDrops).toBe(0);
      expect(result.trend).toBe('stable');
    });

    it('should compute average turn duration', () => {
      const turns = [
        {
          trialIndex: 0,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 1,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 1,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 1,
          turnDurationMs: 3000,
        },
      ];

      const result = DualPickSessionProjector.computeExtendedStats(turns, ['position'], []);

      expect(result.avgTurnDurationMs).toBe(2000);
    });

    it('should detect improving trend', () => {
      const turns = [
        {
          trialIndex: 0,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.5,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 1,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.6,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 2,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.7,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 3,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 0.8,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 4,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 0.9,
          turnDurationMs: 1000,
        },
      ];

      const result = DualPickSessionProjector.computeExtendedStats(turns, ['position'], []);

      expect(result.trend).toBe('improving');
    });

    it('should detect declining trend', () => {
      const turns = [
        {
          trialIndex: 0,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 0.9,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 1,
          totalDrops: 2,
          correctDrops: 2,
          errorCount: 0,
          accuracy: 0.8,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 2,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.7,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 3,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.6,
          turnDurationMs: 1000,
        },
        {
          trialIndex: 4,
          totalDrops: 2,
          correctDrops: 1,
          errorCount: 1,
          accuracy: 0.5,
          turnDurationMs: 1000,
        },
      ];

      const result = DualPickSessionProjector.computeExtendedStats(turns, ['position'], []);

      expect(result.trend).toBe('declining');
    });
  });

  describe('confidence scoring', () => {
    it('should set confidenceScore to null for last slot drops', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true, { isLastSlot: true }),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // @ts-expect-error test: nullable access
      expect(result?.dropConfidenceMetrics[0].confidenceScore).toBeNull();
    });

    it('should assign 0 confidence for incorrect drops', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, false, { isLastSlot: false }),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // @ts-expect-error test: nullable access
      expect(result?.dropConfidenceMetrics[0].confidenceScore).toBe(0);
    });

    it('should compute overall confidence excluding null scores', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        // Turn with 2 drops: first has trajectory, second is last slot
        createStimulusShownEvent(0, 2000),
        // @ts-expect-error test override
        createMockEvent('DUAL_PICK_DROP_ATTEMPTED', {
          ...createDropAttemptedEvent(0, true, { isLastSlot: false }),
          totalDistancePx: 100,
          directDistancePx: 90,
        }),
        createDropAttemptedEvent(0, true, { isLastSlot: true }), // Should be excluded
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // Only the first drop should be included in confidence calculation
      expect(result?.confidenceScore).toBeGreaterThan(0);
    });
  });

  describe('score calculation', () => {
    it('should use confidence score when enough trajectory data', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        // @ts-expect-error test override
        createMockEvent('DUAL_PICK_DROP_ATTEMPTED', {
          ...createDropAttemptedEvent(0, true),
          totalDistancePx: 100,
          directDistancePx: 95,
        }),
        // @ts-expect-error test override
        createMockEvent('DUAL_PICK_DROP_ATTEMPTED', {
          ...createDropAttemptedEvent(0, true),
          totalDistancePx: 100,
          directDistancePx: 90,
        }),
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // With trajectory data, score should be based on confidence
      expect(result?.score).toBeGreaterThan(0);
    });

    it('should fallback to error-based score when no trajectory data', () => {
      const events: GameEvent[] = [
        createSessionStartedEvent(),
        createStimulusShownEvent(0, 2000),
        createDropAttemptedEvent(0, true),
        createDropAttemptedEvent(0, false), // 1 error
        createTurnCompletedEvent(0, 4000),
        createSessionEndedEvent(5000),
      ];

      const result = DualPickSessionProjector.project(events);

      // Fallback: 100 - 5 * errorCount
      expect(result?.score).toBe(95); // 100 - 5 * 1
    });
  });
});
