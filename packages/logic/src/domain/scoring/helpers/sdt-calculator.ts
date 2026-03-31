/**
 * SDTCalculator - Signal Detection Theory Calculator
 *
 * Classe utilitaire OOP pour les calculs de théorie de détection de signal.
 * Centralise les fonctions dupliquées entre SDT, BrainWorkshop et Jaeggi.
 *
 * Fonctionnalités:
 * - Probit (inverse CDF normale)
 * - d' avec correction de Hautus
 * - Comptage des réponses (H, M, FA, CR)
 * - Calcul des statistiques par modalité
 *
 * Utilisée par: session-passed.ts, SDTJudge, BrainWorkshopJudge
 */

import type { Block, ModalityId, ModalityStats, Trial, UserInputs } from '../../types';
import {
  getHasResponse as getHasResponseFromAdapter,
  getIsTarget as getIsTargetFromAdapter,
  getResponseRT as getResponseRTFromAdapter,
} from '../../modality';

// =============================================================================
// Types
// =============================================================================

/**
 * Raw response counts with MUTABLE properties for accumulation.
 * Mirrors SDTCounts structure but without readonly for performance.
 *
 * This type is intentionally mutable because it's used for
 * accumulating counts during session evaluation. Making it immutable
 * would require creating many intermediate objects.
 *
 * @see SDTCounts in types/core.ts for the readonly canonical type.
 */
export interface RawCounts {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  reactionTimes: number[];
}

// =============================================================================
// SDTCalculator
// =============================================================================

/**
 * Calculateur SDT centralisé.
 * Toutes les méthodes sont statiques car ce sont des fonctions pures sans état.
 */
export class SDTCalculator {
  // ===========================================================================
  // Probit (inverse CDF normale)
  // ===========================================================================

  /**
   * Calcule l'inverse de la fonction de répartition normale (probit).
   * Utilise l'algorithme de Abramowitz & Stegun.
   *
   * @param p - Probabilité (0-1)
   * @returns Z-score correspondant
   */
  static probit(p: number): number {
    if (Number.isNaN(p) || !Number.isFinite(p)) return 0;
    // Bound probabilities to avoid divergence in log/sqrt
    if (p <= 1e-10) return -5;
    if (p >= 1 - 1e-10) return 5;

    // Coefficients Abramowitz & Stegun
    const a1 = -3.969683028665376e1;
    const a2 = 2.209460984245205e2;
    const a3 = -2.759285104469687e2;
    const a4 = 1.38357751867269e2;
    const a5 = -3.066479806614716e1;
    const a6 = 2.506628277459239;

    const b1 = -5.447609879822406e1;
    const b2 = 1.615858368580409e2;
    const b3 = -1.556989798598866e2;
    const b4 = 6.680131188771972e1;
    const b5 = -1.328068155288572e1;

    const c1 = -7.784894002430293e-3;
    const c2 = -3.223964580411365e-1;
    const c3 = -2.400758277161838;
    const c4 = -2.549732539343734;
    const c5 = 4.374664141464968;
    const c6 = 2.938163982698783;

    const d1 = 7.784695709041462e-3;
    const d2 = 3.224671290700398e-1;
    const d3 = 2.445134137142996;
    const d4 = 3.754408661907416;

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    if (p < pLow) {
      const q = Math.sqrt(-2 * Math.log(p));
      const z =
        (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
      return Math.max(-5, Math.min(5, z));
    }

    if (p <= pHigh) {
      const q = p - 0.5;
      const r = q * q;
      const z =
        ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
        (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
      return Math.max(-5, Math.min(5, z));
    }

    const q = Math.sqrt(-2 * Math.log(1 - p));
    const z =
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    return Math.max(-5, Math.min(5, z));
  }

  // ===========================================================================
  // d' Calculation
  // ===========================================================================

  /**
   * Calcule d' (d-prime) avec correction de Hautus (log-linear).
   *
   * Garde-fous anti-gaming:
   * - Silence complet (hits=0 ET FA=0) → d' = 0
   *   Sinon Hautus donne artificiellement d' positif (0.5-1.3)
   * - Inactivité (hits=0) → d' = 0
   *   Joueur qui ne répond jamais aux cibles
   * - Spammer (CR=0) → d' = 0
   *   Joueur qui répond à tout
   *
   * @param hits - Nombre de hits (cible détectée)
   * @param misses - Nombre de misses (cible manquée)
   * @param falseAlarms - Nombre de fausses alarmes
   * @param correctRejections - Nombre de rejets corrects
   * @returns d' calculé
   */
  static calculateDPrime(
    hits: number,
    misses: number,
    falseAlarms: number,
    correctRejections: number,
  ): number {
    // SDT-4 fix: Validate counts are non-negative
    if (hits < 0 || misses < 0 || falseAlarms < 0 || correctRejections < 0) {
      return 0;
    }

    const signalTrials = hits + misses;
    const noiseTrials = falseAlarms + correctRejections;

    // Blocs mal formés : pas de signal ou pas de bruit
    if (signalTrials === 0 || noiseTrials === 0) {
      return 0;
    }

    // Anti-gaming: Inactivité ou Silence (ne détecte jamais les cibles)
    // Évite que Hautus donne artificiellement d' positif (0.5-1.3)
    if (hits === 0) {
      return 0;
    }

    // Anti-gaming: Spammer (répond à tout, jamais de rejet correct)
    if (correctRejections === 0) {
      return 0;
    }

    // Correction de Hautus (log-linear)
    const hitRate = (hits + 0.5) / (signalTrials + 1);
    const falseAlarmRate = (falseAlarms + 0.5) / (noiseTrials + 1);

    return SDTCalculator.probit(hitRate) - SDTCalculator.probit(falseAlarmRate);
  }

  // ===========================================================================
  // Response Counting
  // ===========================================================================

  /**
   * Vérifie si un trial est une cible pour une modalité donnée.
   */
  static getIsTarget(trial: Trial, modalityId: ModalityId): boolean {
    return getIsTargetFromAdapter(trial, modalityId);
  }

  /**
   * Vérifie si l'utilisateur a répondu pour une modalité donnée.
   */
  static getHasResponse(input: UserInputs[number] | undefined, modalityId: ModalityId): boolean {
    return getHasResponseFromAdapter(input, modalityId);
  }

  /**
   * Récupère le temps de réaction pour une modalité donnée.
   */
  static getReactionTime(
    input: UserInputs[number] | undefined,
    modalityId: ModalityId,
  ): number | undefined {
    return getResponseRTFromAdapter(input, modalityId);
  }

  /**
   * Compte les réponses (H, M, FA, CR) pour une modalité.
   *
   * @param block - Le bloc de trials
   * @param inputs - Les réponses utilisateur
   * @param modalityId - La modalité à analyser
   * @returns Comptages bruts
   */
  static countResponses(block: Block, inputs: UserInputs, modalityId: ModalityId): RawCounts {
    const counts: RawCounts = {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
      reactionTimes: [],
    };

    const scorableTrials = block.trials.filter((t) => !t.isBuffer);

    for (const trial of scorableTrials) {
      const isTarget = SDTCalculator.getIsTarget(trial, modalityId);
      const input = inputs[trial.index];
      const hasResponse = SDTCalculator.getHasResponse(input, modalityId);
      const rt = SDTCalculator.getReactionTime(input, modalityId);

      if (isTarget) {
        if (hasResponse) {
          counts.hits++;
          // SDT-2/5 fix: Filter NaN and Infinity from reaction times
          if (rt !== undefined && Number.isFinite(rt) && rt > 0) {
            counts.reactionTimes.push(rt);
          }
        } else {
          counts.misses++;
        }
      } else {
        if (hasResponse) {
          counts.falseAlarms++;
        } else {
          counts.correctRejections++;
        }
      }
    }

    return counts;
  }

  // ===========================================================================
  // Statistics Calculation
  // ===========================================================================

  /**
   * Calcule les statistiques complètes pour une modalité.
   *
   * @param counts - Comptages bruts
   * @returns Statistiques de la modalité
   */
  static calculateModalityStats(counts: RawCounts): ModalityStats {
    const { hits, misses, falseAlarms, correctRejections, reactionTimes } = counts;

    const signalTrials = hits + misses;
    const noiseTrials = falseAlarms + correctRejections;

    const hitRate = signalTrials > 0 ? hits / signalTrials : 0;
    const falseAlarmRate = noiseTrials > 0 ? falseAlarms / noiseTrials : 0;
    const dPrime = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);

    const avgReactionTime =
      reactionTimes.length > 0
        ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
        : null;

    return {
      hits,
      misses,
      falseAlarms,
      correctRejections,
      hitRate,
      falseAlarmRate,
      dPrime,
      reactionTimes,
      avgReactionTime,
    };
  }

  /**
   * Calcule les stats pour toutes les modalités actives d'un bloc.
   *
   * @param block - Le bloc de trials
   * @param inputs - Les réponses utilisateur
   * @returns Map des stats par modalité
   */
  static calculateAllModalityStats(
    block: Block,
    inputs: UserInputs,
  ): Record<ModalityId, ModalityStats> {
    const { activeModalities } = block.config;
    const statsByModality: Record<ModalityId, ModalityStats> = {};

    for (const modalityId of activeModalities) {
      const counts = SDTCalculator.countResponses(block, inputs, modalityId);
      statsByModality[modalityId] = SDTCalculator.calculateModalityStats(counts);
    }

    return statsByModality;
  }

  // ===========================================================================
  // Aggregate Statistics
  // ===========================================================================

  /**
   * Calcule la moyenne des d' par modalité.
   */
  static calculateAverageDPrime(statsByModality: Record<ModalityId, ModalityStats>): number {
    // SDT-1 fix: Filter NaN and Infinity values before averaging
    const dPrimes = Object.values(statsByModality)
      .map((s) => s.dPrime)
      .filter((d) => Number.isFinite(d));
    if (dPrimes.length === 0) return 0;
    return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
  }

  /**
   * Calcule le minimum des d' par modalité (méthode Jaeggi).
   */
  static calculateMinDPrime(statsByModality: Record<ModalityId, ModalityStats>): number {
    const dPrimes = Object.values(statsByModality).map((s) => s.dPrime);
    if (dPrimes.length === 0) return 0;
    return Math.min(...dPrimes);
  }
}
