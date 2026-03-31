/**
 * Tests for UserProgression Value Object
 *
 * Tests REAL behavior of immutable value object.
 * NO MOCKS - Complete fixtures for all operations.
 */

import { describe, expect, test } from 'bun:test';
import { UserProgression, type ProgressionRecord } from './user-progression';
import type { UnlockedBadge } from './badges';
import { BADGES } from './badges';

// =============================================================================
// Complete Fixtures (Anti-pattern #4: No partial mocks)
// =============================================================================

const createUnlockedBadge = (badgeId: string, unlockedAt: Date = new Date()): UnlockedBadge => ({
  badgeId,
  unlockedAt,
});

const createProgressionRecord = (
  overrides: Partial<ProgressionRecord> = {},
  // @ts-expect-error test override
): ProgressionRecord => ({
  totalXP: 0,
  completedSessions: 0,
  abandonedSessions: 0,
  totalTrials: 0,
  firstSessionAt: null,
  earlyMorningSessions: 0,
  lateNightSessions: 0,
  comebackCount: 0,
  persistentDays: 0,
  plateausBroken: 0,
  ...overrides,
});

// =============================================================================
// Factory Methods Tests
// =============================================================================

describe('UserProgression.empty()', () => {
  test('should create progression with 0 XP', () => {
    const prog = UserProgression.empty();
    expect(prog.totalXP).toBe(0);
  });

  test('should create progression at level 1', () => {
    const prog = UserProgression.empty();
    expect(prog.level).toBe(1);
  });

  test('should create progression with no badges', () => {
    const prog = UserProgression.empty();
    expect(prog.unlockedBadgeCount).toBe(0);
    expect(prog.unlockedBadges).toEqual([]);
  });

  test('should create progression with 0 sessions', () => {
    const prog = UserProgression.empty();
    expect(prog.completedSessions).toBe(0);
    expect(prog.abandonedSessions).toBe(0);
    expect(prog.totalSessions).toBe(0);
  });

  test('should create progression with null firstSessionAt', () => {
    const prog = UserProgression.empty();
    expect(prog.firstSessionAt).toBeNull();
  });
});

describe('UserProgression.fromRecord()', () => {
  test('should restore XP and sessions from record', () => {
    const record = createProgressionRecord({
      totalXP: 500,
      completedSessions: 10,
      abandonedSessions: 2,
      totalTrials: 200,
    });

    const prog = UserProgression.fromRecord(record, []);

    expect(prog.totalXP).toBe(500);
    expect(prog.completedSessions).toBe(10);
    expect(prog.abandonedSessions).toBe(2);
    expect(prog.totalTrials).toBe(200);
  });

  test('should restore badges', () => {
    const record = createProgressionRecord();
    const badges = [createUnlockedBadge('first_session'), createUnlockedBadge('sniper')];

    const prog = UserProgression.fromRecord(record, badges);

    expect(prog.unlockedBadgeCount).toBe(2);
    expect(prog.hasBadge('first_session')).toBe(true);
    expect(prog.hasBadge('sniper')).toBe(true);
  });

  test('should restore all stats', () => {
    const firstDate = new Date('2024-01-01');
    const record = createProgressionRecord({
      firstSessionAt: firstDate,
      earlyMorningSessions: 3,
      lateNightSessions: 5,
      comebackCount: 2,
      persistentDays: 7,
      plateausBroken: 1,
    });

    const prog = UserProgression.fromRecord(record, []);

    expect(prog.firstSessionAt).toEqual(firstDate);
    expect(prog.earlyMorningSessions).toBe(3);
    expect(prog.lateNightSessions).toBe(5);
    expect(prog.comebackCount).toBe(2);
    expect(prog.persistentDays).toBe(7);
    expect(prog.plateausBroken).toBe(1);
  });
});

// =============================================================================
// XP & Level Accessors Tests
// =============================================================================

describe('XP & Level accessors', () => {
  test('totalXP returns current XP', () => {
    const record = createProgressionRecord({ totalXP: 1234 });
    const prog = UserProgression.fromRecord(record, []);

    expect(prog.totalXP).toBe(1234);
  });

  test('level returns correct level for XP', () => {
    // Level 1: 0-499 XP
    const level1 = UserProgression.fromRecord(createProgressionRecord({ totalXP: 50 }), []);
    expect(level1.level).toBe(1);

    // Level 2: 500-1199 XP
    const level2 = UserProgression.fromRecord(createProgressionRecord({ totalXP: 500 }), []);
    expect(level2.level).toBe(2);

    // Level 5: exactly 10,000 XP (threshold)
    const level5 = UserProgression.fromRecord(createProgressionRecord({ totalXP: 10000 }), []);
    expect(level5.level).toBe(5);
  });

  test('levelProgress returns percentage through current level', () => {
    // Level 2: 500-1200 (range 700), at 850 = 50%
    const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: 850 }), []);
    expect(prog.levelProgress).toBe(50);
  });

  test('formattedXP returns string for small values', () => {
    const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: 500 }), []);
    expect(prog.formattedXP).toBe('500');
  });

  test('formattedXP returns k notation for large values', () => {
    const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: 1500 }), []);
    expect(prog.formattedXP).toBe('1.5k');
  });

  test('formattedXP handles exact thousands', () => {
    const prog = UserProgression.fromRecord(createProgressionRecord({ totalXP: 2000 }), []);
    expect(prog.formattedXP).toBe('2.0k');
  });
});

// =============================================================================
// Session Accessors Tests
// =============================================================================

describe('Session accessors', () => {
  test('totalSessions sums completed and abandoned', () => {
    const record = createProgressionRecord({
      completedSessions: 15,
      abandonedSessions: 3,
    });
    const prog = UserProgression.fromRecord(record, []);

    expect(prog.totalSessions).toBe(18);
  });

  test('completionRate calculates percentage', () => {
    const record = createProgressionRecord({
      completedSessions: 8,
      abandonedSessions: 2,
    });
    const prog = UserProgression.fromRecord(record, []);

    expect(prog.completionRate).toBe(80);
  });

  test('completionRate returns 100 when no sessions', () => {
    const prog = UserProgression.empty();
    expect(prog.completionRate).toBe(100);
  });

  test('completionRate rounds to integer', () => {
    const record = createProgressionRecord({
      completedSessions: 7,
      abandonedSessions: 3,
    });
    const prog = UserProgression.fromRecord(record, []);

    expect(prog.completionRate).toBe(70);
  });
});

// =============================================================================
// Time Accessors Tests
// =============================================================================

describe('Time accessors', () => {
  test('daysSinceFirstSession returns 0 when no sessions', () => {
    const prog = UserProgression.empty();
    expect(prog.daysSinceFirstSession).toBe(0);
  });

  test('daysSinceFirstSession calculates days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const record = createProgressionRecord({ firstSessionAt: threeDaysAgo });
    const prog = UserProgression.fromRecord(record, []);

    expect(prog.daysSinceFirstSession).toBe(3);
  });
});

// =============================================================================
// Badge Accessors Tests
// =============================================================================

describe('Badge accessors', () => {
  test('unlockedBadgeIds returns Set of badge IDs', () => {
    const badges = [createUnlockedBadge('first_session'), createUnlockedBadge('sniper')];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    const ids = prog.unlockedBadgeIds;
    expect(ids.has('first_session')).toBe(true);
    expect(ids.has('sniper')).toBe(true);
    expect(ids.has('unknown')).toBe(false);
  });

  test('totalBadgeCount returns total available badges', () => {
    const prog = UserProgression.empty();
    expect(prog.totalBadgeCount).toBe(BADGES.length);
  });

  test('hasBadge returns true for unlocked badges', () => {
    const badges = [createUnlockedBadge('first_session')];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    expect(prog.hasBadge('first_session')).toBe(true);
    expect(prog.hasBadge('sniper')).toBe(false);
  });

  test('getBadgeUnlockDate returns date for specific unlocked badge', () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-02-02');
    const badges = [
      createUnlockedBadge('first_session', date1),
      createUnlockedBadge('sniper', date2),
    ];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    expect(prog.getBadgeUnlockDate('sniper')).toEqual(date2);
    expect(prog.getBadgeUnlockDate('first_session')).toEqual(date1);
  });

  test('getBadgeUnlockDate returns undefined for locked badge', () => {
    const prog = UserProgression.empty();
    expect(prog.getBadgeUnlockDate('first_session')).toBeUndefined();
  });

  test('getUnlockedBadgeDefinitions returns badge definitions', () => {
    const badges = [createUnlockedBadge('first_session')];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    const definitions = prog.getUnlockedBadgeDefinitions();
    expect(definitions.length).toBe(1);
    expect(definitions[0]?.id).toBe('first_session');
    expect(definitions[0]?.name).toBeDefined();
  });

  test('getUnlockedBadgeDefinitions filters invalid badge IDs', () => {
    const badges = [createUnlockedBadge('first_session'), createUnlockedBadge('nonexistent_badge')];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    const definitions = prog.getUnlockedBadgeDefinitions();
    expect(definitions.length).toBe(1);
  });

  test('getLockedBadges returns badges not yet unlocked', () => {
    const badges = [createUnlockedBadge('first_session')];
    const prog = UserProgression.fromRecord(createProgressionRecord(), badges);

    const locked = prog.getLockedBadges();
    expect(locked.some((b) => b.id === 'first_session')).toBe(false);
    expect(locked.length).toBe(BADGES.length - 1);
  });
});

// =============================================================================
// Immutable Update Tests
// =============================================================================

describe('withAddedXP()', () => {
  test('should return new instance with added XP', () => {
    const original = UserProgression.empty();
    const updated = original.withAddedXP(100);

    expect(updated.totalXP).toBe(100);
    expect(original.totalXP).toBe(0); // Original unchanged
  });

  test('should preserve other state', () => {
    const badges = [createUnlockedBadge('first_session')];
    const record = createProgressionRecord({ completedSessions: 5 });
    const original = UserProgression.fromRecord(record, badges);

    const updated = original.withAddedXP(50);

    expect(updated.completedSessions).toBe(5);
    expect(updated.hasBadge('first_session')).toBe(true);
  });

  test('should accumulate XP', () => {
    const prog = UserProgression.empty().withAddedXP(100).withAddedXP(50).withAddedXP(25);

    expect(prog.totalXP).toBe(175);
  });
});

describe('withNewBadges()', () => {
  test('should add new badges', () => {
    const original = UserProgression.empty();
    const newBadges = [createUnlockedBadge('first_session')];

    const updated = original.withNewBadges(newBadges);

    expect(updated.hasBadge('first_session')).toBe(true);
    expect(original.hasBadge('first_session')).toBe(false);
  });

  test('should preserve existing badges', () => {
    const badges = [createUnlockedBadge('first_session')];
    const original = UserProgression.fromRecord(createProgressionRecord(), badges);

    const updated = original.withNewBadges([createUnlockedBadge('sniper')]);

    expect(updated.hasBadge('first_session')).toBe(true);
    expect(updated.hasBadge('sniper')).toBe(true);
  });

  test('should accumulate badges', () => {
    const prog = UserProgression.empty()
      .withNewBadges([createUnlockedBadge('first_session')])
      .withNewBadges([createUnlockedBadge('sniper')]);

    expect(prog.unlockedBadgeCount).toBe(2);
  });
});

describe('withCompletedSession()', () => {
  test('should increment completed sessions', () => {
    const prog = UserProgression.empty().withCompletedSession(20, 12);

    expect(prog.completedSessions).toBe(1);
    expect(prog.abandonedSessions).toBe(0);
  });

  test('should add trials', () => {
    const prog = UserProgression.empty().withCompletedSession(20, 12).withCompletedSession(25, 14);

    expect(prog.totalTrials).toBe(45);
  });

  test('should set firstSessionAt on first session', () => {
    const prog = UserProgression.empty().withCompletedSession(20, 12);

    expect(prog.firstSessionAt).not.toBeNull();
  });

  test('should preserve firstSessionAt on subsequent sessions', () => {
    const first = UserProgression.empty().withCompletedSession(20, 12);
    const firstDate = first.firstSessionAt;

    const second = first.withCompletedSession(20, 14);

    expect(second.firstSessionAt).toEqual(firstDate);
  });

  test('should track early morning sessions (before 8am)', () => {
    const prog = UserProgression.empty()
      .withCompletedSession(20, 6) // 6am
      .withCompletedSession(20, 7) // 7am
      .withCompletedSession(20, 8); // 8am - not early

    expect(prog.earlyMorningSessions).toBe(2);
  });

  test('should track late night sessions (10pm+)', () => {
    const prog = UserProgression.empty()
      .withCompletedSession(20, 22) // 10pm
      .withCompletedSession(20, 23) // 11pm
      .withCompletedSession(20, 21); // 9pm - not late

    expect(prog.lateNightSessions).toBe(2);
  });
});

describe('withAbandonedSession()', () => {
  test('should increment abandoned sessions', () => {
    const prog = UserProgression.empty().withAbandonedSession();

    expect(prog.abandonedSessions).toBe(1);
    expect(prog.completedSessions).toBe(0);
  });

  test('should not add trials', () => {
    const prog = UserProgression.empty().withAbandonedSession();

    expect(prog.totalTrials).toBe(0);
  });

  test('should set firstSessionAt on first abandon', () => {
    const prog = UserProgression.empty().withAbandonedSession();

    expect(prog.firstSessionAt).not.toBeNull();
  });

  test('should affect completion rate', () => {
    const prog = UserProgression.empty().withCompletedSession(20, 12).withAbandonedSession();

    expect(prog.completionRate).toBe(50);
  });
});

describe('withComeback()', () => {
  test('should increment comeback count', () => {
    const prog = UserProgression.empty().withComeback();

    expect(prog.comebackCount).toBe(1);
  });

  test('should preserve other state', () => {
    const prog = UserProgression.empty().withCompletedSession(20, 12).withComeback();

    expect(prog.completedSessions).toBe(1);
    expect(prog.comebackCount).toBe(1);
  });
});

describe('withPersistentDay()', () => {
  test('should increment persistent days', () => {
    const prog = UserProgression.empty().withPersistentDay();

    expect(prog.persistentDays).toBe(1);
  });

  test('should accumulate persistent days', () => {
    const prog = UserProgression.empty()
      .withPersistentDay()
      .withPersistentDay()
      .withPersistentDay();

    expect(prog.persistentDays).toBe(3);
  });
});

describe('withPlateauBroken()', () => {
  test('should increment plateaus broken', () => {
    const prog = UserProgression.empty().withPlateauBroken();

    expect(prog.plateausBroken).toBe(1);
  });

  test('should accumulate plateaus broken', () => {
    const prog = UserProgression.empty().withPlateauBroken().withPlateauBroken();

    expect(prog.plateausBroken).toBe(2);
  });
});

// =============================================================================
// Serialization Tests
// =============================================================================

describe('toRecord()', () => {
  test('should serialize all fields', () => {
    const firstDate = new Date('2024-01-15');
    const record = createProgressionRecord({
      totalXP: 500,
      completedSessions: 10,
      abandonedSessions: 2,
      totalTrials: 200,
      firstSessionAt: firstDate,
      earlyMorningSessions: 3,
      lateNightSessions: 5,
      comebackCount: 1,
      persistentDays: 7,
      plateausBroken: 2,
    });

    const prog = UserProgression.fromRecord(record, []);
    const serialized = prog.toRecord();

    expect(serialized.totalXP).toBe(500);
    expect(serialized.completedSessions).toBe(10);
    expect(serialized.abandonedSessions).toBe(2);
    expect(serialized.totalTrials).toBe(200);
    expect(serialized.firstSessionAt).toEqual(firstDate);
    expect(serialized.earlyMorningSessions).toBe(3);
    expect(serialized.lateNightSessions).toBe(5);
    expect(serialized.comebackCount).toBe(1);
    expect(serialized.persistentDays).toBe(7);
    expect(serialized.plateausBroken).toBe(2);
  });

  test('should roundtrip through fromRecord/toRecord', () => {
    const original = UserProgression.empty()
      .withAddedXP(1000)
      .withCompletedSession(20, 6)
      .withCompletedSession(25, 23)
      .withAbandonedSession()
      .withComeback()
      .withPersistentDay()
      .withPlateauBroken();

    const record = original.toRecord();
    const restored = UserProgression.fromRecord(record, []);

    expect(restored.totalXP).toBe(original.totalXP);
    expect(restored.completedSessions).toBe(original.completedSessions);
    expect(restored.abandonedSessions).toBe(original.abandonedSessions);
    expect(restored.totalTrials).toBe(original.totalTrials);
    expect(restored.earlyMorningSessions).toBe(original.earlyMorningSessions);
    expect(restored.lateNightSessions).toBe(original.lateNightSessions);
    expect(restored.comebackCount).toBe(original.comebackCount);
    expect(restored.persistentDays).toBe(original.persistentDays);
    expect(restored.plateausBroken).toBe(original.plateausBroken);
  });
});

// =============================================================================
// Immutability Tests
// =============================================================================

describe('Immutability', () => {
  test('all with* methods return new instances', () => {
    const original = UserProgression.empty();

    const withXP = original.withAddedXP(100);
    const withBadges = original.withNewBadges([createUnlockedBadge('test')]);
    const withCompleted = original.withCompletedSession(20, 12);
    const withAbandoned = original.withAbandonedSession();
    const withComeback = original.withComeback();
    const withPersistent = original.withPersistentDay();
    const withPlateau = original.withPlateauBroken();

    // Original should be unchanged
    expect(original.totalXP).toBe(0);
    expect(original.unlockedBadgeCount).toBe(0);
    expect(original.completedSessions).toBe(0);
    expect(original.abandonedSessions).toBe(0);
    expect(original.comebackCount).toBe(0);
    expect(original.persistentDays).toBe(0);
    expect(original.plateausBroken).toBe(0);

    // All should be different instances
    expect(withXP).not.toBe(original);
    expect(withBadges).not.toBe(original);
    expect(withCompleted).not.toBe(original);
    expect(withAbandoned).not.toBe(original);
    expect(withComeback).not.toBe(original);
    expect(withPersistent).not.toBe(original);
    expect(withPlateau).not.toBe(original);
  });

  test('chained operations create independent snapshots', () => {
    const base = UserProgression.empty();
    const level1 = base.withAddedXP(50);
    const level2 = level1.withAddedXP(100);
    const level3 = level2.withAddedXP(200);

    expect(base.totalXP).toBe(0);
    expect(level1.totalXP).toBe(50);
    expect(level2.totalXP).toBe(150);
    expect(level3.totalXP).toBe(350);
  });
});
