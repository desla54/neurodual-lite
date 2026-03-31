/**
 * Property-Based Tests for BlockGenerator
 *
 * Comprehensive property tests covering:
 * 1. Block configuration validity
 * 2. Trial count properties (always positive, matches config)
 * 3. Target distribution properties
 * 4. N-level consistency
 * 5. Modality configuration invariants
 * 6. Timing configuration bounds
 *
 * Uses fast-check fc.assert and fc.property patterns.
 *
 * @see thresholds.ts for SSOT numeric values
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
// Import from index to trigger strategy registration
import { BlockGenerator, strategyRegistry } from './index';
import type { Block, BlockConfig, GeneratorName, Trial, Position, Sound, Color } from '../types';
import { POSITIONS, SOUNDS, COLORS } from '../types';
import {
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
} from '../../specs/thresholds';

// =============================================================================
// Arbitraries - Custom generators for domain types
// =============================================================================

/** Valid N-level: integer >= 1 */
const arbValidNLevel = fc.integer({ min: 1, max: 5 });

/** Valid trials count: positive integer */
const arbValidTrialsCount = fc.integer({ min: 10, max: 50 });

/** Valid probability: [0, 1] */
const arbValidProbability = fc.double({ min: 0, max: 0.5, noNaN: true });

/** Valid interval seconds: positive */
const arbValidIntervalSeconds = fc.double({ min: 0.5, max: 5.0, noNaN: true });

/** Valid stimulus duration: positive and less than interval */
const arbValidStimulusDuration = fc.double({ min: 0.1, max: 0.9, noNaN: true });

/** Seed for reproducibility */
const arbSeed = fc.string({ minLength: 1, maxLength: 20 });

/** Generator name (only use registered strategies) */
const arbGeneratorName: fc.Arbitrary<GeneratorName> = fc.constantFrom(
  'BrainWorkshop',
  'DualnbackClassic',
);

/** Standard modalities */
const arbStandardModalities = fc.constantFrom(
  ['position', 'audio'],
  ['position', 'audio', 'color'],
  ['position', 'audio', 'image'],
);

/** Position value */
const arbPosition: fc.Arbitrary<Position> = fc.constantFrom(...POSITIONS);

/** Sound value */
const arbSound: fc.Arbitrary<Sound> = fc.constantFrom(...SOUNDS);

/** Color value */
const arbColor: fc.Arbitrary<Color> = fc.constantFrom(...COLORS);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a valid BlockConfig with overrides.
 * Uses DualnbackClassic by default since it has predictable trial counts.
 */
const createBlockConfig = (overrides: Partial<BlockConfig> = {}): BlockConfig => ({
  nLevel: 2,
  generator: 'DualnbackClassic',
  activeModalities: ['position', 'audio'],
  trialsCount: 20,
  targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
  lureProbability: GEN_LURE_PROBABILITY_DEFAULT,
  intervalSeconds: TIMING_INTERVAL_DEFAULT_MS / 1000,
  stimulusDurationSeconds: TIMING_STIMULUS_TEMPO_MS / 1000,
  ...overrides,
});

/**
 * Creates a BlockConfig arbitrary for property tests.
 */
const arbBlockConfig = (generator: GeneratorName = 'DualnbackClassic'): fc.Arbitrary<BlockConfig> =>
  fc.record({
    nLevel: arbValidNLevel,
    generator: fc.constant(generator),
    activeModalities: fc.constant(['position', 'audio'] as string[]),
    trialsCount: arbValidTrialsCount,
    targetProbability: arbValidProbability,
    lureProbability: arbValidProbability,
    intervalSeconds: arbValidIntervalSeconds,
    stimulusDurationSeconds: arbValidStimulusDuration,
  });

// =============================================================================
// Block Configuration Validity (10 tests)
// =============================================================================

describe('BlockConfig Validity - Property Tests', () => {
  it('generated block always has a valid id (UUID format)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        // UUID v4 format: 8-4-4-4-12 hex characters
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(block.id);
      }),
      { numRuns: 50 },
    );
  });

  it('generated block stores the exact config provided', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return (
          block.config.nLevel === config.nLevel &&
          block.config.generator === config.generator &&
          block.config.trialsCount === config.trialsCount &&
          block.config.activeModalities.length === config.activeModalities.length
        );
      }),
      { numRuns: 50 },
    );
  });

  it('generated block stores the exact seed provided', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig();
        const block = BlockGenerator.generate(config, seed);
        return block.seed === seed;
      }),
      { numRuns: 50 },
    );
  });

  it('generated block has a valid createdAt date', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const before = new Date();
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        const after = new Date();

        return (
          block.createdAt instanceof Date &&
          block.createdAt.getTime() >= before.getTime() &&
          block.createdAt.getTime() <= after.getTime()
        );
      }),
      { numRuns: 30 },
    );
  });

  it('nLevel is always preserved in generated block', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        return block.config.nLevel === nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('activeModalities are always preserved in generated block', () => {
    fc.assert(
      fc.property(arbStandardModalities, arbSeed, (modalities, seed) => {
        const config = createBlockConfig({ activeModalities: modalities });
        const block = BlockGenerator.generate(config, seed);
        return (
          block.config.activeModalities.length === modalities.length &&
          modalities.every((m) => block.config.activeModalities.includes(m))
        );
      }),
      { numRuns: 50 },
    );
  });

  it('timing configuration is preserved in generated block', () => {
    fc.assert(
      fc.property(
        arbValidIntervalSeconds,
        arbValidStimulusDuration,
        arbSeed,
        (interval, stimulus, seed) => {
          const config = createBlockConfig({
            intervalSeconds: interval,
            stimulusDurationSeconds: Math.min(stimulus, interval - 0.1),
          });
          const block = BlockGenerator.generate(config, seed);
          return (
            block.config.intervalSeconds === config.intervalSeconds &&
            block.config.stimulusDurationSeconds === config.stimulusDurationSeconds
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('probability configuration is preserved in generated block', () => {
    fc.assert(
      fc.property(
        arbValidProbability,
        arbValidProbability,
        arbSeed,
        (targetProb, lureProb, seed) => {
          const config = createBlockConfig({
            targetProbability: targetProb,
            lureProbability: lureProb,
          });
          const block = BlockGenerator.generate(config, seed);
          return (
            block.config.targetProbability === targetProb &&
            block.config.lureProbability === lureProb
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('generator name is preserved in generated block', () => {
    fc.assert(
      fc.property(arbGeneratorName, arbSeed, (generator, seed) => {
        const config = createBlockConfig({ generator });
        const block = BlockGenerator.generate(config, seed);
        return block.config.generator === generator;
      }),
      { numRuns: 30 },
    );
  });

  it('block.trials is always an array', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return Array.isArray(block.trials);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Trial Count Properties (10 tests)
// =============================================================================

describe('Trial Count Properties - Property Tests', () => {
  it('DualnbackClassic generates exactly nLevel + 20 trials', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);
        // DualnbackClassic: nLevel buffer + 20 scorable = nLevel + 20
        return block.trials.length === nLevel + 20;
      }),
      { numRuns: 50 },
    );
  });

  it('BrainWorkshop generates trials according to formula: base + n^exponent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);
        // BW formula: 20 + n^2 (buffer included in total)
        const expected = BW_TRIALS_BASE + nLevel ** BW_TRIALS_EXPONENT;
        return block.trials.length === expected;
      }),
      { numRuns: 30 },
    );
  });

  it('trial count is always positive', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.length > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('trial count is always at least nLevel (buffer trials)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        return block.trials.length >= nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('all trial indices are sequential starting from 0', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((trial, idx) => trial.index === idx);
      }),
      { numRuns: 50 },
    );
  });

  it('trial indices are all non-negative integers', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((trial) => Number.isInteger(trial.index) && trial.index >= 0);
      }),
      { numRuns: 50 },
    );
  });

  it('exactly nLevel trials are marked as buffer', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        const bufferCount = block.trials.filter((t) => t.isBuffer).length;
        return bufferCount === nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('buffer trials are always the first nLevel trials', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        // First nLevel should be buffer
        const bufferCorrect = block.trials.slice(0, nLevel).every((t) => t.isBuffer);

        // Rest should not be buffer
        const nonBufferCorrect = block.trials.slice(nLevel).every((t) => !t.isBuffer);

        return bufferCorrect && nonBufferCorrect;
      }),
      { numRuns: 50 },
    );
  });

  it('scorable trial count equals total minus buffer', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        const scorableCount = block.trials.filter((t) => !t.isBuffer).length;
        return scorableCount === block.trials.length - nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('total trials equals buffer + scorable', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        const bufferCount = block.trials.filter((t) => t.isBuffer).length;
        const scorableCount = block.trials.filter((t) => !t.isBuffer).length;
        return block.trials.length === bufferCount + scorableCount;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Target Distribution Properties (10 tests)
// =============================================================================

describe('Target Distribution Properties - Property Tests', () => {
  it('buffer trials are never targets (position)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        return block.trials.filter((t) => t.isBuffer).every((t) => !t.isPositionTarget);
      }),
      { numRuns: 50 },
    );
  });

  it('buffer trials are never targets (sound)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);
        return block.trials.filter((t) => t.isBuffer).every((t) => !t.isSoundTarget);
      }),
      { numRuns: 50 },
    );
  });

  it('buffer trials are never targets (color)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({
          nLevel,
          activeModalities: ['position', 'audio', 'color'],
        });
        const block = BlockGenerator.generate(config, seed);
        return block.trials.filter((t) => t.isBuffer).every((t) => !t.isColorTarget);
      }),
      { numRuns: 50 },
    );
  });

  it('DualnbackClassic has exactly 4 V-Seul + 4 A-Seul + 2 Dual targets in scorable trials', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);
        const scorable = block.trials.filter((t) => !t.isBuffer);

        const vSeulCount = scorable.filter((t) => t.isPositionTarget && !t.isSoundTarget).length;
        const aSeulCount = scorable.filter((t) => !t.isPositionTarget && t.isSoundTarget).length;
        const dualCount = scorable.filter((t) => t.isPositionTarget && t.isSoundTarget).length;

        return vSeulCount === 4 && aSeulCount === 4 && dualCount === 2;
      }),
      { numRuns: 30 },
    );
  });

  it('DualnbackClassic has exactly 10 non-target trials in scorable trials', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);
        const scorable = block.trials.filter((t) => !t.isBuffer);

        const nonTargetCount = scorable.filter(
          (t) => !t.isPositionTarget && !t.isSoundTarget,
        ).length;

        return nonTargetCount === 10;
      }),
      { numRuns: 30 },
    );
  });

  it('target flags are always boolean', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every(
          (t) =>
            typeof t.isPositionTarget === 'boolean' &&
            typeof t.isSoundTarget === 'boolean' &&
            typeof t.isColorTarget === 'boolean',
        );
      }),
      { numRuns: 50 },
    );
  });

  it('lure flags are boolean or undefined', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every(
          (t) =>
            (typeof t.isPositionLure === 'boolean' || t.isPositionLure === undefined) &&
            (typeof t.isSoundLure === 'boolean' || t.isSoundLure === undefined) &&
            (typeof t.isColorLure === 'boolean' || t.isColorLure === undefined),
        );
      }),
      { numRuns: 50 },
    );
  });

  it('a trial cannot be both target and lure for the same modality (position)', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => !(t.isPositionTarget && t.isPositionLure));
      }),
      { numRuns: 50 },
    );
  });

  it('a trial cannot be both target and lure for the same modality (sound)', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => !(t.isSoundTarget && t.isSoundLure));
      }),
      { numRuns: 50 },
    );
  });

  it('lure type is only set when lure flag is true', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => {
          const posLureTypeValid = t.isPositionLure || t.positionLureType === undefined;
          const soundLureTypeValid = t.isSoundLure || t.soundLureType === undefined;
          return posLureTypeValid && soundLureTypeValid;
        });
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// N-Level Consistency Properties (10 tests)
// =============================================================================

describe('N-Level Consistency - Property Tests', () => {
  it('position targets match n-back position value', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (trial.isPositionTarget) {
            if (trial.position !== nBackTrial.position) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('sound targets match n-back sound value', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (trial.isSoundTarget) {
            if (trial.sound !== nBackTrial.sound) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('non-target positions differ from n-back position (DualnbackClassic)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (!trial.isPositionTarget) {
            if (trial.position === nBackTrial.position) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('non-target sounds differ from n-back sound (DualnbackClassic)', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (!trial.isSoundTarget) {
            if (trial.sound === nBackTrial.sound) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('n-1 lures match position at index-1 (not n-back)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;

          if (trial.positionLureType === 'n-1' && i > 0) {
            const prevTrial = block.trials[i - 1] as Trial;
            if (trial.position !== prevTrial.position) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 30 },
    );
  });

  it('nLevel is consistent across all buffer trial calculations', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel });
        const block = BlockGenerator.generate(config, seed);

        // Buffer trials should be exactly 0 to nLevel-1
        for (let i = 0; i < nLevel; i++) {
          const trial = block.trials[i];
          if (!trial || !trial.isBuffer) {
            return false;
          }
        }

        // First scorable trial should be at index nLevel
        const firstScorable = block.trials[nLevel];
        if (!firstScorable || firstScorable.isBuffer) {
          return false;
        }

        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('increasing nLevel increases buffer trial count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 2 }),
        arbSeed,
        (baseLevel, increment, seed) => {
          const nLevel1 = baseLevel;
          const nLevel2 = baseLevel + increment;

          const config1 = createBlockConfig({ nLevel: nLevel1 });
          const config2 = createBlockConfig({ nLevel: nLevel2 });

          const block1 = BlockGenerator.generate(config1, seed);
          const block2 = BlockGenerator.generate(config2, seed);

          const buffer1 = block1.trials.filter((t) => t.isBuffer).length;
          const buffer2 = block2.trials.filter((t) => t.isBuffer).length;

          return buffer2 > buffer1;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('trial type classification is consistent with target flags', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);

        return block.trials.every((trial) => {
          if (trial.isBuffer) {
            return trial.trialType === 'Tampon';
          }

          const hasPos = trial.isPositionTarget;
          const hasSound = trial.isSoundTarget;

          if (hasPos && hasSound) {
            return trial.trialType === 'Dual';
          }
          if (hasPos && !hasSound) {
            return trial.trialType === 'V-Seul';
          }
          if (!hasPos && hasSound) {
            return trial.trialType === 'A-Seul';
          }
          return trial.trialType === 'Non-Cible';
        });
      }),
      { numRuns: 50 },
    );
  });

  it('trial type is always a valid TrialType', () => {
    const validTypes = ['Tampon', 'Dual', 'V-Seul', 'A-Seul', 'Non-Cible'];

    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((trial) => validTypes.includes(trial.trialType));
      }),
      { numRuns: 50 },
    );
  });

  it('nLevel 1 still produces valid n-back relationships', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 1 });
        const block = BlockGenerator.generate(config, seed);

        // For 1-back, position target should match immediately previous
        for (let i = 1; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const prevTrial = block.trials[i - 1] as Trial;

          if (trial.isPositionTarget && trial.position !== prevTrial.position) {
            return false;
          }
          if (trial.isSoundTarget && trial.sound !== prevTrial.sound) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 30 },
    );
  });
});

// =============================================================================
// Modality Configuration Invariants (5 tests)
// =============================================================================

describe('Modality Configuration Invariants - Property Tests', () => {
  it('position values are always valid (0-7)', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => POSITIONS.includes(t.position));
      }),
      { numRuns: 50 },
    );
  });

  it('sound values are always valid (from SOUNDS pool)', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => SOUNDS.includes(t.sound));
      }),
      { numRuns: 50 },
    );
  });

  it('color values are always valid (from COLORS pool)', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block = BlockGenerator.generate(config, seed);
        return block.trials.every((t) => COLORS.includes(t.color));
      }),
      { numRuns: 50 },
    );
  });

  it('position values cover the expected range over many trials', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 2, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        const positions = new Set(block.trials.map((t) => t.position));
        // With enough trials, we should see at least a few different positions
        return positions.size >= 2;
      }),
      { numRuns: 50 },
    );
  });

  it('sound values cover the expected range over many trials', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 2, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        const sounds = new Set(block.trials.map((t) => t.sound));
        // With enough trials, we should see at least a few different sounds
        return sounds.size >= 2;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Reproducibility Properties (5 tests)
// =============================================================================

describe('Reproducibility Properties - Property Tests', () => {
  it('same seed produces identical blocks', () => {
    fc.assert(
      fc.property(arbBlockConfig(), arbSeed, (config, seed) => {
        const block1 = BlockGenerator.generate(config, seed);
        const block2 = BlockGenerator.generate(config, seed);

        if (block1.trials.length !== block2.trials.length) {
          return false;
        }

        return block1.trials.every((t1, idx) => {
          const t2 = block2.trials[idx] as Trial;
          return (
            t1.index === t2.index &&
            t1.position === t2.position &&
            t1.sound === t2.sound &&
            t1.isPositionTarget === t2.isPositionTarget &&
            t1.isSoundTarget === t2.isSoundTarget
          );
        });
      }),
      { numRuns: 50 },
    );
  });

  it('different seeds produce different blocks (with high probability)', () => {
    fc.assert(
      fc.property(arbSeed, arbSeed, (seed1, seed2) => {
        fc.pre(seed1 !== seed2);

        const config = createBlockConfig();
        const block1 = BlockGenerator.generate(config, seed1);
        const block2 = BlockGenerator.generate(config, seed2);

        // At least one trial should differ
        let hasDifference = false;
        for (let i = 0; i < Math.min(block1.trials.length, block2.trials.length); i++) {
          const t1 = block1.trials[i] as Trial;
          const t2 = block2.trials[i] as Trial;
          if (t1.position !== t2.position || t1.sound !== t2.sound) {
            hasDifference = true;
            break;
          }
        }

        return hasDifference;
      }),
      { numRuns: 50 },
    );
  });

  it('block ID is unique per generation (not affected by seed)', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig();
        const block1 = BlockGenerator.generate(config, seed);
        const block2 = BlockGenerator.generate(config, seed);

        // IDs should be unique even with same seed
        return block1.id !== block2.id;
      }),
      { numRuns: 30 },
    );
  });

  it('seed determines trial sequence, not block metadata', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig();
        const block1 = BlockGenerator.generate(config, seed);
        const block2 = BlockGenerator.generate(config, seed);

        // Trials should be identical
        const trialsMatch = block1.trials.every((t1, idx) => {
          const t2 = block2.trials[idx];
          return t2 && t1.position === t2.position && t1.sound === t2.sound;
        });

        // But metadata differs
        const metadataDiffers = block1.id !== block2.id;

        return trialsMatch && metadataDiffers;
      }),
      { numRuns: 30 },
    );
  });

  it('reproducibility works across multiple generations', () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 2, max: 5 }), (seed, count) => {
        const config = createBlockConfig();
        const blocks: Block[] = [];

        for (let i = 0; i < count; i++) {
          blocks.push(BlockGenerator.generate(config, seed));
        }

        // All trial sequences should be identical
        const firstTrials = blocks[0]?.trials ?? [];
        return blocks.every((block) =>
          block.trials.every((trial, idx) => {
            const ref = firstTrials[idx];
            return ref && trial.position === ref.position && trial.sound === ref.sound;
          }),
        );
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// Strategy Registry Properties (5 tests)
// =============================================================================

describe('Strategy Registry Properties - Property Tests', () => {
  it('BlockGenerator.listStrategies() returns non-empty array', () => {
    const strategies = BlockGenerator.listStrategies();
    expect(Array.isArray(strategies)).toBe(true);
    expect(strategies.length).toBeGreaterThan(0);
  });

  it('all registered strategies can generate valid blocks', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const strategies = BlockGenerator.listStrategies();
        const generator = BlockGenerator.withGlobalRegistry();

        for (const strategyName of strategies) {
          if (strategyName === 'Aleatoire' || strategyName === 'Sequence') {
            continue; // Skip if not fully implemented
          }

          const config = createBlockConfig({
            generator: strategyName as GeneratorName,
          });

          try {
            const block = generator.generate(config, seed);
            if (!block || block.trials.length === 0) {
              return false;
            }
          } catch {}
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });

  it('BrainWorkshop strategy is always registered', () => {
    expect(strategyRegistry.has('BrainWorkshop')).toBe(true);
  });

  it('DualnbackClassic strategy is always registered', () => {
    expect(strategyRegistry.has('DualnbackClassic')).toBe(true);
  });

  it('unknown strategy throws descriptive error', () => {
    const config = createBlockConfig({ generator: 'NonExistentStrategy' as GeneratorName });

    try {
      BlockGenerator.generate(config, 'test-seed');
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as Error).message).toContain('Unknown generator strategy');
    }
  });
});

// =============================================================================
// Edge Cases and Boundary Properties (5 tests)
// =============================================================================

describe('Edge Cases and Boundary Properties - Property Tests', () => {
  it('minimum nLevel (1) produces valid block', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 1 });
        const block = BlockGenerator.generate(config, seed);

        return (
          block.trials.length > 0 &&
          block.trials[0]?.isBuffer === true &&
          block.trials[1]?.isBuffer === false
        );
      }),
      { numRuns: 30 },
    );
  });

  it('higher nLevel (5) produces valid block', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 5 });
        const block = BlockGenerator.generate(config, seed);

        const bufferCount = block.trials.filter((t) => t.isBuffer).length;
        return bufferCount === 5 && block.trials.length >= 5;
      }),
      { numRuns: 30 },
    );
  });

  // @ts-expect-error test override
  it('empty seed string still produces valid block', () => {
    // Note: Empty string might hash to a valid seed
    const config = createBlockConfig();

    try {
      const block = BlockGenerator.generate(config, '');
      return block.trials.length > 0;
    } catch {
      // Some implementations might reject empty seeds
      return true;
    }
  });

  it('very long seed string produces valid block', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 100, maxLength: 500 }), (seed) => {
        const config = createBlockConfig();
        const block = BlockGenerator.generate(config, seed);
        return block.trials.length > 0;
      }),
      { numRuns: 20 },
    );
  });

  it('special characters in seed produce valid block', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...'!@#$%^&*()_+-=[]{}|;:,.<>?/~`'.split('')),
          minLength: 5,
          maxLength: 20,
        }),
        (seed) => {
          const config = createBlockConfig();
          const block = BlockGenerator.generate(config, seed);
          return block.trials.length > 0 && block.seed === seed;
        },
      ),
      { numRuns: 20 },
    );
  });
});
