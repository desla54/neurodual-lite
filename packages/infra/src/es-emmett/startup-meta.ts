/**
 * Stub — startup meta keys (no longer needed).
 */
export const EMMETT_LAST_GLOBAL_POSITION_META_KEY = 'emmett:lastGlobalPosition';
export const POWERSYNC_LAST_SYNCED_AT_META_KEY = 'powersync:lastSyncedAt';
export const PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY = 'projection:lastProcessedSyncAt';

export function toSyncMetaSqlLabel(key: string): string {
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_');
}
