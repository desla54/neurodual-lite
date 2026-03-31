/**
 * Migration Registry
 *
 * Register all event migrations here.
 * Migrations are automatically chained by the registry.
 *
 * When adding a new schema version:
 * 1. Create a new migration file (e.g., v1-to-v2.ts)
 * 2. Import and register it in registerAllMigrations()
 * 3. Update SchemaVersion type in types.ts
 * 4. Update CURRENT_SCHEMA_VERSION in types.ts
 */

import { eventMigrationRegistry } from '../event-migration-registry';
// Future imports:
// import { v1ToV2Migration } from './v1-to-v2';

/**
 * Initialize all migrations.
 * Call this once at app startup before reading events.
 */
export function registerAllMigrations(): void {
  // Currently no migrations needed (all events are v1)
  // When v2 is introduced, register like this:
  // eventMigrationRegistry.register(v1ToV2Migration);

  // Log registration status (debug only)
  const count = eventMigrationRegistry.getRegisteredMigrations().length;
  if (count > 0) {
    console.debug(`[EventMigration] Registered ${count} migrations`);
  }
}

/**
 * Check if migrations are registered.
 * Useful for debugging.
 */
export function getMigrationCount(): number {
  return eventMigrationRegistry.getRegisteredMigrations().length;
}
