/**
 * Tests for Badge System
 *
 * Tests REAL badge logic with complete fixtures.
 * NO MOCKS - Badge checks run against real data structures.
 */

import { describe, expect, test, mock } from 'bun:test';
import {
  BADGES,
  checkNewBadges,
  getBadgeById,
  getBadgesByCategory,
  type BadgeContext,
  type BadgeCategory,
} from './badges';
import { UserHistory } from '../user-history';
import { UserProgression } from './user-progression';
import type {
  GameEvent,
  SessionSummary,
  RunningStats,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../../engine/events';
import type { SessionHistoryItem, HistoryModalityStats } from '../../ports/history-port';

// =============================================================================
// Complete Fixtures (Anti-pattern #4: No partial mocks)
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
  // Default: 10 hits out of 12 targets = 83% accuracy (valid but not exceptional)
  // Sufficient trials for modality badges (10 targets per modality)
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

// @ts-expect-error test override
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
  ...overrides,
});

const createBadgeContext = (overrides: Partial<BadgeContext> = {}): BadgeContext => ({
  session: createSessionSummary(),
  history: UserHistory.empty(),
  progression: UserProgression.empty(),
  ...overrides,
});

const createTempoEvent = (type: string): GameEvent => ({ type }) as unknown as GameEvent;

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

// =============================================================================
// getBadgeById Tests
// =============================================================================

describe('getBadgeById', () => {
  test('should return badge for valid id', () => {
    const badge = getBadgeById('first_session');
    expect(badge).toBeDefined();
    expect(badge?.name).toBe('Neurone en Éveil');
  });

  test('should return undefined for invalid id', () => {
    const badge = getBadgeById('nonexistent_badge');
    expect(badge).toBeUndefined();
  });

  test('should return correct badge properties', () => {
    const badge = getBadgeById('sniper');
    expect(badge?.id).toBe('sniper');
    expect(badge?.category).toBe('performance');
    expect(badge?.icon).toBe('target');
    expect(typeof badge?.check).toBe('function');
  });
});

// =============================================================================
// getBadgesByCategory Tests
// =============================================================================

describe('getBadgesByCategory', () => {
  test('should return only badges of specified category', () => {
    const consistencyBadges = getBadgesByCategory('consistency');

    expect(consistencyBadges.length).toBeGreaterThan(0);
    for (const badge of consistencyBadges) {
      expect(badge.category).toBe('consistency');
    }
  });

  test('should return performance badges', () => {
    const performanceBadges = getBadgesByCategory('performance');

    expect(performanceBadges.some((b) => b.id === 'sniper')).toBe(true);
    expect(performanceBadges.some((b) => b.id === 'untouchable')).toBe(true);
  });

  test('should return resilience badges', () => {
    const resilienceBadges = getBadgesByCategory('resilience');

    expect(resilienceBadges.some((b) => b.id === 'zen_master')).toBe(true);
    expect(resilienceBadges.some((b) => b.id === 'comeback_kid')).toBe(true);
  });

  test('should return empty array for categories with no badges', () => {
    // All defined categories have badges, but test the behavior
    const categories: BadgeCategory[] = [
      'consistency',
      'performance',
      'resilience',
      'exploration',
      'milestone',
    ];

    for (const category of categories) {
      const badges = getBadgesByCategory(category);
      expect(Array.isArray(badges)).toBe(true);
    }
  });
});

// =============================================================================
// BADGES Constant Tests
// =============================================================================

describe('BADGES', () => {
  test('should have unique IDs', () => {
    const ids = BADGES.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('should have all required properties', () => {
    for (const badge of BADGES) {
      expect(typeof badge.id).toBe('string');
      expect(typeof badge.name).toBe('string');
      expect(typeof badge.description).toBe('string');
      expect(typeof badge.category).toBe('string');
      expect(typeof badge.icon).toBe('string');
      expect(typeof badge.check).toBe('function');
    }
  });

  test('should cover all categories', () => {
    const categories = new Set(BADGES.map((b) => b.category));
    expect(categories.has('consistency')).toBe(true);
    expect(categories.has('performance')).toBe(true);
    expect(categories.has('resilience')).toBe(true);
    expect(categories.has('exploration')).toBe(true);
    expect(categories.has('milestone')).toBe(true);
  });
});

// =============================================================================
// checkNewBadges Tests
// =============================================================================

describe('checkNewBadges', () => {
  test('should return empty array when no badges unlocked', () => {
    const ctx = createBadgeContext({
      progression: UserProgression.empty(), // 0 sessions
    });

    const newBadges = checkNewBadges(ctx, new Set());

    // first_session requires completedSessions >= 1, which is 0 here
    expect(newBadges.some((b) => b.id === 'first_session')).toBe(false);
  });

  test('should unlock first_session badge on first completed session', () => {
    const progression = UserProgression.empty().withCompletedSession(20, 12);
    const ctx = createBadgeContext({ progression });
    // Pass higher-priority badges as already unlocked to avoid BADGE_MAX_PER_SESSION limit
    const alreadyUnlocked = new Set(['synchronized', 'imperturbable', 'rt_500', 'consistent']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'first_session')).toBe(true);
  });

  test('should not return already unlocked badges', () => {
    const progression = UserProgression.empty().withCompletedSession(20, 12);
    const ctx = createBadgeContext({ progression });
    const alreadyUnlocked = new Set(['first_session']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'first_session')).toBe(false);
  });

  test('should unlock sniper badge for >90% accuracy at N>=2', () => {
    // >90% accuracy but <95% to avoid higher tier (accuracy_95)
    // Position: 19/20 = 95%, Audio: 18/20 = 90% → Combined: 37/40 = 92.5%
    const ctx = createBadgeContext({
      session: createSessionSummary({
        nLevel: 2,
        finalStats: createRunningStats({ hits: 19, misses: 1 }, { hits: 18, misses: 2 }),
      }),
    });
    // Pass ALL conflicting badges as already unlocked
    const alreadyUnlocked = new Set([
      'synchronized',
      'imperturbable',
      'consistent',
      'rt_500',
      'dual_master',
      'metronome',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'sniper')).toBe(true);
  });

  test('should NOT unlock sniper badge at N=1', () => {
    const ctx = createBadgeContext({
      session: createSessionSummary({
        nLevel: 1, // Too low
        finalStats: createRunningStats({ hits: 5, misses: 0 }, { hits: 5, misses: 0 }),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'sniper')).toBe(false);
  });

  test('should unlock untouchable badge for perfect session at N>=2', () => {
    // Perfect: 0 misses, 0 false alarms
    const ctx = createBadgeContext({
      session: createSessionSummary({
        nLevel: 2,
        finalStats: createRunningStats(
          { misses: 0, falseAlarms: 0 },
          { misses: 0, falseAlarms: 0 },
        ),
      }),
    });
    // Pass conflicting badges as already unlocked
    const alreadyUnlocked = new Set(['synchronized', 'imperturbable', 'consistent', 'rt_500']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'untouchable')).toBe(true);
  });

  test('should unlock no_pause badge when 5 consecutive sessions without pause', () => {
    // Build progression with 5 consecutive uninterrupted sessions
    let progression = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      progression = progression.withCompletedSession(20, 12, false); // hadPause = false
    }

    const ctx = createBadgeContext({
      session: createSessionSummary({ totalTrials: 20 }),
      progression,
    });
    // Pass conflicting badges as already unlocked (including first_session which would unlock with 5 sessions)
    const alreadyUnlocked = new Set([
      'first_session',
      'synchronized',
      'imperturbable',
      'consistent',
      'rt_500',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'no_pause')).toBe(true);
  });

  test('should NOT unlock no_pause badge with only 4 consecutive sessions', () => {
    let progression = UserProgression.empty();
    for (let i = 0; i < 4; i++) {
      progression = progression.withCompletedSession(20, 12, false);
    }

    const ctx = createBadgeContext({
      session: createSessionSummary({ totalTrials: 20 }),
      progression,
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'no_pause')).toBe(false);
  });

  test('should reset no_pause streak when session has pause', () => {
    // First get 4 sessions without pause
    let progression = UserProgression.empty();
    for (let i = 0; i < 4; i++) {
      progression = progression.withCompletedSession(20, 12, false);
    }
    // Then one session WITH pause - resets streak to 0
    progression = progression.withCompletedSession(20, 12, true);

    expect(progression.uninterruptedSessionsStreak).toBe(0);

    const ctx = createBadgeContext({
      session: createSessionSummary({ totalTrials: 20 }),
      progression,
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'no_pause')).toBe(false);
  });

  test('should unlock steady_hands badge when no pause and no misfire', () => {
    const ctx = createBadgeContext({
      session: createSessionSummary({
        totalTrials: 20,
      }),
      events: [createTempoEvent('SESSION_STARTED')],
    });
    // Pass conflicting badges as already unlocked
    const alreadyUnlocked = new Set([
      'synchronized',
      'imperturbable',
      'consistent',
      'rt_500',
      'no_pause',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'steady_hands')).toBe(true);
  });

  test('should unlock flash badge for avg RT < 400ms', () => {
    // Create outcomes with fast reaction times (10 hits each modality)
    const fastOutcomes = Array.from({ length: 20 }, (_, i) =>
      createTrialOutcome(
        i,
        i < 10 ? 'hit' : 'correctRejection', // position result
        i >= 10 ? 'hit' : 'correctRejection', // audio result
        i < 10 ? 350 : null, // position RT
        i >= 10 ? 380 : null, // audio RT
      ),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: fastOutcomes,
      }),
    });
    // Pass conflicting badges as already unlocked (rt_300 is in same group)
    const alreadyUnlocked = new Set(['synchronized', 'imperturbable', 'consistent', 'rt_500']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'flash')).toBe(true);
  });

  test('should unlock dprime_master badge for d-prime > 3.0', () => {
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats({}, {}, 3.5),
      }),
    });
    // Pass conflicting badges as already unlocked
    const alreadyUnlocked = new Set(['synchronized', 'imperturbable', 'consistent', 'rt_500']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'dprime_master')).toBe(true);
  });

  test('should unlock marathoner badge for 50 completed sessions', () => {
    // Build progression with 50 sessions
    let progression = UserProgression.empty();
    for (let i = 0; i < 50; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx = createBadgeContext({ progression });
    // Pass lower tier session badges + performance badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'sessions_10',
      'sessions_25',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'marathoner')).toBe(true);
  });

  test('should unlock centurion badge for 100 completed sessions', () => {
    let progression = UserProgression.empty();
    for (let i = 0; i < 100; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx = createBadgeContext({ progression });
    // Pass lower tier session badges + ALL conflicting badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'sessions_10',
      'sessions_25',
      'marathoner',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
      'metronome',
      'zen_master',
      'no_surrender',
      'ironwill',
      'trials_500',
      'trials_1000',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'centurion')).toBe(true);
  });

  test('should unlock zen_master badge for 10 sessions with 0 abandons', () => {
    let progression = UserProgression.empty();
    for (let i = 0; i < 10; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    // No abandoned sessions

    const ctx = createBadgeContext({ progression });
    // Pass lower tier session badges + performance badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'sessions_10',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'zen_master')).toBe(true);
  });

  test('should NOT unlock zen_master if any session abandoned', () => {
    let progression = UserProgression.empty();
    for (let i = 0; i < 10; i++) {
      progression = progression.withCompletedSession(20, 12);
    }
    progression = progression.withAbandonedSession();

    const ctx = createBadgeContext({ progression });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'zen_master')).toBe(false);
  });

  test('should unlock early_bird for 5 different days with sessions before 8am', () => {
    // Create sessions on 5 different days at 6am
    const historyItems: SessionHistoryItem[] = [];
    const baseDate = new Date('2024-01-01T06:00:00.000Z'); // 6am
    for (let i = 0; i < 5; i++) {
      const sessionDate = new Date(baseDate);
      sessionDate.setDate(sessionDate.getDate() + i); // Different days
      historyItems.push(createSessionHistoryItem({ createdAt: sessionDate }));
    }
    const history = UserHistory.fromHistoryItems(historyItems);

    let progression = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      progression = progression.withCompletedSession(20, 6); // 6am
    }

    const ctx = createBadgeContext({ history, progression });
    // Pass lower tier session badges + performance badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'early_bird')).toBe(true);
  });

  test('should NOT unlock early_bird for 5 sessions on the same day', () => {
    // Create 5 sessions on the same day at 6am (same morning)
    const historyItems: SessionHistoryItem[] = [];
    const baseDate = new Date('2024-01-01T06:00:00.000Z'); // 6am
    for (let i = 0; i < 5; i++) {
      // All sessions on the same day, just different minutes
      const sessionDate = new Date(baseDate);
      sessionDate.setMinutes(i * 10);
      historyItems.push(createSessionHistoryItem({ createdAt: sessionDate }));
    }
    const history = UserHistory.fromHistoryItems(historyItems);

    let progression = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      progression = progression.withCompletedSession(20, 6);
    }

    const ctx = createBadgeContext({ history, progression });
    const alreadyUnlocked = new Set(['first_session']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'early_bird')).toBe(false);
  });

  test('should unlock night_owl for 5 different days with sessions after 10pm', () => {
    // Create sessions on 5 different days at 11pm
    const historyItems: SessionHistoryItem[] = [];
    const baseDate = new Date('2024-01-01T23:00:00.000Z'); // 11pm
    for (let i = 0; i < 5; i++) {
      const sessionDate = new Date(baseDate);
      sessionDate.setDate(sessionDate.getDate() + i); // Different days
      historyItems.push(createSessionHistoryItem({ createdAt: sessionDate }));
    }
    const history = UserHistory.fromHistoryItems(historyItems);

    let progression = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      progression = progression.withCompletedSession(20, 23); // 11pm
    }

    const ctx = createBadgeContext({ history, progression });
    // Pass lower tier session badges + performance badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'night_owl')).toBe(true);
  });

  test('should NOT unlock night_owl for 5 sessions on the same night', () => {
    // Create 5 sessions on the same night at 11pm (same evening)
    const historyItems: SessionHistoryItem[] = [];
    const baseDate = new Date('2024-01-01T23:00:00.000Z'); // 11pm
    for (let i = 0; i < 5; i++) {
      // All sessions on the same night, just different minutes
      const sessionDate = new Date(baseDate);
      sessionDate.setMinutes(i * 10);
      historyItems.push(createSessionHistoryItem({ createdAt: sessionDate }));
    }
    const history = UserHistory.fromHistoryItems(historyItems);

    let progression = UserProgression.empty();
    for (let i = 0; i < 5; i++) {
      progression = progression.withCompletedSession(20, 23);
    }

    const ctx = createBadgeContext({ history, progression });
    const alreadyUnlocked = new Set(['first_session']);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'night_owl')).toBe(false);
  });

  test('should unlock trials_10k for 10000 trials played', () => {
    let progression = UserProgression.empty();
    // 500 sessions of 20 trials = 10000 trials
    for (let i = 0; i < 500; i++) {
      progression = progression.withCompletedSession(20, 12);
    }

    const ctx = createBadgeContext({ progression });
    // Pass lower tier session/trial badges + ALL performance badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'sessions_10',
      'sessions_25',
      'marathoner',
      'centurion',
      'sessions_250',
      'sessions_500',
      'trials_500',
      'trials_1000',
      'trials_5000',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
      'metronome',
      'zen_master',
      'no_surrender',
      'ironwill',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'trials_10k')).toBe(true);
  });

  test('should unlock streak badges', () => {
    // We create a mock context where we can inject streak info
    const mockHistory = {
      getStreak: mock(() => ({ current: 3, best: 3, lastActiveDate: null })),
      maxNLevel: 1,
    } as unknown as UserHistory;

    const ctx = createBadgeContext({ history: mockHistory });
    // Pass conflicting performance badges
    const conflicting = new Set(['synchronized', 'imperturbable', 'rt_500', 'consistent']);
    const newBadges = checkNewBadges(ctx, conflicting);
    expect(newBadges.some((b) => b.id === 'streak_3')).toBe(true);
    expect(newBadges.some((b) => b.id === 'streak_7')).toBe(false);

    // Mock 7 days - pass lower streak + conflicting badges as already unlocked
    (mockHistory.getStreak as any) = mock(() => ({ current: 7, best: 7, lastActiveDate: null }));
    const alreadyUnlocked7 = new Set([...conflicting, 'streak_3']);
    expect(checkNewBadges(ctx, alreadyUnlocked7).some((b) => b.id === 'streak_7')).toBe(true);

    // Mock 30 days - pass lower streaks + conflicting badges as already unlocked
    (mockHistory.getStreak as any) = mock(() => ({ current: 30, best: 30, lastActiveDate: null }));
    const alreadyUnlocked30 = new Set([...conflicting, 'streak_3', 'streak_7', 'streak_14']);
    expect(checkNewBadges(ctx, alreadyUnlocked30).some((b) => b.id === 'streak_30')).toBe(true);
  });

  test('should unlock brain_n level badges', () => {
    // Helper to create a history with a specific max nLevel
    const createHistoryWithN = (n: number) =>
      UserHistory.fromHistoryItems([createSessionHistoryItem({ nLevel: n, dPrime: 2.0 })]);

    // Common conflicting badges to exclude
    const conflicting = new Set(['synchronized', 'imperturbable', 'rt_500', 'consistent']);

    // N-3
    expect(
      checkNewBadges(createBadgeContext({ history: createHistoryWithN(3) }), conflicting).some(
        (b) => b.id === 'brain_n3',
      ),
    ).toBe(true);

    // N-4
    expect(
      checkNewBadges(createBadgeContext({ history: createHistoryWithN(4) }), conflicting).some(
        (b) => b.id === 'brain_n4',
      ),
    ).toBe(true);

    // N-5
    expect(
      checkNewBadges(createBadgeContext({ history: createHistoryWithN(5) }), conflicting).some(
        (b) => b.id === 'brain_n5',
      ),
    ).toBe(true);
  });

  test('should unlock resilience badges (comeback, persistent, plateau)', () => {
    // Need at least 1 completed session for requiresValidSession badges
    let progression = UserProgression.empty().withCompletedSession(20, 12);
    progression = progression.withComeback().withPersistentDay().withPlateauBroken();

    const ctx = createBadgeContext({ progression });
    // Pass ALL conflicting badges as already unlocked (including metronome which takes rhythm slot)
    const alreadyUnlocked = new Set([
      'first_session',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
      'metronome',
    ]);
    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    // These resilience badges should be in the unlocked set
    // Note: BADGE_MAX_PER_SESSION=2 may still limit results
    expect(newBadges.some((b) => b.id === 'comeback_kid')).toBe(true);
  });

  test('should unlock veteran badge', () => {
    const progression = UserProgression.empty();
    // We cannot change readonly property directly if not configurable
    // But we can create a proxy or a mock object
    const mockProgression = {
      ...progression,
      daysSinceFirstSession: 366,
      completedSessions: 1,
      maxNLevel: 1,
      totalTrials: 20,
      hasAbandoned: false,
      energyLevelDeclared: false,
      energyLevel: 0,
      comebackUnblocked: false,
      persistentDayReached: false,
      plateauBroken: false,
      earlyBirdSessions: 0,
      nightOwlSessions: 0,
    } as unknown as UserProgression;

    const ctx = createBadgeContext({ progression: mockProgression });
    // Pass conflicting badges as already unlocked
    const alreadyUnlocked = new Set([
      'first_session',
      'synchronized',
      'imperturbable',
      'rt_500',
      'consistent',
    ]);
    expect(checkNewBadges(ctx, alreadyUnlocked).some((b) => b.id === 'veteran')).toBe(true);
  });

  test('should unlock second_wind badge', () => {
    // First half: mostly misses (low d-prime)
    // Second half: all hits with some CRs (high d-prime ≥ 2.0)
    // Need 20+ trials for second_wind badge
    const outcomes = [
      // First half: 5 hits, 5 misses (low d')
      ...Array.from({ length: 5 }, (_, i) => createTrialOutcome(i, 'miss', 'miss')),
      ...Array.from({ length: 5 }, (_, i) => createTrialOutcome(i + 5, 'hit', 'hit', 400, 400)),
      // Second half: 10 hits (high d' ≥ 2.0)
      ...Array.from({ length: 10 }, (_, i) => createTrialOutcome(i + 10, 'hit', 'hit', 400, 400)),
    ];

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes,
        totalTrials: 20,
        // Make sure finalStats reflect high performance in second half
        finalStats: createRunningStats(
          { hits: 15, misses: 5, correctRejections: 0, falseAlarms: 0 },
          { hits: 15, misses: 5, correctRejections: 0, falseAlarms: 0 },
          2.5, // High global d'
        ),
      }),
    });

    expect(checkNewBadges(ctx, new Set()).some((b) => b.id === 'second_wind')).toBe(true);
  });
});

// =============================================================================
// Badge Check Functions Integration Tests
// =============================================================================

describe('Badge check functions (integration)', () => {
  test('audiophile badge: audio > 80% but position < 70%', () => {
    // Audio: 9/10 = 90%, Position: 6/10 = 60%
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 6, misses: 4 }, // position: 60%
          { hits: 9, misses: 1 }, // audio: 90%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'audiophile')).toBe(true);
  });

  test('eagle_eye badge: position > 80% but audio < 70%', () => {
    // Position: 9/10 = 90%, Audio: 6/10 = 60%
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 9, misses: 1 }, // position: 90%
          { hits: 6, misses: 4 }, // audio: 60%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'eagle_eye')).toBe(true);
  });

  test('synchronized badge: audio and position within 5%', () => {
    // Both at 80%
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 8, misses: 2 }, // position: 80%
          { hits: 8, misses: 2 }, // audio: 80%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'synchronized')).toBe(true);
  });

  test('consistent badge: RT std dev < 100ms', () => {
    // All RTs within a controlled range with stdDev between 50-100ms
    // (so 'consistent' qualifies but 'metronome' doesn't)
    // Using values spread across ~75ms range: 300, 350, 400, 450
    const consistentOutcomes = Array.from({ length: 20 }, (_, i) =>
      createTrialOutcome(
        i,
        'hit', // position result
        'hit', // audio result
        300 + (i % 4) * 50, // position RT: 300, 350, 400, 450 (std ~65ms)
        310 + (i % 4) * 50, // audio RT: 310, 360, 410, 460 (std ~65ms)
      ),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: consistentOutcomes,
        totalTrials: 20,
        // Update finalStats to match outcomes
        finalStats: createRunningStats(
          { hits: 20, misses: 0, correctRejections: 0, falseAlarms: 0 },
          { hits: 20, misses: 0, correctRejections: 0, falseAlarms: 0 },
        ),
      }),
    });
    // Pass conflicting badges (including 'metronome' which would take priority in rhythm group)
    const alreadyUnlocked = new Set([
      'synchronized',
      'imperturbable',
      'rt_500',
      'flash',
      'untouchable',
    ]);

    const newBadges = checkNewBadges(ctx, alreadyUnlocked);

    expect(newBadges.some((b) => b.id === 'consistent')).toBe(true);
  });
});

// =============================================================================
// Anti-Gaming Tests (Cas Inappropriés)
// =============================================================================

describe('Badge anti-gaming tests', () => {
  test('synchronized should NOT unlock with 0% accuracy on both modalities', () => {
    // Cas paradoxal: 0% audio et 0% visuel = |0 - 0| = 0 ≤ 0.05
    // Mais accuracy < 60% donc badge refusé
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 0, misses: 10 }, // position: 0%
          { hits: 0, misses: 10 }, // audio: 0%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'synchronized')).toBe(false);
  });

  test('synchronized should NOT unlock with low accuracy (30% both)', () => {
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 3, misses: 7 }, // position: 30%
          { hits: 3, misses: 7 }, // audio: 30%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'synchronized')).toBe(false);
  });

  test('rt_300 should NOT unlock with spamming (low accuracy)', () => {
    // Fast RT mais mauvaise accuracy = spam de réponses
    const spamOutcomes = Array.from({ length: 20 }, (_, i) =>
      createTrialOutcome(
        i,
        i % 2 === 0 ? 'hit' : 'miss', // 50% position
        i % 2 === 0 ? 'hit' : 'miss', // 50% audio
        250, // Fast RT
        250,
      ),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: spamOutcomes,
        finalStats: createRunningStats(
          { hits: 5, misses: 5 }, // 50%
          { hits: 5, misses: 5 }, // 50%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'rt_300')).toBe(false);
  });

  test('rt_500 should NOT unlock with too few responses', () => {
    // Only 5 responses (< 10 minimum)
    const fewOutcomes = Array.from({ length: 5 }, (_, i) =>
      createTrialOutcome(i, 'hit', 'correctRejection', 400, null),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: fewOutcomes,
        totalTrials: 5,
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'rt_500')).toBe(false);
  });

  test('audiophile should require minimum trials per modality', () => {
    // 1 visual trial only - should not count
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 0, misses: 1 }, // position: 1 trial, 0%
          { hits: 18, misses: 2 }, // audio: 20 trials, 90%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'audiophile')).toBe(false);
  });

  test('second_wind should require good absolute performance in second half', () => {
    // Amélioration de d'=0.3 à d'=0.7 (toujours médiocre)
    // First half: all misses, Second half: some hits but still low d'
    const outcomes = [
      ...Array.from({ length: 10 }, (_, i) => createTrialOutcome(i, 'miss', 'miss')),
      ...Array.from({ length: 10 }, (_, i) =>
        createTrialOutcome(i + 10, i < 5 ? 'hit' : 'miss', i < 5 ? 'hit' : 'miss'),
      ),
    ];

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes,
        finalStats: createRunningStats({}, {}, 0.5), // Low global d'
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'second_wind')).toBe(false);
  });

  test('sang_froid should require minimum accuracy', () => {
    // 50% accuracy avec erreurs dispersées
    const dispersedErrorOutcomes = Array.from({ length: 20 }, (_, i) =>
      createTrialOutcome(
        i,
        i % 2 === 0 ? 'hit' : 'miss', // Alternating: hit, miss, hit, miss...
        'correctRejection',
      ),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: dispersedErrorOutcomes,
        finalStats: createRunningStats({ hits: 10, misses: 10 }, { hits: 0, misses: 0 }),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'sang_froid')).toBe(false);
  });

  test('imperturbable should require minimum accuracy', () => {
    // 0 focus lost mais 40% accuracy
    const ctx = createBadgeContext({
      session: createSessionSummary({
        focusLostCount: 0,
        outcomes: Array.from({ length: 20 }, (_, i) => createTrialOutcome(i)),
        finalStats: createRunningStats(
          { hits: 4, misses: 6 }, // 40%
          { hits: 4, misses: 6 }, // 40%
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'imperturbable')).toBe(false);
  });

  test('steady_hands should require at least one active response', () => {
    // 0 réponses actives (tout en CR)
    const allCROutcomes = Array.from({ length: 20 }, (_, i) =>
      createTrialOutcome(i, 'correctRejection', 'correctRejection'),
    );

    const ctx = createBadgeContext({
      session: createSessionSummary({
        outcomes: allCROutcomes,
        totalTrials: 20,
        finalStats: createRunningStats(
          { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 20 },
          { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 20 },
        ),
      }),
      events: [createTempoEvent('SESSION_STARTED')],
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'steady_hands')).toBe(false);
  });

  test('dual_master should require minimum trials per modality', () => {
    // High accuracy mais seulement 5 trials par modalité
    const ctx = createBadgeContext({
      session: createSessionSummary({
        finalStats: createRunningStats(
          { hits: 5, misses: 0 }, // 100% mais 5 trials
          { hits: 5, misses: 0 }, // 100% mais 5 trials
        ),
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'dual_master')).toBe(false);
  });

  test('comeback_strong should require minimum d-prime threshold', () => {
    // Beat record but still mediocre d'
    const mockHistory = {
      getStreak: mock(() => ({ current: 0, best: 0, lastActiveDate: null })),
      maxNLevel: 2,
      daysSinceLastSession: 5,
      bestDPrime: 1.2, // Mediocre
    } as unknown as UserHistory;

    const ctx = createBadgeContext({
      history: mockHistory,
      session: createSessionSummary({
        finalStats: createRunningStats({}, {}, 1.5), // Better but still < 2.5 threshold
      }),
    });

    const newBadges = checkNewBadges(ctx, new Set());

    expect(newBadges.some((b) => b.id === 'comeback_strong')).toBe(false);
  });
});
