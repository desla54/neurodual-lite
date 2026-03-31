/**
 * Event Migration System
 *
 * Provides schema versioning and migration for events.
 * Ensures backward compatibility when evolving event schemas.
 *
 * Usage:
 * 1. Call registerAllMigrations() at app startup
 * 2. Use migrateAndValidateEvent() when reading events from DB
 * 3. Use migrateAndValidateEventBatch() for bulk operations
 */

// Types
export type {
  SchemaVersion,
  RawVersionedEvent,
  MigrationEntry,
  MigrationResult,
  MigrationSuccessResult,
  MigrationErrorResult,
  ValidationConfig,
} from './types';

export { CURRENT_SCHEMA_VERSION, DEFAULT_VALIDATION_CONFIG } from './types';

// Registry
export { eventMigrationRegistry } from './event-migration-registry';

// Validator
export {
  migrateAndValidateEvent,
  migrateAndValidateEventBatch,
  isValidEventShape,
  safeParseEvent,
} from './event-validator';

// Registration
export { registerAllMigrations, getMigrationCount } from './migrations';
