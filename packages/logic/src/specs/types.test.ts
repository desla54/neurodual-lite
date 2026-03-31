import { describe, expect, it } from 'bun:test';
import { hasExtension, type ModeSpec } from './types';

describe('specs/types', () => {
  describe('hasExtension', () => {
    const createSpec = (extensions?: Record<string, unknown>): ModeSpec =>
      // @ts-expect-error test override
      ({
        id: 'test-mode',
        category: 'nback',
        name: 'Test Mode',
        extensions,
      }) as ModeSpec;

    it('should return true when extension exists', () => {
      const spec = createSpec({
        guidedMode: true,
        mirrorMode: false,
      });

      expect(hasExtension<boolean>(spec, 'guidedMode')).toBe(true);
      expect(hasExtension<boolean>(spec, 'mirrorMode')).toBe(true);
    });

    it('should return false when extension does not exist', () => {
      const spec = createSpec({
        guidedMode: true,
      });

      expect(hasExtension<boolean>(spec, 'mirrorMode')).toBe(false);
      expect(hasExtension<boolean>(spec, 'unknownExtension')).toBe(false);
    });

    it('should return false when extensions is undefined', () => {
      const spec = createSpec(undefined);

      expect(hasExtension<boolean>(spec, 'guidedMode')).toBe(false);
    });

    it('should work with different extension types', () => {
      const spec = createSpec({
        stringExt: 'value',
        numberExt: 42,
        objectExt: { nested: true },
      });

      expect(hasExtension<string>(spec, 'stringExt')).toBe(true);
      expect(hasExtension<number>(spec, 'numberExt')).toBe(true);
      expect(hasExtension<object>(spec, 'objectExt')).toBe(true);
    });
  });
});
