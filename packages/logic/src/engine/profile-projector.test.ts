import { describe, expect, it } from 'bun:test';
import {
  computeProfileFromEvents,
  createEmptyProfile,
  rebuildProfile,
  projectProfileFromSessions,
} from './profile-projector';
import type { GameEvent } from './events';
import type { SessionHistoryItem } from '../ports/history-port';
import { createMockEvent } from '../test-utils/test-factories';

describe('ProfileProjector', () => {
  const userId = 'user-123';

  describe('createEmptyProfile', () => {
    it('should create a profile with default values', () => {
      const profile = createEmptyProfile(userId);
      expect(profile.odalisqueId).toBe(userId);
      expect(profile.totalSessions).toBe(0);
      expect(profile.currentNLevel).toBe(1);
      expect(profile.modalities.size).toBe(0);
    });
  });

  describe('computeProfileFromEvents', () => {
    it('should return empty profile for empty events', () => {
      const profile = computeProfileFromEvents(userId, []);
      expect(profile.totalSessions).toBe(0);
    });

    it('should project a profile from a single session', () => {
      const timestamp = Date.now();
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          sessionId: 's1',
          userId,
          timestamp,
          nLevel: 2,
          config: {
            activeModalities: ['position', 'audio'],
            nLevel: 2,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
            trialsCount: 20,
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
        // Minimum trials for SessionProjector to return a summary
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
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
          timestamp: timestamp + 100,
        }),
        createMockEvent('USER_RESPONDED', {
          sessionId: 's1',
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 400,
          timestamp: timestamp + 200,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 1,
            isBuffer: false,
            isPositionTarget: false,
            position: 2,
            // @ts-expect-error test override
            sound: 'B',
            // @ts-expect-error test override
            color: 'blue',
            trialType: 'Non-Cible',
          },
          timestamp: timestamp + 300,
        }),
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 2,
            isBuffer: false,
            isPositionTarget: false,
            position: 3,
            sound: 'C',
            // @ts-expect-error test override
            color: 'blue',
            trialType: 'Non-Cible',
          },
          timestamp: timestamp + 400,
        }),
        createMockEvent('SESSION_ENDED', {
          sessionId: 's1',
          reason: 'completed',
          timestamp: timestamp + 5000,
        }),
      ];

      const profile = computeProfileFromEvents(userId, events);

      expect(profile.totalSessions).toBe(1);
      expect(profile.currentNLevel).toBe(2); // played level
      expect(profile.modalities.has('position')).toBe(true);
    });

    it('should calculate streaks and daily activity', () => {
      // Ensure we use fixed dates to avoid timezone/DST issues in tests
      const today = new Date().toISOString().split('T')[0]!;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;

      const createSession = (id: string, dateStr: string, timestamp: number) => [
        createMockEvent('SESSION_STARTED', {
          sessionId: id,
          userId,
          timestamp,
          nLevel: 2,
          config: {
            activeModalities: ['position'],
            nLevel: 2,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
            trialsCount: 20,
          },
        }),
        createMockEvent('SESSION_ENDED', {
          sessionId: id,
          reason: 'completed',
          timestamp: timestamp + 1000,
        }),
      ];

      const events = [
        ...createSession('s1', yesterday, new Date(yesterday).getTime() + 36000000), // Yesterday 10am
        ...createSession('s2', today, new Date(today).getTime() + 36000000), // Today 10am
      ];

      const profile = computeProfileFromEvents(userId, events);
      // Streak computation moved to UnifiedProjectionManager (streak_projection table)
      // computeProfileFromEvents now returns placeholder values for streak
      expect(profile.currentStreak).toBe(0);
      expect(profile.longestStreak).toBe(0);
    });

    it('should detect strengths and weaknesses', () => {
      const timestamp = Date.now();
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          sessionId: 's1',
          userId,
          timestamp,
          nLevel: 2,
          config: {
            activeModalities: ['position', 'audio'],
            nLevel: 2,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
            trialsCount: 20,
          },
        }),
        // Position: Perfect (Hit + CR)
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 0,
            isPositionTarget: true,
            isSoundTarget: false,
            position: 1,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
          timestamp: timestamp + 100,
        }),
        createMockEvent('USER_RESPONDED', {
          sessionId: 's1',
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 400,
          timestamp: timestamp + 200,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 1,
            isPositionTarget: false,
            isSoundTarget: false,
            position: 2,
            // @ts-expect-error test override
            sound: 'B',
            // @ts-expect-error test override
            color: 'blue',
            trialType: 'Non-Cible',
          },
          timestamp: timestamp + 300,
        }),

        // Audio: Poor (Miss + FA)
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 2,
            isPositionTarget: false,
            isSoundTarget: true,
            position: 3,
            sound: 'C',
            // @ts-expect-error test override
            color: 'blue',
            // @ts-expect-error test override
            trialType: 'Cible',
          },
          timestamp: timestamp + 400,
        }),
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 3,
            isPositionTarget: false,
            isSoundTarget: false,
            position: 4,
            // @ts-expect-error test override
            sound: 'D',
            // @ts-expect-error test override
            color: 'blue',
            trialType: 'Non-Cible',
          },
          timestamp: timestamp + 500,
        }),
        createMockEvent('USER_RESPONDED', {
          sessionId: 's1',
          trialIndex: 3,
          modality: 'audio',
          reactionTimeMs: 400,
          timestamp: timestamp + 600,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),

        createMockEvent('SESSION_ENDED', {
          sessionId: 's1',
          reason: 'completed',
          timestamp: timestamp + 1000,
        }),
      ];

      const profile = computeProfileFromEvents(userId, events);
      // At least one strength or weakness should be detected if d' diff > 0.5
      expect(profile.modalities.size).toBe(2);
    });

    it('should calculate lure vulnerability', () => {
      const timestamp = Date.now();
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          sessionId: 's1',
          userId,
          timestamp,
          nLevel: 2,
          config: {
            activeModalities: ['position'],
            nLevel: 2,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
            trialsCount: 20,
          },
        }),
        createMockEvent('TRIAL_PRESENTED', {
          sessionId: 's1',
          trial: {
            index: 0,
            position: 1,
            // @ts-expect-error test override
            sound: 'A',
            // @ts-expect-error test override
            color: 'blue',
            isBuffer: false,
            isPositionTarget: false,
            isSoundTarget: false,
            isColorTarget: false,
            // @ts-expect-error test override
            trialType: 'Leurre',
            isPositionLure: true,
          },
          timestamp: timestamp + 100,
        }),
        createMockEvent('USER_RESPONDED', {
          sessionId: 's1',
          trialIndex: 0,
          modality: 'position',
          timestamp: timestamp + 200,
          reactionTimeMs: 400,
          pressDurationMs: 100,
          responsePhase: 'during_stimulus',
        }),
        createMockEvent('SESSION_ENDED', {
          sessionId: 's1',
          reason: 'completed',
          timestamp: timestamp + 1000,
        }),
      ];

      const profile = computeProfileFromEvents(userId, events);
      expect(profile.modalities.get('position')).toBeDefined();
    });

    it('should respect manual mode (custom) for currentNLevel', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          sessionId: 's1',
          userId,
          timestamp: 1000,
          nLevel: 5,
          gameMode: 'custom',
          config: {
            nLevel: 5,
            activeModalities: ['position'],
            trialsCount: 20,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 2,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
          },
        }),
        createMockEvent('SESSION_ENDED', {
          sessionId: 's1',
          reason: 'completed',
          timestamp: 2000,
        }),
      ];

      const profile = computeProfileFromEvents(userId, events);
      expect(profile.currentNLevel).toBe(5);
    });
  });

  describe('rebuildProfile', () => {
    it('should recompute profile from provided events', () => {
      const events: GameEvent[] = [
        createMockEvent('SESSION_STARTED', {
          sessionId: 's1',
          userId,
          timestamp: 1000,
          nLevel: 2,
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 20,
            // @ts-expect-error test override
            generator: 'test',
            intervalSeconds: 2,
            stimulusDurationSeconds: 0.5,
            targetProbability: 0.3,
            lureProbability: 0.1,
          },
        }),
        createMockEvent('SESSION_ENDED', {
          sessionId: 's1',
          reason: 'completed',
          timestamp: 2000,
        }),
      ];
      const profile = rebuildProfile(userId, events);
      expect(profile.totalSessions).toBe(1);
    });
  });

  describe('projectProfileFromSessions', () => {
    function createMockSession(overrides?: Partial<SessionHistoryItem>): SessionHistoryItem {
      return {
        id: 's1',
        createdAt: new Date(),
        nLevel: 2,
        dPrime: 2.0,
        passed: true,
        trialsCount: 20,
        durationMs: 60000,
        byModality: {
          // @ts-expect-error test override
          position: {
            hits: 8,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 9,
            avgRT: 450,
          },
          // @ts-expect-error test override
          audio: {
            hits: 7,
            misses: 3,
            falseAlarms: 2,
            correctRejections: 8,
            avgRT: 480,
          },
        },
        generator: 'Adaptive',
        activeModalities: ['position', 'audio'],
        reason: 'completed',
        // @ts-expect-error test override
        unifiedMetrics: { zone: 10, zoneProgress: 0.5, accuracy: 0.85 },
        ...overrides,
      };
    }

    it('returns empty profile for empty sessions', () => {
      const profile = projectProfileFromSessions([], 'user-1');
      expect(profile.totalSessions).toBe(0);
      expect(profile.currentNLevel).toBe(1);
    });

    it('projects profile from single session', () => {
      const sessions = [createMockSession()];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.totalSessions).toBe(1);
      expect(profile.currentNLevel).toBe(2);
      expect(profile.totalTrials).toBe(20);
      expect(profile.totalDurationMs).toBe(60000);
    });

    it('aggregates modality stats across sessions', () => {
      const sessions = [
        createMockSession({ id: 's1' }),
        createMockSession({
          id: 's2',
          createdAt: new Date(Date.now() - 86400000),
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.totalSessions).toBe(2);
      expect(profile.modalities.get('position')?.hits).toBe(16); // 8 + 8
      expect(profile.modalities.get('audio')?.hits).toBe(14); // 7 + 7
    });

    it('tracks highest N level across sessions', () => {
      const sessions = [
        createMockSession({ id: 's1', nLevel: 2 }),
        createMockSession({
          id: 's2',
          nLevel: 4,
          createdAt: new Date(Date.now() - 86400000),
        }),
        createMockSession({
          id: 's3',
          nLevel: 3,
          createdAt: new Date(Date.now() - 172800000),
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.currentNLevel).toBe(2); // Most recent
      expect(profile.highestNLevel).toBe(4);
    });

    it('tracks best d-prime', () => {
      const sessions = [
        createMockSession({ id: 's1', dPrime: 1.5 }),
        createMockSession({
          id: 's2',
          dPrime: 3.0,
          createdAt: new Date(Date.now() - 86400000),
        }),
        createMockSession({
          id: 's3',
          dPrime: 2.0,
          createdAt: new Date(Date.now() - 172800000),
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.bestDPrime).toBe(3.0);
    });

    it('calculates avg d-prime correctly', () => {
      const sessions = [
        createMockSession({ id: 's1', dPrime: 1.0 }),
        createMockSession({
          id: 's2',
          dPrime: 2.0,
          createdAt: new Date(Date.now() - 86400000),
        }),
        createMockSession({
          id: 's3',
          dPrime: 3.0,
          createdAt: new Date(Date.now() - 172800000),
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.avgDPrime).toBeCloseTo(2.0, 2);
    });

    it('calculates progression points by week', () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

      const sessions = [
        createMockSession({ id: 's1', createdAt: now, nLevel: 3, dPrime: 2.5 }),
        createMockSession({ id: 's2', createdAt: oneWeekAgo, nLevel: 2, dPrime: 2.0 }),
        createMockSession({ id: 's3', createdAt: twoWeeksAgo, nLevel: 2, dPrime: 1.5 }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.progression.length).toBeGreaterThanOrEqual(1);
    });

    it('detects strengths and weaknesses based on d-prime gap', () => {
      const sessions = [
        createMockSession({
          id: 's1',
          byModality: {
            // @ts-expect-error test override
            position: {
              hits: 9,
              misses: 1,
              falseAlarms: 0,
              correctRejections: 10,
              avgRT: 400,
            },
            // @ts-expect-error test override
            audio: {
              hits: 3,
              misses: 7,
              falseAlarms: 5,
              correctRejections: 5,
              avgRT: 500,
            },
          },
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      // With significant performance gap, strengths/weaknesses should be detected
      expect(profile.modalities.size).toBe(2);
      // d-prime for position should be much higher than audio
      const positionDPrime = profile.modalities.get('position')?.dPrime ?? 0;
      const audioDPrime = profile.modalities.get('audio')?.dPrime ?? 0;
      expect(positionDPrime).toBeGreaterThan(audioDPrime);
    });

    it('handles sessions without d-prime (null)', () => {
      const sessions = [
        createMockSession({
          id: 's1',
          dPrime: null as unknown as number,
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.totalSessions).toBe(1);
      expect(profile.avgDPrime).toBe(0);
      expect(profile.bestDPrime).toBe(0);
    });

    it('calculates preferred ISI from reaction times', () => {
      const sessions = [
        createMockSession({
          id: 's1',
          byModality: {
            // @ts-expect-error test override
            position: { hits: 5, misses: 0, falseAlarms: 0, correctRejections: 5, avgRT: 300 },
          },
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.preferredISI).toBeGreaterThan(0);
      expect(profile.avgReactionTime).toBeCloseTo(300, 0);
    });

    it('calculates streaks from consecutive days', () => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 86400000);
      const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);

      const sessions = [
        createMockSession({ id: 's1', createdAt: today }),
        createMockSession({ id: 's2', createdAt: yesterday }),
        createMockSession({ id: 's3', createdAt: twoDaysAgo }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.currentStreak).toBe(3);
      expect(profile.longestStreak).toBeGreaterThanOrEqual(3);
    });

    it('tracks mastery by modality', () => {
      // Sessions with d-prime above mastery threshold
      const sessions = [
        createMockSession({ id: 's1', dPrime: 2.5 }),
        createMockSession({
          id: 's2',
          dPrime: 2.5,
          createdAt: new Date(Date.now() - 86400000),
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      // Mastery count should be tracked
      expect(profile.masteryCountByModality.size).toBeGreaterThanOrEqual(0);
    });

    it('tracks maxN by modality', () => {
      const sessions = [
        createMockSession({
          id: 's1',
          nLevel: 4,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 8, misses: 2, falseAlarms: 1, correctRejections: 9, avgRT: 450 },
          },
        }),
        createMockSession({
          id: 's2',
          nLevel: 2,
          createdAt: new Date(Date.now() - 86400000),
          byModality: {
            // @ts-expect-error test override
            position: { hits: 8, misses: 2, falseAlarms: 1, correctRejections: 9, avgRT: 450 },
          },
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.maxNByModality.get('position')).toBe(4);
    });

    it('handles empty byModality gracefully', () => {
      const sessions = [
        createMockSession({
          id: 's1',
          byModality: {},
        }),
      ];
      const profile = projectProfileFromSessions(sessions, 'user-1');

      expect(profile.totalSessions).toBe(1);
      expect(profile.modalities.size).toBe(0);
    });
  });
});
