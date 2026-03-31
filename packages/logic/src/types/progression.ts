/**
 * Progression Types - Dual N-Back
 *
 * Types purs pour le système de progression (XP, badges, unlockables).
 * RÈGLE: Aucun import de domain/, engine/, session/, coach/.
 */

import type { GameEvent, SessionSummary } from '../engine/events';

// Re-export XPBreakdown from xp.ts (extracted to break circular dependency)
export type { XPBreakdown } from './xp';

// =============================================================================
// Badge Types
// =============================================================================

export type BadgeCategory =
  | 'consistency'
  | 'performance'
  | 'resilience'
  | 'exploration'
  | 'milestone'
  | 'cognitive';

/**
 * Badge débloqué par l'utilisateur.
 */
export interface UnlockedBadge {
  readonly badgeId: string;
  readonly unlockedAt: Date;
  readonly sessionId?: string;
}

/**
 * Contexte fourni aux fonctions de vérification de badges.
 * Note: Utilise des interfaces au lieu de classes pour éviter les cycles.
 */
export interface BadgeContext {
  /** Session actuelle (données riches avec outcomes individuels) */
  readonly session: SessionSummary;
  /** Events bruts de la session (si disponibles) */
  readonly events?: readonly GameEvent[];
  /** Historique utilisateur (interface de calcul) */
  readonly history: UserHistoryView;
  /** Stats de progression globales */
  readonly progression: ProgressionView;
}

/**
 * Vue en lecture seule de l'historique utilisateur pour les badges.
 */
export interface UserHistoryView {
  readonly maxNLevel: number;
  getStreak(): { current: number; best: number };
  /** Nombre de jours depuis la dernière session */
  readonly daysSinceLastSession: number | null;
  /** Meilleur d-prime historique */
  readonly bestDPrime: number;
  /** Nombre de sessions consécutives sans perte de focus */
  readonly sessionsWithoutFocusLoss: number;
  /** Count unique days with early morning sessions (before 8h) */
  getEarlyMorningDaysCount(): number;
  /** Count unique days with late night sessions (after 22h) */
  getLateNightDaysCount(): number;
}

/**
 * Vue en lecture seule de la progression pour les badges.
 */
export interface ProgressionView {
  readonly completedSessions: number;
  readonly abandonedSessions: number;
  readonly totalTrials: number;
  readonly daysSinceFirstSession: number;
  readonly earlyMorningSessions: number;
  readonly lateNightSessions: number;
  readonly comebackCount: number;
  readonly persistentDays: number;
  readonly plateausBroken: number;
  /** Current streak of consecutive sessions without pause */
  readonly uninterruptedSessionsStreak: number;
  // ========== VOLUME METRICS ==========
  /** Sessions avec 90%+ de précision */
  readonly sessionsWithHighAccuracy: number;
  /** Sessions avec 95%+ de précision */
  readonly sessionsWithVeryHighAccuracy: number;
  /** Sessions parfaites (100%) */
  readonly perfectSessions: number;
  /** Sessions avec RT moyen < 500ms */
  readonly fastReactionSessions: number;
  /** Sessions avec RT moyen < 400ms */
  readonly veryFastReactionSessions: number;
  /** Sessions avec RT moyen < 300ms */
  readonly ultraFastReactionSessions: number;
  // ========== COGNITIVE METRICS ==========
  /** Sessions avec variance RT < 50ms (métronome) */
  readonly metronomeSessionCount: number;
  /** Sessions en flow (isInFlow > 80% du temps) */
  readonly placeSessionCount: number;
  /** Sessions sans error cascade */
  readonly resilientSessionCount: number;
  /** Retours après absence (d-prime battu après 3+ jours) */
  readonly strongComebackCount: number;
}

// XP Types are in xp.ts (re-exported above)

// =============================================================================
// Premium Reward Types (Train-to-Own System)
// =============================================================================

/**
 * Premium reward types earned through XP progression.
 * Users "train to own" their Premium access.
 */
export type PremiumRewardType =
  | 'REWARD_7_DAYS_PREMIUM' // Level 5 - Pass Découverte
  | 'REWARD_1_MONTH_PREMIUM' // Level 10 - Pass Engagement
  | 'REWARD_3_MONTHS_PREMIUM' // Level 20 - Pass Expert
  | 'REWARD_LIFETIME_ACCESS'; // Level 30 - Accès Permanent

/**
 * Premium reward earned by reaching a level threshold.
 */
export interface PremiumReward {
  readonly id: PremiumRewardType;
  /** i18n key for reward name */
  readonly nameKey: string;
  /** i18n key for reward description */
  readonly descriptionKey: string;
  /** Duration in days (null for lifetime) */
  readonly durationDays: number | null;
  /** Level required to unlock */
  readonly requiredLevel: number;
}

// =============================================================================
// Progression Record (Persistence)
// =============================================================================

/**
 * Record de persistance pour la progression.
 * Utilisé pour sérialiser/désérialiser depuis la DB.
 */
export interface ProgressionRecord {
  readonly totalXP: number;
  readonly completedSessions: number;
  readonly abandonedSessions: number;
  readonly totalTrials: number;
  readonly firstSessionAt: Date | null;
  readonly earlyMorningSessions: number;
  readonly lateNightSessions: number;
  readonly comebackCount: number;
  readonly persistentDays: number;
  readonly plateausBroken: number;
  /** Current streak of consecutive sessions without pause */
  readonly uninterruptedSessionsStreak: number;
}

// =============================================================================
// Profile Types (Projection)
// =============================================================================

/**
 * Profil de performance par modalité.
 */
export interface ModalityProfile {
  readonly totalTargets: number;
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly avgReactionTime: number | null;
  readonly dPrime: number;
  /** Vulnérabilité aux lures (0-1, 1 = très vulnérable) */
  readonly lureVulnerability: number;
}

/**
 * Point de progression (pour graphique).
 */
export interface ProgressionPoint {
  readonly date: string;
  readonly nLevel: number;
  readonly avgDPrime: number;
  readonly sessionsAtLevel: number;
}

/**
 * Profil de performance du joueur.
 * Projeté depuis les events de jeu.
 */
export interface PlayerProfile {
  readonly odalisqueId: string;
  readonly version: number;
  readonly computedAt: number;

  // Niveau actuel
  readonly currentNLevel: number;
  readonly highestNLevel: number;

  // Stats globales
  readonly totalSessions: number;
  readonly totalTrials: number;
  readonly totalDurationMs: number;
  readonly avgDPrime: number;
  readonly bestDPrime: number;

  // Stats par modalité (extensible pour N modalités)
  readonly modalities: ReadonlyMap<string, ModalityProfile>;

  // Forces et faiblesses détectées
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];

  // Timing préféré (adaptatif)
  readonly preferredISI: number;
  readonly avgReactionTime: number | null;

  // Attention
  readonly avgFocusLostPerSession: number;
  readonly totalFocusLostMs: number;

  // Streaks
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly lastSessionDate: string | null;

  // Progression par modalité (pour Planner)
  readonly maxNByModality: ReadonlyMap<string, number>;
  readonly masteryCountByModality: ReadonlyMap<string, number>;

  // Historique condensé
  readonly progression: readonly ProgressionPoint[];

  // Pour recalcul
  readonly lastEventId: string | null;
  readonly lastEventTimestamp: number | null;
}
