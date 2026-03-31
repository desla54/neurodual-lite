import { describe, expect, it } from 'bun:test';
import {
  getModalityStats,
  getTrialModalityOutcome,
  getTotalStats,
  getAllReactionTimes,
  GameEventSchema,
} from './events';
import { createMockEvent } from '../test-utils/test-factories';
import type { RunningStats } from '../types/events';

describe('Game Events Helpers', () => {
  const mockRunningStats = {
    trialsCompleted: 20,
    globalDPrime: 1.5,
    byModality: {
      position: {
        hits: 5,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 13,
        avgRT: 400,
        dPrime: 1.5,
      },
      audio: { hits: 4, misses: 2, falseAlarms: 2, correctRejections: 12, avgRT: 450, dPrime: 1.2 },
    },
  };

  describe('getModalityStats', () => {
    it('should return existing modality stats', () => {
      const stats = getModalityStats(mockRunningStats, 'position');
      expect(stats.hits).toBe(5);
    });

    it('should return empty stats for missing modality', () => {
      const stats = getModalityStats(mockRunningStats, 'color' as any);
      expect(stats.hits).toBe(0);
      expect(stats.dPrime).toBe(0);
    });
  });

  describe('getTrialModalityOutcome', () => {
    const outcome = {
      trialIndex: 0,
      byModality: {
        position: { result: 'hit' as const, reactionTime: 350, wasLure: false },
      },
    };

    it('should return existing outcome', () => {
      const result = getTrialModalityOutcome(outcome, 'position');
      expect(result.result).toBe('hit');
    });

    it('should return default outcome for missing modality', () => {
      const result = getTrialModalityOutcome(outcome, 'audio');
      expect(result.result).toBe('correctRejection');
      expect(result.reactionTime).toBeNull();
    });
  });

  describe('getTotalStats', () => {
    it('should calculate totals for all modalities', () => {
      const totals = getTotalStats(mockRunningStats);
      // Hits: 5 + 4 = 9
      // Misses: 1 + 2 = 3
      // FA: 1 + 2 = 3
      // CR: 13 + 12 = 25
      expect(totals.totalHits).toBe(9);
      expect(totals.totalMisses).toBe(3);
      expect(totals.totalFalseAlarms).toBe(3);
      expect(totals.totalCorrectRejections).toBe(25);
    });

    it('should handle stats without byModality', () => {
      // Cas limite, on force le typage pour tester la robustesse
      const emptyStats = { trialsCompleted: 0, globalDPrime: 0, byModality: {} } as RunningStats;
      const totals = getTotalStats(emptyStats);
      expect(totals.totalHits).toBe(0);
    });
  });

  describe('getAllReactionTimes', () => {
    it('should extract all non-null reaction times', () => {
      const outcome = {
        trialIndex: 0,
        byModality: {
          position: { result: 'hit' as const, reactionTime: 350, wasLure: false },
          audio: { result: 'hit' as const, reactionTime: 420, wasLure: false },
          color: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
        },
      };
      const rts = getAllReactionTimes(outcome);
      expect(rts).toEqual([350, 420]);
    });
  });

  describe('GameEventSchema', () => {
    it('should validate SESSION_STARTED event', () => {
      const event = createMockEvent('SESSION_STARTED', {
        sessionId: 's1',
        userId: 'u1',
        nLevel: 2,
        device: {
          platform: 'web',
          screenWidth: 1024,
          screenHeight: 768,
          userAgent: 'test',
          touchCapable: false,
        },
        context: {
          timeOfDay: 'afternoon',
          localHour: 14,
          dayOfWeek: 1,
          timezone: 'UTC',
        },
        config: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.2,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
          generator: 'BrainWorkshop',
        },
      });
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate SESSION_ENDED event', () => {
      const event = createMockEvent('SESSION_ENDED', {
        reason: 'completed',
      });
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate SESSION_IMPORTED event', () => {
      const event = createMockEvent('SESSION_IMPORTED', {
        nLevel: 2,
        dPrime: 2.5,
        passed: true,
        trialsCount: 20,
        durationMs: 60000,
        generator: 'BrainWorkshop',
        activeModalities: ['position'],
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            avgRT: 400,
            dPrime: 3.0,
          },
        },
        reason: 'completed',
        upsScore: 82,
        upsAccuracy: 82,
        flowConfidenceScore: 70,
        recallConfidenceScore: 75,
        avgResponseTimeMs: 420,
        focusLostCount: 1,
        originalCreatedAt: new Date().toISOString(),
      });
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate RECALL_SESSION_STARTED event', () => {
      const event = createMockEvent('RECALL_SESSION_STARTED', {
        userId: 'u1',
        trialsCount: 20,
        trialsSeed: 'seed',
        trialsHash: 'hash',
        config: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          stimulusDurationSeconds: 0.5,
          feedbackMode: 'on-commit',
          feedbackDurationMs: 500,
          progressiveWindow: {
            enabled: true,
            initialDepth: 1,
            expansionThreshold: 0.8,
            contractionThreshold: 0.5,
            observationWindows: 3,
            cooldownWindows: 1,
          },
          scoringVersion: 'v1',
          targetProbability: 0.3,
          lureProbability: 0.1,
          fillOrderMode: 'sequential',
        },
        device: {
          platform: 'web',
          screenWidth: 1024,
          screenHeight: 768,
          userAgent: 'test',
          touchCapable: false,
        },
        context: { timeOfDay: 'morning', localHour: 8, dayOfWeek: 1, timezone: 'UTC' },
      });
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate FLOW_DROP_ATTEMPTED event', () => {
      const event = createMockEvent('FLOW_DROP_ATTEMPTED', {
        trialIndex: 5,
        proposalId: 'p1',
        proposalType: 'position',
        proposalValue: 3,
        targetSlot: 3,
        correct: true,
        placementTimeMs: 1200,
        dropOrder: 1,
      });
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should enforce journeyStageId constraints', () => {
      const baseSession = createMockEvent('SESSION_STARTED', {
        userId: 'u1',
        nLevel: 2,
        device: {
          platform: 'web',
          screenWidth: 1024,
          screenHeight: 768,
          userAgent: 'test',
          touchCapable: false,
        },
        context: { timeOfDay: 'afternoon', localHour: 14, dayOfWeek: 1, timezone: 'UTC' },
        config: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.2,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
          generator: 'BrainWorkshop',
        },
        playContext: 'journey',
        journeyId: 'journey-1',
        journeyStageId: 1,
        journeyStartLevel: 1,
        journeyTargetLevel: 5,
      });

      // Valid: 1 and 60
      expect(GameEventSchema.safeParse({ ...baseSession, journeyStageId: 1 }).success).toBe(true);
      expect(GameEventSchema.safeParse({ ...baseSession, journeyStageId: 60 }).success).toBe(true);

      // Invalid: 0 and 61
      expect(GameEventSchema.safeParse({ ...baseSession, journeyStageId: 0 }).success).toBe(false);
      expect(GameEventSchema.safeParse({ ...baseSession, journeyStageId: 61 }).success).toBe(false);
    });
  });
});
