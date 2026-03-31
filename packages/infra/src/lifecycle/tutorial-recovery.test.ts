import { describe, expect, it, beforeEach } from 'bun:test';
import type { TutorialRecoverySnapshot } from '@neurodual/logic';

// localStorage mock
const mockStorage: { data: Record<string, string> } = { data: {} };

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string): string | null => mockStorage.data[key] ?? null,
  setItem: (key: string, value: string): void => {
    mockStorage.data[key] = value;
  },
  removeItem: (key: string): void => {
    delete mockStorage.data[key];
  },
  clear: (): void => {
    mockStorage.data = {};
  },
  length: 0,
  key: (): null => null,
};

import {
  saveTutorialRecoverySnapshot,
  loadTutorialRecoverySnapshot,
  clearTutorialRecoverySnapshot,
  checkForRecoverableTutorial,
  createTutorialRecoverySnapshot,
} from './tutorial-recovery';

const STORAGE_KEY = 'nd_tutorial_recovery';

describe('tutorial-recovery', () => {
  beforeEach(() => {
    mockStorage.data = {};
  });

  // ===========================================================================
  // save / load roundtrip
  // ===========================================================================

  describe('save / load roundtrip', () => {
    it('should roundtrip a valid snapshot', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 3,
        timestamp: Date.now(),
      };

      saveTutorialRecoverySnapshot(snapshot);
      const loaded = loadTutorialRecoverySnapshot();

      expect(loaded).not.toBeNull();
      expect(loaded!.tutorialId).toBe('basics');
      expect(loaded!.stepIndex).toBe(3);
      expect(loaded!.timestamp).toBe(snapshot.timestamp);
    });

    it('should overwrite previous snapshot on re-save', () => {
      saveTutorialRecoverySnapshot({ tutorialId: 'a', stepIndex: 1, timestamp: 100 });
      saveTutorialRecoverySnapshot({ tutorialId: 'b', stepIndex: 5, timestamp: 200 });

      const loaded = loadTutorialRecoverySnapshot();
      expect(loaded!.tutorialId).toBe('b');
      expect(loaded!.stepIndex).toBe(5);
    });
  });

  // ===========================================================================
  // invalid snapshot rejection
  // ===========================================================================

  describe('invalid snapshot rejection', () => {
    it('should return null for invalid JSON', () => {
      mockStorage.data[STORAGE_KEY] = 'not-json';
      const result = loadTutorialRecoverySnapshot();
      expect(result).toBeNull();
    });

    it('should return null and clear when tutorialId is missing', () => {
      mockStorage.data[STORAGE_KEY] = JSON.stringify({ stepIndex: 2, timestamp: Date.now() });
      const result = loadTutorialRecoverySnapshot();
      expect(result).toBeNull();
      expect(mockStorage.data[STORAGE_KEY]).toBeUndefined();
    });

    it('should return null and clear when stepIndex is not a number', () => {
      mockStorage.data[STORAGE_KEY] = JSON.stringify({
        tutorialId: 'basics',
        stepIndex: 'two',
        timestamp: Date.now(),
      });
      const result = loadTutorialRecoverySnapshot();
      expect(result).toBeNull();
      expect(mockStorage.data[STORAGE_KEY]).toBeUndefined();
    });

    it('should return null when no snapshot exists', () => {
      const result = loadTutorialRecoverySnapshot();
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // stale detection (30-60 min)
  // ===========================================================================

  describe('stale detection', () => {
    it('should not be stale when fresh (< 30 min)', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 1,
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      };
      mockStorage.data[STORAGE_KEY] = JSON.stringify(snapshot);

      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(true);
      expect(result.isStale).toBe(false);
    });

    it('should be stale when older than 30 minutes', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 1,
        timestamp: Date.now() - 31 * 60 * 1000,
      };
      mockStorage.data[STORAGE_KEY] = JSON.stringify(snapshot);

      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(true);
      expect(result.isStale).toBe(true);
    });

    it('should be stale at 45 minutes but still recoverable', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 2,
        timestamp: Date.now() - 45 * 60 * 1000,
      };
      mockStorage.data[STORAGE_KEY] = JSON.stringify(snapshot);

      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(true);
      expect(result.isStale).toBe(true);
      expect(result.snapshot).not.toBeNull();
    });
  });

  // ===========================================================================
  // expiry auto-clear (> 2h)
  // ===========================================================================

  describe('expiry auto-clear', () => {
    it('should auto-clear snapshot older than 2 hours', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 1,
        timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
      };
      mockStorage.data[STORAGE_KEY] = JSON.stringify(snapshot);

      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(false);
      expect(result.snapshot).toBeNull();
      expect(result.isStale).toBe(false);
      expect(mockStorage.data[STORAGE_KEY]).toBeUndefined();
    });

    it('should keep snapshot that is exactly under 2 hours', () => {
      const snapshot: TutorialRecoverySnapshot = {
        tutorialId: 'basics',
        stepIndex: 1,
        timestamp: Date.now() - (2 * 60 * 60 * 1000 - 1000), // just under 2h
      };
      mockStorage.data[STORAGE_KEY] = JSON.stringify(snapshot);

      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(true);
      expect(result.snapshot).not.toBeNull();
    });
  });

  // ===========================================================================
  // clear function
  // ===========================================================================

  describe('clearTutorialRecoverySnapshot', () => {
    it('should remove snapshot from localStorage', () => {
      mockStorage.data[STORAGE_KEY] = JSON.stringify({
        tutorialId: 'basics',
        stepIndex: 1,
        timestamp: Date.now(),
      });

      clearTutorialRecoverySnapshot();
      expect(mockStorage.data[STORAGE_KEY]).toBeUndefined();
    });

    it('should not throw when no snapshot exists', () => {
      expect(() => clearTutorialRecoverySnapshot()).not.toThrow();
    });
  });

  // ===========================================================================
  // createTutorialRecoverySnapshot helper
  // ===========================================================================

  describe('createTutorialRecoverySnapshot', () => {
    it('should create snapshot with provided fields and current timestamp', () => {
      const before = Date.now();
      const snapshot = createTutorialRecoverySnapshot('advanced', 5);
      const after = Date.now();

      expect(snapshot.tutorialId).toBe('advanced');
      expect(snapshot.stepIndex).toBe(5);
      expect(snapshot.timestamp).toBeGreaterThanOrEqual(before);
      expect(snapshot.timestamp).toBeLessThanOrEqual(after);
    });

    it('should create distinct timestamps on successive calls', async () => {
      const s1 = createTutorialRecoverySnapshot('a', 0);
      await new Promise((r) => setTimeout(r, 5));
      const s2 = createTutorialRecoverySnapshot('a', 1);

      expect(s2.timestamp).toBeGreaterThan(s1.timestamp);
    });
  });

  // ===========================================================================
  // checkForRecoverableTutorial no-snapshot case
  // ===========================================================================

  describe('checkForRecoverableTutorial', () => {
    it('should return hasSession: false when no snapshot exists', () => {
      const result = checkForRecoverableTutorial();
      expect(result.hasSession).toBe(false);
      expect(result.snapshot).toBeNull();
      expect(result.isStale).toBe(false);
    });
  });
});
