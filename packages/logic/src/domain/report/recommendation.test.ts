import { describe, expect, it } from 'bun:test';
import {
  recommendJourneyStage,
  recommendNextLevelForTempo,
  recommendNextLevelFromPassed,
} from './recommendation';

describe('recommendNextLevelFromPassed', () => {
  it('moves up when passed', () => {
    const result = recommendNextLevelFromPassed(2, true);
    expect(result.nextLevel).toBe(3);
    expect(result.direction).toBe('up');
  });

  it('stays when not passed', () => {
    const result = recommendNextLevelFromPassed(2, false);
    expect(result.nextLevel).toBe(2);
    expect(result.direction).toBe('same');
  });

  it('does not clamp N10 upward/downward recommendations to N8', () => {
    const result = recommendNextLevelFromPassed(10, true);
    expect(result.nextLevel).toBe(10);
    expect(result.direction).toBe('same');
  });
});

describe('recommendNextLevelForTempo', () => {
  it('uses SDT thresholds for dual-catch', () => {
    const up = recommendNextLevelForTempo({
      currentLevel: 2,
      gameMode: 'dual-catch',
      globalDPrime: 1.7,
      byModality: {},
    });
    expect(up.direction).toBe('up');
    expect(up.nextLevel).toBe(3);

    const down = recommendNextLevelForTempo({
      currentLevel: 3,
      gameMode: 'dual-catch',
      globalDPrime: 0.2,
      byModality: {},
    });
    expect(down.direction).toBe('down');
    expect(down.nextLevel).toBe(2);
  });

  it('uses Jaeggi error protocol (<3 up, 3-5 stay, >5 down)', () => {
    const up = recommendNextLevelForTempo({
      currentLevel: 4,
      gameMode: 'dualnback-classic',
      globalDPrime: 0,
      byModality: {
        position: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
        audio: { hits: 8, misses: 2, falseAlarms: 0, correctRejections: 10 },
      },
    });
    expect(up.direction).toBe('up');
    expect(up.nextLevel).toBe(5);

    const stay = recommendNextLevelForTempo({
      currentLevel: 4,
      gameMode: 'dualnback-classic',
      globalDPrime: 0,
      byModality: {
        position: { hits: 8, misses: 3, falseAlarms: 0, correctRejections: 9 },
        audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
      },
    });
    expect(stay.direction).toBe('same');
    expect(stay.nextLevel).toBe(4);

    const down = recommendNextLevelForTempo({
      currentLevel: 4,
      gameMode: 'dualnback-classic',
      globalDPrime: 0,
      byModality: {
        position: { hits: 8, misses: 6, falseAlarms: 0, correctRejections: 7 },
        audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
      },
    });
    expect(down.direction).toBe('down');
    expect(down.nextLevel).toBe(3);
  });

  it('keeps one-level regression at high level (N10 -> N9)', () => {
    const down = recommendNextLevelForTempo({
      currentLevel: 10,
      gameMode: 'dualnback-classic',
      globalDPrime: 0,
      byModality: {
        position: { hits: 8, misses: 6, falseAlarms: 0, correctRejections: 7 },
        audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
      },
    });
    expect(down.direction).toBe('down');
    expect(down.nextLevel).toBe(9);
  });

  it('uses BrainWorkshop strike-aware down rule', () => {
    const stay = recommendNextLevelForTempo({
      currentLevel: 4,
      gameMode: 'sim-brainworkshop',
      globalDPrime: 0,
      currentStrikes: 1,
      byModality: {
        position: { hits: 1, misses: 5, falseAlarms: 4, correctRejections: 0 },
        audio: { hits: 1, misses: 5, falseAlarms: 4, correctRejections: 0 },
      },
    });
    expect(stay.direction).toBe('same');
    expect(stay.nextLevel).toBe(4);

    const down = recommendNextLevelForTempo({
      currentLevel: 4,
      gameMode: 'sim-brainworkshop',
      globalDPrime: 0,
      currentStrikes: 2,
      byModality: {
        position: { hits: 1, misses: 5, falseAlarms: 4, correctRejections: 0 },
        audio: { hits: 1, misses: 5, falseAlarms: 4, correctRejections: 0 },
      },
    });
    expect(down.direction).toBe('down');
    expect(down.nextLevel).toBe(3);
  });
});

describe('recommendJourneyStage', () => {
  it('uses nextStageUnlocked when progressing', () => {
    const result = recommendJourneyStage({
      stageId: 2,
      gameMode: 'dualnback-classic',
      byModality: {
        position: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
        audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
      },
      stageCompleted: true,
      nextStageUnlocked: 3,
      maxStage: 8,
    });
    expect(result.direction).toBe('up');
    expect(result.targetStage).toBe(3);
  });

  it('recommends previous stage when regression is triggered', () => {
    const result = recommendJourneyStage({
      stageId: 4,
      gameMode: 'dualnback-classic',
      byModality: {
        position: { hits: 8, misses: 6, falseAlarms: 0, correctRejections: 10 },
        audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
      },
      minStage: 1,
    });
    expect(result.direction).toBe('down');
    expect(result.targetStage).toBe(3);
  });
});
