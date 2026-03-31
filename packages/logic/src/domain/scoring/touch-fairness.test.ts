import { describe, expect, it } from 'bun:test';
import type { TempoResponseData } from '../../types/ups';
import { TempoConfidenceCalculator } from './tempo-confidence';
import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';

function makeTouchHit(
  trialIndex: number,
  modality: 'audio' | 'position',
  rt: number,
): TempoResponseData {
  return {
    trialIndex,
    reactionTimeMs: rt,
    pressDurationMs: 100,
    responsePhase: 'after_stimulus',
    result: 'hit',
    modality,
    inputMethod: 'touch',
  };
}

describe('Touch fairness corrections', () => {
  it('SLC: mono-thumb sequential dual responses should not destroy RT stability (Tempo)', () => {
    const responses: TempoResponseData[] = [];
    for (let t = 0; t < 20; t++) {
      // Two hits in the same trial, separated by ~150ms motor latency (audio -> visual)
      responses.push(makeTouchHit(t, 'audio', 500));
      responses.push(makeTouchHit(t, 'position', 650));
    }

    const debug = TempoConfidenceCalculator.calculateWithDebug(responses);
    expect(debug.hasEnoughData).toBe(true);
    expect(debug.components.rtStability).toBeGreaterThanOrEqual(95);
    expect(debug.rawData.rtCV ?? 0).toBeLessThanOrEqual(0.02);
  });

  it('Touch: press stability should not penalize noisy tap/slide durations (Jaeggi)', () => {
    const responses: TempoResponseData[] = [];
    for (let t = 0; t < 20; t++) {
      responses.push({
        ...makeTouchHit(t, 'audio', 520),
        pressDurationMs: t % 2 === 0 ? 40 : 260, // highly variable touch duration
      });
      responses.push({
        ...makeTouchHit(t, 'position', 670),
        pressDurationMs: t % 3 === 0 ? 60 : 320,
      });
    }

    const debug = JaeggiConfidenceCalculator.calculateWithDebug(responses, 1.0);
    expect(debug.hasEnoughData).toBe(true);
    // Press stability becomes neutral because touch samples are ignored.
    expect(debug.components.pressStability).toBe(50);
    // And SLC keeps RT stability high.
    expect(debug.components.rtStability).toBeGreaterThanOrEqual(95);
  });
});
