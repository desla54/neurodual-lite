import { describe, expect, it } from 'bun:test';
import { SessionProjector } from './session-projector';
import type { GameEvent, UserResponseEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';

describe('SessionProjector', () => {
  describe('computeTrialResult', () => {
    it('should return hit when target is pressed', () => {
      expect(SessionProjector.computeTrialResult(true, true)).toBe('hit');
    });
    it('should return miss when target is not pressed', () => {
      expect(SessionProjector.computeTrialResult(true, false)).toBe('miss');
    });
    it('should return falseAlarm when non-target is pressed', () => {
      expect(SessionProjector.computeTrialResult(false, true)).toBe('falseAlarm');
    });
    it('should return correctRejection when non-target is not pressed', () => {
      expect(SessionProjector.computeTrialResult(false, false)).toBe('correctRejection');
    });
  });

  describe('computeRunningStats - edge cases', () => {
    it('should handle empty outcomes array', () => {
      const stats = SessionProjector.computeRunningStats([]);
      expect(stats.trialsCompleted).toBe(0);
      expect(stats.globalDPrime).toBe(0);
      expect(stats.byModality).toEqual({});
    });

    it('should handle outcomes with null reaction times', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: {
            position: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
          },
        },
        {
          trialIndex: 1,
          byModality: { position: { result: 'miss' as const, reactionTime: null, wasLure: false } },
        },
      ];
      const stats = SessionProjector.computeRunningStats(outcomes);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.avgRT).toBeNull();
    });

    it('should handle multiple modalities correctly', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: {
            position: { result: 'hit' as const, reactionTime: 400, wasLure: false },
            audio: { result: 'miss' as const, reactionTime: null, wasLure: false },
          },
        },
      ];
      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.globalDPrime).toBeDefined();
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.avgRT).toBe(400);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.audio.avgRT).toBeNull();
    });
  });

  describe('computeTrialOutcome', () => {
    const trialEvent = createMockEvent('TRIAL_PRESENTED', {
      trial: {
        index: 5,
        isBuffer: false,
        position: 1,
        // @ts-expect-error test override
        sound: 'A',
        trialType: 'V-Seul',
        isPositionTarget: true,
        isSoundTarget: false,
        isColorTarget: false,
        // @ts-expect-error test override
        color: 'blue', // Mandatory field
      },
      isiMs: 2000,
      stimulusDurationMs: 500,
    });

    it('should compute outcome for target with hit', () => {
      const responses: UserResponseEvent[] = [
        createMockEvent('USER_RESPONDED', {
          trialIndex: 5,
          modality: 'position',
          reactionTimeMs: 400,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
      ];

      const outcome = SessionProjector.computeTrialOutcome(trialEvent, responses, [
        'position',
        'audio',
      ]);
      expect(outcome.trialIndex).toBe(5);
      // @ts-expect-error test: nullable access
      expect(outcome!.byModality.position.result).toBe('hit');
      // @ts-expect-error test: nullable access
      expect(outcome!.byModality.position.reactionTime).toBe(400);
      // @ts-expect-error test: nullable access
      expect(outcome!.byModality.audio.result).toBe('correctRejection');
    });

    it('should compute outcome for target with miss', () => {
      const outcome = SessionProjector.computeTrialOutcome(trialEvent, [], ['position']);
      // @ts-expect-error test: nullable access
      expect(outcome!.byModality.position.result).toBe('miss');
    });
  });

  describe('computeRunningStats', () => {
    it('should aggregate stats for multiple outcomes', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: { position: { result: 'hit' as const, reactionTime: 400, wasLure: false } },
        },
        {
          trialIndex: 1,
          byModality: { position: { result: 'miss' as const, reactionTime: null, wasLure: false } },
        },
        {
          trialIndex: 2,
          byModality: {
            position: { result: 'falseAlarm' as const, reactionTime: 300, wasLure: true },
          },
        },
        {
          trialIndex: 3,
          byModality: {
            position: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
          },
        },
      ];

      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.trialsCompleted).toBe(4);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.hits).toBe(1);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.misses).toBe(1);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.falseAlarms).toBe(1);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.correctRejections).toBe(1);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.avgRT).toBe(350); // (400+300)/2
    });

    it('should compute global d-prime as average', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: {
            position: { result: 'hit' as const, reactionTime: 400, wasLure: false },
            audio: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
          },
        },
      ];
      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.globalDPrime).toBeDefined();
    });
  });

  describe('project', () => {
    it('should project a complete session', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          timestamp: 1000,
          nLevel: 2,
          // @ts-expect-error test override
          config: {
            activeModalities: ['position'],
            trialsCount: 10,
            generator: 'DualnbackClassic', // Mandatory
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
          },
          device: {
            platform: 'web',
            screenWidth: 100,
            screenHeight: 100,
            userAgent: 'test',
            touchCapable: false,
          },
          context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
        }),
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 0,
            isBuffer: false,
            isPositionTarget: true,
            position: 1,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
          isiMs: 2000,
          stimulusDurationMs: 500,
          timestamp: 2000,
        }),
        createMockEvent('USER_RESPONDED', {
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 400,
          timestamp: 2400,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
        createMockEvent('FOCUS_LOST', { timestamp: 3000, trialIndex: 0, phase: 'stimulus' }),
        createMockEvent('FOCUS_REGAINED', {
          lostDurationMs: 1000,
          timestamp: 4000,
          trialIndex: 0,
        }),
        createMockEvent('SESSION_ENDED', { reason: 'completed', timestamp: 5000 }),
      ];

      const summary = SessionProjector.project(events);
      expect(summary).not.toBeNull();
      expect(summary?.sessionId).toBe('test-session-id');
      expect(summary?.durationMs).toBe(4000);
      expect(summary?.focusLostCount).toBe(1);
      expect(summary?.totalFocusLostMs).toBe(1000);
      expect(summary?.outcomes).toHaveLength(1);
    });

    it('should return null if session start is missing', () => {
      expect(SessionProjector.project([])).toBeNull();
    });

    it('should calculate duration correctly without session end event', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          timestamp: 1000,
          config: { activeModalities: ['position'] } as any,
        }),
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 0,
            isBuffer: false,
            isPositionTarget: true,
            position: 0,
            sound: 'K',
            color: 'ink-black',
            trialType: 'standard',
          } as any,
          timestamp: 5000,
        }),
      ];

      const summary = SessionProjector.project(events);
      expect(summary?.durationMs).toBe(4000); // Last event timestamp - start timestamp
    });

    it('should handle incomplete session with early termination', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          timestamp: 1000,
          config: { activeModalities: ['position'] } as any,
        }),
        createMockEvent('SESSION_ENDED', { reason: 'abandoned', timestamp: 5000 }),
      ];

      const summary = SessionProjector.project(events);
      expect(summary).not.toBeNull();
      expect(summary?.outcomes).toHaveLength(0);
      expect(summary?.durationMs).toBe(4000);
    });

    it('should return null if session start is missing', () => {
      expect(SessionProjector.project([])).toBeNull();
    });
  });

  describe('computeStatsAtTrial', () => {
    it('should compute stats up to a given trial index', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', { config: { activeModalities: ['position'] } as any }), // Partial config allowed for this specific test if logic permits, or use full
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 0,
            isBuffer: false,
            isPositionTarget: true,
            position: 0,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
        }),
        createMockEvent('USER_RESPONDED', {
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 400,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 1,
            isBuffer: false,
            isPositionTarget: true,
            position: 0,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
        }),
      ];

      const stats = SessionProjector.computeStatsAtTrial(events, 0);
      expect(stats.trialsCompleted).toBe(1);
      // @ts-expect-error test: nullable access
      expect(stats!.byModality.position.hits).toBe(1);
    });

    it('should handle buffer trials correctly', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', { config: { activeModalities: ['position'] } as any }),
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 0,
            isBuffer: true,
            isPositionTarget: false,
            position: 0,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Standard',
          },
        }),
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: 1,
            isBuffer: false,
            isPositionTarget: true,
            position: 0,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
        }),
      ];

      const stats = SessionProjector.computeStatsAtTrial(events, 1);
      expect(stats.trialsCompleted).toBe(1); // Only non-buffer trials
    });
  });

  describe('Edge Cases and Additional Coverage', () => {
    it('should handle all response results', () => {
      expect(SessionProjector.computeTrialResult(true, true)).toBe('hit');
      expect(SessionProjector.computeTrialResult(true, false)).toBe('miss');
      expect(SessionProjector.computeTrialResult(false, true)).toBe('falseAlarm');
      expect(SessionProjector.computeTrialResult(false, false)).toBe('correctRejection');
    });

    it('should handle outcomes with multiple modalities', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: {
            position: { result: 'hit' as const, reactionTime: 400, wasLure: false },
            audio: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
          },
        },
        {
          trialIndex: 1,
          byModality: {
            position: { result: 'miss' as const, reactionTime: null, wasLure: false },
            audio: { result: 'falseAlarm' as const, reactionTime: 500, wasLure: true },
          },
        },
      ];

      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.byModality.position?.dPrime).toBeDefined();
      expect(stats.byModality.audio?.dPrime).toBeDefined();
      expect(stats.globalDPrime).toBeDefined();
    });

    it('should handle only correct rejections', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: {
            position: { result: 'correctRejection' as const, reactionTime: null, wasLure: false },
          },
        },
      ];

      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.byModality.position?.hits).toBe(0);
      expect(stats.byModality.position?.misses).toBe(0);
      expect(stats.byModality.position?.falseAlarms).toBe(0);
      expect(stats.byModality.position?.correctRejections).toBe(1);
    });

    it('should compute stats correctly for all hits', () => {
      const outcomes = Array(5)
        .fill(null)
        .map((_, i) => ({
          trialIndex: i,
          byModality: {
            position: { result: 'hit' as const, reactionTime: 400 + i * 10, wasLure: false },
          },
        }));

      const stats = SessionProjector.computeRunningStats(outcomes);
      expect(stats.byModality.position?.hits).toBe(5);
      expect(stats.byModality.position?.avgRT).toBe(420);
    });

    it('should compute zero d-prime for no accuracy', () => {
      const outcomes = [
        {
          trialIndex: 0,
          byModality: { position: { result: 'miss' as const, reactionTime: 500, wasLure: false } },
        },
        {
          trialIndex: 1,
          byModality: {
            position: { result: 'falseAlarm' as const, reactionTime: 400, wasLure: false },
          },
        },
      ];

      const stats = SessionProjector.computeRunningStats(outcomes);
      // Hit rate = 0/2 = 0, False alarm rate = 1/2 = 0.5
      // d-prime should be low for chance performance
      expect(stats.globalDPrime).toBeDefined();
      expect(stats.globalDPrime).toBeLessThan(2);
    });
  });
});
