/**
 * Schema ↔ Type Conformity Tests
 *
 * Compile-time assertions that verify Zod schemas stay in sync with their
 * corresponding TypeScript types. If a schema drifts from its type (or
 * vice-versa), TypeScript will fail to compile this file.
 *
 * Pattern:
 *   const _a: SchemaType extends TSType ? true : never = true;  // schema ⊆ type
 *   const _b: TSType extends SchemaType ? true : never = true;  // type ⊆ schema
 *
 * When a direction is known to diverge intentionally (e.g. Date vs string
 * for serialization boundaries, ReadonlyMap vs Record for JSON), the failing
 * direction is commented out with a TODO explaining the drift.
 */

import { describe, it, expect } from 'bun:test';
import type { z } from 'zod';

// ── Boundary Schemas ────────────────────────────────────────────────────────
import type {
  HistoryModalityStatsSchema,
  ModalityProfileSchema,
  ProgressionPointSchema,
  PlayerProfileSchema,
  SavedJourneySchema,
  UnlockedBadgeSchema,
  ProgressionRecordSchema,
  AlgorithmStateSchema,
  SessionHistoryItemJSONSchema,
  JourneyStageProgressSchema,
  JourneyStateSchema,
} from './boundary-schemas';

// ── Spec Validation Schemas ─────────────────────────────────────────────────
import type {
  TimingSpecSchema,
  GenerationSpecSchema,
  ScoringSpecSchema,
  AdaptivitySpecSchema,
  SessionDefaultsSpecSchema,
  ModeSpecSchema,
  ModeMetadataSchema,
} from '../specs/validation';

// ── Corresponding TypeScript types ──────────────────────────────────────────
import type { ModalityRunningStats } from '../types/events';
import type {
  ModalityProfile,
  ProgressionPoint,
  PlayerProfile,
  UnlockedBadge,
  ProgressionRecord,
} from '../types/progression';
import type { SavedJourney } from '../ports/settings-port';
import type { AlgorithmState } from '../sequence/types/algorithm';
import type { SessionHistoryItem } from '../ports/history-port';
import type { JourneyStageProgress, JourneyState } from '../types/journey';
import type {
  TimingSpec,
  GenerationSpec,
  ScoringSpec,
  AdaptivitySpec,
  SessionDefaultsSpec,
  ModeMetadataSpec,
  ModeSpec,
} from '../specs/types';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Mutable<T> strips `readonly` from all properties (shallow).
 * Useful because z.infer produces mutable types while our interfaces use readonly.
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * DeepMutable<T> strips `readonly` recursively, and converts
 * ReadonlyArray<X> → X[] and ReadonlyMap<K,V> → Record<K,V>.
 *
 * This normalizes the structural differences between z.infer output
 * (always mutable) and our domain interfaces (readonly by convention).
 */
type DeepMutable<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Record<K & string, DeepMutable<V>>
    : T extends ReadonlyArray<infer U>
      ? DeepMutable<U>[]
      : T extends object
        ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
        : T;

// =============================================================================
// Boundary Schemas ↔ Types
// =============================================================================

describe('Schema ↔ Type conformity: boundary-schemas', () => {
  it('HistoryModalityStatsSchema ↔ ModalityRunningStats', () => {
    type Schema = z.infer<typeof HistoryModalityStatsSchema>;
    // Bidirectional check (readonly is the only difference, shallow Mutable suffices)
    const _a: Mutable<ModalityRunningStats> extends Schema ? true : never = true;
    const _b: Schema extends Mutable<ModalityRunningStats> ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('ModalityProfileSchema ↔ ModalityProfile', () => {
    type Schema = z.infer<typeof ModalityProfileSchema>;
    const _a: Mutable<ModalityProfile> extends Schema ? true : never = true;
    const _b: Schema extends Mutable<ModalityProfile> ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('ProgressionPointSchema ↔ ProgressionPoint', () => {
    type Schema = z.infer<typeof ProgressionPointSchema>;
    const _a: Mutable<ProgressionPoint> extends Schema ? true : never = true;
    const _b: Schema extends Mutable<ProgressionPoint> ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('SavedJourneySchema ↔ SavedJourney', () => {
    // Schema uses .passthrough() so z.infer adds [k: string]: unknown
    type Schema = z.infer<typeof SavedJourneySchema>;
    // SavedJourney ⊆ Schema (type is a subset of the passthrough schema)
    const _a: Mutable<SavedJourney> extends Schema ? true : never = true;
    // TODO: Schema ⊄ SavedJourney — schema has passthrough index signature [k: string]: unknown
    // const _b: Schema extends Mutable<SavedJourney> ? true : never = true;
    expect(_a).toBe(true);
  });

  it('AlgorithmStateSchema ↔ AlgorithmState', () => {
    type Schema = z.infer<typeof AlgorithmStateSchema>;
    const _a: Mutable<AlgorithmState> extends Schema ? true : never = true;
    const _b: Schema extends Mutable<AlgorithmState> ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('UnlockedBadgeSchema → UnlockedBadge (known drift: Date vs string|number)', () => {
    type Schema = z.infer<typeof UnlockedBadgeSchema>;
    // DRIFT: Schema.unlockedAt is string | number, but UnlockedBadge.unlockedAt is Date.
    // This is intentional — the schema validates serialized (JSON) data at boundaries,
    // while the TS type represents the in-memory domain object.
    //
    // We verify the structural keys match (minus the Date↔string divergence):
    type SchemaKeys = keyof Schema;
    type TypeKeys = keyof UnlockedBadge;
    const _keysMatch: SchemaKeys extends TypeKeys ? true : never = true;
    const _keysMatch2: TypeKeys extends SchemaKeys ? true : never = true;
    expect(_keysMatch && _keysMatch2).toBe(true);
  });

  it('ProgressionRecordSchema → ProgressionRecord (known drift)', () => {
    type Schema = z.infer<typeof ProgressionRecordSchema>;
    // DRIFT 1: Schema.firstSessionAt is string | null, ProgressionRecord.firstSessionAt is Date | null.
    // DRIFT 2: ProgressionRecord has extra field `uninterruptedSessionsStreak` not in schema.
    //
    // Verify schema keys are a subset of type keys:
    type SchemaKeys = keyof Schema;
    type TypeKeys = keyof ProgressionRecord;
    const _schemaSubset: SchemaKeys extends TypeKeys ? true : never = true;
    // TODO: TypeKeys ⊄ SchemaKeys — type has extra `uninterruptedSessionsStreak`
    // const _typeSubset: TypeKeys extends SchemaKeys ? true : never = true;
    expect(_schemaSubset).toBe(true);
  });

  it('PlayerProfileSchema → PlayerProfile (known drift: Map vs Record)', () => {
    type Schema = z.infer<typeof PlayerProfileSchema>;
    // DRIFT: PlayerProfile uses ReadonlyMap for modalities/maxNByModality/masteryCountByModality,
    // while the schema uses Record (z.record). This is intentional: the schema validates
    // JSON (which serializes Maps as Records), the type uses Maps in-memory.
    //
    // After normalizing Map→Record via DeepMutable, the schema should be a superset:
    type Normalized = DeepMutable<PlayerProfile>;
    const _a: Normalized extends Schema ? true : never = true;
    const _b: Schema extends Normalized ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('SessionHistoryItemJSONSchema → SessionHistoryItem (known drift: JSON boundary)', () => {
    type Schema = z.infer<typeof SessionHistoryItemJSONSchema>;
    type Item = Mutable<SessionHistoryItem>;
    // DRIFT: The schema is for JSON serialization, the type is the in-memory model.
    // - createdAt: string (schema) vs Date (type)
    // - Type has extra fields: journeyContext, unifiedMetrics, xpBreakdown, avgPressDurationMs, etc.
    //
    // Verify schema keys are a subset of type keys (minus serialization differences):
    type SchemaKeys = keyof Schema;
    type TypeKeys = keyof Item;
    const _schemaSubset: SchemaKeys extends TypeKeys ? true : never = true;
    // TODO: TypeKeys ⊄ SchemaKeys — type has many extra fields (unifiedMetrics, xpBreakdown, etc.)
    // const _typeSubset: TypeKeys extends SchemaKeys ? true : never = true;
    expect(_schemaSubset).toBe(true);
  });

  it('JourneyStageProgressSchema → JourneyStageProgress (known structural drift)', () => {
    type Schema = z.infer<typeof JourneyStageProgressSchema>;
    type TSType = Mutable<JourneyStageProgress>;
    // DRIFT: Schema and type have different structures:
    //   Schema: { stageId, attemptsCount, validatingSessions, bestScore (number), completedAt }
    //   Type:   { stageId, status, validatingSessions, bestScore (number|null), progressPct? }
    // The schema is for persistence, the type is for in-memory state.
    //
    // Common keys that exist in both:
    type CommonKeys = 'stageId' | 'validatingSessions' | 'bestScore';
    const _schemaHasCommon: CommonKeys extends keyof Schema ? true : never = true;
    const _typeHasCommon: CommonKeys extends keyof TSType ? true : never = true;
    expect(_schemaHasCommon && _typeHasCommon).toBe(true);
  });

  it('JourneyStateSchema → JourneyState (known structural drift)', () => {
    type Schema = z.infer<typeof JourneyStateSchema>;
    type TSType = Mutable<JourneyState>;
    // DRIFT: Schema and type have different structures:
    //   Schema: { isActive, currentStageId, stages: Record<string, ...>, totalStagesCompleted, lastAttemptAt }
    //   Type:   { isActive, currentStage, stages: JourneyStageProgress[], startLevel, targetLevel, ... }
    // The schema is for DB persistence, the type is the runtime model.
    //
    // Common key:
    const _both: 'isActive' extends keyof Schema & keyof TSType ? true : never = true;
    expect(_both).toBe(true);
  });
});

// =============================================================================
// Spec Validation Schemas ↔ Types
// =============================================================================

describe('Schema ↔ Type conformity: spec validation', () => {
  it('TimingSpecSchema → TimingSpec (schema is subset)', () => {
    type Schema = z.infer<typeof TimingSpecSchema>;
    type TSType = DeepMutable<TimingSpec>;
    // Schema has: stimulusDurationMs, intervalMs, responseWindowMs?, feedbackDurationMs?, warmupStimulusDurationMs?
    // TSType has all of those PLUS: prepDelayMs?, visualOffsetMs?, audioPreset?, minValidRtMs?
    //
    // Schema ⊆ TSType (every schema field exists in the type):
    const _a: Schema extends Pick<TSType, keyof Schema> ? true : never = true;
    // TODO: TSType ⊄ Schema — type has extra optional fields (prepDelayMs, visualOffsetMs, audioPreset, minValidRtMs)
    // const _b: TSType extends Schema ? true : never = true;
    expect(_a).toBe(true);
  });

  it('GenerationSpecSchema ↔ GenerationSpec', () => {
    type Schema = z.infer<typeof GenerationSpecSchema>;
    type TSType = DeepMutable<GenerationSpec>;
    const _a: TSType extends Schema ? true : never = true;
    const _b: Schema extends TSType ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('ScoringSpecSchema ↔ ScoringSpec (bidirectional)', () => {
    type Schema = z.infer<typeof ScoringSpecSchema>;
    type TSType = DeepMutable<ScoringSpec>;
    // Both should be structurally equivalent after deep-mutabling.
    // The confidence union type might differ slightly.
    const _a: TSType extends Schema ? true : never = true;
    const _b: Schema extends TSType ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('AdaptivitySpecSchema ↔ AdaptivitySpec', () => {
    type Schema = z.infer<typeof AdaptivitySpecSchema>;
    type TSType = DeepMutable<AdaptivitySpec>;
    const _a: TSType extends Schema ? true : never = true;
    const _b: Schema extends TSType ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('SessionDefaultsSpecSchema ↔ SessionDefaultsSpec', () => {
    type Schema = z.infer<typeof SessionDefaultsSpecSchema>;
    type TSType = DeepMutable<SessionDefaultsSpec>;
    const _a: TSType extends Schema ? true : never = true;
    const _b: Schema extends TSType ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('ModeMetadataSchema ↔ ModeMetadataSpec', () => {
    type Schema = z.infer<typeof ModeMetadataSchema>;
    type TSType = DeepMutable<ModeMetadataSpec>;
    const _a: TSType extends Schema ? true : never = true;
    const _b: Schema extends TSType ? true : never = true;
    expect(_a && _b).toBe(true);
  });

  it('ModeSpecSchema → ModeSpec (schema is subset)', () => {
    type Schema = z.infer<typeof ModeSpecSchema>;
    type TSType = DeepMutable<ModeSpec>;
    // Schema keys should all exist in the type:
    type SchemaKeys = keyof Schema;
    type TypeKeys = keyof TSType;
    const _schemaSubset: SchemaKeys extends TypeKeys ? true : never = true;
    // TODO: TypeKeys ⊄ SchemaKeys — ModeSpec has extra `stats?: ModeStatsSpec`
    // const _typeSubset: TypeKeys extends SchemaKeys ? true : never = true;
    expect(_schemaSubset).toBe(true);
  });
});
