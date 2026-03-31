/**
 * Configuration de l'Event Store Emmett.
 *
 * Centralise les constantes de configuration pour l'event store.
 */

/**
 * Version du schéma d'événements.
 * Utilisée pour le versioning et les migrations de schéma.
 */
export const EVENT_SCHEMA_VERSION = '1.0' as const;

/**
 * Default maximum size for the stream version cache.
 * Prevents unbounded memory growth in long-running sessions.
 */
export const DEFAULT_MAX_CACHE_SIZE = 1000;

/**
 * Configuration de l'Event Store.
 */
export interface EventStoreConfig {
  /** Version du schéma d'événements */
  schemaVersion: string;
  /** Nombre d'événements avant de créer un snapshot (optionnel) */
  snapshotThreshold: number;
  /** Maximum number of stream versions to cache (defaults to DEFAULT_MAX_CACHE_SIZE) */
  maxCacheSize?: number;
}

/**
 * Configuration par défaut de l'Event Store.
 */
export const defaultEventStoreConfig: EventStoreConfig = {
  schemaVersion: EVENT_SCHEMA_VERSION,
  snapshotThreshold: 100, // Non implémenté encore - placeholder
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
};
