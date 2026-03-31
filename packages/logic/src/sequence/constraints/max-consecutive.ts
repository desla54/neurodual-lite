/**
 * MaxConsecutive - Limite le nombre de fois consécutives d'une intention
 *
 * Contrainte hard : empêche d'avoir plus de N targets/lures/neutrals d'affilée.
 * Exemple : max 3 targets consécutifs pour une modalité.
 */

import type {
  Constraint,
  MaxConsecutiveParams,
  GeneratedTrial,
  ModalityId,
  TrialIntention,
} from '../types';

/**
 * Compte les intentions consécutives à la fin de l'historique.
 */
function countConsecutiveAtEnd(
  history: readonly GeneratedTrial[],
  modalityId: ModalityId | '*',
  intention: TrialIntention,
): number {
  let count = 0;

  // Parcourir l'historique en sens inverse
  for (let i = history.length - 1; i >= 0; i--) {
    const trial = history[i];
    if (!trial) break;

    if (modalityId === '*') {
      // Vérifier toutes les modalités - au moins une doit avoir l'intention
      const hasIntention = Object.values(trial.values).some((v) => v.intention === intention);
      if (hasIntention) {
        count++;
      } else {
        break;
      }
    } else {
      // Vérifier une modalité spécifique
      const value = trial.values[modalityId];
      if (value?.intention === intention) {
        count++;
      } else {
        break;
      }
    }
  }

  return count;
}

/**
 * Crée une contrainte qui limite les intentions consécutives.
 */
export function createMaxConsecutiveConstraint(params: MaxConsecutiveParams): Constraint {
  const { modalityId, intention, max } = params;

  return {
    id: `max-consecutive:${modalityId}:${intention}:${max}`,
    type: 'hard',

    isSatisfied(history: readonly GeneratedTrial[], candidate: GeneratedTrial): boolean {
      // Vérifier si le candidat ajoute une nouvelle occurrence consécutive
      const currentCount = countConsecutiveAtEnd(history, modalityId, intention);

      if (modalityId === '*') {
        // Au moins une modalité du candidat a l'intention
        const candidateHasIntention = Object.values(candidate.values).some(
          (v) => v.intention === intention,
        );

        if (candidateHasIntention) {
          return currentCount + 1 <= max;
        }
      } else {
        const candidateValue = candidate.values[modalityId];
        if (candidateValue?.intention === intention) {
          return currentCount + 1 <= max;
        }
      }

      // Si le candidat n'a pas l'intention, c'est OK
      return true;
    },

    getForbiddenIntentions(
      history: readonly GeneratedTrial[],
      mid: ModalityId,
    ): Set<TrialIntention> {
      const forbidden = new Set<TrialIntention>();

      // Seulement si la modalité correspond ou si wildcard
      if (modalityId !== '*' && modalityId !== mid) {
        return forbidden;
      }

      const currentCount = countConsecutiveAtEnd(history, modalityId, intention);

      if (currentCount >= max) {
        forbidden.add(intention);
      }

      return forbidden;
    },

    getForbiddenValues(
      _history: readonly GeneratedTrial[],
      _mid: ModalityId,
      _intention: TrialIntention,
    ): Set<number | string> {
      // Cette contrainte ne bloque pas de valeurs spécifiques
      return new Set();
    },
  };
}
