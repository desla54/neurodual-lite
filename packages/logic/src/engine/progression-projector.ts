/**
 * Progression Projector
 *
 * Calcule la progression utilisateur depuis les sessions.
 * La progression est une PROJECTION - toujours recalculable depuis l'historique.
 *
 * Principe:
 * - Sessions = source de vérité
 * - ProgressionRecord = vue calculée (rebuildable)
 */

import type { SessionHistoryItem } from '../ports/history-port';
import type { ProgressionRecord } from '../types/progression';

// =============================================================================
// Empty State
// =============================================================================

/**
 * Crée un état vide de progression.
 */
export function createEmptyProgression(): ProgressionRecord {
  return {
    totalXP: 0,
    completedSessions: 0,
    abandonedSessions: 0,
    totalTrials: 0,
    firstSessionAt: null,
    earlyMorningSessions: 0,
    lateNightSessions: 0,
    comebackCount: 0,
    persistentDays: 0,
    plateausBroken: 0,
    uninterruptedSessionsStreak: 0,
  };
}

// =============================================================================
// Projection
// =============================================================================

/**
 * Projette la progression depuis l'historique des sessions.
 *
 * Cette fonction est PURE (déterministe, sans effets de bord).
 * Utilisée par useProgressionQuery() pour calculer réactivement
 * la progression depuis useSessionsQuery().
 */
export function projectProgressionFromSessions(
  sessions: readonly SessionHistoryItem[],
): ProgressionRecord {
  if (sessions.length === 0) {
    return createEmptyProgression();
  }

  let totalXP = 0;
  let completedSessions = 0;
  let abandonedSessions = 0;
  let totalTrials = 0;
  let firstSessionAt: Date | null = null;
  let earlyMorningSessions = 0;
  let lateNightSessions = 0;

  for (const session of sessions) {
    // XP only from sessions with xp_breakdown (real played sessions that went through pipeline).
    // Imported sessions don't have xp_breakdown and should not give XP.
    if (session.xpBreakdown?.total) {
      totalXP += session.xpBreakdown.total;
    }

    // Count sessions by reason
    if (session.reason === 'completed') {
      completedSessions++;
    } else if (session.reason === 'abandoned') {
      abandonedSessions++;
    }

    // Accumulate trials
    totalTrials += session.trialsCount;

    // Track first session
    if (!firstSessionAt || session.createdAt < firstSessionAt) {
      firstSessionAt = session.createdAt;
    }

    // Time-based metrics
    const hour = session.createdAt.getHours();
    if (hour < 8) {
      earlyMorningSessions++;
    }
    if (hour >= 22) {
      lateNightSessions++;
    }
  }

  return {
    totalXP,
    completedSessions,
    abandonedSessions,
    totalTrials,
    firstSessionAt,
    earlyMorningSessions,
    lateNightSessions,
    comebackCount: 0, // Would need more complex analysis
    persistentDays: completedSessions > 0 ? 1 : 0, // Simplified
    plateausBroken: 0, // Would need level progression analysis
    uninterruptedSessionsStreak: 0, // Would need sequence analysis
  };
}
