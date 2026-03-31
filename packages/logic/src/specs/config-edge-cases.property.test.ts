/**
 * Property-Based Tests: Config Edge Cases & Validation
 *
 * Aggressive property-based tests to find bugs in game configuration validation.
 * Uses fast-check to generate edge cases that might slip through manual testing.
 *
 * Test categories:
 * 1. Conflicting probability values (target + lure > 1)
 * 2. Zero trialsCount / invalid trialsCount
 * 3. trialsCount vs nLevel relationship
 * 4. nLevel edge cases (0, negative, non-integer)
 * 5. Probability edge cases (negative, > 1, NaN)
 * 6. Missing required fields
 * 7. Config merge with partial overrides
 * 8. Invalid modality combinations
 * 9. Extreme timing values (0ms, 999999ms)
 * 10. Spec validation with malformed input
 * 11. Cross-spec reference integrity
 *
 * @see thresholds.ts for SSOT numeric values
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { GameConfig } from '../domain/game-config';
import type { BlockConfig, GeneratorName } from '../domain/types';
import { DEFAULT_CONFIG } from '../domain/types';
import { safeValidateModeSpec } from './validation';
import { AllSpecs, type ModeId } from './index';
import {
  VALID_DPRIME_MIN,
  VALID_DPRIME_MAX,
  VALID_ACCURACY_MIN,
  VALID_ACCURACY_MAX,
  VALIDATION_MIN_INTERVAL_SECONDS,
} from './thresholds';

// =============================================================================
// Arbitraries - Custom generators for aggressive edge case testing
// =============================================================================

/** Valid nLevel: integer >= 1 */
const arbValidNLevel = fc.integer({ min: 1, max: 100 });

/** Invalid nLevel: <= 0 */
const arbInvalidNLevel = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.constant(Number.MIN_SAFE_INTEGER),
);

/** Non-integer nLevel (floats, special values) */
const arbNonIntegerNLevel = fc.oneof(
  fc.double({ min: 0.001, max: 99.999, noInteger: true, noNaN: true }),
  fc.constant(Math.PI),
  fc.constant(Math.E),
  fc.constant(0.5),
  fc.constant(1.5),
  fc.constant(2.99999999999),
);

/** Valid trialsCount: positive integer */
const arbValidTrialsCount = fc.integer({ min: 1, max: 1000 });

/** Invalid trialsCount: <= 0 */
const arbInvalidTrialsCount = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.constant(Number.MIN_SAFE_INTEGER),
);

/** Valid probability: [0, 1] */
const arbValidProbability = fc.double({ min: 0, max: 1, noNaN: true });

/** Probability just outside bounds */
const arbBoundaryProbability = fc.oneof(
  fc.constant(-0.0001),
  fc.constant(-Number.EPSILON),
  fc.constant(1 + Number.EPSILON),
  fc.constant(1.0001),
  fc.constant(-1),
  fc.constant(2),
);

/** Invalid probability: outside [0, 1] or special values */
const arbInvalidProbability = fc.oneof(
  fc.double({ min: -100, max: -0.001, noNaN: true }),
  fc.double({ min: 1.001, max: 100, noNaN: true }),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

/** Valid interval seconds */
const arbValidIntervalSeconds = fc.double({
  min: VALIDATION_MIN_INTERVAL_SECONDS,
  max: 30,
  noNaN: true,
});

/** Invalid interval seconds (too small) */
const arbInvalidIntervalSeconds = fc.double({
  min: 0,
  max: VALIDATION_MIN_INTERVAL_SECONDS - 0.0001,
  noNaN: true,
});

/** Extreme timing values (edge cases) */
const arbExtremeTiming = fc.oneof(
  fc.constant(0),
  fc.constant(Number.EPSILON),
  fc.constant(0.001),
  fc.constant(999999),
  fc.constant(Number.MAX_SAFE_INTEGER),
);

/** Generator names */
const arbGeneratorName: fc.Arbitrary<GeneratorName> = fc.constantFrom(
  'Aleatoire',
  'BrainWorkshop',
  'DualnbackClassic',
  'Sequence',
);

/** Valid modalities */
const arbValidModalities = fc.array(
  fc.constantFrom('position', 'audio', 'color', 'image', 'arithmetic'),
  { minLength: 1, maxLength: 5 },
);

/** Mode specs from registry */
const allModeIds = Object.keys(AllSpecs) as ModeId[];
const arbModeId = fc.constantFrom(...allModeIds);

// =============================================================================
// 1. CONFLICTING PROBABILITY VALUES (target + lure > 1)
// =============================================================================

describe('Edge Case: Conflicting Probability Values', () => {
  it('BrainWorkshop rejects target + lure > 1 (boundary)', () => {
    // Edge case: exactly at the boundary
    fc.assert(
      fc.property(
        fc.double({ min: 0.5001, max: 1, noNaN: true }),
        fc.double({ min: 0.5001, max: 1, noNaN: true }),
        (target, lure) => {
          fc.pre(target + lure > 1);
          try {
            new GameConfig({
              generator: 'BrainWorkshop',
              targetProbability: target,
              lureProbability: lure,
            });
            return false; // Should have thrown
          } catch (e) {
            return (e as Error).message.includes('Invalid probabilities');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('BrainWorkshop accepts target + lure = 1.0 exactly', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (target) => {
        const lure = 1 - target;
        const config = new GameConfig({
          generator: 'BrainWorkshop',
          targetProbability: target,
          lureProbability: lure,
        });
        return config.targetProbability + config.lureProbability === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('Non-BW generators allow target + lure > 1', () => {
    // This is expected behavior per the validation logic comment
    const nonBwGenerators: GeneratorName[] = ['Aleatoire', 'DualnbackClassic', 'Sequence'];
    fc.assert(
      fc.property(
        fc.constantFrom(...nonBwGenerators),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (generator, target, lure) => {
          // Non-BW should accept any valid individual probabilities
          const config = new GameConfig({
            generator,
            targetProbability: target,
            lureProbability: lure,
          });
          return config.targetProbability === target && config.lureProbability === lure;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles floating point precision at boundary', () => {
    // Test floating point edge cases at the boundary
    const boundaryPairs = [
      [0.3, 0.7], // Exactly 1.0
      [0.33333333333333, 0.66666666666667], // Might have precision issues
      [0.1 + 0.2, 0.7], // 0.1 + 0.2 !== 0.3 in JS
    ];

    for (const [target, lure] of boundaryPairs) {
      // Should not throw for BrainWorkshop when sum <= 1
      if (target! + lure! <= 1) {
        const config = new GameConfig({
          generator: 'BrainWorkshop',
          targetProbability: target,
          lureProbability: lure,
        });
        expect(config.targetProbability).toBe(target as any);
      }
    }
  });
});

// =============================================================================
// 2. ZERO / INVALID TRIALS COUNT
// =============================================================================

describe('Edge Case: Zero and Invalid trialsCount', () => {
  it('rejects trialsCount = 0', () => {
    expect(() => new GameConfig({ trialsCount: 0 })).toThrow('Invalid trialsCount');
  });

  it('rejects negative trialsCount', () => {
    fc.assert(
      fc.property(arbInvalidTrialsCount, (trialsCount) => {
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
      fc.property(
        fc.double({ min: 0.1, max: 99.9, noInteger: true, noNaN: true }),
        (trialsCount) => {
          try {
            new GameConfig({ trialsCount });
            return false;
          } catch (e) {
            return (e as Error).message.includes('Invalid trialsCount');
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('accepts minimum valid trialsCount = 1', () => {
    const config = new GameConfig({ trialsCount: 1 });
    expect(config.trialsCount).toBe(1);
  });

  it('accepts large trialsCount values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10000 }), (trialsCount) => {
        const config = new GameConfig({ trialsCount });
        return config.trialsCount === trialsCount;
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 3. TRIALS COUNT vs N-LEVEL RELATIONSHIP
// =============================================================================

describe('Edge Case: trialsCount vs nLevel Relationship', () => {
  /**
   * POTENTIAL BUG FOUND:
   * GameConfig.validate() does NOT check that trialsCount > nLevel.
   * This could lead to invalid sessions where there aren't enough trials
   * to have any N-back targets.
   *
   * For N-back, you need at least nLevel + 1 trials to have any possible target.
   * Example: For N=2, trials 0 and 1 are buffer (no targets possible),
   * so you need at least 3 trials for any actual gameplay.
   */

  it('DOCUMENT: GameConfig allows trialsCount < nLevel (potential bug)', () => {
    // This test documents that the current implementation allows this
    // This may or may not be intentional - check if sessions handle this gracefully
    fc.assert(
      fc.property(arbValidNLevel, (nLevel) => {
        // trialsCount = 1 < nLevel (for any nLevel > 1)
        if (nLevel > 1) {
          const config = new GameConfig({ nLevel, trialsCount: 1 });
          // Currently this is allowed - document this behavior
          return config.trialsCount === 1 && config.nLevel === nLevel;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('all mode specs have trialsCount >= nLevel', () => {
    // Verify that all specs are properly configured
    // Puzzle modes (2048, sudoku) have trialsCount = nLevel = 1 which is valid
    for (const spec of Object.values(AllSpecs)) {
      expect(spec.defaults.trialsCount).toBeGreaterThanOrEqual(spec.defaults.nLevel);
    }
  });

  it('trialsCount = nLevel is technically allowed but problematic', () => {
    // Document edge case: N=2, trials=2 means no actual gameplay
    const config = new GameConfig({ nLevel: 2, trialsCount: 2 });
    expect(config.nLevel).toBe(2);
    expect(config.trialsCount).toBe(2);
    // This creates a session where all trials are buffer trials!
  });
});

// =============================================================================
// 4. N-LEVEL EDGE CASES
// =============================================================================

describe('Edge Case: nLevel Validation', () => {
  it('rejects nLevel = 0', () => {
    expect(() => new GameConfig({ nLevel: 0 })).toThrow('Invalid nLevel');
  });

  it('rejects negative nLevel', () => {
    fc.assert(
      fc.property(arbInvalidNLevel, (nLevel) => {
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
      fc.property(arbNonIntegerNLevel, (nLevel) => {
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

  it('accepts minimum valid nLevel = 1', () => {
    const config = new GameConfig({ nLevel: 1 });
    expect(config.nLevel).toBe(1);
  });

  it('accepts extremely high nLevel', () => {
    // N=100 is extreme but technically valid
    const config = new GameConfig({ nLevel: 100 });
    expect(config.nLevel).toBe(100);
  });
});

// =============================================================================
// 5. PROBABILITY EDGE CASES
// =============================================================================

describe('Edge Case: Probability Validation', () => {
  it('rejects negative targetProbability', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.0001, noNaN: true }), (targetProbability) => {
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

  it('rejects targetProbability > 1', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.0001, max: 100, noNaN: true }), (targetProbability) => {
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

  it('rejects negative lureProbability', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.0001, noNaN: true }), (lureProbability) => {
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

  it('rejects lureProbability > 1', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.0001, max: 100, noNaN: true }), (lureProbability) => {
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

  it('accepts boundary probabilities: 0 and 1', () => {
    // Test exact boundaries
    const configMin = new GameConfig({ targetProbability: 0, lureProbability: 0 });
    expect(configMin.targetProbability).toBe(0);
    expect(configMin.lureProbability).toBe(0);

    const configMax = new GameConfig({
      generator: 'Aleatoire', // Not BW to avoid combined > 1 constraint
      targetProbability: 1,
      lureProbability: 0,
    });
    expect(configMax.targetProbability).toBe(1);
  });

  it('BUG: NaN probability passes validation (should reject)', () => {
    /**
     * BUG FOUND: NaN probability is NOT rejected!
     *
     * The validation uses: `if (config.targetProbability < 0 || config.targetProbability > 1)`
     * But NaN comparisons always return false:
     *   - NaN < 0 === false
     *   - NaN > 1 === false
     * So the condition is false and validation passes!
     *
     * IMPACT: Invalid configs with NaN probabilities can be created,
     * which will cause issues in trial generation.
     *
     * FIX RECOMMENDATION: Use Number.isNaN() check or:
     *   if (!(config.targetProbability >= 0 && config.targetProbability <= 1))
     * The negated condition catches NaN because NaN >= 0 is false.
     */
    const config = new GameConfig({ targetProbability: Number.NaN });
    // This SHOULD throw but doesn't - documenting the bug
    expect(Number.isNaN(config.targetProbability)).toBe(true);
    // The above line would fail if the bug were fixed (which is good!)
  });

  it('handles Infinity probability', () => {
    expect(() => new GameConfig({ targetProbability: Number.POSITIVE_INFINITY })).toThrow(
      'Invalid targetProbability',
    );

    expect(() => new GameConfig({ targetProbability: Number.NEGATIVE_INFINITY })).toThrow(
      'Invalid targetProbability',
    );
  });
});

// =============================================================================
// 6. MISSING REQUIRED FIELDS (handled by defaults)
// =============================================================================

describe('Edge Case: Missing Required Fields', () => {
  it('empty config uses all defaults', () => {
    const config = new GameConfig({});
    expect(config.nLevel).toBe(DEFAULT_CONFIG.nLevel);
    expect(config.trialsCount).toBe(DEFAULT_CONFIG.trialsCount);
    expect(config.generator).toBe(DEFAULT_CONFIG.generator);
    expect(config.activeModalities.length).toBeGreaterThan(0);
  });

  it('BUG: explicit undefined values override defaults (should use defaults)', () => {
    /**
     * BUG FOUND: Explicit undefined values are NOT replaced by defaults!
     *
     * The merge uses: `{ ...DEFAULT_CONFIG, ...config }`
     * When config = { nLevel: undefined }, the spread sets nLevel to undefined
     * because the key exists in config (even though its value is undefined).
     *
     * Example:
     *   { ...{ nLevel: 2 }, ...{ nLevel: undefined } }
     *   Results in: { nLevel: undefined }
     *
     * IMPACT: If user passes { nLevel: undefined }, validation fails with
     * "Invalid nLevel: undefined" instead of using the default.
     *
     * FIX RECOMMENDATION: Filter undefined values before merge:
     *   const cleaned = Object.fromEntries(
     *     Object.entries(config).filter(([_, v]) => v !== undefined)
     *   );
     *   const merged = { ...DEFAULT_CONFIG, ...cleaned };
     */
    expect(() => new GameConfig({ nLevel: undefined } as Partial<BlockConfig>)).toThrow(
      'Invalid nLevel: undefined',
    );
    // The above documents the current (buggy) behavior
  });

  it('null modalities are NOT accepted (empty array throws)', () => {
    // Test that null/undefined doesn't silently become empty
    expect(() => new GameConfig({ activeModalities: [] })).toThrow(
      'activeModalities must be a non-empty array',
    );
  });
});

// =============================================================================
// 7. CONFIG MERGE WITH PARTIAL OVERRIDES
// =============================================================================

describe('Edge Case: Config Merge Behavior', () => {
  it('partial override preserves other defaults', () => {
    fc.assert(
      fc.property(arbValidNLevel, (nLevel) => {
        const config = new GameConfig({ nLevel });
        return (
          config.nLevel === nLevel &&
          config.trialsCount === DEFAULT_CONFIG.trialsCount &&
          config.generator === DEFAULT_CONFIG.generator &&
          config.targetProbability === DEFAULT_CONFIG.targetProbability
        );
      }),
      { numRuns: 50 },
    );
  });

  it('toDTO and back preserves all values', () => {
    fc.assert(
      fc.property(
        arbValidNLevel,
        arbValidTrialsCount,
        arbValidProbability,
        (nLevel, trialsCount, targetProbability) => {
          const original = new GameConfig({
            nLevel,
            trialsCount,
            targetProbability,
            lureProbability: 0, // Avoid BW constraint
            generator: 'Aleatoire',
          });

          const dto = original.toDTO();
          const recreated = new GameConfig(dto);

          return (
            recreated.nLevel === original.nLevel &&
            recreated.trialsCount === original.trialsCount &&
            recreated.targetProbability === original.targetProbability &&
            recreated.generator === original.generator
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('toDTO returns defensive copy of modalities', () => {
    const config = new GameConfig({ activeModalities: ['position', 'audio'] });
    const dto = config.toDTO();
    // @ts-expect-error test override
    dto.activeModalities.push('malicious');

    expect(config.activeModalities).toEqual(['position', 'audio']);
    expect(config.activeModalities).not.toContain('malicious');
  });

  it('constructor makes defensive copy of modalities', () => {
    const modalities = ['position', 'audio'];
    const config = new GameConfig({ activeModalities: modalities });
    modalities.push('malicious');

    expect(config.activeModalities).toEqual(['position', 'audio']);
    expect(config.activeModalities).not.toContain('malicious');
  });
});

// =============================================================================
// 8. INVALID MODALITY COMBINATIONS
// =============================================================================

describe('Edge Case: Invalid Modality Combinations', () => {
  it('rejects empty modalities array', () => {
    expect(() => new GameConfig({ activeModalities: [] })).toThrow(
      'activeModalities must be a non-empty array',
    );
  });

  it('accepts single modality', () => {
    const modalities = ['position', 'audio', 'color', 'image', 'arithmetic'];
    for (const modality of modalities) {
      const config = new GameConfig({ activeModalities: [modality] });
      expect(config.activeModalities).toEqual([modality]);
    }
  });

  it('accepts duplicate modalities (no validation against this)', () => {
    // Document behavior: duplicates are NOT rejected
    const config = new GameConfig({
      activeModalities: ['position', 'position', 'audio'],
    });
    expect(config.activeModalities).toEqual(['position', 'position', 'audio']);
    // Note: This might be intentional, but could cause issues downstream
  });

  it('accepts arbitrary strings as modalities', () => {
    // Document behavior: no validation of modality names
    const config = new GameConfig({
      activeModalities: ['invalid_modality', 'also_fake'],
    });
    expect(config.activeModalities.length).toBe(2);
    // Note: The UI/session layer needs to handle invalid modalities
  });
});

// =============================================================================
// 9. EXTREME TIMING VALUES
// =============================================================================

describe('Edge Case: Extreme Timing Values', () => {
  it('rejects intervalSeconds = 0', () => {
    expect(() => new GameConfig({ intervalSeconds: 0 })).toThrow('Invalid intervalSeconds');
  });

  it('rejects negative intervalSeconds', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.001, noNaN: true }), (intervalSeconds) => {
        try {
          new GameConfig({ intervalSeconds });
          return false;
        } catch (e) {
          return (e as Error).message.includes('Invalid intervalSeconds');
        }
      }),
      { numRuns: 50 },
    );
  });

  it('rejects stimulusDurationSeconds = 0', () => {
    expect(
      () =>
        new GameConfig({
          stimulusDurationSeconds: 0,
          intervalSeconds: 3,
        }),
    ).toThrow('Invalid stimulusDurationSeconds');
  });

  it('rejects negative stimulusDurationSeconds', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.001, noNaN: true }), (stimulusDurationSeconds) => {
        try {
          new GameConfig({ stimulusDurationSeconds, intervalSeconds: 3 });
          return false;
        } catch (e) {
          return (e as Error).message.includes('Invalid stimulusDurationSeconds');
        }
      }),
      { numRuns: 50 },
    );
  });

  it('non-BW rejects stimulusDurationSeconds >= intervalSeconds', () => {
    fc.assert(
      fc.property(arbValidIntervalSeconds, (interval) => {
        try {
          new GameConfig({
            generator: 'DualnbackClassic', // Non-BW
            intervalSeconds: interval,
            stimulusDurationSeconds: interval, // Equal (should fail for non-BW)
          });
          return false;
        } catch (e) {
          return (e as Error).message.includes('Stimulus duration');
        }
      }),
      { numRuns: 50 },
    );
  });

  it('BrainWorkshop allows stimulusDurationSeconds = intervalSeconds', () => {
    // BW has continuous display (no gap)
    const config = new GameConfig({
      generator: 'BrainWorkshop',
      intervalSeconds: 3,
      stimulusDurationSeconds: 3,
      targetProbability: 0.25,
      lureProbability: 0.25,
    });
    expect(config.stimulusDurationSeconds).toBe(3);
    expect(config.intervalSeconds).toBe(3);
  });

  it('accepts very large interval values', () => {
    const config = new GameConfig({
      intervalSeconds: 999999,
      stimulusDurationSeconds: 1,
    });
    expect(config.intervalSeconds).toBe(999999);
  });

  it('minimum interval is VALIDATION_MIN_INTERVAL_SECONDS', () => {
    // Just below minimum
    expect(
      () => new GameConfig({ intervalSeconds: VALIDATION_MIN_INTERVAL_SECONDS - 0.01 }),
    ).toThrow('Invalid intervalSeconds');

    // Exactly at minimum
    const config = new GameConfig({
      intervalSeconds: VALIDATION_MIN_INTERVAL_SECONDS,
      stimulusDurationSeconds: VALIDATION_MIN_INTERVAL_SECONDS / 2,
    });
    expect(config.intervalSeconds).toBe(VALIDATION_MIN_INTERVAL_SECONDS);
  });
});

// =============================================================================
// 10. SPEC VALIDATION WITH MALFORMED INPUT
// =============================================================================

describe('Edge Case: Spec Validation (Zod)', () => {
  it('rejects spec with empty metadata.id', () => {
    const malformed = {
      ...AllSpecs['dual-catch'],
      metadata: { ...AllSpecs['dual-catch'].metadata, id: '' },
    };
    const result = safeValidateModeSpec(malformed);
    expect(result.success).toBe(false);
  });

  it('rejects spec with invalid difficultyLevel', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: -100, max: 0 }), fc.integer({ min: 6, max: 100 })),
        (difficultyLevel) => {
          const malformed = {
            ...AllSpecs['dual-catch'],
            metadata: {
              ...AllSpecs['dual-catch'].metadata,
              difficultyLevel,
            },
          };
          const result = safeValidateModeSpec(malformed);
          return !result.success;
        },
      ),
      { numRuns: 20 },
    );
  });

  it('rejects spec with negative timing values', () => {
    const malformed = {
      ...AllSpecs['dual-catch'],
      timing: {
        ...AllSpecs['dual-catch'].timing,
        stimulusDurationMs: -100,
      },
    };
    const result = safeValidateModeSpec(malformed);
    expect(result.success).toBe(false);
  });

  it('rejects spec with invalid version format', () => {
    const invalidVersions = ['1.0', '1', 'v1.0.0', '1.0.0.0', 'abc'];
    for (const version of invalidVersions) {
      const malformed = {
        ...AllSpecs['dual-catch'],
        metadata: { ...AllSpecs['dual-catch'].metadata, version },
      };
      const result = safeValidateModeSpec(malformed);
      expect(result.success).toBe(false);
    }
  });

  it('rejects spec with probability out of range', () => {
    const malformed = {
      ...AllSpecs['dual-catch'],
      generation: {
        ...AllSpecs['dual-catch'].generation,
        targetProbability: 1.5,
      },
    };
    const result = safeValidateModeSpec(malformed);
    expect(result.success).toBe(false);
  });

  it('accepts all real specs from AllSpecs registry', () => {
    for (const [id, spec] of Object.entries(AllSpecs)) {
      const result = safeValidateModeSpec(spec);
      if (!result.success) {
        console.error(`Spec ${id} failed validation:`, result.error.format());
      }
      expect(result.success).toBe(true);
    }
  });
});

// =============================================================================
// 11. CROSS-SPEC REFERENCE INTEGRITY
// =============================================================================

describe('Edge Case: Cross-Spec Reference Integrity', () => {
  it('all spec IDs match their registry keys', () => {
    for (const [key, spec] of Object.entries(AllSpecs)) {
      expect(spec.metadata.id).toBe(key);
    }
  });

  it('all spec scoring strategies are valid', () => {
    const validStrategies = ['sdt', 'dualnback-classic', 'brainworkshop', 'accuracy'];
    for (const spec of Object.values(AllSpecs)) {
      expect(validStrategies).toContain(spec.scoring.strategy);
    }
  });

  it('all spec generators are valid', () => {
    const validGenerators = ['Sequence', 'DualnbackClassic', 'BrainWorkshop', 'Aleatoire'];
    for (const spec of Object.values(AllSpecs)) {
      expect(validGenerators).toContain(spec.generation.generator);
    }
  });

  it('all spec session types are valid', () => {
    const validSessionTypes = [
      'GameSession',
      'PlaceSession',
      'MemoSession',
      'DualPickSession',
      'TraceSession',
    ];
    for (const spec of Object.values(AllSpecs)) {
      expect(validSessionTypes).toContain(spec.sessionType);
    }
  });

  it('specs with SDT scoring have appropriate threshold range', () => {
    for (const spec of Object.values(AllSpecs)) {
      if (spec.scoring.strategy === 'sdt') {
        expect(spec.scoring.passThreshold).toBeGreaterThanOrEqual(VALID_DPRIME_MIN);
        expect(spec.scoring.passThreshold).toBeLessThanOrEqual(VALID_DPRIME_MAX);
      }
    }
  });

  it('specs with accuracy scoring have threshold in [0, 1]', () => {
    for (const spec of Object.values(AllSpecs)) {
      if (spec.scoring.strategy === 'accuracy') {
        expect(spec.scoring.passThreshold).toBeGreaterThanOrEqual(VALID_ACCURACY_MIN);
        expect(spec.scoring.passThreshold).toBeLessThanOrEqual(VALID_ACCURACY_MAX);
      }
    }
  });

  it('all specs have non-empty report sections', () => {
    for (const spec of Object.values(AllSpecs)) {
      expect(spec.report.sections.length).toBeGreaterThan(0);
    }
  });

  it('all specs start with HERO section', () => {
    for (const spec of Object.values(AllSpecs)) {
      expect(spec.report.sections[0]).toBe('HERO');
    }
  });
});

// =============================================================================
// 12. GENERATOR-SPECIFIC EDGE CASES
// =============================================================================

describe('Edge Case: Generator-Specific Validation', () => {
  it('BrainWorkshop-specific probability constraints', () => {
    // BW has combined probability constraint
    const validBWConfigs = [
      { target: 0.125, lure: 0.125 }, // BW defaults
      { target: 0, lure: 0 },
      { target: 1, lure: 0 },
      { target: 0, lure: 1 },
      { target: 0.5, lure: 0.5 },
    ];

    for (const { target, lure } of validBWConfigs) {
      const config = new GameConfig({
        generator: 'BrainWorkshop',
        targetProbability: target,
        lureProbability: lure,
      });
      expect(config.targetProbability + config.lureProbability).toBeLessThanOrEqual(1);
    }
  });

  it('Jaeggi (DualnbackClassic) ignores probability constraints', () => {
    // Jaeggi uses fixed distribution, not probability-based
    const config = new GameConfig({
      generator: 'DualnbackClassic',
      targetProbability: 0.9,
      lureProbability: 0.9,
    });
    // Should accept (Jaeggi ignores these)
    expect(config.targetProbability).toBe(0.9);
    expect(config.lureProbability).toBe(0.9);
  });

  it('Sequence generator accepts all valid probabilities', () => {
    fc.assert(
      fc.property(arbValidProbability, arbValidProbability, (target, lure) => {
        const config = new GameConfig({
          generator: 'Sequence',
          targetProbability: target,
          lureProbability: lure,
        });
        return config.targetProbability === target && config.lureProbability === lure;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 13. INVARIANT PROPERTIES (Always True)
// =============================================================================

describe('Invariants: Properties That Must Always Hold', () => {
  it('valid config always has nLevel >= 1', () => {
    fc.assert(
      fc.property(arbValidNLevel, (nLevel) => {
        const config = new GameConfig({ nLevel });
        return config.nLevel >= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('valid config always has trialsCount >= 1', () => {
    fc.assert(
      fc.property(arbValidTrialsCount, (trialsCount) => {
        const config = new GameConfig({ trialsCount });
        return config.trialsCount >= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('valid config always has probabilities in [0, 1]', () => {
    fc.assert(
      fc.property(arbValidProbability, arbValidProbability, (target, lure) => {
        const config = new GameConfig({
          generator: 'Aleatoire',
          targetProbability: target,
          lureProbability: lure,
        });
        return (
          config.targetProbability >= 0 &&
          config.targetProbability <= 1 &&
          config.lureProbability >= 0 &&
          config.lureProbability <= 1
        );
      }),
      { numRuns: 100 },
    );
  });

  it('valid config always has non-empty modalities', () => {
    fc.assert(
      fc.property(arbValidModalities, (activeModalities) => {
        const config = new GameConfig({ activeModalities });
        return config.activeModalities.length > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('valid config always has intervalSeconds >= VALIDATION_MIN_INTERVAL_SECONDS', () => {
    fc.assert(
      fc.property(arbValidIntervalSeconds, (intervalSeconds) => {
        const config = new GameConfig({
          intervalSeconds,
          stimulusDurationSeconds: intervalSeconds / 2,
        });
        return config.intervalSeconds >= VALIDATION_MIN_INTERVAL_SECONDS;
      }),
      { numRuns: 100 },
    );
  });

  it('valid config always has stimulusDurationSeconds > 0', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 2, noNaN: true }), (stimulusDurationSeconds) => {
        const config = new GameConfig({
          stimulusDurationSeconds,
          intervalSeconds: 3,
        });
        return config.stimulusDurationSeconds > 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 14. IDEMPOTENCY AND DETERMINISM
// =============================================================================

describe('Invariants: Idempotency and Determinism', () => {
  it('creating config twice with same input yields identical results', () => {
    fc.assert(
      fc.property(arbValidNLevel, arbValidTrialsCount, (nLevel, trialsCount) => {
        const config1 = new GameConfig({ nLevel, trialsCount });
        const config2 = new GameConfig({ nLevel, trialsCount });

        return (
          config1.nLevel === config2.nLevel &&
          config1.trialsCount === config2.trialsCount &&
          config1.generator === config2.generator &&
          config1.targetProbability === config2.targetProbability
        );
      }),
      { numRuns: 50 },
    );
  });

  it('GameConfig.from() is equivalent to constructor', () => {
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

  it('toDTO().toDTO() round-trip is stable', () => {
    fc.assert(
      fc.property(
        arbValidNLevel,
        arbValidTrialsCount,
        arbGeneratorName,
        (nLevel, trialsCount, generator) => {
          // Skip BW if probabilities would violate constraint
          const original = new GameConfig({
            nLevel,
            trialsCount,
            generator: generator === 'BrainWorkshop' ? 'Aleatoire' : generator,
          });

          const dto1 = original.toDTO();
          const recreated = new GameConfig(dto1);
          const dto2 = recreated.toDTO();

          return (
            dto1.nLevel === dto2.nLevel &&
            dto1.trialsCount === dto2.trialsCount &&
            dto1.generator === dto2.generator &&
            dto1.targetProbability === dto2.targetProbability
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SUMMARY: BUGS FOUND AND EDGE CASES DOCUMENTED
// =============================================================================

/**
 * ============================================================================
 * BUGS FOUND BY PROPERTY-BASED TESTING
 * ============================================================================
 *
 * BUG 1: NaN Probability Passes Validation (CRITICAL)
 * -----------------------------------------------
 * Location: GameConfig.validate() line 56-60
 * Code:     `if (config.targetProbability < 0 || config.targetProbability > 1)`
 * Problem:  NaN comparisons always return false:
 *           - NaN < 0 === false
 *           - NaN > 1 === false
 *           So the condition is false and NaN passes validation!
 * Impact:   Invalid configs with NaN probabilities can be created,
 *           causing undefined behavior in trial generation.
 * Fix:      Change to: `if (!(config.targetProbability >= 0 && config.targetProbability <= 1))`
 *           Or add:    `|| Number.isNaN(config.targetProbability)`
 *
 * BUG 2: Explicit undefined Values Override Defaults (MEDIUM)
 * -----------------------------------------------------------
 * Location: GameConfig constructor line 24
 * Code:     `const merged = { ...DEFAULT_CONFIG, ...config };`
 * Problem:  When config = { nLevel: undefined }, the spread sets nLevel to undefined
 *           because the key exists (even with undefined value).
 * Impact:   Passing { nLevel: undefined } throws "Invalid nLevel: undefined"
 *           instead of using the default value.
 * Fix:      Filter undefined values before merge:
 *           ```
 *           const cleaned = Object.fromEntries(
 *             Object.entries(config).filter(([_, v]) => v !== undefined)
 *           );
 *           const merged = { ...DEFAULT_CONFIG, ...cleaned };
 *           ```
 *
 * BUG 3: trialsCount < nLevel is Allowed (MEDIUM)
 * -----------------------------------------------
 * Location: GameConfig.validate()
 * Problem:  No validation that trialsCount > nLevel
 * Impact:   Creates sessions where ALL trials are buffer trials (no gameplay)
 *           Example: nLevel=5, trialsCount=3 means 0 scoreable trials
 * Fix:      Add: `if (config.trialsCount <= config.nLevel) throw new Error(...)`
 *
 * BUG 4: Duplicate Modalities Allowed (LOW)
 * -----------------------------------------
 * Location: GameConfig.validate()
 * Problem:  ['position', 'position', 'audio'] is accepted
 * Impact:   May cause double-counting in scoring or UI issues
 * Fix:      Consider validating unique modalities:
 *           `if (new Set(config.activeModalities).size !== config.activeModalities.length)`
 *
 * BUG 5: Arbitrary Modality Names Allowed (LOW)
 * ---------------------------------------------
 * Location: GameConfig.validate()
 * Problem:  ['fake_modality', 'also_invalid'] is accepted
 * Impact:   Invalid modalities pass through silently
 * Fix:      Consider validating against KNOWN_MODALITIES constant
 *
 * ============================================================================
 * EDGE CASES DOCUMENTED (Working As Designed)
 * ============================================================================
 *
 * 1. Infinity probabilities are rejected (correct - uses < and > comparisons)
 * 2. Floating point precision at probability boundaries (handled correctly)
 * 3. BW allows stimulus = interval (continuous display mode)
 * 4. Non-BW rejects stimulus >= interval (requires gap)
 * 5. Non-BW allows target + lure > 1 (targets and lures are INDEPENDENT)
 * 6. Jaeggi ignores probabilities (uses fixed distribution)
 *
 * ============================================================================
 * ALL SPECS IN AllSpecs REGISTRY PASS ZOD VALIDATION
 * ============================================================================
 */
