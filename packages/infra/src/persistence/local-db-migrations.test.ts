import { describe, expect, it, mock } from 'bun:test';

import { runLocalDbMigrations } from './local-db-migrations';
import type { PersistencePort } from '@neurodual/logic';

describe('local-db-migrations', () => {
  it('applies v7 to create projection_effects for existing local databases', async () => {
    const execute = mock(async () => {});
    const setSyncMeta = mock(async () => {});
    const query = mock(async () => ({ rows: [] }));

    const persistence = {
      getSyncMeta: mock(async () => '6'),
      setSyncMeta,
      execute,
      query,
    } as unknown as PersistencePort;

    await runLocalDbMigrations(persistence);

    const executedSql = execute.mock.calls.map((call: any) => String(call[0]!));
    expect(
      executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS projection_effects')),
    ).toBe(true);
    expect(executedSql.some((sql) => sql.includes('projection_effects_projection_key_idx'))).toBe(
      true,
    );
    expect(executedSql.some((sql) => sql.includes('projection_effects_projection_idx'))).toBe(true);
    expect(setSyncMeta).toHaveBeenCalledWith('localDbSchemaVersion', '7');
  });
});
