/**
 * Property-Based Tests for Trial Generator and Running Stats
 *
 * Uses fast-check for property testing to ensure:
 * - Trial generation invariants
 * - Running stats accumulation correctness
 * - Generator state consistency
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { PreGeneratedTrialGenerator } from './pre-generated-trial-generator';
import { RunningStatsCalculator } from './running-stats';
import type { Trial } from '../domain';
import type { TrialResponse } from './types';
import {
  COACH_MIN_TRIALS_FOR_TREND,
  COACH_MIN_RTS_FOR_RT_TREND,
  COACH_DPRIME_ESTIMATION_ADJUSTMENT,
} from '../specs/thresholds';

// =============================================================================
// Arbitraries (Test Data Generators)
// =============================================================================

const positionArb = fc.constantFrom(0, 1, 2, 3, 4, 5, 6, 7) as fc.Arbitrary<
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
>;
const soundArb = fc.constantFrom('C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T') as fc.Arbitrary<
  'C' | 'H' | 'K' | 'L' | 'Q' | 'R' | 'S' | 'T'
>;
const colorArb = fc.constantFrom(
  'ink-black',
  'ink-navy',
  'ink-burgundy',
  'ink-forest',
  'ink-burnt',
  'ink-plum',
  'ink-teal',
  'ink-mustard',
) as fc.Arbitrary<
  | 'ink-black'
  | 'ink-navy'
  | 'ink-burgundy'
  | 'ink-forest'
  | 'ink-burnt'
  | 'ink-plum'
  | 'ink-teal'
  | 'ink-mustard'
>;
const imageArb = fc.constantFrom(
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
) as fc.Arbitrary<
  'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'cross'
>;
const trialTypeArb = fc.constantFrom(
  'V-Seul',
  'A-Seul',
  'Dual',
  'Non-Cible',
  'Tampon',
) as fc.Arbitrary<'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible' | 'Tampon'>;

const trialArb = (index: number, isBuffer = false): fc.Arbitrary<Trial> =>
  fc.record({
    index: fc.constant(index),
    isBuffer: fc.constant(isBuffer),
    position: positionArb,
    sound: soundArb,
    color: colorArb,
    image: imageArb,
    trialType: trialTypeArb,
    isPositionTarget: fc.boolean(),
    isSoundTarget: fc.boolean(),
    isColorTarget: fc.boolean(),
    isImageTarget: fc.boolean(),
    isPositionLure: fc.oneof(fc.boolean(), fc.constant(undefined)),
    isSoundLure: fc.oneof(fc.boolean(), fc.constant(undefined)),
    isColorLure: fc.oneof(fc.boolean(), fc.constant(undefined)),
    isImageLure: fc.oneof(fc.boolean(), fc.constant(undefined)),
    positionLureType: fc.constant(undefined),
    soundLureType: fc.constant(undefined),
    colorLureType: fc.constant(undefined),
    imageLureType: fc.constant(undefined),
  });

const trialsArrayArb = (minLength: number, maxLength: number): fc.Arbitrary<Trial[]> =>
  fc.integer({ min: minLength, max: maxLength }).chain((length) =>
    fc
      .tuple(
        ...Array.from({ length }, (_, i) => trialArb(i, i < 2)), // First 2 are buffers
      )
      .map((trials) => trials as Trial[]),
  );

const reactionTimeArb = fc.integer({ min: 100, max: 2000 });
const nullableRTArb = fc.oneof(reactionTimeArb, fc.constant(null));

const modalityIdArb = fc.constantFrom('position', 'audio', 'color');
const activeModalitiesArb = fc.subarray(['position', 'audio', 'color'] as const, { minLength: 1 });

// Helper to create a valid trial for testing
function createTrial(index: number, isBuffer = false, overrides: Partial<Trial> = {}): Trial {
  return {
    index,
    isBuffer,
    position: 0,
    sound: 'C',
    color: 'ink-black',
    image: 'circle',
    trialType: 'Non-Cible',
    isPositionTarget: false,
    isSoundTarget: false,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: undefined,
    isSoundLure: undefined,
    isColorLure: undefined,
    isImageLure: undefined,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
    ...overrides,
  };
}

function createResponse(
  trialIndex: number,
  posPressed = false,
  audPressed = false,
  rt: number | null = null,
): TrialResponse {
  const responses = new Map<string, { pressed: boolean; rt: number | null }>();
  responses.set('position', { pressed: posPressed, rt: posPressed ? rt : null });
  responses.set('audio', { pressed: audPressed, rt: audPressed ? rt : null });
  return {
    trialIndex,
    responses,
    timestamp: new Date(),
  };
}

// =============================================================================
// Trial Generation Properties (20 tests)
// =============================================================================

describe('Trial Generation - Property Tests', () => {
  describe('Generated trials have valid structure', () => {
    it('P1: All generated trials have valid index (0 to length-1)', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          const generatedTrials: Trial[] = [];
          while (generator.hasMore()) {
            generatedTrials.push(generator.generateNext());
          }
          return generatedTrials.every((t, i) => t.index === i);
        }),
      );
    });

    it('P2: All generated trials have position in valid range [0,7]', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            const trial = generator.generateNext();
            if (trial.position < 0 || trial.position > 7) return false;
          }
          return true;
        }),
      );
    });

    it('P3: All generated trials have sound in valid set', () => {
      const validSounds = new Set(['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T']);
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            const trial = generator.generateNext();
            if (!validSounds.has(trial.sound)) return false;
          }
          return true;
        }),
      );
    });

    it('P4: isBuffer flag is preserved through generation', () => {
      fc.assert(
        fc.property(trialsArrayArb(3, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          for (let i = 0; i < trials.length; i++) {
            const generated = generator.generateNext();
            if (generated.isBuffer !== trials[i]!.isBuffer) return false;
          }
          return true;
        }),
      );
    });

    it('P5: Target flags are boolean', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            const trial = generator.generateNext();
            if (typeof trial.isPositionTarget !== 'boolean') return false;
            if (typeof trial.isSoundTarget !== 'boolean') return false;
          }
          return true;
        }),
      );
    });
  });

  describe('Trial indices are sequential', () => {
    it('P6: Indices start at 0', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          const first = generator.generateNext();
          return first.index === 0;
        }),
      );
    });

    it('P7: Indices increment by 1 for each trial', () => {
      fc.assert(
        fc.property(trialsArrayArb(2, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          let lastIndex = -1;
          while (generator.hasMore()) {
            const trial = generator.generateNext();
            if (trial.index !== lastIndex + 1) return false;
            lastIndex = trial.index;
          }
          return true;
        }),
      );
    });

    it('P8: getNextIndex() returns correct value before generation', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 30), fc.integer({ min: 0, max: 4 }), (trials, skipCount) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          for (let i = 0; i < skipCount && generator.hasMore(); i++) {
            generator.generateNext();
          }
          return generator.getNextIndex() === skipCount;
        }),
      );
    });

    it('P9: getNextIndex() increments after each generateNext()', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 30), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          for (let i = 0; i < trials.length; i++) {
            const indexBefore = generator.getNextIndex();
            if (indexBefore !== i) return false;
            generator.generateNext();
            const indexAfter = generator.getNextIndex();
            if (indexAfter !== i + 1) return false;
          }
          return true;
        }),
      );
    });

    it('P10: Final index equals total trials count', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            generator.generateNext();
          }
          return generator.getNextIndex() === trials.length;
        }),
      );
    });
  });

  describe('Buffer trials precede scorable trials', () => {
    it('P11: First N trials are buffers when N is nLevel (typical pattern)', () => {
      // Create trials with specific buffer pattern
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 5, max: 30 }),
          (nLevel, scorableCount) => {
            const trials: Trial[] = [];
            for (let i = 0; i < nLevel; i++) {
              trials.push(createTrial(i, true));
            }
            for (let i = 0; i < scorableCount; i++) {
              trials.push(createTrial(nLevel + i, false));
            }
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);

            // Check first nLevel are buffers
            for (let i = 0; i < nLevel; i++) {
              const trial = generator.generateNext();
              if (!trial.isBuffer) return false;
            }
            // Check remaining are not buffers
            while (generator.hasMore()) {
              const trial = generator.generateNext();
              if (trial.isBuffer) return false;
            }
            return true;
          },
        ),
      );
    });

    it('P12: Buffer count matches expected for nLevel pattern', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 5, max: 30 }),
          (nLevel, scorableCount) => {
            const trials: Trial[] = [];
            for (let i = 0; i < nLevel; i++) {
              trials.push(createTrial(i, true));
            }
            for (let i = 0; i < scorableCount; i++) {
              trials.push(createTrial(nLevel + i, false));
            }
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);

            let bufferCount = 0;
            while (generator.hasMore()) {
              const trial = generator.generateNext();
              if (trial.isBuffer) bufferCount++;
            }
            return bufferCount === nLevel;
          },
        ),
      );
    });
  });

  describe('Total trials match config', () => {
    it('P13: getTotalTrials() equals trials array length', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 100), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          return generator.getTotalTrials() === trials.length;
        }),
      );
    });

    it('P14: Number of generated trials equals getTotalTrials()', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          let count = 0;
          while (generator.hasMore()) {
            generator.generateNext();
            count++;
          }
          return count === generator.getTotalTrials();
        }),
      );
    });

    it('P15: getGeneratedTrials() length matches trials generated so far', () => {
      fc.assert(
        fc.property(
          trialsArrayArb(5, 30),
          fc.integer({ min: 0, max: 4 }),
          (trials, generateCount) => {
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);
            for (let i = 0; i < generateCount && generator.hasMore(); i++) {
              generator.generateNext();
            }
            return generator.getGeneratedTrials().length === Math.min(generateCount, trials.length);
          },
        ),
      );
    });

    it('P16: Empty trials array produces generator with 0 total', () => {
      const generator = PreGeneratedTrialGenerator.fromTrials([]);
      expect(generator.getTotalTrials()).toBe(0);
      expect(generator.hasMore()).toBe(false);
    });

    it('P17: Single trial works correctly', () => {
      fc.assert(
        fc.property(trialArb(0), (trial) => {
          const generator = PreGeneratedTrialGenerator.fromTrials([trial]);
          expect(generator.getTotalTrials()).toBe(1);
          expect(generator.hasMore()).toBe(true);
          const generated = generator.generateNext();
          expect(generator.hasMore()).toBe(false);
          return generated.index === trial.index;
        }),
      );
    });

    it('P18: Large trial count (100+) works correctly', () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 200 }), (count) => {
          const trials = Array.from({ length: count }, (_, i) => createTrial(i, i < 2));
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          return generator.getTotalTrials() === count;
        }),
      );
    });

    it('P19: All trials can be generated without error', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 50), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          try {
            while (generator.hasMore()) {
              generator.generateNext();
            }
            return true;
          } catch {
            return false;
          }
        }),
      );
    });

    it('P20: Generating beyond total throws error', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            generator.generateNext();
          }
          try {
            generator.generateNext();
            return false; // Should have thrown
          } catch {
            return true;
          }
        }),
      );
    });
  });
});

// =============================================================================
// Running Stats Properties (20 tests)
// =============================================================================

describe('Running Stats - Property Tests', () => {
  describe('Stats are accumulated correctly', () => {
    it('P21: trialsCompleted counts only non-buffer trials', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 20 }),
          (bufferCount, scorableCount) => {
            const calculator = new RunningStatsCalculator(
              ['position', 'audio'],
              bufferCount + scorableCount,
            );

            // Record buffer trials
            for (let i = 0; i < bufferCount; i++) {
              calculator.record(createTrial(i, true), createResponse(i));
            }
            // Record scorable trials
            for (let i = 0; i < scorableCount; i++) {
              calculator.record(
                createTrial(bufferCount + i, false),
                createResponse(bufferCount + i),
              );
            }

            const stats = calculator.calculate();
            return stats.trialsCompleted === scorableCount;
          },
        ),
      );
    });

    it('P22: hits + misses + FA + CR for each modality equals non-buffer trials', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount);

          for (let i = 0; i < trialCount; i++) {
            const isTarget = i % 2 === 0;
            const pressed = i % 3 === 0;
            calculator.record(
              createTrial(i, false, { isPositionTarget: isTarget }),
              createResponse(i, pressed),
            );
          }

          const stats = calculator.calculate();
          const pos = stats.byModality.get('position')!;
          const total = pos.hits + pos.misses + pos.falseAlarms + pos.correctRejections;
          return total === trialCount;
        }),
      );
    });

    it('P23: Recording a hit increments hits count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (hitCount) => {
          const calculator = new RunningStatsCalculator(['position'], hitCount + 10);

          for (let i = 0; i < hitCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: true }),
              createResponse(i, true, false, 400),
            );
          }

          const stats = calculator.calculate();
          return stats.byModality.get('position')!.hits === hitCount;
        }),
      );
    });

    it('P24: Recording a miss increments misses count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (missCount) => {
          const calculator = new RunningStatsCalculator(['position'], missCount + 10);

          for (let i = 0; i < missCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: true }),
              createResponse(i, false),
            );
          }

          const stats = calculator.calculate();
          return stats.byModality.get('position')!.misses === missCount;
        }),
      );
    });

    it('P25: Recording a false alarm increments falseAlarms count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (faCount) => {
          const calculator = new RunningStatsCalculator(['position'], faCount + 10);

          for (let i = 0; i < faCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: false }),
              createResponse(i, true),
            );
          }

          const stats = calculator.calculate();
          return stats.byModality.get('position')!.falseAlarms === faCount;
        }),
      );
    });

    it('P26: Recording a correct rejection increments correctRejections count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (crCount) => {
          const calculator = new RunningStatsCalculator(['position'], crCount + 10);

          for (let i = 0; i < crCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: false }),
              createResponse(i, false),
            );
          }

          const stats = calculator.calculate();
          return stats.byModality.get('position')!.correctRejections === crCount;
        }),
      );
    });

    it('P27: Reaction times are collected only for positive RTs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 1, maxLength: 20 }),
          (rts) => {
            const calculator = new RunningStatsCalculator(['position'], rts.length + 10);

            for (let i = 0; i < rts.length; i++) {
              calculator.record(
                createTrial(i, false, { isPositionTarget: true }),
                createResponse(i, true, false, rts[i]),
              );
            }

            const stats = calculator.calculate();
            return stats.byModality.get('position')!.reactionTimes.length === rts.length;
          },
        ),
      );
    });

    it('P28: Zero RT is ignored in reaction time collection', () => {
      const calculator = new RunningStatsCalculator(['position'], 10);
      calculator.record(
        createTrial(0, false, { isPositionTarget: true }),
        createResponse(0, true, false, 0),
      );
      const stats = calculator.calculate();
      expect(stats.byModality.get('position')!.reactionTimes).toHaveLength(0);
    });

    it('P29: Average RT is correct for collected RTs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 1, maxLength: 20 }),
          (rts) => {
            const calculator = new RunningStatsCalculator(['position'], rts.length + 10);

            for (let i = 0; i < rts.length; i++) {
              calculator.record(
                createTrial(i, false, { isPositionTarget: true }),
                createResponse(i, true, false, rts[i]),
              );
            }

            const stats = calculator.calculate();
            const expectedAvg = rts.reduce((a, b) => a + b, 0) / rts.length;
            return Math.abs(stats.byModality.get('position')!.avgRT! - expectedAvg) < 0.001;
          },
        ),
      );
    });

    it('P30: Multiple modalities are tracked independently', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 20 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position', 'audio'], trialCount + 10);

          for (let i = 0; i < trialCount; i++) {
            // Position: always target, always hit
            // Audio: never target, always correct rejection
            calculator.record(
              createTrial(i, false, { isPositionTarget: true, isSoundTarget: false }),
              createResponse(i, true, false, 400),
            );
          }

          const stats = calculator.calculate();
          const pos = stats.byModality.get('position')!;
          const aud = stats.byModality.get('audio')!;

          return pos.hits === trialCount && aud.correctRejections === trialCount;
        }),
      );
    });
  });

  describe('Counts are non-negative', () => {
    it('P31: hits is never negative', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);
          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: Math.random() > 0.5 }),
              createResponse(i, Math.random() > 0.5),
            );
          }
          const stats = calculator.calculate();
          return stats.byModality.get('position')!.hits >= 0;
        }),
      );
    });

    it('P32: misses is never negative', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);
          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: Math.random() > 0.5 }),
              createResponse(i, Math.random() > 0.5),
            );
          }
          const stats = calculator.calculate();
          return stats.byModality.get('position')!.misses >= 0;
        }),
      );
    });

    it('P33: falseAlarms is never negative', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);
          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: Math.random() > 0.5 }),
              createResponse(i, Math.random() > 0.5),
            );
          }
          const stats = calculator.calculate();
          return stats.byModality.get('position')!.falseAlarms >= 0;
        }),
      );
    });

    it('P34: correctRejections is never negative', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);
          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: Math.random() > 0.5 }),
              createResponse(i, Math.random() > 0.5),
            );
          }
          const stats = calculator.calculate();
          return stats.byModality.get('position')!.correctRejections >= 0;
        }),
      );
    });

    it('P35: trialsCompleted is never negative', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);
          for (let i = 0; i < trialCount; i++) {
            calculator.record(createTrial(i, false), createResponse(i));
          }
          const stats = calculator.calculate();
          return stats.trialsCompleted >= 0;
        }),
      );
    });
  });

  describe('D-prime calculations are finite', () => {
    it('P36: currentDPrime is finite for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          (hits, misses, fa, cr) => {
            const calculator = new RunningStatsCalculator(
              ['position'],
              hits + misses + fa + cr + 10,
            );

            // Record hits
            for (let i = 0; i < hits; i++) {
              calculator.record(
                createTrial(i, false, { isPositionTarget: true }),
                createResponse(i, true),
              );
            }
            // Record misses
            for (let i = 0; i < misses; i++) {
              calculator.record(
                createTrial(hits + i, false, { isPositionTarget: true }),
                createResponse(hits + i, false),
              );
            }
            // Record false alarms
            for (let i = 0; i < fa; i++) {
              calculator.record(
                createTrial(hits + misses + i, false, { isPositionTarget: false }),
                createResponse(hits + misses + i, true),
              );
            }
            // Record correct rejections
            for (let i = 0; i < cr; i++) {
              calculator.record(
                createTrial(hits + misses + fa + i, false, { isPositionTarget: false }),
                createResponse(hits + misses + fa + i, false),
              );
            }

            const stats = calculator.calculate();
            return Number.isFinite(stats.currentDPrime);
          },
        ),
      );
    });

    it('P37: estimatedFinalDPrime is finite', () => {
      fc.assert(
        fc.property(fc.integer({ min: 10, max: 50 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);

          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: i % 2 === 0 }),
              createResponse(i, i % 2 === 0, false, 400),
            );
          }

          const stats = calculator.calculate();
          return Number.isFinite(stats.estimatedFinalDPrime);
        }),
      );
    });

    it('P38: Per-modality dPrime is finite', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position', 'audio'], trialCount + 10);

          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: i % 2 === 0, isSoundTarget: i % 3 === 0 }),
              createResponse(i, i % 2 === 0, i % 3 === 0, 400),
            );
          }

          const stats = calculator.calculate();
          for (const [, modalityStats] of stats.byModality) {
            if (!Number.isFinite(modalityStats.currentDPrime)) return false;
          }
          return true;
        }),
      );
    });

    it('P39: currentDPrime is bounded between reasonable values', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 50 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], trialCount + 10);

          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: i % 2 === 0 }),
              createResponse(i, Math.random() > 0.3, false, 400),
            );
          }

          const stats = calculator.calculate();
          // d-prime should be bounded (SDTCalculator clamps to [-10, 10])
          return stats.currentDPrime >= -10 && stats.currentDPrime <= 10;
        }),
      );
    });

    it('P40: currentDPrime is average of modality dPrimes', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 30 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position', 'audio'], trialCount + 10);

          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: i % 2 === 0, isSoundTarget: i % 3 === 0 }),
              createResponse(i, i % 2 === 0, i % 3 === 0, 400),
            );
          }

          const stats = calculator.calculate();
          const dPrimes = Array.from(stats.byModality.values()).map((m) => m.currentDPrime);
          const expectedAvg = dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;

          return Math.abs(stats.currentDPrime - expectedAvg) < 0.0001;
        }),
      );
    });
  });

  describe('Trend calculation follows thresholds', () => {
    it('P41: Trend is stable for fewer than COACH_MIN_TRIALS_FOR_TREND trials', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: COACH_MIN_TRIALS_FOR_TREND - 1 }), (trialCount) => {
          const calculator = new RunningStatsCalculator(['position'], 20);

          for (let i = 0; i < trialCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: true }),
              createResponse(i, true, false, 400),
            );
          }

          const stats = calculator.calculate();
          return stats.trend === 'stable';
        }),
      );
    });

    it('P42: RT trend is stable for fewer than COACH_MIN_RTS_FOR_RT_TREND RTs', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: COACH_MIN_RTS_FOR_RT_TREND - 1 }), (rtCount) => {
          const calculator = new RunningStatsCalculator(['position'], 20);

          for (let i = 0; i < rtCount; i++) {
            calculator.record(
              createTrial(i, false, { isPositionTarget: true }),
              createResponse(i, true, false, 500 - i * 50),
            );
          }

          const stats = calculator.calculate();
          return stats.byModality.get('position')!.rtTrend === 'stable';
        }),
      );
    });

    it('P43: Estimation adjustment uses COACH_DPRIME_ESTIMATION_ADJUSTMENT', () => {
      // When improving, estimated = current + adjustment
      const calculator = new RunningStatsCalculator(['position'], 30);

      // First half: poor
      for (let i = 0; i < 10; i++) {
        calculator.record(
          createTrial(i, false, { isPositionTarget: true }),
          createResponse(i, false),
        );
      }
      // Second half: perfect
      for (let i = 10; i < 20; i++) {
        calculator.record(
          createTrial(i, false, { isPositionTarget: i % 2 === 0 }),
          createResponse(i, i % 2 === 0, false, 400),
        );
      }

      const stats = calculator.calculate();
      if (stats.trend === 'improving') {
        expect(stats.estimatedFinalDPrime).toBeCloseTo(
          stats.currentDPrime + COACH_DPRIME_ESTIMATION_ADJUSTMENT,
          5,
        );
      }
    });
  });
});

// =============================================================================
// Generator State Properties (10 tests)
// =============================================================================

describe('Generator State - Property Tests', () => {
  describe('hasMore() consistency', () => {
    it('P44: hasMore() is true when getNextIndex() < getTotalTrials()', () => {
      fc.assert(
        fc.property(
          trialsArrayArb(5, 30),
          fc.integer({ min: 0, max: 4 }),
          (trials, generateCount) => {
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);
            for (let i = 0; i < generateCount && generator.hasMore(); i++) {
              generator.generateNext();
            }
            return generator.hasMore() === generator.getNextIndex() < generator.getTotalTrials();
          },
        ),
      );
    });

    it('P45: hasMore() is false when getNextIndex() >= getTotalTrials()', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 30), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          while (generator.hasMore()) {
            generator.generateNext();
          }
          return !generator.hasMore() && generator.getNextIndex() === generator.getTotalTrials();
        }),
      );
    });

    it('P46: hasMore() changes from true to false after last trial', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);

          while (generator.getNextIndex() < trials.length - 1) {
            expect(generator.hasMore()).toBe(true);
            generator.generateNext();
          }

          // One before last
          expect(generator.hasMore()).toBe(true);
          generator.generateNext();

          // After last
          return !generator.hasMore();
        }),
      );
    });
  });

  describe('skipTo() behavior', () => {
    it('P47: skipTo() advances getNextIndex() correctly', () => {
      fc.assert(
        fc.property(
          trialsArrayArb(10, 30),
          fc.integer({ min: 0, max: 9 }),
          (trials, targetIndex) => {
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);
            generator.skipTo(targetIndex);
            return generator.getNextIndex() === targetIndex;
          },
        ),
      );
    });

    it('P48: skipTo(0) resets generator to beginning', () => {
      fc.assert(
        fc.property(
          trialsArrayArb(5, 20),
          fc.integer({ min: 1, max: 4 }),
          (trials, generateCount) => {
            const generator = PreGeneratedTrialGenerator.fromTrials(trials);

            // Generate some trials
            for (let i = 0; i < generateCount && generator.hasMore(); i++) {
              generator.generateNext();
            }

            // Reset to beginning
            generator.skipTo(0);

            return generator.getNextIndex() === 0 && generator.hasMore();
          },
        ),
      );
    });

    it('P49: skipTo() to end makes hasMore() false', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          generator.skipTo(trials.length);
          return !generator.hasMore();
        }),
      );
    });

    it('P50: skipTo() with invalid index throws error', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);

          // Negative index
          try {
            generator.skipTo(-1);
            return false;
          } catch {
            // Expected
          }

          // Beyond length
          try {
            generator.skipTo(trials.length + 1);
            return false;
          } catch {
            // Expected
          }

          return true;
        }),
      );
    });
  });

  describe('Generator determinism', () => {
    it('P51: Same trials produce same sequence', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 30), (trials) => {
          const generator1 = PreGeneratedTrialGenerator.fromTrials([...trials]);
          const generator2 = PreGeneratedTrialGenerator.fromTrials([...trials]);

          while (generator1.hasMore() && generator2.hasMore()) {
            const t1 = generator1.generateNext();
            const t2 = generator2.generateNext();
            if (t1.index !== t2.index || t1.position !== t2.position || t1.sound !== t2.sound) {
              return false;
            }
          }

          return generator1.hasMore() === generator2.hasMore();
        }),
      );
    });

    it('P52: getGeneratedTrials() returns copies, not references', () => {
      fc.assert(
        fc.property(trialsArrayArb(5, 20), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);
          generator.generateNext();

          const generated1 = generator.getGeneratedTrials();
          const generated2 = generator.getGeneratedTrials();

          return generated1 !== generated2 && generated1.length === generated2.length;
        }),
      );
    });

    it('P53: Non-adaptive methods return null', () => {
      fc.assert(
        fc.property(trialsArrayArb(1, 10), (trials) => {
          const generator = PreGeneratedTrialGenerator.fromTrials(trials);

          return (
            generator.getGameParameters() === null &&
            generator.getDifficulty() === null &&
            generator.getLureProbability() === null &&
            generator.getTargetProbability() === null &&
            generator.getISI() === null &&
            generator.getPerformanceContext() === null &&
            generator.getZoneNumber() === null &&
            !generator.isAdaptive()
          );
        }),
      );
    });
  });
});
