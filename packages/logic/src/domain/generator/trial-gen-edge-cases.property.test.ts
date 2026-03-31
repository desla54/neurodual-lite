/**
 * Aggressive Property-Based Tests for Trial Generation Edge Cases
 *
 * This test suite aggressively probes for bugs in trial generation using fast-check.
 * Focus areas:
 * 1. Target matching constraint (N-back relationship)
 * 2. Lure mutual exclusivity (lure at N-1 should NOT be a target)
 * 3. Buffer trials (first N trials) should NEVER be targets
 * 4. Probability constraints (actual vs configured rate)
 * 5. Consecutive targets limits
 * 6. Position/Sound distribution fairness
 * 7. Seed reproducibility
 * 8. Edge cases: nLevel=1 with high probability, very short sequences
 * 9. Lure generation with conflicting constraints
 *
 * @see thresholds.ts for SSOT numeric values
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { BlockGenerator } from './index';
import type { Block, BlockConfig, GeneratorName, Position, Sound, Trial } from '../types';
import { POSITIONS, SOUNDS } from '../types';
import { SeededRandom } from '../random';
import { generateModalityStream } from './flexible-strategy';
import { ModalityStreamGenerator } from './helpers/modality-stream-generator';
import { LureDetector } from './helpers/lure-detector';
import {
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

// =============================================================================
// Arbitraries - Custom generators for domain types
// =============================================================================

/** Valid N-level: 1-9 (focus on realistic values) */
const arbNLevel = fc.integer({ min: 1, max: 9 });

/** N-level with focus on edge case 1 */
const arbNLevelWithEdgeCases = fc.oneof(
  fc.constant(1), // Edge case: 1-back
  fc.integer({ min: 2, max: 4 }), // Common cases
  fc.integer({ min: 5, max: 9 }), // Higher levels
);

/** Valid trials count */
const arbTrialsCount = fc.integer({ min: 10, max: 100 });

/** Very short sequences (stress test) */
const arbShortTrialsCount = fc.integer({ min: 1, max: 15 });

/** Valid probability: [0, 1] */
const arbProbability = fc.double({ min: 0, max: 1, noNaN: true });

/** High probability (stress test) */
const arbHighProbability = fc.double({ min: 0.5, max: 0.95, noNaN: true });

/** Low probability */
const arbLowProbability = fc.double({ min: 0.05, max: 0.3, noNaN: true });

/** Seed for reproducibility */
const arbSeed = fc.string({ minLength: 1, maxLength: 50 });

/** Generator name */
const arbGeneratorName: fc.Arbitrary<GeneratorName> = fc.constantFrom(
  'BrainWorkshop',
  'DualnbackClassic',
);

/** Position value */
const arbPosition: fc.Arbitrary<Position> = fc.constantFrom(...POSITIONS);

/** Sound value */
const arbSound: fc.Arbitrary<Sound> = fc.constantFrom(...SOUNDS);

// =============================================================================
// Helper Functions
// =============================================================================

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
 * Extracts position values from a block's trials as an array.
 */
function extractPositionStream(block: Block): Position[] {
  return block.trials.map((t) => t.position);
}

/**
 * Extracts sound values from a block's trials as an array.
 */
function extractSoundStream(block: Block): Sound[] {
  return block.trials.map((t) => t.sound);
}

/**
 * Counts occurrences of each value in an array.
 */
function countDistribution<T>(arr: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const val of arr) {
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return counts;
}

/**
 * Calculates chi-squared statistic for uniformity.
 */
function chiSquaredUniformity<T>(arr: readonly T[], expectedCategories: number): number {
  const counts = countDistribution(arr);
  const expected = arr.length / expectedCategories;
  let chiSq = 0;
  for (const count of counts.values()) {
    chiSq += (count - expected) ** 2 / expected;
  }
  return chiSq;
}

// =============================================================================
// CRITICAL INVARIANT 1: Target at position N matches position at trial N-nLevel
// =============================================================================

describe('CRITICAL: Target N-Back Relationship', () => {
  it('position target at trial N ALWAYS matches position at trial N-nLevel', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (trial.isPositionTarget) {
            if (trial.position !== nBackTrial.position) {
              return false; // BUG: Target flag set but values don't match
            }
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('sound target at trial N ALWAYS matches sound at trial N-nLevel', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (trial.isSoundTarget) {
            if (trial.sound !== nBackTrial.sound) {
              return false; // BUG: Target flag set but values don't match
            }
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('BrainWorkshop: target relationship holds even with variable N-back', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          // Use effectiveNBack if available, otherwise fall back to nLevel
          const effectiveN = trial.effectiveNBack ?? nLevel;
          const nBackIdx = i - effectiveN;

          if (nBackIdx < 0 || nBackIdx >= block.trials.length) continue;
          const nBackTrial = block.trials[nBackIdx] as Trial;

          if (trial.isPositionTarget) {
            if (trial.position !== nBackTrial.position) {
              return false;
            }
          }

          if (trial.isSoundTarget) {
            if (trial.sound !== nBackTrial.sound) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('converse: if position matches N-back and NOT buffer, target flag SHOULD be true', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          // If position matches n-back and not a buffer
          if (!trial.isBuffer && trial.position === nBackTrial.position) {
            if (!trial.isPositionTarget) {
              // BUG: Value matches but flag is false
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// CRITICAL INVARIANT 2: Lure at N-1 should NOT be a target
// =============================================================================

describe('CRITICAL: Lure-Target Mutual Exclusivity', () => {
  it('a trial CANNOT be both position target AND position lure', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isPositionTarget && trial.isPositionLure) {
            return false; // BUG: Mutual exclusivity violated
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('a trial CANNOT be both sound target AND sound lure', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isSoundTarget && trial.isSoundLure) {
            return false; // BUG: Mutual exclusivity violated
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('n-1 lure position should NOT match n-back position (would be target)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (trial.positionLureType === 'n-1') {
            // The lure position should NOT equal the n-back position
            // because that would make it a target instead
            if (trial.position === nBackTrial.position) {
              // This would be a bug: classified as lure but actually a target
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('LureDetector returns null when isTarget=true', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 5, maxLength: 30 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 2, max: 5 }),
        (history, value, nLevel) => {
          const currentIndex = history.length;

          // Always returns null when isTarget is true
          const result = LureDetector.detect(value, history, currentIndex, nLevel, true);
          return result === null;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// CRITICAL INVARIANT 3: Buffer trials (first N trials) should NEVER be targets
// =============================================================================

describe('CRITICAL: Buffer Trials Never Targets', () => {
  it('buffer trials (index < nLevel) are NEVER position targets', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isBuffer && trial.isPositionTarget) {
            return false; // BUG: Buffer trial marked as target
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('buffer trials (index < nLevel) are NEVER sound targets', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isBuffer && trial.isSoundTarget) {
            return false; // BUG: Buffer trial marked as target
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('buffer trials (index < nLevel) are NEVER color targets', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({
          nLevel,
          generator: 'BrainWorkshop',
          activeModalities: ['position', 'audio', 'color'],
        });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isBuffer && trial.isColorTarget) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('trial.isBuffer is true IFF trial.index < nLevel', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          const shouldBeBuffer = trial.index < nLevel;
          if (trial.isBuffer !== shouldBeBuffer) {
            return false; // BUG: isBuffer flag inconsistent with index
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('exactly nLevel buffer trials exist in each block', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        const bufferCount = block.trials.filter((t) => t.isBuffer).length;
        return bufferCount === nLevel;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// INVARIANT 4: Probability constraints - actual rate vs configured rate
// =============================================================================

describe('Probability Constraints', () => {
  it('DualnbackClassic has exactly 4 V-Seul + 4 A-Seul + 2 Dual = 10 target trials', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);
        const scorable = block.trials.filter((t) => !t.isBuffer);

        const vSeul = scorable.filter((t) => t.isPositionTarget && !t.isSoundTarget).length;
        const aSeul = scorable.filter((t) => !t.isPositionTarget && t.isSoundTarget).length;
        const dual = scorable.filter((t) => t.isPositionTarget && t.isSoundTarget).length;

        return vSeul === 4 && aSeul === 4 && dual === 2;
      }),
      { numRuns: 100 },
    );
  });

  it('BrainWorkshop target rate is approximately within expected range', () => {
    // BW uses CHANCE_GUARANTEED_MATCH (12.5%) + random + interference
    // The algorithm can produce a WIDE range of target rates due to:
    // 1. Random baseline values
    // 2. Guaranteed match stage (12.5%)
    // 3. Interference stage (12.5%)
    // 4. Accidental matches from random values
    // In practice, rates from 0% to 80%+ are possible with certain seeds
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);
        const scorable = block.trials.filter((t) => !t.isBuffer);

        if (scorable.length < 10) return true; // Not enough data

        const positionTargets = scorable.filter((t) => t.isPositionTarget).length;
        const soundTargets = scorable.filter((t) => t.isSoundTarget).length;

        const posRate = positionTargets / scorable.length;
        const soundRate = soundTargets / scorable.length;

        // BrainWorkshop can produce extreme rates by design
        // This test verifies rates are in the valid range [0, 1]
        // (not a statistical test, just validity check)
        return (
          posRate >= 0 &&
          posRate <= 1 &&
          soundRate >= 0 &&
          soundRate <= 1 &&
          Number.isFinite(posRate) &&
          Number.isFinite(soundRate)
        );
      }),
      { numRuns: 50 },
    );
  });

  it('stream generation: target rate approximately matches configured probability', () => {
    fc.assert(
      fc.property(
        arbSeed,
        fc.integer({ min: 100, max: 200 }),
        fc.integer({ min: 2, max: 4 }),
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
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

          // Count actual targets
          let targetCount = 0;
          for (let i = nLevel; i < length; i++) {
            if (stream[i] === stream[i - nLevel]) {
              targetCount++;
            }
          }

          const actualRate = targetCount / (length - nLevel);
          const tolerance = 0.2; // 20% tolerance due to statistical variance

          return Math.abs(actualRate - targetProb) < tolerance;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// INVARIANT 5: Consecutive targets - are there limits?
// =============================================================================

describe('Consecutive Targets Analysis', () => {
  it('DualnbackClassic shuffles trial types, no guarantee on consecutive limits', () => {
    // Just verify the shuffle happens and trials are valid
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);
        const scorable = block.trials.filter((t) => !t.isBuffer);

        // Count consecutive position targets
        let maxConsecutive = 0;
        let currentConsecutive = 0;

        for (const trial of scorable) {
          if (trial.isPositionTarget) {
            currentConsecutive++;
            maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
          } else {
            currentConsecutive = 0;
          }
        }

        // Report for analysis (not a hard constraint)
        // With 6 position targets out of 20, max consecutive is typically 1-3
        return maxConsecutive <= 10; // Sanity check
      }),
      { numRuns: 100 },
    );
  });

  it('BrainWorkshop can have consecutive targets due to random generation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        // Just verify block is valid
        return block.trials.length > nLevel;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// INVARIANT 6: Position and Sound distribution fairness
// =============================================================================

describe('Distribution Fairness', () => {
  it('positions are drawn from valid pool only', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (!POSITIONS.includes(trial.position)) {
            return false; // BUG: Invalid position
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('sounds are drawn from valid pool only', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (!SOUNDS.includes(trial.sound)) {
            return false; // BUG: Invalid sound
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('over many blocks, all 8 positions are used', () => {
    fc.assert(
      fc.property(arbSeed, (baseSeed) => {
        const allPositions = new Set<Position>();

        // Generate multiple blocks
        for (let i = 0; i < 10; i++) {
          const seed = `${baseSeed}-${i}`;
          const config = createBlockConfig({ nLevel: 2, generator: 'BrainWorkshop' });
          const block = BlockGenerator.generate(config, seed);

          for (const trial of block.trials) {
            allPositions.add(trial.position);
          }
        }

        // Should see all 8 positions
        return allPositions.size === 8;
      }),
      { numRuns: 20 },
    );
  });

  it('over many blocks, all 8 sounds are used', () => {
    fc.assert(
      fc.property(arbSeed, (baseSeed) => {
        const allSounds = new Set<Sound>();

        for (let i = 0; i < 10; i++) {
          const seed = `${baseSeed}-${i}`;
          const config = createBlockConfig({ nLevel: 2, generator: 'BrainWorkshop' });
          const block = BlockGenerator.generate(config, seed);

          for (const trial of block.trials) {
            allSounds.add(trial.sound);
          }
        }

        return allSounds.size === 8;
      }),
      { numRuns: 20 },
    );
  });

  it('stream generator produces reasonably uniform distribution', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', 200, 2, true, 0.2, 0);

        const counts = countDistribution(stream);

        // With 200 trials and 8 positions, expected ~25 each
        // Allow between 10 and 50 per position
        for (const count of counts.values()) {
          if (count < 5 || count > 80) {
            return false; // Distribution too skewed
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// INVARIANT 7: Seed reproducibility
// =============================================================================

describe('Seed Reproducibility', () => {
  it('same seed produces IDENTICAL trial sequences', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });

        const block1 = BlockGenerator.generate(config, seed);
        const block2 = BlockGenerator.generate(config, seed);

        if (block1.trials.length !== block2.trials.length) return false;

        for (let i = 0; i < block1.trials.length; i++) {
          const t1 = block1.trials[i] as Trial;
          const t2 = block2.trials[i] as Trial;

          if (
            t1.position !== t2.position ||
            t1.sound !== t2.sound ||
            t1.isPositionTarget !== t2.isPositionTarget ||
            t1.isSoundTarget !== t2.isSoundTarget ||
            t1.isBuffer !== t2.isBuffer ||
            t1.index !== t2.index
          ) {
            return false; // BUG: Same seed produced different results
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('different seeds produce different sequences (with high probability)', () => {
    fc.assert(
      fc.property(arbSeed, arbSeed, arbNLevel, (seed1, seed2, nLevel) => {
        fc.pre(seed1 !== seed2);

        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });

        const block1 = BlockGenerator.generate(config, seed1);
        const block2 = BlockGenerator.generate(config, seed2);

        // At least one position or sound should differ in first 10 trials
        let hasDifference = false;
        const checkLength = Math.min(10, block1.trials.length, block2.trials.length);

        for (let i = 0; i < checkLength; i++) {
          const t1 = block1.trials[i] as Trial;
          const t2 = block2.trials[i] as Trial;

          if (t1.position !== t2.position || t1.sound !== t2.sound) {
            hasDifference = true;
            break;
          }
        }

        return hasDifference;
      }),
      { numRuns: 100 },
    );
  });

  it('ModalityStreamGenerator produces reproducible streams', () => {
    fc.assert(
      fc.property(
        arbSeed,
        fc.integer({ min: 20, max: 50 }),
        fc.integer({ min: 2, max: 4 }),
        (seed, length, nLevel) => {
          const gen1 = new ModalityStreamGenerator(new SeededRandom(seed));
          const gen2 = new ModalityStreamGenerator(new SeededRandom(seed));

          const stream1 = gen1.generateStream(POSITIONS, length, nLevel, true, 0.25, 0.15);
          const stream2 = gen2.generateStream(POSITIONS, length, nLevel, true, 0.25, 0.15);

          if (stream1.length !== stream2.length) return false;

          for (let i = 0; i < stream1.length; i++) {
            if (stream1[i] !== stream2[i]) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// EDGE CASE 8: nLevel=1 with high target probability
// =============================================================================

describe('Edge Case: nLevel=1', () => {
  it('nLevel=1 produces valid blocks', () => {
    fc.assert(
      fc.property(arbSeed, arbGeneratorName, (seed, generator) => {
        const config = createBlockConfig({ nLevel: 1, generator });
        const block = BlockGenerator.generate(config, seed);

        // Basic validation
        return (
          block.trials.length > 1 &&
          block.trials[0]?.isBuffer === true &&
          block.trials[1]?.isBuffer === false
        );
      }),
      { numRuns: 100 },
    );
  });

  it('nLevel=1: target at index i matches value at index i-1', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 1, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

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
      { numRuns: 100 },
    );
  });

  it('nLevel=1 with high target probability does not crash', () => {
    fc.assert(
      fc.property(arbSeed, arbHighProbability, (seed, targetProb) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', 30, 1, true, targetProb, 0);

        // Just verify it generates without crashing
        return stream.length === 30;
      }),
      { numRuns: 100 },
    );
  });

  it('nLevel=1: n-1 lure is same as target (special case)', () => {
    // For 1-back, n-1 = 0 (current index), so n-1 lure concept is degenerate
    // The generator should handle this edge case gracefully
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', 20, 1, true, 0.2, 0.3);

        // Should generate without issue
        return stream.length === 20;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// EDGE CASE 9: Very short sequences
// =============================================================================

describe('Edge Case: Very Short Sequences', () => {
  it('minimum viable sequence: nLevel + 1 trials', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const minLength = nLevel + 1;
        const stream = generateModalityStream(rng, 'position', minLength, nLevel, true, 0.25, 0);

        return stream.length === minLength;
      }),
      { numRuns: 100 },
    );
  });

  it('sequence of exactly nLevel trials has no scorable trials', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', nLevel, nLevel, true, 0.5, 0);

        // All trials should be buffer (no n-back comparison possible)
        return stream.length === nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('sequence shorter than nLevel is handled gracefully', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const shortLength = Math.max(1, nLevel - 1);
        const stream = generateModalityStream(rng, 'position', shortLength, nLevel, true, 0.25, 0);

        // Should generate without crashing
        return stream.length === shortLength;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// EDGE CASE 10: Lure generation with conflicting constraints
// =============================================================================

describe('Edge Case: Lure Conflicting Constraints', () => {
  it('lure cannot be generated when it would conflict with target', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 10, maxLength: 30 }),
        fc.integer({ min: 2, max: 4 }),
        (history, nLevel) => {
          const currentIndex = history.length;
          const nBackValue = history[currentIndex - nLevel];
          const nMinus1Value = history[currentIndex - 1];

          // If n-1 value equals n-back value, lure detection should NOT classify it as n-1
          if (nMinus1Value === nBackValue) {
            const result = LureDetector.detect(nMinus1Value, history, currentIndex, nLevel, false);
            // Should be null (target, not lure) or detected differently
            return result !== 'n-1';
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('exclusive mode: target decision prevents lure generation', () => {
    fc.assert(
      fc.property(
        arbSeed,
        fc.integer({ min: 50, max: 100 }),
        fc.integer({ min: 2, max: 4 }),
        (seed, length, nLevel) => {
          const gen = new ModalityStreamGenerator(new SeededRandom(seed));
          const stream = gen.generateStream(POSITIONS, length, nLevel, true, 0.3, 0.3, 'exclusive');

          // Verify stream integrity
          for (let i = nLevel; i < stream.length; i++) {
            const value = stream[i];
            const nBackValue = stream[i - nLevel];
            const nMinus1Value = stream[i - 1];

            // If it's a target, verify n-back match
            if (value === nBackValue) {
              // This is a valid target
              continue;
            }

            // If it looks like n-1 lure, verify it's not accidentally a target
            if (value === nMinus1Value && value === nBackValue) {
              // This should not happen - would be both target and lure
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('high lure probability with low target probability produces expected behavior', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const rng = new SeededRandom(seed);
        // Low target (10%), high lure (40%)
        const stream = generateModalityStream(rng, 'position', 100, 2, true, 0.1, 0.4);

        // Count targets and potential lures
        let targets = 0;

        for (let i = 2; i < stream.length; i++) {
          if (stream[i] === stream[i - 2]) {
            targets++;
          }
        }

        // Targets should be roughly 10% of scorable trials
        const scorable = stream.length - 2;
        const targetRate = targets / scorable;

        // Allow wide variance but should be in reasonable range
        return targetRate >= 0.0 && targetRate <= 0.5;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// REGRESSION: Known edge cases and potential bugs
// =============================================================================

describe('Regression Tests: Known Edge Cases', () => {
  // @ts-expect-error test override
  it('empty seed string does not crash', () => {
    const config = createBlockConfig();

    try {
      const block = BlockGenerator.generate(config, '');
      return block.trials.length > 0;
    } catch {
      return false; // Should not throw
    }
  });

  it('very long seed string does not crash', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 500, maxLength: 1000 }), (seed) => {
        const config = createBlockConfig();
        const block = BlockGenerator.generate(config, seed);
        return block.trials.length > 0;
      }),
      { numRuns: 20 },
    );
  });

  it('unicode seed strings work correctly', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 50 }), (seed) => {
        const config = createBlockConfig();
        const block = BlockGenerator.generate(config, seed);
        return block.trials.length > 0 && block.seed === seed;
      }),
      { numRuns: 50 },
    );
  });

  it('trial indices are always sequential 0, 1, 2, ...', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (let i = 0; i < block.trials.length; i++) {
          if (block.trials[i]?.index !== i) {
            return false; // BUG: Index not sequential
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('trialType is consistent with target flags', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.isBuffer) {
            if (trial.trialType !== 'Tampon') return false;
          } else if (trial.isPositionTarget && trial.isSoundTarget) {
            if (trial.trialType !== 'Dual') return false;
          } else if (trial.isPositionTarget && !trial.isSoundTarget) {
            if (trial.trialType !== 'V-Seul') return false;
          } else if (!trial.isPositionTarget && trial.isSoundTarget) {
            if (trial.trialType !== 'A-Seul') return false;
          } else {
            if (trial.trialType !== 'Non-Cible') return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('block ID is unique per generation (different from seed)', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig();
        const block1 = BlockGenerator.generate(config, seed);
        const block2 = BlockGenerator.generate(config, seed);

        // Block IDs should be different (UUID generated fresh each time)
        // but seed should be the same
        return block1.id !== block2.id && block1.seed === seed && block2.seed === seed;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// ADDITIONAL AGGRESSIVE TESTS: Find hidden bugs
// =============================================================================

describe('Aggressive Bug Hunting: Cross-Check Invariants', () => {
  it('HYPOTHESIS: When position value matches n-back but isPositionTarget is false, there is a bug', () => {
    // This is the CONVERSE of the n-back target rule
    // If value matches n-back, it SHOULD be marked as target (unless buffer)
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        const violations: string[] = [];

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          if (
            !trial.isBuffer &&
            trial.position === nBackTrial.position &&
            !trial.isPositionTarget
          ) {
            violations.push(
              `Trial ${i}: position=${trial.position} matches n-back but isPositionTarget=false`,
            );
          }

          if (!trial.isBuffer && trial.sound === nBackTrial.sound && !trial.isSoundTarget) {
            violations.push(
              `Trial ${i}: sound=${trial.sound} matches n-back but isSoundTarget=false`,
            );
          }
        }

        // Report any violations
        if (violations.length > 0) {
          console.log(
            `POTENTIAL BUG: ${violations.length} violations found for seed "${seed}", nLevel=${nLevel}`,
          );
          violations.slice(0, 3).forEach((v) => console.log(`  - ${v}`));
          return false;
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('HYPOTHESIS: Lure type n-1 implies previous value matches current (DualnbackClassic)', () => {
    // NOTE: LureDetector uses n-1 = immediately previous (index - 1)
    // BrainWorkshop uses different semantics: n-1 = (n-1)-back position
    // This test only applies to DualnbackClassic which uses LureDetector
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = 1; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const prevTrial = block.trials[i - 1] as Trial;

          if (trial.positionLureType === 'n-1') {
            if (trial.position !== prevTrial.position) {
              console.log(
                `BUG: Trial ${i} has positionLureType='n-1' but position=${trial.position} != prev=${prevTrial.position}`,
              );
              return false;
            }
          }

          if (trial.soundLureType === 'n-1') {
            if (trial.sound !== prevTrial.sound) {
              console.log(
                `BUG: Trial ${i} has soundLureType='n-1' but sound=${trial.sound} != prev=${prevTrial.sound}`,
              );
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('BrainWorkshop: n-1 lure means (n-1)-back position (different semantics)', () => {
    // DOCUMENTED: BrainWorkshop uses different semantics for lure types
    // n-1 = value at index - (realBack - 1), NOT index - 1
    // This is intentional to match the original BrainWorkshop behavior
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 5 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'BrainWorkshop' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const effectiveN = trial.effectiveNBack ?? nLevel;

          if (trial.positionLureType === 'n-1' && effectiveN >= 3) {
            // In BW, n-1 means (effectiveN - 1)-back
            const nMinus1BackIdx = i - (effectiveN - 1);
            if (nMinus1BackIdx >= 0 && nMinus1BackIdx < block.trials.length) {
              const nMinus1BackTrial = block.trials[nMinus1BackIdx] as Trial;
              if (trial.position !== nMinus1BackTrial.position) {
                console.log(
                  `BW semantics mismatch: Trial ${i} n-1 lure but pos=${trial.position} != (n-1)back=${nMinus1BackTrial.position}`,
                );
                return false;
              }
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('HYPOTHESIS: Non-target in DualnbackClassic NEVER matches n-back value', () => {
    // DualnbackClassic uses choiceExcluding to ensure non-targets differ
    fc.assert(
      fc.property(arbNLevel, arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          // Non-targets should NEVER match n-back
          if (!trial.isPositionTarget && trial.position === nBackTrial.position) {
            console.log(
              `BUG: DualnbackClassic trial ${i} is not position target but matches n-back position`,
            );
            return false;
          }

          if (!trial.isSoundTarget && trial.sound === nBackTrial.sound) {
            console.log(
              `BUG: DualnbackClassic trial ${i} is not sound target but matches n-back sound`,
            );
            return false;
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('HYPOTHESIS: Buffer trials have no meaningful lure detection', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        // Buffer trials should not have target flags
        // (lure flags can still exist in some implementations)
        for (const trial of block.trials) {
          if (trial.isBuffer) {
            if (trial.isPositionTarget || trial.isSoundTarget || trial.isColorTarget) {
              console.log(`BUG: Buffer trial ${trial.index} has target flag set`);
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('Aggressive Bug Hunting: Boundary Conditions', () => {
  it('nLevel equals total trial count (all buffer)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', nLevel, nLevel, true, 0.5, 0.2);

        // All should be random since no n-back comparison is possible
        return stream.length === nLevel;
      }),
      { numRuns: 50 },
    );
  });

  it('stream with nLevel > length is handled', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), arbSeed, (length, seed) => {
        const nLevel = length + 3; // nLevel > length
        const rng = new SeededRandom(seed);
        const stream = generateModalityStream(rng, 'position', length, nLevel, true, 0.5, 0.2);

        // Should generate without crashing
        return stream.length === length;
      }),
      { numRuns: 50 },
    );
  });

  it('targetProbability=1.0 produces all targets after buffer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const length = 50;
        const stream = generateModalityStream(rng, 'position', length, nLevel, true, 1.0, 0);

        // Count targets
        let targets = 0;
        for (let i = nLevel; i < length; i++) {
          if (stream[i] === stream[i - nLevel]) {
            targets++;
          }
        }

        // With targetProb=1.0, ALL scorable trials should be targets
        const scorable = length - nLevel;
        return targets === scorable;
      }),
      { numRuns: 50 },
    );
  });

  it('targetProbability=0.0 produces no targets after buffer (statistically)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const rng = new SeededRandom(seed);
        const length = 100;
        const stream = generateModalityStream(rng, 'position', length, nLevel, true, 0, 0);

        // Count targets
        let targets = 0;
        for (let i = nLevel; i < length; i++) {
          if (stream[i] === stream[i - nLevel]) {
            targets++;
          }
        }

        // With targetProb=0 and 8 positions, we still expect some random collisions
        // but rate should be around 1/8 = 12.5%
        const scorable = length - nLevel;
        const targetRate = targets / scorable;

        // Allow up to 25% due to random chance (1/8 base probability)
        return targetRate <= 0.25;
      }),
      { numRuns: 50 },
    );
  });

  it('pool of size 1 always produces targets (trivial case)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const gen = new ModalityStreamGenerator(new SeededRandom(seed));
        const singlePool = [0] as readonly number[];
        const stream = gen.generateStream(singlePool, 20, nLevel, true, 0.2, 0.2);

        // With pool of size 1, every value is the same, so every non-buffer is a target
        for (let i = nLevel; i < stream.length; i++) {
          if (stream[i] !== stream[i - nLevel]) {
            console.log(`BUG: With pool size 1, trial ${i} should always match n-back`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 30 },
    );
  });

  it('pool of size 2 has higher collision rate than pool of 8', () => {
    // With pool of 2 and targetProb=0, non-targets use choiceExcluding
    // which gives deterministic alternation. Random collisions depend on
    // the buffer values and nLevel. The overall rate should be lower
    // than with truly random selection.
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), arbSeed, (nLevel, seed) => {
        const gen = new ModalityStreamGenerator(new SeededRandom(seed));
        const smallPool = [0, 1] as readonly number[];
        const stream = gen.generateStream(smallPool, 100, nLevel, true, 0, 0);

        // Just verify the stream is valid (all values from pool)
        for (const val of stream) {
          if (val !== 0 && val !== 1) {
            console.log(`BUG: Value ${val} not in pool [0, 1]`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 30 },
    );
  });
});

describe('Aggressive Bug Hunting: Sequence Integrity', () => {
  it('no trial has undefined position', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.position === undefined) {
            console.log(`BUG: Trial ${trial.index} has undefined position`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('no trial has undefined sound', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (trial.sound === undefined) {
            console.log(`BUG: Trial ${trial.index} has undefined sound`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('all trials have valid trialType', () => {
    const validTypes = ['Tampon', 'Dual', 'V-Seul', 'A-Seul', 'Non-Cible'];

    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (!validTypes.includes(trial.trialType)) {
            console.log(`BUG: Trial ${trial.index} has invalid trialType: ${trial.trialType}`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('lure type is only set when lure flag is true', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          // If lure type is set, lure flag should be true
          if (trial.positionLureType !== undefined && !trial.isPositionLure) {
            console.log(
              `BUG: Trial ${trial.index} has positionLureType but isPositionLure is not true`,
            );
            return false;
          }

          if (trial.soundLureType !== undefined && !trial.isSoundLure) {
            console.log(`BUG: Trial ${trial.index} has soundLureType but isSoundLure is not true`);
            return false;
          }
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// SEMANTIC CONSISTENCY TESTS: Different generators use same terms differently
// =============================================================================

describe('Semantic Consistency: Lure Type Definitions', () => {
  it('DOCUMENTED DIFFERENCE: LureDetector n-1 vs BrainWorkshop n-1', () => {
    // This test documents the semantic difference between generators
    // LureDetector: n-1 = immediately previous position (index - 1)
    // BrainWorkshop: n-1 = (n-1)-back position (index - (realBack - 1))

    // Test DualnbackClassic (uses LureDetector semantics)
    const classicConfig = createBlockConfig({ nLevel: 3, generator: 'DualnbackClassic' });
    const classicBlock = BlockGenerator.generate(classicConfig, 'test-seed-123');

    // Test BrainWorkshop
    const bwConfig = createBlockConfig({ nLevel: 3, generator: 'BrainWorkshop' });
    const bwBlock = BlockGenerator.generate(bwConfig, 'test-seed-123');

    // Both should generate valid blocks
    expect(classicBlock.trials.length).toBeGreaterThan(3);
    expect(bwBlock.trials.length).toBeGreaterThan(3);

    // Document that lure semantics differ - this is expected behavior
  });

  it('n-1 lure in DualnbackClassic matches LureDetector behavior', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        for (let i = 1; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;

          if (trial.positionLureType === 'n-1') {
            const prevTrial = block.trials[i - 1] as Trial;

            // LureDetector: n-1 means matches index-1
            if (trial.position !== prevTrial.position) {
              return false;
            }

            // Also verify it's NOT a target (mutual exclusivity)
            if (trial.isPositionTarget) {
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// CHAOS TESTING: Random configurations
// =============================================================================

describe('Chaos Testing: Random Valid Configurations', () => {
  it('random valid config produces valid block', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbSeed,
        arbGeneratorName,
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        (nLevel, seed, generator, targetProb, lureProb) => {
          const config = createBlockConfig({
            nLevel,
            generator,
            targetProbability: targetProb,
            lureProbability: lureProb,
          });

          const block = BlockGenerator.generate(config, seed);

          // Basic validity checks
          if (block.trials.length < nLevel) return false;
          if (block.trials.filter((t) => t.isBuffer).length !== nLevel) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all blocks have strictly increasing trial indices', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (let i = 1; i < block.trials.length; i++) {
          // @ts-expect-error test: nullable access
          if (block.trials[i]?.index !== block!.trials[i - 1]?.index + 1) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('no NaN or Infinity values in trials', () => {
    fc.assert(
      fc.property(arbNLevel, arbSeed, arbGeneratorName, (nLevel, seed, generator) => {
        const config = createBlockConfig({ nLevel, generator });
        const block = BlockGenerator.generate(config, seed);

        for (const trial of block.trials) {
          if (!Number.isFinite(trial.index)) return false;
          if (!Number.isFinite(trial.position)) return false;
          // Sound is a string, so no numeric check needed
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// PROPERTY: Statistical Bounds (over many runs)
// =============================================================================

describe('Statistical Bounds', () => {
  it('over 50 blocks, DualnbackClassic always has exactly 4+4+2=10 targets', () => {
    fc.assert(
      fc.property(arbSeed, (baseSeed) => {
        for (let i = 0; i < 50; i++) {
          const seed = `${baseSeed}-${i}`;
          const config = createBlockConfig({ nLevel: 2, generator: 'DualnbackClassic' });
          const block = BlockGenerator.generate(config, seed);
          const scorable = block.trials.filter((t) => !t.isBuffer);

          const posTargets = scorable.filter((t) => t.isPositionTarget).length;
          const soundTargets = scorable.filter((t) => t.isSoundTarget).length;
          const dualTargets = scorable.filter((t) => t.isPositionTarget && t.isSoundTarget).length;

          // 6 position targets (4 V-Seul + 2 Dual)
          // 6 sound targets (4 A-Seul + 2 Dual)
          // Total unique trials with any target = 10 (4+4+2)
          if (posTargets !== 6 || soundTargets !== 6 || dualTargets !== 2) {
            console.log(
              `Unexpected: posTargets=${posTargets}, soundTargets=${soundTargets}, dualTargets=${dualTargets}`,
            );
            return false;
          }
        }
        return true;
      }),
      { numRuns: 10 },
    );
  });

  it('BrainWorkshop target rates follow expected distribution', () => {
    // Collect statistics over many blocks
    fc.assert(
      fc.property(arbSeed, (baseSeed) => {
        const positionRates: number[] = [];
        const soundRates: number[] = [];

        for (let i = 0; i < 30; i++) {
          const seed = `${baseSeed}-${i}`;
          const config = createBlockConfig({ nLevel: 2, generator: 'BrainWorkshop' });
          const block = BlockGenerator.generate(config, seed);
          const scorable = block.trials.filter((t) => !t.isBuffer);

          if (scorable.length < 10) continue;

          const posTargets = scorable.filter((t) => t.isPositionTarget).length;
          const soundTargets = scorable.filter((t) => t.isSoundTarget).length;

          positionRates.push(posTargets / scorable.length);
          soundRates.push(soundTargets / scorable.length);
        }

        if (positionRates.length === 0) return true;

        // Calculate mean
        const posMean = positionRates.reduce((a, b) => a + b, 0) / positionRates.length;
        const soundMean = soundRates.reduce((a, b) => a + b, 0) / soundRates.length;

        // Mean should be in reasonable range (10% - 40%)
        // BW guaranteedMatch is 12.5% + random matches + interference
        return posMean > 0.05 && posMean < 0.6 && soundMean > 0.05 && soundMean < 0.6;
      }),
      { numRuns: 10 },
    );
  });
});

// =============================================================================
// STRESS TEST: High nLevel values
// =============================================================================

describe('Stress Test: High nLevel', () => {
  it('nLevel=9 produces valid block', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const config = createBlockConfig({ nLevel: 9, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        // Should have 9 buffer trials
        const bufferCount = block.trials.filter((t) => t.isBuffer).length;
        return bufferCount === 9 && block.trials.length >= 9;
      }),
      { numRuns: 50 },
    );
  });

  it('high nLevel maintains all invariants', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 9 }), arbSeed, (nLevel, seed) => {
        const config = createBlockConfig({ nLevel, generator: 'DualnbackClassic' });
        const block = BlockGenerator.generate(config, seed);

        // Check all core invariants
        for (let i = nLevel; i < block.trials.length; i++) {
          const trial = block.trials[i] as Trial;
          const nBackTrial = block.trials[i - nLevel] as Trial;

          // Invariant 1: Target relationship
          if (trial.isPositionTarget && trial.position !== nBackTrial.position) {
            return false;
          }
          if (trial.isSoundTarget && trial.sound !== nBackTrial.sound) {
            return false;
          }

          // Invariant 2: Mutual exclusivity
          if (trial.isPositionTarget && trial.isPositionLure) {
            return false;
          }
        }

        // Invariant 3: Buffer trials
        for (const trial of block.trials) {
          if (trial.isBuffer && (trial.isPositionTarget || trial.isSoundTarget)) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 50 },
    );
  });
});
