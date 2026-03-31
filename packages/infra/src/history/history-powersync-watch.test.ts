import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PersistencePort, HistoryPort } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';

type EventSignalRow = {
  id: string;
  session_id: string;
  timestamp: number;
  type?: string;
  deleted?: boolean | number;
};

let eventSignalsListener: ((rows: EventSignalRow[]) => void) | null = null;
let deletedSessionsListener: ((rows: Array<{ id: string; session_id: string }>) => void) | null =
  null;
let userResetsListener: ((rows: Array<{ reset_at?: string }>) => void) | null = null;
let emtCountOnData: ((data: unknown) => void) | null = null;

const ensureUpToDate = mock(async () => ({
  replayed: [] as string[],
  caughtUp: [] as string[],
  totalEventsProcessed: 0,
}));
const invalidateCache = mock(() => {});

mock.module('../powersync/event-watcher', () => ({
  getActivePowerSyncWatchSubscriptions: () => 3,
  watchUserDeletedSessions: (
    _db: AbstractPowerSyncDatabase,
    _userId: string,
    listener: (rows: Array<{ id: string; session_id: string }>) => void,
  ) => {
    deletedSessionsListener = listener;
    return () => {
      deletedSessionsListener = null;
    };
  },
  watchUserEventSignalsByTypes: (
    _db: AbstractPowerSyncDatabase,
    _userId: string,
    _types: readonly string[],
    _options: unknown,
    listener: (rows: EventSignalRow[]) => void,
  ) => {
    eventSignalsListener = listener;
    return () => {
      eventSignalsListener = null;
    };
  },
  watchUserResets: (
    _db: AbstractPowerSyncDatabase,
    _userId: string,
    listener: (rows: Array<{ reset_at?: string }>) => void,
  ) => {
    userResetsListener = listener;
    return () => {
      userResetsListener = null;
    };
  },
}));

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

// NOTE: Do NOT mock '../lifecycle/local-data-wipe' or '../sync/reset-marker'
// here — Bun's mock.module is process-global and would permanently break their
// own unit tests.  Both modules are already safe in test environments (try/catch
// + NODE_ENV === 'test' early-return).

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

async function flushAsyncWork(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

describe('setupHistoryPowerSyncWatch', () => {
  beforeEach(() => {
    ensureUpToDate.mockClear();
    invalidateCache.mockClear();
    eventSignalsListener = null;
    deletedSessionsListener = null;
    userResetsListener = null;
    emtCountOnData = null;
  });

  afterEach(() => {
    eventSignalsListener = null;
    deletedSessionsListener = null;
    userResetsListener = null;
    emtCountOnData = null;
  });

  it('coalesces event signal sync with emt count fallback', async () => {
    const unsubscribe = setupHistoryPowerSyncWatch(
      createMockDb(),
      'user-1',
      createMockPersistence(),
      createMockHistoryPort(),
    );

    expect(eventSignalsListener).not.toBeNull();
    expect(emtCountOnData).not.toBeNull();

    emtCountOnData?.({ rows: { _array: [{ count: 10 }] } });
    eventSignalsListener?.([]);
    await flushAsyncWork();
    expect(ensureUpToDate).toHaveBeenCalledTimes(1);

    ensureUpToDate.mockClear();
    invalidateCache.mockClear();

    eventSignalsListener?.([
      {
        id: 'evt-1',
        session_id: 'session-1',
        timestamp: 1,
        deleted: false,
      },
    ]);
    emtCountOnData?.({ rows: { _array: [{ count: 11 }] } });

    await flushAsyncWork(8);

    expect(ensureUpToDate).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('ignores XP_BREAKDOWN_COMPUTED signals already patched into session_summaries', async () => {
    const query = mock(async (sql: string) => {
      if (sql.includes('xp_breakdown IS NOT NULL')) {
        return { rows: [{ session_id: 'session-1' }] };
      }
      return { rows: [] };
    });

    const persistence = {
      writeTransaction: async () => {},
      query,
      execute: async () => {},
    } as unknown as PersistencePort;

    const unsubscribe = setupHistoryPowerSyncWatch(
      createMockDb(),
      'user-1',
      persistence,
      createMockHistoryPort(),
    );

    eventSignalsListener?.([]);
    await flushAsyncWork();

    ensureUpToDate.mockClear();
    invalidateCache.mockClear();

    eventSignalsListener?.([
      {
        id: 'evt-xp-1',
        session_id: 'session-1',
        timestamp: 1,
        type: 'XP_BREAKDOWN_COMPUTED',
        deleted: false,
      },
    ]);

    await flushAsyncWork(8);

    expect(query).toHaveBeenCalled();
    expect(ensureUpToDate).not.toHaveBeenCalled();
    expect(invalidateCache).not.toHaveBeenCalled();

    unsubscribe();
  });
});
