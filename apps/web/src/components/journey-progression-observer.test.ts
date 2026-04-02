import { describe, expect, it } from 'bun:test';
import { extractJourneyProgressionUpdate } from '../lib/journey-progression-update';

describe('extractJourneyProgressionUpdate', () => {
  it('ignores reports from free mode', () => {
    const result = extractJourneyProgressionUpdate({
      sessionId: 'session-free',
      playContext: 'free',
      journeyId: 'dualnback-classic-journey',
      gameMode: 'dualnback-classic',
      nLevel: 2,
      unifiedAccuracy: 0.91,
    } as never);

    expect(result).toBeNull();
  });

  it('ignores journey reports without an explicit top-level journey id', () => {
    const result = extractJourneyProgressionUpdate({
      sessionId: 'session-journey-missing-id',
      playContext: 'journey',
      gameMode: 'dualnback-classic',
      nLevel: 2,
      unifiedAccuracy: 0.91,
      journeyContext: {
        journeyId: 'dualnback-classic-journey',
      },
    } as never);

    expect(result).toBeNull();
  });

  it('returns an explicit progression payload for owned journey reports', () => {
    const result = extractJourneyProgressionUpdate({
      sessionId: 'session-journey',
      playContext: 'journey',
      journeyId: 'dualnback-classic-journey',
      gameMode: 'dualnback-classic',
      nLevel: 3,
      unifiedAccuracy: 0.93,
      byModality: {
        position: { misses: 1, falseAlarms: 0 },
        audio: { misses: 0, falseAlarms: 1 },
      },
      ups: { score: 82 },
    } as never);

    expect(result).toEqual({
      sessionId: 'session-journey',
      journeyId: 'dualnback-classic-journey',
      journeyGameMode: 'dualnback-classic',
      result: {
        gameMode: 'dualnback-classic',
        nLevel: 3,
        accuracy: 0.93,
        modalityErrors: [1, 1],
        upsScore: 82,
      },
    });
  });
});
