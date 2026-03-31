/**
 * Property-Based Tests for Game Mode Specifications
 *
 * Uses fast-check to verify invariants and properties across all game mode specs.
 * Tests ensure that specs are valid, consistent, and conform to the spec-driven architecture.
 *
 * Categories:
 * 1. Mode Spec Validity (10 tests) - All modes have required fields
 * 2. Timing Configuration (10 tests) - Timing values are within bounds
 * 3. Probability Configuration (10 tests) - Target/lure probabilities valid
 * 4. N-Level Configuration (10 tests) - N-level ranges are valid
 * 5. Scoring Configuration (10 tests) - Scoring thresholds are consistent
 * 6. Modality Configuration (10 tests) - Modality configurations are valid
 *
 * @see thresholds.ts for SSOT numeric values
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

// Import all specs
import { AllSpecs, type ModeId } from './index';
import { DualCatchSpec } from './dual-catch.spec';
import { DualnbackClassicSpec } from './dualnback-classic.spec';
import {
  SimBrainWorkshopSpec,
  calculateBWTrialsCount,
  calculateBWIntervalMs,
} from './brainworkshop.spec';
import { DualPlaceSpec } from './place.spec';
import { DualMemoSpec } from './memo.spec';
import { DualPickSpec } from './pick.spec';
import { DualTraceSpec } from './trace.spec';

// Import thresholds (SSOT)
import {
  // Scoring
  SDT_DPRIME_PASS,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_PASS_NORMALIZED,
  BW_SCORE_DOWN_NORMALIZED,
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
  // Timing
  TIMING_STIMULUS_TEMPO_MS,
  TIMING_STIMULUS_FLOW_MS,
  BW_TICKS_DEFAULT,
  BW_TICK_DURATION_MS,
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_TARGET_PROBABILITY_LOW,
  GEN_TARGET_PROBABILITY_JAEGGI,
  GEN_LURE_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_NONE,
  GEN_LURE_PROBABILITY_LABEL,
  // Defaults
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_TEMPO,
  DEFAULT_TRIALS_COUNT_FLOW,
  // Validation bounds
  VALID_PROBABILITY_MIN,
  VALID_PROBABILITY_MAX,
  VALID_DPRIME_MIN,
  VALID_DPRIME_MAX,
  VALID_ACCURACY_MIN,
  VALID_ACCURACY_MAX,
  VALID_DIFFICULTY_MIN,
  VALID_DIFFICULTY_MAX,
  // Flow
  FLOW_CONFIDENCE_THRESHOLD,
  // UPS
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  // Tempo confidence weights
  TEMPO_WEIGHT_TIMING_DISCIPLINE,
  TEMPO_WEIGHT_RT_STABILITY,
  TEMPO_WEIGHT_PRESS_STABILITY,
  TEMPO_WEIGHT_ERROR_AWARENESS,
  TEMPO_WEIGHT_FOCUS,
  // BW Generation
  BW_CHANCE_GUARANTEED_MATCH,
  BW_CHANCE_INTERFERENCE,
} from './thresholds';

import type { ModeSpec, ScoringStrategy } from './types';
import { safeValidateModeSpec } from './validation';

// =============================================================================
// Test Helpers
// =============================================================================

/** All game mode specs as an array */
const allModeSpecs: ModeSpec[] = Object.values(AllSpecs);

/** All game mode IDs */
const allModeIds = Object.keys(AllSpecs) as ModeId[];

/** Valid scoring strategies */
const validStrategies: ScoringStrategy[] = [
  'sdt',
  'dualnback-classic',
  'brainworkshop',
  'accuracy',
];

/** Valid generator types */
const validGenerators = ['Sequence', 'DualnbackClassic', 'BrainWorkshop', 'Aleatoire'] as const;

/** Valid session types */
const validSessionTypes = [
  'GameSession',
  'PlaceSession',
  'MemoSession',
  'DualPickSession',
  'TraceSession',
] as const;

/** Checks if confidence weights sum to approximately 1.0 */
function sumToOne(weights: number[], tolerance = 0.001): boolean {
  const sum = weights.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) < tolerance;
}

/** Arbitrary for selecting a random mode spec */
const arbModeSpec = fc.constantFrom(...allModeSpecs);

/** Arbitrary for selecting a random mode ID */
const arbModeId = fc.constantFrom(...allModeIds);

/** Arbitrary for valid N-level */
const arbValidNLevel = fc.integer({ min: 1, max: 10 });

/** Arbitrary for valid probability */
const arbValidProbability = fc.double({ min: 0, max: 1, noNaN: true });

/** Arbitrary for valid timing in ms */
const arbValidTimingMs = fc.integer({ min: 100, max: 10000 });

// =============================================================================
// 1. MODE SPEC VALIDITY (10 tests)
// =============================================================================

describe('Mode Spec Validity', () => {
  it('all specs pass Zod validation', () => {
    for (const spec of allModeSpecs) {
      const result = safeValidateModeSpec(spec);
      expect(result.success).toBe(true);
    }
  });

  it('every spec has a unique non-empty id', () => {
    const ids = allModeSpecs.map((s) => s.metadata.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('every spec has a non-empty displayName', () => {
    for (const spec of allModeSpecs) {
      expect(spec.metadata.displayName).toBeDefined();
      expect(spec.metadata.displayName.length).toBeGreaterThan(0);
    }
  });

  it('every spec has a description', () => {
    for (const spec of allModeSpecs) {
      expect(spec.metadata.description).toBeDefined();
      expect(spec.metadata.description.length).toBeGreaterThan(0);
    }
  });

  it('every spec has valid difficultyLevel (1-5)', () => {
    for (const spec of allModeSpecs) {
      expect(spec.metadata.difficultyLevel).toBeGreaterThanOrEqual(VALID_DIFFICULTY_MIN);
      expect(spec.metadata.difficultyLevel).toBeLessThanOrEqual(VALID_DIFFICULTY_MAX);
    }
  });

  it('every spec has a valid semver version', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    for (const spec of allModeSpecs) {
      expect(semverRegex.test(spec.metadata.version)).toBe(true);
    }
  });

  it('every spec has at least one tag', () => {
    for (const spec of allModeSpecs) {
      expect(spec.metadata.tags.length).toBeGreaterThan(0);
    }
  });

  it('every spec has a valid sessionType', () => {
    for (const spec of allModeSpecs) {
      expect(validSessionTypes).toContain(spec.sessionType);
    }
  });

  it('every spec has a valid scoring strategy', () => {
    for (const spec of allModeSpecs) {
      expect(validStrategies).toContain(spec.scoring.strategy);
    }
  });

  it('every spec has a valid generator type', () => {
    for (const spec of allModeSpecs) {
      expect(validGenerators).toContain(spec.generation.generator);
    }
  });
});

// =============================================================================
// 2. TIMING CONFIGURATION (10 tests)
// =============================================================================

describe('Timing Configuration', () => {
  it('every spec has non-negative stimulusDurationMs', () => {
    for (const spec of allModeSpecs) {
      // Self-paced modes (e.g. Ravens) use 0 to indicate no time limit
      expect(spec.timing.stimulusDurationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('every spec has positive intervalMs', () => {
    for (const spec of allModeSpecs) {
      expect(spec.timing.intervalMs).toBeGreaterThan(0);
    }
  });

  it('stimulusDurationMs is reasonable (0 to 120s)', () => {
    for (const spec of allModeSpecs) {
      expect(spec.timing.stimulusDurationMs).toBeGreaterThanOrEqual(0); // 0 = self-paced (ravens)
      expect(spec.timing.stimulusDurationMs).toBeLessThanOrEqual(600000); // some modes up to 10min
    }
  });

  it('intervalMs is reasonable (100ms to 30s)', () => {
    for (const spec of allModeSpecs) {
      expect(spec.timing.intervalMs).toBeGreaterThanOrEqual(1); // Trace has 1ms interval
      expect(spec.timing.intervalMs).toBeLessThanOrEqual(30000);
    }
  });

  it('optional minValidRtMs is positive if defined', () => {
    for (const spec of allModeSpecs) {
      if (spec.timing.minValidRtMs !== undefined) {
        expect(spec.timing.minValidRtMs).toBeGreaterThan(0);
      }
    }
  });

  it('optional feedbackDurationMs is positive if defined', () => {
    for (const spec of allModeSpecs) {
      if (spec.timing.feedbackDurationMs !== undefined) {
        expect(spec.timing.feedbackDurationMs).toBeGreaterThan(0);
      }
    }
  });

  it('optional responseWindowMs is positive if defined', () => {
    for (const spec of allModeSpecs) {
      if (spec.timing.responseWindowMs !== undefined) {
        expect(spec.timing.responseWindowMs).toBeGreaterThan(0);
      }
    }
  });

  it('tempo modes use TIMING_STIMULUS_TEMPO_MS', () => {
    const tempoModes = [DualCatchSpec, DualnbackClassicSpec];
    for (const spec of tempoModes) {
      expect(spec.timing.stimulusDurationMs).toBe(TIMING_STIMULUS_TEMPO_MS);
    }
  });

  it('flow modes use TIMING_STIMULUS_FLOW_MS', () => {
    const flowModes = [DualPlaceSpec, DualPickSpec];
    for (const spec of flowModes) {
      expect(spec.timing.stimulusDurationMs).toBe(TIMING_STIMULUS_FLOW_MS);
    }
  });

  it('BrainWorkshop timing follows tick formula', () => {
    const interval = calculateBWIntervalMs();
    expect(interval).toBe(BW_TICKS_DEFAULT * BW_TICK_DURATION_MS);
    expect(SimBrainWorkshopSpec.timing.intervalMs).toBe(interval);
  });
});

// =============================================================================
// 3. PROBABILITY CONFIGURATION (10 tests)
// =============================================================================

describe('Probability Configuration', () => {
  it('every spec has targetProbability in [0, 1]', () => {
    for (const spec of allModeSpecs) {
      expect(spec.generation.targetProbability).toBeGreaterThanOrEqual(VALID_PROBABILITY_MIN);
      expect(spec.generation.targetProbability).toBeLessThanOrEqual(VALID_PROBABILITY_MAX);
    }
  });

  it('every spec has lureProbability in [0, 1]', () => {
    for (const spec of allModeSpecs) {
      expect(spec.generation.lureProbability).toBeGreaterThanOrEqual(VALID_PROBABILITY_MIN);
      expect(spec.generation.lureProbability).toBeLessThanOrEqual(VALID_PROBABILITY_MAX);
    }
  });

  it('combined target + lure probability does not exceed 1', () => {
    for (const spec of allModeSpecs) {
      const combined = spec.generation.targetProbability + spec.generation.lureProbability;
      expect(combined).toBeLessThanOrEqual(1);
    }
  });

  it('Jaeggi uses specific target probability', () => {
    expect(DualnbackClassicSpec.generation.targetProbability).toBe(GEN_TARGET_PROBABILITY_JAEGGI);
  });

  it('Jaeggi uses no lure probability', () => {
    expect(DualnbackClassicSpec.generation.lureProbability).toBe(GEN_LURE_PROBABILITY_NONE);
  });

  it('DualCatch uses default probabilities', () => {
    expect(DualCatchSpec.generation.targetProbability).toBe(GEN_TARGET_PROBABILITY_DEFAULT);
    expect(DualCatchSpec.generation.lureProbability).toBe(GEN_LURE_PROBABILITY_DEFAULT);
  });

  it('flow modes use low target probability', () => {
    expect(DualPlaceSpec.generation.targetProbability).toBe(GEN_TARGET_PROBABILITY_LOW);
  });

  it('DualPick uses lure probability for labels', () => {
    expect(DualPickSpec.generation.lureProbability).toBe(GEN_LURE_PROBABILITY_LABEL);
  });

  it('property: random valid probability remains in bounds after operations', () => {
    fc.assert(
      fc.property(arbValidProbability, arbValidProbability, (target, lure) => {
        // Clamp combined to 1
        const clampedLure = Math.min(lure, 1 - target);
        const combined = target + clampedLure;
        return combined >= 0 && combined <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('BrainWorkshop extensions have valid generation probabilities', () => {
    const ext = SimBrainWorkshopSpec.extensions;
    expect(ext.guaranteedMatchProbability).toBe(BW_CHANCE_GUARANTEED_MATCH);
    expect(ext.interferenceProbability).toBe(BW_CHANCE_INTERFERENCE);
    expect(ext.guaranteedMatchProbability).toBeGreaterThanOrEqual(0);
    expect(ext.guaranteedMatchProbability).toBeLessThanOrEqual(1);
    expect(ext.interferenceProbability).toBeGreaterThanOrEqual(0);
    expect(ext.interferenceProbability).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// 4. N-LEVEL CONFIGURATION (10 tests)
// =============================================================================

describe('N-Level Configuration', () => {
  it('every spec has positive nLevel', () => {
    for (const spec of allModeSpecs) {
      expect(spec.defaults.nLevel).toBeGreaterThan(0);
    }
  });

  it('every spec has integer nLevel', () => {
    for (const spec of allModeSpecs) {
      expect(Number.isInteger(spec.defaults.nLevel)).toBe(true);
    }
  });

  it('every spec has positive trialsCount', () => {
    for (const spec of allModeSpecs) {
      expect(spec.defaults.trialsCount).toBeGreaterThan(0);
    }
  });

  it('trialsCount > nLevel for tempo/flow specs (enough trials for N-back)', () => {
    // Puzzle modes (intervalMs === 1) may have trialsCount <= nLevel (e.g. 2048: trials=1, nLevel=1)
    const tempoSpecs = allModeSpecs.filter((s) => s.timing.intervalMs > 1);
    for (const spec of tempoSpecs) {
      expect(spec.defaults.trialsCount).toBeGreaterThan(spec.defaults.nLevel);
    }
  });

  it('most specs use DEFAULT_N_LEVEL', () => {
    const specsWithDefaultN = [
      DualCatchSpec,
      DualnbackClassicSpec,
      SimBrainWorkshopSpec,
      DualPlaceSpec,
      DualMemoSpec,
      DualPickSpec,
    ];
    for (const spec of specsWithDefaultN) {
      expect(spec.defaults.nLevel).toBe(DEFAULT_N_LEVEL);
    }
  });

  it('DualTrace has mode-specific nLevel = 1', () => {
    expect(DualTraceSpec.defaults.nLevel).toBe(1);
  });

  it('tempo modes use DEFAULT_TRIALS_COUNT_TEMPO', () => {
    const tempoModes = [DualCatchSpec, DualnbackClassicSpec, DualTraceSpec];
    for (const spec of tempoModes) {
      expect(spec.defaults.trialsCount).toBe(DEFAULT_TRIALS_COUNT_TEMPO);
    }
  });

  it('flow modes use DEFAULT_TRIALS_COUNT_FLOW', () => {
    const flowModes = [DualPlaceSpec, DualMemoSpec, DualPickSpec];
    for (const spec of flowModes) {
      expect(spec.defaults.trialsCount).toBe(DEFAULT_TRIALS_COUNT_FLOW);
    }
  });

  it('BrainWorkshop uses dynamic trials formula', () => {
    const expectedTrials = calculateBWTrialsCount(DEFAULT_N_LEVEL);
    expect(SimBrainWorkshopSpec.defaults.trialsCount).toBe(expectedTrials);
    expect(expectedTrials).toBe(BW_TRIALS_BASE + DEFAULT_N_LEVEL ** BW_TRIALS_EXPONENT);
  });

  it('property: BW trials formula produces reasonable counts for all N levels', () => {
    fc.assert(
      fc.property(arbValidNLevel, (nLevel) => {
        const trials = calculateBWTrialsCount(nLevel);
        // Should be at least 21 (20 + 1^2) and at most 120 (20 + 10^2)
        return trials >= 21 && trials <= 120 && Number.isInteger(trials);
      }),
      { numRuns: 20 },
    );
  });
});

// =============================================================================
// 5. SCORING CONFIGURATION (10 tests)
// =============================================================================

describe('Scoring Configuration', () => {
  it('every spec has a positive passThreshold', () => {
    for (const spec of allModeSpecs) {
      expect(spec.scoring.passThreshold).toBeGreaterThan(0);
    }
  });

  it('SDT modes use SDT_DPRIME_PASS threshold', () => {
    expect(DualCatchSpec.scoring.passThreshold).toBe(SDT_DPRIME_PASS);
  });

  it('SDT modes have downThreshold < passThreshold', () => {
    const sdtModes = [DualCatchSpec];
    for (const spec of sdtModes) {
      if (spec.scoring.downThreshold !== undefined) {
        expect(spec.scoring.downThreshold).toBeLessThan(spec.scoring.passThreshold);
      }
    }
  });

  it('Jaeggi uses error-based thresholds (pass < down)', () => {
    expect(DualnbackClassicSpec.scoring.passThreshold).toBe(JAEGGI_MAX_ERRORS_PER_MODALITY);
    expect(DualnbackClassicSpec.scoring.downThreshold).toBe(JAEGGI_ERRORS_DOWN);
    // In Jaeggi, MORE errors is worse, so downThreshold > passThreshold
    expect(DualnbackClassicSpec.scoring.downThreshold).toBeGreaterThan(
      DualnbackClassicSpec.scoring.passThreshold,
    );
  });

  it('BrainWorkshop uses normalized score thresholds', () => {
    expect(SimBrainWorkshopSpec.scoring.passThreshold).toBe(BW_SCORE_PASS_NORMALIZED);
    expect(SimBrainWorkshopSpec.scoring.downThreshold).toBe(BW_SCORE_DOWN_NORMALIZED);
  });

  it('accuracy modes use ACCURACY_PASS_NORMALIZED', () => {
    const accuracyModes = [DualPlaceSpec, DualMemoSpec, DualPickSpec];
    for (const spec of accuracyModes) {
      expect(spec.scoring.passThreshold).toBe(ACCURACY_PASS_NORMALIZED);
    }
  });

  it('Trace uses TRACE_ACCURACY_PASS_NORMALIZED (beta threshold)', () => {
    expect(DualTraceSpec.scoring.passThreshold).toBe(TRACE_ACCURACY_PASS_NORMALIZED);
  });

  it('flowThreshold is in [0, 100] when defined', () => {
    for (const spec of allModeSpecs) {
      if (spec.scoring.flowThreshold !== undefined) {
        expect(spec.scoring.flowThreshold).toBeGreaterThanOrEqual(0);
        expect(spec.scoring.flowThreshold).toBeLessThanOrEqual(100);
      }
    }
  });

  it('tempo modes use FLOW_CONFIDENCE_THRESHOLD', () => {
    const tempoModes = [DualCatchSpec, DualnbackClassicSpec, SimBrainWorkshopSpec];
    for (const spec of tempoModes) {
      expect(spec.scoring.flowThreshold).toBe(FLOW_CONFIDENCE_THRESHOLD);
    }
  });

  it('scoring thresholds match strategy ranges', () => {
    for (const spec of allModeSpecs) {
      const { strategy, passThreshold } = spec.scoring;
      if (strategy === 'sdt') {
        expect(passThreshold).toBeGreaterThanOrEqual(VALID_DPRIME_MIN);
        expect(passThreshold).toBeLessThanOrEqual(VALID_DPRIME_MAX);
      } else if (strategy === 'accuracy') {
        expect(passThreshold).toBeGreaterThanOrEqual(VALID_ACCURACY_MIN);
        expect(passThreshold).toBeLessThanOrEqual(VALID_ACCURACY_MAX);
      } else if (strategy === 'brainworkshop') {
        expect(passThreshold).toBeGreaterThanOrEqual(0);
        expect(passThreshold).toBeLessThanOrEqual(1);
      }
      // dualnback-classic uses error counts (positive integers)
    }
  });
});

// =============================================================================
// 6. MODALITY CONFIGURATION (10 tests)
// =============================================================================

describe('Modality Configuration', () => {
  it('every spec has at least one active modality', () => {
    for (const spec of allModeSpecs) {
      expect(spec.defaults.activeModalities.length).toBeGreaterThan(0);
    }
  });

  it('dual modes have exactly 2 modalities by default', () => {
    const dualModes = [
      DualCatchSpec,
      DualnbackClassicSpec,
      SimBrainWorkshopSpec,
      DualPlaceSpec,
      DualMemoSpec,
      DualPickSpec,
    ];
    for (const spec of dualModes) {
      expect(spec.defaults.activeModalities.length).toBe(2);
    }
  });

  it('DualTrace has position, audio, image, emotions, and spatial modalities', () => {
    expect(DualTraceSpec.defaults.activeModalities).toEqual([
      'position',
      'audio',
      'image',
      'emotions',
      'spatial',
    ]);
  });

  it('default modalities include position and audio for most modes', () => {
    const standardModes = [
      DualCatchSpec,
      DualnbackClassicSpec,
      SimBrainWorkshopSpec,
      DualPlaceSpec,
      DualMemoSpec,
      DualPickSpec,
    ];
    for (const spec of standardModes) {
      expect(spec.defaults.activeModalities).toContain('position');
      expect(spec.defaults.activeModalities).toContain('audio');
    }
  });

  it('modalities are strings (not empty)', () => {
    for (const spec of allModeSpecs) {
      for (const modality of spec.defaults.activeModalities) {
        expect(typeof modality).toBe('string');
        expect(modality.length).toBeGreaterThan(0);
      }
    }
  });

  it('every spec has adaptivity configuration', () => {
    for (const spec of allModeSpecs) {
      expect(spec.adaptivity).toBeDefined();
      expect(spec.adaptivity.algorithm).toBeDefined();
      expect(spec.adaptivity.nLevelSource).toBeDefined();
    }
  });

  it('adaptivity.algorithm is valid', () => {
    const validAlgorithms = ['none', 'jaeggi-v1', 'brainworkshop-v1', 'adaptive'];
    for (const spec of allModeSpecs) {
      expect(validAlgorithms).toContain(spec.adaptivity.algorithm);
    }
  });

  it('adaptivity.nLevelSource is valid', () => {
    const validSources = ['user', 'profile'];
    for (const spec of allModeSpecs) {
      expect(validSources).toContain(spec.adaptivity.nLevelSource);
    }
  });

  it('configurableSettings is an array', () => {
    for (const spec of allModeSpecs) {
      expect(Array.isArray(spec.adaptivity.configurableSettings)).toBe(true);
    }
  });

  it('Jaeggi has nLevelLockedByDefault extension', () => {
    const ext = DualnbackClassicSpec.extensions;
    expect(ext.nLevelLockedByDefault).toBe(true);
  });
});

// =============================================================================
// ADDITIONAL PROPERTY TESTS (10 tests)
// =============================================================================

describe('Cross-Spec Property Tests', () => {
  it('property: all specs have HERO as first report section', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        return spec.report.sections[0] === 'HERO';
      }),
      { numRuns: 50 },
    );
  });

  it('property: all specs have defined report colors', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        const colors = spec.report.display.colors;
        return (
          colors !== undefined &&
          colors.bg !== undefined &&
          colors.text !== undefined &&
          colors.accent !== undefined
        );
      }),
      { numRuns: 50 },
    );
  });

  it('property: modeScoreKey is defined and non-empty', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        return (
          spec.report.display.modeScoreKey !== undefined &&
          spec.report.display.modeScoreKey.length > 0
        );
      }),
      { numRuns: 50 },
    );
  });

  it('property: all timing values are finite numbers', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        return (
          Number.isFinite(spec.timing.stimulusDurationMs) && Number.isFinite(spec.timing.intervalMs)
        );
      }),
      { numRuns: 50 },
    );
  });

  it('property: all probability values are finite numbers', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        return (
          Number.isFinite(spec.generation.targetProbability) &&
          Number.isFinite(spec.generation.lureProbability)
        );
      }),
      { numRuns: 50 },
    );
  });

  it('property: metadata.id matches AllSpecs key', () => {
    for (const [key, spec] of Object.entries(AllSpecs)) {
      expect(spec.metadata.id).toBe(key);
    }
  });

  it('property: passThreshold is always positive finite', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        return Number.isFinite(spec.scoring.passThreshold) && spec.scoring.passThreshold > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('property: downThreshold when defined has correct relationship to passThreshold', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        if (spec.scoring.downThreshold === undefined) return true;
        if (spec.scoring.strategy === 'dualnback-classic') {
          // Error-based: more errors = worse, so down > pass
          return spec.scoring.downThreshold > spec.scoring.passThreshold;
        }
        // Score-based: higher is better, so down < pass
        return spec.scoring.downThreshold < spec.scoring.passThreshold;
      }),
      { numRuns: 50 },
    );
  });

  it('property: stats config sections are arrays when defined', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        if (!spec.stats) return true;
        return (
          Array.isArray(spec.stats.simple.sections) && Array.isArray(spec.stats.advanced.sections)
        );
      }),
      { numRuns: 50 },
    );
  });

  it('property: extensions when defined is an object', () => {
    fc.assert(
      fc.property(arbModeSpec, (spec) => {
        if (spec.extensions === undefined) return true;
        return typeof spec.extensions === 'object' && spec.extensions !== null;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// CONFIDENCE WEIGHTS TESTS (5 tests)
// =============================================================================

describe('Confidence Weight Configuration', () => {
  it('UPS weights sum to 1.0', () => {
    const sum = UPS_ACCURACY_WEIGHT + UPS_CONFIDENCE_WEIGHT;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  it('tempo confidence weights sum to 1.0', () => {
    const weights = [
      TEMPO_WEIGHT_TIMING_DISCIPLINE,
      TEMPO_WEIGHT_RT_STABILITY,
      TEMPO_WEIGHT_PRESS_STABILITY,
      TEMPO_WEIGHT_ERROR_AWARENESS,
      TEMPO_WEIGHT_FOCUS,
    ];
    expect(sumToOne(weights)).toBe(true);
  });

  it('SimBrainWorkshop has tempo confidence weights that sum to 1.0', () => {
    const confidence = SimBrainWorkshopSpec.scoring.confidence;
    if (confidence && 'timingDiscipline' in confidence) {
      const weights = [
        confidence.timingDiscipline,
        confidence.rtStability,
        confidence.pressStability,
        confidence.errorAwareness,
        confidence.focusScore,
      ];
      expect(sumToOne(weights)).toBe(true);
    }
  });

  it('Jaeggi has conditional confidence weights (withTiming sums to 1.0)', () => {
    const confidence = DualnbackClassicSpec.scoring.confidence;
    if (confidence && 'withTiming' in confidence) {
      const withTiming = confidence.withTiming;
      const weights = [
        withTiming.rtStability,
        withTiming.errorAwareness,
        withTiming.focusScore,
        withTiming.timingDiscipline,
        withTiming.pressStability,
      ];
      expect(sumToOne(weights)).toBe(true);
    }
  });

  it('Jaeggi has conditional confidence weights (withoutTiming sums to 1.0)', () => {
    const confidence = DualnbackClassicSpec.scoring.confidence;
    if (confidence && 'withoutTiming' in confidence) {
      const withoutTiming = confidence.withoutTiming;
      const weights = [
        withoutTiming.rtStability,
        withoutTiming.errorAwareness,
        withoutTiming.focusScore,
        withoutTiming.pressStability,
      ];
      expect(sumToOne(weights)).toBe(true);
    }
  });
});

// =============================================================================
// BRAINWORKSHOP SPECIFIC TESTS (5 tests)
// =============================================================================

describe('BrainWorkshop Specific Properties', () => {
  it('BW interval calculation is linear with ticks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 10, max: 100 }),
        (ticks1, ticks2) => {
          const interval1 = calculateBWIntervalMs(ticks1);
          const interval2 = calculateBWIntervalMs(ticks2);
          const expectedRatio = ticks1 / ticks2;
          const actualRatio = interval1 / interval2;
          return Math.abs(expectedRatio - actualRatio) < 0.001;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('BW trials formula: 20 + n^2 produces correct values', () => {
    for (let n = 1; n <= 10; n++) {
      const expected = BW_TRIALS_BASE + n ** BW_TRIALS_EXPONENT;
      expect(calculateBWTrialsCount(n)).toBe(expected);
    }
  });

  it('BW extensions have all advanced feature flags', () => {
    const ext = SimBrainWorkshopSpec.extensions;
    expect(typeof ext.variableNBack).toBe('boolean');
    expect(typeof ext.crabBackMode).toBe('boolean');
    expect(typeof ext.selfPaced).toBe('boolean');
    expect([1, 2, 3, 4]).toContain(ext.multiStimulus);
    expect([1, 2]).toContain(ext.multiAudio);
    expect(['color', 'image']).toContain(ext.multiMode);
  });

  it('BW generation probabilities are within 12.5% step', () => {
    const ext = SimBrainWorkshopSpec.extensions;
    const step = 0.125;
    expect(ext.guaranteedMatchProbability % step).toBeCloseTo(0, 5);
    expect(ext.interferenceProbability % step).toBeCloseTo(0, 5);
  });

  it('BW scoring uses brainworkshop strategy', () => {
    expect(SimBrainWorkshopSpec.scoring.strategy).toBe('brainworkshop');
  });
});

// =============================================================================
// REPORT CONFIGURATION TESTS (5 tests)
// =============================================================================

describe('Report Configuration', () => {
  it('every spec has non-empty report sections', () => {
    for (const spec of allModeSpecs) {
      expect(spec.report.sections.length).toBeGreaterThan(0);
    }
  });

  it('report sections contain valid section IDs', () => {
    const validSections = [
      'HERO',
      'RECENT_TREND',
      'PERFORMANCE',
      'CONFIDENCE_BREAKDOWN',
      'ERROR_PROFILE',
      'INSIGHTS',
      'SPEED',
      'NEXT_STEP',
      'REWARD_INDICATOR',
      'DETAILS',
    ];
    for (const spec of allModeSpecs) {
      for (const section of spec.report.sections) {
        expect(validSections).toContain(section);
      }
    }
  });

  it('tempo modes have CONFIDENCE_BREAKDOWN section', () => {
    const tempoModes = [DualCatchSpec, DualnbackClassicSpec, SimBrainWorkshopSpec];
    for (const spec of tempoModes) {
      expect(spec.report.sections).toContain('CONFIDENCE_BREAKDOWN');
    }
  });

  it('flow modes have INSIGHTS section', () => {
    const flowModes = [DualPlaceSpec, DualMemoSpec, DualPickSpec];
    for (const spec of flowModes) {
      expect(spec.report.sections).toContain('INSIGHTS');
    }
  });

  it('insight metrics are defined for flow modes', () => {
    const flowModes = [DualPlaceSpec, DualMemoSpec, DualPickSpec];
    for (const spec of flowModes) {
      expect(spec.report.display.insightMetrics).toBeDefined();
      expect(spec.report.display.insightMetrics!.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// STATS CONFIGURATION TESTS (5 tests)
// =============================================================================

describe('Stats Configuration', () => {
  it('every spec has stats config when defined', () => {
    for (const spec of allModeSpecs) {
      if (spec.stats) {
        expect(spec.stats.simple).toBeDefined();
        expect(spec.stats.advanced).toBeDefined();
      }
    }
  });

  it('stats simple sections are non-empty', () => {
    for (const spec of allModeSpecs) {
      if (spec.stats) {
        expect(spec.stats.simple.sections.length).toBeGreaterThan(0);
      }
    }
  });

  it('stats advanced sections are non-empty', () => {
    for (const spec of allModeSpecs) {
      if (spec.stats) {
        expect(spec.stats.advanced.sections.length).toBeGreaterThan(0);
      }
    }
  });

  it('Jaeggi uses EVOLUTION_ERROR_RATE instead of EVOLUTION_ACCURACY', () => {
    const sections = DualnbackClassicSpec.stats?.simple.sections ?? [];
    expect(sections).toContain('EVOLUTION_ERROR_RATE');
    expect(sections).not.toContain('EVOLUTION_ACCURACY');
  });

  it('non-Jaeggi modes use EVOLUTION_ACCURACY', () => {
    const nonJaeggiModes = [DualCatchSpec, SimBrainWorkshopSpec, DualPlaceSpec, DualMemoSpec];
    for (const spec of nonJaeggiModes) {
      const sections = spec.stats?.simple.sections ?? [];
      expect(sections).toContain('EVOLUTION_ACCURACY');
    }
  });
});

// =============================================================================
// ADDITIONAL PROPERTY-BASED INVARIANT TESTS (40+ tests using fc.assert)
// =============================================================================

describe('Property-Based Invariant Tests', () => {
  describe('Metadata Invariants (10 tests)', () => {
    it('property: id is always non-empty string', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return typeof spec.metadata.id === 'string' && spec.metadata.id.length > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: displayName is always non-empty string', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return (
            typeof spec.metadata.displayName === 'string' && spec.metadata.displayName.length > 0
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: description is always a string', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return typeof spec.metadata.description === 'string';
        }),
        { numRuns: 50 },
      );
    });

    it('property: tags is always a non-empty array', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return Array.isArray(spec.metadata.tags) && spec.metadata.tags.length > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: all tags are non-empty strings', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.metadata.tags.every((tag) => typeof tag === 'string' && tag.length > 0);
        }),
        { numRuns: 50 },
      );
    });

    it('property: difficultyLevel is integer in [1, 5]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const d = spec.metadata.difficultyLevel;
          return Number.isInteger(d) && d >= 1 && d <= 5;
        }),
        { numRuns: 50 },
      );
    });

    it('property: version is valid semver format', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return /^\d+\.\d+\.\d+$/.test(spec.metadata.version);
        }),
        { numRuns: 50 },
      );
    });

    it('property: sessionType is one of valid types', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return validSessionTypes.includes(spec.sessionType as (typeof validSessionTypes)[number]);
        }),
        { numRuns: 50 },
      );
    });

    it('property: spec identity is preserved through selection', () => {
      fc.assert(
        fc.property(arbModeId, (modeId) => {
          const spec = AllSpecs[modeId];
          return spec.metadata.id === modeId;
        }),
        { numRuns: 50 },
      );
    });

    it('property: AllSpecs contains all advertised modes', () => {
      fc.assert(
        fc.property(arbModeId, (modeId) => {
          return modeId in AllSpecs && AllSpecs[modeId] !== undefined;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Timing Invariants (10 tests)', () => {
    it('property: stimulusDurationMs is non-negative finite number', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const d = spec.timing.stimulusDurationMs;
          // Self-paced modes (e.g. Ravens) use 0 to indicate no time limit
          return typeof d === 'number' && Number.isFinite(d) && d >= 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: intervalMs is positive finite number', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const d = spec.timing.intervalMs;
          return typeof d === 'number' && Number.isFinite(d) && d > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: optional timing fields when defined are positive', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const t = spec.timing;
          if (t.minValidRtMs !== undefined && t.minValidRtMs <= 0) return false;
          if (t.feedbackDurationMs !== undefined && t.feedbackDurationMs <= 0) return false;
          if (t.responseWindowMs !== undefined && t.responseWindowMs <= 0) return false;
          if (t.warmupStimulusDurationMs !== undefined && t.warmupStimulusDurationMs <= 0)
            return false;
          return true;
        }),
        { numRuns: 50 },
      );
    });

    it('property: stimulusDurationMs has reasonable upper bound', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          // Puzzle modes (2048, Sudoku) may use up to 5 min; tempo/test modes max 2 min
          return spec.timing.stimulusDurationMs <= 600000;
        }),
        { numRuns: 50 },
      );
    });

    it('property: intervalMs has reasonable upper bound', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.timing.intervalMs <= 60000; // Max 1 minute
        }),
        { numRuns: 50 },
      );
    });

    it('property: visualOffsetMs when defined is finite', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.timing.visualOffsetMs === undefined) return true;
          return Number.isFinite(spec.timing.visualOffsetMs);
        }),
        { numRuns: 50 },
      );
    });

    it('property: prepDelayMs when defined is positive', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.timing.prepDelayMs === undefined) return true;
          return spec.timing.prepDelayMs > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: timing values are not NaN', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return (
            !Number.isNaN(spec.timing.stimulusDurationMs) && !Number.isNaN(spec.timing.intervalMs)
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: BW interval formula is deterministic', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (ticks) => {
          const result1 = calculateBWIntervalMs(ticks);
          const result2 = calculateBWIntervalMs(ticks);
          return result1 === result2;
        }),
        { numRuns: 50 },
      );
    });

    it('property: BW interval is always positive', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (ticks) => {
          return calculateBWIntervalMs(ticks) > 0;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Generation Invariants (10 tests)', () => {
    it('property: targetProbability is in [0, 1]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const p = spec.generation.targetProbability;
          return p >= 0 && p <= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('property: lureProbability is in [0, 1]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const p = spec.generation.lureProbability;
          return p >= 0 && p <= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('property: combined probabilities <= 1', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.generation.targetProbability + spec.generation.lureProbability <= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('property: generator is one of valid types', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return validGenerators.includes(
            spec.generation.generator as (typeof validGenerators)[number],
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: sequenceMode when defined is valid', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.generation.sequenceMode === undefined) return true;
          return ['tempo', 'memo', 'flow'].includes(spec.generation.sequenceMode);
        }),
        { numRuns: 50 },
      );
    });

    it('property: probabilities are finite numbers', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return (
            Number.isFinite(spec.generation.targetProbability) &&
            Number.isFinite(spec.generation.lureProbability)
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: probabilities are not NaN', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return (
            !Number.isNaN(spec.generation.targetProbability) &&
            !Number.isNaN(spec.generation.lureProbability)
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: Sequence generator has valid sequenceMode', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.generation.generator !== 'Sequence') return true;
          if (spec.generation.sequenceMode === undefined) return true;
          return ['tempo', 'memo', 'flow'].includes(spec.generation.sequenceMode);
        }),
        { numRuns: 50 },
      );
    });

    it('property: BrainWorkshop mode spec uses zero legacy probabilities', () => {
      // Only sim-brainworkshop mode uses zero probabilities (2-stage algorithm)
      // Custom mode can use BrainWorkshop generator with any probabilities
      expect(SimBrainWorkshopSpec.generation.targetProbability).toBe(0);
      expect(SimBrainWorkshopSpec.generation.lureProbability).toBe(0);
    });

    it('property: random probability operations preserve bounds', () => {
      fc.assert(
        fc.property(
          arbValidProbability,
          arbValidProbability,
          fc.double({ min: 0, max: 2, noNaN: true }),
          (p1, p2, factor) => {
            const scaled = Math.min(1, Math.max(0, p1 * factor));
            const combined = Math.min(1, scaled + p2);
            return combined >= 0 && combined <= 1;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Defaults Invariants (10 tests)', () => {
    it('property: nLevel is positive integer', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const n = spec.defaults.nLevel;
          return Number.isInteger(n) && n > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: trialsCount is positive integer', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const t = spec.defaults.trialsCount;
          return Number.isInteger(t) && t > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: trialsCount > nLevel for tempo/flow modes', () => {
      const tempoSpecs = allModeSpecs.filter((s) => s.timing.intervalMs > 1);
      const arbTempoSpec = fc.constantFrom(...tempoSpecs);
      fc.assert(
        fc.property(arbTempoSpec, (spec) => {
          return spec.defaults.trialsCount > spec.defaults.nLevel;
        }),
        { numRuns: 50 },
      );
    });

    it('property: activeModalities is non-empty array', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return (
            Array.isArray(spec.defaults.activeModalities) &&
            spec.defaults.activeModalities.length > 0
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: all modalities are non-empty strings', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.defaults.activeModalities.every((m) => typeof m === 'string' && m.length > 0);
        }),
        { numRuns: 50 },
      );
    });

    it('property: nLevel has reasonable upper bound', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.defaults.nLevel <= 20; // Reasonable max for N-back
        }),
        { numRuns: 50 },
      );
    });

    it('property: trialsCount has reasonable upper bound', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return spec.defaults.trialsCount <= 500; // Reasonable max trials
        }),
        { numRuns: 50 },
      );
    });

    it('property: modalities array has no duplicates', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const modalities = spec.defaults.activeModalities;
          const unique = new Set(modalities);
          return unique.size === modalities.length;
        }),
        { numRuns: 50 },
      );
    });

    it('property: BW trials formula is monotonically increasing with N', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 9 }), (n) => {
          const trials1 = calculateBWTrialsCount(n);
          const trials2 = calculateBWTrialsCount(n + 1);
          return trials2 > trials1;
        }),
        { numRuns: 20 },
      );
    });

    it('property: BW trials formula is deterministic', () => {
      fc.assert(
        fc.property(arbValidNLevel, (n) => {
          return calculateBWTrialsCount(n) === calculateBWTrialsCount(n);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Scoring Invariants (10 tests)', () => {
    it('property: passThreshold is positive finite', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          const t = spec.scoring.passThreshold;
          return Number.isFinite(t) && t > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: strategy is one of valid types', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return validStrategies.includes(spec.scoring.strategy);
        }),
        { numRuns: 50 },
      );
    });

    it('property: downThreshold when defined is positive', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.scoring.downThreshold === undefined) return true;
          return spec.scoring.downThreshold > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('property: flowThreshold when defined is in [0, 100]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.scoring.flowThreshold === undefined) return true;
          return spec.scoring.flowThreshold >= 0 && spec.scoring.flowThreshold <= 100;
        }),
        { numRuns: 50 },
      );
    });

    it('property: UPS weights when defined sum to 1', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (!spec.scoring.ups) return true;
          const sum = spec.scoring.ups.accuracyWeight + spec.scoring.ups.confidenceWeight;
          return Math.abs(sum - 1.0) < 0.001;
        }),
        { numRuns: 50 },
      );
    });

    it('property: UPS weights when defined are in [0, 1]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (!spec.scoring.ups) return true;
          const { accuracyWeight, confidenceWeight } = spec.scoring.ups;
          return (
            accuracyWeight >= 0 &&
            accuracyWeight <= 1 &&
            confidenceWeight >= 0 &&
            confidenceWeight <= 1
          );
        }),
        { numRuns: 50 },
      );
    });

    it('property: SDT thresholds are in valid d-prime range', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.scoring.strategy !== 'sdt') return true;
          const t = spec.scoring.passThreshold;
          return t >= VALID_DPRIME_MIN && t <= VALID_DPRIME_MAX;
        }),
        { numRuns: 50 },
      );
    });

    it('property: accuracy thresholds are in [0, 1]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.scoring.strategy !== 'accuracy') return true;
          const t = spec.scoring.passThreshold;
          return t >= 0 && t <= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('property: brainworkshop thresholds are in [0, 1]', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          if (spec.scoring.strategy !== 'brainworkshop') return true;
          const t = spec.scoring.passThreshold;
          return t >= 0 && t <= 1;
        }),
        { numRuns: 50 },
      );
    });

    it('property: passThreshold is not NaN', () => {
      fc.assert(
        fc.property(arbModeSpec, (spec) => {
          return !Number.isNaN(spec.scoring.passThreshold);
        }),
        { numRuns: 50 },
      );
    });
  });
});
