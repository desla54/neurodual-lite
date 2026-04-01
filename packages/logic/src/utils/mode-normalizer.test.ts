import { describe, expect, it } from 'bun:test';
import { normalizeModeId } from './mode-normalizer';

describe('mode-normalizer', () => {
  describe('normalizeModeId', () => {
    it('returns canonical IDs unchanged', () => {
      expect(normalizeModeId('dualnback-classic')).toBe('dualnback-classic');
      expect(normalizeModeId('dual-place')).toBe('dual-place');
      expect(normalizeModeId('dual-memo')).toBe('dual-memo');
      expect(normalizeModeId('dual-pick')).toBe('dual-pick');
      expect(normalizeModeId('dual-trace')).toBe('dual-trace');
      expect(normalizeModeId('dualnback-classic')).toBe('dualnback-classic');
      expect(normalizeModeId('sim-brainworkshop')).toBe('sim-brainworkshop');
      expect(normalizeModeId('custom')).toBe('custom');
    });

    it('does not rewrite non-canonical IDs at runtime', () => {
      expect(normalizeModeId('classic')).toBe('classic');
      expect(normalizeModeId('adaptive')).toBe('adaptive');
      expect(normalizeModeId('unknown-mode')).toBe('unknown-mode');
    });
  });
});
