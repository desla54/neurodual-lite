import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PersistencePort, HistoryPort } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';

let emtCountOnData: ((data: unknown) => void) | null = null;

const ensureUpToDate = mock(async () => ({
  replayed: [] as string[],
  caughtUp: [] as string[],
  totalEventsProcessed: 0,
}));
const invalidateCache = mock(() => {});

// event-watcher stubs are now inlined in history-adapter.ts (no module to mock).
// The watchers are no-ops, so event signal listeners won't be called.

mock.module('../projections/configured-engine', () => ({
  getConfiguredProcessorEngine: () => ({
    register: () => {},
    ensureUpToDate,
    invalidateCache,
    rebuild: async () => 0,
    rebuildAll: async () => 0,
    onDegradedProcessors: () => () => {},
    getDegradedProcessors: () => [],
  }),
}));

mock.module('../diagnostics/freeze-watchdog', () => ({
  withWatchdogContextAsync: async <T>(_context: string, fn: () => Promise<T>) => await fn(),
  withWatchdogStepAsync: async <T>(_context: string, fn: () => Promise<T>) => await fn(),
}));

mock.module('../supabase', () => ({
  supabaseAuthAdapter: {
    getState: () => ({
      status: 'authenticated',
      session: { user: { id: 'user-1' } },
    }),
  },
  supabaseSubscriptionAdapter: {
    getState: () => ({
      hasCloudSync: true,
      hasPremiumAccess: true,
    }),
  },
}));

mock.module('../supabase/client', () => ({
  isSupabaseConfigured: () => true,
}));

mock.module('../logger', () => ({
  historyLog: {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  },
}));

import { setupHistoryPowerSyncWatch } from './history-adapter';

function createMockDb(): AbstractPowerSyncDatabase {
  return {
    query: () => ({
      watch: () => ({
        registerListener: (listener: { onData: (data: unknown) => void }) => {
          emtCountOnData = listener.onData;
          return () => {
            emtCountOnData = null;
          };
        },
      }),
    }),
  } as unknown as AbstractPowerSyncDatabase;
}

function createMockPersistence(): PersistencePort {
  return {
    writeTransaction: async () => {},
    query: async () => ({ rows: [] }),
    execute: async () => {},
    getSyncMeta: async () => null,
    setSyncMeta: async () => {},
  } as unknown as PersistencePort;
}

function createMockHistoryPort(): HistoryPort {
  let ready = true;
  return {
    isReady: () => ready,
    setReady: (next: boolean) => {
      ready = next;
    },
  } as unknown as HistoryPort;
}

describe('setupHistoryPowerSyncWatch', () => {
  beforeEach(() => {
    ensureUpToDate.mockClear();
    invalidateCache.mockClear();
    emtCountOnData = null;
  });

  afterEach(() => {
    emtCountOnData = null;
  });

  it('returns unsubscribe function and registers emt count watch', async () => {
    const unsubscribe = setupHistoryPowerSyncWatch(
      createMockDb(),
      'user-1',
      createMockPersistence(),
      createMockHistoryPort(),
    );

    // The emt count watch should be registered via db.query().watch().registerListener()
    expect(emtCountOnData).not.toBeNull();
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
  });

  it('emt count watch stores count without triggering catch-up before initial snapshot', async () => {
    const unsubscribe = setupHistoryPowerSyncWatch(
      createMockDb(),
      'user-1',
      createMockPersistence(),
      createMockHistoryPort(),
    );

    expect(emtCountOnData).not.toBeNull();

    // Send emt count data - should be stored but not trigger catch-up
    // because hasReceivedInitialSnapshot is false (event watcher is a no-op)
    emtCountOnData?.({ rows: { _array: [{ count: 10 }] } });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // No projection catch-up should be triggered since initial snapshot
    // hasn't been received (event signal watchers are no-ops now)
    expect(ensureUpToDate).not.toHaveBeenCalled();

    unsubscribe();
  });
});
