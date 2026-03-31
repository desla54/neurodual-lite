import { describe, expect, it, mock } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { getUserEvents, watchUserEventSignalsByTypes } from './event-watcher';

function createWatchResult(rows: unknown[] = []) {
  return { rows: { _array: rows } };
}

function createWatchIterator(rows: unknown[] = []) {
  return (async function* () {
    yield createWatchResult(rows);
  })();
}

function createDbMock() {
  const mockWatch = mock((_query: string, _params: unknown[]) => createWatchIterator());
  const mockExecute = mock(async (_query: string, _params?: unknown[]) => createWatchResult());

  const db = {
    watch: mockWatch,
    execute: mockExecute,
    query: mock((_options: { sql: string; parameters?: readonly unknown[] }) => ({
      watch: () => ({
        registerListener: mock(() => () => {}),
      }),
    })),
  } as unknown as AbstractPowerSyncDatabase & {
    watch: ReturnType<typeof mock>;
    execute: ReturnType<typeof mock>;
    query: ReturnType<typeof mock>;
  };

  return db;
}

describe('event-watcher', () => {
  it('uses emt_messages query for local signal watches (Phase 9)', async () => {
    const db = createDbMock();
    const callback = mock(() => {});

    const unsubscribe = watchUserEventSignalsByTypes(
      db,
      'local',
      ['SESSION_ENDED'],
      { limit: 100 },
      callback,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(db.query).toHaveBeenCalledTimes(1);
    const options = db!.query.mock.calls[0]![0] as { sql: string; parameters?: unknown[] };
    // Phase 9: Only queries emt_messages — zero json_extract for performance
    expect(options.sql).toContain('FROM emt_messages em');
    expect(options.sql).not.toContain('FROM events e');
    expect(options.sql).not.toContain('FROM events_local l');
    expect(options.sql).not.toContain('UNION ALL');
    expect(options.sql).not.toContain('json_extract');
    expect(options.sql).toContain('em.message_type');
    expect(options.sql).toContain("em.stream_id LIKE 'session:%'");
    // No userId parameter — sync rules already scope to user
    expect(options.parameters).toEqual(['SESSION_ENDED']);

    unsubscribe();
  });

  it('uses emt_messages query for one-shot local user reads (Phase 9)', async () => {
    const db = createDbMock();

    await getUserEvents(db, 'local');

    expect(db.execute).toHaveBeenCalledTimes(1);
    const [query, params] = db.execute.mock.calls[0] as [string, unknown[]];
    // Phase 9: Only queries emt_messages
    expect(query).toContain('FROM emt_messages em');
    expect(query).not.toContain('FROM events e');
    expect(query).not.toContain('FROM events_local l');
    expect(query).not.toContain('UNION ALL');
    expect(query).toContain("json_extract(em.message_data, '$.data.userId')");
    // Phase 9: Single userId parameter
    expect(params).toEqual(['local']);
  });

  it('includes authenticated + local scope for reads via emt_messages (Phase 9)', async () => {
    const db = createDbMock();
    const userId = '11111111-1111-4111-8111-111111111111';

    await getUserEvents(db, userId);

    expect(db.execute).toHaveBeenCalledTimes(1);
    const [query, params] = db.execute.mock.calls[0] as [string, unknown[]];
    // Phase 9: Only queries emt_messages
    expect(query).toContain('FROM emt_messages em');
    expect(query).not.toContain('FROM events e');
    expect(query).not.toContain('FROM events_local l');
    expect(query).not.toContain('UNION ALL');
    expect(query).toContain("json_extract(em.message_data, '$.data.userId') = ?");
    expect(query).toContain("OR json_extract(em.message_data, '$.data.userId') = 'local'");
    expect(query).toContain(
      "WHEN em.stream_id LIKE 'training:session:%' THEN substr(em.stream_id, 18)",
    );
    expect(query).toContain("WHEN em.stream_id LIKE 'session:%' THEN substr(em.stream_id, 9)");
    expect(query).toContain('END IS NOT NULL');
    expect(query).toContain("END != ''");
    // Phase 9: Single userId parameter
    expect(params).toEqual([userId]);
  });
});
