import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { getLastAppliedResetAtMs, setLastAppliedResetAtMs } from './reset-marker';

describe('reset-marker', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    // Mock localStorage
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: mock((key: string) => storage[key] ?? null),
      setItem: mock((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: mock((key: string) => {
        delete storage[key];
      }),
      clear: mock(() => {
        storage = {};
      }),
      length: 0,
      key: mock(() => null),
    };
  });

  describe('getLastAppliedResetAtMs', () => {
    it('should return null when no data exists', () => {
      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should return null when user has no entry', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'other-user': 1234567890,
      });

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should return stored timestamp for user', () => {
      const timestamp = 1704067200000; // 2024-01-01
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'user-123': timestamp,
      });

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBe(timestamp);
    });

    it('should return null for non-number values', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'user-123': 'not-a-number',
      });

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should return null for NaN values', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'user-123': NaN,
      });

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should return null for Infinity values', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'user-123': Infinity,
      });

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = 'not-valid-json';

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });

    it('should handle non-object JSON gracefully', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify('just-a-string');

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBeNull();
    });
  });

  describe('setLastAppliedResetAtMs', () => {
    it('should store timestamp for user', () => {
      const timestamp = 1704067200000;
      setLastAppliedResetAtMs('user-123', timestamp);

      const stored = JSON.parse(storage['neurodual:reset:lastAppliedAtByUser']!);
      expect(stored['user-123']).toBe(timestamp);
    });

    it('should preserve other users data', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'other-user': 1000000000,
      });

      setLastAppliedResetAtMs('user-123', 2000000000);

      const stored = JSON.parse(storage['neurodual:reset:lastAppliedAtByUser']!);
      expect(stored['other-user']).toBe(1000000000);
      expect(stored['user-123']).toBe(2000000000);
    });

    it('should update existing user timestamp', () => {
      storage['neurodual:reset:lastAppliedAtByUser'] = JSON.stringify({
        'user-123': 1000000000,
      });

      setLastAppliedResetAtMs('user-123', 2000000000);

      const stored = JSON.parse(storage['neurodual:reset:lastAppliedAtByUser']!);
      expect(stored['user-123']).toBe(2000000000);
    });

    it('should roundtrip with getLastAppliedResetAtMs', () => {
      const timestamp = Date.now();
      setLastAppliedResetAtMs('user-123', timestamp);

      const result = getLastAppliedResetAtMs('user-123');
      expect(result).toBe(timestamp);
    });
  });
});
