/**
 * Property-Based Tests for Flexible Generator Strategy
 *
 * Invariants:
 * - Stream length matches requested length
 * - Buffer trials (index < nLevel) are never targets
 * - Target probability is approximately respected
 * - Values come from the modality pool
 * - Same seed produces same sequence (reproducibility)
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';
import { generateModalityStream, assembleFlexibleTrial } from './flexible-strategy';
import { SeededRandom } from '../random';
import type { ModalityId, StimulusValue } from '../modality';

// =============================================================================
// Arbitraries
// =============================================================================

const nLevelArb = fc.integer({ min: 1, max: 5 });
const lengthArb = fc.integer({ min: 10, max: 50 });
const targetProbArb = fc.double({ min: 0, max: 0.5, noNaN: true });
const lureProbArb = fc.double({ min: 0, max: 0.3, noNaN: true });
const seedArb = fc.string({ minLength: 1, maxLength: 20 });

// Position pool (0-7)
const POSITION_POOL: StimulusValue[] = [0, 1, 2, 3, 4, 5, 6, 7];

// =============================================================================
// Stream Generation Tests
// =============================================================================

describe('generateModalityStream - Property Tests', () => {
  it('stream length equals requested length', () => {
    fc.assert(
      fc.property(
        seedArb,
        lengthArb,
        nLevelArb,
        targetProbArb,
        lureProbArb,
        (seed, length, nLevel, targetProb, lureProb) => {
          const rng = new SeededRandom(seed);
          const stream = generateModalityStream(
            rng,
            'position',
            length,
            nLevel,
            true,
            targetProb,
            lureProb,
          );
          return stream.length === length;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all values are from the modality pool', () => {
    fc.assert(
      fc.property(
        seedArb,
        lengthArb,
        nLevelArb,
        targetProbArb,
        (seed, length, nLevel, targetProb) => {
          const rng = new SeededRandom(seed);
          const stream = generateModalityStream(
            rng,
            'position',
            length,
            nLevel,
            true,
            targetProb,
            0,
          );
          return stream.every((val) => POSITION_POOL.includes(val));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('inactive modality produces constant stream', () => {
    fc.assert(
      fc.property(seedArb, lengthArb, nLevelArb, (seed, length, nLevel) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', length, nLevel, false, 0.25, 0.15);

        // All values should be the same (default value)
        const firstVal = stream[0];
        return stream.every((val) => val === firstVal);
      }),
      { numRuns: 50 },
    );
  });

  it('same seed produces same stream (reproducibility)', () => {
    fc.assert(
      fc.property(
        seedArb,
        lengthArb,
        nLevelArb,
        targetProbArb,
        lureProbArb,
        (seed, length, nLevel, targetProb, lureProb) => {
          const rng1 = new SeededRandom(seed);
          const rng2 = new SeededRandom(seed);

          const stream1 = generateModalityStream(
            rng1,
            'position',
            length,
            nLevel,
            true,
            targetProb,
            lureProb,
          );
          const stream2 = generateModalityStream(
            rng2,
            'position',
            length,
            nLevel,
            true,
            targetProb,
            lureProb,
          );

          return stream1.length === stream2.length && stream1.every((val, i) => val === stream2[i]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('target probability is approximately respected (statistical)', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: 100, max: 200 }), // Need enough trials for statistics
        fc.integer({ min: 2, max: 4 }),
        fc.double({ min: 0.2, max: 0.4, noNaN: true }),
        (seed, length, nLevel, targetProb) => {
          const rng = new SeededRandom(seed);
          const stream = generateModalityStream(
            rng,
            'position',
            length,
            nLevel,
            true,
            targetProb,
            0,
          );

          // Count actual targets (value[i] === value[i - nLevel])
          let targetCount = 0;
          const scorableTrials = length - nLevel;

          for (let i = nLevel; i < length; i++) {
            if (stream[i] === stream[i - nLevel]) {
              targetCount++;
            }
          }

          const actualRate = targetCount / scorableTrials;

          // Allow 20% deviation from expected (statistical variance)
          const tolerance = 0.2;
          return Math.abs(actualRate - targetProb) < tolerance;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Trial Assembly Tests
// =============================================================================

describe('assembleFlexibleTrial - Property Tests', () => {
  it('buffer trials have isBuffer = true', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 20, max: 40 }), nLevelArb, (seed, length, nLevel) => {
        const rng = new SeededRandom(seed);
        const streams = new Map<ModalityId, StimulusValue[]>();
        streams.set(
          'position',
          generateModalityStream(rng, 'position', length, nLevel, true, 0.25, 0.15),
        );

        // Check buffer trials
        for (let i = 0; i < nLevel; i++) {
          const trial = assembleFlexibleTrial(i, nLevel, ['position'], streams);
          if (!trial.isBuffer) return false;
        }

        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('non-buffer trials have isBuffer = false', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 20, max: 40 }), nLevelArb, (seed, length, nLevel) => {
        const rng = new SeededRandom(seed);
        const streams = new Map<ModalityId, StimulusValue[]>();
        streams.set(
          'position',
          generateModalityStream(rng, 'position', length, nLevel, true, 0.25, 0.15),
        );

        // Check non-buffer trials
        for (let i = nLevel; i < length; i++) {
          const trial = assembleFlexibleTrial(i, nLevel, ['position'], streams);
          if (trial.isBuffer) return false;
        }

        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('trial index matches requested index', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: 20, max: 40 }),
        nLevelArb,
        fc.integer({ min: 0, max: 19 }),
        (seed, length, nLevel, requestedIndex) => {
          const actualLength = Math.max(length, requestedIndex + 1);
          const rng = new SeededRandom(seed);
          const streams = new Map<ModalityId, StimulusValue[]>();
          streams.set(
            'position',
            generateModalityStream(rng, 'position', actualLength, nLevel, true, 0.25, 0.15),
          );

          const trial = assembleFlexibleTrial(requestedIndex, nLevel, ['position'], streams);
          return trial.index === requestedIndex;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('target detection is consistent with stream values', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 20, max: 40 }), nLevelArb, (seed, length, nLevel) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', length, nLevel, true, 0.25, 0.15);
        const streams = new Map<ModalityId, StimulusValue[]>();
        streams.set('position', stream);

        // Check target detection for non-buffer trials
        for (let i = nLevel; i < length; i++) {
          const trial = assembleFlexibleTrial(i, nLevel, ['position'], streams);
          const positionStimulus = trial.stimuli.get('position');
          if (!positionStimulus) continue;

          const nBackValue = stream[i - nLevel];
          const currentValue = stream[i];
          const expectedIsTarget = currentValue === nBackValue;

          if (positionStimulus.isTarget !== expectedIsTarget) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('buffer trials are never targets', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 20, max: 40 }), nLevelArb, (seed, length, nLevel) => {
        const rng = new SeededRandom(seed);
        const streams = new Map<ModalityId, StimulusValue[]>();
        streams.set(
          'position',
          generateModalityStream(rng, 'position', length, nLevel, true, 0.5, 0.15),
        );

        // Check buffer trials - should never be targets
        for (let i = 0; i < nLevel; i++) {
          const trial = assembleFlexibleTrial(i, nLevel, ['position'], streams);
          const positionStimulus = trial.stimuli.get('position');
          if (positionStimulus?.isTarget) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SeededRandom Tests
// =============================================================================

describe('SeededRandom - Property Tests', () => {
  it('next() returns values in [0, 1)', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 1, max: 1000 }), (seed, iterations) => {
        const rng = new SeededRandom(seed);
        for (let i = 0; i < iterations; i++) {
          const val = rng.next();
          if (val < 0 || val >= 1) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('int(min, max) returns values in [min, max)', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (seed, min, range, iterations) => {
          const max = min + range;
          const rng = new SeededRandom(seed);

          for (let i = 0; i < iterations; i++) {
            const val = rng.int(min, max);
            if (val < min || val >= max) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('choice() returns element from array', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 50 }),
        (seed, array, iterations) => {
          const rng = new SeededRandom(seed);

          for (let i = 0; i < iterations; i++) {
            const val = rng.choice(array);
            if (!array.includes(val)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same seed produces same sequence', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 10, max: 100 }), (seed, iterations) => {
        const rng1 = new SeededRandom(seed);
        const rng2 = new SeededRandom(seed);

        for (let i = 0; i < iterations; i++) {
          if (rng1.next() !== rng2.next()) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('different seeds produce different sequences (with high probability)', () => {
    fc.assert(
      fc.property(seedArb, seedArb, (seed1, seed2) => {
        fc.pre(seed1 !== seed2);

        const rng1 = new SeededRandom(seed1);
        const rng2 = new SeededRandom(seed2);

        // Check first 10 values - at least one should differ
        let allSame = true;
        for (let i = 0; i < 10; i++) {
          if (rng1.next() !== rng2.next()) {
            allSame = false;
            break;
          }
        }

        return !allSame;
      }),
      { numRuns: 100 },
    );
  });

  it('shuffle preserves array elements', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
        (seed, array) => {
          const rng = new SeededRandom(seed);
          const original = [...array];
          const shuffled = rng.shuffle([...array]);

          // Same length
          if (shuffled.length !== original.length) return false;

          // Same elements (sorted)
          const sortedOriginal = [...original].sort((a, b) => a - b);
          const sortedShuffled = [...shuffled].sort((a, b) => a - b);

          return sortedOriginal.every((val, i) => val === sortedShuffled[i]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
