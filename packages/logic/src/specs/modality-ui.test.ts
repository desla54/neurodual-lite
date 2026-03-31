import { describe, expect, it } from 'bun:test';
import {
  getModalityFamily,
  getModalityColor,
  getModalityLabelInfo,
  getOptimalModalityLayout,
  isHexColor,
} from './modality-ui';
import { MULTI_STIMULUS_COLORS } from './thresholds';

describe('modality-ui', () => {
  describe('getModalityFamily', () => {
    it('should return position for position modalities', () => {
      expect(getModalityFamily('position')).toBe('position');
      expect(getModalityFamily('position2')).toBe('position');
      expect(getModalityFamily('position3')).toBe('position');
      expect(getModalityFamily('position4')).toBe('position');
    });

    it('should return audio for audio modalities', () => {
      expect(getModalityFamily('audio')).toBe('audio');
      expect(getModalityFamily('audio2')).toBe('audio');
    });

    it('should return arithmetic for arithmetic modality', () => {
      expect(getModalityFamily('arithmetic')).toBe('arithmetic');
    });

    it('should return vis for vis modalities', () => {
      expect(getModalityFamily('vis1')).toBe('vis');
      expect(getModalityFamily('vis2')).toBe('vis');
      expect(getModalityFamily('vis3')).toBe('vis');
      expect(getModalityFamily('vis4')).toBe('vis');
    });

    it('should return specific families for combined modalities', () => {
      expect(getModalityFamily('visvis')).toBe('visvis');
      expect(getModalityFamily('visaudio')).toBe('visaudio');
      expect(getModalityFamily('audiovis')).toBe('audiovis');
    });

    it('should return specific families for other modalities', () => {
      expect(getModalityFamily('color')).toBe('color');
      expect(getModalityFamily('image')).toBe('image');
      expect(getModalityFamily('spatial')).toBe('spatial');
      expect(getModalityFamily('digits')).toBe('digits');
      expect(getModalityFamily('emotions')).toBe('emotions');
      expect(getModalityFamily('words')).toBe('words');
      expect(getModalityFamily('tones')).toBe('tones');
      expect(getModalityFamily('shape')).toBe('shape');
    });

    it('should return position as fallback for unknown modalities', () => {
      expect(getModalityFamily('unknown')).toBe('position');
    });
  });

  describe('getModalityColor', () => {
    it('should return CSS class for base position modality', () => {
      const color = getModalityColor('position');
      expect(color).toBe('text-visual');
    });

    it('should return hex color for position variants', () => {
      const color2 = getModalityColor('position2');
      expect(color2).toBe(MULTI_STIMULUS_COLORS[1]);
      expect(color2.startsWith('#')).toBe(true);

      const color3 = getModalityColor('position3');
      expect(color3).toBe(MULTI_STIMULUS_COLORS[2]);
    });

    it('should return CSS class for base audio modality', () => {
      const color = getModalityColor('audio');
      expect(color).toBe('text-audio');
    });

    it('should return opacity variant for audio2', () => {
      const color = getModalityColor('audio2');
      expect(color).toBe('text-audio/70');
    });

    it('should return hex colors for vis modalities', () => {
      const color1 = getModalityColor('vis1');
      expect(color1).toBe(MULTI_STIMULUS_COLORS[0]);

      const color2 = getModalityColor('vis2');
      expect(color2).toBe(MULTI_STIMULUS_COLORS[1]);
    });

    it('should return fallback for vis out of recognized range (1-4)', () => {
      // vis9 doesn't match vis[1-4] pattern, so falls back to position family
      const color = getModalityColor('vis9');
      expect(color).toBe('text-visual'); // fallback to position
    });

    it('should return specific colors for other modalities', () => {
      expect(getModalityColor('color')).toBe('text-pink-500');
      expect(getModalityColor('arithmetic')).toBe('text-amber-600');
      expect(getModalityColor('image')).toBe('text-emerald-500');
      expect(getModalityColor('spatial')).toBe('text-emerald-500');
      expect(getModalityColor('digits')).toBe('text-cyan-500');
      expect(getModalityColor('emotions')).toBe('text-rose-500');
      expect(getModalityColor('words')).toBe('text-lime-500');
      expect(getModalityColor('tones')).toBe('text-violet-500');
      expect(getModalityColor('shape')).toBe('text-purple-500');
    });

    it('should return colors for combined modalities', () => {
      expect(getModalityColor('visvis')).toBe('text-sky-500');
      expect(getModalityColor('visaudio')).toBe('text-teal-500');
      expect(getModalityColor('audiovis')).toBe('text-indigo-500');
    });

    it('should return fallback for unknown modality', () => {
      const color = getModalityColor('unknown');
      expect(typeof color).toBe('string');
    });
  });

  describe('getModalityLabelInfo', () => {
    it('should return info for base position modality', () => {
      const info = getModalityLabelInfo('position');
      expect(info.key).toBe('modality.position');
      expect(info.index).toBe(null);
      expect(info.family).toBe('position');
    });

    it('should return info with index for position variants', () => {
      const info2 = getModalityLabelInfo('position2');
      expect(info2.key).toBe('modality.position');
      expect(info2.index).toBe(2);
      expect(info2.family).toBe('position');

      const info3 = getModalityLabelInfo('position3');
      expect(info3.index).toBe(3);
    });

    it('should return info for base audio modality', () => {
      const info = getModalityLabelInfo('audio');
      expect(info.key).toBe('modality.audio');
      expect(info.index).toBe(null);
      expect(info.family).toBe('audio');
    });

    it('should return info with index for audio variants', () => {
      const info = getModalityLabelInfo('audio2');
      expect(info.key).toBe('modality.audio');
      expect(info.index).toBe(2);
      expect(info.family).toBe('audio');
    });

    it('should return info for vis modalities', () => {
      const info1 = getModalityLabelInfo('vis1');
      expect(info1.key).toBe('modality.vis');
      expect(info1.index).toBe(1);
      expect(info1.family).toBe('vis');

      const info2 = getModalityLabelInfo('vis2');
      expect(info2.index).toBe(2);
    });

    it('should return info for other modalities', () => {
      const infoColor = getModalityLabelInfo('color');
      expect(infoColor.key).toBe('modality.color');
      expect(infoColor.index).toBe(null);
      expect(infoColor.family).toBe('color');

      const infoArith = getModalityLabelInfo('arithmetic');
      expect(infoArith.key).toBe('modality.arithmetic');
      expect(infoArith.family).toBe('arithmetic');

      const infoSpatial = getModalityLabelInfo('spatial');
      expect(infoSpatial.key).toBe('modality.spatial');
      expect(infoSpatial.family).toBe('spatial');

      const infoDigits = getModalityLabelInfo('digits');
      expect(infoDigits.key).toBe('modality.digits');
      expect(infoDigits.family).toBe('digits');

      const infoEmotions = getModalityLabelInfo('emotions');
      expect(infoEmotions.key).toBe('modality.emotions');
      expect(infoEmotions.family).toBe('emotions');

      const infoWords = getModalityLabelInfo('words');
      expect(infoWords.key).toBe('modality.words');
      expect(infoWords.family).toBe('words');

      const infoTones = getModalityLabelInfo('tones');
      expect(infoTones.key).toBe('modality.tones');
      expect(infoTones.family).toBe('tones');
    });

    it('should return info for combined modalities', () => {
      const info = getModalityLabelInfo('visaudio');
      expect(info.key).toBe('modality.visaudio');
      expect(info.index).toBe(null);
      expect(info.family).toBe('visaudio');
    });
  });

  describe('getOptimalModalityLayout', () => {
    it('should return grid-2 for 1-2 modalities', () => {
      expect(getOptimalModalityLayout(1)).toBe('grid-2');
      expect(getOptimalModalityLayout(2)).toBe('grid-2');
    });

    it('should return grid-3 for 3 modalities', () => {
      expect(getOptimalModalityLayout(3)).toBe('grid-3');
    });

    it('should return scroll for 4+ modalities', () => {
      expect(getOptimalModalityLayout(4)).toBe('scroll');
      expect(getOptimalModalityLayout(5)).toBe('scroll');
      expect(getOptimalModalityLayout(10)).toBe('scroll');
    });

    it('should use override when provided and not auto', () => {
      expect(getOptimalModalityLayout(1, 'scroll')).toBe('scroll');
      expect(getOptimalModalityLayout(5, 'grid-2')).toBe('grid-2');
      expect(getOptimalModalityLayout(3, 'grid-3')).toBe('grid-3');
    });

    it('should ignore auto override and use default logic', () => {
      expect(getOptimalModalityLayout(1, 'auto')).toBe('grid-2');
      expect(getOptimalModalityLayout(5, 'auto')).toBe('scroll');
    });
  });

  describe('isHexColor', () => {
    it('should return true for hex colors', () => {
      expect(isHexColor('#EF4444')).toBe(true);
      expect(isHexColor('#fff')).toBe(true);
      expect(isHexColor('#000000')).toBe(true);
    });

    it('should return false for CSS classes', () => {
      expect(isHexColor('text-visual')).toBe(false);
      expect(isHexColor('text-audio/70')).toBe(false);
      expect(isHexColor('text-pink-500')).toBe(false);
    });
  });
});
