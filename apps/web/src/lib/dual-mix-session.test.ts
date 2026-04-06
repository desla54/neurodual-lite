import { describe, expect, test } from 'bun:test';
import { generateNBackSequence, getDualMixTotalRounds, GRID_POSITIONS } from './dual-mix-session';

describe('generateNBackSequence', () => {
  test('adds the n-level buffer to the displayed round budget', () => {
    expect(getDualMixTotalRounds(10, 1)).toBe(11);
    expect(getDualMixTotalRounds(10, 2)).toBe(12);
    expect(getDualMixTotalRounds(20, 3)).toBe(23);
  });

  test('matches classic dual-n-back target budget on 20 rounds', () => {
    const nLevel = 2;
    const sequence = generateNBackSequence(20, nLevel);

    expect(sequence).toHaveLength(22);

    const scorable = sequence.slice(nLevel);
    const positionTargets = scorable.filter((stimulus) => stimulus.type === 'V-Seul').length;
    const audioTargets = scorable.filter((stimulus) => stimulus.type === 'A-Seul').length;
    const dualTargets = scorable.filter((stimulus) => stimulus.type === 'Dual').length;
    const nonTargets = scorable.filter((stimulus) => stimulus.type === 'Non-Cible').length;

    expect(positionTargets).toBe(4);
    expect(audioTargets).toBe(4);
    expect(dualTargets).toBe(2);
    expect(nonTargets).toBe(10);

    const totalPositionMatches = scorable.filter(
      (stimulus) => stimulus.type === 'V-Seul' || stimulus.type === 'Dual',
    ).length;
    const totalAudioMatches = scorable.filter(
      (stimulus) => stimulus.type === 'A-Seul' || stimulus.type === 'Dual',
    ).length;

    expect(totalPositionMatches).toBe(6);
    expect(totalAudioMatches).toBe(6);
  });

  test('only emits grid positions supported by the classic n-back board', () => {
    const sequence = generateNBackSequence(60, 2);

    for (const stimulus of sequence) {
      expect(stimulus.position).toBeGreaterThanOrEqual(0);
      expect(stimulus.position).toBeLessThan(GRID_POSITIONS);
    }
  });
});
