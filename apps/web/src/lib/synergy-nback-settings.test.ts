import { describe, expect, it } from 'bun:test';
import { buildResolvedNbackModeSettings } from './synergy-nback-settings';

describe('buildResolvedNbackModeSettings', () => {
  it('preserves existing settings and applies journey level when synergy is absent', () => {
    const resolved = buildResolvedNbackModeSettings({
      modeSettings: { activeModalities: ['position', 'audio'], trialsCount: 24 },
      journeyNLevel: 4,
    });

    expect(resolved).toEqual({
      activeModalities: ['position', 'audio'],
      trialsCount: 24,
      nLevel: 4,
    });
  });

  it('forces synergy nback level and modality over free-mode defaults', () => {
    const resolved = buildResolvedNbackModeSettings({
      modeSettings: { activeModalities: ['position', 'audio'], nLevel: 2, trialsCount: 24 },
      journeyNLevel: 5,
      synergyConfig: {
        nbackModality: 'position',
        nbackNLevel: 7,
        nbackTrialsCount: 32,
      },
    });

    expect(resolved).toEqual({
      activeModalities: ['position'],
      nLevel: 7,
      trialsCount: 32,
      trialsCountMode: 'manual',
      guaranteedMatchProbability: 0.2,
      interferenceProbability: 0.125,
    });
  });

  it('maps each modality to a single-modality nback', () => {
    for (const modality of ['position', 'audio', 'color', 'image'] as const) {
      const resolved = buildResolvedNbackModeSettings({
        synergyConfig: { nbackModality: modality, nbackNLevel: 2, nbackTrialsCount: 10 },
      });
      expect(resolved.activeModalities).toEqual([modality]);
    }
  });
});
