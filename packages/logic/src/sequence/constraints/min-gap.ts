/**
 * MinGap - Impose un espacement minimum entre intentions
 *
 * Contrainte hard : impose au moins N trials entre deux occurrences
 * d'une même intention pour une modalité.
 *
 * Exemple : au moins 2 trials entre deux targets de position.
 */

import type {
  Constraint,
  MinGapParams,
  GeneratedTrial,
  ModalityId,
  TrialIntention,
} from '../types';

/**
 * Trouve l'index de la dernière occurrence d'une intention.
 */
function findLastIntentionIndex(
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
  intention: TrialIntention,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const trial = history[i];
    if (trial?.values[modalityId]?.intention === intention) {
      return i;
    }
  }
  return -1;
}

/**
 * Crée une contrainte qui impose un espacement minimum.
 */
export function createMinGapConstraint(params: MinGapParams): Constraint {
  const { modalityId, intention, minTrials } = params;

  return {
    id: `min-gap:${modalityId}:${intention}:${minTrials}`,
    type: 'hard',

    isSatisfied(history: readonly GeneratedTrial[], candidate: GeneratedTrial): boolean {
      const candidateIntention = candidate.values[modalityId]?.intention;

      // Si le candidat n'a pas l'intention concernée, c'est OK
      if (candidateIntention !== intention) {
        return true;
      }

      // Trouver la dernière occurrence
      const lastIndex = findLastIntentionIndex(history, modalityId, intention);

      // Si jamais trouvé, c'est OK
      if (lastIndex === -1) {
        return true;
      }

      // Calculer l'écart
      const gap = history.length - lastIndex;

      return gap > minTrials;
    },

    getForbiddenIntentions(
      history: readonly GeneratedTrial[],
      mid: ModalityId,
    ): Set<TrialIntention> {
      const forbidden = new Set<TrialIntention>();

      if (mid !== modalityId) {
        return forbidden;
      }

      const lastIndex = findLastIntentionIndex(history, modalityId, intention);

      if (lastIndex === -1) {
        return forbidden;
      }

      const gap = history.length - lastIndex;

      if (gap <= minTrials) {
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
