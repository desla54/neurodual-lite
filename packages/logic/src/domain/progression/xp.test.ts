/**
 * Tests for XP & Level System (Train-to-Own)
 *
 * Tests real behavior of:
 * - XP calculation with confidence multiplier, flow bonus, daily cap
 * - Level thresholds (10k, 40k, 120k, 300k for rewards)
 * - Premium rewards system
 *
 * NO MOCKS - These are pure functions with complete fixtures.
 */

import { describe, expect, test } from 'bun:test';
import {
  calculateSessionXP,
  getLevel,
  getXPForNextLevel,
  getXPInCurrentLevel,
  getLevelProgress,
  getUnlockedRewards,
  getNextReward,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  PREMIUM_REWARDS,
  MIN_XP_FLOOR,
  FLOW_BONUS_XP,
  type UnifiedXPContext,
} from './xp';
import type {
  SessionSummary,
  // @ts-expect-error test override
  MemoSessionSummary,
  RunningStats,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../../engine/events';
import type { PlaceSessionSummary, DualPickSessionSummary, TraceSessionSummary } from '../../types';
import type { BadgeDefinition } from './badges';

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
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
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
  posResult: TrialResult = 'correctRejection',
  audResult: TrialResult = 'correctRejection',
  posRT: number | null = null,
  audRT: number | null = null,
  posLure = false,
  audLure = false,
): TrialOutcome => ({
  trialIndex: index,
  byModality: {
    position: { result: posResult, reactionTime: posRT, wasLure: posLure },
    audio: { result: audResult, reactionTime: audRT, wasLure: audLure },
  },
});

const createSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: 'test-session-id',
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

const createBadge = (id: string): BadgeDefinition => ({
  id,
  name: `Badge ${id}`,
  description: 'Test badge',
  category: 'milestone',
  icon: 'star',
  priority: 1, // Performance badge → 100 XP (vs 25 XP for cumulative)
  check: () => true,
});

// =============================================================================
// getLevel Tests
// =============================================================================

describe('getLevel', () => {
  test('should return level 1 for 0 XP', () => {
    expect(getLevel(0)).toBe(1);
  });

  test('should return level 1 for XP below first threshold', () => {
    expect(getLevel(250)).toBe(1);
    expect(getLevel(499)).toBe(1);
  });

  test('should return level 2 at 500 XP', () => {
    expect(getLevel(500)).toBe(2);
  });

  test('should return level 3 at 1200 XP', () => {
    expect(getLevel(1200)).toBe(3);
  });

  test('should return level 5 at 10,000 XP (first premium reward)', () => {
    expect(getLevel(10000)).toBe(5);
  });

  test('should return level 10 at 40,000 XP (second premium reward)', () => {
    expect(getLevel(40000)).toBe(10);
  });

  test('should return level 20 at 120,000 XP (third premium reward)', () => {
    expect(getLevel(120000)).toBe(20);
  });

  test('should return level 30 at 300,000 XP (lifetime access)', () => {
    expect(getLevel(300000)).toBe(30);
  });

  test('should return max level for XP beyond max threshold', () => {
    expect(getLevel(1000000)).toBe(MAX_LEVEL);
  });

  test('should handle negative XP gracefully', () => {
    expect(getLevel(-100)).toBe(1);
  });
});

// =============================================================================
// getXPForNextLevel Tests
// =============================================================================

describe('getXPForNextLevel', () => {
  test('should return XP needed for level 2 from level 1', () => {
    // Level 1 threshold = 0, Level 2 threshold = 500
    expect(getXPForNextLevel(1)).toBe(500);
  });

  test('should return XP needed for level 3 from level 2', () => {
    // Level 2 threshold = 500, Level 3 threshold = 1200
    expect(getXPForNextLevel(2)).toBe(700);
  });

  test('should return 0 at max level', () => {
    expect(getXPForNextLevel(MAX_LEVEL)).toBe(0);
  });

  test('should return correct XP for level 5 (first reward level)', () => {
    // Level 4 threshold = 2500, Level 5 threshold = 10000
    expect(getXPForNextLevel(4)).toBe(7500);
  });
});

// =============================================================================
// getXPInCurrentLevel Tests
// =============================================================================

describe('getXPInCurrentLevel', () => {
  test('should return 0 at exact level threshold', () => {
    expect(getXPInCurrentLevel(500)).toBe(0); // Exact level 2
    expect(getXPInCurrentLevel(1200)).toBe(0); // Exact level 3
  });

  test('should return accumulated XP within level', () => {
    // Level 2 starts at 500, so 700 XP = 200 XP into level 2
    expect(getXPInCurrentLevel(700)).toBe(200);
  });

  test('should work for high XP values', () => {
    // Level 10 starts at 40000
    expect(getXPInCurrentLevel(45000)).toBe(5000);
  });

  test('should return total XP for level 1', () => {
    expect(getXPInCurrentLevel(250)).toBe(250);
  });
});

// =============================================================================
// getLevelProgress Tests
// =============================================================================

describe('getLevelProgress', () => {
  test('should return 0% at level start', () => {
    expect(getLevelProgress(500)).toBe(0); // Start of level 2
    expect(getLevelProgress(1200)).toBe(0); // Start of level 3
  });

  test('should return 50% halfway through level', () => {
    // Level 2: 500-1200 (700 range), halfway = 850 → 50%
    expect(getLevelProgress(850)).toBe(50);
  });

  test('should return 100% at max level', () => {
    const maxXP = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!;
    expect(getLevelProgress(maxXP)).toBe(100);
  });
});

// =============================================================================
// Premium Rewards Tests
// =============================================================================

describe('getUnlockedRewards', () => {
  test('should return empty array at level 1', () => {
    expect(getUnlockedRewards(1)).toEqual([]);
  });

  test('should unlock 7-day pass at level 5', () => {
    const rewards = getUnlockedRewards(5);
    expect(rewards.some((r) => r.id === 'REWARD_7_DAYS_PREMIUM')).toBe(true);
    expect(rewards.length).toBe(1);
  });

  test('should unlock 1-month pass at level 10', () => {
    const rewards = getUnlockedRewards(10);
    expect(rewards.some((r) => r.id === 'REWARD_1_MONTH_PREMIUM')).toBe(true);
    expect(rewards.length).toBe(2);
  });

  test('should unlock 3-months pass at level 20', () => {
    const rewards = getUnlockedRewards(20);
    expect(rewards.some((r) => r.id === 'REWARD_3_MONTHS_PREMIUM')).toBe(true);
    expect(rewards.length).toBe(3);
  });

  test('should unlock lifetime access at level 30', () => {
    const rewards = getUnlockedRewards(30);
    expect(rewards.some((r) => r.id === 'REWARD_LIFETIME_ACCESS')).toBe(true);
    expect(rewards.length).toBe(4);
  });
});

describe('getNextReward', () => {
  test('should return 7-day pass for level 1', () => {
    const next = getNextReward(1);
    expect(next?.id).toBe('REWARD_7_DAYS_PREMIUM');
    expect(next?.requiredLevel).toBe(5);
  });

  test('should return 1-month pass for level 5', () => {
    const next = getNextReward(5);
    expect(next?.id).toBe('REWARD_1_MONTH_PREMIUM');
    expect(next?.requiredLevel).toBe(10);
  });

  test('should return 3-months pass for level 10', () => {
    const next = getNextReward(10);
    expect(next?.id).toBe('REWARD_3_MONTHS_PREMIUM');
    expect(next?.requiredLevel).toBe(20);
  });

  test('should return lifetime access for level 20', () => {
    const next = getNextReward(20);
    expect(next?.id).toBe('REWARD_LIFETIME_ACCESS');
    expect(next?.requiredLevel).toBe(30);
  });

  test('should return undefined when all rewards unlocked', () => {
    const next = getNextReward(30);
    expect(next).toBeUndefined();
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('LEVEL_THRESHOLDS', () => {
  test('should have 30 levels', () => {
    expect(LEVEL_THRESHOLDS.length).toBe(30);
  });

  test('should start at 0', () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });

  test('should be monotonically increasing', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      expect(LEVEL_THRESHOLDS[i]!).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1]!);
    }
  });

  test('should have level 5 at 10,000 XP', () => {
    expect(LEVEL_THRESHOLDS[4]).toBe(10000);
  });

  test('should have level 10 at 40,000 XP', () => {
    expect(LEVEL_THRESHOLDS[9]).toBe(40000);
  });

  test('should have level 20 at 120,000 XP', () => {
    expect(LEVEL_THRESHOLDS[19]).toBe(120000);
  });

  test('should have level 30 at 300,000 XP', () => {
    expect(LEVEL_THRESHOLDS[29]).toBe(300000);
  });
});

describe('PREMIUM_REWARDS', () => {
  test('should have 4 reward tiers', () => {
    expect(PREMIUM_REWARDS.length).toBe(4);
  });

  test('should have correct duration for each reward', () => {
    expect(PREMIUM_REWARDS.find((r) => r.id === 'REWARD_7_DAYS_PREMIUM')?.durationDays).toBe(7);
    expect(PREMIUM_REWARDS.find((r) => r.id === 'REWARD_1_MONTH_PREMIUM')?.durationDays).toBe(30);
    expect(PREMIUM_REWARDS.find((r) => r.id === 'REWARD_3_MONTHS_PREMIUM')?.durationDays).toBe(90);
    expect(PREMIUM_REWARDS.find((r) => r.id === 'REWARD_LIFETIME_ACCESS')?.durationDays).toBe(null);
  });
});

describe('MAX_LEVEL', () => {
  test('should equal LEVEL_THRESHOLDS length', () => {
    expect(MAX_LEVEL).toBe(LEVEL_THRESHOLDS.length);
  });
});

// =============================================================================
// calculateSessionXP Tests - Unified XP Engine
// =============================================================================

describe('calculateSessionXP', () => {
  // --- Fixtures for all session types ---

  const createPlaceSessionSummary = (
    overrides: Partial<PlaceSessionSummary> = {},
  ): PlaceSessionSummary => ({
    sessionId: 'place-session',
    nLevel: 2,
    totalTrials: 10,
    finalStats: {
      turnsCompleted: 10,
      totalDrops: 20,
      correctDrops: 16,
      errorCount: 4,
      accuracy: 0.8,
    },
    durationMs: 30000,
    completed: true,
    score: 80,
    ...overrides,
  });

  const createDualPickSessionSummary = (
    overrides: Partial<DualPickSessionSummary> = {},
  ): DualPickSessionSummary => ({
    sessionId: 'duallabel-session',
    nLevel: 2,
    totalTrials: 10,
    finalStats: {
      turnsCompleted: 10,
      totalDrops: 20,
      correctDrops: 18,
      errorCount: 2,
      accuracy: 0.9,
    },
    durationMs: 35000,
    completed: true,
    score: 90,
    ...overrides,
  });

  const createTraceSessionSummary = (
    overrides: Partial<TraceSessionSummary> = {},
  ): TraceSessionSummary => ({
    sessionId: 'trace-session',
    nLevel: 2,
    totalTrials: 20,
    rhythmMode: 'timed',
    finalStats: {
      trialsCompleted: 20,
      warmupTrials: 2,
      correctResponses: 14,
      incorrectResponses: 4,
      timeouts: 2,
      accuracy: 0.7,
    },
    durationMs: 60000,
    completed: true,
    score: 70,
    responses: [],
    ...overrides,
  });

  const createUnifiedContext = (
    session:
      | PlaceSessionSummary
      | DualPickSessionSummary
      | TraceSessionSummary
      | SessionSummary
      | MemoSessionSummary,
    overrides: Partial<Omit<UnifiedXPContext, 'session'>> = {},
  ): UnifiedXPContext => ({
    session,
    newBadges: [],
    streakDays: 0,
    isFirstOfDay: false,
    confidenceScore: null,
    isInFlow: false,
    sessionsToday: 0,
    ...overrides,
  });

  // --- Tests for Tempo (SessionSummary) ---

  describe('Tempo mode (SessionSummary)', () => {
    test('should calculate XP using d-prime', () => {
      const session = createSessionSummary({
        finalStats: createRunningStats({}, {}, 2.0),
      });
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      // Performance = d' * 100 = 200
      expect(xp.performance).toBe(200);
      expect(xp.total).toBeGreaterThan(0);
    });

    test('should return 0 XP for abandoned sessions', () => {
      const session = createPlaceSessionSummary({
        completed: false,
      });

      const xp = calculateSessionXP(createUnifiedContext(session));

      expect(xp.total).toBe(0);
      expect(xp.performance).toBe(0);
      expect(xp.badgeBonus).toBe(0);
    });

    test('should clamp negative d-prime to 0', () => {
      const session = createSessionSummary({
        finalStats: createRunningStats({}, {}, -1.0),
      });
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      expect(xp.performance).toBe(0);
    });

    test('dualnback-classic XP should follow native error-rate score (independent from CR)', () => {
      // Same hits/misses/FA => same Jaeggi error rate, different CR and d-prime
      const highCRSession = createSessionSummary({
        gameMode: 'dualnback-classic',
        finalStats: createRunningStats(
          { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 20 },
          { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 20 },
          2.4,
        ),
      });

      const lowCRSession = createSessionSummary({
        gameMode: 'dualnback-classic',
        finalStats: createRunningStats(
          { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 0 },
          { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 0 },
          0.2,
        ),
      });

      const highCRXP = calculateSessionXP(
        createUnifiedContext(highCRSession, { confidenceScore: 100 }),
      );
      const lowCRXP = calculateSessionXP(
        createUnifiedContext(lowCRSession, { confidenceScore: 100 }),
      );

      // Native Jaeggi score ignores CR, so XP should be identical here
      expect(highCRXP.performance).toBe(lowCRXP.performance);
      expect(highCRXP.accuracy).toBe(lowCRXP.accuracy);
      expect(highCRXP.total).toBe(lowCRXP.total);
    });

    test('dualnback-classic XP should decrease when false alarms increase', () => {
      const lowFASession = createSessionSummary({
        gameMode: 'dualnback-classic',
        finalStats: createRunningStats(
          { hits: 10, misses: 2, falseAlarms: 0, correctRejections: 10 },
          { hits: 10, misses: 2, falseAlarms: 0, correctRejections: 10 },
          2.0,
        ),
      });

      const highFASession = createSessionSummary({
        gameMode: 'dualnback-classic',
        finalStats: createRunningStats(
          { hits: 10, misses: 2, falseAlarms: 8, correctRejections: 10 },
          { hits: 10, misses: 2, falseAlarms: 8, correctRejections: 10 },
          2.0,
        ),
      });

      const lowFAXP = calculateSessionXP(
        createUnifiedContext(lowFASession, { confidenceScore: 100 }),
      );
      const highFAXP = calculateSessionXP(
        createUnifiedContext(highFASession, { confidenceScore: 100 }),
      );

      expect(lowFAXP.performance).toBeGreaterThan(highFAXP.performance);
      expect(lowFAXP.accuracy).toBeGreaterThan(highFAXP.accuracy);
      expect(lowFAXP.total).toBeGreaterThan(highFAXP.total);
    });
  });

  // --- Tests for Memo mode ---

  describe('Memo mode (MemoSessionSummary)', () => {
    const createMemoSession = (accuracy: number): MemoSessionSummary => ({
      sessionId: 'memo-session',
      nLevel: 2,
      totalTrials: 10,
      windowResults: [],
      finalStats: {
        windowsCompleted: 10,
        totalPicks: 20,
        correctPicks: Math.round(20 * accuracy),
        accuracy,
        byModality: {},
        bySlotIndex: {},
        trend: 'stable' as const,
        recentAccuracies: [],
      },
      durationMs: 30000,
      avgRecallTimeMs: 3000,
      completed: true,
    });

    test('should calculate XP using accuracy', () => {
      const session = createMemoSession(0.9);
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      // Performance = accuracy * 200 = 180
      expect(xp.performance).toBe(180);
      expect(xp.accuracy).toBe(180);
    });
  });

  // --- Tests for Place mode ---

  describe('Place mode (PlaceSessionSummary)', () => {
    test('should calculate XP using accuracy', () => {
      const session = createPlaceSessionSummary({
        finalStats: { ...createPlaceSessionSummary().finalStats, accuracy: 0.85 },
      });
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      // Performance = accuracy * 200 = 170
      expect(xp.performance).toBe(170);
    });
  });

  // --- Tests for DualPick mode ---

  describe('DualPick mode (DualPickSessionSummary)', () => {
    test('should calculate XP using accuracy', () => {
      const session = createDualPickSessionSummary();
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      // Performance = 0.9 * 200 = 180
      expect(xp.performance).toBe(180);
    });
  });

  // --- Tests for Trace mode ---

  describe('Trace mode (TraceSessionSummary)', () => {
    test('should calculate XP using accuracy', () => {
      const session = createTraceSessionSummary();
      const ctx = createUnifiedContext(session);

      const xp = calculateSessionXP(ctx);

      // Performance = 0.7 * 200 = 140
      expect(xp.performance).toBe(140);
    });
  });

  // --- Core Rules (Train-to-Own) ---

  describe('Core Rules (Train-to-Own)', () => {
    test('should award 0 XP when the player did not play (no responses/inputs)', () => {
      const unplayedFlowSession = createPlaceSessionSummary({
        nLevel: 3,
        finalStats: {
          turnsCompleted: 0,
          totalDrops: 0,
          correctDrops: 0,
          errorCount: 0,
          accuracy: 0,
        },
      });

      const unplayedTempoSession = createSessionSummary({
        nLevel: 3,
        totalTrials: 0,
        outcomes: [],
        finalStats: {
          trialsCompleted: 0,
          globalDPrime: 0,
          byModality: {
            position: {
              hits: 0,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 0,
              avgRT: null,
              dPrime: 0,
            },
            audio: {
              hits: 0,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 0,
              avgRT: null,
              dPrime: 0,
            },
          },
        },
      });

      expect(calculateSessionXP(createUnifiedContext(unplayedFlowSession)).total).toBe(0);
      expect(calculateSessionXP(createUnifiedContext(unplayedTempoSession)).total).toBe(0);
    });

    test('should apply confidence multiplier', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, { confidenceScore: 50 });

      const xp = calculateSessionXP(ctx);

      expect(xp.confidenceMultiplier).toBe(0.5);
      expect(xp.total).toBeLessThan(xp.subtotalBeforeConfidence);
    });

    test('should add flow bonus when isInFlow is true', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, { isInFlow: true });

      const xp = calculateSessionXP(ctx);

      expect(xp.flowBonus).toBe(FLOW_BONUS_XP);
    });

    test('should enforce daily cap (0 XP for session 6+)', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, { sessionsToday: 5 });

      const xp = calculateSessionXP(ctx);

      expect(xp.dailyCapReached).toBe(true);
      expect(xp.total).toBe(0);
    });

    test('should enforce presence floor (minimum 50 XP)', () => {
      const session = createPlaceSessionSummary({
        nLevel: 1,
        finalStats: { ...createPlaceSessionSummary().finalStats, accuracy: 0.1 },
      });
      const ctx = createUnifiedContext(session, { confidenceScore: 1 });

      const xp = calculateSessionXP(ctx);

      expect(xp.total).toBeGreaterThanOrEqual(MIN_XP_FLOOR);
    });

    test('should add streak bonus for streak >= 2', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, { streakDays: 3 });

      const xp = calculateSessionXP(ctx);

      expect(xp.streakBonus).toBeGreaterThan(0);
    });

    test('should add daily bonus for first session', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, { isFirstOfDay: true });

      const xp = calculateSessionXP(ctx);

      expect(xp.dailyBonus).toBe(25);
    });

    test('should add badge bonus', () => {
      const session = createPlaceSessionSummary();
      const ctx = createUnifiedContext(session, {
        newBadges: [createBadge('test1'), createBadge('test2')],
      });

      const xp = calculateSessionXP(ctx);

      expect(xp.badgeBonus).toBe(200);
    });
  });

  // --- Equivalence across modes ---

  describe('Equivalence across modes', () => {
    test('should give similar XP for similar accuracy across modes', () => {
      const accuracy = 0.8;

      // Flow at 80%
      const placeSession = createPlaceSessionSummary({
        finalStats: { ...createPlaceSessionSummary().finalStats, accuracy },
      });

      // DualPick at 80%
      const dualPickSession = createDualPickSessionSummary({
        finalStats: { ...createDualPickSessionSummary().finalStats, accuracy },
      });

      // Trace at 80%
      const traceSession = createTraceSessionSummary({
        finalStats: { ...createTraceSessionSummary().finalStats, accuracy },
      });

      const flowXP = calculateSessionXP(createUnifiedContext(placeSession));
      const dualPickXP = calculateSessionXP(createUnifiedContext(dualPickSession));
      const traceXP = calculateSessionXP(createUnifiedContext(traceSession));

      // Same accuracy = same performance XP
      expect(flowXP.performance).toBe(dualPickXP.performance);
      expect(flowXP.performance).toBe(traceXP.performance);
      expect(flowXP.accuracy).toBe(dualPickXP.accuracy);

      // Same base (all nLevel 2)
      expect(flowXP.base).toBe(dualPickXP.base);
      expect(flowXP.base).toBe(traceXP.base);
    });

    test('Tempo d-prime 1.5 should give similar XP to accuracy 75%', () => {
      // Tempo with d' 1.5
      const tempoSession = createSessionSummary({
        finalStats: createRunningStats({}, {}, 1.5),
      });

      // Flow with 75% accuracy
      const placeSession = createPlaceSessionSummary({
        finalStats: { ...createPlaceSessionSummary().finalStats, accuracy: 0.75 },
      });

      const tempoXP = calculateSessionXP(createUnifiedContext(tempoSession));
      const flowXP = calculateSessionXP(createUnifiedContext(placeSession));

      // d' 1.5 = 150 performance, 75% = 150 performance
      expect(tempoXP.performance).toBe(150);
      expect(flowXP.performance).toBe(150);
    });
  });
});
