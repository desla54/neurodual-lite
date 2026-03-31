import { describe, expect, it } from 'bun:test';
import {
  createCalibrationPlayIntent,
  createFreePlayIntent,
  createJourneyPlayIntent,
  createProfileTrainingPlayIntent,
  createSynergyPlayIntent,
  resolvePlayIntent,
  resolveSessionJourneyId,
  resolveSessionPlayMode,
} from './play-intent';

describe('play-intent', () => {
  it('builds explicit free intent', () => {
    expect(createFreePlayIntent()).toEqual({ playMode: 'free', gameModeId: undefined });
    expect(createFreePlayIntent('sim-brainworkshop')).toEqual({
      playMode: 'free',
      gameModeId: 'sim-brainworkshop',
    });
  });

  it('builds explicit journey intent', () => {
    expect(createJourneyPlayIntent(3, 'journey-1')).toEqual({
      playMode: 'journey',
      journeyStageId: 3,
      journeyId: 'journey-1',
      gameModeId: undefined,
      journeyStartLevel: undefined,
      journeyTargetLevel: undefined,
      journeyGameModeId: undefined,
      journeyStrategyConfig: undefined,
    });
  });

  it('builds explicit calibration intent', () => {
    expect(
      createCalibrationPlayIntent({
        modality: 'position',
        identityMode: 'classic',
        targets: 2,
        distractors: 3,
        trackingMs: 15000,
        blockSize: 20,
        level: 2,
        nbackModalities: ['position'],
      }),
    ).toEqual({
      playMode: 'calibration',
      calibration: {
        modality: 'position',
        identityMode: 'classic',
        targets: 2,
        distractors: 3,
        trackingMs: 15000,
        blockSize: 20,
        level: 2,
        nbackModalities: ['position'],
      },
    });
  });

  it('builds explicit profile training intent', () => {
    expect(
      createProfileTrainingPlayIntent({
        modality: 'letters',
        identityMode: 'letter',
        targets: 2,
        distractors: 2,
        trackingMs: 15000,
        blockSize: 20,
        level: 2,
        nbackModalities: ['audio'],
      }),
    ).toEqual({
      playMode: 'profile',
      profileTraining: {
        modality: 'letters',
        identityMode: 'letter',
        targets: 2,
        distractors: 2,
        trackingMs: 15000,
        blockSize: 20,
        level: 2,
        nbackModalities: ['audio'],
      },
    });
  });

  it('builds journey intent with snapshot fields', () => {
    expect(
      createJourneyPlayIntent(4, 'journey-2', {
        gameModeId: 'dualnback-classic',
        journeyStartLevel: 2,
        journeyTargetLevel: 6,
        journeyGameModeId: 'sim-brainworkshop',
      }),
    ).toEqual({
      playMode: 'journey',
      journeyStageId: 4,
      journeyId: 'journey-2',
      gameModeId: 'dualnback-classic',
      journeyStartLevel: 2,
      journeyTargetLevel: 6,
      journeyGameModeId: 'sim-brainworkshop',
      journeyStrategyConfig: undefined,
    });
  });

  it('resolves explicit free intent over journey fallback', () => {
    const resolved = resolvePlayIntent({ playMode: 'free' });
    expect(resolved.playMode).toBe('free');
    expect(resolved.hasJourneyRouteState).toBe(false);
  });

  it('resolves explicit profile intent without collapsing it to free', () => {
    const resolved = resolvePlayIntent({ playMode: 'profile' });
    expect(resolved.playMode).toBe('profile');
    expect(resolved.hasJourneyRouteState).toBe(false);
  });

  it('preserves synergy loop context when resuming from home', () => {
    const intent = createSynergyPlayIntent('dualnback-classic', {
      loopIndex: 2,
      totalLoops: 5,
      stepIndex: 1,
    });

    expect(intent).toEqual({
      playMode: 'synergy',
      gameModeId: 'dualnback-classic',
      synergyLoopIndex: 2,
      synergyTotalLoops: 5,
      synergyStepIndex: 1,
    });
    expect(resolvePlayIntent(intent)).toEqual({
      playMode: 'synergy',
      gameModeId: 'dualnback-classic',
      hasJourneyRouteState: false,
      synergyLoopIndex: 2,
      synergyTotalLoops: 5,
      synergyStepIndex: 1,
    });
  });

  it('rejects journey route state without playMode', () => {
    expect(() => resolvePlayIntent({ journeyStageId: 4, journeyId: 'j1' })).toThrow();
  });

  it('resolves journey session ID with expected priority order', () => {
    expect(
      resolveSessionJourneyId({
        playMode: 'journey',
        recoveredJourneyId: 'recovered-id',
        routeJourneyId: 'route-id',
        activeJourneyId: 'active-id',
        configJourneyId: 'config-id',
      }),
    ).toBe('recovered-id');

    expect(
      resolveSessionJourneyId({
        playMode: 'journey',
        recoveredJourneyId: undefined,
        routeJourneyId: 'route-id',
        activeJourneyId: 'active-id',
        configJourneyId: 'config-id',
      }),
    ).toBe('route-id');

    expect(
      resolveSessionJourneyId({
        playMode: 'journey',
        recoveredJourneyId: undefined,
        routeJourneyId: undefined,
        activeJourneyId: 'active-id',
        configJourneyId: 'config-id',
      }),
    ).toBe('active-id');
  });

  it('returns undefined for free mode or empty journey IDs', () => {
    expect(
      resolveSessionJourneyId({
        playMode: 'free',
        recoveredJourneyId: 'recovered-id',
      }),
    ).toBeUndefined();

    expect(
      resolveSessionJourneyId({
        playMode: 'journey',
        recoveredJourneyId: '   ',
        routeJourneyId: '',
        activeJourneyId: null,
        configJourneyId: undefined,
      }),
    ).toBeUndefined();
  });

  it('preserves calibration, profile and synergy when resolving the persisted session play mode', () => {
    expect(
      resolveSessionPlayMode({
        requestedPlayMode: 'calibration',
        hasJourneySnapshot: true,
      }),
    ).toBe('calibration');

    expect(
      resolveSessionPlayMode({
        requestedPlayMode: 'profile',
        hasJourneySnapshot: true,
      }),
    ).toBe('profile');

    expect(
      resolveSessionPlayMode({
        requestedPlayMode: 'synergy',
        hasJourneySnapshot: true,
      }),
    ).toBe('synergy');
  });

  it('promotes free mode to journey when a journey snapshot already exists', () => {
    expect(
      resolveSessionPlayMode({
        requestedPlayMode: 'free',
        hasJourneySnapshot: true,
      }),
    ).toBe('journey');

    expect(
      resolveSessionPlayMode({
        requestedPlayMode: 'free',
        hasJourneySnapshot: false,
      }),
    ).toBe('free');
  });
});
