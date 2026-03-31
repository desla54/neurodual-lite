import { describe, expect, it } from 'bun:test';
import {
  getStatsSpec,
  getModeDisplaySpec,
  getModeColors,
  getReportSections,
  getModeScoringStrategy,
  getModeI18nKey,
  getModeName,
  getAllModeIds,
  getBlockConfigFromSpec,
  GlobalStatsSpec,
  JourneyStatsSpec,
  DefaultStatsSpec,
  AllSpecs,
  DualCatchSpec,
  SimBrainWorkshopSpec,
  DualPlaceSpec,
  DualMemoSpec,
  DualPickSpec,
  DualTraceSpec,
} from './index';

describe('specs/index', () => {
  describe('getStatsSpec', () => {
    it('should return GlobalStatsSpec for "all"', () => {
      const spec = getStatsSpec('all');
      expect(spec).toBe(GlobalStatsSpec);
    });

    it('should return JourneyStatsSpec for "Journey"', () => {
      const spec = getStatsSpec('Journey');
      expect(spec).toBe(JourneyStatsSpec);
    });

    it('should return correct spec for i18n key DualTempo', () => {
      const spec = getStatsSpec('DualTempo');
      // @ts-expect-error test override
      expect(spec).toBe(DualCatchSpec.stats);
    });

    it('should return correct spec for i18n key DualPlace', () => {
      const spec = getStatsSpec('DualPlace');
      // @ts-expect-error test override
      expect(spec).toBe(DualPlaceSpec.stats);
    });

    it('should return correct spec for i18n key DualMemo', () => {
      const spec = getStatsSpec('DualMemo');
      // @ts-expect-error test override
      expect(spec).toBe(DualMemoSpec.stats);
    });

    it('should return correct spec for i18n key DualPick', () => {
      const spec = getStatsSpec('DualPick');
      // @ts-expect-error test override
      expect(spec).toBe(DualPickSpec.stats);
    });

    it('should return correct spec for i18n key DualTrace', () => {
      const spec = getStatsSpec('DualTrace');
      // @ts-expect-error test override
      expect(spec).toBe(DualTraceSpec.stats);
    });

    it('should return correct spec for i18n key DualnbackClassic', () => {
      const spec = getStatsSpec('DualnbackClassic');
      // @ts-expect-error test override
      expect(spec).toBe(AllSpecs['dualnback-classic'].stats);
    });

    it('should return correct spec for i18n key BrainWorkshop', () => {
      const spec = getStatsSpec('BrainWorkshop');
      // @ts-expect-error test override
      expect(spec).toBe(SimBrainWorkshopSpec.stats);
    });

    it('should return correct spec for i18n key Libre', () => {
      const spec = getStatsSpec('Libre');
      // @ts-expect-error test override
      expect(spec).toBe(AllSpecs.custom.stats);
    });

    it('should return correct spec for direct mode id', () => {
      const spec = getStatsSpec('dual-catch');
      // @ts-expect-error test override
      expect(spec).toBe(DualCatchSpec.stats);
    });

    it('should return DefaultStatsSpec for unknown mode', () => {
      const spec = getStatsSpec('unknown-mode');
      expect(spec).toBe(DefaultStatsSpec);
    });
  });

  describe('getModeDisplaySpec', () => {
    it('should return display spec for dual-catch', () => {
      const spec = getModeDisplaySpec('dual-catch');
      expect(spec).toBe(DualCatchSpec.report?.display);
    });

    it('should return default for unknown mode', () => {
      const spec = getModeDisplaySpec('unknown-mode');
      expect(spec.modeScoreKey).toBe('report.modeScore.accuracy');
    });
  });

  describe('getModeColors', () => {
    it('should return colors for dual-catch', () => {
      const colors = getModeColors('dual-catch');
      expect(colors).toBe(DualCatchSpec.report?.display?.colors);
    });

    it('should return default colors for unknown mode', () => {
      const colors = getModeColors('unknown-mode');
      expect(colors.bg).toBe('bg-gray-50');
      expect(colors.border).toBe('border-gray-200');
      expect(colors.text).toBe('text-gray-700');
      expect(colors.accent).toBe('gray-500');
    });
  });

  describe('getReportSections', () => {
    it('should return sections for dual-catch', () => {
      const sections = getReportSections('dual-catch');
      expect(sections).toBe(DualCatchSpec.report?.sections);
    });

    it('should return default sections for unknown mode', () => {
      const sections = getReportSections('unknown-mode');
      expect(sections).toEqual(['HERO', 'PERFORMANCE', 'DETAILS']);
    });
  });

  describe('getModeScoringStrategy', () => {
    it('should return sdt for dual-catch', () => {
      const strategy = getModeScoringStrategy('dual-catch');
      expect(strategy).toBe('sdt');
    });

    it('should return brainworkshop for sim-brainworkshop', () => {
      const strategy = getModeScoringStrategy('sim-brainworkshop');
      expect(strategy).toBe('brainworkshop');
    });

    it('should return accuracy for dual-place', () => {
      const strategy = getModeScoringStrategy('dual-place');
      expect(strategy).toBe('accuracy');
    });

    it('should return undefined for undefined input', () => {
      const strategy = getModeScoringStrategy(undefined);
      expect(strategy).toBeUndefined();
    });

    it('should return undefined for unknown mode', () => {
      const strategy = getModeScoringStrategy('unknown-mode');
      expect(strategy).toBeUndefined();
    });
  });

  describe('getModeI18nKey', () => {
    it('should return correct key for dual-catch', () => {
      const key = getModeI18nKey('dual-catch');
      expect(key).toBe('settings.gameMode.dualCatch');
    });

    it('should return correct key for dualnback-classic', () => {
      const key = getModeI18nKey('dualnback-classic');
      expect(key).toBe('settings.gameMode.dualnbackClassic');
    });

    it('should return correct key for sim-brainworkshop', () => {
      const key = getModeI18nKey('sim-brainworkshop');
      expect(key).toBe('settings.gameMode.brainWorkshop');
    });

    it('should return correct key for custom', () => {
      const key = getModeI18nKey('custom');
      expect(key).toBe('settings.gameMode.libre');
    });

    it('should return empty string for undefined', () => {
      const key = getModeI18nKey(undefined);
      expect(key).toBe('');
    });

    it('should return empty string for unknown mode', () => {
      const key = getModeI18nKey('unknown-mode');
      expect(key).toBe('');
    });
  });

  describe('getModeName', () => {
    it('should return display name for dual-catch', () => {
      const name = getModeName('dual-catch');
      expect(name).toBe(DualCatchSpec.metadata.displayName);
    });

    it('should return display name for dual-place', () => {
      const name = getModeName('dual-place');
      expect(name).toBe(DualPlaceSpec.metadata.displayName);
    });

    it('should return empty string for undefined', () => {
      const name = getModeName(undefined);
      expect(name).toBe('');
    });

    it('should return mode id as fallback for unknown mode', () => {
      const name = getModeName('unknown-mode');
      expect(name).toBe('unknown-mode');
    });
  });

  describe('getAllModeIds', () => {
    it('should return all mode ids', () => {
      const ids = getAllModeIds();
      expect(ids).toContain('dual-catch');
      expect(ids).toContain('dualnback-classic');
      expect(ids).toContain('sim-brainworkshop');
      expect(ids).toContain('custom');
      expect(ids).toContain('dual-place');
      expect(ids).toContain('dual-memo');
      expect(ids).toContain('dual-pick');
      expect(ids).toContain('dual-trace');
    });

    it('should return array', () => {
      const ids = getAllModeIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  describe('getBlockConfigFromSpec', () => {
    it('should convert basic spec to block config', () => {
      const config = getBlockConfigFromSpec(DualCatchSpec);
      expect(config.nLevel).toBe(DualCatchSpec.defaults.nLevel);
      expect(config.generator).toBe(DualCatchSpec.generation.generator);
      expect(config.trialsCount).toBe(DualCatchSpec.defaults.trialsCount);
      expect(config.targetProbability).toBe(DualCatchSpec.generation.targetProbability);
      expect(config.intervalSeconds).toBe(DualCatchSpec.timing.intervalMs / 1000);
      expect(config.stimulusDurationSeconds).toBe(DualCatchSpec.timing.stimulusDurationMs / 1000);
    });

    it('should handle lureProbability default', () => {
      const config = getBlockConfigFromSpec(DualCatchSpec);
      expect(config.lureProbability).toBe(DualCatchSpec.generation.lureProbability ?? 0);
    });

    describe('BrainWorkshop multi-stimulus expansion', () => {
      it('should expand position modalities for multiStimulus > 1', () => {
        // SimBrainWorkshopSpec has extensions.multiStimulus
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'audio'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 3,
            multiAudio: 1,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        expect(config.activeModalities).toContain('position');
        expect(config.activeModalities).toContain('position2');
        expect(config.activeModalities).toContain('position3');
      });

      it('should expand audio modalities for multiAudio > 1', () => {
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'audio'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 1,
            multiAudio: 2,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        expect(config.activeModalities).toContain('audio');
        expect(config.activeModalities).toContain('audio2');
      });

      it('should not expand multiStimulus when arithmetic is present', () => {
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'audio', 'arithmetic'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 4,
            multiAudio: 1,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        // multiStimulus should be clamped to 1 due to arithmetic
        expect(config.activeModalities).not.toContain('position2');
      });

      it('should add vis modalities when color is present with multiStimulus', () => {
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'audio', 'color'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 2,
            multiAudio: 1,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        // Should have vis1 and vis2, and color should be removed
        expect(config.activeModalities).toContain('vis1');
        expect(config.activeModalities).toContain('vis2');
        expect(config.activeModalities).not.toContain('color');
      });

      it('should not expand when both color and image are present', () => {
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'audio', 'color', 'image'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 4,
            multiAudio: 1,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        // multiStimulus should be clamped to 1 due to color+image
        expect(config.activeModalities).not.toContain('position2');
        expect(config.activeModalities).not.toContain('vis1');
      });

      it('should handle combination modes (visvis)', () => {
        const bwSpec = {
          ...SimBrainWorkshopSpec,
          defaults: {
            ...SimBrainWorkshopSpec.defaults,
            activeModalities: ['position', 'visvis'],
          },
          extensions: {
            ...SimBrainWorkshopSpec.extensions,
            multiStimulus: 4,
            multiAudio: 2,
          },
        };
        const config = getBlockConfigFromSpec(bwSpec as typeof SimBrainWorkshopSpec);
        // Combination modes disable multiStimulus and multiAudio
        expect(config.activeModalities).not.toContain('position2');
        expect(config.activeModalities).not.toContain('audio2');
        // But should include audio and combination modalities
        expect(config.activeModalities).toContain('audio');
        expect(config.activeModalities).toContain('visvis');
        expect(config.activeModalities).toContain('visaudio');
        expect(config.activeModalities).toContain('audiovis');
      });
    });

    it('should pass through activeModalities for non-BrainWorkshop generators', () => {
      const config = getBlockConfigFromSpec(DualCatchSpec);
      expect(config.activeModalities).toEqual(
        expect.arrayContaining(DualCatchSpec.defaults.activeModalities),
      );
    });
  });
});
