/**
 * NoImmediateRepeat - Interdit de répéter la même valeur deux fois de suite
 *
 * Contrainte hard : empêche qu'une modalité ait la même valeur
 * sur deux trials consécutifs.
 */

import type {
  Constraint,
  NoImmediateRepeatParams,
  GeneratedTrial,
  ModalityId,
  TrialIntention,
} from '../types';

/**
 * Crée une contrainte qui interdit les répétitions immédiates.
 */
export function createNoImmediateRepeatConstraint(params: NoImmediateRepeatParams): Constraint {
  const { modalityId } = params;

  return {
    id: `no-immediate-repeat:${modalityId}`,
    type: 'hard',

    isSatisfied(history: readonly GeneratedTrial[], candidate: GeneratedTrial): boolean {
      if (history.length === 0) return true;

      const lastTrial = history[history.length - 1];
      if (!lastTrial) return true;

      const lastValue = lastTrial.values[modalityId]?.value;
      const candidateValue = candidate.values[modalityId]?.value;

      // Si une des valeurs est undefined, on considère comme satisfait
      if (lastValue === undefined || candidateValue === undefined) {
        return true;
      }

      return lastValue !== candidateValue;
    },

    getForbiddenIntentions(
      _history: readonly GeneratedTrial[],
      _mid: ModalityId,
    ): Set<TrialIntention> {
      // Cette contrainte ne bloque pas d'intentions, seulement des valeurs
      return new Set();
    },

    getForbiddenValues(
      history: readonly GeneratedTrial[],
      mid: ModalityId,
      _intention: TrialIntention,
    ): Set<number | string> {
      const forbidden = new Set<number | string>();

      // Seulement pour la modalité concernée
      if (mid !== modalityId) {
        return forbidden;
      }

      if (history.length === 0) {
        return forbidden;
      }

      const lastTrial = history[history.length - 1];
      if (!lastTrial) return forbidden;

      const lastValue = lastTrial.values[modalityId]?.value;
      if (lastValue !== undefined) {
        forbidden.add(lastValue);
      }

      return forbidden;
    },
  };
}
