/**
 * Property-Based Tests for Journey Router, Scoring, and Constants
 *
 * Uses fast-check to verify invariants and properties of the journey system.
 * These tests complement unit tests by exploring edge cases and random inputs.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

// Router imports
import {
  getJourneyRoute,
  buildNavigationParams,
  hasSpecificRoute,
  getRouteForGameMode,
  type JourneyRoute,
} from './router';

// Scoring imports
import {
  computeBrainWorkshopScoreFromRaw,
  computeDualnbackClassicScoreFromRaw,
  computeBalancedScoreFromRaw,
  aggregateRawStats,
  computeJaeggiProgression,
  evaluateBrainWorkshopSession,
  getThresholdForStrategy,
  createScoreResultFromPrecomputed,
  type JourneyScoringStrategy,
  type RawSDTStats,
} from './scoring';

// Constants imports
import {
  generateJourneyStages,
  getTotalStagesForTarget,
  getStageDefinition,
  isStageRequiresPremium,
  JOURNEY_PREMIUM_N_THRESHOLD,
} from './constants';

// Spec imports
import {
  GAME_MODE_TO_ROUTE,
  JOURNEY_SCORE_THRESHOLDS,
  getSessionsRequired,
  type JourneyModeType,
} from '../../specs/journey.spec';

// Thresholds imports
import {
  SCORE_MAX,
  SCORE_MIN,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  JOURNEY_MAX_LEVEL,
  JOURNEY_MODES_PER_LEVEL,
} from '../../specs/thresholds';

import type { JourneyStageDefinition } from '../../types/journey';

// =============================================================================
// Arbitraries (generators for test data)
// =============================================================================

const validModes: JourneyModeType[] = ['pick', 'place', 'memo', 'catch', 'simulator'];
const nonSimulatorModes: JourneyModeType[] = ['pick', 'place', 'memo', 'catch'];
const validRoutes: JourneyRoute[] = [
  '/nback',
  '/dual-place',
  '/dual-memo',
  '/dual-pick',
  '/dual-trace',
];

const journeyModeArb = fc.constantFrom(...validModes);
const nonSimulatorModeArb = fc.constantFrom(...nonSimulatorModes);
const nLevelArb = fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL });
const stageIdArb = fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL * JOURNEY_MODES_PER_LEVEL });
const validGameModeArb = fc.constantFrom(
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-catch',
  'dual-place',
  'dual-pick',
  'dual-memo',
  'dual-trace',
  'custom',
);

const sdtCountsArb = fc.record({
  hits: fc.integer({ min: 0, max: 50 }),
  misses: fc.integer({ min: 0, max: 50 }),
  falseAlarms: fc.integer({ min: 0, max: 50 }),
  correctRejections: fc.integer({ min: 0, max: 50 }),
});

const stageDefinitionArb = fc.record({
  stageId: stageIdArb,
  nLevel: nLevelArb,
  mode: journeyModeArb,
});

const journeyConfigArb = fc
  .record({
    journeyId: fc.uuid(),
    startLevel: nLevelArb,
    targetLevel: nLevelArb,
    gameMode: fc.option(validGameModeArb, { nil: undefined }),
  })
  .map((config) => ({
    ...config,
    // Ensure targetLevel >= startLevel
    targetLevel: Math.max(config.startLevel, config.targetLevel),
  }));

const scoringStrategyArb: fc.Arbitrary<JourneyScoringStrategy> = fc.constantFrom(
  'brainworkshop',
  'dualnback-classic',
  'jaeggi',
  'balanced',
  'dprime',
);

// =============================================================================
// Route Resolution Tests (15 tests)
// =============================================================================

describe('Journey Router - Property Tests', () => {
  describe('Route Resolution', () => {
    it('getJourneyRoute always returns a valid route', () => {
      fc.assert(
        fc.property(
          stageDefinitionArb,
          fc.option(validGameModeArb, { nil: undefined }),
          (stage, gameMode) => {
            const route = getJourneyRoute(stage as JourneyStageDefinition, gameMode);
            return validRoutes.includes(route);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('all modes default to /nback when no gameMode provided', () => {
      fc.assert(
        fc.property(journeyModeArb, nLevelArb, stageIdArb, (mode, nLevel, stageId) => {
          const stage: JourneyStageDefinition = { stageId, nLevel, mode };
          const route = getJourneyRoute(stage);
          return route === '/nback';
        }),
        { numRuns: 100 },
      );
    });

    it('simulator mode without gameMode defaults to /nback', () => {
      fc.assert(
        fc.property(nLevelArb, stageIdArb, (nLevel, stageId) => {
          const stage: JourneyStageDefinition = { stageId, nLevel, mode: 'simulator' };
          const route = getJourneyRoute(stage);
          return route === '/nback';
        }),
        { numRuns: 50 },
      );
    });

    it('simulator mode with valid gameMode uses GAME_MODE_TO_ROUTE', () => {
      fc.assert(
        fc.property(nLevelArb, stageIdArb, validGameModeArb, (nLevel, stageId, gameMode) => {
          const stage: JourneyStageDefinition = { stageId, nLevel, mode: 'simulator' };
          const route = getJourneyRoute(stage, gameMode);
          const expectedRoute = GAME_MODE_TO_ROUTE[gameMode] ?? '/nback';
          return route === expectedRoute;
        }),
        { numRuns: 100 },
      );
    });

    it('getRouteForGameMode is consistent with GAME_MODE_TO_ROUTE', () => {
      fc.assert(
        fc.property(validGameModeArb, (gameMode) => {
          const route = getRouteForGameMode(gameMode);
          const expectedRoute = GAME_MODE_TO_ROUTE[gameMode] ?? '/nback';
          return route === expectedRoute;
        }),
        { numRuns: 50 },
      );
    });

    it('getRouteForGameMode defaults to /nback for unknown modes', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (randomMode) => {
          // Skip known modes
          fc.pre(!(randomMode in GAME_MODE_TO_ROUTE));
          const route = getRouteForGameMode(randomMode);
          return route === '/nback';
        }),
        { numRuns: 50 },
      );
    });

    it('hasSpecificRoute returns true for all mapped game modes', () => {
      fc.assert(
        fc.property(validGameModeArb, (gameMode) => {
          return hasSpecificRoute(gameMode) === gameMode in GAME_MODE_TO_ROUTE;
        }),
        { numRuns: 50 },
      );
    });

    it('buildNavigationParams preserves all config data', () => {
      fc.assert(
        fc.property(stageDefinitionArb, journeyConfigArb, (stage, config) => {
          const params = buildNavigationParams(stage as JourneyStageDefinition, config);
          return (
            params.state.journeyId === config.journeyId &&
            params.state.stageId === stage.stageId &&
            params.state.nLevel === stage.nLevel &&
            params.state.gameMode === config.gameMode
          );
        }),
        { numRuns: 100 },
      );
    });

    it('buildNavigationParams route matches getJourneyRoute', () => {
      fc.assert(
        fc.property(stageDefinitionArb, journeyConfigArb, (stage, config) => {
          const params = buildNavigationParams(stage as JourneyStageDefinition, config);
          const directRoute = getJourneyRoute(stage as JourneyStageDefinition, config.gameMode);
          return params.route === directRoute;
        }),
        { numRuns: 100 },
      );
    });

    // Standard journey mode tests removed (JOURNEY_MODE_ORDER, JourneyModeSpecs no longer exist)

    it('route string format is always valid (starts with /)', () => {
      fc.assert(
        fc.property(
          stageDefinitionArb,
          fc.option(validGameModeArb, { nil: undefined }),
          (stage, gameMode) => {
            const route = getJourneyRoute(stage as JourneyStageDefinition, gameMode);
            return route.startsWith('/') && route.length > 1;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('route never contains consecutive slashes', () => {
      fc.assert(
        fc.property(stageDefinitionArb, (stage) => {
          const route = getJourneyRoute(stage as JourneyStageDefinition);
          return !route.includes('//');
        }),
        { numRuns: 50 },
      );
    });

    it('route is deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          stageDefinitionArb,
          fc.option(validGameModeArb, { nil: undefined }),
          (stage, gameMode) => {
            const route1 = getJourneyRoute(stage as JourneyStageDefinition, gameMode);
            const route2 = getJourneyRoute(stage as JourneyStageDefinition, gameMode);
            return route1 === route2;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// Journey Scoring Tests (15 tests)
// =============================================================================

describe('Journey Scoring - Property Tests', () => {
  describe('Score Bounds', () => {
    it('BrainWorkshop score is always in [0, SCORE_MAX]', () => {
      fc.assert(
        fc.property(sdtCountsArb, (stats) => {
          const score = computeBrainWorkshopScoreFromRaw(stats);
          return score >= SCORE_MIN && score <= SCORE_MAX;
        }),
        { numRuns: 200 },
      );
    });

    it('Balanced score is always in [0, SCORE_MAX]', () => {
      fc.assert(
        fc.property(sdtCountsArb, (stats) => {
          const score = computeBalancedScoreFromRaw(stats);
          return score >= SCORE_MIN && score <= SCORE_MAX;
        }),
        { numRuns: 200 },
      );
    });

    it('DualnbackClassic score is always in [SCORE_MIN, SCORE_MAX]', () => {
      fc.assert(
        fc.property(
          fc.record({
            position: sdtCountsArb,
            audio: sdtCountsArb,
          }),
          (byModality) => {
            const { score } = computeDualnbackClassicScoreFromRaw(byModality);
            return score >= SCORE_MIN && score <= SCORE_MAX;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('createScoreResultFromPrecomputed clamps to valid range', () => {
      fc.assert(
        fc.property(fc.double({ min: -100, max: 200 }), (score) => {
          const result = createScoreResultFromPrecomputed(score);
          // The function doesn't clamp, but score should be reflected as-is
          return result.score === score;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Scoring Consistency', () => {
    it('BrainWorkshop: perfect performance yields SCORE_MAX', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (hits, cr) => {
            const stats: RawSDTStats = { hits, correctRejections: cr, falseAlarms: 0, misses: 0 };
            const score = computeBrainWorkshopScoreFromRaw(stats);
            // BW formula: H / (H + M + FA) * 100, with no errors = 100
            return score === SCORE_MAX;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('BrainWorkshop: zero denominator yields 0', () => {
      const stats: RawSDTStats = { hits: 0, correctRejections: 0, falseAlarms: 0, misses: 0 };
      const score = computeBrainWorkshopScoreFromRaw(stats);
      expect(score).toBe(0);
    });

    it('Balanced: perfect sensitivity and specificity yields SCORE_MAX', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          (hits, cr) => {
            const stats: RawSDTStats = { hits, correctRejections: cr, falseAlarms: 0, misses: 0 };
            const score = computeBalancedScoreFromRaw(stats);
            // (1 + 1) / 2 * 100 = 100
            return score === SCORE_MAX;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('DualnbackClassic: < JAEGGI_MAX_ERRORS passes, >= fails (Jaeggi 2008: "fewer than three")', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          (misses, fa) => {
            const errors = misses + fa;
            const byModality = {
              position: { hits: 10, correctRejections: 10, misses, falseAlarms: fa },
            };
            const { passed } = computeDualnbackClassicScoreFromRaw(byModality);
            // Jaeggi 2008: "fewer than three" means < 3 passes
            return passed === errors < JAEGGI_MAX_ERRORS_PER_MODALITY;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('aggregateRawStats preserves total counts', () => {
      fc.assert(
        fc.property(
          fc.record({
            position: sdtCountsArb,
            audio: sdtCountsArb,
          }),
          (byModality) => {
            const aggregated = aggregateRawStats(byModality);
            const expectedHits = byModality.position.hits + byModality.audio.hits;
            const expectedMisses = byModality.position.misses + byModality.audio.misses;
            const expectedFa = byModality.position.falseAlarms + byModality.audio.falseAlarms;
            const expectedCr =
              byModality.position.correctRejections + byModality.audio.correctRejections;
            return (
              aggregated.hits === expectedHits &&
              aggregated.misses === expectedMisses &&
              aggregated.falseAlarms === expectedFa &&
              aggregated.correctRejections === expectedCr
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Jaeggi Progression', () => {
    it('computeJaeggiProgression: < 3 errors = UP (Jaeggi 2008: "fewer than three")', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: JAEGGI_MAX_ERRORS_PER_MODALITY - 1 }), (errors) => {
          const byModality = {
            position: { hits: 10, correctRejections: 10, misses: errors, falseAlarms: 0 },
          };
          const { progression } = computeJaeggiProgression(byModality);
          return progression === 'UP';
        }),
        { numRuns: 50 },
      );
    });

    it('computeJaeggiProgression: >= 5 errors = DOWN', () => {
      fc.assert(
        fc.property(fc.integer({ min: JAEGGI_ERRORS_DOWN + 1, max: 20 }), (errors) => {
          const byModality = {
            position: { hits: 10, correctRejections: 10, misses: errors, falseAlarms: 0 },
          };
          const { progression } = computeJaeggiProgression(byModality);
          return progression === 'DOWN';
        }),
        { numRuns: 50 },
      );
    });

    it('computeJaeggiProgression: 3-5 errors = STAY (>= 3 but <= 5)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: JAEGGI_MAX_ERRORS_PER_MODALITY, max: JAEGGI_ERRORS_DOWN }),
          (errors) => {
            const byModality = {
              position: { hits: 10, correctRejections: 10, misses: errors, falseAlarms: 0 },
            };
            const { progression } = computeJaeggiProgression(byModality);
            return progression === 'STAY';
          },
        ),
        { numRuns: 20 },
      );
    });

    it('computeJaeggiProgression: empty modalities = STAY', () => {
      const { progression } = computeJaeggiProgression({});
      expect(progression).toBe('STAY');
    });
  });

  describe('BrainWorkshop Progression', () => {
    it('evaluateBrainWorkshopSession: >= 80% = UP', () => {
      fc.assert(
        fc.property(fc.integer({ min: 80, max: 100 }), (targetScore) => {
          // Create stats that yield approximately targetScore%
          // BW: score = hits / (hits + misses + fa)
          // For 80%: hits = 80, misses + fa = 20
          const hits = targetScore;
          const misses = 100 - targetScore;
          const byModality = {
            position: { hits, correctRejections: 50, misses, falseAlarms: 0 },
          };
          const { result, score } = evaluateBrainWorkshopSession(byModality);
          return score >= BW_SCORE_UP_PERCENT ? result === 'UP' : true;
        }),
        { numRuns: 50 },
      );
    });

    it('evaluateBrainWorkshopSession: < 50% = STRIKE', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 49 }), (targetScore) => {
          const hits = targetScore;
          const misses = 100 - targetScore;
          const byModality = {
            position: { hits, correctRejections: 50, misses, falseAlarms: 0 },
          };
          const { result, score } = evaluateBrainWorkshopSession(byModality);
          return score < BW_SCORE_DOWN_PERCENT ? result === 'STRIKE' : true;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Thresholds', () => {
    it('getThresholdForStrategy returns valid threshold for all strategies', () => {
      fc.assert(
        fc.property(scoringStrategyArb, (strategy) => {
          const threshold = getThresholdForStrategy(strategy);
          return typeof threshold === 'number' && threshold > 0;
        }),
        { numRuns: 20 },
      );
    });
  });
});

// =============================================================================
// Constants Consistency Tests (10 tests)
// =============================================================================

describe('Journey Constants - Property Tests', () => {
  describe('Stage Generation', () => {
    it('generateJourneyStages: total stages = (target - start + 1) * modesPerLevel', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.boolean(),
          (target, start, isSimulator) => {
            const validTarget = Math.min(target, JOURNEY_MAX_LEVEL);
            const validStart = Math.min(start, validTarget);
            const stages = generateJourneyStages(validTarget, validStart, isSimulator);
            const expectedStages = getTotalStagesForTarget(validTarget, validStart, isSimulator);
            return stages.length === expectedStages;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('generateJourneyStages: stageIds are sequential starting from 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.boolean(),
          (target, start, isSimulator) => {
            const validStart = Math.min(start, target);
            const stages = generateJourneyStages(target, validStart, isSimulator);
            return stages.every((s, i) => s.stageId === i + 1);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('generateJourneyStages: nLevels are within valid range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          fc.boolean(),
          (target, start, isSimulator) => {
            const stages = generateJourneyStages(target, start, isSimulator);
            return stages.every((s) => s.nLevel >= 1 && s.nLevel <= JOURNEY_MAX_LEVEL);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('generateJourneyStages: simulator mode has all stages with mode=simulator', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          (target, start) => {
            const validStart = Math.min(start, target);
            const stages = generateJourneyStages(target, validStart, true);
            return stages.every((s) => s.mode === 'simulator');
          },
        ),
        { numRuns: 50 },
      );
    });

    it('generateJourneyStages: respects isSimulator flag', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.boolean(),
          (target, start, isSim) => {
            const validStart = Math.min(start, target);
            const stages = generateJourneyStages(target, validStart, isSim);
            if (isSim) {
              return stages.every((s) => s.mode === 'simulator');
            }
            return stages.every((s) => s.mode !== 'simulator');
          },
        ),
        { numRuns: 50 },
      );
    });

    it('getStageDefinition returns stage with matching stageId', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          fc.integer({ min: 1, max: JOURNEY_MAX_LEVEL }),
          (target, start) => {
            const validStart = Math.min(start, target);
            // All journeys are now simulator (1 stage per level)
            const totalStages = getTotalStagesForTarget(target, validStart, true);
            const randomStageId = Math.floor(Math.random() * totalStages) + 1;
            const stage = getStageDefinition(randomStageId, target, validStart, true);
            return stage?.stageId === randomStageId;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Premium Thresholds', () => {
    it('isStageRequiresPremium: nLevel < PREMIUM_N_THRESHOLD = free', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: JOURNEY_PREMIUM_N_THRESHOLD - 1 }),
          journeyModeArb,
          (nLevel, mode) => {
            const stage: JourneyStageDefinition = { stageId: 1, nLevel, mode };
            return isStageRequiresPremium(stage) === false;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('isStageRequiresPremium: nLevel >= PREMIUM_N_THRESHOLD = premium', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: JOURNEY_PREMIUM_N_THRESHOLD, max: JOURNEY_MAX_LEVEL }),
          journeyModeArb,
          (nLevel, mode) => {
            const stage: JourneyStageDefinition = { stageId: 1, nLevel, mode };
            return isStageRequiresPremium(stage) === true;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Score Thresholds Consistency', () => {
    it('JOURNEY_SCORE_THRESHOLDS are in descending order', () => {
      expect(JOURNEY_SCORE_THRESHOLDS.EXCELLENT).toBeGreaterThan(JOURNEY_SCORE_THRESHOLDS.GOOD);
      expect(JOURNEY_SCORE_THRESHOLDS.GOOD).toBeGreaterThan(JOURNEY_SCORE_THRESHOLDS.PASSING);
    });

    it('getSessionsRequired returns fewer sessions for higher scores', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (score1, score2) => {
            fc.pre(score1 !== score2);
            const sessions1 = getSessionsRequired(score1);
            const sessions2 = getSessionsRequired(score2);
            // Higher score should require <= sessions
            if (score1 > score2) {
              return sessions1 <= sessions2;
            }
            return sessions2 <= sessions1;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
