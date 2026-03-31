/**
 * Property-Based Tests for Modality System
 *
 * Comprehensive property tests covering:
 * - Modality registry (15 tests)
 * - Flexible trial (20 tests)
 * - Trial adaptation (15 tests)
 *
 * Uses fast-check to verify invariants and properties.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  ModalityRegistry,
  modalityRegistry,
  createStimulus,
  type ModalityDefinition,
  type Stimulus,
  type StimulusValue,
} from './modality';
import {
  FlexibleTrialBuilder,
  getStimulus,
  getStimulusValue,
  isTarget,
  isLure,
  getActiveModalities,
  getTargets,
  getLures,
  type FlexibleTrial,
} from './flexible-trial';
import {
  toTrial,
  toTrials,
  isFlexibleTrial,
  getPosition,
  getSound,
  getIsTarget,
  getIsLure,
  getHasResponse,
  getResponseRT,
  isFlexibleTrialInput,
  type FlexibleTrialInput,
} from './trial-adapter';
import type { ModalityId, LureType, Position, Sound, Color, TrialInput } from '../types';
import { IMAGE_MODALITY_SHAPES, SOUNDS, COLORS } from '../types';

// =============================================================================
// Arbitraries (Test Data Generators)
// =============================================================================

/** Arbitrary for valid ModalityId */
const arbModalityId = fc.oneof(
  fc.constant('position' as ModalityId),
  fc.constant('audio' as ModalityId),
  fc.constant('color' as ModalityId),
  fc.constant('image' as ModalityId),
  fc.constant('position2' as ModalityId),
  fc.constant('position3' as ModalityId),
  fc.constant('audio2' as ModalityId),
  fc.constant('vis1' as ModalityId),
  fc.constant('vis2' as ModalityId),
  fc.constant('visvis' as ModalityId),
  fc.constant('visaudio' as ModalityId),
  fc.constant('audiovis' as ModalityId),
);

/** Arbitrary for known registered modality IDs */
const arbRegisteredModalityId = fc.oneof(
  fc.constant('position' as ModalityId),
  fc.constant('audio' as ModalityId),
  fc.constant('color' as ModalityId),
);

/** Arbitrary for Position values (0-7) */
const arbPosition = fc.integer({ min: 0, max: 7 }) as fc.Arbitrary<Position>;

/** Arbitrary for Sound values */
const arbSound = fc.constantFrom(...SOUNDS) as fc.Arbitrary<Sound>;

/** Arbitrary for Color values */
const arbColor = fc.constantFrom(...COLORS) as fc.Arbitrary<Color>;

/** Arbitrary for ImageShape values */
const arbImageShape = fc.constantFrom(...IMAGE_MODALITY_SHAPES);

/** Arbitrary for LureType */
const arbLureType = fc.constantFrom<LureType>('n-1', 'n+1', 'sequence');

/** Arbitrary for StimulusValue */
const arbStimulusValue: fc.Arbitrary<StimulusValue> = fc.oneof(
  fc.integer({ min: 0, max: 100 }),
  fc.string({ minLength: 1, maxLength: 10 }),
);

/** Arbitrary for non-negative trial index */
const arbTrialIndex = fc.integer({ min: 0, max: 1000 });

/** Arbitrary for boolean */
const arbBoolean = fc.boolean();

/** Arbitrary for Stimulus */
const arbStimulus = (modalityId: ModalityId = 'position'): fc.Arbitrary<Stimulus> =>
  fc.record({
    modalityId: fc.constant(modalityId),
    value: arbStimulusValue,
    isTarget: arbBoolean,
    isLure: arbBoolean,
    lureType: fc.option(arbLureType, { nil: undefined }),
  });

/** Arbitrary for creating a basic FlexibleTrial */
const arbFlexibleTrial: fc.Arbitrary<FlexibleTrial> = fc
  .record({
    index: arbTrialIndex,
    isBuffer: arbBoolean,
    positionValue: arbPosition,
    positionIsTarget: arbBoolean,
    positionIsLure: arbBoolean,
    audioValue: arbSound,
    audioIsTarget: arbBoolean,
    audioIsLure: arbBoolean,
    colorValue: arbColor,
    colorIsTarget: arbBoolean,
    colorIsLure: arbBoolean,
  })
  .map(
    ({
      index,
      isBuffer,
      positionValue,
      positionIsTarget,
      positionIsLure,
      audioValue,
      audioIsTarget,
      audioIsLure,
      colorValue,
      colorIsTarget,
      colorIsLure,
    }) => {
      const builder = new FlexibleTrialBuilder();
      builder
        .setIndex(index)
        .setBuffer(isBuffer)
        .addStimulus(createStimulus('position', positionValue, positionIsTarget, positionIsLure))
        .addStimulus(createStimulus('audio', audioValue, audioIsTarget, audioIsLure))
        .addStimulus(createStimulus('color', colorValue, colorIsTarget, colorIsLure));
      return builder.build();
    },
  );

/** Arbitrary for TrialInput (legacy format) */
const arbTrialInput: fc.Arbitrary<TrialInput> = fc.record({
  position: fc.option(arbBoolean, { nil: undefined }),
  positionRT: fc.option(fc.integer({ min: 100, max: 2000 }), { nil: undefined }),
  audio: fc.option(arbBoolean, { nil: undefined }),
  audioRT: fc.option(fc.integer({ min: 100, max: 2000 }), { nil: undefined }),
  color: fc.option(arbBoolean, { nil: undefined }),
  colorRT: fc.option(fc.integer({ min: 100, max: 2000 }), { nil: undefined }),
});

/** Arbitrary for FlexibleTrialInput */
const arbFlexibleTrialInput: fc.Arbitrary<FlexibleTrialInput> = fc
  .array(
    fc.record({
      modalityId: arbModalityId,
      pressed: arbBoolean,
      rt: fc.option(fc.integer({ min: 100, max: 2000 }), { nil: undefined }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((responses) => ({
    responses: new Map(responses.map((r) => [r.modalityId, { pressed: r.pressed, rt: r.rt }])),
  }));

/** Arbitrary for ModalityDefinition */
const arbModalityDefinition = <T extends StimulusValue>(
  pool: readonly T[],
): fc.Arbitrary<ModalityDefinition<T>> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s as ModalityId),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constantFrom<'visual' | 'auditory' | 'haptic'>('visual', 'auditory', 'haptic'),
    pool: fc.constant(pool),
    defaultValue: fc.option(fc.constantFrom(...pool), { nil: undefined }),
    requiresRender: arbBoolean,
  });

// =============================================================================
// PART 1: Modality Registry (15 tests)
// =============================================================================

describe('ModalityRegistry - Property Tests', () => {
  describe('Registry Invariants', () => {
    it('1. all registered modalities have non-empty pools', () => {
      const modalities = modalityRegistry.getAll();
      for (const modality of modalities) {
        expect(modality.pool.length).toBeGreaterThan(0);
      }
    });

    it('2. all registered modalities have valid type', () => {
      const validTypes = ['visual', 'auditory', 'haptic'];
      const modalities = modalityRegistry.getAll();
      for (const modality of modalities) {
        expect(validTypes).toContain(modality.type);
      }
    });

    it('3. pool values are unique within each modality', () => {
      const modalities = modalityRegistry.getAll();
      for (const modality of modalities) {
        const pool = modality.pool;
        const uniqueValues = new Set(pool);
        expect(uniqueValues.size).toBe(pool.length);
      }
    });

    it('4. default values are in pool when defined', () => {
      const modalities = modalityRegistry.getAll();
      for (const modality of modalities) {
        if (modality.defaultValue !== undefined) {
          expect(modality.pool).toContain(modality.defaultValue);
        }
      }
    });

    it('5. has() returns true for all listed modalities', () => {
      const ids = modalityRegistry.list();
      for (const id of ids) {
        expect(modalityRegistry.has(id)).toBe(true);
      }
    });

    it('6. get() returns same object for same id', () => {
      const ids = modalityRegistry.list();
      for (const id of ids) {
        const m1 = modalityRegistry.get(id);
        const m2 = modalityRegistry.get(id);
        expect(m1).toBe(m2);
      }
    });

    it('7. getByType filters correctly', () => {
      const visualModalities = modalityRegistry.getByType('visual');
      for (const m of visualModalities) {
        expect(m.type).toBe('visual');
      }
      const auditoryModalities = modalityRegistry.getByType('auditory');
      for (const m of auditoryModalities) {
        expect(m.type).toBe('auditory');
      }
    });

    it('8. list() returns array of unique ids', () => {
      const ids = modalityRegistry.list();
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Registry Operations', () => {
    it('9. registering new modality makes it retrievable', () => {
      fc.assert(
        fc.property(arbModalityDefinition([1, 2, 3, 4, 5]), (definition) => {
          const registry = new ModalityRegistry();
          const uniqueId = `test-${Math.random().toString(36).slice(2)}` as ModalityId;
          const defWithUniqueId = { ...definition, id: uniqueId };

          registry.register(defWithUniqueId);

          expect(registry.has(uniqueId)).toBe(true);
          expect(registry.get(uniqueId)).toEqual(defWithUniqueId);
          return true;
        }),
        { numRuns: 20 },
      );
    });

    it('10. registry throws for unknown modality', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 20 }), (unknownId) => {
          const registry = new ModalityRegistry();
          // Ensure it's not registered
          if (!registry.has(unknownId as ModalityId)) {
            expect(() => registry.get(unknownId as ModalityId)).toThrow('Unknown modality');
          }
          return true;
        }),
        { numRuns: 20 },
      );
    });

    it('11. register returns this for chaining', () => {
      const registry = new ModalityRegistry();
      const def1: ModalityDefinition<number> = {
        id: 'test1' as ModalityId,
        displayName: 'Test 1',
        type: 'visual',
        pool: [1, 2, 3],
        requiresRender: true,
      };
      const result = registry.register(def1);
      expect(result).toBe(registry);
    });

    it('12. multiple registrations can be chained', () => {
      const registry = new ModalityRegistry();
      registry
        .register({
          id: 'chain1' as ModalityId,
          displayName: 'Chain 1',
          type: 'visual',
          pool: [1],
          requiresRender: true,
        })
        .register({
          id: 'chain2' as ModalityId,
          displayName: 'Chain 2',
          type: 'auditory',
          pool: ['a'],
          requiresRender: false,
        });

      expect(registry.has('chain1' as ModalityId)).toBe(true);
      expect(registry.has('chain2' as ModalityId)).toBe(true);
    });

    it('13. getAll returns all registered modalities', () => {
      const registry = new ModalityRegistry();
      const defs: ModalityDefinition<number>[] = [
        {
          id: 'a' as ModalityId,
          displayName: 'A',
          type: 'visual',
          pool: [1],
          requiresRender: true,
        },
        {
          id: 'b' as ModalityId,
          displayName: 'B',
          type: 'auditory',
          pool: [2],
          requiresRender: false,
        },
        {
          id: 'c' as ModalityId,
          displayName: 'C',
          type: 'haptic',
          pool: [3],
          requiresRender: true,
        },
      ];

      for (const def of defs) {
        registry.register(def);
      }

      const all = registry.getAll();
      expect(all.length).toBe(3);
    });

    it('14. position modality has 8 positions (0-7)', () => {
      const posModality = modalityRegistry.get('position');
      expect(posModality.pool.length).toBe(8);
      expect(posModality.pool).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('15. audio modality has 8 letters', () => {
      const audioModality = modalityRegistry.get('audio');
      expect(audioModality.pool.length).toBe(8);
      expect(audioModality.pool).toEqual(['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T']);
    });
  });
});

// =============================================================================
// PART 2: Flexible Trial (20 tests)
// =============================================================================

describe('FlexibleTrial - Property Tests', () => {
  describe('Trial Index Invariants', () => {
    it('16. trial index is preserved through build', () => {
      fc.assert(
        fc.property(arbTrialIndex, (index) => {
          const trial = new FlexibleTrialBuilder().setIndex(index).build();
          return trial.index === index;
        }),
        { numRuns: 100 },
      );
    });

    it('17. trial index is non-negative for valid builds', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (trial) => {
          return trial.index >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('18. builder reset clears index to 0', () => {
      fc.assert(
        fc.property(arbTrialIndex, (index) => {
          const builder = new FlexibleTrialBuilder();
          builder.setIndex(index);
          builder.reset();
          const trial = builder.build();
          return trial.index === 0;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Stimuli Map Consistency', () => {
    it('19. stimuli map contains all added stimuli', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const builder = new FlexibleTrialBuilder();
          builder.addStimulus(createStimulus('position', pos, false, false));
          builder.addStimulus(createStimulus('audio', sound, false, false));
          const trial = builder.build();

          return trial.stimuli.has('position') && trial.stimuli.has('audio');
        }),
        { numRuns: 50 },
      );
    });

    it('20. stimuli values are preserved', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const builder = new FlexibleTrialBuilder();
          builder.addStimulus(createStimulus('position', pos, false, false));
          builder.addStimulus(createStimulus('audio', sound, false, false));
          const trial = builder.build();

          return (
            getStimulusValue(trial, 'position') === pos &&
            getStimulusValue(trial, 'audio') === sound
          );
        }),
        { numRuns: 50 },
      );
    });

    it('21. getStimulus returns correct stimulus object', () => {
      fc.assert(
        fc.property(arbPosition, arbBoolean, arbBoolean, (pos, isTargetVal, isLureVal) => {
          const stimulus = createStimulus('position', pos, isTargetVal, isLureVal);
          const trial = new FlexibleTrialBuilder().addStimulus(stimulus).build();
          const retrieved = getStimulus(trial, 'position');

          return (
            retrieved !== undefined &&
            retrieved.value === pos &&
            retrieved.isTarget === isTargetVal &&
            retrieved.isLure === isLureVal
          );
        }),
        { numRuns: 50 },
      );
    });

    it('22. getStimulus returns undefined for missing modality', () => {
      const trial = new FlexibleTrialBuilder()
        .addStimulus(createStimulus('position', 0, false, false))
        .build();
      expect(getStimulus(trial, 'audio')).toBeUndefined();
    });

    it('23. stimuli map is immutable (new Map instance)', () => {
      const builder = new FlexibleTrialBuilder();
      builder.addStimulus(createStimulus('position', 0, false, false));
      const trial1 = builder.build();
      builder.addStimulus(createStimulus('audio', 'C', false, false));
      const trial2 = builder.build();

      // trial1 should not have audio
      expect(trial1.stimuli.has('audio')).toBe(false);
      expect(trial2.stimuli.has('audio')).toBe(true);
    });
  });

  describe('Target Detection Determinism', () => {
    it('24. isTarget returns consistent result', () => {
      fc.assert(
        fc.property(arbPosition, arbBoolean, (pos, targetFlag) => {
          const stimulus = createStimulus('position', pos, targetFlag, false);
          const trial = new FlexibleTrialBuilder().addStimulus(stimulus).build();

          // Multiple calls should return same result
          const result1 = isTarget(trial, 'position');
          const result2 = isTarget(trial, 'position');

          return result1 === result2 && result1 === targetFlag;
        }),
        { numRuns: 50 },
      );
    });

    it('25. isLure returns consistent result', () => {
      fc.assert(
        fc.property(arbPosition, arbBoolean, (pos, lureFlag) => {
          const stimulus = createStimulus('position', pos, false, lureFlag);
          const trial = new FlexibleTrialBuilder().addStimulus(stimulus).build();

          const result1 = isLure(trial, 'position');
          const result2 = isLure(trial, 'position');

          return result1 === result2 && result1 === lureFlag;
        }),
        { numRuns: 50 },
      );
    });

    it('26. getTargets returns all and only targets', () => {
      fc.assert(
        fc.property(
          arbPosition,
          arbSound,
          arbBoolean,
          arbBoolean,
          (pos, sound, posTarget, audioTarget) => {
            const trial = new FlexibleTrialBuilder()
              .addStimulus(createStimulus('position', pos, posTarget, false))
              .addStimulus(createStimulus('audio', sound, audioTarget, false))
              .build();

            const targets = getTargets(trial);
            const expectedCount = (posTarget ? 1 : 0) + (audioTarget ? 1 : 0);

            return targets.length === expectedCount && targets.every((s) => s.isTarget === true);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('27. getLures returns all and only lures', () => {
      fc.assert(
        fc.property(
          arbPosition,
          arbSound,
          arbBoolean,
          arbBoolean,
          (pos, sound, posLure, audioLure) => {
            const trial = new FlexibleTrialBuilder()
              .addStimulus(createStimulus('position', pos, false, posLure))
              .addStimulus(createStimulus('audio', sound, false, audioLure))
              .build();

            const lures = getLures(trial);
            const expectedCount = (posLure ? 1 : 0) + (audioLure ? 1 : 0);

            return lures.length === expectedCount && lures.every((s) => s.isLure === true);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Buffer Trial Properties', () => {
    it('28. buffer trials have trialType "Tampon"', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const trial = new FlexibleTrialBuilder()
            .setBuffer(true)
            .addStimulus(createStimulus('position', pos, true, false)) // Even with target
            .addStimulus(createStimulus('audio', sound, true, false))
            .build();

          return trial.trialType === 'Tampon';
        }),
        { numRuns: 50 },
      );
    });

    it('29. isBuffer flag is preserved', () => {
      fc.assert(
        fc.property(arbBoolean, (isBuffer) => {
          const trial = new FlexibleTrialBuilder().setBuffer(isBuffer).build();
          return trial.isBuffer === isBuffer;
        }),
        { numRuns: 50 },
      );
    });

    it('30. reset clears buffer flag', () => {
      const builder = new FlexibleTrialBuilder();
      builder.setBuffer(true);
      builder.reset();
      const trial = builder.build();
      expect(trial.isBuffer).toBe(false);
    });
  });

  describe('Trial Type Computation', () => {
    it('31. dual targets produce "Dual" type', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const trial = new FlexibleTrialBuilder()
            .setBuffer(false)
            .addStimulus(createStimulus('position', pos, true, false))
            .addStimulus(createStimulus('audio', sound, true, false))
            .build();

          return trial.trialType === 'Dual';
        }),
        { numRuns: 30 },
      );
    });

    it('32. position-only target produces "V-Seul" type', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const trial = new FlexibleTrialBuilder()
            .setBuffer(false)
            .addStimulus(createStimulus('position', pos, true, false))
            .addStimulus(createStimulus('audio', sound, false, false))
            .build();

          return trial.trialType === 'V-Seul';
        }),
        { numRuns: 30 },
      );
    });

    it('33. audio-only target produces "A-Seul" type', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const trial = new FlexibleTrialBuilder()
            .setBuffer(false)
            .addStimulus(createStimulus('position', pos, false, false))
            .addStimulus(createStimulus('audio', sound, true, false))
            .build();

          return trial.trialType === 'A-Seul';
        }),
        { numRuns: 30 },
      );
    });

    it('34. no targets produces "Non-Cible" type', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, (pos, sound) => {
          const trial = new FlexibleTrialBuilder()
            .setBuffer(false)
            .addStimulus(createStimulus('position', pos, false, false))
            .addStimulus(createStimulus('audio', sound, false, false))
            .build();

          return trial.trialType === 'Non-Cible';
        }),
        { numRuns: 30 },
      );
    });

    it('35. getActiveModalities returns all modality ids', () => {
      fc.assert(
        fc.property(arbPosition, arbSound, arbColor, (pos, sound, color) => {
          const trial = new FlexibleTrialBuilder()
            .addStimulus(createStimulus('position', pos, false, false))
            .addStimulus(createStimulus('audio', sound, false, false))
            .addStimulus(createStimulus('color', color, false, false))
            .build();

          const modalities = getActiveModalities(trial);
          return (
            modalities.length === 3 &&
            modalities.includes('position') &&
            modalities.includes('audio') &&
            modalities.includes('color')
          );
        }),
        { numRuns: 30 },
      );
    });
  });
});

// =============================================================================
// PART 3: Trial Adaptation (15 tests)
// =============================================================================

describe('TrialAdapter - Property Tests', () => {
  describe('Conversion Preserves Data', () => {
    it('36. toTrial preserves index', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return trial.index === flexible.index;
        }),
        { numRuns: 50 },
      );
    });

    it('37. toTrial preserves isBuffer', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return trial.isBuffer === flexible.isBuffer;
        }),
        { numRuns: 50 },
      );
    });

    it('38. toTrial preserves trialType', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return trial.trialType === flexible.trialType;
        }),
        { numRuns: 50 },
      );
    });

    it('39. toTrial preserves position value', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          const flexiblePos = getStimulusValue(flexible, 'position');
          return trial.position === flexiblePos;
        }),
        { numRuns: 50 },
      );
    });

    it('40. toTrial preserves audio value', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          const flexibleSound = getStimulusValue(flexible, 'audio');
          return trial.sound === flexibleSound;
        }),
        { numRuns: 50 },
      );
    });

    it('41. toTrial preserves target flags', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return (
            trial.isPositionTarget === isTarget(flexible, 'position') &&
            trial.isSoundTarget === isTarget(flexible, 'audio')
          );
        }),
        { numRuns: 50 },
      );
    });

    it('42. toTrial preserves lure flags', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return (
            (trial.isPositionLure ?? false) === isLure(flexible, 'position') &&
            (trial.isSoundLure ?? false) === isLure(flexible, 'audio')
          );
        }),
        { numRuns: 50 },
      );
    });

    it('43. toTrials preserves array length', () => {
      fc.assert(
        fc.property(fc.array(arbFlexibleTrial, { minLength: 0, maxLength: 20 }), (flexibles) => {
          const trials = toTrials(flexibles);
          return trials.length === flexibles.length;
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('Type Guards', () => {
    it('44. isFlexibleTrial returns true for FlexibleTrial', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          return isFlexibleTrial(flexible);
        }),
        { numRuns: 50 },
      );
    });

    it('45. isFlexibleTrial returns false for legacy Trial', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          return !isFlexibleTrial(trial);
        }),
        { numRuns: 50 },
      );
    });

    it('46. isFlexibleTrialInput returns true for FlexibleTrialInput', () => {
      fc.assert(
        fc.property(arbFlexibleTrialInput, (input) => {
          return isFlexibleTrialInput(input);
        }),
        { numRuns: 30 },
      );
    });

    it('47. isFlexibleTrialInput returns false for legacy TrialInput', () => {
      fc.assert(
        fc.property(arbTrialInput, (input) => {
          return !isFlexibleTrialInput(input);
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('Legacy Format Compatibility', () => {
    it('48. getPosition works for both formats', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          const posFromFlex = getPosition(flexible);
          const posFromTrial = getPosition(trial);
          return posFromFlex === posFromTrial;
        }),
        { numRuns: 50 },
      );
    });

    it('49. getSound works for both formats', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, (flexible) => {
          const trial = toTrial(flexible);
          const soundFromFlex = getSound(flexible);
          const soundFromTrial = getSound(trial);
          return soundFromFlex === soundFromTrial;
        }),
        { numRuns: 50 },
      );
    });

    it('50. getIsTarget works for both formats', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, arbRegisteredModalityId, (flexible, modalityId) => {
          const trial = toTrial(flexible);
          const targetFromFlex = getIsTarget(flexible, modalityId);
          const targetFromTrial = getIsTarget(trial, modalityId);
          return targetFromFlex === targetFromTrial;
        }),
        { numRuns: 50 },
      );
    });

    it('51. getIsLure works for both formats', () => {
      fc.assert(
        fc.property(arbFlexibleTrial, arbRegisteredModalityId, (flexible, modalityId) => {
          const trial = toTrial(flexible);
          const lureFromFlex = getIsLure(flexible, modalityId);
          const lureFromTrial = getIsLure(trial, modalityId);
          return lureFromFlex === lureFromTrial;
        }),
        { numRuns: 50 },
      );
    });

    it('52. getHasResponse works for legacy TrialInput', () => {
      fc.assert(
        fc.property(arbTrialInput, (input) => {
          const posResponse = getHasResponse(input, 'position');
          const audioResponse = getHasResponse(input, 'audio');
          const colorResponse = getHasResponse(input, 'color');

          return (
            posResponse === (input.position === true) &&
            audioResponse === (input.audio === true) &&
            colorResponse === (input.color === true)
          );
        }),
        { numRuns: 50 },
      );
    });

    it('53. getHasResponse works for FlexibleTrialInput', () => {
      fc.assert(
        fc.property(arbFlexibleTrialInput, (input) => {
          for (const [modalityId, response] of input.responses) {
            const hasResponse = getHasResponse(input, modalityId);
            if (hasResponse !== response.pressed) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 30 },
      );
    });

    it('54. getResponseRT works for legacy TrialInput', () => {
      fc.assert(
        fc.property(arbTrialInput, (input) => {
          const posRT = getResponseRT(input, 'position');
          const audioRT = getResponseRT(input, 'audio');

          return posRT === input.positionRT && audioRT === input.audioRT;
        }),
        { numRuns: 50 },
      );
    });

    it('55. getResponseRT works for FlexibleTrialInput', () => {
      fc.assert(
        fc.property(arbFlexibleTrialInput, (input) => {
          for (const [modalityId, response] of input.responses) {
            const rt = getResponseRT(input, modalityId);
            if (rt !== response.rt) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 30 },
      );
    });
  });
});
