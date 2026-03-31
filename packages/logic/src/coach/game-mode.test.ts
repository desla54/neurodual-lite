import { describe, expect, it } from 'bun:test';
import { gameModeRegistry, type GameModeDefinition, type ModeSettings } from './game-mode';
import { AllSpecs } from '../specs';
import type { ModeSpec } from '../specs/types';

/**
 * Helper: Create a minimal valid ModeSpec for testing.
 * All required fields are populated with sensible defaults.
 */
function createTestSpec(overrides?: Partial<ModeSpec>): ModeSpec {
  return {
    metadata: {
      id: 'test-mode',
      displayName: 'Test Mode',
      description: 'Test description',
      tags: ['test'],
      difficultyLevel: 1,
      version: '1.0.0',
    },
    sessionType: 'GameSession',
    scoring: {
      strategy: 'sdt',
      passThreshold: 1.5,
      downThreshold: 0.8,
    },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 2500,
    },
    generation: {
      generator: 'Sequence',
      targetProbability: 0.3,
      lureProbability: 0.15,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
    },
    adaptivity: {
      algorithm: 'none',
      nLevelSource: 'user',
      configurableSettings: [],
    },
    report: {
      sections: ['HERO', 'PERFORMANCE'],
      display: {
        modeScoreKey: 'report.modeScore.dprime',
        modeScoreTooltipKey: 'report.modeScore.tooltip',
        speedStatKey: 'report.speedStat.responseTime',
        colors: {
          bg: '#000000',
          border: '#111111',
          text: '#ffffff',
          accent: '#00ff00',
        },
      },
    },
    extensions: {},
    ...overrides,
  };
}

describe('GameModeRegistry', () => {
  describe('Basic operations', () => {
    it('should list registered modes', () => {
      const modes = gameModeRegistry.list();
      expect(modes).toContain('dual-catch');
      expect(modes).toContain('custom');
    });

    it('should get mode definition by ID', () => {
      const mode = gameModeRegistry.get('dual-catch');
      expect(mode.id).toBe('dual-catch');
      expect(mode.displayName).toBe('Dual Catch');
    });

    it('should throw for unknown mode', () => {
      expect(() => gameModeRegistry.get('unknown')).toThrow(/Unknown GameMode/);
    });

    it('should register a new mode with valid spec', () => {
      const newMode: GameModeDefinition = {
        id: 'test-mode-valid',
        spec: createTestSpec({ metadata: { ...createTestSpec().metadata, id: 'test-mode-valid' } }),
        displayName: 'Test Mode',
        description: 'Test description',
        generatorName: 'DualnbackClassic',
        algorithmName: 'none',
        scoringStrategyName: 'SDT',
        defaultConfig: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 10,
          targetProbability: 0.3,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
        },
        tags: ['test'],
        difficultyLevel: 1,
        configurableSettings: ['nLevel'],
        nLevelSource: 'user',
      };

      gameModeRegistry.register(newMode);
      expect(gameModeRegistry.has('test-mode-valid')).toBe(true);
      expect(gameModeRegistry.get('test-mode-valid')).toBe(newMode);
    });

    it('should throw when registering mode with invalid spec', () => {
      const invalidMode: GameModeDefinition = {
        id: 'invalid-spec-mode',
        spec: { extensions: {} } as any, // Invalid: missing required fields
        displayName: 'Invalid',
        description: 'desc',
        generatorName: 'DualnbackClassic',
        algorithmName: 'none',
        scoringStrategyName: 'SDT',
        defaultConfig: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 10,
          targetProbability: 0.3,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
        },
        tags: [],
        difficultyLevel: 1,
        configurableSettings: [],
        nLevelSource: 'user',
      };

      expect(() => gameModeRegistry.register(invalidMode)).toThrow(/Invalid spec/);
    });

    it('should throw when registering existing ID', () => {
      const duplicate = { id: 'dual-catch' } as GameModeDefinition;
      expect(() => gameModeRegistry.register(duplicate)).toThrow(/already registered/);
    });

    it('should filter modes by tag', () => {
      const trainingModes = gameModeRegistry.getByTag('training');
      expect(trainingModes.length).toBeGreaterThan(0);
      expect(trainingModes.every((m) => m.tags.includes('training'))).toBe(true);
    });

    it('should include gridlock in the built-in registry', () => {
      expect(gameModeRegistry.has('gridlock')).toBe(true);
      expect(gameModeRegistry.get('gridlock').id).toBe('gridlock');
    });

    it('should register every mode spec from AllSpecs', () => {
      for (const modeId of Object.keys(AllSpecs)) {
        expect(gameModeRegistry.has(modeId)).toBe(true);
      }
    });
  });

  describe('resolveWithSettings', () => {
    it('should apply configurable settings', () => {
      const settings: ModeSettings = {
        nLevel: 4,
        trialsCount: 50,
        activeModalities: ['audio'],
      };

      // Mode 'dual-catch' has configurableSettings: ['nLevel', 'activeModalities']
      // 'trialsCount' is NOT configurable for this mode.
      const resolved = gameModeRegistry.resolveWithSettings('dual-catch', settings);

      expect(resolved.config.nLevel).toBe(4);
      expect(resolved.config.activeModalities).toEqual(['audio']);
      expect(resolved.config.trialsCount).toBe(20); // Remained at default
    });

    it('should let dualnback-classic override modalities and trials count', () => {
      const resolved = gameModeRegistry.resolveWithSettings('dualnback-classic', {
        nLevel: 4,
        trialsCount: 12,
        activeModalities: ['audio'],
      });

      expect(resolved.config.nLevel).toBe(4);
      expect(resolved.config.trialsCount).toBe(12);
      expect(resolved.config.activeModalities).toEqual(['audio']);
      expect(resolved.spec.defaults.nLevel).toBe(4);
      expect(resolved.spec.defaults.trialsCount).toBe(12);
      expect(resolved.spec.defaults.activeModalities).toEqual(['audio']);
    });

    it('should apply BW multi-stimulus timing bonus by default', () => {
      const resolved = gameModeRegistry.resolveWithSettings('sim-brainworkshop', {
        multiStimulus: 4,
      });

      // BW default: 30 ticks + 15 bonus ticks (multi-4) = 45 ticks = 4500ms
      expect(resolved.spec.timing.intervalMs).toBe(4500);
      // BW extinction: 5 ticks + (4-1) extra ticks = 8 ticks = 800ms
      expect(resolved.spec.timing.stimulusDurationMs).toBe(800);
    });

    it('should not override explicit timing overrides when multiStimulus changes', () => {
      const resolved = gameModeRegistry.resolveWithSettings('sim-brainworkshop', {
        multiStimulus: 4,
        intervalSeconds: 10,
        stimulusDurationSeconds: 1,
      });

      expect(resolved.spec.timing.intervalMs).toBe(10000);
      expect(resolved.spec.timing.stimulusDurationMs).toBe(1000);
    });

    it('should default to 35 ticks (3.5s) for BW combination modalities', () => {
      const resolved = gameModeRegistry.resolveWithSettings('sim-brainworkshop', {
        activeModalities: ['visvis', 'visaudio', 'audiovis', 'audio'],
      });

      expect(resolved.spec.timing.intervalMs).toBe(3500);
    });

    it('should default to 40 ticks (4.0s) for BW arithmetic modalities', () => {
      const resolved = gameModeRegistry.resolveWithSettings('sim-brainworkshop', {
        activeModalities: ['arithmetic'],
      });

      expect(resolved.spec.timing.intervalMs).toBe(4000);
    });

    it('should use profile nLevel if source is profile', () => {
      const adaptiveSpec = createTestSpec({
        metadata: { ...createTestSpec().metadata, id: 'adaptive-profile' },
        adaptivity: {
          algorithm: 'none',
          nLevelSource: 'profile',
          configurableSettings: ['activeModalities'],
        },
      });
      const adaptiveMode: GameModeDefinition = {
        id: 'adaptive-profile',
        spec: adaptiveSpec,
        displayName: 'Adaptive',
        description: 'desc',
        generatorName: 'Sequence',
        algorithmName: 'none',
        scoringStrategyName: 'SDT',
        defaultConfig: {
          nLevel: 1,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.3,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
        },
        tags: ['training'],
        difficultyLevel: 1,
        configurableSettings: ['activeModalities'],
        nLevelSource: 'profile',
      };
      gameModeRegistry.register(adaptiveMode);

      const resolved = gameModeRegistry.resolveWithSettings(
        'adaptive-profile',
        {},
        { profileNLevel: 5 },
      );
      expect(resolved.config.nLevel).toBe(5);
    });

    it('should merge corsi direction into spec extensions', () => {
      const resolved = gameModeRegistry.resolveWithSettings('corsi-block', {
        nLevel: 4,
        corsiDirection: 'backward',
      });

      expect(resolved.config.nLevel).toBe(4);
      expect(resolved.spec.extensions?.['direction']).toBe('backward');
      expect(resolved.spec.defaults.nLevel).toBe(4);
    });

    it('should handle custom algorithm override if permitted', () => {
      const settings: ModeSettings = {
        algorithm: 'custom-algo',
      };

      const algoSpec = createTestSpec({
        metadata: { ...createTestSpec().metadata, id: 'algo-mode' },
        adaptivity: {
          algorithm: 'none',
          nLevelSource: 'user',
          configurableSettings: ['algorithm'],
        },
      });
      const algoMode: GameModeDefinition = {
        id: 'algo-mode',
        spec: algoSpec,
        displayName: 'Algo Mode',
        description: 'desc',
        generatorName: 'Sequence',
        algorithmName: 'default-algo',
        scoringStrategyName: 'SDT',
        defaultConfig: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.3,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
        },
        tags: [],
        difficultyLevel: 1,
        configurableSettings: ['algorithm'],
        nLevelSource: 'user',
      };
      gameModeRegistry.register(algoMode);

      const resolved = gameModeRegistry.resolveWithSettings('algo-mode', settings);
      expect(resolved.algorithmName).toBe('custom-algo');
    });
  });

  describe('GameModeRegistry - Default Modes', () => {
    it('should have all expected default modes with correct properties', () => {
      const modes = [
        { id: 'dual-catch', gen: 'Sequence', algo: 'adaptive' },
        { id: 'custom', gen: 'BrainWorkshop', algo: 'none' },
        { id: 'dualnback-classic', gen: 'DualnbackClassic', algo: 'jaeggi-v1' },
        { id: 'sim-brainworkshop', gen: 'BrainWorkshop', algo: 'brainworkshop-v1' },
        { id: 'dual-memo', gen: 'Sequence', algo: 'adaptive' },
        { id: 'dual-place', gen: 'Sequence', algo: 'adaptive' },
      ];

      for (const m of modes) {
        const def = gameModeRegistry.get(m.id);
        expect(def.generatorName).toBe(m.gen as any);
        expect(def.algorithmName).toBe(m.algo);
        expect(def.tags.length).toBeGreaterThan(0);
      }
    });

    it('dual-memo should have memo sequenceMode', () => {
      const memo = gameModeRegistry.get('dual-memo');
      expect((memo as unknown as { sequenceMode: string }).sequenceMode).toBe('memo');
    });

    it('dual-place should have flow sequenceMode', () => {
      const place = gameModeRegistry.get('dual-place');
      expect((place as unknown as { sequenceMode: string }).sequenceMode).toBe('flow');
    });
  });

  describe('resolveWithSettings exhaustive', () => {
    it('should apply all possible config overrides', () => {
      const settings: ModeSettings = {
        nLevel: 3,
        trialsCount: 15,
        intervalSeconds: 1.5,
        stimulusDurationSeconds: 0.8,
        generator: 'Sequence',
        targetProbability: 0.4,
        lureProbability: 0.2,
        activeModalities: ['position', 'color'],
      };

      // Using 'custom' mode because it allows almost everything to be configured
      const resolved = gameModeRegistry.resolveWithSettings('custom', settings);

      expect(resolved.config.nLevel).toBe(3);
      expect(resolved.config.trialsCount).toBe(15);
      expect(resolved.config.intervalSeconds).toBe(1.5);
      expect(resolved.config.stimulusDurationSeconds).toBe(0.8);
      expect(resolved.config.generator).toBe('Sequence');
      expect(resolved.config.targetProbability).toBe(0.4);
      expect(resolved.config.lureProbability).toBe(0.2);
      expect(resolved.config.activeModalities).toEqual(['position', 'color']);
    });

    it('should use default values if value is undefined in settings', () => {
      const resolved = gameModeRegistry.resolveWithSettings('custom', { nLevel: undefined });
      expect(resolved.config.nLevel).toBe(2); // Default for custom
    });

    it('should apply dual-track color identity mode to extensions', () => {
      const resolved = gameModeRegistry.resolveWithSettings('dual-track', {
        nLevel: 3,
        trackingIdentityMode: 'color',
      });

      expect(resolved.spec.extensions?.['trackingIdentityMode']).toBe('color');
      expect(resolved.spec.extensions?.['targetCount']).toBe(3);
    });

    it('should apply dual-track position identity mode to extensions', () => {
      const resolved = gameModeRegistry.resolveWithSettings('dual-track', {
        nLevel: 3,
        trackingIdentityMode: 'position',
      });

      expect(resolved.spec.extensions?.['trackingIdentityMode']).toBe('position');
      expect(resolved.spec.extensions?.['targetCount']).toBe(3);
    });

    it('should apply dual-track spoken letter option to extensions', () => {
      const resolved = gameModeRegistry.resolveWithSettings('dual-track', {
        nLevel: 3,
        trackingLetterAudioEnabled: true,
      });

      expect(resolved.spec.extensions?.['trackingIdentityMode']).toBe('classic');
      expect(resolved.spec.extensions?.['trackingLetterAudioEnabled']).toBe(true);
      expect(resolved.spec.extensions?.['targetCount']).toBe(3);
    });

    it('keeps legacy letter identity settings compatible', () => {
      const resolved = gameModeRegistry.resolveWithSettings('dual-track', {
        nLevel: 3,
        trackingIdentityMode: 'letter',
      });

      expect(resolved.spec.extensions?.['trackingIdentityMode']).toBe('classic');
      expect(resolved.spec.extensions?.['trackingLetterAudioEnabled']).toBe(true);
      expect(resolved.spec.extensions?.['targetCount']).toBe(3);
    });

    it('should handle missing context when nLevelSource is profile', () => {
      const profileSpec = createTestSpec({
        metadata: { ...createTestSpec().metadata, id: 'profile-mode' },
        adaptivity: {
          algorithm: 'none',
          nLevelSource: 'profile',
          configurableSettings: [],
        },
      });
      const profileMode: GameModeDefinition = {
        id: 'profile-mode',
        spec: profileSpec,
        displayName: 'Profile',
        description: 'desc',
        generatorName: 'Sequence',
        algorithmName: 'none',
        scoringStrategyName: 'SDT',
        defaultConfig: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.3,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
        },
        tags: [],
        difficultyLevel: 1,
        configurableSettings: [],
        nLevelSource: 'profile',
      };
      gameModeRegistry.register(profileMode);

      // Context missing -> should fallback to default config nLevel
      const resolved = gameModeRegistry.resolveWithSettings('profile-mode', {});
      expect(resolved.config.nLevel).toBe(2);
    });
  });
});
