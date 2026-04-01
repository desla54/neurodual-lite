import { describe, expect, test } from 'bun:test';
import { resolveStatsContext } from './stats-context';

describe('resolveStatsContext', () => {
  test('all main modes are stable and unlocked', () => {
    const ctx = resolveStatsContext({
      mode: 'all',
      journeyFilter: 'all',
      availableJourneyIds: [],
      access: { betaEnabled: false, alphaEnabled: false },
    });

    for (const value of ['DualnbackClassic', 'BrainWorkshop', 'Gridlock', 'StroopFlex', 'Ospan']) {
      const mode = ctx.options.modes.find((m) => m.value === value);
      expect(mode?.locked).toBe(false);
    }
  });

  test('returns simulator chartsMode for simulator journey', () => {
    const ctx = resolveStatsContext({
      mode: 'Journey',
      journeyFilter: 'dualnback-classic-journey',
      availableJourneyIds: [],
      access: { betaEnabled: true, alphaEnabled: true },
    });
    expect(ctx.effective.chartsMode).toBe('DualnbackClassic');
  });
});
