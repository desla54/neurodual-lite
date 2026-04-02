/**
 * Boundary Validation Schemas
 *
 * Zod schemas for validating data at system boundaries:
 * - External API responses (Supabase)
 * - Import/export data
 * - Realtime webhooks
 * - Cloud settings
 *
 * Rule: NEVER trust external data. Always validate at boundaries.
 */

import { z } from 'zod';

// =============================================================================
// Session History Import/Export
// =============================================================================

/** Stats par modalité */
export const HistoryModalityStatsSchema = z.object({
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  falseAlarms: z.number().int().nonnegative(),
  correctRejections: z.number().int().nonnegative(),
  avgRT: z.number().nullable(),
  dPrime: z.number(),
});

/** Raison de fin de session */
export const SessionEndReasonSchema = z.enum(['completed', 'abandoned', 'error']);

/** Session sérialisée en JSON */
export const SessionHistoryItemJSONSchema = z.object({
  id: z.string().uuid(),
  createdAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)), // ISO date or date-like
  nLevel: z.number().int().min(1).max(20),
  dPrime: z.number(),
  passed: z.boolean(),
  trialsCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  byModality: z.record(z.string(), HistoryModalityStatsSchema),
  generator: z.string(),
  gameMode: z.string().optional(),
  activeModalities: z.array(z.string()),
  reason: SessionEndReasonSchema,
  journeyStageId: z.number().int().min(1).optional(), // No max - journey can have many stages
  journeyId: z.string().optional(), // Multi-journey support
  playContext: z.enum(['journey', 'free', 'synergy', 'calibration', 'profile']),
  // UPS (Unified Performance Score) metrics
  upsScore: z.number().min(0).max(100).optional(),
  upsAccuracy: z.number().min(0).max(100).optional(),
  upsConfidence: z.number().min(0).max(100).nullable().optional(),
  // Confidence metrics (optional, for Dual Place / Dual Memo / Dual Pick modes)
  flowConfidenceScore: z.number().optional(),
  flowDirectnessRatio: z.number().optional(),
  flowWrongSlotDwellMs: z.number().optional(),
  recallConfidenceScore: z.number().optional(),
  recallFluencyScore: z.number().optional(),
  recallCorrectionsCount: z.number().optional(),
  // Dual Label specific metrics
  labelConfidenceScore: z.number().optional(),
  labelDirectnessRatio: z.number().optional(),
  labelWrongSlotDwellMs: z.number().optional(),
  labelAvgPlacementTimeMs: z.number().optional(),
  // Timing metrics (for export/stats without events)
  avgResponseTimeMs: z.number().optional(),
  medianResponseTimeMs: z.number().optional(),
  responseTimeStdDev: z.number().optional(),
  avgPressDurationMs: z.number().optional(),
  pressDurationStdDev: z.number().optional(),
  responsesDuringStimulus: z.number().int().nonnegative().optional(),
  responsesAfterStimulus: z.number().int().nonnegative().optional(),
  // Focus metrics (tab/window visibility loss)
  focusLostCount: z.number().int().nonnegative().optional(),
  focusLostTotalMs: z.number().int().nonnegative().optional(),
});

/** Format d'export/import JSON - VALIDATE THIS AT IMPORT */
export const SessionHistoryExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  sessions: z.array(SessionHistoryItemJSONSchema),
});

export type ValidatedSessionHistoryExport = z.infer<typeof SessionHistoryExportSchema>;

// =============================================================================
// Cloud Settings
// =============================================================================

/** Saved journey (cloud sync) */
export const SavedJourneySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    startLevel: z.number(),
    targetLevel: z.number(),
    isDefault: z.boolean(),
    createdAt: z.number(),
  })
  .passthrough(); // preserve extra fields (nameKey, gameMode, reliability, currentStage)

/** Settings data from cloud - flexible structure */
export const SettingsDataSchema = z.object({
  currentMode: z.string(),
  freeTraining: z
    .object({
      selectedModeId: z.string(),
    })
    .optional(),
  journeyUi: z
    .object({
      selectedJourneyId: z.string(),
    })
    .optional(),
  savedJourneys: z.array(SavedJourneySchema).default([]),
  modes: z.record(z.string(), z.record(z.string(), z.unknown())),
  ui: z.record(z.string(), z.unknown()),
});

export type ValidatedSettingsData = z.infer<typeof SettingsDataSchema>;

// =============================================================================
// Subscription Row (Supabase)
// =============================================================================

export const PlanTypeSchema = z.enum(['free', 'premium']);
export const SubscriptionStatusSchema = z.enum(['trial', 'active', 'expired', 'cancelled']);
export const PaymentProviderSchema = z.enum(['stripe', 'apple', 'google', 'lemon_squeezy']);

export const SubscriptionRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_type: PlanTypeSchema,
  status: SubscriptionStatusSchema,
  started_at: z.string(),
  expires_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  payment_provider: PaymentProviderSchema.nullable(),
});

export type ValidatedSubscriptionRow = z.infer<typeof SubscriptionRowSchema>;

// =============================================================================
// User Row (Supabase)
// =============================================================================

export const UserRowSchema = z.object({
  id: z.string().uuid(),
  auth_user_id: z.string().uuid(),
  username: z.string(),
  avatar_id: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ValidatedUserRow = z.infer<typeof UserRowSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Safe parse with detailed error logging.
 * Use at boundaries to validate external data.
 */
export function safeParseWithLog<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] Validation failed at ${context}:`, {
      errors: result.error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        received: e.code === 'invalid_type' ? (e as { received?: string }).received : undefined,
      })),
    });
  }
  return result;
}

/**
 * Parse or throw with context.
 * Use when invalid data should crash (fail-fast).
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = safeParseWithLog(schema, data, context);
  if (!result.success) {
    throw new Error(`[Zod] Invalid data at ${context}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Parse or return default.
 * Use when invalid data should fallback gracefully.
 */
export function parseOrDefault<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  defaultValue: T,
  context: string,
): T {
  const result = safeParseWithLog(schema, data, context);
  return result.success ? result.data : defaultValue;
}

// =============================================================================
// Player Profile (Cloud Sync / Import)
// =============================================================================

/** Profil de performance par modalité */
export const ModalityProfileSchema = z.object({
  totalTargets: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  falseAlarms: z.number().int().nonnegative(),
  correctRejections: z.number().int().nonnegative(),
  avgReactionTime: z.number().positive().nullable(),
  dPrime: z.number().min(-4).max(6), // d' théorique entre -4 et 6
  lureVulnerability: z.number().min(0).max(1),
});

/** Point de progression (graphique) */
export const ProgressionPointSchema = z.object({
  date: z.string(),
  nLevel: z.number().int().min(1).max(20),
  avgDPrime: z.number(),
  sessionsAtLevel: z.number().int().nonnegative(),
});

/**
 * PlayerProfile complet.
 * Note: Les Maps sont sérialisées en Record<string, T> en JSON.
 */
export const PlayerProfileSchema = z.object({
  odalisqueId: z.string().min(1),
  version: z.number().int().nonnegative(),
  computedAt: z.number().int().positive(),

  // Niveau
  currentNLevel: z.number().int().min(1).max(20),
  highestNLevel: z.number().int().min(1).max(20),

  // Stats globales
  totalSessions: z.number().int().nonnegative(),
  totalTrials: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  avgDPrime: z.number(),
  bestDPrime: z.number(),

  // Stats par modalité (Map → Record en JSON)
  modalities: z.record(z.string(), ModalityProfileSchema),

  // Forces / Faiblesses
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),

  // Timing adaptatif
  preferredISI: z.number().int().min(1000).max(5000),
  avgReactionTime: z.number().positive().nullable(),

  // Attention
  avgFocusLostPerSession: z.number().nonnegative(),
  totalFocusLostMs: z.number().int().nonnegative(),

  // Streaks
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastSessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),

  // Progression par modalité (Map → Record en JSON)
  maxNByModality: z.record(z.string(), z.number().int().min(1).max(20)),
  masteryCountByModality: z.record(z.string(), z.number().int().nonnegative()),

  // Historique condensé
  progression: z.array(ProgressionPointSchema),

  // Pour recalcul incrémental
  lastEventId: z.string().uuid().nullable(),
  lastEventTimestamp: z.number().int().positive().nullable(),
});

// =============================================================================
// User Progression (XP, Badges)
// =============================================================================

/** Badge débloqué */
export const UnlockedBadgeSchema = z.object({
  badgeId: z.string().min(1),
  unlockedAt: z.string().datetime({ offset: true }).or(z.number().int().positive()),
  sessionId: z.string().uuid().optional(),
});

/** Record de progression persisté */
export const ProgressionRecordSchema = z.object({
  totalXP: z.number().int().nonnegative(),
  completedSessions: z.number().int().nonnegative(),
  abandonedSessions: z.number().int().nonnegative(),
  totalTrials: z.number().int().nonnegative(),
  firstSessionAt: z.string().datetime({ offset: true }).nullable(),
  earlyMorningSessions: z.number().int().nonnegative(),
  lateNightSessions: z.number().int().nonnegative(),
  comebackCount: z.number().int().nonnegative(),
  persistentDays: z.number().int().nonnegative(),
  plateausBroken: z.number().int().nonnegative(),
});

// =============================================================================
// Algorithm State (Meta-Learning Persistence)
// =============================================================================

/** Algorithm state persisted in DB */
export const AlgorithmStateSchema = z.object({
  algorithmType: z.string(),
  version: z.number().int().nonnegative(),
  data: z.unknown(),
});

export type ValidatedAlgorithmState = z.infer<typeof AlgorithmStateSchema>;

// =============================================================================
// Journey State (Training Path)
// =============================================================================

/** Stage progress for journey */
export const JourneyStageProgressSchema = z.object({
  stageId: z.number().int().min(1).max(20),
  attemptsCount: z.number().int().nonnegative(),
  validatingSessions: z.number().int().nonnegative(),
  bestScore: z.number().min(0).max(100),
  completedAt: z.number().int().positive().nullable(),
});

/** Journey state persisted locally */
export const JourneyStateSchema = z.object({
  isActive: z.boolean(),
  currentStageId: z.number().int().min(1).max(20),
  stages: z.record(z.string(), JourneyStageProgressSchema),
  totalStagesCompleted: z.number().int().nonnegative(),
  lastAttemptAt: z.number().int().positive().nullable(),
});

export type ValidatedJourneyState = z.infer<typeof JourneyStateSchema>;

// =============================================================================
// Lemon Squeezy Webhook Schemas
// =============================================================================

/** Lemon Squeezy license key status */
export const LemonSqueezyLicenseStatusSchema = z.enum([
  'active',
  'inactive',
  'expired',
  'disabled',
]);

/** Lemon Squeezy subscription status */
export const LemonSqueezySubscriptionStatusSchema = z.enum([
  'on_trial',
  'active',
  'paused',
  'past_due',
  'unpaid',
  'cancelled',
  'expired',
]);

/** Lemon Squeezy webhook event names */
export const LemonSqueezyWebhookEventSchema = z.enum([
  'order_created',
  'order_refunded',
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_success',
  'subscription_payment_failed',
  'subscription_payment_recovered',
  'license_key_created',
  'license_key_updated',
]);

export type LemonSqueezyWebhookEvent = z.infer<typeof LemonSqueezyWebhookEventSchema>;

/** Custom data attached to orders (we pass user_id here) */
export const LemonSqueezyCustomDataSchema = z
  .object({
    user_id: z.string().uuid().optional(),
  })
  .passthrough();

/** License key attributes from webhook */
export const LemonSqueezyLicenseKeyAttributesSchema = z.object({
  store_id: z.number().int(),
  customer_id: z.number().int(),
  order_id: z.number().int(),
  order_item_id: z.number().int(),
  product_id: z.number().int(),
  user_name: z.string(),
  user_email: z.string().email(),
  key: z.string(),
  key_short: z.string(),
  activation_limit: z.number().int(),
  instances_count: z.number().int(),
  disabled: z.boolean(),
  status: LemonSqueezyLicenseStatusSchema,
  status_formatted: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Subscription attributes from webhook */
export const LemonSqueezySubscriptionAttributesSchema = z.object({
  store_id: z.number().int(),
  customer_id: z.number().int(),
  order_id: z.number().int(),
  order_item_id: z.number().int(),
  product_id: z.number().int(),
  variant_id: z.number().int(),
  product_name: z.string(),
  variant_name: z.string(),
  user_name: z.string(),
  user_email: z.string().email(),
  status: LemonSqueezySubscriptionStatusSchema,
  status_formatted: z.string(),
  card_brand: z.string().nullable(),
  card_last_four: z.string().nullable(),
  pause: z.unknown().nullable(),
  cancelled: z.boolean(),
  trial_ends_at: z.string().nullable(),
  billing_anchor: z.number().int(),
  first_subscription_item: z.unknown().nullable(),
  urls: z.object({
    update_payment_method: z.string().url(),
    customer_portal: z.string().url(),
  }),
  renews_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  test_mode: z.boolean(),
});

/** Order attributes from webhook */
export const LemonSqueezyOrderAttributesSchema = z.object({
  store_id: z.number().int(),
  customer_id: z.number().int(),
  identifier: z.string(),
  order_number: z.number().int(),
  user_name: z.string(),
  user_email: z.string().email(),
  currency: z.string(),
  currency_rate: z.string(),
  subtotal: z.number().int(),
  discount_total: z.number().int(),
  tax: z.number().int(),
  total: z.number().int(),
  subtotal_usd: z.number().int(),
  discount_total_usd: z.number().int(),
  tax_usd: z.number().int(),
  total_usd: z.number().int(),
  tax_name: z.string().nullable(),
  tax_rate: z.string(),
  status: z.string(),
  status_formatted: z.string(),
  refunded: z.boolean(),
  refunded_at: z.string().nullable(),
  subtotal_formatted: z.string(),
  discount_total_formatted: z.string(),
  tax_formatted: z.string(),
  total_formatted: z.string(),
  first_order_item: z.unknown().nullable(),
  urls: z.object({
    receipt: z.string().url(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  test_mode: z.boolean(),
});

/** Generic webhook payload structure */
export const LemonSqueezyWebhookPayloadSchema = z.object({
  meta: z.object({
    event_name: LemonSqueezyWebhookEventSchema,
    custom_data: LemonSqueezyCustomDataSchema.nullable(),
    test_mode: z.boolean().optional(),
  }),
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.unknown(),
    relationships: z.unknown().optional(),
    links: z.unknown().optional(),
  }),
});

export type ValidatedLemonSqueezyWebhookPayload = z.infer<typeof LemonSqueezyWebhookPayloadSchema>;

/** License key validation response from Lemon Squeezy API */
export const LemonSqueezyLicenseValidationSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  license_key: z
    .object({
      id: z.number().int(),
      status: LemonSqueezyLicenseStatusSchema,
      key: z.string(),
      activation_limit: z.number().int(),
      activation_usage: z.number().int(),
      created_at: z.string(),
      expires_at: z.string().nullable(),
    })
    .optional(),
  instance: z
    .object({
      id: z.string(),
      name: z.string(),
      created_at: z.string(),
    })
    .optional(),
  meta: z
    .object({
      store_id: z.number().int(),
      order_id: z.number().int(),
      order_item_id: z.number().int(),
      product_id: z.number().int(),
      product_name: z.string(),
      variant_id: z.number().int(),
      variant_name: z.string(),
      customer_id: z.number().int(),
      customer_name: z.string(),
      customer_email: z.string().email(),
    })
    .optional(),
});

export type ValidatedLemonSqueezyLicenseValidation = z.infer<
  typeof LemonSqueezyLicenseValidationSchema
>;
