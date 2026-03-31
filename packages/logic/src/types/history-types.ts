/**
 * History Types - Types partagés pour éviter les dépendances circulaires
 *
 * Ces types sont utilisés par plusieurs modules (persistence-port, user-history,
 * statistics-port) et doivent être dans un fichier sans dépendances vers ces modules.
 */

// =============================================================================
// Streak Info
// =============================================================================

/**
 * Informations sur les streaks (jours consécutifs de jeu).
 * Utilisé par PersistencePort et UserHistory.
 */
export interface StreakInfo {
  readonly current: number;
  readonly best: number;
  readonly lastActiveDate: string | null;
}

// =============================================================================
// Daily Activity
// =============================================================================

/**
 * Statistiques d'activité quotidienne.
 * Utilisé par PersistencePort et StatisticsPort.
 */
export interface DailyActivity {
  date: string; // YYYY-MM-DD
  count: number;
}
