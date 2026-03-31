/**
 * Tests for TrialAdapter - converts GeneratedTrial to legacy Trial format
 */

import { describe, expect, it } from 'bun:test';
import { COLORS, SOUNDS } from '../../types/core';
import { IMAGE_MODALITY_SHAPES } from '../../specs/thresholds';
import { toTrial } from './trial-adapter';
import type { GeneratedTrial, SequenceSpec, ModalityValue } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(
  index: number,
  values: Record<string, Partial<ModalityValue> & { value: number | string }>,
): GeneratedTrial {
  const trialValues: GeneratedTrial['values'] = {};
  for (const [modalityId, v] of Object.entries(values)) {
    trialValues[modalityId] = {
      modalityId,
      value: v.value,
      intention: v.intention ?? 'neutral',
    };
  }
  return { index, values: trialValues };
}

/** Minimal spec sufficient for toTrial */
function makeSpec(nLevel: number): SequenceSpec {
  return {
    nLevel,
    modalities: [],
    targetProbabilities: {},
    lureProbabilities: {},
    hardConstraints: [],
    softConstraints: [],
  };
}

// =============================================================================
// toTrial - trialType determination (via determineTrialType)
// =============================================================================

describe('determineTrialType', () => {
  const spec = makeSpec(2);

  it('returns Tampon for buffer trials (index < nLevel)', () => {
    const generated = makeTrial(0, {
      position: { value: 3, intention: 'neutral' },
      audio: { value: 'C', intention: 'neutral' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('Tampon');
    expect(trial.isBuffer).toBe(true);
  });

  it('returns Tampon for index=1 when nLevel=2', () => {
    const generated = makeTrial(1, {
      position: { value: 3, intention: 'target' },
      audio: { value: 'C', intention: 'target' },
    });
    const trial = toTrial(generated, spec);
    // Even though intentions are target, it is a buffer trial
    expect(trial.trialType).toBe('Tampon');
  });

  it('returns Dual when both position and audio are targets', () => {
    const generated = makeTrial(2, {
      position: { value: 3, intention: 'target' },
      audio: { value: 'C', intention: 'target' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('Dual');
  });

  it('returns V-Seul when only position is target', () => {
    const generated = makeTrial(2, {
      position: { value: 3, intention: 'target' },
      audio: { value: 'C', intention: 'neutral' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('V-Seul');
  });

  it('returns A-Seul when only audio is target', () => {
    const generated = makeTrial(2, {
      position: { value: 3, intention: 'neutral' },
      audio: { value: 'C', intention: 'target' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('A-Seul');
  });

  it('returns Non-Cible when neither position nor audio is target', () => {
    const generated = makeTrial(2, {
      position: { value: 3, intention: 'neutral' },
      audio: { value: 'C', intention: 'neutral' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('Non-Cible');
  });

  it('returns Non-Cible when position and audio are lures (not targets)', () => {
    const generated = makeTrial(2, {
      position: { value: 3, intention: 'lure-n-1' },
      audio: { value: 'C', intention: 'lure-n+1' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('Non-Cible');
  });

  it('returns V-Seul when color is a visual target (no audio)', () => {
    const generated = makeTrial(2, {
      color: { value: 'ink-navy', intention: 'target' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.trialType).toBe('V-Seul');
  });
});

// =============================================================================
// toTrial - position mapping (via toPosition)
// =============================================================================

describe('toPosition mapping', () => {
  const spec = makeSpec(1);

  it('maps numeric values 0-7 directly', () => {
    for (let pos = 0; pos <= 7; pos++) {
      const generated = makeTrial(1, { position: { value: pos } });
      const trial = toTrial(generated, spec);
      expect(trial.position).toBe(pos as any);
    }
  });

  it('uses modulo 8 fallback for values >= 8', () => {
    const generated = makeTrial(1, { position: { value: 10 } });
    const trial = toTrial(generated, spec);
    expect(trial.position).toBe(2); // 10 % 8 = 2
  });

  it('uses modulo 8 fallback for negative values', () => {
    const generated = makeTrial(1, { position: { value: -1 } });
    const trial = toTrial(generated, spec);
    // JS: -1 % 8 = -1, which is still < 0, so fallback: (-1 % 8) = -1
    // @ts-expect-error test override
    expect(trial.position).toBe((-1 as any) % 8);
  });

  it('parses string values', () => {
    const generated = makeTrial(1, { position: { value: '5' } });
    const trial = toTrial(generated, spec);
    expect(trial.position).toBe(5);
  });

  it('defaults to 0 when position modality is absent', () => {
    const generated = makeTrial(1, { audio: { value: 'C' } });
    const trial = toTrial(generated, spec);
    expect(trial.position).toBe(0);
  });
});

// =============================================================================
// toTrial - sound mapping (via toSound)
// =============================================================================

describe('toSound mapping', () => {
  const spec = makeSpec(1);

  it('maps valid sound strings directly', () => {
    for (const sound of SOUNDS) {
      const generated = makeTrial(1, { audio: { value: sound } });
      const trial = toTrial(generated, spec);
      expect(trial.sound).toBe(sound);
    }
  });

  it('falls back to SOUNDS[0] for invalid string values', () => {
    const generated = makeTrial(1, { audio: { value: 'Z' } });
    const trial = toTrial(generated, spec);
    expect(trial.sound).toBe(SOUNDS[0]);
  });

  it('maps numeric index to SOUNDS array with modulo', () => {
    const generated = makeTrial(1, { audio: { value: 2 } });
    const trial = toTrial(generated, spec);
    expect(trial.sound).toBe(SOUNDS[2]);
  });

  it('wraps around for numeric values >= SOUNDS.length', () => {
    const generated = makeTrial(1, { audio: { value: SOUNDS.length } });
    const trial = toTrial(generated, spec);
    expect(trial.sound).toBe(SOUNDS[0]); // wraps to index 0
  });

  it('defaults to SOUNDS[0] when audio modality is absent', () => {
    const generated = makeTrial(1, { position: { value: 3 } });
    const trial = toTrial(generated, spec);
    expect(trial.sound).toBe(SOUNDS[0]);
  });
});

// =============================================================================
// toTrial - color mapping (via toColor)
// =============================================================================

describe('toColor mapping', () => {
  const spec = makeSpec(1);

  it('maps valid color strings directly', () => {
    for (const color of COLORS) {
      const generated = makeTrial(1, { color: { value: color } });
      const trial = toTrial(generated, spec);
      expect(trial.color).toBe(color);
    }
  });

  it('falls back to COLORS[0] for invalid string values', () => {
    const generated = makeTrial(1, { color: { value: 'invalid-color' } });
    const trial = toTrial(generated, spec);
    expect(trial.color).toBe(COLORS[0]);
  });

  it('maps numeric index to COLORS array with modulo', () => {
    const generated = makeTrial(1, { color: { value: 3 } });
    const trial = toTrial(generated, spec);
    expect(trial.color).toBe(COLORS[3]);
  });

  it('wraps around for numeric values >= COLORS.length', () => {
    const generated = makeTrial(1, { color: { value: COLORS.length + 2 } });
    const trial = toTrial(generated, spec);
    expect(trial.color).toBe(COLORS[2]);
  });

  it('defaults to COLORS[0] when color modality is absent', () => {
    const generated = makeTrial(1, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.color).toBe(COLORS[0]);
  });
});

// =============================================================================
// toTrial - image mapping (via toImage)
// =============================================================================

describe('toImage mapping', () => {
  const spec = makeSpec(1);

  it('maps valid image shape strings directly', () => {
    for (const shape of IMAGE_MODALITY_SHAPES) {
      const generated = makeTrial(1, { image: { value: shape } });
      const trial = toTrial(generated, spec);
      expect(trial.image).toBe(shape);
    }
  });

  it('falls back to IMAGE_MODALITY_SHAPES[0] for invalid string values', () => {
    const generated = makeTrial(1, { image: { value: 'octagon' } });
    const trial = toTrial(generated, spec);
    expect(trial.image).toBe(IMAGE_MODALITY_SHAPES[0]);
  });

  it('maps numeric index to IMAGE_MODALITY_SHAPES array with modulo', () => {
    const generated = makeTrial(1, { image: { value: 4 } });
    const trial = toTrial(generated, spec);
    expect(trial.image).toBe(IMAGE_MODALITY_SHAPES[4]);
  });

  it('wraps around for large numeric values', () => {
    const generated = makeTrial(1, {
      image: { value: IMAGE_MODALITY_SHAPES.length + 1 },
    });
    const trial = toTrial(generated, spec);
    expect(trial.image).toBe(IMAGE_MODALITY_SHAPES[1]);
  });

  it('defaults to IMAGE_MODALITY_SHAPES[0] when image modality is absent', () => {
    const generated = makeTrial(1, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.image).toBe(IMAGE_MODALITY_SHAPES[0]);
  });
});

// =============================================================================
// toTrial - target flags
// =============================================================================

describe('target flags', () => {
  const spec = makeSpec(1);

  it('sets isPositionTarget correctly', () => {
    const generated = makeTrial(1, { position: { value: 3, intention: 'target' } });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionTarget).toBe(true);
  });

  it('sets isSoundTarget correctly', () => {
    const generated = makeTrial(1, { audio: { value: 'C', intention: 'target' } });
    const trial = toTrial(generated, spec);
    expect(trial.isSoundTarget).toBe(true);
  });

  it('sets isColorTarget correctly', () => {
    const generated = makeTrial(1, { color: { value: 'ink-navy', intention: 'target' } });
    const trial = toTrial(generated, spec);
    expect(trial.isColorTarget).toBe(true);
  });

  it('sets isImageTarget correctly', () => {
    const generated = makeTrial(1, { image: { value: 'star', intention: 'target' } });
    const trial = toTrial(generated, spec);
    expect(trial.isImageTarget).toBe(true);
  });

  it('sets all target flags to false for neutral trial', () => {
    const generated = makeTrial(1, {
      position: { value: 0, intention: 'neutral' },
      audio: { value: 'C', intention: 'neutral' },
      color: { value: 'ink-black', intention: 'neutral' },
      image: { value: 'circle', intention: 'neutral' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionTarget).toBe(false);
    expect(trial.isSoundTarget).toBe(false);
    expect(trial.isColorTarget).toBe(false);
    expect(trial.isImageTarget).toBe(false);
  });

  it('lure intentions do not set target flags', () => {
    const generated = makeTrial(1, {
      position: { value: 0, intention: 'lure-n-1' },
      audio: { value: 'C', intention: 'lure-n+1' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionTarget).toBe(false);
    expect(trial.isSoundTarget).toBe(false);
  });
});

// =============================================================================
// toTrial - lure flags and lureType extraction
// =============================================================================

describe('lure flags', () => {
  const spec = makeSpec(1);

  it('sets isPositionLure for lure-n-1', () => {
    const generated = makeTrial(1, { position: { value: 3, intention: 'lure-n-1' } });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionLure).toBe(true);
    expect(trial.positionLureType).toBe('n-1');
  });

  it('sets isPositionLure for lure-n+1', () => {
    const generated = makeTrial(1, { position: { value: 3, intention: 'lure-n+1' } });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionLure).toBe(true);
    expect(trial.positionLureType).toBe('n+1');
  });

  it('sets isSoundLure and soundLureType', () => {
    const generated = makeTrial(1, { audio: { value: 'C', intention: 'lure-n-1' } });
    const trial = toTrial(generated, spec);
    expect(trial.isSoundLure).toBe(true);
    expect(trial.soundLureType).toBe('n-1');
  });

  it('sets isColorLure and colorLureType when color modality present', () => {
    const generated = makeTrial(1, { color: { value: 'ink-navy', intention: 'lure-n+1' } });
    const trial = toTrial(generated, spec);
    expect(trial.isColorLure).toBe(true);
    expect(trial.colorLureType).toBe('n+1');
  });

  it('sets isImageLure and imageLureType when image modality present', () => {
    const generated = makeTrial(1, { image: { value: 'star', intention: 'lure-n-1' } });
    const trial = toTrial(generated, spec);
    expect(trial.isImageLure).toBe(true);
    expect(trial.imageLureType).toBe('n-1');
  });

  it('neutral intention means no lure flags', () => {
    const generated = makeTrial(1, {
      position: { value: 0, intention: 'neutral' },
      audio: { value: 'C', intention: 'neutral' },
    });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionLure).toBe(false);
    expect(trial.isSoundLure).toBe(false);
    expect(trial.positionLureType).toBeUndefined();
    expect(trial.soundLureType).toBeUndefined();
  });

  it('target intention means no lure flags', () => {
    const generated = makeTrial(1, { position: { value: 0, intention: 'target' } });
    const trial = toTrial(generated, spec);
    expect(trial.isPositionLure).toBe(false);
    expect(trial.positionLureType).toBeUndefined();
  });

  it('isColorLure is undefined when color modality absent', () => {
    const generated = makeTrial(1, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.isColorLure).toBeUndefined();
    expect(trial.colorLureType).toBeUndefined();
  });

  it('isImageLure is undefined when image modality absent', () => {
    const generated = makeTrial(1, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.isImageLure).toBeUndefined();
    expect(trial.imageLureType).toBeUndefined();
  });
});

// =============================================================================
// toTrial - isBuffer flag
// =============================================================================

describe('isBuffer flag', () => {
  it('isBuffer=true when index < nLevel', () => {
    const spec = makeSpec(3);
    for (let i = 0; i < 3; i++) {
      const generated = makeTrial(i, { position: { value: 0 } });
      const trial = toTrial(generated, spec);
      expect(trial.isBuffer).toBe(true);
    }
  });

  it('isBuffer=false when index >= nLevel', () => {
    const spec = makeSpec(2);
    const generated = makeTrial(2, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.isBuffer).toBe(false);
  });

  it('isBuffer=false when index equals nLevel', () => {
    const spec = makeSpec(1);
    const generated = makeTrial(1, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.isBuffer).toBe(false);
  });
});

// =============================================================================
// toTrial - index passthrough
// =============================================================================

describe('index passthrough', () => {
  const spec = makeSpec(1);

  it('preserves the trial index', () => {
    const generated = makeTrial(42, { position: { value: 0 } });
    const trial = toTrial(generated, spec);
    expect(trial.index).toBe(42);
  });
});

// =============================================================================
// toTrial - full integration
// =============================================================================

describe('toTrial integration', () => {
  it('converts a complete dual n-back trial with all modalities', () => {
    const spec = makeSpec(2);
    const generated = makeTrial(5, {
      position: { value: 3, intention: 'target' },
      audio: { value: 'K', intention: 'lure-n-1' },
      color: { value: 'ink-teal', intention: 'neutral' },
      image: { value: 'hexagon', intention: 'target' },
    });

    const trial = toTrial(generated, spec);

    expect(trial.index).toBe(5);
    expect(trial.isBuffer).toBe(false);
    expect(trial.position).toBe(3);
    expect(trial.sound).toBe('K');
    expect(trial.color).toBe('ink-teal');
    expect(trial.image).toBe('hexagon');
    expect(trial.trialType).toBe('V-Seul'); // only position is target (audio is lure)
    expect(trial.isPositionTarget).toBe(true);
    expect(trial.isSoundTarget).toBe(false);
    expect(trial.isColorTarget).toBe(false);
    expect(trial.isImageTarget).toBe(true);
    expect(trial.isPositionLure).toBe(false);
    expect(trial.isSoundLure).toBe(true);
    expect(trial.soundLureType).toBe('n-1');
    expect(trial.isColorLure).toBe(false);
    expect(trial.isImageLure).toBe(false);
  });

  it('handles trial with no modalities at all', () => {
    const spec = makeSpec(1);
    const generated: GeneratedTrial = { index: 1, values: {} };
    const trial = toTrial(generated, spec);

    expect(trial.position).toBe(0);
    expect(trial.sound).toBe(SOUNDS[0]);
    expect(trial.color).toBe(COLORS[0]);
    expect(trial.image).toBe(IMAGE_MODALITY_SHAPES[0]);
    expect(trial.trialType).toBe('Non-Cible');
    expect(trial.isPositionTarget).toBe(false);
    expect(trial.isSoundTarget).toBe(false);
  });
});
