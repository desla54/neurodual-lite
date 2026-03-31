/**
 * PreferVariety - Préfère la diversité des valeurs
 *
 * Contrainte soft : pénalise les valeurs récemment utilisées.
 * Plus une valeur est proche dans l'historique, plus le score est bas.
 */

import type { WeightedConstraint, GeneratedTrial, ModalityId, TrialIntention } from '../types';
import {
  CONSTRAINT_PREFER_VARIETY_WEIGHT,
  CONSTRAINT_PREFER_VARIETY_LOOKBACK,
} from '../../specs/thresholds';

export interface PreferVarietyParams {
  /** Modalité concernée */
  readonly modalityId: ModalityId;
  /** Poids de la contrainte (0-1) */
  readonly weight?: number;
  /** Fenêtre de lookback (nombre de trials à considérer) */
  readonly lookbackWindow?: number;
}

/**
 * Crée une contrainte soft qui préfère la variété.
 */
export function createPreferVarietyConstraint(params: PreferVarietyParams): WeightedConstraint {
  const {
    modalityId,
    weight = CONSTRAINT_PREFER_VARIETY_WEIGHT,
    lookbackWindow = CONSTRAINT_PREFER_VARIETY_LOOKBACK,
  } = params;

  return {
    id: `prefer-variety:${modalityId}`,
    type: 'soft',
    weight,

    isSatisfied(_history: readonly GeneratedTrial[], _candidate: GeneratedTrial): boolean {
      // Les soft constraints sont toujours "satisfaits" au sens binaire
      return true;
    },

    getSatisfactionScore(history: readonly GeneratedTrial[], candidate: GeneratedTrial): number {
      const candidateValue = candidate.values[modalityId]?.value;
      if (candidateValue === undefined) {
        return 1; // Pas de valeur, score parfait
      }

      // Regarder les N derniers trials
      const windowStart = Math.max(0, history.length - lookbackWindow);
      const recentHistory = history.slice(windowStart);

      // Chercher la distance de la dernière occurrence de cette valeur
      let distanceFromLast = recentHistory.length + 1;
      for (let i = recentHistory.length - 1; i >= 0; i--) {
        const trial = recentHistory[i];
        if (trial?.values[modalityId]?.value === candidateValue) {
          distanceFromLast = recentHistory.length - i;
          break;
        }
      }

      // Score basé sur la distance (plus loin = meilleur)
      // distance 1 (répétition immédiate) → score faible
      // distance >= lookbackWindow → score parfait
      return Math.min(1, distanceFromLast / lookbackWindow);
    },

    getForbiddenIntentions(
      _history: readonly GeneratedTrial[],
      _mid: ModalityId,
    ): Set<TrialIntention> {
      // Soft constraint ne bloque pas
      return new Set();
    },

    getForbiddenValues(
      _history: readonly GeneratedTrial[],
      _mid: ModalityId,
      _intention: TrialIntention,
    ): Set<number | string> {
      // Soft constraint ne bloque pas
      return new Set();
    },
  };
}
