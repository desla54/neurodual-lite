import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { StatsHelpersPort } from '@neurodual/logic';
import { createXPContextAdapter } from './xp-context-adapter';

function makeMockPersistence(overrides: Partial<StatsHelpersPort> = {}): StatsHelpersPort {
  return {
    getStreakInfo: mock(async () => ({ current: 0, best: 0, lastActiveDate: null })),
    getDailyActivity: mock(async () => []),
    getBadgeHistorySnapshot: mock(async () => ({ badges: [] })),
    ...overrides,
  } as StatsHelpersPort;
}

describe('XPContextAdapter', () => {
  let persistence: StatsHelpersPort;

  beforeEach(() => {
    persistence = makeMockPersistence();
  });

  describe('getStreakInfo', () => {
    it('returns streakDays from persistence streak info', async () => {
      persistence = makeMockPersistence({
        getStreakInfo: mock(async () => ({ current: 5, best: 10, lastActiveDate: '2026-03-14' })),
      });
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.streakDays).toBe(5);
    });

    it('returns 0 streakDays when no streak', async () => {
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.streakDays).toBe(0);
    });
  });

  describe('getDailyActivityCount', () => {
    it('sets sessionsToday to 0 when no activity', async () => {
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.sessionsToday).toBe(0);
    });

    it('sets sessionsToday to todayCount - 1 when activity exists', async () => {
      persistence = makeMockPersistence({
        getDailyActivity: mock(async () => [{ date: '2026-03-15', count: 4 }]),
      });
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.sessionsToday).toBe(3);
    });

    it('calls getDailyActivity with days=1', async () => {
      const adapter = createXPContextAdapter(persistence);
      await adapter.getXPContext('user-1', {} as never);
      expect(persistence.getDailyActivity).toHaveBeenCalledWith('user-1', 1);
    });
  });

  describe('getFirstOfDayUtc', () => {
    it('isFirstOfDay is true when todayCount is 0', async () => {
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.isFirstOfDay).toBe(true);
    });

    it('isFirstOfDay is true when todayCount is 1 (current session is the first)', async () => {
      persistence = makeMockPersistence({
        getDailyActivity: mock(async () => [{ date: '2026-03-15', count: 1 }]),
      });
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.isFirstOfDay).toBe(true);
    });

    it('isFirstOfDay is false when todayCount > 1', async () => {
      persistence = makeMockPersistence({
        getDailyActivity: mock(async () => [{ date: '2026-03-15', count: 2 }]),
      });
      const adapter = createXPContextAdapter(persistence);
      const ctx = await adapter.getXPContext('user-1', {} as never);
      expect(ctx.isFirstOfDay).toBe(false);
    });
  });

  it('always returns empty newBadges array', async () => {
    persistence = makeMockPersistence({
      getDailyActivity: mock(async () => [{ date: '2026-03-15', count: 3 }]),
      getStreakInfo: mock(async () => ({ current: 7, best: 14, lastActiveDate: '2026-03-15' })),
    });
    const adapter = createXPContextAdapter(persistence);
    const ctx = await adapter.getXPContext('user-1', {} as never);
    expect(ctx.newBadges).toEqual([]);
  });

  it('passes the userId to both persistence calls', async () => {
    const adapter = createXPContextAdapter(persistence);
    await adapter.getXPContext('user-42', {} as never);
    expect(persistence.getStreakInfo).toHaveBeenCalledWith('user-42');
    expect(persistence.getDailyActivity).toHaveBeenCalledWith('user-42', 1);
  });
});
