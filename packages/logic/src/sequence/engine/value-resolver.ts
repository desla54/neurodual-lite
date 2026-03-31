/**
 * ValueResolver - Résolution des valeurs pour chaque intention
 *
 * Transforme une intention (target, lure, neutral) en valeur concrète.
 * - Target : répète la valeur N trials en arrière
 * - Lure N-1 : répète la valeur N-1 trials en arrière
 * - Lure N+1 : répète la valeur N+1 trials en arrière
 * - Neutral : valeur différente de target et lures possibles
 */

import type {
  GeneratedTrial,
  ModalityId,
  ModalitySpec,
  SequenceSpec,
  TrialIntention,
} from '../types';
import type { PRNG } from './prng';

// =============================================================================
// Types
// =============================================================================

/**
 * Résultat de la résolution d'une valeur.
 */
export interface ResolvedValue {
  readonly value: number | string;
  readonly intention: TrialIntention;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Retourne toutes les valeurs possibles pour une modalité.
 */
export function getModalityValues(modalitySpec: ModalitySpec): readonly (number | string)[] {
  if (typeof modalitySpec.values === 'number') {
    // Positions : 0 à values-1
    return Array.from({ length: modalitySpec.values }, (_, i) => i);
  }
  // Valeurs explicites
  return modalitySpec.values;
}

/**
 * Récupère la valeur d'une modalité à un index donné dans l'historique.
 * Retourne undefined si l'index est hors limites.
 */
function getHistoryValue(
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
  index: number,
): number | string | undefined {
  if (index < 0 || index >= history.length) {
    return undefined;
  }
  return history[index]?.values[modalityId]?.value;
}

// =============================================================================
// Value Resolution
// =============================================================================

/**
 * Résout la valeur pour une intention donnée.
 *
 * @param spec - Spécification de la séquence
 * @param history - Historique des trials générés
 * @param modalityId - ID de la modalité
 * @param intention - Intention (target, lure-n-1, lure-n+1, neutral)
 * @param rng - Générateur aléatoire
 * @param forbiddenValues - Valeurs interdites (par contraintes)
 * @returns Valeur résolue ou undefined si impossible
 */
export function resolveValue(
  spec: SequenceSpec,
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
  intention: TrialIntention,
  rng: PRNG,
  forbiddenValues: Set<number | string> = new Set(),
): ResolvedValue | undefined {
  const modalitySpec = spec.modalities.find((m) => m.id === modalityId);
  if (!modalitySpec) {
    throw new Error(`Unknown modality: ${modalityId}`);
  }

  const allValues = getModalityValues(modalitySpec);
  const nLevel = spec.nLevel;
  const currentIndex = history.length;

  // === Target : répète N trials en arrière ===
  if (intention === 'target') {
    const targetIndex = currentIndex - nLevel;
    const targetValue = getHistoryValue(history, modalityId, targetIndex);

    if (targetValue === undefined) {
      // Pas assez d'historique pour un target
      return undefined;
    }

    if (forbiddenValues.has(targetValue)) {
      // Valeur interdite par contrainte
      return undefined;
    }

    return { value: targetValue, intention: 'target' };
  }

  // === Lure N-1 : répète N-1 trials en arrière ===
  if (intention === 'lure-n-1') {
    const lureIndex = currentIndex - (nLevel - 1);
    const lureValue = getHistoryValue(history, modalityId, lureIndex);

    if (lureValue === undefined) {
      return undefined;
    }

    // Vérifier que ce n'est pas aussi un target (sinon ce serait un target, pas un lure)
    const targetIndex = currentIndex - nLevel;
    const targetValue = getHistoryValue(history, modalityId, targetIndex);
    if (lureValue === targetValue) {
      return undefined;
    }

    if (forbiddenValues.has(lureValue)) {
      return undefined;
    }

    return { value: lureValue, intention: 'lure-n-1' };
  }

  // === Lure N+1 : répète N+1 trials en arrière ===
  if (intention === 'lure-n+1') {
    const lureIndex = currentIndex - (nLevel + 1);
    const lureValue = getHistoryValue(history, modalityId, lureIndex);

    if (lureValue === undefined) {
      return undefined;
    }

    // Vérifier que ce n'est pas aussi un target
    const targetIndex = currentIndex - nLevel;
    const targetValue = getHistoryValue(history, modalityId, targetIndex);
    if (lureValue === targetValue) {
      return undefined;
    }

    if (forbiddenValues.has(lureValue)) {
      return undefined;
    }

    return { value: lureValue, intention: 'lure-n+1' };
  }

  // === Neutral : valeur différente de target et lures ===
  if (intention === 'neutral') {
    // Collecter les valeurs à éviter
    const valuesToAvoid = new Set<number | string>(forbiddenValues);

    // Éviter la valeur target (si elle existe)
    const targetIndex = currentIndex - nLevel;
    const targetValue = getHistoryValue(history, modalityId, targetIndex);
    if (targetValue !== undefined) {
      valuesToAvoid.add(targetValue);
    }

    // Éviter les valeurs lure (si elles existent)
    const lureN1Index = currentIndex - (nLevel - 1);
    const lureN1Value = getHistoryValue(history, modalityId, lureN1Index);
    if (lureN1Value !== undefined) {
      valuesToAvoid.add(lureN1Value);
    }

    const lureN2Index = currentIndex - (nLevel + 1);
    const lureN2Value = getHistoryValue(history, modalityId, lureN2Index);
    if (lureN2Value !== undefined) {
      valuesToAvoid.add(lureN2Value);
    }

    // Filtrer les valeurs disponibles
    const availableValues = allValues.filter((v) => !valuesToAvoid.has(v));

    if (availableValues.length === 0) {
      // Pas de valeur neutre possible, prendre n'importe quelle valeur non interdite
      const fallbackValues = allValues.filter((v) => !forbiddenValues.has(v));
      if (fallbackValues.length === 0) {
        return undefined;
      }
      return { value: rng.randomElement(fallbackValues), intention: 'neutral' };
    }

    return { value: rng.randomElement(availableValues), intention: 'neutral' };
  }

  // Intention inconnue
  throw new Error(`Unknown intention: ${intention}`);
}

/**
 * Vérifie si une intention est possible étant donné l'historique.
 */
export function isIntentionPossible(
  spec: SequenceSpec,
  history: readonly GeneratedTrial[],
  _modalityId: ModalityId,
  intention: TrialIntention,
): boolean {
  const nLevel = spec.nLevel;
  const currentIndex = history.length;

  if (intention === 'target') {
    return currentIndex >= nLevel;
  }

  if (intention === 'lure-n-1') {
    if (nLevel < 2) return false; // Pas de N-1 pour N=1
    return currentIndex >= nLevel - 1;
  }

  if (intention === 'lure-n+1') {
    return currentIndex >= nLevel + 1;
  }

  // Neutral est toujours possible
  return true;
}

// =============================================================================
// Filter-Then-Pick: Enumeration
// =============================================================================

/**
 * Option candidate pour un trial.
 */
export interface CandidateOption {
  readonly intention: TrialIntention;
  readonly value: number | string;
  /** Probabilité non normalisée de cette option */
  readonly probability: number;
}

/**
 * Énumère toutes les options valides (intention, value) pour une modalité.
 *
 * Filter-Then-Pick: Au lieu de générer puis vérifier (retry),
 * on énumère d'abord toutes les options valides, puis on filtre.
 *
 * @param spec - Spécification de la séquence
 * @param history - Historique des trials
 * @param modalityId - ID de la modalité
 * @param probabilities - Probabilités effectives {pTarget, pLureN1, pLureNPlus1}
 * @param forbiddenIntentions - Intentions interdites par contraintes
 * @param forbiddenValuesByIntention - Valeurs interdites PAR INTENTION (évite le collateral damage)
 * @param correlatedIsTarget - Si défini, force ou interdit l'intention target
 * @returns Liste des options valides avec leurs probabilités
 */
export function enumerateValidOptions(
  spec: SequenceSpec,
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
  probabilities: {
    pTarget: number;
    pLureN1: number;
    pLureNPlus1: number;
  },
  forbiddenIntentions: Set<TrialIntention>,
  forbiddenValuesByIntention: Map<TrialIntention, Set<number | string>>,
  correlatedIsTarget?: boolean,
): CandidateOption[] {
  const options: CandidateOption[] = [];
  const modalitySpec = spec.modalities.find((m) => m.id === modalityId);

  if (!modalitySpec) {
    return options;
  }

  const nLevel = spec.nLevel;
  const currentIndex = history.length;
  const allValues = getModalityValues(modalitySpec);

  // Récupérer les valeurs de référence
  const targetIndex = currentIndex - nLevel;
  const targetValue =
    targetIndex >= 0 && targetIndex < history.length
      ? history[targetIndex]?.values[modalityId]?.value
      : undefined;

  const lureN1Index = currentIndex - (nLevel - 1);
  const lureN1Value =
    lureN1Index >= 0 && lureN1Index < history.length
      ? history[lureN1Index]?.values[modalityId]?.value
      : undefined;

  const lureN2Index = currentIndex - (nLevel + 1);
  const lureN2Value =
    lureN2Index >= 0 && lureN2Index < history.length
      ? history[lureN2Index]?.values[modalityId]?.value
      : undefined;

  // Helper pour vérifier si une valeur est interdite pour une intention
  const isForbidden = (intention: TrialIntention, value: number | string): boolean => {
    const forbidden = forbiddenValuesByIntention.get(intention);
    return forbidden?.has(value) ?? false;
  };

  // === Option TARGET ===
  // Si corrélation dit "pas target", on skip target
  if (correlatedIsTarget !== false) {
    if (
      !forbiddenIntentions.has('target') &&
      targetValue !== undefined &&
      !isForbidden('target', targetValue) &&
      currentIndex >= nLevel
    ) {
      options.push({
        intention: 'target',
        value: targetValue,
        probability: probabilities.pTarget,
      });
    }
  }

  // Si corrélation dit "target", on ne considère que target
  if (correlatedIsTarget === true) {
    // Si on a trouvé un target, on retourne uniquement ça
    if (options.length > 0) {
      return options;
    }
    // Si target impossible malgré la corrélation, on ajoute neutral comme fallback
    // (sera traité plus bas)
  }

  // === Options NON-TARGET (lures + neutral) ===
  // Si corrélation dit "target" et target impossible, on doit donner du neutral
  // Si corrélation dit "pas target" ou undefined, on considère lures + neutral

  // === Option LURE N-1 ===
  if (correlatedIsTarget !== true) {
    if (
      !forbiddenIntentions.has('lure-n-1') &&
      lureN1Value !== undefined &&
      !isForbidden('lure-n-1', lureN1Value) &&
      lureN1Value !== targetValue && // Pas la même que target
      currentIndex >= nLevel - 1 &&
      nLevel >= 2
    ) {
      options.push({
        intention: 'lure-n-1',
        value: lureN1Value,
        probability: probabilities.pLureN1,
      });
    }
  }

  // === Option LURE N+1 ===
  if (correlatedIsTarget !== true) {
    if (
      !forbiddenIntentions.has('lure-n+1') &&
      lureN2Value !== undefined &&
      !isForbidden('lure-n+1', lureN2Value) &&
      lureN2Value !== targetValue && // Pas la même que target
      currentIndex >= nLevel + 1
    ) {
      options.push({
        intention: 'lure-n+1',
        value: lureN2Value,
        probability: probabilities.pLureNPlus1,
      });
    }
  }

  // === Options NEUTRAL ===
  // Valeurs à éviter pour être vraiment "neutral"
  const forbiddenForNeutral = forbiddenValuesByIntention.get('neutral') ?? new Set();
  const valuesToAvoid = new Set<number | string>(forbiddenForNeutral);
  if (targetValue !== undefined) valuesToAvoid.add(targetValue);
  if (lureN1Value !== undefined) valuesToAvoid.add(lureN1Value);
  if (lureN2Value !== undefined) valuesToAvoid.add(lureN2Value);

  const neutralValues = allValues.filter((v) => !valuesToAvoid.has(v));

  // Calculer la probabilité neutral (ce qui reste après target et lures)
  const pNeutral = Math.max(
    0,
    1 - probabilities.pTarget - probabilities.pLureN1 - probabilities.pLureNPlus1,
  );

  // Ajouter les options neutral
  for (const value of neutralValues) {
    options.push({
      intention: 'neutral',
      value,
      // Répartir la probabilité neutral uniformément entre les valeurs
      probability: pNeutral / Math.max(1, neutralValues.length),
    });
  }

  // Si aucune option neutral propre, utiliser des valeurs fallback
  if (neutralValues.length === 0 && options.length === 0) {
    const fallbackValues = allValues.filter((v) => !forbiddenForNeutral.has(v));
    for (const value of fallbackValues) {
      options.push({
        intention: 'neutral',
        value,
        probability: 1 / Math.max(1, fallbackValues.length),
      });
    }
  }

  return options;
}

/**
 * Sélectionne une option parmi les candidats selon leurs probabilités.
 * Renormalise automatiquement les probabilités.
 */
export function pickOption(options: readonly CandidateOption[], rng: PRNG): CandidateOption | null {
  if (options.length === 0) {
    return null;
  }

  // Si une seule option, la retourner directement
  if (options.length === 1) {
    const first = options[0];
    if (first) return first;
    return null;
  }

  // Calculer la somme des probabilités
  const totalProb = options.reduce((sum, opt) => sum + opt.probability, 0);

  // Sécurité: Si la probabilité totale est invalide (NaN, <= 0), choisir uniformément
  if (!Number.isFinite(totalProb) || totalProb <= 0) {
    return options[Math.floor(rng.random() * options.length)] ?? null;
  }

  // Tirage pondéré
  const roll = rng.random() * totalProb;
  let cumulative = 0;

  for (const option of options) {
    const prob = Number.isFinite(option.probability) ? Math.max(0, option.probability) : 0;
    cumulative += prob;
    if (roll < cumulative) {
      return option;
    }
  }

  // Fallback final (si erreur d'arrondi)
  return options.at(-1) ?? null;
}
