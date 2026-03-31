/**
 * Property-Based Tests for N-Level Evaluators
 *
 * Invariants:
 * - Delta is always in {-1, 0, 1}
 * - Jaeggi: < 3 errors all modalities → +1 (Jaeggi 2008: "fewer than three")
 * - Jaeggi: > 5 errors any modality → -1
 * - BrainWorkshop: >= 80% → +1
 * - BrainWorkshop: 3 strikes < 50% → -1
 * - Reasoning string is never empty
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  evaluateJaeggiProgression,
  evaluateBrainWorkshopProgression,
  type SessionStats,
} from './n-level-evaluator';
import { DIFFICULTY_MAX_N_LEVEL } from '../specs/thresholds';

// =============================================================================
// Arbitraries
// =============================================================================

const sdtCountsArb = fc.record({
  hits: fc.integer({ min: 0, max: 20 }),
  misses: fc.integer({ min: 0, max: 20 }),
  falseAlarms: fc.integer({ min: 0, max: 20 }),
  correctRejections: fc.integer({ min: 0, max: 20 }),
});

const nLevelArb = fc.integer({ min: 1, max: 10 });
const strikesArb = fc.integer({ min: 0, max: 5 });

const createSessionStats = (
  nLevel: number,
  modalityStats: Array<{ id: string; hits: number; misses: number; fa: number; cr: number }>,
): SessionStats => {
  const byModality = new Map<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >();
  for (const stat of modalityStats) {
    byModality.set(stat.id, {
      hits: stat.hits,
      misses: stat.misses,
      falseAlarms: stat.fa,
      correctRejections: stat.cr,
    });
  }
  return { byModality, currentNLevel: nLevel };
};

// =============================================================================
// Jaeggi Evaluator Tests
// =============================================================================

describe('Jaeggi Evaluator - Property Tests', () => {
  it('delta is always in {-1, 0, 1}', () => {
    fc.assert(
      fc.property(nLevelArb, sdtCountsArb, sdtCountsArb, (nLevel, positionStats, audioStats) => {
        const stats = createSessionStats(nLevel, [
          {
            id: 'position',
            hits: positionStats.hits,
            misses: positionStats.misses,
            fa: positionStats.falseAlarms,
            cr: positionStats.correctRejections,
          },
          {
            id: 'audio',
            hits: audioStats.hits,
            misses: audioStats.misses,
            fa: audioStats.falseAlarms,
            cr: audioStats.correctRejections,
          },
        ]);

        const result = evaluateJaeggiProgression(stats);
        return result.delta === -1 || result.delta === 0 || result.delta === 1;
      }),
      { numRuns: 200 },
    );
  });

  it('all modalities < 3 errors → delta = +1 (unless at max N) per Jaeggi 2008', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        fc.integer({ min: 0, max: 2 }), // errors < 3 (Jaeggi 2008: "fewer than three")
        fc.integer({ min: 0, max: 2 }),
        (nLevel, posErrors, audioErrors) => {
          // Split errors into misses and FA
          const stats = createSessionStats(nLevel, [
            { id: 'position', hits: 5, misses: posErrors, fa: 0, cr: 10 },
            { id: 'audio', hits: 5, misses: audioErrors, fa: 0, cr: 10 },
          ]);

          const result = evaluateJaeggiProgression(stats);
          // NLEVEL-2 fix: At max N, should maintain instead of promote
          if (nLevel >= DIFFICULTY_MAX_N_LEVEL) {
            return result.delta === 0;
          }
          return result.delta === 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('any modality > 5 errors AND nLevel > 1 → delta = -1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }), // nLevel > 1
        fc.integer({ min: 6, max: 15 }), // errors > 5
        (nLevel, badModalityErrors) => {
          const stats = createSessionStats(nLevel, [
            { id: 'position', hits: 1, misses: badModalityErrors, fa: 0, cr: 10 },
            { id: 'audio', hits: 5, misses: 0, fa: 0, cr: 10 },
          ]);

          const result = evaluateJaeggiProgression(stats);
          return result.delta === -1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('nLevel = 1 prevents delta = -1 (floor)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 15 }), (badErrors) => {
        const stats = createSessionStats(1, [
          { id: 'position', hits: 1, misses: badErrors, fa: 0, cr: 10 },
          { id: 'audio', hits: 5, misses: 0, fa: 0, cr: 10 },
        ]);

        const result = evaluateJaeggiProgression(stats);
        // At N=1, cannot go down further
        return result.delta >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('intermediate performance (3-5 errors) → delta = 0', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        fc.integer({ min: 3, max: 5 }), // 3-5 errors (>= 3, so no promote; <= 5, so no demote)
        (nLevel, errors) => {
          const stats = createSessionStats(nLevel, [
            { id: 'position', hits: 5, misses: errors, fa: 0, cr: 10 },
            { id: 'audio', hits: 5, misses: 0, fa: 0, cr: 10 }, // Good on audio
          ]);

          const result = evaluateJaeggiProgression(stats);
          return result.delta === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reasoning is never empty', () => {
    fc.assert(
      fc.property(nLevelArb, sdtCountsArb, sdtCountsArb, (nLevel, pos, audio) => {
        const stats = createSessionStats(nLevel, [
          {
            id: 'position',
            hits: pos.hits,
            misses: pos.misses,
            fa: pos.falseAlarms,
            cr: pos.correctRejections,
          },
          {
            id: 'audio',
            hits: audio.hits,
            misses: audio.misses,
            fa: audio.falseAlarms,
            cr: audio.correctRejections,
          },
        ]);

        const result = evaluateJaeggiProgression(stats);
        return result.reasoning.length > 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// BrainWorkshop Evaluator Tests
// =============================================================================

describe('BrainWorkshop Evaluator - Property Tests', () => {
  it('delta is always in {-1, 0, 1}', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        sdtCountsArb,
        sdtCountsArb,
        strikesArb,
        (nLevel, pos, audio, strikes) => {
          const stats = createSessionStats(nLevel, [
            {
              id: 'position',
              hits: pos.hits,
              misses: pos.misses,
              fa: pos.falseAlarms,
              cr: pos.correctRejections,
            },
            {
              id: 'audio',
              hits: audio.hits,
              misses: audio.misses,
              fa: audio.falseAlarms,
              cr: audio.correctRejections,
            },
          ]);

          const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
          return result.delta === -1 || result.delta === 0 || result.delta === 1;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('score >= 80% → delta = +1 (unless at max N)', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        // Perfect score: all hits, no misses, no FA
        const stats = createSessionStats(nLevel, [
          { id: 'position', hits: 10, misses: 0, fa: 0, cr: 10 },
          { id: 'audio', hits: 10, misses: 0, fa: 0, cr: 10 },
        ]);

        const result = evaluateBrainWorkshopProgression(stats);
        // NLEVEL-2 fix: At max N, should maintain instead of promote
        if (nLevel >= DIFFICULTY_MAX_N_LEVEL) {
          return result.delta === 0;
        }
        return result.delta === 1;
      }),
      { numRuns: 50 },
    );
  });

  it('score < 50% with 2 existing strikes AND nLevel > 1 → delta = -1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (nLevel) => {
        // Bad score: 1 hit, many misses+FA → score < 50%
        // hits / (hits + misses + FA) = 1 / (1 + 5 + 5) = 9% < 50%
        const stats = createSessionStats(nLevel, [
          { id: 'position', hits: 1, misses: 5, fa: 5, cr: 5 },
          { id: 'audio', hits: 1, misses: 5, fa: 5, cr: 5 },
        ]);

        const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
        return result.delta === -1;
      }),
      { numRuns: 50 },
    );
  });

  it('reasoning is never empty', () => {
    fc.assert(
      fc.property(
        nLevelArb,
        sdtCountsArb,
        sdtCountsArb,
        strikesArb,
        (nLevel, pos, audio, strikes) => {
          const stats = createSessionStats(nLevel, [
            {
              id: 'position',
              hits: pos.hits,
              misses: pos.misses,
              fa: pos.falseAlarms,
              cr: pos.correctRejections,
            },
            {
              id: 'audio',
              hits: audio.hits,
              misses: audio.misses,
              fa: audio.falseAlarms,
              cr: audio.correctRejections,
            },
          ]);

          const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: strikes });
          return result.reasoning.length > 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Cross-Evaluator Consistency Tests
// =============================================================================

describe('N-Level Evaluators - Consistency Tests', () => {
  it('perfect performance gives +1 for both evaluators (unless at max N)', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        const stats = createSessionStats(nLevel, [
          { id: 'position', hits: 10, misses: 0, fa: 0, cr: 10 },
          { id: 'audio', hits: 10, misses: 0, fa: 0, cr: 10 },
        ]);

        const jaeggi = evaluateJaeggiProgression(stats);
        const bw = evaluateBrainWorkshopProgression(stats);

        // NLEVEL-2 fix: At max N, both should maintain instead of promote
        if (nLevel >= DIFFICULTY_MAX_N_LEVEL) {
          return jaeggi.delta === 0 && bw.delta === 0;
        }
        return jaeggi.delta === 1 && bw.delta === 1;
      }),
      { numRuns: 50 },
    );
  });

  it('very poor performance gives negative or zero delta for both evaluators (at nLevel > 1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (nLevel) => {
        // Very bad: many errors
        const stats = createSessionStats(nLevel, [
          { id: 'position', hits: 1, misses: 10, fa: 5, cr: 5 },
          { id: 'audio', hits: 1, misses: 10, fa: 5, cr: 5 },
        ]);

        const jaeggi = evaluateJaeggiProgression(stats);
        const bw = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });

        // Both should not give +1 for very poor performance
        return jaeggi.delta <= 0 && bw.delta <= 0;
      }),
      { numRuns: 50 },
    );
  });
});
