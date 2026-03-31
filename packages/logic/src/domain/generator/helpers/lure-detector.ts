/**
 * LureDetector - Détection des leurres dans les séquences N-Back
 *
 * Classe utilitaire OOP pour détecter les différents types de leurres:
 * - n-1: Répétition de la valeur précédente (piège de familiarité)
 * - n+1: Répétition de la valeur n+1 positions en arrière
 * - sequence: Répétition dans les 3 derniers essais
 *
 * Utilisée par: BrainWorkshopStrategy, DualnbackClassicStrategy, LibreStrategy
 */

import type { LureType } from '../../types';

/**
 * Détecteur de leurres pour les séquences N-Back.
 * Implémente la logique de détection des différents types de leurres.
 */
export class LureDetector {
  /**
   * Détecte si une valeur constitue un leurre dans la séquence.
   *
   * @param value - La valeur actuelle à analyser
   * @param history - L'historique des valeurs (lecture seule)
   * @param currentIndex - L'index actuel dans la séquence
   * @param nLevel - Le niveau N du jeu (1-back, 2-back, etc.)
   * @param isTarget - Si la valeur est déjà identifiée comme cible
   * @returns Le type de leurre détecté, ou null si pas de leurre
   *
   * @example
   * ```ts
   * const lureType = LureDetector.detect(
   *   currentPosition,
   *   positionHistory,
   *   trialIndex,
   *   nLevel,
   *   isPositionTarget
   * );
   * ```
   */
  static detect<T>(
    value: T,
    history: readonly T[],
    currentIndex: number,
    nLevel: number,
    isTarget: boolean,
  ): LureType | null {
    // Une cible n'est jamais un leurre
    if (isTarget) {
      return null;
    }

    // Pas assez d'historique pour détecter un leurre
    if (currentIndex < 1) {
      return null;
    }

    const nBackIdx = currentIndex - nLevel;

    // Vérifier leurre n-1 (répétition de la valeur précédente)
    const nMinus1Lure = LureDetector.detectNMinus1Lure(value, history, currentIndex, nBackIdx);
    if (nMinus1Lure) {
      return nMinus1Lure;
    }

    // Vérifier leurre n+1 (répétition n+1 positions en arrière)
    const nPlus1Lure = LureDetector.detectNPlus1Lure(
      value,
      history,
      currentIndex,
      nLevel,
      nBackIdx,
    );
    if (nPlus1Lure) {
      return nPlus1Lure;
    }

    // Vérifier leurre de séquence (répétition dans les 3 derniers)
    const sequenceLure = LureDetector.detectSequenceLure(value, history, currentIndex, nBackIdx);
    if (sequenceLure) {
      return sequenceLure;
    }

    return null;
  }

  /**
   * Détecte un leurre n-1 (répétition de la valeur immédiatement précédente)
   */
  private static detectNMinus1Lure<T>(
    value: T,
    history: readonly T[],
    currentIndex: number,
    nBackIdx: number,
  ): LureType | null {
    const nMinus1Idx = currentIndex - 1;

    if (nMinus1Idx >= 0 && history[nMinus1Idx] === value) {
      // C'est un leurre seulement si ce n'est pas aussi une cible n-back
      if (nBackIdx < 0 || history[nBackIdx] !== value) {
        return 'n-1';
      }
    }

    return null;
  }

  /**
   * Détecte un leurre n+1 (répétition de la valeur n+1 positions en arrière)
   */
  private static detectNPlus1Lure<T>(
    value: T,
    history: readonly T[],
    currentIndex: number,
    nLevel: number,
    nBackIdx: number,
  ): LureType | null {
    const nPlus1Idx = currentIndex - nLevel - 1;

    if (nPlus1Idx >= 0 && history[nPlus1Idx] === value) {
      // C'est un leurre seulement si ce n'est pas aussi une cible n-back
      if (nBackIdx < 0 || history[nBackIdx] !== value) {
        return 'n+1';
      }
    }

    return null;
  }

  /**
   * Détecte un leurre de séquence (répétition dans les 3 derniers essais)
   */
  private static detectSequenceLure<T>(
    value: T,
    history: readonly T[],
    currentIndex: number,
    nBackIdx: number,
  ): LureType | null {
    const windowStart = Math.max(0, currentIndex - 3);

    for (let i = windowStart; i < currentIndex; i++) {
      // Ignorer la position n-back (qui serait une cible, pas un leurre)
      if (i !== nBackIdx && history[i] === value) {
        return 'sequence';
      }
    }

    return null;
  }
}
