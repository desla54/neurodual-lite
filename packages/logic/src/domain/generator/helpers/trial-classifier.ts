/**
 * TrialClassifier - Classification des essais N-Back
 *
 * Classe utilitaire OOP pour déterminer le type d'un essai
 * en fonction de ses caractéristiques (buffer, cibles par modalité).
 *
 * Types possibles:
 * - 'Tampon': Essais de buffer (premiers N essais)
 * - 'Dual': Cible sur 2+ modalités
 * - 'V-Seul': Cible visuelle uniquement (position ou couleur)
 * - 'A-Seul': Cible audio uniquement
 * - 'Non-Cible': Aucune cible
 *
 * Utilisée par: BrainWorkshopStrategy, LibreStrategy
 */

import type { TrialType } from '../../types';

/**
 * Classificateur de type de trial.
 * Détermine le type d'essai selon les cibles actives.
 */
export class TrialClassifier {
  /**
   * Détermine le type de trial selon ses caractéristiques.
   *
   * @param isBuffer - Si c'est un essai de buffer (< nLevel)
   * @param isPosTarget - Si c'est une cible position
   * @param isSoundTarget - Si c'est une cible audio
   * @param isColorTarget - Si c'est une cible couleur
   * @returns Le type de trial classifié
   *
   * @example
   * ```ts
   * const type = TrialClassifier.classify(false, true, true, false);
   * // → 'Dual' (position + audio)
   *
   * const type = TrialClassifier.classify(true, false, false, false);
   * // → 'Tampon'
   * ```
   */
  static classify(
    isBuffer: boolean,
    isPosTarget: boolean,
    isSoundTarget: boolean,
    isColorTarget: boolean,
  ): TrialType {
    if (isBuffer) {
      return 'Tampon';
    }

    const targetCount = TrialClassifier.countTargets(isPosTarget, isSoundTarget, isColorTarget);

    if (targetCount >= 2) {
      return 'Dual';
    }

    if (isPosTarget || isColorTarget) {
      return 'V-Seul';
    }

    if (isSoundTarget) {
      return 'A-Seul';
    }

    return 'Non-Cible';
  }

  /**
   * Compte le nombre de modalités cibles
   */
  private static countTargets(
    isPosTarget: boolean,
    isSoundTarget: boolean,
    isColorTarget: boolean,
  ): number {
    return [isPosTarget, isSoundTarget, isColorTarget].filter(Boolean).length;
  }

  /**
   * Vérifie si le trial est une cible (au moins une modalité)
   */
  static isTarget(isPosTarget: boolean, isSoundTarget: boolean, isColorTarget: boolean): boolean {
    return isPosTarget || isSoundTarget || isColorTarget;
  }

  /**
   * Vérifie si le trial est visuel (position ou couleur)
   */
  static isVisualTarget(isPosTarget: boolean, isColorTarget: boolean): boolean {
    return isPosTarget || isColorTarget;
  }

  /**
   * Vérifie si le trial est un dual target (2+ modalités)
   */
  static isDualTarget(
    isPosTarget: boolean,
    isSoundTarget: boolean,
    isColorTarget: boolean,
  ): boolean {
    return TrialClassifier.countTargets(isPosTarget, isSoundTarget, isColorTarget) >= 2;
  }
}
