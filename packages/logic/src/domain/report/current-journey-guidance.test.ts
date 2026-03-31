import { describe, expect, it } from 'bun:test';

import { buildCurrentJourneyGuidanceContext } from './current-journey-guidance';
import { computeProgressionIndicatorModel } from './progression-indicator';
import type { SessionEndReportModel } from '../../types/session-report';
import type { JourneyState } from '../../types/journey';

const report: SessionEndReportModel = {
  sessionId: 'session-1',
  gameMode: 'dualnback-classic',
  gameModeLabel: 'Dual N-Back',
  playContext: 'journey',
  nLevel: 2,
  durationMs: 60000,
  // @ts-expect-error test override
  totalTrials: 20,
  targetTrials: 0,
  actualTargets: 0,
  hits: 0,
  misses: 0,
  falseAlarms: 0,
  correctRejections: 0,
  overallAccuracy: 0,
  globalDPrime: 0,
  scorePercent: 0,
  passed: false,
  byModality: {},
  activeModalities: ['position', 'audio'],
  journeyId: 'journey-1',
  journeyStageId: 1,
  journeyContext: {
    journeyId: 'journey-1',
    stageId: 1,
    stageMode: 'simulator',
    nLevel: 2,
    journeyName: 'Hybrid Journey',
    journeyGameMode: 'dual-track-dnb-hybrid',
    upsThreshold: 50,
    isValidating: false,
    validatingSessions: 0,
    sessionsRequired: 1,
    stageCompleted: false,
    nextStageUnlocked: null,
  },
};

const journeyState: JourneyState = {
  currentStage: 2,
  stages: [
    { stageId: 1, status: 'completed', validatingSessions: 1, bestScore: 100, progressPct: 100 },
    { stageId: 2, status: 'unlocked', validatingSessions: 0, bestScore: null, progressPct: 0 },
  ],
  isActive: true,
  startLevel: 2,
  targetLevel: 3,
  isSimulator: true,
};

describe('buildCurrentJourneyGuidanceContext', () => {
  it('builds a current-state journey context when the report is outdated', () => {
    const context = buildCurrentJourneyGuidanceContext({
      report,
      reportJourneyGameMode: 'dual-track-dnb-hybrid',
      reportRecommendedStageId: 1,
      reportRecommendedModeId: 'dual-track',
      currentJourneyState: journeyState,
      currentJourneyStageDef: { stageId: 2, nLevel: 3, mode: 'simulator' },
      currentJourneyStageId: 2,
      currentJourneyModeId: 'dualnback-classic',
    });

    expect(context?.guidanceSource).toBe('current-state');
    expect(context?.journeyDecision).toBe('up');
    expect(context?.nextSessionGameMode).toBe('dualnback-classic');
    expect(context?.stageId).toBe(2);
  });

  it('rebuilds hybrid progress from the current state when the report guidance is stale', () => {
    const hybridJourneyState: JourneyState = {
      currentStage: 1,
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 1,
          bestScore: 100,
          progressPct: 50,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'clean',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        },
      ],
      isActive: true,
      startLevel: 2,
      targetLevel: 2,
      isSimulator: true,
    };

    const context = buildCurrentJourneyGuidanceContext({
      report,
      reportJourneyGameMode: 'dual-track-dnb-hybrid',
      reportRecommendedStageId: 1,
      reportRecommendedModeId: 'dual-track',
      currentJourneyState: hybridJourneyState,
      currentJourneyStageDef: { stageId: 1, nLevel: 2, mode: 'simulator' },
      currentJourneyStageId: 1,
      currentJourneyModeId: null,
    });

    expect(context?.journeyProtocol).toBe('hybrid-jaeggi');
    expect(context?.sessionRole).toBe('decision-half');
    expect(context?.journeyDecision).toBe('pending-pair');
    expect(context?.nextSessionGameMode).toBe('dualnback-classic');
    expect(context?.hybridProgress).toEqual({
      loopPhase: 'dnb',
      trackSessionsCompleted: 1,
      trackSessionsRequired: 1,
      dnbSessionsCompleted: 1,
      dnbSessionsRequired: 3,
      decisionZone: 'clean',
      decisionStreakCount: 1,
      decisionStreakRequired: 2,
    });

    const model = computeProgressionIndicatorModel({
      ...report,
      journeyContext: context ?? undefined,
    });

    expect(model?.hybridJourneyDisplay).toEqual({
      kind: 'validation-progress',
      current: 1,
      total: 2,
    });
    expect(model?.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 2,
    });
  });
});
