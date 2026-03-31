import { describe, test, expect, beforeEach } from 'bun:test';
import { eventMigrationRegistry } from '../event-migration-registry';
import type { MigrationEntry, RawVersionedEvent } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../types';

describe('EventMigrationRegistry', () => {
  beforeEach(() => {
    eventMigrationRegistry.clear();
  });

  describe('getMigrationPath', () => {
    test('returns empty path for same version', () => {
      const path = eventMigrationRegistry.getMigrationPath(
        CURRENT_SCHEMA_VERSION,
        CURRENT_SCHEMA_VERSION,
      );
      expect(path).toEqual([]);
    });

    test('returns empty path when no migrations registered', () => {
      const path = eventMigrationRegistry.getMigrationPath(1, 2 as any);
      expect(path).toEqual([]);
    });
  });

  describe('register', () => {
    test('registers a migration entry', () => {
      const migration: MigrationEntry = {
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2 }),
      };

      eventMigrationRegistry.register(migration);

      const migrations = eventMigrationRegistry.getRegisteredMigrations();
      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toEqual(migration);
    });

    test('overwrites existing migration for same version pair', () => {
      const migration1: MigrationEntry = {
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, first: true }),
      };

      const migration2: MigrationEntry = {
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, second: true }),
      };

      eventMigrationRegistry.register(migration1);
      eventMigrationRegistry.register(migration2);

      const migrations = eventMigrationRegistry.getRegisteredMigrations();
      expect(migrations).toHaveLength(1);
    });
  });

  describe('migrate', () => {
    test('returns event unchanged when already at target version', () => {
      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'USER_RESPONDED',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = eventMigrationRegistry.migrate(event, 1);

      expect(result).toEqual(event);
    });

    test('handles missing schemaVersion (defaults to 1)', () => {
      const event = {
        id: 'test-1',
        type: 'USER_RESPONDED',
        sessionId: 'session-1',
        timestamp: Date.now(),
        // No schemaVersion
      } as RawVersionedEvent;

      const result = eventMigrationRegistry.migrate(event, 1);

      // Should return unchanged since default version (1) equals target
      expect(result.id).toBe('test-1');
    });

    test('applies single migration', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, migrated: true }),
      });

      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'USER_RESPONDED',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = eventMigrationRegistry.migrate(event, 2 as any);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).migrated).toBe(true);
    });

    test('chains multiple migrations', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, v2: true }),
      });

      eventMigrationRegistry.register({
        fromVersion: 2 as any,
        toVersion: 3 as any,
        migrate: (e) => ({ ...e, schemaVersion: 3, v3: true }),
      });

      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'SESSION_STARTED',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = eventMigrationRegistry.migrate(event, 3 as any);

      expect(result.schemaVersion).toBe(3);
      expect((result as any).v2).toBe(true);
      expect((result as any).v3).toBe(true);
    });

    test('skips migration for non-matching event types', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, modified: true }),
        eventTypes: ['USER_RESPONDED'], // Only applies to USER_RESPONDED
      });

      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'SESSION_STARTED', // Different type
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = eventMigrationRegistry.migrate(event, 2 as any);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).modified).toBeUndefined(); // Not modified
    });

    test('applies migration for matching event types', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2, modified: true }),
        eventTypes: ['USER_RESPONDED'],
      });

      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'USER_RESPONDED', // Matching type
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = eventMigrationRegistry.migrate(event, 2 as any);

      expect(result.schemaVersion).toBe(2);
      expect((result as any).modified).toBe(true);
    });
  });

  describe('needsMigration', () => {
    test('returns false for current version', () => {
      const event: RawVersionedEvent = {
        id: 'test-1',
        type: 'USER_RESPONDED',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };

      expect(eventMigrationRegistry.needsMigration(event)).toBe(false);
    });

    test('returns false for missing version (defaults to 1)', () => {
      const event = {
        id: 'test-1',
        type: 'USER_RESPONDED',
        sessionId: 'session-1',
        timestamp: Date.now(),
      } as RawVersionedEvent;

      // CURRENT_SCHEMA_VERSION is 1, so no migration needed
      expect(eventMigrationRegistry.needsMigration(event)).toBe(false);
    });
  });

  describe('clear', () => {
    test('removes all registered migrations', () => {
      eventMigrationRegistry.register({
        fromVersion: 1,
        toVersion: 2 as any,
        migrate: (e) => ({ ...e, schemaVersion: 2 }),
      });

      expect(eventMigrationRegistry.getRegisteredMigrations()).toHaveLength(1);

      eventMigrationRegistry.clear();

      expect(eventMigrationRegistry.getRegisteredMigrations()).toHaveLength(0);
    });
  });
});
