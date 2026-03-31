import { describe, expect, it } from 'bun:test';
import {
  projectPlayerProfileFromRows,
  type ProfileSummaryRow,
  type ProfileLatestSessionRow,
  type ProfileProgressionRow,
  type ProfileModalitySourceRow,
  type ProfileStreakRow,
} from './profile-from-rows';
import { SDT_DPRIME_PASS } from '../specs/thresholds';

// =============================================================================
// Helpers
// =============================================================================

function makeSummaryRow(overrides: Partial<ProfileSummaryRow> = {}): ProfileSummaryRow {
  return {
    total_sessions: 10,
    total_duration_ms: 600_000,
    total_trials: 200,
    avg_d_prime: 2.0,
    best_d_prime: 3.5,
    highest_n_level: 4,
    total_focus_lost_ms: 5000,
    avg_focus_lost_per_session: 500,
    ...overrides,
  };
}

function makeLatestRow(overrides: Partial<ProfileLatestSessionRow> = {}): ProfileLatestSessionRow {
  return {
    n_level: 3,
    created_at: '2026-03-10T10:00:00',
    ...overrides,
  };
}

function makeProgressionRow(overrides: Partial<ProfileProgressionRow> = {}): ProfileProgressionRow {
  return {
    week_start: '2026-03-03',
    n_level_max: 3,
    avg_d_prime: 2.1,
    sessions_count: 5,
    ...overrides,
  };
}

function makeModalityRow(
  overrides: Partial<ProfileModalitySourceRow> = {},
): ProfileModalitySourceRow {
  return {
    session_id: 's1',
    by_modality: JSON.stringify({
      position: {
        hits: 10,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 8,
        avgRT: 450,
        dPrime: 0,
      },
      audio: { hits: 8, misses: 3, falseAlarms: 2, correctRejections: 7, avgRT: 500, dPrime: 0 },
    }),
    n_level: 3,
    global_d_prime: 2.0,
    ...overrides,
  };
}

function makeStreakRow(overrides: Partial<ProfileStreakRow> = {}): ProfileStreakRow {
  return {
    current_streak: 5,
    best_streak: 12,
    last_active_date: '2026-03-14',
    ...overrides,
  };
}

const userId = 'user-test-123';

// =============================================================================
// Tests
// =============================================================================

describe('projectPlayerProfileFromRows', () => {
  // ---------------------------------------------------------------------------
  // Empty / zero-session edge cases
  // ---------------------------------------------------------------------------

  describe('empty inputs', () => {
    it('returns empty profile when all rows are empty', () => {
      const profile = projectPlayerProfileFromRows(userId, [], [], [], [], [], []);
      expect(profile.odalisqueId).toBe(userId);
      expect(profile.totalSessions).toBe(0);
      expect(profile.currentNLevel).toBe(1);
      expect(profile.modalities.size).toBe(0);
      expect(profile.strengths).toEqual([]);
      expect(profile.weaknesses).toEqual([]);
      expect(profile.progression).toEqual([]);
    });

    it('returns empty profile when summary has 0 sessions', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow({ total_sessions: 0 })],
        [makeLatestRow()],
        [],
        [makeProgressionRow()],
        [makeModalityRow()],
        [makeStreakRow()],
      );
      expect(profile.totalSessions).toBe(0);
      expect(profile.modalities.size).toBe(0);
    });

    it('returns empty profile when summary row is missing', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [],
        [makeLatestRow()],
        [],
        [makeProgressionRow()],
        [makeModalityRow()],
        [makeStreakRow()],
      );
      expect(profile.totalSessions).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path: full profile projection
  // ---------------------------------------------------------------------------

  describe('happy path', () => {
    it('projects a complete profile from all row types', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [makeProgressionRow()],
        [makeModalityRow()],
        [makeStreakRow()],
      );

      expect(profile.odalisqueId).toBe(userId);
      expect(profile.version).toBe(2);
      expect(profile.totalSessions).toBe(10);
      expect(profile.totalTrials).toBe(200);
      expect(profile.totalDurationMs).toBe(600_000);
      expect(profile.avgDPrime).toBe(2.0);
      expect(profile.bestDPrime).toBe(3.5);
      expect(profile.highestNLevel).toBe(4);
      expect(profile.currentNLevel).toBe(3); // from latest row
    });

    it('uses highest_n_level as fallback for currentNLevel when latest is missing', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow({ highest_n_level: 5 })],
        [], // no latest row
        [],
        [],
        [],
        [],
      );
      expect(profile.currentNLevel).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Streak info
  // ---------------------------------------------------------------------------

  describe('streak info', () => {
    it('projects streak data from streak row', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        [],
        [makeStreakRow({ current_streak: 7, best_streak: 20, last_active_date: '2026-03-15' })],
      );
      expect(profile.currentStreak).toBe(7);
      expect(profile.longestStreak).toBe(20);
      expect(profile.lastSessionDate).toBe('2026-03-15');
    });

    it('defaults streak to 0 when streak row is missing', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        [],
        [],
      );
      expect(profile.currentStreak).toBe(0);
      expect(profile.longestStreak).toBe(0);
      expect(profile.lastSessionDate).toBeNull();
    });

    it('handles null last_active_date', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        [],
        [makeStreakRow({ last_active_date: null })],
      );
      expect(profile.lastSessionDate).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Progression
  // ---------------------------------------------------------------------------

  describe('progression', () => {
    it('maps progression rows to ProgressionPoint[]', () => {
      const rows = [
        makeProgressionRow({
          week_start: '2026-03-03',
          n_level_max: 3,
          avg_d_prime: 2.1,
          sessions_count: 5,
        }),
        makeProgressionRow({
          week_start: '2026-03-10',
          n_level_max: 4,
          avg_d_prime: 2.5,
          sessions_count: 3,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        rows,
        [],
        [],
      );
      expect(profile.progression).toHaveLength(2);
      expect(profile.progression[0]).toEqual({
        date: '2026-03-03',
        nLevel: 3,
        avgDPrime: 2.1,
        sessionsAtLevel: 5,
      });
      expect(profile.progression[1]).toEqual({
        date: '2026-03-10',
        nLevel: 4,
        avgDPrime: 2.5,
        sessionsAtLevel: 3,
      });
    });

    it('filters out rows with null/empty week_start', () => {
      const rows = [
        makeProgressionRow({ week_start: null }),
        makeProgressionRow({ week_start: '' }),
        makeProgressionRow({ week_start: '2026-03-10' }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        rows,
        [],
        [],
      );
      expect(profile.progression).toHaveLength(1);
      expect(profile.progression[0]!.date).toBe('2026-03-10');
    });
  });

  // ---------------------------------------------------------------------------
  // Modality aggregation & d-prime
  // ---------------------------------------------------------------------------

  describe('modality aggregation', () => {
    it('aggregates across multiple session rows per modality', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 10,
              misses: 2,
              falseAlarms: 1,
              correctRejections: 8,
              avgRT: 400,
              dPrime: 0,
            },
          }),
          n_level: 3,
          global_d_prime: 2.0,
        }),
        makeModalityRow({
          session_id: 's2',
          by_modality: JSON.stringify({
            position: {
              hits: 5,
              misses: 1,
              falseAlarms: 0,
              correctRejections: 4,
              avgRT: 350,
              dPrime: 0,
            },
          }),
          n_level: 4,
          global_d_prime: 2.5,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      const posProfile = profile.modalities.get('position');
      expect(posProfile).toBeDefined();
      // Aggregated: hits=15, misses=3, falseAlarms=1, correctRejections=12
      expect(posProfile!.hits).toBe(15);
      expect(posProfile!.misses).toBe(3);
      expect(posProfile!.falseAlarms).toBe(1);
      expect(posProfile!.correctRejections).toBe(12);
      expect(posProfile!.totalTargets).toBe(18); // hits + misses

      // maxNByModality should be max of n_level across sessions
      expect(profile.maxNByModality.get('position')).toBe(4);
    });

    it('computes d-prime from hit rate and false alarm rate', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            audio: {
              hits: 80,
              misses: 20,
              falseAlarms: 10,
              correctRejections: 90,
              avgRT: 500,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 1.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      const audioProfile = profile.modalities.get('audio');
      expect(audioProfile).toBeDefined();
      // hitRate = 80/100 = 0.8, faRate = 10/100 = 0.1
      // d' = probit(0.8) - probit(0.1)
      // Should be > 0 (high hit rate, low FA)
      expect(audioProfile!.dPrime).toBeGreaterThan(1);
      expect(audioProfile!.lureVulnerability).toBeCloseTo(0.1, 2);
    });

    it('clamps extreme hit/fa rates for d-prime calculation', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 100,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 100,
              avgRT: 400,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 3.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      const posProfile = profile.modalities.get('position');
      expect(posProfile).toBeDefined();
      // Perfect performance: hitRate=1 clamped to 0.99, faRate=0 clamped to 0.01
      expect(posProfile!.dPrime).toBeGreaterThan(3);
      expect(Number.isFinite(posProfile!.dPrime)).toBe(true);
    });

    it('handles zero targets and zero noise gracefully', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 0,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 0,
              avgRT: 0,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      const posProfile = profile.modalities.get('position');
      expect(posProfile).toBeDefined();
      // hitRate=0 clamped to 0.01, faRate=0 clamped to 0.01 => d'=0
      expect(posProfile!.dPrime).toBeCloseTo(0, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Reaction time aggregation
  // ---------------------------------------------------------------------------

  describe('reaction time', () => {
    it('computes weighted average RT across modalities', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 10,
              misses: 0,
              falseAlarms: 2,
              correctRejections: 8,
              avgRT: 400,
              dPrime: 0,
            },
            audio: {
              hits: 10,
              misses: 0,
              falseAlarms: 2,
              correctRejections: 8,
              avgRT: 600,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 2.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      // avgReactionTime is the average of per-modality avgRT (not weighted by rtWeight)
      // computeAvgReactionTime uses simple mean of modality avgRTs
      // position weighted RT = 400*(10+2)=4800 / 12 = 400
      // audio weighted RT = 600*(10+2)=7200 / 12 = 600
      // avgReactionTime = (400 + 600) / 2 = 500
      expect(profile.avgReactionTime).toBeCloseTo(500, 0);
    });

    it('returns null avgReactionTime when no RT data', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 10,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 8,
              avgRT: 0,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 2.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      // avgRT=0 means no RT data (rtWeight > 0 check: hits=10, falseAlarms=0, rtWeight=10,
      // but avgRT=0 so the `if (avgRT > 0 && rtWeight > 0)` check fails)
      const posProfile = profile.modalities.get('position');
      expect(posProfile!.avgReactionTime).toBeNull();
      expect(profile.avgReactionTime).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Strength / weakness detection
  // ---------------------------------------------------------------------------

  describe('strength/weakness detection', () => {
    it('detects strengths and weaknesses when gap > 0.5', () => {
      // Create two modalities with different d-primes by using extreme signal/noise
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            // Strong modality: 95% hit rate, 5% FA rate => high d'
            position: {
              hits: 95,
              misses: 5,
              falseAlarms: 5,
              correctRejections: 95,
              avgRT: 400,
              dPrime: 0,
            },
            // Weak modality: 55% hit rate, 40% FA rate => low d'
            audio: {
              hits: 55,
              misses: 45,
              falseAlarms: 40,
              correctRejections: 60,
              avgRT: 600,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 1.5,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );

      // Should detect the one with high d' as strength, low d' as weakness
      // if the gap from mean exceeds 0.5
      const posDP = profile.modalities.get('position')!.dPrime;
      const audioDP = profile.modalities.get('audio')!.dPrime;
      expect(posDP).toBeGreaterThan(audioDP);
      // With a large gap, both should be detected
      expect(profile.strengths.length + profile.weaknesses.length).toBeGreaterThan(0);
    });

    it('returns no strengths/weaknesses with single modality', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 50,
              misses: 10,
              falseAlarms: 5,
              correctRejections: 35,
              avgRT: 400,
              dPrime: 0,
            },
          }),
          n_level: 2,
          global_d_prime: 2.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      expect(profile.strengths).toEqual([]);
      expect(profile.weaknesses).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Mastery counting
  // ---------------------------------------------------------------------------

  describe('mastery counting', () => {
    it('counts sessions with d-prime >= SDT_DPRIME_PASS as mastered', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          session_id: 's1',
          by_modality: JSON.stringify({
            position: {
              hits: 10,
              misses: 2,
              falseAlarms: 1,
              correctRejections: 8,
              avgRT: 400,
              dPrime: 0,
            },
          }),
          n_level: 3,
          global_d_prime: SDT_DPRIME_PASS + 0.1, // mastered
        }),
        makeModalityRow({
          session_id: 's2',
          by_modality: JSON.stringify({
            position: {
              hits: 5,
              misses: 5,
              falseAlarms: 5,
              correctRejections: 5,
              avgRT: 400,
              dPrime: 0,
            },
          }),
          n_level: 3,
          global_d_prime: SDT_DPRIME_PASS - 0.1, // not mastered
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      expect(profile.masteryCountByModality.get('position')).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Focus metrics
  // ---------------------------------------------------------------------------

  describe('focus metrics', () => {
    it('projects focus lost stats from summary row', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow({ total_focus_lost_ms: 12000, avg_focus_lost_per_session: 1200 })],
        [makeLatestRow()],
        [],
        [],
        [],
        [],
      );
      expect(profile.totalFocusLostMs).toBe(12000);
      expect(profile.avgFocusLostPerSession).toBe(1200);
    });
  });

  // ---------------------------------------------------------------------------
  // lastEventTimestamp
  // ---------------------------------------------------------------------------

  describe('lastEventTimestamp', () => {
    it('converts created_at string to timestamp', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow({ created_at: '2026-03-10T10:00:00' })],
        [],
        [],
        [],
        [],
      );
      // toTimestamp appends Z if missing
      expect(profile.lastEventTimestamp).toBe(Date.parse('2026-03-10T10:00:00Z'));
    });

    it('handles created_at already ending with Z', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow({ created_at: '2026-03-10T10:00:00Z' })],
        [],
        [],
        [],
        [],
      );
      expect(profile.lastEventTimestamp).toBe(Date.parse('2026-03-10T10:00:00Z'));
    });

    it('returns null for null created_at', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow({ created_at: null })],
        [],
        [],
        [],
        [],
      );
      expect(profile.lastEventTimestamp).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Malformed / null by_modality JSON
  // ---------------------------------------------------------------------------

  describe('malformed modality data', () => {
    it('handles null by_modality gracefully', () => {
      const rows: ProfileModalitySourceRow[] = [makeModalityRow({ by_modality: null })];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      expect(profile.modalities.size).toBe(0);
    });

    it('handles invalid JSON in by_modality', () => {
      const rows: ProfileModalitySourceRow[] = [makeModalityRow({ by_modality: '{{invalid json' })];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      expect(profile.modalities.size).toBe(0);
    });

    it('handles by_modality that parses to non-object', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({ by_modality: '"just a string"' }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      expect(profile.modalities.size).toBe(0);
    });

    it('handles by_modality with missing fields (uses 0 defaults)', () => {
      const rows: ProfileModalitySourceRow[] = [
        makeModalityRow({
          by_modality: JSON.stringify({
            position: {}, // all fields missing
          }),
          n_level: 2,
          global_d_prime: 1.0,
        }),
      ];
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [],
        [],
        rows,
        [],
      );
      const pos = profile.modalities.get('position');
      expect(pos).toBeDefined();
      expect(pos!.hits).toBe(0);
      expect(pos!.misses).toBe(0);
      expect(pos!.falseAlarms).toBe(0);
      expect(pos!.correctRejections).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // _sessionDayRows is ignored
  // ---------------------------------------------------------------------------

  describe('sessionDayRows parameter', () => {
    it('is accepted but ignored (API symmetry)', () => {
      const profile = projectPlayerProfileFromRows(
        userId,
        [makeSummaryRow()],
        [makeLatestRow()],
        [{ session_day: '2026-03-10' }], // arbitrary data
        [],
        [],
        [],
      );
      expect(profile.totalSessions).toBe(10);
    });
  });
});
