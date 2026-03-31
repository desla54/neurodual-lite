import { describe, expect, test } from 'bun:test';
import {
  CANONICAL_GAME_MODES,
  CANONICAL_JOURNEYS,
  listStatsModeOptions,
  resolveEffectiveStatsGameModeId,
  resolveGameModeIdsForStatsMode,
} from './stats-catalog';

describe('stats-catalog', () => {
  test('canonical game modes have unique ids and stats modes', () => {
    const ids = CANONICAL_GAME_MODES.map((m) => m.id);
    const statsModes = CANONICAL_GAME_MODES.map((m) => m.statsMode);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(statsModes).size).toBe(statsModes.length);
  });

  test('canonical journeys have unique ids', () => {
    const ids = CANONICAL_JOURNEYS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('listStatsModeOptions has no duplicate values', () => {
    const values = listStatsModeOptions().map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test('resolveGameModeIdsForStatsMode maps known modes', () => {
    expect(resolveGameModeIdsForStatsMode('DualTempo')).toEqual(['dual-catch']);
    expect(resolveGameModeIdsForStatsMode('DualnbackClassic')).toEqual(['dualnback-classic']);
    expect(resolveGameModeIdsForStatsMode('BrainWorkshop')).toEqual(['sim-brainworkshop']);
  });

  test('resolveEffectiveStatsGameModeId resolves simulator journeys', () => {
    expect(
      resolveEffectiveStatsGameModeId({
        mode: 'Journey',
        journeyId: 'dualnback-classic-journey',
      }),
    ).toBe('dualnback-classic');
  });
});
