import { describe, expect, it } from 'bun:test';
import { resolveNbackLaunch } from './resolve-nback-launch';

describe('resolveNbackLaunch', () => {
  it('uses explicit free-play gameModeId over settingsMode', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'free',
        gameModeId: 'sim-brainworkshop',
        hasJourneyRouteState: false,
      },
      settingsMode: 'dualnback-classic',
    });
    expect(resolved.effectiveMode).toBe('sim-brainworkshop');
  });

  it('uses journey snapshot levels to resolve simulator stage nLevel', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'journey',
        journeyStageId: 3,
        journeyId: 'sim-brainworkshop-journey',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameModeId: 'sim-brainworkshop',
        hasJourneyRouteState: true,
      },
      settingsMode: 'dualnback-classic',
    });

    expect(resolved.effectiveMode).toBe('sim-brainworkshop');
    expect(resolved.journeyNLevel).toBe(4); // stage 3, start 2 => N-4
  });

  it('prefers playIntent journeyGameModeId over active journey gameMode', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'journey',
        journeyStageId: 1,
        journeyId: 'sim-brainworkshop-journey',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameModeId: 'sim-brainworkshop',
        hasJourneyRouteState: true,
      },
      activeJourney: {
        id: 'sim-brainworkshop-journey',
        gameMode: 'dualnback-classic',
        startLevel: 2,
        targetLevel: 5,
      },
      settingsMode: 'dualnback-classic',
    });
    expect(resolved.effectiveMode).toBe('sim-brainworkshop');
    expect(resolved.journeyNLevel).toBe(2);
  });

  it('uses explicit journey gameModeId when a hybrid journey routes through /nback', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'journey',
        journeyStageId: 2,
        journeyId: 'dual-track-dnb-journey',
        gameModeId: 'dualnback-classic',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameModeId: 'dual-track-dnb-hybrid',
        hasJourneyRouteState: true,
      },
      activeJourney: {
        id: 'dual-track-dnb-journey',
        gameMode: 'dual-track-dnb-hybrid',
        startLevel: 2,
        targetLevel: 5,
      },
      settingsMode: 'dualnback-classic',
    });

    expect(resolved.effectiveMode).toBe('dualnback-classic');
    expect(resolved.journeyGameMode).toBe('dual-track-dnb-hybrid');
    expect(resolved.journeyNLevel).toBe(3);
  });

  it('uses the projected next concrete session mode for hybrid journeys', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'journey',
        journeyStageId: 1,
        journeyId: 'dual-track-dnb-journey',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameModeId: 'dual-track-dnb-hybrid',
        hasJourneyRouteState: true,
      },
      activeJourney: {
        id: 'dual-track-dnb-journey',
        gameMode: 'dual-track-dnb-hybrid',
        startLevel: 2,
        targetLevel: 5,
      },
      journeyStateNextSessionGameMode: 'dualnback-classic',
      settingsMode: 'dualnback-classic',
    });

    expect(resolved.effectiveMode).toBe('dualnback-classic');
    expect(resolved.journeyNLevel).toBe(2);
  });

  it('does not infer a hybrid concrete session mode when projection data is missing', () => {
    const resolved = resolveNbackLaunch({
      playIntent: {
        playMode: 'journey',
        journeyStageId: 1,
        journeyId: 'dual-track-dnb-journey',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameModeId: 'dual-track-dnb-hybrid',
        hasJourneyRouteState: true,
      },
      activeJourney: {
        id: 'dual-track-dnb-journey',
        gameMode: 'dual-track-dnb-hybrid',
        startLevel: 2,
        targetLevel: 5,
      },
      settingsMode: 'dualnback-classic',
    });

    expect(resolved.effectiveMode).toBe('dualnback-classic');
    expect(resolved.journeyNLevel).toBe(2);
  });

  it('clamps journeyStateCurrentStage when journey is complete sentinel', () => {
    const resolved = resolveNbackLaunch({
      playIntent: { playMode: 'journey', hasJourneyRouteState: false },
      journeyStateCurrentStage: 2, // totalStages=1 => complete sentinel
      activeJourney: {
        id: 'dualnback-classic-journey',
        gameMode: 'dualnback-classic',
        startLevel: 1,
        targetLevel: 1,
      },
      settingsMode: 'dualnback-classic',
    });

    expect(resolved.journeyStageId).toBe(1);
    expect(resolved.effectiveMode).toBe('dualnback-classic');
    expect(resolved.journeyNLevel).toBe(1);
  });
});
