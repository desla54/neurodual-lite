/**
 * Property-Based Tests for AdaptiveControllerAlgorithm
 *
 * Verifies invariants that must hold regardless of input sequence:
 * - Parameter bounds are always respected
 * - Algorithm behaves correctly under adversarial inputs
 * - State transitions are consistent
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { createAdaptiveControllerAlgorithm } from './adaptive-controller';
import { createMockAlgorithmContext, createMockTrialResult } from '../../test-utils/test-factories';

// =============================================================================
// Test Arbitraries
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

const targetDPrimeArb = fc.double({ min: 0.5, max: 3.0, noNaN: true });

const nLevelArb = fc.integer({ min: 1, max: 8 });

const createAlgoResult = (index: number, result: ResultType, modality = 'position') =>
  createMockTrialResult({
    trialIndex: index,
    responses: {
      [modality]: {
        result,
        pressed: result === 'hit' || result === 'false-alarm',
        wasTarget: result === 'hit' || result === 'miss',
        reactionTimeMs: 400,
      },
    },
  });

// =============================================================================
// Parameter Bounds
// =============================================================================

describe('AdaptiveControllerAlgorithm - Property Tests', () => {
  describe('Parameter Bounds Invariants', () => {
    it('pTarget always in [0.15, 0.45] regardless of trial sequence', () => {
      fc.assert(
        fc.property(
          targetDPrimeArb,
          nLevelArb,
          gameModeArb,
          fc.array(trialOutcomeArb, { minLength: 1, maxLength: 100 }),
          (targetDPrime, nLevel, mode, outcomes) => {
            const algo = createAdaptiveControllerAlgorithm({
              targetDPrime,
              initialNLevel: nLevel,
              mode,
            });
            algo.initialize({ gameMode: mode, userId: 'test', nLevel, modalityIds: ['position'] });

            // Apply all trial outcomes
            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            const pTarget = spec.targetProbabilities.position;

            return pTarget! >= 0.15 && pTarget! <= 0.45;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('pLure always in [0.02, 0.25] regardless of trial sequence', () => {
      fc.assert(
        fc.property(
          targetDPrimeArb,
          nLevelArb,
          fc.array(trialOutcomeArb, { minLength: 1, maxLength: 100 }),
          (targetDPrime, nLevel, outcomes) => {
            const algo = createAdaptiveControllerAlgorithm({
              targetDPrime,
              initialNLevel: nLevel,
              mode: 'tempo',
            });
            algo.initialize({
              gameMode: 'tempo',
              userId: 'test',
              nLevel,
              modalityIds: ['position'],
            });

            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            const pLure = spec.lureProbabilities.position?.['n-1'] ?? 0;

            // For n=1, n-1 "lures" are not meaningful (they equal targets),
            // so the algorithm intentionally disables them (pLure=0).
            if (nLevel < 2) return pLure === 0;

            return pLure >= 0.02 && pLure <= 0.25;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('ISI always in [1500, 5000]ms in tempo mode', () => {
      fc.assert(
        fc.property(
          targetDPrimeArb,
          nLevelArb,
          fc.array(trialOutcomeArb, { minLength: 1, maxLength: 100 }),
          (targetDPrime, nLevel, outcomes) => {
            const algo = createAdaptiveControllerAlgorithm({
              targetDPrime,
              initialNLevel: nLevel,
              mode: 'tempo',
            });
            algo.initialize({
              gameMode: 'tempo',
              userId: 'test',
              nLevel,
              modalityIds: ['position'],
            });

            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            const isi = spec.timing?.isiMs ?? 3000;

            return isi >= 1500 && isi <= 5000;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('stimulusDuration always in [250, 1500]ms', () => {
      fc.assert(
        fc.property(
          targetDPrimeArb,
          nLevelArb,
          fc.array(trialOutcomeArb, { minLength: 1, maxLength: 100 }),
          (targetDPrime, nLevel, outcomes) => {
            const algo = createAdaptiveControllerAlgorithm({
              targetDPrime,
              initialNLevel: nLevel,
              mode: 'tempo',
            });
            algo.initialize({
              gameMode: 'tempo',
              userId: 'test',
              nLevel,
              modalityIds: ['position'],
            });

            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            const duration = spec.timing?.stimulusDurationMs ?? 500;

            return duration >= 250 && duration <= 1500;
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('nLevel Invariants', () => {
    it('nLevel is never modified by algorithm (fixed by config)', () => {
      fc.assert(
        fc.property(
          nLevelArb,
          fc.array(trialOutcomeArb, { minLength: 1, maxLength: 50 }),
          (initialN, outcomes) => {
            const algo = createAdaptiveControllerAlgorithm({
              targetDPrime: 1.5,
              initialNLevel: initialN,
              mode: 'tempo',
            });
            algo.initialize({
              gameMode: 'tempo',
              userId: 'test',
              nLevel: initialN,
              modalityIds: ['position'],
            });

            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            return spec.nLevel === initialN;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Mode-Specific Behavior', () => {
    it('ISI does not change in memo mode', () => {
      fc.assert(
        fc.property(fc.array(trialOutcomeArb, { minLength: 10, maxLength: 50 }), (outcomes) => {
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
          const initialIsi = initialSpec.timing?.isiMs ?? 3000;

          for (let i = 0; i < outcomes.length; i++) {
            algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
          }

          const finalSpec = algo.getSpec(createMockAlgorithmContext());
          const finalIsi = finalSpec.timing?.isiMs ?? 3000;

          return initialIsi === finalIsi;
        }),
        { numRuns: 50 },
      );
    });

    it('ISI does not change in flow mode', () => {
      fc.assert(
        fc.property(fc.array(trialOutcomeArb, { minLength: 10, maxLength: 50 }), (outcomes) => {
          const algo = createAdaptiveControllerAlgorithm({
            targetDPrime: 1.5,
            initialNLevel: 2,
            mode: 'flow',
          });
          algo.initialize({
            gameMode: 'flow',
            userId: 'test',
            nLevel: 2,
            modalityIds: ['position'],
          });

          const initialSpec = algo.getSpec(createMockAlgorithmContext());
          const initialIsi = initialSpec.timing?.isiMs ?? 3000;

          for (let i = 0; i < outcomes.length; i++) {
            algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
          }

          const finalSpec = algo.getSpec(createMockAlgorithmContext());
          const finalIsi = finalSpec.timing?.isiMs ?? 3000;

          return initialIsi === finalIsi;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('State Consistency', () => {
    it('reset() restores initial state regardless of previous trials', () => {
      fc.assert(
        fc.property(fc.array(trialOutcomeArb, { minLength: 1, maxLength: 50 }), (outcomes) => {
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
          for (let i = 0; i < outcomes.length; i++) {
            algo.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
          }

          // Reset
          algo.reset();

          const state = algo.serialize() as any;
          return (
            state.data.state.trialCount === 0 &&
            state.data.state.recentResults.length === 0 &&
            Math.abs(state.data.state.params.pTarget - 0.3) < 0.001 &&
            Math.abs(state.data.state.params.pLure - 0.15) < 0.001
          );
        }),
        { numRuns: 50 },
      );
    });

    it('serialize/restore roundtrip preserves state', () => {
      fc.assert(
        fc.property(fc.array(trialOutcomeArb, { minLength: 5, maxLength: 30 }), (outcomes) => {
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

          // Apply trials
          for (let i = 0; i < outcomes.length; i++) {
            algo1.onTrialCompleted(createAlgoResult(i, outcomes[i] as boolean));
          }

          // Serialize and restore
          const savedState = algo1.serialize();
          const algo2 = createAdaptiveControllerAlgorithm({
            targetDPrime: 1.5,
            initialNLevel: 2,
            mode: 'tempo',
          });
          algo2.restore(savedState);

          // Compare specs
          const spec1 = algo1.getSpec(createMockAlgorithmContext());
          const spec2 = algo2.getSpec(createMockAlgorithmContext());

          return (
            spec1.targetProbabilities.position === spec2.targetProbabilities.position &&
            spec1.lureProbabilities.position?.['n-1'] ===
              spec2.lureProbabilities.position?.['n-1'] &&
            spec1.timing?.isiMs === spec2.timing?.isiMs
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Adaptation Direction', () => {
    it("high d' (easy) increases difficulty parameters over time", () => {
      // Simulate all hits (perfect performance) -> should make game harder
      const outcomes = Array(20).fill('hit') as ResultType[];

      const algo = createAdaptiveControllerAlgorithm({
        targetDPrime: 1.5,
        initialNLevel: 2,
        mode: 'tempo',
      });
      algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });

      const initialSpec = algo.getSpec(createMockAlgorithmContext());

      for (let i = 0; i < outcomes.length; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }

      const finalSpec = algo.getSpec(createMockAlgorithmContext());

      // After good performance, pTarget or pLure should have increased (harder)
      // or ISI decreased, or stimulusDuration decreased
      const difficultyIncreased =
        // @ts-expect-error test: nullable access
        finalSpec!.targetProbabilities!.position > initialSpec!.targetProbabilities!.position ||
        (finalSpec.lureProbabilities.position?.['n-1'] ?? 0) >
          (initialSpec.lureProbabilities.position?.['n-1'] ?? 0) ||
        (finalSpec.timing?.isiMs ?? 3000) < (initialSpec.timing?.isiMs ?? 3000) ||
        (finalSpec.timing?.stimulusDurationMs ?? 500) <
          (initialSpec.timing?.stimulusDurationMs ?? 500);

      // Should trend towards harder, but bounds must be respected
      expect(difficultyIncreased || finalSpec.targetProbabilities.position === 0.45).toBe(true);
    });

    it("low d' (hard) decreases difficulty parameters over time", () => {
      // Simulate all misses (poor performance) -> should make game easier
      const algo = createAdaptiveControllerAlgorithm({
        targetDPrime: 1.5,
        initialNLevel: 2,
        mode: 'tempo',
      });
      algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });

      const initialSpec = algo.getSpec(createMockAlgorithmContext());

      // Poor performance: all misses
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, 'miss'));
      }

      const finalSpec = algo.getSpec(createMockAlgorithmContext());

      // After poor performance, parameters should have been adjusted to make it easier
      // (lower pTarget, lower pLure, higher ISI, longer stimulus)
      // Note: Due to anti-gaming guards in d' calculation, all misses gives d'=0
      // which is < 1.5, so it should decrease difficulty (or hit floor)
      const difficultyDecreased =
        // @ts-expect-error test: nullable access
        finalSpec!.targetProbabilities!.position <= initialSpec!.targetProbabilities!.position ||
        finalSpec.targetProbabilities.position === 0.15; // Hit floor

      expect(difficultyDecreased).toBe(true);
    });
  });

  describe('Adversarial Inputs', () => {
    it('handles empty responses gracefully', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (numTrials) => {
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

          for (let i = 0; i < numTrials; i++) {
            algo.onTrialCompleted(
              createMockTrialResult({
                trialIndex: i,
                responses: {}, // Empty responses
              }),
            );
          }

          // Should not throw and spec should be valid
          const spec = algo.getSpec(createMockAlgorithmContext());
          return (
            // @ts-expect-error test: nullable access
            spec!.targetProbabilities!.position >= 0.15 &&
            // @ts-expect-error test: nullable access
            spec!.targetProbabilities!.position <= 0.45 &&
            spec.nLevel === 2
          );
        }),
        { numRuns: 50 },
      );
    });

    it('handles multimodal responses correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              position: trialOutcomeArb,
              audio: trialOutcomeArb,
            }),
            { minLength: 5, maxLength: 30 },
          ),
          (outcomes) => {
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

            for (let i = 0; i < outcomes.length; i++) {
              algo.onTrialCompleted(
                createMockTrialResult({
                  trialIndex: i,
                  responses: {
                    position: {
                      result: outcomes[i]!.position,
                      pressed:
                        outcomes[i]!.position === 'hit' || outcomes[i]!.position === 'false-alarm',
                      wasTarget:
                        outcomes[i]!.position === 'hit' || outcomes[i]!.position === 'miss',
                      reactionTimeMs: 400,
                    },
                    audio: {
                      result: outcomes[i]!.audio,
                      pressed: outcomes[i]!.audio === 'hit' || outcomes[i]!.audio === 'false-alarm',
                      wasTarget: outcomes[i]!.audio === 'hit' || outcomes[i]!.audio === 'miss',
                      reactionTimeMs: 400,
                    },
                  },
                }),
              );
            }

            const spec = algo.getSpec(createMockAlgorithmContext());
            return (
              spec!.targetProbabilities!.position! >= 0.15 &&
              spec!.targetProbabilities!.position! <= 0.45
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
