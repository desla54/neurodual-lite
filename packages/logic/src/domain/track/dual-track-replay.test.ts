import { describe, expect, it } from 'bun:test';
import { analyzeTrackReplay, projectTrackReplaySnapshot } from './dual-track-replay';

describe('dual-track replay', () => {
  const baseDefinition = {
    arenaWidthPx: 400,
    arenaHeightPx: 300,
    trackingDurationMs: 1000,
    crowdingThresholdPx: 40,
    initialObjects: [
      {
        x: 120,
        y: 120,
        speedPxPerSec: 0,
        headingRad: 0,
        turnRateRadPerSec: 0,
        turnJitterTimerMs: 1000,
        minTurnIntervalMs: 800,
        maxTurnIntervalMs: 1200,
        maxTurnRateRadPerSec: 0,
        rngSeed: 'a',
      },
      {
        x: 145,
        y: 120,
        speedPxPerSec: 0,
        headingRad: 0,
        turnRateRadPerSec: 0,
        turnJitterTimerMs: 1000,
        minTurnIntervalMs: 800,
        maxTurnIntervalMs: 1200,
        maxTurnRateRadPerSec: 0,
        rngSeed: 'b',
      },
    ],
  } as const;

  it('projects deterministic snapshots from the same definition', () => {
    const first = projectTrackReplaySnapshot(baseDefinition, 500);
    const second = projectTrackReplaySnapshot(baseDefinition, 500);

    expect(first).toEqual(second);
    expect(first.crowdedPairs.length).toBe(1);
  });

  it('detects crowding episodes over the whole replay', () => {
    const analysis = analyzeTrackReplay(baseDefinition, 100);

    expect(analysis.episodeCount).toBe(1);
    expect(analysis.timeUnderCrowdingThresholdMs).toBeGreaterThan(0);
    expect(analysis.peakPairCount).toBe(1);
    expect(analysis.minDistancePx).toBe(25);
  });
});
