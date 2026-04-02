import { describe, expect, it } from 'bun:test';
import { resolveNbackRuntimeContext } from './nback-runtime-context';

describe('resolveNbackRuntimeContext', () => {
  it('builds a journey runtime context from the launch snapshot and recovery ownership', () => {
    const resolved = resolveNbackRuntimeContext({
      requestedPlayMode: 'journey',
      requestedLaunch: {
        journeyStageId: 2,
        journeyId: 'brainworkshop-journey',
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        journeyGameMode: 'sim-brainworkshop',
        isSimulatorJourney: true,
        journeyNLevel: 3,
        effectiveMode: 'sim-brainworkshop',
      },
      requestedJourneyStrategyConfig: { kind: 'binary-threshold' } as never,
      recoveredState: {
        playMode: 'journey',
        journeyStageId: 2,
        journeyId: 'brainworkshop-journey',
        gameMode: 'sim-brainworkshop',
        nLevel: 3,
      } as never,
      activeJourney: {
        id: 'other-journey',
        name: 'Other',
        gameMode: 'dualnback-classic',
        startLevel: 1,
        targetLevel: 4,
      },
      activeJourneyIdFromStore: 'other-journey',
    });

    expect(resolved).toMatchObject({
      effectivePlayMode: 'journey',
      journeyStageId: 2,
      resolvedJourneyIdForSession: 'brainworkshop-journey',
      activeJourneyId: 'brainworkshop-journey',
      journeyGameMode: 'sim-brainworkshop',
      journeyStartLevel: 2,
      journeyTargetLevel: 5,
      journeyNLevel: 3,
      effectiveMode: 'sim-brainworkshop',
      shouldUseJourneySettings: true,
    });
  });

  it('keeps free launches free even if stale journey ids exist elsewhere', () => {
    const resolved = resolveNbackRuntimeContext({
      requestedPlayMode: 'free',
      requestedLaunch: {
        journeyStartLevel: 1,
        journeyTargetLevel: 5,
        isSimulatorJourney: false,
        effectiveMode: 'dualnback-classic',
      },
      recoveredState: {
        playMode: 'free',
        journeyId: 'stale-journey',
        journeyStageId: 4,
        gameMode: 'sim-brainworkshop',
        nLevel: 7,
      } as never,
      activeJourneyIdFromStore: 'global-journey',
    });

    expect(resolved).toMatchObject({
      effectivePlayMode: 'free',
      journeyStageId: 4,
      resolvedJourneyIdForSession: undefined,
      activeJourneyId: null,
      shouldUseJourneySettings: false,
      effectiveMode: 'sim-brainworkshop',
      journeyNLevel: 7,
    });
  });

  it('throws when a journey session cannot resolve a journey id', () => {
    expect(() =>
      resolveNbackRuntimeContext({
        requestedPlayMode: 'journey',
        requestedLaunch: {
          journeyStartLevel: 1,
          journeyTargetLevel: 5,
          isSimulatorJourney: false,
          effectiveMode: 'dualnback-classic',
        },
      }),
    ).toThrow('[NbackTrainingPage] journeyId is required when playMode="journey"');
  });
});
