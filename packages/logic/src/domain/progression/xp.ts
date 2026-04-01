/**
 * XP & Level System
 *
 * Unified XP Engine - Single Source of Truth for all game modes.
 * Système de points d'expérience qui ne fait que monter.
 * Contrairement au niveau N-Back (qui fluctue), le niveau joueur récompense l'effort.
 *
 * Train-to-Own System:
 * - Level 5 (10k XP) → 7 jours Premium
 * - Level 10 (40k XP) → 1 mois Premium
 * - Level 20 (120k XP) → 3 mois Premium
 * - Level 30 (300k XP) → Accès Permanent (Lifetime)
 */

import { getTotalStats } from '../../engine/events';
import { computeSpecDrivenTempoAccuracy } from '../scoring/tempo-accuracy';
import type {
  DualPickSessionSummary,
  PlaceSessionSummary,
  MemoSessionSummary,
  SessionSummary,
  TraceSessionSummary,
  XPBreakdown,
  PremiumReward,
  PremiumRewardType,
} from '../../types';
import type { BadgeDefinition } from './badges';
import {
  // XP Constants
  XP_DAILY_SESSION_CAP,
  XP_MIN_FLOOR,
  XP_FLOW_BONUS,
  XP_BADGE_BONUS,
  XP_BADGE_BONUS_CUMULATIVE,
  XP_DAILY_FIRST_BONUS,
  XP_STREAK_MULTIPLIER,
  XP_STREAK_MIN_DAYS,
  XP_LEVEL_THRESHOLDS,
  XP_MAX_LEVEL,
  // XP Performance Weights
  XP_N_LEVEL_WEIGHT,
  XP_DPRIME_WEIGHT,
  XP_ACCURACY_WEIGHT,
  // Premium Levels
  PREMIUM_LEVEL_7_DAYS,
  PREMIUM_LEVEL_1_MONTH,
  PREMIUM_LEVEL_3_MONTHS,
  PREMIUM_LEVEL_LIFETIME,
} from '../../specs/thresholds';

// =============================================================================
// Unified Session Summary Type
// =============================================================================

/**
 * Union type accepting all session summaries from any game mode.
 * The XP engine normalizes performance metrics from each mode.
 */
export type AnySessionSummary =
  | SessionSummary // Tempo (Catch, Jaeggi, BW) - uses d-prime
  | MemoSessionSummary // Memo - uses accuracy
  | PlaceSessionSummary // Place - uses accuracy
  | DualPickSessionSummary // Pick - uses accuracy
  | TraceSessionSummary; // Trace - uses accuracy

// =============================================================================
// Re-export types depuis types/ pour rétro-compatibilité
// =============================================================================

export type { XPBreakdown, PremiumReward, PremiumRewardType };

// =============================================================================
// Level Thresholds (from thresholds.ts SSOT)
// =============================================================================

/**
 * XP requise pour chaque niveau (from thresholds.ts SSOT).
 */
export const LEVEL_THRESHOLDS = XP_LEVEL_THRESHOLDS;

export const MAX_LEVEL = XP_MAX_LEVEL;

/** Daily session cap for XP earning */
export const DAILY_SESSION_CAP = XP_DAILY_SESSION_CAP;

/** Minimum XP floor per session (presence reward) */
export const MIN_XP_FLOOR = XP_MIN_FLOOR;

/** Flow state bonus XP */
export const FLOW_BONUS_XP = XP_FLOW_BONUS;

// =============================================================================
// Types
// =============================================================================

/**
 * Unified XP Context - Works with any session type.
 * The engine normalizes performance based on the session type.
 */
export interface UnifiedXPContext {
  /** Session terminée (any game mode) */
  readonly session: AnySessionSummary;
  /** Badges nouvellement débloqués cette session */
  readonly newBadges: readonly BadgeDefinition[];
  /** Streak actuel en jours */
  readonly streakDays: number;
  /** Première session de la journée ? */
  readonly isFirstOfDay: boolean;
  /** Score de confiance (0-100), null si non disponible */
  readonly confidenceScore: number | null;
  /** État de flow (via CognitiveProfiler ou heuristique) */
  readonly isInFlow: boolean;
  /** Nombre de sessions déjà complétées aujourd'hui (avant celle-ci) */
  readonly sessionsToday: number;
}

// =============================================================================
// Session Type Detection
// =============================================================================

/**
 * Type guard: Check if session is a Tempo/GameSession (uses d-prime).
 */
function isTempoSession(session: AnySessionSummary): session is SessionSummary {
  return 'finalStats' in session && 'globalDPrime' in (session.finalStats as object);
}

/**
 * Type guard: Check if session is a MemoSession (uses accuracy via windowResults).
 */
function isMemoSession(session: AnySessionSummary): session is MemoSessionSummary {
  return 'windowResults' in session && 'avgRecallTimeMs' in session;
}

/**
 * Type guard: Check if session is a PlaceSession (uses accuracy, has turnsCompleted).
 */
function isPlaceSession(session: AnySessionSummary): session is PlaceSessionSummary {
  return 'finalStats' in session && 'turnsCompleted' in (session.finalStats as object);
}

/**
 * Type guard: Check if session is a DualPickSession (has score, turnsCompleted).
 */
function isDualPickSession(session: AnySessionSummary): session is DualPickSessionSummary {
  return (
    'score' in session &&
    'finalStats' in session &&
    'turnsCompleted' in (session.finalStats as object)
  );
}

/**
 * Type guard: Check if session is a TraceSession (has rhythmMode, responses).
 */
function isTraceSession(session: AnySessionSummary): session is TraceSessionSummary {
  return 'rhythmMode' in session && 'responses' in session;
}

// =============================================================================
// Performance Normalization
// =============================================================================

/**
 * Normalize performance from any session type to a comparable base XP value.
 *
 * Tempo (mode-native scoring):
 * - Dual Catch (SDT): d-prime based performance
 * - Dual N-Back Classic / BrainWorkshop: native score based on error-rate formulas
 * Accuracy based modes: 80% = 160 XP base
 *
 * This ensures equivalent effort across modes yields equivalent XP.
 */
function normalizePerformance(session: AnySessionSummary): {
  performance: number;
  accuracy: number;
} {
  if (isTempoSession(session)) {
    // Tempo mode:
    // - dualnback-classic/custom (SDT): performance from d-prime
    // - dualnback-classic / sim-brainworkshop: performance from native score (error-rate based)
    const gameMode = session.gameMode ?? 'dualnback-classic';
    const totals = getTotalStats(session.finalStats);
    const nativeAccuracy = computeSpecDrivenTempoAccuracy(
      gameMode,
      totals.totalHits,
      totals.totalMisses,
      totals.totalFalseAlarms,
      totals.totalCorrectRejections,
    );

    const usesNativeTempoScore =
      gameMode === 'dualnback-classic' || gameMode === 'sim-brainworkshop';

    const performance = usesNativeTempoScore
      ? Math.round(nativeAccuracy * XP_ACCURACY_WEIGHT)
      : Math.round(Math.max(0, session.finalStats.globalDPrime) * XP_DPRIME_WEIGHT);

    return { performance, accuracy: Math.round(nativeAccuracy * XP_ACCURACY_WEIGHT) };
  }

  if (isMemoSession(session)) {
    // Memo mode: uses accuracy from finalStats
    const acc = session.finalStats.accuracy;
    return {
      performance: Math.round(acc * XP_ACCURACY_WEIGHT),
      accuracy: Math.round(acc * XP_ACCURACY_WEIGHT),
    };
  }

  if (isPlaceSession(session) || isDualPickSession(session)) {
    // Flow/DualPick: uses accuracy from finalStats
    const acc = session.finalStats.accuracy;
    return {
      performance: Math.round(acc * XP_ACCURACY_WEIGHT),
      accuracy: Math.round(acc * XP_ACCURACY_WEIGHT),
    };
  }

  if (isTraceSession(session)) {
    // Trace mode: uses accuracy from finalStats
    const acc = session.finalStats.accuracy;
    return {
      performance: Math.round(acc * XP_ACCURACY_WEIGHT),
      accuracy: Math.round(acc * XP_ACCURACY_WEIGHT),
    };
  }

  // Fallback (should never happen with proper type guards)
  return { performance: 0, accuracy: 0 };
}

// =============================================================================
// Unified XP Calculation
// =============================================================================

/**
 * Unified XP Calculator - Single Source of Truth.
 *
 * Calculates XP for ANY game mode with consistent rules:
 *
 * Phase 1 - Performance Normalization:
 * - Tempo: mode-native score (SDT d' for dualnback-classic, error-rate/native for Jaeggi/BW)
 * - Recall/Flow/DualPick/Trace: accuracy based (80% = 160 XP)
 *
 * Phase 2 - Multipliers (The Core Rules):
 * 1. Confidence Multiplier: XP × (confidenceScore / 100)
 * 2. Flow Bonus: +100 XP if flow state detected
 * 3. Daily Session Cap: 0 XP for performance after 5 sessions/day
 * 4. Presence Floor: Minimum 50 XP for any completed session
 *
 * Phase 3 - Bonuses:
 * - Badge bonus: +100 XP per performance badge, +25 XP per cumulative badge
 * - Daily bonus: +25 XP for first session of day
 * - Streak bonus: +20% if streak >= 2 days
 */
export function calculateSessionXP(ctx: UnifiedXPContext): XPBreakdown {
  const { session, newBadges, streakDays, isFirstOfDay, confidenceScore, isInFlow, sessionsToday } =
    ctx;

  if ('completed' in session && session.completed === false) {
    return {
      base: 0,
      performance: 0,
      accuracy: 0,
      badgeBonus: 0,
      streakBonus: 0,
      dailyBonus: 0,
      flowBonus: 0,
      confidenceMultiplier: 0,
      subtotalBeforeConfidence: 0,
      total: 0,
      dailyCapReached: false,
    };
  }

  // If the player did not actually play (no answer/input opportunity), award 0 XP.
  // This prevents granting "presence" XP on sessions that effectively never started.
  const played = (() => {
    if (isTempoSession(session)) {
      const totals = getTotalStats(session.finalStats);
      return (
        totals.totalHits +
          totals.totalMisses +
          totals.totalFalseAlarms +
          totals.totalCorrectRejections >
        0
      );
    }

    if (isMemoSession(session)) {
      return session.finalStats.totalPicks > 0 || session.finalStats.windowsCompleted > 0;
    }

    if (isPlaceSession(session) || isDualPickSession(session)) {
      return session.finalStats.totalDrops > 0 || session.finalStats.turnsCompleted > 0;
    }

    if (isTraceSession(session)) {
      return (
        session.finalStats.trialsCompleted > 0 ||
        session.finalStats.correctResponses +
          session.finalStats.incorrectResponses +
          session.finalStats.timeouts >
          0 ||
        session.responses.length > 0
      );
    }

    return false;
  })();

  if (!played) {
    return {
      base: 0,
      performance: 0,
      accuracy: 0,
      badgeBonus: 0,
      streakBonus: 0,
      dailyBonus: 0,
      flowBonus: 0,
      confidenceMultiplier: 0,
      subtotalBeforeConfidence: 0,
      total: 0,
      dailyCapReached: false,
    };
  }

  // Check daily cap (sessions 1-5 earn XP, 6+ don't)
  const dailyCapReached = sessionsToday >= DAILY_SESSION_CAP;

  // If daily cap reached, return zero XP breakdown
  if (dailyCapReached) {
    return {
      base: 0,
      performance: 0,
      accuracy: 0,
      badgeBonus: 0,
      streakBonus: 0,
      dailyBonus: 0,
      flowBonus: 0,
      confidenceMultiplier: 0,
      subtotalBeforeConfidence: 0,
      total: 0,
      dailyCapReached: true,
    };
  }

  // Phase 1: Normalize performance based on session type
  const { performance, accuracy: accuracyXP } = normalizePerformance(session);

  // Base XP from N-level
  const base = session.nLevel * XP_N_LEVEL_WEIGHT;

  // Badge bonus: differentiated by badge type
  // - Performance badges (priority: 1) → XP_BADGE_BONUS (100 XP)
  // - Cumulative badges (priority: 0) → XP_BADGE_BONUS_CUMULATIVE (25 XP)
  const badgeBonus = newBadges.reduce((sum, badge) => {
    const xp = (badge.priority ?? 0) >= 1 ? XP_BADGE_BONUS : XP_BADGE_BONUS_CUMULATIVE;
    return sum + xp;
  }, 0);

  const dailyBonus = isFirstOfDay ? XP_DAILY_FIRST_BONUS : 0;

  // Flow bonus: +100 XP if in flow state
  const flowBonus = isInFlow ? FLOW_BONUS_XP : 0;

  // Subtotal before streak
  const subtotalBeforeStreak =
    base + performance + accuracyXP + badgeBonus + dailyBonus + flowBonus;

  // Streak bonus: +20% if streak >= 2
  const streakMultiplier = streakDays >= XP_STREAK_MIN_DAYS ? XP_STREAK_MULTIPLIER : 0;
  const streakBonus = Math.round(subtotalBeforeStreak * streakMultiplier);

  // Subtotal before confidence
  const subtotalBeforeConfidence = subtotalBeforeStreak + streakBonus;

  // Phase 2: Apply confidence multiplier
  // confidenceScore is 0-100, convert to 0-1
  // If null, use 1.0 (no penalty)
  const confidenceMultiplier =
    confidenceScore !== null ? Math.max(0, Math.min(1, confidenceScore / 100)) : 1.0;

  // Apply multiplier
  let total = Math.round(subtotalBeforeConfidence * confidenceMultiplier);

  // Presence floor: minimum 50 XP for any completed session
  total = Math.max(total, MIN_XP_FLOOR);

  return {
    base,
    performance,
    accuracy: accuracyXP,
    badgeBonus,
    streakBonus,
    dailyBonus,
    flowBonus,
    confidenceMultiplier,
    subtotalBeforeConfidence,
    total,
    dailyCapReached: false,
  };
}

/**
 * Calcule le niveau correspondant à un total d'XP.
 */
export function getLevel(totalXP: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    const threshold = LEVEL_THRESHOLDS[i];
    if (threshold !== undefined && totalXP >= threshold) {
      return i + 1; // Levels are 1-indexed
    }
  }
  return 1;
}

/**
 * Calcule l'XP requise pour atteindre le niveau suivant.
 */
export function getXPForNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return 0;
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel] ?? currentThreshold;
  return nextThreshold - currentThreshold;
}

/**
 * Calcule l'XP accumulée dans le niveau actuel.
 */
export function getXPInCurrentLevel(totalXP: number): number {
  const level = getLevel(totalXP);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  return totalXP - currentThreshold;
}

/**
 * Calcule le pourcentage de progression vers le niveau suivant.
 */
export function getLevelProgress(totalXP: number): number {
  const level = getLevel(totalXP);
  if (level >= MAX_LEVEL) return 100;

  const xpInLevel = getXPInCurrentLevel(totalXP);
  const xpNeeded = getXPForNextLevel(level);

  return xpNeeded > 0 ? Math.round((xpInLevel / xpNeeded) * 100) : 100;
}

// =============================================================================
// Premium Rewards (Train-to-Own)
// =============================================================================

/**
 * Premium rewards unlocked through XP progression (from thresholds.ts SSOT).
 * Users "train to own" their Premium access.
 */
export const PREMIUM_REWARDS: readonly PremiumReward[] = [
  {
    id: 'REWARD_7_DAYS_PREMIUM',
    nameKey: 'rewards.discovery.name',
    descriptionKey: 'rewards.discovery.description',
    durationDays: 7,
    requiredLevel: PREMIUM_LEVEL_7_DAYS,
  },
  {
    id: 'REWARD_1_MONTH_PREMIUM',
    nameKey: 'rewards.engagement.name',
    descriptionKey: 'rewards.engagement.description',
    durationDays: 30,
    requiredLevel: PREMIUM_LEVEL_1_MONTH,
  },
  {
    id: 'REWARD_3_MONTHS_PREMIUM',
    nameKey: 'rewards.expert.name',
    descriptionKey: 'rewards.expert.description',
    durationDays: 90,
    requiredLevel: PREMIUM_LEVEL_3_MONTHS,
  },
  {
    id: 'REWARD_LIFETIME_ACCESS',
    nameKey: 'rewards.lifetime.name',
    descriptionKey: 'rewards.lifetime.description',
    durationDays: null, // Lifetime
    requiredLevel: PREMIUM_LEVEL_LIFETIME,
  },
];

/**
 * Récupère les récompenses Premium débloquées pour un niveau donné.
 */
export function getUnlockedRewards(level: number): PremiumReward[] {
  return PREMIUM_REWARDS.filter((r) => r.requiredLevel <= level);
}

/**
 * Récupère la prochaine récompense Premium à débloquer.
 */
export function getNextReward(level: number): PremiumReward | undefined {
  return PREMIUM_REWARDS.find((r) => r.requiredLevel > level);
}
