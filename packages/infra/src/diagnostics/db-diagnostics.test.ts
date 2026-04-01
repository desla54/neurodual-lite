import { beforeEach, describe, expect, it, mock } from 'bun:test';

// --- Module mocks (must be before import of SUT) ---

const mockExecute = mock(async () => ({ rows: { _array: [] } })) as any;
const mockIsPowerSyncInitialized = mock(() => true);
const mockGetPowerSyncDatabase = mock(() => ({ execute: mockExecute }));
const mockGetPowerSyncRuntimeState = mock(() => ({
  selectedVfs: 'opfs',
  platform: 'web',
  browser: 'chrome',
  iosWeb: false,
  events: [{ phase: 'connect', detail: 'ok' }],
}));
const mockGetEmtTableCounts = mock(async () => ({
  emt_messages_count: 10,
  emt_streams_count: 3,
  emt_subscriptions_count: 2,
}));
const mockGetEmtMessageDetails = mock(async () => ({
  emt_distinct_streams: 3,
  emt_oldest_created: '2026-01-01T00:00:00Z',
  emt_newest_created: '2026-03-15T00:00:00Z',
  emt_archived_count: 1,
  emt_message_types: { SESSION_STARTED: 5, SESSION_ENDED: 5 },
}));

mock.module('../powersync/database', () => ({
  isPowerSyncInitialized: mockIsPowerSyncInitialized,
  getPowerSyncDatabase: mockGetPowerSyncDatabase,
  getPowerSyncRuntimeState: mockGetPowerSyncRuntimeState,
}));

mock.module('../es-emmett/event-queries', () => ({
  getEmtTableCounts: mockGetEmtTableCounts,
  getEmtMessageDetails: mockGetEmtMessageDetails,
}));

// Now import the SUT
const { collectDbDiagnostics } = await import('./db-diagnostics');

// --- Helpers ---

/**
 * Configure mockExecute to return specific values based on SQL patterns.
 * Falls back to { rows: { _array: [{ c: 0 }] } } for COUNT queries.
 */
function setupDefaultExecute(): void {
  mockExecute.mockImplementation(async (sql: string): Promise<any> => {
    // Tables list
    if (sql.includes('sqlite_master') && sql.includes('ORDER BY name')) {
      return { rows: { _array: [{ name: 'session_summaries' }, { name: 'emt_messages' }] } };
    }
    // Table exists check
    if (sql.includes('sqlite_master') && sql.includes('LIMIT 1')) {
      return { rows: { _array: [] } };
    }
    // Schema version
    if (sql.includes('sync_meta')) {
      return { rows: { _array: [{ value: '19' }] } };
    }
    // Session summaries dates
    if (sql.includes('created_date') && sql.includes('ASC')) {
      return { rows: { _array: [{ created_date: '2026-01-01' }] } };
    }
    if (sql.includes('created_date') && sql.includes('DESC')) {
      return { rows: { _array: [{ created_date: '2026-03-15' }] } };
    }
    // Distinct game modes
    if (sql.includes('DISTINCT game_mode')) {
      return { rows: { _array: [{ m: 'nback' }, { m: 'dual-nback' }] } };
    }
    // Distinct users
    if (sql.includes('DISTINCT user_id')) {
      return { rows: { _array: [{ c: 1 }] } };
    }
    // Stats projection
    if (sql.includes('user_stats_projection') && sql.includes('sessions_count')) {
      return { rows: { _array: [{ sessions_count: 42, active_days: 10 }] } };
    }
    // Streak projection
    if (sql.includes('streak_projection') && sql.includes('current_streak')) {
      return {
        rows: {
          _array: [{ current_streak: 5, best_streak: 12, last_active_date: '2026-03-14' }],
        },
      };
    }
    // ps_crud count
    if (sql.includes('ps_crud') && sql.includes('COUNT')) {
      return { rows: { _array: [{ c: 2 }] } };
    }
    // ps_crud oldest
    if (sql.includes('ps_crud') && sql.includes('ORDER BY id')) {
      return { rows: { _array: [{ id: 'crud-001' }] } };
    }
    // Default COUNT query
    if (sql.includes('COUNT(*)')) {
      return { rows: { _array: [{ c: 0 }] } };
    }
    return { rows: { _array: [] } };
  });
}

describe('collectDbDiagnostics', () => {
  beforeEach(() => {
    mockIsPowerSyncInitialized.mockReturnValue(true);
    mockExecute.mockReset();
    setupDefaultExecute();
  });

  it('returns null when PowerSync is not initialized', async () => {
    mockIsPowerSyncInitialized.mockReturnValue(false);
    const result = await collectDbDiagnostics();
    expect(result).toBeNull();
  });

  it('returns an object with expected shape', async () => {
    const result = await collectDbDiagnostics();
    expect(result).not.toBeNull();

    // Schema & migration
    expect(result!.schema_version).toBe(19);
    expect(typeof result!.has_legacy_events_table).toBe('boolean');
    expect(typeof result!.has_legacy_events_local_table).toBe('boolean');
    expect(Array.isArray(result!.tables_list)).toBe(true);
    expect(typeof result!.tables_count).toBe('number');

    // Row counts
    expect(typeof result!.emt_messages_count).toBe('number');
    expect(typeof result!.session_summaries_count).toBe('number');

    // Sync health
    expect(typeof result!.pending_crud_count).toBe('number');

    // emt_messages details
    expect(typeof result!.emt_distinct_streams).toBe('number');
    expect(typeof result!.emt_message_types).toBe('object');

    // Session summaries details
    expect(Array.isArray(result!.summaries_distinct_modes)).toBe(true);

    // Projection health
    expect(result!.stats_projection_sessions_count).toBe(42);
    expect(result!.stats_projection_active_days).toBe(10);
    expect(result!.streak_current).toBe(5);
    expect(result!.streak_best).toBe(12);

    // PowerSync runtime
    expect(result!.vfs).toBe('opfs');
    expect(result!.ps_platform).toBe('web');
    expect(result!.ps_browser).toBe('chrome');
    expect(result!.ps_ios_web).toBe(false);

    // Timing
    expect(typeof result!.diagnostics_duration_ms).toBe('number');
    expect(typeof result!.collected_at).toBe('string');
  });

  it('handles missing tables gracefully (safeCount returns -1 on error)', async () => {
    mockExecute.mockImplementation(async (sql: string): Promise<any> => {
      // Simulate "no such table" for COUNT queries
      if (sql.includes('COUNT(*)') && !sql.includes('sqlite_master') && !sql.includes('ps_crud')) {
        throw new Error('no such table: session_summaries');
      }
      // Tables list — empty
      if (sql.includes('sqlite_master') && sql.includes('ORDER BY name')) {
        return { rows: { _array: [] } };
      }
      // Table exists — no
      if (sql.includes('sqlite_master')) {
        return { rows: { _array: [] } };
      }
      // Schema version — missing
      if (sql.includes('sync_meta')) {
        return { rows: { _array: [] } };
      }
      // ps_crud
      if (sql.includes('ps_crud')) {
        return { rows: { _array: [{ c: 0 }] } };
      }
      // Distinct queries
      if (sql.includes('DISTINCT')) {
        return { rows: { _array: [] } };
      }
      // Projection queries — empty
      if (sql.includes('user_stats_projection') || sql.includes('streak_projection')) {
        return { rows: { _array: [] } };
      }
      return { rows: { _array: [] } };
    });

    const result = await collectDbDiagnostics();
    expect(result).not.toBeNull();
    // safeCount returns -1 on error
    expect(result!.session_summaries_count).toBe(-1);
    // schema_version should be null when missing
    expect(result!.schema_version).toBeNull();
    // Empty tables list
    expect(result!.tables_list).toEqual([]);
    expect(result!.tables_count).toBe(0);
  });

  it('includes tables_list from sqlite_master query', async () => {
    const result = await collectDbDiagnostics();
    expect(result!.tables_list).toEqual(['session_summaries', 'emt_messages']);
    expect(result!.tables_count).toBe(2);
  });

  it('returns zero/empty emt details (ES removed, inline stubs)', async () => {
    const result = await collectDbDiagnostics();
    expect(result!.emt_messages_count).toBe(0);
    expect(result!.emt_streams_count).toBe(0);
    expect(result!.emt_subscriptions_count).toBe(0);
    expect(result!.emt_distinct_streams).toBe(0);
    expect(result!.emt_oldest_created).toBeNull();
    expect(result!.emt_newest_created).toBeNull();
    expect(result!.emt_archived_count).toBe(0);
    expect(result!.emt_message_types).toEqual({});
  });

  it('reports null projections when projection tables are empty', async () => {
    mockExecute.mockImplementation(async (sql: string): Promise<any> => {
      if (sql.includes('user_stats_projection') && sql.includes('sessions_count')) {
        return { rows: { _array: [] } };
      }
      if (sql.includes('streak_projection') && sql.includes('current_streak')) {
        return { rows: { _array: [] } };
      }
      // Fallback
      if (sql.includes('sqlite_master') && sql.includes('ORDER BY name')) {
        return { rows: { _array: [] } };
      }
      if (sql.includes('sqlite_master')) {
        return { rows: { _array: [] } };
      }
      if (sql.includes('sync_meta')) {
        return { rows: { _array: [] } };
      }
      if (sql.includes('DISTINCT')) {
        return { rows: { _array: [] } };
      }
      return { rows: { _array: [{ c: 0 }] } };
    });

    const result = await collectDbDiagnostics();
    expect(result!.stats_projection_sessions_count).toBeNull();
    expect(result!.stats_projection_active_days).toBeNull();
    expect(result!.streak_current).toBeNull();
    expect(result!.streak_best).toBeNull();
    expect(result!.streak_last_active_date).toBeNull();
  });
});
