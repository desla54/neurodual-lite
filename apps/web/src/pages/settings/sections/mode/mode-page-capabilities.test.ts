import { describe, expect, it } from 'bun:test';

import { getModePageCapabilities, supportsModeSubPage } from './mode-page-capabilities';

describe('mode page capabilities', () => {
  it('keeps gridlock on real settings only', () => {
    const caps = getModePageCapabilities('gridlock', false);

    expect(caps.supportsPresets).toBe(false);
    expect(caps.inlineBaseSettings).toBe(false);
    expect(caps.hasTempo).toBe(false);
    expect(caps.hasGenerator).toBe(false);
    expect(caps.hasAdvanced).toBe(true);
    expect(supportsModeSubPage('gridlock', 'advanced', false)).toBe(true);
    expect(supportsModeSubPage('gridlock', 'base', false)).toBe(true);
  });

  it('keeps simple cognitive tasks on base only', () => {
    for (const mode of ['tower', 'stroop', 'flanker'] as const) {
      const caps = getModePageCapabilities(mode, false);

      expect(caps.hasTempo).toBe(false);
      expect(caps.hasGenerator).toBe(false);
      expect(caps.hasAdvanced).toBe(false);
    }

    expect(getModePageCapabilities('tower', false).supportsPresets).toBe(false);
    expect(getModePageCapabilities('stroop', false).supportsPresets).toBe(false);
    expect(getModePageCapabilities('flanker', false).supportsPresets).toBe(false);
    expect(getModePageCapabilities('dual-track', false).supportsPresets).toBe(true);
    expect(getModePageCapabilities('stroop', false).inlineBaseSettings).toBe(true);
    expect(getModePageCapabilities('flanker', false).inlineBaseSettings).toBe(true);
  });

  it('gives dual-track a modalities + motion split', () => {
    const caps = getModePageCapabilities('dual-track', false);

    expect(caps.hasTempo).toBe(true);
    expect(caps.hasGenerator).toBe(false);
    expect(caps.hasAdvanced).toBe(false);
  });

  it('preserves advanced pages for modes that really support them', () => {
    expect(getModePageCapabilities('sim-brainworkshop', false).hasTempo).toBe(true);
    expect(getModePageCapabilities('sim-brainworkshop', false).hasGenerator).toBe(true);
    expect(getModePageCapabilities('sim-brainworkshop', false).hasAdvanced).toBe(true);

    expect(getModePageCapabilities('dual-trace', false).hasTempo).toBe(true);
    expect(getModePageCapabilities('dual-trace', false).hasAdvanced).toBe(true);

    expect(getModePageCapabilities('dual-pick', false).hasGenerator).toBe(true);
    expect(getModePageCapabilities('dual-pick', false).hasAdvanced).toBe(false);
    expect(getModePageCapabilities('dual-pick', true).hasAdvanced).toBe(true);
  });
});
