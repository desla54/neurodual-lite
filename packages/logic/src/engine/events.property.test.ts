/**
 * Property-Based Tests for Game Events
 *
 * Comprehensive property tests covering:
 * 1. Event structure invariants (20 tests)
 * 2. Event serialization (15 tests)
 * 3. Event aggregation (15 tests)
 *
 * Uses fast-check to verify invariants hold for all valid inputs.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  GameEventSchema,
  getTotalStats,
  getModalityStats,
  getTrialModalityOutcome,
  getAllReactionTimes,
} from './events';
import type { RunningStats, TrialOutcome } from '../types/events';
import {
  COLORS,
  IMAGE_MODALITY_SHAPES,
  POSITIONS,
  SOUNDS,
  type ModalityId,
  type TrialResult,
} from '../types/core';

// =============================================================================
// Arbitraries (Generators for property tests)
// =============================================================================

/** Generate valid UUID-like strings */
const uuidArb = fc.uuid();

/** Generate valid timestamps (reasonable range) */
const timestampArb = fc.integer({ min: 1000000000000, max: 2000000000000 });

/** Generate positive integers for counts */
const countArb = fc.integer({ min: 0, max: 100 });

/** Generate valid modality IDs */
const modalityIdArb = fc.constantFrom<ModalityId>('position', 'audio', 'color');

/** Generate valid trial results */
const trialResultArb = fc.constantFrom<TrialResult>(
  'hit',
  'miss',
  'falseAlarm',
  'correctRejection',
);

/** Generate valid n-levels */
const nLevelArb = fc.integer({ min: 1, max: 10 });

/** Generate valid reaction times (null or positive number) */
const reactionTimeArb = fc.oneof(fc.constant(null), fc.integer({ min: 100, max: 5000 }));

/** Generate valid d-prime values */
const dPrimeArb = fc.double({ min: -5, max: 5, noNaN: true });

/** Generate valid platform */
const platformArb = fc.constantFrom<'web' | 'android' | 'ios'>('web', 'android', 'ios');

/** Generate valid time of day */
const timeOfDayArb = fc.constantFrom<'morning' | 'afternoon' | 'evening' | 'night'>(
  'morning',
  'afternoon',
  'evening',
  'night',
);

/** Generate valid DeviceInfo */
const deviceInfoArb = fc.record({
  platform: platformArb,
  screenWidth: fc.integer({ min: 320, max: 3840 }),
  screenHeight: fc.integer({ min: 480, max: 2160 }),
  userAgent: fc.string({ minLength: 1, maxLength: 200 }),
  touchCapable: fc.boolean(),
});

/** Generate valid TemporalContext */
const temporalContextArb = fc.record({
  timeOfDay: timeOfDayArb,
  localHour: fc.integer({ min: 0, max: 23 }),
  dayOfWeek: fc.integer({ min: 0, max: 6 }),
  timezone: fc.constantFrom('UTC', 'America/New_York', 'Europe/Paris', 'Asia/Tokyo'),
});

/** Generate valid BlockConfig */
const blockConfigArb = fc.record({
  nLevel: nLevelArb,
  activeModalities: fc.array(modalityIdArb, { minLength: 1, maxLength: 3 }),
  trialsCount: fc.integer({ min: 5, max: 100 }),
  targetProbability: fc.double({ min: 0.1, max: 0.5, noNaN: true }),
  lureProbability: fc.double({ min: 0, max: 0.3, noNaN: true }),
  intervalSeconds: fc.double({ min: 1, max: 5, noNaN: true }),
  stimulusDurationSeconds: fc.double({ min: 0.3, max: 2, noNaN: true }),
  generator: fc.constantFrom('Aleatoire', 'BrainWorkshop', 'DualnbackClassic', 'Sequence'),
});

const gameModeArb = fc.constantFrom(
  'dualnback-classic',
  'dual-place',
  'dual-memo',
  'dual-trace',
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-pick',
  'custom',
);

const trialArb = fc.record({
  index: fc.integer({ min: 0, max: 500 }),
  isBuffer: fc.boolean(),
  position: fc.constantFrom(...POSITIONS),
  sound: fc.constantFrom(...SOUNDS),
  color: fc.constantFrom(...COLORS),
  image: fc.constantFrom(...IMAGE_MODALITY_SHAPES),
  trialType: fc.constantFrom('V-Seul', 'A-Seul', 'Dual', 'Non-Cible', 'Tampon'),
  isPositionTarget: fc.boolean(),
  isSoundTarget: fc.boolean(),
  isColorTarget: fc.boolean(),
  isImageTarget: fc.boolean(),
});

/** Generate valid ModalityRunningStats */
const modalityRunningStatsArb = fc.record({
  hits: countArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: countArb,
  avgRT: reactionTimeArb,
  dPrime: dPrimeArb,
});

/** Generate valid RunningStats */
const runningStatsArb = fc.record({
  trialsCompleted: fc.integer({ min: 0, max: 100 }),
  globalDPrime: dPrimeArb,
  byModality: fc.dictionary(modalityIdArb, modalityRunningStatsArb),
});

/** Generate valid ModalityTrialOutcome */
const modalityTrialOutcomeArb = fc.record({
  result: trialResultArb,
  reactionTime: reactionTimeArb,
  wasLure: fc.boolean(),
});

/** Generate valid TrialOutcome */
const trialOutcomeArb = fc.record({
  trialIndex: fc.integer({ min: 0, max: 100 }),
  byModality: fc.dictionary(modalityIdArb, modalityTrialOutcomeArb),
});

/** Generate base event fields */
const baseEventFieldsArb = fc.record({
  id: uuidArb,
  timestamp: timestampArb,
  sessionId: uuidArb,
  schemaVersion: fc.constant(1 as const),
});

// =============================================================================
// 1. Event Structure Invariants (20 tests)
// =============================================================================

describe('Event Structure Invariants', () => {
  describe('BaseEvent fields', () => {
    it('all events have non-empty id strings', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, (fields) => {
          return typeof fields.id === 'string' && fields.id.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('all events have positive timestamps', () => {
      fc.assert(
        fc.property(timestampArb, (ts) => {
          return ts > 0 && Number.isInteger(ts);
        }),
        { numRuns: 100 },
      );
    });

    it('all events have non-empty sessionId strings', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, (fields) => {
          return typeof fields.sessionId === 'string' && fields.sessionId.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('schemaVersion is always 1', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, (fields) => {
          return fields.schemaVersion === 1;
        }),
        { numRuns: 100 },
      );
    });

    it('id format is UUID-like', () => {
      fc.assert(
        fc.property(uuidArb, (id) => {
          // UUID format: 8-4-4-4-12 hex characters
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(id);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('DeviceInfo structure', () => {
    it('platform is one of valid values', () => {
      fc.assert(
        fc.property(platformArb, (platform) => {
          return ['web', 'android', 'ios'].includes(platform);
        }),
        { numRuns: 50 },
      );
    });

    it('screen dimensions are positive', () => {
      fc.assert(
        fc.property(deviceInfoArb, (device) => {
          return device.screenWidth > 0 && device.screenHeight > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('touchCapable is boolean', () => {
      fc.assert(
        fc.property(deviceInfoArb, (device) => {
          return typeof device.touchCapable === 'boolean';
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('TemporalContext structure', () => {
    it('timeOfDay is valid', () => {
      fc.assert(
        fc.property(timeOfDayArb, (tod) => {
          return ['morning', 'afternoon', 'evening', 'night'].includes(tod);
        }),
        { numRuns: 50 },
      );
    });

    it('localHour is 0-23', () => {
      fc.assert(
        fc.property(temporalContextArb, (ctx) => {
          return ctx.localHour >= 0 && ctx.localHour <= 23;
        }),
        { numRuns: 100 },
      );
    });

    it('dayOfWeek is 0-6', () => {
      fc.assert(
        fc.property(temporalContextArb, (ctx) => {
          return ctx.dayOfWeek >= 0 && ctx.dayOfWeek <= 6;
        }),
        { numRuns: 100 },
      );
    });

    it('timezone is non-empty string', () => {
      fc.assert(
        fc.property(temporalContextArb, (ctx) => {
          return typeof ctx.timezone === 'string' && ctx.timezone.length > 0;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('BlockConfig structure', () => {
    it('nLevel is positive integer', () => {
      fc.assert(
        fc.property(blockConfigArb, (config) => {
          return config.nLevel >= 1 && Number.isInteger(config.nLevel);
        }),
        { numRuns: 100 },
      );
    });

    it('trialsCount is positive', () => {
      fc.assert(
        fc.property(blockConfigArb, (config) => {
          return config.trialsCount > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('probabilities are in [0, 1]', () => {
      fc.assert(
        fc.property(blockConfigArb, (config) => {
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

    it('timing values are positive', () => {
      fc.assert(
        fc.property(blockConfigArb, (config) => {
          return config.intervalSeconds > 0 && config.stimulusDurationSeconds > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('activeModalities is non-empty array', () => {
      fc.assert(
        fc.property(blockConfigArb, (config) => {
          return Array.isArray(config.activeModalities) && config.activeModalities.length > 0;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('TrialResult enumeration', () => {
    it('result is one of valid values', () => {
      fc.assert(
        fc.property(trialResultArb, (result) => {
          return ['hit', 'miss', 'falseAlarm', 'correctRejection'].includes(result);
        }),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// 2. Event Serialization (15 tests)
// =============================================================================

describe('Event Serialization', () => {
  describe('SESSION_STARTED validation', () => {
    it('valid SESSION_STARTED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          uuidArb,
          nLevelArb,
          deviceInfoArb,
          temporalContextArb,
          blockConfigArb,
          (base, userId, nLevel, device, context, config) => {
            const event = {
              ...base,
              type: 'SESSION_STARTED' as const,
              playContext: 'free' as const,
              userId,
              nLevel,
              device,
              context,
              config,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('SESSION_STARTED with optional fields passes validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          deviceInfoArb,
          temporalContextArb,
          blockConfigArb,
          fc.option(gameModeArb),
          (base, device, context, config, gameMode) => {
            const event = {
              ...base,
              type: 'SESSION_STARTED' as const,
              playContext: 'free' as const,
              userId: 'test-user',
              nLevel: config.nLevel,
              device,
              context,
              config,
              ...(gameMode !== null ? { gameMode } : {}),
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('SESSION_ENDED validation', () => {
    it('valid SESSION_ENDED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.constantFrom('completed', 'abandoned', 'error'),
          (base, reason) => {
            const event = {
              ...base,
              type: 'SESSION_ENDED' as const,
              reason,
              playContext: 'free' as const,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('TRIAL_PRESENTED validation', () => {
    it('valid TRIAL_PRESENTED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          trialArb,
          fc.integer({ min: 500, max: 5000 }),
          fc.integer({ min: 300, max: 3000 }),
          (base, trial, isiMs, stimulusDurationMs) => {
            const event = {
              ...base,
              type: 'TRIAL_PRESENTED' as const,
              trial,
              isiMs,
              stimulusDurationMs,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('USER_RESPONDED validation', () => {
    it('valid USER_RESPONDED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.integer({ min: 0, max: 100 }),
          modalityIdArb,
          fc.integer({ min: 100, max: 3000 }),
          fc.integer({ min: 50, max: 500 }),
          fc.constantFrom('during_stimulus', 'after_stimulus'),
          (base, trialIndex, modality, reactionTimeMs, pressDurationMs, responsePhase) => {
            const event = {
              ...base,
              type: 'USER_RESPONDED' as const,
              trialIndex,
              modality,
              reactionTimeMs,
              pressDurationMs,
              responsePhase,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('USER_RESPONDED with optional fields passes validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.constantFrom('keyboard', 'mouse', 'touch', 'gamepad'),
          fc.integer({ min: 0, max: 50 }),
          fc.boolean(),
          fc.boolean(),
          (base, inputMethod, processingLagMs, wasTarget, isCorrect) => {
            const event = {
              ...base,
              type: 'USER_RESPONDED' as const,
              trialIndex: 5,
              modality: 'position' as ModalityId,
              reactionTimeMs: 350,
              pressDurationMs: 100,
              responsePhase: 'during_stimulus' as const,
              inputMethod,
              processingLagMs,
              wasTarget,
              isCorrect,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('JSON serialization roundtrip', () => {
    it('events survive JSON stringify/parse roundtrip', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.constantFrom('completed', 'abandoned', 'error'),
          (base, reason) => {
            const event = {
              ...base,
              type: 'SESSION_ENDED' as const,
              reason,
              playContext: 'free' as const,
            };
            const serialized = JSON.stringify(event);
            const deserialized = JSON.parse(serialized);
            return (
              deserialized.id === event.id &&
              deserialized.timestamp === event.timestamp &&
              deserialized.sessionId === event.sessionId &&
              deserialized.schemaVersion === event.schemaVersion &&
              deserialized.type === event.type &&
              deserialized.reason === event.reason &&
              deserialized.playContext === event.playContext
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('deserialized events pass schema validation', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, (base) => {
          const event = {
            ...base,
            type: 'SESSION_ENDED' as const,
            reason: 'completed' as const,
            playContext: 'free' as const,
          };
          const serialized = JSON.stringify(event);
          const deserialized = JSON.parse(serialized);
          const result = GameEventSchema.safeParse(deserialized);
          return result.success;
        }),
        { numRuns: 50 },
      );
    });

    it('complex nested events survive roundtrip', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          deviceInfoArb,
          temporalContextArb,
          blockConfigArb,
          (base, device, context, config) => {
            const event = {
              ...base,
              type: 'SESSION_STARTED' as const,
              playContext: 'free' as const,
              userId: 'test-user',
              nLevel: config.nLevel,
              device,
              context,
              config,
            };
            const serialized = JSON.stringify(event);
            const deserialized = JSON.parse(serialized);

            return (
              deserialized.device.platform === device.platform &&
              deserialized.device.screenWidth === device.screenWidth &&
              deserialized.context.timeOfDay === context.timeOfDay &&
              deserialized.config.nLevel === config.nLevel
            );
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Invalid events rejection', () => {
    it('events without schemaVersion fail validation', () => {
      fc.assert(
        fc.property(uuidArb, timestampArb, uuidArb, (id, timestamp, sessionId) => {
          const event = {
            id,
            timestamp,
            sessionId,
            // Missing schemaVersion
            type: 'SESSION_ENDED',
            reason: 'completed',
          };
          const result = GameEventSchema.safeParse(event);
          return !result.success;
        }),
        { numRuns: 50 },
      );
    });

    it('events with invalid type fail validation', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, fc.string({ minLength: 1 }), (base, invalidType) => {
          fc.pre(!['SESSION_STARTED', 'SESSION_ENDED', 'TRIAL_PRESENTED'].includes(invalidType));
          const event = {
            ...base,
            type: invalidType,
          };
          const result = GameEventSchema.safeParse(event);
          return !result.success;
        }),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// 3. Event Aggregation (15 tests)
// =============================================================================

describe('Event Aggregation', () => {
  describe('getTotalStats', () => {
    it('totals are non-negative', () => {
      fc.assert(
        fc.property(runningStatsArb, (stats) => {
          const totals = getTotalStats(stats);
          return (
            totals.totalHits >= 0 &&
            totals.totalMisses >= 0 &&
            totals.totalFalseAlarms >= 0 &&
            totals.totalCorrectRejections >= 0
          );
        }),
        { numRuns: 100 },
      );
    });

    it('totals are integers', () => {
      fc.assert(
        fc.property(runningStatsArb, (stats) => {
          const totals = getTotalStats(stats);
          return (
            Number.isInteger(totals.totalHits) &&
            Number.isInteger(totals.totalMisses) &&
            Number.isInteger(totals.totalFalseAlarms) &&
            Number.isInteger(totals.totalCorrectRejections)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('sum matches individual modality sums', () => {
      fc.assert(
        fc.property(runningStatsArb, (stats) => {
          const totals = getTotalStats(stats);
          let expectedHits = 0;
          let expectedMisses = 0;
          let expectedFA = 0;
          let expectedCR = 0;

          for (const modStats of Object.values(stats.byModality)) {
            expectedHits += modStats.hits;
            expectedMisses += modStats.misses;
            expectedFA += modStats.falseAlarms;
            expectedCR += modStats.correctRejections;
          }

          return (
            totals.totalHits === expectedHits &&
            totals.totalMisses === expectedMisses &&
            totals.totalFalseAlarms === expectedFA &&
            totals.totalCorrectRejections === expectedCR
          );
        }),
        { numRuns: 100 },
      );
    });

    it('empty byModality returns all zeros', () => {
      const emptyStats: RunningStats = {
        trialsCompleted: 0,
        globalDPrime: 0,
        byModality: {},
      };
      const totals = getTotalStats(emptyStats);
      expect(totals.totalHits).toBe(0);
      expect(totals.totalMisses).toBe(0);
      expect(totals.totalFalseAlarms).toBe(0);
      expect(totals.totalCorrectRejections).toBe(0);
    });

    it('single modality equals totals', () => {
      fc.assert(
        fc.property(modalityRunningStatsArb, (modStats) => {
          const stats: RunningStats = {
            trialsCompleted: 10,
            globalDPrime: 1.5,
            byModality: {
              position: modStats,
            },
          };
          const totals = getTotalStats(stats);
          return (
            totals.totalHits === modStats.hits &&
            totals.totalMisses === modStats.misses &&
            totals.totalFalseAlarms === modStats.falseAlarms &&
            totals.totalCorrectRejections === modStats.correctRejections
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('getModalityStats', () => {
    it('returns correct stats for existing modality', () => {
      fc.assert(
        fc.property(runningStatsArb, (stats) => {
          for (const [modalityId, expectedStats] of Object.entries(stats.byModality)) {
            const retrieved = getModalityStats(stats, modalityId as ModalityId);
            if (
              retrieved.hits !== expectedStats.hits ||
              retrieved.misses !== expectedStats.misses
            ) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('returns empty stats for missing modality', () => {
      fc.assert(
        fc.property(runningStatsArb, (stats) => {
          // Use a modality not in the stats
          const unusedModality = 'color' as ModalityId;
          if (stats.byModality[unusedModality]) {
            return true; // Skip if color exists
          }
          const retrieved = getModalityStats(stats, unusedModality);
          return (
            retrieved.hits === 0 &&
            retrieved.misses === 0 &&
            retrieved.falseAlarms === 0 &&
            retrieved.correctRejections === 0 &&
            retrieved.dPrime === 0
          );
        }),
        { numRuns: 100 },
      );
    });

    it('returned stats have all required fields', () => {
      fc.assert(
        fc.property(runningStatsArb, modalityIdArb, (stats, modality) => {
          const retrieved = getModalityStats(stats, modality);
          return (
            'hits' in retrieved &&
            'misses' in retrieved &&
            'falseAlarms' in retrieved &&
            'correctRejections' in retrieved &&
            'avgRT' in retrieved &&
            'dPrime' in retrieved
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getTrialModalityOutcome', () => {
    it('returns correct outcome for existing modality', () => {
      fc.assert(
        fc.property(trialOutcomeArb, (outcome) => {
          for (const [modalityId, expectedOutcome] of Object.entries(outcome.byModality)) {
            const retrieved = getTrialModalityOutcome(outcome, modalityId as ModalityId);
            if (
              retrieved.result !== expectedOutcome.result ||
              retrieved.wasLure !== expectedOutcome.wasLure
            ) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('returns default outcome for missing modality', () => {
      fc.assert(
        fc.property(trialOutcomeArb, (outcome) => {
          const unusedModality = 'color' as ModalityId;
          if (outcome.byModality[unusedModality]) {
            return true;
          }
          const retrieved = getTrialModalityOutcome(outcome, unusedModality);
          return (
            retrieved.result === 'correctRejection' &&
            retrieved.reactionTime === null &&
            retrieved.wasLure === false
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getAllReactionTimes', () => {
    it('returns only non-null reaction times', () => {
      fc.assert(
        fc.property(trialOutcomeArb, (outcome) => {
          const rts = getAllReactionTimes(outcome);
          return rts.every((rt) => rt !== null && typeof rt === 'number');
        }),
        { numRuns: 100 },
      );
    });

    it('count matches number of non-null RTs in outcome', () => {
      fc.assert(
        fc.property(trialOutcomeArb, (outcome) => {
          const rts = getAllReactionTimes(outcome);
          let expectedCount = 0;
          for (const modOutcome of Object.values(outcome.byModality)) {
            if (modOutcome.reactionTime !== null) {
              expectedCount++;
            }
          }
          return rts.length === expectedCount;
        }),
        { numRuns: 100 },
      );
    });

    it('reaction times are positive', () => {
      fc.assert(
        fc.property(trialOutcomeArb, (outcome) => {
          const rts = getAllReactionTimes(outcome);
          return rts.every((rt) => rt > 0);
        }),
        { numRuns: 100 },
      );
    });

    it('empty outcome returns empty array', () => {
      const emptyOutcome: TrialOutcome = {
        trialIndex: 0,
        byModality: {},
      };
      const rts = getAllReactionTimes(emptyOutcome);
      expect(rts).toEqual([]);
    });
  });

  describe('Aggregation consistency', () => {
    it('hits + misses equals signal trials for each modality', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (hits, misses, fa, cr) => {
            const stats: RunningStats = {
              trialsCompleted: hits + misses + fa + cr,
              globalDPrime: 1.0,
              byModality: {
                position: {
                  hits,
                  misses,
                  falseAlarms: fa,
                  correctRejections: cr,
                  avgRT: 400,
                  dPrime: 1.5,
                },
              },
            };
            const totals = getTotalStats(stats);
            const signalTrials = hits + misses;
            const noiseTrials = fa + cr;
            return (
              totals.totalHits + totals.totalMisses === signalTrials &&
              totals.totalFalseAlarms + totals.totalCorrectRejections === noiseTrials
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// Additional Property Tests for More Event Types
// =============================================================================

describe('Additional Event Type Validations', () => {
  describe('FOCUS_LOST and FOCUS_REGAINED', () => {
    it('valid FOCUS_LOST events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.option(fc.integer({ min: 0, max: 100 })),
          fc.constantFrom('stimulus', 'waiting', 'idle'),
          (base, trialIndex, phase) => {
            const event = {
              ...base,
              type: 'FOCUS_LOST' as const,
              trialIndex: trialIndex ?? null,
              phase,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('valid FOCUS_REGAINED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.option(fc.integer({ min: 0, max: 100 })),
          fc.integer({ min: 0, max: 60000 }),
          (base, trialIndex, lostDurationMs) => {
            const event = {
              ...base,
              type: 'FOCUS_REGAINED' as const,
              trialIndex: trialIndex ?? null,
              lostDurationMs,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('INPUT_MISFIRED events', () => {
    it('valid INPUT_MISFIRED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.constantFrom('Space', 'KeyA', 'KeyL', 'Enter', 'Escape'),
          fc.integer({ min: 0, max: 100 }),
          fc.constantFrom('stimulus', 'waiting', 'idle'),
          (base, key, trialIndex, phase) => {
            const event = {
              ...base,
              type: 'INPUT_MISFIRED' as const,
              key,
              trialIndex,
              phase,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('RESPONSE_FILTERED events', () => {
    it('valid RESPONSE_FILTERED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.integer({ min: 0, max: 100 }),
          modalityIdArb,
          fc.constantFrom('too_fast', 'touch_bounce'),
          fc.constantFrom('stimulus', 'waiting'),
          (base, trialIndex, modality, reason, phase) => {
            const event = {
              ...base,
              type: 'RESPONSE_FILTERED' as const,
              trialIndex,
              modality,
              reason,
              phase,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('DUPLICATE_RESPONSE_DETECTED events', () => {
    it('valid DUPLICATE_RESPONSE_DETECTED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.integer({ min: 0, max: 100 }),
          modalityIdArb,
          fc.integer({ min: 0, max: 5000 }),
          fc.constantFrom('stimulus', 'waiting'),
          (base, trialIndex, modality, deltaSinceFirstMs, phase) => {
            const event = {
              ...base,
              type: 'DUPLICATE_RESPONSE_DETECTED' as const,
              trialIndex,
              modality,
              deltaSinceFirstMs,
              phase,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('INPUT_PIPELINE_LATENCY events', () => {
    it('valid INPUT_PIPELINE_LATENCY events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.integer({ min: 0, max: 100 }),
          modalityIdArb,
          fc.constantFrom('keyboard', 'mouse', 'touch', 'gamepad'),
          fc.constantFrom('stimulus', 'waiting'),
          fc.integer({ min: 0, max: 599940000 }),
          fc.integer({ min: 0, max: 60000 }),
          fc.integer({ min: 0, max: 60000 }),
          (
            base,
            trialIndex,
            modality,
            inputMethod,
            phase,
            capturedAtMs,
            inputToDispatchMs,
            inputToPaintMs,
          ) => {
            const dispatchCompletedAtMs = capturedAtMs + inputToDispatchMs;
            const paintAtMs = capturedAtMs + inputToPaintMs;
            const event = {
              ...base,
              type: 'INPUT_PIPELINE_LATENCY' as const,
              trialIndex,
              modality,
              inputMethod,
              phase,
              capturedAtMs,
              dispatchCompletedAtMs,
              paintAtMs,
              inputToDispatchMs,
              inputToPaintMs,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('SESSION_PAUSED and SESSION_RESUMED', () => {
    it('valid SESSION_PAUSED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.integer({ min: 0, max: 100 }),
          fc.constantFrom('stimulus', 'waiting', 'starting'),
          fc.integer({ min: 0, max: 120000 }),
          (base, trialIndex, previousPhase, elapsedMs) => {
            const event = {
              ...base,
              type: 'SESSION_PAUSED' as const,
              trialIndex,
              previousPhase,
              elapsedMs,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('valid SESSION_RESUMED events pass schema validation', () => {
      fc.assert(
        fc.property(baseEventFieldsArb, fc.integer({ min: 0, max: 100 }), (base, trialIndex) => {
          const event = {
            ...base,
            type: 'SESSION_RESUMED' as const,
            trialIndex,
          };
          const result = GameEventSchema.safeParse(event);
          return result.success;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('BADGE_UNLOCKED events', () => {
    it('valid BADGE_UNLOCKED events pass schema validation', () => {
      fc.assert(
        fc.property(
          baseEventFieldsArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom(
            'consistency',
            'performance',
            'resilience',
            'exploration',
            'milestone',
            'cognitive',
          ),
          fc.integer({ min: 0, max: 10 }),
          (base, badgeId, category, priority) => {
            const event = {
              ...base,
              type: 'BADGE_UNLOCKED' as const,
              badgeId,
              category,
              priority,
            };
            const result = GameEventSchema.safeParse(event);
            return result.success;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// Additional Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  it('handles maximum valid values', () => {
    const maxStats: RunningStats = {
      trialsCompleted: 1000,
      globalDPrime: 5.0,
      byModality: {
        position: {
          hits: 500,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 500,
          avgRT: 150,
          dPrime: 5.0,
        },
        audio: {
          hits: 500,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 500,
          avgRT: 200,
          dPrime: 5.0,
        },
      },
    };
    const totals = getTotalStats(maxStats);
    expect(totals.totalHits).toBe(1000);
    expect(totals.totalCorrectRejections).toBe(1000);
  });

  it('handles minimum valid values (all zeros)', () => {
    const minStats: RunningStats = {
      trialsCompleted: 0,
      globalDPrime: 0,
      byModality: {
        position: {
          hits: 0,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 0,
          avgRT: null,
          dPrime: 0,
        },
      },
    };
    const totals = getTotalStats(minStats);
    expect(totals.totalHits).toBe(0);
    expect(totals.totalMisses).toBe(0);
    expect(totals.totalFalseAlarms).toBe(0);
    expect(totals.totalCorrectRejections).toBe(0);
  });

  it('journeyStageId boundary values', () => {
    const validStageIds = [1, 30, 60];
    const invalidStageIds = [0, -1, 61, 100];

    for (const stageId of validStageIds) {
      const sessionStartEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId: crypto.randomUUID(),
        schemaVersion: 1,
        type: 'SESSION_STARTED' as const,
        playContext: 'journey' as const,
        userId: 'test',
        nLevel: 2,
        device: {
          platform: 'web' as const,
          screenWidth: 1024,
          screenHeight: 768,
          userAgent: 'test',
          touchCapable: false,
        },
        context: {
          timeOfDay: 'morning' as const,
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'UTC',
        },
        config: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.2,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
          generator: 'BrainWorkshop',
        },
        journeyStageId: stageId,
        journeyId: 'journey-test',
        journeyStartLevel: 1,
        journeyTargetLevel: 2,
      };
      const result = GameEventSchema.safeParse(sessionStartEvent);
      expect(result.success).toBe(true);
    }

    for (const stageId of invalidStageIds) {
      const event = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId: crypto.randomUUID(),
        schemaVersion: 1,
        type: 'SESSION_STARTED' as const,
        playContext: 'journey' as const,
        userId: 'test',
        nLevel: 2,
        device: {
          platform: 'web' as const,
          screenWidth: 1024,
          screenHeight: 768,
          userAgent: 'test',
          touchCapable: false,
        },
        context: {
          timeOfDay: 'morning' as const,
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'UTC',
        },
        config: {
          nLevel: 2,
          activeModalities: ['position'],
          trialsCount: 20,
          targetProbability: 0.2,
          lureProbability: 0.1,
          intervalSeconds: 2,
          stimulusDurationSeconds: 0.5,
          generator: 'BrainWorkshop',
        },
        journeyStageId: stageId,
        journeyId: 'journey-test',
        journeyStartLevel: 1,
        journeyTargetLevel: 2,
      };
      const result = GameEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    }
  });
});
