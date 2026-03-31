import { describe, expect, it } from 'bun:test';

import { applyTrackingIdentityFeatures } from './dual-track-runtime';

describe('applyTrackingIdentityFeatures', () => {
  const baseConfig = {
    arenaWidthPx: 600,
    arenaHeightPx: 600,
    totalObjects: 8,
    targetCount: 3,
    highlightDurationMs: 2500,
    trackingDurationMs: 5000,
    speedPxPerSec: 160,
    motionComplexity: 'standard' as const,
    crowdingMode: 'standard' as const,
    crowdingThresholdPx: 88,
    minSeparationPx: 58,
  };

  it.each([
    'position',
    'image',
    'spatial',
    'digits',
    'emotions',
    'words',
  ] as const)('preserves %s as a visual traveler mode', (trackingIdentityMode) => {
    const resolved = applyTrackingIdentityFeatures(baseConfig, {
      trackingIdentityMode,
      trackingLetterAudioEnabled: false,
    });

    expect(resolved.trackingIdentityMode).toBe(trackingIdentityMode);
    expect(resolved.highlightDurationMs).toBeGreaterThan(baseConfig.highlightDurationMs);
  });

  it('extends the preview window for tone identity rounds', () => {
    const resolved = applyTrackingIdentityFeatures(baseConfig, {
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      trackingTonesEnabled: true,
    });

    expect(resolved.trackingIdentityMode).toBe('classic');
    expect(resolved.trackingTonesEnabled).toBe(true);
    expect(resolved.highlightDurationMs).toBeGreaterThan(baseConfig.highlightDurationMs);
  });

  it('keeps letter audio enabled for letter rounds', () => {
    const resolved = applyTrackingIdentityFeatures(baseConfig, {
      trackingIdentityMode: 'letter',
      trackingLetterAudioEnabled: false,
    });

    expect(resolved.trackingIdentityMode).toBe('classic');
    expect(resolved.trackingLetterAudioEnabled).toBe(true);
  });
});
