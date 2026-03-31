/**
 * Tests for stream-id helpers
 */

import { describe, expect, it } from 'bun:test';
import {
  SESSION_STREAM_PREFIX,
  LEGACY_SESSION_STREAM_PREFIX,
  formatSessionStreamId,
  isSessionStreamId,
  parseSessionIdFromStreamId,
  sessionStreamIdSql,
  sessionStreamFilterSql,
  sessionStreamEqualsSql,
} from './stream-id';

describe('stream-id', () => {
  describe('constants', () => {
    it('should export SESSION_STREAM_PREFIX', () => {
      expect(SESSION_STREAM_PREFIX).toBe('session:');
    });

    it('should export LEGACY_SESSION_STREAM_PREFIX', () => {
      expect(LEGACY_SESSION_STREAM_PREFIX).toBe('training:session:');
    });
  });

  describe('formatSessionStreamId', () => {
    it('should format a session id with the current prefix', () => {
      expect(formatSessionStreamId('abc-123')).toBe('session:abc-123');
    });

    it('should handle empty string', () => {
      expect(formatSessionStreamId('')).toBe('session:');
    });

    it('should handle uuid-style ids', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(formatSessionStreamId(uuid)).toBe(`session:${uuid}`);
    });
  });

  describe('isSessionStreamId', () => {
    it('should return true for current prefix', () => {
      expect(isSessionStreamId('session:abc-123')).toBe(true);
    });

    it('should return true for legacy prefix', () => {
      expect(isSessionStreamId('training:session:abc-123')).toBe(true);
    });

    it('should return false for unrelated stream ids', () => {
      expect(isSessionStreamId('journey:abc-123')).toBe(false);
      expect(isSessionStreamId('user:abc-123')).toBe(false);
      expect(isSessionStreamId('')).toBe(false);
      expect(isSessionStreamId('abc-123')).toBe(false);
    });

    it('should return false for partial prefix matches', () => {
      expect(isSessionStreamId('sessions:abc')).toBe(false);
      expect(isSessionStreamId('training:abc')).toBe(false);
    });
  });

  describe('parseSessionIdFromStreamId', () => {
    it('should extract session id from current prefix', () => {
      expect(parseSessionIdFromStreamId('session:abc-123')).toBe('abc-123');
    });

    it('should extract session id from legacy prefix', () => {
      expect(parseSessionIdFromStreamId('training:session:abc-123')).toBe('abc-123');
    });

    it('should return null for non-session stream ids', () => {
      expect(parseSessionIdFromStreamId('journey:abc-123')).toBeNull();
      expect(parseSessionIdFromStreamId('')).toBeNull();
      expect(parseSessionIdFromStreamId('abc-123')).toBeNull();
    });

    it('should return empty string when id part is empty', () => {
      expect(parseSessionIdFromStreamId('session:')).toBe('');
      expect(parseSessionIdFromStreamId('training:session:')).toBe('');
    });
  });

  describe('sessionStreamIdSql', () => {
    it('should generate SQL CASE with default column', () => {
      const sql = sessionStreamIdSql();
      expect(sql).toContain('stream_id');
      expect(sql).toContain("LIKE 'training:session:%'");
      expect(sql).toContain("LIKE 'session:%'");
      expect(sql).toContain('substr');
      // legacy prefix length = 17 chars + 1 = 18
      expect(sql).toContain('18');
      // current prefix length = 8 chars + 1 = 9
      expect(sql).toContain('9');
    });

    it('should use custom column name', () => {
      const sql = sessionStreamIdSql('my_col');
      expect(sql).toContain('my_col');
      expect(sql).not.toContain('stream_id');
    });
  });

  describe('sessionStreamFilterSql', () => {
    it('should generate filter SQL with default column', () => {
      const sql = sessionStreamFilterSql();
      expect(sql).toBe("(stream_id LIKE 'session:%' OR stream_id LIKE 'training:session:%')");
    });

    it('should use custom column name', () => {
      const sql = sessionStreamFilterSql('sid');
      expect(sql).toBe("(sid LIKE 'session:%' OR sid LIKE 'training:session:%')");
    });
  });

  describe('sessionStreamEqualsSql', () => {
    it('should generate equals SQL with default column', () => {
      const sql = sessionStreamEqualsSql();
      expect(sql).toContain("stream_id = 'session:' || ?");
      expect(sql).toContain("stream_id = 'training:session:' || ?");
    });

    it('should use custom column name', () => {
      const sql = sessionStreamEqualsSql('col');
      expect(sql).toContain("col = 'session:' || ?");
      expect(sql).toContain("col = 'training:session:' || ?");
    });
  });
});
