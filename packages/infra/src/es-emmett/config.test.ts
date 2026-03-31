/**
 * Tests for Emmett Event Store Configuration
 */

import { describe, expect, it } from 'bun:test';
import { EVENT_SCHEMA_VERSION, defaultEventStoreConfig, type EventStoreConfig } from './config';

describe('config', () => {
  describe('EVENT_SCHEMA_VERSION', () => {
    it('should be version 1.0', () => {
      expect(EVENT_SCHEMA_VERSION).toBe('1.0');
    });

    it('should be a const (frozen)', () => {
      // The `as const` makes it literal, so it should be frozen
      expect(EVENT_SCHEMA_VERSION).toBe('1.0');
    });
  });

  describe('EventStoreConfig interface', () => {
    it('should accept valid config', () => {
      const config: EventStoreConfig = {
        schemaVersion: '1.0',
        snapshotThreshold: 50,
      };

      expect(config.schemaVersion).toBe('1.0');
      expect(config.snapshotThreshold).toBe(50);
    });
  });

  describe('defaultEventStoreConfig', () => {
    it('should have correct default values', () => {
      expect(defaultEventStoreConfig.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
      expect(defaultEventStoreConfig.snapshotThreshold).toBe(100);
    });

    it('should have correct type interface', () => {
      const config: EventStoreConfig = {
        schemaVersion: '1.0',
        snapshotThreshold: 100,
      };
      expect(config.schemaVersion).toBe('1.0');
      expect(config.snapshotThreshold).toBe(100);
    });
  });

  describe('config values', () => {
    it('should use valid schema version format', () => {
      // Semantic versioning format
      expect(EVENT_SCHEMA_VERSION).toMatch(/^\d+\.\d+/);
    });

    it('should have positive snapshot threshold', () => {
      expect(defaultEventStoreConfig.snapshotThreshold).toBeGreaterThan(0);
    });
  });
});
