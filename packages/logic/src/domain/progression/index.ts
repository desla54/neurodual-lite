/**
 * Progression System
 *
 * Badges, XP, et progression du joueur.
 */

// Badges
export type { BadgeCategory, BadgeContext, BadgeDefinition, UnlockedBadge } from './badges';
export { BADGES, checkNewBadges, getBadgeById, getBadgesByCategory } from './badges';

// XP & Levels (Unified XP Engine)
export type {
  AnySessionSummary,
  PremiumReward,
  PremiumRewardType,
  UnifiedXPContext,
  XPBreakdown,
} from './xp';
export {
  // Unified XP calculator (Single Source of Truth)
  calculateSessionXP,
  // Constants
  DAILY_SESSION_CAP,
  FLOW_BONUS_XP,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  MIN_XP_FLOOR,
  PREMIUM_REWARDS,
  // Level utilities
  getLevel,
  getLevelProgress,
  getNextReward,
  getUnlockedRewards,
  getXPForNextLevel,
  getXPInCurrentLevel,
} from './xp';

// UserProgression Value Object
export type { ProgressionRecord } from './user-progression';
export { UserProgression } from './user-progression';

// Brain Workshop strikes helper (extracted from dead OOP code)
export {
  calculateBrainWorkshopStrikes,
  type BrainWorkshopSessionData,
} from './bw-strikes';

// =============================================================================
// Declarative Progression Engine (rules as data)
// =============================================================================

export {
  evaluateProgression,
  checkThreshold,
  type MetricKind,
  type EvaluationMode,
  type ThresholdCondition,
  type StrikeConfig,
  type ProgressionRuleset,
  type ModalityMetrics,
  type SessionMetricsInput,
  type EngineProgressionState,
  type ProgressionZone,
  type ModalityResult,
  type StrikeResult,
  type ProgressionEngineResult,
} from './progression-engine';

export { JAEGGI_RULESET, BW_RULESET, ACCURACY_RULESET, TRACE_ACCURACY_RULESET } from './rulesets';
