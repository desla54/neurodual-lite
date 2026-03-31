import { describe, expect, it } from 'bun:test';
import {
  getControlConfig,
  getControlConfigs,
  resolveModalityForKey,
  getModalitiesForKey,
  isGameControlKey,
  MODALITY_SHORTCUTS,
  MODALITY_COLORS,
  MODALITY_LABEL_KEYS,
} from './control-config';

describe('control-config', () => {
  describe('getControlConfig', () => {
    it('should return config for position modality', () => {
      const config = getControlConfig('position');

      expect(config).toBeDefined();
      expect(config?.modalityId).toBe('position');
      expect(config?.shortcut).toBe('A');
      expect(config?.color).toBe('visual');
      expect(config?.labelKey).toBe('game.controls.position');
    });

    it('should return config for audio modality', () => {
      const config = getControlConfig('audio');

      expect(config).toBeDefined();
      expect(config?.shortcut).toBe('L');
      expect(config?.color).toBe('audio');
    });

    it('should return config for position variants', () => {
      const config2 = getControlConfig('position2');
      expect(config2?.shortcut).toBe('S');
      expect(config2?.color).toBe('position2');

      const config3 = getControlConfig('position3');
      expect(config3?.shortcut).toBe('D');

      const config4 = getControlConfig('position4');
      expect(config4?.shortcut).toBe('F');
    });

    it('should return config for vis modalities', () => {
      const vis1 = getControlConfig('vis1');
      expect(vis1?.shortcut).toBe('G');
      expect(vis1?.color).toBe('vis1');

      const vis2 = getControlConfig('vis2');
      expect(vis2?.shortcut).toBe('H');
    });

    it('should return config for extended n-back modalities', () => {
      expect(getControlConfig('spatial')).toEqual({
        modalityId: 'spatial',
        shortcut: 'Q',
        color: 'spatial',
        labelKey: 'common.spatial',
      });
      expect(getControlConfig('digits')?.shortcut).toBe('W');
      expect(getControlConfig('emotions')?.shortcut).toBe('E');
      expect(getControlConfig('words')?.shortcut).toBe('R');
      expect(getControlConfig('tones')?.shortcut).toBe('U');
    });

    it('should return config for combined modalities', () => {
      const visvis = getControlConfig('visvis');
      expect(visvis?.shortcut).toBe('S');
      expect(visvis?.color).toBe('position2');

      const visaudio = getControlConfig('visaudio');
      expect(visaudio?.shortcut).toBe('D');

      const audiovis = getControlConfig('audiovis');
      expect(audiovis?.shortcut).toBe('J');
    });

    it('should return undefined for unknown modality', () => {
      const config = getControlConfig('unknown');
      expect(config).toBeUndefined();
    });
  });

  describe('getControlConfigs', () => {
    it('should return configs for all provided modalities', () => {
      const configs = getControlConfigs(['position', 'audio']);

      expect(configs).toHaveLength(2);
      expect(configs[0]?.modalityId).toBe('position');
      expect(configs[1]?.modalityId).toBe('audio');
    });

    it('should filter out unknown modalities', () => {
      const configs = getControlConfigs(['position', 'unknown', 'audio']);

      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.modalityId)).toEqual(['position', 'audio']);
    });

    it('should return empty array for empty input', () => {
      const configs = getControlConfigs([]);
      expect(configs).toHaveLength(0);
    });

    it('should preserve order', () => {
      const configs = getControlConfigs(['audio', 'position', 'position2']);

      expect(configs.map((c) => c.modalityId)).toEqual(['audio', 'position', 'position2']);
    });
  });

  describe('resolveModalityForKey', () => {
    it('should resolve simple key to active modality', () => {
      const result = resolveModalityForKey('A', ['position', 'audio']);
      expect(result).toBe('position');
    });

    it('should resolve L to audio', () => {
      const result = resolveModalityForKey('L', ['position', 'audio']);
      expect(result).toBe('audio');
    });

    it('should return null if modality not active', () => {
      const result = resolveModalityForKey('L', ['position']);
      expect(result).toBeNull();
    });

    it('should resolve extended modalities on their dedicated keys', () => {
      expect(resolveModalityForKey('Q', ['spatial', 'audio'])).toBe('spatial');
      expect(resolveModalityForKey('W', ['digits'])).toBe('digits');
      expect(resolveModalityForKey('E', ['emotions'])).toBe('emotions');
      expect(resolveModalityForKey('R', ['words'])).toBe('words');
      expect(resolveModalityForKey('U', ['tones'])).toBe('tones');
    });

    it('should return null for unknown key', () => {
      const result = resolveModalityForKey('Z', ['position', 'audio']);
      expect(result).toBeNull();
    });

    it('should handle case insensitivity', () => {
      expect(resolveModalityForKey('a', ['position'])).toBe('position');
      expect(resolveModalityForKey('A', ['position'])).toBe('position');
    });

    it('should prioritize visvis over position2 for S key', () => {
      // Both active - visvis takes priority
      const result1 = resolveModalityForKey('S', ['position2', 'visvis']);
      expect(result1).toBe('visvis');

      // Only position2 active
      const result2 = resolveModalityForKey('S', ['position2', 'audio']);
      expect(result2).toBe('position2');
    });

    it('should prioritize visaudio over position3 for D key', () => {
      const result = resolveModalityForKey('D', ['position3', 'visaudio']);
      expect(result).toBe('visaudio');
    });

    it('should prioritize position4 over color for F key', () => {
      const result = resolveModalityForKey('F', ['color', 'position4']);
      expect(result).toBe('position4');
    });

    it('should handle J key priority chain', () => {
      // audiovis > vis3 > image
      expect(resolveModalityForKey('J', ['audiovis', 'vis3', 'image'])).toBe('audiovis');
      expect(resolveModalityForKey('J', ['vis3', 'image'])).toBe('vis3');
      expect(resolveModalityForKey('J', ['image'])).toBe('image');
    });
  });

  describe('getModalitiesForKey', () => {
    it('should return all modalities for S key', () => {
      const modalities = getModalitiesForKey('S');
      expect(modalities).toEqual(['visvis', 'position2']);
    });

    it('should return all modalities for J key', () => {
      const modalities = getModalitiesForKey('J');
      expect(modalities).toEqual(['audiovis', 'vis3', 'image']);
    });

    it('should return single modality for A key', () => {
      const modalities = getModalitiesForKey('A');
      expect(modalities).toEqual(['position']);
    });

    it('should return single modality for extended modality keys', () => {
      expect(getModalitiesForKey('Q')).toEqual(['spatial']);
      expect(getModalitiesForKey('W')).toEqual(['digits']);
      expect(getModalitiesForKey('E')).toEqual(['emotions']);
      expect(getModalitiesForKey('R')).toEqual(['words']);
      expect(getModalitiesForKey('U')).toEqual(['tones']);
    });

    it('should return empty array for unknown key', () => {
      const modalities = getModalitiesForKey('Z');
      expect(modalities).toEqual([]);
    });

    it('should handle case insensitivity', () => {
      expect(getModalitiesForKey('a')).toEqual(['position']);
      expect(getModalitiesForKey('A')).toEqual(['position']);
    });
  });

  describe('isGameControlKey', () => {
    it('should return true for valid game keys', () => {
      expect(isGameControlKey('A')).toBe(true);
      expect(isGameControlKey('S')).toBe(true);
      expect(isGameControlKey('D')).toBe(true);
      expect(isGameControlKey('F')).toBe(true);
      expect(isGameControlKey('L')).toBe(true);
      expect(isGameControlKey('Q')).toBe(true);
      expect(isGameControlKey('W')).toBe(true);
      expect(isGameControlKey('E')).toBe(true);
      expect(isGameControlKey('R')).toBe(true);
      expect(isGameControlKey('U')).toBe(true);
      expect(isGameControlKey(';')).toBe(true);
    });

    it('should return false for non-game keys', () => {
      expect(isGameControlKey('Z')).toBe(false);
      expect(isGameControlKey('X')).toBe(false);
      expect(isGameControlKey('1')).toBe(false);
      expect(isGameControlKey(' ')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isGameControlKey('a')).toBe(true);
      expect(isGameControlKey('A')).toBe(true);
      expect(isGameControlKey('l')).toBe(true);
    });
  });

  describe('SSOT constants', () => {
    it('should have matching keys across all maps', () => {
      const shortcutKeys = Object.keys(MODALITY_SHORTCUTS);
      const colorKeys = Object.keys(MODALITY_COLORS);
      const labelKeys = Object.keys(MODALITY_LABEL_KEYS);

      // All maps should have the same modalities
      expect(shortcutKeys.sort()).toEqual(colorKeys.sort());
      expect(shortcutKeys.sort()).toEqual(labelKeys.sort());
    });
  });
});
