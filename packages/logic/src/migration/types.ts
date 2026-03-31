/**
 * Event Migration Types
 *
 * Types for the event schema migration system.
 * Migrations are pure functions: same input = same output.
 */

import type { GameEvent } from '../engine/events';

// =============================================================================
// Schema Version
// =============================================================================

/**
 * Supported schema versions.
 * Extend this union when adding new versions: 1 | 2 | 3 | ...
 */
export type SchemaVersion = number;

/**
 * Current schema version - SSOT.
 * Update this when releasing a new schema version.
 */
export const CURRENT_SCHEMA_VERSION: SchemaVersion = 1;

// =============================================================================
// Raw Event Types
// =============================================================================

/**
 * Base shape of any versioned event before validation.
 * This is what we read from the database before migration.
 */
export interface RawVersionedEvent {
  readonly id: string;
  readonly type: string;
  readonly sessionId: string;
  readonly timestamp: number;
  /** May be missing in legacy events (defaults to 1) */
  readonly schemaVersion?: number;
  readonly [key: string]: unknown;
}

// =============================================================================
// Migration Types
// =============================================================================

/**
 * Migration function signature.
 * Takes an event at version N and returns it at version N+1.
 */
export type EventMigration<
  TFrom extends RawVersionedEvent = RawVersionedEvent,
  TTo extends RawVersionedEvent = RawVersionedEvent,
> = (event: TFrom) => TTo;

/**
 * Migration entry for the registry.
 */
export interface MigrationEntry {
  /** Source schema version */
  readonly fromVersion: SchemaVersion;
  /** Target schema version */
  readonly toVersion: SchemaVersion;
  /** Migration function */
  readonly migrate: EventMigration;
  /** Optional: Only apply to specific event types */
  readonly eventTypes?: readonly string[];
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Successful migration result.
 */
export interface MigrationSuccessResult {
  readonly success: true;
  readonly event: GameEvent;
  readonly migrated: boolean;
  readonly fromVersion: SchemaVersion;
  readonly toVersion: SchemaVersion;
}

/**
 * Failed migration result.
 */
export interface MigrationErrorResult {
  readonly success: false;
  readonly error: string;
  readonly originalEvent: RawVersionedEvent;
  readonly stage: 'migration' | 'validation';
}

/**
 * Result of migration + validation.
 */
export type MigrationResult = MigrationSuccessResult | MigrationErrorResult;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for validation behavior.
 */
export interface ValidationConfig {
  /** Throw on validation failure (default: false in prod, true in tests) */
  readonly strict: boolean;
  /** Log validation errors (default: true) */
  readonly logErrors: boolean;
  /** Target schema version (default: CURRENT_SCHEMA_VERSION) */
  readonly targetVersion: SchemaVersion;
  /**
   * Output policy:
   * - 'lossless': return migrated event as-is (may include forward-compatible keys not in schema)
   * - 'canonical': return the validated canonical shape (unknown keys stripped when strict=false)
   */
  readonly output?: 'lossless' | 'canonical';
}

/**
 * Default validation config.
 * - Strict mode in tests (throws on error)
 * - Lenient mode in prod (logs and skips)
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strict: typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test',
  logErrors: true,
  targetVersion: CURRENT_SCHEMA_VERSION,
  output: 'lossless',
};
