/**
 * Tests for TrialVO Value Object
 *
 * Tests REAL behavior of trial evaluation.
 * NO MOCKS - Pure computation.
 */

import { describe, expect, test } from 'bun:test';
import { TrialVO } from './trial-vo';
import type { Trial, TrialInput } from './types';

// =============================================================================
// Fixtures - COMPLETE Trial structures
// =============================================================================

const createTrial = (overrides: Partial<Trial> = {}): Trial => ({
  index: 5,
  isBuffer: false,
  position: 3,
  sound: 'K',
  // @ts-expect-error test override
  color: 'blue',
  trialType: 'Non-Cible',
  isPositionTarget: false,
  isSoundTarget: false,
  isColorTarget: false,
  isPositionLure: false,
  isSoundLure: false,
  isColorLure: false,
  positionLureType: undefined,
  soundLureType: undefined,
  colorLureType: undefined,
  ...overrides,
});

const createTrialInput = (overrides: Partial<TrialInput> = {}): TrialInput => ({
  position: false,
  audio: false,
  color: false,
  positionRT: undefined,
  audioRT: undefined,
  colorRT: undefined,
  ...overrides,
});

// =============================================================================
// Basic Accessors Tests
// =============================================================================

describe('TrialVO basic accessors', () => {
  test('should expose index', () => {
    const vo = new TrialVO(createTrial({ index: 7 }));
    expect(vo.index).toBe(7);
  });

  test('should expose isBuffer', () => {
    const vo = new TrialVO(createTrial({ isBuffer: true }));
    expect(vo.isBuffer).toBe(true);
  });

  test('should expose position', () => {
    const vo = new TrialVO(createTrial({ position: 5 }));
    expect(vo.position).toBe(5);
  });

  test('should expose sound', () => {
    const vo = new TrialVO(createTrial({ sound: 'L' }));
    expect(vo.sound).toBe('L');
  });

  test('should expose color', () => {
    // @ts-expect-error test override
    const vo = new TrialVO(createTrial({ color: 'red' }));
    // @ts-expect-error test override
    expect(vo.color).toBe('red');
  });

  test('should expose trialType', () => {
    const vo = new TrialVO(createTrial({ trialType: 'Dual' }));
    expect(vo.trialType).toBe('Dual');
  });
});

// =============================================================================
// Target Methods Tests
// =============================================================================

describe('TrialVO.isTargetFor()', () => {
  test('should return true for position target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true }));
    expect(vo.isTargetFor('position')).toBe(true);
  });

  test('should return false for non-position target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: false }));
    expect(vo.isTargetFor('position')).toBe(false);
  });

  test('should return true for audio target', () => {
    const vo = new TrialVO(createTrial({ isSoundTarget: true }));
    expect(vo.isTargetFor('audio')).toBe(true);
  });

  test('should return true for color target', () => {
    const vo = new TrialVO(createTrial({ isColorTarget: true }));
    expect(vo.isTargetFor('color')).toBe(true);
  });
});

describe('TrialVO.isDualTarget()', () => {
  test('should return true when position AND audio are targets', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true, isSoundTarget: true }));
    expect(vo.isDualTarget()).toBe(true);
  });

  test('should return false when only position is target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true, isSoundTarget: false }));
    expect(vo.isDualTarget()).toBe(false);
  });

  test('should return false when only audio is target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: false, isSoundTarget: true }));
    expect(vo.isDualTarget()).toBe(false);
  });

  test('should return false when no targets', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.isDualTarget()).toBe(false);
  });
});

describe('TrialVO.isSingleTarget()', () => {
  test('should return true for single position target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true }));
    expect(vo.isSingleTarget()).toBe(true);
  });

  test('should return true for single audio target', () => {
    const vo = new TrialVO(createTrial({ isSoundTarget: true }));
    expect(vo.isSingleTarget()).toBe(true);
  });

  test('should return true for single color target', () => {
    const vo = new TrialVO(createTrial({ isColorTarget: true }));
    expect(vo.isSingleTarget()).toBe(true);
  });

  test('should return false for dual target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true, isSoundTarget: true }));
    expect(vo.isSingleTarget()).toBe(false);
  });

  test('should return false for no targets', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.isSingleTarget()).toBe(false);
  });
});

describe('TrialVO.isNoTarget()', () => {
  test('should return true when no targets', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.isNoTarget()).toBe(true);
  });

  test('should return false when position target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true }));
    expect(vo.isNoTarget()).toBe(false);
  });

  test('should return false when audio target', () => {
    const vo = new TrialVO(createTrial({ isSoundTarget: true }));
    expect(vo.isNoTarget()).toBe(false);
  });

  test('should return false when color target', () => {
    const vo = new TrialVO(createTrial({ isColorTarget: true }));
    expect(vo.isNoTarget()).toBe(false);
  });
});

describe('TrialVO.targetCount', () => {
  test('should return 0 for no targets', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.targetCount).toBe(0);
  });

  test('should return 1 for single target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true }));
    expect(vo.targetCount).toBe(1);
  });

  test('should return 2 for dual target', () => {
    const vo = new TrialVO(createTrial({ isPositionTarget: true, isSoundTarget: true }));
    expect(vo.targetCount).toBe(2);
  });

  test('should return 3 for triple target', () => {
    const vo = new TrialVO(
      createTrial({ isPositionTarget: true, isSoundTarget: true, isColorTarget: true }),
    );
    expect(vo.targetCount).toBe(3);
  });
});

// =============================================================================
// Lure Methods Tests
// =============================================================================

describe('TrialVO.isLureFor()', () => {
  test('should return true for position lure', () => {
    const vo = new TrialVO(createTrial({ isPositionLure: true }));
    expect(vo.isLureFor('position')).toBe(true);
  });

  test('should return false for non-position lure', () => {
    const vo = new TrialVO(createTrial({ isPositionLure: false }));
    expect(vo.isLureFor('position')).toBe(false);
  });

  test('should return true for audio lure', () => {
    const vo = new TrialVO(createTrial({ isSoundLure: true }));
    expect(vo.isLureFor('audio')).toBe(true);
  });

  test('should return true for color lure', () => {
    const vo = new TrialVO(createTrial({ isColorLure: true }));
    expect(vo.isLureFor('color')).toBe(true);
  });
});

describe('TrialVO.getLureType()', () => {
  test('should return lure type for position', () => {
    const vo = new TrialVO(createTrial({ positionLureType: 'n-1' }));
    expect(vo.getLureType('position')).toBe('n-1');
  });

  test('should return null when no lure type', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.getLureType('position')).toBeNull();
  });

  test('should return lure type for audio', () => {
    const vo = new TrialVO(createTrial({ soundLureType: 'n+1' }));
    expect(vo.getLureType('audio')).toBe('n+1');
  });

  test('should return lure type for color', () => {
    const vo = new TrialVO(createTrial({ colorLureType: 'sequence' }));
    expect(vo.getLureType('color')).toBe('sequence');
  });
});

describe('TrialVO.hasAnyLure()', () => {
  test('should return false when no lures', () => {
    const vo = new TrialVO(createTrial());
    expect(vo.hasAnyLure()).toBe(false);
  });

  test('should return true when position lure', () => {
    const vo = new TrialVO(createTrial({ isPositionLure: true }));
    expect(vo.hasAnyLure()).toBe(true);
  });

  test('should return true when audio lure', () => {
    const vo = new TrialVO(createTrial({ isSoundLure: true }));
    expect(vo.hasAnyLure()).toBe(true);
  });

  test('should return true when color lure', () => {
    const vo = new TrialVO(createTrial({ isColorLure: true }));
    expect(vo.hasAnyLure()).toBe(true);
  });
});

// =============================================================================
// Evaluate Tests
// =============================================================================

describe('TrialVO.evaluate()', () => {
  describe('position modality', () => {
    test('should return hit when target and responded', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ position: true, positionRT: 300 }));

      expect(verdict.position.result).toBe('hit');
      expect(verdict.position.reactionTimeMs).toBe(300);
    });

    test('should return miss when target and not responded', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ position: false }));

      expect(verdict.position.result).toBe('miss');
    });

    test('should return falseAlarm when non-target and responded', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: false }));
      const verdict = vo.evaluate(createTrialInput({ position: true }));

      expect(verdict.position.result).toBe('falseAlarm');
    });

    test('should return correctRejection when non-target and not responded', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: false }));
      const verdict = vo.evaluate(createTrialInput({ position: false }));

      expect(verdict.position.result).toBe('correctRejection');
    });
  });

  describe('audio modality', () => {
    test('should return hit when target and responded', () => {
      const vo = new TrialVO(createTrial({ isSoundTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ audio: true, audioRT: 250 }));

      expect(verdict.audio.result).toBe('hit');
      expect(verdict.audio.reactionTimeMs).toBe(250);
    });

    test('should return miss when target and not responded', () => {
      const vo = new TrialVO(createTrial({ isSoundTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ audio: false }));

      expect(verdict.audio.result).toBe('miss');
    });
  });

  describe('isFullyCorrect', () => {
    test('should be true when all hits', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true, isSoundTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ position: true, audio: true }));

      expect(verdict.isFullyCorrect).toBe(true);
    });

    test('should be true when all correct rejections', () => {
      const vo = new TrialVO(createTrial());
      const verdict = vo.evaluate(createTrialInput());

      expect(verdict.isFullyCorrect).toBe(true);
    });

    test('should be true when mixed hits and correct rejections', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ position: true }));

      expect(verdict.isFullyCorrect).toBe(true);
    });

    test('should be false when miss', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true }));
      const verdict = vo.evaluate(createTrialInput({ position: false }));

      expect(verdict.isFullyCorrect).toBe(false);
    });

    test('should be false when false alarm', () => {
      const vo = new TrialVO(createTrial());
      const verdict = vo.evaluate(createTrialInput({ position: true }));

      expect(verdict.isFullyCorrect).toBe(false);
    });
  });

  describe('with undefined input', () => {
    test('should handle undefined input as no responses', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: true }));
      const verdict = vo.evaluate(undefined);

      expect(verdict.position.result).toBe('miss');
      expect(verdict.position.reactionTimeMs).toBeNull();
    });
  });

  describe('lure information in verdict', () => {
    test('should include lure info in verdict', () => {
      const vo = new TrialVO(createTrial({ isPositionLure: true, positionLureType: 'n-1' }));
      const verdict = vo.evaluate(createTrialInput());

      expect(verdict.position.isLure).toBe(true);
      expect(verdict.position.lureType).toBe('n-1');
    });
  });
});

// =============================================================================
// Factory and Serialization Tests
// =============================================================================

describe('TrialVO.from()', () => {
  test('should create TrialVO from Trial', () => {
    const trial = createTrial({ index: 10 });
    const vo = TrialVO.from(trial);

    expect(vo).toBeInstanceOf(TrialVO);
    expect(vo.index).toBe(10);
  });
});

describe('TrialVO.toRaw()', () => {
  test('should return original Trial', () => {
    const trial = createTrial({ index: 8, position: 5 });
    const vo = new TrialVO(trial);
    const raw = vo.toRaw();

    expect(raw).toBe(trial);
    expect(raw.index).toBe(8);
    expect(raw.position).toBe(5);
  });
});
