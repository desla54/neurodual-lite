/**
 * Tests for SDTCalculator
 *
 * Validates Signal Detection Theory calculations:
 * - probit (inverse normal CDF)
 * - d' (d-prime) with Hautus correction
 * - Response counting and stats calculation
 * - Trial classification (isTarget, hasResponse)
 */

import { describe, expect, test } from 'bun:test';
// @ts-expect-error test override
import { SDTCalculator, type RawCounts, type ModalityStats } from './helpers/sdt-calculator';
import { evaluateProgression } from './sdt';
import { SDT_DPRIME_PASS, SDT_DPRIME_DOWN } from '../../specs/thresholds';
import type { Block, BlockConfig, Trial, TrialInput, UserInputs } from '../types';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTrial = (overrides: Partial<Trial> = {}): Trial => ({
  index: 0,
  isBuffer: false,
  position: 0,
  sound: 'C',
  // @ts-expect-error test override
  color: 'red',
  trialType: 'Non-Cible',
  isPositionTarget: false,
  isSoundTarget: false,
  isColorTarget: false,
  isPositionLure: undefined,
  isSoundLure: undefined,
  isColorLure: undefined,
  positionLureType: undefined,
  soundLureType: undefined,
  colorLureType: undefined,
  ...overrides,
});

const createBlockConfig = (overrides: Partial<BlockConfig> = {}): BlockConfig => ({
  nLevel: 2,
  generator: 'BrainWorkshop',
  activeModalities: ['position', 'audio'],
  trialsCount: 10,
  targetProbability: 0.3,
  lureProbability: 0.1,
  intervalSeconds: 3.0,
  stimulusDurationSeconds: 0.5,
  ...overrides,
});

const createBlock = (trials: Trial[], config?: Partial<BlockConfig>): Block => ({
  id: 'test-block',
  config: createBlockConfig(config),
  trials,
  createdAt: new Date(),
  seed: 'test-seed',
});

// Helper pour créer des stats partielles
const createStats = (dPrime: number): ModalityStats => ({
  hits: 0,
  misses: 0,
  falseAlarms: 0,
  correctRejections: 0,
  hitRate: 0,
  falseAlarmRate: 0,
  dPrime,
  reactionTimes: [],
  avgReactionTime: null,
});

// =============================================================================
// Probit Tests
// =============================================================================

describe('SDTCalculator.probit', () => {
  test('should return 0 for p=0.5 (median)', () => {
    const result = SDTCalculator.probit(0.5);
    expect(result).toBeCloseTo(0, 10);
  });

  test('should return approximately 1 for p≈0.8413 (1 SD)', () => {
    // P(Z < 1) ≈ 0.841344746
    const result = SDTCalculator.probit(0.841344746);
    expect(result).toBeCloseTo(1, 7);
  });

  test('should return approximately -1 for p≈0.1586 (-1 SD)', () => {
    // P(Z < -1) ≈ 0.158655254
    const result = SDTCalculator.probit(0.158655254);
    expect(result).toBeCloseTo(-1, 7);
  });

  test('should return approximately 1.96 for p=0.975 (95% CI upper)', () => {
    const result = SDTCalculator.probit(0.975);
    expect(result).toBeCloseTo(1.95996, 5);
  });

  test('should return approximately -1.96 for p=0.025 (95% CI lower)', () => {
    const result = SDTCalculator.probit(0.025);
    expect(result).toBeCloseTo(-1.95996, 5);
  });

  test('should return correct value for p=0.75', () => {
    const result = SDTCalculator.probit(0.75);
    expect(result).toBeCloseTo(0.67448975, 7);
  });

  test('should return correct value for p=0.25', () => {
    const result = SDTCalculator.probit(0.25);
    expect(result).toBeCloseTo(-0.67448975, 7);
  });

  test('should return correct value for p=0.9', () => {
    const result = SDTCalculator.probit(0.9);
    expect(result).toBeCloseTo(1.28155, 5);
  });

  test('should clamp to -5 for p<=0', () => {
    expect(SDTCalculator.probit(0)).toBe(-5);
    expect(SDTCalculator.probit(-0.1)).toBe(-5);
  });

  test('should clamp to 5 for p>=1', () => {
    expect(SDTCalculator.probit(1)).toBe(5);
    expect(SDTCalculator.probit(1.1)).toBe(5);
  });

  test('should handle extreme low probabilities (pLow boundary)', () => {
    // pLow = 0.02425
    const result = SDTCalculator.probit(0.02425);
    expect(result).toBeCloseTo(-1.973, 3);

    const resultJustBelow = SDTCalculator.probit(0.02424);
    expect(resultJustBelow).toBeLessThan(result);

    const resultJustAbove = SDTCalculator.probit(0.02426);
    expect(resultJustAbove).toBeGreaterThan(result);
  });

  test('should handle extreme high probabilities (pHigh boundary)', () => {
    // pHigh = 1 - 0.02425 = 0.97575
    const result = SDTCalculator.probit(0.97575);
    expect(result).toBeCloseTo(1.973, 3);
  });

  test('should be monotonically increasing', () => {
    const probs = [0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999];
    const results = probs.map((p) => SDTCalculator.probit(p));

    for (let i = 1; i < results.length; i++) {
      // @ts-expect-error test override
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }
  });
});

// =============================================================================
// d' Calculation Tests
// =============================================================================

describe('SDTCalculator.calculateDPrime', () => {
  test('should return 0 when no signal trials', () => {
    // Without guard, this might return non-zero if falseAlarmRate != 0.5
    // hits=0, misses=0 -> signalTrials=0
    // falseAlarms=2, CR=8 -> noiseTrials=10. faRate = (2+0.5)/(10+1) = 2.5/11 = 0.227
    // Without guard: probit(0.5) - probit(0.227) = 0 - (-0.75) = 0.75
    const dPrime = SDTCalculator.calculateDPrime(0, 0, 2, 8);
    expect(dPrime).toBe(0);
  });

  test('should return 0 when no noise trials', () => {
    // Without guard: hits=8, misses=2 -> signalTrials=10. hitRate = 8.5/11 = 0.77
    // falseAlarms=0, CR=0 -> noiseTrials=0. faRate = 0.5/1 = 0.5
    // Without guard: probit(0.77) - probit(0.5) = 0.74 - 0 = 0.74
    const dPrime = SDTCalculator.calculateDPrime(8, 2, 0, 0);
    expect(dPrime).toBe(0);
  });

  test("should return high d' for perfect performance", () => {
    // Perfect: all targets detected, no false alarms
    const dPrime = SDTCalculator.calculateDPrime(10, 0, 0, 10);
    expect(dPrime).toBeGreaterThan(3);
  });

  test("should return low d' for chance performance", () => {
    // 50% hit rate, 50% false alarm rate → d' ≈ 0
    const dPrime = SDTCalculator.calculateDPrime(5, 5, 5, 5);
    expect(dPrime).toBeCloseTo(0, 1);
  });

  test("should return negative d' when worse than chance", () => {
    // More false alarms than hits, but still some hits and CRs
    const dPrime = SDTCalculator.calculateDPrime(2, 8, 8, 2);
    expect(dPrime).toBeLessThan(0);
  });

  test('should apply Hautus correction (no infinity)', () => {
    // Without Hautus correction, perfect hit rate would give infinity
    // With correction: (10 + 0.5) / (10 + 1) = 0.9545...
    const dPrime = SDTCalculator.calculateDPrime(10, 0, 0, 10);
    expect(Number.isFinite(dPrime)).toBe(true);
    expect(dPrime).toBeLessThan(10); // Sanity check
  });

  test("should return reasonable d' for typical good performance", () => {
    // 80% hit rate, 20% false alarm rate
    // With Hautus correction: hitRate = 8.5/11 ≈ 0.77, faRate = 2.5/11 ≈ 0.23
    // d' slightly lower than uncorrected ~1.68
    const dPrime = SDTCalculator.calculateDPrime(8, 2, 2, 8);
    expect(dPrime).toBeGreaterThan(1.4);
    expect(dPrime).toBeLessThan(1.6);
  });

  test('should handle asymmetric trial counts', () => {
    // More signal trials than noise trials
    const dPrime = SDTCalculator.calculateDPrime(15, 5, 3, 7);
    expect(Number.isFinite(dPrime)).toBe(true);
    expect(dPrime).toBeGreaterThan(0);
  });

  test('should be symmetric: swapping hits/FA pattern inverts sign', () => {
    const dPrime1 = SDTCalculator.calculateDPrime(8, 2, 2, 8);
    const dPrime2 = SDTCalculator.calculateDPrime(2, 8, 8, 2);

    // They should be roughly opposite
    expect(dPrime1).toBeCloseTo(-dPrime2, 1);
  });

  // ===========================================================================
  // Anti-Gaming Tests
  // ===========================================================================

  describe('Anti-gaming guards', () => {
    test('should return 0 for inactivity (hits=0)', () => {
      // Joueur qui ne détecte jamais les cibles mais fait des FA
      // Without guard: hits=0, miss=10, FA=5, CR=5
      // hitRate = 0.5/11 = 0.045 -> probit = -1.69
      // faRate = 5.5/11 = 0.5 -> probit = 0
      // d' = -1.69. Guard makes it 0.
      const dPrime = SDTCalculator.calculateDPrime(0, 10, 5, 5);
      expect(dPrime).toBe(0);
    });

    test('should return 0 for silence (hits=0 AND FA=0)', () => {
      const dPrime = SDTCalculator.calculateDPrime(0, 10, 0, 10);
      expect(dPrime).toBe(0);
    });

    test('should return 0 for spammer (CR=0)', () => {
      // Joueur qui répond à tout (jamais de rejet correct)
      // Without guard: hits=10, miss=0, FA=10, CR=0
      // hitRate = 10.5/11 = 0.954 -> probit = 1.69
      // faRate = 10.5/11 = 0.954 -> probit = 1.69
      // d' = 0. Guard makes it 0 anyway.
      // Better case for guard: hits=10, miss=0, FA=5, CR=0
      // faRate = 5.5/6 = 0.916 -> probit = 1.38
      // d' = 1.69 - 1.38 = 0.31. Guard makes it 0.
      const dPrime = SDTCalculator.calculateDPrime(10, 0, 5, 0);
      expect(dPrime).toBe(0);
    });

    test('should allow negative d-prime when not gaming', () => {
      // Mauvaise performance mais pas du gaming (a des hits et des CR)
      const dPrime = SDTCalculator.calculateDPrime(2, 8, 8, 2);
      expect(dPrime).toBeLessThan(0);
    });

    test('should not penalize legitimate low performance', () => {
      // Joueur avec quelques hits et quelques CR
      const dPrime = SDTCalculator.calculateDPrime(3, 7, 6, 4);
      expect(dPrime).not.toBe(0); // Should calculate normally
      expect(dPrime).toBeLessThan(0); // Poor performance
    });
  });
});

// =============================================================================
// Modality Stats Calculation Tests
// =============================================================================

describe('SDTCalculator.calculateModalityStats', () => {
  test('should calculate hitRate correctly', () => {
    const counts: RawCounts = {
      hits: 8,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 9,
      reactionTimes: [],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);

    // hitRate = hits / (hits + misses) = 8 / 10 = 0.8
    expect(stats.hitRate).toBeCloseTo(0.8, 5);
  });

  test('should calculate falseAlarmRate correctly', () => {
    const counts: RawCounts = {
      hits: 8,
      misses: 2,
      falseAlarms: 3,
      correctRejections: 7,
      reactionTimes: [],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);

    // falseAlarmRate = fa / (fa + cr) = 3 / 10 = 0.3
    expect(stats.falseAlarmRate).toBeCloseTo(0.3, 5);
  });

  test('should return 0 hitRate when no signal trials', () => {
    const counts: RawCounts = {
      hits: 0,
      misses: 0,
      falseAlarms: 2,
      correctRejections: 8,
      reactionTimes: [],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.hitRate).toBe(0);
  });

  test('should return 0 falseAlarmRate when no noise trials', () => {
    const counts: RawCounts = {
      hits: 8,
      misses: 2,
      falseAlarms: 0,
      correctRejections: 0,
      reactionTimes: [],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.falseAlarmRate).toBe(0);
  });

  test('should calculate avgReactionTime correctly', () => {
    const counts: RawCounts = {
      hits: 3,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 5,
      reactionTimes: [300, 400, 500],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);

    expect(stats.avgReactionTime).toBeCloseTo(400, 5);
    expect(stats.reactionTimes).toEqual([300, 400, 500]);
  });

  test('should return null avgReactionTime when no reaction times', () => {
    const counts: RawCounts = {
      hits: 0,
      misses: 5,
      falseAlarms: 0,
      correctRejections: 5,
      reactionTimes: [],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.avgReactionTime).toBeNull();
  });

  test('should preserve all raw counts in output', () => {
    const counts: RawCounts = {
      hits: 7,
      misses: 3,
      falseAlarms: 2,
      correctRejections: 8,
      reactionTimes: [250, 350],
    };

    const stats = SDTCalculator.calculateModalityStats(counts);

    expect(stats.hits).toBe(7);
    expect(stats.misses).toBe(3);
    expect(stats.falseAlarms).toBe(2);
    expect(stats.correctRejections).toBe(8);
  });
});

// =============================================================================
// Average/Min d' Tests
// =============================================================================

describe('SDTCalculator.calculateAverageDPrime', () => {
  test("should return average of d' values", () => {
    const statsByModality = {
      position: createStats(1.5),
      audio: createStats(2.0),
    };

    const avg = SDTCalculator.calculateAverageDPrime(statsByModality);
    expect(avg).toBeCloseTo(1.75, 5);
  });

  test('should return 0 for empty modalities', () => {
    const avg = SDTCalculator.calculateAverageDPrime({});
    expect(avg).toBe(0);
  });

  test('should handle single modality', () => {
    const statsByModality = {
      position: createStats(2.5),
    };

    const avg = SDTCalculator.calculateAverageDPrime(statsByModality);
    expect(avg).toBeCloseTo(2.5, 5);
  });
});

describe('SDTCalculator.calculateMinDPrime', () => {
  test("should return minimum d' value", () => {
    const statsByModality = {
      position: createStats(1.5),
      audio: createStats(2.0),
      color: createStats(1.2),
    };

    const min = SDTCalculator.calculateMinDPrime(statsByModality);
    expect(min).toBeCloseTo(1.2, 5);
  });

  test('should return 0 for empty modalities', () => {
    const min = SDTCalculator.calculateMinDPrime({});
    expect(min).toBe(0);
  });
});

// =============================================================================
// evaluateProgression Tests
// =============================================================================

describe('evaluateProgression', () => {
  test("should return STAY when less than 3 d' values", () => {
    expect(evaluateProgression([])).toBe('STAY');
    expect(evaluateProgression([1.8])).toBe('STAY');
    expect(evaluateProgression([1.8, 1.9])).toBe('STAY');
  });

  test('should return UP when average >= SDT_DPRIME_PASS', () => {
    // Average = (1.6 + 1.5 + 1.6) / 3 = 1.567 >= 1.5
    const result = evaluateProgression([1.6, 1.5, 1.6]);
    expect(result).toBe('UP');
  });

  test('should return DOWN when average < SDT_DPRIME_DOWN', () => {
    // Average = (0.5 + 0.6 + 0.7) / 3 = 0.6 < 0.8
    const result = evaluateProgression([0.5, 0.6, 0.7]);
    expect(result).toBe('DOWN');
  });

  test('should return STAY when average is between thresholds', () => {
    // Average = (1.0 + 1.1 + 1.2) / 3 = 1.1 (between 0.8 and 1.5)
    const result = evaluateProgression([1.0, 1.1, 1.2]);
    expect(result).toBe('STAY');
  });

  test('should only use last 3 values when more are provided', () => {
    // Only [1.6, 1.7, 1.8] should be used → avg = 1.7 → UP
    const result = evaluateProgression([0.5, 0.5, 0.5, 1.6, 1.7, 1.8]);
    expect(result).toBe('UP');
  });

  test('should return UP at exact threshold', () => {
    // Average = 1.5 exactly → UP
    const result = evaluateProgression([1.5, 1.5, 1.5]);
    expect(result).toBe('UP');
  });

  test('should return STAY just below UP threshold', () => {
    // Average = 1.49 → STAY
    const result = evaluateProgression([1.49, 1.49, 1.49]);
    expect(result).toBe('STAY');
  });

  test('should return DOWN just below DOWN threshold', () => {
    // Average = 0.79 → DOWN
    const result = evaluateProgression([0.79, 0.79, 0.79]);
    expect(result).toBe('DOWN');
  });

  test('should return STAY at exact DOWN threshold', () => {
    // Average = 0.8 exactly → STAY (because code uses < 0.8 for DOWN)
    const result = evaluateProgression([0.8, 0.8, 0.8]);
    expect(result).toBe('STAY');
  });

  test('thresholds should have correct values', () => {
    expect(SDT_DPRIME_PASS).toBe(1.5);
    expect(SDT_DPRIME_DOWN).toBe(0.8);
  });
});

// =============================================================================
// getIsTarget Tests
// =============================================================================

describe('SDTCalculator.getIsTarget', () => {
  test('should return isPositionTarget for position modality', () => {
    const targetTrial = createTrial({ isPositionTarget: true });
    const nonTargetTrial = createTrial({ isPositionTarget: false });

    expect(SDTCalculator.getIsTarget(targetTrial, 'position')).toBe(true);
    expect(SDTCalculator.getIsTarget(nonTargetTrial, 'position')).toBe(false);
  });

  test('should return isSoundTarget for audio modality', () => {
    const targetTrial = createTrial({ isSoundTarget: true });
    const nonTargetTrial = createTrial({ isSoundTarget: false });

    expect(SDTCalculator.getIsTarget(targetTrial, 'audio')).toBe(true);
    expect(SDTCalculator.getIsTarget(nonTargetTrial, 'audio')).toBe(false);
  });

  test('should return isColorTarget for color modality', () => {
    const targetTrial = createTrial({ isColorTarget: true });
    const nonTargetTrial = createTrial({ isColorTarget: false });

    expect(SDTCalculator.getIsTarget(targetTrial, 'color')).toBe(true);
    expect(SDTCalculator.getIsTarget(nonTargetTrial, 'color')).toBe(false);
  });

  test('should handle dual targets independently', () => {
    const dualTrial = createTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: false,
    });

    expect(SDTCalculator.getIsTarget(dualTrial, 'position')).toBe(true);
    expect(SDTCalculator.getIsTarget(dualTrial, 'audio')).toBe(true);
    expect(SDTCalculator.getIsTarget(dualTrial, 'color')).toBe(false);
  });
});

// =============================================================================
// getHasResponse Tests
// =============================================================================

describe('SDTCalculator.getHasResponse', () => {
  test('should return true when position response exists', () => {
    const input: TrialInput = { position: true, positionRT: 300 };
    expect(SDTCalculator.getHasResponse(input, 'position')).toBe(true);
  });

  test('should return false when position response is false', () => {
    const input: TrialInput = { position: false };
    expect(SDTCalculator.getHasResponse(input, 'position')).toBe(false);
  });

  test('should return true when audio response exists', () => {
    const input: TrialInput = { audio: true, audioRT: 400 };
    expect(SDTCalculator.getHasResponse(input, 'audio')).toBe(true);
  });

  test('should return false when audio response is missing', () => {
    const input: TrialInput = { position: true };
    expect(SDTCalculator.getHasResponse(input, 'audio')).toBe(false);
  });

  test('should return true when color response exists', () => {
    const input: TrialInput = { color: true, colorRT: 350 };
    expect(SDTCalculator.getHasResponse(input, 'color')).toBe(true);
  });

  test('should return false for undefined input', () => {
    expect(SDTCalculator.getHasResponse(undefined, 'position')).toBe(false);
    expect(SDTCalculator.getHasResponse(undefined, 'audio')).toBe(false);
    expect(SDTCalculator.getHasResponse(undefined, 'color')).toBe(false);
  });
});

// =============================================================================
// getReactionTime Tests
// =============================================================================

describe('SDTCalculator.getReactionTime', () => {
  test('should return positionRT for position modality', () => {
    const input: TrialInput = { position: true, positionRT: 300 };
    expect(SDTCalculator.getReactionTime(input, 'position')).toBe(300);
  });

  test('should return audioRT for audio modality', () => {
    const input: TrialInput = { audio: true, audioRT: 450 };
    expect(SDTCalculator.getReactionTime(input, 'audio')).toBe(450);
  });

  test('should return colorRT for color modality', () => {
    const input: TrialInput = { color: true, colorRT: 380 };
    expect(SDTCalculator.getReactionTime(input, 'color')).toBe(380);
  });

  test('should return undefined when RT is not set', () => {
    const input: TrialInput = { position: true };
    expect(SDTCalculator.getReactionTime(input, 'position')).toBeUndefined();
  });

  test('should return undefined for undefined input', () => {
    expect(SDTCalculator.getReactionTime(undefined, 'position')).toBeUndefined();
    expect(SDTCalculator.getReactionTime(undefined, 'audio')).toBeUndefined();
  });
});

// =============================================================================
// countResponses Tests
// =============================================================================

describe('SDTCalculator.countResponses', () => {
  test('should count hits correctly (target + response)', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: true }), // Hit
      createTrial({ index: 3, isPositionTarget: true }), // Miss (no response)
      createTrial({ index: 4, isPositionTarget: false }), // CR
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300 },
      // 3: no response
      // 4: no response
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.hits).toBe(1);
    expect(counts.misses).toBe(1);
    expect(counts.correctRejections).toBe(1);
    expect(counts.falseAlarms).toBe(0);
  });

  test('should count false alarms correctly (non-target + response)', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: false }), // FA
      createTrial({ index: 3, isPositionTarget: false }), // CR
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300 }, // False alarm
      // 3: correct rejection
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.falseAlarms).toBe(1);
    expect(counts.correctRejections).toBe(1);
  });

  test('should filter out buffer trials', () => {
    const trials = [
      createTrial({ index: 0, isBuffer: true, isPositionTarget: false }),
      createTrial({ index: 1, isBuffer: true, isPositionTarget: false }),
      createTrial({ index: 2, isBuffer: false, isPositionTarget: true }),
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      0: { position: true }, // Should be ignored (buffer)
      1: { position: true }, // Should be ignored (buffer)
      2: { position: true, positionRT: 300 },
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.hits).toBe(1);
    expect(counts.misses).toBe(0);
    expect(counts.falseAlarms).toBe(0);
    expect(counts.correctRejections).toBe(0);
  });

  test('should collect reaction times for hits only', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: true }), // Hit with RT
      createTrial({ index: 3, isPositionTarget: true }), // Hit with RT
      createTrial({ index: 4, isPositionTarget: false }), // FA (RT not collected)
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300 },
      3: { position: true, positionRT: 400 },
      4: { position: true, positionRT: 350 }, // FA - should not be in RTs
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.reactionTimes).toEqual([300, 400]);
    expect(counts.reactionTimes).not.toContain(350);
  });

  test('should handle audio modality', () => {
    const trials = [
      createTrial({ index: 2, isSoundTarget: true }),
      createTrial({ index: 3, isSoundTarget: false }),
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { audio: true, audioRT: 450 },
      3: { audio: true, audioRT: 500 },
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'audio');

    expect(counts.hits).toBe(1);
    expect(counts.falseAlarms).toBe(1);
    expect(counts.reactionTimes).toEqual([450]);
  });

  test('should handle missing inputs gracefully', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: true }),
      createTrial({ index: 3, isPositionTarget: false }),
    ];
    const block = createBlock(trials);
    const inputs: UserInputs = {}; // No inputs at all

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.hits).toBe(0);
    expect(counts.misses).toBe(1);
    expect(counts.falseAlarms).toBe(0);
    expect(counts.correctRejections).toBe(1);
  });

  test('should not collect RT of 0 or negative', () => {
    const trials = [createTrial({ index: 2, isPositionTarget: true })];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: 0 },
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.reactionTimes).toEqual([]);
  });

  test('should not collect negative reaction times', () => {
    const trials = [createTrial({ index: 2, isPositionTarget: true })];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: -100 },
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.reactionTimes).toHaveLength(0);
  });

  test('should not collect RT if it is undefined even if hasResponse is true', () => {
    const trials = [createTrial({ index: 2, isPositionTarget: true })];
    const block = createBlock(trials);
    const inputs: UserInputs = {
      2: { position: true, positionRT: undefined },
    };

    const counts = SDTCalculator.countResponses(block, inputs, 'position');

    expect(counts.hits).toBe(1);
    expect(counts.reactionTimes).toHaveLength(0);
  });
});

// =============================================================================
// calculateAllModalityStats Tests
// =============================================================================

describe('SDTCalculator.calculateAllModalityStats', () => {
  test('should calculate stats for all active modalities', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: true, isSoundTarget: false }),
      createTrial({ index: 3, isPositionTarget: false, isSoundTarget: true }),
    ];
    const block = createBlock(trials, { activeModalities: ['position', 'audio'] });
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300, audio: false },
      3: { position: false, audio: true, audioRT: 400 },
    };

    const stats = SDTCalculator.calculateAllModalityStats(block, inputs);

    // Position: 1 hit, 0 miss, 0 FA, 1 CR
    // @ts-expect-error test: nullable access
    expect(stats!.position.hits).toBe(1);
    // @ts-expect-error test: nullable access
    expect(stats!.position.correctRejections).toBe(1);

    // Audio: 1 hit, 0 miss, 0 FA, 1 CR
    // @ts-expect-error test: nullable access
    expect(stats!.audio.hits).toBe(1);
    // @ts-expect-error test: nullable access
    expect(stats!.audio.correctRejections).toBe(1);
  });

  test('should only calculate for active modalities', () => {
    const trials = [
      createTrial({ index: 2, isPositionTarget: true, isSoundTarget: true, isColorTarget: true }),
    ];
    const block = createBlock(trials, { activeModalities: ['position'] }); // Only position
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300, audio: true, color: true },
    };

    const stats = SDTCalculator.calculateAllModalityStats(block, inputs);

    expect(stats.position).toBeDefined();
    expect(stats.audio).toBeUndefined();
    expect(stats.color).toBeUndefined();
  });

  test("should calculate d' for each modality independently", () => {
    // Good performance on position, poor on audio
    const trials = [
      createTrial({ index: 2, isPositionTarget: true, isSoundTarget: true }),
      createTrial({ index: 3, isPositionTarget: true, isSoundTarget: true }),
      createTrial({ index: 4, isPositionTarget: false, isSoundTarget: false }),
      createTrial({ index: 5, isPositionTarget: false, isSoundTarget: false }),
    ];
    const block = createBlock(trials, { activeModalities: ['position', 'audio'] });
    const inputs: UserInputs = {
      2: { position: true, positionRT: 300, audio: false }, // Pos: Hit, Audio: Miss
      3: { position: true, positionRT: 310, audio: false }, // Pos: Hit, Audio: Miss
      4: { position: false, audio: true }, // Pos: CR, Audio: FA
      5: { position: false, audio: true }, // Pos: CR, Audio: FA
    };

    const stats = SDTCalculator.calculateAllModalityStats(block, inputs);

    // Position: 2 hits, 0 miss, 0 FA, 2 CR → high d' (Hautus correction lowers it slightly)
    // @ts-expect-error test: nullable access
    expect(stats!.position.dPrime).toBeGreaterThan(1.8);

    // Audio: 0 hits, 2 miss, 2 FA, 0 CR → d' = 0 (anti-gaming: hits=0 AND CR=0)
    // @ts-expect-error test: nullable access
    expect(stats!.audio.dPrime).toBe(0);
  });
});
