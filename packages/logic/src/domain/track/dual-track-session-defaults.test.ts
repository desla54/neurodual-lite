import { describe, expect, it } from 'bun:test';

import {
  clampDualTrackTargetCount,
  deriveDualTrackCrowdingMode,
  deriveDualTrackMotionComplexity,
  deriveDualTrackTotalObjects,
  resolveDualTrackSessionDefaults,
} from './dual-track-session-defaults';

describe('dual-track session defaults', () => {
  it('clamps target count into the supported range', () => {
    expect(clampDualTrackTargetCount(0)).toBe(1);
    expect(clampDualTrackTargetCount(3.8)).toBe(4);
    expect(clampDualTrackTargetCount(99)).toBe(5);
  });

  it('derives crowding and motion presets from target count', () => {
    expect(deriveDualTrackCrowdingMode(2)).toBe('low');
    expect(deriveDualTrackCrowdingMode(4)).toBe('standard');
    expect(deriveDualTrackCrowdingMode(5)).toBe('dense');
    expect(deriveDualTrackMotionComplexity(2)).toBe('smooth');
    expect(deriveDualTrackMotionComplexity(4)).toBe('standard');
    expect(deriveDualTrackMotionComplexity(5)).toBe('agile');
  });

  it('adjusts total objects when crowding is relaxed or intensified', () => {
    expect(deriveDualTrackTotalObjects(3, 'low')).toBe(6);
    expect(deriveDualTrackTotalObjects(3, 'standard')).toBe(7);
    expect(deriveDualTrackTotalObjects(3, 'dense')).toBe(8);
  });

  it('resolves the full automatic preset from target count', () => {
    expect(resolveDualTrackSessionDefaults(4)).toEqual({
      targetCount: 4,
      totalObjects: 9,
      trialsCount: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 190,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
    });
  });
});
