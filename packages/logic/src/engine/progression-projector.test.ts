import { describe, expect, it } from 'bun:test';
import { createEmptyProgression, projectProgressionFromSessions } from './progression-projector';
import type { SessionHistoryItem } from '../ports/history-port';

// Helper to create a session history item
function createSession(overrides: Partial<SessionHistoryItem> = {}): SessionHistoryItem {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date('2024-06-15T14:00:00Z'),
    nLevel: 2,
    dPrime: 1.5,
    passed: true,
    trialsCount: 20,
    durationMs: 60000,
    byModality: {},
    generator: 'Adaptive',
    activeModalities: ['position', 'audio'],
    reason: 'completed',
    // @ts-expect-error test override
    unifiedMetrics: { zone: 5, accuracy: 0.8 },
    ...overrides,
  };
}

describe('progression-projector', () => {
  describe('createEmptyProgression', () => {
    it('should return correct defaults', () => {
      const empty = createEmptyProgression();

      expect(empty.totalXP).toBe(0);
      expect(empty.completedSessions).toBe(0);
      expect(empty.abandonedSessions).toBe(0);
      expect(empty.totalTrials).toBe(0);
      expect(empty.firstSessionAt).toBe(null);
      expect(empty.earlyMorningSessions).toBe(0);
      expect(empty.lateNightSessions).toBe(0);
      expect(empty.comebackCount).toBe(0);
      expect(empty.persistentDays).toBe(0);
      expect(empty.plateausBroken).toBe(0);
      expect(empty.uninterruptedSessionsStreak).toBe(0);
    });
  });

  describe('projectProgressionFromSessions', () => {
    it('should return empty progression for empty array', () => {
      const result = projectProgressionFromSessions([]);

      expect(result.totalXP).toBe(0);
      expect(result.completedSessions).toBe(0);
      expect(result.totalTrials).toBe(0);
      expect(result.firstSessionAt).toBe(null);
    });

    it('should process single session correctly', () => {
      const session = createSession({
        trialsCount: 25,
        reason: 'completed',
        // @ts-expect-error test override
        xpBreakdown: { total: 100, base: 80, bonus: 20 },
      });

      const result = projectProgressionFromSessions([session]);

      expect(result.totalXP).toBe(100);
      expect(result.completedSessions).toBe(1);
      expect(result.abandonedSessions).toBe(0);
      expect(result.totalTrials).toBe(25);
      expect(result.firstSessionAt).toEqual(session.createdAt);
    });

    it('should accumulate XP correctly from multiple sessions', () => {
      const sessions = [
        // @ts-expect-error test override
        createSession({ xpBreakdown: { total: 100, base: 80, bonus: 20 } }),
        // @ts-expect-error test override
        createSession({ xpBreakdown: { total: 150, base: 100, bonus: 50 } }),
        // @ts-expect-error test override
        createSession({ xpBreakdown: { total: 75, base: 50, bonus: 25 } }),
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.totalXP).toBe(325); // 100 + 150 + 75
    });

    it('should not count XP from sessions without xpBreakdown (imports)', () => {
      const sessions = [
        // @ts-expect-error test override
        createSession({ xpBreakdown: { total: 100, base: 80, bonus: 20 } }),
        createSession({ xpBreakdown: undefined }), // Imported session - no XP
        // @ts-expect-error test override
        createSession({ xpBreakdown: { total: 50, base: 40, bonus: 10 } }),
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.totalXP).toBe(150); // 100 + 0 + 50
    });

    it('should count completed vs abandoned sessions', () => {
      const sessions = [
        createSession({ reason: 'completed' }),
        createSession({ reason: 'completed' }),
        createSession({ reason: 'abandoned' }),
        createSession({ reason: 'completed' }),
        createSession({ reason: 'abandoned' }),
        createSession({ reason: 'error' }), // Neither completed nor abandoned
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.completedSessions).toBe(3);
      expect(result.abandonedSessions).toBe(2);
    });

    it('should track firstSessionAt as earliest session', () => {
      const sessions = [
        createSession({ createdAt: new Date('2024-06-20T10:00:00Z') }),
        createSession({ createdAt: new Date('2024-06-15T10:00:00Z') }), // Earliest
        createSession({ createdAt: new Date('2024-06-18T10:00:00Z') }),
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.firstSessionAt).toEqual(new Date('2024-06-15T10:00:00Z'));
    });

    it('should count early morning sessions (hour < 8)', () => {
      const sessions = [
        createSession({ createdAt: new Date('2024-06-15T05:30:00Z') }), // 5:30 UTC - early
        createSession({ createdAt: new Date('2024-06-15T07:59:00Z') }), // 7:59 UTC - early
        createSession({ createdAt: new Date('2024-06-15T08:00:00Z') }), // 8:00 UTC - not early
        createSession({ createdAt: new Date('2024-06-15T14:00:00Z') }), // 14:00 UTC - not early
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.earlyMorningSessions).toBe(2);
    });

    it('should count late night sessions (hour >= 22)', () => {
      const sessions = [
        createSession({ createdAt: new Date('2024-06-15T21:59:00Z') }), // 21:59 UTC - not late
        createSession({ createdAt: new Date('2024-06-15T22:00:00Z') }), // 22:00 UTC - late
        createSession({ createdAt: new Date('2024-06-15T23:30:00Z') }), // 23:30 UTC - late
        createSession({ createdAt: new Date('2024-06-16T00:30:00Z') }), // 00:30 UTC - early morning, not late
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.lateNightSessions).toBe(2);
    });

    it('should accumulate trials correctly', () => {
      const sessions = [
        createSession({ trialsCount: 20 }),
        createSession({ trialsCount: 25 }),
        createSession({ trialsCount: 30 }),
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.totalTrials).toBe(75); // 20 + 25 + 30
    });

    it('should set persistentDays to 1 when there are completed sessions', () => {
      const sessions = [createSession({ reason: 'completed' })];

      const result = projectProgressionFromSessions(sessions);

      expect(result.persistentDays).toBe(1);
    });

    it('should set persistentDays to 0 when no completed sessions', () => {
      const sessions = [
        createSession({ reason: 'abandoned' }),
        createSession({ reason: 'abandoned' }),
      ];

      const result = projectProgressionFromSessions(sessions);

      expect(result.persistentDays).toBe(0);
    });
  });
});
