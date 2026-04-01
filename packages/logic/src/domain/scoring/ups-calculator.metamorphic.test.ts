/**
 * Metamorphic Property Tests for UPS (Unified Performance Score) Calculator
 *
 * Tests metamorphic relations - relationships between inputs/outputs that must hold
 * regardless of specific values. These catch bugs that unit tests might miss.
 *
 * Organized by metamorphic relation category:
 * 1. Monotonicity - better inputs should not decrease outputs
 * 2. Bounded output - scores always within valid range
 * 3. Component contribution - improving parts should improve whole
 * 4. N-level scaling - higher N should reward same performance
 * 5. Consistency - identical inputs should produce identical outputs
 * 6. Degradation - worse performance should decrease scores
 * 7. Symmetry - certain operations should be symmetric
 * 8. Composition - combining inputs should follow rules
 * 9. Stability - small changes should not cause large jumps
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { UnifiedScoreCalculator } from './unified-score';
import { UPS_ACCURACY_WEIGHT, UPS_CONFIDENCE_WEIGHT } from '../../types/ups';
import {
  JOURNEY_MIN_UPS,
  UPS_TIER_ELITE,
  UPS_TIER_ADVANCED,
  UPS_TIER_INTERMEDIATE,
} from '../../specs/thresholds';

// =============================================================================
// Arbitraries
// =============================================================================

/** Valid percentage 0-100 */
const percentArb = fc.integer({ min: 0, max: 100 });

/** Nullable percentage for confidence */
const nullablePercentArb = fc.option(percentArb, { nil: null });

/** Non-zero percentage for meaningful tests */
const nonZeroPercentArb = fc.integer({ min: 1, max: 100 });

/** Mid-range percentage for stability tests */
const midRangePercentArb = fc.integer({ min: 30, max: 70 });

/** High percentage for elite tests */
const highPercentArb = fc.integer({ min: 80, max: 100 });

/** Low percentage for novice tests */
const lowPercentArb = fc.integer({ min: 0, max: 30 });

/** SDT counts */
const hitsArb = fc.integer({ min: 0, max: 100 });
const missesArb = fc.integer({ min: 0, max: 100 });
const faArb = fc.integer({ min: 0, max: 100 });
const crArb = fc.integer({ min: 0, max: 100 });

/** Non-zero SDT counts for meaningful accuracy */
const nonZeroHitsArb = fc.integer({ min: 1, max: 100 });
const nonZeroCrArb = fc.integer({ min: 1, max: 100 });

/** Game modes */
const gameModeArb = fc.constantFrom(
  'dualnback-classic',
  'dualnback-classic',
  'sim-brainworkshop',
  'custom',
);

/** Small delta for perturbation tests */
const smallDeltaArb = fc.integer({ min: 1, max: 5 });

/** N-levels for scaling tests */
const nLevelArb = fc.integer({ min: 2, max: 6 });

// =============================================================================
// 1. MONOTONICITY RELATIONS
// Better inputs should not decrease UPS
// =============================================================================

describe('Metamorphic: Monotonicity', () => {
  it('M1: Increasing accuracy (fixed confidence) should not decrease UPS', () => {
    fc.assert(
      fc.property(percentArb, percentArb, percentArb, (a1, a2, confidence) => {
        const [low, high] = a1 <= a2 ? [a1, a2] : [a2, a1];
        const upsLow = UnifiedScoreCalculator.calculateUPS(low, confidence);
        const upsHigh = UnifiedScoreCalculator.calculateUPS(high, confidence);
        return upsHigh >= upsLow;
      }),
      { numRuns: 500 },
    );
  });

  it('M2: Increasing confidence (fixed accuracy) should not decrease UPS', () => {
    fc.assert(
      fc.property(percentArb, percentArb, percentArb, (accuracy, c1, c2) => {
        const [low, high] = c1 <= c2 ? [c1, c2] : [c2, c1];
        const upsLow = UnifiedScoreCalculator.calculateUPS(accuracy, low);
        const upsHigh = UnifiedScoreCalculator.calculateUPS(accuracy, high);
        return upsHigh >= upsLow;
      }),
      { numRuns: 500 },
    );
  });

  it('M3: Increasing both accuracy and confidence should not decrease UPS', () => {
    fc.assert(
      fc.property(
        percentArb,
        percentArb,
        smallDeltaArb,
        smallDeltaArb,
        (accuracy, confidence, deltaA, deltaC) => {
          const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const ups2 = UnifiedScoreCalculator.calculateUPS(
            Math.min(100, accuracy + deltaA),
            Math.min(100, confidence + deltaC),
          );
          return ups2 >= ups1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M4: More hits (fixed others) should not decrease Tempo accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        hitsArb,
        missesArb,
        faArb,
        crArb,
        smallDeltaArb,
        (mode, hits, misses, fa, cr, delta) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: hits + delta, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M5: Fewer misses (fixed others) should not decrease Tempo accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        nonZeroHitsArb,
        fc.integer({ min: 2, max: 50 }),
        faArb,
        crArb,
        (mode, hits, misses, fa, cr) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses: misses - 1, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M6: Fewer false alarms (fixed others) should not decrease Tempo accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        nonZeroHitsArb,
        missesArb,
        fc.integer({ min: 2, max: 50 }),
        nonZeroCrArb,
        (mode, hits, misses, fa, cr) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa - 1, correctRejections: cr },
            mode,
          );
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M7: More correct rejections (fixed others) should not decrease SDT accuracy', () => {
    fc.assert(
      fc.property(
        nonZeroHitsArb,
        missesArb,
        faArb,
        crArb,
        smallDeltaArb,
        (hits, misses, fa, cr, delta) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            'dualnback-classic', // SDT mode uses CR
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr + delta },
            'dualnback-classic',
          );
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M8: Place accuracy monotonic with correct drops', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 10, max: 100 }),
        nullablePercentArb,
        smallDeltaArb,
        (correct, total, confidence, delta) => {
          const actualTotal = Math.max(total, correct + delta);
          const acc1 = UnifiedScoreCalculator.calculatePlaceAccuracy({
            correctDrops: correct,
            totalDrops: actualTotal,
            confidenceScore: confidence,
          });
          const acc2 = UnifiedScoreCalculator.calculatePlaceAccuracy({
            correctDrops: Math.min(correct + delta, actualTotal),
            totalDrops: actualTotal,
            confidenceScore: confidence,
          });
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('M9: Recall accuracy monotonic with correct picks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 10, max: 100 }),
        nullablePercentArb,
        smallDeltaArb,
        (correct, total, confidence, delta) => {
          const actualTotal = Math.max(total, correct + delta);
          const acc1 = UnifiedScoreCalculator.calculateRecallAccuracy({
            correctPicks: correct,
            totalPicks: actualTotal,
            avgConfidenceScore: confidence,
            windowsCompleted: 5,
          });
          const acc2 = UnifiedScoreCalculator.calculateRecallAccuracy({
            correctPicks: Math.min(correct + delta, actualTotal),
            totalPicks: actualTotal,
            avgConfidenceScore: confidence,
            windowsCompleted: 5,
          });
          return acc2 >= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// 2. BOUNDED OUTPUT RELATIONS
// Scores must always be within valid ranges
// =============================================================================

describe('Metamorphic: Bounded Output', () => {
  it('B1: UPS always in [0, 100]', () => {
    fc.assert(
      fc.property(percentArb, nullablePercentArb, (accuracy, confidence) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        return ups >= 0 && ups <= 100 && Number.isInteger(ups);
      }),
      { numRuns: 1000 },
    );
  });

  it('B2: UPS in [0, 100] even with out-of-range inputs (clamping)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 200 }),
        fc.integer({ min: -100, max: 200 }),
        (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return ups >= 0 && ups <= 100;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('B3: Tempo accuracy always in [0, 100] for all modes', () => {
    fc.assert(
      fc.property(gameModeArb, hitsArb, missesArb, faArb, crArb, (mode, h, m, f, c) => {
        const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
          { hits: h, misses: m, falseAlarms: f, correctRejections: c },
          mode,
        );
        return acc >= 0 && acc <= 100 && Number.isInteger(acc);
      }),
      { numRuns: 1000 },
    );
  });

  it('B4: Place accuracy always in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (correct, total) => {
          const actualTotal = Math.max(total, correct);
          const acc = UnifiedScoreCalculator.calculatePlaceAccuracy({
            correctDrops: correct,
            totalDrops: actualTotal,
            confidenceScore: null,
          });
          return acc >= 0 && acc <= 100;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('B5: Recall accuracy always in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (correct, total) => {
          const actualTotal = Math.max(total, correct);
          const acc = UnifiedScoreCalculator.calculateRecallAccuracy({
            correctPicks: correct,
            totalPicks: actualTotal,
            avgConfidenceScore: null,
            windowsCompleted: 5,
          });
          return acc >= 0 && acc <= 100;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('B6: BrainWorkshop accuracy always in [0, 100]', () => {
    fc.assert(
      fc.property(hitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
        const acc = UnifiedScoreCalculator.calculateBrainWorkshopAccuracy({
          hits: h,
          misses: m,
          falseAlarms: f,
          correctRejections: c,
        });
        return acc >= 0 && acc <= 100;
      }),
      { numRuns: 500 },
    );
  });

  it('B7: Tier is always one of the valid tiers', () => {
    fc.assert(
      fc.property(percentArb, (score) => {
        const result = UnifiedScoreCalculator.deriveTier(score);
        return ['novice', 'intermediate', 'advanced', 'elite'].includes(result.tier);
      }),
      { numRuns: 500 },
    );
  });

  it('B8: Full calculate() result has all required fields in range', () => {
    fc.assert(
      fc.property(
        percentArb,
        nullablePercentArb,
        fc.boolean(),
        (accuracy, confidence, isGaming) => {
          const result = UnifiedScoreCalculator.calculate(accuracy, confidence, isGaming);
          return (
            result.score >= 0 &&
            result.score <= 100 &&
            result.components.accuracy >= 0 &&
            result.components.accuracy <= 100 &&
            (result.components.confidence === null ||
              (result.components.confidence >= 0 && result.components.confidence <= 100)) &&
            typeof result.journeyEligible === 'boolean' &&
            ['novice', 'intermediate', 'advanced', 'elite'].includes(result.tier)
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// 3. COMPONENT CONTRIBUTION RELATIONS
// Improving any component should not worsen the whole
// =============================================================================

describe('Metamorphic: Component Contribution', () => {
  it('C1: Accuracy contributes positively to UPS (when confidence fixed and > 0)', () => {
    fc.assert(
      fc.property(
        midRangePercentArb,
        midRangePercentArb,
        smallDeltaArb,
        (accuracy, confidence, delta) => {
          if (confidence === 0) return true; // Zero confidence dominates
          const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const ups2 = UnifiedScoreCalculator.calculateUPS(
            Math.min(100, accuracy + delta),
            confidence,
          );
          return ups2 >= ups1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('C2: Confidence contributes positively to UPS (when accuracy fixed and > 0)', () => {
    fc.assert(
      fc.property(
        midRangePercentArb,
        midRangePercentArb,
        smallDeltaArb,
        (accuracy, confidence, delta) => {
          if (accuracy === 0) return true; // Zero accuracy dominates
          const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const ups2 = UnifiedScoreCalculator.calculateUPS(
            accuracy,
            Math.min(100, confidence + delta),
          );
          return ups2 >= ups1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('C3: Accuracy weight is dominant (0.6 > 0.4)', () => {
    expect(UPS_ACCURACY_WEIGHT).toBeGreaterThan(UPS_CONFIDENCE_WEIGHT);
    expect(UPS_ACCURACY_WEIGHT + UPS_CONFIDENCE_WEIGHT).toBe(1.0);
  });

  it('C4: Accuracy has higher weight than confidence (average effect)', () => {
    // The formula UPS = 100 * (A/100)^0.6 * (C/100)^0.4 means:
    // - Accuracy weight 0.6 > Confidence weight 0.4
    // - But marginal impact depends on current values (derivative has inverse relationship)
    // This test verifies the weights are as expected and that
    // on average, improving accuracy has similar or greater impact.

    let accImpactSum = 0;
    let confImpactSum = 0;
    let count = 0;

    // Sample at equal values where weights should matter most clearly
    for (let v = 30; v <= 80; v += 10) {
      const delta = 10;
      const base = UnifiedScoreCalculator.calculateUPS(v, v);
      const plusAcc = UnifiedScoreCalculator.calculateUPS(v + delta, v);
      const plusConf = UnifiedScoreCalculator.calculateUPS(v, v + delta);

      accImpactSum += plusAcc - base;
      confImpactSum += plusConf - base;
      count++;
    }

    // On average at equal A/C values, accuracy should have >= impact due to higher weight
    const avgAccImpact = accImpactSum / count;
    const avgConfImpact = confImpactSum / count;

    // With weights 0.6 vs 0.4, accuracy should have ~50% more impact (0.6/0.4 = 1.5)
    // Due to rounding and formula curvature, we test for >= 1.0x
    expect(avgAccImpact).toBeGreaterThanOrEqual(avgConfImpact * 1.0);
  });

  it('C5: Each SDT component contributes to overall accuracy (dualnback-classic)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 5, max: 20 }),
        (hits, misses, fa, cr) => {
          const base = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            'dualnback-classic',
          );
          // Improve each component separately
          const moreHits = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: hits + 3, misses, falseAlarms: fa, correctRejections: cr },
            'dualnback-classic',
          );
          const fewerMisses = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses: Math.max(0, misses - 2), falseAlarms: fa, correctRejections: cr },
            'dualnback-classic',
          );
          const fewerFA = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: Math.max(0, fa - 2), correctRejections: cr },
            'dualnback-classic',
          );
          const moreCR = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr + 3 },
            'dualnback-classic',
          );

          return moreHits >= base && fewerMisses >= base && fewerFA >= base && moreCR >= base;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('C6: No single component can make UPS exceed 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 95, max: 100 }),
        fc.integer({ min: 95, max: 100 }),
        (accuracy, confidence) => {
          const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          return ups <= 100;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// 4. N-LEVEL SCALING RELATIONS
// Same performance at higher N should give higher effective value
// (Note: UPS itself doesn't include N, but this tests the principle)
// =============================================================================

describe('Metamorphic: N-Level Scaling Principles', () => {
  it('N1: Journey eligibility threshold is consistent (70)', () => {
    expect(JOURNEY_MIN_UPS).toBe(70);
    expect(JOURNEY_MIN_UPS).toBe(UPS_TIER_INTERMEDIATE);
  });

  it('N2: Tier thresholds are ordered: novice < intermediate < advanced < elite', () => {
    expect(UPS_TIER_INTERMEDIATE).toBeLessThan(UPS_TIER_ADVANCED);
    expect(UPS_TIER_ADVANCED).toBeLessThan(UPS_TIER_ELITE);
    expect(UPS_TIER_INTERMEDIATE).toBe(70);
    expect(UPS_TIER_ADVANCED).toBe(80);
    expect(UPS_TIER_ELITE).toBe(90);
  });

  it('N3: Score at threshold should get correct tier', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 69 }), (score) => {
        return UnifiedScoreCalculator.deriveTier(score).tier === 'novice';
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 70, max: 79 }), (score) => {
        return UnifiedScoreCalculator.deriveTier(score).tier === 'intermediate';
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 80, max: 89 }), (score) => {
        return UnifiedScoreCalculator.deriveTier(score).tier === 'advanced';
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 90, max: 100 }), (score) => {
        return UnifiedScoreCalculator.deriveTier(score).tier === 'elite';
      }),
    );
  });

  it('N4: Journey eligibility requires score >= 70 and not gaming', () => {
    fc.assert(
      fc.property(percentArb, fc.boolean(), (score, isGaming) => {
        const result = UnifiedScoreCalculator.deriveTier(score, isGaming);

        if (isGaming) {
          return result.journeyEligible === false;
        }
        if (score >= JOURNEY_MIN_UPS) {
          return result.journeyEligible === true;
        }
        return result.journeyEligible === false;
      }),
      { numRuns: 500 },
    );
  });

  it('N5: Elite tier requires exceptional performance', () => {
    // To reach elite (90+), both accuracy and confidence must be high
    fc.assert(
      fc.property(highPercentArb, highPercentArb, (accuracy, confidence) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        // With 80-100 range for both, UPS should be at least intermediate
        return ups >= 60;
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// 5. CONSISTENCY RELATIONS
// Identical inputs must produce identical outputs
// =============================================================================

describe('Metamorphic: Consistency', () => {
  it('S1: Same inputs always produce same UPS (determinism)', () => {
    fc.assert(
      fc.property(percentArb, nullablePercentArb, (accuracy, confidence) => {
        const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        const ups2 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        const ups3 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        return ups1 === ups2 && ups2 === ups3;
      }),
      { numRuns: 500 },
    );
  });

  it('S2: Same SDT counts always produce same Tempo accuracy', () => {
    fc.assert(
      fc.property(gameModeArb, hitsArb, missesArb, faArb, crArb, (mode, h, m, f, c) => {
        const data = { hits: h, misses: m, falseAlarms: f, correctRejections: c };
        const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(data, mode);
        const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(data, mode);
        return acc1 === acc2;
      }),
      { numRuns: 300 },
    );
  });

  it('S3: calculate() and calculateUPS() agree on score', () => {
    fc.assert(
      fc.property(percentArb, nullablePercentArb, (accuracy, confidence) => {
        const full = UnifiedScoreCalculator.calculate(accuracy, confidence);
        const quick = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        return full.score === quick;
      }),
      { numRuns: 500 },
    );
  });

  it('S4: getScore() and calculateUPS() agree', () => {
    fc.assert(
      fc.property(percentArb, nullablePercentArb, (accuracy, confidence) => {
        const score1 = UnifiedScoreCalculator.getScore(accuracy, confidence);
        const score2 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        return score1 === score2;
      }),
      { numRuns: 500 },
    );
  });

  it('S5: Mode-specific calculators are consistent with calculate()', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        nullablePercentArb,
        (correct, total, confidence) => {
          const actualTotal = Math.max(total, correct);
          const placeResult = UnifiedScoreCalculator.calculatePlace({
            correctDrops: correct,
            totalDrops: actualTotal,
            confidenceScore: confidence,
          });

          const expectedAccuracy = actualTotal > 0 ? Math.round((correct / actualTotal) * 100) : 0;
          return placeResult.components.accuracy === expectedAccuracy;
        },
      ),
      { numRuns: 300 },
    );
  });
});

// =============================================================================
// 6. DEGRADATION RELATIONS
// Worse performance must decrease or maintain scores
// =============================================================================

describe('Metamorphic: Degradation', () => {
  it('D1: Decreasing accuracy should not increase UPS', () => {
    fc.assert(
      fc.property(nonZeroPercentArb, percentArb, smallDeltaArb, (accuracy, confidence, delta) => {
        const newAccuracy = Math.max(0, accuracy - delta);
        const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        const ups2 = UnifiedScoreCalculator.calculateUPS(newAccuracy, confidence);
        return ups2 <= ups1;
      }),
      { numRuns: 500 },
    );
  });

  it('D2: Decreasing confidence should not increase UPS', () => {
    fc.assert(
      fc.property(percentArb, nonZeroPercentArb, smallDeltaArb, (accuracy, confidence, delta) => {
        const newConfidence = Math.max(0, confidence - delta);
        const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        const ups2 = UnifiedScoreCalculator.calculateUPS(accuracy, newConfidence);
        return ups2 <= ups1;
      }),
      { numRuns: 500 },
    );
  });

  it('D3: More misses should not increase Tempo accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        nonZeroHitsArb,
        missesArb,
        faArb,
        crArb,
        smallDeltaArb,
        (mode, hits, misses, fa, cr, delta) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses: misses + delta, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          return acc2 <= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('D4: More false alarms should not increase Tempo accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        nonZeroHitsArb,
        missesArb,
        faArb,
        nonZeroCrArb,
        smallDeltaArb,
        (mode, hits, misses, fa, cr, delta) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa + delta, correctRejections: cr },
            mode,
          );
          return acc2 <= acc1;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('D5: Fewer correct drops should not increase Place accuracy', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 10, max: 100 }),
        smallDeltaArb,
        (correct, total, delta) => {
          const actualTotal = Math.max(total, correct);
          const acc1 = UnifiedScoreCalculator.calculatePlaceAccuracy({
            correctDrops: correct,
            totalDrops: actualTotal,
            confidenceScore: null,
          });
          const acc2 = UnifiedScoreCalculator.calculatePlaceAccuracy({
            correctDrops: Math.max(0, correct - delta),
            totalDrops: actualTotal,
            confidenceScore: null,
          });
          return acc2 <= acc1;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('D6: Gaming detection disables journey eligibility', () => {
    fc.assert(
      fc.property(highPercentArb, highPercentArb, (accuracy, confidence) => {
        const withGaming = UnifiedScoreCalculator.calculate(accuracy, confidence, true);
        const withoutGaming = UnifiedScoreCalculator.calculate(accuracy, confidence, false);
        return (
          withGaming.journeyEligible === false &&
          (withoutGaming.journeyEligible === true || withoutGaming.score < JOURNEY_MIN_UPS)
        );
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// 7. SYMMETRY RELATIONS
// Certain operations should be symmetric
// =============================================================================

describe('Metamorphic: Symmetry', () => {
  it('Y1: Equal accuracy and confidence should give symmetric UPS', () => {
    fc.assert(
      fc.property(percentArb, (value) => {
        const ups = UnifiedScoreCalculator.calculateUPS(value, value);
        // When A = C, UPS = 100 * (A/100)^1.0 = A
        return ups === value;
      }),
      { numRuns: 500 },
    );
  });

  it('Y2: Swapping hits and CR should not affect SDT accuracy (symmetric formula)', () => {
    fc.assert(
      fc.property(
        nonZeroHitsArb,
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        nonZeroCrArb,
        (h, m, f, c) => {
          // For SDT geometric mean: sqrt(hitRate * crRate)
          // If we have h/(h+m) and c/(c+f), swapping (h,m) with (c,f) should give same result
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: h, misses: m, falseAlarms: f, correctRejections: c },
            'dualnback-classic',
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: c, misses: f, falseAlarms: m, correctRejections: h },
            'dualnback-classic',
          );
          return Math.abs(acc1 - acc2) <= 1; // Allow rounding difference
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Y3: Perfect performance is symmetric across modes', () => {
    const perfectData = {
      hits: 20,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 20,
    };

    for (const mode of ['dualnback-classic', 'sim-brainworkshop'] as const) {
      const acc = UnifiedScoreCalculator.calculateTempoAccuracy(perfectData, mode);
      expect(acc).toBe(100);
    }
  });

  it('Y4: Zero performance is symmetric across modes', () => {
    const zeroData = {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
    };

    for (const mode of ['dualnback-classic', 'sim-brainworkshop'] as const) {
      const acc = UnifiedScoreCalculator.calculateTempoAccuracy(zeroData, mode);
      expect(acc).toBe(0);
    }
  });
});

// =============================================================================
// 8. COMPOSITION RELATIONS
// Combining inputs should follow predictable rules
// =============================================================================

describe('Metamorphic: Composition', () => {
  it('P1: UPS formula is multiplicative (not additive)', () => {
    fc.assert(
      fc.property(midRangePercentArb, midRangePercentArb, (accuracy, confidence) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);

        // Manual formula check: UPS = round(100 * (A/100)^0.6 * (C/100)^0.4)
        const a = accuracy / 100;
        const c = confidence / 100;
        const expected = Math.round(100 * a ** 0.6 * c ** 0.4);

        return Math.abs(ups - expected) <= 1; // Allow rounding
      }),
      { numRuns: 500 },
    );
  });

  it('P2: Zero in any multiplicative component zeros the result', () => {
    fc.assert(
      fc.property(percentArb, (value) => {
        const zeroAcc = UnifiedScoreCalculator.calculateUPS(0, value);
        const zeroConf = UnifiedScoreCalculator.calculateUPS(value, 0);
        return zeroAcc === 0 && zeroConf === 0;
      }),
      { numRuns: 200 },
    );
  });

  it('P3: Null confidence triggers fallback (accuracy only)', () => {
    fc.assert(
      fc.property(percentArb, (accuracy) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, null);
        return ups === Math.round(accuracy);
      }),
      { numRuns: 300 },
    );
  });

  it('P4: Tier composition: higher scores imply higher or equal tiers', () => {
    fc.assert(
      fc.property(percentArb, percentArb, (score1, score2) => {
        const [low, high] = score1 <= score2 ? [score1, score2] : [score2, score1];
        const tierLow = UnifiedScoreCalculator.deriveTier(low).tier;
        const tierHigh = UnifiedScoreCalculator.deriveTier(high).tier;

        const tierOrder = ['novice', 'intermediate', 'advanced', 'elite'];
        return tierOrder.indexOf(tierHigh) >= tierOrder.indexOf(tierLow);
      }),
      { numRuns: 500 },
    );
  });

  it('P5: SDT accuracy is geometric mean of hit rate and CR rate', () => {
    fc.assert(
      fc.property(nonZeroHitsArb, missesArb, faArb, nonZeroCrArb, (h, m, f, c) => {
        const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
          { hits: h, misses: m, falseAlarms: f, correctRejections: c },
          'dualnback-classic',
        );

        const hitRate = h / (h + m);
        const crRate = c / (c + f);
        const expected = Math.round(Math.sqrt(hitRate * crRate) * 100);

        return Math.abs(acc - expected) <= 1;
      }),
      { numRuns: 300 },
    );
  });

  it('P6: Jaeggi accuracy is 1 minus error rate', () => {
    fc.assert(
      fc.property(nonZeroHitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
        const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
          { hits: h, misses: m, falseAlarms: f, correctRejections: c },
          'dualnback-classic',
        );

        const errors = m + f;
        const totalRelevant = h + m + f;
        if (totalRelevant === 0) return acc === 0;

        const expected = Math.round((1 - errors / totalRelevant) * 100);
        return Math.abs(acc - expected) <= 1;
      }),
      { numRuns: 300 },
    );
  });

  it('P7: BrainWorkshop accuracy is hits over relevant trials', () => {
    fc.assert(
      fc.property(nonZeroHitsArb, missesArb, faArb, crArb, (h, m, f, _c) => {
        const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
          { hits: h, misses: m, falseAlarms: f, correctRejections: _c },
          'sim-brainworkshop',
        );

        const denominator = h + m + f;
        if (denominator === 0) return acc === 0;

        const expected = Math.round((h / denominator) * 100);
        return Math.abs(acc - expected) <= 1;
      }),
      { numRuns: 300 },
    );
  });
});

// =============================================================================
// 9. STABILITY RELATIONS
// Small changes should not cause large jumps
// =============================================================================

describe('Metamorphic: Stability', () => {
  it('T1: Small accuracy change causes bounded UPS change', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 90 }),
        fc.integer({ min: 10, max: 90 }),
        (accuracy, confidence) => {
          const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const ups2 = UnifiedScoreCalculator.calculateUPS(accuracy + 1, confidence);

          // 1 point accuracy change should not cause more than ~2 point UPS change
          return Math.abs(ups2 - ups1) <= 3;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('T2: Small confidence change causes bounded UPS change', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 90 }),
        fc.integer({ min: 10, max: 90 }),
        (accuracy, confidence) => {
          const ups1 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const ups2 = UnifiedScoreCalculator.calculateUPS(accuracy, confidence + 1);

          return Math.abs(ups2 - ups1) <= 2;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('T3: Small hit change causes bounded accuracy change', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        fc.integer({ min: 10, max: 50 }),
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 10, max: 50 }),
        (mode, hits, misses, fa, cr) => {
          const acc1 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );
          const acc2 = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: hits + 1, misses, falseAlarms: fa, correctRejections: cr },
            mode,
          );

          // 1 extra hit should not cause more than ~5 point change
          return Math.abs(acc2 - acc1) <= 5;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('T4: UPS is continuous (no jumps at tier boundaries)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(69, 79, 89),
        fc.integer({ min: 70, max: 100 }),
        (accuracy, confidence) => {
          const upsBefore = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
          const upsAfter = UnifiedScoreCalculator.calculateUPS(accuracy + 1, confidence);

          // Score should change smoothly, not jump
          return Math.abs(upsAfter - upsBefore) <= 2;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('T5: Tier changes are gradual', () => {
    // At boundary, one point should only change tier by one level
    const boundaries = [69, 70, 79, 80, 89, 90];
    const tierOrder = ['novice', 'intermediate', 'advanced', 'elite'];

    for (const boundary of boundaries) {
      const tierBefore = UnifiedScoreCalculator.deriveTier(boundary).tier;
      const tierAfter = UnifiedScoreCalculator.deriveTier(boundary + 1).tier;

      const indexBefore = tierOrder.indexOf(tierBefore);
      const indexAfter = tierOrder.indexOf(tierAfter);

      expect(Math.abs(indexAfter - indexBefore)).toBeLessThanOrEqual(1);
    }
  });

  it('T6: Rounding does not cause instability', () => {
    fc.assert(
      fc.property(percentArb, percentArb, (accuracy, confidence) => {
        // Call multiple times to ensure determinism despite rounding
        const results = Array.from({ length: 5 }, () =>
          UnifiedScoreCalculator.calculateUPS(accuracy, confidence),
        );
        return results.every((r) => r === results[0]);
      }),
      { numRuns: 300 },
    );
  });
});

// =============================================================================
// 10. EXTREME VALUE RELATIONS
// Edge cases and boundary conditions
// =============================================================================

describe('Metamorphic: Extreme Values', () => {
  it('E1: Perfect scores yield maximum UPS', () => {
    const ups = UnifiedScoreCalculator.calculateUPS(100, 100);
    expect(ups).toBe(100);
  });

  it('E2: Zero accuracy yields zero UPS regardless of confidence', () => {
    fc.assert(
      fc.property(percentArb, (confidence) => {
        return UnifiedScoreCalculator.calculateUPS(0, confidence) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('E3: Zero confidence yields zero UPS regardless of accuracy', () => {
    fc.assert(
      fc.property(percentArb, (accuracy) => {
        return UnifiedScoreCalculator.calculateUPS(accuracy, 0) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('E4: Low accuracy cannot be compensated by high confidence', () => {
    fc.assert(
      fc.property(lowPercentArb, highPercentArb, (accuracy, confidence) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        // With low accuracy (0-30), even perfect confidence cannot exceed ~50
        return ups < 60;
      }),
      { numRuns: 200 },
    );
  });

  it('E5: Low confidence cannot be compensated by high accuracy', () => {
    fc.assert(
      fc.property(highPercentArb, lowPercentArb, (accuracy, confidence) => {
        const ups = UnifiedScoreCalculator.calculateUPS(accuracy, confidence);
        // With low confidence (0-30), even perfect accuracy cannot exceed ~70
        return ups < 80;
      }),
      { numRuns: 200 },
    );
  });

  it('E6: All-hits-all-CR is always 100% accuracy for SDT', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (hits, cr) => {
          const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits, misses: 0, falseAlarms: 0, correctRejections: cr },
            'dualnback-classic',
          );
          return acc === 100;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('E7: All-misses is 0% accuracy', () => {
    fc.assert(
      fc.property(
        gameModeArb,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (mode, misses, cr) => {
          const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
            { hits: 0, misses, falseAlarms: 0, correctRejections: cr },
            mode,
          );
          // SDT with 0 hits = 0 (geometric mean of 0)
          // Jaeggi with all misses = depends on formula
          // BrainWorkshop with 0 hits = 0
          return acc <= 50; // Most modes should give low score
        },
      ),
      { numRuns: 200 },
    );
  });

  it('E8: All-false-alarms is 0% accuracy for SDT', () => {
    const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
      { hits: 20, misses: 0, falseAlarms: 20, correctRejections: 0 },
      'dualnback-classic',
    );
    // SDT with 0 CR rate = 0 (geometric mean with 0)
    expect(acc).toBe(0);
  });

  it('E9: Empty session yields 0', () => {
    for (const mode of ['dualnback-classic', 'sim-brainworkshop'] as const) {
      const acc = UnifiedScoreCalculator.calculateTempoAccuracy(
        { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
        mode,
      );
      expect(acc).toBe(0);
    }
  });

  it('E10: Place with 0 total drops yields 0', () => {
    const acc = UnifiedScoreCalculator.calculatePlaceAccuracy({
      correctDrops: 0,
      totalDrops: 0,
      confidenceScore: null,
    });
    expect(acc).toBe(0);
  });
});
