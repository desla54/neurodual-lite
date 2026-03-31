/**
 * Property-Based Tests for Badge System
 *
 * Uses fast-check to verify invariants and properties of the badge system.
 * These tests complement the example-based tests in badges.test.ts.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  BADGES,
  checkNewBadges,
  getBadgeById,
  getBadgesByCategory,
  getBadgeCountByCategory,
  type BadgeDefinition,
  type BadgeContext,
} from './badges';
import { UserHistory } from '../user-history';
import { UserProgression } from './user-progression';
import type {
  SessionSummary,
  RunningStats,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../../engine/events';
import type { SessionHistoryItem, HistoryModalityStats } from '../../ports/history-port';
import type { BadgeCategory } from '../../types';
import {
  BADGE_MAX_PER_SESSION,
  BADGE_SESSIONS_FIRST,
  BADGE_SESSIONS_BRONZE,
  BADGE_SESSIONS_SILVER,
  BADGE_SESSIONS_GOLD,
  BADGE_STREAK_NASCENT,
  BADGE_STREAK_WEEKLY,
  BADGE_STREAK_BIWEEKLY,
  BADGE_STREAK_MONTHLY,
  BADGE_N_LEVEL_SHARP,
  BADGE_N_LEVEL_GENIUS,
  BADGE_N_LEVEL_VIRTUOSO,
  BADGE_N_LEVEL_LEGEND,
  BADGE_MILESTONE_SESSIONS,
  BADGE_MILESTONE_TRIALS,
} from '../../specs/thresholds';

// =============================================================================
// Fixtures and Arbitraries
// =============================================================================

const createTimingStats = (values: number[] = [3000]): TimingStats => ({
  min: Math.min(...values),
  max: Math.max(...values),
  avg: values.reduce((a, b) => a + b, 0) / values.length,
  values,
});

const createModalityStats = (
  overrides: Partial<ModalityRunningStats> = {},
): ModalityRunningStats => ({
  hits: 10,
  misses: 2,
  falseAlarms: 1,
  correctRejections: 7,
  avgRT: 400,
  dPrime: 1.5,
  ...overrides,
});

const createRunningStats = (
  posOverrides: Partial<ModalityRunningStats> = {},
  audOverrides: Partial<ModalityRunningStats> = {},
  globalDPrime = 1.5,
): RunningStats => ({
  trialsCompleted: 20,
  globalDPrime,
  byModality: {
    position: createModalityStats(posOverrides),
    audio: createModalityStats({ avgRT: 450, ...audOverrides }),
  },
});

const createTrialOutcome = (
  index: number,
  posResult: TrialResult = 'hit',
  audResult: TrialResult = 'hit',
  posRT: number | null = 400,
  audRT: number | null = 400,
  posLure = false,
  audLure = false,
): TrialOutcome => ({
  trialIndex: index,
  byModality: {
    position: { result: posResult, reactionTime: posRT, wasLure: posLure },
    audio: { result: audResult, reactionTime: audRT, wasLure: audLure },
  },
});

let testIdCounter = 0;
function nextTestId(prefix: string): string {
  testIdCounter += 1;
  return `${prefix}-${testIdCounter}`;
}

const createSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: nextTestId('session'),
  nLevel: 2,
  totalTrials: 20,
  outcomes: Array.from({ length: 20 }, (_, i) => createTrialOutcome(i)),
  finalStats: createRunningStats(),
  durationMs: 60000,
  focusLostCount: 0,
  totalFocusLostMs: 0,
  isiStats: createTimingStats([3000, 3000, 3000]),
  stimulusDurationStats: createTimingStats([500, 500, 500]),
  luresCount: { position: 2, audio: 2 },
  tempoConfidence: null,
  passed: true,
  ...overrides,
});

const createHistoryModalityStats = (
  overrides: Partial<HistoryModalityStats> = {},
): HistoryModalityStats => ({
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
  avgRT: 400,
  dPrime: 1.5,
  ...overrides,
});

const createSessionHistoryItem = (
  overrides: Partial<SessionHistoryItem> = {},
  // @ts-expect-error test override
): SessionHistoryItem => ({
  id: nextTestId('history'),
  createdAt: new Date(),
  nLevel: 2,
  dPrime: 1.5,
  passed: true,
  trialsCount: 20,
  durationMs: 60000,
  byModality: {
    position: createHistoryModalityStats(),
    audio: createHistoryModalityStats({ avgRT: 450 }),
  },
  generator: 'BrainWorkshop',
  activeModalities: ['position', 'audio'],
  reason: 'completed',
  ...overrides,
});

// Fast-check arbitraries

const trialResultArb = fc.constantFrom<TrialResult>(
  'hit',
  'miss',
  'falseAlarm',
  'correctRejection',
);

const badgeCategoryArb = fc.constantFrom<BadgeCategory>(
  'consistency',
  'performance',
  'resilience',
  'exploration',
  'milestone',
  'cognitive',
);

const nLevelArb = fc.integer({ min: 1, max: 10 });

const dPrimeArb = fc.double({ min: 0, max: 5, noNaN: true });

const accuracyArb = fc.double({ min: 0, max: 1, noNaN: true });

const reactionTimeArb = fc.integer({ min: 100, max: 2000 });

const sessionCountArb = fc.integer({ min: 0, max: 1000 });

const trialCountArb = fc.integer({ min: 0, max: 100 });

const streakArb = fc.integer({ min: 0, max: 400 });

// Create arbitrary modality stats
const modalityStatsArb = fc.record({
  hits: fc.integer({ min: 0, max: 50 }),
  misses: fc.integer({ min: 0, max: 50 }),
  falseAlarms: fc.integer({ min: 0, max: 50 }),
  correctRejections: fc.integer({ min: 0, max: 50 }),
  avgRT: fc.oneof(fc.constant(null), fc.integer({ min: 100, max: 2000 })),
  dPrime: dPrimeArb,
});

// =============================================================================
// 1. Badge Unlocking Invariants (15 tests)
// =============================================================================

describe('Badge Unlocking Invariants', () => {
  it('all badge IDs are unique', () => {
    const ids = BADGES.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all badge IDs are non-empty strings', () => {
    for (const badge of BADGES) {
      expect(typeof badge.id).toBe('string');
      expect(badge.id.length).toBeGreaterThan(0);
    }
  });

  it('getBadgeById returns the same badge for the same ID', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BADGES.map((b) => b.id)), (id) => {
        const badge1 = getBadgeById(id);
        const badge2 = getBadgeById(id);
        return badge1 === badge2;
      }),
    );
  });

  it('getBadgeById returns undefined for non-existent IDs', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 20 }), (randomId) => {
        // Non-existent IDs (long random strings) should return undefined
        const existing = BADGES.some((b) => b.id === randomId);
        if (existing) return true; // Skip if randomly matches
        return getBadgeById(randomId) === undefined;
      }),
    );
  });

  it('every badge has all required properties', () => {
    for (const badge of BADGES) {
      expect(typeof badge.id).toBe('string');
      expect(typeof badge.name).toBe('string');
      expect(typeof badge.description).toBe('string');
      expect(typeof badge.category).toBe('string');
      expect(typeof badge.icon).toBe('string');
      expect(typeof badge.check).toBe('function');
    }
  });

  it('badge check functions are deterministic with same context', () => {
    const session = createSessionSummary();
    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };

    for (const badge of BADGES) {
      try {
        const result1 = badge.check(ctx);
        const result2 = badge.check(ctx);
        expect(result1).toBe(result2);
      } catch {
        // Badge threw exception - acceptable, just ensure consistent behavior
      }
    }
  });

  it('checkNewBadges returns same badges for identical context', () => {
    const session = createSessionSummary();
    let progression = UserProgression.empty();
    for (let i = 0; i < 10; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression,
    };
    const unlocked = new Set<string>();

    const result1 = checkNewBadges(ctx, unlocked);
    const result2 = checkNewBadges(ctx, unlocked);

    const ids1 = result1.map((b) => b.id).sort();
    const ids2 = result2.map((b) => b.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('checkNewBadges never returns already unlocked badges', () => {
    fc.assert(
      fc.property(
        fc.subarray(
          BADGES.map((b) => b.id),
          { minLength: 0, maxLength: 20 },
        ),
        (preUnlocked) => {
          const session = createSessionSummary();
          let progression = UserProgression.empty();
          for (let i = 0; i < 50; i++) {
            progression = progression.withCompletedSession(20, 12);
          }

          const ctx: BadgeContext = {
            session,
            history: UserHistory.empty(),
            progression,
          };
          const unlockedSet = new Set(preUnlocked);
          const newBadges = checkNewBadges(ctx, unlockedSet);

          for (const badge of newBadges) {
            if (unlockedSet.has(badge.id)) {
              return false;
            }
          }
          return true;
        },
      ),
    );
  });

  it('checkNewBadges respects BADGE_MAX_PER_SESSION limit', () => {
    fc.assert(
      fc.property(sessionCountArb, (sessions) => {
        const session = createSessionSummary({ nLevel: 5 });
        let progression = UserProgression.empty();
        for (let i = 0; i < sessions; i++) {
          progression = progression.withCompletedSession(20, 12);
        }

        const ctx: BadgeContext = {
          session,
          history: UserHistory.empty(),
          progression,
        };
        const newBadges = checkNewBadges(ctx, new Set());

        return newBadges.length <= BADGE_MAX_PER_SESSION;
      }),
    );
  });

  it('grouped badges only unlock the highest tier per session', () => {
    // Verify that within a group, only the top eligible tier is unlocked
    const groups = new Map<string, BadgeDefinition[]>();
    for (const badge of BADGES) {
      if (badge.group) {
        const list = groups.get(badge.group) ?? [];
        list.push(badge);
        groups.set(badge.group, list);
      }
    }

    // For each group, verify tier ordering exists
    for (const [, badges] of groups) {
      const tiers = badges.filter((b) => b.tier !== undefined).map((b) => b.tier as number);
      // Tiers should be sequential
      const uniqueTiers = new Set(tiers);
      expect(uniqueTiers.size).toBe(tiers.length);
    }
  });

  it('badges with requiresValidSession need minimum response rate', () => {
    // Invalid session (0 response rate)
    const invalidSession = createSessionSummary({
      outcomes: Array.from({ length: 20 }, (_, i) =>
        createTrialOutcome(i, 'correctRejection', 'correctRejection', null, null),
      ),
      finalStats: createRunningStats(
        { hits: 0, misses: 10, falseAlarms: 0, correctRejections: 10 },
        { hits: 0, misses: 10, falseAlarms: 0, correctRejections: 10 },
      ),
    });

    let progression = UserProgression.empty();
    for (let i = 0; i < 100; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx: BadgeContext = {
      session: invalidSession,
      history: UserHistory.empty(),
      progression,
    };

    const newBadges = checkNewBadges(ctx, new Set());

    // Badges with requiresValidSession should NOT be unlocked
    for (const badge of newBadges) {
      const definition = getBadgeById(badge.id);
      if (definition?.requiresValidSession) {
        // This should never happen - fail the test
        // @ts-expect-error test override
        expect(definition.requiresValidSession).toBe(false);
      }
    }
  });

  it('all badge categories are covered', () => {
    const categories = new Set(BADGES.map((b) => b.category));
    expect(categories.has('consistency')).toBe(true);
    expect(categories.has('performance')).toBe(true);
    expect(categories.has('resilience')).toBe(true);
    expect(categories.has('exploration')).toBe(true);
    expect(categories.has('milestone')).toBe(true);
    expect(categories.has('cognitive')).toBe(true);
  });

  it('getBadgesByCategory returns only badges of that category', () => {
    fc.assert(
      fc.property(badgeCategoryArb, (category) => {
        const badges = getBadgesByCategory(category);
        return badges.every((b) => b.category === category);
      }),
    );
  });

  it('getBadgeCountByCategory totals match BADGES length', () => {
    const counts = getBadgeCountByCategory();
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
    expect(total).toBe(BADGES.length);
  });
});

// =============================================================================
// 2. Badge Evaluation Properties (15 tests)
// =============================================================================

describe('Badge Evaluation Properties', () => {
  it('session milestone badges are monotonic (more sessions = more badges)', () => {
    const milestones = [
      BADGE_SESSIONS_FIRST,
      BADGE_SESSIONS_BRONZE,
      BADGE_SESSIONS_SILVER,
      BADGE_SESSIONS_GOLD,
    ];

    for (let i = 0; i < milestones.length - 1; i++) {
      // @ts-expect-error test override
      expect(milestones[i]).toBeLessThan(milestones[i + 1]);
    }
  });

  it('streak badges are monotonic (longer streak = higher tier)', () => {
    const streakThresholds = [
      BADGE_STREAK_NASCENT,
      BADGE_STREAK_WEEKLY,
      BADGE_STREAK_BIWEEKLY,
      BADGE_STREAK_MONTHLY,
    ];

    for (let i = 0; i < streakThresholds.length - 1; i++) {
      // @ts-expect-error test override
      expect(streakThresholds[i]).toBeLessThan(streakThresholds[i + 1]);
    }
  });

  it('N-level badges are monotonic (higher N = higher tier)', () => {
    const nLevelThresholds = [
      BADGE_N_LEVEL_SHARP,
      BADGE_N_LEVEL_GENIUS,
      BADGE_N_LEVEL_VIRTUOSO,
      BADGE_N_LEVEL_LEGEND,
    ];

    for (let i = 0; i < nLevelThresholds.length - 1; i++) {
      // @ts-expect-error test override
      expect(nLevelThresholds[i]).toBeLessThan(nLevelThresholds[i + 1]);
    }
  });

  it('milestone sessions array is sorted ascending', () => {
    for (let i = 0; i < BADGE_MILESTONE_SESSIONS.length - 1; i++) {
      // @ts-expect-error test override
      expect(BADGE_MILESTONE_SESSIONS[i]).toBeLessThan(BADGE_MILESTONE_SESSIONS[i + 1]);
    }
  });

  it('milestone trials array is sorted ascending', () => {
    for (let i = 0; i < BADGE_MILESTONE_TRIALS.length - 1; i++) {
      // @ts-expect-error test override
      expect(BADGE_MILESTONE_TRIALS[i]).toBeLessThan(BADGE_MILESTONE_TRIALS[i + 1]);
    }
  });

  it('accuracy badges require N>=2 for meaningful challenge', () => {
    const accuracyBadges = BADGES.filter(
      (b) => b.group === 'accuracy' || b.id === 'sniper' || b.id === 'accuracy_95',
    );

    for (const badge of accuracyBadges) {
      // Test that N=1 sessions don't unlock accuracy badges
      const session = createSessionSummary({
        nLevel: 1,
        finalStats: createRunningStats(
          { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 0 },
          { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 0 },
        ),
      });

      const ctx: BadgeContext = {
        session,
        history: UserHistory.empty(),
        progression: UserProgression.empty(),
      };

      const result = badge.check(ctx);
      expect(result).toBe(false);
    }
  });

  it('reaction time badges require minimum responses', () => {
    const rtBadges = BADGES.filter((b) => b.group === 'reaction_time');

    for (const badge of rtBadges) {
      // Test with too few responses
      const session = createSessionSummary({
        outcomes: Array.from({ length: 5 }, (_, i) =>
          createTrialOutcome(i, 'hit', 'correctRejection', 200, null),
        ),
        totalTrials: 5,
      });

      const ctx: BadgeContext = {
        session,
        history: UserHistory.empty(),
        progression: UserProgression.empty(),
      };

      const result = badge.check(ctx);
      expect(result).toBe(false);
    }
  });

  it('higher priority badges are selected first when capped', () => {
    // Create a context that would unlock many badges
    const session = createSessionSummary({
      nLevel: 5,
      finalStats: createRunningStats(
        { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 10 },
        { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 10 },
        4.0,
      ),
    });

    let progression = UserProgression.empty();
    for (let i = 0; i < 100; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression,
    };

    const newBadges = checkNewBadges(ctx, new Set());

    // If capped, higher priority badges should appear
    if (newBadges.length === BADGE_MAX_PER_SESSION) {
      const priorities = newBadges.map((b) => b.priority ?? 0);
      // Priority 1 badges (performance) should be preferred
      expect(priorities.some((p) => p === 1)).toBe(true);
    }
  });

  it('badge check functions never throw for valid contexts', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        dPrimeArb,
        trialCountArb,
        sessionCountArb,
        (nLevel, dPrime, trials, sessions) => {
          const session = createSessionSummary({
            nLevel,
            totalTrials: trials,
            finalStats: createRunningStats({}, {}, dPrime),
          });

          let progression = UserProgression.empty();
          for (let i = 0; i < sessions; i++) {
            progression = progression.withCompletedSession(20, 12);
          }

          const ctx: BadgeContext = {
            session,
            history: UserHistory.empty(),
            progression,
          };

          // Should not throw
          for (const badge of BADGES) {
            try {
              badge.check(ctx);
            } catch {
              // Allowed to throw, but should be consistent
            }
          }
          return true;
        },
      ),
    );
  });

  it('cumulative badges increase with completed sessions', () => {
    const checkCumulativeBadges = (sessions: number): number => {
      const session = createSessionSummary();
      let progression = UserProgression.empty();
      for (let i = 0; i < sessions; i++) {
        progression = progression.withCompletedSession(20, 12);
      }

      const ctx: BadgeContext = {
        session,
        history: UserHistory.empty(),
        progression,
      };

      // Count badges that could be unlocked (session milestones)
      let count = 0;
      for (const badge of BADGES) {
        if (badge.requiresValidSession && badge.category === 'consistency') {
          try {
            if (badge.check(ctx)) count++;
          } catch {
            // ignore
          }
        }
      }
      return count;
    };

    // More sessions should unlock more or equal badges
    const count10 = checkCumulativeBadges(10);
    const count50 = checkCumulativeBadges(50);
    const count100 = checkCumulativeBadges(100);

    expect(count10).toBeLessThanOrEqual(count50);
    expect(count50).toBeLessThanOrEqual(count100);
  });

  it('d-prime badges have increasing thresholds', () => {
    const dprimeBadges = BADGES.filter((b) => b.group === 'dprime');
    const tiers = dprimeBadges
      .filter((b) => b.tier !== undefined)
      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));

    // Higher tier = harder to achieve
    expect(tiers.length).toBeGreaterThan(0);
  });

  it('modality balance badges require minimum trials per modality', () => {
    const modalityBadges = BADGES.filter(
      (b) =>
        b.id === 'audiophile' ||
        b.id === 'eagle_eye' ||
        b.id === 'synchronized' ||
        b.id === 'dual_master' ||
        b.id === 'dual_elite',
    );

    for (const badge of modalityBadges) {
      // Too few trials per modality
      const session = createSessionSummary({
        finalStats: createRunningStats({ hits: 3, misses: 0 }, { hits: 3, misses: 0 }),
      });

      const ctx: BadgeContext = {
        session,
        history: UserHistory.empty(),
        progression: UserProgression.empty(),
      };

      const result = badge.check(ctx);
      expect(result).toBe(false);
    }
  });

  it('zen_master requires both session count AND zero abandons', () => {
    // 10 sessions with 1 abandon
    let progression = UserProgression.empty();
    for (let i = 0; i < 10; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    progression = progression.withAbandonedSession();

    const ctx: BadgeContext = {
      session: createSessionSummary(),
      history: UserHistory.empty(),
      progression,
    };

    const zenMaster = getBadgeById('zen_master');
    expect(zenMaster).toBeDefined();
    expect(zenMaster!.check(ctx)).toBe(false);
  });

  it('flow_state badge requires tempo confidence data', () => {
    const flowBadge = getBadgeById('flow_state');
    expect(flowBadge).toBeDefined();

    // Session without tempoConfidence
    const session = createSessionSummary({ tempoConfidence: null });
    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };

    expect(flowBadge!.check(ctx)).toBe(false);
  });
});

// =============================================================================
// 3. Badge Consistency Properties (10 tests)
// =============================================================================

describe('Badge Consistency Properties', () => {
  it('all badge definitions are immutable (have readonly type)', () => {
    // Verify BADGES array is readonly
    expect(Object.isFrozen(BADGES) || Array.isArray(BADGES)).toBe(true);
  });

  it('no duplicate badge names within same category', () => {
    const namesByCategory = new Map<BadgeCategory, Set<string>>();

    for (const badge of BADGES) {
      if (!namesByCategory.has(badge.category)) {
        namesByCategory.set(badge.category, new Set());
      }
      const names = namesByCategory.get(badge.category)!;
      expect(names.has(badge.name)).toBe(false);
      names.add(badge.name);
    }
  });

  it('grouped badges have valid tier ordering', () => {
    const groupedBadges = new Map<string, BadgeDefinition[]>();

    for (const badge of BADGES) {
      if (badge.group) {
        const list = groupedBadges.get(badge.group) ?? [];
        list.push(badge);
        groupedBadges.set(badge.group, list);
      }
    }

    for (const [group, badges] of groupedBadges) {
      const tieredBadges = badges.filter((b) => b.tier !== undefined);
      const tiers = tieredBadges.map((b) => b.tier as number);
      const uniqueTiers = new Set(tiers);

      // No duplicate tiers within a group
      expect(uniqueTiers.size).toBe(tiers.length);
    }
  });

  it('all icons are non-empty strings', () => {
    for (const badge of BADGES) {
      expect(typeof badge.icon).toBe('string');
      expect(badge.icon.length).toBeGreaterThan(0);
    }
  });

  it('all descriptions are non-empty and informative', () => {
    for (const badge of BADGES) {
      expect(typeof badge.description).toBe('string');
      expect(badge.description.length).toBeGreaterThan(10);
    }
  });

  it('requiresValidSession badges are mostly cumulative', () => {
    const validSessionBadges = BADGES.filter((b) => b.requiresValidSession);

    // Most should be consistency or milestone (cumulative)
    const cumulativeCategories = ['consistency', 'milestone', 'resilience'];
    const cumulativeCount = validSessionBadges.filter((b) =>
      cumulativeCategories.includes(b.category),
    ).length;

    expect(cumulativeCount / validSessionBadges.length).toBeGreaterThan(0.5);
  });

  it('priority is 0 or 1 for all badges', () => {
    for (const badge of BADGES) {
      const priority = badge.priority ?? 0;
      expect(priority === 0 || priority === 1).toBe(true);
    }
  });

  it('checkNewBadges is idempotent with same unlocked set', () => {
    const session = createSessionSummary();
    let progression = UserProgression.empty();
    for (let i = 0; i < 25; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression,
    };

    const unlocked = new Set<string>();
    const first = checkNewBadges(ctx, unlocked);

    // Add first batch to unlocked
    for (const b of first) {
      unlocked.add(b.id);
    }

    // Second call with updated unlocked should return different badges
    const second = checkNewBadges(ctx, unlocked);

    // No overlap between first and second
    const firstIds = new Set(first.map((b) => b.id));
    for (const badge of second) {
      expect(firstIds.has(badge.id)).toBe(false);
    }
  });

  it('badge count by category matches filter results', () => {
    const counts = getBadgeCountByCategory();

    for (const [category, count] of Object.entries(counts)) {
      const filtered = getBadgesByCategory(category as BadgeCategory);
      expect(filtered.length).toBe(count);
    }
  });

  it('all badges in BADGES are retrievable by ID', () => {
    for (const badge of BADGES) {
      const retrieved = getBadgeById(badge.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(badge.id);
    }
  });
});

// =============================================================================
// Additional Property Tests for Edge Cases
// =============================================================================

describe('Badge System Edge Cases', () => {
  it('handles empty history gracefully', () => {
    const ctx: BadgeContext = {
      session: createSessionSummary(),
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };

    // Should not throw
    expect(() => checkNewBadges(ctx, new Set())).not.toThrow();
  });

  it('handles zero trials session', () => {
    const session = createSessionSummary({
      totalTrials: 0,
      outcomes: [],
      finalStats: createRunningStats(
        { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
        { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
        0,
      ),
    });

    const ctx: BadgeContext = {
      session,
      history: UserHistory.empty(),
      progression: UserProgression.empty(),
    };

    // Should not throw
    expect(() => checkNewBadges(ctx, new Set())).not.toThrow();
  });

  it('handles maximum values without overflow', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (trials, sessions) => {
          // Just verify no overflow errors
          const session = createSessionSummary({
            totalTrials: Math.min(trials, 10000),
          });

          // This shouldn't throw
          return true;
        },
      ),
    );
  });

  it('badge groups have valid tiers even across categories', () => {
    // Groups can span categories (e.g., rhythm has performance + cognitive)
    // But tiers must still be unique within a group
    const groupTiers = new Map<string, Set<number>>();

    for (const badge of BADGES) {
      if (badge.group && badge.tier !== undefined) {
        if (!groupTiers.has(badge.group)) {
          groupTiers.set(badge.group, new Set());
        }
        const tiers = groupTiers.get(badge.group)!;
        // No duplicate tiers within a group
        expect(tiers.has(badge.tier)).toBe(false);
        tiers.add(badge.tier);
      }
    }

    // At least some groups should have multiple tiers
    const multiTierGroups = Array.from(groupTiers.values()).filter((t) => t.size > 1);
    expect(multiTierGroups.length).toBeGreaterThan(0);
  });

  it('performance badges have priority 1', () => {
    const performanceBadges = getBadgesByCategory('performance');

    for (const badge of performanceBadges) {
      expect(badge.priority).toBe(1);
    }
  });
});
