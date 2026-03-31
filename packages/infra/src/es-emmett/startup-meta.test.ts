/**
 * Tests for startup-meta constants and helpers
 */

import { describe, expect, it } from 'bun:test';
import {
  EMMETT_LAST_GLOBAL_POSITION_META_KEY,
  POWERSYNC_LAST_SYNCED_AT_META_KEY,
  PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
  toSyncMetaSqlLabel,
} from './startup-meta';

describe('startup-meta', () => {
  describe('constants', () => {
    it('should export EMMETT_LAST_GLOBAL_POSITION_META_KEY', () => {
      expect(EMMETT_LAST_GLOBAL_POSITION_META_KEY).toBe('emmett:last-global-position:v1');
    });

    it('should export POWERSYNC_LAST_SYNCED_AT_META_KEY', () => {
      expect(POWERSYNC_LAST_SYNCED_AT_META_KEY).toBe('powersync:last-synced-at:v1');
    });

    it('should export PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY', () => {
      expect(PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY).toBe(
        'projection-engine:last-processed-sync-at:v1',
      );
    });
  });

  describe('toSyncMetaSqlLabel', () => {
    it('should pass through valid characters unchanged', () => {
      expect(toSyncMetaSqlLabel('abc-123_XYZ:v1')).toBe('abc-123_XYZ:v1');
    });

    it('should replace spaces with underscores', () => {
      expect(toSyncMetaSqlLabel('hello world')).toBe('hello_world');
    });

    it('should replace special characters with underscores', () => {
      expect(toSyncMetaSqlLabel('foo@bar#baz')).toBe('foo_bar_baz');
    });

    it('should replace dots with underscores', () => {
      expect(toSyncMetaSqlLabel('v1.2.3')).toBe('v1_2_3');
    });

    it('should handle empty string', () => {
      expect(toSyncMetaSqlLabel('')).toBe('');
    });

    it('should keep colons, hyphens, and underscores', () => {
      expect(toSyncMetaSqlLabel('a:b-c_d')).toBe('a:b-c_d');
    });

    it('should sanitize the actual meta key constants correctly', () => {
      // The constants themselves should already be safe
      expect(toSyncMetaSqlLabel(EMMETT_LAST_GLOBAL_POSITION_META_KEY)).toBe(
        EMMETT_LAST_GLOBAL_POSITION_META_KEY,
      );
      expect(toSyncMetaSqlLabel(POWERSYNC_LAST_SYNCED_AT_META_KEY)).toBe(
        POWERSYNC_LAST_SYNCED_AT_META_KEY,
      );
      expect(toSyncMetaSqlLabel(PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY)).toBe(
        PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
      );
    });

    it('should replace multiple consecutive special chars', () => {
      expect(toSyncMetaSqlLabel('a!!b')).toBe('a__b');
    });
  });
});
