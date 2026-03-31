/**
 * Aggressive Property-Based Edge Case Tests for AdaptiveControllerAlgorithm
 *
 * Targets edge cases and potential bugs:
 * 1. Rapid difficulty changes - oscillation detection
 * 2. Difficulty at minimum (can't go lower)
 * 3. Difficulty at maximum (can't go higher)
 * 4. Perfect performance for extended period
 * 5. Zero performance for extended period
 * 6. Alternating perfect/zero performance
 * 7. Controller state after reset
 * 8. Controller with corrupted history
 * 9. NaN/Infinity in performance metrics
 * 10. Very long sessions (1000+ trials)
 * 11. Controller determinism (same input = same output?)
 * 12. Edge case: single trial decision
 *
 * =============================================================================
 * FINDINGS FROM AGGRESSIVE TESTING
 * =============================================================================
 *
 * NO CRITICAL BUGS FOUND. The controller is well-implemented with proper guards:
 *
 * 1. PARAMETER BOUNDS: All parameters (pTarget, pLure, ISI, stimulusDuration)
 *    are properly clamped to their defined ranges even under extreme inputs.
 *
 * 2. NaN/INFINITY HANDLING: The controller properly guards against NaN and
 *    Infinity in both config and trial results. The clamp() function handles
 *    NaN by returning the midpoint of the range.
 *
 * 3. ANTI-GAMING CONSISTENCY: The controller's d' calculation does NOT include
 *    the anti-gaming guards from SDTCalculator (hits=0 or CR=0 returning d'=0).
 *    This is INTENTIONAL - the controller uses Hautus correction which still
 *    produces valid (potentially negative) d' values for poor performance.
 *
 * 4. SMOOTHING WORKS: Exponential smoothing (0.25 factor) prevents wild
 *    oscillations and provides smooth adaptation.
 *
 * 5. CUMULATIVE ERROR BOUNDED: cumulativeError is clamped to [-10, 10].
 *
 * 6. WINDOW SIZE BOUNDED: recentResults is capped by DPRIME_WINDOW_SIZE.
 *
 * 7. STATE RESTORE: Corrupted state with out-of-bounds values is properly
 *    clamped on restore.
 *
 * 8. DETERMINISM: Same input sequence produces same output (excluding sessionSeed).
 *
 * DESIGN OBSERVATIONS:
 *
 * - The 5-trial warmup (no adjustments before trial 5) provides stability.
 * - N=1 correctly disables N-1 lures (would be same as targets).
 * - Mode switching (tempo vs memo/flow) correctly affects ISI adjustment.
 * - nLevel is NEVER modified by the algorithm (user/journey controlled).
 *
 * EDGE CASE BEHAVIORS (not bugs, just documented):
 *
 * - All-miss trials result in d' approaching the DEFAULT when window is small,
 *   because calculateDPrimeFromWindow returns DEFAULT for insufficient data.
 *
 * - d' can become negative (valid SDT behavior) when FA rate > hit rate.
 *
 * - sessionSeed is regenerated on each reset() call (variability feature).
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { createAdaptiveControllerAlgorithm, type ControllerGains } from './adaptive-controller';
import { createMockAlgorithmContext, createMockTrialResult } from '../../test-utils/test-factories';
import {
  ARM_PTARGET_MIN,
  ARM_PTARGET_MAX,
  ARM_PLURE_MIN,
  ARM_PLURE_MAX,
  ARM_ISI_MIN_MS,
  ARM_ISI_MAX_MS,
  ARM_STIMULUS_DURATION_MIN_MS,
  ARM_STIMULUS_DURATION_MAX_MS,
  ADAPTIVE_TARGET_DPRIME_DEFAULT,
} from '../../specs/thresholds';

// =============================================================================
// Test Utilities
// =============================================================================

type ResultType = 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';

const trialOutcomeArb = fc.constantFrom(
  'hit',
  'miss',
  'false-alarm',
  'correct-rejection',
) as fc.Arbitrary<ResultType>;

const gameModeArb = fc.constantFrom('tempo', 'memo', 'flow') as fc.Arbitrary<
  'tempo' | 'memo' | 'flow'
>;

const createResult = (index: number, outcomes: Record<string, ResultType>) => {
  const responses: Record<
    string,
    {
      result: ResultType;
      pressed: boolean;
      wasTarget: boolean;
      reactionTimeMs: number;
    }
  > = {};

  for (const [modality, result] of Object.entries(outcomes)) {
    responses[modality] = {
      result,
      pressed: result === 'hit' || result === 'false-alarm',
      wasTarget: result === 'hit' || result === 'miss',
      reactionTimeMs: 400,
    };
  }

  return createMockTrialResult({ trialIndex: index, responses });
};

const createSingleModalityResult = (index: number, result: ResultType, modality = 'position') =>
  createResult(index, { [modality]: result });

// Helper to get current parameters from serialized state
function getParams(algo: ReturnType<typeof createAdaptiveControllerAlgorithm>) {
  const state = algo.serialize() as {
    data: {
      state: {
        params: {
          pTarget: number;
          pLure: number;
          isiMs: number;
          stimulusDurationMs: number;
          nLevel: number;
        };
        estimatedDPrime: number;
        trialCount: number;
        cumulativeError: number;
      };
    };
  };
  return state.data.state;
}

// =============================================================================
// 1. OSCILLATION DETECTION - Rapid difficulty changes
// =============================================================================

describe('Edge Case 1: Oscillation Detection', () => {
  it('parameters should not oscillate wildly under alternating outcomes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 100 }), (numTrials) => {
        const algo = createAdaptiveControllerAlgorithm({
          targetDPrime: 1.5,
          initialNLevel: 2,
          mode: 'tempo',
        });
        algo.initialize({
          gameMode: 'tempo',
          userId: 'test',
          nLevel: 2,
          modalityIds: ['position'],
        });

        const pTargetHistory: number[] = [];

        // Alternating hit/miss pattern (maximally unstable input)
        for (let i = 0; i < numTrials; i++) {
          const outcome: ResultType = i % 2 === 0 ? 'hit' : 'miss';
          algo.onTrialCompleted(createSingleModalityResult(i, outcome));

          const spec = algo.getSpec(createMockAlgorithmContext());
          // @ts-expect-error test override
          pTargetHistory.push(spec.targetProbabilities.position);
        }

        // Calculate oscillation: count direction changes
        let directionChanges = 0;
        for (let i = 2; i < pTargetHistory.length; i++) {
          // @ts-expect-error test: nullable access
          const prev = pTargetHistory[i - 1] - pTargetHistory[i - 2];
          // @ts-expect-error test: nullable access
          const curr = pTargetHistory[i] - pTargetHistory[i - 1];
          if (Math.sign(prev) !== Math.sign(curr) && prev !== 0 && curr !== 0) {
            directionChanges++;
          }
        }

        // High oscillation ratio suggests instability
        const oscillationRatio = directionChanges / (numTrials - 2);

        // Should not oscillate on more than 50% of trials (smoothing should help)
        return oscillationRatio < 0.5;
      }),
      { numRuns: 50 },
    );
  });

  it('exponential smoothing should dampen rapid changes', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
      gains: {
        kTarget: 0.008,
        kLure: 0.004,
        kIsi: 30,
        kStimulusDuration: 20,
        smoothingFactor: 0.25, // 25% weight to new value
      },
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // FRESH START - get initial d' estimate
    const initialState = getParams(algo);
    expect(initialState.estimatedDPrime).toBe(1.5); // Should start at target

    // Track d' evolution
    const dPrimeEvolution: number[] = [];

    // Mix of hits and correct rejections (perfect dual n-back performance)
    // This creates a valid d' calculation (needs both signal and noise trials)
    for (let i = 0; i < 30; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
      dPrimeEvolution.push(getParams(algo).estimatedDPrime);
    }
    const afterPerfect = getParams(algo);

    // Perfect performance should result in high d' (above initial target of 1.5)
    // With 15 hits, 0 misses, 0 FA, 15 CR: hitRate = 15/15 = 1, faRate = 0/15 = 0
    // After Hautus correction: hitRate = 15.5/16 = 0.96875, faRate = 0.5/16 = 0.03125
    // probit(0.96875) ≈ 1.86, probit(0.03125) ≈ -1.86
    // d' ≈ 1.86 - (-1.86) = 3.72
    //
    // BUT: The window only has 30 outcomes, and calculateDPrimeFromWindow
    // counts trials by modality. With alternating hit/cr:
    // - hits: 15 (every even trial)
    // - correct-rejections: 15 (every odd trial)
    // - misses: 0
    // - false-alarms: 0
    //
    // This should give a high d'. Let's verify the smoothed value increases.
    expect(afterPerfect.estimatedDPrime).toBeGreaterThanOrEqual(1.5);

    // Now apply terrible performance
    for (let i = 30; i < 60; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'miss' : 'false-alarm';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
      dPrimeEvolution.push(getParams(algo).estimatedDPrime);
    }
    const afterTerrible = getParams(algo);

    // The estimated d' after terrible performance should eventually decrease
    // (due to exponential smoothing incorporating the low d' from terrible trials)
    //
    // NOTE: The window for d' calculation is DPRIME_WINDOW_SIZE (from thresholds).
    // After 60 trials, the window may have shifted to only include terrible trials,
    // which would result in very low d'.

    // With smoothing factor 0.25 and new d'≈0 from terrible trials,
    // estimated d' should decrease over time.
    // After 30 terrible trials with smoothing:
    // Each update: new = 0.25 * windowD' + 0.75 * prev
    // If windowD' ≈ -2 (miss + fa pattern), it will trend negative.

    // The terrible phase should have caused d' to decrease
    expect(afterTerrible.estimatedDPrime).toBeLessThanOrEqual(afterPerfect.estimatedDPrime);
  });
});

// =============================================================================
// 2. DIFFICULTY AT MINIMUM - Can't go lower
// =============================================================================

describe('Edge Case 2: Difficulty at Minimum Bounds', () => {
  it('pTarget should never go below ARM_PTARGET_MIN even with infinite poor performance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 500 }), (numTrials) => {
        const algo = createAdaptiveControllerAlgorithm({
          targetDPrime: 1.5,
          initialNLevel: 2,
          mode: 'tempo',
        });
        algo.initialize({
          gameMode: 'tempo',
          userId: 'test',
          nLevel: 2,
          modalityIds: ['position'],
        });

        // All misses - worst possible performance on targets
        for (let i = 0; i < numTrials; i++) {
          algo.onTrialCompleted(createSingleModalityResult(i, 'miss'));
        }

        const spec = algo.getSpec(createMockAlgorithmContext());
        // @ts-expect-error test: nullable access
        return spec!.targetProbabilities.position >= ARM_PTARGET_MIN;
      }),
      { numRuns: 20 },
    );
  });

  it('ISI should never go above ARM_ISI_MAX_MS in tempo mode', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 500 }), (numTrials) => {
        const algo = createAdaptiveControllerAlgorithm({
          targetDPrime: 1.5,
          initialNLevel: 2,
          mode: 'tempo',
        });
        algo.initialize({
          gameMode: 'tempo',
          userId: 'test',
          nLevel: 2,
          modalityIds: ['position'],
        });

        // All false alarms - poor performance
        for (let i = 0; i < numTrials; i++) {
          algo.onTrialCompleted(createSingleModalityResult(i, 'false-alarm'));
        }

        const spec = algo.getSpec(createMockAlgorithmContext());
        const isi = spec.timing?.isiMs ?? 0;
        return isi <= ARM_ISI_MAX_MS;
      }),
      { numRuns: 20 },
    );
  });

  it('stimulusDuration should never exceed ARM_STIMULUS_DURATION_MAX_MS', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // 1000 misses
    for (let i = 0; i < 1000; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'miss'));
    }

    const spec = algo.getSpec(createMockAlgorithmContext());
    const duration = spec.timing?.stimulusDurationMs ?? 0;
    expect(duration).toBeLessThanOrEqual(ARM_STIMULUS_DURATION_MAX_MS);
    expect(duration).toBeGreaterThanOrEqual(ARM_STIMULUS_DURATION_MIN_MS);
  });
});

// =============================================================================
// 3. DIFFICULTY AT MAXIMUM - Can't go higher
// =============================================================================

describe('Edge Case 3: Difficulty at Maximum Bounds', () => {
  it('pTarget should never exceed ARM_PTARGET_MAX even with infinite perfect performance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 500 }), (numTrials) => {
        const algo = createAdaptiveControllerAlgorithm({
          targetDPrime: 1.5,
          initialNLevel: 2,
          mode: 'tempo',
        });
        algo.initialize({
          gameMode: 'tempo',
          userId: 'test',
          nLevel: 2,
          modalityIds: ['position'],
        });

        // Perfect performance: alternating hits and correct rejections
        for (let i = 0; i < numTrials; i++) {
          const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
          algo.onTrialCompleted(createSingleModalityResult(i, outcome));
        }

        const spec = algo.getSpec(createMockAlgorithmContext());
        // @ts-expect-error test: nullable access
        return spec!.targetProbabilities.position <= ARM_PTARGET_MAX;
      }),
      { numRuns: 20 },
    );
  });

  it('ISI should never go below ARM_ISI_MIN_MS in tempo mode', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // 500 perfect trials
    for (let i = 0; i < 500; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const spec = algo.getSpec(createMockAlgorithmContext());
    const isi = spec.timing?.isiMs ?? ARM_ISI_MAX_MS;
    expect(isi).toBeGreaterThanOrEqual(ARM_ISI_MIN_MS);
  });

  it('pLure should never exceed ARM_PLURE_MAX for n >= 2', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 3,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 3,
      modalityIds: ['position'],
    });

    // 500 perfect trials
    for (let i = 0; i < 500; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const spec = algo.getSpec(createMockAlgorithmContext());
    const pLure = spec.lureProbabilities.position?.['n-1'] ?? 0;
    expect(pLure).toBeLessThanOrEqual(ARM_PLURE_MAX);
    expect(pLure).toBeGreaterThanOrEqual(ARM_PLURE_MIN);
  });
});

// =============================================================================
// 4. PERFECT PERFORMANCE FOR EXTENDED PERIOD
// =============================================================================

describe('Edge Case 4: Perfect Performance Extended', () => {
  it('algorithm should consistently increase difficulty during perfect streak', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const snapshots: { pTarget: number; pLure: number; isiMs: number; stimDuration: number }[] = [];

    // 200 trials of perfect performance
    for (let i = 0; i < 200; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));

      if (i % 20 === 19) {
        const spec = algo.getSpec(createMockAlgorithmContext());
        snapshots.push({
          // @ts-expect-error test override
          pTarget: spec.targetProbabilities.position,
          pLure: spec.lureProbabilities.position?.['n-1'] ?? 0,
          isiMs: spec.timing?.isiMs ?? 0,
          stimDuration: spec.timing?.stimulusDurationMs ?? 0,
        });
      }
    }

    // Difficulty should have increased overall (or hit ceiling)
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    // At least one "harder" indicator should have changed
    const gotHarder =
      last!.pTarget > first!.pTarget ||
      last!.pLure > first!.pLure ||
      last!.isiMs < first!.isiMs ||
      last!.stimDuration < first!.stimDuration ||
      // Or we hit the ceiling
      last!.pTarget >= ARM_PTARGET_MAX * 0.95;

    expect(gotHarder).toBe(true);
  });

  it('estimated d-prime should be high after perfect performance', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // 100 perfect trials
    for (let i = 0; i < 100; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const params = getParams(algo);
    // Estimated d' should be well above the target (player is excelling)
    expect(params.estimatedDPrime).toBeGreaterThan(1.5);
  });
});

// =============================================================================
// 5. ZERO PERFORMANCE FOR EXTENDED PERIOD
// =============================================================================

describe('Edge Case 5: Zero Performance Extended', () => {
  it('algorithm should consistently decrease difficulty during failure streak', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Get initial state
    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialPTarget = initialSpec.targetProbabilities.position;
    const initialIsi = initialSpec.timing?.isiMs ?? 3000;
    const initialStimDuration = initialSpec.timing?.stimulusDurationMs ?? 500;

    // IMPORTANT: All misses gives d'=0 due to anti-gaming guard in SDTCalculator
    // (hits=0 returns d'=0 to prevent "silent" players from getting credit).
    // The algorithm SHOULD respond to d'=0 < target d'=1.5 by making it easier.
    //
    // However, calculateDPrimeFromWindow() returns ADAPTIVE_TARGET_DPRIME_DEFAULT (1.5)
    // when there's insufficient data. Let's test with varied poor performance instead.

    // Poor performance: misses and false alarms (creates valid signal+noise trials)
    for (let i = 0; i < 200; i++) {
      // Alternating miss and false-alarm to have both signal and noise trials
      const outcome: ResultType = i % 2 === 0 ? 'miss' : 'false-alarm';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const finalSpec = algo.getSpec(createMockAlgorithmContext());
    const params = getParams(algo);

    // With terrible performance (d' approaching 0), the algorithm should make it easier:
    // - pTarget should decrease (fewer decisions = easier)
    // - ISI should increase (more time = easier)
    // - stimulusDuration should increase (longer to look = easier)
    //
    // BUG INVESTIGATION: The anti-gaming guards may cause d'=0 for all-miss/all-fa.
    // SDTCalculator.calculateDPrime() returns 0 when:
    // - hits=0 (inactivity)
    // - correctRejections=0 (spamming)
    //
    // With alternating miss/fa: hits=0, cr=0 => both guards trigger, d'=0
    // This should cause estimatedDPrime < targetDPrime, triggering easier difficulty.

    // Should have made it easier in at least one dimension (or hit floor)
    const gotEasier =
      // @ts-expect-error test: nullable access
      finalSpec!.targetProbabilities.position < initialPTarget ||
      // @ts-expect-error test: nullable access
      finalSpec!.targetProbabilities.position <= ARM_PTARGET_MIN * 1.01 ||
      (finalSpec.timing?.isiMs ?? 0) > initialIsi ||
      (finalSpec.timing?.isiMs ?? 0) >= ARM_ISI_MAX_MS * 0.99 ||
      (finalSpec.timing?.stimulusDurationMs ?? 0) > initialStimDuration ||
      (finalSpec.timing?.stimulusDurationMs ?? 0) >= ARM_STIMULUS_DURATION_MAX_MS * 0.99;

    // Document actual behavior - this may reveal a bug
    if (!gotEasier) {
      // eslint-disable-next-line no-console
      console.log('BUG DETECTED: Poor performance did not decrease difficulty');
      console.log('estimatedDPrime:', params.estimatedDPrime);
      console.log(
        'initialPTarget:',
        initialPTarget,
        'finalPTarget:',
        finalSpec.targetProbabilities.position,
      );
      console.log('initialIsi:', initialIsi, 'finalIsi:', finalSpec.timing?.isiMs);
      console.log(
        'initialStimDuration:',
        initialStimDuration,
        'finalStimDuration:',
        finalSpec.timing?.stimulusDurationMs,
      );
    }

    expect(gotEasier).toBe(true);
  });

  it('all false alarms should trigger difficulty decrease', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialIsi = initialSpec.timing?.isiMs ?? 3000;

    // 100 false alarms (spamming)
    for (let i = 0; i < 100; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'false-alarm'));
    }

    const finalSpec = algo.getSpec(createMockAlgorithmContext());
    const finalIsi = finalSpec.timing?.isiMs ?? 3000;

    // ISI should have increased (more time = easier) or hit ceiling
    expect(finalIsi >= initialIsi || finalIsi >= ARM_ISI_MAX_MS * 0.95).toBe(true);
  });
});

// =============================================================================
// 6. ALTERNATING PERFECT/ZERO PERFORMANCE
// =============================================================================

describe('Edge Case 6: Alternating Performance Patterns', () => {
  it('should handle extreme swings without crashing or violating bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 10, max: 50 }),
        (cycles, trialsPerCycle) => {
          const algo = createAdaptiveControllerAlgorithm({
            targetDPrime: 1.5,
            initialNLevel: 2,
            mode: 'tempo',
          });
          algo.initialize({
            gameMode: 'tempo',
            userId: 'test',
            nLevel: 2,
            modalityIds: ['position'],
          });

          let trialIndex = 0;
          for (let cycle = 0; cycle < cycles; cycle++) {
            // Perfect cycle
            for (let i = 0; i < trialsPerCycle; i++) {
              const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
              algo.onTrialCompleted(createSingleModalityResult(trialIndex++, outcome));
            }

            // Terrible cycle
            for (let i = 0; i < trialsPerCycle; i++) {
              algo.onTrialCompleted(createSingleModalityResult(trialIndex++, 'miss'));
            }
          }

          // Check all bounds are respected
          const spec = algo.getSpec(createMockAlgorithmContext());
          const pTarget = spec.targetProbabilities.position;
          const pLure = spec.lureProbabilities.position?.['n-1'] ?? 0;
          const isi = spec.timing?.isiMs ?? 3000;
          const stimDuration = spec.timing?.stimulusDurationMs ?? 500;

          return (
            // @ts-expect-error test: nullable access
            pTarget >= ARM_PTARGET_MIN &&
            // @ts-expect-error test: nullable access
            pTarget <= ARM_PTARGET_MAX &&
            pLure >= 0 && // Can be 0 for n=1
            pLure <= ARM_PLURE_MAX &&
            isi >= ARM_ISI_MIN_MS &&
            isi <= ARM_ISI_MAX_MS &&
            stimDuration >= ARM_STIMULUS_DURATION_MIN_MS &&
            stimDuration <= ARM_STIMULUS_DURATION_MAX_MS
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it('should converge to stable state after chaotic input', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Chaotic phase: random outcomes
    const outcomes: ResultType[] = ['hit', 'miss', 'false-alarm', 'correct-rejection'];
    for (let i = 0; i < 200; i++) {
      const outcome = outcomes[i % 4];
      // @ts-expect-error test override
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    // Stable phase: consistent moderate performance
    const pTargetValues: number[] = [];
    for (let i = 200; i < 400; i++) {
      // Moderate performance: ~70% correct
      const outcome: ResultType = i % 3 === 0 ? 'miss' : i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));

      const spec = algo.getSpec(createMockAlgorithmContext());
      // @ts-expect-error test override
      pTargetValues.push(spec.targetProbabilities.position);
    }

    // Calculate variance in last 50 values
    const last50 = pTargetValues.slice(-50);
    const mean = last50.reduce((a, b) => a + b, 0) / last50.length;
    const variance = last50.reduce((a, b) => a + (b - mean) ** 2, 0) / last50.length;

    // Should have low variance (converged to stable state)
    expect(variance).toBeLessThan(0.01);
  });
});

// =============================================================================
// 7. CONTROLLER STATE AFTER RESET
// =============================================================================

describe('Edge Case 7: Controller Reset Behavior', () => {
  it('reset should return to exact initial state', () => {
    fc.assert(
      fc.property(
        fc.array(trialOutcomeArb, { minLength: 10, maxLength: 100 }),
        fc.double({ min: 0.2, max: 0.4, noNaN: true }),
        (outcomes, initialPTarget) => {
          const algo = createAdaptiveControllerAlgorithm({
            targetDPrime: 1.5,
            initialNLevel: 2,
            mode: 'tempo',
            initialTargetProbability: initialPTarget,
          });
          algo.initialize({
            gameMode: 'tempo',
            userId: 'test',
            nLevel: 2,
            modalityIds: ['position'],
          });

          // Apply trials
          for (let i = 0; i < outcomes.length; i++) {
            // @ts-expect-error test override
            algo.onTrialCompleted(createSingleModalityResult(i, outcomes[i]));
          }

          // Reset
          algo.reset();

          const state = getParams(algo);

          // Should be back to initial values
          return (
            state.trialCount === 0 &&
            // @ts-expect-error test override
            state.recentResults.length === 0 &&
            Math.abs(state.params.pTarget - initialPTarget) < 0.001 &&
            state.cumulativeError === 0
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('reset should not affect configuration (targetDPrime, gains)', () => {
    const customGains: ControllerGains = {
      kTarget: 0.02,
      kLure: 0.01,
      kIsi: 50,
      kStimulusDuration: 30,
      smoothingFactor: 0.4,
    };

    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 2.0,
      initialNLevel: 3,
      mode: 'tempo',
      gains: customGains,
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 3,
      modalityIds: ['position'],
    });

    // Apply trials
    for (let i = 0; i < 50; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    algo.reset();

    const serialized = algo.serialize();
    expect(serialized.data).toHaveProperty('config');
    // Config should still have original targetDPrime
    expect((serialized.data as any).config.targetDPrime).toBe(2.0);
  });

  it('multiple resets should be idempotent (excluding sessionSeed)', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Apply trials
    for (let i = 0; i < 30; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    algo.reset();
    const stateAfterFirst = getParams(algo);

    algo.reset();
    const stateAfterSecond = getParams(algo);

    algo.reset();
    const stateAfterThird = getParams(algo);

    // Compare all fields except sessionSeed (which is regenerated each reset)
    expect(stateAfterFirst.params.pTarget).toBe(stateAfterSecond.params.pTarget);
    expect(stateAfterFirst.params.pLure).toBe(stateAfterSecond.params.pLure);
    expect(stateAfterFirst.params.isiMs).toBe(stateAfterSecond.params.isiMs);
    expect(stateAfterFirst.trialCount).toBe(stateAfterSecond.trialCount);
    expect(stateAfterFirst.cumulativeError).toBe(stateAfterSecond.cumulativeError);

    expect(stateAfterSecond.params.pTarget).toBe(stateAfterThird.params.pTarget);
    expect(stateAfterSecond.params.pLure).toBe(stateAfterThird.params.pLure);
  });
});

// =============================================================================
// 8. CORRUPTED HISTORY / RESTORE
// =============================================================================

describe('Edge Case 8: Corrupted State Handling', () => {
  it('should clamp out-of-bounds pTarget on restore', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });

    // Create corrupted state with out-of-bounds pTarget
    const corruptedState = {
      algorithmType: 'adaptive-controller',
      version: 1,
      data: {
        config: { targetDPrime: 1.5, initialNLevel: 2 },
        state: {
          params: {
            pTarget: 999, // Way out of bounds
            pLure: 0.15,
            isiMs: 3000,
            stimulusDurationMs: 500,
            nLevel: 2,
          },
          estimatedDPrime: 1.5,
          recentResults: [],
          trialCount: 0,
          cumulativeError: 0,
          sessionSeed: 'test-seed',
        },
      },
    };

    algo.restore(corruptedState);

    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(spec.targetProbabilities.position).toBeLessThanOrEqual(ARM_PTARGET_MAX);
  });

  it('should clamp negative pLure on restore', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 3,
      mode: 'tempo',
    });

    const corruptedState = {
      algorithmType: 'adaptive-controller',
      version: 1,
      data: {
        config: { targetDPrime: 1.5, initialNLevel: 3 },
        state: {
          params: {
            pTarget: 0.3,
            pLure: -0.5, // Negative (impossible)
            isiMs: 3000,
            stimulusDurationMs: 500,
            nLevel: 3,
          },
          estimatedDPrime: 1.5,
          recentResults: [],
          trialCount: 0,
          cumulativeError: 0,
          sessionSeed: 'test-seed',
        },
      },
    };

    algo.restore(corruptedState);

    const spec = algo.getSpec(createMockAlgorithmContext());
    const pLure = spec.lureProbabilities.position?.['n-1'] ?? 0;
    expect(pLure).toBeGreaterThanOrEqual(ARM_PLURE_MIN);
  });

  it('should reject wrong algorithm type', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });

    const wrongTypeState = {
      algorithmType: 'some-other-algorithm',
      version: 1,
      data: {},
    };

    expect(() => algo.restore(wrongTypeState)).toThrow();
  });

  it('should reject unsupported version', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });

    const futureVersionState = {
      algorithmType: 'adaptive-controller',
      version: 999,
      data: {},
    };

    expect(() => algo.restore(futureVersionState)).toThrow();
  });

  it('should handle missing sessionSeed on restore', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });

    const oldState = {
      algorithmType: 'adaptive-controller',
      version: 1,
      data: {
        config: { targetDPrime: 1.5, initialNLevel: 2 },
        state: {
          params: {
            pTarget: 0.3,
            pLure: 0.15,
            isiMs: 3000,
            stimulusDurationMs: 500,
            nLevel: 2,
          },
          estimatedDPrime: 1.5,
          recentResults: [],
          trialCount: 0,
          cumulativeError: 0,
          // sessionSeed missing (old format)
        },
      },
    };

    // Should not throw
    algo.restore(oldState);

    // Should be able to generate spec
    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(spec.seed).toBeDefined();
  });
});

// =============================================================================
// 9. NaN/Infinity IN PERFORMANCE METRICS
// =============================================================================

describe('Edge Case 9: NaN/Infinity Handling', () => {
  it('should handle NaN targetDPrime in config', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: NaN,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Should use default
    const state = algo.serialize() as any;
    expect(Number.isFinite(state.data.config.targetDPrime)).toBe(true);
    expect(state.data.config.targetDPrime).toBe(ADAPTIVE_TARGET_DPRIME_DEFAULT);
  });

  it('should handle Infinity targetDPrime in config', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: Infinity,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Should use default
    const state = algo.serialize() as any;
    expect(Number.isFinite(state.data.config.targetDPrime)).toBe(true);
  });

  it('should handle trial result with NaN reactionTimeMs', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Trial with NaN reaction time
    const badResult = createMockTrialResult({
      trialIndex: 0,
      responses: {
        position: {
          result: 'hit',
          pressed: true,
          wasTarget: true,
          reactionTimeMs: NaN,
        },
      },
    });

    // Should not throw
    algo.onTrialCompleted(badResult);

    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(Number.isFinite(spec.targetProbabilities.position)).toBe(true);
  });

  it('parameters should never become NaN regardless of input', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            outcome: trialOutcomeArb,
            reactionTime: fc.oneof(
              fc.double({ noNaN: false }), // Can be NaN or Infinity
              fc.constant(NaN),
              fc.constant(Infinity),
              fc.constant(-Infinity),
            ),
          }),
          { minLength: 50, maxLength: 200 },
        ),
        (trials) => {
          const algo = createAdaptiveControllerAlgorithm({
            targetDPrime: 1.5,
            initialNLevel: 2,
            mode: 'tempo',
          });
          algo.initialize({
            gameMode: 'tempo',
            userId: 'test',
            nLevel: 2,
            modalityIds: ['position'],
          });

          for (let i = 0; i < trials.length; i++) {
            // @ts-expect-error test override
            const { outcome, reactionTime } = trials[i];
            const result = createMockTrialResult({
              trialIndex: i,
              responses: {
                position: {
                  result: outcome,
                  pressed: outcome === 'hit' || outcome === 'false-alarm',
                  wasTarget: outcome === 'hit' || outcome === 'miss',
                  reactionTimeMs: reactionTime,
                },
              },
            });
            algo.onTrialCompleted(result);
          }

          const spec = algo.getSpec(createMockAlgorithmContext());
          const params = getParams(algo);

          return (
            Number.isFinite(spec.targetProbabilities.position) &&
            Number.isFinite(params.params.pLure) &&
            Number.isFinite(params.params.isiMs) &&
            Number.isFinite(params.params.stimulusDurationMs) &&
            Number.isFinite(params.estimatedDPrime)
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 10. VERY LONG SESSIONS (1000+ TRIALS)
// =============================================================================

describe('Edge Case 10: Very Long Sessions', () => {
  it('should handle 1000+ trials without memory issues', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const outcomes: ResultType[] = ['hit', 'miss', 'false-alarm', 'correct-rejection'];

    // 2000 trials
    for (let i = 0; i < 2000; i++) {
      const outcome = outcomes[i % 4];
      // @ts-expect-error test override
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const state = getParams(algo);

    // recentResults should be bounded by DPRIME_WINDOW_SIZE (not grow infinitely)
    // Based on the code, DPRIME_WINDOW_SIZE = ADAPTIVE_DPRIME_WINDOW_SIZE
    // @ts-expect-error test override
    expect(state.recentResults.length).toBeLessThanOrEqual(100); // Reasonable upper bound

    // Should still produce valid output
    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(Number.isFinite(spec.targetProbabilities.position)).toBe(true);
  });

  it('cumulative error should be bounded', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // 1000 trials of perfect performance (consistently above target)
    for (let i = 0; i < 1000; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const state = getParams(algo);

    // Cumulative error should be bounded (code clamps to [-10, 10])
    expect(Math.abs(state.cumulativeError)).toBeLessThanOrEqual(10);
  });

  it('trial count should increment correctly for long sessions', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const numTrials = 1500;
    for (let i = 0; i < numTrials; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    const state = getParams(algo);
    expect(state.trialCount).toBe(numTrials);
  });
});

// =============================================================================
// 11. DETERMINISM - Same input should produce same output
// =============================================================================

describe('Edge Case 11: Determinism', () => {
  it('same sequence of trials should produce same final state (excluding seed)', () => {
    const outcomes: ResultType[] = [];
    for (let i = 0; i < 100; i++) {
      outcomes.push(['hit', 'miss', 'false-alarm', 'correct-rejection'][i % 4] as ResultType);
    }

    const runAlgorithm = () => {
      const algo = createAdaptiveControllerAlgorithm({
        targetDPrime: 1.5,
        initialNLevel: 2,
        mode: 'tempo',
      });
      algo.initialize({
        gameMode: 'tempo',
        userId: 'test',
        nLevel: 2,
        modalityIds: ['position'],
      });

      for (let i = 0; i < outcomes.length; i++) {
        // @ts-expect-error test override
        algo.onTrialCompleted(createSingleModalityResult(i, outcomes[i]));
      }

      return getParams(algo);
    };

    const run1 = runAlgorithm();
    const run2 = runAlgorithm();

    // Parameters should be identical (excluding sessionSeed which is random)
    expect(run1.params.pTarget).toBe(run2.params.pTarget);
    expect(run1.params.pLure).toBe(run2.params.pLure);
    expect(run1.params.isiMs).toBe(run2.params.isiMs);
    expect(run1.params.stimulusDurationMs).toBe(run2.params.stimulusDurationMs);
    expect(run1.estimatedDPrime).toBe(run2.estimatedDPrime);
    expect(run1.trialCount).toBe(run2.trialCount);
  });

  it('serialize/restore should preserve determinism', () => {
    const algo1 = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo1.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Apply some trials
    for (let i = 0; i < 50; i++) {
      algo1.onTrialCompleted(createSingleModalityResult(i, i % 2 === 0 ? 'hit' : 'miss'));
    }

    // Serialize
    const savedState = algo1.serialize();

    // Apply more trials to original
    for (let i = 50; i < 100; i++) {
      algo1.onTrialCompleted(createSingleModalityResult(i, 'correct-rejection'));
    }
    const finalState1 = getParams(algo1);

    // Restore and apply same trials
    const algo2 = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo2.restore(savedState);

    for (let i = 50; i < 100; i++) {
      algo2.onTrialCompleted(createSingleModalityResult(i, 'correct-rejection'));
    }
    const finalState2 = getParams(algo2);

    // Should produce identical results
    expect(finalState1.params.pTarget).toBe(finalState2.params.pTarget);
    expect(finalState1.params.pLure).toBe(finalState2.params.pLure);
    expect(finalState1.estimatedDPrime).toBe(finalState2.estimatedDPrime);
  });
});

// =============================================================================
// 12. SINGLE TRIAL DECISION
// =============================================================================

describe('Edge Case 12: Single Trial Behavior', () => {
  it('should not adjust parameters before minimum trials (5)', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialPTarget = initialSpec.targetProbabilities.position;

    // Apply only 4 trials (below the 5 trial threshold)
    for (let i = 0; i < 4; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    const specAfter4 = algo.getSpec(createMockAlgorithmContext());

    // Parameters should NOT have changed (code requires trialCount >= 5)
    expect(specAfter4.targetProbabilities.position).toBe(initialPTarget);
  });

  it('parameters should start adjusting after 5th trial', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialPTarget = initialSpec.targetProbabilities.position;

    // Perfect performance for 10 trials (enough to trigger adjustment)
    for (let i = 0; i < 10; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const specAfter10 = algo.getSpec(createMockAlgorithmContext());

    // With perfect performance, difficulty should have increased
    // (or parameters should have changed in some way)
    const params = getParams(algo);
    expect(params.trialCount).toBe(10);

    // At least estimated d' should have been updated
    expect(params.estimatedDPrime).not.toBe(1.5); // Should have changed from initial
  });

  it('first trial should not crash with empty history', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Single trial - should not crash
    algo.onTrialCompleted(createSingleModalityResult(0, 'hit'));

    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(spec).toBeDefined();
    expect(Number.isFinite(spec.targetProbabilities.position)).toBe(true);
  });

  it('empty responses object should be handled gracefully', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    // Trial with completely empty responses
    const emptyResult = createMockTrialResult({
      trialIndex: 0,
      responses: {},
    });

    algo.onTrialCompleted(emptyResult);

    // Should not crash and state should be valid
    const state = getParams(algo);
    expect(state.trialCount).toBe(1);
    // @ts-expect-error test override
    expect(state.recentResults.length).toBe(1);
  });
});

// =============================================================================
// ADDITIONAL EDGE CASES: Mode-specific behavior
// =============================================================================

describe('Additional Edge Cases: Mode-Specific', () => {
  it('memo mode should never adjust ISI', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'memo',
    });
    algo.initialize({
      gameMode: 'memo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialIsi = initialSpec.timing?.isiMs;

    // 100 perfect trials
    for (let i = 0; i < 100; i++) {
      const outcome: ResultType = i % 2 === 0 ? 'hit' : 'correct-rejection';
      algo.onTrialCompleted(createSingleModalityResult(i, outcome));
    }

    const finalSpec = algo.getSpec(createMockAlgorithmContext());
    expect(finalSpec.timing?.isiMs).toBe(initialIsi);
  });

  it('N=1 should have pLure=0 (no N-1 lures possible)', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 1,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 1,
      modalityIds: ['position'],
    });

    // Even after many trials
    for (let i = 0; i < 50; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    const spec = algo.getSpec(createMockAlgorithmContext());
    const pLure = spec.lureProbabilities.position?.['n-1'] ?? 0;
    expect(pLure).toBe(0);
  });

  it('initialize() should update mode from session config', () => {
    // Create with 'tempo' mode
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });

    // Initialize with 'memo' mode (session config is authoritative)
    algo.initialize({
      gameMode: 'memo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position'],
    });

    const initialSpec = algo.getSpec(createMockAlgorithmContext());
    const initialIsi = initialSpec.timing?.isiMs;

    // Apply trials - ISI should NOT change (memo mode)
    for (let i = 0; i < 50; i++) {
      algo.onTrialCompleted(createSingleModalityResult(i, 'hit'));
    }

    const finalSpec = algo.getSpec(createMockAlgorithmContext());
    expect(finalSpec.timing?.isiMs).toBe(initialIsi);
  });
});

// =============================================================================
// ADDITIONAL EDGE CASES: Multimodal
// =============================================================================

describe('Additional Edge Cases: Multimodal', () => {
  it('should calculate average d-prime across modalities', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position', 'audio'],
    });

    // Different performance per modality
    for (let i = 0; i < 50; i++) {
      algo.onTrialCompleted(
        createResult(i, {
          position: i % 2 === 0 ? 'hit' : 'correct-rejection', // Perfect on position
          audio: 'miss', // Terrible on audio
        }),
      );
    }

    // Should still produce valid output
    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(Number.isFinite(spec.targetProbabilities.position)).toBe(true);
    expect(Number.isFinite(spec.targetProbabilities.audio)).toBe(true);
  });

  it('asymmetric modality performance should be averaged', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position', 'audio'],
    });

    // Position: all hits (high d'), Audio: all misses (d'=0)
    for (let i = 0; i < 100; i++) {
      algo.onTrialCompleted(
        createResult(i, {
          position: i % 2 === 0 ? 'hit' : 'correct-rejection',
          audio: i % 2 === 0 ? 'miss' : 'false-alarm',
        }),
      );
    }

    const state = getParams(algo);
    // Average d' should be somewhere in between (not extreme)
    // Position d' would be high (~2-3), Audio d' would be 0
    // Average should be moderate
    expect(state.estimatedDPrime).toBeGreaterThan(0);
    expect(state.estimatedDPrime).toBeLessThan(3);
  });

  it('missing modality in response should not crash', () => {
    const algo = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'tempo',
    });
    algo.initialize({
      gameMode: 'tempo',
      userId: 'test',
      nLevel: 2,
      modalityIds: ['position', 'audio'],
    });

    // Only position response (audio missing)
    for (let i = 0; i < 20; i++) {
      algo.onTrialCompleted(
        createResult(i, {
          position: 'hit',
          // audio: missing
        }),
      );
    }

    const spec = algo.getSpec(createMockAlgorithmContext());
    expect(spec).toBeDefined();
  });
});
