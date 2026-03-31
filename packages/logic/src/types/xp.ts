/**
 * XP Types - Dual N-Back
 *
 * Types pour le système d'XP.
 * Extrait de progression.ts pour éviter la dépendance circulaire avec events.ts.
 */

// =============================================================================
// XP Types
// =============================================================================

export interface XPBreakdown {
  /** XP de base (niveau * XP_N_LEVEL_WEIGHT) */
  readonly base: number;
  /** XP de performance (score natif du mode) */
  readonly performance: number;
  /** XP de précision (accuracy * XP_ACCURACY_WEIGHT) */
  readonly accuracy: number;
  /** XP bonus badges (XP_BADGE_BONUS par badge) */
  readonly badgeBonus: number;
  /** XP bonus streak (XP_STREAK_MULTIPLIER si streak actif) */
  readonly streakBonus: number;
  /** XP bonus première session du jour (XP_DAILY_FIRST_BONUS) */
  readonly dailyBonus: number;
  /** XP bonus état de flow (XP_FLOW_BONUS si isInFlow) */
  readonly flowBonus: number;
  /** Multiplicateur de confiance appliqué (0-1) */
  readonly confidenceMultiplier: number;
  /** Subtotal avant multiplicateur de confiance */
  readonly subtotalBeforeConfidence: number;
  /** Total XP gagnée (après floor de 50 minimum) */
  readonly total: number;
  /** True si le plafond journalier (5 sessions) est atteint */
  readonly dailyCapReached: boolean;
}
