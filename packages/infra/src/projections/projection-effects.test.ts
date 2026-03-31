import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import {
  clearProjectionEffects,
  loadAppliedProjectionEffectKeys,
  storeProjectionEffects,
} from './projection-effects';

class ProjectionEffectsDb {
  private readonly db = new Database(':memory:');

  constructor() {
    this.db.exec(`
      CREATE TABLE projection_effects (
        id TEXT PRIMARY KEY,
        projection_id TEXT NOT NULL,
        effect_key TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  }

  async execute(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: { _array: Record<string, unknown>[] }; rowsAffected: number }> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) {
      const rows = this.db.query(sql).all(...((params ?? []) as any)) as Record<string, unknown>[];
      return { rows: { _array: rows }, rowsAffected: 0 };
    }
    const result = this.db.query(sql).run(...((params ?? []) as any));
    return { rows: { _array: [] }, rowsAffected: result.changes };
  }

  async getAll<T extends object>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    return this.db.query(sql).all(...((params ?? []) as any)) as T[];
  }
}

describe('projection-effects', () => {
  it('stores and loads projection effect keys idempotently', async () => {
    const db = new ProjectionEffectsDb();

    await storeProjectionEffects(db, 'journey-state-v1', ['event-1', 'event-2']);

    const keys = await loadAppliedProjectionEffectKeys(db, 'journey-state-v1', [
      'event-1',
      'event-2',
      'event-3',
    ]);

    expect(keys.has('event-1')).toBe(true);
    expect(keys.has('event-2')).toBe(true);
    expect(keys.has('event-3')).toBe(false);
  });

  it('clears a projection namespace without touching others', async () => {
    const db = new ProjectionEffectsDb();

    await storeProjectionEffects(db, 'journey-state-v1', ['event-1']);
    await storeProjectionEffects(db, 'user-stats-v1', ['session-1']);
    await clearProjectionEffects(db, 'journey-state-v1');

    const journeyKeys = await loadAppliedProjectionEffectKeys(db, 'journey-state-v1', ['event-1']);
    const statsKeys = await loadAppliedProjectionEffectKeys(db, 'user-stats-v1', ['session-1']);

    expect(journeyKeys.size).toBe(0);
    expect(statsKeys.has('session-1')).toBe(true);
  });
});
