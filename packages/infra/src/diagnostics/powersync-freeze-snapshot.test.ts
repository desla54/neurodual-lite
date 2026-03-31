import { beforeEach, describe, expect, it, mock } from 'bun:test';

// --- Module mocks ---

const mockPersistenceHealthSnapshot = mock(async () => ({
  persistenceStage: 'ready',
  sync: { status: 'connected' },
  powerSync: null,
  projections: {
    status: 'ok',
    source: 'strict-cross-check',
    endedSessions: 10,
    sessionSummaries: 10,
    missingSummaries: 0,
    orphanSummaries: 0,
    lastCheckedAt: '2026-03-15T00:00:00Z',
    errorMessage: null,
  },
  activeWatchSubscriptions: 3,
}));

const mockGetPowerSyncDebugPort = mock(() => ({
  pendingCrudCount: mock(async () => 5),
  query: mock(async () => ({
    rows: {
      _array: [
        { table_name: 'emt_messages', count: 3 },
        { table_name: 'session_summaries', count: 2 },
      ],
    },
  })),
  runtimeState: mock(() => null),
  sampleMemory: mock(async () => null),
}));

const mockGetReadModelWatchDebugSnapshot = mock(() => ({
  stores: [],
  totalActive: 0,
  totalIdle: 0,
}));

mock.module('../ports/persistence-health-adapter', () => ({
  collectPersistenceHealthSnapshot: mockPersistenceHealthSnapshot,
}));

mock.module('../powersync/debug-port', () => ({
  getPowerSyncDebugPort: mockGetPowerSyncDebugPort,
}));

mock.module('../read-models/powersync-read-model-adapter', () => ({
  getReadModelWatchDebugSnapshot: mockGetReadModelWatchDebugSnapshot,
}));

const { collectPowerSyncFreezeSnapshot } = await import('./powersync-freeze-snapshot');

describe('collectPowerSyncFreezeSnapshot', () => {
  beforeEach(() => {
    mockPersistenceHealthSnapshot.mockClear();
    mockGetPowerSyncDebugPort.mockClear();
    mockGetReadModelWatchDebugSnapshot.mockClear();
  });

  it('returns an object with expected shape', async () => {
    const result = await collectPowerSyncFreezeSnapshot();

    expect(typeof result.collectedAt).toBe('string');
    expect(result.pendingCrudCount).toBe(5);
    expect(Array.isArray(result.pendingCrudByTable)).toBe(true);
    expect(result.persistenceHealth).toBeDefined();
    expect(result.readModelWatches).toBeDefined();
  });

  it('parses pendingCrudByTable from query result rows', async () => {
    const result = await collectPowerSyncFreezeSnapshot();

    expect(result.pendingCrudByTable).toEqual([
      { tableName: 'emt_messages', count: 3 },
      { tableName: 'session_summaries', count: 2 },
    ]);
  });

  it('returns collectedAt as an ISO date string', async () => {
    const result = await collectPowerSyncFreezeSnapshot();
    // Should parse as a valid date
    const parsed = new Date(result.collectedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  it('handles null debug port gracefully', async () => {
    mockGetPowerSyncDebugPort.mockReturnValueOnce(null as any);
    const result = await collectPowerSyncFreezeSnapshot();

    expect(result.pendingCrudCount).toBeNull();
    expect(result.pendingCrudByTable).toEqual([]);
  });

  it('handles pendingCrudCount error gracefully', async () => {
    mockGetPowerSyncDebugPort.mockReturnValueOnce({
      pendingCrudCount: mock(async () => {
        throw new Error('db error');
      }),
      query: mock(async () => ({ rows: { _array: [] } })),
      runtimeState: mock(() => null),
      sampleMemory: mock(async () => null),
    });
    const result = await collectPowerSyncFreezeSnapshot();

    expect(result.pendingCrudCount).toBeNull();
  });

  it('handles query error gracefully (empty pendingCrudByTable)', async () => {
    mockGetPowerSyncDebugPort.mockReturnValueOnce({
      pendingCrudCount: mock(async () => 2),
      query: mock(async () => {
        throw new Error('query error');
      }),
      runtimeState: mock(() => null),
      sampleMemory: mock(async () => null),
    });
    const result = await collectPowerSyncFreezeSnapshot();

    expect(result.pendingCrudCount).toBe(2);
    expect(result.pendingCrudByTable).toEqual([]);
  });

  it('filters out rows with count=0 from pendingCrudByTable', async () => {
    mockGetPowerSyncDebugPort.mockReturnValueOnce({
      pendingCrudCount: mock(async () => 1),
      query: mock(async () => ({
        rows: {
          _array: [
            { table_name: 'emt_messages', count: 1 },
            { table_name: 'empty_table', count: 0 },
          ],
        },
      })),
      runtimeState: mock(() => null),
      sampleMemory: mock(async () => null),
    });
    const result = await collectPowerSyncFreezeSnapshot();

    expect(result.pendingCrudByTable).toEqual([{ tableName: 'emt_messages', count: 1 }]);
  });

  it('includes persistence health data from adapter', async () => {
    const result = await collectPowerSyncFreezeSnapshot();
    expect(result.persistenceHealth.persistenceStage).toBe('ready');
  });

  it('includes read model watches snapshot', async () => {
    mockGetReadModelWatchDebugSnapshot.mockReturnValueOnce({
      stores: [{ name: 'test-store', active: true }] as any,
      totalActive: 1,
      totalIdle: 0,
    });
    const result = await collectPowerSyncFreezeSnapshot();
    expect((result.readModelWatches as any).totalActive).toBe(1);
  });
});
