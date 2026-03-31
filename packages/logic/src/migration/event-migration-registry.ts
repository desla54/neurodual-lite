/**
 * Event Migration Registry
 *
 * Singleton registry for event schema migrations.
 * Transforms events from any version to the current version.
 *
 * Design principles:
 * - Pure functions: no side effects
 * - Chain migrations: v1 → v2 → v3 (automatic)
 * - Type-safe: preserves event type through migration
 * - Idempotent: already-current events pass through unchanged
 */

import type { MigrationEntry, RawVersionedEvent } from './types';
import { CURRENT_SCHEMA_VERSION } from './types';

// Internal type for version numbers (allows future versions)
type VersionNumber = number;

class EventMigrationRegistry {
  private migrations: Map<string, MigrationEntry> = new Map();
  private migrationChains: Map<VersionNumber, VersionNumber[]> = new Map();

  /**
   * Register a migration from one version to another.
   * Call this at module initialization time.
   */
  register(entry: MigrationEntry): void {
    const key = `${entry.fromVersion}->${entry.toVersion}` as const;

    if (this.migrations.has(key)) {
      console.warn(`[EventMigrationRegistry] Overwriting migration ${key}`);
    }

    this.migrations.set(key, entry);
    this.rebuildChains();
  }

  /**
   * Get the migration path from source to target version.
   * Returns ordered list of versions to traverse.
   */
  getMigrationPath(
    fromVersion: VersionNumber,
    toVersion: VersionNumber = CURRENT_SCHEMA_VERSION,
  ): VersionNumber[] {
    if (fromVersion === toVersion) return [];

    const cached = this.migrationChains.get(fromVersion);
    if (cached && cached[cached.length - 1] === toVersion) {
      return cached;
    }

    // BFS to find shortest path
    const path = this.findPath(fromVersion, toVersion);
    if (path.length > 0) {
      this.migrationChains.set(fromVersion, path);
    }
    return path;
  }

  /**
   * Apply all necessary migrations to bring event to current version.
   * Returns the migrated event (or original if already current).
   */
  migrate<T extends RawVersionedEvent>(
    event: T,
    targetVersion: VersionNumber = CURRENT_SCHEMA_VERSION,
  ): T {
    const sourceVersion = this.normalizeVersion(event.schemaVersion);

    if (sourceVersion === targetVersion) {
      return event;
    }

    const path = this.getMigrationPath(sourceVersion, targetVersion);

    if (path.length === 0 && sourceVersion !== targetVersion) {
      console.warn(
        `[EventMigrationRegistry] No migration path from v${sourceVersion} to v${targetVersion}`,
      );
      return event;
    }

    let current = event as RawVersionedEvent;
    let currentVersion: VersionNumber = sourceVersion;

    for (const nextVersion of path) {
      const key = `${currentVersion}->${nextVersion}`;
      const migration = this.migrations.get(key);

      if (!migration) {
        console.warn(`[EventMigrationRegistry] Missing migration ${key}`);
        break;
      }

      // Check if migration applies to this event type
      if (migration.eventTypes && !migration.eventTypes.includes(current.type)) {
        // Skip migration logic but update version
        current = { ...current, schemaVersion: nextVersion };
      } else {
        current = migration.migrate(current);
      }

      currentVersion = nextVersion;
    }

    return current as T;
  }

  /**
   * Check if an event needs migration.
   */
  needsMigration(event: RawVersionedEvent): boolean {
    const version = this.normalizeVersion(event.schemaVersion);
    return version !== CURRENT_SCHEMA_VERSION;
  }

  /**
   * Get all registered migrations (for debugging/testing).
   */
  getRegisteredMigrations(): MigrationEntry[] {
    return Array.from(this.migrations.values());
  }

  /**
   * Clear all migrations (for testing).
   */
  clear(): void {
    this.migrations.clear();
    this.migrationChains.clear();
  }

  /**
   * Normalize schemaVersion: missing/undefined defaults to 1.
   */
  private normalizeVersion(version: number | undefined): VersionNumber {
    if (version === undefined || version === null) return 1;
    return version;
  }

  /**
   * BFS to find shortest migration path.
   */
  private findPath(from: VersionNumber, to: VersionNumber): VersionNumber[] {
    const visited = new Set<VersionNumber>();
    const queue: Array<{ version: VersionNumber; path: VersionNumber[] }> = [
      { version: from, path: [] },
    ];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { version, path } = item;

      if (version === to) {
        return path;
      }

      if (visited.has(version)) continue;
      visited.add(version);

      // Find all migrations from this version
      for (const [, entry] of this.migrations) {
        if (entry.fromVersion === version && !visited.has(entry.toVersion)) {
          queue.push({
            version: entry.toVersion,
            path: [...path, entry.toVersion],
          });
        }
      }
    }

    return []; // No path found
  }

  private rebuildChains(): void {
    this.migrationChains.clear();
  }
}

/** Singleton instance */
export const eventMigrationRegistry = new EventMigrationRegistry();
