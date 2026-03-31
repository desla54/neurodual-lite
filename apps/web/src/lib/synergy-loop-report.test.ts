import { describe, expect, it } from 'bun:test';
import type { SessionEndReportModel } from '@neurodual/logic';
import { buildSynergyLoopViewModel } from './synergy-loop-report';

function createReport(overrides: Partial<SessionEndReportModel> = {}): SessionEndReportModel {
  return {
    sessionId: overrides.sessionId ?? 'session-1',
    createdAt: overrides.createdAt ?? '2026-03-17T10:00:00.000Z',
    reason: 'completed',
    gameMode: overrides.gameMode ?? 'dual-track',
    gameModeLabel: overrides.gameModeLabel ?? 'Dual Track',
    playContext: 'synergy',
    nLevel: overrides.nLevel ?? 2,
    activeModalities: overrides.activeModalities ?? ['position'],
    trialsCount: overrides.trialsCount ?? 10,
    durationMs: overrides.durationMs ?? 60000,
    ups: overrides.ups ?? {
      score: 80,
      components: { accuracy: 78, confidence: 82 },
      journeyEligible: true,
      tier: 'advanced',
    },
    unifiedAccuracy: overrides.unifiedAccuracy ?? 0.8,
    modeScore: overrides.modeScore ?? {
      labelKey: 'report.modeScore.percent',
      value: 80,
      unit: '%',
    },
    passed: overrides.passed ?? true,
    totals: overrides.totals ?? {
      hits: 8,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 9,
    },
    byModality:
      overrides.byModality ??
      ({
        position: {
          hits: 8,
          misses: 2,
          falseAlarms: 1,
          correctRejections: 9,
          avgRT: 620,
          dPrime: 1.4,
        },
      } as SessionEndReportModel['byModality']),
    errorProfile: overrides.errorProfile ?? {
      errorRate: 0.15,
      missShare: 0.66,
      faShare: 0.34,
    },
    xpBreakdown: overrides.xpBreakdown,
  };
}

describe('buildSynergyLoopViewModel', () => {
  it('aggregates child reports into a loop-level synthetic report', () => {
    const trackReport = createReport({
      sessionId: 'track-1',
      createdAt: '2026-03-17T10:00:00.000Z',
      gameMode: 'dual-track',
      gameModeLabel: 'Dual Track',
      activeModalities: ['position', 'color'],
      ups: {
        score: 82,
        components: { accuracy: 80, confidence: 84 },
        journeyEligible: true,
        tier: 'advanced',
      },
      totals: {
        hits: 12,
        misses: 3,
        falseAlarms: null,
        correctRejections: null,
      },
      byModality: {
        position: {
          hits: 12,
          misses: 3,
          falseAlarms: null,
          correctRejections: null,
          avgRT: 900,
          dPrime: null,
        },
        color: {
          hits: 10,
          misses: 5,
          falseAlarms: null,
          correctRejections: null,
          avgRT: null,
          dPrime: null,
        },
      } as SessionEndReportModel['byModality'],
      xpBreakdown: {
        base: 10,
        performance: 10,
        accuracy: 10,
        badgeBonus: 0,
        streakBonus: 0,
        dailyBonus: 0,
        flowBonus: 0,
        confidenceMultiplier: 1,
        subtotalBeforeConfidence: 30,
        total: 30,
        dailyCapReached: false,
      },
    });
    const nbackReport = createReport({
      sessionId: 'nback-1',
      createdAt: '2026-03-17T10:05:00.000Z',
      gameMode: 'dualnback-classic',
      gameModeLabel: 'N-Back',
      activeModalities: ['audio'],
      ups: {
        score: 74,
        components: { accuracy: 72, confidence: 70 },
        journeyEligible: true,
        tier: 'intermediate',
      },
      totals: {
        hits: 11,
        misses: 4,
        falseAlarms: 2,
        correctRejections: 13,
      },
      byModality: {
        audio: {
          hits: 11,
          misses: 4,
          falseAlarms: 2,
          correctRejections: 13,
          avgRT: 710,
          dPrime: 1.1,
        },
      } as SessionEndReportModel['byModality'],
      xpBreakdown: {
        base: 12,
        performance: 12,
        accuracy: 10,
        badgeBonus: 0,
        streakBonus: 0,
        dailyBonus: 0,
        flowBonus: 0,
        confidenceMultiplier: 1,
        subtotalBeforeConfidence: 34,
        total: 34,
        dailyCapReached: false,
      },
    });

    const viewModel = buildSynergyLoopViewModel(
      [
        {
          mode: 'dual-track',
          score: 82,
          nLevel: 2,
          sessionId: trackReport.sessionId,
          report: trackReport,
          xpBreakdown: trackReport.xpBreakdown,
        },
        {
          mode: 'dualnback-classic',
          score: 74,
          nLevel: 2,
          sessionId: nbackReport.sessionId,
          report: nbackReport,
          xpBreakdown: nbackReport.xpBreakdown,
        },
      ],
      {
        totalLoops: 5,
        dualTrackIdentityMode: 'color',
        dualTrackNLevel: 2,
        dualTrackTrialsCount: 3,
        dualTrackTrackingDurationMs: 5000,
        dualTrackTrackingSpeedPxPerSec: 160,
        dualTrackMotionComplexity: 'standard',
        dualTrackCrowdingMode: 'standard',
        nbackModality: 'audio',
        nbackNLevel: 2,
        nbackTrialsCount: 10,
      },
    );

    expect(viewModel.report?.gameModeLabel).toBe('Synergy');
    expect(viewModel.report?.modeScore.value).toBe(78);
    expect(viewModel.report?.activeModalities).toEqual(['position', 'audio', 'color']);
    expect(viewModel.report?.totals).toEqual({
      hits: 23,
      misses: 7,
      falseAlarms: 2,
      correctRejections: 13,
    });
    expect(viewModel.avgTrackScore).toBe(82);
    expect(viewModel.avgNbackScore).toBe(74);
    expect(viewModel.totalXp).toBe(64);
  });

  it('keeps placeholder rounds for unfinished future loops in the chart', () => {
    const viewModel = buildSynergyLoopViewModel([{ mode: 'dual-track', score: 81, nLevel: 2 }], {
      totalLoops: 3,
      dualTrackIdentityMode: 'color',
      dualTrackNLevel: 2,
      dualTrackTrialsCount: 3,
      dualTrackTrackingDurationMs: 5000,
      dualTrackTrackingSpeedPxPerSec: 160,
      dualTrackMotionComplexity: 'standard',
      dualTrackCrowdingMode: 'standard',
      nbackModality: 'position',
      nbackNLevel: 2,
      nbackTrialsCount: 10,
    });

    expect(viewModel.roundChartData).toEqual([
      { round: '1', track: 81 },
      { round: '2' },
      { round: '3' },
    ]);
  });
});
