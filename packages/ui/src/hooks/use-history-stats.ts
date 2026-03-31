/**
 * useHistoryStats
 *
 * Hook pour calculer les statistiques utilisateur depuis l'historique.
 * Thin wrapper autour de UserHistory (logique dans logic).
 */

import { UserHistory, type SessionHistoryItem } from '@neurodual/logic';
import { useMemo } from 'react';

// =============================================================================
// Hook
// =============================================================================

export function useHistoryStats(sessions: SessionHistoryItem[]) {
  // Filtre les sessions complétées uniquement (ignore abandoned/error)
  const history = useMemo(() => {
    const completedSessions = sessions.filter((s) => s.reason === 'completed');
    return UserHistory.fromHistoryItems(completedSessions);
  }, [sessions]);

  return history;
}
