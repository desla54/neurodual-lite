import { describe, it, expect, beforeEach } from 'bun:test';
import { eventMigrationRegistry } from './event-migration-registry';
import type { MigrationEntry, RawVersionedEvent } from './types';
import { CURRENT_SCHEMA_VERSION } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<RawVersionedEvent> = {}): RawVersionedEvent {
  return {
    id: 'evt-1',
    type: 'USER_RESPONDED',
    sessionId: 'sess-1',
    timestamp: Date.now(),
    schemaVersion: 1,
    ...overrides,
  };
}

function simpleMigration(
  from: number,
  to: number,
  extra?: Partial<MigrationEntry>,
): MigrationEntry {
  return {
    fromVersion: from,
    toVersion: to,
    migrate: (e) => ({ ...e, schemaVersion: to, [`v${to}`]: true }),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventMigrationRegistry (comprehensive)', () => {
  beforeEach(() => {
    eventMigrationRegistry.clear();
  });

  // =========================================================================
  // getMigrationPath
  // =========================================================================

  describe('getMigrationPath', () => {
    it('returns empty for same version', () => {
      expect(eventMigrationRegistry.getMigrationPath(3, 3)).toEqual([]);
    });

    it('returns empty when no migration registered', () => {
      expect(eventMigrationRegistry.getMigrationPath(1, 5)).toEqual([]);
    });

    it('returns single-step path', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      expect(eventMigrationRegistry.getMigrationPath(1, 2)).toEqual([2]);
    });

    it('returns multi-step path through chain', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(3, 4));

      expect(eventMigrationRegistry.getMigrationPath(1, 4)).toEqual([2, 3, 4]);
    });

    it('finds shortest path when multiple routes exist', () => {
      // Long route: 1 -> 2 -> 3 -> 4
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(3, 4));
      // Short route: 1 -> 4
      eventMigrationRegistry.register(simpleMigration(1, 4));

      const path = eventMigrationRegistry.getMigrationPath(1, 4);
      expect(path).toEqual([4]); // BFS finds shortest
    });

    it('returns empty for unreachable target version', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(3, 4));
      // Gap: no 2->3 migration

      expect(eventMigrationRegistry.getMigrationPath(1, 4)).toEqual([]);
    });

    it('handles cycle in migration graph without infinite loop', () => {
      // Create a cycle: 1->2, 2->3, 3->1
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(3, 1));

      // Should not hang; visited set prevents revisiting
      const path = eventMigrationRegistry.getMigrationPath(1, 99);
      expect(path).toEqual([]); // 99 is unreachable
    });

    it('caches computed path and returns same result', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));

      const first = eventMigrationRegistry.getMigrationPath(1, 3);
      const second = eventMigrationRegistry.getMigrationPath(1, 3);

      expect(first).toEqual([2, 3]);
      expect(second).toEqual([2, 3]);
    });

    it('cache is invalidated when new migration is registered', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));

      // Build cache
      eventMigrationRegistry.getMigrationPath(1, 3);

      // Register shortcut — this should rebuild chains (clear cache)
      eventMigrationRegistry.register(simpleMigration(1, 3));

      const path = eventMigrationRegistry.getMigrationPath(1, 3);
      expect(path).toEqual([3]); // Now shortest is direct
    });
  });

  // =========================================================================
  // migrate
  // =========================================================================

  describe('migrate', () => {
    it('is idempotent for already-current events', () => {
      const event = makeEvent({ schemaVersion: CURRENT_SCHEMA_VERSION });
      const result = eventMigrationRegistry.migrate(event, CURRENT_SCHEMA_VERSION);
      expect(result).toEqual(event);
    });

    it('normalizes undefined schemaVersion to 1', () => {
      const event = makeEvent({ schemaVersion: undefined });
      const result = eventMigrationRegistry.migrate(event, 1);
      expect(result.id).toBe('evt-1');
    });

    it('normalizes null schemaVersion to 1', () => {
      const event = makeEvent({ schemaVersion: null as any });
      const result = eventMigrationRegistry.migrate(event, 1);
      expect(result.id).toBe('evt-1');
    });

    it('applies single migration step', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));

      const event = makeEvent({ schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 2);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).v2).toBe(true);
    });

    it('chains v1 -> v2 -> v3 -> v4 in order', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(3, 4));

      const event = makeEvent({ schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 4);

      expect(result.schemaVersion).toBe(4);
      expect((result as any).v2).toBe(true);
      expect((result as any).v3).toBe(true);
      expect((result as any).v4).toBe(true);
    });

    it('starts from mid-chain version', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(3, 4));

      const event = makeEvent({ schemaVersion: 2 });
      const result = eventMigrationRegistry.migrate(event, 4);

      expect(result.schemaVersion).toBe(4);
      expect((result as any).v2).toBeUndefined(); // skipped
      expect((result as any).v3).toBe(true);
      expect((result as any).v4).toBe(true);
    });

    it('returns original event when no path exists', () => {
      const event = makeEvent({ schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 99);

      expect(result).toEqual(event);
    });

    it('skips migration body for non-matching eventTypes but updates version', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2,
        migrate: (e) => ({ ...e, schemaVersion: 2, touched: true }),
        eventTypes: ['SESSION_STARTED'],
      });

      const event = makeEvent({ type: 'USER_RESPONDED', schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 2);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).touched).toBeUndefined();
    });

    it('applies migration body for matching eventTypes', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2,
        migrate: (e) => ({ ...e, schemaVersion: 2, touched: true }),
        eventTypes: ['USER_RESPONDED'],
      });

      const event = makeEvent({ type: 'USER_RESPONDED', schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 2);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).touched).toBe(true);
    });

    it('preserves all original fields through migration', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));

      const event = makeEvent({ schemaVersion: 1, customField: 'hello', nested: { a: 1 } });
      const result = eventMigrationRegistry.migrate(event, 2);

      expect(result.id).toBe('evt-1');
      expect(result.type).toBe('USER_RESPONDED');
      expect(result.sessionId).toBe('sess-1');
      expect((result as any).customField).toBe('hello');
      expect((result as any).nested).toEqual({ a: 1 });
    });

    it('does not mutate the original event', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));

      const event = makeEvent({ schemaVersion: 1 });
      const original = { ...event };
      eventMigrationRegistry.migrate(event, 2);

      expect(event).toEqual(original);
    });

    it('handles migration with eventTypes filter in multi-step chain', () => {
      // Step 1: only applies to SESSION_STARTED
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2,
        migrate: (e) => ({ ...e, schemaVersion: 2, step1: true }),
        eventTypes: ['SESSION_STARTED'],
      });
      // Step 2: applies to all events
      eventMigrationRegistry.register({
        fromVersion: 2,
        toVersion: 3,
        migrate: (e) => ({ ...e, schemaVersion: 3, step2: true }),
      });

      const event = makeEvent({ type: 'USER_RESPONDED', schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 3);

      expect(result.schemaVersion).toBe(3);
      expect((result as any).step1).toBeUndefined(); // skipped: wrong type
      expect((result as any).step2).toBe(true); // applied: no filter
    });
  });

  // =========================================================================
  // needsMigration
  // =========================================================================

  describe('needsMigration', () => {
    it('returns false when event is at current schema version', () => {
      const event = makeEvent({ schemaVersion: CURRENT_SCHEMA_VERSION });
      expect(eventMigrationRegistry.needsMigration(event)).toBe(false);
    });

    it('returns false when schemaVersion is undefined (defaults to 1 = current)', () => {
      // CURRENT_SCHEMA_VERSION is 1, so undefined -> 1 -> no migration
      const event = makeEvent({ schemaVersion: undefined });
      expect(eventMigrationRegistry.needsMigration(event)).toBe(false);
    });

    it('returns true when event version differs from current', () => {
      // Only relevant if CURRENT_SCHEMA_VERSION > 0
      if (CURRENT_SCHEMA_VERSION > 0) {
        const event = makeEvent({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
        expect(eventMigrationRegistry.needsMigration(event)).toBe(true);
      }
    });
  });

  // =========================================================================
  // register / clear
  // =========================================================================

  describe('register', () => {
    it('allows overwriting a migration for the same version pair', () => {
      const m1: MigrationEntry = {
        fromVersion: 1,
        toVersion: 2,
        migrate: (e) => ({ ...e, schemaVersion: 2, first: true }),
      };
      const m2: MigrationEntry = {
        fromVersion: 1,
        toVersion: 2,
        migrate: (e) => ({ ...e, schemaVersion: 2, second: true }),
      };

      eventMigrationRegistry.register(m1);
      eventMigrationRegistry.register(m2);

      const event = makeEvent({ schemaVersion: 1 });
      const result = eventMigrationRegistry.migrate(event, 2);
      expect((result as any).second).toBe(true);
      expect((result as any).first).toBeUndefined();
    });

    it('supports registering migrations in non-sequential order', () => {
      // Register 2->3 before 1->2
      eventMigrationRegistry.register(simpleMigration(2, 3));
      eventMigrationRegistry.register(simpleMigration(1, 2));

      const path = eventMigrationRegistry.getMigrationPath(1, 3);
      expect(path).toEqual([2, 3]);
    });
  });

  describe('clear', () => {
    it('empties registered migrations', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.clear();

      expect(eventMigrationRegistry.getRegisteredMigrations()).toHaveLength(0);
    });

    it('empties cached chains so path lookup returns empty', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      // Populate cache
      eventMigrationRegistry.getMigrationPath(1, 2);
      eventMigrationRegistry.clear();

      expect(eventMigrationRegistry.getMigrationPath(1, 2)).toEqual([]);
    });
  });

  // =========================================================================
  // getRegisteredMigrations
  // =========================================================================

  describe('getRegisteredMigrations', () => {
    it('returns empty array when no migrations registered', () => {
      expect(eventMigrationRegistry.getRegisteredMigrations()).toEqual([]);
    });

    it('returns all registered entries', () => {
      eventMigrationRegistry.register(simpleMigration(1, 2));
      eventMigrationRegistry.register(simpleMigration(2, 3));

      const entries = eventMigrationRegistry.getRegisteredMigrations();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => `${e.fromVersion}->${e.toVersion}`)).toEqual(['1->2', '2->3']);
    });
  });
});
