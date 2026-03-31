import { describe, expect, it } from 'bun:test';

import {
  canUseJourneySettingsScope,
  resolveConcreteJourneySessionMode,
} from './journey-session-mode';

describe('resolveConcreteJourneySessionMode', () => {
  it('prefers the next concrete session mode from journey state', () => {
    expect(
      resolveConcreteJourneySessionMode({
        journeyGameModeId: 'dual-track-dnb-hybrid',
        nextSessionGameModeId: 'dualnback-classic',
        fallbackModeId: 'dual-track',
      }),
    ).toBe('dualnback-classic');
  });

  it('keeps the current concrete mode when the hybrid next mode is missing', () => {
    expect(
      resolveConcreteJourneySessionMode({
        journeyGameModeId: 'dual-track-dnb-hybrid',
        fallbackModeId: 'dualnback-classic',
      }),
    ).toBe('dualnback-classic');
  });

  it('bootstraps hybrid journeys to dual-track when no concrete mode is known yet', () => {
    expect(
      resolveConcreteJourneySessionMode({
        journeyGameModeId: 'dual-track-dnb-hybrid',
      }),
    ).toBe('dual-track');
  });

  it('returns the journey mode directly for non-hybrid journeys', () => {
    expect(
      resolveConcreteJourneySessionMode({
        journeyGameModeId: 'sim-brainworkshop',
      }),
    ).toBe('sim-brainworkshop');
  });
});

describe('canUseJourneySettingsScope', () => {
  it('allows both concrete modes inside the hybrid journey scope', () => {
    expect(
      canUseJourneySettingsScope({
        journeyGameModeId: 'dual-track-dnb-hybrid',
        modeId: 'dual-track',
      }),
    ).toBe(true);
    expect(
      canUseJourneySettingsScope({
        journeyGameModeId: 'dual-track-dnb-hybrid',
        modeId: 'dualnback-classic',
      }),
    ).toBe(true);
  });

  it('rejects unrelated modes for the hybrid journey scope', () => {
    expect(
      canUseJourneySettingsScope({
        journeyGameModeId: 'dual-track-dnb-hybrid',
        modeId: 'dual-trace',
      }),
    ).toBe(false);
  });

  it('keeps simulator journeys scoped to their own mode', () => {
    expect(
      canUseJourneySettingsScope({
        journeyGameModeId: 'sim-brainworkshop',
        modeId: 'sim-brainworkshop',
      }),
    ).toBe(true);
    expect(
      canUseJourneySettingsScope({
        journeyGameModeId: 'sim-brainworkshop',
        modeId: 'dualnback-classic',
      }),
    ).toBe(false);
  });
});
