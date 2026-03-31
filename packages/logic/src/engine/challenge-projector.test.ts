import { describe, expect, it } from 'bun:test';

import type { TrainingDailyTotal } from '../types/challenge';
import { projectChallenge20FromDailyTotals } from './challenge-projector';

describe('projectChallenge20FromDailyTotals', () => {
  it('creates 20 cards and starts at J1', () => {
    const state = projectChallenge20FromDailyTotals({
      dailyTotals: [],
      now: new Date('2026-02-23T12:00:00'),
      config: { totalDays: 20, targetMinutesPerDay: 15 },
    });

    expect(state.cards).toHaveLength(20);
    expect(state.completedDays).toBe(0);
    expect(state.currentIndex).toBe(1);
    expect(state.cards[0]?.status).toBe('current');
  });

  it('does not unlock the next card on the same day after completion', () => {
    const dailyTotals: TrainingDailyTotal[] = [
      { day: '2026-02-20', totalDurationMs: 45 * 60_000, sessionsCount: 3 },
    ];

    const state = projectChallenge20FromDailyTotals({
      dailyTotals,
      now: new Date('2026-02-20T12:00:00'),
      config: { totalDays: 20, targetMinutesPerDay: 15 },
    });

    expect(state.completedDays).toBe(1);
    expect(state.currentIndex).toBeNull();
    expect(state.cards[0]?.status).toBe('completed');
    expect(state.cards[1]?.status).toBe('locked');
  });

  it('fills current progress for today when below target', () => {
    const dailyTotals: TrainingDailyTotal[] = [
      { day: '2026-02-23', totalDurationMs: 9 * 60_000, sessionsCount: 1 },
    ];

    const state = projectChallenge20FromDailyTotals({
      dailyTotals,
      now: new Date('2026-02-23T20:00:00'),
      config: { totalDays: 20, targetMinutesPerDay: 15 },
    });

    const card = state.cards[0];
    expect(card?.status).toBe('current');
    expect(card?.currentProgress).toBeCloseTo(9 / 15);
  });

  it('ignores days before startDay', () => {
    const dailyTotals: TrainingDailyTotal[] = [
      { day: '2026-02-20', totalDurationMs: 45 * 60_000, sessionsCount: 3 },
      { day: '2026-02-22', totalDurationMs: 45 * 60_000, sessionsCount: 3 },
    ];

    const state = projectChallenge20FromDailyTotals({
      dailyTotals,
      now: new Date('2026-02-23T12:00:00'),
      config: { totalDays: 20, targetMinutesPerDay: 15 },
      startDay: '2026-02-21',
    });

    expect(state.completedDays).toBe(1);
    expect(state.cards[0]?.completedDay).toBe('2026-02-22');
  });

  it('ignores future days relative to the local current day', () => {
    const dailyTotals: TrainingDailyTotal[] = [
      { day: '2026-02-23', totalDurationMs: 15 * 60_000, sessionsCount: 1 },
      { day: '2026-02-24', totalDurationMs: 15 * 60_000, sessionsCount: 1 },
    ];

    const state = projectChallenge20FromDailyTotals({
      dailyTotals,
      now: new Date('2026-02-23T20:00:00'),
      config: { totalDays: 20, targetMinutesPerDay: 15 },
    });

    expect(state.completedDays).toBe(1);
    expect(state.currentIndex).toBeNull();
    expect(state.cards[0]?.completedDay).toBe('2026-02-23');
    expect(state.cards[1]?.status).toBe('locked');
  });
});
