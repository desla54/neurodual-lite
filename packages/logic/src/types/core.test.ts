import { describe, expect, it } from 'bun:test';
import {
  isKnownModality,
  isPositionModality,
  isAudioModality,
  isArithmeticModality,
  getPositionModalityIndex,
  getAudioModalityIndex,
  POSITIONS,
  SOUNDS,
  COLORS,
  IMAGE_MODALITY_SHAPES,
  ARITHMETIC_ANSWERS,
} from './core';

describe('core types', () => {
  describe('constants', () => {
    it('should have 8 positions (0-7)', () => {
      expect(POSITIONS).toHaveLength(8);
      expect(POSITIONS[0]).toBe(0);
      expect(POSITIONS[7]).toBe(7);
    });

    it('should have 8 sounds (letters)', () => {
      expect(SOUNDS).toHaveLength(8);
      expect(SOUNDS).toContain('C');
      expect(SOUNDS).toContain('T');
    });

    it('should have 8 colors', () => {
      expect(COLORS).toHaveLength(8);
      expect(COLORS).toContain('ink-black');
      expect(COLORS).toContain('ink-navy');
    });

    it('should have image shapes', () => {
      expect(IMAGE_MODALITY_SHAPES.length).toBeGreaterThan(0);
    });

    it('should have arithmetic answers', () => {
      expect(ARITHMETIC_ANSWERS.length).toBeGreaterThan(0);
    });
  });

  describe('isKnownModality', () => {
    it('should return true for known modalities', () => {
      expect(isKnownModality('position')).toBe(true);
      expect(isKnownModality('audio')).toBe(true);
      expect(isKnownModality('color')).toBe(true);
      expect(isKnownModality('image')).toBe(true);
      expect(isKnownModality('arithmetic')).toBe(true);
    });

    it('should return false for unknown modalities', () => {
      expect(isKnownModality('position2')).toBe(false);
      expect(isKnownModality('audio2')).toBe(false);
      expect(isKnownModality('unknown')).toBe(false);
      expect(isKnownModality('vis1')).toBe(false);
    });
  });

  describe('isPositionModality', () => {
    it('should return true for position modalities', () => {
      expect(isPositionModality('position')).toBe(true);
      expect(isPositionModality('position2')).toBe(true);
      expect(isPositionModality('position3')).toBe(true);
      expect(isPositionModality('position4')).toBe(true);
    });

    it('should return false for non-position modalities', () => {
      expect(isPositionModality('audio')).toBe(false);
      expect(isPositionModality('color')).toBe(false);
      expect(isPositionModality('pos')).toBe(false);
    });
  });

  describe('isAudioModality', () => {
    it('should return true for audio modalities', () => {
      expect(isAudioModality('audio')).toBe(true);
      expect(isAudioModality('audio2')).toBe(true);
    });

    it('should return false for non-audio modalities', () => {
      expect(isAudioModality('position')).toBe(false);
      expect(isAudioModality('aud')).toBe(false);
    });
  });

  describe('isArithmeticModality', () => {
    it('should return true for arithmetic modality', () => {
      expect(isArithmeticModality('arithmetic')).toBe(true);
    });

    it('should return false for non-arithmetic modalities', () => {
      expect(isArithmeticModality('position')).toBe(false);
      expect(isArithmeticModality('audio')).toBe(false);
      expect(isArithmeticModality('arith')).toBe(false);
    });
  });

  describe('getPositionModalityIndex', () => {
    it('should return 0 for base position', () => {
      expect(getPositionModalityIndex('position')).toBe(0);
    });

    it('should return correct index for position variants', () => {
      expect(getPositionModalityIndex('position2')).toBe(1);
      expect(getPositionModalityIndex('position3')).toBe(2);
      expect(getPositionModalityIndex('position4')).toBe(3);
    });

    it('should return -1 for non-position modalities', () => {
      expect(getPositionModalityIndex('audio')).toBe(-1);
      expect(getPositionModalityIndex('pos')).toBe(-1);
      expect(getPositionModalityIndex('position10')).toBe(9); // Still matches pattern
    });
  });

  describe('getAudioModalityIndex', () => {
    it('should return 0 for base audio', () => {
      expect(getAudioModalityIndex('audio')).toBe(0);
    });

    it('should return correct index for audio variants', () => {
      expect(getAudioModalityIndex('audio2')).toBe(1);
    });

    it('should return -1 for non-audio modalities', () => {
      expect(getAudioModalityIndex('position')).toBe(-1);
      expect(getAudioModalityIndex('aud')).toBe(-1);
    });
  });
});
