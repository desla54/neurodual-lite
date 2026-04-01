import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  createProgressionAdapter,
  getBadgesForUserScope,
  getProgressionForUserScope,
} from './progression-adapter';

const statsRow = {
  completed_sessions: 1,
  abandoned_sessions: 0,
  total_trials: 0,
  early_morning_sessions: 0,
  late_night_sessions: 0,
  first_session_at: new Date().toISOString(),
  total_xp: 100,
};
const streakRow = { uninterrupted_streak: 0 };
const badgeDb = {
  getAll: mock(async () => []),
};

const mockQuery = mock(async (sql: string) => {
  if (sql.includes('best_dprime')) {
    return { rows: [{ best_dprime: 1.25 }] };
  }
  if (sql.includes('sessions_today')) {
    return { rows: [{ sessions_today: 2 }] };
  }
  if (sql.includes('current_streak')) {
    return {
      rows: [{ current_streak: 3, best_streak: 5, last_date: '2026-03-20' }],
    };
  }
  if (sql.includes('FROM user_stats_projection')) {
    return { rows: [statsRow] };
  }
  if (sql.includes('uninterrupted_streak')) {
    return { rows: [streakRow] };
  }
  return { rows: [] };
});

const mockPersistence = {
  query: mockQuery,
  getPowerSyncDb: mock(async () => badgeDb),
};

describe('ProgressionAdapter', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    badgeDb.getAll.mockClear();
    mockPersistence.getPowerSyncDb.mockClear();
  });

  describe('Basic operations', () => {
    it('should compute progression from user_stats_projection', async () => {
      const adapter = createProgressionAdapter(mockPersistence as any);
      const progression = await adapter.getProgression();
      expect(progression?.totalXP).toBe(100);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should always query SQL (no manual cache)', async () => {
      const adapter = createProgressionAdapter(mockPersistence as any);

      await adapter.getProgression();
      const countAfterFirst = mockQuery.mock.calls.length;

      // Second call should also query SQL (no cache)
      await adapter.getProgression();
      expect(mockQuery.mock.calls.length).toBeGreaterThan(countAfterFirst);
    });
  });

  describe('Badges', () => {
    it('should return empty badges when no BADGE_UNLOCKED events', async () => {
      const adapter = createProgressionAdapter(mockPersistence as any);

      expect(await adapter.hasBadge('sniper')).toBe(false);
      expect(await adapter.getBadges()).toHaveLength(0);
    });

    it('always returns empty badges (badge events no longer stored separately)', async () => {
      const adapter = createProgressionAdapter(mockPersistence as any);
      await expect(adapter.getBadges()).resolves.toEqual([]);
    });

    it('getBadgesForUserScope always returns empty array', async () => {
      await expect(getBadgesForUserScope(mockPersistence as any, 'user-42')).resolves.toEqual([]);
    });
  });

  describe('Scoped lookups', () => {
    it('aggregates authenticated and local progression scope explicitly', async () => {
      const progression = await getProgressionForUserScope(mockPersistence as any, 'user-42');

      expect(progression.totalXP).toBe(100);

      const projectionCall = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('FROM user_stats_projection'),
      );
      const streakCall = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('uninterrupted_streak'),
      );

      expect(projectionCall?.[1]).toEqual(['user-42', 'local']);
      expect(streakCall?.[1]).toEqual(['user-42', 'local', 'user-42', 'local', 'user-42', 'local']);
    });
  });

  describe('Lifecycle', () => {
    it('should create independent instances per call', () => {
      const adapter1 = createProgressionAdapter(mockPersistence as any);
      const adapter2 = createProgressionAdapter(mockPersistence as any);

      expect(adapter1).not.toBe(adapter2);
    });
  });
});
