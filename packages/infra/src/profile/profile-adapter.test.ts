/**
 * Profile Adapter Tests
 *
 * Tests for the profile adapter using SQL-first computation.
 */

import { describe, expect, test, afterAll, mock } from 'bun:test';

// Mock the PersistencePort calls used by the adapter
const mockGetSessionSummaries = mock(() => Promise.resolve([]));
const mockGlobalStatsWhere = mock(async () => [
  {
    total_sessions: 0,
    total_duration: 0,
    max_n: 1,
  },
]);
const mockStreakAll = mock(async () => [
  {
    current_streak: 0,
    best_streak: 0,
    last_date: null,
  },
]);

const mockDrizzleDb = {
  select: mock(() => ({
    from: () => ({
      where: mockGlobalStatsWhere,
    }),
  })),
  all: mockStreakAll,
};

// Now import after mocks are set up (Bun evaluates module top-level eagerly)
const { createProfileAdapter } = await import('./profile-adapter');

// Create a dummy persistence port for the factory
const dummyPersistence = {
  getSessionSummaries: mockGetSessionSummaries,
  getDrizzleDb: mock(() => mockDrizzleDb),
} as any;

const profileAdapter = createProfileAdapter(dummyPersistence);

afterAll(() => {
  mock.restore();
});

// =============================================================================
// Basic Functionality Tests
// =============================================================================

describe('ProfileAdapter - Basic Functionality', () => {
  test('getProfile returns profile from SQL store', async () => {
    mockGetSessionSummaries.mockResolvedValue([]);

    const profile = await profileAdapter.getProfile();

    expect(profile).toBeDefined();
    expect(profile.odalisqueId).toBe('local');
    expect(mockGetSessionSummaries).toHaveBeenCalled();
  });

  test('getProfile returns empty profile when no sessions', async () => {
    mockGetSessionSummaries.mockResolvedValue([]);

    const profile = await profileAdapter.getProfile();

    expect(profile.totalSessions).toBe(0);
    expect(profile.totalTrials).toBe(0);
    expect(profile.currentNLevel).toBe(1);
    expect(profile.highestNLevel).toBe(1);
    expect(profile.avgDPrime).toBe(0);
    expect(profile.bestDPrime).toBe(0);
  });

  test('getProfile tolerates invalid created_at values in summaries', async () => {
    mockGetSessionSummaries.mockResolvedValue([
      {
        session_id: 's-invalid',
        user_id: 'local',
        created_at: 'not-a-date',
        n_level: 3,
        global_d_prime: 1.2,
        trials_count: 42,
        by_modality: '{}',
      },
      {
        session_id: 's-valid',
        user_id: 'local',
        created_at: '2026-03-10T12:00:00.000Z',
        n_level: 4,
        global_d_prime: 1.6,
        trials_count: 50,
        by_modality: '{}',
      },
    ]);

    const profile = await profileAdapter.getProfile();

    expect(profile.totalTrials).toBe(92);
    expect(profile.currentNLevel).toBe(3);
    expect(profile.progression).toHaveLength(2);
    expect(profile.lastEventTimestamp).toBe(0);
  });
});
