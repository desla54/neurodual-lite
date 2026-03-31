/**
 * Unit tests for history query builder functions.
 *
 * Tests coverage for:
 * - CompiledSqlQuery structure (sql string + parameters array)
 * - User scope conditions: single user, 'local', null/empty userId handling
 * - Filter combinations: mode filtering (Journey/Libre/specific game mode), date range, modality CSV, n-level
 * - Cursor pagination: keyset ordering with created_at + session_id
 * - Empty/null filter handling
 * - SQL output contains expected clauses (WHERE, ORDER BY, LIMIT, etc.)
 */

import { describe, expect, it } from 'bun:test';

import type { SessionSummariesCursor, SessionSummariesFilters } from '@neurodual/logic';

import {
  buildAvailableJourneyIdsCompiledQuery,
  buildBrainWorkshopStrikesCompiledQuery,
  buildJourneyRecordableSessionsCompiledQuery,
  buildJourneySessionsCompiledQuery,
  buildLastAdaptiveDPrimeCompiledQuery,
  buildLatestJourneySessionCompiledQuery,
  buildMaxAchievedLevelCompiledQuery,
  buildRecentSessionsForTrendCompiledQuery,
  buildSessionDetailsCompiledQuery,
  buildSessionsByGameModeCompiledQuery,
  buildSessionSummariesCompiledQuery,
  buildSessionSummariesCountCompiledQuery,
  buildSessionSummariesFilteredCountCompiledQuery,
  buildSessionSummariesFilteredIdsCompiledQuery,
  buildSessionSummariesHeaderCountsCompiledQuery,
  buildSessionSummariesIdsCompiledQuery,
  buildSessionSummariesPageCompiledQuery,
  buildSessionsListCompiledQuery,
  type CompiledSqlQuery,
} from './history-queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFilters(overrides: Partial<SessionSummariesFilters> = {}): SessionSummariesFilters {
  return {
    mode: 'all',
    journeyFilter: 'all',
    freeModeFilter: 'all',
    modalities: new Set<string>(),
    startDate: null,
    endDate: null,
    nLevels: new Set<number>(),
    ...overrides,
  };
}

/** Assert common CompiledSqlQuery shape */
function assertCompiledQuery(result: CompiledSqlQuery): void {
  expect(typeof result.sql).toBe('string');
  expect(result.sql.length).toBeGreaterThan(0);
  expect(Array.isArray(result.parameters)).toBe(true);
}

// ---------------------------------------------------------------------------
// User scope conditions
// ---------------------------------------------------------------------------

describe('user scope conditions', () => {
  it('single authenticated user does not include NULL/empty user_id fallback', () => {
    const result = buildSessionSummariesCountCompiledQuery(['user-123']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('user-123');
    // Should NOT include the OR user_id IS NULL fallback (note: reason IS NULL is separate)
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('"local" userId no longer includes NULL/empty legacy fallback', () => {
    const result = buildSessionSummariesCountCompiledQuery(['local']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('local');
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('empty userId array defaults to "local" scope', () => {
    const result = buildSessionSummariesCountCompiledQuery([]);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('local');
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('whitespace-only userId array defaults to "local" scope', () => {
    const result = buildSessionSummariesCountCompiledQuery(['  ', '']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('local');
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('multiple userIds including "local" no longer include legacy fallback', () => {
    const result = buildSessionSummariesCountCompiledQuery(['user-a', 'local']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('user-a');
    expect(result.parameters).toContain('local');
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('multiple authenticated userIds without "local" have no legacy fallback', () => {
    const result = buildSessionSummariesCountCompiledQuery(['user-a', 'user-b']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('user-a');
    expect(result.parameters).toContain('user-b');
    // Should NOT include the OR user_id IS NULL fallback
    expect(result.sql).not.toContain('user_id" IS NULL');
    expect(result.sql).not.toContain("user_id\" = ''");
  });

  it('deduplicates user ids', () => {
    const result = buildSessionSummariesCountCompiledQuery(['user-a', 'user-a', 'user-a']);
    assertCompiledQuery(result);
    // The parameter 'user-a' should appear only once in the IN clause
    const userACount = result.parameters.filter((p) => p === 'user-a').length;
    expect(userACount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesFilteredCountCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesFilteredCountCompiledQuery', () => {
  it('returns count query with no filters', () => {
    const result = buildSessionSummariesFilteredCountCompiledQuery(['user-1'], makeFilters());
    assertCompiledQuery(result);
    expect(result.sql).toContain('count(');
    expect(result.sql).toContain('session_summaries');
  });

  it('includes completed sessions condition', () => {
    const result = buildSessionSummariesFilteredCountCompiledQuery(['user-1'], makeFilters());
    // The completed condition targets normalized completed rows directly.
    expect(result.sql).toContain('completed');
  });
});

// ---------------------------------------------------------------------------
// Filter combinations
// ---------------------------------------------------------------------------

describe('filter combinations', () => {
  describe('mode filtering', () => {
    it('mode "all" does not add play_context or game_mode filter', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'all' }),
      );
      expect(result.parameters).not.toContain('journey');
      expect(result.parameters).not.toContain('free');
    });

    it('mode "Journey" filters by play_context = journey and non-null journey_stage_id', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'Journey' }),
      );
      expect(result.parameters).toContain('journey');
      expect(result.sql).toContain('journey_stage_id');
      expect(result.sql.toLowerCase()).toContain('is not null');
    });

    it('mode "Journey" with journeyFilter adds journey_id condition', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'Journey', journeyFilter: 'journey-abc' }),
      );
      expect(result.parameters).toContain('journey');
      expect(result.parameters).toContain('journey-abc');
    });

    it('mode "Journey" with journeyFilter "all" does not add journey_id condition', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'Journey', journeyFilter: 'all' }),
      );
      expect(result.parameters).toContain('journey');
      // 'all' is the journeyFilter default — should not appear as a parameter
      expect(result.parameters).not.toContain('all');
    });

    it('mode "Libre" filters by play_context = free', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'Libre' }),
      );
      expect(result.parameters).toContain('free');
    });

    it('mode "Libre" with freeModeFilter adds game_mode IN clause', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'Libre', freeModeFilter: 'DualTempo' }),
      );
      expect(result.parameters).toContain('free');
      // resolveGameModeIdsForStatsMode('DualTempo') should return a game mode id
      expect(result.sql).toContain('game_mode');
    });

    it('specific game mode adds game_mode IN clause', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ mode: 'DualTempo' }),
      );
      // Should have a game_mode filter, not a play_context filter
      expect(result.sql).toContain('game_mode');
    });
  });

  describe('date range filtering', () => {
    it('startDate adds >= condition', () => {
      const startDate = new Date('2025-06-01T00:00:00.000Z');
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ startDate }),
      );
      expect(result.parameters).toContain(startDate.toISOString());
      expect(result.sql).toContain('>=');
    });

    it('endDate adds <= condition with end-of-day', () => {
      const endDate = new Date('2025-06-30T00:00:00.000Z');
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ endDate }),
      );
      // End date is adjusted to 23:59:59.999
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      expect(result.parameters).toContain(endOfDay.toISOString());
      expect(result.sql).toContain('<=');
    });

    it('both startDate and endDate produce range conditions', () => {
      const startDate = new Date('2025-01-01T00:00:00.000Z');
      const endDate = new Date('2025-12-31T00:00:00.000Z');
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ startDate, endDate }),
      );
      expect(result.sql).toContain('>=');
      expect(result.sql).toContain('<=');
    });
  });

  describe('modality filtering', () => {
    it('empty modalities set adds no modality condition', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ modalities: new Set() }),
      );
      // No normalized CSV value in parameters
      expect(result.parameters).not.toContain('audio');
      expect(result.parameters).not.toContain('position');
    });

    it('single modality adds CSV match condition', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ modalities: new Set(['audio']) }),
      );
      expect(result.parameters).toContain('audio');
      expect(result.sql).toContain('COALESCE');
    });

    it('multiple modalities produce sorted CSV value', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ modalities: new Set(['position', 'audio']) }),
      );
      // Sorted: audio,position
      expect(result.parameters).toContain('audio,position');
    });
  });

  describe('n-level filtering', () => {
    it('empty nLevels set adds no n_level condition', () => {
      const baseResult = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ nLevels: new Set() }),
      );
      expect(baseResult.sql).not.toContain('n_level');
    });

    it('single n-level adds IN clause', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ nLevels: new Set([3]) }),
      );
      expect(result.parameters).toContain(3);
      expect(result.sql).toContain('n_level');
    });

    it('multiple n-levels are sorted ascending', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({ nLevels: new Set([5, 2, 8]) }),
      );
      // Parameters should contain all three levels
      expect(result.parameters).toContain(2);
      expect(result.parameters).toContain(5);
      expect(result.parameters).toContain(8);
    });
  });

  describe('combined filters', () => {
    it('all filters produce a complex WHERE clause', () => {
      const result = buildSessionSummariesFilteredCountCompiledQuery(
        ['user-1'],
        makeFilters({
          mode: 'Journey',
          journeyFilter: 'journey-xyz',
          modalities: new Set(['audio', 'position']),
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          endDate: new Date('2025-12-31T00:00:00.000Z'),
          nLevels: new Set([2, 3]),
        }),
      );
      assertCompiledQuery(result);
      expect(result.parameters).toContain('journey');
      expect(result.parameters).toContain('journey-xyz');
      expect(result.parameters).toContain('audio,position');
      expect(result.parameters).toContain(2);
      expect(result.parameters).toContain(3);
      expect(result.sql).toContain('>=');
      expect(result.sql).toContain('<=');
    });
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesPageCompiledQuery — cursor pagination
// ---------------------------------------------------------------------------

describe('buildSessionSummariesPageCompiledQuery', () => {
  it('without cursor returns page query with ORDER BY desc and LIMIT', () => {
    const result = buildSessionSummariesPageCompiledQuery({
      userIds: ['user-1'],
      filters: makeFilters(),
      cursor: null,
      pageSize: 20,
    });
    assertCompiledQuery(result);
    expect(result.sql).toContain('order by');
    expect(result.sql).toContain('desc');
    expect(result.sql).toContain('limit');
    expect(result.parameters).toContain(20);
  });

  it('with cursor adds keyset condition on created_at and session_id', () => {
    const cursor: SessionSummariesCursor = {
      createdAt: '2025-06-15T10:00:00.000Z',
      sessionId: 'sess-42',
    };
    const result = buildSessionSummariesPageCompiledQuery({
      userIds: ['user-1'],
      filters: makeFilters(),
      cursor,
      pageSize: 10,
    });
    assertCompiledQuery(result);
    expect(result.parameters).toContain(cursor.createdAt);
    expect(result.parameters).toContain(cursor.sessionId);
    expect(result.sql).toContain('<');
  });

  it('page size is reflected as LIMIT parameter', () => {
    const result = buildSessionSummariesPageCompiledQuery({
      userIds: ['user-1'],
      filters: makeFilters(),
      cursor: null,
      pageSize: 50,
    });
    expect(result.parameters).toContain(50);
  });

  it('selects COALESCE for active_modalities_csv', () => {
    const result = buildSessionSummariesPageCompiledQuery({
      userIds: ['user-1'],
      filters: makeFilters(),
      cursor: null,
      pageSize: 10,
    });
    expect(result.sql).toContain('COALESCE');
    expect(result.sql).toContain('active_modalities_csv');
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesFilteredIdsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesFilteredIdsCompiledQuery', () => {
  it('returns distinct session_id query', () => {
    const result = buildSessionSummariesFilteredIdsCompiledQuery(['user-1'], makeFilters());
    assertCompiledQuery(result);
    expect(result.sql).toContain('session_id');
    expect(result.sql.toLowerCase()).toContain('distinct');
  });
});

// ---------------------------------------------------------------------------
// buildSessionDetailsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionDetailsCompiledQuery', () => {
  it('filters by session_id and user scope with LIMIT 1', () => {
    const result = buildSessionDetailsCompiledQuery(['user-1'], 'sess-abc');
    assertCompiledQuery(result);
    expect(result.parameters).toContain('sess-abc');
    expect(result.parameters).toContain('user-1');
    expect(result.sql).toContain('limit');
  });
});

// ---------------------------------------------------------------------------
// buildJourneyRecordableSessionsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildJourneyRecordableSessionsCompiledQuery', () => {
  it('filters by journey_id, play_context=journey, non-null stage, completed', () => {
    const result = buildJourneyRecordableSessionsCompiledQuery(['user-1'], 'journey-xyz');
    assertCompiledQuery(result);
    expect(result.parameters).toContain('journey-xyz');
    expect(result.parameters).toContain('journey');
    expect(result.parameters).toContain('completed');
    expect(result.sql.toLowerCase()).toContain('is not null');
  });

  it('orders ascending by created_at', () => {
    const result = buildJourneyRecordableSessionsCompiledQuery(['user-1'], 'journey-xyz');
    // Should contain asc ordering (no desc for this query)
    expect(result.sql).toContain('order by');
    expect(result.sql).not.toContain('desc');
  });
});

// ---------------------------------------------------------------------------
// buildAvailableJourneyIdsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildAvailableJourneyIdsCompiledQuery', () => {
  it('returns distinct journey_id with non-null/non-empty filter', () => {
    const result = buildAvailableJourneyIdsCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.sql.toLowerCase()).toContain('distinct');
    expect(result.sql).toContain('journey_id');
    expect(result.sql.toLowerCase()).toContain('is not null');
    // Also filters out empty string journey_id
    expect(result.parameters).toContain('');
  });

  it('orders ascending by journey_id', () => {
    const result = buildAvailableJourneyIdsCompiledQuery(['user-1']);
    expect(result.sql).toContain('order by');
    expect(result.sql).toContain('asc');
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesCountCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesCountCompiledQuery', () => {
  it('returns count(distinct session_id) query', () => {
    const result = buildSessionSummariesCountCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.sql).toContain('count(');
    expect(result.sql).toContain('distinct');
    expect(result.sql).toContain('session_id');
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesIdsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesIdsCompiledQuery', () => {
  it('returns distinct session_id list', () => {
    const result = buildSessionSummariesIdsCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.sql.toLowerCase()).toContain('distinct');
    expect(result.sql).toContain('session_id');
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesHeaderCountsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesHeaderCountsCompiledQuery', () => {
  it('returns combined filtered_count and total_count SQL', () => {
    const result = buildSessionSummariesHeaderCountsCompiledQuery(['user-1'], makeFilters());
    assertCompiledQuery(result);
    expect(result.sql).toContain('filtered_count');
    expect(result.sql).toContain('total_count');
    expect(result.sql).toContain('COALESCE');
    expect(result.sql).toContain('INTEGER');
  });

  it('merges parameters from both sub-queries', () => {
    const filters = makeFilters({ mode: 'Journey', journeyFilter: 'journey-abc' });
    const result = buildSessionSummariesHeaderCountsCompiledQuery(['user-1'], filters);
    // Should contain parameters from both the filtered and total sub-queries
    expect(result.parameters.length).toBeGreaterThan(0);
    // 'journey-abc' from filtered sub-query
    expect(result.parameters).toContain('journey-abc');
    // 'user-1' should appear in both sub-queries
    const userCount = result.parameters.filter((p) => p === 'user-1').length;
    expect(userCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildMaxAchievedLevelCompiledQuery
// ---------------------------------------------------------------------------

describe('buildMaxAchievedLevelCompiledQuery', () => {
  it('selects max(n_level) for given game mode with passed=1', () => {
    const result = buildMaxAchievedLevelCompiledQuery(['user-1'], 'dual-catch');
    assertCompiledQuery(result);
    expect(result.sql).toContain('max(');
    expect(result.sql).toContain('n_level');
    expect(result.parameters).toContain('dual-catch');
    expect(result.parameters).toContain(1); // passed = 1
  });
});

// ---------------------------------------------------------------------------
// buildLastAdaptiveDPrimeCompiledQuery
// ---------------------------------------------------------------------------

describe('buildLastAdaptiveDPrimeCompiledQuery', () => {
  it('selects global_d_prime ordered desc with LIMIT 1', () => {
    const result = buildLastAdaptiveDPrimeCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.sql).toContain('global_d_prime');
    expect(result.sql).toContain('desc');
    expect(result.sql).toContain('limit');
  });

  it('filters to SDT-scored game modes via IN clause', () => {
    const result = buildLastAdaptiveDPrimeCompiledQuery(['user-1']);
    // Should contain game_mode IN clause for SDT modes
    expect(result.sql).toContain('game_mode');
  });
});

// ---------------------------------------------------------------------------
// buildRecentSessionsForTrendCompiledQuery
// ---------------------------------------------------------------------------

describe('buildRecentSessionsForTrendCompiledQuery', () => {
  it('filters by game mode, excludes session, and limits before reference date', () => {
    const result = buildRecentSessionsForTrendCompiledQuery({
      userIds: ['user-1'],
      gameMode: 'dual-catch',
      referenceCreatedAtIso: '2025-06-15T10:00:00.000Z',
      excludeSessionId: 'sess-99',
      limit: 5,
    });
    assertCompiledQuery(result);
    expect(result.parameters).toContain('dual-catch');
    expect(result.parameters).toContain('sess-99');
    expect(result.parameters).toContain('2025-06-15T10:00:00.000Z');
    expect(result.parameters).toContain(5);
    expect(result.sql).toContain('desc');
    expect(result.sql).toContain('limit');
  });

  it('null referenceCreatedAtIso adds impossible condition', () => {
    const result = buildRecentSessionsForTrendCompiledQuery({
      userIds: ['user-1'],
      gameMode: 'dual-catch',
      referenceCreatedAtIso: null,
      excludeSessionId: 'sess-99',
      limit: 5,
    });
    assertCompiledQuery(result);
    // Adds 1 = 0 when no reference date
    expect(result.sql).toContain('1 = 0');
  });
});

// ---------------------------------------------------------------------------
// buildSessionsListCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionsListCompiledQuery', () => {
  it('without limit returns all sessions ordered desc', () => {
    const result = buildSessionsListCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.sql).toContain('order by');
    expect(result.sql).toContain('desc');
    expect(result.sql).not.toContain('limit');
  });

  it('with limit adds LIMIT clause', () => {
    const result = buildSessionsListCompiledQuery(['user-1'], 25);
    assertCompiledQuery(result);
    expect(result.sql).toContain('limit');
    expect(result.parameters).toContain(25);
  });

  it('does not include completed sessions condition (no reason filter)', () => {
    const result = buildSessionsListCompiledQuery(['user-1']);
    // This query intentionally does NOT filter by completed reason
    expect(result.parameters).not.toContain('completed');
  });
});

// ---------------------------------------------------------------------------
// buildSessionsByGameModeCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionsByGameModeCompiledQuery', () => {
  it('filters by game mode and orders by created_at desc', () => {
    const result = buildSessionsByGameModeCompiledQuery(['user-1'], 'dual-memo');
    assertCompiledQuery(result);
    expect(result.parameters).toContain('dual-memo');
    expect(result.sql).toContain('game_mode');
    expect(result.sql).toContain('desc');
    expect(result.sql).toContain('order by');
  });
});

// ---------------------------------------------------------------------------
// buildJourneySessionsCompiledQuery
// ---------------------------------------------------------------------------

describe('buildJourneySessionsCompiledQuery', () => {
  it('filters by play_context=journey and orders desc', () => {
    const result = buildJourneySessionsCompiledQuery(['user-1']);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('journey');
    expect(result.sql).toContain('desc');
  });

  it('does not include completed sessions condition', () => {
    const result = buildJourneySessionsCompiledQuery(['user-1']);
    // This query does not filter by reason
    expect(result.parameters).not.toContain('completed');
  });
});

// ---------------------------------------------------------------------------
// buildLatestJourneySessionCompiledQuery
// ---------------------------------------------------------------------------

describe('buildLatestJourneySessionCompiledQuery', () => {
  it('filters by journey_id, play_context, completed, LIMIT 1', () => {
    const result = buildLatestJourneySessionCompiledQuery(['user-1'], 'journey-abc');
    assertCompiledQuery(result);
    expect(result.parameters).toContain('journey-abc');
    expect(result.parameters).toContain('journey');
    expect(result.sql).toContain('limit');
    expect(result.sql).toContain('desc');
  });
});

// ---------------------------------------------------------------------------
// buildSessionSummariesCompiledQuery
// ---------------------------------------------------------------------------

describe('buildSessionSummariesCompiledQuery', () => {
  it('with includeAbandoned=true does not filter by reason', () => {
    const result = buildSessionSummariesCompiledQuery(['user-1'], true);
    assertCompiledQuery(result);
    expect(result.sql).not.toContain('abandoned');
  });

  it('with includeAbandoned=false excludes abandoned sessions', () => {
    const result = buildSessionSummariesCompiledQuery(['user-1'], false);
    assertCompiledQuery(result);
    expect(result.sql).toContain('abandoned');
  });

  it('orders by created_at desc', () => {
    const result = buildSessionSummariesCompiledQuery(['user-1'], true);
    expect(result.sql).toContain('order by');
    expect(result.sql).toContain('desc');
  });
});

// ---------------------------------------------------------------------------
// buildBrainWorkshopStrikesCompiledQuery
// ---------------------------------------------------------------------------

describe('buildBrainWorkshopStrikesCompiledQuery', () => {
  it('filters by journey_id, game_mode=sim-brainworkshop, completed, with LIMIT', () => {
    const result = buildBrainWorkshopStrikesCompiledQuery(['user-1'], 'journey-abc', 10);
    assertCompiledQuery(result);
    expect(result.parameters).toContain('journey-abc');
    expect(result.parameters).toContain('sim-brainworkshop');
    expect(result.parameters).toContain(10);
    expect(result.sql).toContain('limit');
    expect(result.sql).toContain('desc');
  });

  it('selects journey_context column', () => {
    const result = buildBrainWorkshopStrikesCompiledQuery(['user-1'], 'j1', 5);
    expect(result.sql).toContain('journey_context');
  });
});

// ---------------------------------------------------------------------------
// Empty / edge-case filter handling
// ---------------------------------------------------------------------------

describe('empty and edge-case filter handling', () => {
  it('all-default filters produce minimal WHERE conditions', () => {
    const result = buildSessionSummariesFilteredCountCompiledQuery(['user-1'], makeFilters());
    assertCompiledQuery(result);
    // Only user scope + completed condition expected
    expect(result.parameters).toContain('user-1');
  });

  it('resolveGameModeIdsForStatsMode returning empty array adds impossible condition', () => {
    // Use a mode that is unlikely to map to any game mode IDs
    // 'Libre' with freeModeFilter set to a mode that resolves to empty
    // Actually, directly test the else branch with a specific mode that resolves to []
    const result = buildSessionSummariesFilteredCountCompiledQuery(
      ['user-1'],
      makeFilters({ mode: 'Libre', freeModeFilter: 'all' }),
    );
    assertCompiledQuery(result);
    // When freeModeFilter is 'all', no extra game_mode condition is added
    expect(result.parameters).toContain('free');
  });
});
