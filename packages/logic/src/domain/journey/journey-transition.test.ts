import { describe, expect, it } from 'bun:test';

import type { AttemptResult } from '../../ports/journey-port';
import type { JourneyMeta } from '../../types/journey';
import {
  buildJourneyTransitionRecord,
  journeyTransitionRecordToContext,
} from './journey-transition';

const journeyMeta: JourneyMeta = {
  journeyId: 'journey-1',
  startLevel: 2,
  targetLevel: 5,
  gameMode: 'dual-track-dnb-hybrid',
  journeyName: 'Hybrid',
};

function makeAttempt(overrides: Partial<AttemptResult> = {}): AttemptResult {
  return {
    isValidating: false,
    score: 75,
    strategy: 'dualnback-classic',
    totalValidatingSessions: 0,
    sessionsRemaining: 1,
    stageCompleted: false,
    nextStageUnlocked: null,
    nextPlayableStage: 1,
    nextSessionGameMode: 'dual-track',
    journeyProtocol: 'hybrid-jaeggi',
    sessionRole: 'track-half',
    journeyDecision: 'pending-pair',
    journeyNameShort: 'Hybride DNB + Track',
    ...overrides,
  };
}

describe('journey-transition', () => {
  it('builds a typed transition record from legacy attempt data', () => {
    const transition = buildJourneyTransitionRecord({
      stageId: 1,
      journeyMeta,
      attempt: makeAttempt(),
    });

    expect(transition).toMatchObject({
      journeyId: 'journey-1',
      journeyStartLevel: 2,
      journeyTargetLevel: 5,
      journeyGameMode: 'dual-track-dnb-hybrid',
      stageId: 1,
      nLevel: 2,
      journeyDecision: 'pending-pair',
      nextSessionGameMode: 'dual-track',
    });
  });

  it('returns null when the stage cannot be resolved', () => {
    const transition = buildJourneyTransitionRecord({
      stageId: 99,
      journeyMeta,
      attempt: makeAttempt(),
    });

    expect(transition).toBeNull();
  });

  it('converts a transition record back into JourneyContext', () => {
    const transition = buildJourneyTransitionRecord({
      stageId: 1,
      journeyMeta,
      attempt: makeAttempt({
        progressPct: 25,
        bestScore: 88,
      }),
    });

    if (!transition) {
      throw new Error('expected transition');
    }

    const context = journeyTransitionRecordToContext(transition);

    expect(context).toMatchObject({
      journeyId: 'journey-1',
      stageId: 1,
      journeyGameMode: 'dual-track-dnb-hybrid',
      nextSessionGameMode: 'dual-track',
      journeyDecision: 'pending-pair',
      progressPct: 25,
      bestScore: 88,
    });
  });
});
