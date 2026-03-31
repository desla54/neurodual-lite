import { describe, expect, it } from 'bun:test';

import { resolveJourneyPresentation } from './presentation';

describe('resolveJourneyPresentation', () => {
  it('describes the hybrid journey from strategy config instead of hardcoded UI values', () => {
    const presentation = resolveJourneyPresentation({
      gameMode: 'dual-track-dnb-hybrid',
      strategyConfig: {
        hybrid: {
          trackSessionsPerBlock: 2,
          dnbSessionsPerBlock: 4,
        },
      },
    });

    expect(presentation.iconModeIds).toEqual(['dual-track', 'dualnback-classic']);
    expect(presentation.rulesDescription.values).toEqual({
      trackCount: 2,
      dnbCount: 4,
    });
  });

  it('describes dual-track mastery with the continuous-stage rules', () => {
    const presentation = resolveJourneyPresentation({ gameMode: 'dual-track' });

    expect(presentation.title.defaultValue).toBe('Dual Track');
    expect(presentation.rules).toHaveLength(5);
    expect(presentation.rules[0]?.text.defaultValue).toContain('calibration');
  });
});
