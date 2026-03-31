import { describe, expect, it, beforeEach, mock, spyOn } from 'bun:test';
import * as clientModule from '../supabase/client';
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

// =============================================================================
// Mock Supabase
// =============================================================================

let invokeResult: { data: unknown; error: unknown };

const createSupabaseMock = () => ({
  functions: {
    invoke: mock(() => Promise.resolve(invokeResult)),
  },
});

describe('StatsSharing Service', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let isConfiguredSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    invokeResult = { data: {}, error: null };
    supabaseMock = createSupabaseMock();
    isConfiguredSpy = spyOn(clientModule, 'isSupabaseConfigured').mockReturnValue(true);
    spyOn(clientModule, 'getSupabase').mockReturnValue(supabaseMock as any);
    spyOn(console, 'warn').mockImplementation(() => {});
  });

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
  // submitSessionStats
  // ===========================================================================

  describe('submitSessionStats', () => {
    it('invokes submit-session-stats edge function with payload', async () => {
      invokeResult = { data: {}, error: null };
      const payload = makePayload();
      const result = await submitSessionStats(payload);

      expect(result.success).toBe(true);
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('submit-session-stats', {
        body: payload,
      });
    });

    it('returns success=true with duplicate flag when server signals duplicate', async () => {
      invokeResult = { data: { duplicate: true }, error: null };
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('returns duplicate=false when server does not flag duplicate', async () => {
      invokeResult = { data: {}, error: null };
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(false);
    });

    it('returns error when Supabase is not configured', async () => {
      isConfiguredSpy.mockReturnValue(false);
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Supabase not configured');
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it('returns success=true (skip) for non-allowlisted game modes', async () => {
      const result = await submitSessionStats(makePayload({ gameMode: 'tempo-visual' }));

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it('normalizes game mode before sending', async () => {
      invokeResult = { data: {}, error: null };
      await submitSessionStats(makePayload({ gameMode: '  dual-catch  ' }));

      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('submit-session-stats', {
        body: expect.objectContaining({ gameMode: 'dual-catch' }),
      });
    });

    it('returns error result when server rejects submission', async () => {
      invokeResult = { data: null, error: { message: 'Validation failed' } };
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });

    it('returns error result with fallback message when error has no message', async () => {
      invokeResult = { data: null, error: { message: '' } };
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
    });

    it('handles network errors gracefully (does not throw)', async () => {
      supabaseMock.functions.invoke.mockRejectedValue(new Error('fetch failed'));
      const result = await submitSessionStats(makePayload());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('accepts all valid game modes', async () => {
      const validModes = [
        'dual-catch',
        'dual-place',
        'dual-pick',
        'dual-memo',
        'dual-trace',
        'recall',
      ];
      for (const mode of validModes) {
        supabaseMock.functions.invoke.mockClear();
        invokeResult = { data: {}, error: null };
        await submitSessionStats(makePayload({ gameMode: mode }));
        expect(supabaseMock.functions.invoke).toHaveBeenCalled();
      }
    });
  });

  // ===========================================================================
  // fetchPlayerStats
  // ===========================================================================

  describe('fetchPlayerStats', () => {
    it('invokes get-player-stats edge function with correct params', async () => {
      const statsData = {
        percentile: 75,
        avgAccuracy: 0.82,
        playerBestAccuracy: 0.95,
        totalSessions: 150,
      };
      invokeResult = { data: statsData, error: null };

      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result).toEqual(statsData);
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('get-player-stats', {
        body: { playerId: 'player-1', gameMode: 'dual-catch', nLevel: 2 },
      });
    });

    it('returns empty result when Supabase not configured', async () => {
      isConfiguredSpy.mockReturnValue(false);
      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result.percentile).toBeNull();
      expect(result.totalSessions).toBe(0);
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it('returns empty result for non-allowlisted game mode', async () => {
      const result = await fetchPlayerStats('player-1', 'custom-mode', 2);

      expect(result.percentile).toBeNull();
      expect(result.avgAccuracy).toBeNull();
      expect(result.playerBestAccuracy).toBeNull();
      expect(result.totalSessions).toBe(0);
      expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
    });

    it('returns empty result on server error', async () => {
      invokeResult = { data: null, error: { message: 'Internal server error' } };
      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result.percentile).toBeNull();
      expect(result.totalSessions).toBe(0);
    });

    it('returns empty result when data is null', async () => {
      invokeResult = { data: null, error: null };
      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result.percentile).toBeNull();
      expect(result.totalSessions).toBe(0);
    });

    it('handles network errors gracefully', async () => {
      supabaseMock.functions.invoke.mockRejectedValue(new Error('Network timeout'));
      const result = await fetchPlayerStats('player-1', 'dual-catch', 2);

      expect(result.percentile).toBeNull();
      expect(result.totalSessions).toBe(0);
    });

    it('normalizes game mode before fetching', async () => {
      invokeResult = {
        data: { percentile: 50, avgAccuracy: 0.8, playerBestAccuracy: 0.9, totalSessions: 10 },
        error: null,
      };

      await fetchPlayerStats('player-1', '  dual-place  ', 3);

      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('get-player-stats', {
        body: { playerId: 'player-1', gameMode: 'dual-place', nLevel: 3 },
      });
    });
  });
});
