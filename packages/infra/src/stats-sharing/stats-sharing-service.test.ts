import { describe, expect, it } from 'bun:test';
import {
  submitSessionStats,
  fetchPlayerStats,
  buildStatsPayload,
  type SessionStatsPayload,
} from './stats-sharing-service';

// =============================================================================
// Helpers
// =============================================================================

function makePayload(overrides: Partial<SessionStatsPayload> = {}): SessionStatsPayload {
  return {
    playerId: 'player-1',
    sessionId: 'session-1',
    gameMode: 'dual-catch',
    nLevel: 2,
    accuracy: 0.85,
    trialCount: 40,
    durationMs: 120_000,
    endReason: 'completed',
    sessionDate: '2026-03-15',
    ...overrides,
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    gameMode: 'dual-catch',
    nLevel: 2,
    unifiedAccuracy: 0.85,
    totals: {
      hits: 20,
      misses: 5,
      falseAlarms: 3,
      correctRejections: 12,
    },
    durationMs: 120_000,
    reason: 'completed',
    createdAt: '2026-03-15T10:30:00.000Z',
    ...overrides,
  };
}

describe('StatsSharing Service', () => {
  // ===========================================================================
  // buildStatsPayload
  // ===========================================================================

  describe('buildStatsPayload', () => {
    it('constructs correct payload from session report', () => {
      const payload = buildStatsPayload('player-1', makeReport());

      expect(payload.playerId).toBe('player-1');
      expect(payload.sessionId).toBe('session-1');
      expect(payload.gameMode).toBe('dual-catch');
      expect(payload.nLevel).toBe(2);
      expect(payload.accuracy).toBe(0.85);
      expect(payload.durationMs).toBe(120_000);
      expect(payload.endReason).toBe('completed');
      expect(payload.sessionDate).toBe('2026-03-15');
    });

    it('calculates hitRate from hits / (hits + misses)', () => {
      const payload = buildStatsPayload('p', makeReport());
      // hits=20, misses=5 → hitRate = 20/25 = 0.8
      expect(payload.hitRate).toBe(0.8);
    });

    it('calculates falseAlarmRate from falseAlarms / (falseAlarms + correctRejections)', () => {
      const payload = buildStatsPayload('p', makeReport());
      // falseAlarms=3, correctRejections=12 → 3/15 = 0.2
      expect(payload.falseAlarmRate).toBe(0.2);
    });

    it('calculates trialCount as sum of all signal categories', () => {
      const payload = buildStatsPayload('p', makeReport());
      // 20 + 5 + 3 + 12 = 40
      expect(payload.trialCount).toBe(40);
    });

    it('returns undefined hitRate when no targets', () => {
      const payload = buildStatsPayload(
        'p',
        makeReport({ totals: { hits: 0, misses: 0, falseAlarms: 3, correctRejections: 12 } }),
      );
      expect(payload.hitRate).toBeUndefined();
    });

    it('returns undefined falseAlarmRate when no non-targets', () => {
      const payload = buildStatsPayload(
        'p',
        makeReport({ totals: { hits: 10, misses: 5, falseAlarms: null, correctRejections: null } }),
      );
      expect(payload.falseAlarmRate).toBeUndefined();
    });

    it('maps session_complete reason to completed', () => {
      const payload = buildStatsPayload('p', makeReport({ reason: 'session_complete' }));
      expect(payload.endReason).toBe('completed');
    });

    it('maps abandoned reason to user_stopped', () => {
      const payload = buildStatsPayload('p', makeReport({ reason: 'abandoned' }));
      expect(payload.endReason).toBe('user_stopped');
    });

    it('maps user_stopped reason to user_stopped', () => {
      const payload = buildStatsPayload('p', makeReport({ reason: 'user_stopped' }));
      expect(payload.endReason).toBe('user_stopped');
    });

    it('maps unknown reason to completed (default)', () => {
      const payload = buildStatsPayload('p', makeReport({ reason: 'some_unknown_reason' }));
      expect(payload.endReason).toBe('completed');
    });

    it('extracts YYYY-MM-DD from ISO date string', () => {
      const payload = buildStatsPayload('p', makeReport({ createdAt: '2026-01-20T23:59:59.999Z' }));
      expect(payload.sessionDate).toBe('2026-01-20');
    });

    it('includes all required fields', () => {
      const payload = buildStatsPayload('player-1', makeReport());
      const requiredKeys: (keyof SessionStatsPayload)[] = [
        'playerId',
        'sessionId',
        'gameMode',
        'nLevel',
        'accuracy',
        'trialCount',
        'durationMs',
        'endReason',
        'sessionDate',
      ];
      for (const key of requiredKeys) {
        expect(payload[key]).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // submitSessionStats (Supabase removed — always returns early)
  // ===========================================================================

  describe('submitSessionStats', () => {
    it('always returns Supabase-not-configured error (Supabase removed)', async () => {
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Supabase not configured');
    });

    it('returns Supabase-not-configured even for non-allowlisted game modes', async () => {
      // Non-allowlisted modes still hit the isSupabaseConfigured() check first
      const result = await submitSessionStats(makePayload({ gameMode: 'tempo-visual' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Supabase not configured');
    });

    it('does not throw', async () => {
      await expect(submitSessionStats(makePayload())).resolves.toBeDefined();
    });
  });

  // ===========================================================================
  // fetchPlayerStats (Supabase removed — always returns empty)
  // ===========================================================================

  describe('fetchPlayerStats', () => {
    it('returns empty result (Supabase removed)', async () => {
      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result.percentile).toBeNull();
      expect(result.avgAccuracy).toBeNull();
      expect(result.playerBestAccuracy).toBeNull();
      expect(result.totalSessions).toBe(0);
    });

    it('returns empty result for non-allowlisted game mode', async () => {
      const result = await fetchPlayerStats('player-1', 'custom-mode', 2);

      expect(result.percentile).toBeNull();
      expect(result.avgAccuracy).toBeNull();
      expect(result.playerBestAccuracy).toBeNull();
      expect(result.totalSessions).toBe(0);
    });

    it('does not throw', async () => {
      await expect(fetchPlayerStats('player-1', 'dual-catch', 2)).resolves.toBeDefined();
    });
  });
});
