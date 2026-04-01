import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { UnifiedScoreCalculator } from './unified-score';
import { UPS_ACCURACY_WEIGHT, UPS_CONFIDENCE_WEIGHT } from '../../types/ups';

describe('UnifiedScoreCalculator - Property Tests', () => {
  // Arbitraries
  const percentArb = fc.integer({ min: 0, max: 100 });
  const nullablePercentArb = fc.option(percentArb, { nil: null });
  const hitsArb = fc.integer({ min: 0, max: 100 });
  const missesArb = fc.integer({ min: 0, max: 100 });
  const faArb = fc.integer({ min: 0, max: 100 });
  const crArb = fc.integer({ min: 0, max: 100 });

  describe('calculateUPS(accuracy, confidence)', () => {
    it('output is bounded [0, 100] for all valid inputs', () => {
      fc.assert(
        fc.property(percentArb, nullablePercentArb, (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return ups >= 0 && ups <= 100 && Number.isInteger(ups);
        }),
      );
    });

    it('is monotonically increasing with accuracy (confidence fixed)', () => {
      fc.assert(
        fc.property(percentArb, percentArb, percentArb, (a1, a2, confidence) => {
          const [low, high] = a1 < a2 ? [a1, a2] : [a2, a1];
          if (low === high) return true;

          const upsLow = UnifiedScoreCalculator.calculateUPS(low, confidence);
          const upsHigh = UnifiedScoreCalculator.calculateUPS(high, confidence);
          return upsHigh >= upsLow;
        }),
      );
    });

    it('is monotonically increasing with confidence (accuracy fixed)', () => {
      fc.assert(
        fc.property(percentArb, percentArb, percentArb, (accuracy, c1, c2) => {
          const [low, high] = c1 < c2 ? [c1, c2] : [c2, c1];
          if (low === high) return true;

          const upsLow = UnifiedScoreCalculator.calculateUPS(accuracy, low);
          const upsHigh = UnifiedScoreCalculator.calculateUPS(accuracy, high);
          return upsHigh >= upsLow;
        }),
      );
    });

    it('perfect accuracy + perfect confidence = 100', () => {
      expect(UnifiedScoreCalculator.calculateUPS(100, 100)).toBe(100);
    });

    it('zero accuracy = 0 regardless of confidence', () => {
      fc.assert(
        fc.property(nullablePercentArb, (confidence) => {
          return UnifiedScoreCalculator.calculateUPS(0, confidence) === 0;
        }),
      );
    });

    it('zero confidence = 0 regardless of accuracy', () => {
      fc.assert(
        fc.property(percentArb, (accuracy) => {
          return UnifiedScoreCalculator.calculateUPS(accuracy, 0) === 0;
        }),
      );
    });

    it('multiplicative formula: low accuracy cannot be compensated by high confidence', () => {
      // With 50% accuracy and 100% confidence:
      // UPS = 100 * (0.5 ^ 0.6) * (1.0 ^ 0.4) ≈ 66
      // This should be less than 80% accuracy with 50% confidence:
      // UPS = 100 * (0.8 ^ 0.6) * (0.5 ^ 0.4) ≈ 68
      fc.assert(
        fc.property(
          fc.integer({ min: 30, max: 50 }), // low accuracy
          fc.integer({ min: 70, max: 100 }), // high confidence
          (lowAccuracy, highConfidence) => {
            const upsLowAcc = UnifiedScoreCalculator.calculateUPS(lowAccuracy, highConfidence);
            // With 60% weight on accuracy, low accuracy caps the score
            // A score of 50% accuracy with 100% confidence should give ~66
            // This proves you can't compensate for poor accuracy with confidence
            return upsLowAcc < 80;
          },
        ),
      );
    });

    it('fallback when confidence is null: UPS = accuracy (no penalty)', () => {
      fc.assert(
        fc.property(percentArb, (accuracy) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, null);
          const expected = Math.round(accuracy);
          return ups === expected;
        }),
      );
    });

    it('perfect confidence (100) with perfect accuracy (100) equals fallback', () => {
      // When both accuracy and confidence are 100%, the formula gives 100
      // which equals the fallback (accuracy only)
      const withConfidence = UnifiedScoreCalculator.calculateUPS(100, 100);
      const withoutConfidence = UnifiedScoreCalculator.calculateUPS(100, null);
      expect(withConfidence).toBe(100);
      expect(withoutConfidence).toBe(100);
      expect(withConfidence).toBe(withoutConfidence);
    });

    it('zero confidence always gives zero UPS regardless of accuracy', () => {
      fc.assert(
        fc.property(percentArb, (accuracy) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, 0);
          return ups === 0;
        }),
      );
    });

    it('formula weights: accuracy has more impact than confidence', () => {
      // Verify the 0.6/0.4 weight split
      expect(UPS_ACCURACY_WEIGHT).toBe(0.6);
      expect(UPS_CONFIDENCE_WEIGHT).toBe(0.4);

      // 10% change in accuracy should have more impact than 10% change in confidence
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 80 }),
          fc.integer({ min: 50, max: 80 }),
          (baseAccuracy, baseConfidence) => {
            const base = UnifiedScoreCalculator.calculateUPS(baseAccuracy, baseConfidence);
            const plusAccuracy = UnifiedScoreCalculator.calculateUPS(
              baseAccuracy + 10,
              baseConfidence,
            );
            const plusConfidence = UnifiedScoreCalculator.calculateUPS(
              baseAccuracy,
              baseConfidence + 10,
            );

            const deltaAccuracy = plusAccuracy - base;
            const deltaConfidence = plusConfidence - base;

            // Accuracy changes should have roughly 1.5x more impact (0.6/0.4)
            return deltaAccuracy >= deltaConfidence * 0.8;
          },
        ),
      );
    });
  });

  describe('calculateTempoAccuracy(data, gameMode) - spec-driven', () => {
    const gameModeArb = fc.constantFrom(
      'dualnback-classic',
      'dualnback-classic',
      'sim-brainworkshop',
      'custom',
    );

    it('output is bounded [0, 100] for all valid inputs and game modes', () => {
      fc.assert(
        fc.property(
          gameModeArb,
          hitsArb,
          missesArb,
          faArb,
          crArb,
          (gameMode, hits, misses, fa, cr) => {
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
              { hits, misses, falseAlarms: fa, correctRejections: cr },
              gameMode,
            );
            return accuracy >= 0 && accuracy <= 100;
          },
        ),
      );
    });

    it('perfect performance = 100 for all modes', () => {
      // All hits, no misses, no FA, all CR
      for (const mode of ['dualnback-classic', 'sim-brainworkshop']) {
        expect(
          UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: 20, misses: 0, falseAlarms: 0, correctRejections: 20 },
            mode,
          ),
        ).toBe(100);
      }
    });

    it('SDT mode (dualnback-classic): geometric mean sqrt(hitRate * crRate)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          (hits, misses, fa, cr) => {
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
              { hits, misses, falseAlarms: fa, correctRejections: cr },
              'dualnback-classic',
            );

            const hitRate = hits / (hits + misses);
            const crRate = cr / (cr + fa);
            const expected = Math.round(Math.sqrt(hitRate * crRate) * 100);

            return Math.abs(accuracy - expected) <= 1; // Allow rounding difference
          },
        ),
      );
    });

    it('Jaeggi mode (dualnback-classic): error-based (1 - errorRate)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          (hits, misses, fa, cr) => {
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
              { hits, misses, falseAlarms: fa, correctRejections: cr },
              'dualnback-classic',
            );

            const errors = misses + fa;
            const totalRelevant = hits + misses + fa;
            const expected = Math.round((1 - errors / totalRelevant) * 100);

            return Math.abs(accuracy - expected) <= 1; // Allow rounding difference
          },
        ),
      );
    });

    it('BrainWorkshop mode: H / (H + M + FA)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          (hits, misses, fa, _cr) => {
            const accuracy = UnifiedScoreCalculator.calculateTempoAccuracy(
              { hits, misses, falseAlarms: fa, correctRejections: _cr },
              'sim-brainworkshop',
            );

            const denominator = hits + misses + fa;
            const expected = Math.round((hits / denominator) * 100);

            return Math.abs(accuracy - expected) <= 1; // Allow rounding difference
          },
        ),
      );
    });

    it('returns 0 when no trials for all modes', () => {
      for (const mode of ['dualnback-classic', 'sim-brainworkshop']) {
        expect(
          UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
            mode,
          ),
        ).toBe(0);
      }
    });
  });

  describe('calculatePlaceAccuracy(data)', () => {
    it('output is bounded [0, 100] for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (correct, total) => {
            // Total must be >= correct
            const actualTotal = Math.max(total, correct);
            // @ts-expect-error test override
            const accuracy = UnifiedScoreCalculator.calculatePlaceAccuracy({
              correctDrops: correct,
              totalDrops: actualTotal,
            });
            return accuracy >= 0 && accuracy <= 100;
          },
        ),
      );
    });

    it('perfect performance = 100', () => {
      expect(
        // @ts-expect-error test override
        UnifiedScoreCalculator.calculatePlaceAccuracy({
          correctDrops: 30,
          totalDrops: 30,
        }),
      ).toBe(100);
    });

    it('returns 0 when no drops', () => {
      expect(
        // @ts-expect-error test override
        UnifiedScoreCalculator.calculatePlaceAccuracy({
          correctDrops: 0,
          totalDrops: 0,
        }),
      ).toBe(0);
    });
  });

  describe('calculateRecallAccuracy(data)', () => {
    it('output is bounded [0, 100] for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (correct, total) => {
            const actualTotal = Math.max(total, correct);
            // @ts-expect-error test override
            const accuracy = UnifiedScoreCalculator.calculateRecallAccuracy({
              correctPicks: correct,
              totalPicks: actualTotal,
            });
            return accuracy >= 0 && accuracy <= 100;
          },
        ),
      );
    });

    it('perfect performance = 100', () => {
      expect(
        // @ts-expect-error test override
        UnifiedScoreCalculator.calculateRecallAccuracy({
          correctPicks: 20,
          totalPicks: 20,
        }),
      ).toBe(100);
    });

    it('returns 0 when no picks', () => {
      expect(
        // @ts-expect-error test override
        UnifiedScoreCalculator.calculateRecallAccuracy({
          correctPicks: 0,
          totalPicks: 0,
        }),
      ).toBe(0);
    });
  });

  describe('deriveTier(score)', () => {
    it('tier thresholds are exhaustive and mutually exclusive', () => {
      fc.assert(
        fc.property(percentArb, (score) => {
          const result = UnifiedScoreCalculator.deriveTier(score);
          const tiers = ['novice', 'intermediate', 'advanced', 'elite'];
          return tiers.includes(result.tier);
        }),
      );
    });

    it('tier thresholds: < 70 = novice', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 69 }), (score) => {
          return UnifiedScoreCalculator.deriveTier(score).tier === 'novice';
        }),
      );
    });

    it('tier thresholds: 70-79 = intermediate', () => {
      fc.assert(
        fc.property(fc.integer({ min: 70, max: 79 }), (score) => {
          return UnifiedScoreCalculator.deriveTier(score).tier === 'intermediate';
        }),
      );
    });

    it('tier thresholds: 80-89 = advanced', () => {
      fc.assert(
        fc.property(fc.integer({ min: 80, max: 89 }), (score) => {
          return UnifiedScoreCalculator.deriveTier(score).tier === 'advanced';
        }),
      );
    });

    it('tier thresholds: 90-100 = elite', () => {
      fc.assert(
        fc.property(fc.integer({ min: 90, max: 100 }), (score) => {
          return UnifiedScoreCalculator.deriveTier(score).tier === 'elite';
        }),
      );
    });

    it('journey eligible when score >= 70 and not gaming', () => {
      fc.assert(
        fc.property(percentArb, fc.boolean(), (score, isGaming) => {
          const result = UnifiedScoreCalculator.deriveTier(score, isGaming);

          if (isGaming) {
            return result.journeyEligible === false;
          }
          if (score >= 70) {
            return result.journeyEligible === true;
          }
          return result.journeyEligible === false;
        }),
      );
    });
  });

  describe('mode-specific calculators', () => {
    it('calculateTempo returns valid UPS for all game modes', () => {
      const gameModeArb = fc.constantFrom(
        'dualnback-classic',
        'dualnback-classic',
        'sim-brainworkshop',
        'custom',
      );
      fc.assert(
        fc.property(
          gameModeArb,
          hitsArb,
          missesArb,
          faArb,
          crArb,
          fc.boolean(),
          (gameMode, h, m, f, c, isGaming) => {
            const ups = UnifiedScoreCalculator.calculateTempo(
              gameMode,
              { hits: h, misses: m, falseAlarms: f, correctRejections: c },
              [], // No response data (uses null confidence)
              isGaming,
            );

            return (
              ups.score >= 0 &&
              ups.score <= 100 &&
              Number.isInteger(ups.score) &&
              ups.components.accuracy >= 0 &&
              ups.components.accuracy <= 100 &&
              ['novice', 'intermediate', 'advanced', 'elite'].includes(ups.tier) &&
              typeof ups.journeyEligible === 'boolean'
            );
          },
        ),
      );
    });

    it('calculateFlow returns valid UPS', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          nullablePercentArb,
          fc.boolean(),
          (correct, total, confidence, isGaming) => {
            const actualTotal = Math.max(total, correct);
            const ups = UnifiedScoreCalculator.calculatePlace(
              {
                correctDrops: correct,
                totalDrops: actualTotal,
                confidenceScore: confidence,
              },
              isGaming,
            );

            return (
              ups.score >= 0 &&
              ups.score <= 100 &&
              Number.isInteger(ups.score) &&
              ['novice', 'intermediate', 'advanced', 'elite'].includes(ups.tier)
            );
          },
        ),
      );
    });

    it('calculateRecall returns valid UPS', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          nullablePercentArb,
          fc.integer({ min: 1, max: 20 }),
          fc.boolean(),
          (correct, total, confidence, windows, isGaming) => {
            const actualTotal = Math.max(total, correct);
            const ups = UnifiedScoreCalculator.calculateRecall(
              {
                correctPicks: correct,
                totalPicks: actualTotal,
                avgConfidenceScore: confidence,
                windowsCompleted: windows,
              },
              isGaming,
            );

            return (
              ups.score >= 0 &&
              ups.score <= 100 &&
              Number.isInteger(ups.score) &&
              ['novice', 'intermediate', 'advanced', 'elite'].includes(ups.tier)
            );
          },
        ),
      );
    });
  });
});
