/**
 * Profile Read Model Tests
 *
 * Tests the createProfileReadModel factory: subscribable composition,
 * cache key generation, and auto-eviction on unsubscribe.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { ReadModelPort, ReadModelSnapshot, Subscribable } from '@neurodual/logic';
import { createProfileReadModel } from './profile-read-model';

// =============================================================================
// Helpers: mock subscribable factory
// =============================================================================

type Listener = () => void;

function createMockSubscribable<T>(
  initialData: T,
  initialPending = false,
): {
  subscribable: Subscribable<ReadModelSnapshot<T>>;
  emit: (data: T) => void;
  setPending: (p: boolean) => void;
  subscriberCount: () => number;
} {
  let snapshot: ReadModelSnapshot<T> = {
    data: initialData,
    isPending: initialPending,
    error: null,
  };
  const listeners = new Set<Listener>();

  return {
    subscribable: {
      subscribe(listener: Listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot() {
        return snapshot;
      },
    },
    emit(data: T) {
      snapshot = { data, isPending: false, error: null };
      for (const l of listeners) l();
    },
    setPending(p: boolean) {
      snapshot = { ...snapshot, isPending: p };
      for (const l of listeners) l();
    },
    subscriberCount: () => listeners.size,
  };
}

// =============================================================================
// Mock ReadModelPort with only the profile* methods needed
// =============================================================================

function createMockReadModelPort() {
  const summary = createMockSubscribable<readonly unknown[]>([]);
  const latest = createMockSubscribable<readonly unknown[]>([]);
  const sessionDays = createMockSubscribable<readonly unknown[]>([]);
  const progression = createMockSubscribable<readonly unknown[]>([]);
  const modality = createMockSubscribable<readonly unknown[]>([]);
  const streak = createMockSubscribable<readonly unknown[]>([]);

  const port = {
    profileSummary: mock((_userId: string | null) => summary.subscribable),
    profileLatestSession: mock((_userId: string | null) => latest.subscribable),
    profileSessionDays: mock((_userId: string | null) => sessionDays.subscribable),
    profileProgression: mock((_userId: string | null) => progression.subscribable),
    profileModalitySource: mock((_userId: string | null) => modality.subscribable),
    profileStreak: mock((_userId: string | null) => streak.subscribable),
  } as unknown as ReadModelPort;

  return { port, sources: { summary, latest, sessionDays, progression, modality, streak } };
}

// =============================================================================
// Clear the module-level cache between tests
// =============================================================================

// The profile-read-model uses a module-level Map cache. We need to evict
// entries between tests by subscribing and immediately unsubscribing.
// Since eviction happens via queueMicrotask, we await a tick after unsub.
async function flushMicrotasks() {
  await new Promise<void>((r) => queueMicrotask(r));
}

// =============================================================================
// Tests
// =============================================================================

describe('ProfileReadModel', () => {
  let mockPort: ReturnType<typeof createMockReadModelPort>;

  beforeEach(async () => {
    mockPort = createMockReadModelPort();
    // Force-evict any leftover cache entries from previous tests
    const rm = createProfileReadModel(mockPort.port);
    const sub = rm.getProfile(null);
    const unsub = sub.subscribe(() => {});
    unsub();
    await flushMicrotasks();
  });

  describe('createProfileReadModel factory', () => {
    it('returns an object with getProfile method', () => {
      const rm = createProfileReadModel(mockPort.port);
      expect(typeof rm.getProfile).toBe('function');
    });
  });

  describe('getProfile', () => {
    it('subscribes to all 6 ReadModelPort profile queries', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub = rm.getProfile('user-1');
      // Subscribing activates the combiner which subscribes to all sources
      const unsub = sub.subscribe(() => {});

      expect(mockPort.port.profileSummary).toHaveBeenCalledWith('user-1');
      expect(mockPort.port.profileLatestSession).toHaveBeenCalledWith('user-1');
      expect(mockPort.port.profileSessionDays).toHaveBeenCalledWith('user-1');
      expect(mockPort.port.profileProgression).toHaveBeenCalledWith('user-1');
      expect(mockPort.port.profileModalitySource).toHaveBeenCalledWith('user-1');
      expect(mockPort.port.profileStreak).toHaveBeenCalledWith('user-1');

      unsub();
    });

    it('returns a snapshot with isPending and data fields', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub = rm.getProfile(null);
      const unsub = sub.subscribe(() => {});

      const snapshot = sub.getSnapshot();
      expect(snapshot).toHaveProperty('data');
      expect(snapshot).toHaveProperty('isPending');
      expect(snapshot).toHaveProperty('error');

      unsub();
    });

    it('returns a PlayerProfile with the correct userId for null (local)', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub = rm.getProfile(null);
      const unsub = sub.subscribe(() => {});

      const profile = sub.getSnapshot().data;
      expect(profile.odalisqueId).toBe('local');

      unsub();
    });

    it('returns a PlayerProfile with the correct userId for a real user', async () => {
      // Evict cache for user-42 first
      const rmTemp = createProfileReadModel(mockPort.port);
      const subTemp = rmTemp.getProfile('user-42');
      const unsubTemp = subTemp.subscribe(() => {});
      unsubTemp();
      await flushMicrotasks();

      // Fresh port so we track calls cleanly
      const fresh = createMockReadModelPort();
      const rm = createProfileReadModel(fresh.port);
      const sub = rm.getProfile('user-42');
      const unsub = sub.subscribe(() => {});

      const profile = sub.getSnapshot().data;
      expect(profile.odalisqueId).toBe('user-42');

      unsub();
    });

    it('produces an empty profile when all sources return empty arrays', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub = rm.getProfile(null);
      const unsub = sub.subscribe(() => {});

      const profile = sub.getSnapshot().data;
      expect(profile.totalSessions).toBe(0);
      expect(profile.currentNLevel).toBe(1);
      expect(profile.highestNLevel).toBe(1);
      expect(profile.totalTrials).toBe(0);

      unsub();
    });

    it('combines data from summary and latest sources into the profile', () => {
      const { port, sources } = createMockReadModelPort();

      sources.summary.emit([
        {
          total_sessions: 10,
          total_duration_ms: 600000,
          total_trials: 200,
          avg_d_prime: 2.5,
          best_d_prime: 3.1,
          highest_n_level: 4,
          total_focus_lost_ms: 500,
          avg_focus_lost_per_session: 50,
        },
      ]);
      sources.latest.emit([{ n_level: 3, created_at: '2026-01-15T10:00:00Z' }]);
      sources.streak.emit([{ current_streak: 5, best_streak: 12, last_active_date: '2026-01-15' }]);

      const rm = createProfileReadModel(port);
      const sub = rm.getProfile(null);
      const unsub = sub.subscribe(() => {});

      const profile = sub.getSnapshot().data;
      expect(profile.totalSessions).toBe(10);
      expect(profile.highestNLevel).toBe(4);
      expect(profile.currentNLevel).toBe(3);
      expect(profile.currentStreak).toBe(5);
      expect(profile.longestStreak).toBe(12);

      unsub();
    });

    it('notifies listener when a source emits new data', () => {
      const { port, sources } = createMockReadModelPort();

      const rm = createProfileReadModel(port);
      const sub = rm.getProfile(null);
      const listener = mock(() => {});
      const unsub = sub.subscribe(listener);

      // Emit a change on the summary source
      sources.summary.emit([
        {
          total_sessions: 5,
          total_duration_ms: 300000,
          total_trials: 100,
          avg_d_prime: 1.5,
          best_d_prime: 2.0,
          highest_n_level: 3,
          total_focus_lost_ms: 0,
          avg_focus_lost_per_session: 0,
        },
      ]);

      expect(listener).toHaveBeenCalled();

      unsub();
    });

    it('reports isPending when any source is pending', () => {
      const { port, sources } = createMockReadModelPort();
      sources.summary.setPending(true);

      const rm = createProfileReadModel(port);
      const sub = rm.getProfile(null);
      const unsub = sub.subscribe(() => {});

      expect(sub.getSnapshot().isPending).toBe(true);

      unsub();
    });
  });

  describe('cache key generation', () => {
    it('uses "local" as userId when null', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub1 = rm.getProfile(null);
      const sub2 = rm.getProfile(null);

      // Same key => same subscribable reference
      expect(sub1).toBe(sub2);
    });

    it('uses the userId string when provided', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub1 = rm.getProfile('user-A');
      const sub2 = rm.getProfile('user-A');

      expect(sub1).toBe(sub2);
    });

    it('creates different subscribables for different userIds', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub1 = rm.getProfile('user-A');
      const sub2 = rm.getProfile('user-B');

      expect(sub1).not.toBe(sub2);
    });

    it('returns cached subscribable on subsequent calls with same userId', () => {
      const fresh = createMockReadModelPort();
      const rm = createProfileReadModel(fresh.port);
      const sub1 = rm.getProfile('cached-user');
      const sub2 = rm.getProfile('cached-user');

      expect(sub1).toBe(sub2);
      // profileSummary should only have been called once for this userId
      expect(fresh.port.profileSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-eviction', () => {
    it('evicts cache entry after unsubscribe (via queueMicrotask)', async () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub1 = rm.getProfile(null);
      const unsub = sub1.subscribe(() => {});

      unsub();
      await flushMicrotasks();

      // After eviction, a new call should create a fresh subscribable
      const sub2 = rm.getProfile(null);
      expect(sub1).not.toBe(sub2);
    });

    it('evicts only after microtask settles, not synchronously', () => {
      const rm = createProfileReadModel(mockPort.port);
      const sub1 = rm.getProfile(null);
      const unsub = sub1.subscribe(() => {});

      unsub();

      // Before microtask: still cached
      const sub2 = rm.getProfile(null);
      expect(sub1).toBe(sub2);
    });
  });
});
