export const EMMETT_LAST_GLOBAL_POSITION_META_KEY = 'emmett:last-global-position:v1';
export const POWERSYNC_LAST_SYNCED_AT_META_KEY = 'powersync:last-synced-at:v1';
export const PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY =
  'projection-engine:last-processed-sync-at:v1';

export function toSyncMetaSqlLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_');
}
