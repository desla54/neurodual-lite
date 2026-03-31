import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import type { ContextualMessage, SessionEndReportModel } from '@neurodual/logic';
import type { ReportLabels } from './types';
import { ReportHero } from './report-hero';

const labels = {
  upsScore: 'UPS',
  upsTooltip: 'tooltip',
  modeScoreLabel: 'Score',
  backToHome: 'Home',
  level: 'N-{level}',
} as unknown as ReportLabels;

const message: ContextualMessage = {
  level: 'good',
  headline: 'headline',
  subline: 'subline',
};

function createData(overrides: Partial<SessionEndReportModel> = {}): SessionEndReportModel {
  return {
    sessionId: 'session-1',
    createdAt: '2026-02-14T00:00:00.000Z',
    reason: 'completed',
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual N-Back Classique',
    nLevel: 1,
    activeModalities: ['position', 'audio'],
    trialsCount: 20,
    durationMs: 120000,
    ups: {
      score: 0,
      components: {
        accuracy: 0,
        confidence: null,
      },
      journeyEligible: false,
      tier: 'novice',
    },
    unifiedAccuracy: 0,
    modeScore: {
      labelKey: 'report.modeScore.jaeggiErrors',
      value: 100,
      unit: '%',
    },
    passed: false,
    totals: {
      hits: 0,
      misses: 10,
      falseAlarms: 10,
      correctRejections: 0,
    },
    byModality: {
      position: {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
        avgRT: null,
        dPrime: null,
      },
      audio: {
        hits: 0,
        misses: 10,
        falseAlarms: 10,
        correctRejections: 0,
        avgRT: null,
        dPrime: null,
      },
    },
    errorProfile: {
      errorRate: 1,
      missShare: 0.5,
      faShare: 0.5,
    },
    nextStep: {
      nextLevel: 1,
      direction: 'same',
    },
    ...overrides,
  };
}

describe('ReportHero', () => {
  it('uses green mode score when progressTone is up', () => {
    render(
      <ReportHero
        data={createData({
          modeScore: { labelKey: 'report.modeScore.jaeggiErrors', value: 0, unit: '%' },
        })}
        message={message}
        labels={labels}
        onBackToHome={() => {}}
        betaEnabled={false}
        progressTone="up"
      />,
    );

    expect(screen.getByText('0%').className).toContain('text-woven-correct');
  });

  it('uses red mode score when progressTone is down', () => {
    render(
      <ReportHero
        data={createData()}
        message={message}
        labels={labels}
        onBackToHome={() => {}}
        betaEnabled={false}
        progressTone="down"
      />,
    );

    expect(screen.getByText('100%').className).toContain('text-woven-incorrect');
  });

  it('uses focus mode score when progressTone is stay', () => {
    render(
      <ReportHero
        data={createData()}
        message={message}
        labels={labels}
        onBackToHome={() => {}}
        betaEnabled={false}
        progressTone="stay"
      />,
    );

    expect(screen.getByText('100%').className).toContain('text-woven-focus');
  });

  it('defaults to focus mode score when progressTone is missing', () => {
    render(
      <ReportHero
        data={createData()}
        message={message}
        labels={labels}
        onBackToHome={() => {}}
        betaEnabled={false}
      />,
    );

    expect(screen.getByText('100%').className).toContain('text-woven-focus');
  });
});
