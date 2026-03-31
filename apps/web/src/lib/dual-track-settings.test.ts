import { describe, expect, it } from 'bun:test';

import {
  DUAL_TRACK_AUDIO_PROGRESS_THRESHOLD_PCT,
  DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT,
  relaxDualTrackCrowdingForIdentityLoad,
  normalizeDualTrackResolvedSettings,
  resolveAdaptiveDualTrackIdentitySettings,
  resolveDualTrackJourneyPreset,
  resolveDualTrackModeSettings,
  resolveEffectiveDualTrackIdentityMode,
} from './dual-track-settings';

describe('resolveEffectiveDualTrackIdentityMode', () => {
  it('uses the selected mode in free play', () => {
    expect(
      resolveEffectiveDualTrackIdentityMode({
        manualMode: 'color',
        playMode: 'free',
        calibrationPending: false,
      }),
    ).toBe('color');
  });

  it('keeps the selected mode during journey calibration', () => {
    expect(
      resolveEffectiveDualTrackIdentityMode({
        manualMode: 'color',
        playMode: 'journey',
        calibrationPending: true,
      }),
    ).toBe('color');
  });
});

describe('resolveAdaptiveDualTrackIdentitySettings', () => {
  it('keeps easy journeys on position only', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        preset: 'easy',
        manualMode: 'color',
        manualLetterAudioEnabled: true,
        progressPct: 100,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      autoPhase: 'classic',
    });
  });

  it('adds audio but never color for medium journeys', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        preset: 'medium',
        manualMode: 'color',
        manualLetterAudioEnabled: true,
        progressPct: DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: true,
      autoPhase: 'audio',
    });
  });

  it('keeps hard journeys aligned with the current hard path', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        preset: 'hard',
        manualMode: 'classic',
        manualLetterAudioEnabled: false,
        progressPct: DUAL_TRACK_AUDIO_PROGRESS_THRESHOLD_PCT,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'color',
      trackingLetterAudioEnabled: true,
      autoPhase: 'color-audio',
    });
  });

  it('keeps the classic mode before the color threshold', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        manualMode: 'classic',
        manualLetterAudioEnabled: false,
        progressPct: DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT - 1,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      autoPhase: 'classic',
    });
  });

  it('adds colors once the journey progress reaches the color threshold', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        manualMode: 'classic',
        manualLetterAudioEnabled: false,
        progressPct: DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'color',
      trackingLetterAudioEnabled: false,
      autoPhase: 'color',
    });
  });

  it('adds audio after the audio threshold without removing colors', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        manualMode: 'classic',
        manualLetterAudioEnabled: false,
        progressPct: DUAL_TRACK_AUDIO_PROGRESS_THRESHOLD_PCT,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'color',
      trackingLetterAudioEnabled: true,
      autoPhase: 'color-audio',
    });
  });

  it('preserves manual audio even before adaptive thresholds', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        manualMode: 'classic',
        manualLetterAudioEnabled: true,
        progressPct: 10,
        calibrationPending: false,
      }),
    ).toEqual({
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: true,
      autoPhase: 'classic',
    });
  });

  it('disables the automatic escalation during calibration', () => {
    expect(
      resolveAdaptiveDualTrackIdentitySettings({
        manualMode: 'classic',
        manualLetterAudioEnabled: false,
        progressPct: 100,
        calibrationPending: true,
      }),
    ).toEqual({
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      autoPhase: 'classic',
    });
  });
});

describe('resolveDualTrackJourneyPreset', () => {
  it('defaults journey dual-track presets to medium', () => {
    expect(
      resolveDualTrackJourneyPreset({
        playMode: 'journey',
        journeyGameMode: 'dual-track',
      }),
    ).toBe('medium');
  });

  it('reads the configured preset for dual-track journeys', () => {
    expect(
      resolveDualTrackJourneyPreset({
        playMode: 'journey',
        journeyGameMode: 'dual-track',
        journeyStrategyConfig: {
          dualTrack: {
            preset: 'medium',
          },
        },
      }),
    ).toBe('medium');
  });

  it('returns null outside journey dual-track mode', () => {
    expect(
      resolveDualTrackJourneyPreset({
        playMode: 'free',
        journeyGameMode: 'dual-track',
      }),
    ).toBeNull();
  });
});

describe('relaxDualTrackCrowdingForIdentityLoad', () => {
  it('keeps crowding unchanged when the combined color+audio load is not active', () => {
    expect(
      relaxDualTrackCrowdingForIdentityLoad('dense', {
        trackingIdentityMode: 'color',
        trackingLetterAudioEnabled: false,
      }),
    ).toBe('dense');
  });

  it('reduces dense to standard for color+audio rounds', () => {
    expect(
      relaxDualTrackCrowdingForIdentityLoad('dense', {
        trackingIdentityMode: 'color',
        trackingLetterAudioEnabled: true,
      }),
    ).toBe('standard');
  });

  it('reduces standard to low for color+audio rounds', () => {
    expect(
      relaxDualTrackCrowdingForIdentityLoad('standard', {
        trackingIdentityMode: 'color',
        trackingLetterAudioEnabled: true,
      }),
    ).toBe('low');
  });

  it('keeps low at low for color+audio rounds', () => {
    expect(
      relaxDualTrackCrowdingForIdentityLoad('low', {
        trackingIdentityMode: 'color',
        trackingLetterAudioEnabled: true,
      }),
    ).toBe('low');
  });
});

describe('resolveDualTrackModeSettings', () => {
  it('overrides free dual-track settings with the synergy configuration', () => {
    expect(
      resolveDualTrackModeSettings({
        playMode: 'synergy',
        synergyConfig: {
          totalLoops: 5,
          dualTrackIdentityMode: 'letter',
          dualTrackNLevel: 2,
          dualTrackTrialsCount: 14,
          dualTrackTrackingDurationMs: 6500,
          dualTrackTrackingSpeedPxPerSec: 190,
          dualTrackMotionComplexity: 'agile',
          dualTrackCrowdingMode: 'dense',
          nbackModality: 'audio',
          nbackNLevel: 2,
          nbackTrialsCount: 20,
        },
        freeModeSettings: { nLevel: 3, trackingIdentityMode: 'color' },
      }),
    ).toEqual({
      nLevel: 2,
      trialsCount: 14,
      totalObjectsMode: 'auto',
      ballsOffset: 0,
      trackingDurationMode: 'manual',
      trackingDurationMs: 6500,
      trackingSpeedMode: 'manual',
      trackingSpeedPxPerSec: 190,
      trackingIdentityMode: 'letter',
      trackingLetterAudioEnabled: true,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
    });
  });

  it.each([
    'position',
    'image',
    'spatial',
    'digits',
    'emotions',
    'words',
  ] as const)('keeps %s when a synergy config provides a visual identity mode', (dualTrackIdentityMode) => {
    expect(
      resolveDualTrackModeSettings({
        playMode: 'synergy',
        synergyConfig: {
          totalLoops: 5,
          dualTrackIdentityMode,
          dualTrackNLevel: 2,
          dualTrackTrialsCount: 14,
          dualTrackTrackingDurationMs: 6500,
          dualTrackTrackingSpeedPxPerSec: 190,
          dualTrackMotionComplexity: 'agile',
          dualTrackCrowdingMode: 'dense',
          nbackModality: 'image',
          nbackNLevel: 2,
          nbackTrialsCount: 20,
        },
      }),
    ).toMatchObject({
      trackingIdentityMode: dualTrackIdentityMode,
      trackingLetterAudioEnabled: false,
    });
  });

  it('does not leak free-training settings into pure journey sessions', () => {
    expect(
      resolveDualTrackModeSettings({
        playMode: 'journey',
        journeyGameMode: 'dual-track',
        freeModeSettings: { targetCount: 5, crowdingMode: 'dense' },
        journeyModeSettings: { targetCount: 3 },
      }),
    ).toEqual({ targetCount: 3 });
  });

  it('applies the hybrid track profile before journey overrides', () => {
    const resolved = resolveDualTrackModeSettings({
      playMode: 'journey',
      journeyGameMode: 'dual-track-dnb-hybrid',
      journeyNLevel: 4,
      freeModeSettings: { targetCount: 7 },
      journeyModeSettings: { trackingIdentityMode: 'letter' },
    });

    expect(resolved.trackingDurationMs).toBe(16000);
    expect(resolved.crowdingMode).toBe('dense');
    expect(resolved.trackingIdentityMode).toBe('letter');
  });

  it('keeps free-training settings for free sessions', () => {
    expect(
      resolveDualTrackModeSettings({
        playMode: 'free',
        freeModeSettings: { targetCount: 5 },
        journeyModeSettings: { targetCount: 3 },
      }),
    ).toEqual({ targetCount: 5 });
  });
});

describe('normalizeDualTrackResolvedSettings', () => {
  it('normalizes the color and audio identity flags from resolved extensions', () => {
    expect(
      normalizeDualTrackResolvedSettings({
        trackingIdentityMode: 'letter',
        trackingLetterAudioEnabled: false,
        motionComplexity: 'agile',
        crowdingMode: 'dense',
        focusCrossEnabled: true,
      }),
    ).toEqual({
      totalObjects: undefined,
      targetCount: undefined,
      highlightDurationMs: undefined,
      trackingDurationMs: undefined,
      speedPxPerSec: undefined,
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: true,
      trackingTonesEnabled: false,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
      focusCrossEnabled: true,
      highlightSpacingMs: undefined,
    });
  });

  it('falls back to classic defaults when extensions are missing or invalid', () => {
    expect(
      normalizeDualTrackResolvedSettings({
        totalObjects: Number.NaN,
        trackingDurationMs: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      totalObjects: undefined,
      targetCount: undefined,
      highlightDurationMs: undefined,
      trackingDurationMs: undefined,
      speedPxPerSec: undefined,
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      trackingTonesEnabled: false,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
      focusCrossEnabled: false,
      highlightSpacingMs: undefined,
    });
  });

  it.each([
    'position',
    'image',
    'spatial',
    'digits',
    'emotions',
    'words',
  ] as const)('accepts %s as a normalized manual identity mode', (trackingIdentityMode) => {
    expect(
      normalizeDualTrackResolvedSettings({
        trackingIdentityMode,
      }),
    ).toMatchObject({
      trackingIdentityMode,
      trackingLetterAudioEnabled: false,
    });
  });
});
