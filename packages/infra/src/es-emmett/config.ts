/**
 * Stub — config constants for backward compatibility.
 */
export const EVENT_SCHEMA_VERSION = '1';
export const DEFAULT_MAX_CACHE_SIZE = 200;

export interface EventStoreConfig {
  maxCacheSize?: number;
}

export const defaultEventStoreConfig: EventStoreConfig = {
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
};
