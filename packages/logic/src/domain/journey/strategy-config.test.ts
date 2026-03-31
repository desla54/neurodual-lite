import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_DUAL_TRACK_JOURNEY_PRESET,
  createDefaultHybridJourneyStrategyConfig,
  resolveDualTrackJourneyPreset,
  resolveHybridJourneyStrategyConfig,
  resolveJourneyStrategyConfig,
} from './strategy-config';

describe('journey strategy config', () => {
  it('uses dedicated hybrid strategy config when present', () => {
    const strategy = resolveHybridJourneyStrategyConfig({
      gameMode: 'dual-track-dnb-hybrid',
      strategyConfig: {
        hybrid: {
          trackSessionsPerBlock: 2,
          dnbSessionsPerBlock: 4,
        },
      },
      hybridTrackSessionsPerBlock: 1,
      hybridDnbSessionsPerBlock: 3,
    });

    expect(strategy).toEqual({
      trackSessionsPerBlock: 2,
      dnbSessionsPerBlock: 4,
    });
  });

  it('falls back to legacy journey mode settings for hybrid journeys', () => {
    const strategy = resolveJourneyStrategyConfig({
      gameMode: 'dual-track-dnb-hybrid',
      hybridTrackSessionsPerBlock: 2,
      hybridDnbSessionsPerBlock: 5,
    });

    expect(strategy).toEqual({
      hybrid: {
        trackSessionsPerBlock: 2,
        dnbSessionsPerBlock: 5,
      },
    });
  });

  it('provides default hybrid block sizes', () => {
    expect(createDefaultHybridJourneyStrategyConfig()).toEqual({
      hybrid: {
        trackSessionsPerBlock: 1,
        dnbSessionsPerBlock: 3,
      },
    });
  });

  it('defaults dual-track journeys to the hard preset', () => {
    expect(resolveJourneyStrategyConfig({ gameMode: 'dual-track' })).toEqual({
      dualTrack: {
        preset: DEFAULT_DUAL_TRACK_JOURNEY_PRESET,
      },
    });
  });

  it('normalizes dual-track preset values', () => {
    expect(
      resolveDualTrackJourneyPreset({
        gameMode: 'dual-track',
        strategyConfig: {
          dualTrack: {
            preset: 'medium',
          },
        },
      }),
    ).toBe('medium');
  });
});
