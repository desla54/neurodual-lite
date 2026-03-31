import { describe, expect, test } from 'bun:test';
import { resolveStatsContext } from './stats-context';

describe('resolveStatsContext', () => {
  test('locks beta modes when beta disabled', () => {
    const ctx = resolveStatsContext({
      mode: 'DualTempo',
      journeyFilter: 'all',
      availableJourneyIds: [],
      access: { betaEnabled: false, alphaEnabled: false },
    });

    const mode = ctx.options.modes.find((m) => m.value === 'DualTempo');
    expect(mode?.locked).toBe(true);
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
