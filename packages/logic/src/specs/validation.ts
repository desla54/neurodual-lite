/**
 * Mode Specification Validation
 *
 * Zod schemas for validating mode specs at runtime.
 * Useful for:
 * - Development-time spec validation
 * - Cloud sync / import validation
 * - Preventing spec drift
 */

import { z } from 'zod';
import {
  VALID_PROBABILITY_MIN,
  VALID_PROBABILITY_MAX,
  VALID_DPRIME_MIN,
  VALID_DPRIME_MAX,
  VALID_ACCURACY_MIN,
  VALID_ACCURACY_MAX,
} from './thresholds';

// =============================================================================
// Sub-schemas
// =============================================================================

export const ModeMetadataSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  difficultyLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export const TimingSpecSchema = z.object({
  stimulusDurationMs: z.number().nonnegative(),
  intervalMs: z.number().nonnegative(),
  responseWindowMs: z.number().positive().optional(),
  feedbackDurationMs: z.number().positive().optional(),
  warmupStimulusDurationMs: z.number().positive().optional(),
});

export const ScoringStrategySchema = z.union([
  z.literal('sdt'),
  z.literal('dualnback-classic'),
  z.literal('brainworkshop'),
  z.literal('accuracy'),
]);

export const UPSSpecSchema = z
  .object({
    accuracyWeight: z.number().min(0).max(1),
    confidenceWeight: z.number().min(0).max(1),
  })
  .strict();

export const TempoConfidenceSpecSchema = z
  .object({
    timingDiscipline: z.number().min(0).max(1),
    rtStability: z.number().min(0).max(1),
    pressStability: z.number().min(0).max(1),
    errorAwareness: z.number().min(0).max(1),
    focusScore: z.number().min(0).max(1),
    pesLookaheadTrials: z.number().int().positive().optional(),
  })
  .strict();

export const DualnbackClassicConfidenceSpecSchema = z
  .object({
    accuracyThreshold: z.number().min(0).max(1),
    withTiming: z
      .object({
        timingDiscipline: z.number().min(0).max(1),
        rtStability: z.number().min(0).max(1),
        errorAwareness: z.number().min(0).max(1),
        focusScore: z.number().min(0).max(1),
        pressStability: z.number().min(0).max(1),
      })
      .strict(),
    withoutTiming: z
      .object({
        rtStability: z.number().min(0).max(1),
        errorAwareness: z.number().min(0).max(1),
        focusScore: z.number().min(0).max(1),
        pressStability: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

export const ScoringSpecSchema = z.object({
  strategy: ScoringStrategySchema,
  passThreshold: z.number().positive(),
  downThreshold: z.number().positive().optional(),
  flowThreshold: z.number().min(0).max(100).optional(),
  ups: UPSSpecSchema.optional(),
  confidence: z.union([TempoConfidenceSpecSchema, DualnbackClassicConfidenceSpecSchema]).optional(),
});

export const GenerationSpecSchema = z.object({
  generator: z.union([
    z.literal('Sequence'),
    z.literal('DualnbackClassic'),
    z.literal('BrainWorkshop'),
    z.literal('Aleatoire'),
  ]),
  targetProbability: z.number().min(VALID_PROBABILITY_MIN).max(VALID_PROBABILITY_MAX),
  lureProbability: z.number().min(VALID_PROBABILITY_MIN).max(VALID_PROBABILITY_MAX),
  sequenceMode: z.union([z.literal('tempo'), z.literal('memo'), z.literal('flow')]).optional(),
});

export const SessionDefaultsSpecSchema = z.object({
  nLevel: z.number().int().positive(),
  trialsCount: z.number().int().positive(),
  activeModalities: z.array(z.string()),
});

export const AdaptivitySpecSchema = z.object({
  algorithm: z.union([
    z.literal('none'),
    z.literal('jaeggi-v1'),
    z.literal('brainworkshop-v1'),
    z.literal('adaptive'),
  ]),
  nLevelSource: z.union([z.literal('user'), z.literal('profile')]),
  configurableSettings: z.array(z.string()),
});

export const ReportSectionIdSchema = z.union([
  z.literal('HERO'),
  z.literal('RECENT_TREND'),
  z.literal('PERFORMANCE'),
  z.literal('CONFIDENCE_BREAKDOWN'),
  z.literal('ERROR_PROFILE'),
  z.literal('INSIGHTS'),
  z.literal('SPEED'),
  z.literal('NEXT_STEP'),
  z.literal('REWARD_INDICATOR'),
  z.literal('DETAILS'),
]);

export const InsightMetricIdSchema = z.union([
  z.literal('confidence'),
  z.literal('directness'),
  z.literal('placementTime'),
  z.literal('wrongSlotDwell'),
  z.literal('fluency'),
  z.literal('corrections'),
  z.literal('slotAccuracy'),
  z.literal('recentAccuracies'),
  z.literal('responseTime'),
  z.literal('writingAccuracy'),
]);

export const ModeColorSpecSchema = z
  .object({
    bg: z.string().min(1),
    border: z.string().min(1),
    text: z.string().min(1),
    accent: z.string().min(1),
  })
  .strict();

export const ReportDisplaySpecSchema = z
  .object({
    modeScoreKey: z.string().min(1),
    modeScoreTooltipKey: z.string().min(1),
    speedStatKey: z.string().min(1),
    insightMetrics: z.array(InsightMetricIdSchema).optional(),
    colors: ModeColorSpecSchema,
  })
  .strict();

export const ReportUISpecSchema = z
  .object({
    modalityLayout: z.enum(['auto', 'scroll', 'grid-2', 'grid-3']).optional(),
    familyColors: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const ModeReportSpecSchema = z.object({
  sections: z.array(ReportSectionIdSchema),
  display: ReportDisplaySpecSchema,
  ui: ReportUISpecSchema.optional(),
});

export const SessionTypeSchema = z.union([
  z.literal('GameSession'),
  z.literal('PlaceSession'),
  z.literal('MemoSession'),
  z.literal('DualPickSession'),
  z.literal('TraceSession'),
]);

// =============================================================================
// Complete ModeSpec Schema
// =============================================================================

/**
 * Validation schema for ModeSpec.
 * Extensions are Record<string, unknown> - mode-specific validation should be done separately.
 */
export const ModeSpecSchema = z.object({
  metadata: ModeMetadataSchema,
  sessionType: SessionTypeSchema,
  scoring: ScoringSpecSchema,
  timing: TimingSpecSchema,
  generation: GenerationSpecSchema,
  defaults: SessionDefaultsSpecSchema,
  adaptivity: AdaptivitySpecSchema,
  report: ModeReportSpecSchema,
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedModeSpec = z.infer<typeof ModeSpecSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate a ModeSpec at runtime.
 * Throws ZodError if validation fails.
 *
 * @example
 * ```ts
 * const spec = validateModeSpec(DualPlaceSpec);
 * // Guaranteed to be valid
 * ```
 */
export function validateModeSpec(spec: unknown): ValidatedModeSpec {
  return ModeSpecSchema.parse(spec);
}

/**
 * Validate a ModeSpec safely without throwing.
 * Returns success/error object.
 *
 * @example
 * ```ts
 * const result = safeValidateModeSpec(spec);
 * if (!result.success) {
 *   console.error('Invalid spec:', result.error);
 * }
 * ```
 */
export function safeValidateModeSpec(spec: unknown) {
  return ModeSpecSchema.safeParse(spec);
}

/**
 * Validate all specs in a mode registry.
 * Useful during development to catch spec drift.
 *
 * @example
 * ```ts
 * validateAllSpecs({ 'dual-place': DualPlaceSpec, ... });
 * ```
 */
export function validateAllSpecs(specs: Record<string, unknown>): void {
  for (const [id, spec] of Object.entries(specs)) {
    try {
      validateModeSpec(spec);
    } catch (error) {
      console.error(`[Spec Validation] Invalid spec for mode "${id}":`, error);
      throw error;
    }
  }
}

// =============================================================================
// Session Config Validation (optional, for runtime safety)
// =============================================================================

/**
 * Generic session config schema (covers common fields).
 * Mode-specific configs should extend this.
 */
export const BaseSessionConfigSchema = z.object({
  nLevel: z.number().int().positive(),
  activeModalities: z.array(z.string()),
  trialsCount: z.number().int().positive(),
});

/**
 * Validate a session config against base schema.
 * For stricter validation, create mode-specific schemas.
 */
export function validateSessionConfig(config: unknown) {
  return BaseSessionConfigSchema.parse(config);
}

// =============================================================================
// Dev-only Validation Hook (for in-dev checks)
// =============================================================================

/**
 * Run spec validation in development mode only.
 * No-op in production (tree-shaken).
 *
 * @example
 * ```ts
 * // In your spec files:
 * if (import.meta.env.DEV) {
 *   devValidateSpec(DualPlaceSpec);
 * }
 * ```
 */
export function devValidateSpec(spec: unknown): void {
  const isDev =
    (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') ||
    (import.meta as unknown as { env?: Record<string, unknown> }).env?.['MODE'] === 'development' ||
    (import.meta as unknown as { env?: Record<string, unknown> }).env?.['DEV'] === true;

  if (isDev) {
    const result = safeValidateModeSpec(spec);
    if (!result.success) {
      console.error('[DEV] Invalid ModeSpec:', result.error.format());
    }
  }
}

// =============================================================================
// Judge-Spec Validation (Development Safety)
// =============================================================================

/**
 * Validate that a spec's scoring strategy is compatible with a judge instance.
 * Helps catch configuration errors during development.
 *
 * @param spec - Mode specification
 * @param judge - Trial judge instance (if using classes with instanceof checks)
 * @throws Error if strategy doesn't match expected judge type
 *
 * @example
 * ```ts
 * // In session constructor (dev-only):
 * if (import.meta.env.DEV) {
 *   validateJudgeMatchesSpec(spec, this.judge);
 * }
 * ```
 */
export function validateJudgeMatchesSpec(spec: unknown, judge: unknown): void {
  const result = safeValidateModeSpec(spec);
  if (!result.success) {
    throw new Error(`Invalid ModeSpec: ${result.error.issues.map((e) => e.message).join(', ')}`);
  }

  const validSpec = result.data;
  const strategy = validSpec.scoring.strategy;
  const judgeName = judge?.constructor?.name ?? 'Unknown';

  // Check SDT-based strategies
  if (strategy === 'sdt' || strategy === 'dualnback-classic' || strategy === 'brainworkshop') {
    if (judgeName !== 'SDTJudge') {
      throw new Error(
        `[Judge Validation] Spec strategy "${strategy}" requires SDTJudge, got ${judgeName}`,
      );
    }
  }

  // Check accuracy strategy
  if (strategy === 'accuracy') {
    if (judgeName !== 'AccuracyJudge') {
      throw new Error(
        `[Judge Validation] Spec strategy "accuracy" requires AccuracyJudge, got ${judgeName}`,
      );
    }
  }
}

/**
 * Check if a pass threshold is in a reasonable range for the given strategy.
 * Helps catch configuration typos (e.g., using 80 instead of 0.8).
 *
 * @param spec - Mode specification
 * @returns true if threshold is reasonable
 *
 * @example
 * ```ts
 * if (!isThresholdReasonable(spec)) {
 *   console.warn('Suspicious threshold value:', spec.scoring.passThreshold);
 * }
 * ```
 */
export function isThresholdReasonable(spec: unknown): boolean {
  const result = safeValidateModeSpec(spec);
  if (!result.success) return false;

  const validSpec = result.data;
  const { strategy, passThreshold } = validSpec.scoring;

  // d' thresholds (from thresholds.ts SSOT)
  if (strategy === 'sdt' || strategy === 'dualnback-classic' || strategy === 'brainworkshop') {
    return passThreshold >= VALID_DPRIME_MIN && passThreshold <= VALID_DPRIME_MAX;
  }

  // Accuracy thresholds (from thresholds.ts SSOT)
  if (strategy === 'accuracy') {
    return passThreshold >= VALID_ACCURACY_MIN && passThreshold <= VALID_ACCURACY_MAX;
  }

  return true;
}
