import { describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { rebuildStaleJourneyProjections } from './journey-projection-maintenance';
import { JOURNEY_RULES_VERSION } from './journey-rules-version';

function createMockDb(options?: { marker?: string | null }) {
  const syncMeta = new Map<string, string>();
  if (options?.marker) {
    syncMeta.set(`journey-projection-maintenance:v1:${JOURNEY_RULES_VERSION}`, options.marker);
  }
  const calls = {
    getOptional: [] as string[],
    getAll: [] as string[],
    execute: [] as string[],
  };

  const db = {
    async getOptional<T>(sql: string, params?: unknown[]): Promise<T | null> {
      calls.getOptional.push(sql);
      if (sql.includes('FROM sync_meta WHERE id = ?')) {
        const key = String(params?.[0] ?? '');
        const value = syncMeta.get(key);
        return value ? ({ value } as T) : null;
      }
      return null;
    },
    async getAll<T>(sql: string): Promise<T[]> {
      calls.getAll.push(sql);
      return [] as T[];
    },
    async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
      calls.execute.push(sql);
      if (sql.includes('DELETE FROM sync_meta')) {
        syncMeta.delete(String(params?.[0] ?? ''));
      }
      if (sql.includes('INSERT INTO sync_meta')) {
        syncMeta.set(String(params?.[0] ?? ''), String(params?.[1] ?? ''));
      }
      return { rowsAffected: 1 };
    },
  } as unknown as AbstractPowerSyncDatabase;

  return { db, calls, syncMeta };
}

describe('journey-projection-maintenance', () => {
  it('should skip maintenance scans when the current rules-version marker already exists', async () => {
    const markerKey = `journey-projection-maintenance:v1:${JOURNEY_RULES_VERSION}`;
    const { db, calls, syncMeta } = createMockDb({ marker: 'done' });

    const rebuilt = await rebuildStaleJourneyProjections(db);

    expect(rebuilt).toBe(0);
    expect(syncMeta.get(markerKey)).toBe('done');
    expect(calls.getAll).toHaveLength(0);
    expect(calls.execute).toHaveLength(0);
  });

  it('should persist the current rules-version marker after a clean maintenance pass', async () => {
    const markerKey = `journey-projection-maintenance:v1:${JOURNEY_RULES_VERSION}`;
    const { db, calls, syncMeta } = createMockDb();

    const rebuilt = await rebuildStaleJourneyProjections(db);

    expect(rebuilt).toBe(0);
    expect(syncMeta.get(markerKey)).toBe('done');
    expect(calls.getAll).toHaveLength(2);
    expect(
      calls.execute.some((sql) => sql.includes('sync_meta:set:journey-projection-maintenance')),
    ).toBe(true);
  });
});
