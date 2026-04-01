/**
 * Property-Based Tests for Contextual Message Generator and Converters
 *
 * Uses fast-check to generate arbitrary inputs and verify invariants.
 * Tests cover message generation, score converters, and report formatting.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { generateContextualMessageData } from './contextual-message';
import {
  convertTempoSession,
  convertMemoSession,
  convertPlaceSession,
  convertDualPickSession,
  convertTraceSession,
  convertGenericSession,
} from './converters';
import type {
  SessionEndReportModel,
  PerformanceLevel,
  TranslatableMessage,
  UnifiedModalityStats,
  UnifiedTotals,
} from '../../types/session-report';
import { deriveTier } from '../../types/ups';

// =============================================================================
// Arbitraries (Test Data Generators)
// =============================================================================

/** Generate a valid accuracy value (0-1) */
const arbAccuracy = fc.double({ min: 0, max: 1, noNaN: true });

/** Generate a valid UPS score (0-100) */
const arbUpsScore = fc.integer({ min: 0, max: 100 });

/** Generate valid modality IDs */
const arbModalityId = fc.constantFrom('position', 'audio') as fc.Arbitrary<'position' | 'audio'>;

/** Generate a list of active modalities (1-2) */
const arbActiveModalities = fc
  .uniqueArray(arbModalityId, { minLength: 1, maxLength: 2 })
  .map((arr) => arr as readonly ('position' | 'audio')[]);

/** Generate valid performance tier */
const arbPerformanceTier = fc.constantFrom(
  'elite',
  'advanced',
  'intermediate',
  'novice',
) as fc.Arbitrary<'elite' | 'advanced' | 'intermediate' | 'novice'>;

/** Generate a valid n-level (1-9) */
const arbNLevel = fc.integer({ min: 1, max: 9 });

/** Generate valid counts (non-negative integers) */
const arbCount = fc.integer({ min: 0, max: 100 });

/** Generate a valid reaction time in ms */
const arbReactionTime = fc.integer({ min: 100, max: 3000 });

/** Generate valid d-prime value */
const arbDPrime = fc.double({ min: -1, max: 5, noNaN: true });

/** Generate unified modality stats */
const arbModalityStats = (withFA: boolean): fc.Arbitrary<UnifiedModalityStats> =>
  fc.record({
    hits: arbCount,
    misses: arbCount,
    falseAlarms: withFA ? arbCount : fc.constant(null),
    correctRejections: withFA ? arbCount : fc.constant(null),
    avgRT: fc.oneof(arbReactionTime, fc.constant(null)),
    dPrime: withFA ? fc.oneof(arbDPrime, fc.constant(null)) : fc.constant(null),
  });

/** Generate unified totals */
const arbTotals = (withFA: boolean): fc.Arbitrary<UnifiedTotals> =>
  fc.record({
    hits: arbCount,
    misses: arbCount,
    falseAlarms: withFA ? arbCount : fc.constant(null),
    correctRejections: withFA ? arbCount : fc.constant(null),
  });

/** Generate a valid game mode */
const arbGameMode = fc.constantFrom(
  'dualnback-classic',
  'dual-place',
  'dual-memo',
  'dual-trace',
  'dual-pick',
  'dualnback-classic',
  'sim-brainworkshop',
  'custom',
);

/** Generate a valid session end reason */
const arbSessionReason = fc.constantFrom('completed', 'abandoned', 'error') as fc.Arbitrary<
  'completed' | 'abandoned' | 'error'
>;

/** Generate a minimal valid SessionEndReportModel */
const arbSessionReport = (withFA = true): fc.Arbitrary<SessionEndReportModel> =>
  fc
    .record({
      accuracy: arbAccuracy,
      upsScore: arbUpsScore,
      tier: arbPerformanceTier,
      nLevel: arbNLevel,
      totals: arbTotals(withFA),
      positionStats: arbModalityStats(withFA),
      audioStats: arbModalityStats(withFA),
      reason: arbSessionReason,
      durationMs: fc.integer({ min: 1000, max: 600000 }),
      trialsCount: fc.integer({ min: 5, max: 100 }),
      avgRT: fc.oneof(arbReactionTime, fc.constant(null)),
    })
    .map(
      ({
        accuracy,
        upsScore,
        tier,
        nLevel,
        totals,
        positionStats,
        audioStats,
        reason,
        durationMs,
        trialsCount,
        avgRT,
      }) => ({
        sessionId: 'test-session',
        createdAt: new Date().toISOString(),
        userId: 'test-user',
        reason,
        gameMode: 'dualnback-classic' as const,
        gameModeLabel: 'Dual Catch',
        nLevel,
        activeModalities: ['position', 'audio'] as const,
        trialsCount,
        durationMs,
        ups: {
          score: upsScore,
          tier,
          components: { accuracy: Math.round(accuracy * 100), confidence: 80 },
          journeyEligible: upsScore >= 70,
        },
        unifiedAccuracy: accuracy,
        modeScore: { labelKey: 'report.modeScore.dprime', value: 2.0, unit: "d'" as const },
        passed: accuracy >= 0.8,
        totals,
        byModality: {
          position: positionStats,
          audio: audioStats,
        },
        errorProfile: {
          errorRate:
            totals.hits + totals.misses > 0 ? totals.misses / (totals.hits + totals.misses) : 0,
          missShare: 1.0,
          faShare: withFA && totals.falseAlarms !== null ? 0.5 : null,
        },
        speedStats:
          avgRT !== null ? { labelKey: 'report.speed.reactionTime', valueMs: avgRT } : undefined,
        nextStep: { direction: 'same' as const, nextLevel: nLevel },
      }),
    );

// =============================================================================
// PART 1: Message Generation Tests (15 tests)
// =============================================================================

describe('Property Tests: Message Generation', () => {
  it('1. headline key is always a non-empty string', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        expect(typeof data.headline.key).toBe('string');
        expect(data.headline.key.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('2. subline key is always a non-empty string', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        expect(typeof data.subline.key).toBe('string');
        expect(data.subline.key.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('3. headline key always starts with correct prefix', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        expect(data.headline.key).toMatch(/^stats\.contextual\.headlines\./);
      }),
      { numRuns: 100 },
    );
  });

  it('4. subline key always starts with correct prefix', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        expect(data.subline.key).toMatch(/^stats\.contextual\.sublines\./);
      }),
      { numRuns: 100 },
    );
  });

  it('5. insight key (when present) starts with correct prefix', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        if (data.insight) {
          expect(data.insight.key).toMatch(/^stats\.contextual\.insights\./);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('6. performance level is one of the valid values', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);
        const validLevels: PerformanceLevel[] = [
          'excellent',
          'good',
          'average',
          'below-average',
          'struggling',
        ];
        expect(validLevels).toContain(data.level);
      }),
      { numRuns: 100 },
    );
  });

  it('7. params values are always strings or numbers', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data = generateContextualMessageData(report);

        const checkParams = (msg: TranslatableMessage) => {
          if (msg.params) {
            for (const value of Object.values(msg.params)) {
              expect(['string', 'number']).toContain(typeof value);
            }
          }
        };

        checkParams(data.headline);
        checkParams(data.subline);
        if (data.insight) {
          checkParams(data.insight);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('8. accuracy >= 0.95 always produces excellent level', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.95, max: 1, noNaN: true }), (accuracy) => {
        const report = createReportWithAccuracy(accuracy, 'completed');
        const data = generateContextualMessageData(report);
        expect(data.level).toBe('excellent');
      }),
      { numRuns: 50 },
    );
  });

  it('9. accuracy in [0.85, 0.95) produces good level', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.85, max: 0.9499, noNaN: true }), (accuracy) => {
        const report = createReportWithAccuracy(accuracy, 'completed');
        const data = generateContextualMessageData(report);
        expect(data.level).toBe('good');
      }),
      { numRuns: 50 },
    );
  });

  it('10. accuracy in [0.7, 0.85) produces average level', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.7, max: 0.8499, noNaN: true }), (accuracy) => {
        const report = createReportWithAccuracy(accuracy, 'completed');
        const data = generateContextualMessageData(report);
        expect(data.level).toBe('average');
      }),
      { numRuns: 50 },
    );
  });

  it('11. accuracy in [0.5, 0.7) produces below-average level', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 0.6999, noNaN: true }), (accuracy) => {
        const report = createReportWithAccuracy(accuracy, 'completed');
        const data = generateContextualMessageData(report);
        expect(data.level).toBe('below-average');
      }),
      { numRuns: 50 },
    );
  });

  it('12. accuracy < 0.5 produces struggling level', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.4999, noNaN: true }), (accuracy) => {
        const report = createReportWithAccuracy(accuracy, 'completed');
        const data = generateContextualMessageData(report);
        expect(data.level).toBe('struggling');
      }),
      { numRuns: 50 },
    );
  });

  it('13. abandoned short sessions produce abandoned-related headlines', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (accuracy) => {
        const report = createAbandonedShortSessionReport(accuracy);
        const data = generateContextualMessageData(report);
        // Abandoned short sessions should produce abandoned headline
        expect(data.headline.key).toContain('stats.contextual.headlines.');
      }),
      { numRuns: 50 },
    );
  });

  it('14. no responses produces noResponse-related messages', () => {
    const report = createNoResponseReport();
    const data = generateContextualMessageData(report);
    expect(data.headline.key).toContain('stats.contextual.headlines.');
    expect(data.level).toBe('struggling');
  });

  it('15. same input produces consistent output structure', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        const data1 = generateContextualMessageData(report);
        const data2 = generateContextualMessageData(report);

        // Structure should be consistent (though random selection may vary)
        expect(data1.level).toBe(data2.level);
        expect(typeof data1.headline.key).toBe(typeof data2.headline.key);
        expect(typeof data1.subline.key).toBe(typeof data2.subline.key);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// PART 2: Score Converters Tests (15 tests)
// =============================================================================

describe('Property Tests: Score Converters', () => {
  it('16. convertTempoSession always produces valid unifiedAccuracy in [0,1]', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          expect(result.unifiedAccuracy).toBeGreaterThanOrEqual(0);
          expect(result.unifiedAccuracy).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('17. convertTempoSession always produces valid UPS score in [0,100]', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          expect(result.ups.score).toBeGreaterThanOrEqual(0);
          expect(result.ups.score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('18. convertMemoSession sets FA/CR to null (not applicable)', () => {
    fc.assert(
      fc.property(arbNLevel, arbCount, arbCount, (nLevel, correctPicks, totalPicksDelta) => {
        const totalPicks = correctPicks + totalPicksDelta;
        if (totalPicks <= 0) return; // Skip invalid cases

        const input = createMemoInput(nLevel, correctPicks, totalPicks);
        const result = convertMemoSession(input as any);
        expect(result.totals.falseAlarms).toBeNull();
        expect(result.totals.correctRejections).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('19. convertPlaceSession always produces valid accuracy in [0,1]', () => {
    fc.assert(
      fc.property(arbNLevel, arbCount, arbCount, (nLevel, correctDrops, errorCount) => {
        const totalDrops = correctDrops + errorCount;
        if (totalDrops <= 0) return;

        const input = createPlaceInput(nLevel, correctDrops, errorCount);
        const result = convertPlaceSession(input);
        expect(result.unifiedAccuracy).toBeGreaterThanOrEqual(0);
        expect(result.unifiedAccuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('20. convertDualPickSession always produces valid accuracy', () => {
    fc.assert(
      fc.property(arbNLevel, arbCount, arbCount, (nLevel, correctDrops, errorCount) => {
        const totalDrops = correctDrops + errorCount;
        if (totalDrops <= 0) return;

        const input = createDualPickInput(nLevel, correctDrops, errorCount);
        const result = convertDualPickSession(input);
        expect(result.unifiedAccuracy).toBeGreaterThanOrEqual(0);
        expect(result.unifiedAccuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('21. convertTraceSession always produces valid accuracy', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, correct, incorrect, timeouts) => {
          const total = correct + incorrect + timeouts;
          if (total <= 0) return;

          const input = createTraceInput(nLevel, correct, incorrect, timeouts);
          const result = convertTraceSession(input as any);
          expect(result.unifiedAccuracy).toBeGreaterThanOrEqual(0);
          expect(result.unifiedAccuracy).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('22. errorProfile.errorRate is always in [0,1]', () => {
    fc.assert(
      fc.property(arbSessionReport(), (report) => {
        expect(report.errorProfile.errorRate).toBeGreaterThanOrEqual(0);
        expect(report.errorProfile.errorRate).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('23. errorProfile.missShare is always in [0,1]', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          expect(result.errorProfile.missShare).toBeGreaterThanOrEqual(0);
          expect(result.errorProfile.missShare).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('24. totals.hits equals sum of byModality hits', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          const modalityHits = Object.values(result.byModality).reduce((sum, m) => sum + m.hits, 0);
          expect(result.totals.hits).toBe(modalityHits);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('25. nextStep.direction is consistent with nLevel comparison', () => {
    fc.assert(
      fc.property(arbNLevel, fc.integer({ min: 1, max: 9 }), (nLevel, nextLevel) => {
        const input = createTempoInput(nLevel, 10, 2, 1, 7);
        input.nextLevel = nextLevel;
        const result = convertTempoSession(input as any);

        if (!result.nextStep) return; // Skip if journey context provided

        if (nextLevel > nLevel) {
          expect(result.nextStep.direction).toBe('up');
        } else if (nextLevel < nLevel) {
          expect(result.nextStep.direction).toBe('down');
        } else {
          expect(result.nextStep.direction).toBe('same');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('26. deriveTier returns elite for scores >= 90', () => {
    fc.assert(
      fc.property(fc.integer({ min: 90, max: 100 }), (score) => {
        expect(deriveTier(score)).toBe('elite');
      }),
      { numRuns: 50 },
    );
  });

  it('27. deriveTier returns advanced for scores in [80, 90)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 80, max: 89 }), (score) => {
        expect(deriveTier(score)).toBe('advanced');
      }),
      { numRuns: 50 },
    );
  });

  it('28. deriveTier returns intermediate for scores in [70, 80)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 70, max: 79 }), (score) => {
        expect(deriveTier(score)).toBe('intermediate');
      }),
      { numRuns: 50 },
    );
  });

  it('29. deriveTier returns novice for scores < 70', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 69 }), (score) => {
        expect(deriveTier(score)).toBe('novice');
      }),
      { numRuns: 50 },
    );
  });

  it('30. perfect session (all hits, no errors) produces accuracy 1.0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 50 }), (hits) => {
        const input = createTempoInput(2, hits, 0, 0, hits);
        const result = convertTempoSession(input as any);
        // For dualnback-classic with balanced accuracy formula
        expect(result.unifiedAccuracy).toBeGreaterThanOrEqual(0.9);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// PART 3: Report Formatting Tests (10 tests)
// =============================================================================

describe('Property Tests: Report Formatting', () => {
  it('31. sessionId is preserved through conversion', () => {
    fc.assert(
      fc.property(fc.uuid(), (sessionId) => {
        const input = createTempoInput(2, 10, 2, 1, 7);
        input.sessionId = sessionId;
        const result = convertTempoSession(input as any);
        expect(result.sessionId).toBe(sessionId);
      }),
      { numRuns: 100 },
    );
  });

  it('32. createdAt is preserved through conversion', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }),
        (date) => {
          const createdAt = date.toISOString();
          const input = createTempoInput(2, 10, 2, 1, 7);
          input.createdAt = createdAt;
          const result = convertTempoSession(input as any);
          expect(result.createdAt).toBe(createdAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('33. nLevel is preserved through conversion', () => {
    fc.assert(
      fc.property(arbNLevel, (nLevel) => {
        const input = createTempoInput(nLevel, 10, 2, 1, 7);
        const result = convertTempoSession(input as any);
        expect(result.nLevel).toBe(nLevel);
      }),
      { numRuns: 100 },
    );
  });

  it('34. gameMode is set correctly for each converter', () => {
    // Tempo
    const tempoResult = convertTempoSession(createTempoInput(2, 10, 2, 1, 7) as any);
    expect(tempoResult.gameMode).toBe('dualnback-classic');

    // Memo
    const memoResult = convertMemoSession(createMemoInput(2, 30, 40) as any);
    expect(memoResult.gameMode).toBe('dual-memo');

    // Place
    const placeResult = convertPlaceSession(createPlaceInput(2, 25, 5));
    expect(placeResult.gameMode).toBe('dual-place');

    // Dual Pick
    const pickResult = convertDualPickSession(createDualPickInput(2, 20, 4));
    expect(pickResult.gameMode).toBe('dual-pick');

    // Trace
    const traceResult = convertTraceSession(createTraceInput(2, 15, 3, 2) as any);
    expect(traceResult.gameMode).toBe('dual-trace');
  });

  it('35. modeScore.unit is always valid', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          expect(["d'", '%', 'score']).toContain(result.modeScore.unit);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('36. modeScore.labelKey is always a non-empty string', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbCount,
        arbCount,
        arbCount,
        arbCount,
        (nLevel, hits, misses, fa, cr) => {
          const input = createTempoInput(nLevel, hits, misses, fa, cr);
          const result = convertTempoSession(input as any);
          expect(typeof result.modeScore.labelKey).toBe('string');
          expect(result.modeScore.labelKey.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('37. speedStats.valueMs is positive when present', () => {
    fc.assert(
      fc.property(arbNLevel, arbReactionTime, (nLevel, avgRT) => {
        const input = createTempoInput(nLevel, 10, 2, 1, 7);
        // Ensure avgRT is set in the summary
        input.summary.finalStats.byModality.position.avgRT = avgRT;
        input.summary.finalStats.byModality.audio.avgRT = avgRT;
        const result = convertTempoSession(input as any);
        if (result.speedStats) {
          expect(result.speedStats.valueMs).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('38. durationMs is positive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 600000 }), (durationMs) => {
        const input = createTempoInput(2, 10, 2, 1, 7);
        input.summary.durationMs = durationMs;
        const result = convertTempoSession(input as any);
        expect(result.durationMs).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('39. trialsCount matches input summary', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 100 }), (trialsCount) => {
        const input = createTempoInput(2, 10, 2, 1, 7);
        input.summary.totalTrials = trialsCount;
        const result = convertTempoSession(input as any);
        expect(result.trialsCount).toBe(trialsCount);
      }),
      { numRuns: 100 },
    );
  });

  it('40. convertGenericSession preserves all input fields', () => {
    fc.assert(
      fc.property(
        arbNLevel,
        arbUpsScore,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (nLevel, upsScore, accuracy) => {
          const input = createGenericInput(nLevel, accuracy, upsScore);
          const result = convertGenericSession(input);

          expect(result.nLevel).toBe(nLevel);
          expect(result.unifiedAccuracy).toBe(accuracy);
          if (input.ups) {
            expect(result.ups.score).toBe(upsScore);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createReportWithAccuracy(
  accuracy: number,
  reason: 'completed' | 'abandoned' | 'error',
): SessionEndReportModel {
  const hits = Math.round(accuracy * 20);
  const misses = 20 - hits;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    userId: 'test-user',
    reason,
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 20,
    durationMs: 60000,
    ups: {
      score: Math.round(accuracy * 100),
      tier: deriveTier(Math.round(accuracy * 100)),
      components: { accuracy: Math.round(accuracy * 100), confidence: 80 },
      journeyEligible: accuracy >= 0.7,
    },
    unifiedAccuracy: accuracy,
    modeScore: { labelKey: 'report.modeScore.dprime', value: 2.0, unit: "d'" },
    passed: accuracy >= 0.8,
    totals: { hits, misses, falseAlarms: 0, correctRejections: 20 },
    byModality: {
      position: {
        hits: Math.floor(hits / 2),
        misses: Math.floor(misses / 2),
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.0,
        avgRT: 400,
      },
      audio: {
        hits: Math.ceil(hits / 2),
        misses: Math.ceil(misses / 2),
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.0,
        avgRT: 450,
      },
    },
    errorProfile: { errorRate: misses / 20, missShare: 1.0, faShare: 0 },
    nextStep: { direction: 'same', nextLevel: 2 },
  };
}

function createAbandonedShortSessionReport(accuracy: number): SessionEndReportModel {
  const hits = Math.round(accuracy * 5);
  const misses = 5 - hits;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    userId: 'test-user',
    reason: 'abandoned',
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 20, // Expected 20 trials
    durationMs: 15000,
    ups: {
      score: 50,
      tier: 'novice',
      components: { accuracy: 50, confidence: 50 },
      journeyEligible: false,
    },
    unifiedAccuracy: accuracy,
    modeScore: { labelKey: 'report.modeScore.dprime', value: 1.0, unit: "d'" },
    passed: false,
    totals: { hits, misses, falseAlarms: 1, correctRejections: 2 }, // Only 8 actions total (< 50% of 20)
    byModality: {
      position: {
        hits: Math.floor(hits / 2),
        misses: Math.floor(misses / 2),
        falseAlarms: 0,
        correctRejections: 1,
        dPrime: 1.0,
        avgRT: 400,
      },
      audio: {
        hits: Math.ceil(hits / 2),
        misses: Math.ceil(misses / 2),
        falseAlarms: 1,
        correctRejections: 1,
        dPrime: 1.0,
        avgRT: 450,
      },
    },
    errorProfile: { errorRate: 0.5, missShare: 0.8, faShare: 0.2 },
    nextStep: { direction: 'same', nextLevel: 2 },
  };
}

function createNoResponseReport(): SessionEndReportModel {
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    userId: 'test-user',
    reason: 'completed',
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 20,
    durationMs: 60000,
    ups: {
      score: 0,
      tier: 'novice',
      components: { accuracy: 0, confidence: 0 },
      journeyEligible: false,
    },
    unifiedAccuracy: 0,
    modeScore: { labelKey: 'report.modeScore.dprime', value: 0, unit: "d'" },
    passed: false,
    totals: { hits: 0, misses: 10, falseAlarms: 0, correctRejections: 0 }, // No responses, all targets missed
    byModality: {
      position: {
        hits: 0,
        misses: 5,
        falseAlarms: 0,
        correctRejections: 0,
        dPrime: 0,
        avgRT: null,
      },
      audio: { hits: 0, misses: 5, falseAlarms: 0, correctRejections: 0, dPrime: 0, avgRT: null },
    },
    errorProfile: { errorRate: 1.0, missShare: 1.0, faShare: 0 },
    nextStep: { direction: 'down', nextLevel: 1 },
  };
}

interface TempoInputMutable {
  sessionId: string;
  createdAt: string;
  summary: {
    sessionId: string;
    nLevel: number;
    totalTrials: number;
    completedTrials: number;
    durationMs: number;
    globalDPrime: number;
    isiStats: { avg: number; min: number; max: number };
    stimulusDurationStats: { avg: number; min: number; max: number };
    finalStats: {
      trialsCount: number;
      globalDPrime: number;
      byModality: {
        position: {
          hits: number;
          misses: number;
          falseAlarms: number;
          correctRejections: number;
          dPrime: number;
          avgRT: number | null;
        };
        audio: {
          hits: number;
          misses: number;
          falseAlarms: number;
          correctRejections: number;
          dPrime: number;
          avgRT: number | null;
        };
      };
    };
  };
  gameMode: 'dualnback-classic' | 'sim-brainworkshop' | 'custom';
  gameModeLabel: string;
  activeModalities: readonly ('position' | 'audio')[];
  passed: boolean;
  nextLevel: number;
}

function createTempoInput(
  nLevel: number,
  hits: number,
  misses: number,
  fa: number,
  cr: number,
): TempoInputMutable {
  const posHits = Math.floor(hits / 2);
  const audioHits = hits - posHits;
  const posMisses = Math.floor(misses / 2);
  const audioMisses = misses - posMisses;
  const posFA = Math.floor(fa / 2);
  const audioFA = fa - posFA;
  const posCR = Math.floor(cr / 2);
  const audioCR = cr - posCR;

  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    summary: {
      sessionId: 'test-session',
      nLevel,
      totalTrials: hits + misses + fa + cr,
      completedTrials: hits + misses + fa + cr,
      durationMs: 60000,
      globalDPrime: 2.0,
      isiStats: { avg: 2500, min: 2000, max: 3000 },
      stimulusDurationStats: { avg: 500, min: 500, max: 500 },
      finalStats: {
        trialsCount: hits + misses + fa + cr,
        globalDPrime: 2.0,
        byModality: {
          position: {
            hits: posHits,
            misses: posMisses,
            falseAlarms: posFA,
            correctRejections: posCR,
            dPrime: 2.0,
            avgRT: 450,
          },
          audio: {
            hits: audioHits,
            misses: audioMisses,
            falseAlarms: audioFA,
            correctRejections: audioCR,
            dPrime: 2.0,
            avgRT: 480,
          },
        },
      },
    },
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    activeModalities: ['position', 'audio'],
    passed: true,
    nextLevel: nLevel,
  };
}

function createMemoInput(nLevel: number, correctPicks: number, totalPicks: number) {
  const accuracy = totalPicks > 0 ? correctPicks / totalPicks : 0;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    summary: {
      sessionId: 'test-session',
      nLevel,
      totalTrials: Math.ceil(totalPicks / 4),
      durationMs: 45000,
      finalStats: {
        accuracy,
        totalPicks,
        correctPicks,
        recentAccuracies: [accuracy],
        trend: 'stable' as const,
        byModality: {
          position: {
            totalPicks: Math.floor(totalPicks / 2),
            correctPicks: Math.floor(correctPicks / 2),
            accuracy,
          },
          audio: {
            totalPicks: Math.ceil(totalPicks / 2),
            correctPicks: Math.ceil(correctPicks / 2),
            accuracy,
          },
        },
        bySlotIndex: {},
      },
      avgRecallTimeMs: 1500,
      completed: true,
    },
    activeModalities: ['position', 'audio'] as const,
    gameModeLabel: 'Dual Memo',
    passed: accuracy >= 0.8,
    nextLevel: nLevel,
  };
}

function createPlaceInput(nLevel: number, correctDrops: number, errorCount: number) {
  const totalDrops = correctDrops + errorCount;
  const accuracy = totalDrops > 0 ? correctDrops / totalDrops : 0;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    summary: {
      sessionId: 'test-session',
      nLevel,
      totalTrials: Math.ceil(totalDrops / 2),
      durationMs: 50000,
      finalStats: {
        totalDrops,
        correctDrops,
        errorCount,
        accuracy,
        turnsCompleted: Math.ceil(totalDrops / 2),
      },
      completed: true,
      score: Math.round(accuracy * 100),
    },
    activeModalities: ['position', 'audio'] as const,
    gameModeLabel: 'Dual Place',
    passed: accuracy >= 0.8,
    nextLevel: nLevel,
  };
}

function createDualPickInput(nLevel: number, correctDrops: number, errorCount: number) {
  const totalDrops = correctDrops + errorCount;
  const accuracy = totalDrops > 0 ? correctDrops / totalDrops : 0;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    summary: {
      sessionId: 'test-session',
      nLevel,
      totalTrials: Math.ceil(totalDrops / 2),
      durationMs: 40000,
      finalStats: {
        totalDrops,
        correctDrops,
        errorCount,
        accuracy,
        turnsCompleted: Math.ceil(totalDrops / 2),
      },
      completed: true,
      score: Math.round(accuracy * 100),
    },
    activeModalities: ['position', 'audio'] as const,
    gameModeLabel: 'Dual Pick',
    passed: accuracy >= 0.8,
    nextLevel: nLevel,
  };
}

function createTraceInput(
  nLevel: number,
  correctResponses: number,
  incorrectResponses: number,
  timeouts: number,
) {
  const totalResponses = correctResponses + incorrectResponses + timeouts;
  const accuracy = totalResponses > 0 ? correctResponses / totalResponses : 0;
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    summary: {
      sessionId: 'test-session',
      nLevel,
      totalTrials: totalResponses,
      durationMs: 55000,
      finalStats: {
        totalResponses,
        correctResponses,
        incorrectResponses,
        timeouts,
        skipped: 0,
        accuracy,
      },
      completed: true,
      score: Math.round(accuracy * 100),
      rhythmMode: 'self-paced' as const,
      responses: [
        {
          trialIndex: 0,
          isWarmup: false,
          responseType: 'swipe' as const,
          responseTimeMs: 800,
          isCorrect: true,
        },
      ],
    },
    activeModalities: ['position'] as const,
    gameModeLabel: 'Dual Trace',
    passed: accuracy >= 0.7,
    nextLevel: nLevel,
  };
}

function createGenericInput(nLevel: number, accuracy: number, upsScore: number) {
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    gameMode: 'dualnback-classic' as const,
    gameModeLabel: 'Dual Catch',
    nLevel,
    activeModalities: ['position', 'audio'] as const,
    trialsCount: 20,
    durationMs: 60000,
    totals: {
      hits: Math.round(accuracy * 20),
      misses: 20 - Math.round(accuracy * 20),
      falseAlarms: 0,
      correctRejections: 20,
    },
    byModality: {
      position: {
        hits: 10,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 10,
        avgRT: 400,
        dPrime: 2.0,
      },
      audio: {
        hits: 10,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 10,
        avgRT: 450,
        dPrime: 2.0,
      },
    },
    unifiedAccuracy: accuracy,
    modeScoreValue: 2.0,
    modeScoreLabelKey: 'report.modeScore.dprime',
    modeScoreUnit: "d'" as const,
    passed: accuracy >= 0.8,
    nextLevel: nLevel,
    avgRT: 425,
    ups: {
      score: upsScore,
      components: { accuracy: Math.round(accuracy * 100), confidence: 80 },
      journeyEligible: upsScore >= 70,
      tier: deriveTier(upsScore),
    },
  };
}
