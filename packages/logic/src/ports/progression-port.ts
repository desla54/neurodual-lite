/**
 * ProgressionPort
 *
 * Interface for user progression persistence.
 * Implemented by infra, consumed by ui via Context.
 *
 * NOTE: UI reads progression via PowerSync watched queries (useProgressionQuery).
 * This port is used for imperative access (pipeline, import, tests).
 */

import type { ProgressionRecord, UnlockedBadge } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * @deprecated Utiliser ProgressionRecord depuis types/ à la place.
 */
export type ProgressionData = ProgressionRecord;

// =============================================================================
// Port
// =============================================================================

export interface ProgressionPort {
  /** Récupère la progression actuelle (ou null si aucune) */
  getProgression(): Promise<ProgressionData | null>;

  /** Récupère tous les badges débloqués */
  getBadges(): Promise<UnlockedBadge[]>;

  /** Vérifie si un badge est débloqué */
  hasBadge(badgeId: string): Promise<boolean>;
}
