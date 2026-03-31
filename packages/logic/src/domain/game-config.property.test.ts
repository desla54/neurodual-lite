/**
 * Property-Based Tests for GameConfig and TrialVO Value Objects
 *
 * Uses fast-check to verify invariants and properties of game configuration
 * and trial evaluation.
 *
 * @see thresholds.ts for SSOT numeric values
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { GameConfig } from './game-config';
import { TrialVO } from './trial-vo';
import type { GeneratorName, Trial, TrialInput, Position, Sound, Color } from './types';
import { POSITIONS, SOUNDS, COLORS, DEFAULT_CONFIG } from './types';
import { VALIDATION_MIN_INTERVAL_SECONDS } from '../specs/thresholds';

// =============================================================================
// Arbitraries - Custom generators for domain types
// =============================================================================

/** Valid nLevel: integer >= 1 (no upper bound in validation, but reasonable range for tests) */
const arbValidNLevel = fc.integer({ min: 1, max: 10 });

/** Invalid nLevel: <= 0 or non-integer */
const arbInvalidNLevel = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.double({ min: 0.1, max: 9.9, noInteger: true }),
);

/** Valid trialsCount: positive integer */
const arbValidTrialsCount = fc.integer({ min: 1, max: 200 });

/** Invalid trialsCount: <= 0 or non-integer */
const arbInvalidTrialsCount = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.double({ min: 0.1, max: 99.9, noInteger: true }),
);

/** Valid probability: [0, 1] */
const arbValidProbability = fc.double({ min: 0, max: 1, noNaN: true });

/** Invalid probability: < 0 or > 1 */
const arbInvalidProbability = fc.oneof(
  fc.double({ min: -10, max: -0.001, noNaN: true }),
  fc.double({ min: 1.001, max: 10, noNaN: true }),
);

/** Valid intervalSeconds: >= VALIDATION_MIN_INTERVAL_SECONDS */
const arbValidIntervalSeconds = fc.double({
  min: VALIDATION_MIN_INTERVAL_SECONDS,
  max: 10,
  noNaN: true,
});

/** Invalid intervalSeconds: < VALIDATION_MIN_INTERVAL_SECONDS */
const arbInvalidIntervalSeconds = fc.double({
  min: 0,
  max: VALIDATION_MIN_INTERVAL_SECONDS - 0.001,
  noNaN: true,
});

/** Valid stimulus duration: > 0 and < interval */
const arbValidStimulusDuration = (interval: number) =>
  fc.double({ min: 0.001, max: interval - 0.001, noNaN: true });

/** Generator name */
const arbGeneratorName: fc.Arbitrary<GeneratorName> = fc.constantFrom(
  'Aleatoire',
  'BrainWorkshop',
  'DualnbackClassic',
  'Sequence',
);

/** Valid modalities array (non-empty) */
const arbValidModalities = fc.array(
  fc.constantFrom('position', 'audio', 'color', 'image', 'arithmetic'),
  { minLength: 1, maxLength: 5 },
);

/** Position value */
const arbPosition: fc.Arbitrary<Position> = fc.constantFrom(...POSITIONS);

/** Sound value */
const arbSound: fc.Arbitrary<Sound> = fc.constantFrom(...SOUNDS);

/** Color value */
const arbColor: fc.Arbitrary<Color> = fc.constantFrom(...COLORS);

/** Valid trial index: non-negative integer */
const arbValidTrialIndex = fc.integer({ min: 0, max: 1000 });

/** Boolean for flags */
const arbBoolean = fc.boolean();

/** Reaction time (positive or null) */
const arbReactionTime = fc.oneof(fc.constant(undefined), fc.integer({ min: 100, max: 5000 }));

// =============================================================================
// GameConfig Validation - 20 Property Tests
// =============================================================================

describe('GameConfig - Property Tests', () => {
  describe('nLevel validation (5 tests)', () => {
    it('accepts any valid nLevel >= 1', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return config.nLevel === nLevel;
        }),
        { numRuns: 100 },
      );
    });

    it('rejects any nLevel <= 0', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 0 }), (nLevel) => {
          try {
            new GameConfig({ nLevel });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid nLevel');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('rejects non-integer nLevel', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.1, max: 9.9, noInteger: true }), (nLevel) => {
          try {
            new GameConfig({ nLevel });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid nLevel');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('nLevel is always stored as exact integer', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return Number.isInteger(config.nLevel) && config.nLevel === nLevel;
        }),
        { numRuns: 100 },
      );
    });

    it('nLevel validation is deterministic', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config1 = new GameConfig({ nLevel });
          const config2 = new GameConfig({ nLevel });
          return config1.nLevel === config2.nLevel;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('trialsCount validation (4 tests)', () => {
    it('accepts any valid trialsCount >= 1', () => {
      fc.assert(
        fc.property(arbValidTrialsCount, (trialsCount) => {
          const config = new GameConfig({ trialsCount });
          return config.trialsCount === trialsCount;
        }),
        { numRuns: 100 },
      );
    });

    it('rejects trialsCount <= 0', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 0 }), (trialsCount) => {
          try {
            new GameConfig({ trialsCount });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid trialsCount');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('rejects non-integer trialsCount', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.1, max: 99.9, noInteger: true }), (trialsCount) => {
          try {
            new GameConfig({ trialsCount });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid trialsCount');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('trialsCount is always stored as exact integer', () => {
      fc.assert(
        fc.property(arbValidTrialsCount, (trialsCount) => {
          const config = new GameConfig({ trialsCount });
          return Number.isInteger(config.trialsCount) && config.trialsCount === trialsCount;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('probability validation (5 tests)', () => {
    it('accepts targetProbability in [0, 1]', () => {
      fc.assert(
        fc.property(arbValidProbability, (targetProbability) => {
          // Ensure lure is low enough to avoid BW constraint
          const config = new GameConfig({ targetProbability, lureProbability: 0 });
          return config.targetProbability === targetProbability;
        }),
        { numRuns: 100 },
      );
    });

    it('accepts lureProbability in [0, 1]', () => {
      fc.assert(
        fc.property(arbValidProbability, (lureProbability) => {
          // Ensure target is low enough to avoid BW constraint
          const config = new GameConfig({ targetProbability: 0, lureProbability });
          return config.lureProbability === lureProbability;
        }),
        { numRuns: 100 },
      );
    });

    it('rejects targetProbability outside [0, 1]', () => {
      fc.assert(
        fc.property(arbInvalidProbability, (targetProbability) => {
          try {
            new GameConfig({ targetProbability });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid targetProbability');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('rejects lureProbability outside [0, 1]', () => {
      fc.assert(
        fc.property(arbInvalidProbability, (lureProbability) => {
          try {
            new GameConfig({ lureProbability });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid lureProbability');
          }
        }),
        { numRuns: 50 },
      );
    });

    it('BrainWorkshop rejects target + lure > 1', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.51, max: 1, noNaN: true }),
          fc.double({ min: 0.51, max: 1, noNaN: true }),
          (target, lure) => {
            fc.pre(target + lure > 1);
            try {
              new GameConfig({
                generator: 'BrainWorkshop',
                targetProbability: target,
                lureProbability: lure,
              });
              return false;
            } catch (e) {
              return (e as Error).message.includes('Invalid probabilities');
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('timing validation (4 tests)', () => {
    it('accepts intervalSeconds >= VALIDATION_MIN_INTERVAL_SECONDS', () => {
      fc.assert(
        fc.property(arbValidIntervalSeconds, (intervalSeconds) => {
          const config = new GameConfig({
            intervalSeconds,
            stimulusDurationSeconds: VALIDATION_MIN_INTERVAL_SECONDS / 2,
          });
          return config.intervalSeconds === intervalSeconds;
        }),
        { numRuns: 100 },
      );
    });

    it('rejects intervalSeconds < VALIDATION_MIN_INTERVAL_SECONDS', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: VALIDATION_MIN_INTERVAL_SECONDS - 0.01, noNaN: true }),
          (intervalSeconds) => {
            try {
              new GameConfig({ intervalSeconds });
              return false;
            } catch (e) {
              return (e as Error).message.includes('Invalid intervalSeconds');
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it('accepts stimulusDurationSeconds > 0 and < interval', () => {
      fc.assert(
        fc.property(
          fc.double({ min: VALIDATION_MIN_INTERVAL_SECONDS, max: 5, noNaN: true }),
          (interval) => {
            const stimulus = interval / 2;
            const config = new GameConfig({
              generator: 'DualnbackClassic', // Non-BW requires stimulus < interval
              intervalSeconds: interval,
              stimulusDurationSeconds: stimulus,
            });
            return config.stimulusDurationSeconds === stimulus;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects stimulusDurationSeconds <= 0', () => {
      fc.assert(
        fc.property(fc.double({ min: -10, max: 0, noNaN: true }), (stimulusDurationSeconds) => {
          try {
            new GameConfig({ stimulusDurationSeconds });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid stimulusDurationSeconds');
          }
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('modalities validation (2 tests)', () => {
    it('accepts any non-empty modalities array', () => {
      fc.assert(
        fc.property(arbValidModalities, (activeModalities) => {
          const config = new GameConfig({ activeModalities });
          return (
            config.activeModalities.length === activeModalities.length &&
            activeModalities.every((m, i) => config.activeModalities[i] === m)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('rejects empty modalities array', () => {
      try {
        new GameConfig({ activeModalities: [] });
        expect(false).toBe(true);
      } catch (e) {
        expect((e as Error).message).toContain('activeModalities must be a non-empty array');
      }
    });
  });
});

// =============================================================================
// TrialVO - 15 Property Tests
// =============================================================================

describe('TrialVO - Property Tests', () => {
  /** Creates a minimal valid trial */
  const createTrial = (overrides: Partial<Trial> = {}): Trial => ({
    index: 0,
    isBuffer: false,
    position: 0,
    sound: 'C',
    color: 'ink-black',
    image: 'circle',
    trialType: 'Non-Cible',
    isPositionTarget: false,
    isSoundTarget: false,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorLure: false,
    isImageLure: false,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
    ...overrides,
  });

  describe('trial index validation (3 tests)', () => {
    it('index is always non-negative', () => {
      fc.assert(
        fc.property(arbValidTrialIndex, (index) => {
          const vo = new TrialVO(createTrial({ index }));
          return vo.index >= 0 && vo.index === index;
        }),
        { numRuns: 100 },
      );
    });

    it('index is stored exactly as provided', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10000 }), (index) => {
          const vo = new TrialVO(createTrial({ index }));
          return vo.index === index;
        }),
        { numRuns: 100 },
      );
    });

    it('index preserves integer type', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (index) => {
          const vo = new TrialVO(createTrial({ index }));
          return Number.isInteger(vo.index);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('position validation (3 tests)', () => {
    it('position is always in valid range [0, 7]', () => {
      fc.assert(
        fc.property(arbPosition, (position) => {
          const vo = new TrialVO(createTrial({ position }));
          return vo.position >= 0 && vo.position <= 7;
        }),
        { numRuns: 100 },
      );
    });

    it('position is stored exactly as provided', () => {
      fc.assert(
        fc.property(arbPosition, (position) => {
          const vo = new TrialVO(createTrial({ position }));
          return vo.position === position;
        }),
        { numRuns: 100 },
      );
    });

    it('position covers all valid values', () => {
      const seen = new Set<Position>();
      fc.assert(
        fc.property(arbPosition, (position) => {
          seen.add(position);
          return POSITIONS.includes(position);
        }),
        { numRuns: 200 },
      );
      expect(seen.size).toBe(POSITIONS.length);
    });
  });

  describe('sound validation (3 tests)', () => {
    it('sound is always a valid letter', () => {
      fc.assert(
        fc.property(arbSound, (sound) => {
          const vo = new TrialVO(createTrial({ sound }));
          return SOUNDS.includes(vo.sound);
        }),
        { numRuns: 100 },
      );
    });

    it('sound is stored exactly as provided', () => {
      fc.assert(
        fc.property(arbSound, (sound) => {
          const vo = new TrialVO(createTrial({ sound }));
          return vo.sound === sound;
        }),
        { numRuns: 100 },
      );
    });

    it('sound covers all valid letters', () => {
      const seen = new Set<Sound>();
      fc.assert(
        fc.property(arbSound, (sound) => {
          seen.add(sound);
          return SOUNDS.includes(sound);
        }),
        { numRuns: 200 },
      );
      expect(seen.size).toBe(SOUNDS.length);
    });
  });

  describe('color validation (3 tests)', () => {
    it('color is always a valid color name', () => {
      fc.assert(
        fc.property(arbColor, (color) => {
          const vo = new TrialVO(createTrial({ color }));
          return COLORS.includes(vo.color);
        }),
        { numRuns: 100 },
      );
    });

    it('color is stored exactly as provided', () => {
      fc.assert(
        fc.property(arbColor, (color) => {
          const vo = new TrialVO(createTrial({ color }));
          return vo.color === color;
        }),
        { numRuns: 100 },
      );
    });

    it('color covers all valid colors', () => {
      const seen = new Set<Color>();
      fc.assert(
        fc.property(arbColor, (color) => {
          seen.add(color);
          return COLORS.includes(color);
        }),
        { numRuns: 200 },
      );
      expect(seen.size).toBe(COLORS.length);
    });
  });

  describe('target flag validation (3 tests)', () => {
    it('isTargetFor returns boolean for any modality', () => {
      fc.assert(
        fc.property(
          arbBoolean,
          arbBoolean,
          arbBoolean,
          (isPositionTarget, isSoundTarget, isColorTarget) => {
            const vo = new TrialVO(createTrial({ isPositionTarget, isSoundTarget, isColorTarget }));
            return (
              typeof vo.isTargetFor('position') === 'boolean' &&
              typeof vo.isTargetFor('audio') === 'boolean' &&
              typeof vo.isTargetFor('color') === 'boolean'
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('targetCount is always non-negative', () => {
      fc.assert(
        fc.property(
          arbBoolean,
          arbBoolean,
          arbBoolean,
          (isPositionTarget, isSoundTarget, isColorTarget) => {
            const vo = new TrialVO(createTrial({ isPositionTarget, isSoundTarget, isColorTarget }));
            return vo.targetCount >= 0 && vo.targetCount <= 3;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('targetCount equals sum of individual targets', () => {
      fc.assert(
        fc.property(
          arbBoolean,
          arbBoolean,
          arbBoolean,
          (isPositionTarget, isSoundTarget, isColorTarget) => {
            const vo = new TrialVO(createTrial({ isPositionTarget, isSoundTarget, isColorTarget }));
            const expected =
              (isPositionTarget ? 1 : 0) + (isSoundTarget ? 1 : 0) + (isColorTarget ? 1 : 0);
            return vo.targetCount === expected;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// Config Consistency - 15 Property Tests
// =============================================================================

describe('Config Consistency - Property Tests', () => {
  describe('default config validity (5 tests)', () => {
    it('DEFAULT_CONFIG creates valid GameConfig', () => {
      const config = new GameConfig(DEFAULT_CONFIG);
      expect(config.nLevel).toBeGreaterThanOrEqual(1);
      expect(config.trialsCount).toBeGreaterThanOrEqual(1);
      expect(config.targetProbability).toBeGreaterThanOrEqual(0);
      expect(config.targetProbability).toBeLessThanOrEqual(1);
      expect(config.activeModalities.length).toBeGreaterThan(0);
    });

    it('empty config falls back to valid defaults', () => {
      const config = new GameConfig({});
      expect(config.nLevel).toBeGreaterThanOrEqual(1);
      expect(config.trialsCount).toBeGreaterThanOrEqual(1);
    });

    it('defaults satisfy all validation rules', () => {
      const config = new GameConfig({});
      expect(config.intervalSeconds).toBeGreaterThanOrEqual(VALIDATION_MIN_INTERVAL_SECONDS);
      expect(config.stimulusDurationSeconds).toBeGreaterThan(0);
      expect(config.stimulusDurationSeconds).toBeLessThanOrEqual(config.intervalSeconds);
    });

    it('defaults have valid generator name', () => {
      const config = new GameConfig({});
      const validGenerators: GeneratorName[] = [
        'Aleatoire',
        'BrainWorkshop',
        'DualnbackClassic',
        'Sequence',
      ];
      expect(validGenerators).toContain(config.generator);
    });

    it('defaults have non-empty modalities', () => {
      const config = new GameConfig({});
      expect(Array.isArray(config.activeModalities)).toBe(true);
      expect(config.activeModalities.length).toBeGreaterThan(0);
    });
  });

  describe('config merging preserves validity (5 tests)', () => {
    it('partial config merges correctly with defaults', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          // nLevel is overridden, other values come from defaults
          return (
            config.nLevel === nLevel &&
            config.trialsCount === DEFAULT_CONFIG.trialsCount &&
            config.generator === DEFAULT_CONFIG.generator
          );
        }),
        { numRuns: 50 },
      );
    });

    it('multiple partial overrides merge correctly', () => {
      fc.assert(
        fc.property(arbValidNLevel, arbValidTrialsCount, (nLevel, trialsCount) => {
          const config = new GameConfig({ nLevel, trialsCount });
          return config.nLevel === nLevel && config.trialsCount === trialsCount;
        }),
        { numRuns: 50 },
      );
    });

    it('GameConfig.from() produces same result as constructor', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config1 = new GameConfig({ nLevel });
          const config2 = GameConfig.from({ nLevel });
          return (
            config1.nLevel === config2.nLevel &&
            config1.trialsCount === config2.trialsCount &&
            config1.generator === config2.generator
          );
        }),
        { numRuns: 50 },
      );
    });

    it('toDTO round-trip preserves all fields', () => {
      fc.assert(
        fc.property(arbValidNLevel, arbValidTrialsCount, (nLevel, trialsCount) => {
          const original = new GameConfig({ nLevel, trialsCount });
          const dto = original.toDTO();
          const recreated = new GameConfig(dto);
          return (
            recreated.nLevel === original.nLevel &&
            recreated.trialsCount === original.trialsCount &&
            recreated.generator === original.generator &&
            recreated.targetProbability === original.targetProbability &&
            recreated.lureProbability === original.lureProbability &&
            recreated.intervalSeconds === original.intervalSeconds &&
            recreated.stimulusDurationSeconds === original.stimulusDurationSeconds
          );
        }),
        { numRuns: 50 },
      );
    });

    it('toDTO produces defensive copy of modalities', () => {
      const config = new GameConfig({ activeModalities: ['position', 'audio'] });
      const dto = config.toDTO();
      // @ts-expect-error test override
      dto.activeModalities.push('color');
      expect(config.activeModalities).toEqual(['position', 'audio']);
    });
  });

  describe('required fields are always present (5 tests)', () => {
    it('nLevel is always defined', () => {
      fc.assert(
        fc.property(arbValidTrialsCount, (trialsCount) => {
          const config = new GameConfig({ trialsCount });
          return typeof config.nLevel === 'number' && config.nLevel >= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('generator is always defined', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return typeof config.generator === 'string' && config.generator.length > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('activeModalities is always a non-empty array', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return Array.isArray(config.activeModalities) && config.activeModalities.length > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('timing fields are always positive', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return (
            config.intervalSeconds >= VALIDATION_MIN_INTERVAL_SECONDS &&
            config.stimulusDurationSeconds > 0
          );
        }),
        { numRuns: 50 },
      );
    });

    it('probability fields are always in valid range', () => {
      fc.assert(
        fc.property(arbValidNLevel, (nLevel) => {
          const config = new GameConfig({ nLevel });
          return (
            config.targetProbability >= 0 &&
            config.targetProbability <= 1 &&
            config.lureProbability >= 0 &&
            config.lureProbability <= 1
          );
        }),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// TrialVO Evaluation Properties - Additional Tests
// =============================================================================

describe('TrialVO Evaluation - Property Tests', () => {
  const createTrial = (overrides: Partial<Trial> = {}): Trial => ({
    index: 0,
    isBuffer: false,
    position: 0,
    sound: 'C',
    color: 'ink-black',
    image: 'circle',
    trialType: 'Non-Cible',
    isPositionTarget: false,
    isSoundTarget: false,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorLure: false,
    isImageLure: false,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
    ...overrides,
  });

  const createInput = (overrides: Partial<TrialInput> = {}): TrialInput => ({
    position: false,
    audio: false,
    color: false,
    ...overrides,
  });

  describe('SDT result classification (5 tests)', () => {
    it('target + response = hit', () => {
      fc.assert(
        fc.property(arbBoolean, (isTarget) => {
          if (!isTarget) return true; // Skip non-target cases
          const vo = new TrialVO(createTrial({ isPositionTarget: true }));
          const verdict = vo.evaluate(createInput({ position: true }));
          return verdict.position.result === 'hit';
        }),
        { numRuns: 100 },
      );
    });

    it('target + no response = miss', () => {
      fc.assert(
        fc.property(arbBoolean, (isTarget) => {
          if (!isTarget) return true;
          const vo = new TrialVO(createTrial({ isPositionTarget: true }));
          const verdict = vo.evaluate(createInput({ position: false }));
          return verdict.position.result === 'miss';
        }),
        { numRuns: 100 },
      );
    });

    it('non-target + response = falseAlarm', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: false }));
      const verdict = vo.evaluate(createInput({ position: true }));
      expect(verdict.position.result).toBe('falseAlarm');
    });

    it('non-target + no response = correctRejection', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: false }));
      const verdict = vo.evaluate(createInput({ position: false }));
      expect(verdict.position.result).toBe('correctRejection');
    });

    it('result classification is deterministic', () => {
      fc.assert(
        fc.property(arbBoolean, arbBoolean, (isTarget, responded) => {
          const vo = new TrialVO(createTrial({ isPositionTarget: isTarget }));
          const verdict1 = vo.evaluate(createInput({ position: responded }));
          const verdict2 = vo.evaluate(createInput({ position: responded }));
          return verdict1.position.result === verdict2.position.result;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('isFullyCorrect consistency (5 tests)', () => {
    it('all hits = fully correct', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (posTarget, audioTarget) => {
          const vo = new TrialVO(
            createTrial({ isPositionTarget: posTarget, isSoundTarget: audioTarget }),
          );
          const verdict = vo.evaluate(createInput({ position: posTarget, audio: audioTarget }));
          return verdict.isFullyCorrect === true;
        }),
        { numRuns: 100 },
      );
    });

    it('all correct rejections = fully correct', () => {
      const vo = new TrialVO(createTrial({ isPositionTarget: false, isSoundTarget: false }));
      const verdict = vo.evaluate(createInput({ position: false, audio: false }));
      expect(verdict.isFullyCorrect).toBe(true);
    });

    it('any miss = not fully correct', () => {
      fc.assert(
        fc.property(fc.boolean(), (audioTarget) => {
          const vo = new TrialVO(
            createTrial({ isPositionTarget: true, isSoundTarget: audioTarget }),
          );
          // Position is target but not responded
          const verdict = vo.evaluate(createInput({ position: false, audio: audioTarget }));
          return verdict.isFullyCorrect === false;
        }),
        { numRuns: 50 },
      );
    });

    it('any false alarm = not fully correct', () => {
      fc.assert(
        fc.property(fc.boolean(), (audioTarget) => {
          const vo = new TrialVO(
            createTrial({ isPositionTarget: false, isSoundTarget: audioTarget }),
          );
          // Position is not target but responded (false alarm)
          const verdict = vo.evaluate(createInput({ position: true, audio: audioTarget }));
          return verdict.isFullyCorrect === false;
        }),
        { numRuns: 50 },
      );
    });

    it('isFullyCorrect is symmetric across modalities', () => {
      // If position and audio have same target/response pattern, result should be same
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (isTarget, responded) => {
          const vo = new TrialVO(
            createTrial({ isPositionTarget: isTarget, isSoundTarget: isTarget }),
          );
          const verdict = vo.evaluate(createInput({ position: responded, audio: responded }));
          // Same pattern for both modalities = symmetric result
          const posCorrect =
            verdict.position.result === 'hit' || verdict.position.result === 'correctRejection';
          const audioCorrect =
            verdict.audio.result === 'hit' || verdict.audio.result === 'correctRejection';
          return posCorrect === audioCorrect;
        }),
        { numRuns: 100 },
      );
    });
  });
});
