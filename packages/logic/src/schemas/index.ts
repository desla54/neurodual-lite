/**
 * Schemas Module
 *
 * Zod validation schemas for system boundaries.
 */

export {
  // Session History
  HistoryModalityStatsSchema,
  SessionEndReasonSchema,
  SessionHistoryItemJSONSchema,
  SessionHistoryExportSchema,
  type ValidatedSessionHistoryExport,
  // Settings
  SettingsDataSchema,
  type ValidatedSettingsData,
  // Subscription
  PlanTypeSchema,
  SubscriptionStatusSchema,
  PaymentProviderSchema,
  SubscriptionRowSchema,
  type ValidatedSubscriptionRow,
  // User
  UserRowSchema,
  type ValidatedUserRow,
  // Player Profile
  ModalityProfileSchema,
  ProgressionPointSchema,
  PlayerProfileSchema,
  // User Progression (XP, Badges)
  UnlockedBadgeSchema,
  ProgressionRecordSchema,
  // Algorithm State
  AlgorithmStateSchema,
  type ValidatedAlgorithmState,
  // Journey State
  JourneyStageProgressSchema,
  JourneyStateSchema,
  type ValidatedJourneyState,
  // Lemon Squeezy
  LemonSqueezyLicenseStatusSchema,
  LemonSqueezySubscriptionStatusSchema,
  LemonSqueezyWebhookEventSchema,
  type LemonSqueezyWebhookEvent,
  LemonSqueezyCustomDataSchema,
  LemonSqueezyLicenseKeyAttributesSchema,
  LemonSqueezySubscriptionAttributesSchema,
  LemonSqueezyOrderAttributesSchema,
  LemonSqueezyWebhookPayloadSchema,
  type ValidatedLemonSqueezyWebhookPayload,
  LemonSqueezyLicenseValidationSchema,
  type ValidatedLemonSqueezyLicenseValidation,
  // Helpers
  safeParseWithLog,
  parseOrThrow,
  parseOrDefault,
} from './boundary-schemas';
