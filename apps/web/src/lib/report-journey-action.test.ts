import { describe, expect, it } from 'bun:test';
import { resolveReportJourneyAction } from './report-journey-action';

describe('resolveReportJourneyAction', () => {
  it('relaunches the current Brain Workshop stage without overriding N when asking for a second chance', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 1,
        journeyId: 'bw-journey',
        currentJourneyStageId: 1,
        currentJourneyId: 'bw-journey',
        reportNLevel: 2,
        journeyGameModeId: 'sim-brainworkshop',
      }),
    ).toEqual({
      kind: 'relaunch-current-session',
      overrideNLevel: undefined,
    });
  });

  it('relaunches the current Dual N-Back classic stage at the suggested lower level', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 1,
        journeyId: 'classic-journey',
        currentJourneyStageId: 1,
        currentJourneyId: 'classic-journey',
        reportNLevel: 2,
        suggestedStartLevel: 1,
        journeyGameModeId: 'dualnback-classic',
      }),
    ).toEqual({
      kind: 'relaunch-current-session',
      overrideNLevel: 1,
    });
  });

  it('ignores suggestedStartLevel when it does not actually lower the session level', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 1,
        journeyId: 'classic-journey',
        currentJourneyStageId: 1,
        currentJourneyId: 'classic-journey',
        reportNLevel: 2,
        suggestedStartLevel: 2,
        journeyGameModeId: 'dualnback-classic',
      }),
    ).toEqual({
      kind: 'relaunch-current-session',
      overrideNLevel: undefined,
    });
  });

  it('navigates when the report targets a different journey stage', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 2,
        journeyId: 'bw-journey',
        currentJourneyStageId: 1,
        currentJourneyId: 'bw-journey',
        reportNLevel: 2,
        journeyGameModeId: 'sim-brainworkshop',
      }),
    ).toEqual({
      kind: 'navigate',
      intent: {
        playMode: 'journey',
        journeyStageId: 2,
        journeyId: 'bw-journey',
        journeyStartLevel: undefined,
        journeyTargetLevel: undefined,
        journeyGameModeId: 'sim-brainworkshop',
      },
    });
  });

  it('navigates when the stage matches but the journey changes', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 1,
        journeyId: 'journey-b',
        currentJourneyStageId: 1,
        currentJourneyId: 'journey-a',
        reportNLevel: 2,
        suggestedStartLevel: 1,
        journeyGameModeId: 'dualnback-classic',
      }),
    ).toEqual({
      kind: 'navigate',
      intent: {
        playMode: 'journey',
        journeyStageId: 1,
        journeyId: 'journey-b',
        journeyStartLevel: undefined,
        journeyTargetLevel: undefined,
        journeyGameModeId: 'dualnback-classic',
      },
    });
  });

  it('does not invent a lower-level override from invalid suggestedStartLevel values', () => {
    expect(
      resolveReportJourneyAction({
        stageId: 1,
        journeyId: 'classic-journey',
        currentJourneyStageId: 1,
        currentJourneyId: 'classic-journey',
        reportNLevel: 2,
        suggestedStartLevel: Number.NaN,
        journeyGameModeId: 'dualnback-classic',
      }),
    ).toEqual({
      kind: 'relaunch-current-session',
      overrideNLevel: undefined,
    });
  });
});
